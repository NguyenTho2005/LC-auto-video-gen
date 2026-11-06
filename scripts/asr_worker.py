"""Local faster-whisper ASR bridge (M8). One-shot per transcription.

Does not accept model paths or remote URLs from the caller: the model repository
must be one of the pinned entries below. Prints one JSON object on stdout;
human-readable stage logs go to stderr. Never logs narration text.
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Pinned model table (repo -> revision). Client cannot add entries.
PINNED_MODELS = {
    'qbsmlabs/PhoWhisper-small': {
        'revision': '644a8705b6981de92b10659b105763bdb39b61ef',
        'license': 'BSD-3-Clause',
    },
    'kiendt/PhoWhisper-large-ct2': {
        'revision': 'abceb098c94235c16414dda9e1aada82ebcf6288',
        'license': 'MIT',
    },
    'Systran/faster-whisper-medium': {
        'revision': '08e178d48790749d25932bbc082711ddcfdfbc4f',
        'license': 'MIT',
    },
    'Systran/faster-whisper-large-v3': {
        'revision': 'edaa852ec7e145841d8ffdb056a99866b5f0a478',
        'license': 'MIT',
    },
}
DEFAULT_MODEL = 'qbsmlabs/PhoWhisper-small'

# Exit codes understood by src/asr/faster-whisper-client.ts.
EXIT_BAD_ARGS = 2
EXIT_BAD_AUDIO = 3
EXIT_MISSING = 4
EXIT_FAILED = 5

os.environ.setdefault('HF_HOME', str(ROOT / '.asr-models'))


def emit(error_code=None, message='ok'):
    """Write final status to stderr so Node can classify failures without narration."""
    payload = {'code': error_code, 'message': message}
    print(json.dumps(payload, ensure_ascii=False), file=sys.stderr, flush=True)


class WorkerError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def resolve_model():
    model = os.environ.get('ASR_MODEL', DEFAULT_MODEL)
    if model not in PINNED_MODELS:
        raise WorkerError(EXIT_BAD_ARGS, 'ASR_MODEL không nằm trong bảng model đã ghim: ' + ', '.join(sorted(PINNED_MODELS)))
    return model, PINNED_MODELS[model]['revision']


def download_model(model, revision):
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=model, revision=revision)
    return model


def prepare():
    model, revision = resolve_model()
    print('Đang tải model ' + model + ' @ ' + revision[:12] + ' (lần đầu; dung lượng ~1 GB).', file=sys.stderr, flush=True)
    download_model(model, revision)
    installed = ROOT / '.asr-runtime'
    installed.mkdir(exist_ok=True)
    (installed / 'installed.json').write_text(json.dumps({'model': model, 'revision': revision}))
    print('ASR ready: ' + model + ' revision ' + revision, flush=True)


def self_try_load(WhisperModel, model, device, compute_type):
    """Nạp model rồi transcribe một đoạn im lặng 1 giây: thiếu thư viện GPU sẽ
    lộ ngay ở bước encode đầu tiên, không phải giữa bộ nhận dạng thật."""
    import numpy as np
    import soundfile as sf
    mobj = WhisperModel(model, device=device, compute_type=compute_type, download_root=str(ROOT / '.asr-models'))
    tone = ROOT / '.asr-runtime' / 'selftest.wav'
    tone.parent.mkdir(exist_ok=True)
    sf.write(str(tone), (np.zeros(44100)).astype('float32'), 44100, format='WAV', subtype='PCM_16')
    generator, _info = mobj.transcribe(str(tone), language='vi', word_timestamps=True)
    for _seg in generator:
        pass
    print('Nạp model ' + model + ' (' + device + '/' + compute_type + ')...', file=sys.stderr, flush=True)
    return mobj


def probe_duration(path):
    import subprocess
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path],
        capture_output=True, text=True, timeout=60,
    )
    info = json.loads(out.stdout)
    duration = float(info['format']['duration'])
    if not duration > 0:
        raise ValueError
    return duration


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', help='Đường dẫn audio chuẩn hoá (.wav) do server tạo')
    parser.add_argument('--language', default='vi')
    parser.add_argument('--device', default=None, help='auto|cpu|cuda (mặc định: ASR_DEVICE hoặc auto)')
    parser.add_argument('--prepare', action='store_true')
    args = parser.parse_args(argv)

    if args.prepare:
        prepare()
        return 0
    if not args.audio:
        raise WorkerError(EXIT_BAD_ARGS, 'Thiếu --audio')
    audio = Path(args.audio)
    if not audio.is_file():
        raise WorkerError(EXIT_BAD_ARGS, 'File audio không tồn tại')

    try:
        duration = probe_duration(str(audio))
    except Exception:
        raise WorkerError(EXIT_BAD_AUDIO, 'ffmpeg không đọc được audio; file có thể hỏng.')

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise WorkerError(EXIT_MISSING, 'Thư viện faster-whisper chưa cài. Chạy npm run asr:setup.')

    model, revision = resolve_model()
    if not (ROOT / '.asr-models').exists() or not any((ROOT / '.asr-models').iterdir()):
        raise WorkerError(EXIT_MISSING, 'Chưa tải model ASR. Chạy npm run asr:setup.')

    device = args.device or os.environ.get('ASR_DEVICE', 'auto')
    if device == 'auto':
        device = 'cuda'  # tự phát hiện bằng cách thử; lỗi thiếu thư viện GPU → về CPU ngay
    if device == 'cpu':
        compute_type = os.environ.get('ASR_COMPUTE_TYPE', 'int8')
    else:
        compute_type = os.environ.get('ASR_COMPUTE_TYPE', 'float16')
    try:
        mobj = self_try_load(WhisperModel, model, device, compute_type)
    except Exception as err:
        if device != 'cpu':
            print('Không nạp được CUDA (' + type(err).__name__ + '), chuyển về CPU.', file=sys.stderr, flush=True)
            device, compute_type = 'cpu', os.environ.get('ASR_COMPUTE_TYPE', 'int8')
            mobj = self_try_load(WhisperModel, model, device, compute_type)
        else:
            raise WorkerError(EXIT_MISSING, 'Nạp model ASR thất bại: ' + type(err).__name__)
    print('Nạp xong model (' + device + '/' + compute_type + ').', file=sys.stderr, flush=True)

    print('Đang nhận dạng...', file=sys.stderr, flush=True)
    try:
        segments_iter, info = mobj.transcribe(
            str(audio),
            language=args.language or None,
            word_timestamps=True,
            vad_filter=True,
            condition_on_previous_text=False,
            beam_size=5,
            hallucination_silence_threshold=2,
        )
        segs = []
        words = []
        for seg in segments_iter:  # lazy: iteration IS the transcription
            segs.append({
                'startMs': int(round(seg.start * 1000)),
                'endMs': int(round(seg.end * 1000)),
                'text': seg.text.strip(),
            })
            for w in (seg.words or []):
                words.append({
                    'text': w.word.strip(),
                    'startMs': int(round(w.start * 1000)),
                    'endMs': int(round(w.end * 1000)),
                    'probability': round(float(w.probability), 4),
                })
    except Exception as err:
        raise WorkerError(EXIT_FAILED, 'Nhận dạng thất bại: ' + type(err).__name__)

    result = {
        'model': model,
        'revision': revision,
        'language': info.language or args.language,
        'durationSec': duration,
        'segments': segs,
        'words': words,
    }
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write('\n')
    del segments_iter
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except WorkerError as err:
        emit(err.code, str(err))
        sys.exit(err.code)
    except KeyboardInterrupt:
        emit('aborted', 'Đã huỷ nhận dạng.')
        sys.exit(130)
    except Exception as err:
        emit(EXIT_FAILED, 'Lỗi không phân loại: ' + type(err).__name__)
        sys.exit(EXIT_FAILED)

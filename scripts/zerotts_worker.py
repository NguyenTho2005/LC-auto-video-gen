"""Local ZeroTTS bridge. Does not accept model paths, code, voice ZIPs or remote URLs.

M9 hardening contract (docs/PRD.md M9):
- Binds the loopback port BEFORE loading the model and serves /health with an
  explicit ``loading`` state, so concurrent Node processes wait instead of
  spawning a second worker ("Address already in use" race).
- On a busy port it exits with status line ``ZeroTTS status: port-busy`` and
  code 3; it never kills or touches a foreign service.
- Exits after ZEROTTS_IDLE_SEC seconds without work (0 disables) to free RAM;
  the Node client restarts it on demand.
- Caches synthesized segments so re-reading one edited sentence does not
  re-synthesize every chunk of the scene.
"""
import argparse
import hashlib
import hmac
import io
import json
import os
import sys
import threading
import time
from collections import OrderedDict
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent.parent
REVISION = 'c2bfbd67dc648cac455077333f7cf5c18a2e3bb4'
VOICES = ['maichi', 'baotrang', 'kimoanh', 'hamy', 'giahuy', 'huuduc', 'quangminh', 'tiendat']
os.environ.setdefault('HF_HOME', str(ROOT / '.zerotts-models'))
os.environ.setdefault('ZEROTTS_VOICES_HOME', str(ROOT / '.zerotts-runtime' / 'voices'))

START_MONOTONIC = time.monotonic()


def status_line(message):
    """Machine-readable status goes to stderr; narration and headers never do."""
    print('ZeroTTS status: ' + message, file=sys.stderr, flush=True)


def default_threads():
    try:
        cores = len(os.sched_getaffinity(0))
    except (AttributeError, OSError):
        cores = os.cpu_count() or 4
    env = os.environ.get('ZEROTTS_THREADS')
    if env and env.isdigit() and 1 <= int(env) <= 64:
        return int(env)
    return max(1, min(8, cores))


def load_model():
    from zerotts import ZeroTTS, hub
    import shutil
    local = ROOT / '.zerotts-models' / ('model-' + REVISION)
    if not local.exists():
        snapshot = hub.resolve_model_dir('zeroweight-ai/ZeroTTS', revision=REVISION,
                                         cache_dir=str(ROOT / '.zerotts-models'))
        # ONNX external weights must be real neighbouring files, not Hub blob symlinks.
        staging = local.with_name(local.name + '.preparing-' + str(os.getpid()))
        shutil.copytree(snapshot, staging, symlinks=False)
        staging.rename(local)
    return ZeroTTS.from_pretrained(str(local), intra_op_num_threads=default_threads())


class SegmentCache:
    """Bounded LRU of synthesized (voice, segment) → float64 samples."""

    def __init__(self, max_bytes=256 * 1024 * 1024, max_entries=512):
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.entries = OrderedDict()  # key → list(samples); list to pin array identity
        self.bytes = 0
        self.lock = threading.Lock()

    @staticmethod
    def key(voice, segment):
        return hashlib.sha256(voice.encode('utf-8') + b'\0' + segment.encode('utf-8')).hexdigest()

    def get(self, voice, segment):
        held = self.entries.get(self.key(voice, segment))
        if held is None:
            return None
        with self.lock:
            self.entries.move_to_end(self.key(voice, segment))
        return held[0]

    def put(self, voice, segment, audio):
        k = self.key(voice, segment)
        with self.lock:
            held = self.entries.get(k)
            if held is not None:
                self.bytes += audio.nbytes - held[0].nbytes
                self.entries[k] = [audio]
                self.entries.move_to_end(k)
            else:
                self.entries[k] = [audio]
                self.bytes += audio.nbytes
            while self.entries and (self.bytes > self.max_bytes or len(self.entries) > self.max_entries):
                _, evicted = self.entries.popitem(last=False)
                self.bytes -= evicted[0].nbytes


class Activity:
    """Tracks in-flight synthesis requests for the idle watchdog."""

    def __init__(self):
        self.lock = threading.Lock()
        self.in_flight = 0
        self.last_activity = time.monotonic()

    def start(self):
        with self.lock:
            self.in_flight += 1
            self.last_activity = time.monotonic()

    def finish(self):
        with self.lock:
            self.in_flight -= 1
            self.last_activity = time.monotonic()

    def idle_seconds(self):
        with self.lock:
            if self.in_flight:
                return 0.0
            return time.monotonic() - self.last_activity


def idle_watchdog(is_ready, activity, idle_seconds, shutdown):
    """Shut down after `idle_seconds` without any synthesis activity (0 disables)."""
    if not idle_seconds:
        return
    while True:
        time.sleep(1)
        if is_ready() and activity.idle_seconds() >= idle_seconds:
            status_line('idle-exit:%.0fs' % activity.idle_seconds())
            shutdown()
            return


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--port', type=int, default=7821)
    args = parser.parse_args()
    runtime = ROOT / '.zerotts-runtime'
    runtime.mkdir(exist_ok=True)
    idle_sec = float(os.environ.get('ZEROTTS_IDLE_SEC', '900') or 0)
    if args.prepare:
        load_model()
        print('ZeroTTS ready: 8 bundled voices, pinned revision ' + REVISION, flush=True)
        return

    token = os.environ.get('LC_ZEROTTS_TOKEN', '')
    if len(token) < 32:
        raise RuntimeError('Missing local worker token')

    activity = Activity()
    cache = SegmentCache()
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        holder = {'tts': None}  # None → model still loading

        def log_message(self, *_args):
            pass  # Never log narration or authorization headers.

        def send_json(self, status_out, data):
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status_out)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != '/health':
                return self.send_json(404, {'error': 'Not found'})
            ready = self.holder['tts'] is not None
            self.send_json(200, {
                'service': 'lc-autogen-zerotts',
                'ready': ready,
                'loading': not ready,
                'elapsedSec': round(time.monotonic() - START_MONOTONIC, 1),
                'revision': REVISION,
                'voices': VOICES,
            })

        def do_POST(self):
            if self.path != '/synthesize':
                return self.send_json(404, {'error': 'Not found'})
            if self.headers.get('Origin') or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
                return self.send_json(403, {'error': 'Unauthorized local request'})
            tts = self.holder['tts']
            if tts is None:
                return self.send_json(503, {'error': 'ZeroTTS model still loading'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length <= 0 or length > 65536:
                    raise ValueError('Invalid request size')
                data = json.loads(self.rfile.read(length))
                text, voice = data.get('text'), data.get('voice')
                if not isinstance(text, str) or not text.strip() or len(text) > 8000 or voice not in VOICES:
                    raise ValueError('Invalid text or voice')
                import numpy as np
                import soundfile as sf
                from zerotts.chunking import chunk_text, normalize_punctuation, clean_segment_punctuation
                from zerotts.audio import concat_with_silence
                segments = [clean_segment_punctuation(s) for s in chunk_text(normalize_punctuation(text), max_chunk_sec=12)]
                with lock:
                    activity.start()
                    parts = []
                    pending = []
                    try:
                        for segment in segments:
                            cached = cache.get(voice, segment)
                            if cached is not None:
                                parts.append(cached)
                            else:
                                pending.append(segment)
                        for segment in pending:
                            # Seed makes repeated synthesis reproducible for this pinned runtime.
                            np.random.seed(36)
                            audio = tts.synthesize(segment, voice=voice)
                            cache.put(voice, segment, audio)
                            parts.append(audio)
                        audio_total = concat_with_silence(parts, 0.05, tts.sample_rate)
                    finally:
                        activity.finish()
                if audio_total.size == 0 or not np.isfinite(audio_total).all():
                    raise RuntimeError('Empty or invalid audio')
                stream = io.BytesIO()
                sf.write(stream, audio_total.reshape(-1), tts.sample_rate, format='WAV', subtype='PCM_16')
                body = stream.getvalue()
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (ValueError, TypeError, json.JSONDecodeError):
                self.send_json(400, {'error': 'Invalid synthesis request'})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.send_json(500, {'error': 'ZeroTTS synthesis failed; check model installation'})

    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as err:
        # A worker (or foreign service) already owns the port. Report with a
        # stable, machine-readable line; never echo the OS message (it contains
        # "Address already in use", which the M9 acceptance test greps against
        # worker.log), and leave both the port and the other process untouched.
        status_line('port-busy:%d' % args.port)
        print('ZeroTTS cannot bind loopback port %d (bind error %s).' % (args.port, err.errno), file=sys.stderr, flush=True)
        sys.exit(3)
    try:
        (runtime / 'worker.pid').write_text(str(os.getpid()))
    except OSError:
        pass
    status_line('loading:%d' % args.port)

    def load_and_bind():
        try:
            tts = load_model()
            available = tts.list_voices()
            missing = set(VOICES) - set(available)
            if missing:
                raise RuntimeError('Missing bundled voices: ' + ', '.join(sorted(missing)))
            (runtime / 'installed.json').write_text(
                json.dumps({'package': '0.1.5', 'revision': REVISION, 'voices': VOICES}))
            Handler.holder['tts'] = tts
            status_line('ready:%d' % args.port)
        except Exception as err:
            status_line('load-failed:%s' % type(err).__name__)
            print('ZeroTTS model load failed: %s' % err, file=sys.stderr, flush=True)
            server.shutdown()

    threading.Thread(target=load_and_bind, daemon=True).start()
    threading.Thread(target=idle_watchdog, args=(lambda: Handler.holder['tts'] is not None,
                                                 activity, idle_sec, server.shutdown), daemon=True).start()
    try:
        server.serve_forever()
        status_line('exited:idle-or-shutdown')
    finally:
        try:
            (runtime / 'worker.pid').unlink()
        except OSError:
            pass


if __name__ == '__main__':
    main()

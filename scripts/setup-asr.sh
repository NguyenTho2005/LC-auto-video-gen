#!/usr/bin/env bash
# Setup local ASR (M8): venv riêng + faster-whisper + model tiếng Việt ghim revision.
# Model trả có sẵn: qbsmlabs/PhoWhisper-small (BSD-3, ~0.97 GB tải).
set -euo pipefail
cd "$(dirname "$0")/.."

PY="${ASR_BOOTSTRAP_PYTHON:-python3}"
if [[ ! -x .asr-venv/bin/python ]]; then
  "$PY" -m venv .asr-venv
fi
.asr-venv/bin/python -m pip install 'faster-whisper==1.2.1' 'huggingface_hub>=0.26,<2' 'av<19' 'soundfile<0.14'
.asr-venv/bin/python scripts/asr_worker.py --prepare

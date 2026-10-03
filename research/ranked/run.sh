#!/usr/bin/env bash
set -euo pipefail
id=$1; shift
root=$(cd "$(dirname "$0")/../.." && pwd)
read -r py adapter < <(python3 -c "import json,os;m=json.load(open('$root/research/agents/models.json'))['$id'];print(os.path.expanduser(m['python']),os.path.expanduser(m['adapter']))")
ARCADEBENCH_LINK=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.config/arcadebench/entries.json')))['$id']['link'])")
export ARCADEBENCH_LINK PYTHONPATH="$root/sdk/python/src" OMP_NUM_THREADS=${OMP_NUM_THREADS:-2} HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TOKENIZERS_PARALLELISM=false
exec "$py" -m arcadebench play --adapter "$adapter" --mode benchmark --help 1 --clock latency "$@"

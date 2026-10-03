"""Local Ollama adapter (native /api/chat). Stdlib only.

Env: OLLAMA_MODEL (required, e.g. qwen3.5:0.8b or LiquidAI/lfm2.5-350m:latest),
     OLLAMA_URL (default http://127.0.0.1:11434).
Settings: think=false, temperature 0, seed 0, JSON mode (format="json"), num_predict 128.
Same prompt and strict parser as the DeepSeek adapter. Probability 1.0 on the chosen answer,
so ECE is not meaningful. Unparseable output -> {"invalid": True}.
"""
import json, os, threading, time, urllib.error, urllib.request

import prompt

BASE = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.environ.get("OLLAMA_MODEL")
if not MODEL:
    raise RuntimeError("set OLLAMA_MODEL")
NAME = f"ollama:{MODEL}"
USAGE = {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "retries": 0}
_lock = threading.Lock()


def load():
    return None


def predict(model, state, question):
    body = {"model": MODEL, "stream": False, "think": False, "format": "json", "keep_alive": "30m",
            "options": {"temperature": 0, "seed": 0, "num_predict": 128},
            "messages": [{"role": "system", "content": prompt.SYSTEM},
                         {"role": "user", "content": prompt.build(state, question)}]}
    data = json.dumps(body).encode()
    for attempt in range(4):
        req = urllib.request.Request(BASE + "/api/chat", data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                resp = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:200]
            if e.code < 500:
                raise RuntimeError(f"HTTP {e.code}: {msg}") from None
            err = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = type(e).__name__
        if attempt == 3:
            raise RuntimeError(f"gave up: {err}")
        with _lock:
            USAGE["retries"] += 1
        time.sleep(2 ** attempt)
    with _lock:
        USAGE["requests"] += 1
        USAGE["prompt_tokens"] += resp.get("prompt_eval_count", 0)
        USAGE["completion_tokens"] += resp.get("eval_count", 0)
    if resp.get("done_reason") == "length":
        return {"invalid": True, "raw": "[truncated]"}
    return prompt.parse(resp.get("message", {}).get("content"), question)

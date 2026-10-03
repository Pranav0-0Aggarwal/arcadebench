"""DeepSeek (OpenAI-compatible chat API) adapter. Stdlib only.

Default: model deepseek-flash, thinking disabled, temperature 0 (low variance; the API has
no seed parameter, so runs are not guaranteed bit-identical: see the test-retest run).
Env:
  DEEPSEEK_THINKING=1   enable thinking mode (temperature is ignored by the API there)
  DEEPSEEK_MODEL        override model id (default deepseek-flash)
The key is read at runtime from ~/.config/arcadebench/deepseek.env (DEEPSEEK_API_KEY=...),
held only in memory and sent only in the Authorization header; never logged or written.

Calibration: LLMs give no calibrated probabilities. The chosen answer gets probability 1.0,
so ECE reported for these adapters is NOT meaningful (it just equals the error rate).
Unparseable output -> {"invalid": True, ...}; the runner counts that item wrong.
"""
import json, os, random, threading, time, urllib.error, urllib.request

import prompt

URL = "https://api.deepseek.com/chat/completions"
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
THINKING = os.environ.get("DEEPSEEK_THINKING") == "1"
NAME = f"{MODEL}-{'thinking' if THINKING else 'nothink'}"
ENV_FILE = os.path.expanduser("~/.config/arcadebench/deepseek.env")
MAX_ATTEMPTS = 7
USAGE = {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "cache_hit_tokens": 0, "retries": 0}
_lock = threading.Lock()


def _read_key():
    for line in open(ENV_FILE):
        line = line.strip()
        if line.startswith("DEEPSEEK_API_KEY="):
            return line.split("=", 1)[1].strip().strip("'\"")
    raise RuntimeError("DEEPSEEK_API_KEY not found in env file")


def load():
    return {"key": _read_key()}


def _post(model, body):
    data = json.dumps(body).encode()
    for attempt in range(MAX_ATTEMPTS):
        req = urllib.request.Request(URL, data=data, headers={
            "Authorization": "Bearer " + model["key"], "Content-Type": "application/json"})
        wait = None
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            e.read()
            if e.code != 429 and e.code < 500:
                raise RuntimeError(f"HTTP {e.code}") from None  # no body/headers: keep secrets out of logs
            ra = e.headers.get("Retry-After")
            wait = float(ra) if ra and ra.replace(".", "", 1).isdigit() else None
            err = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
            err = type(e).__name__
        if attempt == MAX_ATTEMPTS - 1:
            raise RuntimeError(f"gave up after {MAX_ATTEMPTS} attempts: {err}")
        with _lock:
            USAGE["retries"] += 1
        time.sleep(wait if wait is not None else min(30, 2 ** attempt) * (0.5 + random.random()))


def predict(model, state, question):
    body = {"model": MODEL, "max_tokens": 8192 if THINKING else 128,
            "messages": [{"role": "system", "content": prompt.SYSTEM},
                         {"role": "user", "content": prompt.build(state, question)}],
            "response_format": {"type": "json_object"},
            "thinking": {"type": "enabled" if THINKING else "disabled"}}
    if not THINKING:
        body["temperature"] = 0
    resp = _post(model, body)
    u = resp.get("usage") or {}
    with _lock:
        USAGE["requests"] += 1
        USAGE["prompt_tokens"] += u.get("prompt_tokens", 0)
        USAGE["completion_tokens"] += u.get("completion_tokens", 0)
        USAGE["cache_hit_tokens"] += u.get("prompt_cache_hit_tokens", 0)
    ch = resp["choices"][0]
    if ch.get("finish_reason") == "length":
        return {"invalid": True, "raw": "[truncated]"}
    return prompt.parse(ch["message"].get("content"), question)

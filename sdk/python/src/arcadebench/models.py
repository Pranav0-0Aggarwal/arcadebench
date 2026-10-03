import importlib.util
import os
import re
import sys
import threading

from .http import call

KEYS = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "deepseek": "DEEPSEEK_API_KEY", "compat": "ARCADEBENCH_COMPAT_KEY"}


class Model:
    def __init__(self, provider, model, think, url, headers, params, build, read):
        self.settings = {"provider": provider, "model": model, "think": think, **params}
        self.url, self.headers, self.build, self.read = url, headers, build, read

    def __call__(self, system, user):
        r = call("POST", self.url, self.build(system, user), self.headers, 300)
        try:
            return self.read(r)
        except (KeyError, IndexError, TypeError):
            return "", None


def openai_like(provider, url, model, key, think, params):
    def build(system, user):
        return {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], **params}

    def read(r):
        return r["choices"][0]["message"].get("content") or "", r.get("usage", {}).get("completion_tokens")

    return Model(provider, model, think, url, {"Authorization": f"Bearer {key}"} if key else {}, params, build, read)


def anthropic(model, key, think):
    params = {"max_tokens": 16000, "thinking": {"type": "enabled", "budget_tokens": 8000}} if think else {"max_tokens": 1024, "temperature": 0}

    def build(system, user):
        return {"model": model, "system": system, "messages": [{"role": "user", "content": user}], **params}

    def read(r):
        return "".join(b.get("text", "") for b in r["content"] if b.get("type") == "text"), r["usage"]["output_tokens"]

    return Model("anthropic", model, think, "https://api.anthropic.com/v1/messages", {"x-api-key": key, "anthropic-version": "2023-06-01"}, params, build, read)


def ollama(model, think):
    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
    params = {"temperature": 0, "seed": 0, "num_predict": 8192 if think else 512, "num_ctx": 16384 if think else 8192}

    def build(system, user):
        return {"model": model, "stream": False, "think": think, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "options": params}

    def read(r):
        return r["message"]["content"], r.get("eval_count")

    return Model("ollama", model, think, (host if "://" in host else "http://" + host).rstrip("/") + "/api/chat", {}, params, build, read)


def load_model(spec, think=False):
    provider, _, name = spec.partition(":")
    if provider not in (*KEYS, "ollama") or not name:
        sys.exit(f"unknown model spec {spec!r}; use openai:<model>, anthropic:<model>, deepseek:<model>, ollama:<model> or compat:<model>@<base_url>")
    key = os.environ.get(KEYS.get(provider, ""))
    if provider in ("openai", "anthropic", "deepseek") and not key:
        sys.exit(f"{KEYS[provider]} is not set")
    if provider == "ollama":
        return ollama(name, think)
    if provider == "anthropic":
        return anthropic(name, key, think)
    if provider == "openai":
        params = {"seed": 0, "max_completion_tokens": 16000 if think else 1024, **({"reasoning_effort": "medium"} if think else {"temperature": 0})}
        return openai_like(provider, "https://api.openai.com/v1/chat/completions", name, key, think, params)
    if provider == "deepseek":
        params = {"max_tokens": 16000 if think else 1024, "thinking": {"type": "enabled" if think else "disabled"}, **({} if think else {"temperature": 0})}
        return openai_like(provider, "https://api.deepseek.com/chat/completions", name, key, think, params)
    m = re.fullmatch(r"(.+?)@(https?://.+)", name)
    if not m:
        sys.exit("compat spec is compat:<model>@<base_url>")
    if think:
        sys.exit("--thinking is not supported for compat models")
    return openai_like("compat", m[2].rstrip("/") + "/chat/completions", m[1], key, think, {"temperature": 0, "seed": 0, "max_tokens": 1024})


class Adapter:
    def __init__(self, path):
        spec = importlib.util.spec_from_file_location("arcadebench_adapter", path)
        self.mod = importlib.util.module_from_spec(spec)
        sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
        spec.loader.exec_module(self.mod)
        self.model = self.mod.load()
        self.settings = {"adapter": self.mod.NAME}
        self.lock = threading.Lock()

    def choose(self, state, question):
        try:
            with self.lock:
                r = self.mod.predict(self.model, state, question)
        except Exception:
            return ""
        probs = r.get("probs") or {}
        return r.get("choice") or (max(probs, key=probs.get) if probs else "")

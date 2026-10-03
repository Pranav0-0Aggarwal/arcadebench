import importlib.util
import os
import re
import sys
import threading

from .http import call
from .prompt import parse_action

KEYS = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "deepseek": "DEEPSEEK_API_KEY", "compat": "ARCADEBENCH_COMPAT_KEY"}


NUDGE = "Your reply was cut off. Reply with only one line: ACTION: <action id>"


class Model:
    def __init__(self, provider, model, think, url, headers, params, build, read):
        self.settings = {"provider": provider, "model": model, "think": think, "cutoffFollowUp": True, **params}
        self.url, self.headers, self.build, self.read, self.think = url, headers, build, read, think

    def ask(self, messages, limit=None, think=None):
        r = call("POST", self.url, self.build(messages, limit, self.think if think is None else think), self.headers, 300)
        try:
            return self.read(r)
        except (KeyError, IndexError, TypeError):
            return "", 0, False

    def __call__(self, system, user, ids):
        m = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        text, tokens, cut = self.ask(m)
        if cut and not parse_action(text, ids):
            more, extra, _ = self.ask([*m, {"role": "assistant", "content": text}, {"role": "user", "content": NUDGE}], 32, False)
            text, tokens = f"{text}\n{more}", (tokens or 0) + (extra or 0)
        return text, tokens


def chat_messages(messages):
    return [x for x in messages if x["role"] != "system"], next((x["content"] for x in messages if x["role"] == "system"), "")


def openai_like(provider, url, model, key, think, params, limit_key, extra):
    def build(messages, limit, t):
        return {"model": model, "messages": messages, **params, **extra(t), limit_key: limit or params[limit_key]}

    def read(r):
        c = r["choices"][0]
        return c["message"].get("content") or "", r.get("usage", {}).get("completion_tokens"), c.get("finish_reason") == "length"

    return Model(provider, model, think, url, {"Authorization": f"Bearer {key}"} if key else {}, params, build, read)


def anthropic(model, key, think):
    params = {"max_tokens": 16000 if think else 4096}

    def build(messages, limit, t):
        rest, system = chat_messages(messages)
        mode = {"thinking": {"type": "enabled", "budget_tokens": 8000}} if t else {"temperature": 0}
        return {"model": model, "system": system, "messages": rest, "max_tokens": limit or params["max_tokens"], **mode}

    def read(r):
        return "".join(b.get("text", "") for b in r["content"] if b.get("type") == "text"), r["usage"]["output_tokens"], r.get("stop_reason") == "max_tokens"

    return Model("anthropic", model, think, "https://api.anthropic.com/v1/messages", {"x-api-key": key, "anthropic-version": "2023-06-01"}, params, build, read)


def ollama(model, think):
    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
    params = {"temperature": 0, "seed": 0, "num_predict": 8192 if think else 2048, "num_ctx": 16384 if think else 8192}

    def build(messages, limit, t):
        return {"model": model, "stream": False, "think": t, "messages": messages, "options": {**params, "num_predict": limit or params["num_predict"]}}

    def read(r):
        return r["message"]["content"], r.get("eval_count"), r.get("done_reason") == "length"

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
        params = {"seed": 0, "max_completion_tokens": 16000 if think else 4096}
        return openai_like(provider, "https://api.openai.com/v1/chat/completions", name, key, think, params, "max_completion_tokens", lambda t: {"reasoning_effort": "medium"} if t else {"temperature": 0})
    if provider == "deepseek":
        params = {"max_tokens": 16000 if think else 4096}
        return openai_like(provider, "https://api.deepseek.com/chat/completions", name, key, think, params, "max_tokens", lambda t: {"thinking": {"type": "enabled" if t else "disabled"}, **({} if t else {"temperature": 0})})
    m = re.fullmatch(r"(.+?)@(https?://.+)", name)
    if not m:
        sys.exit("compat spec is compat:<model>@<base_url>")
    if think:
        sys.exit("--thinking is not supported for compat models")
    return openai_like("compat", m[2].rstrip("/") + "/chat/completions", m[1], key, think, {"temperature": 0, "seed": 0, "max_tokens": 4096}, "max_tokens", lambda t: {})


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

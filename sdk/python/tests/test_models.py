import pytest

from arcadebench.cli import seed_list
from arcadebench import models
from arcadebench.models import NUDGE, load_model


def body(m):
    return m.build([{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}], None, m.think)


def test_seed_list():
    assert seed_list("0-3") == [0, 1, 2, 3] and seed_list("5") == [5] and seed_list("1,4,7-8") == [1, 4, 7, 8]


def test_deepseek(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "k")
    m = load_model("deepseek:deepseek-flash")
    assert body(m) == {"model": "deepseek-flash", "messages": [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}], "max_tokens": 4096, "thinking": {"type": "disabled"}, "temperature": 0}
    assert m.headers == {"Authorization": "Bearer k"}
    on = body(load_model("deepseek:deepseek-flash", True))
    assert on["thinking"] == {"type": "enabled"} and "temperature" not in on


def test_openai(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    off, on = body(load_model("openai:gpt-x")), body(load_model("openai:gpt-x", True))
    assert off["temperature"] == 0 and off["seed"] == 0 and "reasoning_effort" not in off
    assert on["reasoning_effort"] == "medium" and "temperature" not in on and on["max_completion_tokens"] == 16000


def test_anthropic(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    m = load_model("anthropic:claude-x")
    assert body(m) == {"model": "claude-x", "system": "sys", "messages": [{"role": "user", "content": "usr"}], "max_tokens": 4096, "temperature": 0}
    assert m.headers["x-api-key"] == "k"
    assert m.read({"content": [{"type": "thinking", "thinking": "..."}, {"type": "text", "text": "ACTION: a"}], "usage": {"output_tokens": 9}}) == ("ACTION: a", 9, False)
    on = body(load_model("anthropic:claude-x", True))
    assert on["thinking"]["type"] == "enabled" and "temperature" not in on


def test_ollama(monkeypatch):
    monkeypatch.setenv("OLLAMA_HOST", "box:11434")
    m = load_model("ollama:llama3:8b")
    assert m.url == "http://box:11434/api/chat" and m.headers == {}
    b = body(m)
    assert b["model"] == "llama3:8b" and b["think"] is False and b["stream"] is False
    assert b["options"] == {"temperature": 0, "seed": 0, "num_predict": 2048, "num_ctx": 8192}
    assert m.settings["think"] is False and m.settings["seed"] == 0
    assert m.read({"message": {"content": "ACTION: up"}, "eval_count": 5}) == ("ACTION: up", 5, False)
    assert body(load_model("ollama:llama3:8b", True))["think"] is True


def test_compat(monkeypatch):
    monkeypatch.delenv("ARCADEBENCH_COMPAT_KEY", raising=False)
    m = load_model("compat:org/model@v1@http://localhost:8000/v1/")
    assert m.url == "http://localhost:8000/v1/chat/completions" and m.headers == {} and body(m)["model"] == "org/model@v1"
    monkeypatch.setenv("ARCADEBENCH_COMPAT_KEY", "k")
    assert load_model("compat:m@https://h/v1").headers == {"Authorization": "Bearer k"}
    with pytest.raises(SystemExit):
        load_model("compat:m@https://h/v1", True)
    with pytest.raises(SystemExit):
        load_model("compat:m")


def test_bad_specs(monkeypatch):
    for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    for spec in ("openai:x", "anthropic:x", "deepseek:x", "nope:x", "openai", "ollama:"):
        with pytest.raises(SystemExit):
            load_model(spec)


def test_malformed_response_is_empty(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    m = load_model("openai:x")
    monkeypatch.setattr("arcadebench.models.call", lambda *a: {"unexpected": True})
    assert m("s", "u", ["a"]) == ("", 0)


def test_cutoff_follow_up(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "k")
    sent = []
    replies = [
        {"choices": [{"message": {"content": "thinking about the board..."}, "finish_reason": "length"}], "usage": {"completion_tokens": 4096}},
        {"choices": [{"message": {"content": "ACTION: c3"}, "finish_reason": "stop"}], "usage": {"completion_tokens": 5}},
    ]
    monkeypatch.setattr(models, "call", lambda method, url, b, headers, timeout: (sent.append(b), replies[len(sent) - 1])[1])
    text, tokens = load_model("deepseek:deepseek-flash")("sys", "usr", ["c3", "c4"])
    assert tokens == 4101 and text.endswith("ACTION: c3")
    assert sent[1]["max_tokens"] == 32 and sent[1]["messages"][-1] == {"role": "user", "content": NUDGE} and sent[1]["thinking"] == {"type": "disabled"}


def test_no_follow_up_when_answered(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "k")
    sent = []
    monkeypatch.setattr(models, "call", lambda *a: (sent.append(a), {"choices": [{"message": {"content": "ACTION: c4"}, "finish_reason": "stop"}], "usage": {"completion_tokens": 3}})[1])
    assert load_model("deepseek:deepseek-flash")("sys", "usr", ["c4"]) == ("ACTION: c4", 3) and len(sent) == 1

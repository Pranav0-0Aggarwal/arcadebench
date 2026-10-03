import json

import pytest

from arcadebench.cli import main

SECRET = "sk-test-secret"


def play(fake, *extra, link="tok"):
    return main(["play", "--link", link, "--model", f"compat:fake@{fake.base}", "--games", "toy", "--api", fake.api, *extra])


def api_calls(fake):
    return [c for c in fake.log if c[1].startswith("/api/v1")]


def moves(fake):
    return [c[3] for c in fake.log if c[1].endswith("/move")]


def test_practice_loop(make_fake, monkeypatch, capsys):
    monkeypatch.setenv("ARCADEBENCH_COMPAT_KEY", SECRET)
    fake = make_fake()
    assert play(fake, "--seeds", "0-1", "--help", "2", "--clock", "token") == 0
    out = capsys.readouterr()
    assert [c[3] for c in fake.log if c[1] == "/api/v1/sessions"] == [{"game": "toy", "mode": "practice", "seed": s, "help": 2, "clock": "token"} for s in (0, 1)]
    assert moves(fake) == [{"action": "a", "tokensOut": 7}] * 6
    assert all(c[2]["Authorization"] == "Bearer tok" for c in api_calls(fake))
    assert all(SECRET not in json.dumps(c[2]) + json.dumps(c[3]) for c in api_calls(fake))
    assert len(fake.chat) == 6
    assert fake.chat[0]["temperature"] == 0 and fake.chat[0]["seed"] == 0
    assert [m["content"] for m in fake.chat[0]["messages"]][0].startswith("You are playing Toy in ArcadeBench")
    assert "Your recent moves" not in fake.chat[0]["messages"][1]["content"]
    assert "Your recent moves, oldest first: a (+1)\n\nLegal actions:\n- a: Take A | gain=1" in fake.chat[1]["messages"][1]["content"]
    assert [c[2]["Authorization"] for c in fake.log if c[1] == "/v1/chat/completions"] == [f"Bearer {SECRET}"] * 6
    assert "settings:" in out.out and "TOY-0000 score 3 steps 3 invalid 0" in out.out and "toy: 2 runs, mean score 3.000, invalid 0" in out.out
    assert SECRET not in out.out + out.err


def test_invalid_reply_sends_empty_action(make_fake, capsys):
    fake = make_fake(reply="I cannot decide")
    assert play(fake, "--seeds", "0") == 0
    assert moves(fake) == [{"action": "", "tokensOut": 7}] * 3
    assert "invalid 3" in capsys.readouterr().out
    assert all("Your recent moves" not in c["messages"][1]["content"] for c in fake.chat)


def test_retries_api_and_model(make_fake, no_sleep):
    fake = make_fake()
    fake.faults = [("/api/v1/sessions", 503), ("/v1/chat", 429), ("/api/v1/sessions/", 500)]
    assert play(fake, "--seeds", "0") == 0
    assert len(no_sleep) == 3
    assert len(moves(fake)) == 4


def test_client_error_is_not_retried(make_fake, capsys, no_sleep):
    fake = make_fake()
    fake.faults = [("/api/v1/games", 401)]
    assert play(fake) == 1
    assert "HTTP 401" in capsys.readouterr().err and not no_sleep


def test_ranked_skips_exhausted_seeds(make_fake, capsys):
    fake = make_fake(seeds_per_game=5, ranked_cap=2)
    assert play(fake, "--mode", "ranked") == 0
    starts = [c[3] for c in fake.log if c[1] == "/api/v1/sessions"]
    assert all("seed" not in s and s["mode"] == "ranked" for s in starts) and len(starts) == 5
    out = capsys.readouterr().out
    assert out.count("skipped") == 3 and "toy: 2 runs" in out


def test_concurrency(make_fake, capsys):
    fake = make_fake()
    assert play(fake, "--seeds", "0-5", "--concurrency", "3") == 0
    assert "toy: 6 runs, mean score 3.000" in capsys.readouterr().out


ADAPTER = """
import threading
NAME = "fake-s1"
calls = []
def load():
    return None
def predict(model, state, question):
    calls.append(question)
    if {behaviour!r} == "interrupt" and len(calls) == 2:
        raise KeyboardInterrupt
    if {behaviour!r} == "boom":
        raise ValueError("no")
    return {{"probs": {{"a": 0.2, "b": 0.8}}}} if {behaviour!r} == "probs" else {{"choice": "a"}}
"""


def adapter(tmp_path, behaviour):
    p = tmp_path / "adapter.py"
    p.write_text(ADAPTER.format(behaviour=behaviour))
    return str(p)


def play_adapter(fake, path):
    return main(["play", "--link", "tok", "--adapter", path, "--games", "toy", "--seeds", "0", "--api", fake.api])


def test_adapter_argmax_of_probs(make_fake, tmp_path, capsys):
    fake = make_fake()
    assert play_adapter(fake, adapter(tmp_path, "probs")) == 0
    assert moves(fake) == [{"action": "b"}] * 3
    out = capsys.readouterr().out
    assert 'settings: {"adapter": "fake-s1"}' in out and "score 0 steps 3 invalid 0" in out


def test_adapter_error_is_invalid_move(make_fake, tmp_path):
    fake = make_fake()
    assert play_adapter(fake, adapter(tmp_path, "boom")) == 0
    assert moves(fake) == [{"action": ""}] * 3


def test_ctrl_c_ends_cleanly(make_fake, tmp_path, capsys):
    fake = make_fake()
    assert play_adapter(fake, adapter(tmp_path, "interrupt")) == 130
    assert "interrupted" in capsys.readouterr().out
    assert len(moves(fake)) == 1


def test_adapter_state_and_question(make_fake, tmp_path):
    fake = make_fake()
    path = tmp_path / "echo.py"
    path.write_text('import json\nNAME = "echo"\ndef load(): return None\ndef predict(m, state, question):\n    open(__file__ + ".json", "w").write(json.dumps([state, question]))\n    return {"choice": "a"}\n')
    assert play_adapter(fake, str(path)) == 0
    state, question = json.loads((tmp_path / "echo.py.json").read_text())
    assert state == "Toy. Pick a or b.\n\nstep 2"
    assert question == {"type": "choice", "instructions": "Which action is best right now in Toy?", "criteria": {"a": "Take A; gain 1", "b": "Take B; gain 0"}}


def test_cli_validation(make_fake, capsys):
    fake = make_fake()
    for argv in (["play", "--link", "t"], ["play", "--link", "t", "--model", "ollama:x", "--adapter", "a.py"], ["play", "--link", "t", "--model", "ollama:x", "--concurrency", "0"]):
        with pytest.raises(SystemExit) as e:
            main(argv)
        assert e.value.code == 2
    with pytest.raises(SystemExit) as e:
        main(["play", "--link", "t", "--model", f"compat:fake@{fake.base}", "--games", "nope", "--api", fake.api])
    assert e.value.code == 2 and "unknown games" in capsys.readouterr().err

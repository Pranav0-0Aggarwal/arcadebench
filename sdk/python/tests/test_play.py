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
    assert moves(fake) == [{"action": "a", "step": i % 3, "tokensOut": 7} for i in range(6)]
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
    assert moves(fake) == [{"action": "", "step": i, "tokensOut": 7} for i in range(3)]
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


@pytest.mark.parametrize("mode", ["benchmark", "ranked"])
def test_benchmark_plays_until_the_server_says_complete(make_fake, capsys, mode):
    fake = make_fake(bench_cap=4)
    assert play(fake, "--mode", mode) == 0
    starts = [c[3] for c in fake.log if c[1] == "/api/v1/sessions"]
    assert all("seed" not in s and s["mode"] == "benchmark" for s in starts) and len(starts) == 5
    out = capsys.readouterr().out
    assert "toy: benchmark complete for toy" in out and "toy: 4 runs" in out
    assert out.count("watch live: https://watch.test/s") == 4


def test_prints_watch_url_when_a_game_starts(make_fake, capsys):
    fake = make_fake()
    assert play(fake, "--seeds", "0-1") == 0
    out = capsys.readouterr().out.splitlines()
    assert out.count("watch live: https://watch.test/s1") == 1 and out.count("watch live: https://watch.test/s2") == 1
    assert out.index("watch live: https://watch.test/s1") < next(i for i, x in enumerate(out) if x.startswith("toy TOY-"))


def watch_all(out):
    return [x for x in out.splitlines() if x.startswith("watch all: ")]


@pytest.mark.parametrize("flag", ["--parallel", "--concurrency"])
def test_parallel(make_fake, capsys, flag):
    fake = make_fake()
    assert play(fake, "--seeds", "0-5", flag, "3") == 0
    out = capsys.readouterr().out
    assert "toy: 6 runs, mean score 3.000" in out and len(watch_all(out)) == 1
    assert sorted(c[3]["seed"] for c in fake.log if c[1] == "/api/v1/sessions") == list(range(6))


def test_parallel_prints_one_combined_link_for_the_first_sessions(make_fake, capsys):
    fake = make_fake()
    assert play(fake, "--seeds", "0-5", "--parallel", "4") == 0
    out = capsys.readouterr().out.splitlines()
    link = next(i for i, x in enumerate(out) if x.startswith("watch all: "))
    ids, first = out[link].removeprefix("watch all: https://watch.test/").split(","), out[:link]
    assert len(ids) == 4 and sorted(ids) == sorted(x.removeprefix("watch live: https://watch.test/") for x in first if x.startswith("watch live: "))
    assert len([x for x in out if x.startswith("watch all: ")]) == 1


def test_combined_link_covers_only_the_sessions_there_are(make_fake, capsys):
    fake = make_fake()
    assert play(fake, "--seeds", "0-1", "--parallel", "4") == 0
    assert sorted(watch_all(capsys.readouterr().out)[0].removeprefix("watch all: https://watch.test/").split(",")) == ["s1", "s2"]


@pytest.mark.parametrize("args", [["--seeds", "0-3"], ["--seeds", "0", "--parallel", "4"]])
def test_no_combined_link_for_a_single_session(make_fake, capsys, args):
    fake = make_fake()
    assert play(fake, *args) == 0
    assert not watch_all(capsys.readouterr().out)


def test_parallel_benchmark_fills_the_slots_until_complete(make_fake, capsys):
    fake = make_fake(bench_cap=4)
    assert play(fake, "--mode", "benchmark", "--parallel", "2") == 0
    out = capsys.readouterr().out
    assert "toy: 4 runs" in out and "benchmark complete for toy" in out and len(watch_all(out)) == 1
    assert all("seed" not in c[3] for c in fake.log if c[1] == "/api/v1/sessions")


def test_parallel_session_lost_mid_game_moves_on(make_fake, capsys):
    fake = make_fake()
    fake.faults = [("/api/v1/sessions/s2/move", 404)]
    assert play(fake, "--seeds", "0-3", "--parallel", "2") == 0
    out = capsys.readouterr().out
    assert "toy: game ended early (fault)" in out and "toy: 3 runs" in out


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
    assert moves(fake) == [{"action": "b", "step": i} for i in range(3)]
    out = capsys.readouterr().out
    assert 'settings: {"adapter": "fake-s1"}' in out and "score 0 steps 3 invalid 0" in out


def test_adapter_error_is_invalid_move(make_fake, tmp_path):
    fake = make_fake()
    assert play_adapter(fake, adapter(tmp_path, "boom")) == 0
    assert moves(fake) == [{"action": "", "step": i} for i in range(3)]


def test_ctrl_c_ends_cleanly(make_fake, tmp_path, capsys):
    fake = make_fake()
    assert play_adapter(fake, adapter(tmp_path, "interrupt")) == 130
    assert "interrupted" in capsys.readouterr().out
    assert len(moves(fake)) == 1


def test_parallel_adapter_is_loaded_once_and_never_predicts_concurrently(make_fake, tmp_path):
    fake = make_fake()
    path = tmp_path / "serial.py"
    path.write_text(
        "import threading, time\n"
        'NAME = "serial"\n'
        "busy = threading.Lock()\n"
        "def load():\n"
        '    open(__file__ + ".loads", "a").write("x")\n'
        "def predict(m, state, question):\n"
        "    if not busy.acquire(blocking=False):\n"
        '        open(__file__ + ".overlap", "w").write("x")\n'
        "    else:\n"
        "        time.sleep(0.01)\n"
        "        busy.release()\n"
        '    return {"choice": "a"}\n'
    )
    assert main(["play", "--link", "tok", "--adapter", str(path), "--games", "toy", "--seeds", "0-3", "--parallel", "4", "--api", fake.api]) == 0
    assert (tmp_path / "serial.py.loads").read_text() == "x" and not (tmp_path / "serial.py.overlap").exists()
    assert len(moves(fake)) == 12


def test_ctrl_c_ends_a_parallel_run_cleanly(make_fake, tmp_path, capsys):
    fake = make_fake()
    assert main(["play", "--link", "tok", "--adapter", adapter(tmp_path, "interrupt"), "--games", "toy", "--seeds", "0-1", "--parallel", "2", "--api", fake.api]) == 130
    assert "interrupted" in capsys.readouterr().out


def test_adapter_state_and_question(make_fake, tmp_path):
    fake = make_fake()
    path = tmp_path / "echo.py"
    path.write_text('import json\nNAME = "echo"\ndef load(): return None\ndef predict(m, state, question):\n    open(__file__ + ".json", "w").write(json.dumps([state, question]))\n    return {"choice": "a"}\n')
    assert play_adapter(fake, str(path)) == 0
    state, question = json.loads((tmp_path / "echo.py.json").read_text())
    assert state == "Toy. Pick a or b.\n\nstep 2"
    assert question == {"type": "choice", "instructions": "Which action is best right now in Toy?", "criteria": {"a": "Take A; gain 1", "b": "Take B; gain 0"}}


def test_ask_replaces_the_question_and_the_rules_prefix(make_fake, tmp_path):
    fake = make_fake(ask="Is this a toy?")
    path = tmp_path / "echo.py"
    path.write_text('import json\nNAME = "echo"\ndef load(): return None\ndef predict(m, state, question):\n    open(__file__ + ".json", "w").write(json.dumps([state, question]))\n    return {"choice": "a"}\n')
    assert play_adapter(fake, str(path)) == 0
    state, question = json.loads((tmp_path / "echo.py.json").read_text())
    assert state == "step 2"
    assert question == {"type": "choice", "instructions": "Is this a toy?", "criteria": {"a": "Take A; gain 1", "b": "Take B; gain 0"}}


def test_cli_validation(make_fake, capsys):
    fake = make_fake()
    for argv in (["play", "--link", "t"], ["play", "--link", "t", "--model", "ollama:x", "--adapter", "a.py"], *(["play", "--link", "t", "--model", "ollama:x", "--parallel", n] for n in ("0", "5"))):
        with pytest.raises(SystemExit) as e:
            main(argv)
        assert e.value.code == 2
    with pytest.raises(SystemExit) as e:
        main(["play", "--link", "t", "--model", f"compat:fake@{fake.base}", "--games", "nope", "--api", fake.api])
    assert e.value.code == 2 and "unknown games" in capsys.readouterr().err


def test_lost_move_response_is_not_played_twice(make_fake, capsys, no_sleep):
    fake = make_fake()
    fake.lost = 1
    assert play(fake, "--seeds", "0") == 0
    assert [m["step"] for m in moves(fake)] == [0, 0, 1, 2]
    assert len(fake.chat) == 3 and "score 3 steps 3" in capsys.readouterr().out and len(no_sleep) == 1


@pytest.mark.parametrize("status", [404, 409])
def test_session_lost_mid_game_moves_on(make_fake, capsys, status):
    fake = make_fake(bench_cap=3)
    fake.faults = [("/api/v1/sessions/s1/move", status)]
    assert play(fake, "--mode", "benchmark") == 0
    out = capsys.readouterr().out
    assert "toy: game ended early (fault)" in out and "toy: 2 runs" in out and "benchmark complete" in out


def test_overload_is_retried_with_retry_after(make_fake, no_sleep):
    fake = make_fake()
    fake.faults = [("/api/v1/sessions", 429), ("/api/v1/sessions", 503)]
    assert play(fake, "--seeds", "0") == 0
    assert no_sleep == [0.0, 0.0] and len(moves(fake)) == 3


def test_auth_failure_stops_the_run(make_fake, capsys):
    fake = make_fake()
    fake.faults = [("/api/v1/sessions/s1/move", 401)]
    assert play(fake, "--seeds", "0") == 1
    assert "HTTP 401" in capsys.readouterr().err

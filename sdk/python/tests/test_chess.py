import json

import pytest
from fake import FakeChess

from arcadebench import chess as ch
from arcadebench.cli import main

SECRET = "sk-test-secret"
INVITE = "https://penguinzz.com/arcadebench/chess/m1#AbCdEf0123456789xyz"


def chess(fake, *extra, link="tok"):
    return main(["chess", "--link", link, "--model", f"compat:fake@{fake.base}", "--api", fake.api, *extra])


def posts(fake, suffix):
    return [c[3] for c in fake.log if c[0] == "POST" and c[1].endswith(suffix)]


def waits(fake):
    return [c[1] for c in fake.log if c[0] == "GET" and "/matches/m1?wait=" in c[1]]


def test_computer_match_plays_to_the_end(make_fake, monkeypatch, capsys):
    monkeypatch.setenv("ARCADEBENCH_COMPAT_KEY", SECRET)
    fake = make_fake(FakeChess)
    assert chess(fake, "--computer", "3", link="entry-link-xyz") == 0
    out = capsys.readouterr()
    assert posts(fake, "/api/v1/matches") == [{"white": "agent", "black": "computer:3", "me": "white"}]
    assert posts(fake, "/move") == [{"move": "e2e4"}, {"move": "e2e4"}]
    lines = out.out.splitlines()
    assert lines[1] == "watch live: https://watch.test/m1" and lines[-1] == "chess 1-0 checkmate accuracy 90% moves 4 invalid 0"
    system, user = (m["content"] for m in fake.chat[0]["messages"])
    assert system.startswith("You are playing chess in ArcadeBench") and system.endswith("exactly as written.")
    assert user == "You are white.\n\nBoard:\nboard 0\n\nFEN: fen 0\n\nMoves so far: none\n\nLegal moves:\n- e2e4: e4\n- d2d4: d4"
    assert "Moves so far: 1. e4 e5\n" in fake.chat[1]["messages"][1]["content"]
    api = [c for c in fake.log if c[1].startswith("/api/v1")]
    assert all(c[2]["Authorization"] == "Bearer entry-link-xyz" for c in api)
    assert all(SECRET not in json.dumps(c[2]) + json.dumps(c[3]) for c in api)
    chat = [c for c in fake.log if c[1] == "/v1/chat/completions"]
    assert [c[2]["Authorization"] for c in chat] == [f"Bearer {SECRET}"] * 2 and all("entry-link-xyz" not in json.dumps(c[2]) + json.dumps(c[3]) for c in chat)
    assert SECRET not in out.out + out.err


def test_black_against_the_computer(make_fake, capsys):
    fake = make_fake(FakeChess, me="black")
    assert chess(fake, "--computer", "2", "--color", "black") == 0
    assert posts(fake, "/api/v1/matches") == [{"white": "computer:2", "black": "agent", "me": "black"}]
    assert capsys.readouterr().out.splitlines()[-1] == "chess 1-0 checkmate accuracy n/a moves 4 invalid 0"


def test_invite_joins_with_the_fragment_token(make_fake, capsys):
    fake = make_fake(FakeChess, me="black")
    assert chess(fake, "--invite", f"see {INVITE}") == 0
    assert [c[1] for c in fake.log if c[1].endswith("/join")] == ["/api/v1/matches/m1/join"]
    assert posts(fake, "/join") == [{"seat": "AbCdEf0123456789xyz"}]
    assert not [c for c in fake.log if "AbCdEf" in c[1] or "AbCdEf" in json.dumps(c[2])]
    assert "watch live: https://watch.test/m1" in capsys.readouterr().out


def test_open_seat_is_waited_for(make_fake, capsys):
    fake = make_fake(FakeChess, me="black", open_polls=2)
    assert chess(fake, "--invite", INVITE) == 0
    assert fake.chat and waits(fake)[:3] == ["/api/v1/matches/m1?wait=20"] * 3
    assert len(posts(fake, "/move")) == 2 and "moves 4" in capsys.readouterr().out


def test_queue_with_computer_fallback(make_fake, capsys, no_sleep):
    fake = make_fake(FakeChess, queue_waits=2)
    assert chess(fake, "--queue", "--computer", "3", "--after", "60", "--color", "white") == 0
    assert posts(fake, "/queue") == [{"color": "white", "computer": {"level": 3, "after": 60}}]
    assert [c[1] for c in fake.log if c[0] == "GET" and c[1].endswith("/queue")] == ["/api/v1/queue"] * 2 and no_sleep == [3, 3]
    out = capsys.readouterr().out.splitlines()
    assert out.count("waiting for an opponent") == 1 and out.index("watch live: https://watch.test/m1") > out.index("waiting for an opponent")
    assert not posts(fake, "/api/v1/matches")


def test_queue_defaults(make_fake):
    fake = make_fake(FakeChess)
    assert chess(fake, "--queue", "--computer", "1") == 0
    assert posts(fake, "/queue") == [{"color": "any", "computer": {"level": 1, "after": 60}}] and not [c for c in fake.log if c[0] == "GET" and c[1].endswith("/queue")]
    fake = make_fake(FakeChess)
    assert chess(fake, "--queue") == 0
    assert posts(fake, "/queue") == [{"color": "any"}]


def test_reply_is_retried_before_the_first_legal_move_is_played(make_fake, capsys):
    fake = make_fake(FakeChess, replies=["no idea", "ACTION: z9z9", "still nothing", "ACTION: d2d4"], total=2)
    assert chess(fake, "--computer", "1") == 0
    assert posts(fake, "/move") == [{"move": "e2e4"}] and len(fake.chat) == 3
    retry = fake.chat[1]["messages"][1]["content"]
    assert retry == fake.chat[0]["messages"][1]["content"] + "\n\nYour last reply had no legal move. Legal ids: e2e4, d2d4. End with ACTION: <id>." == fake.chat[2]["messages"][1]["content"]
    assert capsys.readouterr().out.splitlines()[-1].endswith("invalid 3")


def test_a_retry_that_answers_is_played(make_fake, capsys):
    fake = make_fake(FakeChess, replies=["hm", "ACTION: d2d4", "ACTION: e2e4"])
    assert chess(fake, "--computer", "1") == 0
    assert posts(fake, "/move") == [{"move": "d2d4"}, {"move": "e2e4"}] and "invalid 1" in capsys.readouterr().out


def test_opponent_draw_offer_is_declined(make_fake, capsys):
    fake = make_fake(FakeChess, offer_at=2, total=6)
    assert chess(fake, "--computer", "1") == 0
    assert posts(fake, "/draw") == [{"action": "decline"}] and len(posts(fake, "/move")) == 3
    assert "moves 6" in capsys.readouterr().out


def test_not_your_turn_is_polled_again(make_fake):
    fake = make_fake(FakeChess, conflicts=1)
    assert chess(fake, "--computer", "1") == 0
    assert posts(fake, "/move") == [{"move": "e2e4"}] * 3 and len(fake.chat) == 3


def test_overload_is_retried(make_fake, no_sleep):
    fake = make_fake(FakeChess)
    fake.faults = [("/api/v1/matches", 503), ("/v1/chat", 429), ("/api/v1/matches/m1/move", 502)]
    assert chess(fake, "--computer", "1") == 0
    assert len(no_sleep) == 3 and len(posts(fake, "/move")) == 3


def test_client_error_is_not_retried(make_fake, capsys, no_sleep):
    fake = make_fake(FakeChess)
    fake.faults = [("/api/v1/matches", 401)]
    assert chess(fake, "--computer", "1") == 1
    assert "HTTP 401" in capsys.readouterr().err and not no_sleep


def test_ctrl_c_stops_cleanly(make_fake, monkeypatch, capsys):
    fake = make_fake(FakeChess)

    def stop(*a):
        raise KeyboardInterrupt

    monkeypatch.setattr(ch, "choose", stop)
    assert chess(fake, "--computer", "1") == 130
    assert "forfeits after 10 minutes" in capsys.readouterr().out and not posts(fake, "/move")


def test_ctrl_c_while_queued_leaves_the_queue(make_fake, monkeypatch, capsys):
    fake = make_fake(FakeChess, queue_waits=99)

    def stop(*a):
        raise KeyboardInterrupt

    monkeypatch.setattr("arcadebench.http.sleep", stop)
    assert chess(fake, "--queue") == 130
    assert [c[0] for c in fake.log if c[1] == "/api/v1/queue"] == ["POST", "DELETE"]
    assert "forfeits after 10 minutes" in capsys.readouterr().out


def test_prompt_numbers_black_replies():
    view = {"you": "black", "board": "B", "fen": "F", "sans": ["e4", "e5", "Nf3"], "legal": [{"id": "b8c6", "san": "Nc6"}]}
    assert ch.build_prompt(view) == "You are black.\n\nBoard:\nB\n\nFEN: F\n\nMoves so far: 1. e4 e5 2. Nf3\n\nLegal moves:\n- b8c6: Nc6"


@pytest.mark.parametrize(
    "argv",
    [
        [],
        ["--computer", "0"],
        ["--computer", "6"],
        ["--invite", "https://penguinzz.com/arcadebench/chess/m1"],
        ["--invite", INVITE, "--queue"],
        ["--invite", INVITE, "--color", "white"],
        ["--queue", "--after", "30"],
        ["--computer", "2", "--after", "30"],
        ["--queue", "--computer", "2", "--after", "4"],
        ["--computer", "2", "--adapter", "a.py"],
    ],
)
def test_cli_validation(argv, capsys):
    with pytest.raises(SystemExit) as e:
        main(["chess", "--link", "t", "--model", "ollama:x", *argv])
    assert e.value.code == 2 and capsys.readouterr().err


def test_model_is_required(capsys):
    with pytest.raises(SystemExit) as e:
        main(["chess", "--link", "t", "--computer", "1"])
    assert e.value.code == 2 and "--model is required" in capsys.readouterr().err

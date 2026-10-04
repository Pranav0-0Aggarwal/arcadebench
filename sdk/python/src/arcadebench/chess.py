import re

from . import http
from .http import HttpError
from .prompt import parse_action

INVITE = re.compile(r"/chess/([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)")
TRIES, WAIT, POLL, SETTLE = 3, 20, 3, 10

SYSTEM = """You are playing chess in ArcadeBench, a benchmark that scores every move against an engine.

Each turn you get the board, the moves so far and the legal moves as UCI ids with their SAN. Think if you like, then end your reply with one line exactly like:
ACTION: <uci>
Use one id from the legal list, exactly as written."""


def build_prompt(view):
    sans = " ".join(f"{i // 2 + 1}. {s}" if i % 2 == 0 else s for i, s in enumerate(view["sans"])) or "none"
    legal = "\n".join(f"- {m['id']}: {m['san']}" for m in view["legal"])
    return f"You are {view['you']}.\n\nBoard:\n{view['board']}\n\nFEN: {view['fen']}\n\nMoves so far: {sans}\n\nLegal moves:\n{legal}"


def choose(model, view):
    ids, user, bad = [m["id"] for m in view["legal"]], build_prompt(view), 0
    ask = user
    for _ in range(TRIES):
        move = parse_action(model(SYSTEM, ask, ids)[0], ids)
        if move:
            return move, bad
        bad += 1
        ask = f"{user}\n\nYour last reply had no legal move. Legal ids: {', '.join(ids)}. End with ACTION: <id>."
    return ids[0], bad


def begin(api, a):
    if a.invite:
        return api.join(*a.invite)["match"]
    if not a.queue:
        me = "black" if a.color == "black" else "white"
        opp = "white" if me == "black" else "black"
        return api.new_match(me=me, **{"white": "agent", "black": "agent", opp: f"computer:{a.computer}"})["match"]
    q = api.enter(color=a.color or "any", **({"computer": {"level": a.computer, "after": a.after or 60}} if a.computer else {}))
    if q["status"] != "matched":
        print("waiting for an opponent", flush=True)
    try:
        while q["status"] != "matched":
            http.sleep(POLL)
            q = api.queued()
    except KeyboardInterrupt:
        api.leave()
        raise
    return q["match"]["match"]


def play(api, model, view):
    id, invalid = view["id"], 0
    print(f"watch live: {view['watchUrl']}", flush=True)
    while view["status"] != "done":
        try:
            if view["draw"] not in (None, view["you"]):
                view = api.draw(id, "decline")["match"]
            elif view["status"] == "live" and view["turn"] == view["you"]:
                move, bad = choose(model, view)
                invalid += bad
                view = api.chess_move(id, move)["match"]
            else:
                view = api.match(id, WAIT)
        except HttpError as e:
            if e.status != 409:
                raise
            view = api.match(id)
    for _ in range(SETTLE):
        if view.get("runId"):
            break
        http.sleep(1)
        view = api.match(id)
    acc = view["accuracy"][view["you"] == "black"]
    pct = "n/a" if acc is None else f"{acc:.0f}%"
    print(f"chess {view['result']} {view['why']} accuracy {pct} moves {len(view['moves'])} invalid {invalid}", flush=True)

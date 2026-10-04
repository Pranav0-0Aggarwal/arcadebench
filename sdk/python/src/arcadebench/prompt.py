import re
from decimal import ROUND_HALF_UP, Decimal

WS = " \t\n\v\f\r\xa0                　﻿"
ACTION = re.compile(f"ACTION[*_{WS}]*[:=][{WS}`\"'*_]*([A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*)", re.I | re.A)
EDGES = re.compile(f"^[`\"'*{WS}]+|[`\"'*.{WS}]+\\Z")

SYSTEM = """You are playing {name} in ArcadeBench, a benchmark that scores every move against an expert.

Rules: {rules}

Each turn you get the current state and the legal actions. Think if you like, then end your reply with one line exactly like:
ACTION: <action id>
Use one id from the legal list, exactly as written."""


def num(v):
    s = format(Decimal(v).quantize(Decimal("0.001"), ROUND_HALF_UP), "f")
    s = s.rstrip("0").rstrip(".") if "." in s else s
    return "0" if s in ("-0", "") else s


def signed(v):
    return ("+" if v >= 0 else "") + num(v)


def describe(a):
    s = f"- {a['id']}: {a['label']}"
    if a.get("features") is not None:
        s += " | " + ", ".join(f"{k}={num(v)}" for k, v in a["features"].items())
    if a.get("outcome") is not None:
        o = a["outcome"]
        s += f" | outcome: score {signed(o['scoreDelta'])}, {'ends the game' if o['done'] else 'game continues'}"
    return s


def build_prompt(game, obs, history):
    keep = 40 if game["id"] == "shifting" else 8
    recent = history[-keep:]
    hist = "Your recent moves, oldest first: " + ", ".join(f"{t['action']} ({signed(t['scoreDelta'])})" for t in recent) + "\n\n" if recent else ""
    legal = "\n".join(describe(a) for a in obs["legalActions"])
    return SYSTEM.format(name=game["name"], rules=game["rules"]), f"State:\n{obs['state']}\n\n{hist}Legal actions:\n{legal}"


def parse_action(text, legal):
    by_lower = {a.lower(): a for a in legal}
    for m in reversed([m.group(1).lower() for m in ACTION.finditer(text)]):
        if m in by_lower:
            return by_lower[m]
    return by_lower.get(EDGES.sub("", text.strip(WS)).lower())


def to_system_one(game, obs):
    criteria = {}
    for a in obs["legalActions"]:
        d = a["label"]
        if a.get("features") is not None:
            d += "; " + ", ".join(f"{k} {num(v)}" for k, v in a["features"].items())
        if a.get("outcome") is not None:
            d += f"; score change {num(a['outcome']['scoreDelta'])}{', ends the game' if a['outcome']['done'] else ''}"
        criteria[a["id"]] = d
    ask = game.get("ask")
    question = {"type": "choice", "instructions": ask or f"Which action is best right now in {game['name']}?", "criteria": criteria}
    return obs["state"] if ask else f"{game['name']}. {game['rules']}\n\n{obs['state']}", question

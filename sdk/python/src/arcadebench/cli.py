import os
import argparse
import json
import sys

from . import __version__
from .api import BASE, Api
from .http import HttpError
from .models import Adapter, load_model
from .play import Llm, SystemOne, run


def seed_list(text):
    out = []
    for part in text.split(","):
        a, _, b = part.partition("-")
        out += range(int(a), int(b or a) + 1)
    return out


def parser():
    p = argparse.ArgumentParser(prog="arcadebench")
    p.add_argument("--version", action="version", version=__version__)
    q = p.add_subparsers(dest="cmd", required=True).add_parser("play", add_help=False, help="play games with your model")
    q.add_argument("-h", action="help", help="show this message")
    q.add_argument("--link", default=os.environ.get("ARCADEBENCH_LINK"), help="your private link token (or ARCADEBENCH_LINK)")
    q.add_argument("--model", help="openai:<m> | anthropic:<m> | deepseek:<m> | ollama:<m> | compat:<m>@<base_url>")
    q.add_argument("--adapter", help="System One adapter .py (NAME, load(), predict(model, state, question))")
    q.add_argument("--games", default="all", help="all or a comma list, e.g. tetris,snake")
    q.add_argument("--mode", choices=["benchmark", "practice", "ranked"], default="practice", help="benchmark: fresh seeds until the score is precise ('ranked' is an alias)")
    q.add_argument("--seeds", type=seed_list, default=seed_list("0-9"), help="practice seeds, e.g. 0-9 or 1,4,7-9")
    q.add_argument("--help", dest="level", type=int, choices=[0, 1, 2], default=0, help="observation help level")
    q.add_argument("--clock", choices=["none", "latency", "token"], default="none")
    q.add_argument("--api", default=BASE)
    q.add_argument("--concurrency", type=int, default=1)
    q.add_argument("--thinking", action="store_true", help="opt in to provider thinking/reasoning")
    return p


def main(argv=None):
    p = parser()
    a = p.parse_args(argv)
    if bool(a.model) == bool(a.adapter):
        p.error("give exactly one of --model and --adapter")
    if a.adapter and a.thinking:
        p.error("--thinking applies to --model only")
    if a.concurrency < 1:
        p.error("--concurrency must be at least 1")
    player = SystemOne(Adapter(a.adapter)) if a.adapter else Llm(load_model(a.model, a.thinking))
    if not a.link:
        sys.exit("--link or ARCADEBENCH_LINK is required")
    api = Api(a.link, a.api)
    try:
        games = {g["id"]: g for g in api.games()}
        ids = list(games) if a.games == "all" else a.games.split(",")
        if unknown := [i for i in ids if i not in games]:
            p.error(f"unknown games {unknown}; known: {', '.join(games)}")
        print("settings:", json.dumps(player.settings), flush=True)
        return run(api, player, [games[i] for i in ids], "benchmark" if a.mode == "ranked" else a.mode, a.seeds, a.level, a.clock, a.concurrency)
    except (HttpError, OSError) as e:
        print(f"arcadebench: {e}", file=sys.stderr)
        return 1

import argparse
import json
import os
import sys

from . import __version__
from .api import BASE, Api
from .chess import INVITE, begin
from .chess import play as play_match
from .http import HttpError
from .models import Adapter, load_model
from .play import Llm, SystemOne, run


def seed_list(text):
    out = []
    for part in text.split(","):
        a, _, b = part.partition("-")
        out += range(int(a), int(b or a) + 1)
    return out


def invite(text):
    if not (m := INVITE.search(text)):
        raise argparse.ArgumentTypeError("expected a link like https://penguinzz.com/arcadebench/chess/<match>#<token>")
    return m.groups()


def common(q):
    q.add_argument("-h", action="help", help="show this message")
    q.add_argument("--link", default=os.environ.get("ARCADEBENCH_LINK"), help="your private link token (or ARCADEBENCH_LINK)")
    q.add_argument("--model", help="openai:<m> | anthropic:<m> | deepseek:<m> | ollama:<m> | compat:<m>@<base_url>")
    q.add_argument("--api", default=BASE)
    q.add_argument("--thinking", action="store_true", help="opt in to provider thinking/reasoning")
    return q


def parser():
    p = argparse.ArgumentParser(prog="arcadebench")
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="cmd", required=True)
    q = common(sub.add_parser("play", add_help=False, help="play games with your model"))
    q.add_argument("--adapter", help="System One adapter .py (NAME, load(), predict(model, state, question))")
    q.add_argument("--games", default="all", help="all or a comma list, e.g. tetris,snake")
    q.add_argument("--mode", choices=["benchmark", "practice", "ranked"], default="practice", help="benchmark: fresh seeds until the score is precise ('ranked' is an alias)")
    q.add_argument("--seeds", type=seed_list, default=seed_list("0-9"), help="practice seeds, e.g. 0-9 or 1,4,7-9")
    q.add_argument("--help", dest="level", type=int, choices=[0, 1, 2], default=0, help="observation help level")
    q.add_argument("--clock", choices=["none", "latency", "token"], default="none")
    q.add_argument("--parallel", "--concurrency", type=int, choices=range(1, 5), default=1, metavar="N", help="games in flight at once, 1 to 4; prints one combined watch link")
    q.set_defaults(go=play_cmd)
    c = common(sub.add_parser("chess", add_help=False, help="play a chess match with your model"))
    c.add_argument("--invite", type=invite, metavar="URL", help="join the seat of an invite link (https://.../chess/<match>#<token>)")
    c.add_argument("--queue", action="store_true", help="wait in the open queue for an opponent")
    c.add_argument("--computer", type=int, choices=range(1, 6), metavar="N", help="play the computer at level 1 to 5; with --queue, fall back to it after --after seconds")
    c.add_argument("--color", choices=["white", "black", "any"], help="your colour (default any)")
    c.add_argument("--after", type=int, choices=range(5, 601), metavar="SECONDS", help="queue fallback delay, 5 to 600 (default 60)")
    c.set_defaults(go=chess_cmd)
    return p


def connect(a):
    if not a.link:
        sys.exit("--link or ARCADEBENCH_LINK is required")
    return Api(a.link, a.api)


def play_cmd(p, a):
    if bool(a.model) == bool(a.adapter):
        p.error("give exactly one of --model and --adapter")
    if a.adapter and a.thinking:
        p.error("--thinking applies to --model only")
    player = SystemOne(Adapter(a.adapter)) if a.adapter else Llm(load_model(a.model, a.thinking))
    api = connect(a)
    try:
        games = {g["id"]: g for g in api.games()}
        ids = list(games) if a.games == "all" else a.games.split(",")
        if unknown := [i for i in ids if i not in games]:
            p.error(f"unknown games {unknown}; known: {', '.join(games)}")
        print("settings:", json.dumps(player.settings), flush=True)
        return run(api, player, [games[i] for i in ids], "benchmark" if a.mode == "ranked" else a.mode, a.seeds, a.level, a.clock, a.parallel)
    except (HttpError, OSError) as e:
        print(f"arcadebench: {e}", file=sys.stderr)
        return 1


def chess_cmd(p, a):
    if not a.model:
        p.error("--model is required")
    if not (a.invite or a.queue or a.computer):
        p.error("give one of --invite, --queue or --computer")
    if a.invite and (a.queue or a.computer or a.color or a.after):
        p.error("--invite takes no other match options")
    if a.after and not (a.queue and a.computer):
        p.error("--after needs --queue and --computer")
    model = load_model(a.model, a.thinking)
    api = connect(a)
    try:
        print("settings:", json.dumps(model.settings), flush=True)
        play_match(api, model, begin(api, a))
        return 0
    except (HttpError, OSError) as e:
        print(f"arcadebench: {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("stopped; an abandoned seat forfeits after 10 minutes")
        return 130


def main(argv=None):
    p = parser()
    a = p.parse_args(argv)
    return a.go(p, a)

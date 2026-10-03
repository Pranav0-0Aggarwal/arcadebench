import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

from .http import HttpError
from .prompt import build_prompt, parse_action, to_system_one


class Llm:
    def __init__(self, model):
        self.model, self.settings = model, model.settings

    def act(self, game, obs, history):
        text, tokens = self.model(*build_prompt(game, obs, history))
        return parse_action(text, [a["id"] for a in obs["legalActions"]]) or "", tokens


class SystemOne:
    def __init__(self, adapter):
        self.adapter, self.settings = adapter, adapter.settings

    def act(self, game, obs, history):
        return self.adapter.choose(*to_system_one(game, obs)), None


def play_game(api, player, game, mode, seed, help, clock, stop):
    body = {"game": game["id"], "mode": mode, "help": help, "clock": clock}
    if seed is not None:
        body["seed"] = seed
    obs = api.start(**body)
    history, invalid = [], 0
    while not obs["done"] and not stop.is_set():
        action, tokens = player.act(game, obs, history)
        res = api.move(obs["session"], action, tokens)
        if res.get("invalid"):
            invalid += 1
        else:
            history.append({"action": action, "scoreDelta": res["score"] - obs["score"]})
        obs = res
    return {"game": game["id"], "seedCode": obs.get("seedCode"), "score": obs["score"], "steps": obs["step"], "invalid": invalid, "done": obs["done"]}


def run(api, player, games, mode, seeds, help, clock, concurrency, out=print):
    seeds = seeds if mode == "practice" else [None] * api.season()["seedsPerGame"]
    stop, results, interrupted = threading.Event(), [], False

    def job(game, seed):
        if stop.is_set():
            return None
        try:
            return play_game(api, player, game, mode, seed, help, clock, stop)
        except HttpError as e:
            if e.status != 409:
                raise
            out(f"{game['id']}: skipped, {e}")

    with ThreadPoolExecutor(concurrency) as ex:
        futures = [ex.submit(job, g, s) for g in games for s in seeds]
        try:
            for f in as_completed(futures):
                if r := f.result():
                    results.append(r)
                    out(f"{r['game']} {r['seedCode']} score {r['score']:g} steps {r['steps']} invalid {r['invalid']}" + ("" if r["done"] else " (stopped)"))
        except KeyboardInterrupt:
            stop.set()
            interrupted = True
        except BaseException:
            stop.set()
            raise
    by_game = defaultdict(list)
    for r in results:
        by_game[r["game"]].append(r)
    for g, rs in by_game.items():
        out(f"{g}: {len(rs)} runs, mean score {sum(r['score'] for r in rs) / len(rs):.3f}, invalid {sum(r['invalid'] for r in rs)}")
    if interrupted:
        out("interrupted: unfinished sessions are left to the server as truncated runs")
    return 130 if interrupted else 0

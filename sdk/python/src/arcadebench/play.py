import os
import threading
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed

from .http import HttpError
from .prompt import build_prompt, parse_action, to_system_one


class Llm:
    def __init__(self, model):
        self.model, self.settings = model, model.settings

    def act(self, game, obs, history):
        ids = [a["id"] for a in obs["legalActions"]]
        text, tokens = self.model(*build_prompt(game, obs, history), ids)
        return parse_action(text, ids) or "", tokens


class SystemOne:
    def __init__(self, adapter):
        self.adapter, self.settings = adapter, adapter.settings

    def act(self, game, obs, history):
        return self.adapter.choose(*to_system_one(game, obs)), None


def play_game(api, player, game, mode, seed, help, clock, stop, watch):
    body = {"game": game["id"], "mode": mode, "help": help, "clock": clock}
    if seed is not None:
        body["seed"] = seed
    obs = api.start(**body)
    watch(obs["watchUrl"])
    history, invalid = [], 0
    while not obs["done"] and not stop.is_set():
        action, tokens = player.act(game, obs, history)
        res = api.move(obs["session"], action, obs["step"], tokens)
        if res.get("invalid"):
            invalid += 1
        else:
            history.append({"action": action, "scoreDelta": res["score"] - obs["score"]})
        obs = res
    return {"game": game["id"], "seedCode": obs.get("seedCode"), "score": obs["score"], "steps": obs["step"], "invalid": invalid, "done": obs["done"]}


def run(api, player, games, mode, seeds, help, clock, parallel, out=print):
    stop, results, interrupted, urls, lock = threading.Event(), [], False, [], threading.Lock()
    queue = deque((g, s) for g in games for s in (seeds if mode == "practice" else [None] * parallel))
    first = min(parallel, len(queue))

    def watch(url):
        with lock:
            out(f"watch live: {url}")
            urls.append(url)
            if first > 1 and len(urls) == first:
                out(f"watch all: {url.rpartition('/')[0]}/{','.join(u.rpartition('/')[2] for u in urls)}")

    def job(game, seed):
        while not stop.is_set():
            try:
                r = play_game(api, player, game, mode, seed, help, clock, stop, watch)
            except HttpError as e:
                if e.status == 409 and "benchmark complete" in e.reason:
                    return out(f"{game['id']}: {e.reason}")
                if e.status not in (404, 409):
                    raise
                out(f"{game['id']}: game ended early ({e.reason})")
                if mode == "practice":
                    return
                continue
            results.append(r)
            out(f"{r['game']} {r['seedCode']} score {r['score']:g} steps {r['steps']} invalid {r['invalid']}" + ("" if r["done"] else " (stopped)"))
            if mode == "practice":
                return

    def worker():
        while not stop.is_set():
            try:
                game, seed = queue.popleft()
            except IndexError:
                return
            job(game, seed)

    ex = ThreadPoolExecutor(parallel)
    futures = [ex.submit(worker) for _ in range(parallel)]
    try:
        for f in as_completed(futures):
            f.result()
    except KeyboardInterrupt:
        stop.set()
        interrupted = True
        out("stopping after the moves in flight; Ctrl-C again to quit now")
    except BaseException:
        stop.set()
        ex.shutdown(cancel_futures=True)
        raise
    try:
        ex.shutdown(cancel_futures=True)
    except KeyboardInterrupt:
        os._exit(130)
    by_game = defaultdict(list)
    for r in results:
        by_game[r["game"]].append(r)
    for g, rs in by_game.items():
        out(f"{g}: {len(rs)} runs, mean score {sum(r['score'] for r in rs) / len(rs):.3f}, invalid {sum(r['invalid'] for r in rs)}")
    if interrupted:
        out("interrupted: unfinished sessions are left to the server as truncated runs")
    return 130 if interrupted else 0

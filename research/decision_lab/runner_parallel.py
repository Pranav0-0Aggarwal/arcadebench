"""Parallel Decision Lab runner. Same adapter interface, scoring and metrics as research/pilot/runner.py
(decide/metrics are copied verbatim), plus concurrency, invalid/API-error accounting and token usage.

Usage: python runner_parallel.py <adapter.py> <out.json> [--workers N] [--cases path]
The pilot cases.json is read in place (its sha256 is recorded in the output).
"""
import argparse, hashlib, importlib.util, json, os, statistics, sys, time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CASES = os.path.join(HERE, "..", "pilot", "cases.json")


def load_adapter(path):
    sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
    spec = importlib.util.spec_from_file_location("adapter", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def decide(kind, out):  # verbatim from pilot runner
    if kind == "choice":
        c = out["choice"]; return c, out["probs"].get(c, 0.0)
    if kind == "noul":
        p = out["noul"]; return int(p >= 0.5), max(p, 1 - p)
    probs = {int(k): v for k, v in out["score_probs"].items()}
    k = max(probs, key=probs.get); return k, probs[k]


def metrics(items):  # verbatim from pilot runner, plus invalid / api_errors split
    n = len(items); ok = sum(i["ok"] for i in items)
    golds = sorted({str(i["gold"]) for i in items})
    f1s = []
    for c in golds:
        tp = sum(str(i["pred"]) == c and str(i["gold"]) == c for i in items)
        fp = sum(str(i["pred"]) == c and str(i["gold"]) != c for i in items)
        fn = sum(str(i["pred"]) != c and str(i["gold"]) == c for i in items)
        p = tp / (tp + fp) if tp + fp else 0; r = tp / (tp + fn) if tp + fn else 0
        f1s.append(2 * p * r / (p + r) if p + r else 0)
    bins = defaultdict(list)
    for i in items:
        bins[min(int(i["conf"] * 10), 9)].append(i)
    ece = sum(len(b) / n * abs(statistics.mean(x["ok"] for x in b) - statistics.mean(x["conf"] for x in b)) for b in bins.values())
    return {"n": n, "accuracy": round(ok / n, 3), "macro_f1": round(statistics.mean(f1s), 3), "ece": round(ece, 3),
            "errors": sum(1 for i in items if i["pred"] is None),
            "invalid": sum(1 for i in items if i.get("invalid")),
            "api_errors": sum(1 for i in items if i.get("error"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("adapter"); ap.add_argument("out")
    ap.add_argument("--workers", type=int, default=1); ap.add_argument("--cases", default=DEFAULT_CASES)
    a = ap.parse_args()
    raw = open(a.cases, "rb").read()
    tasks = json.loads(raw)
    ad = load_adapter(a.adapter)
    t = time.perf_counter(); model = ad.load(); load_s = time.perf_counter() - t

    jobs = []  # (task index, item index)
    for ti, task in enumerate(tasks):
        jobs += [(ti, ii) for ii in range(len(task["items"]))]
    total, done = len(jobs), [0]

    def run(job):
        ti, ii = job; task = tasks[ti]; it = task["items"][ii]
        q = dict(task["question"])
        if task.get("per_item_criteria"):
            q["criteria"] = it["criteria"]
        rec = {"idx": ii, "state": it["state"][:200], "gold": it["gold"]}
        t = time.perf_counter()
        try:
            out = ad.predict(model, it["state"], q)
            if out.get("invalid"):
                pred, conf = None, 0.0; rec["invalid"] = True; rec["raw"] = out.get("raw", "")
            else:
                pred, conf = decide(task["kind"], out)
        except Exception as e:  # API/transport failure after retries: count wrong, keep going
            pred, conf = None, 0.0; rec["error"] = f"{type(e).__name__}: {str(e)[:120]}"
            print(f"[{task['task']}#{ii}] error: {rec['error']}", file=sys.stderr)
        ms = (time.perf_counter() - t) * 1000
        rec.update(pred=pred, conf=round(conf, 3), ok=pred == it["gold"], ms=round(ms))
        done[0] += 1
        if done[0] % 100 == 0:
            print(f"  {done[0]}/{total}", file=sys.stderr)
        return ti, ii, rec

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        results = list(ex.map(run, jobs))
    wall = time.perf_counter() - t0

    by_task = defaultdict(list)
    for ti, ii, rec in results:
        by_task[ti].append(rec)
    per_task = {}
    for ti, task in enumerate(tasks):
        res = sorted(by_task[ti], key=lambda r: r["idx"])
        per_task[task["task"]] = {"metrics": metrics(res), "items": res}
        print(f"{ad.NAME:28s} {task['task']:28s} acc={per_task[task['task']]['metrics']['accuracy']}", file=sys.stderr)
    own = [i for k, v in per_task.items() if not k.startswith("pub_") for i in v["items"]]
    pub = [i for k, v in per_task.items() if k.startswith("pub_") for i in v["items"]]
    allit = own + pub
    lat = sorted(i["ms"] for i in allit)
    summary = {"model": ad.NAME, "load_s": round(load_s, 1),
               "desk_pet_accuracy": round(sum(i["ok"] for i in own) / len(own), 3),
               "public_accuracy": round(sum(i["ok"] for i in pub) / len(pub), 3),
               "overall_accuracy": round(sum(i["ok"] for i in allit) / len(allit), 3),
               "latency_ms": {"median": round(statistics.median(lat)), "p90": round(lat[int(0.9 * len(lat)) - 1])},
               "invalid": sum(1 for i in allit if i.get("invalid")),
               "api_errors": sum(1 for i in allit if i.get("error")),
               "workers": a.workers, "wall_s": round(wall, 1),
               "usage": getattr(ad, "USAGE", None),
               "cases_sha256": hashlib.sha256(raw).hexdigest(),
               "note": "LLM adapters put prob 1.0 on the chosen answer: ECE is not meaningful.",
               "tasks": {k: v["metrics"] for k, v in per_task.items()}}
    json.dump({"summary": summary, "per_task": per_task}, open(a.out, "w"), indent=1)
    print(json.dumps({k: v for k, v in summary.items() if k != "tasks"}, indent=1))


if __name__ == "__main__":
    main()

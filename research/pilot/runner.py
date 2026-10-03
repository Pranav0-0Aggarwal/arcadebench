"""Shared, dependency-free benchmark runner.

Usage: python runner.py <adapter_module_path> <out.json>
An adapter module defines:
    NAME: str
    load() -> model
    predict(model, state: str, question: dict) -> dict, one of
        {"choice": str, "probs": {option: p}}    for choice questions
        {"noul": p_yes}                          for yes/no questions
        {"score_probs": {index: p}}              for score questions
Question dicts follow the System One format: {"type", "instructions", "criteria"}.
"""
import importlib.util, json, os, statistics, sys, time
from collections import defaultdict

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
HERE = os.path.dirname(os.path.abspath(__file__))


def load_adapter(path):
    spec = importlib.util.spec_from_file_location("adapter", path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
    spec.loader.exec_module(mod)
    return mod


def decide(kind, out):
    if kind == "choice":
        c = out["choice"]; return c, out["probs"].get(c, 0.0)
    if kind == "noul":
        p = out["noul"]; return int(p >= 0.5), max(p, 1 - p)
    probs = {int(k): v for k, v in out["score_probs"].items()}
    k = max(probs, key=probs.get); return k, probs[k]


def metrics(items):
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
            "errors": sum(1 for i in items if i["pred"] is None)}


def main(adapter_path, out_path):
    tasks = json.load(open(os.path.join(HERE, "cases.json")))
    ad = load_adapter(adapter_path)
    t = time.perf_counter(); model = ad.load(); load_s = time.perf_counter() - t
    per_task, lat = {}, []
    for task in tasks:
        res = []
        for it in task["items"]:
            q = dict(task["question"])
            if task.get("per_item_criteria"):
                q["criteria"] = it["criteria"]
            t = time.perf_counter()
            try:
                out = ad.predict(model, it["state"], q)
                pred, conf = decide(task["kind"], out)
            except Exception as e:  # count as wrong, keep going
                pred, conf = None, 0.0
                print(f"[{task['task']}] error: {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
            lat.append((time.perf_counter() - t) * 1000)
            res.append({"state": it["state"][:200], "gold": it["gold"], "pred": pred, "conf": round(conf, 3), "ok": pred == it["gold"]})
        per_task[task["task"]] = {"metrics": metrics(res), "items": res}
        print(f"{ad.NAME:28s} {task['task']:28s} acc={per_task[task['task']]['metrics']['accuracy']}", file=sys.stderr)
    own = [i for k, v in per_task.items() if not k.startswith("pub_") for i in v["items"]]
    pub = [i for k, v in per_task.items() if k.startswith("pub_") for i in v["items"]]
    lat.sort()
    summary = {"model": ad.NAME, "load_s": round(load_s, 1),
               "desk_pet_accuracy": round(sum(i["ok"] for i in own) / len(own), 3),
               "public_accuracy": round(sum(i["ok"] for i in pub) / len(pub), 3),
               "overall_accuracy": round(sum(i["ok"] for i in own + pub) / len(own + pub), 3),
               "latency_ms": {"median": round(statistics.median(lat)), "p90": round(lat[int(0.9 * len(lat)) - 1])},
               "tasks": {k: v["metrics"] for k, v in per_task.items()}}
    json.dump({"summary": summary, "per_task": per_task}, open(out_path, "w"), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

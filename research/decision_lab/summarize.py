"""Summarize Decision Lab results -> results/decision_lab/summary.json + printed tables. Stdlib only.

Usage: python summarize.py [results_dir]
Bootstrap: 95% percentile CI over items (resample items with replacement), random.Random(SEED), B resamples.
Overall = all 788 items pooled (so dataset sizes weight it); desk-pet = tasks not prefixed pub_, public = pub_*.
Macro-F1 for a group is the unweighted mean of per-task macro-F1 (stored by the runner).
ECE is omitted: LLM adapters report confidence 1.0, so it is not meaningful for them.
"""
import glob, json, os, random, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RES = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "results", "decision_lab")
SEED, B = 20261004, 5000

# stem -> (flagged task prefixes/names, level, note)
CONTAM = {
    "bekko": (["pub_sms_spam_uci"], "confirmed", "Bekko was trained on all 150 UCI SMS items in this set"),
    "k2type": (["pub_"], "possible", "K2-Type may have seen the public datasets (SMS, BANKING77, CLINC150, BFCL)"),
}
LLM_NOTE = "General LLM: public benchmark data may be in pretraining data (unknown, not verifiable)"


def boot_ci(vals, rng):
    n = len(vals); out = []
    for _ in range(B):
        out.append(sum(vals[rng.randrange(n)] for _ in range(n)) / n)
    out.sort()
    return [round(out[int(0.025 * B)], 3), round(out[int(0.975 * B) - 1], 3)]


def group(per_task, pred):
    return [i for k, v in per_task.items() if pred(k) for i in v["items"]]


def acc_block(items, rng):
    v = [1 if i["ok"] else 0 for i in items]
    return {"n": len(v), "accuracy": round(sum(v) / len(v), 3), "ci95": boot_ci(v, rng)}


def stem_of(path):
    return os.path.basename(path)[len("results_"):-len(".json")]


def flagged(stem, task):
    spec = CONTAM.get(stem)
    return bool(spec) and any(task == f or (f.endswith("_") and task.startswith(f)) for f in spec[0])


def main():
    rng = random.Random(SEED)
    runs = {}
    for p in sorted(glob.glob(os.path.join(RES, "results_*.json"))):
        runs[stem_of(p)] = json.load(open(p))
    models = {}
    for stem, r in runs.items():
        s, pt = r["summary"], r["per_task"]
        allit = group(pt, lambda k: True)
        clean = group(pt, lambda k: not flagged(stem, k))
        m = {"name": s["model"], "overall": acc_block(allit, rng),
             "desk_pet": acc_block(group(pt, lambda k: not k.startswith("pub_")), rng),
             "public": acc_block(group(pt, lambda k: k.startswith("pub_")), rng),
             "invalid": sum(1 for i in allit if i.get("invalid")),
             "api_errors": sum(1 for i in allit if i.get("error")),
             "errors_total": sum(1 for i in allit if i["pred"] is None),
             "macro_f1_mean_over_tasks": round(statistics.mean(v["metrics"]["macro_f1"] for v in pt.values()), 3),
             "tasks": {k: {kk: v["metrics"][kk] for kk in ("n", "accuracy", "macro_f1", "errors")}
                       | {"invalid": v["metrics"].get("invalid", 0), "api_errors": v["metrics"].get("api_errors", 0),
                          "contaminated": flagged(stem, k)} for k, v in pt.items()}}
        if stem in CONTAM:
            m["contamination"] = {"level": CONTAM[stem][1], "note": CONTAM[stem][2],
                                  "flagged_tasks": [k for k in pt if flagged(stem, k)],
                                  "accuracy_excluding_flagged": acc_block(clean, rng) if clean else None,
                                  "note2": "excluding flagged tasks changes the item mix; compare only with the same subset of other models"}
        elif "deepseek" in stem or stem.startswith("ollama"):
            m["contamination"] = {"level": "unknown", "note": LLM_NOTE}
        if s.get("usage"):
            m["usage"] = s["usage"]
        if s.get("wall_s") is not None:
            m["wall_s"] = s["wall_s"]
        m["latency_ms"] = s.get("latency_ms")
        models[stem] = m

    out = {"seed": SEED, "bootstrap_resamples": B, "models": models}

    # test-retest
    a, b = runs.get("deepseek_flash"), runs.get("deepseek_flash_run2")
    if a and b:
        ia, ib, agree, both_ok, per_task = [], [], 0, 0, {}
        for k in a["per_task"]:
            x, y = a["per_task"][k]["items"], b["per_task"][k]["items"]
            ag = sum(1 for p, q in zip(x, y) if p["pred"] == q["pred"])
            per_task[k] = {"n": len(x), "agree": ag, "rate": round(ag / len(x), 3)}
            ia += x; ib += y
        n = len(ia)
        agree = sum(1 for p, q in zip(ia, ib) if p["pred"] == q["pred"])
        d = [(1 if q["ok"] else 0) - (1 if p["ok"] else 0) for p, q in zip(ia, ib)]
        diffs = []
        for _ in range(B):
            diffs.append(sum(d[rng.randrange(n)] for _ in range(n)) / n)
        diffs.sort()
        out["test_retest"] = {
            "runs": ["deepseek_flash", "deepseek_flash_run2"], "n": n,
            "item_agreement": agree, "item_agreement_rate": round(agree / n, 4),
            "accuracy_run1": round(sum(i["ok"] for i in ia) / n, 4), "accuracy_run2": round(sum(i["ok"] for i in ib) / n, 4),
            "accuracy_diff_run2_minus_run1": round(sum(d) / n, 4),
            "accuracy_diff_paired_ci95": [round(diffs[int(0.025 * B)], 4), round(diffs[int(0.975 * B) - 1], 4)],
            "items_flipped_correct_to_wrong": sum(1 for x in d if x < 0),
            "items_flipped_wrong_to_correct": sum(1 for x in d if x > 0),
            "per_task": per_task}
    json.dump(out, open(os.path.join(RES, "summary.json"), "w"), indent=1)

    # printed tables
    def fmt(b): return f"{b['accuracy']:.3f} [{b['ci95'][0]:.3f},{b['ci95'][1]:.3f}]"
    order = sorted(models, key=lambda s: -models[s]["overall"]["accuracy"])
    print(f"\nAccuracy with 95% bootstrap CI over items (B={B}, seed={SEED}); * = contamination flag")
    print(f"{'model':34s} {'overall (788)':22s} {'desk-pet (n=%d)' % models[order[0]]['desk_pet']['n']:24s} {'public (n=%d)' % models[order[0]]['public']['n']:24s} inval/err")
    for s in order:
        m = models[s]; star = "*" if s in CONTAM else " "
        print(f"{m['name'][:32]+star:34s} {fmt(m['overall']):22s} {fmt(m['desk_pet']):24s} {fmt(m['public']):24s} {m['invalid']}/{m['api_errors']}")
    print("\nPer task: accuracy / macro-F1 / (errors incl. invalid)   [. = clean, * = contaminated]")
    tasks = list(next(iter(models.values()))["tasks"])
    print(f"{'task (n)':34s}" + "".join(f"{models[s]['name'][:16]:>18s}" for s in order))
    for t in tasks:
        n = models[order[0]]["tasks"][t]["n"]
        row = f"{t + ' (' + str(n) + ')':34s}"
        for s in order:
            x = models[s]["tasks"][t]
            row += f"{x['accuracy']:.2f}/{x['macro_f1']:.2f}/{x['errors']}{'*' if x['contaminated'] else ''}".rjust(18)
        print(row)
    for s in CONTAM:
        if s in models and models[s].get("contamination", {}).get("accuracy_excluding_flagged"):
            c = models[s]["contamination"]
            print(f"\n[{models[s]['name']}] {c['level']} contamination: {c['note']}; accuracy excluding flagged tasks: {fmt(c['accuracy_excluding_flagged'])} (n={c['accuracy_excluding_flagged']['n']})")
    if "test_retest" in out:
        t = out["test_retest"]
        print(f"\nTest-retest (DeepSeek no-thinking, n={t['n']}): item agreement {t['item_agreement']}/{t['n']} = {t['item_agreement_rate']:.4f}; "
              f"accuracy {t['accuracy_run1']:.4f} -> {t['accuracy_run2']:.4f} (diff {t['accuracy_diff_run2_minus_run1']:+.4f}, paired 95% CI {t['accuracy_diff_paired_ci95']}); "
              f"flips c->w {t['items_flipped_correct_to_wrong']}, w->c {t['items_flipped_wrong_to_correct']}")
    for s in models:
        if "usage" in models[s]:
            print(f"usage {models[s]['name']}: {models[s]['usage']}")


if __name__ == "__main__":
    main()

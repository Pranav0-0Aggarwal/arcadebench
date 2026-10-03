"""Sample public datasets (plain JSON via HF APIs, no loader scripts) into cases.json tasks."""
import json, random, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
RNG = random.Random(42)
ROWS = "https://datasets-server.huggingface.co"
K = 10  # candidate labels per intent item


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read())


def rows(dataset, config, split, offsets, length=100):
    out = []
    for off in offsets:
        q = urllib.parse.urlencode({"dataset": dataset, "config": config, "split": split, "offset": off, "length": length})
        out += [r["row"] for r in get(f"{ROWS}/rows?{q}")["rows"]]
    return out


def label_names(dataset, config, column="label"):
    q = urllib.parse.urlencode({"dataset": dataset, "config": config})
    feats = get(f"{ROWS}/info?{q}")["dataset_info"]["features"]
    return feats[column]["names"]


def human(label):
    return label.replace("_", " ").replace("-", " ").strip().capitalize()


def intent_task(name, instr, items, all_labels, extra=None):
    out = []
    for text, gold in items:
        pool = [l for l in all_labels if l != gold]
        cands = RNG.sample(pool, K - 1) + [gold]
        RNG.shuffle(cands)
        crit = {l: human(l) for l in cands}
        if extra:
            crit.update(extra)
        out.append({"state": text, "gold": gold, "criteria": crit})
    return {"task": name, "kind": "choice", "question": {"type": "choice", "instructions": instr}, "per_item_criteria": True, "items": out}


def main():
    tasks = []
    # 1. UCI SMS spam: 75 spam + 75 ham
    sms = rows("ucirvine/sms_spam", "plain_text", "train", RNG.sample(range(0, 5500, 100), 15))
    spam = [r for r in sms if r["label"] == 1]; ham = [r for r in sms if r["label"] == 0]
    pick = RNG.sample(spam, min(75, len(spam))) + RNG.sample(ham, 75)
    RNG.shuffle(pick)
    tasks.append({"task": "pub_sms_spam_uci", "kind": "choice",
                  "question": {"type": "choice", "instructions": "Is this SMS spam?",
                               "criteria": {"spam": "Unsolicited advertising, prize or lottery claims, scams, or premium-rate offers",
                                            "ham": "A normal personal or legitimate message"}},
                  "items": [{"state": r["sms"].strip(), "gold": "spam" if r["label"] == 1 else "ham"} for r in pick]})

    # 2. BANKING77 test: 120 items, 10-way choice
    names = label_names("mteb/banking77", "default", "label_text") if False else None
    b = rows("mteb/banking77", "default", "test", RNG.sample(range(0, 3000, 100), 12))
    labels = sorted({r["label_text"] for r in b})
    items = [(r["text"], r["label_text"]) for r in RNG.sample(b, 120)]
    tasks.append(intent_task("pub_banking77", "What is the customer's banking intent?", items, labels))

    # 3. CLINC150 plus test: 100 in-scope + 20 out-of-scope, 10-way choice plus a 'none' option
    clinc_names = label_names("clinc/clinc_oos", "plus", "intent")
    c = rows("clinc/clinc_oos", "plus", "test", RNG.sample(range(0, 5400, 100), 20))
    ins = [r for r in c if clinc_names[r["intent"]] != "oos"]; oos = [r for r in c if clinc_names[r["intent"]] == "oos"]
    real = [l for l in clinc_names if l != "oos"]
    items = [(r["text"], clinc_names[r["intent"]]) for r in RNG.sample(ins, 100)]
    t = intent_task("pub_clinc150", "Which intent does this request express?", items, real,
                    extra={"none": "None of the other options; the request is outside these intents"})
    for r in RNG.sample(oos, min(20, len(oos))):
        cands = RNG.sample(real, K)
        crit = {l: human(l) for l in cands}
        crit["none"] = "None of the other options; the request is outside these intents"
        t["items"].append({"state": r["text"], "gold": "none", "criteria": crit})
    RNG.shuffle(t["items"])
    tasks.append(t)

    # 4. BFCL v3 multiple / live_multiple: pick the right function among candidates
    base = "https://huggingface.co/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard/resolve/main/"
    for split, n in (("BFCL_v3_multiple.json", 100), ("BFCL_v3_live_multiple.json", 100)):
        qs = [json.loads(l) for l in urllib.request.urlopen(base + split, timeout=120).read().decode().splitlines() if l.strip()]
        ans = {(a := json.loads(l))["id"]: a for l in urllib.request.urlopen(base + "possible_answer/" + split, timeout=120).read().decode().splitlines() if l.strip()}
        items = []
        for q in RNG.sample([q for q in qs if q["id"] in ans], n):
            gt = ans[q["id"]]["ground_truth"]
            if len(gt) != 1:
                continue
            gold = next(iter(gt[0]))
            turns = q["question"][0] if isinstance(q["question"][0], list) else q["question"]
            user = " ".join(m["content"] for m in turns if m.get("role") == "user")
            crit = {f["name"]: (f.get("description") or f["name"])[:300] for f in q["function"]}
            if gold not in crit or len(crit) < 2:
                continue
            items.append({"state": user, "gold": gold, "criteria": crit})
        tasks.append({"task": "pub_" + split.split(".")[0].lower(), "kind": "choice", "per_item_criteria": True,
                      "question": {"type": "choice", "instructions": "Which function should be called to fulfil this user request?"},
                      "items": items})

    path = HERE / "cases.json"
    existing = json.loads(path.read_text())
    existing = [t for t in existing if not t["task"].startswith("pub_")] + tasks
    path.write_text(json.dumps(existing, indent=1))
    for t in tasks:
        print(t["task"], len(t["items"]))


if __name__ == "__main__":
    main()

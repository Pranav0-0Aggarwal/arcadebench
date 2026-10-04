import hashlib, json, random, re, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/engine/src/games/data"
API = "https://datasets-server.huggingface.co"
CASES = Path.home() / "Downloads/arcadebench-models/shootout/cases.json"
RNG = random.Random(7)
CACHE = Path.home() / ".cache/arcadebench/rows"
BAN = re.compile(r"\b(sex\w*|fuck\w*|shit|dick|cock|pussy|horny|naked|knickers|dogging|faglord|bitch|slut|xxx|porn|moan\w*|laid|kiss\w*|babe\w*|luv|fantas\w*|flirt\w*|sexy|adult|dating|singles|erotic|nude\w*|hottest|gay|lesbian|18\+)\b", re.I)


def get(path, **q):
    url = f"{API}/{path}?{urllib.parse.urlencode(q)}"
    f = CACHE / f"{hashlib.sha1(url.encode()).hexdigest()}.json"
    if f.exists():
        return json.loads(f.read_text())
    for i in range(8):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                body = r.read()
            CACHE.mkdir(parents=True, exist_ok=True)
            f.write_bytes(body)
            return json.loads(body)
        except (urllib.error.HTTPError, TimeoutError, OSError):
            if i == 7:
                raise
            time.sleep(15 * (i + 1))


def rows(dataset, n, where=None, step=100):
    out, off = [], 0
    while len(out) < n:
        q = dict(dataset=dataset, config="default" if "/" in dataset and dataset != "ucirvine/sms_spam" else "plain_text", split="train", offset=off, length=step)
        page = get("filter", where=where, **q) if where else get("rows", **q)
        if not page["rows"]:
            break
        out += [r["row"] for r in page["rows"]]
        off += step
    return out


def uci():
    all_ = rows("ucirvine/sms_spam", 6000)
    clean = lambda t: " ".join(t.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").split())
    ok = [r for r in all_ if 12 <= len(r["sms"]) <= 200 and not BAN.search(r["sms"]) and "#&gt;" not in r["sms"]]
    seen, items = set(), []
    for r in ok:
        t = clean(r["sms"])
        if t.lower() not in seen:
            seen.add(t.lower())
            items.append((t, r["label"]))
    return items


def sms():
    items = uci()
    spam = RNG.sample(sp := [t for t, l in items if l == 1], min(600, len(sp)))
    ham = RNG.sample([t for t, l in items if l == 0], len(spam))
    return [[t, 1] for t in spam] + [[t, 0] for t in ham]


def lines(url):
    f = CACHE / f"{hashlib.sha1(url.encode()).hexdigest()}.jsonl"
    if not f.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=180) as r:
            f.write_bytes(r.read())
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()]


def bfcl():
    base = "https://huggingface.co/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard/resolve/main/"
    out = []
    for split in ("BFCL_v3_multiple.json", "BFCL_v3_live_multiple.json"):
        ans = {a["id"]: a["ground_truth"] for a in lines(base + "possible_answer/" + split)}
        for q in lines(base + split):
            gt = ans.get(q["id"])
            if not gt or len(gt) != 1:
                continue
            gold = next(iter(gt[0]))
            turns = q["question"][0] if isinstance(q["question"][0], list) else q["question"]
            user = " ".join(" ".join(m["content"].split()) for m in turns if m.get("role") == "user")
            fns = [[f["name"], " ".join((f.get("description") or f["name"]).split())[:160]] for f in q["function"]]
            names = [n for n, _ in fns]
            if gold in names and 2 <= len(fns) <= 6 and len(set(names)) == len(names) and all(len(n) <= 64 for n in names) and 8 <= len(user) <= 300:
                out.append([user, fns, names.index(gold)])
    return RNG.sample(out, 700)


def paysim():
    cols = ["type", "amount", "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest"]
    page = lambda off: [r["row"] for r in get("rows", dataset="theman10/paysim", config="default", split="train", offset=off, length=100)["rows"]]
    tail = [r for off in range(6362120, 6362620, 100) for r in page(off) if r["isFraud"]]
    pool = [r for off in RNG.sample(range(0, 6300000, 100), 90) for r in page(off) if not r["isFraud"]]
    cash = [r for r in pool if r["type"] in ("TRANSFER", "CASH_OUT")]
    other = [r for r in pool if r["type"] not in ("TRANSFER", "CASH_OUT")]
    pick = tail + RNG.sample(cash, min(len(cash), round(len(tail) * 0.7))) + RNG.sample(other, round(len(tail) * 0.3))
    return [[*[r[c] for c in cols], r["isFraud"]] for r in pick]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in [("sms", sms()), ("bfcl", bfcl()), ("paysim", paysim())]:
        RNG.shuffle(data)
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        print(name, len(data), (OUT / f"{name}.json").stat().st_size)


if __name__ == "__main__":
    main()

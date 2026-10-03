#!/usr/bin/env bash
set -euo pipefail
days="${1:-7}"
ssh -o BatchMode=yes "${ARCADEBENCH_SSH:-arcadebench}" python3 - "$days" <<'PY'
import sqlite3, sys, time
from collections import Counter
d = int(sys.argv[1])
c = sqlite3.connect("file:/var/lib/site-telemetry/events.db?mode=ro", uri=True)
for span in (1, 7, 30):
    since = int(time.time()) - span * 86400
    r = c.execute("select path, referrer, session from events where ts >= ? and path like '/arcadebench%'", (since,)).fetchall()
    pv = [x for x in r if "/_e/" not in x[0]]
    print(f"last {span:>2}d  views {len(pv):>5}  visitors {len({x[2] for x in pv}):>4}  events {len(r) - len(pv):>4}")
since = int(time.time()) - d * 86400
r = c.execute("select path, referrer from events where ts >= ? and path like '/arcadebench%'", (since,)).fetchall()
for title, rows in (("pages", [p for p, _ in r if "/_e/" not in p]), ("events", [p.split("/_e/")[1] for p, _ in r if "/_e/" in p]), ("referrers", [h for p, h in r if h and "/_e/" not in p])):
    print(f"\ntop {title} ({d}d)")
    for k, n in Counter(rows).most_common(12):
        print(f"  {n:>5}  {k}")
PY

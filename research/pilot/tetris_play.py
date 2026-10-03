"""Play fixed Tetris games with a decision-model adapter (or a baseline) and log every move.

Usage: python tetris_play.py <adapter.py | random | heuristic> <out.json> [--seeds 1,2,3] [--pieces 150]
"""
import argparse, importlib.util, json, os, random, sys, time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tetris as T  # noqa: E402

INSTR = {
    "easy": "You are playing Tetris. Choose where to drop the current piece. Good moves clear lines, keep the stack low and flat, and never bury empty cells under blocks (holes).",
    "hard": "You are playing Tetris. Look at the board and choose where to drop the current piece. Good moves clear lines, keep the stack low and flat, and never bury empty cells under blocks (holes).",
}


def describe(p, piece, mode, before):
    where = f"{piece} piece {T.ROT_NAMES[p['rot']]}, left edge in column {p['col'] + 1}"
    if mode == "hard":
        return where
    f = p["feat"]; new_holes = f["holes"] - before["holes"]
    return (f"{where}: clears {p['lines']} line{'s' if p['lines'] != 1 else ''}, "
            f"{'creates ' + str(new_holes) + ' new hole' + ('s' if new_holes != 1 else '') if new_holes > 0 else 'creates no new holes'}, "
            f"tallest column becomes {f['max_height']}, surface bumpiness {f['bumpiness']}")


def chooser(kind):
    if kind == "random":
        rng = random.Random(0)
        return "Random", lambda state, q, opts: rng.choice(opts)["id"]
    if kind == "heuristic":
        return "Classic Tetris AI", lambda state, q, opts: max(opts, key=T.el_tetris_score)["id"]
    spec = importlib.util.spec_from_file_location("adapter", kind)
    ad = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.dirname(os.path.abspath(kind)))
    spec.loader.exec_module(ad)
    model = ad.load()

    def pick(state, q, opts):
        out = ad.predict(model, state, q)
        return out["choice"] if out["choice"] in {o["id"] for o in opts} else None
    return ad.NAME, pick


def play(name, pick, seed, mode, max_pieces):
    board, bag = T.empty(), T.Bag(seed)
    lines = score = 0; moves = []; invalid = 0; t0 = time.perf_counter()
    for n in range(max_pieces):
        piece, nxt = bag.next(), bag.peek()
        opts = T.placements(board, piece)
        if not opts:
            break
        before = T.features(board)
        state = (f"Board (# = filled, . = empty, rows numbered by height, columns 1-10):\n{T.ascii_board(board)}\n"
                 f"Current piece: {piece}. Next piece: {nxt}. Lines cleared so far: {lines}.")
        q = {"type": "choice", "instructions": INSTR[mode], "criteria": {o["id"]: describe(o, piece, mode, before) for o in opts}}
        if len(opts) == 1:  # forced move; decision models need at least two options
            choice = opts[0]["id"]
        else:
            try:
                choice = pick(state, q, opts)
            except Exception as e:
                print(f"model error: {type(e).__name__}: {str(e)[:100]}", file=sys.stderr)
                choice = None
        if choice is None:
            invalid += 1; choice = opts[0]["id"]
        p = next(o for o in opts if o["id"] == choice)
        board = p["board"]; lines += p["lines"]; score += T.POINTS[p["lines"]]
        moves.append({"piece": piece, "choice": choice, "lines": p["lines"], "landed": p["landed"],
                      "board": ["".join(map(str, r)) for r in board], "best": max(opts, key=T.el_tetris_score)["id"]})
    return {"model": name, "seed": seed, "mode": mode, "pieces": len(moves), "lines": lines, "score": score,
            "topped_out": len(moves) < max_pieces, "invalid": invalid,
            "agree_with_classic_ai": round(sum(m["choice"] == m["best"] for m in moves) / max(1, len(moves)), 3),
            "sec": round(time.perf_counter() - t0, 1), "moves": moves}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("player"); ap.add_argument("out")
    ap.add_argument("--seeds", default="1,2,3"); ap.add_argument("--pieces", type=int, default=150)
    ap.add_argument("--modes", default="easy,hard")
    a = ap.parse_args()
    name, pick = chooser(a.player)
    games = []
    for mode in a.modes.split(","):
        for s in map(int, a.seeds.split(",")):
            g = play(name, pick, s, mode, a.pieces)
            games.append(g)
            print(f"{name:28s} {mode:4s} seed={s} pieces={g['pieces']:3d} lines={g['lines']:3d} score={g['score']:5d} "
                  f"agree={g['agree_with_classic_ai']} invalid={g['invalid']} {g['sec']}s", file=sys.stderr)
    json.dump({"model": name, "games": games}, open(a.out, "w"))


if __name__ == "__main__":
    main()

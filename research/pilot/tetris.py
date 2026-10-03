"""Minimal Tetris engine: 10x20 board, seeded 7-bag, hard-drop placements, board features."""
import random

W, H = 10, 20
SHAPES = {  # base orientation, cells as (row, col); rotations generated
    "I": [(0, 0), (0, 1), (0, 2), (0, 3)],
    "O": [(0, 0), (0, 1), (1, 0), (1, 1)],
    "T": [(0, 0), (0, 1), (0, 2), (1, 1)],
    "S": [(0, 1), (0, 2), (1, 0), (1, 1)],
    "Z": [(0, 0), (0, 1), (1, 1), (1, 2)],
    "J": [(0, 0), (1, 0), (1, 1), (1, 2)],
    "L": [(0, 2), (1, 0), (1, 1), (1, 2)],
}
ROT_NAMES = ["spawn", "turned right", "upside down", "turned left"]


def _norm(cells):
    r0 = min(r for r, _ in cells); c0 = min(c for _, c in cells)
    return tuple(sorted((r - r0, c - c0) for r, c in cells))


def rotations(piece):
    out, cells = [], SHAPES[piece]
    for k in range(4):
        n = _norm(cells)
        if n not in [o for _, o in out]:
            out.append((k, n))
        cells = [(c, -r) for r, c in cells]  # rotate 90 degrees clockwise
    return out


class Bag:
    def __init__(self, seed):
        self.rng = random.Random(seed); self.queue = []

    def next(self):
        if len(self.queue) < 2:
            bag = list(SHAPES); self.rng.shuffle(bag); self.queue += bag
        return self.queue.pop(0)

    def peek(self):
        if len(self.queue) < 2:
            bag = list(SHAPES); self.rng.shuffle(bag); self.queue += bag
        return self.queue[0]


def empty():
    return [[0] * W for _ in range(H)]  # row 0 is the top


def drop(board, cells, col):
    """Hard-drop shape at column offset; returns (new_board, lines, landed_cells) or None if it tops out."""
    width = max(c for _, c in cells) + 1
    if col < 0 or col + width > W:
        return None
    row = -min(r for r, _ in cells)  # start above the board
    def fits(r):
        for dr, dc in cells:
            rr, cc = r + dr, col + dc
            if rr >= H or (rr >= 0 and board[rr][cc]):
                return False
        return True
    if not fits(row):
        return None
    while fits(row + 1):
        row += 1
    if any(row + dr < 0 for dr, _ in cells):
        return None  # locked above the visible board: game over
    new = [r[:] for r in board]
    for dr, dc in cells:
        new[row + dr][col + dc] = 1
    kept = [r for r in new if not all(r)]
    lines = H - len(kept)
    new = [[0] * W for _ in range(lines)] + kept
    return new, lines, [(row + dr, col + dc) for dr, dc in cells]


def heights(board):
    hs = []
    for c in range(W):
        h = 0
        for r in range(H):
            if board[r][c]:
                h = H - r; break
        hs.append(h)
    return hs


def holes(board):
    n = 0
    for c in range(W):
        seen = False
        for r in range(H):
            if board[r][c]:
                seen = True
            elif seen:
                n += 1
    return n


def features(board):
    hs = heights(board)
    return {"max_height": max(hs), "agg_height": sum(hs), "holes": holes(board),
            "bumpiness": sum(abs(hs[i] - hs[i + 1]) for i in range(W - 1))}


def placements(board, piece):
    """All distinct legal hard-drop placements: list of dicts."""
    out, seen = [], set()
    for k, cells in rotations(piece):
        width = max(c for _, c in cells) + 1
        for col in range(W - width + 1):
            res = drop(board, cells, col)
            if res is None:
                continue
            new, lines, landed = res
            key = tuple(map(tuple, new))
            if key in seen:
                continue
            seen.add(key)
            out.append({"id": f"r{k}c{col + 1}", "rot": k, "col": col, "board": new, "lines": lines,
                        "landed": landed, "feat": features(new)})
    return out


def el_tetris_score(p):
    """El-Tetris (Dellacherie-style) linear heuristic; higher is better."""
    f = p["feat"]
    return -0.510066 * f["agg_height"] + 0.760666 * p["lines"] - 0.35663 * f["holes"] - 0.184483 * f["bumpiness"]


def ascii_board(board):
    rows = ["".join("#" if x else "." for x in r) for r in board]
    first = next((i for i, r in enumerate(rows) if "#" in r), H)
    shown = rows[max(0, first - 1):] if first < H else rows[-1:]
    return "\n".join(f"{H - (H - len(shown) + i) :2d} {r}" for i, r in enumerate(shown)) + "\n   " + "".join(str((c + 1) % 10) for c in range(W))


POINTS = {0: 0, 1: 100, 2: 300, 3: 500, 4: 800}

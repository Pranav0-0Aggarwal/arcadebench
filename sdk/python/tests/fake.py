import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GAME = {"id": "toy", "name": "Toy", "rules": "Pick a or b.", "prefix": "TOY", "version": "1.0.0", "realtime": None, "cap": 3, "original": True}
ACTIONS = [{"id": "a", "label": "Take A", "features": {"gain": 1}}, {"id": "b", "label": "Take B", "features": {"gain": 0}}]


class Fake:
    def __init__(self, bench_cap=None, reply="ACTION: a", ask=None):
        self.game = {**GAME, "ask": ask} if ask else GAME
        self.log, self.chat, self.faults, self.sessions = [], [], [], {}
        self.bench_cap, self.reply, self.started, self.lost = bench_cap, reply, 0, 0
        self.lock = threading.Lock()
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                self.serve(None)

            def do_DELETE(self):
                self.serve(None)

            def do_POST(self):
                self.serve(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))

            def serve(self, body):
                with fake.lock:
                    status, out = fake.handle(self.command, self.path, dict(self.headers), body)
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Retry-After", "0")
                self.end_headers()
                self.wfile.write(json.dumps(out).encode())

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.api, self.base = self.url + "/api/v1", self.url + "/v1"
        threading.Thread(target=self.server.serve_forever, args=(0.01,), daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()

    def view(self, sid):
        s = self.sessions[sid]
        done = s["step"] >= 3
        return {"session": sid, "game": "toy", "watch": f"w{sid}", "watchUrl": f"https://watch.test/{sid}", "seedCode": f"TOY-{s['seed']:04d}", "step": s["step"], "score": s["score"], "done": done, "state": f"step {s['step']}", "data": None, "legalActions": [] if done else ACTIONS}

    def handle(self, method, path, headers, body):
        self.log.append((method, path, headers, body))
        for i, (prefix, status) in enumerate(self.faults):
            if path.startswith(prefix):
                del self.faults[i]
                return status, {"error": "fault"}
        if path == "/v1/chat/completions":
            self.chat.append(body)
            return 200, {"choices": [{"message": {"content": self.say()}}], "usage": {"completion_tokens": 7}}
        return self.route(method, path.removeprefix("/api/v1"), body)

    def say(self):
        return self.reply

    def route(self, method, route, body):
        if route == "/games":
            return 200, [self.game]
        if route == "/sessions":
            if body["mode"] == "benchmark" and self.bench_cap is not None and self.started >= self.bench_cap:
                return 409, {"error": "benchmark complete for toy"}
            self.started += 1
            sid = f"s{self.started}"
            self.sessions[sid] = {"seed": body.get("seed", 100 + self.started), "step": 0, "score": 0}
            return 200, self.view(sid)
        sid = route.split("/")[2]
        s = self.sessions[sid]
        if body.get("step", s["step"]) != s["step"]:
            return 200, self.view(sid)
        bad = body["action"] not in ("a", "b")
        s["step"] += 1
        s["score"] += body["action"] == "a"
        out = self.view(sid)
        if self.lost:
            self.lost -= 1
            return 502, {"error": "bad gateway"}
        return 200, {**out, "invalid": "not a legal action"} if bad else out


LEGAL = [{"id": "e2e4", "san": "e4"}, {"id": "d2d4", "san": "d4"}]
SEAT = {"kind": "agent", "name": "bot", "joined": True, "elo": 1200}


class FakeChess(Fake):
    def __init__(self, me="white", total=4, replies=("ACTION: e2e4",), open_polls=0, queue_waits=0, offer_at=None, conflicts=0):
        super().__init__()
        self.me, self.total, self.replies, self.open_polls, self.waits, self.offer_at, self.conflicts = me, total, list(replies), open_polls, queue_waits, offer_at, conflicts
        self.moves, self.sans, self.status, self.draw = [], [], "live", None

    def say(self):
        return self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]

    def color(self):
        return "white" if len(self.moves) % 2 == 0 else "black"

    def view(self):
        mine = self.status == "live" and self.color() == self.me
        done = self.status == "done"
        return {
            "id": "m1", "watch": "wm1", "watchUrl": "https://watch.test/m1", "status": self.status, "white": SEAT, "black": SEAT, "turn": self.color(), "you": self.me, "fen": f"fen {len(self.moves)}",
            "board": f"board {len(self.moves)}", "moves": self.moves, "sans": self.sans, "result": "1-0" if done else None, "why": "checkmate" if done else "", "draw": self.draw, "deadline": None,
            "accuracy": [90.0, None], "grades": [], **({"legal": LEGAL} if mine else {}), **({"runId": "r1"} if done else {}),
        }

    def add(self, move, san):
        self.moves.append(move)
        self.sans.append(san)
        if len(self.moves) >= self.total:
            self.status = "done"

    def route(self, method, route, body):
        if route == "/matches" or route.endswith("/join"):
            self.me = body.get("me", self.me)
            self.status = "open" if self.open_polls and route != "/matches" else "live"
            return 200, {"match": self.view(), "seats": [], "token": "tk"}
        if route == "/queue" and method == "DELETE":
            return 200, {"ok": True}
        if route == "/queue":
            self.waits -= method == "GET"
            if self.waits > 0:
                return 200, {"status": "waiting", "ticket": "t", "expires": "soon"}
            return 200, {"status": "matched", "ticket": "", "expires": "soon", "color": self.me, "match": {"match": self.view(), "seats": [], "token": "tk"}}
        if route.endswith("/draw"):
            if body["action"] != "decline" or not self.draw:
                return 409, {"error": "the opponent has not offered a draw"}
            self.draw = None
            return 200, {"match": self.view(), "seats": []}
        if route.endswith("/move"):
            ids = [m["id"] for m in LEGAL]
            if self.conflicts or self.status != "live" or self.color() != self.me:
                self.conflicts = max(0, self.conflicts - 1)
                return 409, {"error": "it is not your turn"}
            if body["move"] not in ids:
                return 422, {"error": f"illegal move; legal moves: {', '.join(ids)}"}
            self.add(body["move"], LEGAL[ids.index(body["move"])]["san"])
            return 200, {"match": self.view(), "seats": []}
        if self.status == "open" and not self.open_polls:
            self.status = "live"
        self.open_polls -= self.status == "open"
        if self.status == "live" and self.color() != self.me:
            self.add(*(("e2e4", "e4") if self.color() == "white" else ("e7e5", "e5")))
            if self.status == "live" and self.offer_at == len(self.moves):
                self.draw = "white" if self.me == "black" else "black"
        return 200, self.view()

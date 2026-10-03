import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GAME = {"id": "toy", "name": "Toy", "rules": "Pick a or b.", "prefix": "TOY", "version": "1.0.0", "realtime": None, "cap": 3, "original": True}
ACTIONS = [{"id": "a", "label": "Take A", "features": {"gain": 1}}, {"id": "b", "label": "Take B", "features": {"gain": 0}}]


class Fake:
    def __init__(self, bench_cap=None, reply="ACTION: a"):
        self.log, self.chat, self.faults, self.sessions = [], [], [], {}
        self.bench_cap, self.reply, self.started = bench_cap, reply, 0
        self.lock = threading.Lock()
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
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
            return 200, {"choices": [{"message": {"content": self.reply}}], "usage": {"completion_tokens": 7}}
        route = path.removeprefix("/api/v1")
        if route == "/games":
            return 200, [GAME]
        if route == "/sessions":
            if body["mode"] == "benchmark" and self.bench_cap is not None and self.started >= self.bench_cap:
                return 409, {"error": "benchmark complete for toy"}
            self.started += 1
            sid = f"s{self.started}"
            self.sessions[sid] = {"seed": body.get("seed", 100 + self.started), "step": 0, "score": 0}
            return 200, self.view(sid)
        sid = route.split("/")[2]
        s = self.sessions[sid]
        bad = body["action"] not in ("a", "b")
        s["step"] += 1
        s["score"] += body["action"] == "a"
        out = self.view(sid)
        return 200, {**out, "invalid": "not a legal action"} if bad else out

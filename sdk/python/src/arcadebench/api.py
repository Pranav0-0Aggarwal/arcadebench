from .http import call

BASE = "https://penguinzz.com/arcadebench/api/v1"


class Api:
    def __init__(self, token, base=BASE):
        self.base = base.rstrip("/")
        self.headers = {"Authorization": f"Bearer {token}"}

    def get(self, path):
        return call("GET", self.base + path, None, self.headers)

    def post(self, path, body):
        return call("POST", self.base + path, body, self.headers)

    def games(self):
        return self.get("/games")

    def start(self, **body):
        return self.post("/sessions", body)

    def move(self, session, action, step, tokens=None):
        body = {"action": action, "step": step}
        if tokens is not None:
            body["tokensOut"] = tokens
        return self.post(f"/sessions/{session}/move", body)

    def match(self, id, wait=0):
        return self.get(f"/matches/{id}?wait={wait}")

    def new_match(self, **body):
        return self.post("/matches", body)

    def join(self, id, seat):
        return self.post(f"/matches/{id}/join", {"seat": seat})

    def chess_move(self, id, move):
        return self.post(f"/matches/{id}/move", {"move": move})

    def draw(self, id, action):
        return self.post(f"/matches/{id}/draw", {"action": action})

    def enter(self, **body):
        return self.post("/queue", body)

    def queued(self):
        return self.get("/queue")

    def leave(self):
        return call("DELETE", self.base + "/queue", None, self.headers)

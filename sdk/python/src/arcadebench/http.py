import json
import time
import urllib.error
import urllib.request

from . import __version__

sleep = time.sleep


class HttpError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body[:200]}")
        self.status = status


def call(method, url, body=None, headers=None, timeout=60, tries=6):
    data = None if body is None else json.dumps(body).encode()
    h = {"User-Agent": f"arcadebench-python/{__version__}", "Content-Type": "application/json", **(headers or {})}
    delay = 1
    for i in range(tries):
        wait = delay
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data, h, method=method), timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            if e.code != 429 and e.code < 500 or i + 1 == tries:
                raise HttpError(e.code, text) from None
            ra = e.headers.get("Retry-After", "")
            wait = min(float(ra), 60) if ra.replace(".", "", 1).isdigit() else delay
        except (urllib.error.URLError, OSError):
            if i + 1 == tries:
                raise
        sleep(wait)
        delay = min(delay * 2, 30)

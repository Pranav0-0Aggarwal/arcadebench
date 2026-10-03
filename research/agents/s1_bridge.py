import importlib.util, json, os, sys

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


def load_adapter(path):
    spec = importlib.util.spec_from_file_location("adapter", path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
    spec.loader.exec_module(mod)
    return mod


def main(adapter_path):
    out = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    ad = load_adapter(adapter_path)
    model = ad.load()
    out.write(json.dumps({"ready": ad.NAME}) + "\n"); out.flush()
    for line in sys.stdin:
        try:
            req = json.loads(line)
            res = ad.predict(model, req["state"], req["question"])
            probs = {str(k): float(v) for k, v in (res.get("probs") or {}).items()}
            choice = res.get("choice") or (max(probs, key=probs.get) if probs else None)
            out.write(json.dumps({"choice": choice, "probs": probs}) + "\n")
        except Exception as e:
            out.write(json.dumps({"error": f"{type(e).__name__}: {e}"[:300]}) + "\n")
        out.flush()


if __name__ == "__main__":
    main(sys.argv[1])

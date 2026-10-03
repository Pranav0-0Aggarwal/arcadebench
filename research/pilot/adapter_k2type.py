"""Adapter for IFM/K2-Type-0.9B: native decision path (jev/encode.py + pointer head), CPU, offline.
Mirrors jev/serve.py's to_record/answer logic without importing serve.py (no FastAPI, no server, no .cuda())."""
import json, os, sys

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "k2type", "repo")
os.environ.setdefault("HF_MODULES_CACHE", os.path.join(HERE, "k2type", "hf_modules"))  # keep remote-code copy in workdir
sys.path.insert(0, REPO)
NAME = "K2-Type-0.9B"


def load():
    import torch
    from safetensors.torch import load_file
    from transformers import AutoTokenizer
    from jev.encode import Encoder
    from jev.model import DecisionModel

    torch.set_num_threads(max(1, (os.cpu_count() or 8) - 2))
    cfg = json.load(open(os.path.join(REPO, "decision_config.json")))
    tok = AutoTokenizer.from_pretrained(REPO, trust_remote_code=True)  # code reviewed; avoids interactive prompt
    model = DecisionModel(REPO, head_dim=cfg["head_dim"], dtype=torch.float32, attn="sdpa")
    model.head.load_state_dict(load_file(os.path.join(REPO, "pointer_head.safetensors")))
    model.temperature.fill_(cfg["temperature"])
    model.eval()
    max_len = cfg["max_len"]
    enc = Encoder(tok, max_len, max_len - 1024)
    pad = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    return {"model": model, "enc": enc, "pad": pad}


def _record(state, question):
    from jev.encode import render
    t = question["type"]
    instr = question.get("instructions") or ""
    instr = instr if isinstance(instr, str) else render(instr)
    if t == "choice":
        crit = {k: (v if v is None or isinstance(v, str) else render(v)) for k, v in question["criteria"].items()}
        q = {"type": "choice", "instructions": instr, "criteria": crit, "label": next(iter(crit))}
    elif t == "score":
        levels = [c if isinstance(c, str) else render(c) for c in question["criteria"]]
        q = {"type": "score", "instructions": instr, "criteria": levels, "label": 0}
    elif t == "noul":
        crit = {k: v for k, v in (question.get("criteria") or {}).items() if k in ("false", "true")}
        q = {"type": "noul", "instructions": instr, "label": False, **({"criteria": crit} if crit else {})}
    else:
        raise ValueError(f"unknown type {t!r}")
    return {"state": state, "questions": {"q": q}}


def predict(m, state, question):
    import torch
    from jev.encode import collate
    rec = _record(state, question)
    e = m["enc"].encode(rec)
    if e is None or len(e["decide"]) != 1:
        raise ValueError("request does not fit in max_len")
    with torch.no_grad():
        scores = m["model"](collate([e], m["pad"]))
    p = torch.softmax(scores[0].float(), -1).tolist()
    q = rec["questions"]["q"]
    if q["type"] == "choice":
        return {"choice": max(zip(q["criteria"], p), key=lambda kv: kv[1])[0], "probs": dict(zip(q["criteria"], p))}
    if q["type"] == "noul":
        return {"noul": p[1]}
    return {"score_probs": {i: x for i, x in enumerate(p)}}

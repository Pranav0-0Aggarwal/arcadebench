"""Adapter for hotchpotch/bekko-system-one-v0-400m (HF commit 1960df56), CPU, offline.

Uses the model's native typed API (BekkoSentenceTransformer.predict) from the
reviewed inference_v0.py in the local model directory. No Hub access.
"""
import json, os, sys

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bekko", "model")
NAME = "bekko-system-one-v0-400m"

# Noul questions in cases.json carry no authored meanings; Bekko requires both.
NOUL_TRUE = "Yes. The answer to the instruction's question is yes for this state."
NOUL_FALSE = "No. The answer to the instruction's question is no for this state."


def load():
    sys.path.insert(0, MODEL_DIR)
    from inference_v0 import BekkoSentenceTransformer
    return BekkoSentenceTransformer(MODEL_DIR, device="cpu", attn_implementation="sdpa",
                                    trust_remote_code=True, local_files_only=True)


def _crit(cid, desc, value=None):
    return {"id": cid, "description_json": json.dumps(desc), "value": value}


def predict(model, state, question):
    kind = question["type"]
    if kind == "choice":
        crit = question["criteria"]
        if not isinstance(crit, dict):
            crit = {c: c for c in crit}
        criteria = [_crit(k, v) for k, v in crit.items()]
    elif kind == "noul":
        criteria = [_crit("true", NOUL_TRUE), _crit("false", NOUL_FALSE)]
    elif kind == "score":
        levels = question["criteria"]  # ordered level names, low -> high
        criteria = [_crit(str(i), name, i) for i, name in enumerate(levels)]
    else:
        raise ValueError(f"unknown question type {kind}")
    req = {"state_json": json.dumps(state), "decisions": [{
        "id": "q", "kind": "judgment", "type": kind,
        "instructions_json": json.dumps(question["instructions"]),
        "system_prompt": "", "criteria": criteria, "documents": [], "scoring": None}]}
    a = model.predict(req, show_progress_bar=False)["q"]
    if kind == "choice":
        return {"choice": a["selected_id"], "probs": a["probabilities"]}
    if kind == "noul":
        return {"noul": a["probability_yes"]}
    return {"score_probs": {int(k): v for k, v in a["probabilities"].items()}}

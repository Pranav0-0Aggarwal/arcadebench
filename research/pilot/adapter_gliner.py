"""GLiNER2.5-Decide adapter (fastino/GLiNER2.5-Decide @ 5a7adf72, gliner2==2.0.0).

Mapping onto gliner2 classify_text (one classification head per question):
  choice -> labels = criteria dict {option: description}, prompt = instructions
  noul   -> labels {"yes", "no"}, prompt = instructions; returns P(yes)
  score  -> labels = level names in order, prompt = instructions; index -> prob
The head is single-label softmax. We request it as multi_label + class_act=softmax
+ cls_threshold=0 only so the library returns the softmax prob of *every* label
(decoding-only flags; the model input and logits are identical to single-label).
"""
import os

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "gliner", "repo")
NAME = "GLiNER2.5-Decide"
_RESERVED = ("[P]", "[L]", "[C]", "[E]", "[R]", "[DESCRIPTION]", "[EXAMPLE]", "[OUTPUT]", "(", ")")


def _clean(s):
    # The library rejects these marker strings in labels/prompts; neutralise them.
    s = str(s)
    for t in _RESERVED:
        s = s.replace(t, {"(": "[", ")": "]"}.get(t, " "))
    return " ".join(s.split()) or "-"


def load():
    import torch
    from gliner2 import AutoExtractor
    torch.set_grad_enabled(False)
    m = AutoExtractor.from_pretrained(MODEL_DIR, map_location="cpu")
    m.eval()
    return m


def _probs(model, state, prompt, labels):
    """labels: dict {label_name: description or None} in order. Returns {name: p}."""
    names = list(labels)
    safe = [_clean(n) for n in names]
    if len(set(safe)) != len(safe):
        raise ValueError("label collision after cleaning")
    descs = {s: _clean(labels[n]) for s, n in zip(safe, names) if labels[n]}
    cfg = {"labels": descs if len(descs) == len(safe) else safe, "prompt": _clean(prompt),
           "multi_label": True, "class_act": "softmax", "cls_threshold": 0.0}
    out = model.classify_text(state, {"decision": cfg}, include_confidence=True)["decision"]
    back = dict(zip(safe, names))
    return {back[d["label"]]: float(d["confidence"]) for d in out}


def predict(model, state, question):
    kind, instr, crit = question["type"], question["instructions"], question.get("criteria")
    if kind == "choice":
        labels = dict(crit) if isinstance(crit, dict) else {c: None for c in crit}
        p = _probs(model, state, instr, labels)
        return {"choice": max(p, key=p.get), "probs": p}
    if kind == "noul":
        p = _probs(model, state, instr, {"yes": None, "no": None})
        return {"noul": p["yes"]}
    if kind == "score":
        levels = list(crit)
        p = _probs(model, state, instr, {lv: None for lv in levels})
        return {"score_probs": {i: p[lv] for i, lv in enumerate(levels)}}
    raise ValueError(f"unknown question type {kind}")

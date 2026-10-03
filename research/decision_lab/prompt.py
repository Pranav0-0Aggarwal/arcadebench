"""Official Decision Lab LLM prompt + strict answer parser (shared by all LLM adapters).

One prompt per question type; the model must reply with a single JSON object {"answer": ...}.
Parsing is strict: anything else (prose, code fences, extra text, unknown option,
wrong type) is INVALID and the runner counts it wrong. No guessing, no fuzzy matching.
"""
import json

SYSTEM = (
    "You are a decision component in a benchmark. You are given a STATE and a QUESTION. "
    "Answer with a single JSON object and nothing else: no explanation, no markdown, no code fences."
)


def _options(crit):
    if isinstance(crit, dict):
        return list(crit.items())
    return [(str(c), str(c)) for c in crit]


def build(state, question):
    """Return the user message for (state, question)."""
    kind, q = question["type"], question["instructions"]
    head = f"STATE:\n{state}\n\nQUESTION: {q}\n\n"
    if kind == "choice":
        opts = "\n".join(f"- {k}: {v}" for k, v in _options(question["criteria"]))
        return (head + f"OPTIONS (id: meaning):\n{opts}\n\n"
                'Reply with JSON of the form {"answer": "<option id>"} where the value is exactly one option id from the list.')
    if kind == "noul":
        return head + 'Reply with JSON of the form {"answer": "yes"} or {"answer": "no"}.'
    if kind == "score":
        lv = "\n".join(f"- {i}: {name}" for i, name in enumerate(question["criteria"]))
        return (head + f"LEVELS (index: meaning), ordered from lowest to highest:\n{lv}\n\n"
                'Reply with JSON of the form {"answer": <level index as an integer>}.')
    raise ValueError(f"unknown question type {kind}")


def parse(text, question):
    """Strictly parse model text. Returns an adapter result dict, or {"invalid": True, "raw": ...}."""
    bad = {"invalid": True, "raw": (text or "")[:200]}
    try:
        obj = json.loads(text)
    except (TypeError, ValueError):
        return bad
    if not isinstance(obj, dict) or "answer" not in obj:
        return bad
    a, kind = obj["answer"], question["type"]
    if kind == "choice":
        keys = [k for k, _ in _options(question["criteria"])]
        if isinstance(a, str) and a in keys:
            return {"choice": a, "probs": {a: 1.0}}  # LLM: no calibrated probability
    elif kind == "noul":
        if a in ("yes", "no") and isinstance(a, str):
            return {"noul": 1.0 if a == "yes" else 0.0}
    elif kind == "score":
        n = len(question["criteria"])
        if isinstance(a, int) and not isinstance(a, bool) and 0 <= a < n:
            return {"score_probs": {a: 1.0}}
    return bad

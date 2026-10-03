"""OpenDecider-nano adapter (opendecider==0.2.1, HF manjunathshiva/opendecider-nano @ beeeb640).

All three System One types are native to OpenDecider (model.system_one), so no remapping:
  choice -> criteria dict as-is; score -> levels become options "0".."n-1"; noul -> options yes/no, p(yes).
Runs on CPU, fp32 (the evaluated default), offline from a locally downloaded, hash-verified copy.
"""
import os

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "opendecider", "repo")
NAME = "OpenDecider-nano"


def load():
    from opendecider import load as od_load
    return od_load(MODEL_DIR, device="cpu", dtype="float32")


def predict(model, state, question):
    a = model.system_one(state, {"q": question})["answers"]["q"]
    if question["type"] == "choice":
        return {"choice": a["choice"], "probs": a["probabilities"]}
    if question["type"] == "noul":
        return {"noul": a["noul"]}
    return {"score_probs": a["probabilities"]}

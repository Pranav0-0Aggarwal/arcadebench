import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
KAI = os.path.join(HERE, "..", "kai")
sys.path.insert(0, KAI)
NAME = "Decision-2.0-Kai-0.6B"


def load():
    from decision2.api import Decision2
    return Decision2.from_pretrained(KAI, device="cpu")


def predict(model, state, question):
    a = model.system_one(state=state, questions={"q": question})["answers"]["q"]
    if "error" in a:
        raise ValueError(a["error"])
    if question["type"] == "choice":
        return {"choice": a["choice"], "probs": a["probabilities"]}
    if question["type"] == "noul":
        return {"noul": a["noul"]}
    return {"score_probs": a["probabilities"]}

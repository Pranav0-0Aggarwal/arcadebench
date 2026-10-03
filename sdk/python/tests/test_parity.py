import json
from pathlib import Path

import pytest

from arcadebench.prompt import build_prompt, parse_action, to_system_one

VECTORS = json.loads((Path(__file__).parent / "vectors.json").read_text())


@pytest.mark.parametrize("case", VECTORS["prompts"])
def test_prompt(case):
    assert build_prompt(case["game"], case["obs"], case["history"]) == (case["system"], case["user"])


@pytest.mark.parametrize("case", VECTORS["prompts"])
def test_system_one(case):
    state, question = to_system_one(case["game"], case["obs"])
    assert [state, question] == [case["systemOne"]["state"], case["systemOne"]["question"]]


@pytest.mark.parametrize("case", VECTORS["parse"])
def test_parse(case):
    assert parse_action(case["text"], case["legal"]) == case["expected"]

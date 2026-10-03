import pytest

from fake import Fake


@pytest.fixture
def make_fake():
    made = []

    def make(**kw):
        made.append(Fake(**kw))
        return made[-1]

    yield make
    for f in made:
        f.close()


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    slept = []
    monkeypatch.setattr("arcadebench.http.sleep", slept.append)
    return slept

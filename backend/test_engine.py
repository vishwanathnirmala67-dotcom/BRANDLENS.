from fastapi.testclient import TestClient

import engine
from main import app

client = TestClient(app)


def base(**kw):
    p = {"content": "x", "avoid_words": "", "approved_words": "", "claims": "", "palette": "", "voice": {}}
    p.update(kw)
    return p


def test_avoid_word_with_replacement():
    r = engine.review(base(content="Our cheap plan is here.", avoid_words="cheap => affordable"))
    f = r["findings"][0]
    assert f["type"] == "Restricted word" and "affordable" in f["suggestion"]
    assert r["passed"] is False and r["score"] == 80


def test_clean_content_passes():
    r = engine.review(base(content="Welcome to our new plan.", approved_words="plan"))
    assert r["passed"] is True and r["score"] == 100


def test_unverified_vs_verified_claim():
    bad = engine.review(base(content="We grew sales by 40% last year."))
    assert bad["findings"][0]["type"] == "Unverified claim"
    ok = engine.review(base(content="We grew sales by 40% last year.", claims="Sales grew by 40% last year | report.pdf"))
    assert not ok["findings"]


def test_superlative_flagged():
    r = engine.review(base(content="This is the best tool."))
    assert r["findings"][0]["type"] == "Unsubstantiated superlative"


def test_off_palette_colour():
    r = engine.review(base(content="Use colour #ff0000 for the button.", palette="#4f46e5, #fff"))
    assert r["findings"][0]["type"] == "Off-brand colour"
    ok = engine.review(base(content="Use #4F46E5 here.", palette="#4f46e5"))
    assert not ok["findings"]


def test_tone_professional():
    r = engine.review(base(content="OMG we are gonna launch!!! lol", voice={"tone": "Professional"}))
    assert any(f["type"] == "Tone" for f in r["findings"])


def test_hindi_word_boundary():
    r = engine.review(base(content="यह सस्ता प्लान है", avoid_words="सस्ता"))
    assert r["findings"][0]["type"] == "Restricted word"


def test_api_endpoints():
    assert client.get("/api/health").json()["status"] == "online"
    r = client.post("/api/reviews", json={"content": "cheap stuff", "avoid_words": ["cheap"]})
    assert r.status_code == 200 and r.json()["passed"] is False
    assert client.post("/api/reviews", json={"content": ""}).status_code == 422
    assert client.post("/api/reviews", json={"content": "a" * 10001}).status_code == 422

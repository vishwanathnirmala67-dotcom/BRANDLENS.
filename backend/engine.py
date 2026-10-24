"""BrandLens review engine.

Checks a draft against a brand kit:
  1. Restricted words (with optional replacement:  "cheap => affordable")
  2. Approved terminology (soft suggestions)
  3. Claims / facts (numbers, percentages, superlatives must match an approved claim)
  4. Assets (hex colours must be in the brand palette)
  5. Tone (rule-based; upgraded by Claude when ANTHROPIC_API_KEY is set)
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

SEVERITY_PENALTY = {"high": 20, "medium": 10, "low": 3}

SUPERLATIVES = [
    "best", "number one", "#1", "no.1", "fastest", "cheapest", "only", "guaranteed",
    "guarantee", "100%", "proven", "revolutionary", "world-class", "unbeatable", "perfect",
    "risk-free", "miracle", "clinically proven",
]
SLANG = ["gonna", "wanna", "lol", "omg", "gotcha", "dude", "btw", "ya'll", "kinda", "sorta"]
HEDGES = ["maybe", "perhaps", "might", "i think", "we hope", "sort of", "kind of", "probably", "hopefully"]
COLD = ["hereby", "pursuant", "aforementioned", "whereas", "notwithstanding"]

EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
NUMBER_CLAIM_RE = re.compile(r"\d[\d,.]*\s?(?:%|percent|x\b|times\b|million|billion|k\b)|\b\d{2,}\b")
STOPWORDS = set("a an the and or of to in on for with is are was were be our your we you it its this that at by from as".split())


def _word_re(word: str) -> re.Pattern:
    # Unicode-aware "whole word" match (works for Hindi etc. where \b fails)
    return re.compile(r"(?<![\w])" + re.escape(word) + r"(?![\w])", re.IGNORECASE | re.UNICODE)


def parse_list(raw: str | list[str] | None) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        items = raw
    else:
        items = re.split(r"[,\n]", raw)
    return [i.strip() for i in items if i and i.strip()]


def parse_avoid(raw: str | list[str] | None) -> list[tuple[str, str | None]]:
    out = []
    for item in parse_list(raw):
        if "=>" in item:
            word, repl = [p.strip() for p in item.split("=>", 1)]
            out.append((word, repl or None))
        else:
            out.append((item, None))
    return out


def parse_claims(raw: str | list[str] | None) -> list[dict]:
    claims = []
    lines = raw if isinstance(raw, list) else (raw or "").split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        text, _, source = line.partition("|")
        claims.append({"text": text.strip(), "source": source.strip() or None})
    return claims


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[\w%#.]+", text.lower()) if t not in STOPWORDS}


def _matching_claim(sentence: str, claims: list[dict]) -> dict | None:
    s_tokens = _tokens(sentence)
    for claim in claims:
        c_tokens = _tokens(claim["text"])
        if c_tokens and len(c_tokens & s_tokens) / len(c_tokens) >= 0.6:
            return claim
    return None


def _sentences(content: str) -> list[str]:
    parts = re.split(r"(?<=[.!?।])\s+|\n+", content)
    return [p.strip() for p in parts if p.strip()]


def _finding(ftype: str, severity: str, match: str, reason: str, suggestion: str | None = None) -> dict:
    return {
        "type": ftype,
        "severity": severity,
        "match": match,
        "reason": reason,
        "suggestion": suggestion,
    }


def check_words(content: str, avoid, approved) -> list[dict]:
    findings = []
    for word, repl in avoid:
        m = _word_re(word).search(content)
        if m:
            count = len(_word_re(word).findall(content))
            findings.append(_finding(
                "Restricted word", "high", m.group(0),
                f'"{word}" is on the Brand Kit avoid list (used {count}x).',
                f'Replace with "{repl}".' if repl else "Remove or rephrase this word.",
            ))
    for word in approved:
        if not _word_re(word).search(content):
            findings.append(_finding(
                "Approved term", "low", word,
                f'Approved term "{word}" is not used in this draft.',
                f'Consider using "{word}" where it fits.',
            ))
    return findings


def check_claims(content: str, claims: list[dict]) -> list[dict]:
    findings = []
    for sentence in _sentences(content):
        lowered = sentence.lower()
        has_number = bool(NUMBER_CLAIM_RE.search(sentence))
        sup = next((w for w in SUPERLATIVES if re.search(r"(?<![\w])" + re.escape(w) + r"(?![\w])", lowered)), None)
        if not has_number and not sup:
            continue
        match = _matching_claim(sentence, claims)
        if match:
            continue  # verified against an approved claim
        if has_number:
            findings.append(_finding(
                "Unverified claim", "high", sentence,
                "This sentence contains a statistic/number that is not in the approved claims list.",
                "Add the fact with its source to the Brand Kit, or remove the figure.",
            ))
        else:
            findings.append(_finding(
                "Unsubstantiated superlative", "medium", sup,
                f'"{sup}" is an absolute claim with no approved supporting source.',
                "Use a measurable, sourced statement instead.",
            ))
    return findings


def check_assets(content: str, palette: list[str]) -> list[dict]:
    if not palette:
        return []
    allowed = {_norm_hex(p) for p in palette}
    findings, seen = [], set()
    for code in HEX_RE.findall(content):
        n = _norm_hex(code)
        if n not in allowed and n not in seen:
            seen.add(n)
            findings.append(_finding(
                "Off-brand colour", "medium", code,
                f"{code} is not in the brand palette ({', '.join(palette)}).",
                "Use one of the approved brand colours.",
            ))
    return findings


def _norm_hex(code: str) -> str:
    code = code.strip().lower().lstrip("#")
    if len(code) == 3:
        code = "".join(c * 2 for c in code)
    return code


def check_tone_rules(content: str, tone: str) -> list[dict]:
    findings = []
    lowered = content.lower()
    if tone == "Professional":
        if content.count("!") > 2:
            findings.append(_finding("Tone", "medium", "!", "Too many exclamation marks for a Professional tone.", "Use at most one."))
        if EMOJI_RE.search(content):
            findings.append(_finding("Tone", "low", EMOJI_RE.search(content).group(0), "Emoji reduce a Professional tone.", "Remove emoji."))
        for w in SLANG:
            if re.search(r"(?<![\w])" + re.escape(w) + r"(?![\w])", lowered):
                findings.append(_finding("Tone", "medium", w, f'"{w}" is too casual for a Professional tone.', "Use formal wording."))
    elif tone == "Confident":
        for w in HEDGES:
            if w in lowered:
                findings.append(_finding("Tone", "medium", w, f'"{w}" sounds uncertain for a Confident tone.', "State it directly."))
    elif tone in ("Friendly", "Empathetic"):
        for w in COLD:
            if w in lowered:
                findings.append(_finding("Tone", "medium", w, f'"{w}" is cold/legalistic for a {tone} tone.', "Use warmer, plain language."))
    return findings


def check_tone_ai(content: str, voice: dict) -> list[dict] | None:
    """Optional Claude-based tone review. Returns None when unavailable."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key or not voice.get("tone"):
        return None
    try:
        import httpx

        prompt = (
            "You are a brand-governance reviewer. Brand voice:\n"
            f"- Tone: {voice.get('tone')}\n- Audience: {voice.get('audience') or 'n/a'}\n"
            f"- Guidelines: {voice.get('style') or 'n/a'}\n\n"
            "Review the DRAFT for tone/voice mismatches only. Reply with JSON only: "
            '{"issues":[{"match":"exact short quote from draft","reason":"why","suggestion":"rewrite"}]} '
            "Max 3 issues; empty list if on-brand.\n\nDRAFT:\n" + content[:4000]
        )
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5"),
                "max_tokens": 500,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=15,
        )
        r.raise_for_status()
        text = r.json()["content"][0]["text"]
        data = json.loads(text[text.index("{"): text.rindex("}") + 1])
        return [
            _finding("Tone (AI)", "medium", i.get("match", ""), i.get("reason", ""), i.get("suggestion"))
            for i in data.get("issues", [])[:3]
        ]
    except Exception:
        return None


def compute_score(findings: list[dict]) -> int:
    return max(0, 100 - sum(SEVERITY_PENALTY.get(f["severity"], 0) for f in findings))


def review(payload: dict[str, Any]) -> dict:
    content = payload["content"]
    voice = payload.get("voice") or {}
    avoid = parse_avoid(payload.get("avoid_words"))
    approved = parse_list(payload.get("approved_words"))
    claims = parse_claims(payload.get("claims"))
    palette = parse_list(payload.get("palette"))

    findings = check_words(content, avoid, approved)
    findings += check_claims(content, claims)
    findings += check_assets(content, palette)

    ai = check_tone_ai(content, voice)
    findings += ai if ai is not None else check_tone_rules(content, voice.get("tone", ""))

    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: order[f["severity"]])
    score = compute_score(findings)
    blocking = any(f["severity"] in ("high", "medium") for f in findings)
    return {
        "findings": findings,
        "score": score,
        "passed": not blocking,
        "engine": "rules+claude" if ai is not None else "rules",
        "summary": {s: sum(1 for f in findings if f["severity"] == s) for s in ("high", "medium", "low")},
    }

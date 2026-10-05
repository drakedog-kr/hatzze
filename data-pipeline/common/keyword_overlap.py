"""이슈 키워드 열 줄에서 같은 화제를 두 번 세우지 않는다.

2026-10-04 국장 열 칸 중 셋이 같은 이야기였다 — 4위 '데이터센터'(58회) · 5위 'AI데이터센터'(54회) · 10위 'AI'(44회).
한 낱말이 다른 낱말을 품으면(대소문자 · 띄어쓰기 무시) 위에 선 쪽(언급이 많은 쪽) 하나만 남기고, 혼자서는 무엇의
이야기인지 말하지 못하는 넓은 낱말(BROAD)은 뺀다. 국장 · 미장 파이프라인과 화면 폴백(lib/telegram-data.ts
computeIssueKeywords)이 같은 규칙이다.
"""

from __future__ import annotations

# 거의 모든 글에 붙는 말 — 열 칸 하나를 쓰기엔 정보가 없다. lib/telegram-data.ts KEYWORD_BROAD 와 같은 목록.
BROAD = {"ai"}


def _norm(w: str) -> str:
    return "".join(w.split()).lower()


def drop_overlaps(words: list[str]) -> list[str]:
    """차례(위가 먼저)를 지키며 넓은 낱말과, 이미 남긴 낱말을 품거나 거기 품기는 낱말을 뺀다."""
    kept: list[str] = []
    seen: list[str] = []
    for w in words:
        n = _norm(w)
        if not n or n in BROAD:
            continue
        if any(n in k or k in n for k in seen):
            continue
        kept.append(w)
        seen.append(n)
    return kept

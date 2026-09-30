"""테마 톤에 글 하나를 어느 테마로 넣을지 — 국장·미장 톤 집계가 같이 쓴다.

  scripts/calculate_telegram_sentiment.py     (telegram_sentiment_daily 의 테마 행)
  scripts/calculate_us_telegram_sentiment.py  (telegram_us_sentiment_daily 의 테마 행)

## 여러 테마를 한꺼번에 건드린 글은 테마 톤에서 뺀다(2026-09-30)

톤은 글 하나에 하나라서, 그 글이 말한 종목들이 속한 테마 **전부**에 같은 톤이 들어간다. 한 글이
엔비디아와 마이크론을 같이 말하면 AI반도체·메모리 둘 다 그 톤을 겪은 것이 맞다. 그런데 "오늘의
특징주", "외국인 순매수 상위", "상한가 종목" 같은 나열 글은 스무 종목을 늘어놓고 톤은 "오늘 장이
좋았다" 하나다. 그 톤이 반도체·조선·바이오·방산에 똑같이 들어가면 테마마다 따로 움직여야 할
막대가 한 글에 같이 흔들린다.

그래서 테마를 THEME_TONE_MAX_THEMES 개 넘게 건드린 글은 **테마 톤에서만** 뺀다.
  - 한 테마 안에서 여러 종목을 말한 글(반도체 다섯 종목)은 그대로 센다 — 그 테마 이야기다.
  - 전체(overall) 톤·화제어·종목 언급 수는 그대로다. 여기서 걷는 건 테마 막대의 비율뿐이다.
"""

from __future__ import annotations

from collections import Counter

from common.js_round import js_round

# 이 수까지는 그 테마들의 이야기로 본다. 넘으면 나열 글이다. ⚠️ **실측 전 값이다.** 대형주 두셋을 같이
# 말하는 글은 남기고 특징주 나열만 걸리도록 셋으로 잡았다. 톤 집계가 실행마다 테마별로 뺀 비중과
# 낙관도 변화를 찍으니(list_effect_lines), 그걸 보고 조정한다.
THEME_TONE_MAX_THEMES = 3

OVERALL = "overall"  # 톤 표의 전체 줄 scope — 두 톤 집계의 OVERALL 과 같다
SENTIMENT_PRIOR = 5  # 낙관도 평활 — generate_telegram_narratives.optimism · lib/telegram-data optimismPct 와 같다


def theme_tone_targets(themes: set[str]) -> set[str]:
    """이 글의 톤을 넣을 테마. 테마를 THEME_TONE_MAX_THEMES 개 넘게 건드린 나열 글이면 빈 집합."""
    return set() if len(themes) > THEME_TONE_MAX_THEMES else set(themes)


def _optimism(pos: int, neg: int) -> int | None:
    if pos + neg == 0:
        return None
    return js_round((pos + SENTIMENT_PRIOR) / (pos + neg + 2 * SENTIMENT_PRIOR) * 100)


def list_effect_lines(
    kept: dict[tuple[str, str], Counter],
    dropped: dict[tuple[str, str], Counter],
    days: list[str],
    top_n: int = 4,
) -> list[str]:
    """실행 로그(--dry-run 포함) — 최근 days 합계로 테마별 '나열 글을 넣었을 때 → 뺀 뒤' 낙관도.

    바꾸기 전과 뒤를 같은 실행에서 견준다. 테마는 넣었을 때의 언급 수 순(예전 막대와 같은 줄 세우기).
    """
    before: dict[str, Counter] = {}
    after: dict[str, Counter] = {}
    for src, out in ((kept, after), (dropped, before)):
        for (d, scope), c in src.items():
            # 톤 표에는 전체('overall') 줄도 같이 있다. 나열 글 빼기는 테마에만 걸리므로 여기서도 테마만 본다.
            if d in days and scope != OVERALL:
                out.setdefault(scope, Counter()).update(c)
    for scope, c in after.items():
        before.setdefault(scope, Counter()).update(c)

    lines = []
    for scope, b in sorted(before.items(), key=lambda kv: -sum(kv[1].values()))[:top_n]:
        a = after.get(scope, Counter())
        n_before, n_after = sum(b.values()), sum(a.values())
        o_before = _optimism(b["positive"], b["negative"])
        o_after = _optimism(a["positive"], a["negative"])
        share = (n_before - n_after) * 100 // max(1, n_before)
        lines.append(
            f"    {scope}: {n_before:,}건 중 나열 글 {n_before - n_after:,}건({share}%) 뺌 · "
            f"낙관도 {o_before if o_before is not None else '-'} → {o_after if o_after is not None else '-'}"
        )
    return lines

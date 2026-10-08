"""채널이 짚은 일정에서 '다른 날에 더 많이 적힌 같은 이야기'와 '이미 지난 이야기'를 걷는다.

**lib/event-group.ts 의 eventKind · ONE_SHOT · NEAR_DAYS 와 ③ · dropAlreadyHappened · dropOutrankedByPast 를 옮긴 것이다.**
Python 과 TS 라 import 로 공유할 수 없어 손으로 맞춘 사본이고, 종류 낱말 · 문턱을 바꾸면 양쪽을 같이 고친다
(tests/test_event_group.py 가 lib 쪽 원본을 읽어 같은지 본다). 텔레그램 📌 일정 블록(broadcast_digest.load_events)과
카더라 화면 '다가오는 일정'이 같은 날을 말해야 한다.

왜: 삼성전자 '3분기 잠정실적 발표'를 34곳이 10/8, 5곳이 10/9 로 적었다(10/8 아침 발표 · 10/9 한글날 휴장). 발송은
'내일' 하루치만 읽어 34곳 줄을 못 보고, 10/8 저녁 '내일 일정'에 5곳 줄을 실었다(2026-10-08 발송).
"""

from __future__ import annotations

import re
from datetime import date, timedelta

# 채널마다 표기가 갈리는 흔한 종류는 그 낱말 하나로 묶는다. 차례가 뜻이 있다(매출이 실적보다, 상장이 증자보다 먼저).
# 글자를 걷고 소문자로 바꾼 뒤 견주므로 대소문자 구분은 없다.
KINDS: list[tuple[str, str]] = [
    ("매출", "매출"),
    ("실적", "실적|어닝|earnings"),
    ("배당", "배당"),
    ("자사주", "자사주|자기주식"),
    ("지분", "지분|주식거래|블록딜"),
    ("주총", "주총|주주총회"),
    ("상장", "상장"),
    ("승인", "승인|허가"),
    ("출시", "출시|발매|판매개시"),
    ("공개", "공개|발표회|언팩|이벤트|keynote"),
    ("인수", "인수|합병|m&a"),
    ("발행가", "발행가"),
    ("납입", "납입"),
    ("청약", "청약|공모"),
    ("증자", "증자|신주"),
]
_KIND_RES = [(name, re.compile(pat, re.I)) for name, pat in KINDS]
_STRIP = re.compile(r"[\s·,.()'\"‘’“”\-–]")

# 가까운 날에 두 번 있을 수 없는 종류. 배당 · 증자처럼 날마다 다른 절차가 이어지는 종류는 안 넣는다.
ONE_SHOT = frozenset({"실적", "매출", "주총", "공개", "출시", "인수"})
# 이 안팎(±일)의 같은 이야기는 한 일정으로 본다 — 하루 이틀 어긋나게 적힌 같은 발표.
NEAR_DAYS = 3
# 이미 지나간 같은 이야기를 볼 날 수(lib/kadera-why.ts · kadera-us-why.ts 의 PAST_DAYS).
PAST_DAYS = 14


def event_kind(text: str) -> str:
    """같은 이야기인가를 가르는 열쇠. 종류 낱말이 있으면 그 낱말, 없으면 공백 · 구두점을 걷은 글 그대로."""
    t = _STRIP.sub("", text).lower()
    for name, rx in _KIND_RES:
        if rx.search(t):
            return name
    return t


def settle_rows(rows: list[dict], key: str, lo: date, hi: date) -> list[dict]:
    """[lo, hi] 안의 day 일정 행 가운데 살아남는 것만 돌려준다.

    rows 는 lo - PAST_DAYS ~ hi + NEAR_DAYS 로 넓게 읽은 행(channel_handle · key · event_date · event · posted_at).
    (종목, 종류, 날짜)로 묶어 채널을 센 뒤 두 가지를 뺀다.
      ① 한 번뿐인 일이 가까운 날(±NEAR_DAYS) 여러 줄이면 채널이 가장 많은 줄 하나만 남긴다(같으면 먼저 짚인 줄,
         그것도 같으면 이른 날). 창 밖 날짜와도 견주므로 오늘 · 어제 34곳 줄이 내일 5곳 줄을 이긴다.
      ② 지난 PAST_DAYS 일 안에 채널 둘 이상이 짚은 같은 이야기가 있으면 한 번뿐인 일의 한 채널 줄은 뺀다.
    """
    groups: dict[tuple[str, str, str], dict] = {}
    for r in rows:
        k = (r[key], event_kind(r["event"] or ""), r["event_date"])
        posted = r.get("posted_at") or ""
        g = groups.setdefault(k, {"channels": set(), "first": posted})
        g["channels"].add(r["channel_handle"])
        if posted < g["first"]:
            g["first"] = posted

    alive = set(groups)
    shots = sorted((k for k in groups if k[1] in ONE_SHOT), key=lambda k: (-len(groups[k]["channels"]), groups[k]["first"], k[2]))
    for k in shots:
        if k not in alive:
            continue
        d = date.fromisoformat(k[2])
        for o in shots:
            if o != k and o in alive and o[:2] == k[:2] and abs((date.fromisoformat(o[2]) - d).days) <= NEAR_DAYS:
                alive.discard(o)

    lo_s, hi_s = lo.isoformat(), hi.isoformat()
    past_from = (lo - timedelta(days=PAST_DAYS)).isoformat()
    done = {k[:2] for k, g in groups.items() if past_from <= k[2] < lo_s and len(g["channels"]) >= 2}
    keep = {
        k for k in alive
        if lo_s <= k[2] <= hi_s
        and not (k[1] in ONE_SHOT and len(groups[k]["channels"]) < 2 and k[:2] in done)
    }
    return [r for r in rows if (r[key], event_kind(r["event"] or ""), r["event_date"]) in keep]

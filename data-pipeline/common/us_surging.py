"""미장 급부상 종목 — '최근 활동이 평소 대비 얼마나 튀었나'.

**lib/us-telegram-data.ts 의 getUsSurgingStocks 를 옮긴 것이다.** Python 과 TS 라 import
로 공유할 수 없어 손으로 맞춘 사본이고, 저쪽을 고치면 여기도 고쳐야 한다.
국내 짝은 `common/surging.py` — 그 파일 머리 주석의 사정이 여기도 그대로다.

⚠️ **사본을 왜 또 늘리나.** 급부상 한 줄 요약(scripts/generate_surging_oneliners.py)이
카드에 뜨는 **바로 그 여섯 종목**의 문장을 만들어야 하기 때문이다. 언급 상위 N개 같은
근사치로 대신하면 카드가 조용히 빈다 — 국내에서 실제로 그 사고가 났다(2026-07-26 급부상
3개 중 NHN 하나가 상위 6개 밖이었다, generate_telegram_narratives 주석).
값이 아니라 **목록이 같아야** 하는 자리라 근사치가 안 통한다.

⚠️ 여기서 돌려주는 건 **티커 목록뿐**이다. 시세·채널 수는 화면이 따로 받으므로
(usQuotes · usStockBreadth) 옮기지 않았다 — 옮기면 사본이 그만큼 더 두꺼워진다.

계산 규칙(저쪽 주석 요약):
  - 최근 14일 telegram_us_stock_daily 에서 **마지막 날은 뺀다**(하루가 덜 차 추이를 왜곡).
  - 절대량이 아니라 그날 전체 대비 **점유율**로 비교한다.
  - 최근 3일 일평균 점유율 ÷ 그 이전 일평균 점유율. 분자·분모에 SHARE_SMOOTHING 을
    함께 더해, 분모가 거의 0인 종목이 터무니없는 배수를 받지 않게 한다.
  - 표본이 얇은 것은 뺀다(최근 언급 3회 미만) · 배수가 1 이하면 뺀다.
  - 정렬은 배수 내림차순.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .supabase_client import load_all_keyset

# ⚠️ 저쪽 상수와 같은 값이어야 한다(lib/us-telegram-data.ts).
LOOKBACK_DAYS = 14
RECENT_MAX = 3           # US_WINDOW_DAYS
SHARE_SMOOTHING = 0.0006  # ⚠️ 국내(common/surging.py)는 0.002 다. 베끼다 틀렸던 자리
MIN_RECENT_MENTIONS = 3
CARD_LIMIT = 6           # 화면이 getUsSurgingStocks(6) 으로 부른다


def load_us_stock_daily(db) -> tuple[list[dict], list[str]]:
    """최근 LOOKBACK_DAYS 일의 telegram_us_stock_daily 와 날짜 목록(오름차순).

    창의 시작을 UTC 로 잡는 것은 프론트를 그대로 따른 것이다(common/surging.py 와 같은 이유).
    ⚠️ 종목 × 날짜라 14일치가 1,000행을 쉽게 넘는다. 페이징하지 않으면 PostgREST 가
    **에러 없이** 잘라서 최신 날짜가 통째로 빠진 채 '평소 대비'가 계산된다.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).date().isoformat()
    rows = [
        r
        for r in load_all_keyset(
            db, "telegram_us_stock_daily", "id,date,ticker,mention_count,weighted_score"
        )
        if r["date"] >= since
    ]
    dates = sorted({r["date"] for r in rows})
    return rows, dates


def top_us_surging(
    db, limit: int = CARD_LIMIT, preloaded: tuple[list[dict], list[str]] | None = None
) -> list[str]:
    """급부상 티커를 화면과 **같은 순서로** 돌려준다.

    limit 을 CARD_LIMIT 보다 작게 줘도 먼저 정원까지 세운 뒤 자른다 — 국내와 같은 규칙이다
    (순위 계산에 들어가는 후보 집합이 달라지면 순서가 화면과 갈린다).
    """
    rows, dates = preloaded if preloaded is not None else load_us_stock_daily(db)
    if not rows:
        return []

    # 마지막 날은 아직 안 끝난 날이라 뺀다.
    recent_n = min(RECENT_MAX, max(1, len(dates) - 1))
    recent = set(dates[-recent_n:])
    prior_count = max(len(dates) - recent_n, 1)

    day_total: dict[str, float] = {}
    for r in rows:
        day_total[r["date"]] = day_total.get(r["date"], 0.0) + float(r["weighted_score"] or 0)

    agg: dict[str, dict] = {}
    for r in rows:
        a = agg.setdefault(r["ticker"], {"recent": 0.0, "prior": 0.0, "m": 0})
        total = day_total.get(r["date"], 0.0)
        share = (float(r["weighted_score"] or 0) / total) if total > 0 else 0.0
        if r["date"] in recent:
            a["recent"] += share
            a["m"] += r["mention_count"] or 0
        else:
            a["prior"] += share

    scored = []
    for ticker, a in agg.items():
        if a["m"] < MIN_RECENT_MENTIONS:
            continue
        mult = (a["recent"] / recent_n + SHARE_SMOOTHING) / (a["prior"] / prior_count + SHARE_SMOOTHING)
        if mult <= 1:
            continue
        scored.append((ticker, mult))

    scored.sort(key=lambda x: -x[1])
    return [t for t, _ in scored[:CARD_LIMIT][:limit]]

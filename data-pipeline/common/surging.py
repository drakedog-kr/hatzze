"""급부상 종목 — '최근 활동이 평소 대비 얼마나 튀었나'.

**lib/telegram-data.ts 의 getSurgingStocks 를 옮긴 것이다.** Python 과 TS 라 import 로
공유할 수 없어 손으로 맞춘 사본이고, 저쪽을 고치면 여기도 고쳐야 한다.

여기 모아 둔 이유는 사본을 **둘로 묶어 두기 위해서**다. 쓰는 곳이 둘인데
(scripts/send_telegram_broadcast.py 가 채널에 실을 종목을 고를 때,
scripts/generate_telegram_narratives.py 가 그 종목의 요약을 미리 만들어 둘 때)
각자 계산하면 사본이 셋이 되고, 그러면 **채널이 소개한 종목에 요약이 없는** 일이
조용히 생긴다. 둘이 같은 함수를 부르면 그 어긋남 자체가 불가능해진다.

계산 규칙(저쪽 주석 요약):
  - 최근 14일 telegram_stock_daily 에서 **오늘은 뺀다**(하루가 덜 차 추이를 왜곡한다).
    단 저녁 실행 뒤에는 오늘을 넣는다 — 창의 끝날은 window_end_for 가 정한다.
  - 절대량이 아니라 그날 전체 대비 **점유율**로 비교한다. 주말엔 전체 언급이 평일의
    1/10~1/20 이라 절대량으로 보면 모든 종목이 '감소'로 나온다.
  - 최근 3일 일평균 점유율 ÷ 그 이전 일평균 점유율. 분모가 거의 0인 종목이 터무니없는
    배수를 받지 않도록 분자·분모에 SHARE_SMOOTHING 을 함께 더한다.
  - 정렬은 배수 → 언급수 → 종목코드(완전 동점에서 DB 행 순서에 딸리지 않게), 그 뒤
    신뢰도 tier 로 안정 정렬한다.
  - 채널 수는 창 안의 **서로 다른 채널 수**다(common/channel_breadth.py). 정원을
    확정한 뒤 그 몇 건만 센다.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from .channel_breadth import channel_breadth_map
from .supabase_client import execute_with_retry
from .timeutil import KST, today_kst

LOOKBACK_DAYS = 14   # getSurgingStocks 의 loadStockDaily(14)
RECENT_MAX = 3       # recentN = min(3, …)
SHARE_SMOOTHING = 0.002  # 언급 1회가 그날 대화에서 차지하는 몫(실측 중앙값 0.0018)
CARD_LIMIT = 5       # 사이트 카드 정원. 자르기 전에 여기까지 세워야 순서가 카드와 같다

# 그날 글이 이 시각(KST)을 넘겨서까지 모였으면 급부상 창에 그날을 넣는다. 저녁 실행(17:30 발사)의
# 수집이 17시 40~50분 글까지 받아 온다(2026-09-24 실측 17:48). 아침 실행은 06시대 글까지라 안 넘는다.
EVENING_CUTOFF_HOUR = 17


def window_end_for(db, base_date: str) -> str:
    """급부상 창의 끝날 — 기준일(base_date) 또는 그 전날.

    기준일 글이 EVENING_CUTOFF_HOUR 를 넘겨서까지 모였으면 기준일을 넣고, 아니면 예전처럼
    뺀다. 그러면 창은 **저녁 실행 때 하루 넘어가고**, 다음 날 아침 실행은 같은 창에 밤사이 글만
    채운다(아침엔 새 날짜에 몇 시간치뿐이라 뺀다).

    왜 넣나: 기준일을 늘 빼면 저녁 화면이 하루 전 목록이다. 2026-09-24 HLB 가 미국 허가를 받은
    날 저녁 카드에 없었다(그날을 넣으면 21.5배로 1위). 09-04~09-23 을 되돌려 재 보니 저녁 카드와
    그날이 다 찬 뒤의 목록이 6개 중 평균 2.80개 겹쳤고, 그날 17:45 까지 글을 넣으면 5.35개였다.
    1위는 20일 중 6일 → 16일.

    판정은 **가장 늦게 올라온 글의 시각**으로 한다(telegram_messages.posted_at 인덱스를 탄다).
    저녁 실행이 실패하면 기준일 글이 아침치뿐이라 저절로 예전 규칙으로 돌아간다.

    ⚠️ 결과는 [기준일 전날, 기준일] 로 묶는다. 수집은 됐는데 센티먼트 집계가 며칠 밀린 날처럼
       기준일이 낡으면 판정이 그 뒤로 튈 수 있는데, 화면의 다른 카드는 기준일에 매여 있다.
    ⚠️ 화면(lib/telegram-data.ts surgingWindowEnd)은 이 값을 다시 계산하지 않고
       telegram_surging_window 에 적힌 값을 읽는다(scripts/generate_surging_oneliners.py 가 적는다).
       수집과 종목 집계 사이 40분쯤은 기준일 행이 아침치라, 화면이 따로 판정하면 그 틈에
       반쪽 하루로 순위를 내고 한 줄 요약도 없는 카드가 뜬다.
    """
    rows = execute_with_retry(
        db.table("telegram_messages").select("posted_at").order("posted_at", desc=True).limit(1)
    ).data
    return window_end_from(base_date, rows[0].get("posted_at") if rows else None)


def window_end_from(base_date: str, latest_posted_at: str | None) -> str:
    """window_end_for 의 판정만 — 가장 늦은 글의 시각(ISO, 시간대 포함)을 받는다. 글이 없으면 전날."""
    base = date.fromisoformat(base_date)
    prev = (base - timedelta(days=1)).isoformat()
    if not latest_posted_at:
        return prev
    latest = datetime.fromisoformat(latest_posted_at).astimezone(KST)
    reached = latest >= datetime.combine(base, time(EVENING_CUTOFF_HOUR), KST)
    return base_date if reached else prev


def load_stock_daily(
    db, base_date: str | None = None, end_date: str | None = None
) -> tuple[list[dict], list[str]]:
    """최근 LOOKBACK_DAYS 일의 telegram_stock_daily(오늘 제외)와 날짜 목록.

    ⚠️⚠️ **`base_date` 를 주면 화면과 같은 창**이 된다(기준일 **앞** LOOKBACK_DAYS 일).
    안 주면 예전 그대로 '벽시계 오늘 제외'다. 둘은 같지 않다 — 파이프라인이 도는
    2026-09-05 에 기준일은 09-04 인데, 벽시계 규칙은 그 09-04 를 창에 **넣는다.**
    아직 덜 찬 하루가 점유율 분모에 들어가 순위가 통째로 갈린다(2026-09-05 실측:
    벽시계 규칙 5개 중 화면과 겹치는 것이 2개뿐이었다).

    저쪽(lib/telegram-data.loadStockDaily)은 이 함정을 이미 겪고 고쳤다 — 그 주석이
    "예전엔 하한만 걸고 오늘을 코드에서 걸러 냈는데, 그 '오늘'이 벽시계라 자정마다
    창이 굴렀다"고 적어 뒀다. 이쪽 사본만 옛 규칙으로 남아 있었다.
    ⏳ 기본값을 바꾸면 텔레그램 방송이 고르는 종목도 같이 바뀐다. 그건 따로 판단할 일이라
       여기서는 **부르는 쪽이 고르게** 두었다.

    창의 시작을 UTC 기준으로 잡는 건 프론트를 그대로 따른 것이다(TS 는
    `new Date(Date.now() - n일).toISOString()`). 파이프라인이 도는 시각(KST 10시대·19시대)
    에는 UTC 날짜와 KST 날짜가 같아 실질 차이가 없지만, 같은 목록을 두 규칙으로 만들
    이유도 없다.

    종목 × 날짜라 14일치가 1,000행을 쉽게 넘는다. 페이징하지 않으면 PostgREST 가
    **에러 없이** 잘라서 최신 날짜가 통째로 빠진 채 '평소 대비'가 계산된다. 정렬 키는
    유일해야 한다(common/supabase_client.load_all 주석) — id 를 쓴다.

    `end_date` 를 주면 그날로 **끝나는** 창이다(그날 포함). 급부상 카드를 그리는 호출은
    window_end_for 가 고른 날을 넘긴다. base_date 보다 앞선다.
    """
    if end_date:
        end_d = date.fromisoformat(end_date)
        since = (end_d - timedelta(days=LOOKBACK_DAYS - 1)).isoformat()
        until = end_d.isoformat()
    elif base_date:
        end_d = date.fromisoformat(base_date) - timedelta(days=1)
        since = (end_d - timedelta(days=LOOKBACK_DAYS - 1)).isoformat()
        until = end_d.isoformat()
    else:
        since = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).date().isoformat()
        until = None
    rows: list[dict] = []
    start = 0
    PAGE = 1000
    while True:
        page = execute_with_retry(
            db.table("telegram_stock_daily")
            # channel_count 는 안 받는다 — 여러 날을 묶은 '서로 다른 채널 수'는 일별
            # 개수로 복원할 수 없어서(common/channel_breadth.py) 쓸 데가 없다.
            .select("stock_code,date,weighted_score,mention_count")
            .gte("date", since)
            .order("id")
            .range(start, start + PAGE - 1)
        ).data
        if not page:
            break
        rows += page
        start += PAGE
        if len(page) < PAGE:
            break

    cut = until if until else today_kst().isoformat()
    rows = [r for r in rows if (r["date"] <= cut if until else r["date"] < cut)]
    if until:
        rows = [r for r in rows if r["date"] >= since]
    dates = sorted({r["date"] for r in rows})
    return rows, dates


def top_surging(
    db,
    limit: int = CARD_LIMIT,
    preloaded: tuple[list[dict], list[str]] | None = None,
    cap: int | None = None,
) -> list[dict]:
    """급부상 상위 종목. 각 항목은 code·mentions·channels·ratio·is_new 를 갖는다.

    ⚠️ `cap` 은 '정원'이다(기본 CARD_LIMIT). 화면은 6장을 그리는데
    (app/kadera/page.tsx 의 getSurgingStocks(6)) 이 사본의 정원은 5라, 6번째 카드에
    대응하는 종목을 여기서는 **원리적으로 못 얻는다.** 한 줄 요약처럼 여섯 장을 다
    채워야 하는 호출은 `cap=6` 을 준다.

    종목명·요약 같은 표시용 값은 붙이지 않는다 — 호출부마다 필요한 게 달라서다.
    limit 을 CARD_LIMIT 보다 작게 줘도 **먼저 정원까지 세운 뒤 자른다.** tier 정렬이
    전체 목록 위에서 돌아야 사이트 카드와 순서가 같아진다.

    preloaded 는 호출부가 이미 load_stock_daily 를 부른 경우에 넘긴다(신선도를 먼저
    보려면 날짜가 필요해서 그렇게 된다). 안 넘기면 여기서 읽는다 — 14일치는 수천 행이라
    같은 실행에서 두 번 읽을 이유가 없다.
    """
    rows, dates = preloaded if preloaded is not None else load_stock_daily(db)
    if not rows or not dates:
        return []

    recent_n = min(RECENT_MAX, max(1, len(dates) - 1))
    recent_dates = set(dates[-recent_n:])
    prior_count = max(len(dates) - recent_n, 1)

    day_total: dict[str, float] = {}
    for r in rows:
        day_total[r["date"]] = day_total.get(r["date"], 0.0) + float(r["weighted_score"] or 0)

    agg: dict[str, dict] = {}
    for r in rows:
        a = agg.setdefault(
            r["stock_code"], {"recent_share": 0.0, "recent_m": 0, "prior_share": 0.0}
        )
        total = day_total.get(r["date"], 0.0)
        share = (float(r["weighted_score"] or 0) / total) if total > 0 else 0.0
        if r["date"] in recent_dates:
            a["recent_share"] += share
            a["recent_m"] += r["mention_count"] or 0
        else:
            a["prior_share"] += share

    scored = []
    for code, a in agg.items():
        base = a["prior_share"] / prior_count
        recent_per_day = a["recent_share"] / recent_n
        scored.append(
            {
                "code": code,
                "mentions": a["recent_m"],
                "ratio": (recent_per_day + SHARE_SMOOTHING) / (base + SHARE_SMOOTHING),
                "is_new": base == 0,
            }
        )

    scored.sort(key=lambda s: (-s["ratio"], -s["mentions"], s["code"]))

    # 신뢰도 tier — ① 언급 2회↑ + 뚜렷한 상승 ② 언급 2회↑ 완만 ③ 언급 1회(표본이 하나).
    def tier(s: dict) -> int:
        if s["mentions"] < 2:
            return 3
        return 1 if s["ratio"] >= 1.3 else 2

    top = sorted(scored, key=tier)[: (cap or CARD_LIMIT)][:limit]

    # 채널 수는 정원을 자른 **뒤에** 센다 — 순위에 쓰이지 않는 표시용이라, 카드에
    # 오르지도 못할 종목(14일치면 1,700여 개)까지 물을 이유가 없다. 창은 언급 수와
    # 같은 recent_dates 여야 한 줄에 적힌 두 값이 같은 기간을 말한다.
    recent_sorted = sorted(recent_dates)
    breadth = channel_breadth_map(db, [s["code"] for s in top], recent_sorted[0], recent_sorted[-1])
    for s in top:
        s["channels"] = breadth.get(s["code"], 0)
    return top


def latest_date(dates: list[str]) -> str | None:
    """집계의 최신 날짜. 신선도 판단에 쓴다."""
    return dates[-1] if dates else None

"""미국 종목을 언급한 메시지만 골라 날짜별 톤·화제어로 집계한다.

  telegram_us_sentiment_daily : 날짜 × scope('overall' | 미국 테마명) 별 톤 카운트
  telegram_us_keyword_daily   : 날짜 × 화제어 언급 수
  telegram_us_issue_keyword   : 이슈 키워드 카드 상위 N줄(선계산)
  telegram_us_stock_tone      : 종목 × 톤(‘비관이 앞선 종목’ 카드)

국내 짝은 `calculate_telegram_sentiment.py`. **LLM을 호출하지 않는다** — 그쪽과 같은
철학이고, 미장은 특히 그렇다. 메시지별 톤·화제어(`telegram_message_analysis`)는 **시장
중립**이라 이미 붙어 있는 것을 그대로 쓰면 된다. 실측으로 미국 언급 메시지 940건 중
932건(99%)에 분류가 있었다. 즉 이 카드의 LLM 비용은 0 원이다.

## 이 스크립트가 하는 일은 '고르기' 하나다

  telegram_message_us_stocks 에 있는 (channel_handle, message_id)  =  미국 얘기
  → 그 메시지의 분류만 세면 미장 센티먼트가 된다

## 국내 스크립트를 고쳐 쓰지 않고 따로 둔 이유

두 가지다. 하나는 표가 다르기 때문이고(migration_034 머리 주석 — 국내 표에 미장 행을
얹으면 국장 화면의 테마 목록에 시장이 끼어든다), 다른 하나는 **국장 파이프라인을 안
건드리려는 것**이다. 국내 집계는 매일 도는 검증된 경로라, 미장을 위해 분기를 넣으면
미장 실수가 국장을 데려갈 수 있다. 사전만 다르고 기계는 같다는 미장 카더라의 원칙을
여기서도 지킨다 — 규칙(정규화·별칭·제외어·창·문턱)은 전부 국내와 같은 사전을 import 한다.

⚠️ 화제어에서 종목명을 뺄 때 **국내 종목명과 미국 종목 표기를 둘 다** 빼야 한다.
   미국 얘기를 하는 메시지의 36.4%가 국내 종목을 같이 말하므로, 국내 이름만 빼면
   '엔비디아'가 화제어 1위로 올라온다(종목은 급부상 카드가 이미 담당한다).

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_us_telegram_sentiment.py --dry-run   # 계산·미리보기만
    python scripts/calculate_us_telegram_sentiment.py             # 저장
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all, load_all_keyset  # noqa: E402
from common.timeutil import KST  # noqa: E402
from config.issue_keywords import EXCLUDE, MAX_KEYWORD_LEN, MIN_KEYWORD_LEN  # noqa: E402
from config.stock_extraction import ALIASES as STOCK_ALIASES  # noqa: E402
from config.us_stock_extraction import US_NAMES  # noqa: E402
from config.us_stock_themes import US_THEMES  # noqa: E402

# 정규화·버킷 규칙은 국내 집계가 이미 정한 것을 그대로 가져다 쓴다. 여기서 다시 짜면
# 두 화면의 화제어가 같은 말을 다르게 묶는다(예: "금리 인하" vs "금리인하").
from calculate_telegram_sentiment import (  # noqa: E402
    ISSUE_KEYWORD_FLAT,
    ISSUE_KEYWORD_WINDOW_DAYS,
    OVERALL,
    bucket_of,
    norm,
)

SENTIMENT_TABLE = "telegram_us_sentiment_daily"
KEYWORD_TABLE = "telegram_us_keyword_daily"
ISSUE_KEYWORD_TABLE = "telegram_us_issue_keyword"
STOCK_TONE_TABLE = "telegram_us_stock_tone"

# ── 이슈 키워드 카드의 문턱 세 개 ──────────────────────────────────────────
# 국내는 `언급 3회 이상`만 걸고 빈도로 줄 세운다. 미장은 **쏠림**으로 세우므로
# (migration_034 주석) 작은 수가 큰 배수를 받는 함정이 그대로 있다 — 22회짜리가
# 92% 로 5.6배를 받는다. 그래서 문턱이 셋이다.
#
# 값은 실측으로 정했다. 최근 7일 상위 14개의 실제 분산은 17~43채널 · 3~8일이라
# 지금은 이 문턱이 아무도 안 자른다. 그게 맞다 — 문턱은 오늘을 고치는 장치가 아니라
# 복붙 한 건이 1위로 올라오는 날을 막는 장치다.
# 10줄인 건 데이터가 아니라 **조판**이 정한 값이다. 이 카드는 반칸이고 옆에 테마
# 로테이션이 나란히 선다 — 두 표의 **행 수가 같아야** 줄이 가로로 맞는다.
# 한때 11 이었다. 그때는 화제어 1위를 하이라이트가 먹고 목록이 2위부터라 11−1=10 줄이
# 됐기 때문인데, 높이를 px 로 맞추려던 계산이라 글이 바뀌면 다시 어긋났다. 지금은 목록이
# 1위부터라 그냥 10 이고, 남는 높이는 행들이 flex 로 나눠 갖는다(page.tsx 주석).
# ⚠️ 짝은 화면의 getUsThemeRotation(10) 이다. 한쪽만 고치면 줄이 어긋난다.
ISSUE_KEYWORD_LIMIT = 10
# 세는 창. 국장은 7일인데 미장은 **3일**이다 — 이 페이지의 다른 카드가 전부 3일이라
# (급부상·센티먼트·주요 종목) 한 화면에서 창이 둘이면 같은 종목의 숫자가 서로 안 맞는
# 것처럼 읽힌다. 증감 판정(최근 3일 vs 5일 이전)은 그대로다.
ISSUE_KEYWORD_COUNT_DAYS = 3
# 창을 7 → 3 으로 줄이면서 20 → 12. **낮춘 게 아니라 하루당으로는 올렸다**
# (20/7일 = 2.9회/일 → 12/3일 = 4.0회/일). 20 을 그대로 두면 자격을 통과하는 말이
# 7개뿐이라 옆 테마 로테이션(10줄)과 줄이 어긋난다.
# 복붙 한 건이 1위로 올라오는 것을 막는 일은 아래 두 문턱이 계속 맡는다 —
# 3일 창에서도 실측 15~44채널 · 2~3일이라 아무도 안 잘린다.
ISSUE_KEYWORD_MIN_MENTIONS = 12  # 미국 메시지에서의 최소 언급 수
ISSUE_KEYWORD_MIN_CHANNELS = 5   # 서로 다른 채널 수. 한 채널 복붙을 막는다
ISSUE_KEYWORD_MIN_DAYS = 2       # 서로 다른 날짜 수. 하루짜리 이벤트를 막는다

# ⭐ **쏠림은 줄 세우는 값이 아니라 자격이다**(2026-08-12에 바꿨다).
#
# 처음엔 쏠림 순으로 세웠다. 이유는 지금도 유효하다 — 빈도로 세우면 국장 카드를 베낀다.
# 그런데 그렇게 세운 표는 **막대를 그릴 수가 없다.** 순위를 정한 값(쏠림)과 줄의 크기
# (언급 수)가 따로 놀아서, 1위 22회 옆에 5위 59회가 서는 표가 된다. 국장 카드처럼
# 언급량 막대를 깔면 막대가 위아래로 튄다.
#
# 그래서 쏠림을 문턱으로 내리고 언급 수로 세운다. 카드의 독창성은 그대로다 — 실측:
#
#   빈도만 (문턱 없음)          국장과 4/7 겹침  (AI · AI인프라 · HBM · 데이터센터)
#   쏠림 1.5배 + 언급 수 순     국장과 4/11 겹침
#   쏠림 2.0배 + 언급 수 순     국장과 1/11 겹침  ← 이 값
#   쏠림 순 (옛 방식)           국장과 0/11 겹침
#
# 2.0 인 이유는 뜻이 또렷해서다 — "전체 대화보다 **두 배 이상** 미국 쪽에 몰린 말".
# 2.5 로 올려도 겹침은 1/11 그대로인데 꼬리가 31회까지 얇아진다(2.0 은 38회).
ISSUE_KEYWORD_MIN_SKEW = 2.0


# ── 종목별 톤 ──────────────────────────────────────────────────────────────
# 창이 30일인 건 이 카드가 **드문 것**을 찾기 때문이다. 다른 카드는 3일인데, 3일 창에서
# 판정 40건을 넘는 종목이 몇 개 안 된다(비관 우세는 3종목뿐). 화면에 "최근 30일"을
# 또렷이 적어 다른 카드와 창이 다르다는 것을 밝힌다.
STOCK_TONE_WINDOW_DAYS = 30

# ⚠️⚠️ **이 값이 이 표의 존재 이유다.** 시황 나열글("A·B 상승 Vs. C·D 하락")은 메시지
#      전체가 negative 로 분류되는데, 그 글에 실린 종목이 전부 이어져 있어 **상승으로
#      적힌 종목까지 비관 한 표를 받는다.** 실측으로 그런 글 한 건이 최대 40종목에
#      표를 뿌렸다. 거르지 않으면 순위가 뒤집힌다:
#        서비스나우 56% → 16% · 포드 52% → 27%
#      30일 창에서 미국 언급 메시지의 86%가 3종목 이하라 표본은 넉넉하다.
STOCK_TONE_MAX_TICKERS = 3

# 인용은 **더 좁게** 고른다. 3종목까지 열어 두고 뽑았더니 다섯 중 둘이 '마감 시황' 같은
# 시장 코멘트였다. 그 종목만 말한 글로 좁히면 5/5 가 제 얘기를 한다.
STOCK_TONE_QUOTE_MAX_TICKERS = 1

# ⚠️ 이 값은 **미리보기 출력에만** 쓴다. 표에는 언급이 있는 종목을 전부 저장하고,
#    무엇을 화면에 세울지는 lib/us-telegram-data.ts 가 혼자 정한다 — 문턱이 양쪽에
#    있으면 반드시 갈린다(이 저장소의 파이썬↔TS 쌍둥이 부채).
STOCK_TONE_PREVIEW_MIN_DECIDED = 40


def stock_tone_rows(
    tickers_of_msg: dict,
    tone_of: dict,
    date_of: dict,
    views_of: dict,
    dates: list[str],
) -> list[dict]:
    """종목 × 톤. 창은 30일이고, **그 종목 얘기인 글만** 센다(위 상수 주석)."""
    if not dates:
        return []
    base = dates[-1]
    window = set(dates[-STOCK_TONE_WINDOW_DAYS:])

    agg: dict[str, Counter] = defaultdict(Counter)
    quote: dict[str, tuple[int, tuple[str, int] | None]] = defaultdict(lambda: (-1, None))
    for key, tickers in tickers_of_msg.items():
        if date_of.get(key) not in window:
            continue
        if len(tickers) > STOCK_TONE_MAX_TICKERS:
            continue
        sentiment = tone_of.get(key)
        for ticker in tickers:
            agg[ticker]["mention"] += 1
            if sentiment:
                agg[ticker][sentiment] += 1
        if sentiment != "negative" or len(tickers) > STOCK_TONE_QUOTE_MAX_TICKERS:
            continue
        views = views_of.get(key, 0)
        for ticker in tickers:
            if views > quote[ticker][0]:
                quote[ticker] = (views, key)

    rows = []
    for ticker, c in sorted(agg.items()):
        _, key = quote.get(ticker, (-1, None))
        rows.append(
            {
                "as_of_date": base,
                "window_days": STOCK_TONE_WINDOW_DAYS,
                "ticker": ticker,
                "positive_count": c["positive"],
                "neutral_count": c["neutral"],
                "negative_count": c["negative"],
                "mention_count": c["mention"],
                "top_negative_handle": key[0] if key else None,
                "top_negative_message_id": key[1] if key else None,
            }
        )
    return rows


def issue_keyword_rows(
    keyword_rows: list[dict],
    all_total_by_date: dict[str, int],
    channels_of: dict[tuple[str, str], set[str]],
) -> list[dict]:
    """이슈 키워드 카드에 그대로 그릴 상위 N줄. **쏠림 순이다.**

    창(14일)·증감 판정(최근 3일 vs 5일 이전 점유율)은 국내와 같은 상수를 import 해
    쓴다. 다른 것은 정렬 기준 하나뿐이다:

        쏠림 = (미국 메시지에서의 언급 / 전체 메시지에서의 언급) ÷ 미국 메시지 비중

    왜 빈도가 아닌지는 migration_034 주석에 실측과 함께 적어 두었다(빈도로 뽑으면
    국장 카드와 10줄 중 6줄이 겹친다).
    """
    since = (datetime.now(timezone.utc) - timedelta(days=ISSUE_KEYWORD_WINDOW_DAYS)).date().isoformat()
    rows = [r for r in keyword_rows if r["date"] >= since]
    if not rows:
        return []

    dates = sorted({r["date"] for r in rows})
    latest = datetime.fromisoformat(dates[-1]).date()

    def days_before(d: str) -> int:
        return (latest - datetime.fromisoformat(d).date()).days

    recent_dates = set(dates[-3:])
    prior_dates = {d for d in dates if days_before(d) >= 5}
    window = {d for d in dates if days_before(d) < ISSUE_KEYWORD_COUNT_DAYS}

    day_total: Counter = Counter()
    for r in rows:
        day_total[r["date"]] += r["mention_count"] or 0

    us_win: Counter = Counter()
    all_win: Counter = Counter()
    chan_win: defaultdict = defaultdict(set)
    day_win: defaultdict = defaultdict(set)
    recent_share: defaultdict = defaultdict(float)
    prior_share: defaultdict = defaultdict(float)
    for r in rows:
        n = r["mention_count"] or 0
        if r["date"] in window:
            us_win[r["keyword"]] += n
            all_win[r["keyword"]] += r["total_count"] or 0
            # 분산도 **같은 창**으로 센다. 전 기간으로 세면 "3일에 22회"인데 "21일에
            # 걸쳐 있다"는 어긋난 짝이 화면에 뜬다.
            chan_win[r["keyword"]] |= channels_of.get((r["date"], r["keyword"]), set())
            day_win[r["keyword"]].add(r["date"])
        share = n / max(day_total[r["date"]], 1)
        if r["date"] in recent_dates:
            recent_share[r["keyword"]] += share
        if r["date"] in prior_dates:
            prior_share[r["keyword"]] += share

    # 쏠림의 기준선 — 창 안 **전체 화제어 언급 중 미국 몫**. 이 값이 1배다.
    #
    # ⚠️ 분모를 `sum(all_win.values())` 로 두면 안 된다(한 번 그렇게 썼다가 100% 미국인
    #    말이 2.2배로 나왔다). all_win 은 **미국분이 하나라도 있는 말만** 담고 있어서,
    #    미국이 전혀 안 쓴 말이 통째로 빠진 채 기준선이 부풀려진다(16% → 45%).
    #    분모는 창 안 모든 화제어의 합이어야 한다.
    us_total = sum(us_win.values())
    all_total = sum(all_total_by_date.get(d, 0) for d in window)
    baseline = us_total / max(1, all_total)

    can_compare = bool(prior_dates)
    scored = []
    for word, count in us_win.items():
        if count < ISSUE_KEYWORD_MIN_MENTIONS:
            continue
        if len(chan_win.get(word, ())) < ISSUE_KEYWORD_MIN_CHANNELS:
            continue
        if len(day_win.get(word, ())) < ISSUE_KEYWORD_MIN_DAYS:
            continue
        total = max(count, all_win.get(word, count))
        skew = (count / total) / max(baseline, 1e-9)
        if skew < ISSUE_KEYWORD_MIN_SKEW:
            continue
        # 언급 수로 세운다(위 ISSUE_KEYWORD_MIN_SKEW 주석). 동점은 화제어로 가른다 —
        # 안 가르면 순위가 실행마다 흔들린다.
        scored.append((-count, word, count, total, skew))
    ranked = sorted(scored, key=lambda s: (s[0], s[1]))[:ISSUE_KEYWORD_LIMIT]

    out = []
    for i, (_, word, count, total, skew) in enumerate(ranked, 1):
        recent_avg = recent_share.get(word, 0.0) / max(len(recent_dates), 1)
        prior_avg = prior_share.get(word, 0.0) / max(len(prior_dates), 1)
        # 두 값(방향·크기)은 **같은 뺄셈 하나**에서 나온다. trend 는 여기에 flat 문턱만
        # 더한 것이다 — 한쪽만 고치면 화살표와 하이라이트 칸이 서로 다른 말을 한다.
        delta = None if not can_compare else recent_avg - prior_avg
        if delta is None:
            trend = None
        elif abs(delta) < ISSUE_KEYWORD_FLAT:
            trend = "flat"
        else:
            trend = "up" if delta > 0 else "down"
        out.append(
            {
                "rank": i,
                "keyword": word,
                "mention_count": count,
                "total_count": total,
                "skew": round(skew, 3),
                "channel_count": len(chan_win.get(word, ())),
                "day_count": len(day_win.get(word, ())),
                "trend": trend,
                "share_delta": None if delta is None else round(delta, 6),
                "computed_for": dates[-1],
            }
        )
    return out


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()

    # ── 어떤 메시지가 '미국 얘기'인가 ───────────────────────────────────────
    # ⚠️ ticker 까지 받는다. 테마별 톤(scope=테마명)을 세려면 어느 종목 얘기였는지가
    #    있어야 한다 — 국내 쪽이 telegram_message_stocks 에서 stock_code 를 받는 것과
    #    같은 자리다. 열 하나가 늘 뿐 조회 수는 그대로다.
    us_mentions = load_all_keyset(
        db, "telegram_message_us_stocks", "id,channel_handle,message_id,ticker"
    )
    us_keys = {(m["channel_handle"], m["message_id"]) for m in us_mentions}
    if not us_keys:
        print("[경고] telegram_message_us_stocks 가 비어 있습니다. "
              "먼저 extract_telegram_us_stocks.py 를 실행하세요.")
        return
    print(f"[재료] 미국 언급 메시지 {len(us_keys):,}건 (언급 {len(us_mentions):,}건)")

    # 티커 → 테마. 한 종목이 여러 테마에 속할 수 있다(us_stock_themes 머리 주석).
    themes_of_ticker: dict[str, list[str]] = defaultdict(list)
    for theme, tickers in US_THEMES.items():
        for t in tickers:
            themes_of_ticker[t].append(theme)
    tickers_of_msg: dict[tuple[str, int], set[str]] = defaultdict(set)
    for m in us_mentions:
        tickers_of_msg[(m["channel_handle"], m["message_id"])].add(m["ticker"])

    analysis = load_all_keyset(
        db, "telegram_message_analysis", "id,channel_handle,message_id,sentiment,keywords"
    )
    if not analysis:
        print("[경고] telegram_message_analysis 가 비어 있습니다. "
              "먼저 analyze_telegram_messages.py 를 실행하세요.")
        return

    # views 는 종목별 톤 카드의 인용글을 고르는 데 쓴다(가장 널리 퍼진 비관글).
    messages = load_all_keyset(db, "telegram_messages", "id,channel_handle,message_id,posted_at,views")
    date_of, views_of = {}, {}
    for m in messages:
        if not m.get("posted_at"):
            continue
        key = (m["channel_handle"], m["message_id"])
        date_of[key] = datetime.fromisoformat(m["posted_at"]).astimezone(KST).date().isoformat()
        views_of[key] = m.get("views") or 0

    # ── 화제어에서 뺄 종목명 ────────────────────────────────────────────────
    # 국내 이름(stocks + 별칭) **과** 미국 표기(사전의 키 전부 — 한글 표기·티커·영문).
    # 미국 얘기 메시지의 36.4%가 국내 종목을 같이 말하므로 한쪽만 빼면 안 된다.
    stocks = load_all(db, "stocks", "code,name", order_by="code")
    stock_words = {norm(s["name"]) for s in stocks} | {norm(a) for a in STOCK_ALIASES}
    stock_words |= {norm(name) for name in US_NAMES}

    # ── 집계 ────────────────────────────────────────────────────────────────
    # ⚠️ 화제어는 **미국분과 전체분을 한 번에** 센다. 전체분(all_hits)이 쏠림의 분모다.
    #    국내 표에서 조인해 오지 않는 이유는 대표 표기가 갈릴 수 있어서다(migration_034).
    tone: dict[tuple[str, str], Counter] = defaultdict(Counter)
    us_hits: dict[tuple[str, str], int] = defaultdict(int)
    all_hits: dict[tuple[str, str], int] = defaultdict(int)
    kw_spellings: dict[str, Counter] = defaultdict(Counter)
    # 쏠림 문턱용 분산. (날짜, 버킷) 단위로 채널을 모은다 — 창을 어느 범위로 잡을지는
    # issue_keyword_rows 가 정하므로 여기서 미리 합치면 안 된다.
    kw_channels: defaultdict = defaultdict(set)
    skipped_no_date = 0
    analyzed_us = 0

    tone_of = {(a["channel_handle"], a["message_id"]): a["sentiment"] for a in analysis}

    for a in analysis:
        key = (a["channel_handle"], a["message_id"])
        date = date_of.get(key)
        if not date:
            if key in us_keys:
                skipped_no_date += 1
            continue
        is_us = key in us_keys
        if is_us:
            analyzed_us += 1
            tone[(date, OVERALL)][a["sentiment"]] += 1
            # 이 메시지가 말한 종목들이 속한 테마 **전부**에 같은 톤을 반영(중복 제거).
            # 국내 calculate_telegram_sentiment 와 같은 규칙이다 — 한 글이 엔비디아와
            # 마이크론을 같이 말하면 AI반도체와 메모리 둘 다 그 톤을 겪은 것이 맞다.
            for theme in {
                th
                for tk in tickers_of_msg.get(key, ())
                for th in themes_of_ticker.get(tk, ())
            }:
                tone[(date, theme)][a["sentiment"]] += 1

        for word in a.get("keywords") or []:
            b, canonical = bucket_of(word)
            if len(b) < MIN_KEYWORD_LEN or len(b) > MAX_KEYWORD_LEN:
                continue
            if b in EXCLUDE or b in stock_words:
                continue
            all_hits[(date, b)] += 1
            kw_spellings[b][canonical or word.strip()] += 1
            if is_us:
                us_hits[(date, b)] += 1
                kw_channels[(date, b)].add(key[0])

    if not tone:
        print("[경고] 미국 언급 메시지 중 분류가 붙은 것이 없습니다. 저장을 건너뜁니다.")
        return

    sentiment_rows = [
        {
            "date": date,
            "scope": scope,
            "positive_count": c["positive"],
            "neutral_count": c["neutral"],
            "negative_count": c["negative"],
            "message_count": sum(c.values()),
        }
        for (date, scope), c in sorted(tone.items())
    ]

    def label(bucket: str) -> str:
        return kw_spellings[bucket].most_common(1)[0][0]

    # 창 계산은 issue_keyword_rows 가 혼자 맡는다. 여기서는 (날짜, 대표표기) 단위의
    # 채널 집합만 넘겨 주고, 어느 날을 셀지는 그쪽이 정한다 — 창 규칙이 두 군데 있으면
    # 반드시 갈린다.
    channels_by_day = {(d, label(b)): ch for (d, b), ch in kw_channels.items()}

    # 그날 전체 화제어 언급 수(모든 말). 쏠림의 **분모**라 미국분이 0인 말도 들어가야 한다.
    all_total_by_date: dict[str, int] = defaultdict(int)
    for (date, _b), n in all_hits.items():
        all_total_by_date[date] += n

    # 전체분만 있고 미국분이 0인 날은 행을 만들지 않는다 — 미장 표에 남길 뜻이 없다.
    keyword_rows = [
        {
            "date": date,
            "keyword": label(b),
            "mention_count": n,
            "total_count": all_hits[(date, b)],
        }
        for (date, b), n in sorted(us_hits.items())
    ]

    # ── 미리보기 ────────────────────────────────────────────────────────────
    dates = sorted({r["date"] for r in sentiment_rows})
    coverage = analyzed_us * 100 // max(1, len(us_keys))
    print(f"[집계] 미국 메시지 중 분류 있는 것 {analyzed_us:,}건({coverage}%) → "
          f"센티먼트 {len(sentiment_rows)}행 · 키워드 {len(keyword_rows)}행 · "
          f"날짜 {len(dates)}일 ({dates[0]} ~ {dates[-1]})")
    if skipped_no_date:
        print(f"[안내] 원본 메시지를 못 찾아 건너뛴 분류 {skipped_no_date}건")

    latest = dates[-1]
    overall = next((r for r in sentiment_rows if r["date"] == latest and r["scope"] == OVERALL), None)
    if overall:
        n = max(1, overall["message_count"])
        print(f"  {latest} 전체 {n}건 → 긍정 {overall['positive_count'] * 100 // n}% · "
              f"중립 {overall['neutral_count'] * 100 // n}% · "
              f"비관 {overall['negative_count'] * 100 // n}%")

    issue_rows = issue_keyword_rows(keyword_rows, all_total_by_date, channels_by_day)
    arrow = {"up": "▲", "down": "▼", "flat": "·", None: " "}
    print("  이슈 키워드(쏠림 %.1f배 이상 · 언급 수 순):" % ISSUE_KEYWORD_MIN_SKEW)
    for r in issue_rows:
        d = r["share_delta"]
        print(f"    {r['rank']:2} {r['keyword']:<14} 쏠림 {r['skew']:>5.1f}배 · "
              f"미국 {r['mention_count']}/{r['total_count']}회 · "
              f"{r['channel_count']}채널 · {r['day_count']}일 {arrow[r['trend']]}"
              f"{'' if d is None else f' {d * 100:+.2f}%p'}")

    tone_rows = stock_tone_rows(tickers_of_msg, tone_of, date_of, views_of, dates)
    decided = [
        r for r in tone_rows
        if r["positive_count"] + r["negative_count"] >= STOCK_TONE_PREVIEW_MIN_DECIDED
    ]
    hot = sorted(
        (r for r in decided if r["negative_count"] > r["positive_count"]),
        key=lambda r: -r["negative_count"] / max(1, r["positive_count"] + r["negative_count"]),
    )
    print(f"  종목별 톤({STOCK_TONE_WINDOW_DAYS}일 · {STOCK_TONE_MAX_TICKERS}종목 이하 글만): "
          f"{len(tone_rows)}종목 저장 · 판정 {STOCK_TONE_PREVIEW_MIN_DECIDED}건 이상 {len(decided)}종목 · "
          f"비관 우세 {len(hot)}종목")
    for r in hot[:8]:
        dec = r["positive_count"] + r["negative_count"]
        print(f"    {r['ticker']:<6} 비관 {r['negative_count'] * 100 // dec:>3}% "
              f"(판정 {dec} · 언급 {r['mention_count']})"
              f"{'' if r['top_negative_handle'] else '  ⚠️ 인용할 단독글 없음'}")

    if dry_run:
        print("[dry-run] 저장하지 않고 종료합니다.")
        return

    # ── 저장 (전량 재계산: 삭제 후 삽입) ────────────────────────────────────
    # 종목별 톤은 기준일 × 창 단위로 통째 갈아 끼운다(id 열이 없어 다른 삭제 조건).
    if tone_rows:
        db.table(STOCK_TONE_TABLE).delete().eq("as_of_date", tone_rows[0]["as_of_date"]).eq(
            "window_days", STOCK_TONE_WINDOW_DAYS
        ).execute()
        for i in range(0, len(tone_rows), 500):
            db.table(STOCK_TONE_TABLE).insert(tone_rows[i:i + 500]).execute()
        print(f"[Supabase] {STOCK_TONE_TABLE} {len(tone_rows)}행 저장")

    for table, rows in ((SENTIMENT_TABLE, sentiment_rows), (KEYWORD_TABLE, keyword_rows)):
        # PostgREST 는 조건 없는 delete 를 막으므로 항상 참인 조건을 준다.
        db.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        # 500행씩 — 한 statement 가 8초(statement_timeout)를 넘지 않게. 총 소요가 아니라
        # statement 하나에 걸리는 천장이라, 쪼개면 행이 아무리 많아도 안 걸린다.
        for i in range(0, len(rows), 500):
            db.table(table).insert(rows[i : i + 500]).execute()
        print(f"[Supabase] {table} {len(rows)}행 저장")

    # 파생 표는 원자료를 쓴 **뒤에** 저장한다. 순서가 뒤집히면 잠깐이지만 카드가
    # 원자료보다 앞선 값을 말한다.
    if issue_rows:
        db.table(ISSUE_KEYWORD_TABLE).delete().gte("rank", 0).execute()
        db.table(ISSUE_KEYWORD_TABLE).insert(issue_rows).execute()
        print(f"[Supabase] {ISSUE_KEYWORD_TABLE} {len(issue_rows)}행 저장 "
              f"({issue_rows[0]['computed_for']} 기준)")
    else:
        print(f"[안내] 이슈 키워드가 비어 {ISSUE_KEYWORD_TABLE} 저장을 건너뜁니다.")


if __name__ == "__main__":
    main()

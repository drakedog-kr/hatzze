"""미국 종목을 언급한 메시지만 골라 날짜별 톤·화제어로 집계한다.

  telegram_us_sentiment_daily : 날짜 × scope('overall' | 미국 테마명) 별 톤 카운트
  telegram_us_keyword_daily   : 날짜 × 화제어 언급 수
  telegram_us_issue_keyword   : 이슈 키워드 카드 상위 N줄(선계산)

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

# ── 이슈 키워드 카드의 문턱 세 개 ──────────────────────────────────────────
# 국내는 `언급 3회 이상`만 걸고 빈도로 줄 세운다. 미장은 **쏠림**으로 세우므로
# (migration_034 주석) 작은 수가 큰 배수를 받는 함정이 그대로 있다 — 22회짜리가
# 92% 로 5.6배를 받는다. 그래서 문턱이 셋이다.
#
# 값은 실측으로 정했다. 최근 7일 상위 14개의 실제 분산은 17~43채널 · 3~8일이라
# 지금은 이 문턱이 아무도 안 자른다. 그게 맞다 — 문턱은 오늘을 고치는 장치가 아니라
# 복붙 한 건이 1위로 올라오는 날을 막는 장치다.
# 11줄인 건 데이터가 아니라 **조판**이 정한 값이다. 이 카드는 반칸이고 옆에 테마
# 로테이션(10줄·673px)이 나란히 선다 — 자연 높이를 재서 맞췄다(11줄 = 674px).
# 테마 줄은 이름 아래 막대가 깔려 화제어 줄보다 높아서, 줄 수가 같으면 오히려 어긋난다.
# ⭐ 눈대중으로 두 번 틀렸다. 늘려야 할 쪽과 줄여야 할 쪽을 반대로 잡았는데, 화면만
#    보고는 어느 카드가 늘어난 쪽인지 알 수 없어서다(늘어난 카드에 구멍이 보이므로
#    구멍이 보이는 쪽이 '짧은 쪽'이다). **래퍼의 align-items 를 flex-start 로 바꿔
#    두 카드의 자연 높이를 재고 나서야 정리됐다.**
# ⚠️ 짝은 화면의 getUsThemeRotation(10) 이다. 한쪽만 고치면 한쪽 카드가 빈다.
ISSUE_KEYWORD_LIMIT = 11
ISSUE_KEYWORD_MIN_MENTIONS = 20  # 미국 메시지에서의 최소 언급 수
ISSUE_KEYWORD_MIN_CHANNELS = 5   # 서로 다른 채널 수. 한 채널 복붙을 막는다
ISSUE_KEYWORD_MIN_DAYS = 2       # 서로 다른 날짜 수. 하루짜리 이벤트를 막는다


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
    last7 = {d for d in dates if days_before(d) < 7}

    day_total: Counter = Counter()
    for r in rows:
        day_total[r["date"]] += r["mention_count"] or 0

    us7: Counter = Counter()
    all7: Counter = Counter()
    chan7: defaultdict = defaultdict(set)
    day7: defaultdict = defaultdict(set)
    recent_share: defaultdict = defaultdict(float)
    prior_share: defaultdict = defaultdict(float)
    for r in rows:
        n = r["mention_count"] or 0
        if r["date"] in last7:
            us7[r["keyword"]] += n
            all7[r["keyword"]] += r["total_count"] or 0
            # 분산도 **같은 창**으로 센다. 전 기간으로 세면 "7일에 22회"인데 "21일에
            # 걸쳐 있다"는 어긋난 짝이 화면에 뜬다.
            chan7[r["keyword"]] |= channels_of.get((r["date"], r["keyword"]), set())
            day7[r["keyword"]].add(r["date"])
        share = n / max(day_total[r["date"]], 1)
        if r["date"] in recent_dates:
            recent_share[r["keyword"]] += share
        if r["date"] in prior_dates:
            prior_share[r["keyword"]] += share

    # 쏠림의 기준선 — 창 안 **전체 화제어 언급 중 미국 몫**. 이 값이 1배다.
    #
    # ⚠️ 분모를 `sum(all7.values())` 로 두면 안 된다(한 번 그렇게 썼다가 100% 미국인
    #    말이 2.2배로 나왔다). all7 은 **미국분이 하나라도 있는 말만** 담고 있어서,
    #    미국이 전혀 안 쓴 말이 통째로 빠진 채 기준선이 부풀려진다(16% → 45%).
    #    분모는 창 안 모든 화제어의 합이어야 한다.
    us_total = sum(us7.values())
    all_total = sum(all_total_by_date.get(d, 0) for d in last7)
    baseline = us_total / max(1, all_total)

    can_compare = bool(prior_dates)
    scored = []
    for word, count in us7.items():
        if count < ISSUE_KEYWORD_MIN_MENTIONS:
            continue
        if len(chan7.get(word, ())) < ISSUE_KEYWORD_MIN_CHANNELS:
            continue
        if len(day7.get(word, ())) < ISSUE_KEYWORD_MIN_DAYS:
            continue
        total = max(count, all7.get(word, count))
        skew = (count / total) / max(baseline, 1e-9)
        # 동점은 화제어로 가른다 — 안 가르면 순위가 실행마다 흔들린다.
        scored.append((-skew, word, count, total, skew))
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
                "channel_count": len(chan7.get(word, ())),
                "day_count": len(day7.get(word, ())),
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

    messages = load_all_keyset(db, "telegram_messages", "id,channel_handle,message_id,posted_at")
    date_of = {
        (m["channel_handle"], m["message_id"]): datetime.fromisoformat(m["posted_at"])
        .astimezone(KST)
        .date()
        .isoformat()
        for m in messages
        if m.get("posted_at")
    }

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
    print("  이슈 키워드(쏠림순):")
    for r in issue_rows:
        d = r["share_delta"]
        print(f"    {r['rank']:2} {r['keyword']:<14} 쏠림 {r['skew']:>5.1f}배 · "
              f"미국 {r['mention_count']}/{r['total_count']}회 · "
              f"{r['channel_count']}채널 · {r['day_count']}일 {arrow[r['trend']]}"
              f"{'' if d is None else f' {d * 100:+.2f}%p'}")

    if dry_run:
        print("[dry-run] 저장하지 않고 종료합니다.")
        return

    # ── 저장 (전량 재계산: 삭제 후 삽입) ────────────────────────────────────
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

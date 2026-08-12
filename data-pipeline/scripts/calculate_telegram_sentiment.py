"""메시지 단위 분류(telegram_message_analysis)를 날짜·테마·화제어로 집계한다.

  telegram_sentiment_daily : 날짜 × scope('overall' | 테마명) 별 톤 카운트
  telegram_keyword_daily   : 날짜 × 화제어 언급 수

**LLM을 호출하지 않는다.** 화면에 뜨는 수치("긍정 62%", "HBM 128회")는 모델이 지어내는
게 아니라 여기서 센다. 종목추출·테마 로테이션과 같은 철학이고, 덕분에 분류를 다시 하지
않고도 집계 규칙만 바꿔 재계산할 수 있다.

집계 규칙:
- **날짜는 KST 기준**(calculate_stock_daily.py 와 동일). 러너가 UTC라 그냥 쓰면 하루 어긋난다.
- **테마 매핑**: 메시지 → telegram_message_stocks → stocks → config/stock_themes.py.
  테마 로테이션 카드와 같은 사전을 공유해야 두 카드가 어긋나지 않는다.
- **메시지 톤을 그 메시지가 언급한 모든 종목/테마에 동일하게 적용한다.** 한 메시지가 두
  종목을 서로 다른 톤으로 말하는 경우는 v1에서 감수한다 — 종목별로 나누려면 호출이 종목
  수만큼 늘어나는데, 실측상 대부분의 메시지는 단일 종목을 중심으로 쓰인다.
- **화제어 정규화**: 소문자·공백 제거로 버킷을 만들고(HBM/hbm/H B M 이 한 칸에 모임),
  ALIASES 로 표기 흔들림을 통합한 뒤, 일반어·종목명·길이 이상치를 버린다.
  화면 표기는 그 버킷에서 가장 자주 쓰인 실제 표기를 고른다 — 사전에 없는 새 이슈도
  자연스러운 표기로 나온다.

extract/stock_daily/theme_daily 와 마찬가지로 **매 실행 전량 재계산**한다(삭제 후 삽입).

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_telegram_sentiment.py --dry-run   # 계산·미리보기만
    python scripts/calculate_telegram_sentiment.py             # 저장
"""

from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402
from common.timeutil import KST  # noqa: E402
from common.supabase_client import load_all  # noqa: E402
from config.issue_keywords import (  # noqa: E402
    ALIASES,
    EXCLUDE,
    MAX_KEYWORD_LEN,
    MIN_KEYWORD_LEN,
)
from config.stock_extraction import ALIASES as STOCK_ALIASES  # noqa: E402
from config.stock_themes import THEMES  # noqa: E402

OVERALL = "overall"

# ── 이슈 키워드 카드(/kadera)를 미리 계산해 두기 위한 상수 ──────────────────
# 카드는 10줄인데 그 10줄을 **고르려면** 화제어 전체를 세어야 한다(상위가 무엇인지는
# 다 세기 전엔 모르고, ▲▼ 는 "그날 전체 화제어" 를 분모로 쓰는 점유율 비교다).
# 렌더할 때 하면 14일치 23,672행을 1,000행씩 24회 왕복해 읽게 돼서, 실측으로 /kadera
# 서버 렌더 1,775ms 중 1,131ms 가 이 카드였다(그 조회만 빼면 644ms).
#
# 여기서 계산하면 DB 추가 조회가 0회다 — 이 스크립트가 (날짜, 화제어, 언급수)를 만드는
# 당사자라 이미 전부 메모리에 있다.
#
# ⚠️ 아래 네 값은 lib/telegram-data.ts 의 getIssueKeywords 와 **같아야 한다.** 표가
# 비었거나 아직 없으면 프론트가 그쪽 즉석 계산으로 떨어지므로, 값이 갈리면 폴백이
# 열릴 때만 화면이 달라진다(가장 알아채기 어려운 종류의 어긋남이다). Python 과 TS 라
# import 로 공유할 수 없어 손으로 맞춘 사본이다.
ISSUE_KEYWORD_TABLE = "telegram_issue_keyword"  # 마이그레이션 023
ISSUE_KEYWORD_LIMIT = 10  # page.tsx 의 getIssueKeywords(10)
ISSUE_KEYWORD_WINDOW_DAYS = 14  # getIssueKeywords 의 daysAgoISO(14)
ISSUE_KEYWORD_MIN_MENTIONS = 3  # getIssueKeywords 의 MIN_KEYWORD_MENTIONS
# 세는 창. **3일이다**(2026-08-12에 7 → 3). 이 페이지의 다른 카드가 전부 3일이라
# (급부상·센티먼트·주요 종목·테마 로테이션) 한 화면에서 창이 둘이면 같은 낱말의 숫자가
# 서로 안 맞는 것처럼 읽힌다. 미장 카드가 먼저 3일로 갔고 여기서 맞춘다.
# 증감 판정(최근 3일 vs 5일 이상 이전)은 그대로다 — 그건 처음부터 3일 창이었다.
ISSUE_KEYWORD_COUNT_DAYS = 3  # getIssueKeywords 의 KEYWORD_COUNT_DAYS
# 점유율 차이가 이보다 작으면 '변화 없음'. TS 쪽 FLAT 과 같은 값.
ISSUE_KEYWORD_FLAT = 1e-6


def issue_keyword_rows(keyword_rows: list[dict]) -> list[dict]:
    """이슈 키워드 카드에 그대로 그릴 상위 N줄. 계산 규칙은 getIssueKeywords 와 동일.

    증감(▲▼)은 절대 언급 수가 아니라 **그날 전체 화제어 중 점유율**로 본다. 주말이면
    전체 메시지가 평일의 1/10로 떨어져서, 절대량으로 비교하면 모든 화제어가 일제히
    ▼가 된다(실제로 그렇게 났다). 창은 최근 3일 평균 vs 5일 이상 이전 평균이다.
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

    total: Counter = Counter()
    recent_share: defaultdict = defaultdict(float)
    prior_share: defaultdict = defaultdict(float)
    for r in rows:
        n = r["mention_count"] or 0
        if r["date"] in window:
            total[r["keyword"]] += n
        share = n / max(day_total[r["date"]], 1)
        if r["date"] in recent_dates:
            recent_share[r["keyword"]] += share
        if r["date"] in prior_dates:
            prior_share[r["keyword"]] += share

    can_compare = bool(prior_dates)
    # 언급 수가 같으면 화제어로 가른다 — 정수라 동점이 흔하고, 안 가르면 순위가
    # 실행마다 흔들린다.
    ranked = sorted(
        ((w, c) for w, c in total.items() if c >= ISSUE_KEYWORD_MIN_MENTIONS),
        key=lambda wc: (-wc[1], wc[0]),
    )[:ISSUE_KEYWORD_LIMIT]

    out = []
    for i, (word, count) in enumerate(ranked, 1):
        # 창 길이가 다르므로 '하루 평균 점유율'로 맞춘다. 그날 안 나온 화제어는
        # 점유율 0으로 치므로 창 전체 일수로 나눈다.
        recent_avg = recent_share.get(word, 0.0) / max(len(recent_dates), 1)
        prior_avg = prior_share.get(word, 0.0) / max(len(prior_dates), 1)
        # 두 값(방향·크기)은 **같은 뺄셈 하나**에서 나온다. trend 는 여기에 flat 문턱만
        # 더한 것이다 — 한쪽만 고치면 화살표와 카드의 %p 가 서로 다른 말을 한다.
        # (미장 쪽 calculate_us_telegram_sentiment.py 가 같은 모양이다.)
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
                "trend": trend,
                "share_delta": None if delta is None else round(delta, 6),
                "computed_for": dates[-1],
            }
        )
    return out


def save_issue_keywords(db, rows: list[dict]) -> None:
    """전량 교체. 표가 아직 없어도(마이그레이션 023 미적용) 파이프라인을 세우지 않는다.

    이 표는 **속도만 담당하고 정확성은 담당하지 않는다** — 비어 있으면 프론트가
    telegram_keyword_daily 에서 즉석 계산으로 떨어져 예전과 똑같이 그린다. 그래서
    여기서 죽는 것은 얻는 것 없이 그날 센티먼트 집계까지 날리는 셈이다.
    """
    if not rows:
        print(f"[안내] 이슈 키워드가 비어 저장을 건너뜁니다({ISSUE_KEYWORD_TABLE}).")
        return
    try:
        db.table(ISSUE_KEYWORD_TABLE).delete().gte("rank", 0).execute()
        db.table(ISSUE_KEYWORD_TABLE).insert(rows).execute()
    except Exception as exc:  # noqa: BLE001
        print(
            f"[안내] {ISSUE_KEYWORD_TABLE} 저장을 건너뜁니다({type(exc).__name__}) — "
            "화면은 즉석 계산으로 그대로 동작합니다(마이그레이션 023 적용 여부 확인)."
        )
        return
    print(f"[Supabase] {ISSUE_KEYWORD_TABLE} {len(rows)}행 저장 ({rows[0]['computed_for']} 기준)")

# 정규화 시 지우는 것: 공백·가운뎃점·하이픈·언더스코어.
# "금리 인하" / "금리·인하" / "금리-인하" 가 한 버킷에 모이게 한다.
STRIP_RE = re.compile(r"[\s·\-_]+")


def norm(word: str) -> str:
    """비교용 정규화 키. 표기만 다르고 뜻이 같은 말을 한 버킷에 모은다."""
    return STRIP_RE.sub("", word.strip().lower())


def bucket_of(word: str) -> tuple[str, str | None]:
    """화제어 → (버킷 키, 사전이 정한 대표 표기 or None)."""
    key = norm(word)
    canonical = ALIASES.get(key)
    if canonical:
        return norm(canonical), canonical
    return key, None


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()

    analysis = load_all(
        db, "telegram_message_analysis", "channel_handle,message_id,sentiment,keywords"
    )
    if not analysis:
        print("[경고] telegram_message_analysis 가 비어 있습니다. "
              "먼저 analyze_telegram_messages.py 를 실행하세요.")
        return

    messages = load_all(db, "telegram_messages", "channel_handle,message_id,posted_at")
    date_of = {
        (m["channel_handle"], m["message_id"]): datetime.fromisoformat(m["posted_at"])
        .astimezone(KST)
        .date()
        .isoformat()
        for m in messages
        if m.get("posted_at")
    }

    # 종목 → 테마 (테마 로테이션과 같은 사전). stocks 에 없는 이름은 조용히 건너뛴다.
    stocks = load_all(db, "stocks", "code,name", order_by="code")
    code_of = {s["name"]: s["code"] for s in stocks}
    themes_of_code: dict[str, list[str]] = defaultdict(list)
    for theme, names in THEMES.items():
        for name in names:
            code = code_of.get(name)
            if code:
                themes_of_code[code].append(theme)

    mentions = load_all(db, "telegram_message_stocks", "channel_handle,message_id,stock_code")
    codes_of_msg: dict[tuple[str, int], set[str]] = defaultdict(set)
    for m in mentions:
        codes_of_msg[(m["channel_handle"], m["message_id"])].add(m["stock_code"])

    # 화제어에서 제외할 종목명 집합(정규화 키). 종목은 telegram_message_stocks 가
    # 담당하므로 화제어에 끼면 중복이다. 코스닥이 적재되면 자동으로 따라 늘어난다.
    stock_words = {norm(s["name"]) for s in stocks} | {norm(a) for a in STOCK_ALIASES}

    # ── 집계 ────────────────────────────────────────────────────────────────
    tone: dict[tuple[str, str], Counter] = defaultdict(Counter)  # (date, scope) -> 톤 카운트
    kw_hits: dict[tuple[str, str], int] = defaultdict(int)       # (date, 버킷) -> 횟수
    kw_spellings: dict[str, Counter] = defaultdict(Counter)      # 버킷 -> 실제 표기 빈도
    skipped_no_date = 0

    for a in analysis:
        key = (a["channel_handle"], a["message_id"])
        date = date_of.get(key)
        if not date:
            skipped_no_date += 1
            continue

        sentiment = a["sentiment"]
        tone[(date, OVERALL)][sentiment] += 1

        # 이 메시지가 언급한 종목들이 속한 테마 전부에 같은 톤을 반영(중복 제거).
        msg_themes = {t for code in codes_of_msg.get(key, ()) for t in themes_of_code.get(code, ())}
        for theme in msg_themes:
            tone[(date, theme)][sentiment] += 1

        for word in a.get("keywords") or []:
            b, canonical = bucket_of(word)
            if len(b) < MIN_KEYWORD_LEN or len(b) > MAX_KEYWORD_LEN:
                continue
            if b in EXCLUDE or b in stock_words:
                continue
            kw_hits[(date, b)] += 1
            # 사전이 대표 표기를 정했으면 그걸, 아니면 실제 표기 중 최빈값을 쓴다.
            kw_spellings[b][canonical or word.strip()] += 1

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
    keyword_rows = [
        {
            "date": date,
            "keyword": kw_spellings[b].most_common(1)[0][0],
            "mention_count": n,
        }
        for (date, b), n in sorted(kw_hits.items())
    ]

    # ── 미리보기 ────────────────────────────────────────────────────────────
    dates = sorted({r["date"] for r in sentiment_rows})
    print(f"[집계] 분류 {len(analysis)}건 → 센티먼트 {len(sentiment_rows)}행 · "
          f"키워드 {len(keyword_rows)}행 · 날짜 {len(dates)}일 ({dates[0]} ~ {dates[-1]})")
    if skipped_no_date:
        print(f"[안내] 원본 메시지를 못 찾아 건너뛴 분류 {skipped_no_date}건")

    latest = dates[-1]
    overall = next((r for r in sentiment_rows if r["date"] == latest and r["scope"] == OVERALL), None)
    if overall:
        n = max(1, overall["message_count"])
        print(f"  {latest} 전체 {n}건 → 긍정 {overall['positive_count'] * 100 // n}% · "
              f"중립 {overall['neutral_count'] * 100 // n}% · "
              f"비관 {overall['negative_count'] * 100 // n}%")
    top_theme = sorted(
        (r for r in sentiment_rows if r["date"] == latest and r["scope"] != OVERALL),
        key=lambda r: r["message_count"],
        reverse=True,
    )[:5]
    for r in top_theme:
        n = max(1, r["message_count"])
        print(f"    {r['scope']}: {n}건 · 긍정 {r['positive_count'] * 100 // n}%")

    # 화면의 이슈 키워드 카드와 **같은 규칙**으로 뽑아 그대로 저장한다. 예전엔 여기서
    # 7일 합만 세어 로그에 찍었는데, 그건 카드와 창도 문턱도 달라 눈으로 대조할 수 없었다.
    issue_rows = issue_keyword_rows(keyword_rows)
    arrow = {"up": "▲", "down": "▼", "flat": "·", None: " "}
    print(
        "  이슈 키워드: "
        + ", ".join(f"{r['keyword']}{arrow[r['trend']]}{r['mention_count']}" for r in issue_rows)
    )

    if dry_run:
        print("[dry-run] 저장하지 않고 종료합니다.")
        return

    # ── 저장 (전량 재계산: 삭제 후 삽입) ────────────────────────────────────
    for table, rows in (
        ("telegram_sentiment_daily", sentiment_rows),
        ("telegram_keyword_daily", keyword_rows),
    ):
        # 전량 재계산 — PostgREST는 조건 없는 delete를 막으므로 항상 참인 조건을 준다
        # (calculate_theme_daily.py 와 같은 패턴).
        db.table(table).delete().neq(
            "id", "00000000-0000-0000-0000-000000000000"
        ).execute()
        for i in range(0, len(rows), 500):
            db.table(table).insert(rows[i : i + 500]).execute()
        print(f"[Supabase] {table} {len(rows)}행 저장")

    # 화제어 원자료를 쓴 뒤에 저장한다 — 이 표는 그것의 파생이라 순서가 뒤집히면
    # 잠깐이지만 카드가 원자료보다 앞선 값을 말한다.
    save_issue_keywords(db, issue_rows)


if __name__ == "__main__":
    main()

"""카더라 헤드라인 낙관도의 재료 — '시장 전체를 말한 글'의 날짜별 건수(migration_088).

scripts/analyze_telegram_market.py 가 글마다 국내·미국 증시 전체에 대한 분위기를 묻고,
날짜 × 시장(kr·us)별 낙관·중립·비관 건수를 telegram_market_sentiment_daily 에 적는다.
화면(lib/telegram-data.ts · lib/us-telegram-data.ts)과 총평·히어로 생성기가 이 표를 읽는다.

## 왜 전체 글이 아니라 시장 글인가

전체 글로 세면 **종목이 붙은 글**(회사 소식·특징주·리포트)이 헤드라인을 끌어올린다. 수주·계약 같은
호재가 대부분이라 2026-07-12~09-28 78일 내내 낙관도 61~90이었고, 코스피가 2% 넘게 빠진 13일에도
전부 낙관이었다. 헤드라인이 79일 동안 '비관 우세'를 한 번도 못 찍은 까닭이다(2026-09-29 실측).

## 기사·시세 알림도 센다 — 빼 보았지만 얻는 게 없었다(2026-09-30)

판정 규칙이 "지수가 올랐다·내렸다는 사실만 전해도 그 방향"이라, 기사(kind=news)·알림(auto)을 빼고
의견·리서치만 세면 여론에 더 가까울 거라 보고 재 봤다(최근 30일, 머지 전 읽기 전용 측정).
  - 하루 낙관도와 그날 지수 등락의 상관: 국장 0.78 → 0.70 · 미장 0.84 → 0.82. 의견 글도 그날 지수를 따른다
  - 오늘+어제 건수 중앙값이 국장 322 → 177 · 미장 245 → 143 으로 줄어, 기간을 넓힌 날이
    국장 8 → 18일 · 미장 11 → 26일(30일 중)이 됐다 — 숫자가 늦어진다
숫자는 거의 그대로인데 늦어지기만 해서 전부 센다. 다시 해 보려면 문턱(아래 MARKET_MIN_MESSAGES)부터 같이 봐야 한다.

## 표가 없거나 비었을 때

`load_market_daily` 가 빈 목록을 돌려주고, 호출부는 예전처럼 전체 글 기준으로 센다.
마이그레이션을 사람이 나중에 돌리는 순서가 잦아서다(has_column 주석과 같은 이유).
"""

from __future__ import annotations

MARKET_DAILY_TABLE = "telegram_market_sentiment_daily"

# 기간을 넓히는 문턱 — 오늘+어제의 시장 글이 이만큼이 안 되면 하루씩 뒤로(최대 4일). 국장·미장 공통.
# 시장 글은 평일 이틀에 380건 안팎, 추석 연휴 이틀은 50~90건이었다(2026-09-21~28 실측). 200 이면
# 평일은 오늘+어제로 끝나고 주말·연휴만 넓어진다.
# ⚠️ lib/telegram-data.ts 의 MARKET_MIN_MESSAGES 와 같은 값이어야 한다(손으로 맞춘 사본).
MARKET_MIN_MESSAGES = 200


def load_market_daily(db, market: str, since: str | None = None, until: str | None = None) -> list[dict]:
    """{date, positive_count, neutral_count, negative_count, message_count} 목록(오래된→최신).

    표가 없거나 조회가 실패하면 빈 목록 — 호출부는 전체 글 기준으로 돌아간다.
    표는 날짜 × 시장 한 줄이라 몇 년 치도 1,000행을 넘지 않는다(시장별 하루 한 줄).
    """
    try:
        q = (
            db.table(MARKET_DAILY_TABLE)
            .select("date,positive_count,neutral_count,negative_count,message_count")
            .eq("market", market)
        )
        if since:
            q = q.gte("date", since)
        if until:
            q = q.lte("date", until)
        rows = q.order("date").limit(1000).execute().data or []
    except Exception as exc:  # noqa: BLE001 — 표가 없을 때(마이그레이션 전)도 여기로 온다
        print(f"[시장 낙관도] {MARKET_DAILY_TABLE} 를 못 읽어 전체 글 기준으로 셉니다: {type(exc).__name__}")
        return []
    return rows

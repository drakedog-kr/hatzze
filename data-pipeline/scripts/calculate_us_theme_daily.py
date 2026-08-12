"""미국 종목 일별 집계를 테마로 묶어 telegram_us_theme_daily 에 저장한다 (미장 테마 로테이션).

국내 짝은 `calculate_theme_daily.py`. 규칙(share_pct 의 뜻, 순위 매김, 전량 재계산)을
그대로 따르고 사전만 `config/us_stock_themes.py` 로 바꾼다.

## 국내 스크립트와 갈리는 곳 둘

1. **사전의 키가 티커다.** 국내는 종목명 → `stocks` 표에서 코드로 해석하는 단계가 있는데
   (그래서 KRX 정식명과 글자가 안 맞으면 조용히 빠진다), 여기는 그 단계가 없다.
   대신 사전이 가리키는 티커가 `us_stocks` 에 실제로 있는지는 검사한다.
2. **미해결을 경고로 끝내지 않고 세어서 보여 준다.** 국내는 코스닥 적재 이후로 미해결이
   사전 오타뿐이라 경고면 충분하지만, 미장은 사전을 사람이 방금 짜서 **어느 종목이
   어느 테마에도 안 잡히는지**가 중요한 정보다(그게 곧 사전의 구멍이다).

share_pct 의 분모는 그날 **사전에 든 미국 종목**의 주목도다(국내와 같은 규칙 — 테마
점유율을 다 더하면 100%가 된다). 지금은 사전이 집계 대상 전부를 덮고 있어 '미국 종목
전체'와 같은 값이지만, 사전 밖 종목이 생기는 날 규칙이 갈리지 않게 명시해 둔다. 국내 분모(국내 전체)와 다른 값이라
두 화면의 같은 이름 숫자를 견주면 안 된다 — 각자 자기 시장 안에서의 비중이다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_us_theme_daily.py --dry-run   # 계산·미리보기만
    python scripts/calculate_us_theme_daily.py             # 저장
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all  # noqa: E402
from config.us_stock_themes import US_THEMES, sanity_check  # noqa: E402


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()

    stocks = load_all(db, "us_stocks", "ticker,name_ko", order_by="ticker")
    known = {s["ticker"] for s in stocks}
    if not known:
        print("[경고] us_stocks 가 비어 있습니다. 먼저 sync 스크립트를 실행하세요.")
        return

    problems = sanity_check(known)
    if problems:
        # 사전이 없는 티커를 가리키면 그 줄은 영원히 0 이다. 조용히 지나가면 테마
        # 비중이 이유 없이 작게 나온다 — 세어서 알린다.
        print(f"[경고] 사전에 문제 {len(problems)}건:")
        for p in problems:
            print(f"  {p}")

    theme_of: dict[str, list[str]] = defaultdict(list)
    for theme, tickers in US_THEMES.items():
        for t in tickers:
            if t in known:
                theme_of[t].append(theme)

    unassigned = sorted(known - set(theme_of))
    if unassigned:
        name_of = {s["ticker"]: s["name_ko"] for s in stocks}
        print(f"[안내] 어느 테마에도 없는 종목 {len(unassigned)}개 — 사전의 구멍입니다: "
              + ", ".join(f"{name_of.get(t, t)}({t})" for t in unassigned[:20]))

    daily = load_all(db, "telegram_us_stock_daily", "date,ticker,weighted_score,mention_count")
    if not daily:
        print("[경고] telegram_us_stock_daily 가 비어 있습니다. "
              "먼저 calculate_us_stock_daily.py 를 실행하세요.")
        return

    # share_pct 의 분모 — 그날 **사전에 든 종목**의 주목도 합이다.
    #
    # ⚠️ 예전엔 '그날 전체 종목'이었다. 그러면 테마 점유율을 다 더해도 100%가 안 된다 —
    #    사전이 못 덮은 종목의 몫이 분모에만 남기 때문이다. 국내는 그 구멍이 컸다:
    #    일별 집계엔 856종목이 있는데 사전은 그 일부라, **합이 26%였다**(2026-08-12 실측).
    #    "점유율"이라 적어 놓고 다 더하면 4분의 1이라는 것은 말이 안 된다.
    #    미장은 우연히 티가 안 났다 — 집계에 담기는 종목이 곧 사전의 178개라 사전 = 우주였다
    #    (그래서 합이 100.03% 였다). 규칙을 양쪽에 똑같이 두어, 미장에서 사전 밖 종목이
    #    생기는 날에도 같은 뜻이 유지되게 한다.
    #
    #    분모가 바뀌면 점유율의 **뜻도 바뀐다**: '전체 대화 중 몫'이 아니라
    #    '테마에 잡힌 것 중 몫'이다. 화면 문구도 그렇게 적혀 있어야 한다.
    day_total: dict[str, float] = defaultdict(float)
    for r in daily:
        if not theme_of.get(r["ticker"]):
            continue
        day_total[r["date"]] += float(r["weighted_score"] or 0)

    agg: dict[tuple[str, str], dict] = defaultdict(lambda: {"w": 0.0, "m": 0, "tickers": set()})
    for r in daily:
        for theme in theme_of.get(r["ticker"], ()):
            a = agg[(r["date"], theme)]
            a["w"] += float(r["weighted_score"] or 0)
            a["m"] += r["mention_count"] or 0
            a["tickers"].add(r["ticker"])

    rows = []
    for (date, theme), a in agg.items():
        total = day_total.get(date, 0.0)
        rows.append(
            {
                "date": date,
                "theme": theme,
                "mention_count": a["m"],
                "weighted_score": round(a["w"], 1),
                "share_pct": round(a["w"] / total * 100, 2) if total else 0,
                "stock_count": len(a["tickers"]),
            }
        )

    by_date: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_date[r["date"]].append(r)
    for date_rows in by_date.values():
        date_rows.sort(key=lambda r: r["share_pct"], reverse=True)
        for i, r in enumerate(date_rows, 1):
            r["rank"] = i

    print(f"\n집계 {len(rows)}행 ((날짜×테마), 테마 {len(US_THEMES)}개 · 날짜 {len(by_date)}일)")
    latest = max(by_date)
    print(f"\n=== 최신일({latest}) 테마 순위 ===")
    print(f"{'#':>2} {'테마':<18}{'점유율':>8}{'언급':>7}{'종목':>6}")
    for r in sorted(by_date[latest], key=lambda r: r["rank"])[:10]:
        print(f"{r['rank']:>2} {r['theme']:<18}{r['share_pct']:>7.1f}%{r['mention_count']:>7}{r['stock_count']:>6}")

    if dry_run:
        print("\n--dry-run: DB에 저장하지 않았습니다.")
        return

    db.table("telegram_us_theme_daily").delete().neq(
        "id", "00000000-0000-0000-0000-000000000000"
    ).execute()
    # 500행씩 — 한 statement 가 statement_timeout 을 넘지 않게(다른 쓰기와 같은 규칙).
    for i in range(0, len(rows), 500):
        db.table("telegram_us_theme_daily").insert(rows[i : i + 500]).execute()
    print(f"\n[Supabase] telegram_us_theme_daily {len(rows)}행 저장 완료")


if __name__ == "__main__":
    main()

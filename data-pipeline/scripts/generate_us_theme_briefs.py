"""미장 테마마다 '요즘 도는 얘기'(LLM 두 문단) · 함께 언급된 테마 · 발췌 · 급부상 종목을 만든다 → telegram_us_theme_brief

국장 짝은 generate_theme_briefs.py 이고 **프롬프트 본문·검사·되풀이 규칙을 거기서 그대로 가져다 쓴다**
(THEME_RULES · RISER_RULES · write_brief · write_riser_reason). 손으로 베끼면 한쪽만 고쳤을 때 조용히 갈린다.
다른 점은 재료 쪽뿐이다.

  공통 규칙   COMMON 이 아니라 US_COMMON(generate_us_telegram_narratives) — 증권사 리포트 용어를 더 막고
              미국 기업 이름은 발췌의 한글 표기를 쓰라는 규칙이 붙어 있다.
  창          기준일을 **포함한** 3일(window_dates). 국장은 기준일을 뺀 3일. 미장은 화면(getUsSentiment ·
              getUsThemeRotation)이 전부 기준일을 넣어 세므로 여기도 같아야 문장이 같은 기간을 말한다.
  메시지      load_us_messages 가 본문·언급(티커·매칭 표기)을 한 번에 준다 — 국장처럼 태그 표를 따로 읽고
              본문을 뒤에 붙일 일이 없다(미국 언급 메시지는 창에 천여 건이라 본문째 받아도 가볍다).
  사전        config/us_stock_themes.py — 키가 티커라 이름 대조가 없다.
  급부상      common/us_theme_risers.py 가 고르고, digest 는 build_stock_digests(tickers=…)로 만든다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/generate_us_theme_briefs.py --dry-run               # digest 만 출력(호출 없음)
    python scripts/generate_us_theme_briefs.py                         # 생성 + 저장(전 테마)
    python scripts/generate_us_theme_briefs.py --theme AI반도체,메모리    # 몇 개만
    python scripts/generate_us_theme_briefs.py --theme 메모리 --no-save  # 문장만 보고 저장 안 함
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.llm_client import HAS_LLM_CREDENTIAL, get_llm_client  # noqa: E402

from common.config import ANTHROPIC_API_KEY  # noqa: E402
from common.supabase_client import get_client, load_all  # noqa: E402
from common.us_theme_risers import us_theme_risers  # noqa: E402
from config.us_stock_themes import US_THEMES  # noqa: E402

import generate_telegram_narratives as KR  # noqa: E402
import generate_theme_briefs as TB  # noqa: E402
import generate_us_telegram_narratives as US  # noqa: E402

MODEL = TB.MODEL
TABLE = "telegram_us_theme_brief"

US_THEME_SYSTEM = US.US_COMMON + TB.THEME_RULES
US_RISER_SYSTEM = US.US_COMMON + TB.RISER_RULES


def build_us_theme_bundle(
    theme: str,
    member_tickers: set[str],
    msgs: list[dict],
    name_of: dict[str, str],
    themes_of: dict[str, list[str]],
) -> dict | None:
    """한 테마의 재료 묶음. 국장 build_theme_bundle 과 같은 꼴(digest · related · excerpts · 수). 창 안에 이 테마 종목이
    언급된 글이 없으면 None. 메시지는 load_us_messages 가 준 것(본문·mentions 포함)."""
    items = [m for m in msgs if any(x["ticker"] in member_tickers for x in m["mentions"])]
    if not items:
        return None

    per_stock: Counter = Counter()
    related: Counter = Counter()
    for m in items:
        here = {x["ticker"] for x in m["mentions"]}
        for t in here & member_tickers:
            per_stock[t] += 1
        if len(here) > TB.RELATED_MAX_TAGS:
            continue  # 목록 글은 '함께 언급'으로 안 센다(국장 RELATED_MAX_TAGS 주석)
        others = set()
        for t in here - member_tickers:
            others.update(themes_of.get(t, []))
        for t in others - {theme}:
            related[t] += 1

    # 널리 퍼진 글부터(views + forwards×3). 국장과 같은 잣대.
    items.sort(key=lambda m: (m.get("views") or 0) + (m.get("forwards") or 0) * 3, reverse=True)

    def needle_for(m: dict) -> str | None:
        # 발췌를 자를 때 쓸 '본문에 적힌 표기'. 이 테마 종목 중 첫 언급의 것.
        for x in m["mentions"]:
            if x["ticker"] in member_tickers and x.get("match_text"):
                return x["match_text"]
        return None

    seen: set[str] = set()
    picked: list[dict] = []
    for m in items[: TB.EXCERPT_CANDIDATES]:
        text = (m.get("text") or "").strip()
        if not text:
            continue
        dk = TB.dedupe_key(text)
        if not dk or dk in seen:
            continue
        seen.add(dk)
        picked.append(m)
        if len(picked) >= max(TB.EXCERPTS_DIGEST, TB.EXCERPTS_SHOWN):
            break

    excerpts = []
    for m in picked[: TB.EXCERPTS_SHOWN]:
        tagged = sorted({name_of.get(x["ticker"], x["ticker"]) for x in m["mentions"] if x["ticker"] in member_tickers})
        excerpts.append(
            {
                "channel_handle": m["channel_handle"],
                "message_id": m["message_id"],
                "posted_at": m["posted_at"],
                "views": m.get("views") or 0,
                "forwards": m.get("forwards") or 0,
                "text": TB.store_excerpt(m["text"], needle_for(m)),
                "stocks": tagged,
            }
        )

    top = per_stock.most_common(TB.TOP_STOCKS)
    rel = [{"theme": t, "messages": n} for t, n in related.most_common(TB.RELATED_KEEP)]
    lines = [
        f"[테마] {theme} · 미국 상장 종목",
        "[상위 종목] " + " · ".join(f"{name_of.get(t, t)}({t}) {n}건" for t, n in top)
        + "  ※ 큰 것을 알려는 숫자입니다. 문장에 옮기지 마세요",
        "",
        "[대표 메시지 발췌]",
    ]
    for m in picked[: TB.EXCERPTS_DIGEST]:
        lines.append(f"- {KR.excerpt(m['text'], needle_for(m))}")

    return {
        "digest": "\n".join(lines),
        "related": rel,
        "excerpts": excerpts,
        "message_count": len(items),
        "stock_count": len(per_stock),
    }


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    no_save = "--no-save" in args
    only: set[str] | None = None
    if "--theme" in args:
        only = {t.strip() for t in args[args.index("--theme") + 1].split(",") if t.strip()}
        unknown = only - set(US_THEMES)
        if unknown:
            print(f"[skip] 사전에 없는 테마: {', '.join(sorted(unknown))}")
            return

    if not HAS_LLM_CREDENTIAL and not dry_run:
        print("[skip] LLM 자격(구독 토큰·API 키)이 없어 미장 테마 요약을 건너뜁니다.")
        return

    db = get_client()
    rows = db.table("telegram_us_sentiment_daily").select("date").order("date", desc=True).limit(1).execute().data
    if not rows:
        print("[skip] telegram_us_sentiment_daily 가 비어 있습니다.")
        return
    latest = rows[0]["date"]
    since, end = US.window_dates(latest)
    print(f"[기준일] {latest} (창 {since} ~ {end})")

    name_of = {s["ticker"]: s["name_ko"] for s in load_all(db, "us_stocks", "ticker,name_ko", order_by="ticker")}
    themes_of: dict[str, list[str]] = defaultdict(list)
    for theme, tickers in US_THEMES.items():
        for t in tickers:
            themes_of[t].append(theme)

    msgs = [m for m in US.load_us_messages(db, since) if m["date"] <= end]
    print(f"[재료] 창 안 미국 언급 메시지 {len(msgs):,}건")

    # ── 둘째 몫: 급부상 종목의 이유 ── digest 는 종목 요약과 같은 함수·같은 창.
    risers = us_theme_risers(db, latest)
    riser_digests, _ = US.build_stock_digests(latest, msgs, name_of, tickers=[r["code"] for r in risers]) if risers else ([], [])
    digest_of = {t: d for t, _n, d in riser_digests}
    riser_of = {r["theme"]: r for r in risers}
    print(f"[급부상] {len(risers)}테마 · " + " · ".join(f"{r['theme']}:{r['name']}" for r in risers[:8]) + (" …" if len(risers) > 8 else ""))

    targets = [t for t in US_THEMES if only is None or t in only]
    bundles = {theme: build_us_theme_bundle(theme, set(US_THEMES[theme]), msgs, name_of, themes_of) for theme in targets}

    if dry_run:
        for theme in targets:
            b = bundles[theme]
            print("─" * 60)
            if b is None:
                print(f"[{theme}] 창 안에 언급된 글이 없습니다 — brief null 로 저장됩니다.")
                continue
            print(b["digest"])
            print(f"  · 글 {b['message_count']}건 · 종목 {b['stock_count']}개 · 발췌 {len(b['excerpts'])}건 · 함께 {b['related']}")
        print("─" * 60)
        for _t, _n, d in riser_digests[:3]:
            print(d)
            print("─" * 60)
        print("[dry-run] LLM 호출·저장 없이 종료합니다.")
        return

    client = get_llm_client(ANTHROPIC_API_KEY)

    def ask_with(system: str, digest: str) -> str:
        resp = client.messages.create(model=MODEL, max_tokens=500, system=system, messages=[{"role": "user", "content": digest}])
        return "".join(b.text for b in resp.content if b.type == "text").strip()

    saved = 0
    for theme in targets:
        b = bundles[theme]
        row = {"date": latest, "theme": theme, "brief": None, "related": [], "excerpts": [], "message_count": 0, "stock_count": 0, "model": None, "riser": None}
        try:
            if b is not None:
                text = TB.write_brief(ask_with, US_THEME_SYSTEM, b["digest"], theme)
                if text is None:
                    print(f"  [{theme}] 쓸 수 있는 문장이 없어(빈 응답이거나 전부 매수·매도 표현) 요약 없이 저장합니다.")
                row.update(brief=text, related=b["related"], excerpts=b["excerpts"], message_count=b["message_count"], stock_count=b["stock_count"], model=MODEL if text else None)
            r = riser_of.get(theme)
            if r is not None:
                # 화면이 국장과 같은 타입으로 읽는다 — code 에 티커, market 은 늘 "US"(lib/us-theme-page.ts).
                row["riser"] = {"code": r["code"], "name": r["name"], "market": "US", "recent": r["recent"], "prior": r["prior"], "ratio": r["ratio"],
                                "reason": TB.write_riser_reason(ask_with, US_RISER_SYSTEM, digest_of.get(r["code"]), r["name"])}
                print(f"  [{theme} · {r['name']}] {row['riser']['reason'] or '(이유 없음)'}")
            if not no_save:
                db.table(TABLE).upsert(row, on_conflict="date,theme").execute()
                saved += 1
            if row["brief"]:
                print(f"  [{theme}] ({len(row['brief'])}자) {row['brief']}")
            else:
                print(f"  [{theme}] 언급된 글이 없어 요약 없이 저장했습니다.")
        except Exception as exc:
            print(f"  [{theme}] 실패: {type(exc).__name__}: {exc}")

    print(f"[Supabase] {TABLE} {saved}/{len(targets)}테마 저장")


if __name__ == "__main__":
    main()

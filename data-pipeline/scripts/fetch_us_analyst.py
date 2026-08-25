"""미국 종목의 애널리스트 컨센서스(등급 분포 + 목표가)를 받아 us_analyst_consensus 에 저장한다.

내부자 리포트의 종목 상세가 읽는다. 공시 셋(임원·거물·의원)이 "이미 무엇을 했나"라면
이건 **"밖에서는 이 회사를 어떻게 보나"** 다 — 우리 표에 없던 유일한 바깥 시선이다.

## 원천

    https://stockanalysis.com/stocks/{티커}/forecast/

API 가 아니라 **웹페이지**다. 대신 페이지 안에 구조화된 덩어리가 심어져 있다::

    priceTargets:{source:"spg",currency:"USD",avg:304.73,median:300,low:180,high:500,numPriceTargets:59}
    currentRatings:{source:"spg",consensus:"Strong Buy",score:8.5484,count:62,strongBuy:49,buy:10,hold:2,sell:0,strongSell:1}

⭐ **산문을 긁지 말 것.** 같은 값이 "According to 62 analysts polled by S&P Global…"
   문장에도 있지만, 문장은 저쪽이 문구만 다듬어도 깨진다. 위 덩어리가 훨씬 덜 깨진다.
⚠️ 그래도 API 가 아니라 페이지다. **파싱 실패 수를 반드시 찍는다** — 저쪽이 바뀌면
   조용히 비는 게 아니라 눈에 띄어야 한다.

## ⚠️ 약관 — 발췌는 되고 전문 재게시는 안 된다

stockanalysis.com 이용약관: "It is not allowed to republish our content in full without
our explicit permission. However, you can use snippets of the content as long as you do
not modify the content and clearly state where you got it from."
자동 수집을 막는 조항은 없고 robots.txt 도 `/stocks/` 를 막지 않는다(2026-08-22 확인).

    ⛔ 숫자를 바꾸지 말 것 — 반올림·재계산·단위 변환 금지. 받은 그대로 담고 그대로 낸다.
    ⛔ 화면에서 출처 표기를 빼지 말 것. 이게 이용 조건이다.

## ⚠️ 왜 여기 한 곳뿐인가

등급은 Finnhub, 목표가는 여기서 받아 섞을 수도 있었다. **패널이 다르면 숫자가 서로 안
맞는다** — 실측으로 애널리스트 수가 Finnhub 68명 · S&P Global 62명이었다. 한 카드 안에
두 숫자가 다르면 독자는 어느 쪽도 못 믿는다. Finnhub 는 목표가가 유료(403)라 어차피
반쪽이었다.

## ⚠️ 시점은 우리가 찍는다

원천이 "언제 기준"인지를 안 준다. 받은 날짜를 키로 쌓아 두면 추이는 한 달쯤 지나 저절로
생긴다. 원천이 과거를 안 주므로 이 방법뿐이다.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402

BASE = "https://stockanalysis.com/stocks/{t}/forecast/"
# 개별 애널리스트 의견. 종목당 요청이 하나 더 늘어 수집이 3분 → 6분이 된다.
BASE_RATINGS = "https://stockanalysis.com/stocks/{t}/ratings/"

# 종목당 가져오는 의견 수. 원천 페이지가 싣는 최근 목록이 8건쯤이라 그만큼 받는다.
#
# ⚠️ 처음엔 5 였다. 약관의 "발췌"를 지키려고 여유를 둔 값이었는데, 그러면 화면의
#    '더 보기'가 영영 안 뜬다(하루치가 곧 전부라서). 2026-08-22 에 8로 올렸다.
#
# ⚠️ 이 수를 더 올리지 말 것. 저쪽 페이지가 싣는 것보다 많이 가져올 방법도 없고,
#    있더라도 그건 "발췌"가 아니다.
# ⛔ 애널리스트 적중률·순위(`scores`)는 가져오지 않는다 — 그쪽 유료 상품의 핵심이다.
# ⛔ 화면의 출처 표기(푸터의 '미국 공시·전망')를 빼지 말 것. 이게 이용 조건이다.
KEEP_ACTIONS = 8

# ⚠️ 우리 티커와 저쪽 주소가 갈리는 자리. 우리 표는 `BRK` 로만 담는데(클래스 구분이
#    없다) 저쪽은 클래스별로 주소가 나뉜다 — `/stocks/brk/` 는 404, `/stocks/brk.b/`
#    가 200 이다. 실측 179종목 중 어긋난 것은 이 하나뿐이었다.
# ⭐ 못 받은 종목 수를 찍게 해 뒀더니 이게 바로 드러났다. 조용히 넘어갔으면 버크셔만
#    영영 빈 채로 남았을 것이다.
SLUG = {"BRK": "brk.b"}
# 우리를 밝힌다. 실측으로 이 UA 도 200 이 온다(브라우저 흉내를 낼 필요가 없었다).
UA = {"User-Agent": "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)"}
# robots.txt 에 crawl-delay 가 없지만 179종목을 3분에 걸쳐 나눠 받는다.
# 못 받은 종목이 이 비율을 넘으면 **스크립트를 죽인다.** 30 은 실측 기준이다 —
# 정상일 때 못 받는 종목은 0~2개(1% 안팎)라 30% 는 사고일 때만 닿는다.
FAIL_PCT_MAX = 30

SLEEP = 1.0

# `key:{a:1,b:"x"}` 꼴의 덩어리를 통째로 집는다.
BLOCK = re.compile(r"(priceTargets|currentRatings):\{([^{}]*)\}")
# 그 안의 `키:값` 쌍. ⚠️ 값이 `void 0` 나 `null` 로 오는 칸이 있다.
PAIR = re.compile(r'(\w+):("(?:[^"\\]|\\.)*"|-?[\d.]+|void 0|null|true|false)')


def parse_block(raw: str) -> dict:
    """JS 객체 리터럴 한 덩어리를 dict 로. **키 순서에 기대지 않는다** — 저쪽이 칸을
    더하거나 자리를 바꿔도 살아남아야 한다."""
    out: dict[str, object] = {}
    for k, v in PAIR.findall(raw):
        if v.startswith('"'):
            out[k] = v[1:-1]
        elif v in ("void 0", "null"):
            out[k] = None
        elif v in ("true", "false"):
            out[k] = v == "true"
        else:
            out[k] = float(v)
    return out


def num(v: object) -> float | None:
    return float(v) if isinstance(v, (int, float)) else None


def intn(v: object) -> int | None:
    return int(v) if isinstance(v, (int, float)) else None


def fetch(ticker: str, url_tpl: str = BASE, tries: int = 3) -> str | None:
    url = url_tpl.format(t=SLUG.get(ticker.upper(), ticker.lower()))
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            # 404 는 그 종목 페이지가 없는 것이다. 다시 쳐도 안 된다.
            if e.code == 404:
                return None
            print(f"    HTTP {e.code} {ticker} ({i + 1}/{tries})")
            time.sleep(3)
        except Exception as e:  # noqa: BLE001
            print(f"    실패({type(e).__name__}) {ticker} ({i + 1}/{tries})")
            time.sleep(3)
    return None


def row_for(ticker: str, as_of: dt.date) -> dict | None:
    html = fetch(ticker)
    if not html:
        return None
    blocks = {name: parse_block(body) for name, body in BLOCK.findall(html)}
    pt = blocks.get("priceTargets") or {}
    rt = blocks.get("currentRatings") or {}
    # 둘 다 비면 파싱이 깨진 것이거나 커버리지가 없는 것이다. 부르는 쪽이 수를 센다.
    if not pt and not rt:
        return None
    return {
        "ticker": ticker,
        "as_of_date": as_of.isoformat(),
        "consensus": rt.get("consensus") or None,
        "score": num(rt.get("score")),
        "analyst_count": intn(rt.get("count")),
        "strong_buy": intn(rt.get("strongBuy")),
        "buy": intn(rt.get("buy")),
        "hold": intn(rt.get("hold")),
        "sell": intn(rt.get("sell")),
        "strong_sell": intn(rt.get("strongSell")),
        "target_avg": num(pt.get("avg")),
        "target_median": num(pt.get("median")),
        "target_low": num(pt.get("low")),
        "target_high": num(pt.get("high")),
        "target_count": intn(pt.get("numPriceTargets")),
        "currency": pt.get("currency") or rt.get("currency") or None,
        "source": pt.get("source") or rt.get("source") or None,
    }


def actions_for(ticker: str) -> list[dict]:
    """개별 애널리스트 의견 최근 몇 건. 없으면 빈 목록이다.

    ⚠️ 이 덩어리도 JS 객체 리터럴이다. `scores:{…}` 처럼 **중첩된 객체**가 있어서
       `[^{}]*` 로는 못 자른다 — 대괄호·중괄호 깊이를 세어 끝을 찾는다.
    """
    html = fetch(ticker, BASE_RATINGS)
    if not html:
        return []
    i = html.find("ratings:[")
    if i < 0:
        return []
    start = i + len("ratings:")
    depth = 0
    end = -1
    for k in range(start, len(html)):
        if html[k] == "[":
            depth += 1
        elif html[k] == "]":
            depth -= 1
            if depth == 0:
                end = k
                break
    if end < 0:
        return []
    blob = html[start : end + 1]

    out: list[dict] = []
    # 한 줄은 `{...}` 인데 안에 `scores:{...}` 가 또 있다. 깊이를 세어 줄 단위로 자른다.
    depth = 0
    piece_start = -1
    pieces: list[str] = []
    for k, ch in enumerate(blob):
        if ch == "{":
            if depth == 0:
                piece_start = k
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and piece_start >= 0:
                pieces.append(blob[piece_start : k + 1])
    for piece in pieces[:KEEP_ACTIONS]:
        # ⛔ scores 는 통째로 버린다. 파싱 전에 잘라 내야 그 안의 키가 안 섞인다.
        flat = re.sub(r"scores:\{[^{}]*\}", "", piece)
        d = parse_block(flat)
        date = d.get("date")
        analyst = d.get("analyst") or "Unknown Analyst"
        firm = d.get("firm")
        if not date or not firm:
            continue
        out.append(
            {
                "ticker": ticker,
                "action_date": str(date),
                "analyst": str(analyst),
                "firm": str(firm),
                "rating_new": d.get("rating_new") or None,
                "action": d.get("action_rt") or None,
                "target_now": num(d.get("pt_now")),
                "target_old": num(d.get("pt_old")),
                "currency": d.get("curr") or None,
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=str, default=None, help="티커 하나만(쉼표로 여럿)")
    ap.add_argument("--dry-run", action="store_true", help="DB 에 안 쓰고 측정만")
    args = ap.parse_args()

    db = get_client()
    if args.only:
        tickers = [t.strip().upper() for t in args.only.split(",") if t.strip()]
    else:
        # ⚠️ us_stocks 는 카더라에 오른 미국 종목이다. 1,000행을 넘길 표가 아니지만
        #    넘기는 날이 오면 조용히 잘리므로 수를 찍어 둔다.
        got = db.table("us_stocks").select("ticker").order("ticker").limit(1000).execute().data
        tickers = [r["ticker"] for r in got]
    as_of = dt.date.today()
    print(f"종목 {len(tickers)}개 · 기준일 {as_of} · 예상 {len(tickers) * SLEEP * 2 / 60:.1f}분")

    rows: list[dict] = []
    actions: list[dict] = []
    failed: list[str] = []
    no_action: list[str] = []
    for i, t in enumerate(tickers, 1):
        row = row_for(t, as_of)
        if row:
            rows.append(row)
        else:
            failed.append(t)
        time.sleep(SLEEP)
        got = actions_for(t)
        if got:
            actions += got
        else:
            no_action.append(t)
        if i % 25 == 0:
            print(f"  {i}/{len(tickers)} · 컨센서스 {len(rows)}개 · 개별 의견 {len(actions)}건")
        time.sleep(SLEEP)

    broken = ""  # 원천이 깨졌다고 볼 만한 사유. 저장을 마친 뒤 이걸로 죽는다.
    have_pt = sum(1 for r in rows if r["target_avg"] is not None)
    have_rt = sum(1 for r in rows if r["analyst_count"] is not None)
    print(f"\n행 {len(rows)}개 · 목표가 있는 것 {have_pt}개 · 등급 있는 것 {have_rt}개")
    if failed:
        # ⛔⛔ 조용히 넘어가지 말 것. 이건 API 가 아니라 페이지라, 저쪽이 화면을 바꾸면
        #     여기 수가 갑자기 는다. 그게 유일한 조기 경보다.
        pct = len(failed) * 100 // max(1, len(tickers))
        print(f"  ⚠️ 못 받은 종목 {len(failed)}개({pct}%): {', '.join(failed[:12])}{' …' if len(failed) > 12 else ''}")
        if pct >= FAIL_PCT_MAX:
            print("  ⚠️⚠️ 실패가 30% 를 넘는다. 원천 페이지 구조가 바뀌었을 수 있다 — 파서를 볼 것.")
            broken = f"못 받은 종목이 {pct}% ({len(failed)}/{len(tickers)})다."

    print(f"개별 의견 {len(actions)}건 · 종목 {len({a['ticker'] for a in actions})}개")
    if no_action:
        # ⚠️ 컨센서스는 있는데 개별 의견만 비는 종목이 있다. 저쪽은 최근 의견이 없으면
        #    `/ratings/` 페이지 자체를 안 만든다 — 404 다(`/forecast/` 는 200 인데도).
        #    실측 2026-08-22: 179개 중 BRK·WOLF 둘. 고장이 아니라 커버리지다.
        #    ⚠️ 그래도 갑자기 늘면 원천 구조가 바뀐 것이니 이 줄을 보고 판단할 것.
        pct = len(no_action) * 100 // max(1, len(tickers))
        print(f"  개별 의견이 없는 종목 {len(no_action)}개({pct}%): {', '.join(no_action[:10])}{' …' if len(no_action) > 10 else ''}")

    if args.dry_run:
        print("(저장 안 함)")
        return
    # ⛔ **한 종목도 못 받은 건 조용히 끝낼 일이 아니다.** 179종목을 도는데 0개면
    #    원천이 통째로 막힌 것이다. 예전엔 여기서 그냥 return 이라 스텝이 성공으로
    #    끝났다 — 위 30% 가드보다 이쪽이 더 나쁜 경우인데 소리가 더 작았다.
    if not rows:
        raise SystemExit("한 종목도 못 받았다. 원천이 막혔거나 페이지 구조가 바뀌었다.")

    for i in range(0, len(rows), 500):
        db.table("us_analyst_consensus").upsert(rows[i : i + 500], on_conflict="ticker,as_of_date").execute()
    print(f"[Supabase] us_analyst_consensus {len(rows)}행 upsert 완료")
    for i in range(0, len(actions), 500):
        db.table("us_analyst_action").upsert(actions[i : i + 500], on_conflict="ticker,action_date,firm,analyst").execute()
    print(f"[Supabase] us_analyst_action {len(actions)}행 upsert 완료")

    # ⛔⛔ **경고를 찍고 0 으로 끝나면 아무도 모른다.** 워크플로의 내부자 알림은 스텝의
    #     성패만 보므로, 여기서 정상 종료하면 "성공"으로 집계되고 이슈가 안 열린다.
    #     워크플로 주석은 "아래 요약이 실패로 잡아 준다"고 적어 두었는데 잡을 방법이
    #     없었다(2026-08-25 확인). 이 화면은 원천이 API 가 아니라 **페이지**라, 저쪽이
    #     구조를 바꾸면 조용히 비는 게 유일한 고장 모드다 — 그때 소리가 나야 한다.
    # ⚠️ 죽는 자리가 **저장 다음**인 것이 중요하다. 위에서 죽으면 그날 받아 둔 것까지
    #     통째로 잃는다. 받은 만큼은 넣고, 알림만 켠다.
    if broken:
        raise SystemExit(broken + " 원천 페이지 구조가 바뀌었을 수 있다 — 파서를 볼 것.")


if __name__ == "__main__":
    main()

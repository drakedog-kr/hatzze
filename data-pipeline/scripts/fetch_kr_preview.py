"""간밤 미장에서 크게 움직인 종목을 골라 국내 짝과 함께 `kr_preview_daily` 에 넣는다.

국장 미리보기 화면(/preview)이 이 표 하나를 읽는다.

## 무엇을 하나

    ① 사전(config/us_kr_pairs.py)의 미국 70종목 간밤 등락을 핀허브에서 받는다
    ② S&P500 몫을 빼고 그 종목 평소 폭으로 나눠 z 를 낸다
    ③ z 가 문턱을 넘은 종목만 남기고, 사전에서 국내 짝을 붙여 줄로 편다

## ⚠️ 핀허브 무료는 분당 60건이다

실측으로 70종목을 잇달아 부르면 **60개까지 받고 나머지가 429** 로 막힌다. 그래서 55건마다
창이 지나가길 기다린다. 전체 70초 남짓이다. 이 값을 올리지 말 것 — 막히면 그날 카드가
통째로 반쪽이 되는데, 부분 실패는 화면에서 "조용한 날"과 구별이 안 된다.

## ⚠️ 언제 도는가 — KRX 게이트 **앞**이다

미국 정규장 마감이 여름 05시·겨울 06시 KST 이고 아침 실행이 07시 30분쯤 시작한다. 이 표는
KRX 를 안 쓰므로 08시 공표를 기다릴 이유가 없다. 지표 블록 뒤에 붙이면 완료가 09시를 넘어
**개장 뒤에 뜬다** — 그러면 미리보기가 아니다. 카더라 블록 자리에 두면 07시 35분쯤 끝난다.

## ⚠️ 날짜는 국내 거래일이다

간밤 미장은 전날 세션이라 미국 날짜와 하루 어긋난다. 표의 `date` 는 이 카드를 보는
**국내 거래일**이고, 화면에서 "그날 미장"이라고 쓰면 안 된다.

## 평소 폭은 왜 사전에 박혀 있나

핀허브 무료는 과거 캔들을 안 줘서 표준편차를 실시간으로 못 구한다. 그래서 `US_VOL` 에
적어 두고 쌍 수치를 다시 잴 때 **같은 실행에서 함께** 갱신한다. 따로 재면 기준이 갈린다.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402
from config.us_kr_pairs import PAIRS, TICKERS, US_VOL  # noqa: E402
from config.us_stock_themes import US_THEMES  # noqa: E402

QUOTE = "https://finnhub.io/api/v1/quote?symbol={t}&token={k}"

# 지수 대용. 핀허브 무료가 ^GSPC 를 안 줘서 S&P500 ETF 를 쓴다(spx_change 주석 참고).
SPX_PROXY = "SPY"

# 미 동부. 서머타임을 안 따지고 −4 로 고정한다 — 여기서는 **날짜만** 보는데, 정규장
# (09:30~16:00 ET)은 −4 로 봐도 −5 로 봐도 같은 날짜에 들어간다.
ET = timezone(timedelta(hours=-4))

# ⚠️ 핀허브 무료 티어의 분당 한도가 60 이다. 55 마다 창을 넘긴다(여유 5건).
BATCH = 55
WINDOW_SEC = 62

# 평소 폭의 몇 배부터 카드로 삼나. 1.0 은 **넓이를 고른 값**이다 — 실측으로 1.5 면 하루
# 미국 6종목·쌍 17개인데 1.0 이면 25종목·44개가 된다(2026-08-27). 골라 보일수록 조금
# 정확하지만(백테스트 상위 5장 70.0% 대 전부 67.1%), 이 화면이 파는 건 고른 예측이 아니라
# "간밤에 무엇이 움직였고 국내 어디와 엮이나"의 넓이다.
Z_MIN = 1.0

# 미국 종목 하나에 붙이는 국내 종목 수. 사전에는 아홉까지 이어진 것도 있는데(테슬라)
# 넷째부터는 과거 초과갭이 0.2~0.7%p 대라 줄만 길어진다. 상관 큰 순으로 앞에서 자른다.
LINKS_MAX = 3

# 못 받은 종목이 이 비율을 넘으면 죽인다. 부분 실패가 화면에서 '조용한 날'로 위장하는 걸
# 막는다 — 카드가 적은 건 정상일 수 있어서 눈으로는 구별이 안 된다.
FAIL_PCT_MAX = 20

SECTOR = {t: k for k, v in US_THEMES.items() for t in v}


def quote(ticker: str, key: str) -> tuple[float, str] | None:
    """(간밤 등락률 %, 그 값이 속한 미국 장 날짜). 못 받으면 None.

    ⭐ 날짜를 함께 돌려주는 이유는 **지수와 종목이 같은 날인지 맞춰 보기 위해서**다.
    아래 `spx_change` 주석 참고 — 다른 날끼리 빼면 초과분이 아니라 잡음이 된다.
    """
    # ⚠️ 잡는 예외를 좁히지 말 것. 처음엔 (URLError, TimeoutError, JSONDecodeError) 만
    # 잡았는데 2026-08-30 에 `http.client.RemoteDisconnected` 가 그 그물을 빠져나가
    # 스크립트가 통째로 죽었다(핀허브가 연달아 부르면 응답 없이 연결을 끊는다).
    # OSError 가 URLError·TimeoutError·ConnectionReset 을 다 덮고, HTTPException 이
    # RemoteDisconnected·BadStatusLine 을 덮는다.
    #
    # 한 번은 다시 걸어 본다 — 끊긴 연결 하나 때문에 종목을 버릴 이유가 없다.
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(QUOTE.format(t=ticker, k=key), timeout=15) as r:
                d = json.load(r)
            break
        except (OSError, http.client.HTTPException, json.JSONDecodeError) as e:
            if attempt == 1:
                time.sleep(2)
                continue
            print(f"[경고] {ticker}: {type(e).__name__}")
            return None
    # ⚠️ 429 는 본문이 `{"error": ...}` 로 온다. c 가 0 이거나 없으면 값이 아니다.
    if not d.get("c") or d.get("dp") is None or not d.get("t"):
        print(f"[경고] {ticker}: {str(d)[:60]}")
        return None
    # `t` 는 마지막 체결의 UTC 초. 미 동부로 옮겨 날짜만 본다(정규장은 한 날짜 안에 있다).
    day = datetime.fromtimestamp(int(d["t"]), timezone.utc).astimezone(ET).strftime("%Y-%m-%d")
    return float(d["dp"]), day


def spx_change(key: str) -> tuple[float, str]:
    """S&P500 간밤 등락률(%)과 그 날짜. 종목의 초과분을 내는 데 쓴다.

    ⚠️⚠️ **야후(^GSPC)로 되돌리지 말 것.** 2026-08-30 에 두 가지로 틀렸다.

      ① 야후가 08-28(금) 종가를 **NaN 으로** 줬다. `pct_change()` 의 기본값이
         fill_method='pad' 라 NaN 을 전날 값으로 메우고, 그래서 등락률이 **정확히
         0.00%** 로 나왔다. 0 이면 초과분 계산에서 지수 몫이 통째로 빠진다 —
         빠졌다는 티도 안 난다. 그날 문턱을 넘은 종목이 19개에서 24개로 늘었다.
      ② NaN 을 버리고 계산해도 **하루 전 값**(+0.72%)이 나온다. 종목 시세는 핀허브라
         금요일 것인데 지수만 목요일 것이라, 다른 날끼리 빼는 꼴이 된다.

    핀허브 무료는 지수(^GSPC)를 안 주지만 **SPY 는 준다** — ETF 라 그냥 종목이다.
    같은 API·같은 세션이라 날짜가 어긋날 수 없고, 야후 의존이 사라진다. 배당·괴리로
    지수와 소수점이 조금 다르지만 베타 보정용으로는 차이가 없다.
    """
    q = quote(SPX_PROXY, key)
    if q is None:
        raise SystemExit(f"[중단] {SPX_PROXY} 를 못 받았습니다 — 초과분을 낼 수 없습니다")
    return q


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 무엇이 뽑히는지만 찍는다")
    args = ap.parse_args()

    key = os.environ.get("FINNHUB_API_KEY")
    if not key:
        raise SystemExit("[중단] FINNHUB_API_KEY 가 없습니다")

    spx, spx_day = spx_change(key)
    print(f"[기준] {SPX_PROXY} {spx_day} 종가 {spx:+.2f}%")

    dps: dict[str, float] = {}
    days: dict[str, int] = {}
    # 지수까지 세어 한 창에 담는다 — 71번째가 되면 429 가 난다.
    for i, t in enumerate(TICKERS, start=1):
        if i % BATCH == 0:
            print(f"[대기] 분당 한도 때문에 {WINDOW_SEC}초 쉽니다 ({i}/{len(TICKERS)})")
            time.sleep(WINDOW_SEC)
        v = quote(t, key)
        if v is not None:
            dps[t], day = v[0], v[1]
            days[day] = days.get(day, 0) + 1

    fail_pct = (len(TICKERS) - len(dps)) / len(TICKERS) * 100
    print(f"[수집] {len(dps)}/{len(TICKERS)}종목 (실패 {fail_pct:.0f}%)")
    if fail_pct > FAIL_PCT_MAX:
        raise SystemExit(f"[중단] 실패가 {fail_pct:.0f}% 입니다 — 반쪽짜리 카드는 '조용한 날'과 구별이 안 됩니다")

    # ⚠️⚠️ **지수와 종목이 같은 날인지 맞춰 본다.** 다른 날끼리 빼면 초과분이 아니라
    # 잡음이고, 그런데도 숫자는 멀쩡해 보인다(2026-08-30 에 실제로 그랬다 — spx_change
    # 주석 참고). 지금은 지수도 종목도 같은 핀허브라 어긋날 일이 없지만, 원천이 갈리는
    # 순간 다시 조용히 틀린다. 그래서 여기서 한 번 확인한다.
    stock_day = max(days, key=lambda d: days[d]) if days else ""
    if stock_day != spx_day:
        raise SystemExit(
            f"[중단] 지수는 {spx_day} 인데 종목 다수는 {stock_day} 입니다 — 다른 날끼리 빼면 초과분이 아닙니다"
        )
    if len(days) > 1:
        odd = {d: n for d, n in days.items() if d != stock_day}
        print(f"[경고] 날짜가 다른 종목이 섞였습니다: {odd} (다수 {stock_day} 기준으로 갑니다)")

    # 문턱을 넘은 종목만 남긴다.
    movers = []
    for t, dp in dps.items():
        beta, sd = US_VOL.get(t, (1.0, 0.0))
        if sd <= 0:
            continue
        z = abs(dp - beta * spx) / sd
        if z >= Z_MIN:
            movers.append((t, dp, round(z, 1)))
    print(f"[선별] 평소의 {Z_MIN}배를 넘은 종목 {len(movers)}개")

    by_ticker: dict[str, list] = {}
    for p in PAIRS:
        by_ticker.setdefault(p.ticker, []).append(p)

    today = today_kst()
    rows = []
    for t, dp, z in movers:
        ps = sorted(by_ticker.get(t, []), key=lambda p: -p.corr)[:LINKS_MAX]
        for p in ps:
            rows.append(
                {
                    "date": today.isoformat(),
                    "ticker": t,
                    "us_name": p.ticker,  # 아래에서 한글 표기로 채운다
                    "sector": SECTOR.get(t, "기타"),
                    "us_dp": round(dp, 2),
                    "us_z": z,
                    "stock_name": p.stock,
                    "why": p.why,
                    "gap": p.mean_gap,
                    "events": p.events,
                }
            )
    if not rows:
        print("[결과] 간밤 크게 움직인 종목이 없습니다 — 오늘은 빈 화면입니다")

    db = get_client()
    # 종목 코드와 한글 표기는 우리 표에서 채운다. 사전은 이름만 갖고 있다.
    names = sorted({r["stock_name"] for r in rows})
    codes: dict[str, str] = {}
    for i in range(0, len(names), 100):
        chunk = names[i : i + 100]
        got = db.table("stocks").select("code,name").in_("name", chunk).execute().data
        codes.update({r["name"]: r["code"] for r in got})
    us_names: dict[str, str] = {}
    if rows:
        got = db.table("us_stocks").select("ticker,name_ko").in_("ticker", sorted({r["ticker"] for r in rows})).execute().data
        us_names = {r["ticker"]: r["name_ko"] for r in got}

    kept = []
    for r in rows:
        code = codes.get(r["stock_name"])
        if not code:
            # 상장폐지·개명으로 사전의 이름이 표에 없을 수 있다. 조용히 빠지면 안 된다.
            print(f"[경고] 국내 종목 코드를 못 찾음: {r['stock_name']} (사전을 손봐야 합니다)")
            continue
        r["stock_code"] = code
        r["us_name"] = us_names.get(r["ticker"], r["ticker"])
        kept.append(r)

    print(f"[정리] {len(kept)}줄 (미국 {len({r['ticker'] for r in kept})}종목 · 섹터 {len({r['sector'] for r in kept})}개)")
    for r in sorted(kept, key=lambda r: -abs(r["us_dp"]))[:8]:
        print(f"   {r['sector']:14s} {r['ticker']:6s} {r['us_dp']:+6.2f}% (평소의 {r['us_z']}배) → {r['stock_name']} {r['gap']:+.2f}%p")

    if args.dry_run:
        print("[건너뜀] --dry-run 이라 저장하지 않습니다")
        return

    # 그날 것을 통째로 갈아 끼운다. 문턱이나 사전을 고치면 같은 날에도 결과가 달라지므로
    # 남겨 두면 옛 줄과 새 줄이 섞인다.
    db.table("kr_preview_daily").delete().eq("date", today.isoformat()).execute()
    if kept:
        db.table("kr_preview_daily").upsert(kept, on_conflict="date,ticker,stock_code").execute()
    print(f"[저장] {today} · {len(kept)}줄")


if __name__ == "__main__":
    main()

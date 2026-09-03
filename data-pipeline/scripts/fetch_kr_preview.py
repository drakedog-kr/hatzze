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
from common.timeutil import KST, today_kst  # noqa: E402
from config.us_kr_pairs import PAIRS, TICKERS, US_NAMES, US_SECTORS, US_VOL  # noqa: E402
from config.us_stock_themes import US_THEMES  # noqa: E402

QUOTE = "https://finnhub.io/api/v1/quote?symbol={t}&token={k}"

# 계산용 지수 대용. 핀허브 무료는 지수를 안 준다("Market data subscription required for
# CFD indices" — SPX·^SPX·US500 다 막혔다). **화면에 내는 숫자는 이게 아니다** —
# 야후에서 진짜 지수를 받는다(index_change 주석 참고).
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

# ── 어떤 쌍을 화면에 낼 것인가 ────────────────────────────────────────────
#
# ⭐ **넓이가 아니라 깊이로 간다(2026-09-02).** 사전 142쌍을 다 내보내면 하루 19타일이
# 되는데, 그중 상당수가 "관계는 있으나 가격은 거의 안 따라가는" 쌍이라 카드가 늘어날수록
# 화면이 흐려졌다. 두 문턱을 넘는 것만 남긴다 — 62쌍 · 미국 28종목이 남는다.
#
#   corr        미국 초과 등락 ↔ 국내 초과 개장 갭의 5년 상관. 크기까지 같이 보는 잣대라
#               방향만 맞고 폭이 제각각이면 낮게 나온다.
#   평소 대비    미국이 크게 움직인 날들 가운데 국내가 같은 방향으로 열린 비율에서,
#               **아무 날이나 골랐을 때의 비율을 뺀 값.** 잘 오르는 종목은 아무 날이나
#               60%씩 오르므로, 빼지 않으면 우위가 0 인 쌍이 대단해 보인다.
#               두 방향(오른 날·내린 날) 중 **나쁜 쪽**으로 잰다 — 한쪽만 좋은 쌍은
#               우연일 가능성이 크다.
#
# ⭐ **왜 이 숫자인가(2026-09-02 실측).**
#   · 8%p 는 통계가 정하는 바닥이다. 쌍마다 사건이 140번 안팎이라 표준오차가 4.2%p 이고,
#     8%p 는 그 1.9배다. 더 내리면 화면에 적는 우위가 그 쌍의 오차 안에 들어간다.
#     ⛔ **이 값을 8 아래로 내리지 말 것.** 없는 것을 있다고 말하게 된다.
#   · 0.12 는 우연의 네 배다(1,175일이면 우연 상관이 0.029). 사전 채택 문턱 0.078 보다
#     한참 위다. 한때 0.15 로 뒀는데, 그러면 **카드가 두 장 이하인 날이 13%** 나 됐다
#     (0.12 면 6%). 통계적으로 얻는 건 없고 빈 날만 늘어서 내렸다.
#
# ⚠️ 사전에서 쌍을 지우지는 않는다. 측정값은 그대로 두고 **화면에 낼 때만** 거른다 —
#    문턱을 바꿔 보려면 이 두 숫자만 만지면 되고, 지웠다 되살리는 일이 없다.
STRONG_CORR = 0.12
STRONG_EDGE = 0.08

# 미국 종목 하나에 붙이는 국내 종목 수.
# ⚠️ 예전엔 3 이었다. 위 문턱을 세우기 전에는 약한 쌍이 뒤에 줄줄이 붙어서 자를 수밖에
# 없었는데, 지금 남는 건 전부 깊은 쌍이라 자를 이유가 없다. 테슬라 7개, 어플라이드
# 머티리얼즈 6개, 뱅크오브아메리카 5개가 한 타일에 다 선다 — 그게 이 화면의 값어치다.
LINKS_MAX = 9

# 못 받은 종목이 이 비율을 넘으면 죽인다. 부분 실패가 화면에서 '조용한 날'로 위장하는 걸
# 막는다 — 카드가 적은 건 정상일 수 있어서 눈으로는 구별이 안 된다.
FAIL_PCT_MAX = 20

# ⚠️ 카더라 테마 사전이 먼저고, 거기 없는 종목만 쌍 사전이 채운다(둘 다 없으면 "기타").
# 이 화면의 쌍 사전이 그 테마 사전보다 넓다 — US_NAMES 와 같은 사정이다.
SECTOR = US_SECTORS | {t: k for k, v in US_THEMES.items() for t in v}


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


def index_change(session_day: str) -> float | None:
    """**화면에 내보일** S&P500 지수(^GSPC) 등락률(%). 못 믿을 값이면 None.

    ⚠️⚠️ **왜 SPY 로 안 되나 — 계산과 화면은 쓰임이 다르다.**

      계산  종목의 초과분(`ex = dp - beta*spx`). 여기는 SPY 가 낫다. 종목 시세와 **같은
            API·같은 세션**이라 날짜가 어긋날 수 없고, 독자가 볼 일도 없다.
      화면  히어로의 큰 숫자. 독자가 **뉴스와 맞대 본다.** 여기는 지수여야 한다.

    5년 실측으로 지수와 SPY 는 **90.7%의 날에 소수 둘째 자리가 다르다**(중앙값 0.026%p ·
    21%의 날은 0.05%p 이상 · 최대 0.99%p). 2026-09-03 에 화면이 +0.44% 를 내는 동안
    실제 지수는 +0.46% 였고 그날 바로 지적을 받았다. 하루 만에 들킬 크기다.

    ⚠️⚠️ **2026-08-30 에 야후로 두 번 틀렸다. 그래서 문을 두 개 단다.**

      ① 야후가 08-28(금) 종가를 **null 로** 준다(오늘도 여전히 그렇다). 그걸 메우면
         등락이 조용히 0 이 되고, 버리면 **하루 전 값**이 나온다.
      ② 그래서 (a) 마지막 유효 종가의 날짜가 핀허브가 준 세션 날짜와 **같아야** 하고,
         (b) 그 바로 앞 칸도 **비어 있지 않아야** 한다. 앞이 비면 이틀치를 하루로
         세는 셈이 된다.

    둘 중 하나라도 어긋나면 None 을 돌려주고 호출한 쪽이 SPY 로 간다. 이 화면의 정확도는
    소수점 둘째 자리에서 갈리므로, **틀린 값보다 0.02%p 덜 정확한 값이 낫다.**
    """
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=10d&interval=1d"
    try:
        # ⚠️ User-Agent 가 없으면 야후가 429 를 준다.
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.load(r)
        res = d["chart"]["result"][0]
        ts, close = res["timestamp"], res["indicators"]["quote"][0]["close"]
    except (OSError, http.client.HTTPException, json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
        print(f"[경고] 지수(^GSPC)를 못 받았습니다({e}) — 화면 숫자는 {SPX_PROXY} 로 갑니다")
        return None

    rows = [
        (datetime.fromtimestamp(int(t), timezone.utc).astimezone(ET).strftime("%Y-%m-%d"), c)
        for t, c in zip(ts, close)
    ]
    valid = [i for i, (_, c) in enumerate(rows) if c is not None]
    if len(valid) < 2:
        print("[경고] 지수 종가가 두 개도 안 됩니다 — 화면 숫자는 " + SPX_PROXY + " 로 갑니다")
        return None
    last, prev = valid[-1], valid[-2]
    if rows[last][0] != session_day:
        print(f"[경고] 지수는 {rows[last][0]} 인데 종목은 {session_day} 입니다 — 화면 숫자는 {SPX_PROXY} 로 갑니다")
        return None
    if last - prev != 1:
        print(f"[경고] 지수 {rows[last][0]} 바로 앞 칸이 비었습니다 — 이틀치가 됩니다. 화면 숫자는 {SPX_PROXY} 로 갑니다")
        return None
    return (rows[last][1] / rows[prev][1] - 1) * 100


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 무엇이 뽑히는지만 찍는다")
    ap.add_argument("--force", action="store_true", help="오후에도 돌린다(위 아침 게이트를 넘는다)")
    args = ap.parse_args()

    # ── ⛔ 아침에만 돈다 ─────────────────────────────────────────────────────
    #
    # 워크플로 `if:` 로도 막지만 그것만으로는 **주말에 새는 구멍**이 있다. 시계는 Vercel
    # 크론이고 아침은 `broadcast=morning`(평일) 또는 `none`(주말), 저녁은 `evening`(평일)
    # 또는 `none`(주말)을 던진다 — **주말엔 아침과 저녁이 같은 값**이라 YAML 로는 못 가른다.
    # 그대로 두면 토·일 저녁에 한 번 더 돌아 같은 값을 덮어쓰며 핀허브 80회를 헛쓴다.
    #
    # 그래서 시각으로 못박는다. 이 화면은 국장 개장 전에 쓰는 것이라 오후에 돌 이유가 없다.
    # ⚠️ 트리거가 또 바뀌어도 이 줄은 그대로 지켜 준다. YAML 조건은 첫 번째 문일 뿐이다.
    if not args.force and datetime.now(KST).hour >= 12:
        print(f"[건너뜀] 지금 KST {datetime.now(KST):%H:%M} — 이 화면은 개장 전에만 씁니다"
              " (손으로 돌리려면 --force)")
        return

    key = os.environ.get("FINNHUB_API_KEY")
    if not key:
        raise SystemExit("[중단] FINNHUB_API_KEY 가 없습니다")

    spx, spx_day = spx_change(key)
    # ⚠️ 둘을 헷갈리지 말 것. `spx` 는 초과분을 내는 **계산용**(SPY)이고 `shown` 은
    # 히어로가 내보이는 **화면용**(지수)이다. 표에는 화면용이 들어간다.
    shown = index_change(spx_day)
    if shown is None:
        shown = spx
    print(f"[기준] {SPX_PROXY} {spx_day} 종가 {spx:+.2f}% (계산용) · 화면 숫자 {shown:+.2f}%")

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
    #
    # ⚠️⚠️ **방향은 등락률이 아니라 초과분의 부호로 정한다.** 사전의 up/down 이 그렇게
    # 정의돼 있다 — 시장이 3% 오른 날 어떤 종목이 1% 오른 건 사전 기준으로 '내린 날'이다.
    # dp 부호로 고르면 그 날들에 엉뚱한 방향의 성적을 붙이게 된다.
    movers = []
    for t, dp in dps.items():
        beta, sd = US_VOL.get(t, (1.0, 0.0))
        if sd <= 0:
            continue
        ex = dp - beta * spx
        z = abs(ex) / sd
        if z >= Z_MIN:
            movers.append((t, dp, round(z, 1), ex > 0))
    print(f"[선별] 평소의 {Z_MIN}배를 넘은 종목 {len(movers)}개")

    def strong(p) -> bool:
        """깊은 쌍인가. 두 방향 중 **나쁜 쪽**으로 잰다(위 STRONG_* 주석 참고)."""
        edge = min((p.up.wins - p.up.base) / p.up.n, (p.down.wins - p.down.base) / p.down.n)
        return p.corr >= STRONG_CORR and edge >= STRONG_EDGE

    by_ticker: dict[str, list] = {}
    for p in PAIRS:
        if strong(p):
            by_ticker.setdefault(p.ticker, []).append(p)
    print(f"[사전] 깊은 쌍 {sum(len(v) for v in by_ticker.values())}개 · 미국 {len(by_ticker)}종목"
          f" (전체 {len(PAIRS)}쌍 중)")

    today = today_kst()
    rows = []
    for t, dp, z, up in movers:
        ps = sorted(by_ticker.get(t, []), key=lambda p: -p.corr)[:LINKS_MAX]
        for p in ps:
            # ⭐ 그 방향의 성적을 그대로 쓴다. gap 은 이미 부호가 맞아 있으므로 **화면에서
            # 다시 뒤집지 말 것** — 예전엔 사전에 오른 날 값 하나뿐이라 화면이 뒤집었다.
            leg = p.up if up else p.down
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
                    # ⚠️ `why` 는 개별 이름(102가지)이고 `kind` 는 그걸 묶은 여섯 종류다.
                    # 시트 부제가 그날 뜬 종류를 세어 문장을 짓는다(마이그레이션 061).
                    "kind": p.kind,
                    "gap": leg.gap,
                    "events": leg.n,
                    # ⚠️ wins 와 base 는 **짝이다.** 하나만 넣지 말 것 — "173번 중 130번" 은
                    # 옆에 "평소 92번" 이 있어야 얼마짜리인지 읽힌다(마이그레이션 056 주석).
                    "wins": leg.wins,
                    "base": leg.base,
                    # ⚠️ kr_open 과 kospi_open 은 **짝이다.** 화면이 "보통 +2.25% 열렸습니다"
                    # 라고 말하는데, 같은 날 코스피가 얼마였는지 없으면 그게 이 종목 덕인지
                    # 그날 장이 좋아서인지 구별이 안 된다(마이그레이션 057 주석).
                    "kr_open": leg.open,
                    "kospi_open": leg.kospi,
                    # 히어로가 이 값으로 KOSPI_AFTER 구간을 고른다. 줄마다 같은 값이지만
                    # us_dp 와 같은 이유로 되풀이해 담는다(조회가 단순해진다).
                    "spx_dp": round(shown, 2),
                    # ⚠️ 하루 전체는 담지 않는다 — 화면이 (1+kr_open)(1+kr_intra)−1 로 낸다.
                    #    따로 담으면 셋이 안 맞는 날이 생긴다.
                    "kr_intra": leg.intra,
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
        # ⚠️ us_stocks 에 없는 종목이 있다. 그 표는 미장 카더라 추출 사전의 것이고
        # 우리 쌍 사전이 더 넓다 — 없으면 사전의 US_NAMES 가, 그것도 없으면 티커가 선다.
        r["us_name"] = us_names.get(r["ticker"]) or US_NAMES.get(r["ticker"]) or r["ticker"]
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

    # ⭐⭐ **그날치 한 줄은 종목이 0개여도 반드시 쓴다**(마이그레이션 063).
    #
    # 위 표는 종목 줄만 담아서, 조용한 밤에는 그날 줄이 한 개도 안 생긴다. 그러면 화면이
    # "가장 최근 날짜" 를 찾다가 **어제**를 집어 어제 종목을 그대로 그린다 — 히어로의 S&P
    # 숫자까지 어제 것이 된다. 그런 날을 위해 써 둔 문구("…조용한 밤이었습니다")도 화면이
    # 보는 줄이 어제 것이라 영영 안 뜬다.
    #
    # ⚠️ 날짜만으로는 못 가른다. 아침 실행 전에 어제 것을 보여 주는 건 의도한 동작이라
    #    "아직 안 돌았다" 와 "돌았는데 없었다" 가 구별되지 않는다. **돌았다는 기록**이
    #    남아야 갈린다. 이 줄이 그 기록이다.
    day_row = {"date": today.isoformat(), "spx_dp": round(shown, 2), "movers": len({r["ticker"] for r in kept})}
    try:
        db.table("kr_preview_day").upsert(day_row, on_conflict="date").execute()
        print(f"[저장] 그날치 한 줄 · S&P {shown:+.2f}% · 미국 {day_row['movers']}종목")
    except Exception as e:  # noqa: BLE001
        # 마이그레이션 063 전에는 표가 없다. 그때는 종목 줄이 예전처럼 지수를 들고 있고
        # 화면도 거기서 꺼내므로, 이것 때문에 스텝을 실패로 떨어뜨리지 않는다.
        print(f"[경고] kr_preview_day 저장 실패: {e} (마이그레이션 063 을 아직 안 돌렸다면 정상)")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""국내 장이 닫힌 동안 밖에서 붙은 값 — 하이퍼리퀴드 무기한선물을 원화로 바꿔 담는다.

국내 장은 15:30 에 닫고 다음 날 09:00 까지 값이 멈춘다. 그 열일곱 시간 반 동안 삼성전자와
SK하이닉스는 **하이퍼리퀴드에서 계속 거래된다.** 달러로 매겨진 그 값을 환율로 되돌리면
"지금 밖에서는 삼성전자가 25만 1,100원에 거래되고 있습니다" 가 나온다.

## 왜 이 화면에 맞나

이 파이프라인이 이미 담는 미국 종목 값은 **간접 신호**다 — 엔비디아가 올랐으니 한미반도체가
어떻겠다는 식이라 5년 통계를 붙여야 뜻이 선다. 이건 다르다. 실측으로 오전 8시 무기한선물과
전날 15시 값을 견주면 그날 실제 개장 갭과 **상관 0.96**(삼성전자 131일 · SK하이닉스 132일)이고
기울기가 1.0 이다. 예측이 아니라 사실상 개장가 그 자체다.

⚠️ 그래서 **문구를 조심해야 한다.** 이 값을 "오를 것" 으로 쓰면 이 저장소가 지켜 온 선을 넘는다.
   화면은 "밖에서는 지금 얼마에 거래되고 있다" 라는 **사실**만 적는다.

## 언제 도는가 — 이건 늦을수록 좋다

같은 파이프라인의 `fetch_kr_preview.py` 는 **맨 앞**이다(미장 종가는 새벽에 이미 확정이라
일찍 돌수록 좋다). 이건 반대다.

  · 전날 종가를 `stocks` 에서 읽으므로 **KRX 게이트(08:00)와 `fetch_krx_stocks` 뒤**여야 한다.
  · 값이 09:00 에 가까울수록 정보가 많다. 국내 개장 직전 한 시간이 가장 값지다.

⚠️ 그렇다고 09:00 을 넘기면 안 된다. 장이 열리면 이 카드는 쓸모가 없다.

## ⚠️ 값을 못 믿을 때는 담지 않는다

  · 전날 종가가 **직전 영업일 것이 아니면** 건너뛴다. 낡은 종가에 오늘 선물을 견주면
    프리미엄이 통째로 거짓이 된다 — 화면에는 그럴듯한 숫자로 보인다.
  · 거래대금이 바닥인 시장은 **표시가가 값이 아니다**. `xyz:KRW` 는 미결제도 거래도 0 인데
    표시가만 붙어 있다. 문턱을 두고 미달이면 그 종목만 뺀다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402

INFO = "https://api.hyperliquid.xyz/info"

# ⚠️ 빌더가 띄운 마켓(HIP-3)이라 `dex` 를 함께 줘야 한다. 하이퍼리퀴드 본체 목록(233개)에는
#    한국 종목이 없다 — 거기만 보고 "없다" 고 판단하면 안 된다.
DEX = "xyz"

# (선물 심볼, 국내 종목코드, 화면에 쓸 이름)
# ⚠️ `SKHY` 를 넣지 말 것. 이름이 비슷하지만 표시가가 SK하이닉스 주가의 1/7.4 라 무엇의
#    몇 분의 일인지 확인되지 않았다. `SKHX` 가 1계약 = 1주다(실측 비율 1.003).
# ⚠️ `KR200`(코스피200)은 넣지 않았다. 값은 붙지만 기울기가 **0.62** 다 — 개장 갭을 늘
#    적게 말한다(거래대금 55만 달러로 얇아서 다 못 따라간다). 셋은 0.91~1.02 다.
TARGETS = [
    ("SMSN", "005930", "삼성전자"),
    ("SKHX", "000660", "SK하이닉스"),
    ("HYUNDAI", "005380", "현대차"),
]

# 실측(2026-09-03) — 오전 8시 선물과 전날 15시 값을 견줘 그날 실제 개장 갭과 맞춰 본 것.
#   삼성전자    131일  상관 0.962  방향 일치 94.7%  기울기 0.97
#   SK하이닉스  132일  상관 0.965  방향 일치 90.2%  기울기 1.02
#   현대차      131일  상관 0.941  방향 일치 89.3%  기울기 0.91
#   코스피200    66일  상관 0.866  방향 일치 86.4%  기울기 0.62  ← 그래서 뺐다

# 이 아래면 표시가를 값으로 안 본다. 24시간 거래대금(달러) 기준.
# 실측(2026-09-03): SKHX 2.3억 · SMSN 4,300만 · EWY 2,600만 · KR200 55만 · KRW 0.
#
# ⭐ **100만 → 10만으로 내렸다**(2026-09-05 지시). 문턱이 막으려던 것은 `xyz:KRW` 처럼
#    거래도 미결제도 **0** 인데 표시가만 붙어 있는 시장이다. 100만은 그 0 과 정상 사이를
#    한참 위에서 갈랐다 — 현대차가 그날 73만으로 내려앉자 카드가 통째로 사라졌는데,
#    73만은 거래가 없는 값이 아니다(미결제 4,419계약). 이틀 전만 해도 194만이었다.
# ⚠️ 세 종목은 고정 목록이라 문턱에 걸리면 **카드가 말없이 없어진다**. 그래서 문턱은
#    "얇다" 가 아니라 "값이 아니다" 를 가르는 자리에 둔다. 10만이면 0 인 시장만 걸린다.
MIN_DAY_VOLUME_USD = 100_000

FX_TICKER = "KRW=X"  # 나머지 지표가 쓰는 것과 같은 원천(fetch_usdkrw_volatility.py)


def post(body: dict, timeout: int = 20) -> object:
    req = urllib.request.Request(
        INFO, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def perp_prices() -> dict[str, dict]:
    """심볼 → {가격·미결제·거래대금·펀딩}. 한 번의 호출로 그 dex 전체를 받는다."""
    meta, ctxs = post({"type": "metaAndAssetCtxs", "dex": DEX})
    out = {}
    for u, c in zip(meta["universe"], ctxs):
        sym = u["name"].split(":")[-1]
        out[sym] = {
            # ⭐ markPx 를 쓴다. mid 와 0.05% 안쪽으로 붙어 있지만(실측), mark 는 펀딩과
            #    청산이 쓰는 기준값이라 거래소가 스스로 "이게 값이다" 라고 말하는 숫자다.
            "usd": float(c["markPx"]),
            "mid": float(c["midPx"]) if c.get("midPx") else None,
            "oi": float(c.get("openInterest") or 0),
            "vlm": float(c.get("dayNtlVlm") or 0),
            "funding": float(c.get("funding") or 0),
            "prev": float(c["prevDayPx"]) if c.get("prevDayPx") else None,
        }
    return out


KOSPI_URL = "http://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd"


def krx_prev_close(codes: set[str]) -> tuple[dict[str, int], str] | None:
    """직전 거래일의 KRX 종가. (코드→종가, 날짜) 또는 못 찾으면 None.

    ⚠️⚠️ **`stocks` 표를 읽지 않는다.** 그 표는 같은 잡의 `fetch_krx_stocks` 가 채우는데
    그 스텝은 **KRX 08:00 게이트 앞**에 있다(2026-09-03 확인). 그래서 아침 실행 시점에
    거기 든 종가는 **한 세션 낡은 것**이다 — 그걸 기준으로 프리미엄을 내면 통째로 거짓이
    되는데 화면에서는 티가 안 난다. 여기서 직접 받아 그 구멍을 없앤다.

    ⚠️ 오늘부터 거꾸로 훑는다. KRX 는 전 영업일 자료를 08:00 KST 에 올리므로, 게이트
    뒤에 돌면 첫 시도가 곧 직전 거래일이다. 게이트 앞이거나 연휴면 며칠 더 거슬러 간다.
    """
    day = today_kst()
    for _ in range(6):
        resp = krx_get(KOSPI_URL, day.strftime("%Y%m%d"))
        rows = resp.json().get("OutBlock_1", []) if resp is not None and resp.ok else []
        if rows:
            out = {}
            for d in rows:
                code = (d.get("ISU_CD") or "").strip()
                if code in codes:
                    try:
                        out[code] = int(str(d.get("TDD_CLSPRC")).replace(",", "").strip())
                    except (TypeError, ValueError):
                        pass
            if out:
                return out, day.isoformat()
        day -= timedelta(days=1)
    return None


YF_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1d"

# 야후 심볼 접미사. 지금 세 종목이 다 코스피라 `.KS` 하나면 된다.
# ⚠️ 코스닥 종목을 넣게 되면 `.KQ` 로 갈라야 한다. 못 받은 종목은 KRX 값으로 남으므로
#    조용히 틀리지는 않고 한 세션 낡을 뿐이다.
YF_SUFFIX = ".KS"


def in_session(now: datetime) -> bool:
    """지금이 국내 정규장 시간인가(평일 09:00~15:30)."""
    return now.weekday() < 5 and (9 * 60) <= (now.hour * 60 + now.minute) < (15 * 60 + 30)


def yahoo_close(codes: set[str]) -> dict[str, tuple[int, str]]:
    """종목별 **가장 최근에 끝난 정규장의 종가**와 그 날짜. 코드→(종가, YYYY-MM-DD).

    ⚠️⚠️ **KRX 는 종가를 다음 날 08:00 에 올린다.** 그래서 오후 실행에서 KRX 만 보면 그날
    장이 이미 끝났는데도 **그 전날 종가**와 견주게 된다. 여기서 당일 종가를 받아 덮는다.

    ⚠️ **일봉을 쓰지 말 것.** 야후 일봉은 그날 칸이 비는 일이 있다(2026-09-03 이 그랬고
    코스피 지수도 같은 날 비었다). `meta.regularMarketPrice` 를 쓴다.

    ⚠️ **야후가 말하는 장 시간도 쓰지 않는다.** `currentTradingPeriod.regular.end` 가
    15:00 로 적혀 있는데 KRX 는 2016년부터 15:30 이다. 정작 `regularMarketTime` 은 15:30 을
    가리켜 야후 안에서 둘이 어긋난다. 그래서 **지금이 장중인가**로만 가른다.

    ⭐ 화면 쪽(lib/kr-overnight.ts)이 10분마다 같은 판정을 한다. 한쪽만 고치면 저장값과
      화면값이 갈리므로 **둘을 같이 고칠 것**.
    """
    now = datetime.now(KST)
    live = in_session(now)
    out: dict[str, tuple[int, str]] = {}
    for code in sorted(codes):
        url = YF_CHART.format(sym=f"{code}{YF_SUFFIX}")
        try:
            # ⚠️ User-Agent 가 없으면 야후가 429 를 준다.
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                meta = json.load(r)["chart"]["result"][0]["meta"]
            px, ts = meta.get("regularMarketPrice"), meta.get("regularMarketTime")
            if not px or not ts:
                continue
            stamp = datetime.fromtimestamp(ts, timezone.utc).astimezone(KST)
            # 장중에 찍힌 오늘 값은 종가가 아니라 진행 중인 값이다.
            if live and stamp.date() == now.date():
                continue
            out[code] = (round(px), stamp.date().isoformat())
        except Exception as e:  # noqa: BLE001 — 이 원천이 죽어도 KRX 값으로 간다
            print(f"[경고] 야후 종가 실패 {code}: {e}")
    return out


def usdkrw() -> float:
    """원/달러. yfinance 를 쓰는 다른 지표와 같은 원천으로 맞춘다."""
    import yfinance as yf  # 러너에 이미 있다(지표 여럿이 쓴다)

    s = yf.download(FX_TICKER, period="5d", auto_adjust=False, progress=False)["Close"]
    s = s.iloc[:, 0] if hasattr(s, "columns") else s
    s = s.dropna()
    if s.empty:
        raise SystemExit("[중단] 환율을 못 받았습니다 — 원화로 바꿀 수 없습니다")
    return float(s.iloc[-1])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 무엇이 나오는지만 찍는다")
    ap.add_argument("--force", action="store_true", help="개장 뒤에도 돌린다")
    args = ap.parse_args()

    now = datetime.now(KST)
    # ⚠️⚠️ **장 시간(평일 09:00~15:30)에만 건너뛴다.** 이 카드는 "국장이 닫힌 동안" 의 값이라
    # 장이 도는 중에는 뜻이 서지 않고, 그때 받은 값은 종가가 아니라 진행 중인 값이다.
    #
    # 예전엔 `hour >= 9` 로 **오후 실행을 통째로** 막았다. 기준이 되는 종가를 KRX 에서만
    # 받았기 때문이다 — KRX 는 종가를 **다음 날 08:00** 에 올려서, 오후에 돌리면 그날 장이
    # 이미 끝났는데도 그 전날 종가와 견주게 됐다. 실측(2026-09-03 18:00): 삼성전자를 9/2 종가
    # 250,500 과 견줘 −0.91% 가 나왔는데 그날 실제 종가 250,000 기준으로는 −0.7% 였다.
    # 이제 당일 종가를 야후에서 받아 덮으므로(yahoo_close) 오후 실행도 맞는다.
    #
    # ⚠️ 이 게이트는 순서 의존을 대신하지 못한다. 워크플로에서 **KRX 08:00 게이트 뒤**에
    #    두는 것이 먼저다. 여기 시각 검사는 손으로 돌릴 때의 안전판이다.
    if not args.force and in_session(now):
        print(f"[건너뜀] 지금 KST {now:%H:%M} — 장 시간에는 담지 않습니다 (--force 로 넘김)")
        return

    db = get_client()
    codes = {c for _, c, _ in TARGETS}
    got = krx_prev_close(codes)
    if got is None:
        raise SystemExit("[중단] KRX 에서 직전 거래일 종가를 못 받았습니다 — 견줄 기준이 없습니다")
    krx_closes, krx_date = got
    # 종목별 (종가, 날짜). KRX 가 바닥이고 야후가 **더 나중 날짜일 때만** 덮는다.
    base: dict[str, tuple[float, str]] = {c: (float(v), krx_date) for c, v in krx_closes.items()}
    print(f"[기준] KRX {krx_date} 종가 {len(base)}종목")

    # ⚠️ **나중 날짜일 때만** 갈아 끼운다. 야후가 옛 값을 물어다 주면 기준이 거꾸로 가는데,
    #    그건 화면에서 티가 안 난다.
    for code, (px, d) in yahoo_close(codes).items():
        if code not in base or d > base[code][1]:
            was = base[code][1] if code in base else "없음"
            print(f"[기준] {code}: 야후 {d} 종가 {px:,}원 으로 갱신 (KRX 는 {was})")
            base[code] = (float(px), d)

    fx = usdkrw()
    px = perp_prices()
    print(f"[환율] 1달러 = {fx:,.2f}원")

    rows = []
    for sym, code, name in TARGETS:
        p = px.get(sym)
        if p is None:
            print(f"[경고] {name}: {DEX}:{sym} 이 목록에 없습니다 — 건너뜁니다")
            continue
        if p["vlm"] < MIN_DAY_VOLUME_USD:
            print(f"[경고] {name}: 24시간 거래대금 ${p['vlm']:,.0f} 로 문턱 미달 — 건너뜁니다")
            continue
        if code not in base:
            print(f"[경고] {name}: 어느 원천에도 종가가 없습니다 — 건너뜁니다")
            continue

        prev, close_date = base[code]
        # ⚠️ 종가가 너무 낡으면 담지 않는다. 연휴를 감안해 나흘까지만 본다.
        gap_days = (today_kst() - datetime.strptime(close_date, "%Y-%m-%d").date()).days
        if gap_days > 4:
            print(f"[경고] {name}: 종가가 {close_date} 로 {gap_days}일 낡았습니다 — 건너뜁니다")
            continue

        krw = p["usd"] * fx
        rows.append(
            {
                "date": today_kst().isoformat(),
                "code": code,
                "name": name,
                "symbol": f"{DEX}:{sym}",
                "perp_usd": round(p["usd"], 4),
                "usdkrw": round(fx, 2),
                "krw": round(krw),
                "prev_close": prev,
                "prev_close_date": close_date,
                "diff_pct": round((krw / prev - 1) * 100, 2),
                "open_interest": round(p["oi"], 3),
                "day_volume_usd": round(p["vlm"]),
                "funding": p["funding"],
                "captured_at": now.astimezone(timezone.utc).isoformat(),
            }
        )
        print(
            f"   {name:10} ${p['usd']:>10,.2f} → {krw:>12,.0f}원   "
            f"전날 종가({close_date}) {prev:>10,.0f}원   {rows[-1]['diff_pct']:+.2f}%"
            f"   거래대금 ${p['vlm']/1e6:,.0f}M"
        )

    if not rows:
        print("[결과] 담을 것이 없습니다")
        return
    if args.dry_run:
        print(f"[dry-run] {len(rows)}줄 (저장 안 함)")
        return

    db.table("kr_overnight").delete().eq("date", today_kst().isoformat()).execute()
    db.table("kr_overnight").insert(rows).execute()
    print(f"[저장] {today_kst()} · {len(rows)}줄")


if __name__ == "__main__":
    main()

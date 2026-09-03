# -*- coding: utf-8 -*-
"""국장 미리보기 쌍 사전의 수치를 **방향별로** 다시 잰다.

## 왜 다시 재나

`config/us_kr_pairs.py` 의 `hit` 은 2026-08-26 에 쟀는데, 두 가지가 화면과 어긋난다.

  ① **문턱이 다르다.** 사전은 미국 초과 등락이 평소의 **1.5배**를 넘은 날만 셌는데
     화면(`scripts/fetch_kr_preview.py`)은 **1.0배**부터 카드로 만든다. 그대로 붙이면
     오늘보다 크게 움직인 날들의 성적을 오늘 것인 양 내보이게 된다.
  ② **방향이 없다.** `hit` 은 "국내 초과 갭이 (+)였던 비율" 한 값뿐이라, 미국이 내린
     날 카드에 붙일 수가 없다. 화면에는 내린 종목이 매일 절반쯤 뜬다.

⛔ 그리고 **이걸 잰 스크립트가 저장소에 없었다.** 그래서 위 두 가지를 확인하는 데
   사전 주석을 읽는 것 말고 방법이 없었다. 이 파일이 그 구멍을 메운다 — 분기마다
   다시 잴 때 이걸 돌린다.

## 무엇을 재나 (사전 주석의 정의를 그대로 따른다)

  기준일   국내 거래일 D. 직전 국내 거래일을 P 라 한다.
  미국 쪽  P 의 국내 종가(06:00 UTC) 이후 D 의 개장(00:00 UTC) 전에 끝난 미장 세션
           **전부**의 누적 등락. 날짜로는 [P, D-1] 이다. 연휴 뒤엔 여러 세션이 쌓인다.
  초과분   미국은 S&P500(SPY), 국내는 코스피로 설명되는 몫을 뺀 나머지.
           ⚠️ 이걸 안 빼면 미국이 오른 아침엔 모든 쌍이 맞고 내린 아침엔 다 틀린다.
  국내 쪽  **개장 갭**(당일 시가 ÷ 전일 종가 − 1). 장중은 재지 않는다 — 실측으로 0이다.
  사건     미국 초과 등락이 그 종목 평소 변동(초과분의 표준편차)의 **1.0배**를 넘은 날.
           오른 날(up)과 내린 날(down)을 **따로** 센다.

각 쌍 × 방향마다 낸다.

  n      그 방향 사건 수
  wins   국내 초과 갭이 **미국과 같은 방향**이었던 횟수(up 이면 (+), down 이면 (−))
  base   같은 기간 아무 날이나 골랐을 때 그 방향이었을 횟수(같은 n 으로 환산)
  mean   그 사건들의 국내 초과 갭 평균(%p, 부호 그대로)

⚠️ **base 를 빼지 말 것.** 사전 주석이 못박아 둔 규칙이다 — "69번 중 56번"만 있으면
   대단해 보이지만 옆에 "평소라면 37번"이 있어야 그게 얼마짜리인지 읽힌다.

⚠️ 야후는 종가를 **NaN 으로 주는 날**이 있다(2026-08-30 에 ^GSPC 가 그랬다).
   pct_change 의 기본 fill_method='pad' 가 그걸 전날 값으로 메워 등락 0 을 만든다.
   여기서는 받은 뒤 NaN 을 먼저 떨어뜨린다.

사용법:  python data-pipeline/backtest/kr_preview_pairs.py [--years 5] [--zmin 1.0]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.us_kr_pairs import PAIRS  # noqa: E402

CACHE = Path(__file__).resolve().parent / ".kr_preview_cache"
SPX = "SPY"
GSPC = "^GSPC"   # ⚠️ 구간표 전용. 쌍 계산은 SPY 로 한다(위 SPX)
KOSPI = "^KS11"


def kr_codes() -> dict[str, tuple[str, str]]:
    """국내 종목명 → (코드, 시장). 우리 `stocks` 표에서 받는다."""
    names = sorted({p.stock for p in PAIRS})
    h = {"apikey": os.environ["SUPABASE_SECRET_KEY"], "Authorization": "Bearer " + os.environ["SUPABASE_SECRET_KEY"]}
    out: dict[str, tuple[str, str]] = {}
    # ⚠️ .in() 목록을 한 번에 다 넣으면 URL 길이에 걸린다. 40개씩 끊는다.
    for i in range(0, len(names), 40):
        q = "(" + ",".join('"' + n + '"' for n in names[i : i + 40]) + ")"
        url = os.environ["SUPABASE_URL"] + "/rest/v1/stocks?select=code,name,market&name=in." + urllib.parse.quote(q, safe="")
        for r in json.load(urllib.request.urlopen(urllib.request.Request(url, headers=h))):
            out[r["name"]] = (r["code"], r["market"])
    missing = [n for n in names if n not in out]
    if missing:
        raise SystemExit(f"[중단] 코드를 못 찾은 국내 종목: {missing}")
    return out


def download(symbols: list[str], years: int, tag: str) -> pd.DataFrame:
    """야후에서 받아 캐시한다. 컬럼은 (필드, 심볼) 2단이다.

    ⚠️⚠️ **캐시가 요청한 심볼을 다 담고 있는지 본다.** 파일 이름이 `{tag}_{years}y` 뿐이라
    사전에 종목을 더해도 이름이 그대로다 — 옛 파일이 조용히 다시 쓰이고, 새 종목 차례에
    `KeyError` 로 죽는다(2026-09-03 에 열한 종목이 그랬다). 죽으면 그나마 낫고, 컬럼을
    안 쓰는 계산이었다면 **모자란 표본으로 잰 값이 그대로 사전에 들어간다.**
    """
    CACHE.mkdir(exist_ok=True)
    f = CACHE / f"{tag}_{years}y.pkl"
    if f.exists():
        cached = pd.read_pickle(f)
        have = {c[1] for c in cached.columns} if isinstance(cached.columns, pd.MultiIndex) else set(cached.columns)
        missing = [s for s in symbols if s not in have]
        if not missing:
            print(f"[캐시] {tag} {len(symbols)}종목")
            return cached
        print(f"[캐시 무시] {tag} 에 {len(missing)}종목이 없다: {', '.join(missing[:8])}"
              f"{' …' if len(missing) > 8 else ''} — 다시 받는다")
    print(f"[받는 중] {tag} {len(symbols)}종목 · {years}년")
    df = yf.download(symbols, period=f"{years}y", auto_adjust=False, progress=False, group_by="column", threads=True)
    df.to_pickle(f)
    return df


def beta(y: pd.Series, x: pd.Series) -> float:
    """단순 회귀 기울기. 겹치는 날만 쓰고, 표본이 없으면 0(=지수 몫 없음)."""
    d = pd.concat([y, x], axis=1).dropna()
    if len(d) < 60 or d.iloc[:, 1].var() == 0:
        return 0.0
    return float(np.cov(d.iloc[:, 0], d.iloc[:, 1])[0, 1] / d.iloc[:, 1].var())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--zmin", type=float, default=1.0, help="화면 문턱과 같게 둔다")
    ap.add_argument("--out", default=str(CACHE / "measured.json"))
    args = ap.parse_args()

    codes = kr_codes()
    us_tickers = sorted({p.ticker for p in PAIRS})
    kr_syms = {n: f"{c}.{'KS' if m == 'KOSPI' else 'KQ'}" for n, (c, m) in codes.items()}

    us = download(us_tickers + [SPX], args.years, "us")
    kr = download(sorted(kr_syms.values()) + [KOSPI], args.years, "kr")

    # ── 국내: 개장 갭(시가 ÷ 전일 종가 − 1) ────────────────────────────────
    ko, kc = kr["Open"], kr["Close"]
    gap = (ko / kc.shift(1) - 1) * 100
    gap.index = pd.to_datetime(gap.index).tz_localize(None).normalize()
    kospi_gap = gap[KOSPI].dropna()

    # ⭐ **장중(시가 → 종가)도 같이 잰다.** 이 신호가 개장 갭에서 끝난다는 건 사전 주석의
    # 주장인데, 쌍마다 이 값을 같이 내면 화면이 그걸 **숫자로** 보일 수 있다.
    # "개장 +2.25%, 장중 +0.05%" 가 나란히 서면 9시에 사도 늦었다는 게 말이 아니라 사실이 된다.
    intra = (kc / ko - 1) * 100
    intra.index = gap.index

    # ── 미국: 국내 거래일마다 [P, D-1] 세션의 누적 등락 ──────────────────
    uc = us["Close"]
    uc.index = pd.to_datetime(uc.index).tz_localize(None).normalize()
    # ⚠️ NaN 을 먼저 떨어뜨린다. pad 로 메우면 그날 등락이 0 이 되어 조용히 틀린다.
    ur = uc.apply(lambda s: s.dropna().pct_change() * 100)

    kr_days = [d for d in kospi_gap.index if d in gap.index]
    rows = []
    for prev, d in zip(kr_days, kr_days[1:]):
        w = ur[(ur.index >= prev) & (ur.index <= d - pd.Timedelta(days=1))]
        if w.empty:
            continue
        # 누적 등락. 세션이 여럿이면 곱으로 쌓는다.
        rows.append(((1 + w / 100).prod() - 1).mul(100).rename(d))
    usx = pd.DataFrame(rows)
    print(f"[정렬] 국내 거래일 {len(usx)}일 · 미국 {usx.shape[1]}종목")

    # ── 지수 몫을 뺀다 ────────────────────────────────────────────────────
    spx = usx[SPX]
    us_ex = pd.DataFrame({t: usx[t] - beta(usx[t], spx) * spx for t in us_tickers})
    us_sd = us_ex.std()

    kr_ex = pd.DataFrame(
        {n: gap[s] - beta(gap[s], kospi_gap) * kospi_gap for n, s in kr_syms.items()}
    ).reindex(usx.index)

    # ── 쌍 × 방향 ─────────────────────────────────────────────────────────
    out: dict[str, dict] = {}
    thin = []
    for p in PAIRS:
        e, sd = us_ex[p.ticker], us_sd[p.ticker]
        g = kr_ex[p.stock]
        # 상관도 같은 정의로 다시 낸다 — 옛 값은 1.5배 문턱 시절 것이라 섞으면 안 된다.
        d = pd.concat([e, g], axis=1).dropna()
        rec: dict[str, dict] = {"corr": round(float(d.iloc[:, 0].corr(d.iloc[:, 1])), 3) if len(d) > 60 else 0.0}
        for name, mask in (("up", e > args.zmin * sd), ("down", e < -args.zmin * sd)):
            both = pd.concat([g[mask], e[mask]], axis=1).dropna()
            if len(both) == 0:
                continue
            gg = both.iloc[:, 0]
            same = (gg > 0) if name == "up" else (gg < 0)
            allg = g.dropna()
            base = float((allg > 0).mean() if name == "up" else (allg < 0).mean())
            # ⭐ **날것 개장 갭도 같이 낸다.** 초과분(gg)은 쌍을 고르고 검증하는 데 쓰지만,
            # 화면에 낼 문장은 "이런 날 이 종목은 보통 몇 % 열렸나" 라서 날것이 필요하다.
            # 코스피 자신의 평균도 같은 날들로 낸다 — 그게 있어야 "보통 +0.9%" 가 시장
            # 덕인지 이 종목 덕인지 읽는 사람이 가늠한다.
            idx = gg.index
            rec[name] = {
                "n": int(len(gg)),
                "wins": int(same.sum()),
                "base_wins": int(round(base * len(gg))),
                "mean": round(float(gg.mean()), 2),
                "open": round(float(gap[kr_syms[p.stock]].reindex(idx).dropna().mean()), 2),
                "kospi": round(float(kospi_gap.reindex(idx).dropna().mean()), 2),
                # 개장 뒤 장중. 이게 0 언저리라는 게 이 화면의 성격을 정한다.
                "intra": round(float(intra[kr_syms[p.stock]].reindex(idx).dropna().mean()), 2),
                # ⚠️ 코스피 자신의 장중도 같은 날들로 낸다. 안 그러면 그날 시장이 밀린 것을
                # 이 쌍의 효과로 잘못 읽는다 — 실제로 내린 날 장중이 그랬다.
                "intra_kospi": round(float(intra[KOSPI].reindex(idx).dropna().mean()), 2),
            }
            if len(gg) < 30:
                thin.append(f"{p.ticker}→{p.stock}[{name}] {len(gg)}건")
        if rec:
            out[f"{p.ticker}|{p.stock}"] = rec

    # ⚠️ US_VOL 도 **같은 실행에서** 낸다. 화면의 z 가 이 값을 쓰는데, 쌍의 '사건' 도
    # 같은 베타·표준편차로 정의된다 — 따로 재면 화면의 1.0배와 사전의 1.0배가 다른 날을
    # 가리키게 된다. 그 어긋남이 이번에 문제가 된 바로 그 종류다.
    out["_US_VOL"] = {t: [round(beta(usx[t], spx), 2), round(float(us_sd[t]), 2)] for t in us_tickers}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"[저장] {args.out} · 쌍 {len(out)}개")
    if thin:
        print(f"[경고] 사건 30건 미만 {len(thin)}건 — 화면에 내기 전에 걸러야 한다")
        for t in thin[:8]:
            print("   ", t)

    # ── KOSPI_AFTER — 화면 히어로의 구간표 ────────────────────────────────
    #
    # ⚠️⚠️ **여기만 SPY 가 아니라 진짜 지수(^GSPC)로 잰다.** 위의 쌍 수치는 종목의
    # 초과분을 내는 계산이라 화면에 안 나오지만, 이 표는 **화면이 큰 숫자로 내보이는 값**
    # 으로 칸을 고른다. 그 값이 지수여야 하는 이유는 독자가 뉴스와 맞대 보기 때문이다.
    #
    # 5년 실측으로 지수와 ETF 는 **90.7%의 날에 소수 둘째 자리가 다르고**(중앙값
    # 0.026%p · 21%의 날은 0.05%p 이상 · 최대 0.99%p) 이 일곱 칸 중 다른 칸에 드는 날이
    # 6.4% 다. 표를 SPY 로 만들어 두고 화면에 지수를 넣으면 그 6.4% 가 어긋난다.
    print()
    gspc = download([GSPC], args.years, "gspc")
    gc = gspc["Close"]
    if isinstance(gc, pd.DataFrame):
        gc = gc.iloc[:, 0]
    gc = gc.dropna()          # ⚠️ NaN 을 먼저 버린다. pad 로 메우면 등락이 조용히 0 이 된다.
    gc.index = pd.to_datetime(gc.index).tz_localize(None).normalize()
    gr = gc.pct_change() * 100

    # 코스피 종가 대 전일 종가(하루 전체). 개장 갭 평균과 장중 평균을 곱하지 않는다 —
    # 평균의 곱은 곱의 평균이 아니라서 마지막 칸이 실제와 조금씩 어긋난다.
    kc_all = kc[KOSPI]
    kc_all.index = gap.index
    day_ret = (kc_all / kc_all.shift(1) - 1) * 100

    rows_after = []
    for prev, d in zip(kr_days, kr_days[1:]):
        w = gr[(gr.index >= prev) & (gr.index <= d - pd.Timedelta(days=1))]
        if w.empty:
            continue
        rows_after.append((d, float((1 + w / 100).prod() - 1) * 100))
    after = pd.DataFrame(rows_after, columns=["date", "spx"]).set_index("date")["spx"]

    BOUNDS = [(-99, -1.5), (-1.5, -0.75), (-0.75, -0.25), (-0.25, 0.25), (0.25, 0.75), (0.75, 1.5), (1.5, 99)]
    print("KOSPI_AFTER: list[tuple[float, float, int, float, float, float]] = [")
    for lo, hi in BOUNDS:
        idx = after[(after >= lo) & (after < hi)].index
        o = gap[KOSPI].reindex(idx).dropna()
        it = intra[KOSPI].reindex(idx).dropna()
        dy = day_ret.reindex(idx).dropna()
        print(f"    ({lo}, {hi}, {len(o)}, {o.mean():.2f}, {it.mean():.2f}, {dy.mean():.2f}),")
    print("]")
    print(f"[구간표] 지수 ^GSPC 기준 · 국내 거래일 {len(after)}일")

    # ── 요약 ──────────────────────────────────────────────────────────────
    for name in ("up", "down"):
        v = [r[name] for k, r in out.items() if not k.startswith("_") and name in r and r[name]["n"] >= 30]
        if not v:
            continue
        rate = np.mean([x["wins"] / x["n"] for x in v])
        b = np.mean([x["base_wins"] / x["n"] for x in v])
        print(f"[{name}] 쌍 {len(v)}개 · 평균 적중 {rate:.1%} (평소 {b:.1%}) · "
              f"사건 중앙값 {int(np.median([x['n'] for x in v]))}건 · "
              f"평균 갭 {np.mean([x['mean'] for x in v]):+.2f}%p")


if __name__ == "__main__":
    main()

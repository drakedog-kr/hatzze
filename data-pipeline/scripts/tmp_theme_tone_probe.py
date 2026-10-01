"""⚠️ 임시 측정 — 머지하지 않는다. 테마 톤이 그 테마 주가를 따라 움직이나(읽기 전용).

카더라 큰 숫자(시장 글 낙관도)는 지수 등락과 견줘 확인했지만(common/market_sentiment.py), 테마 막대
(예전 톤)는 확인한 적이 없다. 같은 잣대로 둘을 재고, 테마 막대를 다르게 세는 방법 몇 가지도 같이 잰다.
DB 에는 아무것도 쓰지 않는다. 주가는 야후 일봉(수정 종가)이다.

    cd data-pipeline && python scripts/tmp_theme_tone_probe.py
"""

from __future__ import annotations

import math
import re
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.market_tags import is_us_only  # noqa: E402
from common.supabase_client import get_client, load_all_keyset, load_window_keyset  # noqa: E402
from common.theme_tone import theme_tone_targets  # noqa: E402
from common.timeutil import KST  # noqa: E402
from config.stock_extraction import is_house  # noqa: E402
from config.stock_themes import THEMES  # noqa: E402
from config.us_stock_themes import US_THEMES  # noqa: E402

DAYS_BACK = 100
TOP_THEMES = 8
MIN_DAY_DECIDED = 10  # 하루 낙관+비관이 이만큼은 돼야 그날 점을 쓴다
REP_N = 10  # 대표 바스켓 = 사전 앞쪽 N종목(사전 머리 주석: 앞쪽이 대형주)
PRIOR = 5  # 화면 평활(optimismPct)
USUAL_DAYS = 30
BIG_MOVE = 1.0  # %, 오른 날·내린 날 가르는 문턱

# 주가 등락을 말하는 낱말. '회사 소식'과 '주가 이야기'를 대충 가르는 데만 쓴다.
MOVE_RE = re.compile(
    r"상승|하락|급등|급락|강세|약세|반등|폭락|폭등|상한가|하한가|신고가|신저가|오르|올라|올랐|내리|내려|내렸|"
    r"빠지|빠졌|빠진|떨어|밀리|밀렸|약보합|강보합|주가|시총|매도세|매수세|순매도|순매수"
)

VARIANTS = {
    "V0 지금": lambda r: True,
    "V1 테마 하나만": lambda r: r["n_themes"] == 1,
    "V2 기사·알림 뺌": lambda r: r["kind"] not in ("news", "auto"),
    "V3 의견·리서치만": lambda r: r["kind"] in ("opinion", "research"),
    "V4 등락 말만": lambda r: r["move"],
    "V5 등락 말 뺌": lambda r: not r["move"],
}


def log(msg: str = "") -> None:
    print(msg, flush=True)


# ── 주가 ──────────────────────────────────────────────────────────────────

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}


def chart(symbol: str, start: date) -> dict[str, float]:
    p1 = int(datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc).timestamp())
    p2 = int(time.time())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol)}"
    for attempt in range(4):
        try:
            res = requests.get(url, params={"period1": p1, "period2": p2, "interval": "1d"}, headers=UA, timeout=20)
            if res.status_code == 404:
                return {}
            res.raise_for_status()
            r = res.json()["chart"]["result"][0]
            ts = r.get("timestamp") or []
            gmt = r["meta"].get("gmtoffset", 0)
            ind = r["indicators"]
            closes = (ind.get("adjclose") or [{}])[0].get("adjclose") or ind["quote"][0]["close"]
            out = {}
            for t, c in zip(ts, closes):
                if c is None:
                    continue
                out[datetime.fromtimestamp(t + gmt, tz=timezone.utc).date().isoformat()] = float(c)
            return out
        except Exception:  # noqa: BLE001
            time.sleep(2 * (attempt + 1))
    return {}


def returns(closes: dict[str, float], drop_from: str) -> dict[str, float]:
    days = sorted(d for d in closes if d < drop_from)
    return {d: (closes[d] / closes[p] - 1) * 100 for p, d in zip(days, days[1:]) if closes[p]}


def fetch_all(symbols: list[str], start: date, drop_from: str) -> dict[str, dict[str, float]]:
    with ThreadPoolExecutor(8) as ex:
        got = dict(zip(symbols, ex.map(lambda s: chart(s, start), symbols)))
    missing = [s for s, v in got.items() if not v]
    log(f"[주가] {len(symbols) - len(missing)}/{len(symbols)}종목 받음" + (f" · 못 받음 {missing[:12]}" if missing else ""))
    return {s: returns(v, drop_from) for s, v in got.items() if v}


# ── 통계 ──────────────────────────────────────────────────────────────────


def corr(xs: list[float], ys: list[float]) -> tuple[float | None, float | None]:
    if len(xs) < 8:
        return None, None
    a, b = pd.Series(xs), pd.Series(ys)
    if a.std() == 0 or b.std() == 0:
        return None, None
    return float(a.corr(b)), float(a.rank().corr(b.rank()))  # 순위상관 = 순위끼리 피어슨(scipy 없이)


def fmt(v: float | None, nd: int = 2) -> str:
    return "  -  " if v is None or (isinstance(v, float) and math.isnan(v)) else f"{v:+.{nd}f}"


def smoothed(pos: int, neg: int) -> int | None:
    if pos + neg == 0:
        return None
    return math.floor((pos + PRIOR) / (pos + neg + 2 * PRIOR) * 100 + 0.5)


def zone(v: int) -> str:
    return "낙관" if v >= 60 else ("중립" if v >= 41 else "비관")


def add_days(d: str, n: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()


# ── 재료 ──────────────────────────────────────────────────────────────────


def load_inputs(db, since_iso: str):
    log("[재료] 메시지·분류·태그를 읽습니다 …")
    t0 = time.time()
    messages = load_window_keyset(db, "telegram_messages", "id,channel_handle,message_id,posted_at,text", since_iso)
    analysis = load_all_keyset(db, "telegram_message_analysis", "id,channel_handle,message_id,sentiment,text_hash")
    kr_mentions = load_all_keyset(db, "telegram_message_stocks", "id,channel_handle,message_id,stock_code,method")
    us_mentions = load_all_keyset(db, "telegram_message_us_stocks", "id,channel_handle,message_id,ticker,method")
    market = load_all_keyset(db, "telegram_message_market", "id,channel_handle,message_id,kr,us,kind")
    stocks = load_all_keyset(db, "stocks", "code,name,market", key="code")
    log(
        f"[재료] 메시지 {len(messages):,} · 분류 {len(analysis):,} · 국내 태그 {len(kr_mentions):,} · "
        f"미국 태그 {len(us_mentions):,} · 시장 판정 {len(market):,} · 종목 {len(stocks):,} ({time.time() - t0:.0f}초)"
    )
    return messages, analysis, kr_mentions, us_mentions, market, stocks


def build_records(side: str, messages, analysis, kr_mentions, us_mentions, market, stocks):
    """화면 테마 톤과 같은 규칙으로 글 하나씩 — (날짜, 톤, 테마, 종류, 등락 말 여부, 종목)."""
    date_of, move_of = {}, {}
    for m in messages:
        if not m.get("posted_at"):
            continue
        key = (m["channel_handle"], m["message_id"])
        date_of[key] = datetime.fromisoformat(m["posted_at"]).astimezone(KST).date().isoformat()
        move_of[key] = bool(MOVE_RE.search(m.get("text") or ""))
    kind_of = {(r["channel_handle"], r["message_id"]): r["kind"] for r in market}

    codes_of_msg: dict = defaultdict(set)
    kr_syms_of_msg: dict = defaultdict(set)
    for m in kr_mentions:
        k = (m["channel_handle"], m["message_id"])
        codes_of_msg[k].add(m["stock_code"])
        if not is_house(m):
            kr_syms_of_msg[k].add(m["stock_code"])
    us_keys = {(m["channel_handle"], m["message_id"]) for m in us_mentions}
    us_syms_of_msg: dict = defaultdict(set)
    for m in us_mentions:
        if not is_house(m):
            us_syms_of_msg[(m["channel_handle"], m["message_id"])].add(m["ticker"])

    if side == "kr":
        code_of = {s["name"]: s["code"] for s in stocks}
        themes_of: dict = defaultdict(list)
        for theme, names in THEMES.items():
            for name in names:
                if name in code_of:
                    themes_of[code_of[name]].append(theme)
        syms_of_msg = kr_syms_of_msg
        us_only = {k for k in us_keys if is_us_only(len(codes_of_msg.get(k, ())), 1)}
    else:
        themes_of = defaultdict(list)
        for theme, tickers in US_THEMES.items():
            for t in tickers:
                themes_of[t].append(theme)
        syms_of_msg = us_syms_of_msg
        us_only = set()

    seen: set = set()
    recs, overall = [], defaultdict(Counter)
    for a in analysis:
        key = (a["channel_handle"], a["message_id"])
        d = date_of.get(key)
        if not d:
            continue
        if side == "kr" and key in us_only:
            continue
        if side == "us" and key not in us_keys:
            continue
        h = a.get("text_hash")
        if h and (d, h) in seen:
            continue
        if h:
            seen.add((d, h))
        overall[d][a["sentiment"]] += 1
        syms = syms_of_msg.get(key, set())
        themes = {t for s in syms for t in themes_of.get(s, ())}
        targets = theme_tone_targets(themes)
        if not targets:
            continue
        recs.append({
            "date": d, "sent": a["sentiment"], "themes": targets, "n_themes": len(themes),
            "kind": kind_of.get(key), "move": move_of.get(key, False), "syms": syms,
        })
    return recs, overall, themes_of


# ── 측정 ──────────────────────────────────────────────────────────────────


def run_side(side: str, db, inputs, start_day: str, today: str) -> None:
    name = "국장" if side == "kr" else "미장"
    log("\n" + "=" * 100)
    log(f"■ {name}")
    log("=" * 100)
    recs, overall, themes_of = build_records(side, *inputs)
    dict_themes = THEMES if side == "kr" else US_THEMES

    # 테마 × 변형 × 날짜 톤
    counts: dict = defaultdict(Counter)  # (variant, theme, date) -> Counter
    weights: dict = defaultdict(Counter)  # (theme, date) -> 종목별 글 수(V0)
    comp_kind, comp_move = defaultdict(Counter), defaultdict(Counter)
    for r in recs:
        if r["date"] < start_day:
            continue
        for v, f in VARIANTS.items():
            if f(r):
                for t in r["themes"]:
                    counts[(v, t, r["date"])][r["sent"]] += 1
        for t in r["themes"]:
            for s in r["syms"]:
                if t in themes_of.get(s, ()):
                    weights[(t, r["date"])][s] += 1
        comp_kind[r["kind"] or "판정 없음"][r["sent"]] += 1
        comp_move["등락 말 있음" if r["move"] else "등락 말 없음"][r["sent"]] += 1

    vol = Counter()
    for (v, t, d), c in counts.items():
        if v == "V0 지금":
            vol[t] += c["positive"] + c["negative"]
    top = [t for t, _ in vol.most_common(TOP_THEMES)]
    log(f"[테마] 낙관+비관 많은 순 상위 {TOP_THEMES}: " + ", ".join(f"{t}({vol[t]:,})" for t in top))

    # 대조 — 저장된 테마 행과 같은가(V0 이 화면과 같은 재료인지)
    table = "telegram_sentiment_daily" if side == "kr" else "telegram_us_sentiment_daily"
    stored = (
        db.table(table).select("date,scope,positive_count,neutral_count,negative_count")
        .in_("scope", top).gte("date", start_day).limit(5000).execute().data or []
    )
    same = sum(
        1 for s in stored
        if (c := counts.get(("V0 지금", s["scope"], s["date"]))) is not None
        and (c["positive"], c["neutral"], c["negative"]) == (s["positive_count"], s["neutral_count"], s["negative_count"])
    )
    log(f"[대조] 저장된 {table} 상위 테마 행 {len(stored)}개 중 다시 센 값과 똑같은 행 {same}개")

    # 주가
    if side == "kr":
        mk = {s["code"]: s.get("market") for s in inputs[5]}
        sym_of = {}
        code_of = {s["name"]: s["code"] for s in inputs[5]}
        members = {}
        for t in top:
            codes = [code_of[n] for n in dict_themes[t] if n in code_of]
            members[t] = codes
            for c in codes:
                suf = {"KOSPI": ".KS", "KOSDAQ": ".KQ"}.get(mk.get(c) or "")
                if suf:
                    sym_of[c] = c + suf
        index_sym = "^KS11"
    else:
        members = {t: list(dict_themes[t]) for t in top}
        sym_of = {s: s.replace(".", "-") for t in top for s in members[t]}
        index_sym = "^GSPC"
    syms = sorted(set(sym_of.values()) | {index_sym})
    rets = fetch_all(syms, date.fromisoformat(start_day) - timedelta(days=45), today)
    idx = rets.get(index_sym, {})
    trading = sorted(idx)
    if not trading:
        log("[주가] 지수를 못 받아 이 시장은 건너뜁니다")
        return
    prev_trading = {d: p for p, d in zip(trading, trading[1:])}

    def s0(d: str) -> str | None:
        """그날 글이 말하는 장. 국장은 같은 날, 미장은 전날 밤(한국 시각 새벽 마감) 장."""
        s = d if side == "kr" else add_days(d, -1)
        return s if s in idx else None

    def theme_ret(t: str, sess: str, d: str, how: str) -> float | None:
        syms_t = members[t] if how != "rep" else members[t][:REP_N]
        vals, ws = [], []
        for s in syms_t:
            r = rets.get(sym_of.get(s, ""), {}).get(sess)
            if r is None:
                continue
            w = weights[(t, d)][s] if how == "mw" else 1
            if w:
                vals.append(r)
                ws.append(w)
        if not vals:
            return None
        return sum(v * w for v, w in zip(vals, ws)) / sum(ws)

    tone_days = sorted({d for d in (add_days(start_day, i) for i in range(400)) if start_day <= d < today and s0(d)})
    log(f"[기간] {tone_days[0]} ~ {tone_days[-1]} · 장이 선 날 {len(tone_days)}일 (글 날짜 기준, 미장은 전날 밤 장과 짝)")

    def p_of(c: Counter) -> float | None:
        dec = c["positive"] + c["negative"]
        return c["positive"] / dec * 100 if dec >= MIN_DAY_DECIDED else None

    # ── 1) 기준선: 큰 숫자(시장 글) · 예전 헤드라인(전체 글) vs 지수 ──
    mrows = (
        db.table("telegram_market_sentiment_daily").select("date,positive_count,negative_count")
        .eq("market", side).gte("date", start_day).limit(1000).execute().data or []
    )
    mday = {r["date"]: Counter(positive=r["positive_count"], negative=r["negative_count"]) for r in mrows}
    log("\n[1] 기준선 — 하루 낙관 비율과 그날 지수 등락(같은 잣대)")
    log(f"    {'재료':<22}{'n':>4}{'상관':>8}{'순위상관':>9}{'전날 장':>9}{'평균':>7}{'오른 날':>8}{'내린 날':>8}")
    for label, src in (("큰 숫자(시장 글)", mday), ("예전 헤드라인(전체 글)", overall)):
        xs, ys, ys1, up, dn = [], [], [], [], []
        for d in tone_days:
            p = p_of(src.get(d, Counter()))
            if p is None:
                continue
            r = idx.get(s0(d))
            xs.append(p)
            ys.append(r)
            r1 = idx.get(prev_trading.get(s0(d), ""))
            ys1.append(r1 if r1 is not None else float("nan"))
            (up if r >= BIG_MOVE else dn if r <= -BIG_MOVE else []).append(p)
        pr, sr = corr(xs, ys)
        pr1, _ = corr([x for x, y in zip(xs, ys1) if not math.isnan(y)], [y for y in ys1 if not math.isnan(y)])
        log(
            f"    {label:<22}{len(xs):>4}{fmt(pr):>8}{fmt(sr):>9}{fmt(pr1):>9}{(sum(xs) / len(xs) if xs else 0):>7.0f}"
            f"{(sum(up) / len(up) if up else float('nan')):>8.0f}{(sum(dn) / len(dn) if dn else float('nan')):>8.0f}"
        )
    log(f"    (오른 날·내린 날 = 지수가 ±{BIG_MOVE}% 넘게 움직인 날의 평균 낙관 비율. 우연 기준선 ≈ ±2/√n)")

    # ── 2) 테마 톤(지금 막대) vs 그 테마 주가 ──
    log("\n[2] 지금 테마 막대(V0) — 하루 낙관 비율과 그 테마 주가 등락")
    log(
        f"    {'테마':<12}{'n':>4}{'평균':>6}{'폭':>5}  {'대표10':>7}{'언급가중':>9}{'전 종목':>8}{'전날 장':>8}{'지수':>7}"
        f"{'평소대비':>9}{'큰숫자와':>9}{'오른 날':>8}{'내린 날':>8}"
    )
    for t in top:
        rows = []
        for d in tone_days:
            p = p_of(counts.get(("V0 지금", t, d), Counter()))
            if p is None:
                continue
            sess = s0(d)
            # 평소 = 그날 앞 30일 합(창과 안 겹침)
            up_, dn_ = 0, 0
            for k in range(1, USUAL_DAYS + 1):
                c = counts.get(("V0 지금", t, add_days(d, -k)))
                if c:
                    up_ += c["positive"]
                    dn_ += c["negative"]
            usual = up_ / (up_ + dn_) * 100 if up_ + dn_ >= 60 else None
            rows.append({
                "p": p, "rep": theme_ret(t, sess, d, "rep"), "mw": theme_ret(t, sess, d, "mw"),
                "all": theme_ret(t, sess, d, "all"),
                "prev": theme_ret(t, prev_trading.get(sess, ""), d, "rep"), "idx": idx.get(sess),
                "dev": (p - usual) if usual is not None else None,
                "head": p_of(mday.get(d, Counter())),
            })

        def c_of(field: str, xfield: str = "p") -> float | None:
            pts = [(r[xfield], r[field]) for r in rows if r[field] is not None and r[xfield] is not None]
            return corr([a for a, _ in pts], [b for _, b in pts])[0]

        ps = [r["p"] for r in rows]
        up = [r["p"] for r in rows if r["rep"] is not None and r["rep"] >= BIG_MOVE]
        dn = [r["p"] for r in rows if r["rep"] is not None and r["rep"] <= -BIG_MOVE]
        spread = (pd.Series(ps).quantile(0.9) - pd.Series(ps).quantile(0.1)) if ps else 0
        log(
            f"    {t:<12}{len(rows):>4}{(sum(ps) / len(ps) if ps else 0):>6.0f}{spread:>5.0f}  {fmt(c_of('rep')):>7}{fmt(c_of('mw')):>9}"
            f"{fmt(c_of('all')):>8}{fmt(c_of('prev')):>8}{fmt(c_of('idx')):>7}{fmt(c_of('rep', 'dev')):>9}{fmt(c_of('head')):>9}"
            f"{(sum(up) / len(up) if up else float('nan')):>6.0f}({len(up):>2}){(sum(dn) / len(dn) if dn else float('nan')):>5.0f}({len(dn):>2})"
        )
    log("    폭 = 하루 낙관 비율의 10~90분위 폭. 대표10·언급가중·전 종목 = 그 테마 주가를 묶는 방법 셋.")
    log("    전날 장 = 하루 앞 장과의 상관(늦게 반응하나). 지수 = 테마 대신 지수와. 평소대비 = (그날 − 앞 30일) 과 대표10.")
    log("    큰숫자와 = 그 테마 하루 낙관 비율과 그날 큰 숫자(시장 글) 하루 낙관 비율의 상관.")

    # ── 3) 테마 막대를 다르게 세면 ──
    log("\n[3] 막대를 다르게 세면 — 상위 4테마 평균(대표10 주가와 상관 · 평균 낙관 · 화면 구간)")
    log(f"    {'방법':<16}{'상관':>7}{'평균':>6}{'글 몫':>7}{'낙관 구간':>10}{'중립':>6}{'비관':>6}   테마별 상관")
    base_n = sum(sum(counts.get(("V0 지금", t, d), Counter()).values()) for t in top[:4] for d in tone_days)
    for v in VARIANTS:
        cs, means, zones, per = [], [], Counter(), []
        n_msgs = 0
        for t in top[:4]:
            xs, ys = [], []
            for d in tone_days:
                c = counts.get((v, t, d), Counter())
                n_msgs += sum(c.values())
                p = p_of(c)
                r = theme_ret(t, s0(d), d, "rep")
                if p is not None and r is not None:
                    xs.append(p)
                    ys.append(r)
                    means.append(p)
            pr = corr(xs, ys)[0]
            per.append(f"{t} {fmt(pr)}")
            if pr is not None:
                cs.append(pr)
            # 화면 구간: 오늘+어제 평활값(모든 날)
            for d in (add_days(start_day, i) for i in range(1, 400)):
                if d >= today:
                    break
                c2 = counts.get((v, t, d), Counter()) + counts.get((v, t, add_days(d, -1)), Counter())
                if c2["positive"] + c2["negative"] >= 20:
                    zones[zone(smoothed(c2["positive"], c2["negative"]))] += 1
        zt = sum(zones.values()) or 1
        log(
            f"    {v:<16}{fmt(sum(cs) / len(cs) if cs else None):>7}{(sum(means) / len(means) if means else 0):>6.0f}"
            f"{n_msgs * 100 / max(base_n, 1):>6.0f}%{zones['낙관'] * 100 / zt:>9.0f}%{zones['중립'] * 100 / zt:>5.0f}%{zones['비관'] * 100 / zt:>5.0f}%   "
            + " · ".join(per)
        )
    # 화면 구간 기준선(큰 숫자)
    zones = Counter()
    for d in (add_days(start_day, i) for i in range(1, 400)):
        if d >= today:
            break
        c2 = mday.get(d, Counter()) + mday.get(add_days(d, -1), Counter())
        if c2["positive"] + c2["negative"] >= 20:
            zones[zone(smoothed(c2["positive"], c2["negative"]))] += 1
    zt = sum(zones.values()) or 1
    log(f"    {'(큰 숫자)':<16}{'':>7}{'':>6}{'':>7}{zones['낙관'] * 100 / zt:>9.0f}%{zones['중립'] * 100 / zt:>5.0f}%{zones['비관'] * 100 / zt:>5.0f}%")
    log("    글 몫 = V0 대비 남는 글. 구간 = 오늘+어제 평활 낙관도가 낙관(60~)·중립(41~59)·비관(~40)인 날의 비율.")

    # ── 4) 테마끼리 · 시장과 견주면 ──
    log("\n[4] 견주는 대상을 바꾸면 — 상위 6테마를 한데 모은 점(테마×날)")
    pts_cs, pts_mkt = [], []
    for d in tone_days:
        sess = s0(d)
        day = []
        for t in top[:6]:
            p = p_of(counts.get(("V0 지금", t, d), Counter()))
            r = theme_ret(t, sess, d, "rep")
            if p is not None and r is not None:
                day.append((t, p, r))
        if len(day) >= 3:
            mp = sum(p for _, p, _ in day) / len(day)
            mr = sum(r for _, _, r in day) / len(day)
            pts_cs += [(p - mp, r - mr) for _, p, r in day]
        po = p_of(overall.get(d, Counter()))
        pm = p_of(mday.get(d, Counter()))
        ir = idx.get(sess)
        for _, p, r in day:
            if po is not None and ir is not None:
                pts_mkt.append((p - po, r - ir))
    log(f"    테마끼리(그날 테마 평균을 뺀 낙관 vs 그날 테마 평균을 뺀 등락)  n={len(pts_cs):>4}  상관 {fmt(corr(*zip(*pts_cs))[0] if pts_cs else None)}")
    log(f"    전체 글 대비(테마 − 그날 전체 글 낙관 vs 테마 − 지수 등락)        n={len(pts_mkt):>4}  상관 {fmt(corr(*zip(*pts_mkt))[0] if pts_mkt else None)}")

    # ── 5) 테마 글은 무엇으로 이뤄졌나 ──
    log("\n[5] 테마 막대(V0) 글의 구성 — 몫과 낙관 비율(중립 제외)")
    kinded = sorted(r["date"] for r in recs if r["kind"] and r["date"] >= start_day)
    if kinded:
        span = [r for r in recs if r["date"] >= kinded[0]]
        log(f"    글 종류(시장 판정 표의 kind)는 {kinded[0]} 부터 있다 — 그 뒤 테마 글의 {len(kinded) * 100 // max(len(span), 1)}% 에 붙었다(후보 낱말 걸린 글만 판정)")
    tot = sum(sum(c.values()) for c in comp_kind.values()) or 1
    for label, comp in (("글 종류", comp_kind), ("등락 말", comp_move)):
        parts = []
        for k, c in sorted(comp.items(), key=lambda kv: -sum(kv[1].values())):
            dec = c["positive"] + c["negative"]
            parts.append(f"{k} {sum(c.values()) * 100 / tot:.0f}% · 낙관 {c['positive'] * 100 / dec if dec else 0:.0f}")
        log(f"    {label}: " + "  |  ".join(parts))

    # ── 6) 날마다 — 상위 1테마 ──
    t = top[0]
    log(f"\n[6] {t} 날마다(최근 25 장) — 지금 막대 · 등락 말만 · 대표10 등락 · 지수")
    log(f"    {'글 날짜':<12}{'장':<12}{'낙+비':>6}{'V0':>6}{'V4':>6}{'대표10':>8}{'지수':>7}{'큰숫자':>7}")
    for d in tone_days[-25:]:
        c0 = counts.get(("V0 지금", t, d), Counter())
        c4 = counts.get(("V4 등락 말만", t, d), Counter())
        p0, p4 = p_of(c0), p_of(c4)
        r = theme_ret(t, s0(d), d, "rep")
        log(
            f"    {d:<12}{s0(d):<12}{c0['positive'] + c0['negative']:>6}{(f'{p0:.0f}' if p0 is not None else '-'):>6}"
            f"{(f'{p4:.0f}' if p4 is not None else '-'):>6}{fmt(r):>8}{fmt(idx.get(s0(d))):>7}"
            f"{(f'{ph:.0f}' if (ph := p_of(mday.get(d, Counter()))) is not None else '-'):>7}"
        )


def main() -> None:
    db = get_client()
    now_kst = datetime.now(timezone.utc).astimezone(KST)
    today = now_kst.date().isoformat()
    since_iso = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).isoformat()
    inputs = load_inputs(db, since_iso)
    start_day = (now_kst - timedelta(days=DAYS_BACK - 5)).date().isoformat()
    log(f"[기간] 오늘 {today} (KST) · 집계 시작 {start_day}")
    for side in ("kr", "us"):
        try:
            run_side(side, db, inputs, start_day, today)
        except Exception as exc:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            log(f"[오류] {side}: {exc}")


if __name__ == "__main__":
    main()

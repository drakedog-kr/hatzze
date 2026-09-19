"""한 주에 태그된 종목 전부를 '유령 의심 순'으로 펼쳐, 읽는 쪽이 판정할 수 있게 한다.

check_phantom_stocks.py 는 **매일** 급부상 카드 여섯을 **규칙**으로 잰다(복붙·표본·위험이름).
그 검사가 못 보는 것이 둘 있다 — ③ 위험이름 목록 밖의 새 유령, 그리고 카드 여섯 밖에서
셈에 섞이는 유령(테마 회전·트렌딩 태그·까닭 보드·종목 화면). 지금까지 새 결(①~⑦)은
전부 사람이 화면을 읽다가 찾았고, 규칙은 찾은 뒤에야 만들어졌다.

이 스크립트는 **판정하지 않는다.** 유령은 규칙이 아니라 뜻으로 갈리므로
(config/stock_extraction.py 문두), 판정은 읽는 쪽(사람 또는 LLM 세션)의 몫이다.
이 스크립트의 몫은 읽을 것을 **빠짐없이, 의심스러운 것부터, 문맥과 함께** 내놓는 것이다.

## 무엇을 내놓나

창 안(기본 7일, KST 달력) 메시지에 붙은 태그를 종목별로 모아, 종목마다

  · 언급 수 · 서로 다른 채널 수 · 복붙 지배율(같은 본문이 차지하는 몫) · 매칭 문자열들
  · 위험이름 여부(AMBIGUOUS_NAMES·HEAD_NOUN_NAMES·HOMONYM_CUES)
  · 주식 표기 흔적(6자리 코드·%·원·상한가·목표가·공시·실적 …)이 **어느 언급에도 없는지**
  · 노출 — 그 주에 화면에 실제로 선 자리(급부상 카드·많이 언급 6·까닭 보드·데일리 노트·
    트렌딩 태그·종목 요약)
  · 문맥 — 매칭 자리 앞뒤 글자를 【】로 표시한 발췌. 서로 다른 본문·채널을 우선해 고른다.

를 적는다. 그 앞에 **자리로 걸러 낸 두 표**를 먼저 둔다 — 종목별 발췌를 읽기 전에 이 둘만
봐도 결 ①·②(이름이 더 긴 낱말의 앞부분·계열 접두어)와 대소문자 구멍은 대부분 드러난다.

  · 붙은 꼬리 — 위험이름 목록 **밖**의 이름인데 인정된 자리 바로 뒤에 조사로 설명 안 되는
    한글이나 영숫자가 붙어 있는 것(`디아이|동일` `HRS|G` `케이프|사이즈`). 위험이름은 뒤
    경계 검사가 이미 막으므로 여기 안 나온다. 비위험군은 뒤를 안 보는 게 규칙이라 이 표가
    그 규칙의 사각지대를 그대로 보여 준다. ⚠️ 정식명의 뒷부분(`계룡건설|산업`
    `젬백스|앤카엘`)이나 계열사(`현대차|그룹`)도 섞이니 표만 보고 판정하지 말 것.
  · 표기가 사전과 다른 대소문자 — 대소문자 무시로 잡힌 라틴 이름(`SBS`←`SbS`, `NEW`←`New`).
    약자는 표기가 다르면 대개 다른 뜻이다.

종목별 순서는 노출된 종목 먼저, 그 안에서 의심 점수(위험이름·짧은 이름·복붙·흔적 없음·
별칭 매칭)가 높은 것부터. 노출 안 된 종목도 **전부** 적는다 — 카드에 안 올랐다고 셈에서
빠지는 게 아니고, 09-07 에 유령 셋을 걷어 내자 6위에 다음 유령이 올라왔다.

⚠️ 의심 점수는 **읽는 순서**를 정할 뿐 판정이 아니다. 흔적 없음이 유령을 뜻하지 않고
("삼전 오늘 어때요"), 복붙이 유령을 뜻하지 않는다(공시는 원래 여러 채널이 같은 문장을
나른다). 점수가 0 인 종목도 문맥 한 줄은 읽을 것.

⚠️ 문맥 발췌 수는 언급이 많을수록 늘리되 상한을 둔다(CONTEXTS_BY_TIER). 그 상한 밖은
읽지 않은 것이다 — 진짜 언급 대다수에 유령 소수가 섞인 종목(하이브 345 중 195 진짜)은
발췌 넷으로 못 가른다. 그런 종목은 언급 수가 평소보다 부풀었나(급부상 배수)로 의심하고,
의심되면 그 종목만 --stock 으로 발췌를 넓혀 다시 볼 것.

주에 한 번 Claude 예약 작업(【매주】카더라 유령 종목 점검)이 이 스크립트를 돌려 보고서를 읽고
판정표를 만든다. 파이프라인에는 안 들어간다 — 판정이 필요한 산출물이라 자동으로 실패시킬 게 없다.

실행:
    cd data-pipeline && python scripts/scan_phantom_week.py                # 오늘까지 7일
    python scripts/scan_phantom_week.py --days 7 --until 2026-09-19        # 창을 못박아 재현
    python scripts/scan_phantom_week.py --stock 067390,456040 --contexts 40  # 몇 종목만 넓게
    python scripts/scan_phantom_week.py --out /tmp/week.md                 # 파일로도 남긴다
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import surging  # noqa: E402
from common.supabase_client import execute_with_retry, get_client, load_window_keyset  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402
from config.stock_extraction import (  # noqa: E402
    AMBIGUOUS_NAMES,
    HEAD_NOUN_NAMES,
    HOMONYM_CUES,
)
from extract_telegram_stocks import JOSA_TAIL_RE, build_pattern, extract, load_dictionary  # noqa: E402

# 화면 정원. app/kadera/page.tsx 의 getSurgingStocks(6)·getTopStocksWithTrend(6),
# lib/kadera-why.ts 의 BOARD_TILES, lib/telegram-data.ts 의 KADERA_WINDOW_DAYS 와 같아야 한다.
CARD_N = 6
BOARD_TILES = 9
KADERA_WINDOW_DAYS = 3

# 문맥 발췌 — 매칭 자리 앞뒤 글자 수. 한 줄로 읽히는 길이.
CTX_BEFORE = 45
CTX_AFTER = 45
# 언급 수 구간별 발췌 상한. (하한 언급 수, 발췌 수) — 위에서부터 첫 일치.
CONTEXTS_BY_TIER = ((10, 3), (3, 2), (1, 1))
CONTEXTS_EXPOSED = 4
# 복붙 판정 — 같은 본문 판단에 쓰는 앞부분 길이(check_phantom_stocks 와 같은 규칙).
DUP_PREFIX = 300
DUP_RATIO = 0.8

URL_RE = re.compile(r"(?:https?://|www\.)\S+")
SPACE_RE = re.compile(r"\s+")
# 인정된 자리 바로 뒤에 붙은 한글·영숫자 덩어리(붙은 꼬리 표).
ATTACHED_RE = re.compile(r"[가-힣A-Za-z0-9]+")
HANGUL_RE = re.compile(r"[가-힣]")
# 주식 이야기의 흔적. 문맥 안에 하나라도 있으면 그 언급은 '흔적 있음'. 종목 단위로
# 모든 언급에 흔적이 없을 때만 의심 점수에 반영한다(언급 단위 게이트는 폐기됐다 —
# config/stock_extraction.py 문두, 진짜 26.8% 가 흔적 0).
STOCK_MARK_RE = re.compile(
    r"\d{6}|[+\-▲▼△▽]?\d+(?:\.\d+)?%|\d[\d,]*원|상한가|하한가|목표가|공시|실적|주가|매수|매도|"
    r"특징주|급등|급락|신고가|신저가|수주|계약|종목|시총|시가총액|영업이익|매출|배당|유상증자|"
    r"무상증자|자사주|거래량|투자의견|리포트|코스피|코스닥|상장|IPO|ETF|블록딜|외국인|기관"
)

RISKY_NAMES = set(AMBIGUOUS_NAMES) | set(HEAD_NOUN_NAMES) | set(HOMONYM_CUES)


def normalize(text: str) -> str:
    return SPACE_RE.sub(" ", URL_RE.sub("", text or "")).strip()[:DUP_PREFIX]


def excerpt(text: str, match: str, span: tuple[int, int] | None) -> tuple[str, bool]:
    """매칭 자리 앞뒤를 【】로 표시해 한 줄로. (발췌, 흔적 있음)

    span 은 extract() 가 **인정한 자리**다. 없으면(지금 규칙으로는 이 태그가 안 나온다 —
    저장 뒤 규칙이 바뀐 경우) 본문에서 이름을 찾아 보이되 그렇다고 적는다.
    """
    text = text or ""
    if span:
        i, j = span
        note = ""
    else:
        i = text.lower().find((match or "").lower())
        j = i + len(match or "")
        note = "(지금 규칙으론 안 잡힘) "
    if i < 0 or not match:
        head = SPACE_RE.sub(" ", text[: CTX_BEFORE + CTX_AFTER])
        return f"(매칭 자리를 못 찾음) {head}", bool(STOCK_MARK_RE.search(head))
    a, b = max(0, i - CTX_BEFORE), min(len(text), j + CTX_AFTER)
    window = text[a:b]
    out = f"{'…' if a > 0 else ''}{text[a:i]}【{text[i:j]}】{text[j:b]}{'…' if b < len(text) else ''}"
    return note + SPACE_RE.sub(" ", out), bool(STOCK_MARK_RE.search(window))


def kst_day(posted_at: str) -> str:
    return datetime.fromisoformat(posted_at).astimezone(KST).date().isoformat()


def week_dates(until: date, days: int) -> list[str]:
    return [(until - timedelta(days=days - 1 - i)).isoformat() for i in range(days)]


def load_week(db, since_day: str) -> list[dict]:
    """창 안 메시지 전부(본문 + 붙은 태그). 태그는 임베드로 한 번에 받는다."""
    # 본문 없는 행(미디어만)은 받은 뒤 걸러 낸다 — `text is not null` 을 조회에 얹으면
    # 플래너가 다른 계획을 고를 수 있어(load_window_keyset 주석의 실측) 조회는 창만 자른다.
    rows = load_window_keyset(
        db,
        "telegram_messages",
        "id,channel_handle,message_id,posted_at,text,telegram_message_stocks(stock_code,match_text,method)",
        f"{since_day}T00:00:00+09:00",
    )
    return [r for r in rows if r.get("text")]


def names_of(db, codes: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    codes = sorted(set(codes))
    for i in range(0, len(codes), 200):
        for s in execute_with_retry(
            db.table("stocks").select("code,name,market").in_("code", codes[i : i + 200])
        ).data:
            out[s["code"]] = s
    return out


def exposure_map(db, dates: list[str], names: dict[str, dict]) -> dict[str, list[str]]:
    """그 주에 종목이 화면에 선 자리들. {code: ['급부상 09-15', '까닭 09-17', …]}"""
    exp: dict[str, list[str]] = defaultdict(list)

    # 급부상 카드 · 많이 언급 6 — 날마다 그날을 기준일로 다시 그린다(기준일 앞 창).
    for d in dates:
        rows, ds = surging.load_stock_daily(db, base_date=d)
        if not rows or not ds:
            continue
        for s in surging.top_surging(db, limit=CARD_N, preloaded=(rows, ds), cap=CARD_N):
            exp[s["code"]].append(f"급부상 {d[5:]}")
        win = set(ds[-KADERA_WINDOW_DAYS:])
        w: dict[str, float] = defaultdict(float)
        for r in rows:
            if r["date"] in win:
                w[r["stock_code"]] += float(r["weighted_score"] or 0)
        for code, _ in sorted(w.items(), key=lambda kv: (-kv[1], kv[0]))[:CARD_N]:
            exp[code].append(f"많이언급 {d[5:]}")

    # 까닭 보드 — 까닭이 있고 오른 줄을 등락 순으로 아홉(lib/kadera-why.ts boardOf).
    reasons = execute_with_retry(
        db.table("telegram_stock_move_reason")
        .select("date,stock_code,reason,quoted_change_rate,change_rate")
        .gte("date", dates[0])
        .lte("date", dates[-1])
    ).data
    by_date: dict[str, list[dict]] = defaultdict(list)
    for r in reasons:
        if not (r.get("reason") or "").strip():
            continue
        rate = r.get("change_rate")
        rate = float(rate) if rate is not None else None
        quoted = float(r["quoted_change_rate"]) if r.get("quoted_change_rate") is not None else None
        key = rate if rate is not None else quoted
        if key is None or key <= 0:
            continue
        by_date[r["date"]].append({"code": r["stock_code"], "key": key})
    for d, rows_ in by_date.items():
        for r in sorted(rows_, key=lambda x: -x["key"])[:BOARD_TILES]:
            exp[r["code"]].append(f"까닭 {d[5:]}")

    # 데일리 노트
    for n in execute_with_retry(
        db.table("daily_note").select("date,stocks").gte("date", dates[0]).lte("date", dates[-1])
    ).data:
        for code in (n.get("stocks") or {}).get("kr", []) or []:
            exp[code].append(f"노트 {n['date'][5:]}")

    # 종목 요약(급부상 여섯에 붙는 문장) — 방송이 고른 종목과 같은 집합
    for r in execute_with_retry(
        db.table("telegram_stock_narrative").select("date,stock_code").gte("date", dates[0]).lte("date", dates[-1])
    ).data:
        exp[r["stock_code"]].append(f"요약 {r['date'][5:]}")

    # 트렌딩 태그 — 표엔 이름만 있어 이름으로 되짚는다(이름이 겹치는 종목은 못 잇는다).
    by_name: dict[str, list[str]] = defaultdict(list)
    for code, s in names.items():
        by_name[s["name"]].append(code)
    for t in execute_with_retry(db.table("telegram_trending_message").select("window_key,stocks")).data:
        for nm in t.get("stocks") or []:
            codes = by_name.get(nm, [])
            if len(codes) == 1:
                tag = f"트렌딩({t['window_key']})"
                if tag not in exp[codes[0]]:
                    exp[codes[0]].append(tag)
    return exp


def assess(code: str, info: dict, mentions: list[dict], exposed: list[str], k: int) -> dict:
    n = len(mentions)
    clusters: dict[str, list[dict]] = defaultdict(list)
    for m in mentions:
        clusters[hashlib.sha1(normalize(m["text"]).encode()).hexdigest()].append(m)
    dup = max(len(v) for v in clusters.values()) / n if n else 0.0
    channels = {m["channel"] for m in mentions}
    matches = Counter(m["match"] for m in mentions)
    name = info.get("name", code)
    risky = sorted(set(matches) & RISKY_NAMES)
    alias_only = all(mt != name for mt in matches)

    # 발췌 고르기 — 본문이 다른 것부터, 그 안에서 채널이 겹치지 않게, 매칭 문자열이 다양하게.
    picked: list[dict] = []
    seen_ch: set[str] = set()
    seen_match: set[str] = set()
    ordered = sorted(clusters.values(), key=lambda v: (-len(v), v[0]["date"]))
    for pref_new in (True, False):
        for group in ordered:
            for m in group:
                if len(picked) >= k:
                    break
                if m in picked:
                    continue
                fresh = m["channel"] not in seen_ch or m["match"] not in seen_match
                if pref_new and not fresh:
                    continue
                picked.append(m)
                seen_ch.add(m["channel"])
                seen_match.add(m["match"])
                break
        if len(picked) >= k:
            break
    contexts = []
    any_mark = False
    for m in mentions:
        _, mark = excerpt(m["text"], m["match"], m["span"])
        any_mark = any_mark or mark
        if any_mark:
            break
    for m in picked:
        ex, _ = excerpt(m["text"], m["match"], m["span"])
        contexts.append(f"[{m['channel']} {m['date'][5:]}] {ex}")

    score = 0
    if risky:
        score += 3
    if len(name) <= 2:
        score += 2
    elif len(name) <= 3:
        score += 1
    if n >= 2 and dup >= DUP_RATIO:
        score += 1
    if not any_mark:
        score += 2
    if alias_only:
        score += 1
    return {
        "code": code,
        "name": name,
        "market": info.get("market") or "",
        "n": n,
        "channels": len(channels),
        "dup": dup,
        "matches": matches,
        "risky": risky,
        "any_mark": any_mark,
        "alias_only": alias_only,
        "exposed": exposed,
        "score": score,
        "contexts": contexts,
    }


def contexts_for(n: int, exposed: bool, override: int | None) -> int:
    if override:
        return override
    if exposed:
        return CONTEXTS_EXPOSED
    for floor, k in CONTEXTS_BY_TIER:
        if n >= floor:
            return k
    return 1


def render(a: dict) -> list[str]:
    flags = []
    if a["risky"]:
        flags.append("위험이름 " + "·".join(a["risky"]))
    if a["n"] >= 2 and a["dup"] >= DUP_RATIO:
        flags.append(f"복붙 {a['dup']:.0%}")
    if not a["any_mark"]:
        flags.append("흔적없음")
    if a["alias_only"]:
        flags.append("별칭매칭")
    matches = " ".join(f"{k}×{v}" for k, v in a["matches"].most_common(4))
    head = (
        f"### {a['name']}({a['code']}) 언급 {a['n']} · 채널 {a['channels']} · 매칭 {matches}"
        f" · 의심 {a['score']}"
        + (f" · ⚑ {' · '.join(flags)}" if flags else "")
        + (f" · 노출 {' · '.join(a['exposed'])}" if a["exposed"] else "")
    )
    return [head] + [f"  {c}" for c in a["contexts"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--until", default=None, help="창의 마지막 날(KST, YYYY-MM-DD). 기본 오늘")
    ap.add_argument("--stock", default=None, help="이 종목코드만(쉼표로 여럿)")
    ap.add_argument("--contexts", type=int, default=None, help="종목당 발췌 수를 이 값으로 고정")
    ap.add_argument("--out", default=None, help="보고서를 이 파일에도 쓴다")
    args = ap.parse_args()

    until = date.fromisoformat(args.until) if args.until else today_kst()
    dates = week_dates(until, args.days)
    db = get_client()

    msgs = load_week(db, dates[0])
    msgs = [m for m in msgs if dates[0] <= kst_day(m["posted_at"]) <= dates[-1]]

    # 인정된 자리를 알려면 지금 규칙으로 다시 돌려야 한다(사전은 stocks 전량 — 1000행 캡에
    # 걸린 사전으로 재면 없는 유령이 는다).
    match_to_code, method, ambiguous = load_dictionary(db)
    pattern, caseless = build_pattern(list(match_to_code))

    per_stock: dict[str, list[dict]] = defaultdict(list)
    attached: dict[str, Counter] = defaultdict(Counter)  # 붙은 꼬리(비위험군)
    cased: dict[str, Counter] = defaultdict(Counter)  # 표기가 사전과 다른 대소문자
    tagged_msgs = 0
    for m in msgs:
        tags = m.get("telegram_message_stocks") or []
        if not tags:
            continue
        tagged_msgs += 1
        day = kst_day(m["posted_at"])
        spans: dict[str, tuple[int, int]] = {}
        extract(m["text"], pattern, match_to_code, method, ambiguous, caseless, positions=spans)
        for t in tags:
            code, mt, text = t["stock_code"], t.get("match_text") or "", m["text"] or ""
            span = spans.get(code)
            per_stock[code].append({"channel": m["channel_handle"], "match": mt, "text": text, "date": day, "span": span})
            if span and mt not in AMBIGUOUS_NAMES:
                tail = ATTACHED_RE.match(text, span[1])
                if tail and not (HANGUL_RE.match(tail.group(0)) and JOSA_TAIL_RE.match(text, span[1])):
                    attached[code][f"{mt}|{tail.group(0)[:12]}"] += 1
            # 저장된 match_text 는 위험이름이면 사전 키(NEW), 아니면 본문 표기(SbS)다. 어느 쪽이든
            # 본문 표기를 사전 키와 견준다.
            if span:
                key = mt if mt in match_to_code else caseless.get(mt.lower())
                shown = text[span[0] : span[1]]
                if key and shown != key and shown.lower() == key.lower():
                    cased[code][shown] += 1
    if args.stock:
        per_stock = {c: per_stock.get(c, []) for c in args.stock.split(",")}

    names = names_of(db, list(per_stock))
    exposure = exposure_map(db, dates, names) if not args.stock else defaultdict(list)

    assessed = [
        assess(code, names.get(code, {}), ms, exposure.get(code, []), contexts_for(len(ms), bool(exposure.get(code)), args.contexts))
        for code, ms in per_stock.items()
    ]
    exposed = sorted([a for a in assessed if a["exposed"]], key=lambda a: (-a["score"], -a["n"], a["code"]))
    rest = sorted([a for a in assessed if not a["exposed"]], key=lambda a: (-a["score"], -a["n"], a["code"]))

    lines = [
        f"# 주간 유령 점검 재료 · {dates[0]} ~ {dates[-1]} ({args.days}일)",
        f"메시지 {len(msgs):,} · 태그 붙은 메시지 {tagged_msgs:,} · 종목 {len(assessed):,} · 언급 {sum(a['n'] for a in assessed):,}",
        "",
        "의심 점수 = 위험이름 3 · 이름 2자 2 / 3자 1 · 복붙 1 · 흔적없음 2 · 별칭매칭 1. 읽는 순서일 뿐 판정이 아니다.",
        "【】가 매칭 자리. 발췌는 본문이 서로 다른 것부터 골랐다.",
        "",
    ]
    if not args.stock:
        lines += [f"## 붙은 꼬리 — 위험이름 밖인데 뒤에 조사 아닌 글자가 붙은 자리 ({len(attached)}종목)", ""]
        for code, c in sorted(attached.items(), key=lambda kv: (-sum(kv[1].values()), kv[0])):
            n, tot = sum(c.values()), len(per_stock[code])
            tails = "  ".join(f"{k}×{v}" for k, v in c.most_common(6))
            lines.append(f"- {names.get(code, {}).get('name', code)}({code}) {n}/{tot}: {tails}")
        lines += ["", f"## 표기가 사전과 다른 대소문자 ({len(cased)}종목)", ""]
        for code, c in sorted(cased.items(), key=lambda kv: (-sum(kv[1].values()), kv[0])):
            n, tot = sum(c.values()), len(per_stock[code])
            lines.append(f"- {names.get(code, {}).get('name', code)}({code}) {n}/{tot}: " + "  ".join(f"{k}×{v}" for k, v in c.most_common(6)))
        lines.append("")
    lines += [
        f"## 노출된 종목 {len(exposed)}개 (급부상·많이언급·까닭·노트·요약·트렌딩)",
        "",
    ]
    for a in exposed:
        lines += render(a) + [""]
    lines += [f"## 나머지 종목 {len(rest)}개 (의심 점수 → 언급 순)", ""]
    for a in rest:
        lines += render(a) + [""]

    text = "\n".join(lines)
    print(text)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"\n[저장] {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()

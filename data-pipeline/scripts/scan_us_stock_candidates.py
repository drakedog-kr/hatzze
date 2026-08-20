"""사전에 없는데 자주 오르내리는 **미국 종목 후보**를 뽑아 준다. 읽기만 한다.

`config/us_stock_extraction.py` 머리말이 예고한 유지보수 스캔이다. 그 사전은 사람이
손으로 잇는 목록이라 새 종목이 뜨면(IPO·급등주·갑작스런 뉴스) 반드시 낡는데,
낡은 걸 알아챌 방법이 없었다.

## 왜 필요한지 — 모더나 (2026-08-19)

머크와의 흑색종 백신 3상 성공으로 그날 언급 1위(272회·117채널)였는데 사전에 없어
미장 카더라에도 MDD 검색에도 안 떴다. 언급이 적어서가 아니다. 사전을 만들 때
후보를 **주식 표기가 붙은 자리**($MRNA · MRNA.US)에서만 자동으로 뽑았는데
그 창에 `$MRNA` 가 1건뿐이라 "2회 이상" 문턱에서 떨어졌고, 손으로 더하는 단계에서도
생각나지 않았다. 사전에 든 밸레로(1건)·마드리갈(12건)보다 많은 51건이었는데도 그랬다.

## 그래서 신호를 바꿨다 — **괄호 병기**

이 코퍼스는 종목을 `모더나(MRNA)` 꼴로 적는다. 주식 표기보다 훨씬 흔하고,
덤으로 **한글 표기까지 알려 준다**(사전에 그대로 적어 넣을 수 있다).
실측: MRNA 는 `$MRNA` 7건인데 괄호 병기는 18건·11채널이었다.

⛔ 다만 괄호 병기를 그냥 세면 잡음이 위를 덮는다. `한글용어(약어)` 가 같은 생김새라
   FCF=잉여현금흐름 · HBM=고대역폭메모리 · IR=기업설명회 · EU=유럽연합 이 전부
   SEC 에 실재하는 티커로 걸린다. 그래서 **한글 이름이 영문 회사명의 음차인지**를
   점수로 매겨 가른다(아래 translit_score). 실측 분포는 진짜 중앙 0.82 / 잡음 중앙 0.36.

## 이 스캔은 스스로를 검사한다

`--selftest` 는 **지금 사전에 있는 티커를 이 스캔이 되찾아 오는지** 센다. 사전이
정답지 노릇을 하므로 문턱을 옮길 때 회수율이 얼마나 떨어지는지 바로 보인다.
실측(2026-08-20, 40일 코퍼스): 179개 중 178개가 후보에 오른다(BRK 만 못 잡는다 —
SEC 가 BRK-A/BRK-B 로 실어서 우리 티커 표기와 안 맞는다).

⚠️ 이 스캔이 못 보는 것: **괄호 병기도 주식 표기도 없이 한글로만 불리는 종목.**
   그런 종목은 어느 자동 신호에도 안 걸린다. 스캔은 손을 대신하지 못하고 좁혀 줄 뿐이다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/scan_us_stock_candidates.py                # 최근 30일
    python scripts/scan_us_stock_candidates.py --days 0       # 코퍼스 전체
    python scripts/scan_us_stock_candidates.py --selftest     # 회수율만
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.supabase_client import get_client  # noqa: E402
from config.us_stock_extraction import (  # noqa: E402
    NAME_EXCLUDE,
    SCAN_IGNORE,
    TICKER_NEVER_BARE,
    US_NAMES,
)

# 매칭 기계는 추출 스크립트 것을 그대로 쓴다. '넣으면 몇 건이 잡히나'(소득)를
# 실제 추출과 같은 규칙으로 세야 뜻이 있다 — 경계 검사가 다르면 숫자가 거짓말한다.
from extract_telegram_stocks import (  # noqa: E402
    MASK_CHAR,
    URL_RE,
    boundary_ok,
    build_pattern,
)

# ── 한글 표기가 영문 회사명의 음차인가 ─────────────────────────────────────

_CHO = "g kk n d tt r m b pp s ss - j jj ch k t p h".split()
_JUNG = "a ae ya yae eo e yeo ye o wa wae oe yo u wo we wi yu eu ui i".split()
_JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "l", "l", "l", "l", "l", "l",
         "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"]

# 한국어 음차가 늘 하는 맞바꿈을 양쪽에서 접는다. 접지 않으면 진짜 짝이 잡음처럼 보인다 —
# 실측: 화이자↔Pfizer 0.17 · 버텍스↔Vertex 0.31 · 길리어드↔Gilead 0.42 였다(전부 진짜).
_FOLD = str.maketrans({"v": "b", "f": "p", "z": "j", "l": "r", "c": "k", "q": "k",
                       "x": "k", "w": "u", "y": "i", "h": ""})
_DROP_EN = re.compile(
    r"\b(inc|corp|co|ltd|plc|sa|nv|ag|se|group|holdings?|company|the|technologies|"
    r"technology|international|pharmaceuticals?|systems?|industries|enterprises|"
    r"motors?|labs?|laboratories)\b"
)


def romanize(name: str) -> str:
    """한글을 로마자로 옮긴다. 초성 ㅇ 은 소리가 없다(놓치면 '엔비디아'가 'ngenbidinga')."""
    out: list[str] = []
    for ch in name:
        code = ord(ch) - 0xAC00
        if 0 <= code < 11172:
            cho = _CHO[code // 588]
            out.append(("" if cho == "-" else cho)
                       + _JUNG[(code % 588) // 28] + _JONG[code % 28])
        elif ch.isalnum():
            out.append(ch.lower())
    return "".join(out)


def _fold(s: str) -> str:
    """자음 뼈대만 남긴다. 모음은 음차마다 흔들려서(테슬라/Tesla) 비교를 흐린다."""
    s = re.sub(r"([a-z])\1+", r"\1", s.translate(_FOLD))
    return re.sub(r"[aeiou]", "", s) or s


def _norm_en(name: str) -> str:
    return "".join(c for c in _DROP_EN.sub(" ", name.lower().replace("&", " ")) if c.isalnum())


def translit_score(ko: str, en: str) -> float:
    """0~1. 실측 분포: 사전에 있는 진짜 짝 중앙 0.82 · 잡음 중앙 0.36."""
    a, b = romanize(ko), _norm_en(en)
    if not a or not b:
        return 0.0
    best = 0.0
    for x, y in ((a, b), (_fold(a), _fold(b))):
        if not x or not y:
            continue
        # 영문명 앞부분과도 견준다 — 뒤에 사업부·형태가 길게 붙는 회사가 많다.
        head = y[: max(len(x) + 3, 8)]
        best = max(best,
                   difflib.SequenceMatcher(None, x, y).ratio(),
                   difflib.SequenceMatcher(None, x, head).ratio())
    return best


# ── 코퍼스에서 후보를 긁는 자리 ────────────────────────────────────────────

# 이름은 라틴으로 시작해도 받는다(T모바일 · ST마이크로일렉트로닉스). 대신 한글이
# 한 자는 있어야 한다 — 순수 영문 괄호("Free Cash Flow (FCF)")까지 받으면 잡음이 배가 된다.
# 띄어쓰기는 두 칸까지만 허용한다. 넓히면 앞 문장이 통째로 이름이 된다(실측: "러 상향 조정했다 모더나").
PAT_PAREN = re.compile(
    r"([가-힣A-Za-z][가-힣A-Za-z0-9]{0,11}(?:[ ][가-힣A-Za-z0-9]{1,9}){0,2})"
    r"\s*\(\s*([A-Z]{1,5})(?:\.US)?\s*\)"
)
PAT_NOTATION = re.compile(r"\$([A-Z]{1,5})\b|\b([A-Z]{1,5})\.US\b")
HANGUL = re.compile(r"[가-힣]")

SEC_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
SEC_UA = "hatzze market research hatzze@proton.me"


def fetch_sec_master() -> dict[str, tuple[str, str]]:
    """티커 → (정식 영문명, 거래소). **상장** 목록만 쓴다.

    company_tickers.json(전체 신고자)을 쓰면 상장도 안 된 회사가 후보로 올라온다
    (실측: 스페이스X 가 SPCX 로 49채널에 걸린다).
    """
    req = Request(SEC_URL, headers={"User-Agent": SEC_UA})
    with urlopen(req, timeout=30) as resp:
        raw = json.load(resp)
    idx = {f: i for i, f in enumerate(raw["fields"])}
    out: dict[str, tuple[str, str]] = {}
    for row in raw["data"]:
        ticker = str(row[idx["ticker"]] or "").upper()
        if ticker:
            out.setdefault(ticker, (str(row[idx["name"]]), str(row[idx["exchange"]] or "")))
    return out


def load_messages(db, days: int) -> list[dict]:
    """본문이 있는 메시지. **키셋으로 넘긴다** — 이유는 extract_telegram_us_stocks.py 주석 참고
    (필터가 붙은 `.range()` 는 표가 커지면 statement timeout 으로 죽는다)."""
    since = None
    if days > 0:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    msgs: list[dict] = []
    last_id = ""
    while True:
        q = (db.table("telegram_messages")
             .select("id,channel_handle,text,posted_at")
             .not_.is_("text", "null").order("id").limit(1000))
        if since:
            q = q.gte("posted_at", since)
        if last_id:
            q = q.gt("id", last_id)
        page = q.execute().data
        if not page:
            break
        msgs += page
        last_id = page[-1]["id"]
        if len(page) < 1000:
            break
    return msgs


def collect(messages: list[dict]) -> tuple[dict, dict, list[str]]:
    """티커별 괄호 병기·주식 표기 증거를 모은다. 마스킹한 본문도 함께 돌려준다."""
    paren: dict[str, dict] = defaultdict(
        lambda: {"msgs": 0, "channels": set(), "days": set(), "names": Counter()})
    notation: dict[str, dict] = defaultdict(
        lambda: {"msgs": 0, "channels": set(), "days": set()})
    texts: list[str] = []
    for msg in messages:
        # URL 을 같은 길이로 마스킹한다(추출 스크립트와 같은 이유 — 길이를 유지해야 경계가 안 흔들린다).
        text = URL_RE.sub(lambda m: MASK_CHAR * len(m.group(0)), msg["text"])
        texts.append(text)
        day, channel = msg["posted_at"][:10], msg["channel_handle"]
        seen_p, seen_n = set(), set()
        for name, ticker in PAT_PAREN.findall(text):
            name = name.strip()
            if HANGUL.search(name):
                seen_p.add((ticker, name))
        for dollar, dotus in PAT_NOTATION.findall(text):
            seen_n.add(dollar or dotus)
        for ticker, name in seen_p:
            row = paren[ticker]
            row["msgs"] += 1
            row["channels"].add(channel)
            row["days"].add(day)
            row["names"][name] += 1
        for ticker in seen_n:
            row = notation[ticker]
            row["msgs"] += 1
            row["channels"].add(channel)
            row["days"].add(day)
    return paren, notation, texts


def build_rows(paren, notation, sec, known: set[str]) -> list[dict]:
    rows = []
    for ticker in set(paren) | set(notation):
        if ticker not in sec or ticker in known:
            continue
        p, n = paren.get(ticker), notation.get(ticker)
        name, _ = (p["names"].most_common(1)[0] if p and p["names"] else ("", 0))
        english, exchange = sec[ticker]
        rows.append({
            "ticker": ticker, "english": english, "exchange": exchange, "name": name,
            "score": translit_score(name, english) if name else 0.0,
            "paren": p["msgs"] if p else 0, "notation": n["msgs"] if n else 0,
            "channels": len((p["channels"] if p else set()) | (n["channels"] if n else set())),
            "days": len((p["days"] if p else set()) | (n["days"] if n else set())),
            "never_bare": ticker in TICKER_NEVER_BARE,
            "excluded": name in NAME_EXCLUDE,
        })
    return rows


def measure_gain(rows: list[dict], texts: list[str]) -> None:
    """이름을 사전에 넣으면 몇 건에 잡히는지 = 넣었을 때의 소득.

    추출 스크립트와 **같은** 패턴·경계 규칙으로 센다. 단순 부분문자열로 세면
    "소비자"가 비자로 잡히던 그 오차가 그대로 들어온다.
    """
    names = {r["name"]: r["ticker"] for r in rows if r["name"] and r["name"] not in US_NAMES}
    for row in rows:
        row["gain"] = 0
    if not names:
        return
    pattern, caseless = build_pattern(list(names))
    gain: Counter = Counter()
    for text in texts:
        hit = set()
        for m in pattern.finditer(text):
            matched = m.group(0)
            key = matched if matched in names else caseless.get(matched.lower())
            if key is None or (matched != key and matched.islower()):
                continue
            if not boundary_ok(text, m.start(), m.end(), True):
                continue
            hit.add(key)
        for key in hit:
            gain[key] += 1
    for row in rows:
        row["gain"] = gain.get(row["name"], 0)


def write_issue_body(path: Path, named: list[dict], args, window: str) -> None:
    """주 1회 실행이 열 이슈의 본문. 문턱을 넘은 게 없으면 **빈 파일**을 쓴다.

    빈 파일 = 이슈를 열지 않는다. 매주 여는 게 아니라 **놓치고 있는 게 생겼을 때만**
    부른다. 같은 후보가 매주 다시 오르는 것은 SCAN_IGNORE 가 막는다.
    """
    hot = [r for r in named
           if r["gain"] >= args.alert_min_gain
           and r["score"] >= args.alert_min_score
           and r["channels"] >= args.alert_min_channels
           and not r["excluded"]]
    if not hot:
        path.write_text("")
        return
    lines = [
        f"미국 종목 사전에 **없는데** 최근 오르내리는 종목이 {len(hot)}개 있습니다.",
        "",
        f"- 창: {window} · 문턱: 소득 ≥ {args.alert_min_gain} · 음차 ≥ {args.alert_min_score}"
        f" · 채널 ≥ {args.alert_min_channels}",
        "- 소득 = 그 한글 표기를 사전에 넣으면 실제로 잡히는 메시지 수",
        "",
        "| 티커 | 한글 후보 | 소득 | 채널 | 음차 | SEC 영문명 |",
        "|---|---|---:|---:|---:|---|",
    ]
    for r in hot:
        flag = " ⚠bare금지" if r["never_bare"] else ""
        lines.append(f"| `{r['ticker']}` | {r['name']} | {r['gain']} | {r['channels']} "
                     f"| {r['score']:.2f} | {r['english'][:40]}{flag} |")
    lines += [
        "",
        "### 넣으려면",
        "",
        "`config/us_stock_extraction.py` 의 `US_NAMES` 에 아래를 더하고, 테마가 필요하면",
        "`config/us_stock_themes.py` 와 그 TS 사본(`lib/us-stock-themes.ts`)도 같이 고칩니다.",
        "추출은 전량 재계산이라 머지 뒤 첫 실행이 과거분까지 소급해 채웁니다.",
        "",
        "```python",
    ]
    lines += [f'    "{r["name"]}": "{r["ticker"]}",' for r in hot]
    lines += [
        "```",
        "",
        "### ⛔ 그냥 넣지 마십시오",
        "",
        "음차 점수는 '이 한글이 저 영문의 소리인가'만 잽니다. '그 자리가 회사 이야기인가'는",
        "못 잽니다. 표본을 눈으로 보고 거를 것 셋입니다.",
        "",
        "- 회사 이름이 거래소·지수 이름이기도 한 것 (나스닥)",
        "- 국내 상장사의 ADR (SK하이닉스). 국내 사전과 두 번 셉니다",
        "- 우연히 소리가 맞는 일반명사 (소프트웨어 ↔ Smurfit Westrock)",
        "",
        "안 넣기로 했으면 `SCAN_IGNORE` 에 티커와 이유를 적어 주십시오. 안 적으면",
        "**다음 주에 같은 후보가 다시 올라옵니다.**",
    ]
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30, help="며칠치를 볼지(0=전체). 기본 30")
    ap.add_argument("--top", type=int, default=40, help="표에 몇 줄을 보일지. 기본 40")
    ap.add_argument("--min-score", type=float, default=0.5, help="음차 점수 문턱. 기본 0.5")
    ap.add_argument("--min-channels", type=int, default=2,
                    help="한 채널의 버릇을 거르는 문턱. 기본 2")
    ap.add_argument("--selftest", action="store_true",
                    help="지금 사전을 이 스캔이 되찾아 오는지만 센다")
    # ── 주 1회 자동 실행이 이슈를 열 문턱 ──
    # 표(①)보다 훨씬 좁게 잡는다. 표는 사람이 훑어보는 목록이고 이쪽은 사람을 부르는
    # 알림이라, 잡음이 한 번 섞이면 다음 주부터 아무도 안 본다.
    ap.add_argument("--alert-min-gain", type=int, default=30)
    ap.add_argument("--alert-min-score", type=float, default=0.7)
    ap.add_argument("--alert-min-channels", type=int, default=3)
    ap.add_argument("--issue-body", metavar="경로",
                    help="문턱을 넘은 후보가 있으면 그 경로에 이슈 본문을 쓴다. "
                         "없으면 **빈 파일**을 쓴다(워크플로가 그걸로 이슈를 열지 말지 가른다)")
    args = ap.parse_args()

    db = get_client()
    sec = fetch_sec_master()
    messages = load_messages(db, args.days)
    window = "전체" if args.days <= 0 else f"최근 {args.days}일"
    print(f"[재료] {window} 메시지 {len(messages):,}건 · SEC 상장 마스터 {len(sec):,}종목 "
          f"· 사전 {len(set(US_NAMES.values()))}티커")
    paren, notation, texts = collect(messages)

    # ── 회수율: 사전이 정답지다 ──
    known = set(US_NAMES.values())
    seen = {t for t in set(paren) | set(notation) if t in sec}
    recalled = known & seen
    print(f"[회수 검사] 사전 {len(known)}티커 중 {len(recalled)}개가 후보 신호에 걸린다"
          f" ({len(recalled) / max(1, len(known)) * 100:.0f}%)"
          + (f" · 안 걸린 것: {', '.join(sorted(known - seen))}" if known - seen else ""))
    if args.selftest:
        return

    rows = build_rows(paren, notation, sec, known)
    ignored = [r for r in rows if r["ticker"] in SCAN_IGNORE]
    rows = [r for r in rows if r["ticker"] not in SCAN_IGNORE]
    if ignored:
        print(f"[무시] 안 넣기로 한 {len(ignored)}티커를 뺐다"
              f"({', '.join(sorted(r['ticker'] for r in ignored))}). "
              f"이유는 config/us_stock_extraction.py 의 SCAN_IGNORE 에 있다")
    named = [r for r in rows if r["name"] and r["score"] >= args.min_score
             and r["channels"] >= args.min_channels]
    measure_gain(named, texts)
    # ⛔ 소득순으로 줄 세우면 안 된다. **일반명사일수록 소득이 크다** —
    #    실측으로 "소프트웨어"(2,302건) · "기업설명회"(819건)가 암젠(96건) 위에 선다.
    #    그래서 확신도(음차)를 0.1 단위로 묶어 먼저 세우고, 그 안에서만 소득순으로 둔다.
    named.sort(key=lambda r: (-round(r["score"], 1), -r["gain"]))

    dropped = len(rows) - len(named)
    print(f"\n=== ① 한글 이름까지 나온 후보 — {len(named)}티커 "
          f"(음차<{args.min_score} 또는 채널<{args.min_channels} 로 뺀 것 {dropped}) ===")
    print("소득 = 그 이름을 사전에 넣으면 실제로 잡히는 메시지 수")
    print(f"\n{'티커':<7}{'소득':>7}{'채널':>5}{'날짜':>5}{'괄호':>5}{'표기':>5}{'음차':>6}"
          f"  {'한글 후보':<16} SEC 영문명")
    for r in named[:args.top]:
        flag = " ⚠bare금지" if r["never_bare"] else (" ⚠일부러뺀이름" if r["excluded"] else "")
        print(f"{r['ticker']:<7}{r['gain']:>7}{r['channels']:>5}{r['days']:>5}"
              f"{r['paren']:>5}{r['notation']:>5}{r['score']:>6.2f}  "
              f"{r['name'][:16]:<16} {r['english'][:30]}{flag}")
    if len(named) > args.top:
        print(f"  … {len(named) - args.top}줄 더 있다(--top 으로 늘릴 것)")

    # ── ② 이름이 안 잡힌 것 ──
    shown = {r["ticker"] for r in named}
    bare = [r for r in rows if r["notation"] >= 2 and r["ticker"] not in shown
            and r["channels"] >= args.min_channels]
    bare.sort(key=lambda r: (-r["channels"], -r["notation"]))
    print(f"\n=== ② 주식 표기($TICK · TICK.US)만 있고 한글 이름은 못 얻은 후보 "
          f"— {len(bare)}티커 ===")
    print("이쪽은 한글 표기를 사람이 직접 정해야 한다.")
    print(f"\n{'티커':<7}{'채널':>5}{'날짜':>5}{'표기':>5}  SEC 영문명")
    for r in bare[:15]:
        print(f"{r['ticker']:<7}{r['channels']:>5}{r['days']:>5}{r['notation']:>5}  "
              f"{r['english'][:40]}" + (" ⚠bare금지" if r["never_bare"] else ""))
    if len(bare) > 15:
        print(f"  … {len(bare) - 15}줄 더 있다")

    ready = [r for r in named if r["score"] >= 0.7 and not r["excluded"]][:12]
    print(f"\n=== 그대로 붙여 넣을 수 있는 줄 (① 중 음차 0.7 이상 {len(ready)}줄) ===")
    print("⛔ 넣기 전에 표본을 눈으로 볼 것. 음차 점수는 '이 한글이 저 영문의 소리인가'만 재지,")
    print("   '그 자리가 회사 이야기인가'는 못 잰다. 걸러야 할 것 셋:")
    print("   · 회사 이름이 거래소·지수 이름이기도 한 것 — 나스닥(NDAQ) 3,268건이 그렇다")
    print("   · 국내 상장사의 ADR — SK하이닉스(SKHY). 국내 사전과 겹치니 넣지 말 것")
    print("   · 우연히 소리가 맞는 일반명사 — 소프트웨어↔Smurfit Westrock 0.55")
    for r in ready:
        print(f'    "{r["name"]}": "{r["ticker"]}",'.ljust(44)
              + f'# {r["gain"]}건 · {r["channels"]}채널')

    if args.issue_body:
        write_issue_body(Path(args.issue_body), named, args, window)


if __name__ == "__main__":
    main()

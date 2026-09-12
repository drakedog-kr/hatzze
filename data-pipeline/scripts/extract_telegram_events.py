"""채널 글에서 **앞날의 일정**을 뽑는다 → telegram_stock_event (+ telegram_event_scan)

카더라 '다가오는 일정' 카드와 종목 화면의 재료다. "앞으로 뭐 있어"에 채널들이 흘려
둔 날짜(상장·보호예수 해제·임상 결과·실적 발표·주총·분할 기일…)를 종목에 붙여 모은다.

## 세 단계

  ① 서버에서 미리 거른다 — 총평 넷째 대목이 쓰는 schedule_prefilter(월 이름·'예정일자'
     따위 or 조건)를 그대로 쓴다. 본문을 통째로 실어 오지 않기 위해서다.
  ② 파이썬에서 다시 거른다 — 앞날 시점 + 앞으로 일어날 일 + 종목에 붙는 일정.
     총평의 schedule_hit 보다 조금 넓다(임상·허가·학회·착공·출시까지).
  ③ Haiku 가 (회사, 날짜, 정밀도, 무슨 일, 시장) 을 뽑는다. 회사 이름은 시장에 맞는 사전으로
     잇는다 — 국내는 extract_telegram_stocks, 미국은 extract_telegram_us_stocks. 못 이으면 버린다.

## 국장·미장을 한 번에 뽑는다

프롬프트가 이미 market 을 KR·US·MACRO·OTHER 로 받고 있었고, 2026-09-06 까지는 **US 를 받아
버리고 있었다**(백필 실측: KR 479 · US 490 · MACRO 312 · OTHER 81). 버리던 것을 저장하는
것뿐이라 **LLM 비용이 한 푼도 안 는다.** MACRO·OTHER 는 계속 버린다 — 어느 종목의 일정도
아니고, 그 이야기는 총평의 넷째 대목이 이미 다룬다.

⚠️ 그래서 미장 표를 붙인 날에는 그 창을 `--rescan` 으로 한 번 다시 훑어야 한다(읽음 표시를
무시하고 같은 메시지를 다시 묻는다). 옛 읽음 표시에는 US 몫이 비어 있다.

## 증분

읽은 메시지는 일정이 0건이어도 telegram_event_scan 에 남긴다. 다음 실행은 그걸 빼고
부른다. 하루 새 후보가 4백 건 안팎이라 비용은 몇 센트다. 백필은 `--days 14`.

## 날짜 정밀도가 요점이다

모델이 "연말"·"내년"을 12-31·01-01 로 굳혀 쓴다(2026-09-06 표본 150건 실측). 그래서
정밀도(day·month·quarter·year)를 따로 받고, 화면 달력에는 day 만 올린다.
작성일보다 앞선 날짜(지난 일)는 버린다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/extract_telegram_events.py --dry-run           # 후보만 센다(호출 없음)
    python scripts/extract_telegram_events.py                     # 최근 2일 · 저장
    python scripts/extract_telegram_events.py --days 14 --max 6000  # 백필
    python scripts/extract_telegram_events.py --days 14 --rescan    # 읽음 표시 무시하고 다시
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.llm_client import HAS_LLM_CREDENTIAL, get_llm_client  # noqa: E402

from common.config import ANTHROPIC_API_KEY  # noqa: E402
from common.supabase_client import get_client, load_keyset  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402

import extract_telegram_stocks as EX  # noqa: E402
import extract_telegram_us_stocks as USEX  # noqa: E402
import generate_telegram_narratives as KR  # noqa: E402

MODEL = KR.MODEL
TABLE = "telegram_stock_event"
US_TABLE = "telegram_us_stock_event"
SCAN = "telegram_event_scan"

DAYS = 2            # 기본 창(오늘·어제). 어제를 다시 보는 건 저녁에 올라온 글을 아침이 줍기 위해서다
MAX_MSGS = 800      # 한 실행에 부를 최대 메시지. 백필은 --max 로 올린다
BATCH = 10          # 호출당 메시지 수
LOOKAHEAD_DAYS = 400  # 작성일에서 이보다 먼 날짜는 안 믿는다
TEXT_CAP = 700      # 메시지당 본문 상한(토큰 절약. 일정 문장은 대개 앞쪽에 있다)

# ── ② 파이썬 필터 — 총평(schedule_hit)보다 조금 넓다 ─────────────────────────
_WILL = re.compile(
    r"예정|앞두고|앞둔|앞으로|열린다|열립니다|공개|발표|상장|출시|개최|만기|기준일|청약|컨콜|어닝|"
    r"진행될|진행한다|예고|계획"
)
_KIND = re.compile(
    r"예정일자\s*[:：]|실적\s*발표|잠정실적|어닝|컨콜|컨퍼런스콜|상장|청약|IPO|공모|스팩|"
    r"주주총회|주총|배당\s*기준일|배당락|유상증자|무상증자|전환사채|블록딜|보호예수|락업|의무보유|"
    r"편입|리밸런싱|MSCI|FTSE|코스피200|코스닥150|신제품|출시|공개\s*예정|언팩|"
    r"개발자\s*컨퍼런스|GTC|CES|WWDC|임상|톱라인|탑라인|학회|ASCO|ESMO|AACR|허가|승인|심사|"
    r"착공|준공|양산|가동|분할|합병|기일|납입|신주|권리락|공장|출하"
)


def event_hit(text: str, base: date) -> bool:
    if not (_WILL.search(text) and _KIND.search(text)):
        return False
    m = KR._SCHED_ABS.search(text)
    if m:
        if m.group(1):
            try:
                d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                return False
            return d >= base
        try:
            d = date(base.year, int(m.group(4)), int(m.group(5)))
        except ValueError:
            return False
        # 올해 안에 이미 지난 월·일이면 내년 것일 수 있다 — 그건 모델이 판단하게 통과시킨다.
        return d >= base - timedelta(days=30) or True
    return bool(KR._SCHED_REL.search(text)) or bool(re.search(r"\d{1,2}\s*월\s*(초|중순|중|말|내)", text))


# ── ③ 프롬프트 ────────────────────────────────────────────────────────────────
SYSTEM = """당신은 한국 주식 텔레그램 메시지에서 **앞으로 예정된 일정**만 뽑는 추출기입니다.
각 메시지에는 [작성일]이 붙어 있습니다. 작성일 기준으로 **아직 오지 않은** 일정만 뽑습니다.
이미 지난 일(발표했다, 체결했다, 상장했다)은 뽑지 않습니다.

일정마다:
- company: 어느 회사·종목의 일인지, 메시지에 적힌 이름 그대로. 특정 회사 일이 아니면 빈 문자열.
- date: YYYY-MM-DD. 상대 표현(내일·다음 주·이달 말)은 작성일 기준으로 환산.
  달만 있으면 그 달 1일, 분기만 있으면 그 분기 첫날, 해만 있으면 그 해 1월 1일로 적되
  precision 에 사실대로 표시합니다.
- precision: day(날짜가 적혀 있었다) · month(달만) · quarter(분기만) · year(해만).
  "연말"은 month 가 아니라 year 입니다. "하반기"는 quarter 로 두고 7월 1일로 적습니다.
- event: 무슨 일인지 짧은 명사구(예: 3상 임상 결과 발표, 실적 발표, 보호예수 해제,
  신주 상장, 주주총회, 인적분할 기일, 신제품 공개). 전망·권유는 넣지 않습니다.
- market: KR(국내 상장사) · US(미국 상장사) · MACRO(경제지표·정책·시장 전체) · OTHER.

확실한 것만 뽑고, 없으면 빈 배열입니다. 메시지마다 결과를 하나씩, 입력 순서대로 냅니다."""

SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "company": {"type": "string"},
                                "date": {"type": "string"},
                                "precision": {"type": "string", "enum": ["day", "month", "quarter", "year"]},
                                "event": {"type": "string"},
                                "market": {"type": "string", "enum": ["KR", "US", "MACRO", "OTHER"]},
                            },
                            "required": ["company", "date", "precision", "event", "market"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["n", "events"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}


def kst_dt(posted_at: str) -> datetime:
    return datetime.fromisoformat(posted_at.replace("Z", "+00:00")).astimezone(KST)


def build_prompt(group: list[dict]) -> str:
    parts = []
    for i, r in enumerate(group, 1):
        d = kst_dt(r["posted_at"]).strftime("%Y-%m-%d (%a)")
        text = " ".join((r.get("text") or "").split())[:TEXT_CAP]
        parts.append(f"### {i}\n[작성일 {d}]\n{text}")
    return "\n\n".join(parts)


CHUNK_DAYS = 2  # 서버 ilike 조회를 며칠씩 끊어 부르나(아래 주석)


def load_candidates(db, since_day: date, base: date) -> list[dict]:
    """창을 **이틀씩 끊어** 부른다.

    ilike 열 개를 본문에 거는 조회라 창이 길면 한 페이지가 statement timeout(8초)에 걸린다 —
    14일을 한 번에 물었더니 첫 페이지에서 57014 로 죽었다(2026-09-06 실측). 사흘은 5.7초,
    하루는 0.9초였다. 이틀이면 여유가 있다. 위 경계(lt)를 같이 걸어야 청크가 겹치지 않는다.
    """
    pre = KR.schedule_prefilter(base)
    rows: list[dict] = []
    start = since_day - timedelta(days=1)  # KST 경계 여유분(kst_dt 로 아래에서 다시 거른다)
    end = base + timedelta(days=1)
    cur = start
    while cur < end:
        nxt = min(cur + timedelta(days=CHUNK_DAYS), end)
        a, b = f"{cur.isoformat()}T00:00:00Z", f"{nxt.isoformat()}T00:00:00Z"
        rows += load_keyset(
            db,
            "telegram_messages",
            "id,channel_handle,message_id,posted_at,text",
            narrow=lambda q, a=a, b=b: q.gte("posted_at", a).lt("posted_at", b).not_.is_("text", "null").or_(pre),
        )
        cur = nxt
    out = []
    for r in rows:
        if kst_dt(r["posted_at"]).date() < since_day:
            continue
        text = " ".join((r.get("text") or "").split())
        if text and event_hit(text, base):
            out.append(r)
    return out


def load_scanned(db, since_utc: str) -> set[tuple]:
    rows = load_keyset(
        db, SCAN, "id,channel_handle,message_id",
        narrow=lambda q: q.gte("scanned_at", since_utc),
    )
    return {(r["channel_handle"], r["message_id"]) for r in rows}


class Linker:
    """회사 이름(문자열) → 종목코드. 종목 추출과 같은 사전·같은 경계 규칙을 쓴다."""

    def __init__(self, db):
        self.match_to_code, self.method, self.ambiguous = EX.load_dictionary(db)
        self.pattern, self.caseless = EX.build_pattern(list(self.match_to_code))

    def code_of(self, company: str) -> str | None:
        c = " ".join((company or "").split())
        if not c:
            return None
        found = EX.extract(c, self.pattern, self.match_to_code, self.method, self.ambiguous, self.caseless)
        if len(found) == 1:
            return next(iter(found))
        if len(found) > 1:
            # "삼성전자·SK하이닉스" 처럼 둘을 한 회사로 적은 경우는 버린다. 다만 정식명과
            # 정확히 같은 것이 하나면 그것을 쓴다(긴 이름 안에 짧은 이름이 겹친 경우).
            exact = [code for code, (m, _) in found.items() if m == c]
            if len(exact) == 1:
                return exact[0]
        return None


class UsLinker:
    """회사 이름(문자열) → 미국 티커. 미국 종목 추출과 같은 사전·같은 경계 규칙을 쓴다.

    ⚠️ **모델이 붙인 market 라벨을 믿고 사전을 고른다.** 두 사전을 다 대 보면 국내 GS(078930)와
    골드만삭스(GS)처럼 글자가 같은 이름에서 시장이 뒤집힌다(US_TICKER_COLLISION 이 다루는 그
    부류다). 모델은 메시지 전체를 봤으니 그 판정이 자리보다 낫다.
    """

    def __init__(self):
        self.match_to_ticker = USEX.build_dictionary()
        self.pattern, self.caseless = EX.build_pattern(list(self.match_to_ticker))

    def ticker_of(self, company: str) -> str | None:
        c = " ".join((company or "").split())
        if not c:
            return None
        found = USEX.extract(c, self.pattern, self.match_to_ticker, self.caseless)
        if len(found) == 1:
            return next(iter(found))
        if len(found) > 1:
            exact = [tk for tk, matched in found.items() if matched == c]
            if len(exact) == 1:
                return exact[0]
        return None


def parse_date(s: str) -> date | None:
    try:
        return date.fromisoformat((s or "").strip()[:10])
    except ValueError:
        return None


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    days = int(args[args.index("--days") + 1]) if "--days" in args else DAYS
    max_msgs = int(args[args.index("--max") + 1]) if "--max" in args else MAX_MSGS
    rescan = "--rescan" in args  # 읽음 표시를 무시한다(사전·표를 새로 붙였을 때)

    if not HAS_LLM_CREDENTIAL and not dry_run:
        print("[skip] LLM 자격(구독 토큰·API 키)이 없어 일정 추출을 건너뜁니다.")
        return
    db = get_client()
    base = today_kst()
    since_day = base - timedelta(days=days - 1)

    cands = load_candidates(db, since_day, base)
    since_utc = f"{(since_day - timedelta(days=1)).isoformat()}T00:00:00Z"
    scanned: set[tuple] = set()
    if not rescan:
        try:
            scanned = load_scanned(db, since_utc)
        except Exception as exc:  # noqa: BLE001
            print(f"[경고] {SCAN} 을 못 읽었습니다(마이그레이션 066 전?): {exc}")
    fresh = [r for r in cands if (r["channel_handle"], r["message_id"]) not in scanned]
    # 최신 글부터. 상한에 걸리면 오래된 글이 다음 실행으로 밀린다.
    fresh.sort(key=lambda r: r["posted_at"], reverse=True)
    todo = fresh[:max_msgs]
    print(f"[{since_day}~{base}] 후보 {len(cands)} · 이미 읽음 {len(cands) - len(fresh)} · 이번에 {len(todo)}"
          + (f" (상한 {max_msgs}, 남은 {len(fresh) - len(todo)})" if len(fresh) > max_msgs else ""))
    if dry_run:
        for r in todo[:10]:
            print("·", r["channel_handle"], kst_dt(r["posted_at"]).strftime("%m-%d"), "|",
                  " ".join(r["text"].split())[:120])
        print(f"[dry-run] 호출·저장 없이 종료합니다({len(todo)}건).")
        return
    if not todo:
        return

    linker = Linker(db)
    us_linker = UsLinker()
    client = get_llm_client(ANTHROPIC_API_KEY)
    now = datetime.now(timezone.utc).isoformat()
    saved = us_saved = 0
    scan_rows: list[dict] = []
    markets: Counter = Counter()
    dropped = Counter()
    for s in range(0, len(todo), BATCH):
        group = todo[s : s + BATCH]
        try:
            res = client.messages.create(
                model=MODEL, max_tokens=2500, system=SYSTEM,
                messages=[{"role": "user", "content": build_prompt(group)}],
                output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            )
            data = json.loads("".join(b.text for b in res.content if b.type == "text"))
        except Exception as exc:  # noqa: BLE001
            print(f"  [배치 {s // BATCH + 1}] 실패: {type(exc).__name__}: {exc}")
            continue
        got: dict[int, list] = {}
        for item in data.get("results", []):
            if isinstance(item.get("n"), int):
                got[item["n"]] = item.get("events") or []
        event_rows: list[dict] = []
        us_rows: list[dict] = []
        for i, r in enumerate(group, 1):
            posted = kst_dt(r["posted_at"]).date()
            n_ok = 0
            for e in got.get(i, []):
                market = e.get("market")
                markets[market] += 1
                # MACRO·OTHER 는 버린다 — 어느 종목의 일정도 아니고 총평 넷째 대목이 이미 다룬다.
                if market not in ("KR", "US"):
                    continue
                d = parse_date(e.get("date", ""))
                if not d:
                    dropped["날짜 못 읽음"] += 1
                    continue
                if d < posted or d > posted + timedelta(days=LOOKAHEAD_DAYS):
                    dropped["지난 날짜·너무 먼 날짜"] += 1
                    continue
                ev = " ".join((e.get("event") or "").split())[:60]
                if not ev:
                    dropped["행사 없음"] += 1
                    continue
                base = {
                    "channel_handle": r["channel_handle"], "message_id": r["message_id"],
                    "event_date": d.isoformat(), "date_precision": e.get("precision") or "day",
                    "event": ev, "posted_at": r["posted_at"], "model": MODEL,
                }
                # ⚠️ **회사 없음과 사전에 없음을 갈라 센다.** 처음엔 한 통에 담았더니 미장 드롭이
                #    400 으로 찍혀 "사전이 형편없다"로 읽혔는데, 그 대부분이 지수 리밸런싱·
                #    금리 결정처럼 애초에 **회사가 없는 일정**이었다(2026-09-07 실측).
                company = " ".join((e.get("company") or "").split())
                if not company:
                    dropped["회사 이름 없음"] += 1
                    continue
                if market == "KR":
                    code = linker.code_of(company)
                    if not code:
                        dropped["국내 사전에 없음"] += 1
                        continue
                    event_rows.append({**base, "stock_code": code})
                else:
                    tk = us_linker.ticker_of(company)
                    if not tk:
                        dropped["미국 사전에 없음"] += 1
                        continue
                    us_rows.append({**base, "ticker": tk})
                n_ok += 1
            scan_rows.append({"channel_handle": r["channel_handle"], "message_id": r["message_id"],
                              "event_count": n_ok, "scanned_at": now})

        # 같은 메시지 안의 중복(같은 종목·날짜·행사)은 하나만
        def flush(rows: list[dict], table: str, key: str) -> int:
            uniq: dict[tuple, dict] = {}
            for row in rows:
                uniq[(row["channel_handle"], row["message_id"], row[key], row["event_date"], row["event"])] = row
            if not uniq:
                return 0
            db.table(table).upsert(list(uniq.values()),
                                   on_conflict=f"channel_handle,message_id,{key},event_date,event").execute()
            for row in uniq.values():
                print(f"  {row['event_date']} · {row[key]} · {row['event']} [{row['date_precision']}]")
            return len(uniq)

        saved += flush(event_rows, TABLE, "stock_code")
        try:
            us_saved += flush(us_rows, US_TABLE, "ticker")
        except Exception as exc:  # noqa: BLE001
            # 미장 표가 아직 없는 환경(마이그레이션 069 전)에서도 국장 몫은 나가야 한다.
            print(f"  [미장] 저장 실패: {type(exc).__name__}: {exc}")
    for i in range(0, len(scan_rows), 500):
        db.table(SCAN).upsert(scan_rows[i : i + 500], on_conflict="channel_handle,message_id").execute()
    print(f"[Supabase] {TABLE} {saved}건 · {US_TABLE} {us_saved}건 저장 · "
          f"읽음 표시 {len(scan_rows)}건 · 시장별 {dict(markets)} · 버림 {dict(dropped)}")


if __name__ == "__main__":
    main()

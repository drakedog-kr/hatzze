"""텔레그램 메시지 본문에서 **미국 종목**을 추출해 telegram_message_us_stocks 에 저장한다.

국내 짝은 `extract_telegram_stocks.py`. 수집은 공유한다 — 같은 채널 317개, 같은 메시지다.
갈리는 건 사전뿐이라 **매칭 기계는 그쪽 것을 그대로 import 해서 쓴다.**

## 직접 짜지 말 것 (실제로 당했다)

경계 검사를 새로 짜면서 **왼쪽 경계를 빠뜨렸더니** "소**비자**"가 Visa 언급 1,191건으로,
"**애플**리케이션"이 애플로 잡혔다. `boundary_ok` 가 앞 글자(한글/영숫자/한자)를 보는
이유가 정확히 그것이다. URL 마스킹·긴이름 우선·대소문자 규칙도 같은 이유로 재사용한다.

## 국내와 다르게 하는 것 셋

1. **사전이 DB 가 아니라 config 에서 온다.** 국내는 KRX API 가 종목명을 주지만
   미국은 한글 표기를 주는 원천이 없다. `config/us_stock_extraction.py` 가 원본이고,
   이 스크립트가 실행 첫머리에 `us_stocks` 표로 밀어 넣는다(프론트가 읽어야 해서).

2. **모든 표기를 '오탐 위험군'으로 본다.** 국내는 AMBIGUOUS_NAMES 만 뒤 경계를 보지만,
   외래어 표기는 어느 것이든 더 긴 낱말의 앞부분이 될 수 있어 전부 양쪽을 검사한다.
   (메타↔메타버스, 애플↔애플리케이션, 코닝↔코닝사 …)

3. **뒤 문맥으로 가르는 자리가 있다**(NEGATIVE_CONTEXT). 이름은 멀쩡한데 같은 문자열이
   제품명·기술명으로도 쓰이는 것들이다: RTX+숫자=GPU · ARM+아키텍처 · 구글+플레이.
   국내의 '동음이의'(결 ③)와 같은 부류라 이름을 죽이지 않고 자리를 본다.

국내에만 있는 규칙(compound_key·publisher_context·modifier_context·우선주)은 안 쓴다.
전부 한국 상장사 이름의 생김새에서 나온 규칙이라 미국 종목엔 걸릴 자리가 없다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/extract_telegram_us_stocks.py --dry-run   # 측정만, DB 안 씀
    python scripts/extract_telegram_us_stocks.py             # 저장
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.supabase_client import get_client  # noqa: E402
from config.us_stock_extraction import (  # noqa: E402
    NAME_EXCLUDE,
    NEGATIVE_CONTEXT,
    US_NAMES,
    primary_names,
    sanity_check,
)

# 매칭 기계는 국내 스크립트 것을 그대로 쓴다(위 docstring 참고).
from extract_telegram_stocks import (  # noqa: E402
    MASK_CHAR,
    URL_RE,
    boundary_ok,
    build_pattern,
)

NEG_RE = {name: re.compile(pat) for name, pat in NEGATIVE_CONTEXT.items()}


def build_dictionary() -> dict[str, str]:
    """매칭 표기 → 티커. NAME_EXCLUDE 는 애초에 넣지 않는다."""
    return {name: tk for name, tk in US_NAMES.items() if name not in NAME_EXCLUDE}


def extract(text: str, pattern, match_to_ticker: dict[str, str], caseless: dict[str, str]) -> dict[str, str]:
    """티커 → 본문에 적혀 있던 표기. 한 메시지에서 같은 종목은 한 번만 센다."""
    # URL 을 같은 길이로 마스킹한다. 길이를 유지해야 경계 판정이 안 흔들린다.
    text = URL_RE.sub(lambda m: MASK_CHAR * len(m.group(0)), text)

    found: dict[str, str] = {}
    for m in pattern.finditer(text):
        matched = m.group(0)
        # 대소문자를 무시해 잡힌 표기는 사전 키로 되돌린다(build_pattern 의 역인덱스).
        key = matched if matched in match_to_ticker else caseless.get(matched.lower())
        if key is None:
            continue
        # 대소문자를 푼 표기가 통째로 소문자면 산문일 가능성이 높다(국내 쪽과 같은 방어).
        if matched != key and matched.islower():
            continue
        # 외래어 표기는 전부 오탐 위험군으로 본다 → is_ambiguous=True 로 양쪽 경계 검사.
        if not boundary_ok(text, m.start(), m.end(), True):
            continue
        # 제품명·기술명으로도 쓰이는 자리는 뒤 문맥으로 가른다.
        neg = NEG_RE.get(key)
        if neg and neg.match(text, m.end()):
            continue
        ticker = match_to_ticker[key]
        found.setdefault(ticker, matched)
    return found


# SEC 가 공개하는 티커↔정식 영문명 목록. 키·토큰이 필요 없고 하루 한 번도 안 바뀐다.
# ⚠️ User-Agent 에 연락처가 없으면 403 이다(SEC 접근 정책).
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_UA = "hatzze market research hatzze@proton.me"

# SEC 목록은 클래스까지 적는다(BRK-A/BRK-B). 우리 사전은 클래스 없는 티커를 쓰므로
# 그대로는 안 잡힌다 — 야후도 같은 사정이라 lib/yahoo-history.ts 에 이미 별칭이 있다.
# ⚠️ 이 칸이 비면 **매일 SEC 를 한 번씩 헛되이 부른다**(채울 게 남았다고 보므로).
SEC_TICKER_ALIAS = {"BRK": "BRK-B"}


def fetch_sec_names(tickers: set[str]) -> dict[str, str]:
    """티커 → 정식 영문명. 실패하면 빈 사전 — **이 스크립트의 본업을 막지 않는다.**

    실측으로 우리 사전 178종목이 전부 잡힌다(BRK 는 SEC_TICKER_ALIAS 를 거친다).
    """
    try:
        req = Request(SEC_TICKERS_URL, headers={"User-Agent": SEC_UA})
        with urlopen(req, timeout=30) as resp:
            raw = json.load(resp)
    except Exception as exc:  # 네트워크·형식 무엇이든
        print(f"[경고] SEC 영문명을 못 받았습니다({exc}). 이번 실행은 건너뜁니다.")
        return {}
    # SEC 표기 → 우리 티커. 별칭을 뒤집어 둬야 BRK-B 를 받아 BRK 자리에 넣는다.
    want = {SEC_TICKER_ALIAS.get(t, t): t for t in tickers}
    out: dict[str, str] = {}
    for row in raw.values():
        tk = str(row.get("ticker", "")).upper()
        ours = want.get(tk)
        if ours and ours not in out:
            out[ours] = str(row.get("title", "")).strip()
    return out


def sync_master(db, dry_run: bool) -> None:
    """config 의 사전을 us_stocks 표로 밀어 넣는다.

    프론트가 파이썬 사전을 못 읽어서 필요하다. 파이썬·TS 로 같은 목록을 두 벌 두면
    반드시 어긋나므로 표를 하나 두고 양쪽이 그걸 본다.

    ## 영문명(name_en)은 **비어 있는 것만** 받아 오되, 저장은 늘 병합해서 한다

    MDD 검색이 이 값을 쓴다 — "tesla" 를 쳐도 테슬라가 나와야 한다(원래 이름이 영어인데
    한글 표기만 들고 있었다). 회사 이름은 거의 안 바뀌므로 매일 SEC 를 부를 이유가 없다.
    빈 칸이 하나라도 있을 때만 한 번 받는다 — 사전에 종목을 더하면 그날 저절로 메워지고,
    평소에는 왕복이 0 이다.

    ⚠️⚠️ **upsert 는 안 실은 열을 null 로 덮는다.** 처음엔 "준 열만 갱신한다"고 여기고
    새로 받은 것만 실었는데, 그러면 나머지 177종목의 이름이 그 자리에서 지워진다
    (실측: 채운 다음 실행에서 다시 177개를 채우고 있었다). 이 저장소가 details 열에서
    이미 배운 것과 같다 — **통째로 대입하지 말고 병합할 것.**
    그래서 저장 직전에 기존 값을 읽어 합친다. SEC 가 죽은 날에도 이름이 안 사라진다.
    """
    names = primary_names()
    rows = [{"ticker": tk, "name_ko": name} for tk, name in names.items()]

    stored_en: dict[str, str] = {}
    try:
        for r in db.table("us_stocks").select("ticker,name_en").execute().data or []:
            if r.get("name_en"):
                stored_en[r["ticker"]] = r["name_en"]
    except Exception as exc:
        print(f"[경고] us_stocks 를 못 읽었습니다({exc}). 영문명은 이번에 건드리지 않습니다.")
        stored_en = {}

    need = {tk for tk in names if tk not in stored_en}
    fetched = fetch_sec_names(need) if need else {}
    if need:
        missing = need - set(fetched)
        print(f"[SEC] 영문명 {len(fetched)}/{len(need)}종목 받음"
              f"{'' if not missing else ' · 못 찾은 것: ' + ', '.join(sorted(missing))}")

    # 받은 것 + 이미 있던 것. 둘 다 없으면 null 을 그대로 실어 열을 비워 둔다.
    for r in rows:
        r["name_en"] = fetched.get(r["ticker"]) or stored_en.get(r["ticker"])

    if dry_run:
        print(f"[dry-run] us_stocks {len(rows)}종목 (upsert 안 함)")
        return
    for i in range(0, len(rows), 500):
        db.table("us_stocks").upsert(rows[i : i + 500], on_conflict="ticker").execute()
    print(f"[Supabase] us_stocks {len(rows)}종목 upsert 완료")


def load_messages(db) -> list[dict]:
    """본문이 있는 메시지 전량. 정렬 키는 유일해야 한다(id).

    국내 쪽과 같은 이유다 — 정렬이 없거나 유일하지 않으면 페이지 경계에서 행이
    조용히 빠지고, 빠진 메시지는 추출 자체가 안 된다.

    ## OFFSET 이 아니라 **키셋**으로 넘긴다 (2026-08-11)

    **이 함수가 실제로 죽었다.** 첫 정기 실행(run 31447589332)에서
    `canceling statement due to statement timeout (57014)` 로 터졌고, 그 바람에
    미장 데이터가 하루 통째로 비었다(08-11 미국 언급 0건).

    `.range(start, start+999)` 는 뒤 페이지로 갈수록 앞의 행을 전부 걸러 낸 뒤
    건너뛴다. `text IS NOT NULL` 필터 때문에 인덱스만으로 건너뛸 수도 없다.
    표가 139,849행이 되자 뒤 페이지가 8초를 넘겼다.

    ⭐ 같은 실행에서 **필터 없는** `load_all` 은 같은 139,849행을 무사히 읽었다
    (calculate_us_stock_daily 는 살았다). 필터의 유무가 갈랐다.

    키셋은 `id > 마지막id` 라 매 페이지가 인덱스 탐색 한 번이다(O(log n)).
    """
    msgs: list[dict] = []
    last_id = ""
    while True:
        q = (
            db.table("telegram_messages")
            .select("id,channel_handle,message_id,text")
            .not_.is_("text", "null")
            .order("id")
            .limit(1000)
        )
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


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]

    problems = sanity_check()
    if problems:
        print("[오류] 사전이 자기 규칙을 어겼습니다:")
        for p in problems:
            print(f"  · {p}")
        sys.exit(1)

    db = get_client()
    match_to_ticker = build_dictionary()
    pattern, caseless = build_pattern(list(match_to_ticker))
    display = primary_names()
    print(f"사전: 표기 {len(match_to_ticker)}종 · 티커 {len(set(match_to_ticker.values()))}개 "
          f"· 뒤문맥 규칙 {len(NEG_RE)}개")

    sync_master(db, dry_run)

    messages = load_messages(db)
    rows: list[dict] = []
    mention: Counter = Counter()
    hit_msgs = 0
    samples: list[tuple[str, str]] = []

    for msg in messages:
        found = extract(msg["text"], pattern, match_to_ticker, caseless)
        if not found:
            continue
        hit_msgs += 1
        for ticker, match_text in found.items():
            mention[ticker] += 1
            rows.append({
                "channel_handle": msg["channel_handle"],
                "message_id": msg["message_id"],
                "ticker": ticker,
                "match_text": match_text,
                "method": "dict",
            })
        if len(samples) < 12:
            names = ", ".join(f"{display.get(t, t)}({mt})" for t, mt in found.items())
            samples.append((names, msg["text"].replace("\n", " ")[:60]))

    print(f"\n메시지 {len(messages):,}건 중 {hit_msgs:,}건에서 미국 종목 발견 "
          f"({hit_msgs/max(1,len(messages))*100:.1f}%) · 총 언급 {len(rows):,}건")
    print(f"등장한 티커 {len(mention)} / {len(set(match_to_ticker.values()))}개\n")
    print("=== 최다 언급 TOP 15 ===")
    for ticker, cnt in mention.most_common(15):
        print(f"  {cnt:>5}회  {display.get(ticker, ticker)} ({ticker})")
    print("\n=== 샘플 (매칭 눈으로 확인) ===")
    for names, snippet in samples:
        print(f"  [{names}]  | {snippet}")

    if dry_run:
        print("\n--dry-run: DB에 저장하지 않았습니다.")
        return

    # 예외 없이 0건으로 끝나는 고장을 막는다(사전이 깨지거나 조회가 빈 경우).
    # 아래 delete 가 먼저 도므로, 이 가드가 없으면 **표를 비우고 아무것도 안 넣는다.**
    # 문턱을 비율이 아니라 0 으로 둔 이유는 fetch_telegram 과 같다 — 12만 건에서
    # 미국 언급이 0이면 그건 시장 상황이 아니라 고장이다.
    if not rows:
        print("[오류] 미국 종목 언급이 0건입니다. 기존 데이터를 지우지 않고 멈춥니다.")
        sys.exit(1)

    # 재실행 = 전량 삭제 후 삽입. 사전을 고치면 과거분까지 소급 반영된다(국내와 같다).
    db.table("telegram_message_us_stocks").delete().neq(
        "id", "00000000-0000-0000-0000-000000000000"
    ).execute()
    # 한 요청이 크면 statement timeout 에 걸린다. 다른 쓰기와 같은 500행 단위.
    for i in range(0, len(rows), 500):
        db.table("telegram_message_us_stocks").insert(rows[i : i + 500]).execute()
    print(f"\n[Supabase] telegram_message_us_stocks {len(rows):,}건 저장 완료")


if __name__ == "__main__":
    main()

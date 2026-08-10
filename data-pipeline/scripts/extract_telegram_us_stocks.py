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

import re
import sys
from collections import Counter
from pathlib import Path

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


def sync_master(db, dry_run: bool) -> None:
    """config 의 사전을 us_stocks 표로 밀어 넣는다.

    프론트가 파이썬 사전을 못 읽어서 필요하다. 파이썬·TS 로 같은 목록을 두 벌 두면
    반드시 어긋나므로 표를 하나 두고 양쪽이 그걸 본다.
    """
    rows = [{"ticker": tk, "name_ko": name} for tk, name in primary_names().items()]
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
    """
    msgs, start = [], 0
    while True:
        page = (
            db.table("telegram_messages")
            .select("channel_handle,message_id,text")
            .not_.is_("text", "null")
            .order("id")
            .range(start, start + 999)
            .execute()
            .data
        )
        if not page:
            break
        msgs += page
        start += 1000
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

"""텔레그램 메시지 본문에서 종목을 추출해 telegram_message_stocks 에 저장한다.

하이브리드의 '결정적' 층: KRX 상장사명(stocks) + 별칭(config)로 사전을 만들고,
본문을 긴 이름 우선으로 매칭한다. URL은 매칭 전에 마스킹한다(쿼리스트링의
"&SK=" 같은 파라미터명이 종목으로 잡히던 걸 막는다).

영문 종목명은 KRX 정식명이 전부 대문자라("LS ELECTRIC") 본문의 "LS Electric"을
놓치므로, 한글이 없고 충분히 긴 이름만 대소문자를 무시한다(is_caseless 참고).

오탐 위험 종목(일반 단어/영문 약자)은 경계 규칙을 통과할 때만 인정한다:
  - 매칭 앞 글자: 한글/영숫자/한자가 아니어야 함(다른 단어의 꼬리 방지)
  - 붙어 있는 뒤 글자: 조사이거나 구두점/공백/문자열끝이어야 함
  - 띄어쓴 뒤 단어까지 봤을 때 '더 긴 고유명사의 앞부분'이면 SK 단독으로 안 센다:
      "SK 하이닉스"  → 붙이면 사전에 있는 더 긴 종목명 → 그 종목(SK하이닉스)으로 인정
      "SK hynix"    → 뒤가 로마자(영문 병기·해외 자회사명: SK On) → 거부
      "SK 그룹"      → 그룹 전체 지칭(config.GROUP_SUFFIXES) → 거부
우선주(…우) 등 파생 종목은 사전에서 제외해 잡음을 줄인다.

상장 증권사 이름은 종목보다 **리포트 발행처 표기**로 훨씬 자주 나와 따로 본다
(publisher_context 참고).

LLM 보강은 여기 붙일 자리만 두고(사전이 0개 잡은 메시지 대상), 실측 후 정한다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/extract_telegram_stocks.py --dry-run   # 측정만, DB 안 씀
    python scripts/extract_telegram_stocks.py             # 저장
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402
from common.supabase_client import load_all  # noqa: E402
from config.stock_extraction import (  # noqa: E402
    ALIASES,
    AMBIGUOUS_NAMES,
    EXCLUDE_NAMES,
    GROUP_SUFFIXES,
    JOSA,
)

# 우선주/파생 종목 제외 패턴(…우, …우B, …N우, …우(전환) 등).
PREFERRED_RE = re.compile(r"(우[A-Z]?|\d우|우\(전환\))$")
HANGUL_OR_ALNUM = re.compile(r"[가-힣0-9A-Za-z]")
HANGUL = re.compile(r"[가-힣]")
HAN = re.compile(r"[一-鿿]")  # SK海力士(=SK하이닉스) 같은 중국어 기사 제목용
LATIN = re.compile(r"[A-Za-z]")
LATIN_ACRONYM = re.compile(r"^[A-Za-z][A-Za-z0-9&]*$")  # SK, LG, E1 … (한글 종목명 제외)
URL_RE = re.compile(r"(?:https?://|www\.)\S+")
# 마스킹 채움 문자 — 한글/영숫자/한자 어디에도 안 걸려 경계 판정이 공백과 같아진다.
MASK_CHAR = "\x00"


def load_dictionary(db) -> tuple[dict[str, str], dict[str, str], set[str]]:
    """매칭문자열→코드, 매칭문자열→method, 오탐위험 매칭문자열 집합을 만든다."""
    stocks = load_all(db, "stocks", "code,name", order_by="code")
    name_to_code = {}
    for s in stocks:
        name = s["name"].strip()
        if name in EXCLUDE_NAMES or PREFERRED_RE.search(name):
            continue
        name_to_code[name] = s["code"]

    match_to_code: dict[str, str] = {}
    method: dict[str, str] = {}
    for name, code in name_to_code.items():
        match_to_code[name] = code
        method[name] = "dict"
    for alias, official in ALIASES.items():
        code = name_to_code.get(official)
        if code and alias not in match_to_code:
            match_to_code[alias] = code
            method[alias] = "alias"

    ambiguous = {m for m in match_to_code if m in AMBIGUOUS_NAMES}
    return match_to_code, method, ambiguous


def is_caseless(key: str) -> bool:
    """대소문자를 무시해도 안전한 이름인가.

    KRX 정식명은 "LS ELECTRIC"처럼 전부 대문자인데 텔레그램에선 "LS Electric"으로
    쓰는 일이 흔해 그대로면 놓친다. 다만 패턴 전체를 IGNORECASE로 두면 SK/LG/LS
    같은 짧은 약자가 소문자 산문("sk", "ls")에 걸려 오탐이 폭발하므로, 한글이 없고
    충분히 긴(3글자 이상이거나 공백 포함) 이름에만 적용한다.
    """
    return not HANGUL.search(key) and (len(key) > 2 or " " in key)


def build_pattern(keys: list[str]) -> tuple[re.Pattern, dict[str, str]]:
    """통합 패턴과, 대소문자 무시로 잡힌 표기를 사전 키로 되돌릴 역인덱스를 만든다."""
    # 긴 것 우선(겹칠 때 더 구체적인 종목명이 이기도록).
    ordered = sorted(keys, key=len, reverse=True)
    parts: list[str] = []
    caseless: dict[str, str] = {}
    for k in ordered:
        escaped = re.escape(k)
        if is_caseless(k):
            # 통짜 IGNORECASE 대신 해당 항목만 지역 플래그로 감싸 길이 우선순위를 유지한다.
            parts.append(f"(?i:{escaped})")
            caseless.setdefault(k.lower(), k)
        else:
            parts.append(escaped)
    return re.compile("|".join(parts)), caseless


def boundary_ok(text: str, start: int, end: int, is_ambiguous: bool) -> bool:
    """매칭에 '붙어 있는' 앞뒤 글자만 보는 경계 검사."""
    # 앞 경계: 한글/영숫자/한자면 다른 단어의 일부 → 거부.
    if start > 0 and (HANGUL_OR_ALNUM.match(text[start - 1]) or HAN.match(text[start - 1])):
        return False
    if not is_ambiguous:
        return True
    # 오탐 위험군은 뒤 경계도 검사: 영숫자/한자 거부, 한글은 조사만 허용.
    if end < len(text):
        nxt = text[end]
        if re.match(r"[0-9A-Za-z]", nxt) or HAN.match(nxt):
            return False
        if re.match(r"[가-힣]", nxt) and nxt not in JOSA:
            return False
        # 스킴 없는 URL("a.co/x?db=1&SK=") 대비 — 쿼리스트링 파라미터명 꼴은 거부.
        if nxt in "=&" or (start > 0 and text[start - 1] in "&?"):
            return False
    return True


def compound_key(text: str, end: int, key: str, match_to_code: dict[str, str]) -> str | None:
    """오탐 위험군이 '한 칸 띄운 더 긴 고유명사'의 앞부분인지 본다.

    반환: key(그대로 인정) / 더 긴 종목명(그 종목으로 인정) / None(거부).
    줄바꿈은 건너뛰지 않는다 — 다음 줄 첫 단어는 한 고유명사가 아니라서.
    """
    m = re.match(r"[ \t]+(\S+)", text[end:])
    if not m:
        return key
    nxt_word = m.group(1)

    # "SK 그룹" — 개별 종목이 아니라 그룹 전체 지칭.
    if nxt_word.startswith(GROUP_SUFFIXES):
        return None
    # "SK hynix" / "SK On" — 영문 병기·해외 자회사명. 한글 종목명엔 적용 안 함.
    # (사전에 있는 영문 종목명은 대소문자 무시로 통째 매칭돼 여기까지 오지 않는다.)
    if LATIN_ACRONYM.match(key) and LATIN.match(nxt_word):
        return None
    # "SK 하이닉스" — 붙이면 더 긴 종목명이면 그 종목 언급으로 본다. 뒤 단어에
    # 조사·구두점이 붙어 있을 수 있으니 뒤에서부터 잘라가며 확인한다.
    joined = key + nxt_word
    for i in range(len(joined), len(key), -1):
        cand = joined[:i]
        if cand in match_to_code and boundary_ok(joined, 0, i, cand in AMBIGUOUS_NAMES):
            return cand
    return key


def is_publisher_name(key: str) -> bool:
    """리포트 발행처로 더 자주 등장하는 이름인가(= 상장 증권사).

    목록이 아니라 stocks 에서 나오는 조건이라 새 증권사가 상장하거나 사명이 바뀌어도
    따라온다. '…제11호스팩'처럼 증권사가 세운 SPAC 은 '스팩'으로 끝나 여기 안 걸린다.
    """
    return key.endswith("증권")


def publisher_context(text: str, start: int, end: int) -> bool:
    """이 자리의 증권사 이름이 '종목'이 아니라 리포트 **발행처** 표기인가.

    이 코퍼스는 증권사 리서치 배포가 큰 몫이라, 증권사 이름은 종목보다 리포트를 낸
    곳을 밝히는 자리에 훨씬 자주 나온다. 실측 표본 100건에서 82건이 발행처였다.
    아래 다섯 꼴이 그 자리이고, 이걸 걸러 낸 뒤 남는 것이 진짜 종목 언급이다
    (공시 "(유가)삼성증권 - 투자설명서", 실적 "[잠정실적]현대차증권, 2Q 매출 …",
    나열 "현대차, NH투자증권, KB금융 개별 실적 이벤트").

    ⚠️ **증권사를 통째로 EXCLUDE_NAMES 에 넣는 건 답이 아니다.** 같은 표본에서 진짜
    종목 언급이 18%였고 그중 13건이 DART 공시였다. 증권사도 실적을 내고 공시를 하는
    상장사라, 이름을 죽이면 그 회사에 대한 진짜 뉴스가 통째로 사라진다.
    """
    prev = text[start - 1] if start > 0 else ""
    nxt = text[end] if end < len(text) else ""
    after = text[end:]
    line_before = text[:start].rsplit("\n", 1)[-1]

    # ① "[SK증권 반도체 한동희, 손 건]" — 대괄호 머리에 적는 발신 데스크.
    if prev and prev in "[［":
        return True
    # ② "작성자: 박제민 (SK증권)" — 괄호에 이름만 들어간 귀속.
    if prev and nxt and prev in "(（" and nxt in ")）":
        return True
    # ③ "[리포트 브리핑]한세실업, '…' 목표가 11,000원 - SK증권" — 줄 끝에 구분자를
    #    두고 붙는 귀속. 방향이 중요하다. 이름이 구분자 **뒤**면 발행처지만, 앞이면
    #    ("키움증권 - 높아진 배당 매력도") 그 종목이 리포트의 주인공이라 살려야 한다.
    if not after.split("\n", 1)[0].strip() and re.search(r"[-–—|/∥]\s*$", line_before):
        return True
    # ④ "미래에셋증권  [링크]" — 리포트 목록에서 발행처 칸(중간에 "(2026. 07. 24.)"
    #    같은 날짜가 끼기도 해서 같은 줄에 [링크]가 있는지로 본다).
    if re.match(r"[^\n]*\[링크\]", after):
        return True
    # ⑤ "삼성증권 리서치센터", "키움증권 신민수", "SK증권 Global Carbon Market Daily"
    #    — 뒤에 부서·애널리스트·리포트 제목이 이어진다. AMBIGUOUS_NAMES 의 뒤 경계
    #    규칙("조사 아닌 한글이 붙으면 거부")과 같은 잣대인데, 발행처 표기는 한 칸
    #    띄우고 오므로 띄어쓴 뒤 낱말까지 본다. 진짜 언급은 뒤가 조사이거나 구두점
    #    (쉼표 나열·괄호 종목코드·공시의 " - ")이라 이 규칙에 걸리지 않는다.
    nxt_word = re.match(r"[ \t]+(\S)", after)
    return bool(nxt_word and HANGUL_OR_ALNUM.match(nxt_word.group(1)))


def extract(text: str, pattern, match_to_code, method, ambiguous, caseless) -> dict[str, tuple[str, str]]:
    """text에서 {code: (match_text, method)} (메시지 내 중복 제거)."""
    # URL 안의 문자열은 본문 언급이 아니다. 길이를 유지해 경계 판정을 흐트러뜨리지 않는다.
    text = URL_RE.sub(lambda m: MASK_CHAR * len(m.group(0)), text)

    found: dict[str, tuple[str, str]] = {}
    for m in pattern.finditer(text):
        matched = m.group(0)
        # 대소문자를 무시해 잡힌 표기("LS Electric")는 사전 키("LS ELECTRIC")로 되돌린다.
        key = matched if matched in match_to_code else caseless.get(matched.lower())
        if key is None:
            continue
        # 표기가 사전과 다른데 전부 소문자면 종목명이 아니라 산문이나 URL이다.
        # 위 마스킹이 스킴 있는 URL을 걷어내지만 "n.news.naver.com/…"처럼 스킴 없는
        # 도메인은 남고, 앞 글자가 '.'이라 경계 검사도 통과한다. 본문에 종목을 쓸 땐
        # 최소 한 글자는 대문자라는 점으로 한 겹 더 막는다. 현재 코퍼스에선 마스킹이
        # 먼저 걸러 실측 변화는 0건이고, 대소문자를 푼 데 대한 예방적 방어다.
        if matched != key and matched.islower():
            continue
        is_ambiguous = key in ambiguous
        if not boundary_ok(text, m.start(), m.end(), is_ambiguous):
            continue
        # 증권사 이름은 한 메시지에 여러 번 나오는 일이 흔하다(머리글의 발행처 표기 +
        # 본문의 진짜 언급). 자리마다 따로 보고, 발행처 자리면 이 자리만 건너뛴다.
        if is_publisher_name(key) and publisher_context(text, m.start(), m.end()):
            continue
        if is_ambiguous:
            key = compound_key(text, m.end(), key, match_to_code)
            if key is None:
                continue
            # "SK 하이닉스"처럼 더 긴 종목명으로 승격됐으면 그 이름을 기록한다.
            matched = key
        code = match_to_code[key]
        if code not in found:
            found[code] = (matched, method[key])
    return found


def load_messages(db) -> list[dict]:
    """본문이 있는 메시지 전량. 필터가 있어 load_all 을 못 쓰고 직접 페이징한다.

    정렬 키는 유일해야 한다(id). 정렬이 없으면 페이지 사이 행 순서가 보장되지 않아
    경계에서 행이 조용히 빠진다 — 빠진 메시지는 종목 추출 자체가 안 된다.
    자세한 이유는 common/supabase_client.py:load_all 주석.
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
    return msgs


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()

    match_to_code, method, ambiguous = load_dictionary(db)
    pattern, caseless = build_pattern(list(match_to_code))
    code_to_name = {s["code"]: s["name"] for s in load_all(db, "stocks", "code,name", order_by="code")}
    print(f"사전: {len(match_to_code)}개 매칭문자열(별칭 {sum(1 for v in method.values() if v=='alias')}, 오탐위험 {len(ambiguous)})")

    messages = load_messages(db)
    rows = []
    mention_counter: Counter = Counter()
    method_counter: Counter = Counter()
    msgs_with_hit = 0
    samples = []

    for msg in messages:
        found = extract(msg["text"], pattern, match_to_code, method, ambiguous, caseless)
        if found:
            msgs_with_hit += 1
        for code, (match_text, meth) in found.items():
            mention_counter[code] += 1
            method_counter[meth] += 1
            rows.append(
                {
                    "channel_handle": msg["channel_handle"],
                    "message_id": msg["message_id"],
                    "stock_code": code,
                    "match_text": match_text,
                    "method": meth,
                }
            )
        if found and len(samples) < 12:
            names = ", ".join(f"{code_to_name.get(c,c)}({t[0]})" for c, t in found.items())
            samples.append((names, msg["text"].replace("\n", " ")[:60]))

    print(f"메시지 {len(messages)}건 중 {msgs_with_hit}건에서 종목 발견 · 총 언급 {len(rows)}건")
    print(f"경로: {dict(method_counter)}\n")
    print("=== 최다 언급 종목 TOP 15 ===")
    for code, cnt in mention_counter.most_common(15):
        print(f"  {cnt:>4}회  {code_to_name.get(code, code)} ({code})")
    print("\n=== 샘플 (매칭 눈으로 확인) ===")
    for names, snippet in samples:
        print(f"  [{names}]  | {snippet}")

    if dry_run:
        print("\n--dry-run: DB에 저장하지 않았습니다.")
        return

    # 재실행 시 최신 상태로 맞추기 위해 전량 삭제 후 삽입(추출 규칙이 바뀌면 과거분도 갱신).
    db.table("telegram_message_stocks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    for i in range(0, len(rows), 500):
        db.table("telegram_message_stocks").insert(rows[i : i + 500]).execute()
    print(f"\n[Supabase] telegram_message_stocks {len(rows)}건 저장 완료")


if __name__ == "__main__":
    main()

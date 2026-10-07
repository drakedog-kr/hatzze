"""급부상 카드에 오른 종목이 '유령'일 위험을 매일 재고, 걸리면 실패로 끝낸다.

**왜 필요한가.** 종목 추출의 오탐(결 ①~⑦, config/stock_extraction.py 문두)은 지금까지
전부 **사람이 화면을 보다가** 찾았다. 디바이스(2026-08-02) · 미래산업(07-30) ·
카스(07-30) · 아스트와 유니온(09-07)이 그렇다. 규칙을 하나 고치면 그 결은 막히지만
새 결은 다음 사람이 볼 때까지 화면에 남는다. 실제로 09-07 에 유령 셋을 걷어 내자
카드 6위에 **또 다른 유령**(남성)이 올라왔다 — 순위가 당겨지기 때문이다.

이 스크립트는 규칙이 아니라 **결과**를 본다. "그물이 제자리에 있나"가 아니라
"지금 화면에 오른 여섯이 수상한가"를 묻는다.

## 무엇을 재는가

화면에 실제로 뜨는 여섯만 본다(common.surging.top_surging, 화면과 같은 함수·같은 창).
표 전체를 훑지 않는다 — 화면에 안 나오는 유령은 급하지 않고, 지금까지 사고는 전부
카드에서 났다. 종목마다 창 안 언급을 다 받아 네 가지를 잰다.

  ① 복붙 지배   같은 본문이 여러 채널에 퍼진 비율. 아스트 4/4 · 유니온 5/5 였다.
  ② 표본 부족   언급 수. 남성이 2건이었다.
  ③ 오탐위험 이름  AMBIGUOUS_NAMES · HEAD_NOUN_NAMES · HOMONYM_CUES 중 하나에 있나.
  ④ 종목코드 병기  창 안 언급 중 6자리 코드가 함께 적힌 글이 하나라도 있나(참고용).
  ⑤ 흔적 부족   언급이 적은 카드에서 인정된 자리 앞뒤에 주식 표기 흔적이 있는 언급의 몫.
                대교 1/5 였다(2026-10-07 에 더했다 — 아래 절).

## 왜 ③ 을 함께 걸어야 하나

**①만으로는 못 가른다.** 복붙이 곧 유령은 아니다 — 같은 코퍼스에서 `아스트-거래재개`
(09-01)가 채널 넷에 복붙됐는데 그건 **진짜 언급**이다. 공시·특징주 소식은 원래 여러
채널이 같은 문장을 나른다. ②도 마찬가지로 진짜 종목이 조용한 날일 수 있다.

그래서 **오탐위험 이름일 때만** ①②⑤를 경보로 친다. 그 목록에 있다는 건 "이 이름은
일반어와 겹쳐 이미 여러 번 새어 나갔다"는 뜻이라, 같은 신호라도 뜻이 달라진다.
④는 판정에 안 쓴다 — 진짜인데 코드를 안 적는 글이 흔해서다("삼전 오늘 어때요").

## 한계 — 이 검사가 못 보는 것

⚠️ **③ 에 없는 이름의 새 유령은 못 잡는다.** 오늘까지의 사고 넷은 모두 ③ 에 있었지만
   (아스트·유니온·남성·디바이스) 그게 보장은 아니다. 목록 밖 이름이 카드에 오르면
   이 검사는 조용하다. 그건 여전히 사람이 볼 몫이다 — 그 몫을 주에 한 번 하는 것이
   scripts/scan_phantom_week.py 다(한 주의 태그 전부를 문맥과 함께 펼쳐 읽는 쪽이 판정한다).
⚠️ **국장만 본다.** 미장 카드는 이미 '최근 언급 3회 미만'을 스스로 걸러(common/us_surging)
   ② 가 원리적으로 안 걸리고, 이름 목록의 구조도 다르다(NAME_EXCLUDE·SCAN_IGNORE).
   같은 잣대를 그대로 옮기면 뜻이 달라져 따로 재야 한다.

## 문턱 — 과거 30일로 되돌려 재서 정했다 (2026-09-07)

매일 뜨는 경보는 읽히지 않는다. 오탐을 문턱으로 흡수하고 진짜만 남기는 쪽으로 잡았다.

    2026-09-07  경보 2  유니온(복붙 100%) · 아스트(복붙 100%)   ← 실제 사고
    2026-09-06  경보 2  같음
    2026-08-09 ~ 09-05  **28일 전부 경보 0**

즉 30일에 이틀만 울리고, 그 이틀이 사람이 잡아낸 바로 그 사고다.

⚠️ 되돌려 재기는 **지금 표(telegram_message_stocks)** 로 과거 카드를 다시 그린 것이다.
   그 표는 매 실행 전량 재생성되므로 과거 날짜의 태그도 최신 규칙을 따른다. 규칙을
   고친 뒤 다시 돌리면 같은 날에 경보가 안 뜰 수 있다 — 그건 오탐이 아니라 고쳐진 것이다.
⚠️ 남성(표본 부족) 갈래는 이 30일 카드에 안 올라와 되돌려 재기로는 안 걸렸다.
   그 가지는 assess() 를 직접 불러 확인했다(언급 2건 · 위험이름 → '표본 2건').

## 접은 안 — 복붙 묶음들의 합 (2026-09-25)

① 은 가장 큰 복붙 묶음 **하나**의 비율이라, 서로 다른 복붙 여러 편이 한 종목을 띄우면 못 잡는다.
2026-09-25 저녁 카드 3위 GS 가 그랬다. 창 안 14건 중 11건이 골드만 요약 두 편의 복붙이었는데
(`… Buy 유지 (GS)` 6채널 · `… Capex 전망치 상향 추이 (GS)` 5채널) 가장 큰 묶음이 6/14=43% 라
조용했다. 그날 경보는 같은 글이 함께 띄운 디바이스(6/6)로 울렸고 GS 는 사람이 읽다가 찾았다.

그래서 ① 을 '크기 2 이상 묶음들의 합 / n' 으로 바꾸는 안을 되돌려 재 봤다. 창 끝 07-27~09-24 의
60일과 그날 저녁 카드다(--backtest 는 기준일 앞 창만 돌아 저녁 카드는 run_once(end=그날) 로 따로 쟀다).
위험이름 카드 중 새로 울리는 것은 전부 열어 가렸다.

    문턱   30일  60일  새로 걸린 진짜 종목
    0.80    0     0    없음 — GS 도 못 잡는다(11/14 = 78.6%)
    0.75    1     2    테스 09-07(76%) · 종근당 08-17(75%)
    0.70    2     4    + 테스 09-08(74%) · OCI 08-06(73%)
    0.60    2     9    + 종근당·OCI 이틀씩 · 에스엠 08-02(64%)

이 값으로는 진짜와 유령이 안 갈린다. 공시·리포트·수급 정리를 여러 채널이 나르는 건 진짜 종목도
같아서, 언급 60건이 넘는 인기 종목도 50~60% 가 흔하다. GS 와 표본이 비슷한 언급 8~20건 카드 54장
중에선 한올바이오파마·SKC(둘 다 진짜, 위험이름 아님)가 80% 로 GS 보다 높다. GS 만 잡는 문턱은
0.76~0.78 폭 3%p 뿐이고 그건 한 건에 맞춘 값이다 — 복붙 아닌 언급이 한 건만 더 있어도 11/15=73%
로 빠진다. 가장 큰 묶음 둘의 합도 재 봤지만 종근당 08-17(75%)이 그대로 걸린다.

⚠️ 어느 쪽이든 복붙 지표는 **서로 다른 글로 된 유령**을 원리상 못 본다. 2026-09-13~15 카드의 나노는
   창 안 5~7건 중 3~6건이 `나노 바나나`·`‘나노 장벽’`·`‘나노 숫자’`였는데 ① 도 합산도 40~43% 였다.
   그 몫도 주간 점검(scan_phantom_week.py)이다.
⚠️ 잰 표는 #573(골드만 `(GS)` 단서)이 태그에 반영되기 전 것이다. 지금 다시 돌리면 GS 줄이 빠진다.

## ⑤ 흔적 부족 — 서로 다른 글로 된 유령 (2026-10-07)

2026-10-06 저녁 카드 5위 대교가 유령이었는데(창 5건 중 3건이 키이우·신압록강 다리 기사, PR #668) 복붙 20% ·
언급 5건이라 ①② 둘 다 조용했다. 위 절이 '복붙 지표가 원리상 못 본다'고 적은 그 꼴이다.

그래서 복붙이 아니라 **언급 자리**를 본다. 인정된 자리(extract 의 positions) 앞뒤 45자에 주식 표기 흔적
(scan_phantom_week.STOCK_MARK_RE — 6자리 코드·%·원·공시·실적·수주 …)이 있는 언급의 몫이다. 지난 유령 카드를
**고치기 직전 커밋의 규칙으로** 다시 뽑아 쟀다(그때 위험이름이던 것만. 09-15 이전 트리는 자리 인자가 없어 이름의
첫 등장으로 근사했다).

    창 끝   종목      언급  복붙   흔적    ①②   ⑤
    09-06  아스트      4   1.00   4/4    울림   -
    09-06  유니온      5   1.00   5/5    울림   -
    09-06  남성        2   0.50   1/2    울림   -
    09-15  동서       11   0.18   4/11    -    울림
    09-15  레이       17   0.18   8/17    -     -   (언급 13건 이상)
    09-15  DB         9   0.11   3/9     -    울림
    09-12  나노       18   0.22   2/18    -     -   (언급 13건 이상)
    09-13  나노       12   0.25   1/12    -    울림
    09-14  나노        6   0.33   1/6     -    울림
    09-21  보령       10   0.80   0/10   울림  울림
    09-24  케이프      3   0.67   0/3     -    울림
    09-25  디바이스     7   1.00   7/7    울림   -
    09-25  GS        19   0.37  11/19    -     -
    10-06  대교        5   0.20   1/5     -    울림

①② 만으로는 14창 중 5창, ⑤ 를 더하면 11창이다. 진짜 쪽은 지금 태그로 08-11~10-06 저녁 카드를 되돌려 쟀다.
위험이름 카드 37장 중 언급 12건 이하가 7장(종근당 사흘 · 테스 · KT · 천보 이틀)이고 흔적이 전부 75~100% 다.
넣은 뒤 `--backtest 60`(기준일 08-09~10-07)도 경보 1일이다 — 10-07 천보 ①(아래 판정 기록으로 막힌다). ⑤ 는 0일.

**언급 수 상한(12)이 이 신호의 절반이다.** 흔적이 50% 밑인 진짜 카드가 9장 있는데 전부 언급 14건 이상인 인기
종목이다(LG 17%·29% · 태웅 29% · HD현대 30%·46% · 삼현 36% · 디아이 42% · 한국항공우주 44% · POSCO홀딩스 47%).
대화 글은 큰 종목을 흔적 없이 부른다. 그래서 레이(17)·나노 09-12(18)·GS(19)는 이 신호로도 못 잡는다.
⚠️ 문두(config/stock_extraction.py)가 폐기한 '흔적 게이트'와 다르다. 그건 사전 전체의 **언급을 거르는** 안이었고
   (진짜 26.8% 가 흔적 0), 이건 카드에 오른 위험이름 중 언급이 적은 것만 **사람을 부른다.**

## 사람이 진짜로 판정한 묶음은 다시 울리지 않는다 (2026-10-07)

천보가 2026-10-06 저녁(#665)과 10-07 아침(#669)에 같은 이유로 두 번 울렸다. 창 3건이 하나증권 2차전지 주간
한 편(`천보(+9.5%)`)의 3채널 복붙이라 진짜였고, #665 를 그렇게 판정해 닫은 뒤에도 아침 카드가 같은 창이라 또 열렸다.

그래서 의심 줄 끝에 `묶음 <해시>`(복붙 판정과 같은 정규화로 만든 본문 해시 8자리, 묶음마다 `+`)를 적고,
닫힌 경보 이슈 중 **'계획 없음(not planned)'** 으로 닫힌 것의 본문·댓글에서 종목별 묶음을 모은다(파이프라인이
PHANTOM_JUDGED_ISSUES 로 gh issue list 결과를 넘긴다). 지금 창의 묶음이 **전부** 그 안에 있으면 울리지 않고
'이미 판정' 줄로만 남긴다. 새 글이 하나라도 섞이면 다시 울린다. '완료'로 닫힌 이슈(유령을 고친 PR)는 안 본다.

## 접은 안 둘 (2026-10-07)

  · 주식 표기가 붙은 묶음은 ① 에서 빼기 — 천보(`천보(+9.5%)`)를 조용히 하려는 안. 진짜 사고 셋이 같이 빠진다.
    아스트(`아스트(067390)로노바`, kwtok 태거 자국) 4/4 · 유니온(`트랜스 유니온(-5.93%)`) 5/5 · 디바이스 7/7.
  · 한 줄 요약(LLM)에 '착각·무관·혼동' 같은 낱말이 나오면 울리기 — 09-04~10-07 한 줄 요약 280건 중 대교
    (`우크라이나 인프라 피격 뉴스와 착각한 관심`) 하나뿐이다. 위 유령 창의 나머지는 LLM 이 그럴듯하게 덮었다
    (보령 `글로벌 LNG 가격 강세 시 이익 확대 기대` · 나노 `AI 이미지 생성 기술 확산 속 나노공정 수요 기대감`).

실행:
    cd data-pipeline && python scripts/check_phantom_stocks.py
    python scripts/check_phantom_stocks.py --backtest 30   # 지난 30일 카드로 되돌려 재기
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import surging  # noqa: E402
from common.supabase_client import execute_with_retry, get_client, load_window_keyset  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402
from config.stock_extraction import (  # noqa: E402
    AMBIGUOUS_NAMES,
    HEAD_NOUN_NAMES,
    HOMONYM_CUES,
    is_house,
)
from extract_telegram_stocks import build_pattern, extract, load_dictionary  # noqa: E402
from scan_phantom_week import CTX_AFTER, CTX_BEFORE, STOCK_MARK_RE  # noqa: E402

# 화면 정원. app/kadera/page.tsx 의 getSurgingStocks(MAX_ROWS) 와 같아야 한다(v2 표 10줄).
CARD_N = 10
# 복붙 지배 문턱 — 창 안 언급의 이 비율 이상이 같은 본문이면 신호.
DUP_RATIO = 0.8
# 표본 부족 문턱 — 창 안 언급이 이 수 미만이면 신호.
THIN_MENTIONS = 3
# 흔적 부족 문턱(⑤) — 언급이 THIN_MENTIONS 이상 이 수 이하인 카드에서, 흔적 있는 언급이 이 몫 미만이면 신호.
# 상한을 올리면 인기 종목(LG·태웅·HD현대)이 울린다(문두 ⑤ 절의 표).
TRACE_MAX_MENTIONS = 12
TRACE_RATIO = 0.5
# 사람이 진짜로 판정한 경보 이슈(gh issue list JSON)의 경로. 없으면 판정 기록 없이 돈다.
JUDGED_ENV = "PHANTOM_JUDGED_ISSUES"
# 의심 줄의 종목코드와 묶음 해시. 줄 꼴은 main 의 출력(`- 천보(278280): … · 묶음 1a2b3c4d+…`).
JUDGED_LINE_RE = re.compile(r"\(([0-9A-Z]{6})\)[^\n]*?묶음 ([0-9a-f]{8}(?:\+[0-9a-f]{8})*)")
# 본문 해시 전 지우는 것. 채널마다 다른 꼬리말·링크가 붙어 같은 글이 달라 보인다.
URL_RE = re.compile(r"(?:https?://|www\.)\S+")
SPACE_RE = re.compile(r"\s+")
# 복붙 판정에 쓰는 앞부분 길이. 꼬리말이 붙어도 머리는 같다.
DUP_PREFIX = 300

RISKY_NAMES = set(AMBIGUOUS_NAMES) | set(HEAD_NOUN_NAMES) | set(HOMONYM_CUES)


def normalize(text: str) -> str:
    """복붙 판정용 정규화 — URL 과 공백 차이를 지운 앞부분."""
    return SPACE_RE.sub(" ", URL_RE.sub("", text or "")).strip()[:DUP_PREFIX]


def recent_dates(dates: list[str]) -> list[str]:
    """top_surging 이 '최근'으로 세는 날들. 그 함수와 같은 규칙이어야 한다."""
    n = min(surging.RECENT_MAX, max(1, len(dates) - 1))
    return dates[-n:]


def load_mentions(db, codes: list[str], since: str, until: str) -> dict[str, list[dict]]:
    """창 안에서 그 종목들이 붙은 메시지(본문 포함). {code: [{channel, text, match}]}

    창(posted_at)으로 자른 메시지에 태그를 **inner 임베드**로 붙여 받는다 — 태그가 그 종목들
    중 하나인 메시지만 오고, 임베드 안도 그 종목들로 좁혀진다. 창 3일에 90행 안팎이라 한 페이지다.

    ⚠️ 전엔 종목의 **전체 기간** 태그를 `in_(코드들)` 로 한 번에 받고 본문을 따로 붙였다.
       페이징이 없어 PostgREST 1,000행 캡에 걸렸다 — 2026-09-22 카드 6종목의 태그 1,626행 중
       1,000행만 와서 보령이 창 안 10건인데 5건으로, 동아쏘시오홀딩스·안트로젠은 0건으로 잡혔다
       (이슈 #541 본문의 "5건 · 복붙 80%"가 그 숫자다. 실제는 10건 · 80%). 잘린 쪽이 유령이면
       경보가 조용히 안 뜬다. 태그 표는 매일 자라므로 전체 기간 조회는 어느 날이든 다시 잘린다.
    """
    if not codes:
        return {}
    day_after = (datetime.fromisoformat(until) + timedelta(days=1)).date().isoformat()
    rows = load_window_keyset(
        db,
        "telegram_messages",
        "id,channel_handle,message_id,posted_at,text,telegram_message_stocks!inner(stock_code,match_text,method)",
        f"{since}T00:00:00+09:00",
        narrow=lambda q: q.in_("telegram_message_stocks.stock_code", codes).lt(
            "posted_at", f"{day_after}T00:00:00+09:00"
        ),
    )
    out: dict[str, list[dict]] = defaultdict(list)
    for msg in rows:
        day = datetime.fromisoformat(msg["posted_at"]).astimezone(KST).date().isoformat()
        if not (since <= day <= until):
            continue
        for t in msg.get("telegram_message_stocks") or []:
            # 증권사 화자 행(config.HOUSE_METHOD 주석)은 카드가 세지 않는다. 감시도 같은 것만 센다.
            if is_house(t):
                continue
            out[t["stock_code"]].append(
                {
                    "channel": msg["channel_handle"],
                    "match": t["match_text"],
                    "text": msg["text"] or "",
                    "date": day,
                }
            )
    return out


def cluster_of(text: str) -> str:
    """복붙 묶음의 이름 — 정규화한 본문의 해시 8자리. 의심 줄에 적혀 판정 기록의 열쇠가 된다."""
    return hashlib.sha1(normalize(text).encode()).hexdigest()[:8]


def load_tagger(db) -> tuple:
    """인정된 자리를 다시 찾을 추출기(사전은 stocks 전량 — 파이프라인 추출 스텝과 같다)."""
    match_to_code, method, ambiguous = load_dictionary(db)
    pattern, caseless = build_pattern(list(match_to_code))
    return pattern, match_to_code, method, ambiguous, caseless


def mark_traces(code: str, mentions: list[dict], tagger: tuple) -> None:
    """언급마다 인정된 자리 앞뒤에 주식 표기 흔적이 있나를 m["traced"] 에 적는다(⑤).

    자리는 본문에서 이름을 다시 찾지 않고 extract 의 positions 로 받는다 — 다시 찾으면 거부된 첫 등장
    (GS건설의 GS)을 보게 된다(scan_phantom_week 주석). 저장된 태그가 지금 규칙으로 안 나오면 첫 등장으로 본다.
    """
    pattern, match_to_code, method, ambiguous, caseless = tagger
    for m in mentions:
        text = m["text"] or ""
        spans: dict[str, tuple[int, int]] = {}
        extract(text, pattern, match_to_code, method, ambiguous, caseless, positions=spans)
        span = spans.get(code)
        if span is None:
            i = text.lower().find((m["match"] or "").lower())
            span = (max(i, 0), max(i, 0) + len(m["match"] or ""))
        m["traced"] = bool(STOCK_MARK_RE.search(text[max(0, span[0] - CTX_BEFORE) : span[1] + CTX_AFTER]))


def assess(code: str, name: str, mentions: list[dict]) -> dict:
    """한 종목의 신호들. ⑤ 는 mark_traces 를 거친 언급에서만 잰다."""
    n = len(mentions)
    clusters = Counter(cluster_of(m["text"]) for m in mentions)
    dup = clusters.most_common(1)[0][1] / n if n else 0.0
    matches = {m["match"] for m in mentions}
    risky = sorted(matches & RISKY_NAMES)
    has_code = any(code in m["text"] for m in mentions)
    traced = sum(1 for m in mentions if m.get("traced"))
    has_traces = bool(mentions) and all("traced" in m for m in mentions)
    reasons = []
    if risky and dup >= DUP_RATIO and n >= 2:
        reasons.append(f"복붙 지배 {dup:.0%}")
    if risky and n < THIN_MENTIONS:
        reasons.append(f"표본 {n}건")
    if risky and has_traces and THIN_MENTIONS <= n <= TRACE_MAX_MENTIONS and traced < n * TRACE_RATIO:
        reasons.append(f"흔적 {traced}/{n}")
    return {
        "code": code,
        "name": name,
        "mentions": n,
        "dup": dup,
        "risky": risky,
        "has_code": has_code,
        "traced": traced if has_traces else None,
        "clusters": sorted(clusters),
        "reasons": reasons,
    }


def load_judged(issues: list[dict]) -> dict[str, set[str]]:
    """'계획 없음'으로 닫힌 경보 이슈의 본문·댓글에서 종목별 묶음을 모은다 — 사람이 진짜로 판정한 글들."""
    judged: dict[str, set[str]] = defaultdict(set)
    for issue in issues:
        if (issue.get("stateReason") or "").upper() != "NOT_PLANNED":
            continue
        texts = [issue.get("body") or ""] + [c.get("body") or "" for c in issue.get("comments") or []]
        for text in texts:
            for code, hashes in JUDGED_LINE_RE.findall(text):
                judged[code].update(hashes.split("+"))
    return judged


def judged_from_env() -> dict[str, set[str]]:
    path = os.environ.get(JUDGED_ENV)
    if not path:
        return {}
    try:
        return load_judged(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError) as e:
        # 판정 기록을 못 읽으면 예전처럼 다 울린다 — 조용해지는 쪽으로 틀리면 유령을 놓친다.
        print(f"[유령감시] 판정 기록({path})을 못 읽어 전부 울립니다: {e}")
        return {}


def already_judged(r: dict, judged: dict[str, set[str]]) -> bool:
    """지금 창의 묶음이 전부 사람이 진짜로 판정한 묶음인가. 새 글이 하나라도 섞이면 아니다."""
    return bool(r["clusters"]) and set(r["clusters"]) <= judged.get(r["code"], set())


def run_once(db, base: str, quiet: bool = False, end: str | None = None, tagger: tuple | None = None) -> list[dict]:
    """`end` 를 주면 그날로 끝나는 창(그날 포함), 안 주면 기준일 앞 창이다. `tagger` 를 주면 ⑤ 도 잰다.

    매일 도는 검사(main)는 화면과 같은 끝날(surging.window_end_for)을 넘긴다 — 저녁 실행 뒤
    카드는 오늘까지 넣어 그린다. 되돌려 재기(--backtest)는 기준일 앞 창 그대로 둔다. 날마다
    한 칸씩 물러나며 재므로 오늘을 넣은 창도 다음 날 기준일의 창으로 한 번씩 지나간다.
    """
    if end:
        rows, dates = surging.load_stock_daily(db, end_date=end)
    else:
        rows, dates = surging.load_stock_daily(db, base_date=base)
    if not rows or not dates:
        if not quiet:
            print(f"[유령감시] {base}: 집계가 비어 있어 건너뜁니다.")
        return []
    top = surging.top_surging(db, limit=CARD_N, preloaded=(rows, dates), cap=CARD_N)
    rd = recent_dates(dates)
    codes = [t["code"] for t in top]
    names = {
        s["code"]: s["name"]
        for s in execute_with_retry(db.table("stocks").select("code,name").in_("code", codes)).data
    }
    mentions = load_mentions(db, codes, rd[0], rd[-1])
    if tagger:
        for c in codes:
            mark_traces(c, mentions.get(c, []), tagger)
    return [assess(c, names.get(c, c), mentions.get(c, [])) for c in codes]


def main() -> None:
    argv = sys.argv[1:]
    db = get_client()

    if "--backtest" in argv:
        days = int(argv[argv.index("--backtest") + 1])
        base0 = today_kst()
        tagger = load_tagger(db)
        fired = 0
        for i in range(days):
            base = (base0 - timedelta(days=i)).isoformat()
            res = run_once(db, base, quiet=True, tagger=tagger)
            hit = [r for r in res if r["reasons"]]
            mark = "  ← 경보" if hit else ""
            names = ", ".join(f"{r['name']}({'·'.join(r['reasons'])})" for r in hit)
            print(f"  {base}  카드 {len(res)}개 · 경보 {len(hit)}개{mark}  {names}")
            fired += bool(hit)
        print(f"\n[되돌려 재기] {days}일 중 {fired}일에 경보가 떴습니다.")
        return

    # 기준일은 벽시계 오늘이다 — 이 스텝은 센티먼트 집계(기준일을 세우는 스텝)보다 앞에 돈다.
    # 창 끝날은 이 실행이 끝난 뒤 화면이 그릴 날이다(아침 실행이면 어제, 저녁 실행이면 오늘).
    base = today_kst().isoformat()
    end = surging.window_end_for(db, base)
    res = run_once(db, base, end=end, tagger=load_tagger(db))
    if not res:
        return
    judged = judged_from_env()
    print(f"[유령감시] 기준일 {base} · 창 끝 {end} · 급부상 카드 {len(res)}개 · 판정 기록 {len(judged)}종목")
    print(f"{'언급':>4} {'복붙':>5} {'흔적':>5} {'코드':>4}  {'위험이름':<14} 종목")
    print("-" * 74)
    flagged = [r for r in res if r["reasons"]]
    # 사람이 진짜로 판정한 묶음뿐이면 울리지 않는다(문두 절).
    seen = [r for r in flagged if already_judged(r, judged)]
    for r in res:
        flag = ("  ← 이미 판정" if r in seen else "  ← 의심") if r["reasons"] else ""
        print(
            f"{r['mentions']:>4} {r['dup']:>5.0%} {r['traced']:>2}/{r['mentions']:<2} {'있음' if r['has_code'] else '없음':>4}  "
            f"{('·'.join(r['risky']) or '-'):<14} {r['name']}({r['code']}){flag}"
        )

    # 이 줄은 '  - ' 로 열지 않는다 — 알림 스텝이 그 줄만 의심으로 옮긴다.
    for r in seen:
        print(f"  = {r['name']}({r['code']}): {' · '.join(r['reasons'])} — 이미 진짜로 판정한 묶음뿐이라 울리지 않습니다")
    hit = [r for r in flagged if r not in seen]
    if not hit:
        print("\n[유령감시] 이상 없음.")
        return
    print(f"\n[유령감시] 의심 {len(hit)}개")
    for r in hit:
        print(
            f"  - {r['name']}({r['code']}): {' · '.join(r['reasons'])} · 매칭 {'·'.join(r['risky'])}"
            f" · 묶음 {'+'.join(r['clusters'])}"
        )
    print(
        "\n확인 순서: 그 종목의 창 안 언급을 열어 **자리마다** 규칙을 돌려 볼 것. "
        "눈에 띄는 표기가 진짜 범인을 가린다(2026-09-07 아스트라 4건이 아스트로처럼 1건을 가렸다). "
        "결을 가리는 표는 config/stock_extraction.py 문두에 있다."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()

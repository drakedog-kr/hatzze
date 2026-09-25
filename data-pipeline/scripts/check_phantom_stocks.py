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

## 왜 ③ 을 함께 걸어야 하나

**①만으로는 못 가른다.** 복붙이 곧 유령은 아니다 — 같은 코퍼스에서 `아스트-거래재개`
(09-01)가 채널 넷에 복붙됐는데 그건 **진짜 언급**이다. 공시·특징주 소식은 원래 여러
채널이 같은 문장을 나른다. ②도 마찬가지로 진짜 종목이 조용한 날일 수 있다.

그래서 **오탐위험 이름일 때만** ①②를 경보로 친다. 그 목록에 있다는 건 "이 이름은
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

실행:
    cd data-pipeline && python scripts/check_phantom_stocks.py
    python scripts/check_phantom_stocks.py --backtest 30   # 지난 30일 카드로 되돌려 재기
"""

from __future__ import annotations

import hashlib
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
)

# 화면 카드 정원. app/kadera/page.tsx 의 getSurgingStocks(6) 와 같아야 한다.
CARD_N = 6
# 복붙 지배 문턱 — 창 안 언급의 이 비율 이상이 같은 본문이면 신호.
DUP_RATIO = 0.8
# 표본 부족 문턱 — 창 안 언급이 이 수 미만이면 신호.
THIN_MENTIONS = 3
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
        "id,channel_handle,message_id,posted_at,text,telegram_message_stocks!inner(stock_code,match_text)",
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
            out[t["stock_code"]].append(
                {
                    "channel": msg["channel_handle"],
                    "match": t["match_text"],
                    "text": msg["text"] or "",
                    "date": day,
                }
            )
    return out


def assess(code: str, name: str, mentions: list[dict]) -> dict:
    """한 종목의 네 신호."""
    n = len(mentions)
    dup = 0.0
    if n:
        clusters = Counter(hashlib.sha1(normalize(m["text"]).encode()).hexdigest() for m in mentions)
        dup = clusters.most_common(1)[0][1] / n
    matches = {m["match"] for m in mentions}
    risky = sorted(matches & RISKY_NAMES)
    has_code = any(code in m["text"] for m in mentions)
    reasons = []
    if risky and dup >= DUP_RATIO and n >= 2:
        reasons.append(f"복붙 지배 {dup:.0%}")
    if risky and n < THIN_MENTIONS:
        reasons.append(f"표본 {n}건")
    return {
        "code": code,
        "name": name,
        "mentions": n,
        "dup": dup,
        "risky": risky,
        "has_code": has_code,
        "reasons": reasons,
    }


def run_once(db, base: str, quiet: bool = False, end: str | None = None) -> list[dict]:
    """`end` 를 주면 그날로 끝나는 창(그날 포함), 안 주면 기준일 앞 창이다.

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
    return [assess(c, names.get(c, c), mentions.get(c, [])) for c in codes]


def main() -> None:
    argv = sys.argv[1:]
    db = get_client()

    if "--backtest" in argv:
        days = int(argv[argv.index("--backtest") + 1])
        base0 = today_kst()
        fired = 0
        for i in range(days):
            base = (base0 - timedelta(days=i)).isoformat()
            res = run_once(db, base, quiet=True)
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
    res = run_once(db, base, end=end)
    if not res:
        return
    print(f"[유령감시] 기준일 {base} · 창 끝 {end} · 급부상 카드 {len(res)}개")
    print(f"{'언급':>4} {'복붙':>5} {'코드':>4}  {'위험이름':<14} 종목")
    print("-" * 68)
    for r in res:
        flag = "  ← 의심" if r["reasons"] else ""
        print(
            f"{r['mentions']:>4} {r['dup']:>5.0%} {'있음' if r['has_code'] else '없음':>4}  "
            f"{('·'.join(r['risky']) or '-'):<14} {r['name']}({r['code']}){flag}"
        )

    hit = [r for r in res if r["reasons"]]
    if not hit:
        print("\n[유령감시] 이상 없음.")
        return
    print(f"\n[유령감시] 의심 {len(hit)}개")
    for r in hit:
        print(f"  - {r['name']}({r['code']}): {' · '.join(r['reasons'])} · 매칭 {'·'.join(r['risky'])}")
    print(
        "\n확인 순서: 그 종목의 창 안 언급을 열어 **자리마다** 규칙을 돌려 볼 것. "
        "눈에 띄는 표기가 진짜 범인을 가린다(2026-09-07 아스트라 4건이 아스트로처럼 1건을 가렸다). "
        "결을 가리는 표는 config/stock_extraction.py 문두에 있다."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()

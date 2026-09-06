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
   이 검사는 조용하다. 그건 여전히 사람이 볼 몫이다.
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
from common.supabase_client import execute_with_retry, get_client  # noqa: E402
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
    """창 안에서 그 종목들이 붙은 메시지(본문 포함). {code: [{channel, text, match}]}"""
    if not codes:
        return {}
    tags = execute_with_retry(
        db.table("telegram_message_stocks")
        .select("channel_handle,message_id,stock_code,match_text")
        .in_("stock_code", codes)
    ).data
    ids = sorted({t["message_id"] for t in tags})
    texts: dict[tuple[str, int], dict] = {}
    for i in range(0, len(ids), 50):
        rows = execute_with_retry(
            db.table("telegram_messages")
            .select("channel_handle,message_id,posted_at,text")
            .in_("message_id", ids[i : i + 50])
        ).data
        for r in rows:
            texts[(r["channel_handle"], r["message_id"])] = r

    out: dict[str, list[dict]] = defaultdict(list)
    for t in tags:
        msg = texts.get((t["channel_handle"], t["message_id"]))
        if not msg:
            continue
        day = datetime.fromisoformat(msg["posted_at"]).astimezone(KST).date().isoformat()
        if not (since <= day <= until):
            continue
        out[t["stock_code"]].append(
            {
                "channel": t["channel_handle"],
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


def run_once(db, base: str, quiet: bool = False) -> list[dict]:
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

    base = today_kst().isoformat()
    res = run_once(db, base)
    if not res:
        return
    print(f"[유령감시] 기준일 {base} · 급부상 카드 {len(res)}개")
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

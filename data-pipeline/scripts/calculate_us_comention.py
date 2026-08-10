"""함께 언급된 (미국 종목, 국내 종목) 쌍을 계산해 telegram_us_comention 에 저장한다.

미장 카더라의 핵심 카드다. "엔비디아 얘기가 나오면 어느 국내 종목이 같이 불리나".
영어권 서비스가 못 만드는 화면이라 이 페이지의 존재 이유에 가장 가깝다.

## 빈도로 줄 세우면 안 된다

빈도 상위는 유명한 것끼리 붙어서 시시하다 — 마이크론×SK하이닉스, 엔비디아×삼성전자.
둘 다 원래 많이 나오니 같이도 많이 나온다. 그건 연결이 아니라 인기다.

**lift** = 함께 나온 횟수 / 우연히 함께 나올 횟수. 이걸로 보면 진짜 연결이 드러난다.
실측(30일 전량):

    일라이릴리 × 펩트론      74.8배    비만치료제
    화이자    × 디앤디파마텍  45.6배
    머크      × 알테오젠     37.9배    키트루다 SC
    월마트    × 에이피알     20.4배    입점
    아마존    × 아모레퍼시픽  13.2배    입점

## 두 가지 안전장치

**① 종목을 잔뜩 나열한 글은 뺀다(MAX_NAMES).** 시황 정리글은 종목 40개를 늘어놓는데,
거기서 두 종목이 같이 나온 건 연결이 아니다. 실측으로 메시지의 67.6%가 종목 1개
이하이고 92.4%가 5개 이하라, 나열 글은 소수인데 쌍은 제곱으로 만들어 낸다
(최대 112개짜리 메시지 하나가 쌍 수천 개를 만든다).

**② 최소 표본을 건다(MIN_PAIR).** 표본이 적으면 lift 가 폭주한다. 국내 급부상 카드가
`2회 언급 ▲162.8배`로 보였던 것과 같은 함정이다. ⭐ 화면에는 **lift 와 함께 pair_count 를
반드시 같이 보여줄 것** — 문턱만으로는 부족하고 사용자가 표본 크기를 봐야 한다.

**③ 횟수보다 분산을 본다(MIN_CHANNELS·MIN_DAYS).** 이게 ②보다 중요하다. 이 코퍼스는
같은 기사가 여러 채널에 복붙되므로 **5회가 전부 한 채널 한 날이면 연결이 아니라 복사본
하나다.** 별칭 후보를 고를 때 이미 겪었다 — 4자리 중 3이 같은 날 같은 기사여서 뺐다.
그래서 서로 다른 채널 수와 날짜 수를 같이 세어 저장하고 문턱을 건다.

## 창을 행에 적어 두는 이유

lift 는 창 전체의 주변 빈도가 있어야 나온다. 프론트가 읽기 시점에 창을 다시 잡으면
파이프라인과 끝점이 어긋나 숫자가 갈린다(같은 함정을 이미 겪었다). 그래서 창을
여기서 정하고 `as_of_date`·`window_days` 를 행에 박아 둔다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_us_comention.py --dry-run   # 계산·미리보기만
    python scripts/calculate_us_comention.py             # 저장
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all  # noqa: E402
from common.timeutil import KST  # noqa: E402

# 창 길이. 짧으면 표본이 얇아 lift 가 튀고, 길면 새로 생긴 연결이 늦게 뜬다.
WINDOW_DAYS = 14
# 한 메시지가 언급한 종목 수가 이보다 많으면 '나열'로 보고 뺀다(위 안전장치 ①).
MAX_NAMES = 8
# lift 를 계산할 최소 동시 언급 수(위 안전장치 ②).
MIN_PAIR = 5
# 서로 다른 채널·날짜 최소 수(위 안전장치 ③). 복붙 한 건이 연결로 둔갑하는 걸 막는다.
MIN_CHANNELS = 2
MIN_DAYS = 2


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()

    messages = {
        (m["channel_handle"], m["message_id"]): m["posted_at"]
        for m in load_all(db, "telegram_messages", "channel_handle,message_id,posted_at")
    }
    us_rows = load_all(db, "telegram_message_us_stocks", "channel_handle,message_id,ticker")
    kr_rows = load_all(db, "telegram_message_stocks", "channel_handle,message_id,stock_code")

    dates = [
        datetime.fromisoformat(p).astimezone(KST).date()
        for p in messages.values()
        if p
    ]
    if not dates:
        print("[오류] 메시지가 없습니다.")
        sys.exit(1)
    as_of = max(dates)
    since = as_of - timedelta(days=WINDOW_DAYS - 1)
    print(f"창: {since} ~ {as_of} ({WINDOW_DAYS}일)")

    def in_window(key) -> bool:
        p = messages.get(key)
        if not p:
            return False
        return since <= datetime.fromisoformat(p).astimezone(KST).date() <= as_of

    us_by_msg: dict[tuple, set[str]] = defaultdict(set)
    for r in us_rows:
        key = (r["channel_handle"], r["message_id"])
        if in_window(key):
            us_by_msg[key].add(r["ticker"])
    kr_by_msg: dict[tuple, set[str]] = defaultdict(set)
    for r in kr_rows:
        key = (r["channel_handle"], r["message_id"])
        if in_window(key):
            kr_by_msg[key].add(r["stock_code"])

    # 양쪽을 다 언급한 메시지만이 모집단이다. lift 의 주변 빈도도 여기서 센다 —
    # 모집단과 주변 빈도가 다른 표본에서 나오면 lift 가 뜻을 잃는다.
    both = [k for k in us_by_msg if k in kr_by_msg]
    listing = [k for k in both if len(us_by_msg[k]) + len(kr_by_msg[k]) > MAX_NAMES]
    kept = [k for k in both if k not in set(listing)]
    print(f"양쪽 언급 메시지 {len(both):,}건 중 나열 글 {len(listing):,}건 제외 → {len(kept):,}건")

    pair: Counter = Counter()
    pair_channels: dict[tuple[str, str], set[str]] = defaultdict(set)
    pair_days: dict[tuple[str, str], set[str]] = defaultdict(set)
    us_count: Counter = Counter()
    kr_count: Counter = Counter()
    for key in kept:
        handle = key[0]
        day = datetime.fromisoformat(messages[key]).astimezone(KST).date().isoformat()
        for t in us_by_msg[key]:
            us_count[t] += 1
        for c in kr_by_msg[key]:
            kr_count[c] += 1
        for t in us_by_msg[key]:
            for c in kr_by_msg[key]:
                pair[(t, c)] += 1
                pair_channels[(t, c)].add(handle)
                pair_days[(t, c)].add(day)

    us_names = {s["ticker"]: s["name_ko"] for s in load_all(db, "us_stocks", "ticker,name_ko", order_by="ticker")}
    kr_names = {s["code"]: s["name"] for s in load_all(db, "stocks", "code,name", order_by="code")}

    n = len(kept)
    rows = []
    thin = spread = selfpair = 0
    for (ticker, code), cnt in pair.items():
        # ⚠️ 국내 추출의 알려진 오탐을 이 카드가 상위로 끌어올린다.
        # 씨게이트($STX)가 국내 STX(011810)로, 골드만삭스(GS)가 국내 GS(078930)로
        # 태그되고 있어 "시게이트 × STX" 같은 **자기 자신 쌍**이 lift 상위에 뜬다
        # (실측 59.0배 16회 14채널). 우리 버그를 '1위 연결'로 전시하는 셈이다.
        # 근본 수정은 extract_telegram_stocks 쪽이라 별도 PR 이고, 그때까지 여기서 막는다.
        # ⭐ 근본 수정이 끝나면 이 가드를 지우기 전에 이 쌍들이 사라졌는지 먼저 확인할 것.
        if kr_names.get(code, "").upper() == ticker:
            selfpair += 1
            continue
        if cnt < MIN_PAIR:
            thin += 1
            continue
        chans, days = pair_channels[(ticker, code)], pair_days[(ticker, code)]
        if len(chans) < MIN_CHANNELS or len(days) < MIN_DAYS:
            spread += 1
            continue
        expected = us_count[ticker] * kr_count[code] / n
        rows.append({
            "as_of_date": as_of.isoformat(),
            "window_days": WINDOW_DAYS,
            "ticker": ticker,
            "stock_code": code,
            "pair_count": cnt,
            "channel_count": len(chans),
            "day_count": len(days),
            "us_count": us_count[ticker],
            "kr_count": kr_count[code],
            "sample_size": n,
            "lift": round(cnt / expected, 2) if expected else 0,
        })
    # 무엇을 몇 개 버렸는지 반드시 남긴다 — 조용히 자르면 "다 봤다"로 읽힌다.
    print(f"쌍 {len(pair):,}종 → 자기자신 쌍(국내 추출 오탐) {selfpair:,}종 · "
          f"{MIN_PAIR}회 미만 {thin:,}종 · "
          f"채널<{MIN_CHANNELS} 또는 날짜<{MIN_DAYS} {spread:,}종 제외 → 저장 대상 {len(rows):,}종")

    print("\n=== lift 상위 15 (진짜 연결) ===")
    for r in sorted(rows, key=lambda r: -r["lift"])[:15]:
        print(f"  {r['lift']:>7.1f}배  {r['pair_count']:>3}회 "
              f"{r['channel_count']:>2}채널 {r['day_count']:>2}일  "
              f"{us_names.get(r['ticker'], r['ticker'])} × {kr_names.get(r['stock_code'], r['stock_code'])}")
    print("\n=== 빈도 상위 8 (참고 — 이대로 보여주면 시시하다) ===")
    for r in sorted(rows, key=lambda r: -r["pair_count"])[:8]:
        print(f"  {r['pair_count']:>4}회  lift {r['lift']:>5.1f}  "
              f"{us_names.get(r['ticker'], r['ticker'])} × {kr_names.get(r['stock_code'], r['stock_code'])}")

    if dry_run:
        print("\n--dry-run: DB에 저장하지 않았습니다.")
        return

    # 같은 창은 통째로 갈아 끼운다(창이 하루 밀리면 새 as_of_date 행이 생긴다).
    db.table("telegram_us_comention").delete().eq("as_of_date", as_of.isoformat()).eq(
        "window_days", WINDOW_DAYS
    ).execute()
    for i in range(0, len(rows), 500):
        db.table("telegram_us_comention").insert(rows[i : i + 500]).execute()
    print(f"\n[Supabase] telegram_us_comention {len(rows):,}행 저장 완료 (as_of {as_of})")


if __name__ == "__main__":
    main()

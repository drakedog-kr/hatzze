"""'N개 채널' — 창 안에서 그 종목을 언급한 **서로 다른 채널 수**('관심의 폭').

**lib/telegram-data.ts 의 recentChannelCount 를 옮긴 것이다.** Python 과 TS 라 import 로
공유할 수 없어 손으로 맞춘 사본이고, 저쪽을 고치면 여기도 고쳐야 한다(common/surging.py
와 같은 사정).

왜 telegram_stock_daily.channel_count 를 쓰지 않나
--------------------------------------------------
그 열은 '그날 그 종목을 다룬 채널 수'다. 날이 달라지면 채널 명단도 달라지므로,
여러 날을 묶은 값은 합집합이지 일별 개수의 최대치도 합계도 아니다. 예전에는 화면
급부상 카드·저녁 방송·주간 방송 셋이 **하루 최대치**(max)를 '개 채널'로 적었는데,
그러면 창을 늘려도 값이 커지지 않아 **창이 길수록 채널이 적은** 겉보기에 불가능한
조합이 나온다. 2026-07-31 SK하이닉스 실측:

    3일 창  1,882회 언급 · max 174 · distinct 201
    7일 창  2,822회 언급 · max 174 · distinct 218

max 는 두 창에서 같은 174(7/29 하루치)인데 언급만 늘어, 사이트(3일)가 주간 방송(7일)
보다 큰 채널 수를 말했다. 합집합은 일별 개수만으로 복원할 수 없어 원자료를 봐야 한다.

비용
----
telegram_message_stocks 를 telegram_messages 에 !inner 로 조인해(복합 FK, migration_013)
창 안의 행만 받는다. 종목 하나가 1~3 페이지다(3일 창 실측: 급부상 5종목이 각 1페이지
0.06~0.17초, SK하이닉스 같은 대형주가 2페이지). 표시할 몇 건에만 부르므로 전체 비용도
그만큼이다.

⚠️ 페이징 필수. 인기 종목은 7일치가 1,000행을 훌쩍 넘고(SK하이닉스 2,822행),
PostgREST 는 넘친 만큼을 **에러 없이** 잘라서 채널 수가 조용히 적게 나온다.
정렬 키는 유일해야 한다(common/supabase_client.load_all 주석) — id 를 쓴다.
"""

from __future__ import annotations

PAGE = 1000


def channel_breadth(db, code: str, first_date: str, last_date: str) -> int:
    """`first_date`~`last_date`(양끝 포함, KST) 에 이 종목을 언급한 서로 다른 채널 수.

    경계를 위아래로 둘 다 건다. 하한만 걸면 아직 하루가 덜 찬 **오늘이 섞여**, 같은
    줄에 적힌 언급 수(오늘 제외)와 다른 기간을 말하게 된다.
    """
    end_exclusive = _next_day(last_date)
    handles: set[str] = set()
    start = 0
    while True:
        page = (
            db.table("telegram_message_stocks")
            # !inner() 의 빈 괄호 — 조인은 걸되 메시지 쪽 컬럼은 하나도 안 받는다.
            # posted_at 은 거르는 데만 쓰고 결과엔 필요 없다.
            .select("channel_handle,telegram_messages!inner()")
            .eq("stock_code", code)
            .gte("telegram_messages.posted_at", f"{first_date}T00:00:00+09:00")
            .lt("telegram_messages.posted_at", f"{end_exclusive}T00:00:00+09:00")
            .order("id")
            .range(start, start + PAGE - 1)
            .execute()
            .data
        )
        if not page:
            break
        handles.update(r["channel_handle"] for r in page)
        start += PAGE
        if len(page) < PAGE:
            break
    return len(handles)


def channel_breadth_map(db, codes: list[str], first_date: str, last_date: str) -> dict[str, int]:
    """여러 종목을 한 번에. 방송 스크립트는 GitHub Actions 안에서 도는 배치라
    프론트처럼 병렬로 겹칠 이유가 없어 그냥 차례로 센다(표시 종목이 3~5건이다)."""
    return {c: channel_breadth(db, c, first_date, last_date) for c in codes}


def _next_day(iso: str) -> str:
    from datetime import date, timedelta

    return (date.fromisoformat(iso) + timedelta(days=1)).isoformat()

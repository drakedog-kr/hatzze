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

⚠️⚠️ **OFFSET 이 아니라 키셋으로 넘긴다.** 조인과 날짜 필터가 걸린 질의에 OFFSET 을 쓰면
페이지마다 그 필터를 다시 적용하고 건너뛴 행까지 훑는다. 2026-08-13·08-14 실행에서
`000660`(언급이 가장 많은 종목) 한 건이 `57014`(statement timeout)로 죽어 "관심의 폭"이
59종목만 저장됐다 — 그 종목만 화면이 렌더마다 직접 세는 느린 경로로 떨어졌다.
[[project-pipeline-krx-ecos-staleness]] 의 그 조합이고, 처방도 같다.
"""

from __future__ import annotations

PAGE = 1000
# `.in_()` 에 넣을 종목 수 상한 — 넘으면 서버에서 안 좁히고 전부 받아 고른다.
IN_LIST_MAX = 200


def _window_message_keys(db, first_date: str, last_date: str) -> set[tuple[str, int]]:
    """창 안 메시지의 (채널, 메시지ID) 집합. 좁은 축 + 키셋이라 조인이 없다."""
    end_exclusive = _next_day(last_date)
    keys: set[tuple[str, int]] = set()
    last_id: str | None = None
    while True:
        q = (
            db.table("telegram_messages")
            .select("id,channel_handle,message_id")
            .gte("posted_at", f"{first_date}T00:00:00+09:00")
            .lt("posted_at", f"{end_exclusive}T00:00:00+09:00")
            .order("id")
            .limit(PAGE)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        page = q.execute().data or []
        if not page:
            break
        keys.update((r["channel_handle"], r["message_id"]) for r in page)
        last_id = page[-1]["id"]
        if len(page) < PAGE:
            break
    return keys


def _mentions_by_code(db, codes: set[str]) -> dict[str, list[tuple[str, int]]]:
    """{종목코드: [(채널, 메시지ID), …]}. 키셋으로 훑는다.

    ⚠️ 종목 수가 적으면 `.in_()` 으로 서버에서 좁힌다. 목록이 길어지면 URL 이 커져
    **요청 자체가 안 나가므로**(PR #336 에서 밟았다) 상한을 두고, 넘으면 전부 받아서
    메모리에서 고른다. 실호출은 60종목(관심의 폭)·3~5종목(급부상·방송)이라 늘 좁은 쪽이다.
    """
    narrow = len(codes) <= IN_LIST_MAX
    out: dict[str, list[tuple[str, int]]] = {}
    last_id: str | None = None
    while True:
        q = (
            db.table("telegram_message_stocks")
            .select("id,channel_handle,message_id,stock_code")
            .order("id")
            .limit(PAGE)
        )
        if narrow:
            q = q.in_("stock_code", sorted(codes))
        if last_id is not None:
            q = q.gt("id", last_id)
        page = q.execute().data or []
        if not page:
            break
        for r in page:
            if r["stock_code"] in codes:
                out.setdefault(r["stock_code"], []).append(
                    (r["channel_handle"], r["message_id"])
                )
        last_id = page[-1]["id"]
        if len(page) < PAGE:
            break
    return out


def channel_breadth_map(db, codes: list[str], first_date: str, last_date: str) -> dict[str, int]:
    """`first_date`~`last_date`(양끝 포함, KST) 에 각 종목을 언급한 서로 다른 채널 수.

    ⚠️⚠️ **조인을 버렸다(2026-08-15).** 예전엔 종목마다 telegram_message_stocks 를
    telegram_messages 에 `!inner()` 로 조인하고 날짜로 걸렀는데, **언급이 가장 많은
    종목(000660)에서 첫 페이지부터 `57014`(statement timeout)로 죽었다.** 페이징을
    OFFSET 에서 키셋으로 바꿔도 그대로였다 — 깊이가 아니라 조인 자체가 비쌌다.
    복합 FK(migration_013)에 인덱스가 붙어 있지 않아, 종목 하나를 거를 때마다 메시지
    표를 훑는 모양이 된다.

    지금은 조인 없이 **두 번만 읽고 메모리에서 맞춘다**:
      ① 창 안 메시지 키 집합(좁은 축·키셋)   ② 종목별 언급 목록(표 전체·키셋)
    종목 수와 무관하게 왕복이 일정해서, 60종목을 세도 60번 조인하던 옛 방식보다 싸다.
    실측(2026-08-15, 60종목·창 3일): 조인 방식은 000660 에서 죽고, 이 방식은 완주한다.

    ⚠️ 결과 규칙은 그대로다 — 창 안에서 **서로 다른 채널**을 센다(일별 channel_count 의
    합도 최대치도 아니다. 위 모듈 docstring 의 SK하이닉스 실측 참고).
    """
    wanted = set(codes)
    if not wanted:
        return {}
    in_window = _window_message_keys(db, first_date, last_date)
    mentions = _mentions_by_code(db, wanted)
    return {
        c: len({h for h, mid in mentions.get(c, []) if (h, mid) in in_window})
        for c in codes
    }


def channel_breadth(db, code: str, first_date: str, last_date: str) -> int:
    """한 종목만. 여러 종목이면 channel_breadth_map 을 쓸 것(읽기를 한 번만 한다)."""
    return channel_breadth_map(db, [code], first_date, last_date).get(code, 0)


def _next_day(iso: str) -> str:
    from datetime import date, timedelta

    return (date.fromisoformat(iso) + timedelta(days=1)).isoformat()

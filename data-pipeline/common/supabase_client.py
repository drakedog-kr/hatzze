from supabase import Client, create_client

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL

PAGE_SIZE = 1000  # PostgREST 기본 상한


def get_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def load_all(db, table: str, columns: str, order_by: str = "id") -> list[dict]:
    """표 전체를 페이지를 이어 받아 읽는다.

    이 함수가 막는 함정은 **두 개**다. 하나만 알고 있으면 나머지에 당한다.

    1) 1,000행 상한. PostgREST는 한 번에 최대 1,000행만 주는데 **에러 없이 조용히
       자른다**. 행이 그 이상 쌓일 수 있는 표를 그냥 select 하면 뒷부분이 소리 없이
       사라진다. 실제로 코스닥 승인으로 stocks 가 944 → 2,765행이 되자 종목 사전에서
       1,765개가 잘려나갔다(KOSPI만일 땐 944행이라 우연히 안 걸리던 잠복 버그였다).

    2) 정렬 없는 페이징. `.range()` 로 페이지를 이어 받으려면 페이지 사이에 행 순서가
       고정돼 있어야 한다. ORDER BY 가 없거나 **정렬 키가 유일하지 않으면** 동일값
       구간의 순서가 요청마다 달라져, 페이지 경계에서 행이 빠지거나 겹친다. 그래서
       `order_by` 는 반드시 유일 키여야 한다(대부분 `id`, stocks 는 `code`).
       posted_at·analyzed_at·date 처럼 값이 겹치는 컬럼은 정렬해도 안 한 것과 같다.

    (2)가 (1)보다 지독한 이유: 잘린 건 총 건수를 세면 보이지만, 이건 **총 건수가
    맞아 보인다**. 실측으로 4,054행 표를 4,029행으로 읽었고, 그렇게 빠진 25행이
    '미분류'로 보여 이미 분류한 메시지를 LLM 에 다시 보냈다(=이중 과금).

    **행 수가 1,000을 넘길 수 있는 조회는 반드시 이걸 쓸 것.**
    """
    rows: list[dict] = []
    start = 0
    while True:
        page = (
            db.table(table)
            .select(columns)
            .order(order_by)
            .range(start, start + PAGE_SIZE - 1)
            .execute()
            .data
        )
        if not page:
            break
        rows += page
        start += PAGE_SIZE
    return rows


def load_all_keyset(db, table: str, columns: str, key: str = "id") -> list[dict]:
    """표 전체를 **키셋 페이징**으로 읽는다. 큰 표는 load_all 대신 이걸 쓴다.

    load_all 과 결과는 같고 방식만 다르다. 저쪽은 `.range(start, start+999)` 로 넘기는데,
    OFFSET 은 건너뛴 행을 **매번 다시 훑는다** — 마지막 페이지가 표 전체를 스캔한다.
    그래서 표가 자라면 어느 순간 한 페이지가 `statement_timeout`(8초)을 넘긴다.

    실측(2026-08-11):
        telegram_message_us_stocks   38,319행    3.2초
        telegram_message_analysis   105,951행   10.9초
        telegram_messages           143,686행   24.8초   ← 간헐적으로 57014 로 죽었다

    키셋은 `key > 마지막값` 으로 좁혀 인덱스를 타므로 페이지마다 비용이 일정하다.

    ⚠️ **key 는 반드시 유일해야 한다**(load_all 의 order_by 와 같은 제약). 값이 겹치면
    경계에서 행이 빠지거나 겹친다 — posted_at·date 같은 컬럼은 정렬해도 안 한 것과 같다.

    ⚠️ 문자열 비교로 넘긴다. uuid·text 키는 그대로 되고, 정수 키도 PostgREST 가
    형변환해 준다. 다만 **정수 키를 문자열로 비교하면 순서가 사전순**이 되므로
    (10 < 9), 정수 키 표에는 쓰지 말 것 — 이 저장소의 큰 표는 전부 uuid 다.

    ⏸ load_all 자체를 이걸로 바꾸는 게 옳지만, 그 함수는 국장 파이프라인 스무 곳이
       쓰고 있어 이 PR 에서는 안 건드린다. 미장 스크립트만 먼저 옮긴다.
    """
    rows: list[dict] = []
    last: str | None = None
    while True:
        q = db.table(table).select(columns).order(key).limit(PAGE_SIZE)
        if last is not None:
            q = q.gt(key, last)
        page = q.execute().data or []
        if not page:
            break
        rows += page
        last = page[-1][key]
        if len(page) < PAGE_SIZE:
            break
    return rows

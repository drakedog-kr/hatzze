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

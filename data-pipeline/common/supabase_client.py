import time

import httpx  # supabase(postgrest)가 쓰는 HTTP 클라이언트. 전송 예외 타입만 빌려 온다.
from supabase import Client, create_client

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL

PAGE_SIZE = 1000  # PostgREST 기본 상한

# 연결이 끊겼을 때 같은 페이지를 다시 받는 횟수와 그 사이 대기(초).
TRANSPORT_RETRIES = 3
TRANSPORT_BACKOFF = (1, 3, 8)


def execute_with_retry(q):
    """조회를 실행하되 **전송이 끊긴 경우에만** 같은 요청을 다시 던진다.

    2026-08-27 아침 파이프라인(run #156)이 `calculate_telegram_sentiment.py` 에서
    `httpx.RemoteProtocolError: <ConnectionTerminated error_code:0>` 로 죽었다.
    Supabase 앞단이 keep-alive 연결을 **정상 종료(GOAWAY)** 하면서, 마침 그 위에 실려
    있던 페이지 요청 하나가 예외가 된 것이다. 표가 잘린 것도 질의가 틀린 것도 아니라
    **연결만 끊긴 것**이라, 같은 요청을 새 연결로 다시 던지면 그대로 이어진다.

    **왜 postgrest 의 재시도로는 안 되나.** 거기에도 재시도가 있지만
    (`send_with_retry`) **HTTP 503·520 응답만** 본다. 전송 계층 예외는 애초에 응답이
    없어 그 조건에 안 걸리고 그대로 올라온다.

    **왜 하필 페이징이 위험한가.** 10만 행대 표는 1,000행씩 끊어 받으므로 스크립트
    하나가 **한 연결에 요청을 수백 번** 쏟는다(실측 2026-08-27: 위 스크립트가 읽는 표
    셋에서 567회·52초). 한 번의 확률은 작아도 요청 수만큼 쌓이고, 표가 자랄수록 매일
    커진다. 같은 이유로 이건 **재현되지 않는다** — 같은 조회를 로컬에서 완주시켜도
    멀쩡하고 직전 8회 실행 로그에도 없었다. "다시 돌리니 되던데"로 닫을 종류가 아니다.

    ⚠️ **읽기 전용이다.** insert·upsert 에 그대로 쓰면 안 된다. 요청은 닿았는데 응답만
    못 받은 경우 다시 던지면 같은 행이 두 번 들어간다. 조회는 몇 번을 던져도 결과가
    같아서(키셋 페이지는 `key > last` 라 이전 페이지와 무관하다) 안전하다.
    """
    for attempt in range(TRANSPORT_RETRIES + 1):
        try:
            return q.execute()
        except httpx.TransportError as exc:
            if attempt == TRANSPORT_RETRIES:
                raise
            delay = TRANSPORT_BACKOFF[attempt]
            print(
                f"[재시도] 연결이 끊겨 {delay}초 뒤 같은 페이지를 다시 받습니다 "
                f"({attempt + 1}/{TRANSPORT_RETRIES}) — {type(exc).__name__}: {exc}",
                flush=True,
            )
            time.sleep(delay)


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
        page = execute_with_retry(
            db.table(table)
            .select(columns)
            .order(order_by)
            .range(start, start + PAGE_SIZE - 1)
        ).data
        if not page:
            break
        rows += page
        start += PAGE_SIZE
    return rows


def load_keyset(db, table: str, columns: str, key: str = "id", narrow=None) -> list[dict]:
    """**키셋 페이징**으로 읽는다. 큰 표는 load_all 대신 이걸 쓴다.

    load_all 과 결과는 같고 방식만 다르다. 저쪽은 `.range(start, start+999)` 로 넘기는데,
    OFFSET 은 건너뛴 행을 **매번 다시 훑는다** — 마지막 페이지가 표 전체를 스캔한다.
    그래서 표가 자라면 어느 순간 한 페이지가 `statement_timeout`(8초)을 넘긴다.

    실측(2026-08-11):
        telegram_message_us_stocks   38,319행    3.2초
        telegram_message_analysis   105,951행   10.9초
        telegram_messages           143,686행   24.8초   ← 간헐적으로 57014 로 죽었다

    키셋은 `key > 마지막값` 으로 좁혀 인덱스를 타므로 페이지마다 비용이 일정하다.

    `narrow` 는 페이지 질의에 조건을 더 거는 콜백이다(`lambda q: q.gte("posted_at", …)`).
    **창을 좁힌 조회일수록 이게 더 급하다.** 필터를 건 OFFSET 은 페이지마다 필터를 다시
    적용하고 건너뛴 행까지 훑어, 표 전체를 읽는 것보다 먼저 죽는다 — 2026-08-13 오전
    파이프라인이 그렇게 멈췄다. 같은 실행에서 **필터 없는** load_all 세 곳은 멀쩡했다.
    갈림선은 표 크기가 아니라 `필터 + OFFSET` 조합이다.

    ⭐ **재는 값은 총 소요가 아니라 '한 페이지 최악값'이다.** 천장은 statement 하나에
    걸리지, 전체 소요에 걸리지 않는다. 총 소요는 캐시 온도에 좌우돼 옛·새가 뒤집히기도
    한다(같은 조회를 번갈아 돌리니 59.8s/20.3s 였다가 28.5s/28.2s 였다).
    실측(2026-08-13, 창 14일 84페이지 × 2회, telegram_messages 156,180행):
        한 페이지 최악  OFFSET 6.91초  →  키셋 0.65초   ← 천장 8초
        한 페이지 p95   OFFSET 1.94초  →  키셋 0.36초
    같은 창에서 83,225행이 본문까지 동일함을 대조해 확인했다.

    ⚠️ **key 는 반드시 유일해야 한다**(load_all 의 order_by 와 같은 제약). 값이 겹치면
    경계에서 행이 빠지거나 겹친다 — posted_at·date 같은 컬럼은 정렬해도 안 한 것과 같다.

    ⚠️ **columns 에 key 를 반드시 넣을 것.** 다음 페이지의 시작점을 마지막 행에서 뽑기
    때문이다. load_all 호출부는 39곳 중 24곳이 키 컬럼을 안 뽑고 있어, 옮길 때 자주
    밟는다. 아래에서 첫 페이지를 보고 곧장 알려 준다(조용히 KeyError 로 죽지 않도록).

    ⚠️ 문자열 비교로 넘긴다. uuid·text 키는 그대로 되고, 정수 키도 PostgREST 가
    형변환해 준다. 다만 **정수 키를 문자열로 비교하면 순서가 사전순**이 되므로
    (10 < 9), 정수 키 표에는 쓰지 말 것 — 이 저장소의 큰 표는 전부 uuid 다.

    ⏸ load_all 자체를 이걸로 바꾸는 게 옳지만, 그 함수는 국장 파이프라인 스무 곳이
       쓰고 있어 아직 안 건드린다. **필요한 호출부만 명시적으로 옮긴다.**
    """
    rows: list[dict] = []
    last: str | None = None
    while True:
        q = db.table(table).select(columns).order(key).limit(PAGE_SIZE)
        if narrow is not None:
            q = narrow(q)
        if last is not None:
            q = q.gt(key, last)
        page = execute_with_retry(q).data or []
        if not page:
            break
        if key not in page[0]:
            raise ValueError(
                f"키셋 페이징은 select 에 키 컬럼이 있어야 한다: key={key!r} columns={columns!r}"
            )
        rows += page
        last = page[-1][key]
        if len(page) < PAGE_SIZE:
            break
    return rows


def load_all_keyset(db, table: str, columns: str, key: str = "id") -> list[dict]:
    """표 **전체**를 키셋으로 읽는다 — load_keyset 의 창 없는 판(주의사항도 그쪽에)."""
    return load_keyset(db, table, columns, key)

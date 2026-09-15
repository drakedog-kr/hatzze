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


def has_column(db, table: str, column: str) -> bool:
    """그 표에 그 열이 있나. **마이그레이션이 아직 안 돌았을 때 파이프라인이 죽지 않게** 쓴다.

    PostgREST 는 없는 열을 select 하면 요청 자체를 거절한다(42703). 열 하나가 더해지는
    변경은 코드가 먼저 배포되고 SQL 은 사람이 나중에 돌리는 순서가 잦아서, 그 사이 실행이
    "없는 열" 한 줄로 통째로 멎는다. 한 행만 골라 물어보고 안 되면 없는 것으로 친다 —
    호출부는 그 열 없이 예전처럼 돈다.
    """
    try:
        db.table(table).select(column).limit(1).execute()
        return True
    except Exception:  # noqa: BLE001
        return False


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


def load_window_keyset(
    db, table: str, columns: str, since: str, ts: str = "posted_at", key: str = "id", narrow=None
) -> list[dict]:
    """시각 열로 창을 자른 조회를 **(시각, 유일키) 복합 키셋**으로 읽는다.

    load_keyset 과 결과는 같고 **정렬 축만 다르다.** 저쪽은 `order id` 인데, 창을 `posted_at >= X`
    로 자른 조회를 id 순으로 1,000건씩 끊으면 플래너 앞에 계획이 둘 놓인다 —
    posted_at 인덱스로 창 안 행만 모아 id 로 정렬하는 것과, **기본키 인덱스를 id 순으로
    걸으며 창에 드는 행을 1,000건 만날 때까지 거르는 것.** 뒤쪽은 창 밖 행까지 훑는다.
    uuid 는 시각과 무관하게 흩어져 있어 창이 표의 4% 면 한 페이지에 표의 1/13 을 힙에서
    무작위로 읽고, 표가 커질수록(2026-08 15만 → 09-15 31만 행) 그 비용이 자란다.

    어느 쪽을 고를지는 통계·연결 상태에 따라 뒤집힌다. 플랜 자체는 못 본다(PostgREST 의
    plan 미디어 타입이 꺼져 있다) — 아래 실측이 근거다(2026-09-15 20:46 KST, 같은 연결에서
    잇달아, 창 4일 12,842행):
        order id  + text is not null   페이지당 7.04~7.73초   ← 천장 8초 바로 아래
        order id  (text 조건 없음)     페이지당 0.25~1.30초
        5분 뒤 같은 두 조회             둘 다 0.1초대
    그날 저녁 파이프라인(19:31 KST)은 이 조회의 한 페이지가 8초를 넘겨 57014 로 죽었다 —
    같은 모양의 조회(generate_move_reasons)가 4분 전엔 살아남은 채로. 2026-08-13·08-14
    에도 같은 자리에서 죽었고 그때마다 다른 처방(키셋·본문 제외)을 했지만, 정렬 축이
    id 인 한 저 계획은 후보에 남아 있었다.

    정렬을 `(posted_at, id)` 로 잡으면 기본키 인덱스는 이 정렬을 못 주므로 **저 계획이
    후보에서 빠진다.** 남는 건 posted_at 인덱스를 창의 시작점부터 걷는 것뿐이라 페이지
    비용이 창 크기에만 묶인다. 실측(같은 날, 같은 창): 페이지 최악 0.18초 · 중앙 0.08초,
    행 집합은 load_keyset 과 동일(12,842행 · 중복 0).

    posted_at 은 유일하지 않아(같은 초에 여러 채널이 올린다) id 를 둘째 키로 쓴다.
    다음 페이지는 `ts >= 마지막ts AND (ts > 마지막ts OR key > 마지막key)` — 첫 조건이
    인덱스 시작점이고 괄호가 같은 초의 앞 행을 뺀다. 마지막값은 PostgREST 가 준 문자열을
    그대로 돌려보낸다(timestamptz 는 왕복이 무손실이다).

    ⚠️ **columns 에 ts 와 key 를 둘 다 넣을 것** — 다음 페이지의 시작점을 마지막 행에서 뽑는다.
    ⚠️ narrow 에 `.or_()` 를 쓰는 조회도 된다. PostgREST 는 `or=` 를 여러 개 받아 AND 로
       묶는다(아래 키셋 조건도 `or=` 하나를 쓴다).
    ⚠️ columns 에 임베드(`자식표(열,열)`)를 넣어도 된다 — 정렬·키셋 조건은 부모 표 열에만
       걸린다. generate_us_telegram_narratives.load_us_messages 가 언급 표를 이렇게 붙인다.
    ⚠️ 창이 아니라 표 전체를 읽는 자리엔 load_all_keyset 이 맞다 — 거기선 기본키 걷기가
       옳은 계획이라 이 문제가 없다.

    같은 축으로 먼저 옮긴 자리가 있다 — common/channel_breadth._window_message_keys
    (2026-09-09, `gte` 로 겹쳐 읽고 집합으로 중복을 흘리는 방식). 그쪽이 본 병은 창이 클 때
    (30일 16만 행) **첫 페이지가 창 전체를 정렬**해 2초를 쓰고 뒤로 갈수록 싸지는 것이었고,
    여기서 본 병은 창이 작아도(4일 1.3만 행) **페이지마다 7초로 일정**한 것이라 모양이
    다르다. id 정렬이 여는 느린 계획이 둘인 셈이고, 처방은 같다.
    """
    rows: list[dict] = []
    last_ts: str | None = None
    last_key: str | None = None
    while True:
        q = db.table(table).select(columns).order(ts).order(key).limit(PAGE_SIZE)
        if narrow is not None:
            q = narrow(q)
        if last_ts is None:
            q = q.gte(ts, since)
        else:
            q = q.gte(ts, last_ts).or_(f"{ts}.gt.{last_ts},{key}.gt.{last_key}")
        page = execute_with_retry(q).data or []
        if not page:
            break
        if ts not in page[0] or key not in page[0]:
            raise ValueError(
                f"복합 키셋은 select 에 두 키 컬럼이 있어야 한다: ts={ts!r} key={key!r} columns={columns!r}"
            )
        rows += page
        last_ts, last_key = page[-1][ts], page[-1][key]
        if len(page) < PAGE_SIZE:
            break
    return rows

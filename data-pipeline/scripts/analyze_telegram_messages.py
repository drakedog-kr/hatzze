"""텔레그램 메시지를 LLM(Claude Haiku)으로 분류해 telegram_message_analysis 에 저장한다.

메시지 1건당 (1) 톤 = positive/neutral/negative, (2) 종목명이 아닌 화제어 0~3개를 뽑는다.
이 표를 집계해 생태계 센티먼트·이슈 키워드 카드가 만들어진다(calculate_telegram_sentiment.py).

설계 판단:
- **메시지 단위로 저장한다.** 하루치 요약만 만들면 다음 날 비교 대상이 없다. 한 번 분류해
  두면 날짜·테마·종목 어느 축으로든 재집계되고, 화면에 뜨는 수치("긍정 62%")는 LLM이 아니라
  SQL이 센다. 종목추출·테마 로테이션과 같은 철학이다.
- **증분 처리.** fetch_telegram.py 는 7일 창을 매 실행 재수집하지만(조회수 갱신용),
  분석은 파이프라인에서 유일하게 돈이 드는 단계라 한 번 한 건은 절대 다시 호출하지 않는다.
- **화제어는 자유 추출.** 새로 뜨는 이슈를 놓치지 않는 게 '이슈 키워드' 카드의 존재
  이유라 사전에서 고르게 하지 않는다. 표기 흔들림(HBM/에이치비엠)은 집계 단계의
  별칭 사전(config/issue_keywords.py)이 흡수한다.
- **본문 앞 600자만.** 실측 p90이 989자, 최대 6,503자인데 뒤쪽은 대부분 면책·홍보 문구다.
  앞부분에 핵심이 있어 600자로 자른다(비용도 같이 줄어든다).

채널이 12개에서 317개로 늘며 하루 분류 대상이 290건 → 4,461건이 됐다($49/월). 품질을
깎지 않는 절감 수단 네 가지를 적용해 $18/월로 내렸다:

  ① Batch API      토큰 값 절반. 같은 모델·프롬프트·결과인데, 응답 시각을 저쪽이 정한다.
  ② 중복 본문      같은 글(포워드)은 한 번만 호출하고 라벨을 복사한다.
  ③ 공시 피드 제외  톤이 전부 neutral 이고 화제어가 공시 용어라 카드를 오염시킨다.
  ④ 20자 미만 제외  "시작" 같은 글에서 나올 톤·화제어가 없다. 건수는 13.6%인데
                    본문 토큰으론 0.8%뿐이라, 호출당 고정비만 먹고 있었다.

**제출과 수거가 다른 실행에서 일어난다.** 그래서 매 실행 (1)지난 배치 수거 → (2)새 배치
제출 순으로 돈다. 그사이 무엇이 처리 중인지 telegram_analysis_batches 에 남겨 같은
메시지를 두 번 제출하지 않는다(=두 번 돈을 내지 않는다). 파이프라인에서 이 스크립트를
앞뒤로 두 번 부르면(뒤는 --collect-only) 대부분 같은 실행에서 수거된다.

실패해도 파이프라인 본체엔 영향이 없어야 하므로, 키가 없으면 조용히 건너뛰고 배치 하나가
깨져도 나머지는 계속 처리한다(generate_daily_summary.py 와 같은 방침).

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/analyze_telegram_messages.py --dry-run       # 대상 건수·절감 내역만
    python scripts/analyze_telegram_messages.py --limit 30      # 소량 실제출(검증용)
    python scripts/analyze_telegram_messages.py                 # 수거 + 전량 제출
    python scripts/analyze_telegram_messages.py --collect-only  # 수거만(파이프라인 후반)
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from anthropic import Anthropic  # noqa: E402

from common.config import ANTHROPIC_API_KEY  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

# Haiku 4.5 — 분류는 대량 호출이라 속도/비용이 중요하고, 3지선다 + 명사 추출 난이도엔
# 충분하다. (히어로 요약도 같은 모델을 쓴다.)
# ※ 프롬프트 캐싱은 이 조합에선 불가능하다 — Haiku 4.5 의 캐시 최소 프리픽스가 4,096
#   토큰인데 아래 SYSTEM 은 804 토큰이다. 하한 미달이면 에러 없이 조용히 캐시가 안 걸린다.
MODEL = "claude-haiku-4-5"

# 한 요청에 넣을 메시지 수. 크게 잡을수록 요청당 고정비(시스템 프롬프트 804 + 스키마 291
# = 1,095 토큰)가 분산되지만, 너무 크면 모델이 뒤쪽 항목을 성의 없이 처리하고 한 요청
# 실패의 손실도 커진다. 40까지 올리면 13% 더 싸지는데, 뒤쪽 품질 검증 전이라 15로 둔다.
BATCH_SIZE = 15

# 본문에서 모델에 넘길 최대 글자수.
TEXT_CAP = 600

# 이보다 짧은 본문은 분류하지 않는다. "시작"·"wti"·"천조국 새벽" 류에서 뽑을 톤도
# 화제어도 없는데, 호출당 고정비는 긴 글과 똑같이 든다.
MIN_TEXT_LEN = 20

# 공시 원문만 흘리는 피드 채널 — 톤은 사실상 전부 neutral 이고, 화제어로는 공시 용어
# ("주요사항보고서"·"단일판매공급계약")가 나와 이슈 키워드 카드를 오염시킨다.
# 수집과 종목추출은 그대로 두고(종목 언급 집계엔 쓸모가 있다) 분류만 건너뛴다.
# dartAll 하나가 하루 381건으로 전체 유입의 7%다.
SENTIMENT_EXCLUDED_CHANNELS = {
    "dartAll",
    "infodart",
    "maindisclosurenews",
    "rassiro_gongsi",
}

# 분류 대상으로 훑는 창. 전 기간을 읽지 않는 이유는 하루 4천 건대로 쌓이면 본문까지
# 통째로 메모리에 올리는 게 곧 수십만 행이 되기 때문이다. fetch_telegram 이 다시
# 만지는 창은 7일뿐이라, 그보다 한참 오래된 미분류분은 앞으로도 채워지지 않는다.
# 14일 = 수집 창 7일 + 따라잡을 여유 1주. 화면의 센티먼트·화제어 카드가 7일 창이라
# 이보다 오래된 미분류분은 어차피 어느 카드에도 쓰이지 않는다. 다만 이 단계가 2주
# 넘게 멈추면 그 구간은 영구 미분류로 남는다 — 잔량 로그로 추세를 볼 것.
SCAN_DAYS = 14
# 분류 기록은 창보다 조금 넓게 읽는다. analyzed_at ≥ posted_at 이므로 이 창은 위 창
# 안의 모든 메시지의 분류 기록을 반드시 덮는다(놓치면 재분류 = 이중 과금).
ANALYSIS_LOOKBACK_DAYS = SCAN_DAYS + 2
PAGE = 1000

SYSTEM = """\
당신은 한국 주식 텔레그램 채널·채팅방의 메시지를 분류하는 분석기입니다.
각 메시지에 대해 (1) 톤, (2) 화제어를 뽑아 JSON으로만 답합니다.

[톤 분류 — 글쓴이가 시장/종목을 어떤 분위기로 말하는가]
- positive: 기대·호재·강세를 말하는 톤. 실적 개선, 수주, 목표가 상향, 낙관적 전망.
- negative: 우려·악재·약세를 말하는 톤. 실적 부진, 규제, 손실, 비관적 전망.
- neutral: 사실 전달 위주. 시황 브리핑, 공시 요약, 일정 안내, 숫자 나열, 광고·공지.
판단이 애매하면 neutral 입니다. 글쓴이의 태도를 보세요 — 주가가 내렸다는 사실을
담담히 전하면 neutral 이고, 그걸 두고 걱정하거나 위험을 경고하면 negative 입니다.

[화제어 0~3개]
- 지금 무엇이 화제인지 보여주는 말을 뽑습니다. 예: HBM, 관세, 금리인하, 수주, 공매도.
- **종목명·기업명·인명·채널명은 절대 넣지 마세요.** (종목은 따로 집계합니다.)
- "주가", "시장", "오늘", "상승"처럼 아무 정보가 없는 일반어도 넣지 마세요.
- 메시지에 실제로 등장한 표현을 씁니다. 없으면 빈 배열로 두세요 — 억지로 채우지 마세요.
- **짧은 명사로 쓰세요 — 되도록 2~6글자, 최대 10글자.** 조사·서술어를 떼고 압축합니다.
  (예: "금리를 인하" → "금리인하", "영업이익 컨센서스 상회" → "실적호조")
  문장이나 긴 구절을 넣으면 안 됩니다 — 같은 이슈가 제각각 표현돼 집계가 깨집니다.

[입력 형식] 각 메시지는 "### <번호>" 줄로 시작합니다.
[출력] 모든 번호에 대해 정확히 하나씩, 입력 순서대로 결과를 만드세요."""

# Structured outputs — 스키마로 형식을 강제해 파싱 실패를 없앤다(Haiku 4.5 지원).
# ※ 배열 길이 제약(maxItems)은 스키마에서 지원되지 않으므로 개수 제한은 프롬프트로 건다.
# ※ 스키마는 입력 291 토큰을 더하지만 빼면 손해다 — 없이 부르면 출력이 334 → 576 토큰으로
#   늘어난다(마크다운·산문이 붙는다). 출력이 5배 비싸므로 스키마가 순이득.
SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "sentiment": {
                        "type": "string",
                        "enum": ["positive", "neutral", "negative"],
                    },
                    "keywords": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["n", "sentiment", "keywords"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}

# 이 시간을 넘겨도 안 끝난 배치는 포기한다(결과 보관이 24시간이라 그 뒤엔 기다릴
# 이유가 없다). 포기하지 않으면 그 메시지들이 영구히 '처리 중'으로 묶인다.
STALE_HOURS = 26

URL_RE = re.compile(r"https?://\S+")
WS_RE = re.compile(r"\s+")


def _hours_since(iso: str) -> float:
    then = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - then).total_seconds() / 3600


def body_key(text: str) -> str:
    """중복 판정 키 — 같은 글이 여러 채널에 포워드된 것을 한 건으로 묶는다.

    링크와 공백만 지운다. 숫자는 **일부러 남긴다** — 지우면 중복률이 9.9%에서 12.3%로
    오르지만 "영업이익 1,200억"과 "영업이익 300억"이 한 건으로 합쳐질 수 있다. 공개
    대시보드에 나가는 라벨이라 2%대 절감과 바꿀 만한 위험이 아니다.
    """
    t = WS_RE.sub("", URL_RE.sub("U", text[:TEXT_CAP]))
    return hashlib.sha1(t.encode()).hexdigest()


def load_recent_messages(db) -> list[dict]:
    """최근 SCAN_DAYS 일 메시지를 페이지를 이어 받아 읽는다(1,000행 상한 회피).

    **정렬 키는 반드시 유일해야 한다(id).** posted_at·analyzed_at 처럼 값이 겹치는
    컬럼으로 정렬하면 동일값 구간의 순서가 요청마다 보장되지 않아, 페이지 경계에서
    행이 조용히 빠지거나 겹친다. 실측으로 4,054행 표를 4,029행으로 읽었고, 그렇게
    빠진 행은 '미분류'로 보여 이미 분류한 메시지를 다시 제출했다(=이중 과금).
    """
    since = (datetime.now(timezone.utc) - timedelta(days=SCAN_DAYS)).isoformat()
    rows: list[dict] = []
    start = 0
    while True:
        page = (
            db.table("telegram_messages")
            .select("id,channel_handle,message_id,posted_at,text")
            .gte("posted_at", since)
            .order("id")
            .range(start, start + PAGE - 1)
            .execute()
            .data
        )
        if not page:
            break
        rows += page
        start += PAGE
    return rows


def load_recent_analysis(db) -> dict[tuple[str, int], dict]:
    """{(핸들, 메시지ID): {톤, 화제어}} — 이미 분류한 것.

    재호출 방지와 중복 라벨 복사에 쓴다. 화제어까지 읽는 이유는 복사 때 같이 넣어야
    집계 의미가 지금과 같기 때문이다(아래 fan_out_duplicates 참조).
    """
    since = (
        datetime.now(timezone.utc) - timedelta(days=ANALYSIS_LOOKBACK_DAYS)
    ).isoformat()
    out: dict[tuple[str, int], dict] = {}
    start = 0
    while True:
        page = (
            db.table("telegram_message_analysis")
            .select("id,channel_handle,message_id,sentiment,keywords,analyzed_at")
            .gte("analyzed_at", since)
            .order("id")  # 유일 키로 정렬해야 페이지 경계에서 행이 빠지지 않는다
            .range(start, start + PAGE - 1)
            .execute()
            .data
        )
        if not page:
            break
        for r in page:
            out[(r["channel_handle"], r["message_id"])] = {
                "sentiment": r["sentiment"],
                "keywords": r.get("keywords") or [],
            }
        start += PAGE
    return out


def load_inflight(db) -> tuple[list[dict], set[tuple[str, int]]]:
    """미수거 배치들과, 그 배치들이 담고 있는 메시지 키 집합.

    이 집합을 후보에서 빼야 같은 메시지를 두 번 제출하지 않는다.
    """
    try:
        rows = (
            db.table("telegram_analysis_batches")
            .select("batch_id,submitted_at,request_count,message_count,payload")
            .is_("collected_at", "null")
            .order("submitted_at")
            .execute()
            .data
        )
    except Exception as exc:  # noqa: BLE001
        # 표가 없으면 여기서 멈춘다. 그냥 진행하면 in-flight 를 못 보고 같은 메시지를
        # 매 실행 다시 제출한다 — 조용히 돈이 새는 쪽이라 실패하는 게 낫다.
        raise SystemExit(
            "[오류] telegram_analysis_batches 표가 없습니다. "
            "supabase/migration_020_add_telegram_analysis_batches.sql 을 "
            f"Supabase SQL 에디터에서 실행하세요.\n       ({type(exc).__name__}: {exc})"
        ) from exc
    keys: set[tuple[str, int]] = set()
    for row in rows:
        for targets in (row["payload"] or {}).values():
            for handle, mid in targets:
                keys.add((handle, int(mid)))
    return rows, keys


def build_prompt(batch: list[dict]) -> str:
    """배치를 '### 번호' 로 구분한 하나의 사용자 메시지로 만든다."""
    parts = []
    for i, m in enumerate(batch, start=1):
        text = (m.get("text") or "").strip()
        if len(text) > TEXT_CAP:
            text = text[:TEXT_CAP] + " …(생략)"
        parts.append(f"### {i}\n{text}")
    return "\n\n".join(parts)


def analysis_row(handle: str, message_id: int, result: dict) -> dict:
    keywords = [k.strip() for k in result.get("keywords", []) if k and k.strip()]
    return {
        "channel_handle": handle,
        "message_id": message_id,
        "sentiment": result["sentiment"],
        "keywords": keywords[:3],  # 개수 제한은 프롬프트 + 여기서 이중으로
        "model": MODEL,
    }


def save_rows(db, rows: list[dict]) -> None:
    """(channel_handle, message_id) 중복을 걷어내고 upsert 한다.

    한 요청 안에 같은 키가 두 번 들어가면 Postgres 가 그 요청을 통째로 거절한다
    (21000 "ON CONFLICT DO UPDATE command cannot affect row a second time").
    수백 건짜리 묶음이 한 건의 중복 때문에 전부 날아가고, 그 배치는 수거 완료로
    표시되므로 **결과가 조용히 사라진다** — 2026-07-26~27 에 이걸로 네 번 연속
    실패해 분류가 이틀 멈췄고, 화면의 센티먼트·총평이 07-26 자료에 묶였다.

    중복이 나는 길은 두 갈래다. 배치 수거에선 모델이 같은 번호(n)를 두 번 매기면
    같은 메시지 행이 두 번 만들어지고, 복사 경로(fan_out_duplicates)에선 같은
    메시지가 두 대표에 붙으면 그렇게 된다. 어느 쪽이든 같은 메시지에 대한 라벨이라
    뒤에 온 것을 남긴다.
    """
    unique = list({(r["channel_handle"], r["message_id"]): r for r in rows}.values())
    if len(unique) != len(rows):
        print(f"[저장] 같은 메시지에 두 번 매겨진 분류 {len(rows) - len(unique)}건 정리")
    for i in range(0, len(unique), 500):
        db.table("telegram_message_analysis").upsert(
            unique[i : i + 500], on_conflict="channel_handle,message_id"
        ).execute()


def print_tone(rows: list[dict], label: str) -> None:
    tone = {"positive": 0, "neutral": 0, "negative": 0}
    for r in rows:
        tone[r["sentiment"]] += 1
    total = len(rows) or 1
    print(
        f"[Supabase] {label} {len(rows)}건 저장 · "
        f"긍정 {tone['positive']}({tone['positive'] * 100 // total}%) · "
        f"중립 {tone['neutral']}({tone['neutral'] * 100 // total}%) · "
        f"비관 {tone['negative']}({tone['negative'] * 100 // total}%)"
    )


# ─────────────────────────────────────────────────────────────────────────────
# 수거 — 지난 실행이 제출한 배치의 결과를 받아 저장한다.
# ─────────────────────────────────────────────────────────────────────────────


def collect_batches(client: Anthropic, db) -> int:
    inflight, _ = load_inflight(db)
    if not inflight:
        print("[수거] 처리 중인 배치가 없습니다.")
        return 0

    saved = 0
    for row in inflight:
        bid = row["batch_id"]
        try:
            status = client.messages.batches.retrieve(bid).processing_status
        except Exception as exc:  # noqa: BLE001
            print(f"[수거] {bid} 상태 조회 실패: {type(exc).__name__}: {exc}")
            continue
        if status != "ended":
            # 끝나지 않는 배치를 그대로 두면 그 메시지들이 영구히 '처리 중'으로 묶여
            # 다시는 분류되지 않는다. 결과 보관은 24시간이라 그 뒤로는 기다릴 이유도 없다.
            if _hours_since(row["submitted_at"]) > STALE_HOURS:
                db.table("telegram_analysis_batches").update(
                    {
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                        "note": f"{STALE_HOURS}시간 넘게 {status} — 포기(메시지는 재제출됨)",
                    }
                ).eq("batch_id", bid).execute()
                print(f"[수거] {bid} {STALE_HOURS}시간 넘게 {status} — 포기합니다(재제출 대상).")
                continue
            print(
                f"[수거] {bid} 아직 {status} (제출 {row['submitted_at']}) "
                "— 다음 실행에서 다시 봅니다."
            )
            continue

        payload = row["payload"] or {}
        rows: list[dict] = []
        failed = 0
        try:
            for res in client.messages.batches.results(bid):
                if res.result.type != "succeeded":
                    failed += 1
                    continue
                targets = payload.get(res.custom_id) or []
                text = "".join(
                    b.text for b in res.result.message.content if b.type == "text"
                )
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    failed += 1
                    continue
                for r in parsed.get("results", []):
                    i = int(r.get("n", 0)) - 1
                    if not (0 <= i < len(targets)):
                        continue  # 모델이 없는 번호를 냈다
                    handle, mid = targets[i]
                    rows.append(analysis_row(handle, int(mid), r))
        except Exception as exc:  # noqa: BLE001
            print(f"[수거] {bid} 결과 수신 실패: {type(exc).__name__}: {exc}")
            continue

        if rows:
            save_rows(db, rows)
            print_tone(rows, f"{bid} →")
        # 결과를 다 읽었으면(실패분 포함) 수거 완료로 표시한다. 못 받은 메시지는
        # 다음 실행에서 미분류로 다시 잡혀 재제출된다.
        db.table("telegram_analysis_batches").update(
            {"collected_at": datetime.now(timezone.utc).isoformat()}
        ).eq("batch_id", bid).execute()
        if failed:
            print(f"[수거] {bid} 요청 {failed}건 실패 — 다음 실행에서 재시도됩니다.")
        saved += len(rows)
    return saved


# ─────────────────────────────────────────────────────────────────────────────
# 제출 — 후보를 골라 중복을 접고 배치로 보낸다.
# ─────────────────────────────────────────────────────────────────────────────


def select_candidates(messages: list[dict], done: dict, inflight_keys: set) -> dict:
    """분류 후보를 고르고, 무엇을 왜 걸렀는지 같이 돌려준다."""
    stats = {"total": 0, "short": 0, "excluded_channel": 0, "done": 0, "inflight": 0}
    out: list[dict] = []
    for m in messages:
        text = (m.get("text") or "").strip()
        if not text:
            continue
        stats["total"] += 1
        key = (m["channel_handle"], m["message_id"])
        if key in done:
            stats["done"] += 1
            continue
        if key in inflight_keys:
            stats["inflight"] += 1
            continue
        if m["channel_handle"] in SENTIMENT_EXCLUDED_CHANNELS:
            stats["excluded_channel"] += 1
            continue
        if len(text) < MIN_TEXT_LEN:
            stats["short"] += 1
            continue
        out.append(m)
    out.sort(key=lambda m: m["posted_at"])
    return {"candidates": out, "stats": stats}


def fan_out_duplicates(messages: list[dict], done: dict, candidates: list[dict]) -> tuple[list[dict], list[dict]]:
    """이미 분류된 글과 본문이 같은 후보는 LLM 없이 라벨을 복사한다.

    포워드로 같은 찌라시가 여러 채널에 퍼지므로, 채널이 317개가 되면 이 비율이 계속
    오른다(현재 코퍼스 실측 10.1%). 돌려주는 것은 (복사한 행, 여전히 호출이 필요한 후보).

    톤과 화제어를 **둘 다** 복사한다. 화제어를 비우면 집계 결과가 지금과 달라진다 —
    같은 글을 10개 채널이 퍼뜨렸으면 지금은 화제어가 10번 세어지는데, 그게 곧 "10개
    채널이 이 얘기를 하고 있다"는 신호다(트렌딩 카드가 포워드 수를 쓰는 것과 같은
    이치). 비용만 줄이고 화면 숫자는 건드리지 않는 게 이 변경의 범위다.
    """
    label_by_body: dict[str, dict] = {}
    for m in messages:
        key = (m["channel_handle"], m["message_id"])
        if key in done:
            label_by_body.setdefault(body_key((m.get("text") or "").strip()), done[key])

    copied: list[dict] = []
    remaining: list[dict] = []
    for m in candidates:
        label = label_by_body.get(body_key((m.get("text") or "").strip()))
        if label is None:
            remaining.append(m)
            continue
        copied.append(analysis_row(m["channel_handle"], m["message_id"], label))
    return copied, remaining


def inflight_bodies(messages: list[dict], inflight_keys: set) -> set[str]:
    """처리 중인 배치가 담고 있는 본문들의 중복 키.

    이걸 빼지 않으면 이렇게 새어 나간다 — 실행 1에서 A를 제출하고 사본 A'는 접어 둔다.
    실행 2에서 A가 아직 안 끝났으면 A는 후보에서 빠지지만 A'는 후보로 살아나고, 접을
    상대가 없으니 자기가 대표가 돼 **같은 본문을 두 번 제출한다.**
    """
    return {
        body_key((m.get("text") or "").strip())
        for m in messages
        if (m["channel_handle"], m["message_id"]) in inflight_keys
    }


def dedupe(candidates: list[dict], seen: set[str]) -> tuple[list[dict], int]:
    """본문이 같은 후보는 대표 1건만 남긴다(나머지는 다음 실행에서 라벨을 복사받는다).

    seen 에는 이미 처리 중인 본문을 미리 넣어 둔다.
    """
    seen = set(seen)
    reps: list[dict] = []
    for m in candidates:
        k = body_key((m.get("text") or "").strip())
        if k in seen:
            continue
        seen.add(k)
        reps.append(m)
    return reps, len(candidates) - len(reps)


def submit_batch(client: Anthropic, db, reps: list[dict]) -> str | None:
    groups = [reps[i : i + BATCH_SIZE] for i in range(0, len(reps), BATCH_SIZE)]
    requests = []
    payload: dict[str, list] = {}
    for gi, group in enumerate(groups, start=1):
        cid = f"g{gi:04d}"
        payload[cid] = [[m["channel_handle"], m["message_id"]] for m in group]
        requests.append(
            {
                "custom_id": cid,
                "params": {
                    "model": MODEL,
                    "max_tokens": 2000,
                    "system": SYSTEM,
                    "messages": [{"role": "user", "content": build_prompt(group)}],
                    "output_config": {
                        "format": {"type": "json_schema", "schema": SCHEMA}
                    },
                },
            }
        )

    try:
        batch = client.messages.batches.create(requests=requests)
    except Exception as exc:  # noqa: BLE001
        print(f"[제출] 실패: {type(exc).__name__}: {exc}")
        return None

    db.table("telegram_analysis_batches").insert(
        {
            "batch_id": batch.id,
            "request_count": len(requests),
            "message_count": len(reps),
            "payload": payload,
        }
    ).execute()
    print(
        f"[제출] {batch.id} · 요청 {len(requests)}개 · 메시지 {len(reps)}건 "
        f"({batch.processing_status})"
    )
    return batch.id


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    collect_only = "--collect-only" in args
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None

    if not ANTHROPIC_API_KEY and not dry_run:
        # 키가 없으면 조용히 건너뛴다(설정 전 로컬/CI에서도 파이프라인이 안 깨지게).
        print("[skip] ANTHROPIC_API_KEY가 없어 메시지 분류를 건너뜁니다.")
        return

    db = get_client()
    client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

    # ① 지난 실행이 제출한 배치를 먼저 수거한다.
    if client and not dry_run:
        collect_batches(client, db)
    if collect_only:
        return

    # ② 새로 제출할 것을 고른다.
    messages = load_recent_messages(db)
    done = load_recent_analysis(db)
    inflight_rows, inflight_keys = load_inflight(db)
    sel = select_candidates(messages, done, inflight_keys)
    stats = sel["stats"]

    copied, candidates = fan_out_duplicates(messages, done, sel["candidates"])
    reps, folded = dedupe(candidates, inflight_bodies(messages, inflight_keys))
    if limit is not None:
        reps = reps[:limit]

    print(
        f"[대상] 최근 {SCAN_DAYS}일 본문 {stats['total']:,}건 · "
        f"분류 완료 {stats['done']:,} · 처리 중 {stats['inflight']:,}"
    )
    print(
        f"       제외 — 공시 피드 {stats['excluded_channel']:,} · "
        f"{MIN_TEXT_LEN}자 미만 {stats['short']:,} · "
        f"중복(라벨 복사) {len(copied):,} · 중복(대표로 접음) {folded:,}"
    )
    print(f"       → LLM 호출 필요 {len(reps):,}건 · 요청 {-(-len(reps) // BATCH_SIZE):,}개")

    if copied and not dry_run:
        save_rows(db, copied)
        print_tone(copied, "중복 라벨 복사 →")

    if dry_run:
        if reps:
            print("\n[프롬프트 미리보기 — 첫 요청]")
            print("─" * 60)
            print(build_prompt(reps[:BATCH_SIZE])[:1500])
            print("─" * 60)
        print("[dry-run] 제출·저장 없이 종료합니다.")
        return

    if not reps:
        print("[안내] 새로 제출할 메시지가 없습니다.")
        return
    if inflight_rows:
        # 앞의 수거에서 안 끝난 배치가 남아 있으면 그 메시지는 후보에서 빠져 있다.
        print(f"[안내] 아직 처리 중인 배치 {len(inflight_rows)}개는 건너뛰었습니다.")

    submit_batch(client, db, reps)
    print(
        "[안내] 결과는 다음 실행(또는 --collect-only 호출)에서 수거됩니다. "
        "대부분 1시간 내, 최대 24시간."
    )


if __name__ == "__main__":
    main()

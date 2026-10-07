"""글마다 '국내 증시 전체 / 미국 증시 전체'에 대한 분위기를 묻고, 날짜별로 센다(migration_088).

  telegram_message_market          글 하나의 판정 — kr · us(positive/neutral/negative/none) · kind
  telegram_market_sentiment_daily  날짜 × 시장별 낙관·중립·비관 건수(카더라 헤드라인 낙관도의 재료)

## 왜 따로 묻나

기존 톤(analyze_telegram_messages.py)은 "그 글이 다루는 대상"의 분위기라, 회사 수주 소식은 낙관이다.
그걸 모아 헤드라인을 내니 79일 동안 한 번도 '비관 우세'가 안 나왔다(common/market_sentiment.py 주석).
여기서는 같은 글에 "시장 전체에 대해서는?"을 따로 묻는다.

⚠️ **기존 톤 호출에 질문을 덧붙이지 않는다.** 같은 호출에 칸을 더했더니 기존 톤 판정의 일치율이
   92%(같은 프롬프트 두 번)에서 85%로 떨어졌다(2026-09-29, 300건). 톤은 테마 막대·종목 리포트가
   쓰는 재료라 흔들리면 안 된다. 그래서 호출을 따로 둔다.

## 모든 글에 묻지 않는다 — 후보 낱말

PREFILTER 에 걸린 글(전체의 45% 안팎)만 묻는다. 낱말은 **누구에게 물을지만** 정하고 판정은 모델이 한다.
정답지 500건의 시장 글 96건이 전부 후보 안에 있었고, 후보 밖 100건 중 시장 글은 1건이었다
(2026-09-29). 모든 글에 물으면 분류 사용량이 2.4배가 되는데(7일 실측 출력 122만 토큰), 후보만
물으면 1.4배다(34만 토큰).

## 이 판정이 어느 정도 맞나(2026-09-29, 후보 안 새 표본 300건, 내가 먼저 매긴 정답지와 대조)

  국내  시장 글 고르기 정밀도 77% · 재현율 51% · 방향 일치 80%
  미국  정밀도 88% · 재현율 81% · 방향 일치 91%

완벽하지 않다. 놓치는 글은 대부분 '방향 없는 시장 글'(일정 안내·거래대금 현황 등)이라 헤드라인
비율엔 안 들어간다. 표본 전체의 낙관 비율로 보면 정답지와 몇 %p 차이였다(오차 ±15%p).

## 실행

    cd data-pipeline && source .venv/bin/activate
    python scripts/analyze_telegram_market.py --dry-run        # 대상 건수만
    python scripts/analyze_telegram_market.py                  # 최근 14일 미판정분(최신부터 본문 1,500건) + 날짜별 집계
    python scripts/analyze_telegram_market.py --days 40        # 지난 날짜 채우기(백필)
    python scripts/analyze_telegram_market.py --daily-only     # 판정 없이 날짜별 집계만 다시

표(migration_088)가 없으면 안내만 찍고 끝낸다. LLM 자격이 없으면 판정은 건너뛰고 집계만 한다.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze_telegram_messages import (  # noqa: E402 — 본문 자르기·중복 키·제외 채널은 톤 분류와 같은 규칙
    MIN_TEXT_LEN,
    SENTIMENT_EXCLUDED_CHANNELS,
    TEXT_CAP,
    body_key,
    build_prompt,
)
from common.config import ANTHROPIC_API_KEY  # noqa: E402
from common.llm_client import HAS_LLM_CREDENTIAL, get_llm_client, report  # noqa: E402
from common.market_sentiment import MARKET_DAILY_TABLE  # noqa: E402
from common.supabase_client import get_client, has_column, load_keyset  # noqa: E402
from common.timeutil import KST  # noqa: E402

MODEL = "claude-haiku-5-5"
MARKET_TABLE = "telegram_message_market"

# 한 호출에 넣는 글 수. 40 이면 호출이 줄지만 한 번은 답이 10건 빠져 왔다(2026-09-29). 30 에선 안 빠졌다.
# 빠진 글은 저장되지 않아 다음 실행에서 다시 후보가 된다.
BATCH_SIZE = 30
SYNC_WORKERS = 8
# 판정할 글의 창. 톤 분류(SCAN_DAYS)와 같다 — 그보다 오래된 글은 백필(--days)로만 채운다.
SCAN_DAYS = 14
# 날짜별 집계를 다시 쓰는 범위. 화면이 읽는 건 최근 30일 추이 + 넓힐 여유 3일이다.
DAILY_DAYS = 45
# 파이프라인 한 실행에서 물을 본문 수의 상한. 평소엔 반나절치(본문 400~900건)라 안 걸린다.
# 마이그레이션 직후처럼 밀린 게 많으면 최신 글부터 이만큼만 묻고 나머지는 다음 실행이 가져간다 —
# 한 번에 14일치(400호출 남짓)를 돌리면 파이프라인이 17분 늘어난다. 지난 날짜는 --days 백필로 채운다.
MAX_REPS_PER_RUN = 1500

# 판정을 물어볼 글. 시장 전체를 가리키는 말이 하나라도 있으면 후보다 — 놓치지 않는 쪽으로 넓게.
# "투심"·"투자심리"는 후보 밖 표본에서 놓친 한 건("투심이 안 좋으니까…")을 보고 더했다.
PREFILTER = re.compile(
    r"코스피|코스닥|KOSPI|KOSDAQ|증시|지수|시황|장세|국장|미장|나스닥|NASDAQ|Nasdaq|S&P|S＆P|다우|러셀|뉴욕|월가|"
    r"외국인|기관|개인|수급|선물|매수세|매도세|순매수|순매도|반등|폭락|급락|급등|폭등|랠리|조정|"
    r"주식|시장|투심|투자\s?심리|장\s?마감|장\s?시작|장이|장중|마감|공포|탐욕|버블|약세|강세|하락|상승|치솟|오르|내리|빠지|빠졌"
)

SYSTEM = """\
당신은 한국 주식 텔레그램 채널·채팅방의 메시지를 분류하는 분석기입니다.
각 메시지에 대해 (1) kr: 국내 증시 전체 분위기, (2) us: 미국 증시 전체 분위기, (3) kind: 글 종류를 JSON으로만 답합니다.

[먼저 가릴 것 — 이 글이 '증시 전체' 이야기인가]
증시 전체 이야기는 글이 다음 중 하나를 직접 다룰 때뿐입니다.
- 지수의 움직임이나 전망. 국내는 코스피·코스닥(야간선물 포함), 미국은 S&P500·나스닥·다우·러셀(지수선물 포함).
- 시장 전체의 수급. 외국인·기관·개인의 시장 전체 순매수·순매도, 증시로 들어오거나 빠지는 자금.
- 시장 전체의 분위기·위험. "국내 증시", "미국 증시", "뉴욕증시", "주식시장", "장 분위기"처럼 시장 전체를 가리키며 말할 때.
어느 나라 증시인지 글에 없으면 국내 증시로 봅니다.

아래는 모두 none 입니다(증시 전체 이야기가 아님).
- 개별 종목·ETF·업종·테마 소식. 엔비디아·메타·삼성전자처럼 큰 종목도 마찬가지입니다. 여러 종목의 등락 목록, 특징주 정리, 업종 지수(필라델피아 반도체 지수 등)도 none 입니다.
- 종목 하나를 두고 자동으로 쓴 기술적 분석 글(예: "[AI시그널] ○○, 하락세 지속"). 글 안에 "시장은 약세" 같은 말이 있어도 그 종목 이야기입니다.
- 채권·금리·환율·원자재·코인 시장 이야기. 이것들은 증시가 아닙니다.
- 경제지표·정책·전쟁·외교 소식(수출, PMI, 소비심리, 금리 결정 등). 단, 글이 그 소식 때문에 지수나 증시가 움직였다·움직일 것이라고 직접 말하면 그 방향으로 판단합니다. 영향을 짐작해서 붙이지 마세요.
- 다른 나라 증시(일본·중국·대만·인도 등)만 다루는 글.

[방향 — 증시 전체 이야기일 때만]
- positive: 지수 상승·반등, 시장 전체 매수세, 증시 전망이 밝다는 말.
- negative: 지수 하락·급락, 시장 전체 매도세, 증시 전망이 어둡다는 말, 증시 전체에 대한 걱정·경고.
- neutral: 증시 전체 이야기지만 방향이 없거나 엇갈림. 보합·혼조, 일정 안내, 방향 없는 숫자 나열, 제도 변경.
- 지수가 올랐다·내렸다는 사실만 담담히 전해도 그 방향으로 봅니다.
- 사실과 전망이 엇갈리면 글쓴이가 강조하는 쪽을 따릅니다.
- 미국 증시 소식이 국내 증시에 미칠 영향을 글이 직접 말하면(예: "미 증시 하락에 코스피 약세 출발 전망") kr 에도 반영합니다.
- 증시 전체 이야기인지 애매하면 none, 방향이 애매하면 neutral 입니다.

[지수가 엇갈리거나 조금만 움직일 때]
- 대표 지수는 국내 코스피, 미국 S&P500 입니다. 지수끼리 방향이 엇갈리면 대표 지수를 따릅니다.
- 대표 지수의 방향이 글에 없고 다른 지수끼리 엇갈리면(예: "혼조 마감… 나스닥 사상 최고치", "나스닥 상승, 다우 하락") neutral 입니다. 지수가 하나만 나오면 그 지수를 따릅니다.
- 대표 지수가 ±0.3% 안에서 움직였으면(보합·강보합·약보합 포함) neutral 입니다.
- 지수 등락 숫자가 적혀 있으면(예: "다우 +0.68% / 나스닥 -1.13% / S&P500 -0.75%") 뒤에 종목 목록이 붙어 있어도 반드시 판정합니다.
- 장중에 방향이 바뀌었으면(전강후약 등) 글이 전하는 마지막 시점의 방향을 따릅니다.
- 외국인·기관·개인의 시장 전체 순매수·순매도(예: "외국인 코스피 1조 순매도")는 방향이 있습니다. 특정 종목을 사고판 소식은 none 입니다.
- 미국 증시 소식만 있고 국내 증시에 미칠 영향을 글이 직접 말하지 않으면 kr 은 none 입니다.

[미국 증시에서 특히 주의]
- 미국 증시 전체는 S&P500·나스닥·다우·러셀 지수나 지수선물, 또는 "뉴욕증시·미국 증시·미장·월가" 전체를 말할 때입니다.
- 필라델피아 반도체 지수 같은 업종 지수, 엔비디아·애플·메타 같은 대형주, '기술주'·'반도체주'처럼 업종을 묶은 말의 등락은 none 입니다.

[글 종류 — kind]
- news: 언론 기사·속보·공시를 옮긴 글(제목과 링크만 있는 글 포함).
- research: 증권사·운용사·리서치 기관의 시황·리포트·전략 자료.
- opinion: 채널 운영자나 개인이 자기 생각·전망·감정을 말하는 글. 뉴스를 옮기며 자기 의견을 덧붙였으면 opinion 입니다.
- auto: 자동으로 올라오는 시세·신고가·순위 알림, 공시 알림, 광고·공지·홍보.

[입력 형식] 각 메시지는 "### <번호>" 줄로 시작합니다.
[출력] 모든 번호에 대해 정확히 하나씩, 입력 순서대로 결과를 만드세요."""

_MOOD = {"type": "string", "enum": ["positive", "neutral", "negative", "none"]}
SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "kr": _MOOD,
                    "us": dict(_MOOD),
                    "kind": {"type": "string", "enum": ["news", "research", "opinion", "auto"]},
                },
                "required": ["n", "kr", "us", "kind"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}

MOOD_TO_COUNT = {"positive": "positive_count", "neutral": "neutral_count", "negative": "negative_count"}


def is_candidate(m: dict) -> bool:
    text = (m.get("text") or "").strip()
    return (
        m["channel_handle"] not in SENTIMENT_EXCLUDED_CHANNELS
        and len(text) >= MIN_TEXT_LEN
        and bool(PREFILTER.search(text[:TEXT_CAP]))
    )


def kst_date(posted_at: str) -> str:
    return datetime.fromisoformat(posted_at).astimezone(KST).date().isoformat()


def classify_group(client, group: list[dict]) -> list[dict]:
    """묶음 하나. 실패하면 빈 목록 — 그 글들은 저장되지 않아 다음 실행에서 다시 후보가 된다."""
    try:
        res = client.messages.create(
            model=MODEL,
            max_tokens=4000,
            system=SYSTEM,
            messages=[{"role": "user", "content": build_prompt(group)}],
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
        )
        text = "".join(b.text for b in res.content if b.type == "text")
        return json.loads(text).get("results", [])
    except Exception as exc:  # noqa: BLE001 — 한 묶음의 실패가 나머지를 데려가면 안 된다
        print(f"[시장 판정] 묶음 실패: {type(exc).__name__}: {str(exc)[:120]}")
        return []


def market_row(m: dict, label: dict) -> dict:
    return {
        "channel_handle": m["channel_handle"],
        "message_id": int(m["message_id"]),
        "posted_date": kst_date(m["posted_at"]),
        "text_hash": body_key((m.get("text") or "").strip()),
        "kr": label["kr"],
        "us": label["us"],
        "kind": label["kind"],
        "model": MODEL,
    }


def save_rows(db, rows: list[dict]) -> None:
    # 한 요청 안에 같은 키가 두 번이면 요청이 통째로 거절된다(analyze_telegram_messages.save_rows 주석).
    unique = list({(r["channel_handle"], r["message_id"]): r for r in rows}.values())
    for i in range(0, len(unique), 500):
        db.table(MARKET_TABLE).upsert(unique[i : i + 500], on_conflict="channel_handle,message_id").execute()


def label_new(db, days: int, dry_run: bool, limit: int | None) -> None:
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).isoformat()
    messages = load_keyset(
        db, "telegram_messages", "id,channel_handle,message_id,posted_at,text",
        narrow=lambda q: q.gte("posted_at", since),
    )
    # 이미 판정한 글. 판정 시각 ≥ 게시 시각이라, 게시 창과 같은 시작점으로 좁혀도 다 들어온다.
    done_rows = load_keyset(
        db, MARKET_TABLE, "id,channel_handle,message_id,text_hash,kr,us,kind",
        narrow=lambda q: q.gte("analyzed_at", since),
    )
    done = {(r["channel_handle"], r["message_id"]) for r in done_rows}
    label_by_body = {r["text_hash"]: r for r in done_rows if r.get("text_hash")}

    candidates = [m for m in messages if (m["channel_handle"], m["message_id"]) not in done and is_candidate(m)]

    # 이미 판정한 본문과 같은 글은 모델 없이 판정을 복사한다(포워드).
    copied: list[dict] = []
    todo: list[dict] = []
    for m in candidates:
        prev = label_by_body.get(body_key((m.get("text") or "").strip()))
        if prev:
            copied.append(market_row(m, prev))
        else:
            todo.append(m)

    # 이번에 물을 글 — 본문이 같으면 대표 하나만.
    by_body: dict[str, list[dict]] = defaultdict(list)
    for m in todo:
        by_body[body_key((m.get("text") or "").strip())].append(m)
    # 최신 글부터 — 상한에 걸려도 오늘 헤드라인의 재료가 먼저 찬다.
    reps = sorted((group[0] for group in by_body.values()), key=lambda m: m["posted_at"], reverse=True)
    if limit is not None:
        reps = reps[:limit]

    share = len([m for m in messages if is_candidate(m)]) / max(len(messages), 1)
    print(
        f"[시장 판정] 최근 {days}일 글 {len(messages):,}건 · 후보 비중 {share:.0%} · 새 후보 {len(candidates):,}건 "
        f"(복사 {len(copied):,} · 물을 본문 {len(by_body):,} 중 이번 {len(reps):,})"
    )
    if dry_run:
        return
    if copied:
        save_rows(db, copied)
    if not reps:
        return
    if not HAS_LLM_CREDENTIAL:
        print("[skip] LLM 자격(구독 토큰·API 키)이 없어 시장 판정을 건너뜁니다. 집계만 합니다.")
        return

    client = get_llm_client(ANTHROPIC_API_KEY)
    groups = [reps[i : i + BATCH_SIZE] for i in range(0, len(reps), BATCH_SIZE)]
    print(f"[시장 판정] 요청 {len(groups)}개 · 한 번에 {BATCH_SIZE}건 · 동시 {SYNC_WORKERS}")
    rows: list[dict] = []
    missing = 0
    with ThreadPoolExecutor(max_workers=SYNC_WORKERS) as ex:
        for group, results in zip(groups, ex.map(lambda g: classify_group(client, g), groups)):
            got = set()
            for r in results:
                i = int(r.get("n", 0)) - 1
                if not (0 <= i < len(group)) or i in got:
                    continue
                got.add(i)
                rep = group[i]
                # 대표의 판정을 본문이 같은 다른 글에도 붙인다.
                for m in by_body[body_key((rep.get("text") or "").strip())]:
                    rows.append(market_row(m, r))
            missing += len(group) - len(got)
    if rows:
        save_rows(db, rows)
    report(client)
    mood = Counter(r["kr"] for r in rows)
    mood_us = Counter(r["us"] for r in rows)
    print(
        f"[시장 판정] {len(rows):,}건 저장 · 국내 낙관 {mood['positive']} · 중립 {mood['neutral']} · 비관 {mood['negative']} "
        f"· 해당 없음 {mood['none']} / 미국 낙관 {mood_us['positive']} · 중립 {mood_us['neutral']} · 비관 {mood_us['negative']}"
    )
    if missing:
        print(f"[시장 판정] 답이 빠진 글 {missing}건 — 다음 실행에서 다시 묻습니다.")


def write_daily(db, dry_run: bool) -> None:
    """최근 DAILY_DAYS 일의 날짜 × 시장별 건수를 다시 쓴다. 같은 날 같은 본문은 한 번만 센다.

    같은 글이 여러 채널에 퍼지면 그 수만큼 세어지던 것을 톤 집계가 이미 한 번씩으로 접는다
    (calculate_telegram_sentiment 의 복붙 접기, migration_065). 여기서도 같은 규칙이다.
    """
    since = (datetime.now(KST).date() - timedelta(days=DAILY_DAYS)).isoformat()
    rows = load_keyset(
        db, MARKET_TABLE, "id,channel_handle,message_id,posted_date,text_hash,kr,us",
        narrow=lambda q: q.gte("posted_date", since),
    )
    seen: set[tuple[str, str]] = set()
    counts: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for r in rows:
        key = (r["posted_date"], r.get("text_hash") or f"{r['channel_handle']}/{r['message_id']}")
        if key in seen:
            continue
        seen.add(key)
        for market in ("kr", "us"):
            mood = r[market]
            if mood in MOOD_TO_COUNT:
                counts[(r["posted_date"], market)][MOOD_TO_COUNT[mood]] += 1
    out = []
    for (d, market), c in sorted(counts.items()):
        total = c["positive_count"] + c["neutral_count"] + c["negative_count"]
        out.append({"date": d, "market": market, **{k: c[k] for k in MOOD_TO_COUNT.values()}, "message_count": total})
    print(f"[시장 낙관도] {since} 이후 {len(out)}줄(날짜 × 시장) · 판정 {len(rows):,}건 · 같은 본문 접은 뒤 {len(seen):,}건")
    for r in out[-4:]:
        print(f"  {r['date']} {r['market']} 낙관 {r['positive_count']} · 중립 {r['neutral_count']} · 비관 {r['negative_count']}")
    if dry_run or not out:
        return
    for i in range(0, len(out), 500):
        db.table(MARKET_DAILY_TABLE).upsert(out[i : i + 500], on_conflict="date,market").execute()


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    daily_only = "--daily-only" in args
    days = int(args[args.index("--days") + 1]) if "--days" in args else SCAN_DAYS
    # 백필(--days)은 상한 없이 다 묻는다. 파이프라인 기본 실행만 MAX_REPS_PER_RUN 으로 자른다.
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else (None if "--days" in args else MAX_REPS_PER_RUN)

    db = get_client()
    if not has_column(db, MARKET_TABLE, "kr") or not has_column(db, MARKET_DAILY_TABLE, "market"):
        print(
            "[skip] 시장 판정 표가 없습니다. supabase/migration_088_market_sentiment.sql 을 "
            "Supabase SQL 에디터에서 실행하세요. 그 전까지 화면은 전체 글 기준으로 셉니다."
        )
        return
    if not daily_only:
        label_new(db, days, dry_run, limit)
    write_daily(db, dry_run)


if __name__ == "__main__":
    main()

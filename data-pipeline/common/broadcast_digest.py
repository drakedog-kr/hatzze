"""텔레그램 채널 글 2판 — '갈래 요약' 다섯 가지의 재료·프롬프트·조립.

1판(common/broadcast_content.py · 네 포맷)은 키워드 문단·종목 목록·테마 표처럼 글마다
그릇이 달랐고, 이야기(아침)와 종목(저녁)이 갈라져 있어 둘 다 반쪽이었다. 2026-09-09 에
방향을 다시 잡았다 — **우리는 320개 채널을 대신 읽어 주는 요약이다.** 그러니 개선은
새 형식이 아니라 요약의 질에서 온다.

    빠짐없이     그날 채널이 붙잡은 이야기를 갈래로 다 덮는다
    종목이 붙어  갈래마다 얽힌 종목과 그날 등락·채널이 말한 까닭이 따라온다
    어제와 차이  커진 이야기·식은 이야기·처음 나온 종목. 합산해서 읽는 우리만 말할 수 있다
    제때         아침은 개장 전, 저녁은 마감 뒤 한 시간 안

## 다섯 글 — 전부 같은 그릇을 쓴다

    갈래 제목 한 줄 → 문장 두세 개 → 얽힌 종목 한 줄(인용 박스)

    morning2    월~금 개장 전   '개장 전 요약' — 밤사이(어제 18시~오늘 8시) + 오늘 일정
    evening2    월~금 마감 뒤   '저녁 브리핑' — 온도 + 오늘(8시~18시) + 처음 회자된 종목 + 내일 일정
    midweek     수 14:00        '주중 점검' — 월~수 이야기의 흐름 + 이번 주 새 얼굴 + 남은 주 일정
    us_weekend  토 14:00        '이번 주 미장 흐름' — 금요일 세션 포함 + 다음 주 미장 일정
    weekly2     일 14:00        '한 주 정리와 다음 주 일정' — 온도 흐름 + 한 주 네 갈래 + 새 얼굴 + 다음 주 일정
    (제목은 후보 10개씩에서 골랐다 · 2026-09-10)

1판 포맷은 스크립트에 그대로 남아 있다(morning·evening·theme·weekly). 워크플로는 이 판만
부른다. 함께 손본 것 둘(2026-09-10, 같은 PR):
  · **개장 전 요약은 파이프라인 중간**(미국 종목 집계 뒤)에서 나간다. 끝에 두면 도착이
    08:44~09:40 이라 셋 중 하나가 개장 뒤였다. 게이트도 갈아 끼웠다 — 그 자리는
    calculate_score·check_freshness 앞이라 수집 커버리지와 telegram_staleness_problems 를 본다.
  · **토요일 글이 쓰는 미장 까닭은 발송 직전에 만든다**(telegram-broadcast.yml 의
    us_move_reasons 스텝). 그 표의 토요일 행은 원래 저녁 실행(18:00)에서 생겨 14:00 글이
    못 썼다. 생성기 문턱도 `--min-msgs` 로 낮춰야 한다 — 토요일 14:00 까지 메시지가
    762~1,145 건이라 기본값 1,500 에 스스로 걸린다.

## 알고 쓰는 느슨함 하나

갈래의 '서로 다른 채널 둘 이상' 검사는 근거 발췌의 채널에 **그 갈래가 든 종목을 말한 발췌의
채널**을 더해서 센다(_validate_sections). 모델이 근거를 하나만 적어도 통과시키려는 완화인데,
대신 삼성전자처럼 널리 언급되는 종목을 적으면 사실상 자동 통과가 된다. 한 채널 잡담을 막는
힘이 그만큼 약하다 — 더 조이려면 근거 발췌의 채널만 세도록 되돌리면 된다.

## 재료를 고르는 규칙

숫자(조회·전달·언급 수·채널 수)는 **재료를 고르는 데만** 쓰고 글에는 내용만 싣는다.
발췌는 조회 + 전달×3 순으로 고르고, 갈래는 **서로 다른 채널 둘 이상**이 다룬 이야기만
세운다 — 모델에게 근거 발췌 번호를 적게 하고 코드가 채널 수를 센다(compose_sections).
한 채널 잡담이 갈래가 되는 걸 막는 유일한 장치라, 근거가 없는 갈래는 버린다.

LLM 문장은 1판과 같은 그물을 지난다 — 금지어(bc.banned_hits)·오타(text_check.problems)에
걸리면 그 갈래만 빠진다. 종목 이름은 자료에 있던 이름으로만 풀리고(name→code), 못 푼
이름은 조용히 떨어진다 — 모델이 지어낸 종목이 종목 줄에 오르지 않게.

## 갈래 저장(선택)

아침·저녁 글의 갈래를 `telegram_daily_digest` 에 저장해 두면(migration_070) 수·일 글이
그걸 재료로 쓴다(사흘·닷새치를 원문에서 다시 요약하지 않아도 되고, 하루하루의 요약과
주간 요약이 같은 이름으로 같은 이야기를 부른다). 표가 없으면 저장은 조용히 건너뛰고
수·일 글은 원문 발췌만으로 만든다. 저장은 실제 발송 때만 한다(dry-run 은 안 남긴다).
"""

from __future__ import annotations

import html
import json
import re
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from . import broadcast_content as bc
from . import yahoo_client
from .supabase_client import execute_with_retry, load_keyset
from .surging import load_stock_daily, top_surging
from .text_check import problems
from .timeutil import KST, today_kst

FORMATS = ("morning2", "evening2", "midweek", "us_weekend", "weekly2")
NY = ZoneInfo("America/New_York")

# 어느 화면으로 보내나. utm_content 는 1판과 같은 값을 쓴다(GA 에서 같은 슬롯끼리 견주려고).
CTA = {
    "morning2": ("/kadera", "morning"),
    "evening2": ("/kadera", "evening"),
    "midweek": ("/kadera", "midweek"),
    "us_weekend": ("/kadera/us", "us_weekend"),
    "weekly2": ("/kadera", "weekly"),
}

# ─── 창 경계(KST) ─────────────────────────────────────────────────────────────
NIGHT_FROM_HOUR = bc.NIGHT_FROM_HOUR   # 18
NIGHT_TO_HOUR = bc.NIGHT_TO_HOUR       # 8
DAY_TO_HOUR = 18

# ─── 발췌 ────────────────────────────────────────────────────────────────────
EXCERPT_CHARS = 220         # 발췌 한 건 상한. 1판(180)보다 길다 — 갈래에 종목·까닭까지 담아야 해서
EXCERPTS_DAY = 70           # 하루짜리 창에서 모델에 주는 발췌 수(1판 14)
EXCERPTS_MULTI = 100        # 며칠짜리 창
MULTI_MIN_FORWARDS = 3      # 며칠짜리 창은 서버에서 전달 3회 이상만 받는다(주 4만 건을 다 읽지 않는다)
FALLBACK_DAYS = 3           # 창이 비면 하루씩 물러나는 상한(1판 NIGHT_FALLBACK_DAYS 와 같다)
MIN_WINDOW_MSGS = 100       # 이보다 적으면 '수집이 안 된 창'으로 보고 물러난다

MIN_EVIDENCE_CHANNELS = 2   # 갈래 하나에 필요한 서로 다른 채널 수
# 갈래 수. 프롬프트에 적는 말과 코드가 지키는 범위(최소, 최대)를 한 곳에 둔다.
# 최소에 못 미치면(모델이 형식을 어겼거나 검사에서 많이 떨어진 날) 한 번 더 부른다 —
# 2026-09-10 일요일 글이 갈래 하나로 나갔다(모델이 '## ' 없이 써서 통째로 한 덩어리로 읽혔다).
# 평일(아침·저녁·수요일) 3~4개, 주말(토·일) 4개(2026-09-10 결정).
SECTIONS = {"morning2": "세네", "evening2": "세네", "midweek": "세네", "us_week": "네", "weekly2": "네"}
SECTION_RANGE = {"morning2": (3, 4), "evening2": (3, 4), "midweek": (3, 4), "us_week": (4, 4), "weekly2": (4, 4)}
MAX_SECTIONS = 5
RETRIES_WHEN_SHORT = 1
# 이보다 적게 남으면 글을 아예 안 만든다. 갈래가 하나뿐인 '요약'은 요약이 아니고, 모델이
# 형식을 통째로 어긴 날은 제목 없는 문단 하나만 남는다(파서 시험에서 그 모습을 봤다).
# 다시 부르는 건 위 RETRIES_WHEN_SHORT 가 이미 한 번 한다 — 그러고도 모자라면 그날은 거른다.
MIN_SECTIONS_TO_SEND = 2
STOCKS_PER_SECTION = 4      # 종목 줄에 싣는 종목 수 상한(2026-09-10 결정). 넘치면 앞에서부터 넷
EVENT_LINES_DAY = 4         # 오늘·내일 일정 줄 수
EVENT_LINES_WEEK = 8        # 다음 주 일정 줄 수
NEW_FACES = 3               # 처음 회자된 종목 수
MESSAGE_SOFT_LIMIT = 3900   # 텔레그램 상한 4096 — 넘치면 뒤쪽 블록부터 뺀다

# 종목 줄에 /stock/[code] 링크를 다는가. 운영 결정 사항이라 스위치로 둔다(2026-09-10: 끈다).
# 켜면 종목 이름 하나하나가 링크가 되고, 하단 CTA 는 그대로 남는다.
STOCK_LINKS = False
SITE_URL = "https://hatzze.fun"

# 갈래 본문 상한. 프롬프트는 두세 문장을 요구하지만 모델이 넘기면 문장 경계에서 자른다.
BODY_MAX_SENTENCES = 3

# 갈래 제목 앞에 붙는 표시. 굵게만으로는 갈래 경계가 눈에 안 띄어(2026-09-10) 하나로 통일해 붙인다.
# 머리 제목(🌅🌆🔄📈📅)·일정(📌)·새 종목(🆕)·온도(🌡️)와 겹치지 않는 단순한 것.
SECTION_MARK = "🔹"


@dataclass
class Render:
    """발송 스크립트(send_telegram_broadcast.py)가 넘기는 표시 도구.

    인용 박스·CTA·문단 나누기·날짜 표기는 1판과 **같은 함수**를 써야 두 판의 글이 같은
    모양으로 보인다. 그 함수들이 스크립트에 있고 이 모듈이 스크립트를 import 할 수 없어
    (순환), 호출 쪽이 묶어서 넘긴다.
    """
    cta_link: Callable[[str, str], str]
    quote: Callable[..., str]
    paragraphs: Callable[[str], list[str]]
    date_label: Callable[[str], str]
    js_round: Callable[[float], int]
    stage_for_score: Callable[[float], str]
    stage_emoji: dict


@dataclass
class Excerpt:
    n: int
    channel: str
    message_id: int
    text: str
    views: int
    forwards: int
    posted_at: datetime
    kr: list[str] = field(default_factory=list)   # 종목코드
    us: list[str] = field(default_factory=list)   # 티커
    channels: set[str] = field(default_factory=set)  # 같은 본문을 나른 채널들(복붙 묶음)


@dataclass
class Material:
    excerpts: list[Excerpt]
    kr_names: dict[str, str]     # code → name
    us_names: dict[str, str]     # ticker → name_ko
    window: tuple[datetime, datetime]
    total: int                   # 창 안 메시지 수(고르기 전)

    def name_to_kr(self) -> dict[str, str]:
        return {n: c for c, n in self.kr_names.items()}

    def name_to_us(self) -> dict[str, str]:
        out = {n: t for t, n in self.us_names.items()}
        out.update({t: t for t in self.us_names})
        return out


@dataclass
class Section:
    title: str
    body: str
    kr: list[str]
    us: list[str]
    evidence: list[int]
    sentence_title: bool = False   # 제목 자리에 문장을 썼다(명사구가 아니다). 다시 만들 조건에 쓴다


def esc(s: str) -> str:
    return html.escape(s, quote=False)


# ─── 창 ───────────────────────────────────────────────────────────────────────


def at(d: date, hour: int) -> datetime:
    return datetime.combine(d, dtime(hour, 0), tzinfo=KST)


def night_window(d: date) -> tuple[datetime, datetime]:
    """d 아침 8시에 끝나는 밤. (d-1 18:00, d 08:00)"""
    return at(d - timedelta(days=1), NIGHT_FROM_HOUR), at(d, NIGHT_TO_HOUR)


def day_window(d: date, now: datetime) -> tuple[datetime, datetime]:
    """d 의 낮. (d 08:00, min(d 18:00, now)). now 가 8시 전이면 빈 창."""
    lo = at(d, NIGHT_TO_HOUR)
    return lo, max(lo, min(at(d, DAY_TO_HOUR), now))


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def last_friday_before(d: date) -> date:
    """d 보다 앞선 가장 가까운 금요일. d 가 금요일이면 그날 밤이 아직이라 한 주 전."""
    fri = d - timedelta(days=(d.weekday() - 4) % 7)
    return fri - timedelta(days=7) if fri == d else fri


def last_saturday(d: date) -> date:
    """d 이하의 가장 가까운 토요일(d 가 토요일이면 d)."""
    return d - timedelta(days=(d.weekday() - 5) % 7)


def span_label(lo: datetime, hi: datetime, drop_month: int | None = None) -> str:
    """창의 날짜. `drop_month` 와 두 날짜의 달이 모두 같으면 '월'을 뺀다.

    머리줄이 이미 "9월 10일(목) 개장 전" 이라 뒤에 "9월" 을 또 적으면 군더더기다
    (2026-09-10 지적). → "9일 18시 ~ 10일 8시".
    ⚠️ 달을 넘는 창(8월 31일 18시 ~ 9월 1일 8시)에서는 **둘 다 적는다.** 한쪽만 빼면
    "8월 31일 18시 ~ 1일 8시" 가 되어 어느 달인지 흐려진다.
    """
    if drop_month is not None and lo.month == hi.month == drop_month:
        return f"{lo.day}일 {lo.hour}시 ~ {hi.day}일 {hi.hour}시"
    return f"{lo.month}월 {lo.day}일 {lo.hour}시 ~ {hi.month}월 {hi.day}일 {hi.hour}시"


# ─── 재료: 메시지 ─────────────────────────────────────────────────────────────


def window_messages(db, lo: datetime, hi: datetime, min_forwards: int | None = None) -> list[dict]:
    """창 안 메시지. 키셋 페이징(필터+OFFSET 조합은 8초 천장에 걸린다 — 1판 주석 참고).

    **며칠짜리 창은 하루씩 끊어 읽는다.** 엿새 범위에 forwards 필터를 걸고 한 번에 넘기면
    페이지마다 훑는 행이 늘어 statement timeout(8초)에 걸렸다(2026-09-10, 동시 실행 8개에서
    수요일·일요일 글 둘 다). 하루 단위면 한 statement 가 보는 행이 1/6 이다.
    """
    def fetch(a: datetime, b: datetime) -> list[dict]:
        def narrow(q):
            q = q.gte("posted_at", a.isoformat()).lt("posted_at", b.isoformat())
            if min_forwards:
                q = q.gte("forwards", min_forwards)
            return q

        return load_keyset(db, "telegram_messages", "id,channel_handle,message_id,text,views,forwards,posted_at", narrow=narrow)

    rows: list[dict] = []
    cur = lo
    while cur < hi:
        nxt = min(cur + timedelta(days=1), hi)
        rows += fetch(cur, nxt)
        cur = nxt
    return rows


# 채널 글에 섞이는 폭 없는 문자(U+200B 등). 모델이 그대로 옮겨 적으면 '다.' 뒤에 붙어
# 문장 경계를 못 찾고, 문단이 안 나뉘어 한 덩어리로 나간다(첫 시험 실측).
_ZW = re.compile("[\u200b\u200c\u200d\u2060\ufeff]")


def _norm_key(text: str) -> str:
    return re.sub(r"\s+", "", text)[:60]


def pick_excerpts(rows: list[dict], n: int) -> list[Excerpt]:
    """조회 + 전달×3 순으로 n 건. 같은 본문(복붙)은 한 번만.

    복붙이 17% 라(2026-09-04 실측) 그대로 두면 상위가 같은 글로 채워진다. 앞 60자로 묶는다.
    **묶으면서 채널은 기억한다.** 같은 글을 다섯 채널이 날랐으면 발췌는 하나지만 채널은
    다섯이다 — 이걸 잊으면 널리 퍼진 이야기가 '한 채널 잡담'으로 보여 갈래에서 떨어진다
    (첫 시험에서 실제로 그랬다).
    """
    usable = [r for r in rows if (r.get("text") or "").strip()]
    usable.sort(key=lambda r: (r.get("views") or 0) + (r.get("forwards") or 0) * 3, reverse=True)
    out: list[Excerpt] = []
    seen: dict[str, Excerpt] = {}
    for r in usable:
        t = " ".join(_ZW.sub("", r["text"] or "").split())
        k = _norm_key(t)
        if k in seen:
            seen[k].channels.add(r["channel_handle"])
            continue
        if len(out) >= n:
            continue  # 정원은 찼지만 뒤에 오는 복붙의 채널은 계속 센다
        out.append(
            Excerpt(
                n=len(out) + 1,
                channel=r["channel_handle"],
                message_id=int(r["message_id"]),
                text=t[:EXCERPT_CHARS],
                views=r.get("views") or 0,
                forwards=r.get("forwards") or 0,
                posted_at=datetime.fromisoformat(str(r["posted_at"]).replace("Z", "+00:00")).astimezone(KST),
                channels={r["channel_handle"]},
            )
        )
        seen[k] = out[-1]
    return out


PAGE_ROWS = 1000   # PostgREST 가 한 번에 주는 최대 행. 넘으면 **에러 없이** 자른다


def _in_chunks(items: list, size: int = 150):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def tag_stocks(db, excerpts: list[Excerpt]) -> tuple[dict[str, str], dict[str, str]]:
    """발췌에 붙은 종목(국내·미국)을 채우고 이름표를 돌려준다.

    종목 추출기가 이미 메시지마다 종목을 달아 뒀다(telegram_message_stocks · _us_stocks).
    그걸 발췌 옆에 적어 주면 모델이 종목을 지어내지 않고, 코드는 갈래의 종목을 그 이름으로만
    푼다. message_id 는 채널마다 겹치므로 (채널, id) 짝으로 맞춘다.
    """
    if not excerpts:
        return {}, {}
    keys = {(e.channel, e.message_id): e for e in excerpts}
    ids = sorted({e.message_id for e in excerpts})

    # ⚠️⚠️ **`message_id` 는 채널마다 따로 매겨진다.** 그래서 이 조회는 내 발췌뿐 아니라 같은
    #    번호를 가진 **다른 채널의 행까지** 함께 받아 온다(실측 2026-09-10: 발췌 70건에 응답
    #    216행, 그중 쓸모 있는 건 18행). 쓸모없는 행이 1,000행 캡을 갉아먹는 셈이라, 표가
    #    자라면 어느 날 캡에 닿아 **에러 없이 잘린다** — 그러면 종목 줄만 조용히 비고 로그에는
    #    "자료에 없는 종목 이름" 만 남는다(그 모습을 실제로 봤다).
    #    복합 키로 좁히는 문법이 PostgREST 에 없으므로 **페이지를 끝까지 이어 받는다.**
    def paged(table: str, columns: str, chunk: list[int]) -> list[dict]:
        out: list[dict] = []
        start = 0
        while True:
            page = execute_with_retry(
                db.table(table).select(columns).in_("message_id", chunk).order("id").range(start, start + PAGE_ROWS - 1)
            ).data
            if not page:
                break
            out += page
            if len(page) < PAGE_ROWS:
                break
            start += PAGE_ROWS
        return out

    kr_codes: set[str] = set()
    us_tickers: set[str] = set()
    for chunk in _in_chunks(ids):
        for r in paged("telegram_message_stocks", "id,channel_handle,message_id,stock_code", chunk):
            e = keys.get((r["channel_handle"], int(r["message_id"])))
            if e and r["stock_code"] not in e.kr:
                e.kr.append(r["stock_code"])
                kr_codes.add(r["stock_code"])
        for r in paged("telegram_message_us_stocks", "id,channel_handle,message_id,ticker", chunk):
            e = keys.get((r["channel_handle"], int(r["message_id"])))
            if e and r["ticker"] not in e.us:
                e.us.append(r["ticker"])
                us_tickers.add(r["ticker"])

    kr_names: dict[str, str] = {}
    for chunk in _in_chunks(sorted(kr_codes)):
        kr_names.update({r["code"]: r["name"] for r in db.table("stocks").select("code,name").in_("code", chunk).execute().data})
    us_names: dict[str, str] = {}
    for chunk in _in_chunks(sorted(us_tickers)):
        us_names.update({r["ticker"]: r["name_ko"] for r in db.table("us_stocks").select("ticker,name_ko").in_("ticker", chunk).execute().data})
    return kr_names, us_names


def load_material(db, lo: datetime, hi: datetime, n: int, multi: bool = False, us_only: bool = False) -> Material:
    """창 하나의 발췌 묶음. multi 면 전달 3회 이상만 서버에서 받는다."""
    rows = window_messages(db, lo, hi, MULTI_MIN_FORWARDS if multi else None)
    picked = pick_excerpts(rows, n * 2 if us_only else n)
    kr_names, us_names = tag_stocks(db, picked)
    if us_only:
        picked = [e for e in picked if e.us][:n]
        for i, e in enumerate(picked):
            e.n = i + 1
    return Material(picked, kr_names, us_names, (lo, hi), len(rows))


def load_material_with_fallback(db, window_of: Callable[[int], tuple[datetime, datetime]], n: int) -> Material:
    """창이 비면(수집 실패·손으로 돌린 새벽) 자료가 있는 날까지 하루씩 물러난다.

    1판 load_night_messages 와 같은 이유다 — "요약하지 못했습니다"만 내보내느니 있는 밤을
    쓰고, 화면에 창의 날짜를 그대로 적어 어느 밤인지 숨기지 않는다.
    """
    mat = None
    for back in range(0, FALLBACK_DAYS + 1):
        lo, hi = window_of(back)
        mat = load_material(db, lo, hi, n)
        if mat.total >= MIN_WINDOW_MSGS:
            return mat
        print(f"[안내] {span_label(lo, hi)} 창에 {mat.total}건뿐이라 하루 물러납니다.")
    return mat


def excerpt_lines(mat: Material, label: str, excerpts: list[Excerpt] | None = None) -> list[str]:
    """모델에 주는 발췌 목록. 번호·채널·종목 태그를 한 줄 머리에 둔다.

    번호는 근거 표기에, 채널은 코드가 채널 수를 세는 데, 종목 태그는 모델이 이름을 지어내지
    않게 하는 데 쓴다. 홍보·링크는 모델이 무시하도록 프롬프트에 적어 뒀다.
    """
    out = [f"[{label}] 널리 퍼진 순입니다. 번호는 근거 표기에 쓰세요."]
    for e in (excerpts if excerpts is not None else mat.excerpts):
        tags = [mat.kr_names.get(c, c) for c in e.kr] + [f"{mat.us_names.get(t, t)}({t})" for t in e.us]
        head = f"({e.n}) {e.posted_at:%m/%d %H시} @{e.channel}"
        if len(e.channels) > 1:
            head += f" · 같은 글 {len(e.channels)}개 채널"
        if tags:
            head += " · 종목: " + ", ".join(tags[:6])
        out.append(f"{head}\n{e.text}")
    return out


# ─── 재료: 표에서 읽는 것 ─────────────────────────────────────────────────────


def latest_date_leq(db, table: str, col: str, day: date) -> str | None:
    rows = db.table(table).select(col).lte(col, day.isoformat()).order(col, desc=True).limit(1).execute().data
    return rows[0][col] if rows else None


def load_kr_reasons(db, day: date) -> tuple[str | None, list[dict]]:
    """그날(없으면 그 앞 마지막 날)의 급등락 종목과 채널이 말한 까닭. 이름을 붙여 돌려준다."""
    d = latest_date_leq(db, "telegram_stock_move_reason", "date", day)
    if not d:
        return None, []
    rows = (
        db.table("telegram_stock_move_reason")
        .select("stock_code,reason,change_rate,close_price,quoted_change_rate,channel_count")
        .eq("date", d)
        .execute()
        .data
    )
    codes = [r["stock_code"] for r in rows]
    names = {}
    for chunk in _in_chunks(codes):
        names.update({r["code"]: r["name"] for r in db.table("stocks").select("code,name").in_("code", chunk).execute().data})
    for r in rows:
        r["name"] = names.get(r["stock_code"], r["stock_code"])
        # ⚠️ quoted_change_rate 는 후보 선정용이지 표시용이 아니다(migration_069 주석). 채널이
        #    "+30%" 라고 적은 게 그대로 종목 줄에 올라온 적이 있다(첫 시험). KRX 확정값만 쓴다.
        r["change"] = r["change_rate"]
    rows.sort(key=lambda r: -(float(r["change"]) if r["change"] is not None else -999))
    return d, rows


def load_us_reasons(db, day: date) -> tuple[str | None, list[dict]]:
    d = latest_date_leq(db, "telegram_us_stock_move_reason", "date", day)
    if not d:
        return None, []
    rows = (
        db.table("telegram_us_stock_move_reason")
        .select("ticker,reason,quoted_change_rate,channel_count")
        .eq("date", d)
        .execute()
        .data
    )
    tickers = [r["ticker"] for r in rows]
    names = {}
    for chunk in _in_chunks(tickers):
        names.update({r["ticker"]: r["name_ko"] for r in db.table("us_stocks").select("ticker,name_ko").in_("ticker", chunk).execute().data})
    for r in rows:
        r["name"] = names.get(r["ticker"], r["ticker"])
    rows.sort(key=lambda r: -(r.get("channel_count") or 0))
    return d, rows


def reason_lines(label: str, rows: list[dict], limit: int, with_change: bool) -> list[str]:
    """digest 에 넣는 까닭 줄. 까닭이 없는 종목은 뺀다(모델이 빈 자리를 지어 채운다)."""
    out = []
    for r in rows:
        if not (r.get("reason") or "").strip():
            continue
        chg = ""
        if with_change and r.get("change") is not None:
            chg = f" {float(r['change']):+.1f}%"
        out.append(f"- {r['name']}{chg} · {r['reason'].strip()}")
        if len(out) >= limit:
            break
    return [f"[{label}]"] + out if out else []


# 공시 알림 채널이 기계적으로 올리는 줄. 달력엔 남겨도 채널 글에는 안 싣는다 — 한 날짜를
# "추가상장(CB전환)" 여섯 줄이 차지했다(첫 시험 실측). 보호예수 해제·상장폐지는 뜻이 있어 둔다.
EVENT_NOISE = re.compile(r"추가상장|변경상장|주식매수선택권|전환청구|신주인수권|자기주식매매|CB ?전환|BW ?행사")


def load_events(db, lo: date, hi: date, market: str) -> list[dict]:
    """채널이 짚은 일정(일 단위만). (날짜, 종목, 일정) 별로 채널 수를 센다.

    같은 일정을 채널마다 조금씩 다르게 적어서(공시 알림 채널이 "추가상장·변경상장"을 열 건씩
    올린다) 종목+날짜로 먼저 묶고 가장 많이 적힌 문구를 대표로 삼는다. 둘 이상 채널이
    짚은 일정을 앞세운다.
    """
    table, key, names_table, name_col = (
        ("telegram_stock_event", "stock_code", "stocks", "name") if market == "KR"
        else ("telegram_us_stock_event", "ticker", "us_stocks", "name_ko")
    )
    rows = (
        db.table(table)
        .select(f"channel_handle,{key},event_date,event")
        .eq("date_precision", "day")
        .gte("event_date", lo.isoformat())
        .lte("event_date", hi.isoformat())
        .limit(1000)
        .execute()
        .data
    )
    if not rows:
        return []
    grouped: dict[tuple[str, str], dict] = {}
    for r in rows:
        if EVENT_NOISE.search(r["event"] or ""):
            continue
        g = grouped.setdefault((r["event_date"], r[key]), {"channels": set(), "events": defaultdict(int)})
        g["channels"].add(r["channel_handle"])
        g["events"][" ".join(r["event"].split())] += 1
    codes = sorted({k for _, k in grouped})
    names = {}
    for chunk in _in_chunks(codes):
        col = "code" if market == "KR" else "ticker"
        names.update({r[col]: r[name_col] for r in db.table(names_table).select(f"{col},{name_col}").in_(col, chunk).execute().data})
    out = []
    for (d, k), g in grouped.items():
        event = max(g["events"].items(), key=lambda kv: kv[1])[0]
        out.append({"date": d, "code": k, "name": names.get(k, k), "event": event, "channels": len(g["channels"])})
    out.sort(key=lambda x: (x["date"], -x["channels"], x["name"]))
    return out


def event_block(R: Render, title: str, events: list[dict], limit: int) -> list[str]:
    """📌 일정 블록. 둘 이상 채널이 짚은 것만 싣고, 하나도 없을 때만 한 채널짜리를 둘까지.

    한 채널짜리로 칸을 채우면 홈쇼핑 편성·단체행동 같은 줄이 올라온다(첫 시험 실측).
    빈 칸을 채우는 것보다 블록이 짧은 게 낫다.
    """
    strong = [e for e in events if e["channels"] >= 2]
    weak = [e for e in events if e["channels"] < 2]
    picked = strong[:limit] if strong else weak[:2]
    if not picked:
        return []
    lines = [f"<b>{R.date_label(e['date'])[:-3]}</b> {esc(e['name'])} · {esc(e['event'])}" for e in picked]
    return ["", f"📌 <b>{title}</b>", R.quote(*lines)]


def _reasons_for(db, codes: list[str], since: date) -> dict[str, str]:
    """종목별 가장 최근 까닭(since 이후). 이름만 있는 종목은 읽는 사람에게 아무것도 안 준다."""
    if not codes:
        return {}
    rows = (
        db.table("telegram_stock_move_reason")
        .select("stock_code,reason,date")
        .in_("stock_code", codes)
        .gte("date", since.isoformat())
        .order("date", desc=True)
        .limit(500)
        .execute()
        .data
    )
    out: dict[str, str] = {}
    for r in rows:
        if r["stock_code"] not in out and (r.get("reason") or "").strip():
            out[r["stock_code"]] = r["reason"].strip()
    return out


def load_new_faces(db, base_date: date) -> list[dict]:
    """처음 회자되기 시작한 종목 — 급부상 계산에서 is_new(직전 창에 언급 0)인 것.

    특징주 정리 채널이 못 하는 유일한 것이 이것이다(320개 채널을 합산해야 보이는 초기 신호).
    유령 종목이 여기로 올라오기 쉬워(종목 추출 오탐) 채널 둘 이상만 싣는다.
    한 줄 요약은 급부상 카드용 문장(telegram_surging_oneliner)을 그대로 읽는다.
    """
    rows, dates = load_stock_daily(db, base_date.isoformat())
    if not dates:
        return []
    try:
        top = top_surging(db, 10, preloaded=(rows, dates))
    except Exception as e:  # noqa: BLE001 — 채널 폭 조회가 statement timeout 으로 죽는 날이 있다(로컬 실측)
        print(f"[안내] 급부상 계산 실패({type(e).__name__}). '처음 회자된 종목' 블록을 뺍니다.")
        return []
    new = [s for s in top if s.get("is_new") and s.get("channels", 0) >= 2][:NEW_FACES]
    if not new:
        return []
    codes = [s["code"] for s in new]
    names = {r["code"]: r["name"] for r in db.table("stocks").select("code,name").in_("code", codes).execute().data}
    latest = db.table("telegram_surging_oneliner").select("date").order("date", desc=True).limit(1).execute().data
    lines: dict[str, str] = {}
    if latest:
        lines = {
            r["stock_code"]: r["oneliner"]
            for r in db.table("telegram_surging_oneliner").select("stock_code,oneliner").eq("date", latest[0]["date"]).in_("stock_code", codes).execute().data
        }
    reasons = _reasons_for(db, codes, base_date - timedelta(days=3))
    for s in new:
        s["name"] = names.get(s["code"], s["code"])
        s["oneliner"] = bc.safe_narrative(s["name"], reasons.get(s["code"]) or lines.get(s["code"], ""))
    return new


def load_week_new_faces(db, monday: date, until: date) -> list[dict]:
    """이번 주에 처음 언급되기 시작한 종목(14일 창 안에서 첫 언급일이 월요일 이후)."""
    rows, dates = load_stock_daily(db, (until + timedelta(days=1)).isoformat())
    if not rows:
        return []
    first: dict[str, str] = {}
    total: dict[str, int] = defaultdict(int)
    for r in rows:
        c = r["stock_code"]
        first[c] = min(first.get(c, r["date"]), r["date"])
        total[c] += r.get("mention_count") or 0
    cands = [c for c in first if first[c] >= monday.isoformat() and total[c] >= 10]
    cands.sort(key=lambda c: -total[c])
    cands = cands[:NEW_FACES]
    if not cands:
        return []
    names = {r["code"]: r["name"] for r in db.table("stocks").select("code,name").in_("code", cands).execute().data}
    latest = db.table("telegram_surging_oneliner").select("date").order("date", desc=True).limit(1).execute().data
    lines: dict[str, str] = {}
    if latest:
        lines = {
            r["stock_code"]: r["oneliner"]
            for r in db.table("telegram_surging_oneliner").select("stock_code,oneliner").eq("date", latest[0]["date"]).in_("stock_code", cands).execute().data
        }
    reasons = _reasons_for(db, cands, monday)
    return [
        {
            "code": c,
            "name": names.get(c, c),
            "oneliner": bc.safe_narrative(names.get(c, c), reasons.get(c) or lines.get(c, "")),
            "first": first[c],
        }
        for c in cands
    ]


def new_faces_block(R: Render, title: str, faces: list[dict]) -> list[str]:
    if not faces:
        return []
    # 종목 이름은 굵게(2026-09-10). 일정 줄의 날짜와 같은 규칙 — 줄 머리의 식별자를 굵게 세운다.
    lines = [f"<b>{esc(f['name'])}</b>" + (f" · {esc(f['oneliner'])}" if f.get("oneliner") else "") for f in faces]
    return ["", f"🆕 <b>{title}</b>", R.quote(*lines)]


def load_scores(db, n: int, until: date | None = None) -> list[dict]:
    """최근 n 개(오름차순). until 을 주면 그날까지의 n 개 — 지난 주를 만들 때 이번 주 값이 섞이지 않게."""
    q = db.table("daily_score").select("date,score")
    if until:
        q = q.lte("date", until.isoformat())
    rows = q.order("date", desc=True).limit(n).execute().data
    return list(reversed(rows))


def score_line(R: Render, rows: list[dict], weekly: bool) -> str:
    if not rows:
        return ""
    last = float(rows[-1]["score"])
    stage = R.stage_for_score(last)
    if weekly and len(rows) >= 2:
        first = float(rows[0]["score"])
        return f"🌡️ 이번 주 햇쩨 지수 {R.js_round(first)}→{R.js_round(last)}℃ · {stage}"
    return f"🌡️ 햇쩨 지수 {R.js_round(last)}℃ · {stage}"


# ─── 재료: 등락(표에 없으면 야후) ─────────────────────────────────────────────


def _kr_market_open(now: datetime) -> bool:
    return now.weekday() < 5 and dtime(9, 0) <= now.time() < yahoo_client.MARKET_CLOSE_KST


def _yahoo_closes(symbol: str, tz) -> list[tuple[date, float]]:
    """최근 한 달 (거래일, 종가). 거래일은 그 시장의 시간대로 센다(미국은 뉴욕)."""
    result = yahoo_client._get(symbol, {"interval": "1d", "range": "1mo"})
    if not result:
        return []
    try:
        stamps = result["timestamp"]
        closes = result["indicators"]["quote"][0]["close"]
    except (KeyError, IndexError, TypeError):
        return []
    out = []
    for ts, c in zip(stamps, closes):
        if isinstance(c, (int, float)) and c > 0:
            out.append((datetime.fromtimestamp(int(ts), tz).date(), float(c)))
    return out


def _session_change(closes: list[tuple[date, float]], day: date) -> float | None:
    """그 거래일의 등락률(직전 거래일 종가 대비). 그날 종가가 없으면 None."""
    for i, (d, c) in enumerate(closes):
        if d == day and i > 0:
            return (c / closes[i - 1][1] - 1) * 100
    return None


def _range_change(closes: list[tuple[date, float]], start: date, end: date) -> float | None:
    """구간 등락률 — start 직전 종가 대비 end 까지의 마지막 종가."""
    before = [c for d, c in closes if d < start]
    upto = [c for d, c in closes if start <= d <= end]
    if not before or not upto:
        return None
    return (upto[-1] / before[-1] - 1) * 100


# 등락의 기간. ("session", 날짜) 는 그 거래일 하루, ("range", 시작, 끝) 은 구간이다.
# **글이 말하는 기간과 숫자의 기간이 같아야 한다** — 금요일 이야기 옆에 화요일 등락이
# 붙은 적이 있다(첫 시험). 부르는 쪽(빌더)이 창에 맞춰 넘긴다.
Period = tuple


def _change_for(closes: list[tuple[date, float]], period: Period) -> float | None:
    if period[0] == "session":
        return _session_change(closes, period[1])
    return _range_change(closes, period[1], period[2])


def kr_changes(db, codes: list[str], period: Period | None, reasons: list[dict], now: datetime) -> dict[str, float]:
    """국내 종목 등락. 세션 하루면 까닭 표의 KRX 확정값을 먼저 쓰고, 없으면 야후.

    장중이면 야후를 안 부른다 — 오늘 종가가 아니라서 '오늘 등락'과 뜻이 다르다.
    """
    out: dict[str, float] = {}
    if not period or not codes:
        return out
    need: list[str] = []
    if period[0] == "session":
        by_code = {r["stock_code"]: r for r in reasons}
        for c in codes:
            r = by_code.get(c)
            if r and r.get("change") is not None:
                out[c] = float(r["change"])
            else:
                need.append(c)
    else:
        need = list(codes)
    if not need:
        return out
    end = period[1] if period[0] == "session" else period[2]
    if end >= now.date() and _kr_market_open(now):
        return out
    markets = {r["code"]: r["market"] for r in db.table("stocks").select("code,market").in_("code", need).execute().data}
    for c in need:
        suffix = {"KOSPI": ".KS", "KOSDAQ": ".KQ"}.get(markets.get(c) or "")
        if not suffix:
            continue
        chg = _change_for(_yahoo_closes(f"{c}{suffix}", KST), period)
        if chg is not None:
            out[c] = chg
    return out


def us_changes(tickers: list[str], period: Period | None) -> dict[str, float]:
    out: dict[str, float] = {}
    if not period:
        return out
    for t in tickers:
        chg = _change_for(_yahoo_closes(t, NY), period)
        if chg is not None:
            out[t] = chg
    return out


# ─── LLM: 갈래 만들기 ─────────────────────────────────────────────────────────

# 출력 형식. 코드가 이 형식만 읽으므로 모델이 다른 모양으로 쓰면 그 갈래는 버려진다.
# 근거 줄을 요구하는 이유는 하나다 — 서로 다른 채널 둘 이상이 다룬 이야기만 갈래로
# 세운다는 규칙을 코드가 검사하려면 어느 발췌에서 왔는지 알아야 한다.
DIGEST_FORMAT = """\
[출력 형식 — 반드시 이 모양으로]
갈래마다 아래 네 줄 묶음으로 씁니다. 묶음 사이는 빈 줄 하나. 다른 말은 쓰지 마세요.

## 갈래 제목
문장 두세 개. 무슨 이야기가 어떻게 돌았고, 어떤 종목이 왜 엮였는지.
종목: 자료에 적힌 종목 이름을 쉼표로, 그 갈래와 가장 관련 깊은 순으로 넷까지. 없으면 '없음'
근거: 이 갈래의 바탕이 된 발췌 번호를 쉼표로(둘 이상. 서로 다른 채널이어야 합니다)

- **본문은 갈래마다 세 문장까지, 글 전체는 900자 안에.** 넘치면 코드가 잘라 버리므로 길게 써도 실리지 않습니다.
- 제목은 **명사구** 20자 안팎(예: "반도체 장비 수주 확대"). 문장이 아니므로 마침표를 찍지 마세요.
  종목 이름이 들어가도 됩니다. 번호를 매기지 마세요.
- 근거는 되도록 발췌 번호 둘 이상을 적으세요. 하나뿐이면 그 이야기는 갈래가 못 됩니다.
- 한 채널만 떠든 이야기는 갈래로 세우지 마세요. 여러 발췌에 공통으로 나오는 이야기를 고르세요.
- 발췌를 베끼지 말고 무엇이 오갔는지로 옮기세요. 링크·홍보 문구·가격 알림은 무시하세요.
- 등락률·조회 수 같은 숫자는 화면이 따로 찍으니 문장에 넣지 마세요.
- [종목별 까닭] 자료의 종목이 어느 갈래에 속하면 그 까닭을 그 갈래의 문장에 녹이세요.
- 대괄호 라벨([갈래] 같은 것)은 출력하지 마세요."""

TASKS = {
    "morning2": """\
[이번 글 — 밤사이 채널 요약]
어젯밤 18시부터 오늘 아침 8시까지 채널에 오간 이야기를 {n} 갈래로 정리합니다. 개장 전에
읽는 글입니다. 미국 시장이 열려 있던 시간이라 미국 종목·지표 이야기가 많습니다. 그
이야기에 국내 종목이 엮여 있으면(공급사·같은 업종) 종목 줄에 함께 적으세요.""",
    "evening2": """\
[이번 글 — 오늘 채널 요약]
오늘 장중부터 마감 뒤까지 채널이 붙잡은 이야기를 {n} 갈래로 정리합니다. 마감 뒤에 읽는
글입니다. [종목별 까닭] 자료의 종목이 든 갈래는 그 종목이 왜 움직였는지가 문장에 있어야
합니다. 오늘 처음 나온 이야기와 며칠째 이어지는 이야기를 구별해 적으세요.""",
    "midweek": """\
[이번 글 — 주중 요약]
이번 주 월요일부터 오늘까지 채널의 이야기가 어떻게 옮겨갔는지를 {n} 갈래로 정리합니다.
첫 갈래는 오늘 가장 큰 이야기, 마지막 갈래는 주초엔 컸는데 식은 이야기입니다. 날짜는
요일로 부르세요("월요일엔", "오늘은"). 커진 이야기와 식은 이야기가 무엇 때문인지 적으세요.""",
    "us_week": """\
[이번 글 — 이번 주 미국장 흐름]
이번 주 월요일부터 금요일 세션(토요일 아침 마감)까지 채널이 미국 종목을 두고 한 이야기를 {n}
갈래로 정리합니다. [금요일 밤 발췌]는 가장 최근 세션이라 비중을 크게 두되, 주초와 주말이
어떻게 달랐고 무엇이 계기였는지를 적으세요. 미국 종목이 중심이고, 엮인 국내 종목이 있으면
종목 줄에 함께 적으세요.""",
    "weekly2": """\
[이번 글 — 한 주 요약]
월요일부터 금요일까지 한 주 동안 채널의 이야기를 {n} 갈래로 정리합니다. 갈래마다 그
이야기가 언제 시작해 어떻게 커지거나 식었는지, 계기가 무엇이었는지를 적으세요. 날짜는
요일로 부르세요. [지난 요약] 자료가 있으면 그 갈래 이름을 그대로 이어 쓰세요.""",
}


def _split_blocks(text: str) -> list[str]:
    """갈래 묶음 나누기. 1순위 '## ' 제목, 그게 없으면 '근거:' 줄이 끝나는 자리.

    모델이 '## ' 를 빼고 쓴 날(2026-09-10 일요일 글) 전체가 한 덩어리로 읽혀 갈래 하나만
    남았다. 근거 줄은 묶음마다 하나씩 있으니 그 줄을 경계로도 가른다.
    """
    text = _ZW.sub("", text).strip()
    blocks = [b for b in re.split(r"^\s*##\s*", text, flags=re.M) if b.strip()]
    if len(blocks) >= 2:
        return blocks
    if text.count("근거:") >= 2:
        out, cur = [], []
        for line in text.split("\n"):
            cur.append(line)
            if line.strip().startswith("근거:"):
                out.append("\n".join(cur))
                cur = []
        if cur and "".join(cur).strip():
            out.append("\n".join(cur))
        return out
    return blocks


def _parse_sections(text: str) -> list[Section]:
    blocks = _split_blocks(text)
    out: list[Section] = []
    for b in blocks:
        b = b.strip()
        if not b:
            continue
        lines = [l.strip() for l in b.split("\n") if l.strip()]
        if not lines:
            continue
        # 제목 줄의 장식(굵게 표시·번호·대괄호 라벨)을 걷는다 — '## ' 없이 쓴 날은 '**제목**' 이 온다.
        title = re.sub(r"^\[.*?\]\s*", "", lines[0]).strip("# ").strip()
        title = re.sub(r"^\*\*(.*?)\*\*$", r"\1", title).strip()
        title = re.sub(r"^\d+[.)]\s*", "", title).strip()
        body_lines, stocks, evidence = [], "", ""
        for l in lines[1:]:
            if l.startswith("종목:"):
                stocks = l[3:].strip()
            elif l.startswith("근거:"):
                evidence = l[3:].strip()
            elif not re.fullmatch(r"\[[^\]]*\]", l):
                body_lines.append(l)
        # 제목 자리에 문장을 쓴 날(예: "AI 반도체 수급 불균형이 화제의 중심입니다."). 처음엔 그 줄을
        # 본문으로 내리고 제목 없이 냈는데, 네 갈래가 전부 그러면 제목 없는 문단 넷이 되어 경계가
        # 사라졌다(09-10 일요일 글). 지금은 **문장을 마침표만 떼고 제목으로 세우고**, 문장 제목이
        # 하나라도 있으면 compose_sections 가 한 번 더 만들어 명사구 제목 쪽을 고른다.
        sentence = title.endswith(("다.", "다", "요.")) or len(title) > 44
        if sentence:
            title = title.rstrip(". ")
        body = " ".join(body_lines).strip()
        if sentence and not body:
            body, title = title + ".", ""
        names = [] if stocks in ("", "없음") else [s.strip(" .") for s in re.split(r"[,、·]", stocks) if s.strip(" .")]
        nums = [int(x) for x in re.findall(r"\d+", evidence)]
        out.append(Section(title=title, body=body, kr=names, us=[], evidence=nums, sentence_title=sentence))
    return out


def _trim_body(body: str) -> str:
    sentences = [s for s in re.split(r"(?<=다\.)\s+", body) if s]
    kept = [s for s in sentences if s.rstrip().endswith(("다.", "다!", "다?"))]
    return " ".join(kept[:BODY_MAX_SENTENCES]).strip()


# 출력 상한. 첫 비용 측정(2026-09-10)에서 1,400 이 매번 꽉 찼다 — 모델이 갈래마다 문장을 다섯씩 쓰고
# 마지막 갈래가 잘려 버려졌다. 프롬프트에 길이 규칙을 적고 상한은 여유 있게 둔다(잘리면 갈래 하나를 잃는다).
SECTION_MAX_TOKENS = 3000   # 2,200 도 저녁 글에서 한 번 꽉 찼다(09-10). 안 쓰면 비용이 없다


def compose_sections(client, model: str, fmt: str, digest: str, mat: Material, max_tokens: int = SECTION_MAX_TOKENS) -> list[Section]:
    """갈래 묶음. **실패하면 빈 목록(fail-soft).** 부르는 쪽이 갈래 없이 나머지를 조립한다.

    검사 넷을 갈래마다 건다: 본문이 '다.'로 끝나는 문장으로만(잘림 방지) · 금지어 · 오타 ·
    근거 발췌의 채널이 둘 이상. 종목 이름은 자료의 이름표로만 푼다.
    """
    if client is None:
        return []
    task = TASKS[fmt].format(n=SECTIONS.get(fmt, "세네"))
    try:
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=bc._LLM_RULES + "\n\n" + DIGEST_FORMAT + "\n\n" + task,
            messages=[{"role": "user", "content": digest}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 갈래만 포기한다
        print(f"[LLM] 갈래 생성 실패({type(e).__name__}). 갈래 없이 조립합니다.")
        return []
    if not text:
        return []

    lo_n, hi_n = SECTION_RANGE.get(fmt, (3, MAX_SECTIONS))
    out = _validate_sections(text, fmt, digest, mat, hi_n)

    def score(secs: list[Section]) -> tuple[int, int]:
        # 명사구 제목이 많은 쪽, 그다음 갈래가 많은 쪽
        return (sum(1 for x in secs if x.title and not x.sentence_title), len(secs))

    for attempt in range(RETRIES_WHEN_SHORT):
        short = len(out) < lo_n
        bad_titles = any(x.sentence_title or not x.title for x in out)
        if not short and not bad_titles:
            break
        why = f"갈래가 {len(out)}개뿐이라(최소 {lo_n})" if short else "제목 자리에 문장을 써서"
        print(f"[LLM] {why} 한 번 더 만듭니다. 원문 머리: {text[:80]!r}")
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=bc._LLM_RULES + "\n\n" + DIGEST_FORMAT + "\n\n" + task,
                messages=[{"role": "user", "content": digest}],
            )
            text2 = "".join(b.text for b in resp.content if b.type == "text").strip()
        except Exception as e:  # noqa: BLE001
            print(f"[LLM] 다시 만들기 실패({type(e).__name__}).")
            break
        again = _validate_sections(text2, fmt, digest, mat, hi_n)
        if score(again) > score(out):
            out = again
    return out


def _validate_sections(text: str, fmt: str, digest: str, mat: Material, hi_n: int) -> list[Section]:
    """모델 출력 하나를 갈래 목록으로. 검사 넷(잘림·금지어·오타·근거 채널)을 갈래마다 건다."""
    by_n = {e.n: e for e in mat.excerpts}
    name_kr, name_us = mat.name_to_kr(), mat.name_to_us()
    out: list[Section] = []
    parsed = _parse_sections(text)
    any_evidence = any(s.evidence for s in parsed)
    for s in parsed:
        body = _trim_body(s.body)
        if not body:
            print(f"[LLM] 본문이 비어 갈래를 뺍니다: {s.title[:20]}")
            continue
        if not s.title:
            print(f"[안내] 제목이 문장이라 본문으로 내립니다: {body[:24]}…")
        hits = bc.banned_hits(body)
        if hits:
            print(f"[LLM] 금지어가 섞여 갈래를 뺍니다({' · '.join(hits)}): {s.title}")
            continue
        found = problems(body, digest)
        if found:
            print(f"[LLM] 문제가 있어 갈래를 뺍니다({' · '.join(found)}): {s.title}")
            continue
        kr, us = [], []
        for name in s.kr:
            key = re.sub(r"\(.*?\)", "", name).strip()
            if key in name_kr:
                kr.append(name_kr[key])
            elif key in name_us:
                us.append(name_us[key])
            else:
                m = re.search(r"\(([A-Z.\-]{1,6})\)", name)
                if m and m.group(1) in name_us:
                    us.append(name_us[m.group(1)])
                else:
                    print(f"[안내] 자료에 없는 종목 이름이라 뺍니다: {name}")
        s.kr, s.us, s.body = list(dict.fromkeys(kr)), list(dict.fromkeys(us)), body
        # 채널 수 검사. 근거로 적힌 발췌(복붙 묶음의 채널 포함)에, 이 갈래의 종목을 다룬 발췌의
        # 채널을 더한다 — 모델이 번호를 하나만 적어도 그 종목을 여러 채널이 말했으면 통과한다.
        # 종목이 없는 갈래(매크로)는 근거 번호로만 판정한다.
        cited = [by_n[n] for n in s.evidence if n in by_n]
        channels = set().union(*(e.channels for e in cited)) if cited else set()
        if s.kr or s.us:
            for e in mat.excerpts:
                if set(e.kr) & set(s.kr) or set(e.us) & set(s.us):
                    channels |= e.channels
        if any_evidence and len(channels) < MIN_EVIDENCE_CHANNELS:
            print(f"[LLM] 근거 채널이 {len(channels)}곳뿐이라 갈래를 뺍니다: {s.title or body[:20]}")
            continue
        out.append(s)
        if len(out) >= hi_n:
            break
    if not any_evidence and parsed:
        print("[경고] 모델이 근거 줄을 안 적어 채널 수 검사를 건너뛰었습니다.")
    return out


# ─── 조립 ─────────────────────────────────────────────────────────────────────


def stock_link(code: str, market: str, label: str) -> str:
    if not STOCK_LINKS or market != "KR":
        return esc(label)
    return f'<a href="{SITE_URL}/stock/{code}">{esc(label)}</a>'


def stock_line(s: Section, kr_names: dict, us_names: dict, chg_kr: dict, chg_us: dict) -> str:
    """종목 줄. 국내 먼저, 그다음 미국. 합쳐서 STOCKS_PER_SECTION 개까지."""
    parts = []
    for c in s.kr:
        label = kr_names.get(c, c)
        if c in chg_kr:
            label += f" {chg_kr[c]:+.1f}%"
        parts.append(stock_link(c, "KR", label))
    for t in s.us:
        label = us_names.get(t, t)
        if t in chg_us:
            label += f" {chg_us[t]:+.1f}%"
        parts.append(esc(label))
    return " · ".join(parts[:STOCKS_PER_SECTION])


def render_sections(R: Render, sections: list[Section], mat: Material, chg_kr: dict, chg_us: dict) -> list[str]:
    lines: list[str] = []
    for s in sections:
        lines += ["", f"{SECTION_MARK} <b>{esc(s.title)}</b>"] if s.title else [""]
        lines += R.paragraphs(s.body)
        sl = stock_line(s, mat.kr_names, mat.us_names, chg_kr, chg_us)
        if sl:
            lines.append(R.quote(sl))
    return lines


def _fit(lines: list[str], optional_blocks: list[list[str]], cta: str) -> str:
    """4096자 상한. 넘치면 선택 블록을 뒤에서부터 뺀다(갈래는 안 뺀다)."""
    def join(blocks):
        return "\n".join(lines + [l for b in blocks for l in b] + ["", cta])

    blocks = list(optional_blocks)
    while len(join(blocks)) > MESSAGE_SOFT_LIMIT and blocks:
        dropped = blocks.pop()
        label = next((l for l in dropped if l.strip()), "")
        print(f"[안내] 글이 길어 블록을 뺍니다: {re.sub(r'<[^>]+>', '', label)[:24]}")
    return join(blocks)


def _changes_for(
    db, sections: list[Section], reasons: list[dict], now: datetime,
    kr_period: Period | None, us_period: Period | None,
) -> tuple[dict, dict]:
    kr_codes = list(dict.fromkeys(c for s in sections for c in s.kr))
    us_tickers = list(dict.fromkeys(t for s in sections for t in s.us))
    return kr_changes(db, kr_codes, kr_period, reasons, now), us_changes(us_tickers, us_period)


def store_digest(db, day: date, slot: str, sections: list[Section], model: str) -> None:
    """갈래를 표에 남긴다(migration_070). 표가 없으면 조용히 건너뛴다."""
    if not sections:
        return
    payload = [{"title": s.title, "body": s.body, "kr": s.kr, "us": s.us} for s in sections]
    try:
        db.table("telegram_daily_digest").upsert(
            {"date": day.isoformat(), "slot": slot, "sections": payload, "model": model},
            on_conflict="date,slot",
        ).execute()
        print(f"[저장] telegram_daily_digest {day} {slot} · 갈래 {len(sections)}개")
    except Exception as e:  # noqa: BLE001 — 표가 없거나 권한이 없으면 저장만 건너뛴다
        print(f"[안내] 갈래를 저장하지 못했습니다({type(e).__name__}). 표(migration_070)가 있는지 보세요.")


def stored_digest_lines(db, days: list[date], R: Render) -> list[str]:
    """지난 아침·저녁 글의 갈래 제목(있으면). 수·일 글의 [지난 요약] 재료."""
    try:
        rows = (
            db.table("telegram_daily_digest")
            .select("date,slot,sections")
            .in_("date", [d.isoformat() for d in days])
            # ⚠️ **아침·저녁만 읽는다.** 수·일 글도 같은 표에 자기 갈래를 남기는데(store_digest),
            #    슬롯을 안 가르면 수요일 글이 쓴 행이 그다음 일요일 재료에 섞여 같은 날이 두 번
            #    들어가고 라벨도 '저녁'으로 잘못 붙는다.
            .in_("slot", ["morning", "evening"])
            .order("date")
            .execute()
            .data
        )
    except Exception as e:  # noqa: BLE001 — 표가 없어도 글은 나가야 한다(머리말)
        # ⚠️ 조용히 넘기지 않는다. 이 자리가 비면 수·일 글이 '지난 요약' 없이 만들어지는데,
        #    글은 멀쩡해 보여서 표가 없다는 걸 알 길이 없다.
        print(f"[안내] 지난 갈래를 못 읽었습니다({type(e).__name__}). '지난 요약' 없이 만듭니다.")
        return []
    out = []
    for r in rows:
        secs = r["sections"] if isinstance(r["sections"], list) else json.loads(r["sections"])
        slot = "아침" if r["slot"] == "morning" else "저녁"
        titles = " / ".join(s.get("title", "") for s in secs if s.get("title"))
        if titles:
            out.append(f"- {R.date_label(r['date'])} {slot}: {titles}")
    return ["[지난 요약] 그날 글이 세운 갈래 제목입니다. 같은 이야기는 같은 이름으로 부르세요."] + out if out else []


# ─── 다섯 빌더 ────────────────────────────────────────────────────────────────


def build_morning2(db, llm, model: str, R: Render, as_of: date, now: datetime, store: bool) -> str:
    mat = load_material_with_fallback(db, lambda back: night_window(as_of - timedelta(days=back)), EXCERPTS_DAY)
    if not mat.excerpts:
        print("[skip] 밤사이 메시지가 없어 아침 글을 만들 수 없습니다.")
        return ""
    lo, hi = mat.window
    us_d, us_reasons = load_us_reasons(db, hi.date())
    events = load_events(db, hi.date(), hi.date(), "KR")

    digest = "\n".join(
        [f"[창] {span_label(lo, hi)} (KST)"]
        + excerpt_lines(mat, "밤사이 발췌")
        + [""]
        + (reason_lines("종목별 까닭 · 미국 종목", us_reasons, 8, with_change=False) if us_d == hi.date().isoformat() else [])
    )
    sections = compose_sections(llm, model, "morning2", digest, mat)
    # 국내 등락은 어제 종가라 개장 전 글에선 낡은 값이다. 미국 종목만 간밤 세션(뉴욕 날짜 =
    # 창이 끝난 날의 전날) 등락을 단다.
    chg_kr, chg_us = _changes_for(db, sections, [], now, None, ("session", hi.date() - timedelta(days=1)))

    lines = [
        "🌅 <b>개장 전 요약</b>",
        f"{R.date_label(hi.date().isoformat())} 개장 전 · {span_label(lo, hi, drop_month=hi.month)}",
    ]
    if len(sections) < MIN_SECTIONS_TO_SEND:
        print(f"[skip] 갈래가 {len(sections)}개뿐이라(최소 {MIN_SECTIONS_TO_SEND}) 아침 글을 만들지 않습니다.")
        return ""
    lines += render_sections(R, sections, mat, chg_kr, chg_us)
    optional = [b for b in [event_block(R, "오늘 일정", events, EVENT_LINES_DAY)] if b]
    if store:
        store_digest(db, hi.date(), "morning", sections, model)
    return _fit(lines, optional, R.cta_link(*CTA["morning2"]))


def build_evening2(db, llm, model: str, R: Render, as_of: date, now: datetime, store: bool) -> str:
    mat = load_material_with_fallback(db, lambda back: day_window(as_of - timedelta(days=back), now), EXCERPTS_DAY)
    if not mat.excerpts:
        print("[skip] 오늘 메시지가 없어 저녁 글을 만들 수 없습니다.")
        return ""
    lo, hi = mat.window
    day = lo.date()
    kr_d, kr_reasons = load_kr_reasons(db, day)
    faces = load_new_faces(db, day + timedelta(days=1))
    events = load_events(db, day + timedelta(days=1), day + timedelta(days=1), "KR")
    scores = load_scores(db, 1)

    digest = "\n".join(
        [f"[창] {span_label(lo, hi)} (KST)"]
        + excerpt_lines(mat, "오늘 발췌")
        + [""]
        + (reason_lines("종목별 까닭 · 오늘 움직인 종목", kr_reasons, 10, with_change=True) if kr_d == day.isoformat() else [])
    )
    sections = compose_sections(llm, model, "evening2", digest, mat)
    if len(sections) < MIN_SECTIONS_TO_SEND:
        print(f"[skip] 갈래가 {len(sections)}개뿐이라(최소 {MIN_SECTIONS_TO_SEND}) 저녁 글을 만들지 않습니다.")
        return ""
    chg_kr, chg_us = _changes_for(
        db, sections, kr_reasons if kr_d == day.isoformat() else [], now,
        ("session", day), ("session", day - timedelta(days=1)),
    )

    lines = ["🌆 <b>저녁 브리핑</b>", f"{R.date_label(day.isoformat())} 마감 기준"]
    if scores:
        lines += ["", score_line(R, scores, weekly=False)]   # 온도는 날짜 줄과 한 칸 띄고(2026-09-10)
    lines += render_sections(R, sections, mat, chg_kr, chg_us)
    optional = [
        b for b in [
            new_faces_block(R, "오늘 처음 회자된 종목", faces),
            event_block(R, "내일 일정", events, EVENT_LINES_DAY),
        ] if b
    ]
    if store:
        store_digest(db, day, "evening", sections, model)
    return _fit(lines, optional, R.cta_link(*CTA["evening2"]))


def build_midweek(db, llm, model: str, R: Render, as_of: date, now: datetime, store: bool) -> str:
    monday = monday_of(as_of)
    lo, hi = at(monday, NIGHT_TO_HOUR), min(at(as_of, 14), now)
    mat = load_material(db, lo, hi, EXCERPTS_MULTI, multi=True)
    if not mat.excerpts:
        print("[skip] 이번 주 메시지가 없어 주중 글을 만들 수 없습니다.")
        return ""
    kr_d, kr_reasons = load_kr_reasons(db, as_of)
    faces = load_week_new_faces(db, monday, as_of)
    events = load_events(db, as_of + timedelta(days=1), monday + timedelta(days=6), "KR")
    past = stored_digest_lines(db, [monday + timedelta(days=i) for i in range((as_of - monday).days + 1)], R)

    digest = "\n".join(
        [f"[창] {span_label(lo, hi)} (KST) · {R.date_label(monday.isoformat())} 부터 {R.date_label(as_of.isoformat())} 까지"]
        + past
        + [""]
        + excerpt_lines(mat, "이번 주 발췌")
        + [""]
        + (reason_lines("종목별 까닭 · 최근 움직인 종목", kr_reasons, 8, with_change=True) if kr_reasons else [])
    )
    sections = compose_sections(llm, model, "midweek", digest, mat)
    if len(sections) < MIN_SECTIONS_TO_SEND:
        print(f"[skip] 갈래가 {len(sections)}개뿐이라(최소 {MIN_SECTIONS_TO_SEND}) 주중 글을 만들지 않습니다.")
        return ""
    # 주초부터의 구간 등락(지난 금요일 종가 대비). 미국은 완료된 세션까지(as_of 전날).
    chg_kr, chg_us = _changes_for(db, sections, [], now, ("range", monday, as_of), ("range", monday, as_of - timedelta(days=1)))

    lines = ["🔄 <b>주중 점검</b>", f"{R.date_label(monday.isoformat())} ~ {R.date_label(as_of.isoformat())}"]
    lines += render_sections(R, sections, mat, chg_kr, chg_us)
    optional = [
        b for b in [
            new_faces_block(R, "이번 주 새로 회자된 종목", faces),
            event_block(R, "남은 주 일정", events, EVENT_LINES_DAY),
        ] if b
    ]
    if store:
        store_digest(db, as_of, "midweek", sections, model)
    return _fit(lines, optional, R.cta_link(*CTA["midweek"]))


def build_us_weekend(db, llm, model: str, R: Render, as_of: date, now: datetime, store: bool) -> str:
    """토요일 · 이번 주 미장 흐름 — 금요일 세션까지 한 주를 한 번에.

    처음엔 '금요일 밤' 과 '이번 주 흐름' 두 부분이었는데 하나로 합쳤다(2026-09-10).
    자료는 그대로 둘이다 — 금요일 밤 발췌(가장 최근 세션)와 한 주의 미국 종목 발췌 — 번호를
    이어 붙여 한 번에 넘기고, 프롬프트가 금요일 비중을 크게 두라고 말한다.
    """
    fri = last_friday_before(as_of)
    sat = fri + timedelta(days=1)
    monday = fri - timedelta(days=4)
    night = load_material(db, at(fri, NIGHT_FROM_HOUR), at(sat, NIGHT_TO_HOUR), 40)
    week = load_material(db, at(monday, NIGHT_TO_HOUR), at(fri, NIGHT_FROM_HOUR), 50, multi=True, us_only=True)
    if not night.excerpts and not week.excerpts:
        print("[skip] 이번 주 미국장 메시지가 없어 미장 글을 만들 수 없습니다.")
        return ""

    # 두 묶음을 하나로. 번호를 이어 붙여야 근거 표기가 한 체계가 된다.
    for i, e in enumerate(night.excerpts + week.excerpts):
        e.n = i + 1
    mat = Material(
        night.excerpts + week.excerpts,
        {**week.kr_names, **night.kr_names},
        {**week.us_names, **night.us_names},
        (at(monday, NIGHT_TO_HOUR), at(sat, NIGHT_TO_HOUR)),
        night.total + week.total,
    )
    us_d, us_reasons = load_us_reasons(db, sat)
    us_fresh = us_d == sat.isoformat()   # 토요일 행 = 금요일 세션. 저녁에만 만들면 없을 수 있다(머리말)
    digest = "\n".join(
        [f"[창] {span_label(*mat.window)} (KST) · 이번 주 미국장"]
        + excerpt_lines(mat, "금요일 밤 발췌", night.excerpts)
        + [""]
        + excerpt_lines(mat, "이번 주 미국 종목 발췌", week.excerpts)
        + [""]
        + (reason_lines("종목별 까닭 · 미국 종목", us_reasons, 8, with_change=False) if us_fresh else [])
    )
    sections = compose_sections(llm, model, "us_week", digest, mat)
    if len(sections) < MIN_SECTIONS_TO_SEND:
        print(f"[skip] 갈래가 {len(sections)}개뿐이라(최소 {MIN_SECTIONS_TO_SEND}) 미장 글을 만들지 않습니다.")
        return ""
    events = load_events(db, sat + timedelta(days=2), sat + timedelta(days=8), "US")
    # 한 주 구간 등락(지난 금요일 종가 대비 이번 금요일 종가). 미국은 뉴욕 날짜로 월~금.
    chg_kr, chg_us = _changes_for(db, sections, [], now, ("range", monday, fri), ("range", monday, fri))

    # 기간은 **재료의 한국 날짜**로 적는다. 미국 금요일 장은 한국 토요일 새벽에 끝나므로
    # 미국 날짜(월~금)로 적으면 읽는 사람이 "간밤 장은 빠졌나" 싶다(2026-09-10 지적).
    # 창도 실제로 월요일 08시 ~ 토요일 08시(KST)라 이쪽이 재료와 맞는다.
    # ⚠️ 뒤에 '미국장' 을 붙이지 않는다 — 붙이면 토요일에도 장이 선 것처럼 읽힌다.
    lines = ["📈 <b>이번 주 미장 흐름</b>", f"{R.date_label(monday.isoformat())} ~ {R.date_label(sat.isoformat())}"]
    lines += render_sections(R, sections, mat, chg_kr, chg_us)
    optional = [b for b in [event_block(R, "다음 주 미장 일정", events, EVENT_LINES_WEEK)] if b]
    if store:
        store_digest(db, sat, "us_weekend", sections, model)
    return _fit(lines, optional, R.cta_link(*CTA["us_weekend"]))


def build_weekly2(db, llm, model: str, R: Render, as_of: date, now: datetime, store: bool) -> str:
    sat = last_saturday(as_of)
    monday, friday = sat - timedelta(days=5), sat - timedelta(days=1)
    mat = load_material(db, at(monday, NIGHT_TO_HOUR), at(sat, NIGHT_TO_HOUR), EXCERPTS_MULTI, multi=True)
    if not mat.excerpts:
        print("[skip] 이번 주 메시지가 없어 주간 글을 만들 수 없습니다.")
        return ""
    kr_d, kr_reasons = load_kr_reasons(db, friday)
    faces = load_week_new_faces(db, monday, friday)
    events = load_events(db, sat + timedelta(days=2), sat + timedelta(days=8), "KR")
    scores = [r for r in load_scores(db, 7, until=friday) if r["date"] >= monday.isoformat()]
    past = stored_digest_lines(db, [monday + timedelta(days=i) for i in range(5)], R)

    digest = "\n".join(
        [f"[창] {span_label(*mat.window)} (KST) · {R.date_label(monday.isoformat())} 부터 {R.date_label(friday.isoformat())} 까지"]
        + past
        + [""]
        + excerpt_lines(mat, "이번 주 발췌")
        + [""]
        + (reason_lines("종목별 까닭 · 이번 주 움직인 종목", kr_reasons, 8, with_change=True) if kr_reasons else [])
    )
    sections = compose_sections(llm, model, "weekly2", digest, mat)
    if len(sections) < MIN_SECTIONS_TO_SEND:
        print(f"[skip] 갈래가 {len(sections)}개뿐이라(최소 {MIN_SECTIONS_TO_SEND}) 주간 글을 만들지 않습니다.")
        return ""
    # 한 주 구간 등락(지난 금요일 종가 대비 이번 금요일 종가).
    chg_kr, chg_us = _changes_for(db, sections, [], now, ("range", monday, friday), ("range", monday, friday))

    lines = ["📅 <b>한 주 정리와 다음 주 일정</b>", f"{R.date_label(monday.isoformat())} ~ {R.date_label(friday.isoformat())}"]
    if scores:
        lines += ["", score_line(R, scores, weekly=True)]   # 온도는 날짜 줄과 한 칸 띄고(2026-09-10)
    lines += render_sections(R, sections, mat, chg_kr, chg_us)
    optional = [
        b for b in [
            new_faces_block(R, "이번 주 새로 회자된 종목", faces),
            event_block(R, "다음 주 일정", events, EVENT_LINES_WEEK),
        ] if b
    ]
    if store:
        store_digest(db, sat, "weekly", sections, model)
    return _fit(lines, optional, R.cta_link(*CTA["weekly2"]))


BUILDERS = {
    "morning2": build_morning2,
    "evening2": build_evening2,
    "midweek": build_midweek,
    "us_weekend": build_us_weekend,
    "weekly2": build_weekly2,
}


def build(fmt: str, db, llm, model: str, R: Render, as_of: date | None = None, store: bool = False) -> str:
    """포맷 이름으로 글 하나. as_of 는 '오늘'을 못박는다(예시를 다른 요일로 만들 때)."""
    now = datetime.now(KST)
    day = as_of or today_kst()
    if as_of and as_of != today_kst():
        # 창의 끝을 그날로 옮긴다 — "지금까지"가 아니라 그날 하루를 통째로 본다.
        now = at(as_of, 23)
    return BUILDERS[fmt](db, llm, model, R, day, now, store)

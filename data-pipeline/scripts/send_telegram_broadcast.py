"""오늘의 햇쩨 지수와 카더라 급부상 종목을 텔레그램 채널에 한 건 발송한다.

이 제품은 매일 바뀌는 숫자가 핵심이라, 밖에서 찔러주지 않으면 한 번 보고 끝난다.
텔레그램 채널이 유일한 재방문 루프이고, 이 스크립트가 그 채널에 올라가는 글을 만든다.

**기본 동작은 dry-run이다.** 아무 인자 없이 돌리면 메시지를 stdout 에 찍기만 한다.
실제 발송은 `--send` 를 명시했을 때만 일어난다. 공개 채널에 잘못 나간 글은
사이트의 틀린 숫자보다 회수가 어렵다 — 기본값을 안전한 쪽에 둔다.

    python scripts/send_telegram_broadcast.py                      # 미리보기만
    python scripts/send_telegram_broadcast.py --send --chat-id -100…  # 테스트 채널로
    python scripts/send_telegram_broadcast.py --send               # 설정된 채널로

⚠️ **발송에 TELEGRAM_SESSION(Telethon)을 쓰지 않는다.** 그건 Hun 개인 계정의 로그인
권한이고 수집 전용이다. 발송은 BotFather 로 만든 별도 봇 토큰(TELEGRAM_BOT_TOKEN)으로
Bot API 를 부른다. 둘은 목적도 권한 범위도 다르므로 절대 섞지 않는다.

## 낡은 값을 방송하지 않기

파이프라인이 KRX/ECOS 타임아웃으로 조용히 실패하고 낡은 값이 남는 사고가 실제로 있었다
(2026-07-22, check_freshness.py 주석 참고). 화면에 하루 묵은 숫자가 떠 있는 것과 구독자
전원에게 그 숫자를 쏘는 것은 회수 난이도가 다르다. 그래서 게이트가 두 겹이다.

  1. **워크플로 게이트** — 발송 스텝을 check_freshness 성공 뒤에 두고 그 결과를 조건으로
     건다(.github/workflows/daily-update.yml).
  2. **스크립트 자체 게이트** — 아래 staleness_problems(). 워크플로 밖에서 손으로 돌릴
     때도 막혀야 하고, check_freshness 가 안 보는 daily_score 행 날짜도 여기서 본다.

dry-run 은 게이트에 걸려도 메시지를 그려서 보여준다(경고만 찍는다). 미리보기까지 막으면
문구를 손볼 수가 없다. 막는 건 '발송'이지 '렌더'가 아니다.

## 화면과 숫자가 어긋나지 않게

메시지의 숫자는 전부 사이트가 그리는 것과 같은 값이어야 한다. 같은 날 사이트는 62℃,
채널은 63℃ 라면 둘 다 못 믿게 된다. 그래서 표시 규칙을 프론트에서 그대로 옮겨 왔다:

  - 도수 = Math.round(daily_score.score) — app/page.tsx Hero. **정수다.**
  - 구간 = 점수에서 재계산(25/50/75) — app/ui.tsx stageForScore. 저장된 stage 문자열이
    아니라 점수에서 직접 낸다(프론트가 그렇게 한다).
  - 급부상 종목 = lib/telegram-data.ts getSurgingStocks 와 같은 계산(common/surging.py).

## 말투·표현 규칙(어기면 서비스 성격이 달라진다)

  - 합쇼체(~니다). 해요체 금지.
  - em대시(" — ") 금지. ". " 로 끊고 목록은 "·" 로 나눈다.
  - **매수·매도 프레이밍 금지.** 사이트는 "과열도"만 말하고 매수·매도 신호가 아니라는
    선을 지킨다. 급부상 종목은 "많이 언급되었다"는 사실만 전하고 가격·등락률은 넣지
    않는다(카드에는 시세가 있지만, 종목명 옆에 붙은 가격은 채널 글에서 추천으로 읽힌다).
  - 하단 링크는 브랜드 한 줄뿐이다(BRAND_LINE). 면책 문구는 넣지 않기로 했다(Hun 결정,
    2026-07-28) — 그 링크가 닿는 사이트에 면책이 있다. 되살릴 땐 이 줄 아래에 한 줄로.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests  # noqa: E402

from common.config import TELEGRAM_BOT_TOKEN, TELEGRAM_BROADCAST_CHAT_ID  # noqa: E402
from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.surging import load_stock_daily, top_surging  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

SITE_URL = "https://hatzze.fun"

# UTM — GA4 에서 텔레그램 유입을 따로 보기 위한 표식. source/medium/campaign 은 GA4 가
# 기본으로 인식하는 이름이라 별도 설정 없이 '획득' 리포트에 잡힌다. content 는 같은 글
# 안의 두 링크 중 어느 쪽이 눌렸는지 가른다(맞춤 측정기준 없이도 탐색에서 보인다).
#
# ⚠️ **파라미터를 잇는 & 는 날 것 그대로 둔다. &amp; 로 "고치지" 말 것.** 텔레그램 HTML
# 규칙은 "태그의 일부가 아닌 < > & 를 엔티티로 바꾸라"이므로 href 속성 안의 & 는 규칙에서
# 빠져 있다. 반대로 속성값 안의 &amp; 를 다시 & 로 풀어 준다는 보장은 문서 어디에도 없다.
# 잘못 풀리면 utm_medium 부터가 통째로 안 붙어 GA 에서 텔레그램 유입이 사라진다.
UTM = "utm_source=telegram&utm_medium=social&utm_campaign=daily_broadcast"

# 요약을 몇 문장까지 실을지. ai_summary 는 [주인공 지표][최근 추세] 두 문장이다.
# 2 면 사이트 히어로와 같은 말을 하고(일관성), 1 로 낮추면 추세 문장이 잘려 나가고 글이
# 120 자쯤 짧아진다. "채널 글이 길다" 싶을 때 여기만 만지면 된다.
SUMMARY_SENTENCES = 2

# 구간별 이모지. README.md 의 구간 표와 같은 그림을 쓴다 — 채널과 문서가 다른 그림을
# 쓰면 같은 걸 가리키는지 매번 확인해야 한다. 사이트 본문은 이모지를 안 쓰지만(서체가
# 갈린다) 텔레그램은 이모지가 기본 어휘라 여기서만 쓴다.
STAGE_EMOJI = {"저온": "❄️", "상온": "🌡️", "고온": "🔥", "초고온": "🌋"}

# 급부상 종목 계산은 common/surging.py 가 맡는다. 내러티브 생성기와 **같은 목록**을
# 써야 채널이 소개한 종목에 요약이 빠지지 않는다(그 파일 주석 참고).

# 그중 메시지에 싣는 수. 하나만 실으면 "왜 저 종목이냐"가 안 보이고, 다섯이면 글이
# 길어져 아래 링크까지 안 내려간다. 셋이 카드 정원(5) 안쪽이라 사이트와도 안 어긋난다.
SURGING_SHOW = 3

# 하단 브랜드 줄. **모든 포맷이 이 한 줄만 링크로 갖는다.** 예전엔 "지표 전체 보기 ·
# 카더라 리포트" 두 개를 나란히 뒀는데, 링크가 둘이면 무엇을 눌러야 하는지 고민하게
# 되고 글의 마무리도 어수선해진다. 하나로 줄이는 대신 목적지를 메시지 성격에 맞춘다
# (카더라 이야기를 읽고 눌렀는데 지수 페이지가 뜨면 한 번 더 찾아가야 한다).
BRAND_LINE = "hatzze | 데이터와 감성으로 읽는 시장"

# 카더라 집계가 이만큼보다 오래됐으면 종목 블록을 통째로 뺀다(발송은 계속한다).
# 창이 이미 '오늘'을 빼므로 정상값은 1일이다. 주말·수집 실패 한 번은 흡수하고,
# 그보다 밀리면 낡은 종목을 소개하느니 그 줄을 안 쓰는 쪽이 낫다.
KADERA_MAX_LAG_DAYS = 3

# daily_score 가 이보다 오래전에 쓰였으면 '이번 실행이 계산한 점수'가 아니라고 본다
# (staleness_problems 주석 참고). 예약 실행 간격이 9시간 남짓이라 6이면 여유가 넉넉하다.
MAX_SCORE_AGE_HOURS = 6

TELEGRAM_TIMEOUT_SEC = 20
TELEGRAM_ATTEMPTS = 3


# ─── 프론트와 같은 표시 규칙 ──────────────────────────────────────────────────


def _js_quantize(value: float, places: str) -> Decimal:
    """JS 의 반올림(동점은 큰 쪽)을 배정도 실수의 **정확한 값** 위에서 흉내 낸다.

    Decimal(float) 은 그 double 이 실제로 담고 있는 값을 그대로 받는다(0.1 이 아니라
    0.1000000000000000055…). JS 의 Math.round·toFixed 도 같은 정확한 값을 기준으로
    가장 가까운 결과를 고르고 동점이면 큰 쪽을 택하므로, 여기서 ROUND_HALF_UP 을 걸면
    두 언어가 같은 답을 낸다.

    **산술로 흉내 내면 안 된다.** 처음엔 floor(x*10 + 0.5)/10 으로 썼는데 9.35 에서
    갈렸다 — 9.35 라는 double 은 실제로 9.34999999999999964… 여서 JS 는 "9.3" 을
    내는데, ×10 이 부동소수 반올림으로 정확히 93.5 가 되는 바람에 이쪽만 "9.4" 가 됐다.
    급부상 카드가 "▲9.3배"인데 채널이 "9.4배"라고 말하는, 딱 피하려던 종류의 어긋남이다.

    (JS 의 Math.round 는 음수 동점을 +∞ 쪽으로 보내 ROUND_HALF_UP 과 갈리지만, 여기 쓰는
    값은 과열도 0~100 과 언급 배수라 둘 다 음수가 될 수 없다.)
    """
    return Decimal(value).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def js_round(value: float) -> int:
    """JS 의 Math.round 와 같은 반올림.

    Python 내장 round() 는 은행가 반올림이라 round(2.5)==2 인데 JS 는 3 이다. 도수는
    사이트가 Math.round 로 찍으므로(app/page.tsx Hero), 같은 규칙을 써야 26℃ 자리에서
    둘이 1도 어긋나지 않는다.
    """
    return int(_js_quantize(value, "1"))


def js_fixed1(value: float) -> str:
    """JS 의 Number.prototype.toFixed(1) 과 같은 문자열.

    급부상 카드가 `s.ratio.toFixed(1)` 로 "9.4배"를 찍는다(app/kadera/page.tsx).
    """
    return str(_js_quantize(value, "0.1"))


def stage_for_score(score: float) -> str:
    """점수 → 구간. app/ui.tsx stageForScore · calculate_score.stage_for_score 와 같은 경계."""
    if score < 25:
        return "저온"
    if score < 50:
        return "상온"
    if score < 75:
        return "고온"
    return "초고온"


def korean_date_label(iso: str) -> str:
    """"2026-07-28" → "7월 28일(화)". 채널 글머리에 붙이는 기준일 표기."""
    d = date.fromisoformat(iso)
    return f"{d.month}월 {d.day}일({'월화수목금토일'[d.weekday()]})"


# ─── 데이터 읽기 ──────────────────────────────────────────────────────────────


def load_daily_score(db) -> dict | None:
    """최신 daily_score 한 줄. 프론트(lib/data.ts getLatestDailyScore)와 같은 행을 본다.

    ai_summary 컬럼이 없는 환경(마이그레이션 007 전)에서도 안 죽도록 폴백한다.
    """
    def query(cols: str):
        return db.table("daily_score").select(cols).order("date", desc=True).limit(1).execute()

    try:
        res = query("date,score,stage,updated_at,ai_summary")
    except Exception:
        res = query("date,score,stage,updated_at")
    return res.data[0] if res.data else None


def surging_for_message(db) -> list[dict]:
    """메시지에 실을 급부상 종목 — 이름과 '왜 회자되나' 요약까지 붙여서.

    고르는 계산은 common/surging.py 가 한다(사이트 카드·내러티브 생성기와 같은 함수).
    여기서는 표시에 필요한 살만 붙인다.
    """
    rows, dates = load_stock_daily(db)
    if not dates:
        return []

    # 자료가 밀렸으면 종목 블록을 포기한다. 낡은 급부상은 틀린 급부상이다.
    lag = (today_kst() - date.fromisoformat(dates[-1])).days
    if lag > KADERA_MAX_LAG_DAYS:
        print(f"[경고] 카더라 집계가 {lag}일 밀려 있습니다(최신 {dates[-1]}). 종목 블록을 뺍니다.")
        return []

    # 위에서 이미 읽은 걸 넘긴다 — 14일치를 한 실행에서 두 번 읽지 않는다.
    top = top_surging(db, SURGING_SHOW, preloaded=(rows, dates))
    if not top:
        return []

    codes = [s["code"] for s in top]
    names = {
        r["code"]: r["name"]
        for r in db.table("stocks").select("code,name").in_("code", codes).execute().data
    }
    # 종목별 '왜 회자되나' 한두 문장. generate_telegram_narratives.py 가 이미 만들어 둔 걸
    # 그대로 읽는다 — 방송이 문장을 새로 만들지 않으므로 추가 비용이 없고, 사이트 종목
    # 리포트와 **같은 문장**이 나가 둘이 어긋날 수도 없다.
    latest = (
        db.table("telegram_stock_narrative").select("date").order("date", desc=True).limit(1).execute().data
    )
    narratives: dict[str, str] = {}
    if latest:
        narratives = {
            r["stock_code"]: (r["narrative"] or "").strip()
            for r in db.table("telegram_stock_narrative")
            .select("stock_code,narrative")
            .eq("date", latest[0]["date"])
            .in_("stock_code", codes)
            .execute()
            .data
        }

    for s in top:
        s["name"] = names.get(s["code"], s["code"])
        s["narrative"] = narratives.get(s["code"], "")
    missing = [s["name"] for s in top if not s["narrative"]]
    if missing:
        print(f"[안내] 요약이 아직 없는 종목: {' · '.join(missing)} (숫자만 싣습니다)")
    return top


# ─── 발송 게이트 ──────────────────────────────────────────────────────────────


def score_age_hours(score_row: dict) -> float | None:
    """daily_score 행이 쓰인 지 몇 시간 지났나. updated_at 이 없거나 못 읽으면 None."""
    raw = score_row.get("updated_at")
    if not raw:
        return None
    try:
        # Supabase 는 "+00:00" 로 주지만, 혹시 "Z" 로 와도 읽히게 한다(3.11 미만 대비).
        written = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    if written.tzinfo is None:
        written = written.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - written).total_seconds() / 3600


def staleness_problems(score_row: dict) -> list[str]:
    """발송을 막아야 할 이유들. 비어 있으면 보내도 된다.

    check_freshness.py 는 indicator_values 의 자료 날짜를 보지만 daily_score 는 안 본다.
    calculate_score 가 죽은 날엔 지표가 멀쩡해도 점수만 어제 것이 남는데, 그 어제 점수가
    "오늘의 온도"로 나가면 안 된다. 그래서 여기서 한 번 더 본다.

    **행의 날짜가 아니라 쓰인 시각(updated_at)을 본다.** 처음엔 `date == 오늘` 로 비교했는데
    그게 시간대 문제를 안고 있었다 — calculate_score 는 행 날짜를 date.today()(러너의 **UTC**
    날짜)로 찍는 반면 이 스크립트는 KST 로 판단한다. 평소 실행 시각엔 두 날짜가 같아서 안
    드러나지만, 예약 큐가 크게 밀려 UTC 15시를 넘겨 실행되면 KST 는 이미 다음 날이라 방금 쓴
    행이 '어제치'로 보여 멀쩡한 날 발송이 걸린다. 반대로 그걸 피하려고 UTC 날짜까지 인정하면
    이번엔 KST 새벽에 진짜 어제 값이 통과한다. 날짜 문자열로는 양쪽을 동시에 못 막는다.

    묻고 싶은 건 애초에 "행 날짜가 오늘인가"가 아니라 **"이번 실행이 방금 계산한 점수인가"**
    이고, updated_at 이 그걸 직접 답한다. 예약 실행은 9시간 넘게 떨어져 있으므로(아침 완료
    ~11:00 · 오후 ~20:20 KST) 임계 6시간이면 '이번 실행이 쓴 것'과 '지난 실행이 남긴 것'이
    깨끗하게 갈린다. 시간대 계산이 아예 사라지는 건 덤이다.
    """
    problems = []
    age = score_age_hours(score_row)
    if age is None:
        problems.append("daily_score.updated_at 을 읽지 못해 점수가 방금 계산된 것인지 확인할 수 없습니다.")
    elif age > MAX_SCORE_AGE_HOURS:
        problems.append(
            f"daily_score({score_row['date']})가 {age:.1f}시간 전 값입니다"
            f"(허용 {MAX_SCORE_AGE_HOURS}시간). 이번 실행에서 점수 계산이 안 돌았습니다."
        )
    return problems


# ─── 메시지 조립 ──────────────────────────────────────────────────────────────


def to_telegram_html(text: str) -> str:
    """LLM 요약의 **굵게** 표기를 텔레그램 HTML 로 옮긴다.

    ai_summary 는 프론트가 <b> 로 파싱하는 마크다운 별표를 그대로 담고 있다
    (generate_daily_summary.py 참고). 여기서 안 바꾸면 채널 글에 별표가 그대로 찍힌다.

    **이스케이프가 먼저다.** 순서를 뒤집으면 우리가 넣은 <b> 까지 &lt;b&gt; 로 변해
    태그가 글자로 보인다.
    """
    out = html.escape(text, quote=False)
    parts = out.split("**")
    # 짝이 안 맞으면(별표 홀수) 그대로 둔다 — 억지로 닫으면 엉뚱한 데까지 굵어진다.
    if len(parts) % 2 == 0:
        return out
    return "".join(p if i % 2 == 0 else f"<b>{p}</b>" for i, p in enumerate(parts))


def drop_emdash(text: str) -> str:
    """구분자로 쓰인 대시를 ". " 로 바꾼다. 이 저장소의 사용자 텍스트 규칙이다.

    메시지에서 우리가 안 쓴 문장은 ai_summary 하나뿐인데 그건 LLM 이 쓴다. 생성 프롬프트가
    이미 대시를 금지하고 있어서(generate_daily_summary.py COMMON) 실제로 나오는 일은
    드물지만, 여기는 공개 채널이라 한 번 새면 그대로 박제된다. 프롬프트는 지침이고 이건
    보장이다.

    문서화된 치환(" — " → ". ")만 한다. 양옆에 공백이 없는 붙은 대시는 합성어일 수 있어
    (예: "코스피–코스닥") 건드리지 않고, 남아 있으면 경고만 찍는다.
    """
    out = re.sub(r"\s+[—–]\s+", ". ", text)
    if "—" in out or "–" in out:
        print(f"[경고] 요약에 대시가 남아 있습니다(붙은 대시라 자동 치환하지 않았습니다): {out[:60]}…")
    return out


def as_read(message: str) -> str:
    """전송 페이로드를 '채널에서 읽히는 모습'으로 되돌린다. 미리보기 전용이다.

    페이로드에는 <b>·<a href> 와 이스케이프된 &amp; 가 섞여 있어서, 그대로 보면 문구가
    긴지 짧은지·말이 되는지 눈으로 못 잰다. 링크는 클릭되는 글자만 남긴다(URL 은 채널에서
    안 보인다). 정규식으로 태그를 지우는 건 이 함수가 우리가 만든 문자열만 상대하기
    때문이다 — 임의의 HTML 을 넣지 말 것.
    """
    text = re.sub(r"<a href=\"[^\"]*\">(.*?)</a>", r"\1", message)
    text = re.sub(r"</?[a-z]+>", "", text)
    return html.unescape(text)


def brand_link(path: str, content: str) -> str:
    """하단 브랜드 줄. 모든 포맷에서 **유일한 링크**다(BRAND_LINE 주석 참고).

    path 는 그 메시지가 말한 것을 보여 주는 페이지다. content 는 utm_content 로,
    링크가 하나로 줄어든 대신 이걸로 '어느 포맷이 사람을 데려왔나'를 GA 에서 가른다.
    """
    sep = "&" if "?" in path else "?"
    return f'<a href="{SITE_URL}{path}{sep}{UTM}&utm_content={content}">{BRAND_LINE}</a>'


def quote(*lines: str) -> str:
    """인용 박스. 텔레그램이 왼쪽에 세로선을 그려 준다.

    공백 들여쓰기를 쓰지 않는 이유가 있다 — 텔레그램은 가변폭 서체라 앞 공백이 줄마다
    다른 폭으로 보여서, 종목 밑에 붙인 설명이 들쭉날쭉 어긋난다. 인용 박스는 서체와
    무관하게 같은 모양이라 어느 기기에서나 같게 보인다(Bot API 7.0+).
    """
    return "<blockquote>" + "\n".join(lines) + "</blockquote>"


def build_evening(score_row: dict, surging: list[dict]) -> str:
    """B · 마감 리포트 — 평일 저녁. [온도] → [오늘의 요약] → [급부상 종목 3] → [브랜드].

    온도는 머리에 한 줄로만 둔다. 이 글에서 **읽을 거리는 카더라 종목 쪽**이고, 온도는
    "오늘 어느 언저리였나"를 짚어 주는 조연이다.
    """
    score = float(score_row["score"])
    degrees = js_round(score)
    # 저장된 stage 문자열이 아니라 점수에서 재계산한다(프론트와 같은 규칙).
    stage = stage_for_score(score)
    emoji = STAGE_EMOJI.get(stage, "🌡️")

    lines = [
        f"{emoji} <b>오늘 {degrees}℃ · {stage}</b>",
        f"{korean_date_label(score_row['date'])} 마감 기준",
    ]

    # ai_summary 는 두 문장(주인공 지표·최근 추세)이 개행으로 이어져 저장된다.
    # 한 문단으로 붙여 글을 짧게 둔다 — 채널에서는 문단이 늘수록 스크롤이 는다.
    sentences = [s.strip() for s in (score_row.get("ai_summary") or "").splitlines() if s.strip()]
    if sentences:
        lines += ["", to_telegram_html(drop_emdash(" ".join(sentences[:SUMMARY_SENTENCES])))]

    if surging:
        lines += ["", "📡 <b>카더라 급부상 종목</b> · 최근 3일"]
        for i, s in enumerate(surging):
            name = html.escape(s["name"], quote=False)
            # '얼마나 언급됐나'만 말한다. 오르내림·가격·전망은 넣지 않는다.
            how = "신규 등장" if s["is_new"] else f"▲{js_fixed1(s['ratio'])}배"
            body = [f"{s['mentions']}회 언급 · {s['channels']}개 채널"]
            if s["narrative"]:
                body.append(to_telegram_html(drop_emdash(s["narrative"])))
            lines += ["", f"<b>{'①②③④⑤'[i]} {name}</b> {how}", quote(*body)]

    # 카더라가 본론이라 카더라 페이지로 보낸다.
    lines += ["", brand_link("/kadera", "evening")]
    return "\n".join(lines)


# ─── 발송 ─────────────────────────────────────────────────────────────────────


def send(token: str, chat_id: str, text: str) -> None:
    """Bot API sendMessage. 실패하면 예외를 올려 워크플로가 실패로 집계하게 한다.

    ⚠️ **어떤 경로로도 URL 을 출력하지 않는다.** 봇 토큰이 경로에 들어 있어서,
    requests 의 raise_for_status() 메시지나 예외 repr 을 그대로 찍으면 토큰이 로그에
    남는다. 이 저장소는 public 이고 Actions 로그도 공개다(GitHub 의 secret 마스킹은
    등록해 둔 값에만 걸리는 마지막 그물이지, 이쪽이 안 흘리는 게 먼저다).

    링크 미리보기는 끈다. 메시지가 이미 도수를 말하고 있어서 OG 카드가 같은 숫자를
    한 번 더 크게 보여주면 글 길이만 두 배가 된다. 켜고 싶으면 is_disabled 만 뒤집으면 된다.
    """
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "link_preview_options": {"is_disabled": True},
    }

    last = ""
    for attempt in range(1, TELEGRAM_ATTEMPTS + 1):
        try:
            res = requests.post(url, json=payload, timeout=TELEGRAM_TIMEOUT_SEC)
            body = res.json()
            if body.get("ok"):
                mid = (body.get("result") or {}).get("message_id")
                print(f"[텔레그램] 발송 완료 · chat_id={chat_id} · message_id={mid}")
                return
            # description 에는 토큰이 안 들어간다(텔레그램이 만든 사람 읽는 설명이다).
            last = f"HTTP {res.status_code} · {body.get('description')}"
        except requests.RequestException as e:
            # 예외를 그대로 찍지 않는다 — URL 이 딸려 나온다. 타입만 남긴다.
            last = f"{type(e).__name__}"
        if attempt < TELEGRAM_ATTEMPTS:
            delay = backoff_delay(attempt)
            print(f"[텔레그램] 전송 실패({last}). {delay:.0f}초 뒤 재시도 {attempt + 1}/{TELEGRAM_ATTEMPTS}")
            time.sleep(delay)

    raise RuntimeError(f"텔레그램 발송에 {TELEGRAM_ATTEMPTS}회 모두 실패했습니다: {last}")


def main() -> None:
    parser = argparse.ArgumentParser(description="오늘의 햇쩨 지수를 텔레그램 채널에 발송한다(기본은 미리보기).")
    parser.add_argument(
        "--send",
        action="store_true",
        help="실제로 발송한다. 없으면 메시지를 출력만 한다(기본).",
    )
    parser.add_argument(
        "--chat-id",
        default=None,
        help="발송 대상 override. 비공개 테스트 채널로 보낼 때 쓴다(예: -1001234567890).",
    )
    args = parser.parse_args()

    db = get_client()
    score_row = load_daily_score(db)
    if not score_row:
        print("[skip] daily_score 행이 없어 보낼 내용이 없습니다.")
        return

    surging = surging_for_message(db)
    message = build_evening(score_row, surging)

    read = as_read(message)
    print("──── 채널에서 읽히는 모습 " + "─" * 34)
    print(read)
    print("──── 실제 전송 페이로드(HTML) " + "─" * 30)
    print(message)
    print("─" * 60)
    print(f"[길이] 읽히는 글자 {len(read)}자 · 페이로드 {len(message)}자")

    problems = staleness_problems(score_row)
    if problems:
        for p in problems:
            print(f"[신선도] {p}")

    if not args.send:
        print("[dry-run] 실제로 보내지 않았습니다. 보내려면 --send 를 붙이세요.")
        return

    # 여기부터는 실제 발송 경로다.
    if problems:
        print("[중단] 자료가 낡아 발송하지 않습니다. 구독자 전원에게 틀린 숫자를 쏘는 건 되돌리기 어렵습니다.")
        sys.exit(1)

    chat_id = args.chat_id or TELEGRAM_BROADCAST_CHAT_ID
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        print("[중단] TELEGRAM_BOT_TOKEN 또는 TELEGRAM_BROADCAST_CHAT_ID 가 없습니다.")
        sys.exit(1)

    send(TELEGRAM_BOT_TOKEN, str(chat_id), message)


if __name__ == "__main__":
    main()

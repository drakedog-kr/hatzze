"""오늘의 과열도 지수와 지표들을 LLM(Claude Opus 5.5)으로 네 줄(흐름 · 달라진 것 · 뜨거운 곳 · 여론) 요약해
daily_score.ai_summary에 저장한다. 프론트 히어로 카드가 이 문장을 읽어 렌더한다.

calculate_score.py가 daily_score/indicator_values를 채운 뒤 실행하는 후속 단계다.
LLM 호출이 실패하거나 키가 없어도 파이프라인 본체(점수 계산)엔 영향이 없도록,
워크플로에선 continue-on-error로 돌리고 실패 알림 집계에서도 제외한다.

⚠️ 공개 저장소 + 법적 이유로, 이 요약은 시장의 "과열도"만 서술한다. 매수·매도·투자
권유, 목표가, 상승/하락 전망은 시스템 프롬프트에서 강하게 금지한다(아래 SYSTEM).
숫자는 지표가 준 값만 쓰고 지어내지 않는다. 면책 문구는 프론트가 따로 보여주므로
요약엔 넣지 않는다.
"""

from __future__ import annotations

import re
import sys
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from statistics import median
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import ANTHROPIC_API_KEY  # noqa: E402
from common.js_round import js_round  # noqa: E402
from common.llm_client import HAS_LLM_CREDENTIAL, get_llm_client  # noqa: E402
from common.market_sentiment import MARKET_MIN_MESSAGES, load_market_daily  # noqa: E402
from common.prompt_style import PLAIN_PROSE_RULE  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.text_check import is_clean, problems  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

# 여론 줄은 카더라 히어로와 **같은 말**을 해야 한다 — 창·낙관도·구간 이름을 카더라 총평 스크립트에서 그대로
# 가져온다(세 번째 사본을 두지 않는다. 프론트 lib/telegram-data.ts 와의 쌍둥이 관계는 그쪽 주석).
import generate_telegram_narratives as KR  # noqa: E402

# Opus 5.5. 호출은 구독(llm_client)으로 나가고, 구독이 막힌 날엔 llm_client 가 Haiku 로 바꿔 API 로 보낸다.
# 2026-09-12 에 Sonnet 5 를 같은 자료로 견줬다. ② 갈림 문단은 Sonnet 이 정확했지만(Haiku 는
# 초고온 개수와 상위 5개의 관계를 뭉갠다), 발송 글·급부상 한 줄까지 세 곳을 놓고 본 판정은
# "일단 전부 Haiku". Sonnet 은 규칙의 전언 예시를 모든 문장에 적용해 전언체가 되고, 규칙을 풀면
# 그 규칙이 막던 시세 표현이 샌다. Sonnet 으로 가려면 프롬프트를 Sonnet 기준으로 다시 쓰고
# 변형마다 수십 회 재야 한다(이 파일 TREND_SYSTEM 주석의 4변형×40회와 같은 규모).
# ⚠️ 분류 쪽(디시·뉴스 제목, 텔레그램 메시지)은 눈금이 분류기에 맞춰 보정돼 있어 어차피 Haiku 다.
# 2026-09-28 Haiku → Opus 5.5. 사이트 첫 화면 맨 위 글이다. 09-23 에 총평·발송 글과 함께 옮겼다가
# 09-24 에 이 자리만 Haiku 로 되돌렸고(말투가 같고 길이만 늘었다), 정확성을 재 보고 다시 옮겼다.
# 같은 재료(09-27 저온 23℃ · 마지막 값이 어제) 8회씩: 자료와 어긋난 문장 Opus 0회 · Haiku 3회
# ("27℃대의 고온" · 26일 값을 26℃로 · 없는 구간 이름 "중온"). 옮기며 요약도 세 줄 형식으로 바꿨다
# (BRIEF_LABELS 주석). 하루 두 번 돌고 한 번에 세 줄을 쓴다 — 호출 3~6번 · 16~34초(09-28 11회).
# ⚠️ Opus 는 굵게를 문장마다 넣는다 — 저장 직전에 keep_bold_names 로 지표 이름에만 남긴다.
MODEL = "claude-opus-5-5"

# 초고온 진입선 = 진행률 ≥ 75. calculate_score.py의 HOT_ZONE과 동일하게 맞춘다.
# 이 지점이 곧 카드에 "기준선"으로 적히는 값이라, 화면·요약·배지가 한 지점을 가리킨다.
HOT_ZONE = 75.0


def cap_progress(progress: float) -> float:
    """진행률을 0~100으로 클램핑. calculate_score.cap_progress와 동일."""
    return min(max(progress, 0.0), 100.0)


# 문장 검수(깨진 글자·오타)는 common/text_check.py 가 맡는다. 예전엔 여기서 대체문자
# (U+FFFD) 하나만 봤는데, 그 그물은 "잦아들기"→"낙아들기" 같은 오타를 통과시킨다 —
# 음절이 전부 정상 한글이라 문자 검사로는 못 잡는다. **원문(digest)을 함께 넘겨야**
# 어절 검사까지 돈다. 자세한 규칙과 실측 근거는 그 파일 주석 참고.


def stage_for_score(score: float) -> str:
    """종합 점수 → 구간. calculate_score.stage_for_score와 동일(밴드 25/50/75)."""
    s = js_round(score)  # 화면에 찍히는 정수로 가른다(app/ui.tsx stageForScore). 24.72 는 25℃ · 상온이다.
    if s < 25:
        return "저온"
    if s < 50:
        return "상온"
    if s < 75:
        return "고온"
    return "초고온"


# 요약은 네 줄이고 줄마다 따로 쓴다(각 호출은 한 문장). 한 번에 여러 문단을 시키면 모델이 문단
# 수를 흔든다(옛 두 문장 때 실측). 줄은 이름표를 붙여 개행으로 이어 저장하고 프론트가 이름표로 나눈다.
#
# 줄마다 **화면 한 줄**이다(2026-10-04 운영자 판단 "오늘의 브리핑은 다 한 줄이면 좋겠다"). 시장 브리핑의 문장 칸은
# 1,280 화면에서 633px · 13px 글자라 보이는 글자 65자 안팎이 한 줄이다(실측 글자당 9.0px). 그래서 줄마다 한 문장 ·
# LINE_MAX 자 안쪽으로 쓰게 하고, 넘치면 sized_sentence 가 줄여 쓰게 한다. 그 전엔 '한두 문장'이라 달라진 것 81 ·
# 뜨거운 곳 102 · 여론 96자로 두 줄씩 넘겼다(10-03 저녁 실행).
#
# 2026-10-08 상한을 25% 늘렸다(65 → 81, 운영자 "25% 정도 더 길어도 될 것 같아 · 꼭 길어야 할 필요는 없고 상한을 더 놔둬도 · 지금은
# 좀 짧은 느낌"). 한 줄이던 줄이 1,280 에서 두 줄로 꺾일 수 있다. 길이는 다시 쓰기에서만 적히던 것을 첫 프롬프트에도
# 적는다(LINE_GUIDE) — 상한만 늘리면 모델이 저절로 쓰는 길이(10-05~07 실측 41~64자)가 그대로라 바뀌는 게 없다. 아래 끝은
# 강제하지 않는다(줄마다 *_LEN 의 아래 끝 그대로) — 늘릴 말이 없는 날 덧붙인 말로 채우지 않게.
LINE_MAX = 81
LINE_GUIDE = 60
COMMON = """\
당신은 한국 주식시장의 "과열도(온도)"를 보여주는 대시보드 '햇쩨(hatzze)'의 오늘의 요약을 쓰는 작성자입니다.
아래 데이터를 보고, 지시된 '한 문장'만 씁니다. 한 문장은 공백을 넣어 """ + f"{LINE_GUIDE}~{LINE_MAX}" + """자 정도입니다.

[말투]
- **모든 문장을 '~습니다'/'~ㅂ니다'로 끝맺습니다**(예: "~한 흐름입니다", "~로 보입니다", "~가 눈에 띕니다").
  "~이에요", "~예요", "~네요", "~어요", "~죠" 같은 해요체는 절대 쓰지 마세요. 과장 없이 데이터만큼만.
- 대시(—, –)를 문장 부호로 쓰지 마세요. 절을 이을 땐 마침표로 문장을 끊습니다.
- **'창'이라는 말을 쓰지 마세요. '기간'으로 씁니다**(나쁜 예: "이 창 안에서", "90일 창").
  '창'은 우리가 코드 안에서만 쓰는 말이라 읽는 사람에게는 창문으로 읽힙니다.
  좋은 예: "이 기간에", "최근 90일".
- **로마자·숫자 뒤에 조사를 띄우지 마세요**(나쁜 예: "HBM 과", "13F 는", "AI 가").
  붙여 씁니다: "HBM과", "13F는", "AI가". 한글과 로마자 사이는 원래 띄지 않습니다.
""" + PLAIN_PROSE_RULE + """

[데이터 읽는 법]
- 각 지표의 '과열도'(0=저온 ~ 100=초고온)가 그 지표가 얼마나 뜨거운지의 유일한 값입니다.
  높을수록 뜨겁고 낮을수록 식은 것입니다. 방향을 절대 뒤집지 마세요.
- 헤드라인 '햇쩨 지수'는 ℃로, 개별 지표는 '과열도 75'처럼 숫자 앞에 '과열도'를 붙여 말합니다.
  %를 붙이지 마세요. 비중(%)을 재는 지표가 있어 비중이 75%인 것처럼 읽힙니다.

[강조 형식]
- **지표 이름만** 별표 두 개로 감싸 굵게 씁니다. 예: **깃헙 거래봇 생성 수**. 숫자·온도·다른 말은 굵게 하지 마세요.
- 온도 단어(저온/상온/고온/초고온)는 별표로 감싸지 마세요(색 자동). 그 외 마크다운·목록·제목 금지.

[절대 하지 말 것]
- **'← 이 지표는 문장에 쓰지 마세요' 표시가 붙은 지표를 언급하는 것.** 이름조차 꺼내지
  마세요. 아무리 뜨거워도, 어떤 문장에서도 안 됩니다(그 지표는 화면 카드로 따로 보입니다).
- 매수/매도/투자 권유·신호, 목표가, 상승/하락 예측('오를 것/내릴 것/앞으로').
- 데이터에 없는 숫자, 카테고리(시장/감성) 평균 비교 같은 근거 없는 일반화, 특정 종목·인물·정치 언급.
- 면책 문구(화면에 따로 있음).

[길이] 화면 한 줄에 들도록 **""" + str(LINE_MAX) + """자 안쪽**으로 짧게 씁니다. 꾸밈말은 덜고 사실만 남깁니다.

[출력] 설명·머리말 없이, 지시된 딱 '한 문장'만 출력하세요."""

# ── 네 줄 요약(2026-09-28~) — 흐름 · 달라진 것 · 뜨거운 곳 · 여론 ─────────────────────────────
#
# 예전엔 [주인공 지표 뜻풀이][시장 vs 감성][최근 추세] 세 문단이었다. ① 이 매일 같은 지표의 **정의**를
# 되풀이했고(풋/콜 비율이 9월에 17일), 화면 첫 줄 템플릿("초고온에 시장 N개, 감성 M개")과 ② 가 같은
# 개수를 두 번 말했다. 후보 셋을 오늘 자료로 써서 보여 주고 '세 줄 요약'이 채택됐다(2026-09-28).
#   흐름      햇쩨 지수가 며칠간 어떻게 움직였나(옛 ③ 그대로 — TREND_SYSTEM).
#   달라진 것  최근 하루 새로 들어온 값 가운데 평소보다 크게 움직인 지표(pick_movers). 날마다 바뀐다.
#   뜨거운 곳  지금 가장 뜨거운 곳 한 곳(초고온 지표 하나). 가장 식은 시장 지표도 함께 적었는데 줄이 두 문장 ·
#             100자를 넘겨 2026-10-04 하나로 줄였다(운영자 판단 "뜨거운 곳 문구가 2개인데 1개로").
#   여론      주식 텔레그램(카더라)의 분위기와 그날 이야기 한 가지(같은 날 넷째 줄로 채택 — 세 줄이
#             '얼마나 뜨거운가'의 여러 면이라, 비어 있던 '사람들은 무슨 얘기를 하나'를 채운다).
# 이름표는 코드가 붙인다(BRIEF_LABELS) — 화면(app/home/Hero.tsx)이 이름표로 새 형식을 알아본다.
BRIEF_LABELS = ("흐름", "달라진 것", "뜨거운 곳", "여론")

TREND_SYSTEM = COMMON + """

[이번 문장 — 최근 추세]
[최근 추세] 수치를 근거로, 최근 며칠간 '햇쩨 지수'가 어떻게 움직였는지 흐름을 한 문장에
담으세요. (예: "지난주 50℃대에서 며칠째 내려와 오늘 25℃까지 식은 흐름입니다.") 과거
궤적만 서술하고 앞으로의 방향은 예측하지 마세요."""

# ⚠️ 방향은 '더 뜨거워짐·식음'으로만 준다. 원값이 올랐는지를 주면 낮을수록 뜨거운 지표(VKOSPI·
#    풋/콜)에서 모델이 거꾸로 읽는다(build_digest 머리말의 raw 금지와 같은 까닭).
# ⚠️ 숫자는 digest 에 아예 안 넣는다 — 주면 문장에 샌다(카더라 총평 08-23 교훈). '평소의 N배'는
#    화면 어디에도 없는 수치라 읽는 사람이 기준을 모른다.
CHANGE_SYSTEM = COMMON + """

[이번 문장 — 달라진 것]
[달라진 것] 목록은 최근 하루 새로 들어온 값 가운데 **그 지표의 평소 변화 폭보다 크게 움직인**
지표입니다(크게 움직인 순서). 목록 앞쪽 지표 한두 개가 과열 쪽으로 움직였는지 식는 쪽으로
움직였는지를 **한 문장**에 담으세요.
- 방향은 목록에 적힌 '더 뜨거워짐'·'식음'을 그대로 따르세요. 원래 값이 올랐다·내렸다고 쓰지
  마세요(낮을수록 뜨거운 지표가 있어 거꾸로 읽힙니다).
- 지표가 무엇을 재는지 풀어 쓰지 마세요(한 줄에 들지 않습니다).
- **목록에 없는 지표는 쓰지 마세요.** 과열도, 몇 배 같은 숫자는 쓰지 마세요.
- 햇쩨 지수와 ℃, 며칠간의 흐름은 쓰지 마세요(앞 줄이 맡습니다)."""

HOT_SYSTEM = COMMON + """

[이번 문장 — 뜨거운 곳]
지금 가장 뜨거운 곳 **한 곳**을 **한 문장**에 담으세요.
- 초고온(과열도 75 이상)에 든 지표가 있으면 그 가운데 과열도가 가장 높은 지표 **하나**를 과열도와
  함께 말하세요. 없으면 과열도가 가장 높은 지표 하나를 말하세요.
- 지표는 하나만 씁니다. 두 번째 지표나 식어 있는 지표는 쓰지 마세요.
- '← 이 지표는 문장에 쓰지 마세요' 표시가 붙은 지표는 이름을 쓰지 말고, 표시 없는 지표 가운데
  과열도가 가장 높은 것을 말하세요. 초고온 지표가 모두 표시에 걸렸으면 "초고온에 든 감성 지표 1개"처럼
  종류와 개수로 말하세요. 개수는 [갈림] 줄에 적힌 것만 씁니다.
- 과열도는 [지표별] 목록의 값을 그대로 씁니다.
- 햇쩨 지수와 ℃, 며칠간의 흐름, 어제와 달라진 점은 쓰지 마세요(앞 두 줄이 맡습니다)."""

# ⚠️ 분위기 말은 [여론] 줄 그대로다 — 카더라 히어로 제목("지금 여론은 낙관이 우세합니다")과 같은 창·같은
#    경계로 셌다(yeoron_tone). 하루치 낙관도를 쓰면 카더라 화면의 창 값과 어긋나서 숫자는 아예 안 준다.
# ⚠️ [이야기]는 카더라 총평의 둘째 대목(테마 지형)이다. 총평이 이미 '오늘 새로 오른 이야기'를 골라
#    써 두었고 숫자가 없다(그 대목 규칙). 셋째 대목(뉴스·종목)은 종목·시세 말이 많아 안 준다.
YEORON_SYSTEM = COMMON + """

[이번 문장 — 여론]
주식 텔레그램 채널(카더라)의 여론을 **한 문장**에 담으세요. "카더라에서는"으로 시작합니다.
- 먼저 [여론] 줄의 분위기를 그대로 씁니다('낙관이 우세'·'낙관과 비관이 팽팽'·'비관이 우세' 중 적힌 것).
- 이어서 [이야기] 발췌에서 가장 눈에 띄는 이야기 **한 가지**를 짧게 씁니다. 발췌를 그대로 베끼진 마세요.
- 시장 온도(℃ · 저온 · 고온)와 견주지 마세요.
- 숫자(%, 건수)는 쓰지 마세요. 종목 이름·주가 움직임·전망도 쓰지 마세요.
- 햇쩨 지수의 ℃, 지표 이름은 쓰지 마세요(앞 세 줄이 맡습니다)."""


# '뜻:' 설명을 붙일 지표 수와 카테고리. 옛 주인공 문단(시장 지표 중 가장 뜨거운 것 뜻풀이)의 근거였고,
# 지금은 '흐름' 줄 자료(build_digest 기본값)에만 남아 있다 — 그 자료로 09-28 에 쟀으니 그대로 둔다.
# '뜨거운 곳' 줄은 desc=False 로 뺀다(뜻풀이 줄이 아니다). '달라진 것'도 뜻을 안 준다(한 줄에 안 든다, 2026-10-04).
DESC_TOP_N = 5
SPOTLIGHT_CATEGORY = "시장"

# 줄마다 길이(화면에 보이는 글자 — 굵게 별표는 빼고 센다, sized_sentence). 길이는 첫 프롬프트에 없고
# 벗어났을 때 다시 쓰기에서만 적힌다. 그래서 모델이 저절로 쓰는 길이가 곧 화면 길이이고, 범위는 넘친
# 문장만 줄여 쓰게 하는 울타리다.
#
# 흐름: 옛 추세 문단 그대로. (55, 66)은 별표째 센 값이었다 — Opus 는 온도를 굵게 써서 별표만 8~12자였다.
#       보이는 글자로 센다.
# 2026-09-28 에는 Opus 11회의 저장된 길이(흐름 61~73 · 달라진 것 81~98 · 뜨거운 곳 77~106)에 맞춰 범위를 잡았다.
# 10-04 부터 위 끝은 넷 다 화면 한 줄(LINE_MAX)이다. 아래 끝은 줄마다 사실 하나가 드는 길이 — 그보다 짧으면
# 이름표 옆이 휑하다.
TREND_LEN = (35, LINE_MAX)
CHANGE_LEN = (30, LINE_MAX)
HOT_LEN = (25, LINE_MAX)
# 여론: 분위기 한 구절 + 이야기 한 가지. 시장 온도와의 견줌(옛 [온도차])은 한 줄에 안 들어 걷었다(10-04).
YEORON_LEN = (30, LINE_MAX)
HERO_RETRIES = 2

# 크게 움직인 지표가 없는 날의 '달라진 것' 줄. 모델을 부르지 않는다 — 없다는 말을 꾸밀 재료가 없다.
CHANGE_NONE = "최근 하루 새로 들어온 값 가운데 평소보다 크게 움직인 지표는 없었습니다."

# facts 대조에 걸렸을 때 다시 쓰기 문구(뒤에 " **{how}**으로 다시 쓰세요."가 붙는다).
# 틀린 숫자·이름은 되풀이하지 않는다(적어 주면 그걸 다시 쓴다). 맞는 자리만 다시 가리킨다.
CHANGE_FACTS_NOTE = (
    "방금 쓴 문장에 [달라진 것] 목록에 없는 지표나 자료 안쪽 말('목록'·'표시')이 들어갔습니다. 목록의 지표만 "
    "쓰고, 읽는 사람의 말로 같은 뜻을"
)
HOT_FACTS_NOTE = (
    "방금 쓴 문장이 자료와 어긋납니다. '← 이 지표는 문장에 쓰지 마세요' 표시가 붙은 지표는 이름도 쓰지 말고, "
    "개수는 [갈림] 줄에 적힌 것만 쓰세요. 표시가 붙은 지표가 더 뜨겁다면 다른 지표를 '가장 뜨거운'·'가장 높은'이라고 "
    "부르지 마세요. '표시'·'목록' 같은 자료 안쪽 말은 문장에 쓰지 마세요."
)
YEORON_FACTS_NOTE = (
    "방금 쓴 문장이 자료와 어긋납니다. 분위기는 [여론] 줄에 적힌 것만 쓰고, 숫자·지표 이름·자료 안쪽 말은 "
    "쓰지 말고, 같은 뜻으로"
)
# 전체나 시장 지표 안의 1등이 표시에 걸려 빠진 날에만 HOT_SYSTEM 끝에 붙는다(skipped_hotter). 모델은 목록에서 이름을 쓸 수 있는 첫
# 지표를 버릇처럼 "가장 뜨거운 ○○"라 부르는데 그날은 거짓이다.
# ⚠️ 자료에 사실 한 줄로는 안 됐다(2026-09-28 옛 주인공 문단 · Opus 첫 시도 11/11 "가장 뜨거운").
#    지시 한 줄로 0/11 — 같은 말을 처음부터 준다.
HOT_SKIP_NOTE = """

[오늘 주의] '← 이 지표는 문장에 쓰지 마세요' 표시가 붙은 지표가 전체나 시장 지표 안에서 가장 뜨겁습니다.
표시 없는 지표를 '가장 뜨거운'·'가장 높은'이라고 부르지 마세요."""

# 요약에서 **아예 언급하지 않을** 지표 — slug → 다시 풀리는 raw_value 하한.
#
# 버핏지수는 시장 지표 중 과열도가 늘 높은 편이라(2026-07-26 raw 196.75% · 과열도 71)
# '시장 지표에서 고르라'고 바꾸자마자 주인공을 독차지했다. 그런데 이건 시가총액/GDP 라
# 분기 GDP 를 따라 아주 천천히 움직인다 — 어제와 오늘이 사실상 같은 값이라, 매일 바뀌는
# '오늘의 요약'에서 할 말이 없다("너무 매크로한 지표"라는 판단).
#
# 다만 임계를 넘으면 그 자체가 사건이라 다시 풀어 준다. 230% 는 운영 판단으로 정한 선이다.
# 값은 표시 단위 그대로다(indicator_values.raw_value, 버핏지수는 % 단위).
#
# ⚠️ **여기는 요약 문장에만 걸린다. 지표 카드와는 무관하다** — 카드는 프론트가
# indicators/indicator_values 를 직접 읽어 그린다(app/page.tsx CardBuffett). 버핏지수
# 카드는 값과 상관없이 늘 그대로 뜬다.
MENTION_RAW_GATES: dict[str, float] = {"buffett_index": 230.0}


def mentionable(row: dict) -> bool:
    """이 지표를 요약 문장에 올려도 되나(주인공이든 곁다리든).

    문턱이 걸린 지표는 raw 가 그 값을 넘을 때만 통과. raw 가 없으면(아직 안 채워짐)
    보수적으로 제외한다 — 문턱을 확인 못 한 채 올리는 것보다 낫다.
    '뜨거운 곳' 줄에 자주 나와 오늘 쉬는 지표(rest, resting_names)도 여기서 빠진다.
    """
    if row.get("rest"):
        return False
    gate = MENTION_RAW_GATES.get(row.get("slug") or "")
    if gate is None:
        return True
    raw = row.get("raw")
    return raw is not None and float(raw) >= gate


# '뜨거운 곳' 줄 — 어느 HOT_WINDOW 날을 잘라 봐도 같은 지표 이름은 HOT_MAX_IN_WINDOW 날까지.
# 앞 (WINDOW−1) 날의 그 줄에 이미 MAX 번 나온 지표는 오늘 이름을 쓰지 않는다(mentionable → False,
# "초고온에 든 감성 지표 1개"처럼 종류와 개수로 말한다). 연속도 MAX 날을 못 넘는다.
#
# 2026-09-28 요청("같은 지표를 4일 연속 이상으로는 언급하지 않게") → 비교 끝에 '닷새 중 이틀'. 그때는 옛
# 주인공 문단(① 가장 뜨거운 시장 지표 뜻풀이)에 걸었다 — 옵션 풋/콜 비율이 09-11~17 7일 · 09-22~27 6일
# 연속이었다. 같은 날 세 줄 요약으로 바뀌며 주인공 문단이 없어져, 지표 이름을 늘 부르는 이 줄로 옮겼다.
# 9월 기록에 대 본 값(옛 주인공 기준 어림): 규칙 없음 풋/콜 17/27일 · 최장 7일 → 5일 중 2일 9/27 · 2일.
# '달라진 것' 줄에는 이 규칙 대신 더 느슨한 '사흘 연속 금지'를 건다(CHANGE_STREAK_MAX) — 크게 움직인 지표는 날마다
# 바뀌고, 많이 막으면 실제 움직임을 숨긴다.
HOT_WINDOW = 5
HOT_MAX_IN_WINDOW = 2
# '가장 뜨거운 ○○' 처럼 1등이라 부르는 말. 더 뜨거운 지표를 건너뛴 날엔 거짓이 된다.
SUPERLATIVE_RE = re.compile(r"(?:가장|제일)\s*(?:뜨[거겁]|높|과열)|1위")


def name_forms(name: str) -> list[str]:
    """문장에서 이 지표를 가리킬 수 있는 꼴 — 이름 그대로와, 끝의 괄호를 뗀 짧은 이름.

    "VKOSPI (변동성지수)" 를 모델이 "VKOSPI" 나 "VKOSPI(변동성지수)" 로 쓸 수 있다.
    """
    short = re.sub(r"\s*\([^)]*\)\s*$", "", name)
    forms = [name, name.replace(" (", "(")]
    if short and short != name:
        forms.append(short)
    return list(dict.fromkeys(forms))


def names_in_line(line: str, names: list[str]) -> set[str]:
    """이 줄이 이름을 꺼낸 지표들. 굵게 별표는 벗기고 찾는다."""
    plain = line.replace("**", "")
    return {n for n in names if any(f in plain for f in name_forms(n))}


def hot_line_of(summary: str | None) -> str:
    """저장된 요약에서 '뜨거운 곳' 줄. 옛 형식(이름표 없음)이면 첫 줄 — 그땐 주인공 문단이 같은 일을 했다."""
    lines = [x.strip() for x in (summary or "").split("\n") if x.strip()]
    for x in lines:
        if x.startswith("[뜨거운 곳]"):
            return x
    return "" if any(x.startswith("[") for x in lines) else (lines[0] if lines else "")


def change_line_of(summary: str | None) -> str:
    """저장된 요약에서 '달라진 것' 줄. 없으면(옛 형식 · 요약 없는 날) 빈 문자열."""
    for x in (summary or "").split("\n"):
        if x.strip().startswith("[달라진 것]"):
            return x.strip()
    return ""


# '달라진 것' 줄 — 같은 지표가 사흘 연속 나오지 않게, 앞 CHANGE_STREAK_MAX 날 그 줄에 모두 나온 지표는 오늘 목록에서 뺀다.
# 코스피 신고가 대비 괴리율이 09-30 · 10-01 · 10-02 사흘, 닷새 중 나흘 섰다(2026-10-05 운영자 지시 "같은 곳이 3일 연속으로
# 나오지는 않도록"). 그 지표가 오늘 정말 크게 움직였어도 다음 지표가 그 자리에 선다 — 하루 2~8개가 문턱을 넘는다(pick_movers 주석).
CHANGE_STREAK_MAX = 2


def change_streak_names(prev_lines: list[str], names: list[str]) -> set[str]:
    """앞 CHANGE_STREAK_MAX 날의 '달라진 것' 줄(change_line_of, **최근 날부터**)에 매일 나온 지표들 — 오늘 쉰다.
    앞 날이 모자라면(요약 없는 날 포함) 아무것도 안 쉰다 — 연속이 끊긴 것이다."""
    lines = prev_lines[:CHANGE_STREAK_MAX]
    if len(lines) < CHANGE_STREAK_MAX or not all(lines):
        return set()
    common = names_in_line(lines[0], names)
    for line in lines[1:]:
        common &= names_in_line(line, names)
    return common


def resting_names(prev_lines: list[str], names: list[str]) -> set[str]:
    """앞 (HOT_WINDOW−1) 날의 '뜨거운 곳' 줄에 이미 HOT_MAX_IN_WINDOW 번 나온 지표들 — 오늘 쉰다.

    prev_lines 는 오늘보다 앞선 daily_score 행의 그 줄(hot_line_of), **최근 날부터**. 오늘 행의 문장은
    넣지 않는다(아침에 쓴 오늘 문장을 저녁 실행이 다시 쓸 때 제 자신과 겹쳐 세지 않게).
    앞 날이 모자라도(행이 적은 초기) 있는 만큼으로 센다 — 그 안에서 이미 다 찼으면 창 안에서도 찼다.
    """
    counts: dict[str, int] = {}
    for line in prev_lines[: HOT_WINDOW - 1]:
        for n in names_in_line(line, names):
            counts[n] = counts.get(n, 0) + 1
    return {n for n, c in counts.items() if c >= HOT_MAX_IN_WINDOW}


def skipped_hotter(rows: list[dict]) -> bool:
    """표시(mentionable)에 걸려 빠진 지표가 **전체에서든 시장 지표 안에서든** 1등보다 뜨거운가 — 그날은 다른
    지표를 '가장 뜨거운'·'가장 높은'이라 부르면 거짓이다. rows 는 과열도 내림차순.

    ⚠️ 시장 지표 안도 본다. 전체 1등(베스트셀러 94%)은 쉬지 않는데 시장 1등(풋/콜 64%)이 쉬는 날, 모델이
       "시장에서는 금 대비 코스피 상대강도(63%)가 가장 높으며"라고 썼다(2026-09-28 Haiku 폴백 재현).
    """

    def skipped(scope: list[dict]) -> bool:
        pick = next((r for r in scope if mentionable(r)), None)
        return bool(scope) and pick is not None and scope[0] is not pick and scope[0]["capped"] > pick["capped"]

    return skipped(rows) or skipped([r for r in rows if r["category"] == SPOTLIGHT_CATEGORY])


# 우리 자료 안에서만 쓰는 말 — '← 이 지표는 문장에 쓰지 마세요' 표시를 모델이 "표시 없는 지표 중에서는"
# 처럼 문장에 옮겼다(2026-09-28 이름 쉬는 날 첫 시도). 읽는 사람에겐 뜻이 없는 말이다.
INNER_WORDS_RE = re.compile(r"표시|목록|\[갈림\]|\[지표별\]")

# '뜨거운 곳' 줄은 지표 **하나**만, 식은 지표는 말하지 않는다(2026-10-08 운영자 "뜨거운 곳에 식은 지표는 표현하지 않기").
# 지시문(HOT_SYSTEM)만으로 막아 왔는데 10-02~04 줄엔 "시장 지표 중 … 과열도 0%로 식어 있습니다"가 붙어 있었다 — 상한을 81자로
# 늘리며 코드로 막는다. '인식은'처럼 낱말 속 '식은'은 안 걸리게 앞 글자가 한글이면 뺀다.
COLD_RE = re.compile(r"(?<![가-힣])식(?:어|은|었|는)|저온|상온|과열도 0(?![0-9])")


def hot_problems(text: str, rows: list[dict], hot: dict[str, int], top: dict[str, int]) -> list[str]:
    """'뜨거운 곳' 줄이 표시 붙은 지표를 꺼냈거나, 건너뛴 날에 '가장 뜨거운'이라 불렀거나, 개수가 틀렸거나,
    자료 안쪽 말을 옮겼거나, 지표를 둘 넘게 꺼냈거나, 식은 지표를 말했으면."""
    plain = text.replace("**", "")
    found = [
        f"쓰지 않을 지표 {r['name']}"
        for r in rows
        if not mentionable(r) and any(f in plain for f in name_forms(r["name"]))
    ]
    if skipped_hotter(rows) and SUPERLATIVE_RE.search(plain):
        found.append("'가장' 표현")
    if INNER_WORDS_RE.search(plain):
        found.append("안쪽 말")
    if len(names_in_line(plain, [r["name"] for r in rows])) > 1:
        found.append("지표 둘 이상")
    if COLD_RE.search(plain):
        found.append("식은 지표 표현")
    return found + balance_count_problems(plain, hot, top)


def change_problems(text: str, mover_names: set[str], names: list[str]) -> list[str]:
    """'달라진 것' 줄이 목록 밖 지표를 꺼냈거나 자료 안쪽 말을 옮겼으면."""
    found = [f"목록 밖 지표 {n}" for n in sorted(names_in_line(text, names) - mover_names)]
    return found + (["안쪽 말"] if INNER_WORDS_RE.search(text.replace("**", "")) else [])


# ── 크게 움직인 지표(달라진 것) ──────────────────────────────────────────────────────────
#
# 최근 하루 새로 들어온 값 가운데 **그 지표의 평소 변화 폭**(직전 MOVER_WINDOW 번 변화의 절댓값 중앙값)의
# MOVERS_MIN_TIMES 배를 넘은 것, 큰 순서로 MOVERS_LIMIT 개.
# - 과열도가 아니라 **원값**으로 잰다. calculate_score 는 최신 행의 과열도만 다시 셈해서 옛 행은 옛
#   눈금이다 — 과열도끼리 빼면 눈금을 손본 날 시장과 무관한 변화가 생긴다(07-30 개인 순매수 원값
#   80,469 → 80,712 인데 과열도 110.6 → 66).
# - 값이 가끔만 바뀌는 지표(베스트셀러 비중 5%→6% · 매매 안전장치 0.25→0.33)는 중앙값이 0 이라 평균으로
#   나눈다. 안 그러면 한 번 움직일 때마다 무한대로 1등이 된다.
# - '새 값'은 행이 DB 에 **처음 들어온 시각**(created_at)으로 가른다. 자료 날짜로 가르면 하루 늦게 오는
#   검색 지표가 같은 변화를 이틀 들고 온다. 휴장으로 새 값이 없는 KRX 지표는 저절로 빠진다.
# 2026-09-14~27 을 되돌려 재 보니 하루 2~8개가 두 배를 넘었고 날마다 다른 지표가 위에 섰다.
MOVERS_LIMIT = 3
MOVERS_MIN_TIMES = 2.0
MOVERS_FRESH_HOURS = 24
MOVER_WINDOW = 15
MOVER_MIN_CHANGES = 5


def pick_movers(rows: list[dict], now: datetime) -> list[dict]:
    """rows 의 각 행: values(원값, 오래된→최신) · created_at(최신 값이 들어온 ISO 시각) · direction."""
    out: list[tuple[float, dict]] = []
    for r in rows:
        created = r.get("created_at")
        if not created:
            continue
        age = (now - datetime.fromisoformat(str(created).replace("Z", "+00:00"))).total_seconds()
        if not (0 <= age <= MOVERS_FRESH_HOURS * 3600):
            continue
        v = [float(x) for x in r.get("values") or []]
        if len(v) < MOVER_MIN_CHANGES + 2:
            continue
        last = v[-1] - v[-2]
        if last == 0:
            continue
        past = [abs(v[i] - v[i - 1]) for i in range(len(v) - 2, 0, -1)][:MOVER_WINDOW]
        if len(past) < MOVER_MIN_CHANGES:
            continue
        mid = median(past)
        scale = mid if mid > 0 else sum(past) / len(past)
        if not scale > 0:
            continue
        times = abs(last) / scale
        if times < MOVERS_MIN_TIMES:
            continue
        out.append((times, {**r, "times": times, "hotter": (last > 0) == (r.get("direction") != "low")}))
    out.sort(key=lambda x: -x[0])
    return [m for _, m in out[:MOVERS_LIMIT]]


# ── 여론(카더라) ─────────────────────────────────────────────────────────────────────
# 분위기 → 문장에 쓸 말. 카더라 히어로 제목(app/kadera/page.tsx headline)과 같은 말이다.
YEORON_TONE_WORDS = {"낙관 우세": "낙관이 우세", "중립": "낙관과 비관이 팽팽", "비관 우세": "비관이 우세"}
# 문장이 다른 분위기를 말했는지 가르는 꼴. '우세'·'팽팽'을 앞뒤 낱말과 함께 본다.
_TONE_PATTERNS = {
    "낙관 우세": re.compile(r"낙관(?:이|적인 [^.,]{0,6})?\s*우세|낙관 쪽으로 기울"),
    "중립": re.compile(r"팽팽|엇비슷|중립"),
    "비관 우세": re.compile(r"비관(?:이|적인 [^.,]{0,6})?\s*우세|비관 쪽으로 기울"),
}
# 이 날짜보다 오래된 총평이면 여론 줄을 안 쓴다(총평 단계가 실패한 날). 전날 총평까지는 받는다 — 아침
# 실행이 그날 총평보다 먼저 도는 경우를 막으려는 여유다.
YEORON_MAX_AGE_DAYS = 1


def yeoron_tone(sent_rows: list[dict], latest: str, floor: int | None = None) -> str | None:
    """카더라 히어로와 같은 창(KR.sentiment_window)으로 센 전체 낙관도의 구간 이름(KR.tone_label).

    `sent_rows` 는 카더라 큰 숫자와 같은 재료다 — 시장 글 표(common/market_sentiment)가 있으면 그 행을
    scope='overall' 로 넘기고 `floor` 는 MARKET_MIN_MESSAGES, 없으면 예전 전체 글 행과 기본 문턱.
    """
    overall = [r for r in sent_rows if r.get("scope") == "overall"]
    count_by_date = {r["date"]: r.get("message_count") or 0 for r in overall}
    days = set(KR.sentiment_window(count_by_date, latest, floor or KR.SENTIMENT_MIN_MESSAGES))
    pos = sum(r.get("positive_count") or 0 for r in overall if r["date"] in days)
    neg = sum(r.get("negative_count") or 0 for r in overall if r["date"] in days)
    opt = KR.optimism(pos, neg)
    return None if opt is None else KR.tone_label(opt)


def brief_story(summary: str | None) -> str:
    """카더라 총평의 둘째 대목(테마 지형). 대목은 빈 줄로 갈린다(app/kadera/page.tsx 와 같은 규칙)."""
    paras = [p.strip() for p in re.split(r"\n{2,}", summary or "") if p.strip()]
    return paras[1] if len(paras) > 1 else ""


def yeoron_digest(tone: str, story: str) -> str:
    """여론 줄의 자료 — 분위기와 이야기. 시장 온도와 엇갈리는 날의 [온도차] 줄은 한 줄에 안 들어 걷었다(2026-10-04)."""
    lines = [f"[여론] 최근 주식 텔레그램 채널 글의 분위기: {YEORON_TONE_WORDS[tone]}"]
    if story:
        lines += ["[이야기] 카더라 총평에서 발췌", story]
    return "\n".join(lines)


def yeoron_problems(text: str, tone: str, names: list[str]) -> list[str]:
    """여론 줄이 다른 분위기를 말했거나, 숫자·지표 이름·자료 안쪽 말을 옮겼으면."""
    plain = text.replace("**", "")
    found = [f"분위기 {t}" for t, pat in _TONE_PATTERNS.items() if t != tone and pat.search(plain)]
    if re.search(r"\d\s*(?:%|건|회|개)", plain):
        found.append("숫자")
    if names_in_line(plain, names):
        found.append("지표 이름")
    # 재료 이름을 옮기는 것도 안쪽 말이다("카더라 총평에 따르면") — 읽는 사람에겐 출처가 두 겹이 된다.
    if INNER_WORDS_RE.search(plain) or re.search(r"총평|발췌", plain):
        found.append("안쪽 말")
    return found


# ── 마지막 문장(모든 후보가 사실 대조에 걸렸을 때) ─────────────────────────────────────────
# 다시 쓰기를 다 써도 후보가 전부 어긋나면 모델 문장 대신 자료로 지은 문장을 쓴다. 이름 뒤에 조사를 붙이지
# 않게 짓는다(받침을 몰라도 된다). 2026-09-28 Haiku(API 폴백 때 쓰는 모델)가 시장 1등이 쉬는 날 세 번 모두
# "시장 지표 중 금 대비 코스피 상대강도가 가장 높습니다"라고 써서 넣었다 — 그대로 저장하면 거짓이 나간다.
def _named(r: dict, with_pct: bool = True) -> str:
    # 과열도는 '%' 없이 이름을 붙인다 — '(75%)'는 비중 지표(경제 베스트셀러 비중 6.00%)의 값처럼 읽혔다(2026-10-04 점검).
    return f"**{r['name']}**(과열도 {js_round(r['capped'])})" if with_pct else f"**{r['name']}**"


def hot_fallback(rows: list[dict], hot: dict[str, int]) -> str:
    """'뜨거운 곳' 한 곳 — 초고온 가운데 이름을 쓸 수 있는 가장 뜨거운 지표 하나. 다 쉬면 종류와 개수,
    초고온이 없으면 1등(1등이 쉬면 '없다'만). rows 는 과열도 내림차순."""
    hots = [r for r in rows if r["hot"]]
    named = [r for r in hots if mentionable(r)]
    if not hots:
        # '가장'은 1등을 건너뛴 날엔 거짓이라(skipped_hotter) 그런 날엔 안 붙인다.
        if rows and mentionable(rows[0]) and not skipped_hotter(rows):
            return f"초고온에 든 지표는 없고 과열도가 가장 높은 지표는 {_named(rows[0])}입니다."
        return "초고온에 든 지표는 없습니다."
    if named:
        if len(hots) == 1:
            return f"초고온에 든 지표는 {_named(named[0])} 하나입니다."
        return f"초고온에 든 지표 {len(hots)}개 가운데 하나는 {_named(named[0])}입니다."
    kinds = " · ".join(f"{k} 지표 {n}개" for k, n in hot.items() if n)
    return f"초고온에는 {kinds}가 들었습니다."


def change_fallback(movers: list[dict]) -> str:
    """앞의 둘만 — 셋이면 한 줄(LINE_MAX)을 넘는다."""
    parts = " · ".join(f"{_named(m, with_pct=False)}({'더 뜨거워짐' if m['hotter'] else '식음'})" for m in movers[:2])
    return f"최근 하루 평소보다 크게 움직인 지표는 {parts}입니다."


def change_digest(movers: list[dict]) -> str:
    """'달라진 것' 줄이 보는 자료. 숫자는 안 넣는다(CHANGE_SYSTEM 주석). 지표의 '뜻:'은 한 줄에 안 들어 뺐다(2026-10-04)."""
    lines = ["[달라진 것] 최근 하루 새로 들어온 값 가운데 평소 변화 폭보다 크게 움직인 지표(크게 움직인 순서)"]
    for m in movers:
        lines.append(f"- {m['name']} ({m['category']}): {'더 뜨거워짐' if m['hotter'] else '식음'}")
    return "\n".join(lines)


def normalize_category(raw: str | None) -> str:
    """레거시 category 값(정통/밈)을 현재 명칭(시장/감성)으로 정규화.

    lib/data.ts 의 normalizeCategory 와 같은 규칙이다. 프론트는 이미 이 보정을 하고
    있어서, 여기서 안 하면 프롬프트의 '시장'과 DB 의 '정통'이 안 맞을 수 있다.
    """
    return "시장" if raw in ("정통", "시장") else "감성"


_DOW = "월화수목금토일"  # date.weekday() 0=월 … 6=일


def day_tag(d: date, today: date) -> str:
    """이 날짜에 붙일 꼬리표. **달력상 진짜 오늘/어제일 때만** 붙는다.

    목록의 마지막·마지막에서 두 번째 줄에 무조건 '오늘'·'어제'를 다는 게 아니다. 파이프라인이
    하루 걸러 돌거나 daily_score 행이 비면 그 자리는 어제가 아니고, 그때 라벨을 달면 날짜를
    못박으려고 넣은 장치가 그 자체로 새 거짓말이 된다. 그러면 날짜만 적고 만다 — 모델이
    '어제'라는 말을 못 쓰게 되는 게 아니라, 며칠 전인지 세어 볼 근거를 그대로 갖는다.

    common/broadcast_content.morning_day_words 가 같은 판단을 한다(PR #153·#157). 저쪽은
    '어제가 아니면 날짜를 못박는다'를 문장 쓰는 쪽에서 했고, 여기는 자료 쪽에서 한다.
    """
    if d == today:
        return "  ← 오늘"
    if d == today - timedelta(days=1):
        return "  ← 어제"
    return ""


def trend_lines(recent: list[tuple[str, float]], today: date | None = None) -> list[str]:
    """[최근 추세] 블록 — 날짜 하나에 한 줄. 오래된→최신 순으로 받는다.

    **화살표 사슬(`25 → 26 → … → 39`)로 주면 안 된다.** 그러면 '어제'가 위치 세기가 되어
    모델이 한 칸씩 밀린다. 2026-08-02 프로덕션 문장이 그렇게 나왔다: 실제로는 08-01 41℃ ·
    08-02 39℃ 인데 "어제 28℃로 급락한 후 오늘 39℃로 다시 올라온"이라 적어, 어제 값도 마지막
    두 날의 순서도 방향도 틀렸다. 방향이 뒤집힌 탓에 **같은 화면 탑바가 ▼2 를 그리는데 문장은
    올랐다고 하는** 정면 모순이 났다.

    같은 지표 자료로 두 시계열 × 40회씩, **sized_sentence 재시도까지 태워** 재현했다
    (2026-08-02, 저장되는 문장 기준 80건):

        화살표          없는 숫자 14/80 · 날짜값 오류 6/80 · 방향 뒤집힘 1/80
        날짜 라벨        없는 숫자  0/80 · 날짜값 오류 0/80 · 방향 뒤집힘 0/80

    화살표 쪽 80건에 이번 프로덕션 사고가 그대로 다시 나왔다("어제 28℃로 내려갔다가 오늘
    39℃로 다시 올라온"). 재현되는 결함이지 하루치 운이 아니다.

    **대가는 길이다.** 날짜를 짚게 되니 문장이 길어진다 — 중앙 66→70자(A) · 70→82자(B),
    90자 초과는 재시도 뒤에도 0/80 → 5/80(최대 97자), 평균 호출 1.3→1.45회. 삼키기로 한
    값이다. 늘어난 자리는 군더더기가 아니라 날짜 자체고, 벗어나는 5건도 상한을 몇 자 넘길
    뿐이다. TREND_LEN 을 같이 넓히지 않은 건 눈금을 하나 건드리면 짝이 딸려 움직여서다.

    ⚠️ **TREND_SYSTEM 을 같이 고치지 말 것.** 채택 전 4개 변형 비교(첫 시도 기준 40회씩)에서
    날짜 라벨에 '적힌 값만 쓰라'는 프롬프트를 겹쳤더니 모델이 날짜를 전부 나열해 33/40 이
    90자를 넘고 중앙값이 100자대가 됐다. "날짜를 전부 나열하지 마세요"를 넣어도 안 들었다 —
    자료가 날짜 목록이면 따라 나열한다. 라벨만 넣은 쪽이 길이 대비 효과가 가장 좋았다.

    ⏳ 잠복: 프롬프트 예시의 "50℃대"를 모델이 그대로 베껴 쓴다(화살표 쪽 '없는 숫자'
    14/80 이 거의 전부 이것). 날짜 라벨만으로 0/80 이 돼 이번엔 안 건드렸다. 예시를 손볼
    거면 그것만 따로 40회 재고 판단할 것.

    ⭐ **마지막 줄이 오늘이 아니면 그 사실을 한 줄로 못박는다.** 파이프라인이 그날 점수를 못 쓴
    날(실패·건너뜀)엔 최신 행이 어제라 마지막 줄에 '← 어제'만 붙는데, 모델이 그 값을 "오늘
    33℃"로 적었다(2026-09-12 재현, 최신 행 09-11). 라벨이 '어제'라고 적혀 있어도 프롬프트
    예시("오늘 25℃까지")와 '목록의 끝 = 오늘'이라는 습관이 이긴다. 같은 자료로 쓰기를 막고
    스크립트를 통째로 돌려 잰 값(저장되는 문장 기준):

        라벨만                                    '오늘' 오기  7/40 (Haiku) · 20/20 (Sonnet 5)
        + "오늘 값은 아직 없습니다. 마지막 줄의 33℃는 어제 값입니다."   0/60 (Haiku) · 0/20 (Sonnet 5)

    길이는 안 움직였다(Haiku 중앙 56→56 · 55 미만 7/40→11/60 · 90 초과 0→0 · 추세 호출 1.9→1.7회).
    **쓰라·쓰지 말라는 말을 덧붙이면 안 된다.** 같은 줄 끝에 "'오늘 33℃'라고 쓰지 마세요"를
    더한 판은 오기 0/40 이지만 55 미만이 7→20/40 으로 늘고 호출이 2.3회로 늘었다. "'어제
    33℃'로 쓰세요"는 23/40 이 55 미만이었다. 사실 한 줄이면 충분하고 지시를 겹치면 문장이
    움츠러든다. TREND_SYSTEM 을 안 건드린 까닭도 같다(위). 오늘 행이 있는 보통 날엔 이 줄이
    안 붙어 그날의 자료와 문장은 그대로다. 이틀 넘게 밀린 날은 '어제' 대신 날짜를 적는데
    그 판은 따로 재지 않았다(자료 모양만 확인).
    """
    ref = today or today_kst()
    lines = ["[최근 추세] 햇쩨 지수(℃) 날짜별"]
    for iso, s in recent:
        d = date.fromisoformat(iso)
        lines.append(f"- {d.month}월 {d.day}일({_DOW[d.weekday()]}): {js_round(s)}℃{day_tag(d, ref)}")
    if recent:
        last_iso, last_s = recent[-1]
        last = date.fromisoformat(last_iso)
        if last < ref:
            when = (
                "어제"
                if last == ref - timedelta(days=1)
                else f"{last.month}월 {last.day}일({_DOW[last.weekday()]})"
            )
            lines.append(
                f"  ※ 오늘({ref.month}월 {ref.day}일) 값은 아직 없습니다. "
                f"마지막 줄의 {js_round(last_s)}℃는 {when} 값입니다."
            )
    return lines


# 갈림 문단이 견주는 두 종류의 이름. normalize_category 가 돌려주는 값과 같다.
BALANCE_KINDS = ("시장", "감성")
BALANCE_TOP_N = 5


# 지표 둘이 카드 한 장인 짝 — 화면(app/home/Hero.tsx ANCHOR_ALIAS)이 카드로 센다. 개수 말('감성 지표 N개')도 같은 단위여야 한다(2026-10-08).
CARD_ALIAS = {"fine_dining_search_index": "luxury_consumption_index"}


def balance_counts(rows: list[dict]) -> tuple[dict[str, int], dict[str, int]]:
    """종류별 (초고온에 든 개수, 상위 BALANCE_TOP_N 안의 개수). rows 는 과열도 내림차순.

    **카드 단위로** 센다 — 짝(CARD_ALIAS)은 더 뜨거운 쪽(먼저 나온 행) 하나만 남긴다. 화면의 모듈 머리 · 햇쩨 지수 머리가 카드를 세는데
    여기서 지표로 세면 둘 다 초고온인 날 문장이 '감성 지표 2개'라고 적어 화면의 '초고온 1'과 갈린다."""
    paired = set(CARD_ALIAS) | set(CARD_ALIAS.values())
    seen: set = set()
    cards = []
    for r in rows:
        slug = r.get("slug") or ""
        # 짝이 아닌 행은 행마다 따로 센다(slug 가 비거나 같은 값이어도 — 테스트 행은 slug 가 다 'x' 다).
        key = CARD_ALIAS.get(slug, slug) if slug in paired else id(r)
        if key in seen:
            continue
        seen.add(key)
        cards.append(r)
    hot = {k: sum(1 for r in cards if r["hot"] and r["category"] == k) for k in BALANCE_KINDS}
    top = {k: sum(1 for r in cards[:BALANCE_TOP_N] if r["category"] == k) for k in BALANCE_KINDS}
    return hot, top


# 갈림 문장이 개수를 적는 꼴. "시장 지표 3개" · "감성지표가 2개" · "시장 지표는 0개" · "감성 지표만 1개".
BALANCE_COUNT_RE = re.compile(r"(시장|감성)\s*지표(?:\s*(?:는|이|가|도|만|의|를|은))?\s*(\d+)\s*개")
# "두 종류가 각각 1개씩" — 종류 이름 없이 둘을 한꺼번에 세는 꼴.
BALANCE_EACH_RE = re.compile(r"각각\s*(\d+)\s*개")


def balance_count_problems(text: str, hot: dict[str, int], top: dict[str, int]) -> list[str]:
    """갈림 문장에 적힌 개수가 [갈림] 줄의 것과 다르면 그 자리를 돌려준다(비면 통과).

    프롬프트가 "근거 숫자도 [갈림] 줄의 것만 쓰세요"라고 못박아도 모델이 상위 5개 자리의 3을
    초고온 자리에 옮겨 적었다(2026-09-08 프로덕션, 같은 화면의 코드 문단은 2개·타일은 2장).
    글자로 지시한 것은 글자로 뚫리니, 개수는 코드가 다시 세어 대조한다.

    자리 판정: 개수가 든 **절**(쉼표·마침표 사이)에서 '상위'와 '초고온' 중 어느 쪽이 있나 본다.
    하나만 있으면 그것, 둘 다 있으면 개수 **앞**에서 가장 가까운 것(우리말은 틀을 먼저 말한다 —
    "초고온 구간에 N개", "상위 5개 안에 N개"), 절에 없으면 앞 절에서 이어 온 마지막 낱말, 그것도
    없으면 초고온. 저장된 62문장의 꼴로 맞췄다 — "초고온 구간에는 두 종류가 각각 1개씩 들었으나
    상위 5개 안에는 시장 지표 3개, 감성 지표 2개로" 에서 '각각 1개'는 초고온, '시장 지표 3개'는
    상위, 쉼표 뒤 '감성 지표 2개'는 앞에서 이어 온 상위로 갈린다.

    ⚠️ 검사는 좁게만 한다. 여기서 못 잡는 꼴(개수를 아예 안 적은 문장·"시장 지표는 없으며")은
    그냥 통과다. 잡는 것은 **적힌 개수가 틀린 것**뿐이다.

    ⚠️ 굵게 표시(`**`)를 먼저 벗긴다. Opus 5.5 는 개수를 "감성 지표만 **1개**"처럼 굵게 쓰는데,
       그대로 두면 정규식이 `지표`와 숫자 사이의 별표에 걸려 **아무것도 못 잡고 통과시킨다**
       (2026-09-28 확인. Haiku 는 3주 동안 22문장 모두 개수를 굵게 안 써서 드러나지 않았다).
    """
    text = text.replace("**", "")
    words = (("상위", "top"), ("초고온", "hot"))

    def scope(pos: int) -> str:
        left = max(text.rfind(",", 0, pos), text.rfind(".", 0, pos)) + 1
        stops = [i for i in (text.find(",", pos), text.find(".", pos)) if i >= 0]
        right = min(stops) if stops else len(text)
        clause = text[left:right]
        inside = {kind: [m.start() + left for m in re.finditer(word, clause)] for word, kind in words}
        present = [k for k, hits in inside.items() if hits]
        if len(present) == 1:
            return present[0]
        if len(present) == 2:
            before = [(pos - i, k) for k, hits in inside.items() for i in hits if i < pos]
            if before:
                return min(before)[1]
        # 절에 없다(또는 둘 다 뒤에 있다) — 앞에서 마지막으로 나온 틀을 이어받는다.
        carried = [(text.rfind(word, 0, pos), kind) for word, kind in words]
        carried = [(i, k) for i, k in carried if i >= 0]
        return max(carried)[1] if carried else "hot"

    found: list[str] = []
    for m in BALANCE_COUNT_RE.finditer(text):
        kind, n = m.group(1), int(m.group(2))
        where = scope(m.start())
        expect = (top if where == "top" else hot)[kind]
        if n != expect:
            found.append(f"{'상위' if where == 'top' else '초고온'} {kind} {n}개")
    for m in BALANCE_EACH_RE.finditer(text):
        n = int(m.group(1))
        where = scope(m.start())
        ref = top if where == "top" else hot
        if not all(ref[k] == n for k in BALANCE_KINDS):
            found.append(f"{'상위' if where == 'top' else '초고온'} 각각 {n}개")
    return found


def keep_bold_names(text: str, names: list[str]) -> str:
    """굵게(`**…**`)는 **지표 이름에만** 남기고 나머지는 벗긴다. 짝이 안 맞으면 전부 벗긴다.

    화면(app/home/Hero.tsx renderBriefLine)이 굵은 지표 이름을 그 카드로 잇는다 — 굵은 조각이 곧 링크다.
    Opus 5.5 는 '중요한 부분은 굵게' 지시를 문장마다 따라 한 번에 10곳 가까이 굵게 썼다(2026-09-28 · 8회
    중앙 9.5곳, 숫자·개수·온도까지). 프롬프트도 '지표 이름만'으로 좁혔지만 여기서 한 번 더 거른다.
    """
    parts = text.split("**")
    if len(parts) % 2 == 0:
        return text.replace("**", "")
    forms = {f for n in names for f in name_forms(n)}
    out = [parts[0]]
    for i in range(1, len(parts), 2):
        inner, after = parts[i], parts[i + 1]
        out.append(f"**{inner}**" if inner.strip() in forms else inner)
        out.append(after)
    return "".join(out)


def balance_verdict_lines(rows: list[dict]) -> list[str]:
    """[갈림] 블록 — **어느 종류가 더 뜨거운지를 파이썬이 정해 적어 준다.**

    판정을 모델에 맡기고 기준만 프롬프트에 적었더니(초고온 개수 → 같으면 상위 5개) 같은
    자료로 방향이 갈렸다. 실측 6회 중 1회, 프로덕션 사흘 중 하루(2026-09-07 저녁)는 첫
    문장이 "감성이 더 고온"이라 해 놓고 둘째 문장이 "시장이 앞서는 구성"이라 적어 한 문단
    안에서 앞뒤가 어긋났다. 규칙은 결정적이니 코드가 세고, 모델은 그 결과를 문장으로만 옮긴다.

    기준: 초고온(과열도 75 이상)에 든 개수가 많은 쪽 → 같으면 상위 BALANCE_TOP_N 안의 개수가
    많은 쪽 → 그것도 같으면 '비슷하다'. rows 는 과열도 내림차순으로 정렬돼 들어온다.
    """
    hot, top = balance_counts(rows)
    m, s = BALANCE_KINDS
    if hot[m] != hot[s]:
        hotter = m if hot[m] > hot[s] else s
        why = "초고온에 든 개수"
    elif top[m] != top[s]:
        hotter = m if top[m] > top[s] else s
        why = f"상위 {BALANCE_TOP_N}개 안의 개수"
    else:
        hotter = None
        why = ""
    verdict = f"{hotter} 지표가 더 뜨겁습니다({why} 기준)" if hotter else "두 종류가 비슷한 수준입니다"
    return [
        f"[갈림] {verdict}",
        f"  초고온에 든 지표: 시장 {hot[m]}개 · 감성 {hot[s]}개 / 상위 {BALANCE_TOP_N}개 안: 시장 {top[m]}개 · 감성 {top[s]}개",
        "  ※ 방향은 이 줄이 정한 대로 쓰세요. 근거 숫자도 이 줄의 것만 쓰세요.",
    ]


def build_digest(
    score: float,
    stage: str,
    hot_count: int,
    rows: list[dict],
    recent: list[tuple[str, float]],
    *,
    index_lines: bool = True,
    desc: bool = True,
) -> str:
    """LLM에 넘길 지표 요약(사람이 읽는 한글 텍스트). 과열도 높은 순으로 정렬해
    모델이 '눈여겨볼 지표'를 고르기 쉽게 한다.

    과열도(capped progress)에는 이미 지표별 방향(high/low)이 반영돼 있어, 이 값 하나가
    '얼마나 뜨거운지'의 단일 척도다. raw 현재값/기준값을 같이 주면 모델이 '현재<기준=식음'
    처럼 방향을 거꾸로 읽는 일이 생겨(예: 상대강도 지표) 일부러 뺀다.

    헤드라인 '햇쩨 지수'는 온도(℃)로, 개별 지표는 기준선까지의 진행률('과열도 75', % 없이)로
    적는다. %를 붙이면 비중 지표의 값처럼 읽힌다(2026-10-04).

    - [최근 추세]: 3번째 문단(추세)용. 최근 며칠 햇쩨 지수를 (날짜, 점수) 쌍으로,
      오래된→최신 순으로 받아 날짜별 목록으로 적는다(trend_lines 주석 참고).
    - [지표별]의 '뜻:' : 1번째 문단(주인공 뜻풀이)용. 주인공 카테고리(시장) 상위
      DESC_TOP_N개에만 설명문을 붙여, 모델이 지표 의미를 지어내지 않고 근거 있게 풀도록
      한다. 시장 지표가 아예 없는 날을 대비해, 그때는 순서대로 앞 N개에 붙인다.

    ⭐ `index_lines=False` 는 **햇쩨 지수(℃)가 든 두 블록**([전체]·[최근 추세])을 뺀다.
      갈림 문단(BALANCE) 전용이다. 프롬프트로 "온도를 말하지 말라"고만 하면 안 듣는다 —
      2026-09-06 프로덕션 문장이 "어제 26℃에서 오늘 31℃로 5℃ 반등했으며, 감성 지표가…"
      로 시작해 **바로 다음 문단과 같은 말을 두 번** 했다. 재료에 ℃ 가 있으면 문장이
      그걸 집는다. 문단이 여럿인 요약에서 되풀이되는 고장이다 — 한 문단에 재료를
      더해 주면 그 문단이 옆 문단의 일까지 해 버린다. 역할을 가르는 자리는 프롬프트가
      아니라 **각 문단이 보는 자료**다.
      갈림 문단이 쓸 근거는 [지표별]의 카테고리와 과열도뿐이라, 빼도 할 말은 그대로다."""
    lines: list[str] = []
    if index_lines:
        lines.append(
            f"[전체] 햇쩨 지수 {js_round(score)}℃ · {stage} 구간 · 초고온 구간에 든 지표 {hot_count}개"
        )
        if recent:
            lines += trend_lines(recent)
        lines.append("")  # 위 블록과 [지표별] 사이를 띄운다. 위가 비면 띄울 것도 없다.
    if not index_lines:
        lines += balance_verdict_lines(rows)
        lines.append("")
    lines.append("[지표별] 과열도 높은 순 (0=저온 ~ 100=초고온, '초고온'=과열도 75 이상)")
    # 문턱에 걸린 지표(MENTION_RAW_GATES)는 후보에서 빼고, 목록에는 남기되 표시를 단다 —
    # 지워 버리면 모델이 보는 '가장 뜨거운 지표'가 실제와 달라져 다른 문장까지 어긋난다.
    eligible = [r for r in rows if mentionable(r)]
    spotlight_pool = [r for r in eligible if r["category"] == SPOTLIGHT_CATEGORY] or eligible or rows
    desc_names = {r["name"] for r in spotlight_pool[:DESC_TOP_N]}
    for r in rows:
        hot_mark = " · 초고온" if r["hot"] else ""
        gate_mark = "" if mentionable(r) else "  ← 이 지표는 문장에 쓰지 마세요"
        lines.append(f"- {r['name']} ({r['category']}): 과열도 {js_round(r['capped'])}{hot_mark}{gate_mark}")
        if desc and r["name"] in desc_names and r.get("desc"):
            lines.append(f"    뜻: {r['desc']}")
    return "\n".join(lines)


def main() -> None:
    if not HAS_LLM_CREDENTIAL:
        # 키가 없으면 조용히 건너뛴다(설정 전 로컬/CI에서도 파이프라인이 안 깨지게).
        print("[skip] LLM 자격(구독 토큰·API 키)이 없어 요약 생성을 건너뜁니다.")
        return

    client = get_client()

    # 프론트가 보여주는 '최신' daily_score 행에 요약을 붙인다(오늘 계산이 안 돌았어도
    # 최신 날짜 기준으로 맞춘다). 최근 8일을 받아 '흐름' 줄의 궤적을 만든다. 앞 날들의 요약은
    # '뜨거운 곳' 줄의 이름 쉬기(resting_names)에 쓴다.
    ds = (
        client.table("daily_score")
        .select("date, score, stage, ai_summary")
        .order("date", desc=True)
        .limit(8)
        .execute()
    )
    if not ds.data:
        print("[skip] daily_score 행이 없어 요약할 대상이 없습니다.")
        return
    target_date = ds.data[0]["date"]
    score = float(ds.data[0]["score"])
    # 최신순으로 받았으니 뒤집어 오래된→최신 순으로. 추세 서술용.
    # **날짜를 같이 넘긴다** — 점수만 주면 모델이 '어제'를 위치로 세다 한 칸씩 민다(trend_lines).
    recent = [(r["date"], float(r["score"])) for r in reversed(ds.data)]
    stage = stage_for_score(score)  # 저장된 라벨 대신 점수에서 재계산(프론트와 동일 규칙)

    # 공개 지표 + 각 지표의 최근 값. normalized_score는 calculate_score가 저장한 원본
    # 진행률(캡핑 전)이라, 여기서 캡핑/Hit을 다시 계산한다. 원값 이력(values)과 최신 값이 들어온
    # 시각(created_at)은 '달라진 것'(pick_movers)에 쓴다.
    indicators = (
        client.table("indicators")
        .select("id, slug, name, category, description_beginner, direction")
        .eq("is_public", True)
        .order("created_at", desc=False)
        .execute()
    )

    names = [ind["name"] for ind in indicators.data]
    resting = resting_names([hot_line_of(r.get("ai_summary")) for r in ds.data[1:]], names)
    for n in sorted(resting):
        print(f"[뜨거운 곳] {n} — 앞 {HOT_WINDOW - 1}일 그 줄에 {HOT_MAX_IN_WINDOW}번 이상 나와 오늘은 이름을 쉽니다.")
    change_resting = change_streak_names([change_line_of(r.get("ai_summary")) for r in ds.data[1:]], names)
    for n in sorted(change_resting):
        print(f"[달라진 것] {n} — 앞 {CHANGE_STREAK_MAX}일 연속 그 줄에 나와 오늘은 뺍니다.")

    rows: list[dict] = []
    for ind in indicators.data:
        iv = (
            client.table("indicator_values")
            .select("date, normalized_score, raw_value, created_at")
            .eq("indicator_id", ind["id"])
            .order("date", desc=True)
            .limit(MOVER_WINDOW + 3)
            .execute()
        )
        if not iv.data:
            continue
        progress = iv.data[0].get("normalized_score")
        if progress is None:
            continue  # 아직 진행률이 안 채워진 지표는 제외
        capped = cap_progress(float(progress))
        rows.append(
            {
                "name": ind["name"],
                "category": normalize_category(ind.get("category")),
                "desc": ind.get("description_beginner"),
                "capped": capped,
                # 화면(app/home/parts.tsx isHit)과 같이 반올림한 값으로 — 74.65 가 화면엔 '75'·초고온인데 요약은 아니라고 셌다.
                "hot": js_round(capped) >= HOT_ZONE,
                # 이름 쉬기·크게 움직임 판정에만 쓴다. digest 에는 원값을 넣지 않는다 — raw 를 보여주면
                # 모델이 방향을 거꾸로 읽는다(build_digest 주석 참고).
                "slug": ind.get("slug"),
                "raw": iv.data[0].get("raw_value"),
                "rest": ind["name"] in resting,
                "direction": ind.get("direction"),
                "values": [x["raw_value"] for x in reversed(iv.data) if x.get("raw_value") is not None],
                "created_at": iv.data[0].get("created_at"),
            }
        )

    if not rows:
        print("[skip] 요약할 지표 값이 없습니다.")
        return

    rows.sort(key=lambda r: r["capped"], reverse=True)
    hot_count = sum(1 for r in rows if r["hot"])
    # 흐름 줄: 옛 추세 문단과 같은 자료(℃ 블록 + 지표 목록).
    digest = build_digest(score, stage, hot_count, rows, recent)
    # 뜨거운 곳 줄: ℃ 블록을 빼고 [갈림] 개수를 넣은 자료(옛 갈림 문단의 것). ℃ 가 있으면 흐름 줄의 일까지
    # 해 버린다(build_digest 의 index_lines 주석). '뜻:'도 뺀다 — 이 줄은 뜻풀이가 아니다.
    hot_digest = build_digest(score, stage, hot_count, rows, recent, index_lines=False, desc=False)
    movers = pick_movers([r for r in rows if r["name"] not in change_resting], datetime.now(timezone.utc))
    change_src = change_digest(movers)

    print("─" * 60)
    print(digest)
    print("─" * 60)
    print(change_src if movers else "[달라진 것] 없음")
    print("─" * 60)

    anthropic = get_llm_client(ANTHROPIC_API_KEY)

    def one_sentence(system: str, source: str) -> str:
        resp = anthropic.messages.create(
            model=MODEL,
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": source}],
        )
        # 별표(**...**)는 굵게 표시용이라 유지한다 — 프론트가 파싱해 <b>로 렌더한다.
        return "".join(b.text for b in resp.content if b.type == "text").strip()

    def seen(t: str) -> int:
        """화면에 보이는 글자 수 — 굵게 별표는 뺀다. Opus 는 굵게를 많이 써서 별표째 세면 길이가 부풀었다."""
        return len(t.replace("**", ""))

    def sized_sentence(
        system: str,
        length: tuple[int, int],
        source: str,
        how: str = "한 문장",
        facts: Callable[[str], list[str]] | None = None,
        facts_note: str = "",
        fallback: Callable[[], str] | None = None,
    ) -> str:
        """한 문장 — 길이가 목표를 벗어나면 다시 쓰게 한다.

        카더라 총평의 ask_brief_sentence 와 같은 방식이다. 후보를 모아 두고 목표 범위
        안의 첫 번째를, 없으면 한가운데에 가장 가까운 걸 고른다. 길이 때문에 빈 문장을 내진 않는다 —
        요약이 통째로 저장되지 않는 것보다 길이가 몇 자 어긋나는 게 낫다.

        facts 는 줄마다 사실 대조('달라진 것'의 목록 밖 지표 change_problems · '뜨거운 곳'의 쉬는 지표·
        '가장' 표현·개수 hot_problems). 어긋난 자리를 돌려주면 그 문장을 버리고 facts_note 로 다시 쓰게
        하고, 고를 때도 어긋난 후보는 뒤로 민다. **후보가 전부 어긋나면** fallback(자료로 지은 문장, 없으면
        빈 문자열 = 그 줄을 뺀다)을 쓴다 — 어긋난 문장을 저장하지 않는다.
        """
        lo, hi = length
        # 줄마다 모델에게 준 자료가 다르다. 오타 검사의 '원문에 있는가' 대조도 **그 줄이 실제로 본
        # 자료**로 해야 한다 — 안 그러면 못 본 낱말을 근거로 통과시키거나 멀쩡한 말을 오타로 버린다.
        src = source
        wrong = facts or (lambda _t: [])
        candidates = [one_sentence(system, src)]
        for _ in range(HERO_RETRIES):
            cur = candidates[-1]
            # 길이가 맞아도 글자가 깨졌거나 오타가 있으면 다시 쓴다(common/text_check.py).
            found = problems(cur, src)
            off = wrong(cur)
            if lo <= seen(cur) <= hi and not found and not off:
                break
            if found:
                print(f"[WARNING] 문장을 버리고 다시 씁니다({' · '.join(found)}): {cur[:40]}…")
                retry = system + f"\n\n[다시 쓰기] 방금 쓴 문장에 깨진 글자나 오타가 있습니다. 같은 뜻으로 **{how}**으로 다시 쓰세요."
            elif off:
                print(f"[WARNING] 자료와 어긋나 다시 씁니다({' · '.join(off)}): {cur[:40]}…")
                retry = system + f"\n\n[다시 쓰기] {facts_note} **{how}**으로 다시 쓰세요."
            else:
                need = "늘려" if seen(cur) < lo else "줄여"
                retry = (
                    system
                    + f"\n\n[다시 쓰기] 방금 쓴 문장은 {seen(cur)}자입니다. 뜻은 유지하면서 "
                    f"{need} {lo}~{hi}자로 **{how}**만 다시 쓰세요.\n"
                    f"[방금 쓴 문장]\n{cur}"
                )
            candidates.append(one_sentence(retry, src))
        # 깨진 후보는 길이가 맞아도 안 쓴다 — 길이는 어긋나도 읽히지만 깨진 글자는 못 읽는다.
        # 자료와 어긋난 후보도 같은 취급이다. 전부 어긋나면 fallback 을 쓰고, fallback 이 없는 줄('흐름')만
        # 그중에서 고른다(빈 문장보다 낫다).
        right = [t for t in candidates if t.strip() and is_clean(t, src) and not wrong(t)]
        if not right and facts is not None and fallback is not None:
            print(f"[WARNING] 후보 {len(candidates)}개가 모두 자료와 어긋나 자료로 지은 문장을 씁니다.")
            return fallback()
        usable = (
            right
            or [t for t in candidates if t.strip() and is_clean(t, src)]
            or [t for t in candidates if t.strip()]
        )
        if not usable:
            return ""
        in_goal = [t for t in usable if lo <= seen(t) <= hi]
        if in_goal:
            return in_goal[0]
        return min(usable, key=lambda t: abs(seen(t) - (lo + hi) / 2))

    # 줄마다 따로 쓴다 — 한 번에 세 줄을 시키면 줄 수가 흔들린다(옛 두 문장 때 실측).
    trend = sized_sentence(TREND_SYSTEM, TREND_LEN, digest)
    mover_names = {m["name"] for m in movers}
    change = (
        sized_sentence(
            CHANGE_SYSTEM,
            CHANGE_LEN,
            change_src,
            facts=lambda t: change_problems(t, mover_names, names),
            facts_note=CHANGE_FACTS_NOTE,
            fallback=lambda: change_fallback(movers),
        )
        if movers
        else CHANGE_NONE
    )
    hot_n, top_n = balance_counts(rows)
    hot_system = HOT_SYSTEM + HOT_SKIP_NOTE if skipped_hotter(rows) else HOT_SYSTEM
    hot = sized_sentence(
        hot_system,
        HOT_LEN,
        hot_digest,
        facts=lambda t: hot_problems(t, rows, hot_n, top_n),
        facts_note=HOT_FACTS_NOTE,
        fallback=lambda: hot_fallback(rows, hot_n),
    )
    if not trend or not change or not hot:
        print("[WARNING] LLM 응답이 비어 요약을 저장하지 않습니다.")
        return

    # 여론 — 카더라 총평(같은 잡에서 먼저 돈다, daily-update.yml)과 여론 집계. 총평이 없거나 낡았으면 이 줄만
    # 뺀다(세 줄로 저장된다 — 화면은 줄 수와 상관없이 이름표로 그린다).
    yeoron = ""
    # ⚠️ 여론 줄은 곁가지다 — 카더라 표 조회나 이 줄 생성이 깨져도 앞 세 줄은 저장한다(예외를 삼킨다).
    try:
        brief = (
            client.table("telegram_daily_brief")
            .select("date, sentiment_summary")
            .order("date", desc=True)
            .limit(1)
            .execute()
        ).data
        if brief and (date.fromisoformat(target_date) - date.fromisoformat(brief[0]["date"])).days <= YEORON_MAX_AGE_DAYS:
            latest = brief[0]["date"]
            since = (date.fromisoformat(latest) - timedelta(days=KR.SENTIMENT_WINDOW_MAX_DAYS)).isoformat()
            sent_rows = (
                client.table("telegram_sentiment_daily")
                .select("date, scope, positive_count, negative_count, message_count")
                .eq("scope", "overall")
                .gte("date", since)
                .lte("date", latest)
                .execute()
            ).data
            # 카더라 큰 숫자와 같은 재료로 — 시장 글 표가 있으면 그 행(lib/telegram-data.getEcosystemSentiment 와 같은 분기).
            market_rows = load_market_daily(
                client, "kr", since=since, until=latest
            )
            if any((r.get("positive_count") or 0) + (r.get("negative_count") or 0) for r in market_rows):
                tone = yeoron_tone([{**r, "scope": "overall"} for r in market_rows], latest, MARKET_MIN_MESSAGES)
            else:
                tone = yeoron_tone(sent_rows, latest)
            if tone:
                yeoron_src = yeoron_digest(tone, brief_story(brief[0]["sentiment_summary"]))
                print(yeoron_src)
                print("─" * 60)
                yeoron = sized_sentence(
                    YEORON_SYSTEM,
                    YEORON_LEN,
                    yeoron_src,
                    facts=lambda t: yeoron_problems(t, tone, names),
                    facts_note=YEORON_FACTS_NOTE,
                    # 여론은 곁가지라 틀린 분위기를 싣느니 그 줄을 뺀다.
                    fallback=lambda: "",
                )
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 이 줄만 빼고 간다
        print(f"[WARNING] 여론 줄을 만들지 못해 뺍니다: {e!r}")
        yeoron = ""
    if not yeoron:
        print("[여론] 이 줄을 뺍니다 — 카더라 총평·여론 집계가 없거나 낡았거나, 문장이 자료와 어긋났습니다.")

    # 줄마다 이름표를 붙여 개행으로 잇는다 — 화면(app/home/Hero.tsx)이 이름표로 새 형식을 알아보고, 굵게는
    # 지표 이름에만 남긴다(keep_bold_names). ⚠️ 줄 순서가 화면 순서다.
    lines = [trend, change, hot] + ([yeoron] if yeoron else [])
    # 한 줄 안의 줄바꿈은 공백으로 — 문장을 모델이 두 줄로 내면 이름표 없는 줄이 생겨 화면이 새 형식을
    # 못 알아본다(날것 "[흐름] …"이 찍힌다). 화면도 이름표 없는 줄을 앞 줄에 이어 붙이지만 여기서 먼저 막는다.
    lines = [re.sub(r"\s*\n+\s*", " ", t).strip() for t in lines]
    summary = "\n".join(f"[{label}] {keep_bold_names(t, names)}" for label, t in zip(BRIEF_LABELS, lines))
    print("[요약]\n  " + summary.replace("\n", "\n  "))

    if "--no-save" in sys.argv[1:]:
        # 문장만 보고 저장하지 않는다 — 길이·규칙을 바꾼 브랜치를 러너에서 리허설할 때(narratives-rerun.yml what=summary save=false).
        print("[안내] --no-save — 저장하지 않습니다.")
        return
    client.table("daily_score").update({"ai_summary": summary}).eq(
        "date", target_date
    ).execute()
    print(f"[Supabase] daily_score.ai_summary 저장 완료: date={target_date}")


if __name__ == "__main__":
    main()

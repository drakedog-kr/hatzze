"""LLM이 쓴 한국어 문장에 깨진 글자·오타가 있는지 본다.

**왜 필요한가.** 2026-07-26 종목 내러티브에 "이후 **낙아들기** 시작했습니다"가 저장됐다
('잦아들기'가 망가진 것). 프롬프트가 추이 표현 예시로 준 저빈도 어휘를 모델이 생성하다
토큰을 흘린 경우다. 문장 자체는 자연스러워서 눈으로도 잘 안 걸린다.

지금까지의 그물은 대체문자(U+FFFD) 하나뿐이었는데, 이 오타는 `낙`·`아`·`들`·`기`가 전부
정상 한글이라 **문자 검사로는 영원히 못 잡는다**(실측: 저장된 LLM 문장 71건에 문자 이상
0건). 사전이 필요하다.

## 세 겹으로 본다

**[1] 문자 이상** — 대체문자·고립 자모·한글 사이 라틴 혼입·제어문자. 이번 오타는 여기서
안 걸리지만, 예전에 실제로 겪은 `콜�션` 부류를 막는다. 공짜라 남긴다.

**[2] 비문** — 체언 바로 뒤에 계사 없이 종결어미가 붙은 자리. 아래 따로 적는다.

**[3] 미심쩍은 어절** — 형태소 분석(Kiwi) 점수가 낮은 어절. **이것만으론 못 쓴다.**
실측(순한글 어절 1,443개)에서 점수 최하위 15개 중 오타는 8위였고 1~7위가 전부 정상
고유명사였다:

    다이이찌산쿄 -52.8 · 코오롱티슈진이 -45.8 · 브로드컴과의 -42.5 · 엔비디아와의 -41.3
    → 낙아들기 -38.2 ← 실제 오타
    한화에어로스페이스는 -38.1 · 반도체팹 -37.9 · 삼천당제약은 -37.7

점수만 걸면 오탐 14 : 진탐 1 이다. 그래서 **'원문에 있는가'를 함께 본다.** 이 문장들은
메시지 발췌(digest)를 읽고 쓴 것이라 고유명사는 반드시 원문에 있다. 반면 오타는 없다.
같은 실측에서 상위 10개 고유명사는 원문에 2~38건씩 있었고 `낙아들기`만 0건이었다 —
**오탐 0 · 진탐 1** 로 깨끗하게 갈렸다.

    의심 = 점수가 WORD_SCORE_FLOOR 이하  **그리고**  원문(digest)에 없음

## [2] 는 왜 따로 필요한가

2026-07-23·07-28 히어로 요약에 "…오르내리는 **흐름습니다**"가 저장됐다('흐름입니다'가
망가진 것). 되풀이되는 유형인데 [3] 이 통과시켰다. (07-28 분은 같은 날 저녁 실행이
정상 문장으로 덮어써서 지금 DB 에는 07-23 분만 남아 있다 — **없다고 오해하지 말 것.**)
Kiwi 가 이걸 `흐름/NNG + 습니다/EF` 라는 **문법적으로 파싱 가능한 사슬**로 읽어서
점수가 안 떨어지기 때문이다:

    흐름습니다  -27.8  통과 ← 오타          흐름입니다  -22.1  통과 ← 정상
    낙아들기   -38.2  걸림 ← [3] 의 기준 오타

정상 어절이 -35.4 에 있으니 하한을 -28 로 내리면 오탐이 쏟아진다. **점수로는 못 가른다.**

대신 문법을 본다 — 한국어에서 **체언 바로 뒤에 종결어미가 오는 것은 비문**이다(정상이면
계사 `이/VCP` 가 낀다: 흐름+**이**+ᆸ니다). Kiwi 가 태그를 이미 주니 공짜로 잴 수 있다.

**어미 토큰의 앞 토큰을 보는 게 아니라, 어미 표면형 앞을 덮는 마지막 형태소를 본다.**
모음으로 끝나는 체언에서는 Kiwi 가 어미 자리에 유령 용언을 끼워 넣어(`상태습니다` →
상태/NNG + **슬/VV** + ᆸ니다/EF) 토큰 이웃만 보면 통째로 샌다. 유령은 어미 '습니다'
안쪽에서 시작하므로, 어미 앞만 잘라 보면 걸려든다. 실측 재현율이 이만큼 갈린다:

    토큰 이웃으로 볼 때   자음끝 648/683 · 모음끝   0/591 · 합계  648/1,274 ← 모음끝 전멸
    어미 앞을 덮는 형태소  자음끝 649/683 · 모음끝 525/591 · 합계 1,174/1,274

(합성 오타 1,274개 = 말뭉치에서 실제로 '…입니다' 앞에 오는 순한글 체언을 뽑아 계사를
뺀 것. 두 줄 다 **같은 풀**로 쟀다.)

오탐은 사람이 쓴 진짜 한국어 49,498줄(텔레그램 원문 6,893건 + 지표 설명)에 **0건**,
저장된 LLM 문장 99줄에 1건인데 그 1건이 위의 진짜 오타다.

**[3] 과 달리 원문 대조가 필요 없다** — 비문은 원문에 있어도 비문이다. 그래서 source
없이도 돈다.

**남은 구멍:** 모음끝 66개(525/591)는 Kiwi 가 어미 앞자리까지 용언으로 먹어 버려 못
잡는다. 규칙을 넓힐 땐 위 49,498줄에 다시 돌려 오탐을 재고 숫자를 여기에 남길 것.

## 쓰는 법

호출부는 이미 재시도 루프를 갖고 있다(generate_daily_summary.sized_sentence,
generate_telegram_narratives.ask_brief_sentence). 그 루프의 합격 조건에 끼우면
의심스러운 문장은 자동으로 다시 쓰게 된다 — 새 LLM 호출 패턴을 만들 필요가 없다.

    if LEN_MIN <= len(cur) <= LEN_MAX and is_clean(cur, digest):
        break

source(digest)를 안 넘기면 [3]만 건너뛴다([1]·[2]는 그대로 본다). 원문 없이 점수만 보면
위에 적은 대로 고유명사를 무더기로 잡기 때문에, **그럴 바엔 안 보는 게 낫다.**
"""

from __future__ import annotations

import re
import unicodedata

# 형태소 분석 점수 하한. 이 아래면서 원문에 없는 어절을 의심한다.
#
# 실측으로 정한 값이다(위 주석의 1,443개 분포). 오타 -38.2 와 그 위 정상 어절 -35.4
# 사이에 두되, 오탐은 '원문에 있는가'가 막아 주므로 굳이 아슬아슬하게 붙이지 않았다.
# **지표·프롬프트를 크게 바꾸면 다시 재 볼 것** — 어휘가 달라지면 분포도 움직인다.
WORD_SCORE_FLOOR = -35.0

# 원문 대조 시 인정하는 최소 어간 길이. 어절에서 조사를 깎아 가며 원문을 찾는데
# ("브로드컴과의" → "브로드컴"), 2자까지 깎으면 아무 데나 걸려서 대조가 무의미해진다.
MIN_STEM = 3

# 순한글 어절만 검사한다. 영문·숫자가 섞인 토큰(HBM4, ADR, 2차전지)은 형태소 분석기가
# 제대로 못 보고, 애초에 오타가 나는 자리도 아니다.
_HANGUL_WORD = re.compile(r"^[가-힣]{2,}$")
_SPLIT = re.compile(r"[\s.,!?·…“”\"'()\[\]{}:;/*~\-]+")

# [2] 비문 검사가 보는 종결어미. **두 자 이상만 넣는다.** 표면형으로 찾기 때문에 한 자짜리
# (요·다·죠)를 넣으면 멀쩡한 명사와 겹쳐 '수요'·'주요'·'보다'·'때마다'가 통째로 걸린다
# (실측: 49,498줄에 1,632건). 두 자 이상만 두면 같은 말뭉치에 **오탐 0** 이다.
#
# 앞의 둘이 우리 말투(합쇼체)고, 해요체 장형은 07-23 이전 내러티브가 그 말투라 같이 둔다
# — 지금은 안 쓰지만 넣어도 오탐이 안 늘었다. `ᆸ니다`(입니다)는 **일부러 뺐다**: Kiwi 가
# 이 자리에선 계사를 반드시 끼워 넣어("흐름ᆸ니다" → 흐름/NNG + 이/VCP + ᆸ니다/EF)
# 이 부류 오타가 새어 나올 수 없다.
FINAL_ENDINGS = ("습니다", "습니까", "네요", "군요", "어요", "에요")

# 체언. 이 뒤에 계사 없이 종결어미가 붙으면 비문이다.
_NOUN_TAGS = {"NNG", "NNP", "NNB", "NP", "NR", "XR", "SL", "SH", "SN"}

# 어절 경계. 어미가 어절 끝인지 볼 때 쓴다("…했습니다만"의 '습니다'는 끝이 아니다).
_BOUNDARY = re.compile(r"[\s.,!?·…“”\"'()\[\]{}:;/*~\-]")

_REPLACEMENT = "�"
# 완성형에 못 들어간 고립 자모(ㄱ, ㅏ …). 정상 문장엔 나올 일이 없다.
_LONE_JAMO = re.compile(r"[ㄱ-ㆎ]")
# 한글 사이에 낀 라틴 글자("메모리a반도체"). 실측 71건에 0회라 오탐 위험이 낮다.
_LATIN_IN_HANGUL = re.compile(r"[가-힣][A-Za-z][가-힣]")


def _control_chars(text: str) -> list[str]:
    """줄바꿈·탭을 뺀 제어문자. 그대로 저장되면 화면·메시지에서 정체불명의 공백이 된다."""
    return [c for c in text if unicodedata.category(c) == "Cc" and c not in "\n\r\t"]


_kiwi = None
_kiwi_failed = False


def _get_kiwi():
    """Kiwi 인스턴스(지연 로딩·프로세스당 1회).

    모델 로딩이 1~2초라 import 시점에 하면 Kiwi 를 안 쓰는 스크립트까지 느려진다.
    설치가 안 돼 있으면 None 을 주고 호출부는 문자 검사만 한다 — 검수 레이어가 없다고
    파이프라인이 죽는 건 본말전도다(경고는 한 번만 찍는다).
    """
    global _kiwi, _kiwi_failed
    if _kiwi is not None or _kiwi_failed:
        return _kiwi
    try:
        from kiwipiepy import Kiwi

        _kiwi = Kiwi()
    except Exception as e:  # noqa: BLE001 — 설치·로딩 실패 전부를 같게 다룬다
        _kiwi_failed = True
        print(f"[검수] Kiwi 를 못 불러와 비문·어절 검사를 건너뜁니다({type(e).__name__}). 문자 검사만 합니다.")
    return _kiwi


def _in_source(word: str, source: str) -> bool:
    """어절이 원문에서 온 말인가. 조사를 깎아 가며 가장 긴 것부터 찾는다.

    "브로드컴과의" 는 원문에 그대로 없을 수 있지만 "브로드컴" 은 있다. 반대로 "낙아들기" 는
    어떻게 깎아도("낙아들") 원문에 없다.

    **어절 자체를 먼저 본다.** 깎기부터 시작하면 MIN_STEM 보다 짧은 어절("깃헙")이
    루프를 한 번도 못 돌아, 원문에 그대로 있는데도 '없음'이 된다(실측에서 히어로 요약의
    "깃헙"이 이렇게 잘못 걸렸다 — 지표명 '깃헙 거래봇 생성 수'에 멀쩡히 있는 말이다).
    """
    if word in source:
        return True
    for cut in range(1, len(word) - MIN_STEM + 1):
        stem = word[: len(word) - cut]
        if len(stem) < MIN_STEM:
            break
        if stem in source:
            return True
    return False


def _ungrammatical(text: str, kiwi) -> list[str]:
    """체언 바로 뒤에 종결어미가 붙은 자리(계사가 빠진 오타).

    어미 표면형을 찾아 **그 앞을 덮는 마지막 형태소**가 체언인지 본다. 토큰 이웃을 보지
    않는 이유는 모듈 주석에 적었다(모음으로 끝나는 체언에서 유령 용언에 가려진다).
    """
    try:
        toks = kiwi.tokenize(text)
    except Exception:  # noqa: BLE001 — 분석 실패는 '판단 불가'라 통과시킨다([3] 과 같다)
        return []
    found: list[str] = []
    for ending in FINAL_ENDINGS:
        for m in re.finditer(re.escape(ending), text):
            cut, end = m.start(), m.end()
            # 어절 끝이 아니면 종결어미가 아니다("…습니다만", "…네요라고").
            if end < len(text) and not _BOUNDARY.match(text[end]):
                continue
            # 어미 앞에 어간이 없으면 볼 게 없다.
            if cut == 0 or _BOUNDARY.match(text[cut - 1]):
                continue
            before = [t for t in toks if t.start + t.len <= cut]
            if not before or before[-1].tag not in _NOUN_TAGS:
                continue
            start = cut
            while start > 0 and not _BOUNDARY.match(text[start - 1]):
                start -= 1
            note = f"비문 '{text[start:end]}'(체언 뒤에 계사 없이 종결어미)"
            if note not in found:
                found.append(note)
    return found


def problems(text: str, source: str | None = None) -> list[str]:
    """이 문장의 문제 목록. 비어 있으면 통과다(사람이 읽는 문자열로 돌려준다)."""
    found: list[str] = []
    if not text or not text.strip():
        return ["빈 문장"]

    if _REPLACEMENT in text:
        found.append("대체문자(U+FFFD)")
    if _LONE_JAMO.search(text):
        found.append(f"고립 자모({_LONE_JAMO.search(text).group()})")
    if _LATIN_IN_HANGUL.search(text):
        found.append(f"한글 사이 라틴({_LATIN_IN_HANGUL.search(text).group()})")
    if _control_chars(text):
        found.append("제어문자")

    kiwi = _get_kiwi()
    if kiwi is None:
        return found

    # [2] 비문. 원문 대조가 필요 없어 source 없이도 돈다 — 비문은 원문에 있어도 비문이다.
    found.extend(_ungrammatical(text, kiwi))

    # [3] 원문이 없으면 어절 검사는 하지 않는다(모듈 주석 참고 — 고유명사를 무더기로 잡는다).
    if not source:
        return found

    for word in _SPLIT.split(text):
        if not _HANGUL_WORD.match(word):
            continue
        if _in_source(word, source):
            continue  # 원문에서 온 말이면 점수가 낮아도 오타가 아니다
        try:
            score = kiwi.analyze(word, top_n=1)[0][1]
        except Exception:  # noqa: BLE001 — 분석 실패는 '판단 불가'라 통과시킨다
            continue
        if score <= WORD_SCORE_FLOOR:
            found.append(f"미심쩍은 어절 '{word}'(점수 {score:.1f}, 원문에 없음)")

    return found


def is_clean(text: str, source: str | None = None) -> bool:
    """문제가 하나도 없으면 True. 호출부의 재시도 루프 합격 조건에 쓴다."""
    return not problems(text, source)

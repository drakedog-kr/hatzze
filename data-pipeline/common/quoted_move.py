"""채널 글에서 종목 이름 **바로 옆**에 붙은 등락 표기(`+29.8%`·`상한가`·`급등 12%`)를 읽는다.

쓰는 곳 둘.
  · generate_move_reasons — 까닭 후보 고르기·줄 세우기·발췌 창 세우기
  · extract_telegram_us_stocks — 리서치를 내는 은행(config.us_stock_extraction.RESEARCH_HOUSES)의
    이름이 '주식으로 다뤄진' 자리인지 판정(own_move_after)

두 곳이 같은 잣대를 써야 은행 태그가 붙은 글과 까닭 발췌에 들어가는 글이 어긋나지 않는다.
"""

from __future__ import annotations

import re

# ── 채널 글의 등락 표기 ────────────────────────────────────────────────────────
#
# 종목명 **바로 옆**에 붙은 등락만 읽는다. 처음엔 앞 40자·뒤 70자 창을 봤는데, 그 창에
# 이웃 종목의 숫자가 들어왔다 — "조선(삼성중공업 +8.6%, 한화오션 +5.5%) … 약세: 미디어·
# 교육(-37.5%)" 에서 세 종목이 전부 −37.5 로 읽혔고, "+40% YoY" 가 삼성전자의 등락이
# 됐다(2026-09-06 dry-run 실측). 그래서 자리를 좁힌다:
#   뒤  ≤ 24자. 사이에 올 수 있는 건 코드·시총 괄호(`[042660]`·`(1485.0조)`), 조사, `|`·`:` 뿐
#   앞  ≤ 12자. `(+20.1%) 로보티즈` 꼴(수급 정리 채널)
#   부호 없는 %는 이름 바로 뒤(≤ 8자)에 붙었을 때만, 글 전체가 상승률·하락률 목록일 때만
#   YoY·QoQ·MoM 이 따라오면 실적 증감이지 등락이 아니다
#   30 을 넘는 값은 안 믿는다(상한가가 30). 상장 첫날 +100% 같은 건 주목도 후보로 잡힌다
WINDOW_BEFORE, WINDOW_AFTER = 12, 34
_NUM = r"(\d{1,2}(?:\.\d{1,2})?)"
_GAP = r"(?:\s*(?:\[[0-9A-Z]{6}\]|\([^()%]{0,12}\)|전\s*거래일\s*대비|전일\s*대비|전일비|은|는|이|가|의|도|주가|\||:|,)?\s*){0,3}"
_AFTER_SIGNED = re.compile(_GAP + r"\(?\s*([+\-−▲▼△▽↑↓])\s*" + _NUM + r"\s*%")
_AFTER_WORD = re.compile(_GAP + _NUM + r"\s*%\s*(?:오른|상승|급등|올라|뛴|하락|급락|내린|내려|빠진|떨어)")
_AFTER_BARE = re.compile(r"\s*\(?\s*" + _NUM + r"\s*%")
_BEFORE_SIGNED = re.compile(r"\(?\s*([+\-−▲▼△▽↑↓])\s*" + _NUM + r"\s*%\s*\)?\s*$")
_YOY = re.compile(r"^\s*(?:YoY|QoQ|MoM|yoy|qoq|y/y|q/q)")
_LIMIT_UP = re.compile(r"^\s*(?:[^가-힣]{0,6})?(?:상한가|상따)")
_LIMIT_DOWN = re.compile(r"^\s*(?:[^가-힣]{0,6})?하한가")
_UP_WORDS = ("오른", "상승", "급등", "올라", "뛴", "↑")
_LIST_UP = re.compile(r"상승률|상승\s*종목|급등\s*종목|특징주|강세\s*종목")
_LIST_DOWN = re.compile(r"하락률|하락\s*종목|급락\s*종목|약세\s*종목")
_SIGN = {"+": 1, "▲": 1, "△": 1, "↑": 1, "-": -1, "−": -1, "▼": -1, "▽": -1, "↓": -1}


def moves_at(
    before: str, after: str, *, list_up: bool, list_down: bool, leading: bool = True
) -> list[tuple[float, int, int]]:
    """이름 한 자리의 등락 표기 → [(등락, 이름 앞으로 뻗은 글자 수, 이름 뒤로 뻗은 글자 수)].

    before 는 이름 바로 앞 WINDOW_BEFORE 자, after 는 바로 뒤 WINDOW_AFTER 자다. 둘 다 공백을
    한 칸으로 편 본문에서 자른다. list_up·list_down 은 글 전체가 상승률·하락률 목록인가다.
    leading=False 면 이름 **앞**의 표기(`(+20.1%) 로보티즈` 꼴)는 안 읽는다.
    """
    found: list[tuple[float, int, int]] = []
    if x := _LIMIT_UP.search(after):
        found.append((30.0, 0, x.end()))
    elif x := _LIMIT_DOWN.search(after):
        found.append((-30.0, 0, x.end()))
    x = _AFTER_SIGNED.match(after)
    if x and not _YOY.match(after[x.end():]):
        v = float(x.group(2))
        if 0 < v <= 30:
            found.append((_SIGN[x.group(1)] * v, 0, x.end()))
        return found
    x = _AFTER_WORD.match(after)
    if x:
        v = float(x.group(1))
        tail = after[x.start(1):]
        if 0 < v <= 30:
            found.append((v if any(w in tail for w in _UP_WORDS) else -v, 0, x.end()))
        return found
    x = _BEFORE_SIGNED.search(before) if leading else None
    if x:
        v = float(x.group(2))
        if 0 < v <= 30:
            found.append((_SIGN[x.group(1)] * v, len(before) - x.start(), 0))
        return found
    x = _AFTER_BARE.match(after[:8 + 6])
    if x and (list_up or list_down) and not _YOY.match(after[x.end():]):
        v = float(x.group(1))
        if 0 < v <= 30:
            found.append((v if list_up and not list_down else -v, 0, x.end()))
    return found


def quoted_moves(text: str, needle: str, *, leading: bool = True) -> list[tuple[float, str]]:
    """본문에서 needle(종목 표기) 바로 옆의 등락 표기를 전부 읽는다 → [(등락, 그 자리)].

    '그 자리'는 이름과 표기를 이은 본문 조각이다(`JP모건(-1.71%)`). 발췌 창을 거기 세울 때 쓴다.
    leading=False 면 이름 **앞**의 표기는 안 읽는다(config.us_stock_extraction.RESEARCH_HOUSES 주석).
    """
    if not needle:
        return []
    flat = " ".join(text.split())
    found: list[tuple[float, str]] = []
    list_up, list_down = bool(_LIST_UP.search(flat)), bool(_LIST_DOWN.search(flat))
    flags = re.IGNORECASE if not re.search(r"[가-힣]", needle) else 0
    for m in re.finditer(re.escape(needle), flat, flags=flags):
        a0, b0 = m.end(), max(0, m.start() - WINDOW_BEFORE)
        for v, back, fwd in moves_at(
            flat[b0 : m.start()], flat[a0 : a0 + WINDOW_AFTER],
            list_up=list_up, list_down=list_down, leading=leading,
        ):
            found.append((v, flat[m.start() - back : a0 + fwd]))
    return found


def quoted_move(text: str, needle: str, *, leading: bool = True) -> float | None:
    """본문에서 needle(종목 표기) 바로 옆의 등락 표기를 읽는다. 없으면 None. 여럿이면 절댓값 최대."""
    found = quoted_moves(text, needle, leading=leading)
    return max((v for v, _spot in found), key=abs) if found else None


def own_move_after(text: str, end: int) -> bool:
    """원문 좌표 end(이름이 끝나는 자리) 바로 **뒤**에 등락 표기가 붙어 있나.

    quoted_moves(leading=False) 와 같은 잣대를 한 자리에 댄 것이다. 추출은 이름이 나온 자리마다
    따로 판정해서(한 글에 발행처 자리와 주가 자리가 같이 있다) 이름으로 다시 찾지 않고 좌표를 받는다.
    """
    raw = text[end : end + WINDOW_AFTER * 4]
    after = ((" " if raw[:1].isspace() else "") + " ".join(raw.split()))[:WINDOW_AFTER]
    flat = " ".join(text.split())
    return bool(moves_at(
        "", after, list_up=bool(_LIST_UP.search(flat)), list_down=bool(_LIST_DOWN.search(flat)), leading=False,
    ))

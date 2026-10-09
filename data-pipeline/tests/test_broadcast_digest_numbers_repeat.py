"""채널 글 2판 — 숫자 되돌리기 · 직전 글과 겹치지 않게 · 휴장일(2026-10-09).

- 2판 규칙은 1판의 '이 숫자는 주가가 아닙니다' 절 대신 [숫자] 절을 쓴다. 1판 규칙 문자열은 그대로다.
- 자료에 없는 숫자가 든 문장은 빠진다(숫자를 다시 쓰게 하면서 붙인 그물).
- 아침·저녁·수요일 글은 바로 앞에 나간 우리 글을 [직전 글]로 받는다.
- 휴장일엔 아침 글 이름이 '휴장일 아침 요약'이 되고 저녁 글은 안 만든다.
"""
import types
from datetime import date, datetime

import common.broadcast_content as BC
import common.broadcast_digest as BD

R = BD.Render(
    cta_link=lambda path, content: f"CTA {path} {content}",
    quote=lambda *lines: "\n".join(lines),
    paragraphs=lambda text: [text],
    date_label=lambda iso: f"{int(iso[5:7])}월 {int(iso[8:10])}일",
    js_round=round,
    stage_for_score=lambda s: "저온",
    stage_emoji={},
)


# ── 규칙 문자열 ──────────────────────────────────────────────────────────────


def test_v1_rules_keep_the_mention_share_block():
    assert BC._LLM_RULES == BC._LLM_RULES_HEAD + BC._MENTION_SHARE_RULE + BC._LLM_RULES_TAIL + BC._EXPRESSION_RULE
    assert "언급 점유율" in BC._LLM_RULES


def test_v2_rules_swap_the_mention_share_block_for_numbers():
    assert "언급 점유율" not in BD.DIGEST_RULES
    assert "[숫자]" in BD.DIGEST_RULES
    # 머리(말투·절대 금지)와 꼬리(증권사 의견·형식·문단 길이)는 1판과 같다.
    assert BD.DIGEST_RULES.startswith(BC._LLM_RULES_HEAD)
    assert BC._LLM_RULES_TAIL in BD.DIGEST_RULES


def test_v2_rules_swap_the_expression_block_to_drop_who_reported():
    # 1판은 "언론 보도는 매체를 주어로", 2판은 누가 보도했는지 안 적는다(2026-10-09).
    assert "매체를 주어로" in BC._LLM_RULES
    assert "매체를 주어로" not in BD.DIGEST_RULES
    assert BD.DIGEST_RULES.endswith(BD.DIGEST_EXPRESSION_RULE)
    assert "누가 보도했는지" in BD.DIGEST_RULES
    assert "숫자는 화면이 따로 찍으니 문장에 넣지 마세요" not in BD.DIGEST_FORMAT


# ── 자료에 없는 숫자 ─────────────────────────────────────────────────────────


SOURCE = "(3) 10/08 07시 @ch 삼성전자 3분기 잠정 영업이익 12조 1,000억원, 컨센서스 10.9조. 9월 수출 1,200억달러"


def test_sourced_numbers_stay_even_with_commas_dropped():
    body = "삼성전자 3분기 영업이익은 12조 1000억 원이었습니다. 시장 예상치는 10.9조 원이었습니다."
    kept, dropped = BD.drop_unsourced_numbers(body, SOURCE)
    assert kept == body and dropped == []


def test_made_up_number_drops_only_its_sentence():
    body = "9월 수출이 1200억 달러를 넘었습니다. 반도체 수출은 165억 달러였습니다. 메모리 이야기가 이어졌습니다."
    kept, dropped = BD.drop_unsourced_numbers(body, SOURCE)
    assert kept == "9월 수출이 1200억 달러를 넘었습니다. 메모리 이야기가 이어졌습니다."
    assert dropped == ["반도체 수출은 165억 달러였습니다."]


def test_amounts_match_with_their_unit():
    # '9'는 자료의 '9월'에 있지만 '9조'는 없다.
    kept, dropped = BD.drop_unsourced_numbers("순이익은 9조 원이었습니다.", SOURCE)
    assert kept == "" and dropped == ["순이익은 9조 원이었습니다."]


def test_korean_amounts_match_by_value():
    # 10/7 저녁 시험에서 모델이 재료의 '238,270억'·'10,259억'을 조·억으로 풀어 썼다. 값이 같으면 지나간다.
    src = "매출액 : 238,270억(예상치 : 241,181억) 영업익 : 7,818억(예상치 : 10,259억)"
    body = "매출은 23조 8,270억원으로 예상치 24조 1,181억원보다 적었습니다. 영업이익 예상치는 1조 259억원이었습니다."
    kept, dropped = BD.drop_unsourced_numbers(body, src)
    assert kept == body and dropped == []
    # 반올림한 값은 새 숫자다.
    _, dropped = BD.drop_unsourced_numbers("매출은 약 24조원이었습니다.", src)
    assert dropped == ["매출은 약 24조원이었습니다."]


def test_dollar_sign_matches_won_style_dollars():
    kept, _ = BD.drop_unsourced_numbers("조정 EPS는 1.92달러였습니다.", "Adj EPS $1.92 (est $1.74)")
    assert kept == "조정 EPS는 1.92달러였습니다."


def test_dates_match_the_posting_stamp_without_leading_zero():
    # 자료의 게시 시각은 '10/08 07시' 꼴이다. 모델이 '10월 8일 7시'로 써도 지나간다.
    kept, _ = BD.drop_unsourced_numbers("10월 8일 7시에 잠정실적이 나왔습니다.", SOURCE)
    assert kept == "10월 8일 7시에 잠정실적이 나왔습니다."


def test_validate_drops_the_sentence_but_keeps_the_section():
    mat = BD.Material(
        excerpts=[
            BD.Excerpt(n=1, channel="a", message_id=1, text="x", views=1, forwards=0,
                       posted_at=datetime(2026, 10, 8, 7, tzinfo=BD.KST), channels={"a", "b"}),
        ],
        kr_names={}, us_names={}, window=(None, None), total=1,
    )
    text = "## 삼성전자 실적\n삼성전자 영업이익은 12조 1000억 원이었습니다. 순이익은 9조 원이었습니다.\n종목: 없음\n근거: 1"
    out = BD._validate_sections(text, "evening2", SOURCE, mat, 4)
    assert len(out) == 1
    assert out[0].body == "삼성전자 영업이익은 12조 1,000억 원이었습니다."   # 금액 모양도 맞춘다(tidy_amounts)


# ── 휴장일 ───────────────────────────────────────────────────────────────────


def test_holiday_table():
    assert BD.is_krx_holiday(date(2026, 10, 9))      # 한글날
    assert BD.is_krx_holiday(date(2026, 10, 5))      # 개천절 대체휴일
    assert not BD.is_krx_holiday(date(2026, 10, 8))


def test_morning_head_renames_on_holiday():
    lo, hi = BD.night_window(date(2026, 10, 9))
    head = BD.morning_head(R, lo, hi)
    assert head[0] == "🌅 <b>휴장일 아침 요약</b>"
    assert "개장 전" not in head[1]
    lo, hi = BD.night_window(date(2026, 10, 8))
    assert BD.morning_head(R, lo, hi) == ["🌅 <b>개장 전 요약</b>", "10월 8일 개장 전 · 7일 18시 ~ 8일 7시"]


def test_evening_skips_on_holiday_without_touching_db():
    # db·llm 이 None 이어도 안 죽는다 — 재료를 읽기 전에 빠진다.
    assert BD.build_evening2(None, None, "m", R, date(2026, 10, 9), datetime(2026, 10, 9, 18, tzinfo=BD.KST), False) == ""


# ── 직전 글 ──────────────────────────────────────────────────────────────────


class _Q:
    def __init__(self, log, rows):
        self.log, self.rows = log, rows

    def __getattr__(self, name):
        def call(*a, **k):
            self.log.append((name, a))
            return self
        return call

    def execute(self):
        return types.SimpleNamespace(data=self.rows)


class _DB:
    def __init__(self, rows):
        self.log, self.rows = [], rows

    def table(self, name):
        self.log.append(("table", (name,)))
        return _Q(self.log, self.rows)


ROWS_NEWEST_FIRST = [
    {"date": "2026-10-07", "slot": "midweek", "sections": [{"title": "B", "body": "나중 글입니다."}], "created_at": "2026-10-07T03:32:00+00:00"},
    {"date": "2026-10-07", "slot": "morning", "sections": [{"title": "A", "body": "먼저 글입니다."}], "created_at": "2026-10-06T23:11:00+00:00"},
]


def test_previous_posts_reads_before_the_window_end_oldest_first():
    db = _DB(ROWS_NEWEST_FIRST)
    before = datetime(2026, 10, 7, 18, tzinfo=BD.KST)
    rows = BD.previous_posts(db, before)
    assert [r["slot"] for r in rows] == ["morning", "midweek"]
    assert ("lt", ("created_at", before.isoformat())) in db.log
    assert ("limit", (BD.PREVIOUS_POSTS,)) in db.log


def test_previous_posts_survive_a_missing_table():
    class Broken:
        def table(self, name):
            raise RuntimeError("no table")
    assert BD.previous_posts(Broken(), datetime(2026, 10, 7, 18, tzinfo=BD.KST)) == []


def test_previous_post_lines_carry_titles_and_bodies():
    lines = BD.previous_post_lines(list(reversed(ROWS_NEWEST_FIRST)), R)
    assert lines[0].startswith("[직전 글]")
    assert "- 10월 7일 개장 전 요약" in lines
    assert "  · A: 먼저 글입니다." in lines
    assert BD.previous_post_lines([], R) == []


def _morning_with_fakes(monkeypatch, day: date, prev_rows: list[dict]):
    """아침 빌더를 재료 없이 돌려 갈래 생성에 넘어가는 digest·note 를 잡는다."""
    lo, hi = BD.night_window(day)
    mat = BD.Material(excerpts=[BD.Excerpt(n=1, channel="a", message_id=1, text="발췌", views=1, forwards=0, posted_at=lo)],
                      kr_names={}, us_names={}, window=(lo, hi), total=500)
    seen = {}
    monkeypatch.setattr(BD, "load_material_with_fallback", lambda db, f, n: mat)
    monkeypatch.setattr(BD, "load_us_reasons", lambda db, d: (None, []))
    monkeypatch.setattr(BD, "load_events", lambda db, a, b, m: [])
    monkeypatch.setattr(BD, "previous_posts", lambda db, before: prev_rows)

    def fake_compose(client, model, fmt, digest, mat, max_tokens=0, note=""):
        seen.update(digest=digest, note=note)
        return []
    monkeypatch.setattr(BD, "compose_sections", fake_compose)
    BD.build_morning2(None, object(), "m", R, day, datetime.combine(day, datetime.min.time(), BD.KST), False)
    return seen


def test_morning_gets_previous_posts_and_the_repeat_note(monkeypatch):
    seen = _morning_with_fakes(monkeypatch, date(2026, 10, 8), list(reversed(ROWS_NEWEST_FIRST)))
    assert "[직전 글]" in seen["digest"]
    assert seen["note"] == BD.REPEAT_NOTE


def test_morning_without_previous_posts_has_no_note(monkeypatch):
    seen = _morning_with_fakes(monkeypatch, date(2026, 10, 8), [])
    assert "[직전 글]" not in seen["digest"] and seen["note"] == ""


def test_holiday_morning_adds_the_holiday_note(monkeypatch):
    seen = _morning_with_fakes(monkeypatch, date(2026, 10, 9), [])
    assert seen["note"] == BD.HOLIDAY_NOTE


def test_compose_puts_the_note_and_v2_rules_into_the_system_prompt():
    got = {}

    class Client:
        class messages:  # noqa: N801 — anthropic 클라이언트 모양을 흉내 낸다
            @staticmethod
            def create(**kw):
                got.update(kw)
                return types.SimpleNamespace(content=[])
    BD.compose_sections(Client, "m", "evening2", "자료", None, note=BD.REPEAT_NOTE)
    assert got["system"].startswith(BD.DIGEST_RULES)
    assert got["system"].endswith(BD.REPEAT_NOTE)


# ── 소식 하나 = 문단 하나 · 하루치 일정은 날짜 없이 ─────────────────────────────

import send_telegram_broadcast as S  # noqa: E402 — 실제 문단 나누기·날짜 표기로 본다

R_REAL = BD.Render(
    cta_link=S.cta_link, quote=S.quote, paragraphs=S.paragraphs, date_label=S.korean_date_label,
    js_round=S.js_round, stage_for_score=S.stage_for_score, stage_emoji=S.STAGE_EMOJI,
)


def test_body_keeps_the_lines_the_model_wrote():
    text = (
        "## 메모리 가격과 삼성 HBM4E\n"
        "난야테크가 DRAM 계약 가격을 올린다고 알렸습니다.\n"
        "메리츠증권은 영업이익을 12조 1000억원으로 추정했습니다. 시장 기대치는 10.9조원입니다.\n"
        "종목: 없음\n근거: 1"
    )
    [s] = BD._parse_sections(text)
    assert s.body.count("\n") == 1
    body = BD._trim_body(s.body)
    assert body.split("\n") == [
        "난야테크가 DRAM 계약 가격을 올린다고 알렸습니다.",
        "메리츠증권은 영업이익을 12조 1000억원으로 추정했습니다. 시장 기대치는 10.9조원입니다.",
    ]
    # 렌더는 줄마다 문단 하나(빈 줄로 띄움). 짝인 두 문장은 한 문단에 남는다.
    rendered = BD.render_sections(R_REAL, [BD.Section("t", body, [], [], [])], BD.Material([], {}, {}, (None, None), 0), {}, {})
    assert rendered[2:] == ["", "난야테크가 DRAM 계약 가격을 올린다고 알렸습니다.",
                            "", "메리츠증권은 영업이익을 12조 1000억원으로 추정했습니다. 시장 기대치는 10.9조원입니다."]


def test_trim_body_caps_sentences_across_lines():
    body = "하나입니다.\n둘입니다. 셋입니다.\n넷입니다."
    assert BD._trim_body(body) == "하나입니다.\n둘입니다. 셋입니다."


def test_number_net_keeps_lines():
    body = "영업이익은 12조 1,000억원이었습니다.\n순이익은 9조 원이었습니다. 메모리 이야기가 이어졌습니다."
    kept, dropped = BD.drop_unsourced_numbers(body, SOURCE)
    assert kept == "영업이익은 12조 1,000억원이었습니다.\n메모리 이야기가 이어졌습니다."
    assert dropped == ["순이익은 9조 원이었습니다."]


def test_previous_post_lines_flatten_paragraphs():
    rows = [{"date": "2026-10-07", "slot": "evening", "sections": [{"title": "A", "body": "첫 소식입니다.\n둘째 소식입니다."}]}]
    assert "  · A: 첫 소식입니다. 둘째 소식입니다." in BD.previous_post_lines(rows, R)


EVENTS = [
    {"date": "2026-10-08", "code": "005930", "name": "삼성전자", "event": "3분기 잠정실적 발표", "channels": 30},
    {"date": "2026-10-08", "code": "000660", "name": "SK하이닉스", "event": "잠정실적 발표", "channels": 5},
]


def test_day_event_block_drops_the_repeated_date():
    block = BD.event_block(R_REAL, "내일 일정", EVENTS, 4, show_date=False)
    assert block[1] == "📌 <b>내일 일정</b>"
    assert "10월" not in block[2]
    assert "<b>삼성전자</b> · 3분기 잠정실적 발표" in block[2] and "<b>SK하이닉스</b> · 잠정실적 발표" in block[2]


def test_week_event_block_keeps_dates():
    block = BD.event_block(R_REAL, "다음 주 일정", EVENTS, 8)
    assert "<b>10월 8일</b> 삼성전자 · 3분기 잠정실적 발표" in block[2]


# ── 금액 모양 · 요일 ─────────────────────────────────────────────────────────


def test_tidy_amounts_spaces_and_commas():
    assert BD.tidy_amounts("매출은 23조8270억원, 영업이익은 7818억원입니다.") == "매출은 23조 8,270억원, 영업이익은 7,818억원입니다."
    assert BD.tidy_amounts("예상치 1조259억원 · 106.1조원 · 10만 원대") == "예상치 1조 259억원 · 106.1조원 · 10만 원대"
    # 이미 맞는 모양은 그대로다.
    assert BD.tidy_amounts("23조 8,270억원") == "23조 8,270억원"
    # 공시 원문 그대로 옮긴 큰 금액은 조·억으로 풀어 쓴다(10/7 주중 점검 시험). 소수가 붙은 금액은 나누지 않는다.
    assert BD.tidy_amounts("매출은 238,270억원, 예상치는 10,259억원") == "매출은 23조 8,270억원, 예상치는 1조 259억원"
    assert BD.tidy_amounts("106.1조원 · 5.46조원") == "106.1조원 · 5.46조원"


def test_validate_tidies_amounts():
    mat = BD.Material(
        excerpts=[BD.Excerpt(n=1, channel="a", message_id=1, text="x", views=1, forwards=0,
                             posted_at=datetime(2026, 10, 8, 7, tzinfo=BD.KST), channels={"a", "b"})],
        kr_names={}, us_names={}, window=(None, None), total=1,
    )
    text = "## 실적\n영업이익은 12조1000억원이었습니다.\n종목: 없음\n근거: 1"
    [s] = BD._validate_sections(text, "evening2", SOURCE, mat, 4)
    assert s.body == "영업이익은 12조 1,000억원이었습니다."


def test_excerpt_head_carries_the_weekday():
    mat = BD.Material(
        excerpts=[BD.Excerpt(n=1, channel="ch", message_id=1, text="본문", views=1, forwards=0,
                             posted_at=datetime(2026, 10, 6, 22, tzinfo=BD.KST))],
        kr_names={}, us_names={}, window=(None, None), total=1,
    )
    assert BD.excerpt_lines(mat, "발췌")[1].startswith("(1) 10/06(화) 22시 @ch")


def test_event_lines_give_the_model_dates_with_weekdays():
    lines = BD.event_lines(R_REAL, EVENTS, 4)
    assert lines[0].startswith("[일정]")
    assert "- 10월 8일(목) 삼성전자 · 3분기 잠정실적 발표" in lines
    assert BD.event_lines(R_REAL, [], 4) == []


def test_past_summary_reads_only_rows_written_before_the_post():
    db = _DB([])
    before = datetime(2026, 10, 7, 14, tzinfo=BD.KST)
    BD.stored_digest_lines(db, [date(2026, 10, 7)], R, before=before)
    assert ("lt", ("created_at", before.isoformat())) in db.log
    db = _DB([])
    BD.stored_digest_lines(db, [date(2026, 10, 7)], R)
    assert not any(name == "lt" for name, _ in db.log)

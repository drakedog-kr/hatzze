"""common/broadcast_digest 의 일요일 글 창 — 월요일부터 일요일 저녁까지, 토 · 일 몫은 하루씩 따로(2026-10-18).

예전 창은 토 07:00 에서 끝나 토요일 아침 ~ 일요일 저녁 글이 어느 글에도 안 들어갔다. 창만 늘리면 조회수가 덜 쌓인
주말 글이 평일 글에 밀려 100건 중 3건이었고, 주말 20건을 한 번에 뽑아도 일요일은 3건이었다. 여기서는 토 · 일 몫이
정원대로 뽑히는지 · 남는 정원을 평일이 채우는지 · 창의 경계 · 날짜 줄이 월~일인지를 가짜 표로 본다.
"""
from datetime import date, datetime, timedelta, timezone

import common.broadcast_digest as BD
from common.timeutil import KST

import send_telegram_broadcast as S

MON, SAT, SUN = date(2026, 10, 12), date(2026, 10, 17), date(2026, 10, 18)
NEXT_MON = SUN + timedelta(days=1)


def k(d: date, hm: str) -> datetime:
    h, m = map(int, hm.split(":"))
    return datetime(d.year, d.month, d.day, h, m, tzinfo=KST)


def row(i: int, posted: datetime, views: int, text: str | None = None, forwards: int = 5, ch: str | None = None) -> dict:
    return {
        "id": f"{i:05d}", "channel_handle": ch or f"ch{i}", "message_id": i, "text": text or f"글 {i}번 본문입니다",
        "views": views, "forwards": forwards, "posted_at": posted.astimezone(timezone.utc).isoformat(),
    }


def _val(col, v):
    if col == "posted_at":
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return v


class _Q:
    """telegram_messages 만 흉내 낸다. 다른 표(종목 태그)는 빈 표다."""

    def __init__(self, rows):
        self.rows, self.ops, self._order, self._limit = rows, [], None, None

    def select(self, *_a, **_k):
        return self

    def _f(self, col, v, op):
        self.ops.append((col, _val(col, v), op))
        return self

    def gte(self, c, v):
        return self._f(c, v, lambda a, b: a >= b)

    def lt(self, c, v):
        return self._f(c, v, lambda a, b: a < b)

    def gt(self, c, v):
        return self._f(c, v, lambda a, b: a > b)

    def in_(self, c, vs):
        self.ops.append((c, set(vs), lambda a, b: a in b))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, a, b):
        self._limit = b - a + 1
        return self

    def execute(self):
        out = [r for r in self.rows if all(op(_val(c, r[c]), v) for c, v, op in self.ops)]
        if self._order:
            col, desc = self._order
            out.sort(key=lambda r: _val(col, r[col]), reverse=desc)
        if self._limit is not None:
            out = out[: self._limit]
        return type("R", (), {"data": out})()


class _DB:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        return _Q(self.rows if name == "telegram_messages" else [])


def week_rows(n: int, start: int = 0) -> list[dict]:
    """월 08시부터 한 시간 간격 평일 글 — 조회수가 넉넉해 창 하나로 뽑으면 주말 글을 다 밀어낸다."""
    return [row(start + i, k(MON, "08:00") + timedelta(hours=i % 110), 5000 + i) for i in range(n)]


def weekend_rows(n: int, start: int) -> list[dict]:
    """토 08시부터 20분 간격 주말 글(토요일 몫 안) — 조회수가 적다."""
    return [row(start + i, k(SAT, "08:00") + timedelta(minutes=20 * i), 500 + i) for i in range(n)]


def sunday_rows(n: int, start: int) -> list[dict]:
    """일 08시부터 20분 간격 일요일 글 — 토요일 글보다도 조회수가 적다(몇 시간 전 글)."""
    return [row(start + i, k(SUN, "08:00") + timedelta(minutes=20 * i), 100 + i) for i in range(n)]


PER_DAY = BD.WEEKLY_WEEKEND_EXCERPTS_PER_DAY


def test_saturday_and_sunday_each_get_their_quota():
    db = _DB(week_rows(150) + weekend_rows(30, 1000) + sunday_rows(30, 2000))
    mat, week, weekend = BD.load_weekly_material(db, SAT, k(SUN, "21:00"))
    sat_ex = [e for e in weekend if e.posted_at < k(SUN, "07:00")]
    sun_ex = [e for e in weekend if e.posted_at >= k(SUN, "07:00")]
    assert (len(sat_ex), len(sun_ex)) == (PER_DAY, PER_DAY)
    assert len(week) == BD.EXCERPTS_MULTI - 2 * PER_DAY
    assert all(e.posted_at >= k(SAT, "07:00") for e in weekend)
    assert all(e.posted_at < k(SAT, "07:00") for e in week)
    # 번호는 평일 → 토 → 일로 이어진다 — 근거 표기가 한 체계다.
    assert [e.n for e in mat.excerpts] == list(range(1, BD.EXCERPTS_MULTI + 1))
    assert mat.excerpts == week + sat_ex + sun_ex


def test_one_weekend_pool_would_have_starved_sunday():
    # 대조군 — 주말을 한 번에 뽑으면 조회수가 덜 쌓인 일요일 글이 하나도 안 남는다. 위 테스트가 막는 일이다.
    db = _DB(weekend_rows(30, 1000) + sunday_rows(30, 2000))
    mat = BD.load_material(db, k(SAT, "07:00"), k(SUN, "21:00"), 2 * PER_DAY, multi=True)
    assert not [e for e in mat.excerpts if e.posted_at >= k(SUN, "07:00")]


def test_one_window_would_have_dropped_the_weekend():
    # 대조군 — 예전처럼 창 하나로 뽑으면 주말 글이 하나도 안 남는다.
    db = _DB(week_rows(150) + weekend_rows(30, 1000) + sunday_rows(30, 2000))
    mat = BD.load_material(db, k(MON, "07:00"), k(SUN, "21:00"), BD.EXCERPTS_MULTI, multi=True)
    assert not [e for e in mat.excerpts if e.posted_at >= k(SAT, "07:00")]


def test_weekday_fills_what_the_weekend_leaves():
    # 일요일 수집이 죽은 주 — 토요일 5건 · 일요일 0건이면 평일이 95건을 채운다.
    db = _DB(week_rows(150) + weekend_rows(5, 1000))
    mat, week, weekend = BD.load_weekly_material(db, SAT, k(SUN, "21:00"))
    assert len(weekend) == 5
    assert len(week) == BD.EXCERPTS_MULTI - 5
    assert len(mat.excerpts) == BD.EXCERPTS_MULTI


def test_window_edges():
    rows = [
        row(1, k(MON, "06:59"), 9000),          # 월 07시 전 — 월요일 아침 글 몫이라 안 든다
        row(2, k(MON, "07:00"), 9000),
        row(3, k(SAT, "06:59"), 9000),          # 평일 몫의 끝
        row(4, k(SAT, "07:00"), 9000),          # 토요일 몫의 처음
        row(5, k(SUN, "19:30"), 9000),          # 19시 뒤라도 보내기 전에 모은 글은 든다
        row(6, k(NEXT_MON, "07:00"), 9000),     # 다음 주 창
        row(7, k(SUN, "12:00"), 9000, forwards=2),  # 며칠짜리 창은 전달 3회 이상만
    ]
    _, week, weekend = BD.load_weekly_material(_DB(rows), SAT, k(NEXT_MON, "10:00"))   # 월요일에 손으로 늦게 돌림
    assert {e.message_id for e in week} == {2, 3}
    assert {e.message_id for e in weekend} == {4, 5}


def test_sunday_quota_starts_at_sunday_7am():
    # 토요일 몫이 조회수 높은 글로 차 있어도 일 07:00 글은 일요일 몫으로 든다. 일 06:59 글은 토요일 몫이라 밀린다.
    rows = weekend_rows(PER_DAY, 1000) + [row(1, k(SUN, "06:59"), 1), row(2, k(SUN, "07:00"), 1)]
    _, _, weekend = BD.load_weekly_material(_DB(rows), SAT, k(SUN, "21:00"))
    ids = {e.message_id for e in weekend}
    assert 2 in ids and 1 not in ids


def test_window_ends_at_send_time():
    rows = [row(1, k(SUN, "17:20"), 100), row(2, k(SUN, "21:30"), 100)]
    mat, _, weekend = BD.load_weekly_material(_DB(rows), SAT, k(SUN, "21:00"))
    assert {e.message_id for e in weekend} == {1}
    assert mat.window == (k(MON, "07:00"), k(SUN, "21:00"))


def test_weekend_repost_of_a_weekday_post_merges_channels():
    text = "삼성전자 3분기 잠정 실적 발표 영업이익 12조원 시장 기대치 상회 반도체 부문 회복"
    rows = week_rows(10) + [
        row(500, k(MON + timedelta(days=1), "09:00"), 9000, text=text, ch="a"),
        row(501, k(SAT, "10:00"), 100, text=text, ch="b"),
        row(502, k(SAT, "11:00"), 100, text="주말에 처음 나온 이야기입니다", ch="c"),
    ]
    mat, week, weekend = BD.load_weekly_material(_DB(rows), SAT, k(SUN, "21:00"))
    assert [e.message_id for e in weekend] == [502]
    [orig] = [e for e in week if e.message_id == 500]
    assert orig.channels == {"a", "b"}
    assert [e.n for e in mat.excerpts] == list(range(1, len(mat.excerpts) + 1))


def test_sunday_repost_of_a_saturday_post_merges_channels():
    text = "주말 사이 정부가 가상자산 거래소 대상 현장 점검 일정을 발표 다음 주 월요일부터 진행"
    rows = [
        row(600, k(SAT, "10:00"), 900, text=text, ch="a"),
        row(601, k(SUN, "10:00"), 100, text=text, ch="b"),
        row(602, k(SUN, "11:00"), 100, text="일요일에 처음 나온 이야기입니다", ch="c"),
    ]
    _, _, weekend = BD.load_weekly_material(_DB(rows), SAT, k(SUN, "21:00"))
    assert [e.message_id for e in weekend] == [600, 602]
    assert weekend[0].channels == {"a", "b"}


R_REAL = BD.Render(
    cta_link=S.cta_link, quote=S.quote, paragraphs=S.paragraphs, date_label=S.korean_date_label,
    js_round=S.js_round, stage_for_score=S.stage_for_score, stage_emoji=S.STAGE_EMOJI,
)


def test_post_header_and_digest_run_monday_to_sunday(monkeypatch):
    got = {}
    monkeypatch.setattr(BD, "load_kr_reasons", lambda db, d: ("", []))
    monkeypatch.setattr(BD, "load_week_new_faces", lambda db, monday, until: got.setdefault("faces", (monday, until)) and [])
    monkeypatch.setattr(BD, "load_events", lambda *a: [])
    monkeypatch.setattr(BD, "load_scores", lambda *a, **kw: [])
    monkeypatch.setattr(BD, "stored_digest_lines", lambda *a, **kw: [])
    monkeypatch.setattr(BD, "_changes_for", lambda *a: ({}, {}))
    monkeypatch.setattr(BD, "store_digest", lambda db, day, slot, *a: got.setdefault("stored", (day, slot)))

    def compose(llm, model, fmt, digest, mat, note=""):
        got["digest"] = digest
        return [BD.Section(f"갈래 {i}", "본문입니다.", [], [], [1]) for i in range(3)]

    monkeypatch.setattr(BD, "compose_sections", compose)
    db = _DB(week_rows(150) + weekend_rows(30, 1000) + sunday_rows(30, 2000))
    text = BD.build_weekly2(db, object(), "m", R_REAL, SUN, k(SUN, "21:00"), True)

    assert text.splitlines()[1] == "10월 12일(월) ~ 10월 18일(일)"
    assert "10월 12일(월) 부터 10월 18일(일) 까지" in got["digest"]
    assert "[주말 발췌]" in got["digest"] and "[평일 발췌]" in got["digest"]
    assert got["faces"] == (MON, SUN)
    assert got["stored"] == (SUN, "weekly")


def test_saturday_manual_run_says_saturday(monkeypatch):
    # 토요일에 손으로 돌리면 그날까지 모은 글만 있다 — 날짜 줄이 일요일까지라고 하면 안 된다.
    monkeypatch.setattr(BD, "load_kr_reasons", lambda db, d: ("", []))
    monkeypatch.setattr(BD, "load_week_new_faces", lambda *a: [])
    monkeypatch.setattr(BD, "load_events", lambda *a: [])
    monkeypatch.setattr(BD, "load_scores", lambda *a, **kw: [])
    monkeypatch.setattr(BD, "stored_digest_lines", lambda *a, **kw: [])
    monkeypatch.setattr(BD, "_changes_for", lambda *a: ({}, {}))
    monkeypatch.setattr(
        BD, "compose_sections", lambda *a, **kw: [BD.Section(f"갈래 {i}", "본문입니다.", [], [], [1]) for i in range(3)]
    )
    db = _DB(week_rows(150) + weekend_rows(10, 1000))
    text = BD.build_weekly2(db, object(), "m", R_REAL, SAT, k(SAT, "15:00"), False)
    assert text.splitlines()[1] == "10월 12일(월) ~ 10월 17일(토)"

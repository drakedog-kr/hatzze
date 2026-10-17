"""총평 둘째 대목 '시장 흐름'(generate_telegram_narratives FLOW_* · 2026-10-14). 국장 · 미장이 같은 함수를 쓴다."""
import generate_telegram_narratives as KR


def rows(counts: dict[str, int], kind: str = "news", kr: str = "negative", us: str = "none") -> list[dict]:
    return [{"date": d, "kind": kind, "kr": kr, "us": us} for d, n in counts.items() for _ in range(n)]


def days(r: list[dict], latest: str, market: str = "kr") -> list[str]:
    return KR.flow_days(KR.flow_rows(r, market), latest)


def test_flow_days_weekday_evening_takes_three_full_days():
    r = rows({"2026-10-14": 275, "2026-10-13": 393, "2026-10-12": 300, "2026-10-11": 31})
    assert days(r, "2026-10-14") == ["2026-10-12", "2026-10-13", "2026-10-14"]


def test_flow_days_morning_keeps_thin_today_as_extra():
    # 아침 실행: 기준일은 밤사이 글 몇 건뿐이다. 그날은 넣되 사흘 셈에는 안 친다.
    r = rows({"2026-10-14": 4, "2026-10-13": 393, "2026-10-12": 300, "2026-10-11": 31, "2026-10-10": 21})
    assert days(r, "2026-10-14") == ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]


def test_flow_days_skips_thin_days_and_auto():
    r = rows({"2026-10-13": 300, "2026-10-12": 5, "2026-10-11": 200}) + rows({"2026-10-12": 50}, kind="auto")
    # 기준일에 글이 없으면 안 넣는다. 자동 알림은 세지 않아 10-12 는 문턱 아래다.
    assert days(r, "2026-10-14") == ["2026-10-11", "2026-10-13"]


def test_flow_rows_keeps_only_that_market():
    r = rows({"2026-10-13": 12}) + rows({"2026-10-13": 30}, kr="none", us="positive")
    assert days(r, "2026-10-14", "kr") == ["2026-10-13"]
    assert len(KR.flow_rows(r, "us")) == 30
    assert KR.flow_rows(rows({"2026-10-13": 5}, kr="none", us="none"), "kr") == []


def test_flow_days_looks_back_one_week_at_most():
    r = rows({"2026-10-01": 300})
    assert days(r, "2026-10-14") == []


DIGEST = "\n".join(
    [
        "[전체] 최근 2일(10-13~10-14, 오늘 포함) 시장 전체를 말한 글 400건 · 낙관도 14%",
        "",
        "[오늘 오간 이야기] 조회·확산 상위 6건 (표본 3000건)",
        "- 셋째 대목 발췌",
        KR.NEWS_SCHEDULE_NOTE,
        "",
        f"[10-12~10-14 {KR.FLOW_BLOCK_HEAD}] 증시 전체를 말한 글 가운데 날마다 조회·확산 상위 3건 (오래된 날부터)",
        "10-12(월)",
        "- [기사] 둘째 대목 발췌",
        "  ※ [기사]는 보도된 사실이고 [리서치]·[채널 의견]은 글쓴이의 풀이입니다.",
        "",
        f"[10-12~10-14 {KR.SCHEDULE_BLOCK_HEAD}] 채널에서 앞날을 짚은 글 1건 발췌",
        "- 넷째 대목 발췌",
    ]
)


def test_flow_digest_is_only_the_flow_block():
    got = KR.flow_digest(DIGEST)
    assert got.startswith(f"[10-12~10-14 {KR.FLOW_BLOCK_HEAD}]")
    assert "둘째 대목 발췌" in got
    assert "셋째 대목 발췌" not in got and "넷째 대목 발췌" not in got


def test_without_flow_keeps_the_rest():
    got = KR.without_flow(DIGEST)
    assert "둘째 대목 발췌" not in got and KR.FLOW_BLOCK_HEAD not in got
    assert "셋째 대목 발췌" in got and "넷째 대목 발췌" in got
    # 넷째 대목은 여전히 제 블록을 찾는다.
    assert KR.schedule_digest(got).endswith("- 넷째 대목 발췌")


def test_no_flow_block():
    plain = DIGEST.replace(KR.FLOW_BLOCK_HEAD, "다른 이름")
    assert not KR.has_flow_block(plain)
    assert KR.without_flow(plain) == plain
    assert KR.has_flow_block(DIGEST)


def test_flow_figures_catch_levels_not_dates():
    assert KR.flow_figures("코스피가 6400선을 내줬고 삼성전자는 4.3% 빠졌습니다.") == ["6400선", "4.3%"]
    assert KR.flow_figures("외국인이 3조 원 넘게 팔았습니다.") == ["3조"]
    assert KR.flow_figures("10월 14일 아침 야간선물이 올랐고 반도체는 6거래일째 약했습니다.") == []
    assert KR.flow_figures("최근 3일 동안 이어졌습니다.") == []


def test_flow_outlook():
    assert KR.flow_outlook("바닥을 가늠하는 말이 오갔습니다.") == ["바닥"]
    assert KR.flow_outlook("저가 매수 구간에 들어왔다는 풀이가 나왔습니다.") == ["저가 매수"]
    assert KR.flow_outlook("야간선물이 반등했다는 소식이 나왔습니다.") == []
    assert KR.flow_outlook("외국인 매도가 이유로 꼽혔습니다.") == []


def test_shared_terms_names_and_latin():
    names = ["삼성전자", "SK하이닉스", "대상", "에이피알"]
    news = "CXMT가 DDR5 출시를 밝힌 뒤 삼성전자와 SK하이닉스의 경쟁 구도를 두고 이야기가 이어졌습니다."
    flow = "외국인 매도와 CXMT의 추격, HBM 수요 우려가 이유로 꼽혔고 삼성전자 실적도 거론됐습니다."
    assert KR.shared_terms(news, flow, names) == ["CXMT", "삼성전자"]


def test_shared_terms_ignores_generic_words():
    names = ["대상"]
    news = "대상 기업의 HBM과 DDR5 이야기, FOMC 의사록이 나왔습니다."
    flow = "금리와 FOMC를 두고 말이 오갔고 HBM 수요와 대상 업종 이야기도 있었습니다."
    assert KR.shared_terms(news, flow, names) == []


def test_flow_fix_note():
    assert KR.flow_fix_note("외국인 매도가 이어졌습니다.", "", []) == ""
    note = KR.flow_fix_note("코스피가 6400선을 내줬고 바닥 이야기가 나왔습니다.", "", [])
    assert "6400선" in note and "바닥" in note
    note = KR.flow_fix_note("CXMT 추격이 이유로 꼽혔습니다.", "CXMT가 신제품을 냈습니다.", [])
    assert "'CXMT'" in note and "다음 대목" in note


def test_brief_order_puts_flow_second():
    # 홈 여론 줄(generate_daily_summary.brief_story)이 둘째 문단을 시장 흐름으로 읽는다.
    assert KR.BRIEF_ORDER[:3] == ("tone", "flow", "news")
    assert set(KR.BRIEF_ORDER) == set(KR.BRIEF_SENTENCE_CAP)


# ── 2026-10-15 점검: 미장 날짜 머리에 직전 미국장 ─────────────────────────────
# 한국 날짜 머리만 주면 10-16 · 17 미장 총평이 수요일장 CPI 하락을 '목요일'로, 목요일 반등을 '금요일'로 적었다.


def test_us_session_note():
    assert KR.us_session_note({"us_session": "2026-10-14", "spx_dp": -1.11}) == " · 직전 미국장 10-14(수) S&P500 -1.11%"
    assert KR.us_session_note({"us_session": "2026-10-15", "spx_dp": None}) == " · 직전 미국장 10-15(목)"
    assert KR.us_session_note(None) == ""


class _Q:
    def __init__(self, data):
        self.data = data

    def select(self, *_):
        return self

    def in_(self, _col, vals):
        self.data = [r for r in self.data if r["date"] in vals]
        return self

    def execute(self):
        return self


class _DB:
    def __init__(self, data):
        self._data = data

    def table(self, _name):
        return _Q(list(self._data))


def test_us_sessions_reads_and_survives_failure():
    db = _DB([{"date": "2026-10-15", "us_session": "2026-10-14", "spx_dp": -1.11}, {"date": "2026-10-18", "us_session": None, "spx_dp": None}])
    got = KR.us_sessions(db, ["2026-10-15", "2026-10-18"])
    assert list(got) == ["2026-10-15"]
    assert KR.us_sessions(object(), ["2026-10-15"]) == {}  # 표를 못 읽으면 머리에 안 붙인다
    assert KR.us_sessions(db, []) == {}

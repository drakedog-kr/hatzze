"""시장 전체 분위기 판정(scripts/analyze_telegram_market.py)의 순수 규칙 — 누구에게 묻나, 날짜별로 어떻게 세나."""
import analyze_telegram_market as M


def msg(text, handle="somechannel", posted_at="2026-09-28T01:00:00+00:00", mid=1):
    return {"channel_handle": handle, "message_id": mid, "posted_at": posted_at, "text": text}


def test_candidate_needs_market_word():
    assert M.is_candidate(msg("코스피, 연휴 끝나자 7000선 무너져 삼전닉스 3% 이상 하락"))
    assert M.is_candidate(msg("투심이 안 좋으니까 대미투자 관련주들 시세 반영 속도가 상당히 늦네요"))
    assert not M.is_candidate(msg("두산퓨얼셀, 3,222억 원 규모 연료전지 공급 계약 체결했습니다"))


def test_candidate_skips_short_and_excluded_channels():
    assert not M.is_candidate(msg("코스피 하락"))  # 20자 미만
    assert not M.is_candidate(msg("코스피 7,000선 공방 속 외국인 순매도 지속 중입니다", handle="dartAll"))


def test_posted_date_is_kst():
    # 2026-09-27 15:30 UTC = 09-28 00:30 KST
    assert M.kst_date("2026-09-27T15:30:00+00:00") == "2026-09-28"


class _Rec:
    def __init__(self):
        self.upserts = []

    def table(self, name):
        rec = self

        class T:
            def upsert(self, rows, on_conflict=None):
                rec.upserts.append((name, rows))
                return self

            def execute(self):
                return self

        return T()


def test_daily_counts_fold_same_body_same_day(monkeypatch):
    rows = [
        # 같은 날 같은 본문 셋 → 한 번
        {"channel_handle": "a", "message_id": 1, "posted_date": "2026-09-28", "text_hash": "h1", "kr": "negative", "us": "none"},
        {"channel_handle": "b", "message_id": 2, "posted_date": "2026-09-28", "text_hash": "h1", "kr": "negative", "us": "none"},
        {"channel_handle": "c", "message_id": 3, "posted_date": "2026-09-28", "text_hash": "h1", "kr": "negative", "us": "none"},
        # 다른 날 같은 본문 → 따로 센다
        {"channel_handle": "d", "message_id": 4, "posted_date": "2026-09-27", "text_hash": "h1", "kr": "negative", "us": "none"},
        {"channel_handle": "e", "message_id": 5, "posted_date": "2026-09-28", "text_hash": "h2", "kr": "positive", "us": "positive"},
        # none 은 세지 않는다 — 시장 글이 아니다
        {"channel_handle": "f", "message_id": 6, "posted_date": "2026-09-28", "text_hash": "h3", "kr": "none", "us": "neutral"},
    ]
    monkeypatch.setattr(M, "load_keyset", lambda db, table, cols, key="id", narrow=None: [dict(r, id=str(i)) for i, r in enumerate(rows)])
    db = _Rec()
    M.write_daily(db, dry_run=False)
    (name, out), = db.upserts
    assert name == M.MARKET_DAILY_TABLE
    got = {(r["date"], r["market"]): (r["positive_count"], r["neutral_count"], r["negative_count"], r["message_count"]) for r in out}
    assert got[("2026-09-28", "kr")] == (1, 0, 1, 2)
    assert got[("2026-09-27", "kr")] == (0, 0, 1, 1)
    assert got[("2026-09-28", "us")] == (1, 1, 0, 2)
    assert ("2026-09-27", "us") not in got

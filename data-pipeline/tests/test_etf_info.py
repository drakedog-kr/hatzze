"""fetch_etf_info — ISIN 체크숫자 · 세이브로 응답의 앞 칸만 읽기 · 행 만들기."""

import fetch_etf_info as m


def test_isin_check_digit_matches_known():
    assert m.to_isin("069500") == "KR7069500007"
    assert m.to_isin("360750") == "KR7360750004"
    # 영문이 섞인 단축코드(2025 이후 신규 상장) — 글자를 36진 숫자로 편다.
    assert m.to_isin("0094M0") == "KR70094M0005"


SAMPLE = (
    '<result result="1"><ISIN value="KR7069500007"/><KOR_SECN_NM value="KODEX 200"/>'
    '<SETUP_DT value="20021011"/><TOT_RECM_RATE value=".15"/><MNGCO_ACOPNO_NM value="삼성자산운용"/>'
    '<ETF_BIG_SORT_NM value="시장지수/코스피200"/><MNGCO_STD_FUND_BCHMRK_CONTENT value="KOSPI200 x 100%"/>'
    '<data vectorkey="0"><result><KOR_SECN_NM value="삼성물산"/></result></data></result>'
)


def test_parse_reads_head_only():
    # 보유종목 목록 안의 KOR_SECN_NM('삼성물산')이 ETF 이름을 덮으면 안 된다.
    info = m.parse_info(SAMPLE)
    assert info["KOR_SECN_NM"] == "KODEX 200"


def test_to_row():
    row = m.to_row("069500", m.parse_info(SAMPLE))
    assert row["fee_pct"] == 0.15
    assert row["setup_date"] == "2002-10-11"
    assert row["manager"] == "삼성자산운용"
    assert row["category"] == "시장지수/코스피200"
    assert m.to_row("999999", {}) is None

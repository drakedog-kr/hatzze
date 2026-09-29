"""13F 정보표에서 옵션 줄(putCall)을 보통주 보유에 섞지 않는지(fetch_us_13f.holdings_of).

옵션은 기초 종목의 CUSIP 을 그대로 달고 오고 sshPrnamt·value 가 기초 주식 수·명목 금액이라,
안 거르면 풋(하락 베팅)이 보통주 매수로 합산된다.
"""
import fetch_us_13f as f13


def _row(name, cusip, value, shares, title="COM", put_call=None, ns="ns1:"):
    pc = f"<{ns}putCall>{put_call}</{ns}putCall>" if put_call is not None else ""
    return (
        f"<{ns}infoTable><{ns}nameOfIssuer>{name}</{ns}nameOfIssuer><{ns}titleOfClass>{title}</{ns}titleOfClass>"
        f"<{ns}cusip>{cusip}</{ns}cusip><{ns}value>{value}</{ns}value>"
        f"<{ns}shrsOrPrnAmt><{ns}sshPrnamt>{shares}</{ns}sshPrnamt><{ns}sshPrnamtType>SH</{ns}sshPrnamtType></{ns}shrsOrPrnAmt>"
        f"{pc}<{ns}investmentDiscretion>SOLE</{ns}investmentDiscretion></{ns}infoTable>"
    )


def _doc(*rows, ns="ns1:"):
    return f'<{ns}informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">{"".join(rows)}</{ns}informationTable>'


def test_skips_put_and_call_rows():
    doc = _doc(
        _row("NVIDIA CORPORATION", "67066G104", "18,000,000", "100,000"),
        _row("NVIDIA CORPORATION", "67066G104", "180,000,000", "1,000,000", title="PUT", put_call="Put"),
        _row("APPLE INC", "037833100", "5,000,000", "20,000", title="CALL", put_call="Call"),
    )
    assert f13.holdings_of(doc) == [
        {"name": "NVIDIA CORPORATION", "cusip": "67066G104", "value": 18_000_000.0, "shares": 100_000.0},
    ]


def test_skips_options_without_namespace_prefix():
    doc = _doc(
        _row("NVIDIA CORPORATION", "67066g104", "18000000", "100000", ns=""),
        _row("NVIDIA CORPORATION", "67066g104", "180000000", "1000000", title="PUT", put_call="Put", ns=""),
        ns="",
    )
    assert [(h["cusip"], h["shares"]) for h in f13.holdings_of(doc)] == [("67066G104", 100_000.0)]


def test_empty_put_call_is_a_stock_row():
    # 칸만 있고 비어 있으면 옵션이 아니다 — 보통주로 둔다.
    doc = _doc(_row("COCA COLA CO", "191216100", "7000000", "100000", put_call=""))
    assert [h["shares"] for h in f13.holdings_of(doc)] == [100_000.0]

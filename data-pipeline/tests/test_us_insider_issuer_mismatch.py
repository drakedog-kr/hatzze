"""임원 공시 파싱 — 심볼 없는 다른 발행사 신고는 버린다(fetch_us_insider.parse_filing).

블랙스톤 계열이 비상장 펀드를 산 Form 4(issuerTradingSymbol NONE · 발행사 CIK 2049733)가 폴더 CIK 의 티커 BX 로 담겨
'BX 임원 장내 매수'로 섰다(2026-10-04 점검).
"""
import datetime as dt

import fetch_us_insider as fi

BX_CIK = 1393818


def _doc(sym: str, issuer: int) -> str:
    return f"""<ownershipDocument>
<issuer><issuerCik>{issuer}</issuerCik><issuerName>X</issuerName><issuerTradingSymbol>{sym}</issuerTradingSymbol></issuer>
<reportingOwner><rptOwnerName>Blackstone Holdings IV L.P.</rptOwnerName></reportingOwner>
<nonDerivativeTransaction><transactionDate><value>2026-09-24</value></transactionDate>
<transactionCoding><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>26.15</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
<postTransactionAmounts><sharesOwnedFollowingTransaction><value>100</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
</nonDerivativeTransaction></ownershipDocument>"""


def test_no_symbol_other_issuer_is_dropped():
    rows = fi.parse_filing(_doc("NONE", 2049733), "BX", BX_CIK, "acc-1", dt.date(2026, 9, 25), "x/y.txt")
    assert rows == []


def test_no_symbol_same_issuer_kept():
    rows = fi.parse_filing(_doc("NONE", BX_CIK), "BX", BX_CIK, "acc-2", dt.date(2026, 9, 25), "x/y.txt")
    assert [r["ticker"] for r in rows] == ["BX"]


def test_symbol_wins():
    rows = fi.parse_filing(_doc("BX", BX_CIK), "BX", BX_CIK, "acc-3", dt.date(2026, 9, 25), "x/y.txt")
    assert [r["ticker"] for r in rows] == ["BX"]

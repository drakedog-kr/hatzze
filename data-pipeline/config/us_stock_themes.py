"""테마 → 미국 종목(티커) 사전 (미장 카더라 테마 로테이션).

국내 짝은 `config/stock_themes.py`. 성격도 같다 — 업종 코드가 아니라 **투자자가 말하는
테마**로 사람이 큐레이션한다. 결정적·무비용·환각 없음, 대신 새 테마가 뜨면 사람이 갱신한다.

## 국내 사전과 다른 점 둘

1. **키가 종목명이 아니라 티커다.** 국내는 `stocks` 표의 KRX 정식명과 글자가 정확히
   맞아야 매칭되는데, 미국은 이름의 원본이 `config/us_stock_extraction.py` 라
   한글 표기가 흔들릴 수 있다("알파벳"/"구글"). 티커는 흔들리지 않는다.
2. **테마가 16개로 국내(11개)보다 많다.** 미국 쪽 사전이 다루는 산업 폭이 넓어서다 —
   양자컴퓨팅·우주·가상자산처럼 국내에 대응 테마가 없는 것이 여럿이다.

## 이 목록을 상상으로 짜지 않았다

사전 178종목을 **최근 언급량 순으로 뽑아 놓고** 위에서부터 배정했다. 그래야 테마가
실제 대화량을 덮는다. 언급이 한두 건인 꼬리(밸레로 1 · 사이퍼마이닝 1)까지 넣은 이유는,
빼 두면 나중에 그 종목이 떴을 때 조용히 어느 테마에도 안 잡히기 때문이다.

⚠️ 한 종목이 여러 테마에 속해도 된다(국내와 같다). 집계가 각 테마에 모두 반영한다.
   예: UBER 는 전기차·자율주행이면서 소프트웨어가 아니라 — 자율주행 쪽에만 뒀다.
   겹치기는 근거가 뚜렷할 때만 쓴다. 겹칠수록 share_pct 합이 100%를 넘어 카드가
   "비중"이라는 말과 어긋나 보인다.
"""

from __future__ import annotations

US_THEMES: dict[str, list[str]] = {
    # 이 페이지에서 가장 큰 덩어리(NVDA 만으로 전체 언급의 10%다). 국내 반도체 테마와
    # 짝을 이루므로 '함께 언급된 국내 종목' 카드와 나란히 읽힌다.
    "AI반도체": [
        "NVDA", "AMD", "AVGO", "TSM", "ARM", "MRVL", "QCOM", "INTC",
        "ALAB", "MPWR", "ON", "NXPI", "TXN", "SWKS", "QRVO", "NVTS",
        "WOLF", "TSEM", "CBRS", "CRDO",
    ],
    # 메모리를 AI반도체에서 떼어 낸 건 **국내 투자자에게 이게 별개의 이야기**라서다.
    # 마이크론·샌디스크 얘기는 곧 삼성전자·SK하이닉스 얘기로 이어진다.
    "메모리": ["MU", "SNDK", "WDC", "STX"],
    "반도체 장비·소재": [
        "ASML", "LRCX", "KLAC", "AMAT", "TER", "FORM", "AMKR",
        "COHR", "LITE", "GLW", "SNPS", "CDNS", "CLS", "CIEN",
    ],
    "빅테크": ["GOOGL", "AMZN", "AAPL", "META", "MSFT", "NFLX"],
    # '데이터센터를 짓는 쪽'. 소프트웨어와 갈라 둔다 — 이쪽은 전력·부품 수요로 이어져
    # 아래 전력·원자력 테마와 같이 움직이는 일이 잦다.
    "AI 인프라·클라우드": [
        "ORCL", "PLTR", "CRWV", "NBIS", "SMCI", "DELL", "ANET", "VRT",
        "IREN", "WULF", "EQIX", "DLR", "IBM", "CSCO", "NOK",
    ],
    "소프트웨어": [
        "CRM", "NOW", "ADBE", "SNOW", "DDOG", "NET", "PANW", "CRWD",
        "TEAM", "APP", "TTD", "RDDT", "RBLX", "SHOP", "ZBRA", "APH",
        "OKTA", "WDAY", "INTU",
    ],
    "전기차·자율주행": ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "GM", "F", "APTV", "UBER", "CVNA"],
    "전력·원자력": [
        "SMR", "OKLO", "CEG", "VST", "NRG", "NEE", "GEV", "PWR",
        "ETN", "CCJ", "HON", "FSLR", "ENPH", "BE",
    ],
    "우주·방산": ["RKLB", "ASTS", "RDW", "LMT", "RTX", "NOC", "GD", "HII", "BA", "AXON"],
    # MRNA 를 1위가 아니라 2위에 둔 이유: 코퍼스 전체로는 477건으로 LLY(422)보다 많은데
    # 그중 341건이 08-19~20 이틀치(머크와의 흑색종 백신 3상 성공)다. 이 순서는 카드가
    # 쓰는 '대표성' 순서라, 이틀짜리 급등으로 맨 앞자리를 주지 않는다.
    "바이오·헬스케어": [
        "LLY", "MRNA", "NVO", "MRK", "PFE", "ABBV", "AZN", "NVS",
        "JNJ", "UNH", "ISRG", "MDGL", "CVS", "CAH", "AMGN", "MDT", "EVMN",
    ],
    "금융": ["GS", "JPM", "MS", "BAC", "BRK", "BX", "SCHW", "MA", "AXP", "PYPL", "SOFI", "UPST", "C"],
    # 코인 시세와 함께 움직이는 묶음. 금융과 갈라 둔 이유는 그날 오가는 얘기가
    # 실적이 아니라 코인 시세라, 섞으면 금융 테마의 순위가 코인 때문에 흔들린다.
    "가상자산": ["COIN", "MSTR", "CRCL", "GLXY", "CLSK", "RIOT", "CIFR", "HOOD"],
    "소비재·유통": [
        "KO", "WMT", "COST", "SBUX", "MCD", "NKE", "CMG", "PEP", "PM",
        "DIS", "DKNG", "ORLY", "DECK", "LUV", "DHI", "PLD", "WELL",
        "CPNG", "MELI", "URI", "ABNB", "BKNG", "CAT", "VZ",
        "HD", "BBY", "DLTR", "EBAY",
    ],
    "에너지·원자재": ["XOM", "CVX", "KMI", "VLO", "FCX", "NEM", "NUE", "ALB"],
    # 아직 작지만(합쳐 170회) 뜰 때 한꺼번에 뜨는 묶음이라 따로 둔다.
    # 다른 테마에 섞으면 그 순간이 안 보인다.
    "양자컴퓨팅": ["IONQ", "QBTS", "RGTI"],
    # 미국 상장이지만 중국 기업. 한국 투자자에게는 '미국장'이 아니라 '중국'으로 읽히는
    # 종목들이라, 빅테크·소비재에 섞지 않고 따로 세운다.
    "중국": ["BABA", "BIDU", "PDD", "JD"],
}


def sanity_check(known_tickers: set[str]) -> list[str]:
    """사전이 us_stocks 에 없는 티커를 가리키고 있는지 본다.

    국내 짝(calculate_theme_daily.py)은 이 검사를 스크립트 안에서 하는데, 여기서는
    사전 쪽에 둔다 — 미국 사전의 원본이 DB 가 아니라 파이썬 파일이라
    (`us_stock_extraction.py`) 두 파일이 어긋나는 게 유일한 실패 모드다.
    """
    problems = []
    for theme, tickers in US_THEMES.items():
        for t in tickers:
            if t not in known_tickers:
                problems.append(f"{theme}: {t} 가 us_stocks 에 없습니다")
        dupes = {t for t in tickers if tickers.count(t) > 1}
        if dupes:
            problems.append(f"{theme}: 같은 티커가 두 번 — {', '.join(sorted(dupes))}")
    return problems

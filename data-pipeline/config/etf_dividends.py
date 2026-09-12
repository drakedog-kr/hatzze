"""배당으로 살기(/dividend)에 넣는 ETF — 미국은 이 목록, 국내는 미래에셋 TIGER 전체(자동).

## 미국 ETF — 목록만 적는다. 분배금은 stockanalysis.com 에서 매일 받는다

`/etf/{티커}/dividend/` 페이지가 지급일·금액을 준다(common/stockanalysis.py, 내부자 리포트와 같은
원천·약관). 2026-09-12 에 운용사 공시와 맞대어 같은 값임을 봤다(SCHD 2026-06-29 0.2525 ·
JEPI 2026-09-03 0.37142). 티커와 이름만 적으면 된다. `pays` 를 적어 두면 그 페이지가 막힌 날의
대체값이다(없어도 된다).

목록은 서학개미가 배당·월분배로 드는 것 위주다 — SCHD 계열, JP모건·글로벌X 커버드콜, 뱅가드·
아이셰어즈 배당, 리츠·우선주·채권(월배당이라 파이어족이 든다), 일드맥스(단일 종목 옵션, 분배금이
달마다 크게 흔들려 '추정'이 아니라 '변동 큼'으로 적어야 한다 — 화면은 아직 그 표시가 없다).

## 국내 ETF — 미래에셋 TIGER 는 자동, 나머지 운용사는 아직 없다

TIGER 연간 분배금 표(`investments.miraeasset.com/tigeretf/ko/distribution/annual/list.ajax`)가
서버에서 그려져 curl 로 열린다. 스크립트가 매일 받아 232종목(2025년 분배 있는 208) 전부를 넣는다.
⚠️ 운용사 공시 페이지를 자동으로 받는 것이다. 약관을 따로 확인하지 못했다(2026-09-12).
⛔ KODEX·SOL·ACE·RISE·PLUS·KIWOOM·HANARO 는 페이지가 JS 로 그려지거나(SOL·ACE) 서버가 502 를
   내서(KODEX) 아직 못 넣었다. 열린 원천이 없다 — 예탁결제원 배당 API 에 ETF 는 없고, 공공데이터포털에
   '분배금'은 0건이고, KRX 정보데이터시스템은 로그인 없이는 LOGOUT 만 돌려주고, stockanalysis 는
   국내를 안 다룬다.

## 국내 ETF 의 '1년에 얼마' 규칙

지난해 한 해 합계가 기본이다. 올해 합계를 열두 달로 늘린 값(`올해 합 × 12 ÷ 지급된 달 수`)이
지난해보다 25% 넘게 크거나 작으면 그쪽을 쓰고 `estimated` 를 켠다 — 분배금을 크게 올린 ETF
(TIGER 배당커버드콜액티브 2025 1,976 → 2026 아홉 달 3,338)를 지난해로 재면 반 토막이 난다.
지난해가 없는 새 ETF 는 올해를 늘린 값이다(추정).
⚠️ 국내 ETF 는 달별 금액이 없다(연도 합계만). 달력에서는 빠진다.
"""

US_ETFS: list[dict] = [
    {
        "code": "SCHD", "name_ko": "SCHD", "name_en": "Schwab U.S. Dividend Equity ETF", "cadence": "분기",
        "source": "https://www.schwabassetmanagement.com/products/schd",
        "pays": [("2025-09-29", 0.2604), ("2025-12-15", 0.2782), ("2026-03-30", 0.2569), ("2026-06-29", 0.2525)],
    },
    {
        "code": "JEPI", "name_ko": "JEPI", "name_en": "JPMorgan Equity Premium Income ETF", "cadence": "월",
        "source": "https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-equity-premium-income-etf-etf-shares-46641q332",
        "pays": [("2025-10-03", 0.36102), ("2025-11-05", 0.34636), ("2025-12-03", 0.3706), ("2026-01-05", 0.42709),
                 ("2026-02-04", 0.34443), ("2026-03-04", 0.35134), ("2026-04-06", 0.4205), ("2026-05-05", 0.44761),
                 ("2026-06-03", 0.38921), ("2026-07-06", 0.38716), ("2026-08-05", 0.36664), ("2026-09-03", 0.37142)],
    },
    {
        "code": "JEPQ", "name_ko": "JEPQ", "name_en": "JPMorgan Nasdaq Equity Premium Income ETF", "cadence": "월",
        "source": "https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-nasdaq-equity-premium-income-etf-etf-shares-46654q203",
        "pays": [("2025-10-03", 0.44612), ("2025-11-05", 0.47553), ("2025-12-03", 0.55323), ("2026-01-05", 0.5761),
                 ("2026-02-04", 0.46572), ("2026-03-04", 0.509), ("2026-04-06", 0.5586), ("2026-05-05", 0.59095),
                 ("2026-06-03", 0.56444), ("2026-07-06", 0.63658), ("2026-08-05", 0.70497), ("2026-09-03", 0.68255)],
    },
    {
        "code": "QYLD", "name_ko": "QYLD", "name_en": "Global X Nasdaq 100 Covered Call ETF", "cadence": "월",
        "source": "https://www.globalxetfs.com/funds/qyld/",
        "pays": [("2025-09-29", 0.1704), ("2025-10-27", 0.1731), ("2025-12-02", 0.1728), ("2025-12-30", 0.1779),
                 ("2026-01-23", 0.1786), ("2026-02-26", 0.1771), ("2026-03-26", 0.1715), ("2026-04-23", 0.1789),
                 ("2026-05-21", 0.1785), ("2026-06-25", 0.1854), ("2026-07-23", 0.1775), ("2026-08-27", 0.1829)],
    },
    {
        "code": "XYLD", "name_ko": "XYLD", "name_en": "Global X S&P 500 Covered Call ETF", "cadence": "월",
        "source": "https://www.globalxetfs.com/funds/xyld/",
        "pays": [("2025-09-29", 0.3016), ("2025-10-27", 0.3967), ("2025-12-02", 0.4003), ("2025-12-30", 0.3252),
                 ("2026-01-23", 0.3597), ("2026-02-26", 0.3412), ("2026-03-26", 0.3905), ("2026-04-23", 0.3522),
                 ("2026-05-21", 0.4012), ("2026-06-25", 0.3403), ("2026-07-23", 0.4088), ("2026-08-27", 0.3109)],
    },
    # 아래는 stockanalysis 만으로 채운다(pays 없음).
    {"code": "VYM", "name_ko": "VYM", "name_en": "Vanguard High Dividend Yield ETF", "cadence": "분기", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vym"},
    {"code": "VIG", "name_ko": "VIG", "name_en": "Vanguard Dividend Appreciation ETF", "cadence": "분기", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vig"},
    {"code": "DGRO", "name_ko": "DGRO", "name_en": "iShares Core Dividend Growth ETF", "cadence": "분기", "source": "https://www.ishares.com/us/products/264623/"},
    {"code": "HDV", "name_ko": "HDV", "name_en": "iShares Core High Dividend ETF", "cadence": "분기", "source": "https://www.ishares.com/us/products/239563/"},
    {"code": "DVY", "name_ko": "DVY", "name_en": "iShares Select Dividend ETF", "cadence": "분기", "source": "https://www.ishares.com/us/products/239500/"},
    {"code": "SPYD", "name_ko": "SPYD", "name_en": "SPDR Portfolio S&P 500 High Dividend ETF", "cadence": "분기", "source": "https://www.ssga.com/us/en/intermediary/etfs/spdr-portfolio-sp-500-high-dividend-etf-spyd"},
    {"code": "SPHD", "name_ko": "SPHD", "name_en": "Invesco S&P 500 High Dividend Low Volatility ETF", "cadence": "월", "source": "https://www.invesco.com/us/financial-products/etfs/product-detail?ticker=SPHD"},
    {"code": "DIVO", "name_ko": "DIVO", "name_en": "Amplify CWP Enhanced Dividend Income ETF", "cadence": "월", "source": "https://amplifyetfs.com/divo/"},
    {"code": "RYLD", "name_ko": "RYLD", "name_en": "Global X Russell 2000 Covered Call ETF", "cadence": "월", "source": "https://www.globalxetfs.com/funds/ryld/"},
    {"code": "SCHY", "name_ko": "SCHY", "name_en": "Schwab International Dividend Equity ETF", "cadence": "분기", "source": "https://www.schwabassetmanagement.com/products/schy"},
    {"code": "VYMI", "name_ko": "VYMI", "name_en": "Vanguard International High Dividend Yield ETF", "cadence": "분기", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vymi"},
    {"code": "NOBL", "name_ko": "NOBL", "name_en": "ProShares S&P 500 Dividend Aristocrats ETF", "cadence": "분기", "source": "https://www.proshares.com/our-etfs/strategic/nobl"},
    {"code": "SDY", "name_ko": "SDY", "name_en": "SPDR S&P Dividend ETF", "cadence": "분기", "source": "https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-dividend-etf-sdy"},
    {"code": "DGRW", "name_ko": "DGRW", "name_en": "WisdomTree U.S. Quality Dividend Growth Fund", "cadence": "월", "source": "https://www.wisdomtree.com/investments/etfs/equity/dgrw"},
    {"code": "FDVV", "name_ko": "FDVV", "name_en": "Fidelity High Dividend ETF", "cadence": "분기", "source": "https://institutional.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=FDVV"},
    {"code": "VNQ", "name_ko": "VNQ", "name_en": "Vanguard Real Estate ETF", "cadence": "분기", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vnq"},
    {"code": "PFF", "name_ko": "PFF", "name_en": "iShares Preferred & Income Securities ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239826/"},
    {"code": "TLT", "name_ko": "TLT", "name_en": "iShares 20+ Year Treasury Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239454/"},
    {"code": "BND", "name_ko": "BND", "name_en": "Vanguard Total Bond Market ETF", "cadence": "월", "source": "https://investor.vanguard.com/investment-products/etfs/profile/bnd"},
    {"code": "SGOV", "name_ko": "SGOV", "name_en": "iShares 0-3 Month Treasury Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/314116/"},
    {"code": "VOO", "name_ko": "VOO", "name_en": "Vanguard S&P 500 ETF", "cadence": "분기", "source": "https://investor.vanguard.com/investment-products/etfs/profile/voo"},
    {"code": "VTI", "name_ko": "VTI", "name_en": "Vanguard Total Stock Market ETF", "cadence": "분기", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vti"},
    {"code": "QQQ", "name_ko": "QQQ", "name_en": "Invesco QQQ Trust", "cadence": "분기", "source": "https://www.invesco.com/qqq-etf/en/home.html"},
    {"code": "SPY", "name_ko": "SPY", "name_en": "SPDR S&P 500 ETF Trust", "cadence": "분기", "source": "https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-500-etf-trust-spy"},
    {"code": "TSLY", "name_ko": "TSLY", "name_en": "YieldMax TSLA Option Income Strategy ETF", "cadence": "월", "source": "https://www.yieldmaxetfs.com/our-etfs/tsly/"},
    {"code": "NVDY", "name_ko": "NVDY", "name_en": "YieldMax NVDA Option Income Strategy ETF", "cadence": "월", "source": "https://www.yieldmaxetfs.com/our-etfs/nvdy/"},
    {"code": "MSTY", "name_ko": "MSTY", "name_en": "YieldMax MSTR Option Income Strategy ETF", "cadence": "월", "source": "https://www.yieldmaxetfs.com/our-etfs/msty/"},
    {"code": "CONY", "name_ko": "CONY", "name_en": "YieldMax COIN Option Income Strategy ETF", "cadence": "월", "source": "https://www.yieldmaxetfs.com/our-etfs/cony/"},
]

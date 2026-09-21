"""배당으로 살기(/dividend)에 넣는 ETF — 미국은 이 목록, 국내는 예탁결제원 SEIBro 에 분배 기록이 있는 전부(자동).

## 미국 ETF — 목록만 적는다. 분배금은 stockanalysis.com 에서 매일 받는다

`/etf/{티커}/dividend/` 페이지가 지급일·금액을 준다(common/stockanalysis.py, 내부자 리포트와 같은
원천·약관). 2026-09-12 에 운용사 공시와 맞대어 같은 값임을 봤다(SCHD 2026-06-29 0.2525 ·
JEPI 2026-09-03 0.37142). 티커와 이름만 적으면 된다. `pays` 를 적어 두면 그 페이지가 막힌 날의
대체값이다(없어도 된다).

목록은 서학개미가 배당·월분배로 드는 것 위주다 — SCHD 계열, JP모건·글로벌X·NEOS·골드만 커버드콜, 뱅가드·
아이셰어즈 배당, 리츠·우선주·채권(월배당이라 파이어족이 든다 — 하이일드·투자등급·국채·채권 커버드콜까지), 라운드힐 0DTE·일드맥스(단일 종목·묶음 옵션, 분배금이
달마다 크게 흔들려 화면이 30% 넘는 분배율에 '초고배당' 표시를 단다), 지수(VOO·IVV·QQQ·QQQM·SPY·VTI).

## 국내 ETF — 전 운용사 자동(예탁결제원 SEIBro 분배금지급현황)

SEIBro `ETF > 권리행사정보 > 분배금지급현황`(BIP_CNTS06030V)이 운용사를 가리지 않고 건마다 기준일·실지급일·
주당분배금을 준다(로그인 없음, XML 서비스). 스크립트가 매일 최근 열다섯 달치를 받아 지난 1년에 지급이 있는
종목(2026-09-16 실측 953 — TIGER 212 · KODEX 195 · RISE 129 · ACE 98 · PLUS 76 · SOL 69 · KIWOOM 60 · HANARO 33 …)을
넣는다. 자세한 건 스크립트 머리말.
⚠️ 2026-09-13~16 은 미래에셋 TIGER 사이트('전체 분배 내역')만 받았다. "운용사 열 곳은 JS·502 라 못 넣고 열린 원천이
   없다"고 적었던 것은 SEIBro 를 안 찔러 본 탓이다 — 예탁결제원 배당 API(공공데이터포털)엔 ETF 가 없지만 SEIBro 화면엔
   있다. 커뮤니티 요청(KODEX·ACE·RISE·SOL·TIME·PLUS 도, 커버드콜 더)으로 바꿨다.

## '1년에 얼마' 규칙 — 미국·국내 같다

지난 365일 안에 **지급된** 건의 합. 추정이 없다. 지급이 끊긴 지 1년이 넘으면 표에서 빠진다.
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
    # ── 2026-09-16 추가. 커뮤니티 요청(QQQM·QQQI)에 서학개미가 많이 드는 월·주 분배 ETF 를 같이. stockanalysis 에서 열다섯
    #    티커 다 지난 1년 지급 건이 있는 것을 확인했다(QQQM 4건 · 월배당 12건 · 주배당 52건). 주 분배(0DTE·일드맥스 묶음)는
    #    cadence "주" — 화면은 지급 건으로 세니 값 자체는 표시에 안 쓰인다.
    {"code": "QQQM", "name_ko": "QQQM", "name_en": "Invesco NASDAQ 100 ETF", "cadence": "분기", "source": "https://www.invesco.com/us/financial-products/etfs/product-detail?productId=ETF-QQQM"},
    {"code": "IVV", "name_ko": "IVV", "name_en": "iShares Core S&P 500 ETF", "cadence": "분기", "source": "https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf"},
    {"code": "QQQI", "name_ko": "QQQI", "name_en": "NEOS Nasdaq-100 High Income ETF", "cadence": "월", "source": "https://neosfunds.com/qqqi/"},
    {"code": "SPYI", "name_ko": "SPYI", "name_en": "NEOS S&P 500 High Income ETF", "cadence": "월", "source": "https://neosfunds.com/spyi/"},
    {"code": "IWMI", "name_ko": "IWMI", "name_en": "NEOS Russell 2000 High Income ETF", "cadence": "월", "source": "https://neosfunds.com/iwmi/"},
    {"code": "GPIX", "name_ko": "GPIX", "name_en": "Goldman Sachs S&P 500 Premium Income ETF", "cadence": "월", "source": "https://www.gsam.com/content/gsam/us/en/advisors/fund-center/etf-fund-finder/goldman-sachs-s-p-500-premium-income-etf.html"},
    {"code": "GPIQ", "name_ko": "GPIQ", "name_en": "Goldman Sachs Nasdaq-100 Premium Income ETF", "cadence": "월", "source": "https://www.gsam.com/content/gsam/us/en/advisors/fund-center/etf-fund-finder/goldman-sachs-nasdaq-100-premium-income-etf.html"},
    {"code": "FEPI", "name_ko": "FEPI", "name_en": "REX FANG & Innovation Equity Premium Income ETF", "cadence": "월", "source": "https://www.rexshares.com/fepi/"},
    {"code": "AIPI", "name_ko": "AIPI", "name_en": "REX AI Equity Premium Income ETF", "cadence": "월", "source": "https://www.rexshares.com/aipi/"},
    {"code": "XDTE", "name_ko": "XDTE", "name_en": "Roundhill S&P 500 0DTE Covered Call Strategy ETF", "cadence": "주", "source": "https://www.roundhillinvestments.com/etf/xdte/"},
    {"code": "QDTE", "name_ko": "QDTE", "name_en": "Roundhill Innovation-100 0DTE Covered Call Strategy ETF", "cadence": "주", "source": "https://www.roundhillinvestments.com/etf/qdte/"},
    {"code": "RDTE", "name_ko": "RDTE", "name_en": "Roundhill Small Cap 0DTE Covered Call Strategy ETF", "cadence": "주", "source": "https://www.roundhillinvestments.com/etf/rdte/"},
    {"code": "YMAX", "name_ko": "YMAX", "name_en": "YieldMax Universe Fund of Option Income ETFs", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/ymax/"},
    {"code": "YMAG", "name_ko": "YMAG", "name_en": "YieldMax Magnificent 7 Fund of Option Income ETFs", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/ymag/"},
    {"code": "ULTY", "name_ko": "ULTY", "name_en": "YieldMax Ultra Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/ulty/"},
    # 2026-09-17 요청. 같이 온 GLDM(금)은 분배금이 없어(stockanalysis 기록 0) 배당 화면에 넣을 게 없다 — 지급이 없는 ETF 는 이 표에 안 선다.
    {"code": "SPYM", "name_ko": "SPYM", "name_en": "SPDR Portfolio S&P 500 ETF", "cadence": "분기", "source": "https://www.ssga.com/us/en/intermediary/etfs/spdr-portfolio-sp-500-etf-spym"},
    # ── 2026-09-17 요청(CHPY · "라운드힐·앰플리파이가 다 안 들어 있다"). 일드맥스 포트폴리오·단일 종목 옵션, 앰플리파이 커버드콜·CEF, 라운드힐
    #    비트코인·이더·매그니피센트7 커버드콜과 주분배 국채. 스톡애널리시스에 스물둘 다 지난 1년 지급 건이 있는 것을 확인했다. 앰플리파이
    #    사이트는 curl 에 403 이지만 원천은 스톡애널리시스라 상관없다(source 는 사람이 여는 주소). 이름은 스톡애널리시스 메타에서.
    {"code": "CHPY", "name_ko": "CHPY", "name_en": "YieldMax Semiconductor Portfolio Option Income ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/chpy/"},
    {"code": "PLTY", "name_ko": "PLTY", "name_en": "YieldMax PLTR Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/plty/"},
    {"code": "LFGY", "name_ko": "LFGY", "name_en": "YieldMax Crypto Industry & Tech Portfolio Option Income ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/lfgy/"},
    {"code": "GPTY", "name_ko": "GPTY", "name_en": "YieldMax AI & Tech Portfolio Option Income ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/gpty/"},
    {"code": "FIAT", "name_ko": "FIAT", "name_en": "YieldMax Short COIN Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/fiat/"},
    {"code": "BIGY", "name_ko": "BIGY", "name_en": "YieldMax Target 12 Big 50 Option Income ETF", "cadence": "월", "source": "https://www.yieldmaxetfs.com/our-etfs/bigy/"},
    {"code": "QDTY", "name_ko": "QDTY", "name_en": "YieldMax Nasdaq 100 0DTE Covered Call Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/qdty/"},
    {"code": "SDTY", "name_ko": "SDTY", "name_en": "YieldMax S&P 500 0DTE Covered Call Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/sdty/"},
    {"code": "RDTY", "name_ko": "RDTY", "name_en": "YieldMax R2000 0DTE Covered Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/rdty/"},
    {"code": "AMZY", "name_ko": "AMZY", "name_en": "YieldMax AMZN Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/amzy/"},
    {"code": "APLY", "name_ko": "APLY", "name_en": "YieldMax AAPL Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/aply/"},
    {"code": "GOOY", "name_ko": "GOOY", "name_en": "YieldMax GOOGL Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/gooy/"},
    {"code": "MSFO", "name_ko": "MSFO", "name_en": "YieldMax MSFT Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/msfo/"},
    {"code": "NFLY", "name_ko": "NFLY", "name_en": "YieldMax NFLX Option Income Strategy ETF", "cadence": "주", "source": "https://www.yieldmaxetfs.com/our-etfs/nfly/"},
    {"code": "IDVO", "name_ko": "IDVO", "name_en": "Amplify CWP International Enhanced Dividend Income ETF", "cadence": "월", "source": "https://amplifyetfs.com/idvo/"},
    {"code": "QDVO", "name_ko": "QDVO", "name_en": "Amplify CWP Growth & Income ETF", "cadence": "월", "source": "https://amplifyetfs.com/qdvo/"},
    {"code": "YYY", "name_ko": "YYY", "name_en": "Amplify CEF High Income ETF", "cadence": "월", "source": "https://amplifyetfs.com/yyy/"},
    {"code": "XPAY", "name_ko": "XPAY", "name_en": "Roundhill S&P 500 Target 20 Managed Distribution ETF", "cadence": "월", "source": "https://www.roundhillinvestments.com/etf/xpay/"},
    {"code": "YBTC", "name_ko": "YBTC", "name_en": "Roundhill Bitcoin Covered Call Strategy ETF", "cadence": "주", "source": "https://www.roundhillinvestments.com/etf/ybtc/"},
    {"code": "YETH", "name_ko": "YETH", "name_en": "Roundhill Ether Covered Call Strategy ETF", "cadence": "주", "source": "https://www.roundhillinvestments.com/etf/yeth/"},
    {"code": "WEEK", "name_ko": "WEEK", "name_en": "Roundhill Weekly T-Bill ETF", "cadence": "주", "source": "https://www.roundhillinvestments.com/etf/week/"},
    {"code": "MAGY", "name_ko": "MAGY", "name_en": "Roundhill Magnificent Seven Covered Call ETF", "cadence": "주", "source": "https://www.roundhillinvestments.com/etf/magy/"},
    # 채권·단기·채권 커버드콜(월분배). JNK·TLTW 요청(2026-09-19)에 같은 성격의 것을 함께 — 하이일드·투자등급·종합채권·초단기·중장기 국채·
    # 해외채권·신흥국채·시니어론, 그리고 아이셰어즈 BuyWrite 셋. 전부 stockanalysis 에서 지난 1년 12건을 확인했다.
    {"code": "JNK", "name_ko": "JNK", "name_en": "SPDR Bloomberg High Yield Bond ETF", "cadence": "월", "source": "https://www.ssga.com/us/en/intermediary/etfs/spdr-bloomberg-high-yield-bond-etf-jnk"},
    {"code": "HYG", "name_ko": "HYG", "name_en": "iShares iBoxx $ High Yield Corporate Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239565/"},
    {"code": "USHY", "name_ko": "USHY", "name_en": "iShares Broad USD High Yield Corporate Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/291299/"},
    {"code": "LQD", "name_ko": "LQD", "name_en": "iShares iBoxx $ Investment Grade Corporate Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239566/"},
    {"code": "AGG", "name_ko": "AGG", "name_en": "iShares Core U.S. Aggregate Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239458/"},
    {"code": "BIL", "name_ko": "BIL", "name_en": "SPDR Bloomberg 1-3 Month T-Bill ETF", "cadence": "월", "source": "https://www.ssga.com/us/en/intermediary/etfs/spdr-bloomberg-1-3-month-t-bill-etf-bil"},
    {"code": "SHV", "name_ko": "SHV", "name_en": "iShares 0-1 Year Treasury Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239466/"},
    {"code": "USFR", "name_ko": "USFR", "name_en": "WisdomTree Floating Rate Treasury Fund", "cadence": "월", "source": "https://www.wisdomtree.com/investments/etfs/fixed-income/usfr"},
    {"code": "IEF", "name_ko": "IEF", "name_en": "iShares 7-10 Year Treasury Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239456/"},
    {"code": "VGLT", "name_ko": "VGLT", "name_en": "Vanguard Long-Term Treasury ETF", "cadence": "월", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vglt"},
    {"code": "VCIT", "name_ko": "VCIT", "name_en": "Vanguard Intermediate-Term Corporate Bond ETF", "cadence": "월", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vcit"},
    {"code": "VCLT", "name_ko": "VCLT", "name_en": "Vanguard Long-Term Corporate Bond ETF", "cadence": "월", "source": "https://investor.vanguard.com/investment-products/etfs/profile/vclt"},
    {"code": "BNDX", "name_ko": "BNDX", "name_en": "Vanguard Total International Bond ETF", "cadence": "월", "source": "https://investor.vanguard.com/investment-products/etfs/profile/bndx"},
    {"code": "EMB", "name_ko": "EMB", "name_en": "iShares J.P. Morgan USD Emerging Markets Bond ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/239572/"},
    {"code": "SRLN", "name_ko": "SRLN", "name_en": "SPDR Blackstone Senior Loan ETF", "cadence": "월", "source": "https://www.ssga.com/us/en/intermediary/etfs/spdr-blackstone-senior-loan-etf-srln"},
    {"code": "TLTW", "name_ko": "TLTW", "name_en": "iShares 20+ Year Treasury Bond BuyWrite Strategy ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/329118/"},
    {"code": "LQDW", "name_ko": "LQDW", "name_en": "iShares Investment Grade Corporate Bond BuyWrite Strategy ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/329120/"},
    {"code": "HYGW", "name_ko": "HYGW", "name_en": "iShares High Yield Corporate Bond BuyWrite Strategy ETF", "cadence": "월", "source": "https://www.ishares.com/us/products/329119/"},
    # BTCI 요청(2026-09-21)에 같은 결의 인컴 ETF 를 함께 — NEOS 비트코인·현금·채권, 프로셰어즈 비트코인 선물·데일리 커버드콜, 디파이언스 주분배·목표분배.
    # JEPY 는 2026년에 WDTE 로 이름을 바꿨다(stockanalysis 도 WDTE 로 넘어간다). 전부 지난 1년 지급 건·Finnhub 시세 확인.
    {"code": "BTCI", "name_ko": "BTCI", "name_en": "NEOS Bitcoin High Income ETF", "cadence": "월", "source": "https://neosfunds.com/btci/"},
    {"code": "CSHI", "name_ko": "CSHI", "name_en": "NEOS Enhanced Income 1-3 Month T-Bill ETF", "cadence": "월", "source": "https://neosfunds.com/cshi/"},
    {"code": "BNDI", "name_ko": "BNDI", "name_en": "NEOS Enhanced Income Aggregate Bond ETF", "cadence": "월", "source": "https://neosfunds.com/bndi/"},
    {"code": "BITO", "name_ko": "BITO", "name_en": "ProShares Bitcoin ETF", "cadence": "월", "source": "https://www.proshares.com/our-etfs/strategic/bito"},
    {"code": "ISPY", "name_ko": "ISPY", "name_en": "ProShares S&P 500 High Income ETF", "cadence": "월", "source": "https://www.proshares.com/our-etfs/strategic/ispy"},
    {"code": "IQQQ", "name_ko": "IQQQ", "name_en": "ProShares Nasdaq-100 High Income ETF", "cadence": "월", "source": "https://www.proshares.com/our-etfs/strategic/iqqq"},
    {"code": "SPYT", "name_ko": "SPYT", "name_en": "Defiance S&P 500 Income Target ETF", "cadence": "월", "source": "https://www.defianceetfs.com/spyt/"},
    {"code": "QQQT", "name_ko": "QQQT", "name_en": "Defiance Nasdaq 100 Income Target ETF", "cadence": "월", "source": "https://www.defianceetfs.com/qqqt/"},
    {"code": "QQQY", "name_ko": "QQQY", "name_en": "Defiance Nasdaq 100 Weekly Distribution ETF", "cadence": "주", "source": "https://www.defianceetfs.com/qqqy/"},
    {"code": "WDTE", "name_ko": "WDTE", "name_en": "Defiance S&P 500 Weekly Distribution ETF", "cadence": "주", "source": "https://www.defianceetfs.com/jepy/"},
    {"code": "IWMY", "name_ko": "IWMY", "name_en": "Defiance R2000 Weekly Distribution ETF", "cadence": "주", "source": "https://www.defianceetfs.com/iwmy/"},
]

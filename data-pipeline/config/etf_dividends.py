"""배당으로 살기(/dividend)에 넣는 ETF 목록과, 국내 ETF 의 **손으로 옮긴** 분배금.

## 미국 ETF — 목록만 적는다. 분배금은 stockanalysis.com 에서 매일 받는다

`/etf/{티커}/dividend/` 페이지가 지급일·금액을 준다(common/stockanalysis.py, 내부자 리포트와 같은
원천·약관). 2026-09-12 에 운용사 공시와 맞대어 같은 값임을 봤다(SCHD 2026-06-29 0.2525 ·
JEPI 2026-09-03 0.37142). 그래서 미국은 티커와 이름만 적으면 된다. `pays` 를 적어 두면 그 페이지가
막힌 날의 대체값이다(없어도 된다).

## 국내 ETF — 손으로 옮긴다

열린 원천이 없다(2026-09-12 확인). 예탁결제원 배당 API 에 ETF 는 없고, 공공데이터포털에 '분배금'은
0건이고, KRX 정보데이터시스템은 로그인 없이는 LOGOUT 만 돌려주고, stockanalysis 는 국내를 안 다룬다.
남는 건 **운용사 자기 공시**인데 대부분 JS 로 그린다. 그래서 브라우저에서 읽어 여기 적는다.
스크립트(fetch_etf_dividends.py)가 시세·환율만 매일 붙인다.

⚠️ **값이 늙는다.** 커버드콜 ETF 는 달마다 분배금이 바뀐다. `as_of` 가 두 달 넘게 낡으면 화면이
   기준일을 적어 두었으니 사용자는 알지만, 갱신은 사람(에이전트 세션)이 해야 한다. 아래
   '갱신하는 법'을 따른다. 갱신 주기는 월 1회를 권한다.

## 갱신하는 법 (국내)

  미래에셋 TIGER
    investments.miraeasset.com/tigeretf/ko/distribution/annual/list.ajax (POST pageIndex=1&listCnt=400)
    가 연도별 합계(원)를 준다 — curl 로도 열린다. `y_prev`(지난해 합) · `y_ytd`(올해 합) · `ytd_months`
    (올해 지급된 달 수)를 적는다. 스크립트가 둘을 견줘 큰 쪽을 쓴다(아래 규칙).
  다른 운용사(SOL·ACE·KODEX·PLUS·RISE)는 페이지가 JS 라 아직 못 넣었다.
  미국 ETF 의 `pays` 는 안 고쳐도 된다(stockanalysis 가 매일 준다).

## 국내 ETF 의 '1년에 얼마' 규칙

지난해 한 해 합계(`y_prev`)가 기본이다. 올해 합계를 열두 달로 늘린 값(`y_ytd × 12 ÷ ytd_months`)이
지난해보다 25% 넘게 크거나 작으면 그쪽을 쓰고 `estimated` 를 켠다 — 분배금을 크게 올린 ETF
(TIGER 배당커버드콜액티브 2025 1,976 → 2026 아홉 달 3,338)를 지난해로 재면 반 토막이 난다.

⚠️ 국내 ETF 는 달별 금액을 못 적었다(연도 합계만 있다). 달력에서는 빠진다. 미국은 지급일이 있어
   달력에 든다.
"""

# 2026-09-12 에 옮겼다. 브라우저에서 읽은 날 = as_of.
AS_OF = "2026-09-12"

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
]

# 미래에셋 TIGER 연간 분배금 표(원). TIGER 월배당은 월말 기준일·다음 달 초 지급이라 2026-09-12 기준
# 올해 합계에는 1~9월 아홉 번이 들어 있다고 본다(9월분이 9월 초에 나갔다).
_TIGER = "https://investments.miraeasset.com/tigeretf/ko/distribution/annual/list.do"
KR_ETFS: list[dict] = [
    {"code": "458730", "name_ko": "TIGER 미국배당다우존스", "cadence": "월", "source": _TIGER, "y_prev": 430, "y_ytd": 287, "ytd_months": 9},
    {"code": "458750", "name_ko": "TIGER 미국배당다우존스타겟커버드콜1호", "cadence": "월", "source": _TIGER, "y_prev": 730, "y_ytd": 516, "ytd_months": 9},
    {"code": "458760", "name_ko": "TIGER 미국배당다우존스타겟커버드콜2호", "cadence": "월", "source": _TIGER, "y_prev": 1057, "y_ytd": 744, "ytd_months": 9},
    {"code": "0008S0", "name_ko": "TIGER 미국배당다우존스타겟데일리커버드콜", "cadence": "월", "source": _TIGER, "y_prev": 999, "y_ytd": 814, "ytd_months": 9},
    {"code": "441680", "name_ko": "TIGER 미국나스닥100커버드콜(합성)", "cadence": "월", "source": _TIGER, "y_prev": 1276, "y_ytd": 905, "ytd_months": 9},
    {"code": "429000", "name_ko": "TIGER 미국S&P500배당귀족", "cadence": "월", "source": _TIGER, "y_prev": 264, "y_ytd": 186, "ytd_months": 9},
    {"code": "329200", "name_ko": "TIGER 리츠부동산인프라", "cadence": "월", "source": _TIGER, "y_prev": 379, "y_ytd": 264, "ytd_months": 9},
    {"code": "466940", "name_ko": "TIGER 은행고배당플러스TOP10", "cadence": "월", "source": _TIGER, "y_prev": 844, "y_ytd": 708, "ytd_months": 9},
    {"code": "472150", "name_ko": "TIGER 배당커버드콜액티브", "cadence": "월", "source": _TIGER, "y_prev": 1976, "y_ytd": 3338, "ytd_months": 9},
    {"code": "0052D0", "name_ko": "TIGER 코리아배당다우존스", "cadence": "월", "source": _TIGER, "y_prev": 294, "y_ytd": 453, "ytd_months": 9},
]

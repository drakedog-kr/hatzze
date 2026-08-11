/**
 * 테마 → 미국 종목(티커) 사전 — 미장 카더라 테마 로테이션의 **호버 목록**이 쓴다.
 *
 * ⚠️⚠️ 출처는 data-pipeline/config/us_stock_themes.py 다. 이 파일은 그 사전을 프론트
 * (TS 런타임)에서 쓰려고 **기계로 뽑은 사본**이다 — 파이프라인은 Python, 프론트는 TS 라
 * import 로 공유할 수 없다. 국내 짝인 lib/stock-themes.ts 가 같은 처지에 있고, 그쪽
 * 주석이 이미 경고한다: **한쪽을 고치면 다른 쪽도 같이 고쳐야 한다.**
 * 손으로 옮기지 말 것 — 파이썬 쪽에서 다시 뽑아 붙이면 오타가 안 난다.
 *
 * 키가 종목명이 아니라 **티커**인 것은 미국 종목의 한글 표기가 흔들리기 때문이다
 * ("알파벳"/"구글"). 티커는 안 흔들린다. 국내 사전이 이름을 키로 쓰는 것과 다르다.
 *
 * ⚠️ 한 종목이 여러 테마에 속해도 된다. 그래서 테마 점유율의 합은 100%를 넘는다.
 */

export const US_THEMES: Record<string, string[]> = {
  "AI반도체": ["NVDA", "AMD", "AVGO", "TSM", "ARM", "MRVL", "QCOM", "INTC", "ALAB", "MPWR", "ON", "NXPI", "TXN", "SWKS", "QRVO", "NVTS", "WOLF", "TSEM", "CBRS"],
  "메모리": ["MU", "SNDK", "WDC", "STX"],
  "반도체 장비·소재": ["ASML", "LRCX", "KLAC", "AMAT", "TER", "FORM", "AMKR", "COHR", "LITE", "GLW", "SNPS", "CDNS", "CLS"],
  "빅테크": ["GOOGL", "AMZN", "AAPL", "META", "MSFT", "NFLX"],
  "AI 인프라·클라우드": ["ORCL", "PLTR", "CRWV", "NBIS", "SMCI", "DELL", "ANET", "VRT", "IREN", "WULF", "EQIX", "DLR", "IBM", "CSCO"],
  "소프트웨어": ["CRM", "NOW", "ADBE", "SNOW", "DDOG", "NET", "PANW", "CRWD", "TEAM", "APP", "TTD", "RDDT", "RBLX", "SHOP", "ZBRA", "APH"],
  "전기차·자율주행": ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "GM", "F", "APTV", "UBER", "CVNA"],
  "전력·원자력": ["SMR", "OKLO", "CEG", "VST", "NRG", "NEE", "GEV", "PWR", "ETN", "CCJ", "HON", "FSLR", "ENPH", "BE"],
  "우주·방산": ["RKLB", "ASTS", "RDW", "LMT", "RTX", "NOC", "GD", "HII", "BA", "AXON"],
  "바이오·헬스케어": ["LLY", "NVO", "MRK", "PFE", "ABBV", "AZN", "NVS", "JNJ", "UNH", "ISRG", "MDGL", "CVS", "CAH"],
  "금융": ["GS", "JPM", "MS", "BAC", "BRK", "BX", "SCHW", "MA", "AXP", "PYPL", "SOFI", "UPST"],
  "가상자산": ["COIN", "MSTR", "CRCL", "GLXY", "CLSK", "RIOT", "CIFR", "HOOD"],
  "소비재·유통": ["KO", "WMT", "COST", "SBUX", "MCD", "NKE", "CMG", "PEP", "PM", "DIS", "DKNG", "ORLY", "DECK", "LUV", "DHI", "PLD", "WELL", "CPNG", "MELI", "URI", "ABNB", "BKNG", "CAT", "VZ"],
  "에너지·원자재": ["XOM", "CVX", "KMI", "VLO", "FCX", "NEM", "NUE", "ALB"],
  "양자컴퓨팅": ["IONQ", "QBTS", "RGTI"],
  "중국": ["BABA", "BIDU", "PDD", "JD"],
};

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

/**
 * MDD 테마 비교가 한 테마에서 데려오는 대표 종목 수(자기 자신 포함 전 기준).
 * 국내(MDD_PEER_MAX)와 같은 값이다 — 두 화면의 카드가 같은 크기여야 한다.
 *
 * 앞에서부터 자른다. 이 카드는 "○○ 대표 N종목"이지 업종 통계가 아니다. 미국 사전은
 * 언급량 순으로 배정돼 있어(us_stock_themes.py 머리 주석) 앞쪽이 곧 대표성 순서다.
 */
export const US_MDD_PEER_MAX = 10;

/** 이 티커가 속한 테마들. 사전 순서 = 대표성 순서라 첫 번째가 대표 테마다. */
export function themesForTicker(ticker: string): string[] {
  return Object.entries(US_THEMES)
    .filter(([, members]) => members.includes(ticker))
    .map(([theme]) => theme);
}

export const US_THEMES: Record<string, string[]> = {
  "AI반도체": ["NVDA", "AMD", "AVGO", "TSM", "ARM", "MRVL", "QCOM", "INTC", "ALAB", "MPWR", "ON", "NXPI", "TXN", "SWKS", "QRVO", "NVTS", "WOLF", "TSEM", "CBRS", "CRDO"],
  "메모리": ["MU", "SNDK", "WDC", "STX"],
  "반도체 장비·소재": ["ASML", "LRCX", "KLAC", "AMAT", "TER", "FORM", "AMKR", "COHR", "LITE", "GLW", "SNPS", "CDNS", "CLS", "CIEN"],
  "빅테크": ["GOOGL", "AMZN", "AAPL", "META", "MSFT", "NFLX"],
  "AI 인프라·클라우드": ["ORCL", "PLTR", "CRWV", "NBIS", "SMCI", "DELL", "ANET", "VRT", "IREN", "WULF", "EQIX", "DLR", "IBM", "CSCO", "NOK"],
  "소프트웨어": ["CRM", "NOW", "ADBE", "SNOW", "DDOG", "NET", "PANW", "CRWD", "TEAM", "APP", "TTD", "RDDT", "RBLX", "SHOP", "ZBRA", "APH", "OKTA", "WDAY", "INTU"],
  "전기차·자율주행": ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "GM", "F", "APTV", "UBER", "CVNA"],
  "전력·원자력": ["SMR", "OKLO", "CEG", "VST", "NRG", "NEE", "GEV", "PWR", "ETN", "CCJ", "HON", "FSLR", "ENPH", "BE"],
  "우주·방산": ["SPCX", "RKLB", "ASTS", "RDW", "LMT", "RTX", "NOC", "GD", "HII", "BA", "AXON"],
  "바이오·헬스케어": ["LLY", "MRNA", "NVO", "MRK", "PFE", "ABBV", "AZN", "NVS", "JNJ", "UNH", "ISRG", "MDGL", "CVS", "CAH", "AMGN", "MDT", "EVMN"],
  "금융": ["GS", "JPM", "MS", "BAC", "BRK", "BX", "SCHW", "MA", "AXP", "PYPL", "SOFI", "UPST", "C"],
  "가상자산": ["COIN", "MSTR", "CRCL", "GLXY", "CLSK", "RIOT", "CIFR", "HOOD"],
  "소비재·유통": ["KO", "WMT", "COST", "SBUX", "MCD", "NKE", "CMG", "PEP", "PM", "DIS", "DKNG", "ORLY", "DECK", "LUV", "DHI", "PLD", "WELL", "CPNG", "MELI", "URI", "ABNB", "BKNG", "CAT", "VZ", "HD", "BBY", "DLTR", "EBAY"],
  "에너지·원자재": ["XOM", "CVX", "KMI", "VLO", "FCX", "NEM", "NUE", "ALB"],
  "양자컴퓨팅": ["IONQ", "QBTS", "RGTI"],
  "중국": ["BABA", "BIDU", "PDD", "JD"],
};

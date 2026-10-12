/**
 * ETF 자금 흐름 화면의 이름표 — 사이드바(app/AppShell.tsx buildNav) · 화면 메타(app/etf/page.tsx)가 같이 읽는다.
 *
 * 사이드바 자리는 '오늘 시장' 묶음의 시장 브리핑 바로 아래(2026-10-11 · AppShell NAV_GROUPS). 사이드바는 오늘 시장 · 시장 여론 ·
 * 분석과 기록 세 묶음이고, 이 화면은 날마다 바뀌는 시장 자료(거래일마다 순유입 · 히어로 브리핑)라 '오늘 시장'이다 — 계산기 · 공시 기록을
 * 찾아보는 '분석과 기록'이 아니다. 시장 브리핑(시장 온도) 다음에 돈이 어디로 갔나가 오는 차례.
 *
 * ⚠️ 사이드바 13px/600 에서 이름 칸은 약 97px 다. 'ETF 자금 흐름'은 80px 안팎.
 */
export const ETF_PAGE = {
  href: "/etf",
  label: "ETF 자금 흐름",
  /** 사이드바 툴팁 · 본문 머리의 부제 — 다른 항목처럼 이 화면이 답하는 물음 하나. */
  sub: "어느 ETF에 자금이 몰리고 빠지는지",
  /** 검색 결과 · 공유 카드의 설명. */
  description: "국내 상장 ETF 하나하나에 자금이 얼마나 유입되고 빠져나갔는지 설정·환매 그대로 봅니다. 유형별 흐름, 지수별 ETF 비교, 커버드콜 · 레버리지 수익률을 함께 놓습니다.",
  /**
   * Material Symbols 이름. 위아래 화살표 — 들어오고 나가는 돈. 2026-10-11 후보 여섯(swap_vert · pie_chart · currency_exchange ·
   * shopping_basket · donut_small · stacked_bar_chart)을 사이드바 18px 실물 옆에 세워 골랐다. pie_chart 는 '상품'을, currency_exchange 는
   * 18px 에서 빽빽했고, stacked_bar_chart 는 시장 브리핑(monitoring)과 결이 겹쳤다.
   */
  icon: "swap_vert",
} as const;

/** ETF 상세 화면 주소(/etf/069500) — 메인 화면 표의 이름 · 상세 화면의 같은 지수 표가 같이 쓴다(클라이언트 부품에서도 부르므로 서버 전용 lib 밖에 둔다). */
export const etfHref = (code: string) => `/etf/${encodeURIComponent(code)}`;

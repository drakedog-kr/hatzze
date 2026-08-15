/**
 * 달력 구간 상수 — **서버 의존이 없는 모듈**.
 *
 * ⚠️ `seohak-daily.ts` 안에 두면 안 된다. 그 파일은 `supabase-server`(server-only)를
 * 물고 있어서, 이 상수를 쓰는 클라이언트 컴포넌트(CalendarHero)가 함께 끌어와
 * **"'server-only' cannot be imported from a Client Component" 로 화면이 통째로
 * 하얗게 죽는다.** 상수와 순수 함수만 여기 둔다.
 */

/**
 * ⚠️⚠️ **날짜 하나하나의 성향은 못 잰다. 구간으로만 잰다.**
 *
 * 2015~2026 을 날짜(월-일)별로 접으면 **한 날짜의 표본이 중앙값 8개**뿐이다(그 날짜가
 * 거래일인 해가 8번쯤이라). 그 표본으로 낸 중앙값은 91%의 날짜에서 ±5% 넘게 흔들리는데
 * 그건 신호가 아니라 잡음이다. 결정적으로 **가장 세게 나온 날짜 셋이 전부 가짜**였다 —
 * 11-12 매수 0.00 · 01-02 매수 0.02 · 12-26 매수 0.02. 그 날짜가 대부분의 해에
 * 휴장이었다는 뜻이라, 매매 성향이 아니라 **휴장 패턴**을 재고 있었다.
 *
 * 그래서 달력 화면의 **날짜 칸은 그날의 실제 매매**(실측)를 그리고, 여기 구간은
 * **띠로 얹기만 한다.** 둘을 섞으면 잡음이 사실인 척한다.
 *
 * 구간 값은 표본 39~63일이라 실제로 잰다(전부 추세 대비 배수의 중앙값).
 * 여름(7~8월)과 네 마녀의 날은 1.0 근처(0.99~1.01)라 뺐다.
 */
export const CALENDAR_WINDOWS = [
  { key: "newyear", label: "새해 첫 주", note: "아무도 안 삽니다",
    from: [1, 1], to: [1, 8], buy: 0.739, sell: 0.814, days: 63 },
  { key: "earnings", label: "미국 실적 시즌", note: "덜 팝니다",
    from: [1, 15], to: [1, 31], months: [1, 4, 7, 10], buy: 1.004, sell: 0.944, days: 552 },
  { key: "blackfriday", label: "블랙프라이데이 주간", note: "둘 다 조용합니다",
    from: [11, 24], to: [11, 30], buy: 0.837, sell: 0.874, days: 50 },
  { key: "xmas", label: "크리스마스 직전", note: "팔기 시작합니다",
    from: [12, 20], to: [12, 24], buy: 0.984, sell: 1.061, days: 39 },
  { key: "yearend", label: "연말 마지막 주", note: "정리하는 주",
    from: [12, 26], to: [12, 31], buy: 0.909, sell: 1.184, days: 42 },
] as const;

/** 그 달에 걸치는 구간들. 달력이 종일 일정처럼 띠로 얹는다. */
export function windowsInMonth(month: number) {
  return CALENDAR_WINDOWS.filter((w) =>
    "months" in w ? (w.months as readonly number[]).includes(month) : w.from[0] === month,
  ).map((w) => ({ ...w, fromDay: w.from[1], toDay: w.to[1] }));
}

/**
 * "무엇에 반응하나" 실측. 전부 **다음 영업일 결제**를 추세 대비로 잰 값이다.
 *
 * 넷 다 1.0 근처라는 게 이 카드의 결론이다. 순매수 하나로 뭉쳐 보면 매도가 더 크게
 * 줄어드는 바람에 "떨어질 때 산다"로 잘못 읽힌다 — 매수·매도를 갈라야 보인다.
 */
export const REACTIONS = [
  { label: "나스닥 −2% 이하", buy: 0.972, sell: 0.924, days: 98, src: "2021~2026 · 1,338일" },
  { label: "원/달러 +0.7% 이상", buy: 1.005, sell: 1.0, days: 376, src: "2010~2026" },
  { label: "월급날 언저리(25일)", buy: 0.977, sell: null, days: 0, src: "2015~2026 · 일자별 0.93~1.12" },
  { label: "미국을 크게 판 날", buy: null, sell: null, days: 600, src: "다른 시장 순매수 백만 달러 단위 미동" },
] as const;

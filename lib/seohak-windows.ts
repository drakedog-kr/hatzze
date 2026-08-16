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
  { key: "blackfriday", label: "블랙프라이데이 주간", note: "둘 다 조용합니다",
    from: [11, 24], to: [11, 30], buy: 0.837, sell: 0.874, days: 50 },
  { key: "xmas", label: "크리스마스 직전", note: "팔기 시작합니다",
    from: [12, 20], to: [12, 24], buy: 0.984, sell: 1.061, days: 39 },
  { key: "yearend", label: "연말 마지막 주", note: "정리하는 주",
    from: [12, 26], to: [12, 31], buy: 0.909, sell: 1.184, days: 42 },
] as const;

/**
 * ⚠️ '미국 실적 시즌'을 뺐다. 1·4·7·10월 후반이라 **띠가 뜨는 달의 3분의 2를
 * 차지**하는데 실측 차이가 매수 0.4%다. 아무 일도 없는 구간이 화면을 넓게 물들이면
 * 진짜 구간(연말·신년·블프)이 묽어진다. 작은 카드에선 이미 뺐던 걸 히어로가 계속
 * 쓰고 있었다.
 */

/** 그 달에 걸치는 구간들. 달력이 종일 일정처럼 띠로 얹는다. */
export function windowsInMonth(month: number) {
  return CALENDAR_WINDOWS.filter((w) => w.from[0] === month).map((w) => ({
    ...w,
    fromDay: w.from[1],
    toDay: w.to[1],
  }));
}

/**
 * 오늘 다음에 오는 구간과 남은 날.
 *
 * ⭐ 구간이 없는 달(1년 중 아홉 달)에는 이 화면의 가장 값진 것이 통째로 안 보인다.
 * "다음은 ○○까지 N일"이 늘 자리를 지키면 날짜가 지날수록 숫자가 줄어 **오늘 볼 이유**가
 * 생긴다 — 한 해를 통째로 펼치면 매일 같은 그림이라 지루해지는 것과 반대다.
 */
export function nextWindow(today: Date) {
  const y = today.getUTCFullYear();
  const at = (year: number, w: (typeof CALENDAR_WINDOWS)[number]) =>
    Date.UTC(year, w.from[0] - 1, w.from[1]);
  const now = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());

  const upcoming = [y, y + 1]
    .flatMap((year) => CALENDAR_WINDOWS.map((w) => ({ w, at: at(year, w) })))
    .filter((c) => c.at > now)
    .sort((a, b) => a.at - b.at)[0];
  if (!upcoming) return null;
  return {
    window: upcoming.w,
    days: Math.round((upcoming.at - now) / 86_400_000),
    month: `${new Date(upcoming.at).getUTCFullYear()}-${String(upcoming.w.from[0]).padStart(2, "0")}`,
  };
}

/**
 * "무엇에 반응하나" 실측. 전부 **다음 영업일 결제**를 추세 대비로 잰 값이다.
 *
 * 넷 다 1.0 근처라는 게 이 카드의 결론이다. 순매수 하나로 뭉쳐 보면 매도가 더 크게
 * 줄어드는 바람에 "떨어질 때 산다"로 잘못 읽힌다 — 매수·매도를 갈라야 보인다.
 */
/**
 * ⛔ **화면에 올리지 말 것. 다섯 번 해 봤고 다섯 번 다 실패했다.**
 *
 * 막대 → 막대 → 문장 목록 → 한 문장 → 삭제. 매번 "이게 뭔지 모르겠다"를 받았는데,
 * 고쳐야 할 게 인포그래픽이 아니었다. **이건 부정 결과다** — 넷을 재 봤더니 셋이
 * 아무 차이가 없더라는 이야기라, 읽는 사람이 가져갈 게 없다. 값진 쪽은
 * `CALENDAR_WINDOWS`(구간마다 실제로 다르다)고 그쪽만 화면에 낸다.
 *
 * 그래도 지우지 않는 건 **재 봤다는 사실 자체가 자산**이라서다. "급락하면 서학개미가
 * 더 산다더라"를 다시 물으면 여기 답이 있다.
 *
 * ⚠️ **label 은 '조건'이지 '대상'이 아니다.** "나스닥 −2% 이하" 로 줄여 두면 화면에서
 * 무엇을 재는 줄인지 안 읽힌다("나스닥이 8% 달라졌다"로 오해한다). 언제의 이야기인지
 * 문장으로 적는다.
 *
 * ⚠️⚠️ 마지막 줄만 **다른 것을 잰다.** 앞 셋은 "서학개미의 미국 매매가 달라졌나"인데
 * 이건 "그 돈이 다른 나라로 옮겨 갔나"다. 같은 '그대로'가 다른 뜻이 되므로 결론
 * 문장을 따로 들고 있게 `verdict` 를 둔다.
 */
export const REACTIONS = [
  { label: "나스닥이 2% 넘게 빠진 다음 날", buy: 0.972, sell: 0.924, days: 98,
    src: "2021~2026 · 1,338일" },
  { label: "원/달러가 0.7% 넘게 뛴 다음 날", buy: 1.005, sell: 1.0, days: 376,
    src: "2010~2026" },
  { label: "월급날(25일) 언저리", buy: 0.977, sell: null, days: 0,
    src: "2015~2026 · 일자별 0.93~1.12" },
  { label: "미국을 크게 판 다음 날", buy: null, sell: null, days: 600,
    verdict: "다른 나라로 안 옮깁니다", src: "다른 시장 순매수 백만 달러 단위 미동" },
] as const;

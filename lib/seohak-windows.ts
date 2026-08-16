/**
 * 달력 구간 상수 — **서버 의존이 없는 모듈**.
 *
 * ⚠️ `seohak-daily.ts` 안에 두면 안 된다. 그 파일은 `supabase-server`(server-only)를
 * 물고 있어서, 이 상수를 쓰는 클라이언트 컴포넌트(CalendarHero)가 함께 끌어와
 * **"'server-only' cannot be imported from a Client Component" 로 화면이 통째로
 * 하얗게 죽는다.** 상수와 순수 함수만 여기 둔다.
 */

/**
 * ⚠️⚠️⚠️ **여기 넷만 남은 데는 긴 사연이 있다. 늘리기 전에 이 머리말을 읽을 것.**
 *
 * ## 한때 일곱이었고, 그중 다섯이 잡음이었다
 *
 * 후보 43개를 "평소 대비 6% 이상 + 전후반 부호 일치"로 걸러 일곱을 골랐다. 그 자를
 * 검증해 보니 **무작위 창의 46~64% 가 그대로 통과**했다(길이 5~70일짜리 창 2,400개를
 * 만들어 같은 절차에 넣었다). 거를 힘이 거의 없는 자였다.
 *
 *   - 문턱 6% 가 잡음보다 낮았다. 무작위 창의 어긋남 중앙값이 이미 5.9~9.8% 다.
 *     하루 매매액의 사분위폭이 0.461 이라(보통 날도 평소의 0.77~1.23배) 40~60일을
 *     모아도 6% 는 그냥 흔들린다.
 *   - 전후반 부호 일치는 **동전 두 개가 같은 면 나오는 것**이라 50% 가 통과한다.
 *   - 축 둘 중 큰 쪽을 골라 한 번 더 부풀렸다.
 *
 * ⭐⭐ **뿌리는 표본 단위였다.** 7일 창에 12년이면 결제일이 50개인데, 같은 해의 날들은
 * 같이 움직이므로 진짜 표본은 50이 아니라 **12덩어리**다. 50으로 세면 실제보다 두 배
 * 넘게 자신 있어진다. 그래서 지금은 **해를 센다** — "몇 해가 같은 방향이었나".
 *
 * ## 그 자로 다시 재니 넷이 남았다
 *
 * 창과 축을 **미리 못박고**(직전 사흘 / 직후 사흘 × 사는 양 / 파는 양) 이벤트 20개를
 * 전부 쟀다. 결과를 보고 고르지 않는다 — 고르면 붙여 둔 횟수까지 부풀려진다.
 *
 * ⚠️ **`of` 회 중 `hit` 회가 이 카드의 진짜 값이다. % 가 아니다.** 우연이라도 17번 중
 * 11번쯤은 같은 방향으로 나온다(80칸 전체의 중앙값이 63%). 그래서 12번은 동전 던지기,
 * 13번부터 눈에 띄고, 16~17번이라야 다르다고 말할 수 있다. 화면 각주가 이 기준선을
 * 밝히고 있으니 같이 옮길 것.
 *
 * ## ⚠️ 고정 날짜로는 못 잡는다
 *
 * 창이 전부 **'이벤트 뒤 세 결제일'** 이다. 블랙프라이데이는 해마다 11/23~29 를
 * 오가고, 연말·신정 직후는 휴장이 몇 날인지에 따라 밀린다. 예전처럼 달력 날짜로
 * 고정하면 효과가 절반으로 희석된다(신정 직후는 고정 창 1/1~8 에서 9/12 였는데,
 * 결제일로 정렬하니 16/17 이 됐다).
 *
 * ## 뺀 것들
 *
 * 추석·설·어린이날·개천절·한글날·크리스마스·삼일절·현충일·프레지던츠데이·서머타임·
 * 네 마녀·메모리얼데이·노동절·독립기념일·광복절·마틴루터킹 — 전부 17번 중 9~13번이라
 * 우연 수준이다. 4~5월·9~10월 같은 긴 구간도 마찬가지다.
 *
 * ⛔ **명절은 방향이 아니라 '쉼'이다.** 추석 직후는 사는 양 −18%, 파는 양 −17% 로
 * 양쪽이 같이 준다. 한 축만 적으면 "명절엔 덜 판다 → 들고 간다"로 잘못 읽힌다.
 * 방향이 진짜 기우는 건 연말 하나뿐이다(파는 양 +29%, 사는 양 −14%).
 */
export type CalendarWindow = {
  key: string;
  label: string;
  /** 화면에 그대로 나가는 문장. 부호를 말로 풀어 둔다("덜/더 삽니다"). */
  phrase: string;
  /** `of` 해 중 `hit` 해가 같은 방향이었다. 이게 이 카드의 근거다. */
  hit: number;
  of: number;
  /** 그해 이 창에 드는 결제일을 뽑는 법. 고정 날짜가 아니라 결제일 순서로 잡는다. */
  pick: "afterBlackFriday" | "yearEnd" | "yearStart" | "febFirstHalf";
};

export const CALENDAR_WINDOWS: CalendarWindow[] = [
  { key: "blackfriday", label: "블랙프라이데이 직후", phrase: "평소보다 19% 덜 삽니다",
    hit: 13, of: 16, pick: "afterBlackFriday" },
  { key: "yearend", label: "그해 마지막 사흘", phrase: "평소보다 29% 더 팝니다",
    hit: 14, of: 16, pick: "yearEnd" },
  { key: "newyear", label: "새해 첫 사흘", phrase: "평소보다 33% 덜 삽니다",
    hit: 16, of: 17, pick: "yearStart" },
  { key: "feb", label: "2월 전반", phrase: "평소보다 28% 더 삽니다",
    hit: 17, of: 17, pick: "febFirstHalf" },
];

/** 우연이라도 이만큼은 같은 방향으로 나온다. 화면 각주가 인용한다. */
export const CHANCE_BASELINE = { hit: 11, of: 17 };

/** 그해 추수감사절(11월 넷째 목요일) 다음 날. */
function blackFriday(year: number) {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const day = 1 + ((4 - first + 7) % 7) + 21 + 1;
  return `${year}-11-${String(day).padStart(2, "0")}`;
}

/**
 * 받아 둔 결제일 목록에서 창마다 실제 날짜를 뽑는다.
 *
 * ⚠️ '그해 마지막 사흘'은 그해가 **끝났을 때만** 넣는다. 자료가 8월에서 끊긴 해의
 * 마지막 세 결제일은 연말이 아니라 그냥 8월이다.
 */
export function windowDates(dates: string[]): Map<string, Set<string>> {
  const sorted = [...dates].sort();
  const byYear = new Map<string, string[]>();
  for (const d of sorted) {
    const y = d.slice(0, 4);
    const list = byYear.get(y);
    if (list) list.push(d);
    else byYear.set(y, [d]);
  }
  const out = new Map<string, Set<string>>(CALENDAR_WINDOWS.map((w) => [w.key, new Set()]));
  for (const [year, days] of byYear) {
    for (const w of CALENDAR_WINDOWS) {
      let picked: string[] = [];
      if (w.pick === "yearStart") picked = days.slice(0, 3);
      else if (w.pick === "yearEnd") picked = days.at(-1)! >= `${year}-12-20` ? days.slice(-3) : [];
      else if (w.pick === "febFirstHalf") picked = days.filter((d) => d.slice(5) <= "02-15" && d.slice(5) >= "02-01");
      else {
        const bf = blackFriday(Number(year));
        const from = days.findIndex((d) => d >= bf);
        picked = from < 0 ? [] : days.slice(from, from + 3);
      }
      for (const d of picked) out.get(w.key)!.add(d);
    }
  }
  return out;
}

/** 그달 격자에 걸치는 창들. 각 창이 그달에 차지하는 날짜까지 함께 준다. */
export function windowsInMonth(month: string, marks: Map<string, Set<string>>) {
  return CALENDAR_WINDOWS
    .map((w) => ({ ...w, days: [...marks.get(w.key)!].filter((d) => d.startsWith(month)).sort() }))
    .filter((w) => w.days.length > 0);
}

/**
 * "무엇에 반응하나" 실측. 전부 **다음 영업일 결제**를 추세 대비로 잰 값이다. 순매수
 * 하나로 뭉쳐 보면 매도가 더 크게 줄어드는 바람에 "떨어질 때 산다"로 잘못 읽힌다 —
 * 매수·매도를 갈라야 보인다.
 *
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

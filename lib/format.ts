/**
 * 지표 값의 크기에 따라 소수점 표시를 자동으로 결정한다.
 * - 절댓값 10 미만: 소수점 둘째자리까지 (작은 숫자는 소수점 변화가 의미 있음)
 * - 절댓값 10 이상: 정수로 **반올림** (예: 199.93 -> 200, -26.59 -> -27)
 * - unit이 "억원"이고 절댓값 10000 이상(=1조 이상)이면 "조원" 단위로 전환
 *
 * 특정 지표를 하드코딩하지 않고 값의 크기만 보고 판단하므로, 새로 추가되는
 * 지표에도 코드 수정 없이 그대로 적용된다.
 *
 * ## 왜 버림이 아니라 반올림인가
 *
 * 예전엔 Math.trunc 로 0 방향 버림이었다. 버림은 (1) 값을 항상 실제보다 작게 말하고
 * (2) 같은 화면의 다른 표기와 어긋난다. 버핏지수 카드가 대표 사례다. raw 199.93 이
 * 큰 숫자로는 "199%"인데 바로 옆 서브텍스트는 toFixed(1) 로 "2.0배"라, 한 카드가
 * 스스로 모순되는 두 값을 동시에 말했다. 상단 티커의 햇쩨 지수도 같은 병으로 히어로의
 * 31℃ 와 1도 어긋나 그 자리에서만 Math.round 로 우회했었다(app/AppShell.tsx).
 *
 * 이 파일 안에서도 규칙이 갈렸다. 아래 "조원" 분기와 formatEokMixed 는 처음부터
 * 반올림이었으므로, 반올림으로 맞추는 쪽이 파일 전체가 한 규칙을 쓰는 방향이다.
 * 음수도 0 이 아니라 가까운 정수로 간다(Math.round(-26.59) === -27).
 *
 * 값과 기준선(threshold·hot_threshold)이 모두 이 함수를 지나므로 판정과 표시가
 * 같은 규칙 위에 놓인다. 표시가 1 움직여 기준선을 넘어 보일 수 있지만, 초고온 배지는
 * 표시값이 아니라 진행률(capped ≥ 75)로 판정하니 배지와 숫자가 뒤집히지는 않는다.
 */
export function formatIndicatorValue(
  value: number,
  unit: string,
): { display: string; displayUnit: string } {
  if (unit === "억원" && Math.abs(value) >= 10000) {
    const jo = value / 10000;
    return {
      display: jo.toLocaleString("ko-KR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      displayUnit: "조원",
    };
  }

  if (unit === "억원") {
    return {
      display: Math.round(value).toLocaleString("ko-KR"),
      displayUnit: unit,
    };
  }

  const display =
    Math.abs(value) < 10
      ? value.toLocaleString("ko-KR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : Math.round(value).toLocaleString("ko-KR");

  return { display, displayUnit: unit };
}

const KST_UPDATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

/**
 * 정기 실행의 **표기용 완료 시각**(KST). cron 발화 시각이 아니라 완료를 여기에 맞춰 스냅한다.
 * 아침 완료 ~08:45 → 오전 9시, 오후 완료 ~19:50 → 오후 8시.
 * .github/workflows/daily-update.yml 의 cron 주석 참고.
 *
 * ⚠️ **워크플로 일정을 바꾸면 여기도 같이 바꿀 것.** 2026-08-14 에 아침을 11시대에서
 * 8시대로 당겼는데, 이 배열을 그대로 뒀다면 08:45 에 끝난 실행이 ±3시간 스냅에 걸려
 * 화면에 "오전 11:00 기준"으로 표시됐을 것이다 — 실제보다 두 시간 늦은 거짓말이다.
 *
 * ⭐ **여기 적는 시각은 실제 완료보다 뒤다**(아침 완료 ~08:45 → 표기 9시, 오후 완료
 * ~20:00~20:25 → 표기 9시). 옛 설정은 반대로 바닥값이었는데(완료 20:20 → 표기 7시),
 * 읽는 사람에게 정각이 자연스럽다는 판단으로 뒤쪽 정각에 맞췄다(2026-08-14 결정).
 * 대신 **표기가 아직 오지 않은 시각을 가리키는 날이 있다** — 08:45 에 화면을 보면
 * "오전 9:00 기준"이다. 큐 지연이 지금(60분대)보다 더 줄면 간격이 벌어진다.
 * 벌어지거든 이 배열이 아니라 **워크플로에 대기 게이트를 하나 더 두어 완료 시각 자체를
 * 못 박는 편이 낫다**(아침의 08:00 게이트와 같은 방식). 다만 오후에 게이트를 두면 디시
 * 표본 시간대가 같이 밀려 눈금과 어긋나므로, 그때는 눈금 재보정이 세트로 따라온다.
 */
const SCHEDULED_HOURS_KST = [9, 21];
/** 예정 시각에서 이만큼 안에 끝났으면 "예정대로 돌았다"고 보고 정각으로 스냅한다.
 *
 * ⚠️ **3에서 2로 줄였다(2026-08-14).** 기준 시각을 [11,19] → [9,21] 로 옮기면서 3을
 * 그대로 두면 창이 06~12시·18~24시로 벌어져, 한밤중에 끝난 실행까지 정각으로 스냅된다.
 * 그건 예전에 한 번 고친 버그다(아래 함수 주석의 "23:28 에 끝난 실행이 오후 5:00 으로
 * 표시됐다"가 그 사건). 2면 창이 07~11시·19~23시가 되어, 정기 실행의 흔들림은 전부
 * 덮으면서 자정 근처는 실제 시각을 적는다.
 * (아침은 08:00 게이트 때문에 08:10 이전에 못 끝나고, 지연이 210분까지 늘어도 아침
 *  11:10 · 오후 22:10 이라 양쪽 다 이 창 안이다.)
 *
 * ⚠️ 남은 구멍 하나: **23시대에 끝난 실행은 여전히 "오후 9:00"으로 스냅된다**(|23−21|=2).
 * 정기 실행은 22시를 안 넘으니 손으로 돌린 실행에서만 생기고, 어긋나도 두 시간이다.
 * 오후 기준을 21시로 두는 대가로 받아들인 것이다 — 신경 쓰이면 오후를 20시로 되돌리면
 * 창이 18~22시가 되어 막힌다.
 */
const SCHEDULE_SLACK_HOURS = 2;

/**
 * "최종 업데이트" 라벨.
 *
 * 파이프라인 완료가 KST 11:00·17:00 근처가 되도록 발화 시각을 설계했다(cron 은 그보다
 * 앞서 발화하고 GitHub 예약 큐 지연 90~150분이 실행을 그 시각으로 밀어준다 — 자세한 건
 * 워크플로 cron 주석). 완료는 그래도 날마다 흔들리므로, 예정 시각 ±3시간 안이면 그 정각으로
 * 스냅하고(정기 실행의 깔끔함 유지), 벗어난 실행(수동·재시도)은 실제 시각을 적어 거짓말을
 * 막는다 — 예전엔 무조건 정각 스냅이라 KST 23:28 에 끝난 실행이 "오후 5:00 기준"으로 표시됐다.
 */
export function formatKstUpdate(isoString: string): string {
  const parts = KST_UPDATE_FORMATTER.formatToParts(new Date(isoString));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday").replace("요일", "");
  const hour = Number(get("hour"));

  const scheduled = SCHEDULED_HOURS_KST.find((h) => Math.abs(hour - h) <= SCHEDULE_SLACK_HOURS);
  const time =
    scheduled !== undefined
      ? `${scheduled < 12 ? "오전" : "오후"} ${scheduled % 12 || 12}:00`
      : `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}시경`;

  return `${get("year")}-${get("month")}-${get("day")}(${weekday}) ${time} 기준`;
}

/**
 * 툴팁·미니차트 축의 짧은 날짜 표기. "YYYY-MM-DD" 또는 "MM-DD" 를 "M/D" 로 바꾼다.
 * 예: "2026-07-16" → "7/16", "07-16" → "7/16". 툴팁마다 date.slice(5) 를 흩뿌리지
 * 않고 여기 하나로 모아, 표기(하이픈↔슬래시)를 한 곳에서 바꾼다.
 */
export function shortDate(iso: string): string {
  const [, mm, dd] = iso.length > 5 ? iso.split("-") : ["", ...iso.split("-")];
  return `${Number(mm)}/${Number(dd)}`;
}

/**
 * "무엇과 견줬는지"를 말하는 라벨. 견준 날짜가 화면에 뜬 자료의 **하루 전일 때만**
 * "전일 대비"라고 적고, 아니면 그 날짜를 못박는다("8월 3일 대비").
 *
 * 마지막에서 두 번째 행이라고 무조건 '전일'을 다는 게 아니다. 파이프라인이 하루 걸러
 * 돌거나 daily_score 행이 비면 그 행은 어제가 아니고, 그때 라벨을 달면 배지가 스스로
 * 거짓말을 한다. 히어로 배지가 "전일 대비 ▲1"로 그날 오전과의 차이를 전일이라 우겼던 것이
 * 정확히 그 모양이었다(2026-08-05).
 *
 * ⚠️ 판정 기준은 달력의 오늘이 아니라 **`latestIso` 자신**이다. 배지는 그 옆에 뜬 온도를
 * 설명하는 말이라, 자료가 하루 낡은 날에도 "그 자료의 전일"과 견주는 것이 맞다. 자료가
 * 낡았다는 사실은 같은 셀의 '최종 업데이트' 줄이 따로 말한다.
 *
 * data-pipeline/scripts/generate_daily_summary.day_tag 가 LLM 자료 쪽에서 같은 판단을
 * 한다. 둘이 갈리면 한 화면에서 배지와 브리핑 문장이 서로 다른 날을 '어제'라 부른다.
 */
export function compareLabel(latestIso: string, prevIso: string | null): string {
  if (!prevIso) return "전일 대비";
  const dayMs = 86_400_000;
  // 로컬 타임존이 개입하면 서버(UTC)와 브라우저에서 판정이 갈릴 수 있어 UTC 자정으로 읽는다.
  const gap = Date.parse(`${latestIso}T00:00:00Z`) - Date.parse(`${prevIso}T00:00:00Z`);
  if (gap === dayMs) return "전일 대비";
  const [, mm, dd] = prevIso.split("-");
  return `${Number(mm)}월 ${Number(dd)}일 대비`;
}

/**
 * 억 단위 금액을 "1조 2,929억"처럼 조와 억을 함께 읽는 형태로 만든다.
 *
 * formatIndicatorValue 는 1조를 넘으면 "1.3조원"으로 반올림하는데, 순매수처럼
 * 끝자리까지 의미가 있는 금액은 그렇게 뭉개면 규모 감각이 오히려 흐려진다.
 * "12,929억"은 한눈에 안 읽히고 "1.3조원"은 정보가 날아가므로 둘을 함께 쓴다.
 */
export function formatEokMixed(eok: number): string {
  const abs = Math.abs(Math.round(eok));
  const sign = eok < 0 ? "-" : "";
  if (abs < 10000) return `${sign}${abs.toLocaleString("ko-KR")}억`;
  const jo = Math.floor(abs / 10000);
  const rest = abs % 10000;
  if (rest === 0) return `${sign}${jo.toLocaleString("ko-KR")}조`;
  return `${sign}${jo.toLocaleString("ko-KR")}조 ${rest.toLocaleString("ko-KR")}억`;
}

/**
 * 감성 카드 표본 알약의 건수를 **자릿수가 늘어도 폭이 안 늘도록** 묶는다.
 *
 * 이 알약은 헤드라인(비율 + 톤 라벨)과 한 줄을 나눠 쓰는데, 가장 좁은 4열 카드(247px)에서
 * 알약에 남는 폭이 **90.8px 뿐이다**(헤드라인 144.2 + gap 12). 자릿수가 하나 늘면 그대로
 * 넘어가고, 넘치면 알약이 다음 줄로 내려가면서 아래 막대까지 밀어 옆 카드와 높이가 어긋난다.
 * 실측(2026-08-06): 네 자리 83.4 ✓ · 다섯 자리 91.0 ✗(0.2 초과) · 여섯 자리 98.5 ✗.
 *
 * 그래서 10,000 에서 만 단위로 갈아탄다 — formatIndicatorValue 가 억원을 1조에서 조원으로
 * 바꾸는 것과 같은 경계다. 카더라의 compact() 처럼 K 를 쓰지 않는 건 여기 숫자에는 "건"이
 * 붙어서다("12K건"은 라틴 자릿수와 한글 셈낱말이 섞여 읽힌다).
 *
 * 지금 화면(디시 8,961 · 뉴스 4,576)은 둘 다 네 자리라 **보이는 것은 그대로**다. 뉴스가
 * 하루 3,300건을 넘겨 3일 합이 다섯 자리가 되는 날에만 표기가 바뀐다.
 */
export function formatSampleCount(n: number): string {
  if (n < 10000) return n.toLocaleString("ko-KR");
  const man = n / 10000;
  // 10만을 넘으면 소수점까지 적었을 때 다시 길어진다. 그 구간은 정수로 끊는다.
  // 경계는 man 이 아니라 **반올림한 뒤의 값**으로 가른다 — 9.95 를 넘으면 toFixed(1) 이
  // "10.0만"을 만들어, 바로 옆 100,000("10만")과 표기가 갈리고 폭도 괜히 넓어진다.
  return man >= 9.95 ? `${Math.round(man).toLocaleString("ko-KR")}만` : `${man.toFixed(1)}만`;
}

/**
 * 낙관도(중립 제외한 낙관 비중 %) → 라벨 + 색 톤.
 *
 * 카더라 리포트의 생태계 센티먼트와 시장 브리핑의 감성 카드(디시·뉴스)가 **같은 구간·같은
 * 말**을 쓰도록 여기 하나로 모아 둔다. 두 화면이 같은 성격의 수치를 다른 말로 부르면
 * 사용자가 매번 다시 배워야 한다.
 *
 * 라벨과 색을 한 번에 돌려주는 게 핵심이다 — 예전엔 라벨만 구간으로 정하고 색은 화면에서
 * 낙관색으로 고정해 둬서, 중립 구간의 위쪽(59%)이 "중립"이라고 적힌 채 낙관색으로 칠해지는
 * 모순이 있었다.
 */
export function sentimentTone(optimismPct: number): {
  label: string;
  tone: "hot" | "neutral" | "cold";
} {
  // 구간: 비관 0~40 · 중립 41~59 · 낙관 60~100.
  if (optimismPct >= 60) return { label: "낙관 우세", tone: "hot" };
  if (optimismPct >= 41) return { label: "중립", tone: "neutral" };
  return { label: "비관 우세", tone: "cold" };
}

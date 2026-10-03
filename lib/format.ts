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
  minute: "2-digit",
  hourCycle: "h23",
});

/** '최종 업데이트' 의 눈금. */
const UPDATE_STEP_MS = 30 * 60 * 1000;

function kstUpdateParts(date: Date) {
  const parts = KST_UPDATE_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday").replace("요일", ""),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

const hourLabel = (hour: number) => `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}시`;

// 화면의 다른 날짜("9월 22일 종가"·"9월 23일 기준")와 같은 꼴로 적는다(2026-09-23). 예전엔
// "2026-09-23(수)" 라 한 화면에 날짜 표기가 둘이었다. 연도는 뺀다 — 이 줄은 늘 오늘·어제다.
const updateLabel = (p: ReturnType<typeof kstUpdateParts>, time: string, tail = "기준") =>
  `${p.month}월 ${p.day}일(${p.weekday}) ${time} ${tail}`;

/**
 * "최종 업데이트" 라벨 — 자료가 쓰인 시각을 **가장 가까운 30분**으로 적는다(2026-09-30).
 *
 *   08:26 → 오전 8시 30분 · 08:46 → 오전 9시 · 20:14 → 오후 8시 · 20:32 → 오후 8시 30분
 *
 * 한가운데(:15·:45 정각)는 뒤쪽으로 올린다. 날짜·요일도 올린 시각에서 뽑는다 — 23:50 은
 * 다음 날 "오전 12시" 다. KST 는 UTC 와 정시 단위로만 어긋나서, 절대 시각을 30분 눈금에
 * 맞추면 KST 에서도 :00·:30 에 떨어진다.
 *
 * ## 왜 정각 스냅을 걷었나
 *
 * 예전엔 정기 실행을 [9, 20] 정각에 붙였다 — 그 시각 ±2시간 안이면 "오후 8시", 밖이면
 * "오후 11시경". 발사를 Vercel 로 고정하면 완료도 고정될 거라 봤는데, 09-23~09-30 한 주를
 * 재 보니 저녁 국장 카더라가 19:12~20:32, 시장 브리핑이 19:35~20:35 로 한 시간 넘게
 * 흔들렸고 **모두 "오후 8시 기준"으로 떴다.** 09-30 저녁 카더라는 20:32 에 바뀌었는데도
 * "오후 8시" 라, 늦은 날인지 라벨만 봐서는 알 수 없었다. 30분 눈금이면 어긋남이 늘 15분
 * 안이고, 실행 일정을 옮겨도 여기를 고칠 일이 없다(옛 배열은 일정과 같이 옮겨야 했다).
 *
 * 콜론 없이 '시·분' 으로 적는 건 그대로다(2026-08-29). "8:30" 은 그 시각에 정확히 잰 값처럼
 * 읽힌다. '경' 은 뗐다 — 모든 라벨이 같은 눈금이라 정확도를 가를 표시가 필요 없다.
 *
 * 테마 판세는 여기에 카더라 총평 시각을 넘긴다(lib/theme-page.ts 의 themeUpdatedAt).
 * 국장 미리보기만 정해 둔 정각에 붙인다(formatKstUpdateSnapped).
 * 꼬리(tail)는 기본 '기준'이다. v2 국장 카더라 첫 줄은 '업데이트'로 쓴다(2026-10-03 요청).
 */
export function formatKstUpdate(isoString: string, tail = "기준"): string {
  const rounded = Math.round(new Date(isoString).getTime() / UPDATE_STEP_MS) * UPDATE_STEP_MS;
  const p = kstUpdateParts(new Date(rounded));
  return updateLabel(p, `${hourLabel(p.hour)}${p.minute ? ` ${p.minute}분` : ""}`, tail);
}

/** 예정 시각에서 이만큼 안에 끝났으면 "예정대로 돌았다"고 보고 정각으로 스냅한다.
 *
 * ⚠️ **3에서 2로 줄였다(2026-08-14).** 기준 시각을 [11,19] → [9,20] 으로 옮기면서 3을
 * 그대로 두면 창이 06~12시·17~23시로 벌어져, 밤 11시에 끝난 실행까지 정각으로 스냅된다.
 * 그건 예전에 한 번 고친 버그다(아래 함수 주석의 "23:28 에 끝난 실행이 오후 5:00 으로
 * 표시됐다"가 그 사건).
 */
const SCHEDULE_SLACK_HOURS = 2;

/**
 * 정해 둔 정각에 붙이는 "최종 업데이트" 라벨. **국장 미리보기만 쓴다**(app/preview/page.tsx 의
 * HERO_HOURS · PERP_HOURS). 다른 화면은 2026-09-30 에 30분 눈금(formatKstUpdate)으로 옮겼다.
 *
 * `scheduledHours` 중 하나에서 ±2시간 안이면 그 정각("오전 7시 기준"), 밖이면 실제 시(時)에
 * '경'을 붙인다("오후 3시경 기준"). 벗어난 실행(수동·재시도)까지 정각에 붙이면 거짓말이 된다 —
 * 예전엔 무조건 정각 스냅이라 KST 23:28 에 끝난 실행이 "오후 5:00 기준"으로 표시됐다.
 *
 * ⚠️ 눈금은 **화면이 자기 자료가 쓰이는 시각**으로 넘긴다. 미리보기의 종목 줄은 파이프라인
 * 맨 앞 스텝이라, 잡이 끝나는 시각(옛 기본값 [9, 20])에 대면 "오전 9시" 로 붙어 두 시간을
 * 앞당겨 거짓말한다(2026-09-04 지적, 실측 34줄이 전부 7시).
 */
export function formatKstUpdateSnapped(isoString: string, scheduledHours: readonly number[], tail = "기준"): string {
  const p = kstUpdateParts(new Date(isoString));
  const scheduled = scheduledHours.find((h) => Math.abs(p.hour - h) <= SCHEDULE_SLACK_HOURS);
  return updateLabel(p, scheduled !== undefined ? hourLabel(scheduled) : `${hourLabel(p.hour)}경`, tail);
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

/**
 * 이름 뒤에 붙는 조사를 **받침으로 골라** 준다("엔비디아를" · "코어위브를" · "스페이스X를").
 *
 * ⚠️ `을(를)` 로 때우고 있었다. 그 표기는 서식 문서에나 쓰는 것이라 검색 결과와 공유
 *    카드에 "엔비디아을(를) 월가 거물 …" 로 그대로 나갔다(2026-08-25 확인).
 * ⚠️ 이름이 로마자로 끝나는 종목이 있다(스페이스X, 티커 폴백). 한글 받침 규칙만으로는
 *    못 고르므로 로마자·숫자는 **한국어 음독의 끝소리**로 표를 둔다(X→엑스라 받침 있음,
 *    Y→와이라 없음). 표에 없는 글자는 받침 없음으로 본다 — 틀려도 "를"이라 덜 어색하다.
 *
 * ⚠️ **여기가 유일한 정의다.** 원래는 내부자 종목 상세 안에만 있었는데, 종목 실주소
 *    화면도 같은 판정이 필요해졌다. 사본을 두면 한쪽만 고쳐져 두 화면이 같은 종목에
 *    다른 조사를 붙인다.
 */
const FINAL_CONSONANT: Record<string, boolean> = {
  // 로마자: 한국어로 읽었을 때 끝소리가 자음인 것만 true
  c: true, f: true, l: true, m: true, n: true, r: true, s: true, x: true, z: true,
  // 숫자: 영·일·삼·육·칠·팔
  "0": true, "1": true, "3": true, "6": true, "7": true, "8": true,
};

export function hasFinal(word: string): boolean {
  const ch = word.trim().slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  // 한글 음절(가~힣)이면 종성 인덱스로 판정한다.
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return FINAL_CONSONANT[ch.toLowerCase()] ?? false;
}

/** 목적격 조사를 붙인 이름("엔비디아를"). */
export const withObjectParticle = (name: string) => `${name}${hasFinal(name) ? "을" : "를"}`;

/** 주격 조사를 붙인 이름("엔비디아가" · "삼성전자가" · "SK하이닉스가"). */
export const withSubjectParticle = (name: string) => `${name}${hasFinal(name) ? "이" : "가"}`;

/** 보조사를 붙인 이름("엔비디아는" · "삼성전자는"). */
export const withTopicParticle = (name: string) => `${name}${hasFinal(name) ? "은" : "는"}`;

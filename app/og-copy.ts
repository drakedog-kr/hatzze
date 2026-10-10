/**
 * /kadera·/mdd·/insider·/dividend·/daily·/preview·/changelog·/theme 공유 카드에 들어가는 글.
 *
 * 왜 카드 파일 안이 아니라 여기냐면, 같은 글을 두 곳이 봐야 하기 때문이다 —
 * 카드를 그리는 opengraph-image.tsx 와, og:image:alt 를 채우는 app/seo.ts.
 * (컨벤션이 alt 까지 자동으로 넣어 주면 좋겠지만, 페이지가 openGraph 를 선언하는
 *  순간 컨벤션 이미지는 아예 안 쓰인다. 자세한 건 app/seo.ts 주석 참고.)
 *
 * 의존이 없는 데이터 파일로 둔다. 카드 파일은 폰트·fs 를 끌고 오는데, 그걸
 * 페이지 메타데이터 쪽으로 딸려 보내지 않으려는 것이다.
 */
export type OgCopy = {
  /** 카드에 크게 박히는 페이지 이름. */
  title: string;
  /** 본문. 줄 나눌 자리를 직접 정한다(카드는 한 번 굳으면 못 고친다). */
  lines: string[];
  /** 카드 맨 아래 한 줄. */
  foot: string;
  /** og:image:alt. 이미지를 못 보는 사람에게 카드 내용을 그대로 전한다. */
  alt: string;
};

export const KADERA_CARD: OgCopy = {
  title: "국장 카더라",
  // 오른쪽에 말풍선이 놓이므로 줄을 짧게 끊는다. 둘째 줄이 길었을 때 실제로
  // 말풍선과 글자가 맞붙었다(카드는 한 번 굳으면 못 고치니 줄 자리는 눈으로 확인할 것).
  lines: [
    "주식 텔레그램 채널 수백 개를 대신 읽습니다.",
    "오늘 가장 많이 언급된 종목과",
    "가장 많이 퍼진 메시지를 매일 집계합니다.",
  ],
  foot: "hatzze.fun/kadera",
  alt: "국장 카더라 · 주식 텔레그램 채널 수백 개를 대신 읽습니다",
};

/**
 * 미장 카드. 국장과 **판형도 그림도 같고 글만 다르다** — 둘은 한 구역의 두 페이지라
 * 서로 남처럼 보이면 안 된다. 구분은 크게 박히는 제목이 한다.
 *
 * 줄 길이를 국장(24·15·23자)에 맞춰 끊었다. 오른쪽 말풍선과 맞붙는 사고가 실제로
 * 있었던 자리라 글자 수를 세어 맞춘다.
 */
export const US_KADERA_CARD: OgCopy = {
  title: "미장 카더라",
  lines: [
    "같은 채널들이 미국 종목은 뭐라고 하는지 봅니다.",
    "오늘 가장 많이 언급된 미국 종목과",
    "관심이 어느 테마로 옮겨가는지 집계합니다.",
  ],
  foot: "hatzze.fun/kadera/us",
  alt: "미장 카더라 · 같은 채널들이 미국 종목은 뭐라고 하는지 봅니다",
};

export const MDD_CARD: OgCopy = {
  title: "MDD 정밀분석",
  lines: [
    "내 종목은 고점에서 얼마나 내려왔습니까.",
    "이만큼 빠졌던 적이 과거에 몇 번이었는지,",
    "회복까지 얼마나 걸렸는지 함께 봅니다.",
  ],
  foot: "hatzze.fun/mdd",
  alt: "MDD 정밀분석 · 내 종목은 고점에서 얼마나 내려왔습니까",
};

/**
 * 내부자 카드. 화면 부제("임원과 의원, 월가 거물이 무엇을 사고팔았나")와 같은 세 주체를
 * 그대로 부른다. 줄 길이는 앞의 넷과 같은 폭(24·22·21자 안쪽)으로 끊는다 — 오른쪽 그림과
 * 맞붙는 사고가 실제로 있었던 자리다(KADERA_CARD 주석).
 * ⛔ 숫자를 적지 않는다. 카드는 한 번 굳으면 못 고치는데 이 화면의 값은 분기마다 바뀐다.
 */
export const INSIDER_CARD: OgCopy = {
  title: "내부자 리포트",
  lines: [
    "미국 기업 임원과 미 하원의원,",
    "월가 거물이 무엇을 사고팔았는지",
    "공시 그대로 봅니다.",
  ],
  foot: "hatzze.fun/insider",
  alt: "내부자 리포트 · 임원과 의원, 월가 거물이 무엇을 사고팔았는지 공시 그대로 봅니다",
};

/**
 * 배당 카드. 화면 부제("종목과 주수를 넣으면 1년에 얼마 받는지 바로 계산합니다")의 두 축 —
 * 얼마 받나, 어느 달에 들어오나. 그림은 열두 달 막대(월 배당 달력)다.
 */
export const DIVIDEND_CARD: OgCopy = {
  title: "배당으로 살기",
  lines: [
    "가진 종목과 주수를 넣으면",
    "1년에 배당을 얼마 받는지,",
    "어느 달에 들어오는지 바로 셉니다.",
  ],
  foot: "hatzze.fun/dividend",
  alt: "배당으로 살기 · 가진 종목과 주수를 넣으면 1년에 배당을 얼마 받는지 바로 셉니다",
};

/**
 * 데일리 노트 카드. 목록 화면(/daily)과 날짜별 글이 같이 쓴다. 날짜별 글은 제목이 매일
 * 다르지만 카드에는 적지 않는다 — 카드는 빌드 때 한 번 굳는다.
 */
export const NOTE_CARD: OgCopy = {
  title: "데일리 노트",
  lines: [
    "주식 텔레그램 채널에서 오간 말을",
    "매일 저녁 한 편의 글로 정리합니다.",
    "무슨 일이 있었고 어느 회사가 어땠는지.",
  ],
  foot: "hatzze.fun/daily",
  alt: "데일리 노트 · 주식 텔레그램 채널에서 오간 말을 매일 저녁 한 편의 글로 정리합니다",
};

/**
 * 국장 미리보기 카드. 화면 부제("밤사이 미장이 크게 움직인 날 국장은 보통 얼마에 열렸나")의
 * 두 축 — 어느 종목이 엮이나, 그런 날 국장은 어땠나. 그림은 미장 종목과 국장 종목을 잇는 선이다.
 */
export const PREVIEW_CARD: OgCopy = {
  title: "국장 미리보기",
  lines: [
    "밤사이 미장에서 크게 움직인 종목이",
    "오늘 아침 국장 어디와 엮이는지",
    "개장 전에 잇습니다.",
  ],
  foot: "hatzze.fun/preview",
  alt: "국장 미리보기 · 밤사이 미장에서 크게 움직인 종목이 오늘 아침 국장 어디와 엮이는지 개장 전에 잇습니다",
};

/** 업데이트 기록 카드. 푸터의 버전을 눌러 들어오는 화면이라 셋째 줄 없이 둘로 끝낸다. */
export const CHANGELOG_CARD: OgCopy = {
  title: "업데이트 기록",
  lines: ["무엇이 언제 바뀌었는지", "버전별로 적어 둡니다."],
  foot: "hatzze.fun/changelog",
  alt: "업데이트 기록 · 무엇이 언제 바뀌었는지 버전별로 적어 둡니다",
};

/**
 * 테마 목록 카드(국장·미장). 제목은 사이드바·본문 제목과 같은 '판세'다(app/theme/copy.ts).
 * 줄 길이는 앞의 카드들과 같은 폭(24·22·21자 안쪽)으로 끊는다. 그림은 테마 지도(Treemap)의 생김새다.
 */
export const THEME_CARD: OgCopy = {
  title: "국장 테마 판세",
  lines: [
    "반도체·로봇·원전 같은 테마마다",
    "채널에서 무슨 얘기가 도는지,",
    "언급 상위 종목과 그 이유를 봅니다.",
  ],
  foot: "hatzze.fun/theme",
  alt: "국장 테마 판세 · 반도체·로봇·원전 같은 테마마다 채널에서 무슨 얘기가 도는지 봅니다",
};

export const US_THEME_CARD: OgCopy = {
  title: "미장 테마 판세",
  lines: [
    "AI반도체·빅테크·원자력 같은 테마마다",
    "채널에서 무슨 얘기가 도는지,",
    "언급 상위 미국 종목과 그 이유를 봅니다.",
  ],
  foot: "hatzze.fun/theme/us",
  alt: "미장 테마 판세 · AI반도체·빅테크·원자력 같은 테마마다 채널에서 무슨 얘기가 도는지 봅니다",
};

/**
 * 테마 한 장의 카드(국장 26 · 미장 16). 제목이 테마 이름이고, 본문은 그 화면 부제(AppShell DEEP_PAGES)와
 * 같은 말을 세 줄로 끊는다. 미장은 국장과 이름이 겹치는 테마(금융)가 있어 첫 줄에 시장을 적는다.
 * ⛔ 숫자·종목 이름을 적지 않는다. 카드는 한 번 굳으면 못 고치는데 그 화면의 값은 매일 바뀐다.
 *
 * @param path 주소(`/theme/semiconductor`). 카드 맨 아래에 그대로 적는다.
 */
export function themeCard(theme: string, market: "kr" | "us", path: string): OgCopy {
  const head = market === "us" ? `미장 ${theme}` : theme;
  return {
    title: theme,
    lines: [`${head} 테마를 두고`, "채널에서 요즘 무슨 얘기가 도는지,", "언급 상위 종목과 그 이유를 봅니다."],
    foot: `hatzze.fun${path}`,
    alt: `${head} 테마 · 채널에서 요즘 무슨 얘기가 도는지, 언급 상위 종목과 그 이유를 봅니다`,
  };
}

/**
 * 카드 **그림**의 판. 카드를 그리는 코드(app/og-card.tsx · 각 폴더의 opengraph-image.tsx · 홈 카드 라우트)를 바꾸면
 * 올린다. 글은 아래 ogVersion 이 알아서 세지만 그림은 코드라 셀 수가 없다.
 *
 *   1  첫 판(주소에 버전이 없던 때)
 *   2  2026-09-30 — 홈 카드를 2색 4칸 막대로 · 모든 카드 주소에 버전을 붙임
 */
export const OG_DESIGN_VERSION = 2;

/** 이 파일에 적힌 정적 카드. 테마 한 장 카드(themeCard)는 이름마다 만들어져 여기 없다. */
const STATIC_CARDS: OgCopy[] = [
  KADERA_CARD,
  US_KADERA_CARD,
  MDD_CARD,
  INSIDER_CARD,
  DIVIDEND_CARD,
  NOTE_CARD,
  PREVIEW_CARD,
  CHANGELOG_CARD,
  THEME_CARD,
  US_THEME_CARD,
];

/** FNV-1a 32비트. 짧고 의존이 없으면 된다 — 암호가 아니라 '내용이 바뀌었나'의 표시다. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * 카드 주소에 붙일 버전(`/kadera/opengraph-image?v=…`). 카드의 **글 전부와 그림 판**으로 만든다.
 *
 * ## 왜 붙이나
 *
 * 카카오·페이스북·X 는 og:image 를 **주소 단위로** 오래 캐시한다. 카드 글이나 그림을 고쳐도 주소가 같으면 이미 퍼진
 * 채팅방은 물론이고 새로 공유하는 링크에도 옛 카드가 뜬다. 카드 문구는 줄바꿈·말풍선 겹침으로 여러 번 고쳤다(위 주석들).
 * 홈 카드만 날짜·도수로 버전을 달고 있었고 나머지 열둘은 버전이 없었다(2026-09-30 점검). 글이 그대로면 버전도 그대로라
 * 괜히 다시 긁어 가게 하지 않는다.
 *
 * 메타데이터는 카드의 alt 만 들고 온다(app/seo.ts 의 ownImage). 그 alt 로 이 파일의 카드를 찾아 글 전부를 세고,
 * 못 찾으면(테마 한 장 카드) alt 만 센다 — 그 카드의 나머지 글은 테마 이름에서 기계로 나와 alt 와 같이 바뀐다.
 */
export function ogVersion(alt: string): string {
  const card = STATIC_CARDS.find((c) => c.alt === alt);
  return fnv1a(`${OG_DESIGN_VERSION}\n${card ? JSON.stringify(card) : alt}`);
}

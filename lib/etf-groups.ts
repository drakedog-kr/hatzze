/**
 * ETF 갈래 · 기초자산 가르기 — ETF 자금 흐름 화면(/etf)이 1,172종목을 묶어 보는 잣대.
 *
 * KRX 응답에는 '갈래' 칸이 없다. 이름과 추적 지수(IDX_IND_NM)로 가른다.
 *
 * ## 차례가 규칙이다
 *
 * 한 ETF 가 여러 낱말에 걸린다 — 'KODEX 200타겟위클리커버드콜' 은 코스피200 이기도 하고 커버드콜이기도 하다.
 * 위에서부터 먼저 걸린 갈래로 정한다: 단일종목 → 인버스 → 레버리지 → 커버드콜 → 파킹형 → 채권 → 금·원자재·통화 → 배당 →
 * 미국 대표지수 → 해외 업종·테마 → 국내 대표지수 → 반도체 → 국내 업종·테마. 상품의 '모양'(배수 · 옵션 · 현금성)이
 * 기초자산보다 먼저다 — 레버리지 코스피200 은 코스피200 을 사는 돈과 성격이 다르다.
 *
 * ⚠️ 이름 규칙이라 틀리는 게 나온다. 그때는 규칙을 비틀지 말고 OVERRIDES 에 코드로 적는다.
 * ⚠️ 2026-10-11 첫 판에서 1,172개를 훑어 고친 것: '전단채'(WON 전단채플러스액티브) · 'CD1년금리'(KODEX CD1년금리플러스액티브)가
 *    테마로 빠져 파킹형 낱말에, '팔라듐선물인버스'가 인버스로 가서 원자재 낱말에 넣었다.
 * ⚠️ 같은 날 세이브로 분류(etf_info.category)와 맞대 고친 것: 금 · 은 현물(KODEX 금액티브 · TIGER 은액티브 · 1Q 은액티브)이 테마로 빠져 원자재 낱말에,
 *    단기통안채 · 단기특수은행채 · 단기변동금리부채권(세이브로 '단기자금')을 파킹형 낱말에 넣었다. 'TIME 미국나스닥100채권혼합50액티브'는
 *    추적 지수의 '단기채권혼합'에 걸려 파킹형에 들었다 — 주식이 반인 혼합형이라 파킹형에서 뺀다.
 */

export const ETF_GROUPS = [
  "파킹형",
  "채권",
  "미국 대표지수",
  "해외 업종·테마",
  "국내 대표지수",
  "반도체",
  "국내 업종·테마",
  "배당",
  "커버드콜",
  "레버리지",
  "인버스",
  "단일종목",
  "금·원자재·통화",
] as const;
export type EtfGroup = (typeof ETF_GROUPS)[number];

/** 이름 규칙이 틀린 것을 코드로 바로잡는다. */
const OVERRIDES: Record<string, EtfGroup> = {};

const PARKING = /머니마켓|MMF|CD\S*금리|KOFR|SOFR|단기채|초단기|전단채|발행어음|금리액티브|머니|단기통안|단기특수은행채|단기변동금리/;
const BOND = /채권|국고채|국채|통안|회사채|Treasury|Bond|크레딧|하이일드/i;
const COMMODITY = /골드|금현물|금선물|은선물|은현물|은액티브|금액티브|원유|WTI|구리|원자재|천연가스|농산물|팔라듐|플래티넘|백금/;
// 통화 선물 — 달러 · 엔 · 유로. 이름에 '미국'이 들어 있어도(미국달러선물) 해외 주식이 아니다.
const CURRENCY = /달러선물|미국달러(?!단기)|엔선물|유로선물|위안/;
const US_BROAD = /S&P\s?500|나스닥\s?100|NASDAQ\s?100|다우존스|Dow Jones Industrial/i;
const ABROAD = /미국|글로벌|차이나|중국|홍콩|일본|인도|베트남|유럽|대만|S&P|나스닥|NASDAQ|MSCI ACWI|선진국|신흥국|월드/i;
const KR_BROAD_INDEX = /^(코스피 ?200|코스닥 ?150|KRX ?300|코스피|코스피 ?200 ?(TR|Total Return).*|MSCI Korea.*)$/i;
const SEMI = /반도체|HBM|메모리/;

/**
 * ETF 하나의 갈래. category 는 세이브로 ETF종합정보의 분류(etf_info.category, 마이그레이션 095) — 있으면 이름 규칙의 마지막 구멍을 막는다.
 * 이름에 나라 낱말이 없는 해외 ETF(RISE 테슬라고정테크100 · TIGER TSMC파운드리밸류체인 · TIGER 유로스탁스50 · ACE 러시아MSCI …
 * 2026-10-11 서른여섯 개)가 '국내 업종·테마'로 빠졌다. 낱말을 늘리는 것보다(종목 이름이 계속 새로 붙는다) 분류 칸으로 바로잡는다.
 */
export function etfGroup(code: string, name: string, index: string | null, category?: string | null): EtfGroup {
  const g = groupByName(code, name, index);
  if (category && (g === "국내 업종·테마" || g === "국내 대표지수" || g === "반도체")) {
    if (category.startsWith("해외지수")) return "해외 업종·테마";
    if (category.startsWith("상품")) return "금·원자재·통화";
  }
  return g;
}

function groupByName(code: string, name: string, index: string | null): EtfGroup {
  const fixed = OVERRIDES[code];
  if (fixed) return fixed;
  const idx = (index ?? "").trim();
  const both = `${name} ${idx}`;
  if (name.includes("단일종목")) return "단일종목";
  // 배수 상품이라도 채권 · 원자재 · 통화에 건 것은 주식 방향과 뜻이 달라 제 기초자산 갈래로 보낸다
  // (2026-10-11 첫 판에서 'RISE 국채선물10년인버스'가 레버리지·인버스 칩에 섞였다).
  const bet = /인버스|레버리지|2X|3X/.test(name);
  if (bet && (COMMODITY.test(name) || CURRENCY.test(name))) return "금·원자재·통화";
  if (bet && BOND.test(both)) return "채권";
  if (name.includes("인버스")) return "인버스";
  if (bet) return "레버리지";
  if (/커버드콜|프리미엄|타겟위클리|타겟데일리|위클리고정|데일리옵션/.test(name)) return "커버드콜";
  if (PARKING.test(both) && !name.includes("혼합")) return "파킹형";
  if (BOND.test(both)) return "채권";
  if (COMMODITY.test(name) || CURRENCY.test(name)) return "금·원자재·통화";
  // 배당 — 대표지수 · 테마보다 먼저. 'TIGER 미국배당다우존스'는 '다우존스'에 걸려 미국 대표지수로 갔고, 고배당 · 금융고배당은 국내 테마로
  // 흩어졌다(2026-10-12 · 이름에 '배당'이 든 51개 · 순자산 14.8조). 검색 관심은 배당 ETF 가 반도체 · 커버드콜보다 크다(검색어 트렌드
  // 'ETF'=1 기준 최근 3달 1.00 · 반도체 0.35 · 커버드콜 0.39). 커버드콜 · 채권 혼합 · 배수 상품은 위에서 먼저 제 갈래로 간다.
  if (name.includes("배당")) return "배당";
  if (name.includes("미국") && US_BROAD.test(both)) return "미국 대표지수";
  if (ABROAD.test(name)) return "해외 업종·테마";
  if (KR_BROAD_INDEX.test(idx)) return "국내 대표지수";
  if (SEMI.test(both)) return "반도체";
  return "국내 업종·테마";
}

/** 이름에 해외 낱말이 있는가 — 해외 주식 · 해외 지수를 담는 ETF 를 가를 때 첫 잣대(lib/etf-extras.ts 의 괴리율이 쓴다). */
export const abroadName = (name: string) => ABROAD.test(name);

/**
 * 'ETF 자금 흐름' 카드 왼쪽 목록에서 고르는 판 — 전체 · 파킹형·채권 빼고 · 유형 열셋. 고르면 오른쪽 표가 그 판으로 바뀐다(app/etf/FlowCard.tsx).
 * '파킹형·채권 빼고'를 따로 두는 이유: 전체 1달 순유입의 70% 가 파킹형이라(2026-10-08) 전체 표 위쪽을 머니마켓 · CD금리가 채운다.
 * 한때 표 위 칩 일곱(미국 대표지수 · 커버드콜 · 국내 대표지수 · 반도체 · 레버리지·인버스)이었다 — 옆 '유형별 돈 흐름' 목록과 따로 놀아
 * 둘을 한 카드로 합쳤다(2026-10-11 "연관된 것이 동떨어진 카드라 상관없어 보인다").
 */
export const ETF_ALL = "all";
export const ETF_NOCASH = "nocash";
export function etfPickTest(key: string): (g: EtfGroup) => boolean {
  if (key === ETF_ALL) return () => true;
  if (key === ETF_NOCASH) return (g) => g !== "파킹형" && g !== "채권";
  return (g) => g === key;
}
export const ETF_PICK_KEYS: string[] = [ETF_ALL, ETF_NOCASH, ...ETF_GROUPS];

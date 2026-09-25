/**
 * ⌘K 검색(components/command-palette.tsx)의 순위. 브라우저에서 도는 순수 함수다.
 *
 * ## 등급표는 MDD 검색창을 따른다
 *
 * app/mdd/Controls.tsx 의 rankStockMatches 와 같은 줄 세움이다 — 이름·코드가 똑같으면 0, 이름 앞글자 1,
 * 코드 앞자리 2, 영문명 앞글자 2.5, 이름 안 3, 영문명 안 3.5. 거기에 셋을 더했다.
 *
 *   ① 초성 — "ㅅㅅㅈㅈ" → 삼성전자(4 · 4.5).
 *   ② 흔한 별명과 한글로 적은 영문 머리 — "엔솔" → LG에너지솔루션, "엘지전자" → LG전자.
 *   ③ 글자를 건너뛰며 맞추기 — "하닉" → SK하이닉스(5, 맨 끝).
 *
 * ③ 은 cmdk 기본값이 하던 일이다. 줄임말이 이것으로 잡혀서 남겨 두되 **맨 끝 등급**으로 내렸다. 그리고
 * **코드·티커에는 걸지 않는다** — cmdk 기본값은 숫자도 건너뛰며 맞춰서 "000660" 에 37종목이 걸렸다
 * (SK하이닉스 다음이 이수페타시스·LS·GS건설, 2026-09-26 실측).
 *
 * ## 같은 등급이면 언급이 많은 쪽
 *
 * 우선주를 뒤로 보낸 다음 **최근 3일 언급 수**로 줄 세운다(MDD 는 고정된 대형주 목록 순). "삼전"이
 * 삼성전기보다 삼성전자를 먼저 내는 것이 이 규칙이다. 마지막 비교자는 코드라 순서가 흔들리지 않는다.
 */

export type SearchMarket = "kr" | "us";

export type SearchStock = {
  market: SearchMarket;
  /** 국장은 6자리 코드, 미장은 티커. */
  code: string;
  /** 화면에 보이는 이름. 미장은 한글 표기다. */
  name: string;
  /** 검색에만 쓰는 이름 — 미장의 정식 영문명("NVIDIA CORP"). 국장은 null. */
  alias: string | null;
  /** 최근 3일 언급 수. 못 셌으면 null(0 과 다르다 — 화면은 이때 숫자를 안 적는다). */
  mentions: number | null;
};

export type SearchTheme = { market: SearchMarket; name: string };

/** /api/search-index 의 응답. 배열꼴은 목록 크기를 줄이려는 것이다(3,000줄). */
export type SearchIndex = {
  /** [코드, 이름, 최근 3일 언급(못 셌으면 null)] */
  kr: [string, string, number | null][];
  /** [티커, 한글 이름, 영문명, 최근 3일 언급(못 셌으면 null)] */
  us: [string, string, string | null, number | null][];
  /** 빈 검색창의 '지금 뜨는 종목'. ratio 는 평소 대비 배수, null 이면 신규 등장(앞 기간 언급 0). */
  trend: { market: SearchMarket; code: string; name: string; ratio: number | null }[];
  /** 빈 검색창의 '지금 뜨는 테마'. delta 는 점유율 증감(%p, 늘 양수). */
  themes: { market: SearchMarket; name: string; delta: number }[];
  /** 추천·언급 수가 기대는 카더라 기준일(YYYY-MM-DD). */
  asOf: string;
};

/** 순위에 쓰는 꼴로 한 번만 바꿔 둔다(3,000개를 글자마다 다시 접지 않게). */
export type PreparedStock = {
  s: SearchStock;
  name: string;
  code: string;
  alias: string;
  cho: string;
  pref: boolean;
};

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

/** 비교용으로 접는다 — 소문자, 띄어쓰기와 가운뎃점은 뺀다("AI·소프트웨어" = "ai소프트웨어"). */
export function fold(s: string): string {
  return s.toLowerCase().replace(/[\s·]/g, "");
}

/** 한글 음절은 초성으로, 나머지 글자는 그대로 둔다("sk하이닉스" → "skㅎㅇㄴㅅ"). */
export function choseong(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return out;
}

const isChoseongQuery = (q: string) => /^[ㄱ-ㅎ]+$/.test(q);
const isAsciiQuery = (q: string) => /^[a-z0-9.\-&]+$/.test(q);
const hasSyllable = (q: string) => /[가-힣]/.test(q);

/** q 의 글자가 s 에 순서대로 다 나오나(사이에 다른 글자가 끼어도 된다). */
function isSubsequence(q: string, s: string): boolean {
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

/**
 * 흔한 별명 → 정식 이름. 건너뛰기 맞추기(③)로 **안 잡히는 것만** 둔다 — "삼전"·"하닉"·"현차"·"카뱅"은
 * 이미 잡힌다. "엔솔"은 이름에 '엔'이 없어서, "삼전"은 삼성전기와 동점이 날 수 있어서 둔다.
 * ⛔ 늘리지 말 것. 이 표가 길어지면 누가 무엇을 치는지 모르는 채 추측을 쌓는 셈이다.
 */
const NICKNAMES: Record<string, string> = {
  엔솔: "LG에너지솔루션",
  삼전: "삼성전자",
  삼바: "삼성바이오로직스",
  한전: "한국전력",
};

/**
 * 한글로 적은 영문 머리 → 영문. 거래소 이름이 영문으로 시작하는 그룹들이다("엘지전자" → "lg전자").
 * 원래 검색어도 그대로 맞춰 보므로 한글 이름 종목(에스엠 등)을 가리지 않는다.
 */
const LATIN_HEADS: [string, string][] = [
  ["에스케이", "sk"],
  ["엘지", "lg"],
  ["케이티", "kt"],
  ["지에스", "gs"],
  ["씨제이", "cj"],
  ["에이치디", "hd"],
  ["케이비", "kb"],
  ["디비", "db"],
  ["엘에스", "ls"],
  ["에이치엘", "hl"],
  ["비엔케이", "bnk"],
  ["포스코", "posco"],
];

/** 검색어 하나를 맞춰 볼 꼴 여럿으로(원래 꼴 · 영문 머리). 별명은 따로 본다(rankStocks). */
function variants(q: string): string[] {
  const out = [q];
  for (const [ko, en] of LATIN_HEADS) {
    if (q.startsWith(ko)) out.push(en + q.slice(ko.length));
  }
  return out;
}

export function prepareStocks(list: SearchStock[]): PreparedStock[] {
  return list.map((s) => {
    const name = fold(s.name);
    return {
      s,
      name,
      code: s.code.toLowerCase(),
      alias: s.alias ? fold(s.alias) : "",
      cho: choseong(name),
      // MDD 와 같은 판정 — 코드 끝자리가 0 이 아니거나 이름이 '우'·'우B' 로 끝나면 우선주.
      pref: s.market === "kr" && (!s.code.endsWith("0") || /\d?우B?$/.test(s.name)),
    };
  });
}

function stockTier(p: PreparedStock, q: string): number | null {
  if (p.name === q || p.code === q || (p.alias && p.alias === q)) return 0;
  if (p.name.startsWith(q)) return 1;
  if (isAsciiQuery(q) && p.code.startsWith(q)) return 2;
  if (p.alias && p.alias.startsWith(q)) return 2.5;
  if (p.name.includes(q)) return 3;
  if (p.alias && q.length >= 2 && p.alias.includes(q)) return 3.5;
  if (isChoseongQuery(q)) {
    if (p.cho.startsWith(q)) return 4;
    if (p.cho.includes(q)) return 4.5;
  }
  if (q.length >= 2 && hasSyllable(q) && isSubsequence(q, p.name)) return 5;
  return null;
}

export type Ranked<T> = { item: T; tier: number };

/** 검색어에 맞는 종목을 관련도 순으로 최대 limit 개. 검색어가 비면 빈 배열. */
export function rankStocks(prepared: PreparedStock[], query: string, limit = 8): Ranked<SearchStock>[] {
  const q = fold(query.trim());
  if (!q) return [];
  const qs = variants(q);
  // 별명은 **그 종목 하나**만 가리킨다 — 정확 일치로만 쓴다. 풀어 쓴 이름("삼성전자")으로 앞글자까지 맞추면
  // 삼성전자우가 앞글자 등급으로 올라와 삼성전기보다 위에 섰다(2026-09-26 개발 서버 실측).
  const nick = NICKNAMES[q] ? fold(NICKNAMES[q]) : null;
  const hits: { p: PreparedStock; tier: number }[] = [];
  for (const p of prepared) {
    let best: number | null = nick !== null && p.name === nick ? 0 : null;
    for (const v of qs) {
      const t = stockTier(p, v);
      if (t !== null && (best === null || t < best)) best = t;
    }
    if (best !== null) hits.push({ p, tier: best });
  }
  hits.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(a.p.pref) - Number(b.p.pref) ||
      (b.p.s.mentions ?? -1) - (a.p.s.mentions ?? -1) ||
      a.p.s.name.length - b.p.s.name.length ||
      a.p.s.name.localeCompare(b.p.s.name, "ko") ||
      a.p.s.code.localeCompare(b.p.s.code),
  );
  return hits.slice(0, limit).map((h) => ({ item: h.p.s, tier: h.tier }));
}

/** 테마 별칭. 사전 이름과 다르게 부르는 것이 확실한 것만. */
const THEME_ALIASES: Record<string, string> = {
  이차전지: "2차전지",
  배터리: "2차전지",
};

/** 테마 순위 — 종목과 같은 등급 눈금이라 두 묶음 중 무엇을 먼저 보일지 견줄 수 있다. */
export function rankThemes(themes: SearchTheme[], query: string, limit = 4): Ranked<SearchTheme>[] {
  const q0 = fold(query.trim());
  if (!q0) return [];
  const q = THEME_ALIASES[q0] ? fold(THEME_ALIASES[q0]) : q0;
  const hits: { t: SearchTheme; tier: number; i: number }[] = [];
  themes.forEach((t, i) => {
    const name = fold(t.name);
    let tier: number | null = null;
    if (name === q) tier = 0;
    else if (name.startsWith(q)) tier = 1;
    else if (name.includes(q)) tier = 3;
    else if (isChoseongQuery(q) && choseong(name).startsWith(q)) tier = 4;
    if (tier !== null) hits.push({ t, tier, i });
  });
  // 같은 등급이면 사전 순서(국장이 먼저, 그 안에서는 사전에 적힌 순)를 지킨다.
  hits.sort((a, b) => a.tier - b.tier || a.i - b.i);
  return hits.slice(0, limit).map((h) => ({ item: h.t, tier: h.tier }));
}

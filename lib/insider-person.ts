/**
 * 내부자 종목 상세의 임원 줄 — 이름 · 직함 · 같은 날 줄 묶기. 순수 함수만 둔다(tests/insider-person.test.ts).
 *
 * SEC 원문 이름은 '성 이름 중간' 꼴에 대문자가 섞여('HUANG JEN HSUN' · 'Teter Timothy S.') 그대로 적으면 읽히지 않았고,
 * 받아 둔 직함(owner_title)을 그리지 않아 CEO 인지 이사인지 몰랐다. 같은 사람의 같은 날 신고가 여러 줄(Teter 9/23 × 3)로
 * 되풀이됐다(2026-10-04 점검).
 */

/** 사람이 아니라 법인 · 펀드인 이름 — 어순을 바꾸지 않는다. */
const ENTITY = /\b(L\.?P\.?|LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Trust|Fund|Funds|Holdings?|Partners|Capital|Group|Ltd\.?|Management|Investments?|Foundation|Company|Co\.|Advisors|Ventures|Bank|N\.A\.|PLC|AG|S\.A\.)(?=\s|$|,)/i;
const SUFFIX = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV"]);

const titleCase = (w: string) =>
  /^[A-Z][A-Z'-]+$/.test(w) ? w.toLowerCase().replace(/(^|[-'])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()) : w;

/** 'HUANG JEN HSUN' → 'Jen Hsun Huang', 'Teter Timothy S.' → 'Timothy S. Teter'. 법인 이름은 그대로. */
export function ownerDisplayName(raw: string | null): string | null {
  if (!raw) return raw;
  const name = raw.trim().replace(/\s+/g, " ");
  if (ENTITY.test(name)) return name;
  const tokens = name.split(" ");
  if (tokens.length < 2) return tokens.map(titleCase).join(" ");
  const suffix = SUFFIX.has(tokens[tokens.length - 1].toUpperCase()) ? tokens.pop()! : null;
  const ordered = [...tokens.slice(1), tokens[0], ...(suffix ? [suffix] : [])];
  return ordered.map((w) => (SUFFIX.has(w.toUpperCase()) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : titleCase(w))).join(" ");
}

/** 직함을 짧게 — CEO · CFO · 사장 · 부사장 · 이사. 모르는 긴 직함은 안 적는다(null). */
export function shortTitle(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/chief executive|\bceo\b/i.test(t)) return "CEO";
  if (/chief financial|\bcfo\b/i.test(t)) return "CFO";
  if (/chief operating|\bcoo\b/i.test(t)) return "COO";
  if (/chief technology|\bcto\b/i.test(t)) return "CTO";
  if (/chief accounting|\bcao\b/i.test(t)) return "CAO";
  if (/general counsel|chief legal|\bclo\b/i.test(t)) return "법무 총괄";
  if (/\bchair/i.test(t)) return "의장";
  if (/vice president|\bevp\b|\bsvp\b|\bvp\b/i.test(t)) return "부사장";
  if (/\bpresident\b/i.test(t)) return "사장";
  if (/director/i.test(t)) return "이사";
  return t.length <= 14 ? t : null;
}

export type InsiderLineLike = {
  ownerName: string | null;
  code: string | null;
  acquiredDisposed: string | null;
  transactionDate: string | null;
  filedDate: string;
  shares: number | null;
  value: number | null;
};

/**
 * 같은 사람 · 같은 날 · 같은 종류 줄을 하나로 — 건수 · 주식 수 · 금액을 더한다. 금액이 하나라도 없으면 없음(null).
 * 붙어 있지 않아도 묶는다 — 같은 날 여러 임원이 신고하면 금액 순으로 사람이 섞여, 바로 앞 줄만 보던 때는 AMZN 45줄 중 20줄이
 * 같은 사람의 되풀이였다(2026-10-05 머지 전 점검). 줄 차례는 처음 나온 자리를 따른다.
 */
export function groupInsiderLines<T extends InsiderLineLike>(rows: T[]): (T & { count: number })[] {
  const out: (T & { count: number })[] = [];
  const seen = new Map<string, T & { count: number }>();
  for (const r of rows) {
    const key = [r.ownerName, r.transactionDate ?? r.filedDate, r.code, r.acquiredDisposed].join("|");
    const prev = seen.get(key);
    if (prev) {
      prev.count += 1;
      prev.shares = prev.shares != null && r.shares != null ? prev.shares + r.shares : null;
      prev.value = prev.value != null && r.value != null ? prev.value + r.value : null;
      continue;
    }
    const line = { ...r, count: 1 };
    seen.set(key, line);
    out.push(line);
  }
  return out;
}

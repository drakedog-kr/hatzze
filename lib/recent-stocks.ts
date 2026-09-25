/**
 * ⌘K 검색의 '최근 본 종목' — 이 기기에서 연 종목 화면을 기억한다. 로그인이 없어 브라우저 저장소(localStorage)에
 * 두고, 서버로는 아무것도 안 보낸다.
 *
 * 왜 있나. 토스 디자인 노트(2026-09-04 정리)에 관심종목을 등록하지 않고 같은 종목을 매번 검색하던 사용자를
 * '최근 본' 자동 수집으로 푼 사례가 있다. 우리도 종목을 다시 찾아 들어오는 길이 검색 하나뿐이다.
 *
 * 적는 곳은 셸(components/command-menu.tsx)이다 — 주소가 종목 화면이면 적는다. 종목 화면은 일부러 서버 컴포넌트로만
 * 되어 있어(app/stock/[code]/page.tsx 머리말) 거기에 클라이언트 코드를 붙이지 않는다.
 *
 * 이름은 적지 않는다. 검색 목록(/api/search-index)을 받은 뒤 코드로 찾는다 — 이름이 바뀌어도 낡은 표기가 남지 않는다.
 * ⚠️ 저장소는 막혀 있을 수 있다(사생활 보호 창·차단). 읽기·쓰기 모두 실패하면 조용히 빈 목록이다.
 */
import type { SearchMarket } from "./search-rank";

export type RecentRef = { market: SearchMarket; code: string };

const KEY = "hz-recent-stocks";
/** 보여 주는 줄 수. 적어 두는 건 조금 더(목록에서 빠진 종목이 있어도 다섯 줄이 차게). */
export const RECENT_SHOW = 5;
const RECENT_KEEP = 8;

/** 종목 화면 주소면 그 종목을, 아니면 null. 국장 `/stock/005930` · 미장 `/insider/stock/NVDA`. */
export function refFromPath(path: string): RecentRef | null {
  const kr = /^\/stock\/([0-9A-Z]{6})\/?$/.exec(path);
  if (kr) return { market: "kr", code: kr[1] };
  const us = /^\/insider\/stock\/([^/]+)\/?$/.exec(path);
  if (us) {
    const t = decodeURIComponent(us[1]).toUpperCase();
    // 미장 화면·MDD 가 받는 티커 꼴과 같다(app/mdd/page.tsx resolveInitial).
    if (/^[A-Z][A-Z.\-]{0,6}$/.test(t)) return { market: "us", code: t };
  }
  return null;
}

export function readRecent(): RecentRef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (r): r is RecentRef => r && (r.market === "kr" || r.market === "us") && typeof r.code === "string",
    );
  } catch {
    return [];
  }
}

/** 맨 앞에 넣는다. 이미 있으면 앞으로 끌어온다. */
export function pushRecent(ref: RecentRef) {
  try {
    const next = [ref, ...readRecent().filter((r) => !(r.market === ref.market && r.code === ref.code))].slice(0, RECENT_KEEP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장소가 막혀 있으면 기억하지 않는다. 검색은 그대로 된다.
  }
}

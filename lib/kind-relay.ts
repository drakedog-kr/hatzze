/**
 * KIND(kind.krx.co.kr) 서울 경유 — `/api/kind/[...path]` 의 순수 조각.
 *
 * ## 왜
 *
 * 파이프라인은 깃헙 해외 러너에서 돈다. KIND 는 그 러너 IP 에 일시 차단 403 을 자주 준다 — 같은 실행 안에서도 잡(러너)마다
 * 갈리고, 하루 반 이어진 적도 있다(이슈 #815 · #819 · #820 · #823 · #831 · #832). 여섯 번 재시도(약 50초)로는 같은 러너라
 * 못 넘는다. 이 사이트의 함수는 서울(icn1 · vercel.json regions)에서 돈다. 그래서 파이프라인이 KIND 를 직접 부르지 않고
 * 이 라우트에 맡기면 서울에서 묻는다. 파이프라인 쪽은 data-pipeline/common/kind.py `request` 다(이 길이 안 되면 직접 묻는다).
 *
 * ## 막는 것
 *
 *   - 비밀(`KIND_PROXY_SECRET`, 없으면 `REVALIDATE_SECRET`)이 맞아야 한다. 잠그지 않으면 누구나 우리 함수로 KIND 를 두드려
 *     비용을 올리고, 서울 IP 까지 차단당하게 만들 수 있다.
 *   - 호스트는 KIND 하나로 고정이다. 경로도 파이프라인이 실제로 부르는 자리(KIND_PATHS)와 공시 본문(`external/…htm`)뿐이다.
 *   - 넘기는 요청 머리는 넷(FORWARD_HEADERS)뿐이다. 우리 비밀(authorization)이 KIND 로 새지 않는다.
 */

export const KIND_ORIGIN = "https://kind.krx.co.kr";

/** 파이프라인이 부르는 KIND 자리(2026-11-22). 새 스크립트가 다른 자리를 부르면 여기 한 줄 더한다 — 빠지면 400 이고 직접 묻는다. */
export const KIND_PATHS: ReadonlySet<string> = new Set([
  "disclosure/details.do", // 배당 결정 공시 목록(fetch_kr_dividend_notices.py)
  "common/disclsviewer.do", // 공시 뷰어 → 본문 주소(같은 스크립트)
  "valueup/dividend.do", // 고배당기업(fetch_kr_high_dividend.py)
  "disclosureinfo/dividendinfo.do", // 배당성향(fetch_kr_dividend_payout.py)
  "corpgeneral/corpList.do", // 상장회사 목록(refresh_stock_logo_sources.py)
  "disclosure/searchtotalinfo.do", // 시장 조치(fetch_market_actions.py)
]);

/** 공시 본문 HTML — `external/2026/11/16/000736/20261116001405/61500.htm` 꼴. */
const EXTERNAL_RE = /^external\/[A-Za-z0-9_\-/]+\.htm$/;
const SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;

/** 경로 조각 + 쿼리 → KIND 주소. 허락 밖이면 null. */
export function kindTarget(segments: readonly string[], search: string): string | null {
  if (segments.length === 0) return null;
  if (segments.some((s) => s === "." || s === ".." || !SEGMENT_RE.test(s))) return null;
  const path = segments.join("/");
  if (!KIND_PATHS.has(path) && !EXTERNAL_RE.test(path)) return null;
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${KIND_ORIGIN}/${path}${query}`;
}

/** KIND 로 넘기는 요청 머리. 폼 꼴 · 출처 · 우리 이름 · 비동기 표시뿐이다. */
export const FORWARD_HEADERS = ["content-type", "referer", "user-agent", "x-requested-with"] as const;

export function forwardHeaders(from: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FORWARD_HEADERS) {
    const v = from.get(name);
    if (v) out[name] = v;
  }
  return out;
}

/** 비밀 검사. 비밀이 서버에 없으면 "unset"(라우트는 503) — 잠그지 않은 채 열지 않는다. */
export function authorize(header: string | null, secret: string | undefined): "ok" | "unset" | "denied" {
  if (!secret) return "unset";
  return header === `Bearer ${secret}` ? "ok" : "denied";
}

/** 라우트가 KIND 응답에 붙이는 머리. 이것이 있으면 상태 코드가 KIND 의 것이고, 없으면 이 라우트 자신의 실패다. */
export const UPSTREAM_HEADER = "X-Kind-Upstream";

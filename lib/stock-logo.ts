/**
 * 종목 로고 — 주소 규칙과 캐시 정책. StockLogo(클라이언트)와 /api/logo(서버)가 같은 것을 본다.
 *
 * ## 왜 서버를 거치나 (2026-09-16~17 사고)
 *
 * 로고는 logo.dev 에서 온다. 처음엔 방문자 브라우저가 img.logo.dev 로 직접 받았는데, 그러면
 * 요청 수가 방문 수에 정비례한다. 배당 페이지가 한 번에 144장을 부르니 오픈 이틀에 57만 건이
 * 나가 무료 한도(월 50만, 하드캡)를 넘겼고, 10월 1일까지 전부 429 였다. 브라우저 캐시(하루)는
 * 새 방문자에겐 없고, 없는 로고의 404 도 한 건으로 세는데 그건 캐시조차 안 됐다.
 *
 * 이제 /api/logo/[ticker]?s= 가 서버에서 받아 Vercel CDN 과 Next 데이터 캐시에 둔다.
 * logo.dev 에는 (종목×크기)당 하루 한 번만 간다. **없는 로고(404)도 같이 캐시한다** — 이게
 * 핵심이다. next/image 를 안 쓴 이유도 그것이다. 업스트림 404 를 캐시하지 않아서(image-optimizer
 * 가 `!res.ok` 면 throw) 없는 로고가 방문마다 새로 나간다.
 */

/**
 * 서버가 받아 주는 픽셀 크기. 눈금을 고정해 두는 건 (종목×크기) 조합이 곧 캐시 항목 수라서다.
 * 표시 크기의 2배(레티나)를 이 눈금으로 올림한다 — 18px 칩과 24px 줄이 같은 48 을 쓴다.
 */
export const LOGO_SIZES = [32, 48, 64, 80, 96, 128] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];

/** 표시 크기(px)에 맞는 요청 크기. */
export function logoSize(display: number): LogoSize {
  const want = display * 2;
  return LOGO_SIZES.find((s) => s >= want) ?? LOGO_SIZES[LOGO_SIZES.length - 1];
}

export function isLogoSize(n: number): n is LogoSize {
  return (LOGO_SIZES as readonly number[]).includes(n);
}

/**
 * logo.dev 가 받는 티커. KRX 는 접미사가 거래소와 맞아야 한다(KOSPI=.KS / KOSDAQ=.KQ).
 * 틀리면 에러가 아니라 조용히 폴백 이미지가 와서(에코프로비엠에 .KS 를 주면 "2"가 그려진다),
 * 시장을 모르면 아예 요청하지 않는다(null → 머리글자 배지). 미국 상장은 접미사 없이 티커
 * 그대로(NVDA·AAPL·TSM 실측).
 */
export function logoTicker(code: string, market: string | null): string | null {
  if (market === "KOSPI") return `${code}.KS`;
  if (market === "KOSDAQ") return `${code}.KQ`;
  if (market === "US") return code.toUpperCase();
  return null;
}

/** 라우트가 받아 주는 티커 꼴. 대문자·숫자·점·하이픈으로 12자까지(BRK.B · BF-B 도 든다). */
export const LOGO_TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

export function stockLogoPath(ticker: string, size: LogoSize): string {
  return `/api/logo/${encodeURIComponent(ticker)}?s=${size}`;
}

/**
 * 업스트림 응답을 어떻게 돌려줄지. 셋으로 가른다.
 *   ok       그림 그대로. 브라우저 7일 · CDN 하루(지나면 옛 그림을 먼저 주고 뒤에서 갱신한다).
 *   missing  없는 로고(404). 그림과 같은 시간 캐시한다 — 없는 로고 12장이 방문마다 새로 나가던 자리.
 *   error    한도 초과(429)·장애·이상한 본문. 15분만 캐시한다. 그동안은 배지, 지나면 다시 물어본다.
 *            한도가 풀리는 날 재방문자도 15분 안에 로고를 본다. 429 를 길게 캐시하면 그 반대가 되고,
 *            너무 짧으면 한도를 넘긴 동안 CDN 이 못 막아 logo.dev 를 계속 두드린다.
 *
 * 브라우저 7일은 우리 응답이라 우리가 정한다(logo.dev 자체는 하루). 재방문자가 일주일간 요청을
 * 안 보내 Vercel CDN 요청 수(Pro 포함분 월 100만)를 아낀다. 리브랜딩이 최대 일주일 늦게 보인다.
 */
export type LogoVerdict = "ok" | "missing" | "error";

export const LOGO_CACHE: Record<LogoVerdict, string> = {
  ok: "public, max-age=604800, s-maxage=86400, stale-while-revalidate=86400",
  missing: "public, max-age=604800, s-maxage=86400, stale-while-revalidate=86400",
  error: "public, max-age=900, s-maxage=900",
};

export function logoVerdict(status: number, contentType: string | null): LogoVerdict {
  if (status === 404) return "missing";
  if (status !== 200) return "error";
  // 200 인데 그림이 아니면(오류 페이지 HTML 등) 그림으로 내지 않는다.
  return contentType?.startsWith("image/") ? "ok" : "error";
}

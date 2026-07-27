"use client";

import { useState } from "react";

/**
 * 종목 로고. MDD·카더라가 같이 쓴다.
 *
 * 크기는 CSS 변수 --hz-logo 로 받는다(기본 24px). 자리마다 크기가 다른데 클래스를
 * 여러 벌 만들 이유가 없어서, 쓰는 쪽에서 size 만 넘기면 되게 했다. 모양·마스크·
 * 타일 바탕은 globals.css 의 .hz-stock-logo / .hz-stock-badge 가 맡는다.
 */

/**
 * 머리글자 배지. 로고가 없거나 못 불러왔을 때의 바닥이다. 라틴 문자로 시작하는
 * 이름은 두 글자를 쓴다 — "SK"·"LG" 처럼 두 글자가 곧 회사인 경우가 많아 한 글자만
 * 두면 SK·SK텔레콤·SK하이닉스가 전부 "S"가 된다.
 */
function InitialBadge({ code, name, size }: { code: string; name: string; size?: number }) {
  // 코드에서 색상값을 뽑는다. 같은 종목이면 언제나 같은 색이라 목록이 다시 그려져도
  // 안 흔들린다. 31 을 곱하는 흔한 문자열 해시이고, 값 자체에 의미는 없다.
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360;
  const initials = /^[A-Za-z]/.test(name) ? name.slice(0, 2).toUpperCase() : name.slice(0, 1);
  return (
    <span
      className="hz-stock-badge"
      style={{ "--h": h, ...(size ? { "--hz-logo": `${size}px` } : {}) } as React.CSSProperties}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

const LOGO_KEY = process.env.NEXT_PUBLIC_LOGO_DEV_KEY;

/**
 * logo.dev 가 KRX 티커를 그대로 받아서 도메인 매핑이 필요 없다 — 우리가 이미 가진
 * 6자리 코드와 market 만으로 끝난다.
 *
 * **접미사가 거래소와 맞아야 한다**(KOSPI=.KS / KOSDAQ=.KQ). 틀리면 에러가 아니라
 * 조용히 폴백 이미지가 온다 — 에코프로비엠에 .KS 를 주면 "2" 가 그려진다. 그래서
 * market 을 모르면 아예 요청하지 않고 머리글자로 간다(찍어서 틀리면 숫자 레터마크가
 * 나오는데, 그건 머리글자보다 나쁘다).
 *
 * 같은 이유로 fallback=404 를 붙인다. 기본 폴백은 티커 숫자로 만든 레터마크("4")라
 * 우리 한글 머리글자보다 못하다. 404 로 받아야 onError 가 떠서 InitialBadge 로
 * 되돌릴 수 있고, 덤으로 접미사를 잘못 준 경우까지 막아 준다.
 *
 * 어트리뷰션: logo.dev 무료 플랜은 **상업용** 프로젝트에만 링크백을 요구한다.
 * personal project 로 보고 넣지 않기로 했다(2026-07-27 Hun 판단). 광고·구독·유료
 * 기능이 붙는 시점에는 다시 봐야 한다.
 */
export function StockLogo({
  code,
  name,
  market,
  size,
}: {
  code: string;
  name: string;
  market: string | null;
  size?: number;
}) {
  const suffix = market === "KOSPI" ? "KS" : market === "KOSDAQ" ? "KQ" : null;
  const [failed, setFailed] = useState(false);

  if (!LOGO_KEY || !suffix || failed) return <InitialBadge code={code} name={name} size={size} />;

  // 레티나에서 안 뭉개도록 표시 크기의 2배로 받는다.
  const px = (size ?? 24) * 2;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이라 next/image 최적화 대상이 아니다
    <img
      src={`https://img.logo.dev/ticker/${code}.${suffix}?token=${LOGO_KEY}&size=${px}&format=webp&fallback=404`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className="hz-stock-logo"
      style={size ? ({ "--hz-logo": `${size}px` } as React.CSSProperties) : undefined}
    />
  );
}

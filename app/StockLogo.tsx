"use client";

import { useEffect, useRef, useState } from "react";

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
 * 로고가 '가로 띠' 형태일 때 그 띠의 색을 뽑는다.
 *
 * SK 처럼 가로로 긴 워드마크는 정사각형 타일에 contain 으로 넣으면 위아래에 여백이
 * 남는데, 거기에 기본 회색이 깔리면 로고 자체의 흰 띠와 이음매가 생겨 "띠가 잘려
 * 붙은" 꼴이 된다. 띠와 같은 색을 타일 배경으로 깔면 그 경계가 사라진다.
 *
 * 왼쪽·오른쪽 가장자리의 **세로 중앙**을 찍는다. 띠는 세로 가운데에 있으므로 그 높이의
 * 가장자리 픽셀이 곧 띠 색이다(모서리를 찍으면 SK 는 투명이 나온다 — 실측).
 * 양쪽이 서로 다르면 띠가 아니라 그림이 가장자리까지 찬 것이므로 건드리지 않는다.
 *
 * 못 읽는 경우(캔버스 오염·투명 배경)는 null 을 돌려 기본 회색 타일에 맡긴다.
 */
function readBandColor(img: HTMLImageElement): string | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const mid = Math.floor(h / 2);
    const left = ctx.getImageData(0, mid, 1, 1).data;
    const right = ctx.getImageData(w - 1, mid, 1, 1).data;
    // 양쪽 모두 불투명해야 '띠'다. 하나라도 비치면 배경이 없는 로고다.
    if (left[3] < 250 || right[3] < 250) return null;
    // 양쪽 색이 다르면 띠가 아니라 그림이 가장자리까지 닿은 것이다.
    const far = Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
    if (far > 24) return null;
    return `rgb(${left[0]},${left[1]},${left[2]})`;
  } catch {
    // CORS 로 못 받아 캔버스가 오염된 경우. 색만 포기하고 로고는 그대로 띄운다.
    return null;
  }
}

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
 * personal project 로 보고 넣지 않기로 했다(2026-07-27 판단). 광고·구독·유료
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
  // CORS 로 못 받으면 픽셀은 포기하고 그림만 띄운다(아래 onError 참고).
  const [noCors, setNoCors] = useState(false);
  const [tile, setTile] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // 캐시에서 온 이미지는 핸들러가 붙기 전에 로드가 끝나 onLoad 가 아예 안 뜬다.
  // 붙고 나서 한 번 직접 확인한다.
  //
  // 이 확인을 인라인 ref 콜백으로 했다가 되돌렸다 — 콜백 신원이 매 렌더마다 바뀌어
  // React 가 detach/attach 를 반복했고, 그때마다 loading="lazy" 의 관찰이 리셋돼서
  // 드롭다운 로고가 **영영 로드되지 않았다**(complete 가 계속 false, onError 도 안 뜸).
  // 안정적인 ref + effect 로 두면 그 churn 이 없다.
  useEffect(() => {
    const node = imgRef.current;
    if (node?.complete && node.naturalWidth) setTile(readBandColor(node));
  }, [noCors]);

  if (!LOGO_KEY || !suffix || failed) return <InitialBadge code={code} name={name} size={size} />;

  // 레티나에서 안 뭉개도록 표시 크기의 2배로 받는다.
  const px = (size ?? 24) * 2;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이라 next/image 최적화 대상이 아니다
    <img
      src={`https://img.logo.dev/ticker/${code}.${suffix}?token=${LOGO_KEY}&size=${px}&format=webp&fallback=404`}
      alt=""
      aria-hidden="true"
      // loading="lazy" 를 뺐다. crossOrigin 과 같이 쓰면 드롭다운 안의 이미지가 아예
      // 로드되지 않았다(complete 가 계속 false, onError 도 안 뜸 — 실측). 아이콘 한 장이
      // 몇 KB 이고 한 화면에 많아야 열 장이라 지연 로드로 얻는 것도 없다.
      // 픽셀을 읽으려면 CORS 로 받아야 한다. logo.dev 는 허용하지만, 정책이 바뀌어도
      // 로고가 통째로 사라지면 안 되므로 실패하면 CORS 없이 한 번 더 시도한다
      // (그때는 캔버스가 오염돼 색은 못 뽑고 기본 회색 타일로 간다).
      crossOrigin={noCors ? undefined : "anonymous"}
      ref={imgRef}
      onLoad={(e) => setTile(readBandColor(e.currentTarget))}
      onError={() => (noCors ? setFailed(true) : setNoCors(true))}
      className="hz-stock-logo"
      style={
        {
          ...(size ? { "--hz-logo": `${size}px` } : {}),
          ...(tile ? { background: tile } : {}),
        } as React.CSSProperties
      }
    />
  );
}

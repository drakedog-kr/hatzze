"use client";

import { useEffect, useRef, useState } from "react";

import { logoSize, logoTicker, stockLogoPath } from "@/lib/stock-logo";

/**
 * 종목 로고. MDD·카더라·배당·내부자가 같이 쓴다.
 *
 * 크기는 CSS 변수 --hz-logo 로 받는다(기본 24px). 자리마다 크기가 다른데 클래스를
 * 여러 벌 만들 이유가 없어서, 쓰는 쪽에서 size 만 넘기면 되게 했다. 모양·마스크·
 * 타일 바탕은 globals.css 의 .hz-stock-logo / .hz-stock-badge 가 맡는다.
 *
 * 그림은 우리 라우트(/api/logo)에서 온다. logo.dev 로 직접 가지 않는 까닭과 캐시 정책은
 * lib/stock-logo.ts 주석에 있다. 같은 출처라 CORS 가 없고, 캔버스로 픽셀도 그냥 읽힌다.
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
 * 못 읽는 경우(투명 배경)는 null 을 돌려 기본 회색 타일에 맡긴다.
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
    // 같은 출처라 캔버스가 오염될 일은 없지만, 못 읽으면 색만 포기하고 로고는 그대로 띄운다.
    return null;
  }
}

/**
 * 어트리뷰션: logo.dev 무료 플랜은 **상업용** 프로젝트에만 링크백을 요구한다.
 * personal project 로 보고 넣지 않기로 했다(2026-07-27 판단). 광고·구독·유료
 * 기능이 붙는 시점에는 다시 봐야 한다.
 */
export function StockLogo({
  code,
  name,
  market,
  size,
  lazy = false,
}: {
  code: string;
  name: string;
  market: string | null;
  size?: number;
  /**
   * 화면 아래쪽에 수십 장이 줄지어 서는 목록(배당 바스켓 96줄·칩 48개)에서만 켠다.
   * 켜면 보이는 자리에 올 때 받는다. 기본은 꺼짐 — 아래 img 주석의 드롭다운 사고 때문에
   * 드롭다운·보유 종목 줄처럼 몇 장 안 되는 자리는 그대로 즉시 받는다.
   */
  lazy?: boolean;
}) {
  // ⚠️ null 이면 "시장을 몰라 요청하지 않는다"는 뜻이다(lib/stock-logo.ts 의 접미사 규칙).
  const ticker = logoTicker(code, market);
  const [failed, setFailed] = useState(false);
  const [tile, setTile] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // 캐시에서 온 이미지는 핸들러가 붙기 전에 로드가 끝나 onLoad 가 아예 안 뜬다.
  // 붙고 나서 한 번 직접 확인한다.
  //
  // ⚠️ **성공만 그런 게 아니라 실패도 그렇다.** 이 img 는 서버에서 그려져 오므로,
  // 404 가 캐시에서 즉시 오면 error 이벤트가 하이드레이션보다 **먼저** 난다. 그러면
  // React 합성 onError 가 그 이벤트를 통째로 놓쳐서 폴백 전이가 시작조차 안 하고,
  // 브라우저 기본 '깨진 이미지' 아이콘이 그대로 남는다. 로고가 아예 없는 종목
  // (지엔씨에너지 119850.KQ 는 logo.dev 에 없다)에서 재방문 때만 나는 레이스였고,
  // 첫 방문은 네트워크가 느려 error 가 하이드레이션 뒤에 떠서 멀쩡했다. 그래서
  // 하드 리프레시로 보면 늘 정상으로 보인다 — 재방문으로 재현할 것. 없는 로고의 404 를
  // 이제 브라우저가 7일 캐시하므로 이 레이스는 전보다 흔하다.
  // 여기서 complete 로 두 경우를 같이 받아 onError 와 같은 전이를 태운다.
  //
  // 이 확인을 인라인 ref 콜백으로 했다가 되돌렸다 — 콜백 신원이 매 렌더마다 바뀌어
  // React 가 detach/attach 를 반복했고, 그때마다 loading="lazy" 의 관찰이 리셋돼서
  // 드롭다운 로고가 **영영 로드되지 않았다**(complete 가 계속 false, onError 도 안 뜸).
  // 안정적인 ref + effect 로 두면 그 churn 이 없다.
  useEffect(() => {
    const node = imgRef.current;
    // complete 는 '로드가 끝났다'만 뜻한다. 성패는 naturalWidth 로 가른다
    // (0 이면 받다 실패한 것이다. 아직 안 끝났으면 complete 가 false 다).
    if (!node?.complete) return;
    if (node.naturalWidth) setTile(readBandColor(node));
    else setFailed(true);
  }, []);

  if (ticker === null || failed) return <InitialBadge code={code} name={name} size={size} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 우리 라우트가 이미 크기·형식을 맞춰 준다. next/image 는 업스트림 404 를 캐시하지 않아 쓰지 않는다(lib/stock-logo.ts)
    <img
      // 레티나에서 안 뭉개도록 표시 크기의 2배를 눈금으로 올림해 받는다.
      src={stockLogoPath(ticker, logoSize(size ?? 24))}
      alt=""
      aria-hidden="true"
      // loading="lazy" 는 기본으로 안 켠다. 드롭다운 안의 이미지가 아예 로드되지 않은 적이
      // 있고(complete 가 계속 false, onError 도 안 뜸 — 실측. 위 effect 주석의 ref 콜백 churn 이
      // 원인이었다), 몇 장짜리 자리는 지연 로드로 얻는 것도 없다. 다만 배당 페이지는 첫
      // 화면에 144장을 한꺼번에 요청해서(2026-09-17 실측), 그런 긴 목록만 `lazy` 로 켠다.
      loading={lazy ? "lazy" : undefined}
      ref={imgRef}
      onLoad={(e) => setTile(readBandColor(e.currentTarget))}
      onError={() => setFailed(true)}
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

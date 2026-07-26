"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Icon } from "./ui";

/**
 * 히어로의 온도 아래에 붙는 공유 버튼.
 *
 * 매일 바뀌는 숫자가 제품의 핵심이라 "오늘 몇 도"를 그대로 퍼갈 수 있어야 한다.
 * page.tsx 는 서버 컴포넌트라 클립보드·navigator.share 를 쓸 수 없어 여기만 클라이언트다.
 *
 * 공유 문구는 **과열도만** 말한다. 이 지수는 시장이 얼마나 뜨거운지를 나타낼 뿐이라
 * 사라/팔라로 읽힐 표현은 넣지 않는다(히어로 하단 면책 문구와 같은 원칙).
 */
export function ShareButtons({ deg, stage, url }: { deg: string; stage: string; url: string }) {
  // 공유창에 뜨는 한 줄. 링크는 따로 붙으므로 문장에는 넣지 않는다.
  const text = `오늘 코스피 과열도는 ${deg}℃ · ${stage} 구간입니다.`;

  // 기기 공유 시트가 있으면 그쪽을 쓴다. 카톡·문자 등 실제로 퍼가는 경로가 거기 다 있고,
  // X 도 그 안에 들어 있어 버튼을 따로 둘 이유가 없다. 없으면(대부분 데스크톱) X 버튼을 둔다.
  //
  // navigator 는 서버에 없다. 그래서 서버 스냅숏은 무조건 false 로 두고(서버가 그린 HTML 과
  // 어긋나면 hydration 불일치가 난다) 클라이언트에서만 실제 값을 읽는다 —
  // useSyncExternalStore 가 그 두 값을 갈라 주는 자리다(effect 에서 setState 하면
  // 첫 렌더가 두 번 도는 데다 lint 규칙에도 걸린다). 값이 바뀔 일은 없으므로 구독은 빈 함수다.
  // 버튼 수는 둘로 고정이라 어느 쪽이 뽑히든 배치는 흔들리지 않는다.
  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false,
  );

  // null = 아직 안 누름, true = 복사됨, false = 실패(권한 없는 브라우저 등).
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // http 로 열었거나(보안 컨텍스트 아님) 권한이 막힌 경우. 조용히 실패하면
      // 눌러도 아무 일이 없는 것처럼 보이므로 상태로 알린다.
      setCopied(false);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ text, url });
    } catch {
      // 사용자가 공유 시트를 닫은 경우도 여기로 온다. 알릴 것이 없다.
    }
  }

  const copyLabel = copied === null ? "링크 복사" : copied ? "복사했습니다" : "복사하지 못했습니다";

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
      <button
        type="button"
        className="hz-share-btn"
        onClick={copyLink}
        data-state={copied === null ? undefined : copied ? "done" : "fail"}
        // 라벨이 바뀌는 버튼이라, 화면을 못 보는 사용자에게도 결과가 전달되게 한다.
        aria-live="polite"
      >
        <Icon name={copied === null ? "link" : copied ? "check" : "error"} style={{ fontSize: 16 }} />
        {copyLabel}
      </button>
      {canNativeShare ? (
        <button type="button" className="hz-share-btn" onClick={nativeShare}>
          <Icon name="ios_share" style={{ fontSize: 16 }} />
          공유하기
        </button>
      ) : (
        <a
          className="hz-share-btn"
          href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {/* X 로고는 Material Symbols 에 없어서 브랜드 마크를 그대로 그린다.
              currentColor 라 버튼 색(호버 포함)을 그대로 따라간다. */}
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          X에 공유
        </a>
      )}
    </div>
  );
}

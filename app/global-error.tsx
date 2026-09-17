"use client";

import Link from "next/link";

/**
 * 루트 레이아웃 자체가 던졌을 때의 화면. `error.tsx` 는 레이아웃 **안쪽**만 감싸므로
 * 레이아웃이 죽으면(쿠키 읽기·폰트 로딩 같은 자리) 그쪽은 못 잡는다. 이 파일이
 * 레이아웃을 통째로 갈아 끼우기 때문에 `<html>`·`<body>` 를 직접 써야 하고, 전역
 * CSS·폰트·테마 쿠키도 못 받는다. 그래서 시스템 서체와 고정 색으로 최소한만 그린다.
 *
 * 실제로 뜰 일은 거의 없다. 있어야 하는 이유는 하나다 — 없으면 그 드문 날에 Next 의
 * 영문 기본 화면이 나간다.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
          background: "#e8f0fa",
          color: "#101013",
        }}
      >
        <main style={{ maxWidth: "68ch", margin: "0 auto", padding: "64px 20px" }}>
          <p style={{ margin: 0, fontSize: "var(--fs-12)", fontWeight: 700, letterSpacing: "0.08em", color: "#6b7684" }}>오류</p>
          <h1 style={{ margin: "8px 0 0", fontSize: "var(--fs-24)", fontWeight: 700, letterSpacing: "-0.01em" }}>
            화면을 그리다 멈췄습니다
          </h1>
          <p style={{ margin: "14px 0 0", fontSize: "var(--fs-14)", lineHeight: 1.85, color: "#4e5968" }}>
            잠시 뒤 다시 시도하면 대개 그대로 열립니다. 계속 그러면 아래 코드를 문의에 적어 보내 주십시오.
          </p>
          {error.digest && (
            <p style={{ margin: "8px 0 0", fontSize: "var(--fs-12)", color: "#6b7684" }}>코드 · {error.digest}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #d5dbe3",
                background: "#fff",
                color: "#1b64da",
                fontSize: "var(--fs-13)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 38,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #d5dbe3",
                background: "#fff",
                color: "#1b64da",
                fontSize: "var(--fs-13)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              시장 브리핑
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";

import { DOC_WIDTH } from "./legal";
import { C, Icon } from "./ui";

/**
 * 페이지 렌더가 던졌을 때의 화면. 루트 레이아웃(사이드바·탑바·푸터)은 살아남고 본문
 * 자리에만 이게 뜬다.
 *
 * 이 파일이 없으면 Next 의 영문 기본 오류 화면이 뜬다(개발 중엔 스택, 배포에선
 * "Application error: a client-side exception has occurred").
 *
 * ⚠️ 여기가 받는 건 **요청마다 그리는 화면**(/mdd · /insider/stock/[ticker])과 클라이언트
 *    렌더의 예외뿐이다. 캐시(ISR)로 도는 화면이 조회 실패로 던지면(lib/load-state.ts 의
 *    assertLoaded) 그 던짐은 오류 경계로 안 오고 서버의 500 응답이 된다 — 그쪽 화면은
 *    pages/500.tsx 다. 사본이 이미 있으면 Next 가 그 사본을 계속 내보내 어느 쪽도 안 뜬다.
 *
 * 오류 경계는 클라이언트 컴포넌트여야 한다(Next 규칙). 그래서 `metadata` 를 못 내고,
 * 셸이 주소로 고른 제목이 위에 그대로 남는다.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 서버 쪽 스택은 Vercel 로그에 digest 로 남는다. 브라우저 콘솔에도 한 줄 남겨 두면
    // 이용자가 제보할 때 digest 를 같이 보낼 수 있다.
    console.error("[hatzze] 화면을 그리다 멈췄습니다", error.digest ?? "", error);
  }, [error]);

  return (
    <div style={{ maxWidth: DOC_WIDTH }}>
      <p style={{ margin: 0, fontSize: "var(--fs-12)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--c-muted)" }}>오류</p>
      <h1 style={{ margin: "8px 0 0", fontSize: "var(--fs-24)", fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
        화면을 그리다 멈췄습니다
      </h1>
      <p style={{ margin: "14px 0 0", fontSize: "var(--fs-14)", lineHeight: 1.85, color: C.sub }}>
        잠시 뒤 다시 시도하면 대개 그대로 열립니다. 계속 그러면 아래 코드를 문의에 적어 보내 주십시오.
      </p>
      {error.digest && (
        <p style={{ margin: "8px 0 0", fontSize: "var(--fs-12)", color: "var(--c-muted)", fontVariantNumeric: "tabular-nums" }}>
          코드 · {error.digest}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
        <button type="button" onClick={reset} className="hz-btn-soft" style={{ padding: "0 14px", cursor: "pointer" }}>
          <Icon name="refresh" style={{ fontSize: "var(--fs-18)" }} />
          다시 시도
        </button>
        <Link href="/" className="hz-btn-soft" style={{ padding: "0 14px" }}>
          <Icon name="home" style={{ fontSize: "var(--fs-18)" }} />
          시장 브리핑
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

import { DOC_WIDTH } from "./legal";
import { C, Icon } from "./ui";

/**
 * 없는 주소가 왔을 때의 화면. 루트 레이아웃(사이드바·탑바·푸터) 안에 그려진다.
 *
 * ## 왜 있어야 하나
 *
 * 이 파일이 없으면 Next 는 영문 기본 화면("404: This page could not be found")을 내고,
 * 페이지가 `notFound()` 를 부른 경우엔 한술 더 떠 **본문이 통째로 빈 흰 화면**이 됐다
 * (2026-09-09 전수조사 · `/stock/000000` · `/daily/2020-01-01`). 종목 코드를 잘못 친 사람이
 * 아무 글자도 없는 화면을 보는 셈이었다.
 *
 * ## 어디에 뜨나
 *
 * - 라우트 자체가 없는 주소(`/nonexistent`). 상태 404.
 * - 페이지가 `notFound()` 를 부른 주소(없는 종목·없는 날짜). 상태 404.
 * - `loading.tsx` 가 감싸는 세그먼트 안에서 `notFound()` 를 부른 주소(`/insider/stock/ZZZZZ`).
 *   이때는 골격이 먼저 200 으로 나가 버려 **상태는 200 이지만** 이 화면이 스트리밍으로
 *   들어오고, Next 가 `<meta name="robots" content="noindex">` 를 같이 넣는다. 예전엔
 *   이 파일이 없어 그 자리에 로딩 골격만 영원히 남았다.
 *
 * ⚠️ 셸의 `PageHeader` 는 주소로 제목을 고르므로, `/insider/…` 아래 없는 주소에서는
 *    위에 "내부자 리포트" 제목이 그대로 남는다. 여기 h1 과 둘이 되는데, 없는 주소의
 *    화면이라 감수한다. 셸을 고쳐 이 화면을 알아보게 하는 건 값에 비해 얻는 게 없다.
 */
export default function NotFound() {
  return (
    <div style={{ maxWidth: DOC_WIDTH }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--c-muted)" }}>404</p>
      <h1 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
        찾을 수 없는 주소입니다
      </h1>
      <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.85, color: C.sub }}>
        주소가 바뀌었거나 잘못 적혔거나, 아직 없는 종목·날짜일 수 있습니다. 아래에서 다시 시작하십시오.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
        <Link href="/" className="hz-btn-soft" style={{ padding: "0 14px" }}>
          <Icon name="home" style={{ fontSize: 18 }} />
          시장 브리핑
        </Link>
        <Link href="/kadera" className="hz-btn-soft" style={{ padding: "0 14px" }}>
          <Icon name="forum" style={{ fontSize: 18 }} />
          국장 카더라
        </Link>
        <Link href="/insider" className="hz-btn-soft" style={{ padding: "0 14px" }}>
          <Icon name="contact_page" style={{ fontSize: 18 }} />
          내부자 리포트
        </Link>
      </div>
    </div>
  );
}

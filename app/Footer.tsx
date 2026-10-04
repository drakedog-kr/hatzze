import Link from "next/link";

import { SLOGAN } from "./brand";
import { DISCLAIMER_HREF } from "./legal";
import { BetaBadge, GhostSymbol, Wordmark } from "./Logo";
import { C } from "./ui";
import { VersionLink } from "./VersionBadge";

/** 문의 창구. 여기 한 곳만 바꾸면 본문 문구와 mailto: 가 같이 따라온다. */
const CONTACT_EMAIL = "hatzze@proton.me";

// 푸터는 **띠 한 줄**이다 — 왼쪽에 로고 · 슬로건, 오른쪽에 문서 링크 셋 · 문의. 목표는 자리를 덜 차지하는 것
// (2026-10-02 요청 "최대한 공간 차지를 안 하게"). 좁으면 두 덩이가 위아래로 갈리고, 각 덩이 안에서도 줄바꿈한다.
// 색은 전부 CSS 변수(C.*)라 라이트/다크가 함께 전환된다.
//
// 2026-10-02 에 걷은 것(요청). 높이 실측: 1440 은 385 → 41px(한 줄) · 375 는 884 → 93px(세 줄).
//   · 세 줄 소개문("국내와 미국 시장을 데이터와 여론으로 읽는 대시보드입니다…") — 슬로건(app/brand.ts SLOGAN) 한 줄로.
//   · 저작권 줄("Copyright © 2026 hatzze.") — 통째로. 연도를 서버가 한국 시각으로 정해 내려보내던 길(layout → AppShell → 여기)도 같이 걷었다.
//   · '바로가기' — 같은 목록이 사이드바와 폰의 햄버거 메뉴에 있다(텔레그램 채널까지). 푸터에만 있던
//     주소(이용약관 · 개인정보처리방침 · 업데이트 기록)는 아래 줄과 버전 표기가 그대로 가리키고, 사이트맵에도 있다.
//   · '데이터 출처' 목록과 면책 문장("투자 조언이나 매수·매도 추천이 아닙니다…") — 투자 유의사항(app/disclaimer/page.tsx)으로
//     모았다. 토스증권처럼 고지는 한 페이지에 두고 모든 화면에서 링크로 닿게 한다.
//   · '한국거래소 통계정보' 문장 — KRX OPEN API 이용약관 제10조 ③ 은 KRX 자료로 만든 '해당 화면에' 이 문구를 적으라고
//     하지만, **운영자가 알고서 화면마다 적지 않기로 했다**(2026-10-02). stockanalysis.com·공공데이터포털의 출처 표기 조건도
//     같은 결정이다 — 이름은 투자 유의사항의 '데이터 출처'에만 있다.
//     ⛔ 다시 넣자고 제안하지 말 것. 이 결정은 위험을 듣고 내린 것이다.

const LINK: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 500 };

/**
 * ⭐ 띠의 글자는 전부 **워드마크의 밑선 하나**에 앉는다. 처음엔 줄 상자 가운데에 세웠더니(alignItems center) 12px 글자가
 *    20px 워드마크보다 2.7px 떠 보였다(2026-10-02 지적 "떠 있는 느낌"). 그래서 띠 · 왼쪽 묶음 · 오른쪽 묶음 셋 다 baseline 이고,
 *    유령(svg)만 alignSelf center 로 빠진다 — svg 의 baseline 은 제 아래 모서리라 baseline 묶음에 들면 혼자 들린다.
 */
export default function Footer() {
  return (
    <footer style={{ marginTop: 48, borderTop: `1px solid var(--c-divider-strong)`, paddingTop: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "10px 24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 14px" }}>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ alignSelf: "center", display: "inline-flex" }}>
              <GhostSymbol size={20} />
            </span>
            {/* 워드마크 + 베타 배지는 한 묶음(배지는 로고 우측 상단이어야 한다 — 버전 옆에 늘어놓으면 버전에 붙은 것처럼
                읽힌다). 묶음의 baseline 은 첫 항목인 워드마크의 것이라 버전이 그 밑선에 맞는다(배지는 alignSelf 로 빠진다).
                버전은 눌러서 업데이트 기록으로 가고, 새 판을 안 본 사람에겐 빨간 N 이 붙는다(app/VersionBadge.tsx). */}
            <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}>
              <Wordmark size={20} />
              <BetaBadge logoSize={20} />
            </span>
            <VersionLink />
          </span>
          <span style={{ fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub }}>{SLOGAN}</span>
        </div>
        {/* 문서 셋은 법정 고지라 서비스 메뉴(사이드바)가 아니라 여기 둔다. 순서는 이용약관이 먼저다 — 서비스 전반을 정하는
            쪽이 앞이고, 처리방침은 그중 개인정보 한 갈래를 떼어 놓은 문서다(약관 10항이 그쪽을 가리킨다). 투자 유의사항은
            약관 3·4·5조를 줄인 안내라 그 뒤. */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 14px" }}>
          <Link href="/terms" className="hz-footer-link" style={LINK}>
            이용약관
          </Link>
          <Link href="/privacy" className="hz-footer-link" style={LINK}>
            개인정보처리방침
          </Link>
          <Link href={DISCLAIMER_HREF} className="hz-footer-link" style={LINK}>
            투자 유의사항
          </Link>
          {/* "문의"와 주소가 줄바꿈으로 갈라지면 라벨만 앞줄 끝에 남아 떠 보인다 — 한 덩어리로 묶는다. */}
          <a href={`mailto:${CONTACT_EMAIL}`} className="hz-footer-link" style={{ ...LINK, fontWeight: 500, whiteSpace: "nowrap" }}>
            문의 {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}

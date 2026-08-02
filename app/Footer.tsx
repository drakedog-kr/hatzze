import Link from "next/link";

import { BetaBadge, GhostSymbol, Wordmark } from "./Logo";
import { C, MONO, R, SH } from "./ui";

/** 푸터 로고 옆에 찍히는 서비스 버전. 베타 오픈(2026-08-03) 기준 1.0.0 에서 시작한다. */
const APP_VERSION = "1.0.0";
/** 문의 창구. 여기 한 곳만 바꾸면 본문 문구와 mailto: 가 같이 따라온다. */
const CONTACT_EMAIL = "hatzze@proton.me";

// SEO를 위해 시맨틱 <footer> + 내부 링크(<nav>) + 키워드가 담긴 사이트 소개글을
// 둔다. 색은 전부 CSS 변수(C.*)라 라이트/다크가 함께 전환된다.

// 실제 fetch 스크립트가 쓰는 소스를 카테고리별로 정리.
//
// ⚠️ "한국거래소 통계정보" 는 KRX OPEN API 이용약관 제10조 ③ 이 글자 그대로 요구하는
// 표기다("결과를 사용하여 화면을 제작한 경우, 해당 화면에 '한국거래소 통계정보'를
// 사용한 결과임을 명시해야 한다"). 다른 줄과 모양을 맞추려고 "한국거래소(KRX)" 로
// 되돌리면 약관이 지정한 문구가 아니게 된다. 푸터는 전 페이지 공통이라 이 한 줄로
// 모든 화면의 명시 의무가 채워진다.
//
// ⚠️ **여기 적은 곳은 전부 실제로 호출해야 하고, 호출하는 곳은 전부 여기 있어야 한다.**
// 출처 표기는 장식이 아니라 고지라, 안 쓰는 곳을 적으면 없는 권위를 빌리는 것이고 쓰는
// 곳을 빠뜨리면 고지를 뺀 것이다. 2026-08-01 대조에서 양쪽이 다 어긋나 있었다 —
// "미 연준(FRED)" 은 env 키만 남고 호출부가 없었고(common/config.py 의 FRED_API_KEY
// 는 아무도 import 하지 않는다. KMA_API_KEY 도 같은 상태), 카더라 리포트 한 페이지를
// 통째로 채우는 텔레그램은 목록에 없었다(이용약관 4항·카더라 페이지는 이미 밝히고 있어
// 푸터만 빠져 있었다).
//
// 대조법: `grep -rhoE 'https?://[a-z0-9.-]+' data-pipeline lib app/api | sort -u` 로 실제
// 호출 호스트를 뽑아 이 목록과 맞춘다. 단 MTProto 를 쓰는 텔레그램 수집(telethon)은 URL
// 이 안 잡히니 라이브러리 이름으로 따로 볼 것. docs.google.com(채널 목록 시트)·
// api.telegram.org(우리 발송 봇)은 우리 설비지 자료 출처가 아니라 여기 안 적는다.
const SOURCE_GROUPS: { label: string; items: string }[] = [
  { label: "증시·시세", items: "한국거래소 통계정보 · 야후 파이낸스" },
  // ECOS 에서 받는 건 GDP(200Y109)·소비자심리지수(511Y002)·외국인 순매수(802Y001) 셋이다.
  // 옛 라벨의 "금리" 는 FRED 를 가리키던 말이라 같이 뗀다 — 금리는 하나도 안 받는다.
  { label: "거시·경제통계", items: "한국은행(ECOS)" },
  { label: "검색·뉴스", items: "네이버 · 유튜브" },
  { label: "커뮤니티·소비", items: "텔레그램 · 디시인사이드 · 알라딘" },
  { label: "가상자산·기타", items: "업비트 · GitHub · 앱스토어" },
];

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="hz-foot-link" style={{ fontSize: 12.5, color: C.sub, textDecoration: "none" }}>
      {children}
    </Link>
  );
}

/** 외부 링크용. next/link 대신 <a> 를 써서 새 탭으로 연다(모양은 FooterLink 와 동일). */
function FooterExternalLink({ href, cta, aria, children }: { href: string; cta: string; aria?: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={aria}
      data-ga="cta_click"
      data-ga-cta={cta}
      data-ga-surface="footer"
      className="hz-foot-link"
      style={{ fontSize: 12.5, color: C.sub, textDecoration: "none" }}
    >
      {children}
    </a>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{children}</span>;
}

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    // 목업의 푸터는 본문과 같은 **흰 카드**다. 예전엔 가로줄 하나로 본문과 갈랐는데,
    // 카드 격자 아래에 줄만 그으면 푸터가 마지막 카드의 꼬리처럼 붙어 보인다.
    <footer
      style={{
        background: C.card,
        borderRadius: R.card,
        padding: "28px 28px 18px",
        boxShadow: SH.card,
        display: "flex",
        flexDirection: "column",
        gap: 26,
        // 섹션 제목 글자 크기(19)만큼 더 띄운다 — main 의 gap 20 에 얹힌다.
        marginTop: 25,
      }}
    >
      {/* 왼쪽 브랜드 묶음 + 오른쪽 두 목록. 목록 둘은 **서로 붙여** 둔다 — 각자 격자 한 칸씩
          차지하면 '바로가기'(항목 4개)가 쓰는 폭보다 훨씬 넓어 가운데가 통째로 빈다
          (2026-08-03). 폭은 내용만큼(auto)이고 사이 간격만 준다. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 64px", justifyContent: "space-between" }}>
        {/* ① 브랜드 + 키워드 소개글 + 문의 */}
        <div style={{ flex: "1 1 320px", maxWidth: 440, display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <GhostSymbol size={26} />
            {/* 워드마크와 버전만 baseline 으로 묶는다 — 둘 다 글자라 밑선이 맞아야 한 줄로
                읽힌다. 유령(svg)까지 같은 묶음에 넣으면 svg 의 baseline 은 제 아래 모서리라
                심볼이 혼자 들려 lockup 이 깨진다. 그래서 바깥은 center 유지. */}
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 9 }}>
              {/* 배지는 로고 우측 상단. 버전과 같은 줄에 늘어놓으면 "hatzze v.1.0.0 베타" 가
                  되어 배지가 로고가 아니라 버전에 붙은 것처럼 읽힌다. */}
              <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 5 }}>
                <Wordmark size={26} />
                <BetaBadge logoSize={26} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.faint, letterSpacing: "0.02em" }}>
                v.{APP_VERSION}
              </span>
            </span>
          </span>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.75, color: C.sub2, textWrap: "pretty" }}>
            <b style={{ fontWeight: 700, color: C.label }}>hatzze(햇쩨)</b>는 코스피 시장의{" "}
            <b style={{ fontWeight: 700, color: C.label }}>과열도</b>를 시장 지표와 감성 지표로 종합해 매일 0~100
            점수로 보여주는 대시보드입니다. 버핏지수, VKOSPI, 레버리지 ETF, 공포·탐욕 심리 등 25개 지표를 한눈에 볼 수
            있습니다.
          </p>
          {/* "문의:" 와 주소가 줄바꿈으로 갈라지면 라벨만 앞줄 끝에 남아 떠 보인다 — 한 덩어리로. */}
          <span style={{ fontSize: 12.5, color: C.sub2, whiteSpace: "nowrap" }}>
            문의 ·{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="hz-foot-link" style={{ color: C.blue, textDecoration: "none" }}>
              {CONTACT_EMAIL}
            </a>
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 48px" }}>
        {/* ② 바로가기 */}
        <nav aria-label="바로가기" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <GroupLabel>바로가기</GroupLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <FooterLink href="/">시장 브리핑</FooterLink>
            <FooterLink href="/kadera">카더라 리포트</FooterLink>
            <FooterLink href="/mdd">MDD 정밀분석</FooterLink>
            {/* 사이드바가 모바일에서 숨겨져 텔레그램 링크가 사라진다 — 푸터에 두어 좁은
                화면에서도 닿게 한다. 라벨·aria 는 AppShell 의 TELEGRAM 상수와 같은 문구다. */}
            <FooterExternalLink href="https://t.me/hatzze69" cta="community" aria="오늘 뭐래? 텔레그램 채널 열기(새 탭)">
              오늘 뭐래?
            </FooterExternalLink>
          </div>
        </nav>

        {/* ③ 데이터 출처 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <GroupLabel>데이터 출처</GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(150px, auto))", gap: "12px 28px" }}>
            {SOURCE_GROUPS.map((g) => (
              <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub2 }}>{g.label}</span>
                <span style={{ fontSize: 11.5, lineHeight: 1.5, color: C.faint }}>{g.items}</span>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>

      {/* 하단 바: 면책 + 법정 고지 + 저작권 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingTop: 14,
          borderTop: `1px solid ${C.divider}`,
        }}
      >
        {/* 한 줄에 들어가게 줄였다. 법적으로 지켜야 할 두 가지(투자 조언이 아니다 ·
            판단과 책임은 이용자에게 있다)는 그대로 남긴다. */}
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: C.faint }}>
          재미·참고용이며 투자 조언이나 매수·매도 추천이 아닙니다. 투자 판단과 책임은 이용자 본인에게 있습니다.
        </p>
        {/* 이용약관·개인정보처리방침은 법정 고지라 '바로가기'(서비스 메뉴)가 아니라 저작권
            옆에 둔다. 순서는 이용약관이 먼저다 — 서비스 전반을 정하는 쪽이 앞이고,
            처리방침은 그중 개인정보 한 갈래를 따로 떼어 놓은 문서다(약관 10항이 그쪽을 가리킨다). */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/terms" className="hz-foot-link" style={{ fontSize: 11.5, color: C.sub2, textDecoration: "none" }}>
            이용약관
          </Link>
          <Link href="/privacy" className="hz-foot-link" style={{ fontSize: 11.5, color: C.sub2, textDecoration: "none" }}>
            개인정보처리방침
          </Link>
          <span style={{ fontSize: 11.5, color: C.hint }}>© {year} hatzze</span>
        </div>
      </div>
    </footer>
  );
}

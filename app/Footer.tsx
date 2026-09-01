import Link from "next/link";
import { TELEGRAM_URL } from "./brand";

import { BetaBadge, GhostSymbol, Wordmark } from "./Logo";
import { APP_VERSION } from "./releases";
import { C, MONO } from "./ui";

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
  /* 서학개미 장부가 통째로 여기서 나온다. 넷 다 출처 표기를 요구하는 원천이라
     화면에 이름이 있어야 한다.
       미 재무부 TIC  — 한국인이 든 미국 주식 잔고·순매수(월별, 1985~)
       한국예탁결제원 — 국내 증권사를 거친 외화증권 결제(일별, 1994~)
       ⚠️ SEC 13F 는 '개인과 기관' 카드를 빼면서 화면에서 안 쓰게 됐다(표는 남아 있다). */
  { label: "해외투자", items: "미 재무부(TIC) · 한국예탁결제원" },
  /* ECOS 에서 받는 건 GDP(200Y109)·소비자심리지수(511Y002)·외국인 순매수(802Y001),
     그리고 자금순환표(281Y002 · 가계 부문 금융자산) 넷이다.
     FRED 는 **원/달러 환율(DEXKOUS)만** 받는다 — 나스닥·S&P 같은 벤더 지수는 안 쓴다
     (그쪽은 FRED 를 거쳐도 벤더 약관을 따른다. lib/seohak-external.ts 머리말 참고). */
  { label: "거시·경제통계", items: "한국은행(ECOS) · 미 연준(FRED)" },
  /* 내부자 리포트가 여기서 나온다. 셋 다 이름을 적어야 하는 원천이다.
       SEC EDGAR — 임원 Form 4 · 월가 거물 13F
       미 하원    — STOCK Act 매매 신고(PTR)
       ⚠️⚠️ stockanalysis.com 은 **약관이 출처 표기를 조건으로** 발췌를 허용한다
            ("do not modify the content and clearly state where you got it from").
            카드 안 문구는 짧게 줄였으니, 이름이 남는 곳은 여기뿐이다 — 지우지 말 것.
            ⚠️ 한때 "stockanalysis.com(S&P Global)" 로 둘을 같이 적었다. 밝혀야 하는 건
               **받아 온 곳**이라 앞의 것만 남긴다 — S&P Global 은 그 위의 집계 주체이지
               우리가 약관을 맺은 상대가 아니고, 그 사실은 카드 물음표가 말한다. */
  { label: "미국 공시·전망", items: "SEC EDGAR · 미 하원 · stockanalysis.com" },
  { label: "검색·뉴스", items: "네이버 · 유튜브" },
  { label: "커뮤니티·소비", items: "텔레그램 · 디시인사이드 · 알라딘" },
  { label: "가상자산·기타", items: "업비트 · GitHub · 앱스토어" },
];

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.sub, textDecoration: "none", padding: "4px 0" }}
    >
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
      style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.sub, textDecoration: "none", padding: "4px 0" }}
    >
      {children}
    </a>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>
      {children}
    </div>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer style={{ marginTop: 56, borderTop: `1px solid ${C.line}`, paddingTop: 36 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "40px 64px", justifyContent: "space-between" }}>
        {/* 브랜드 + 키워드 소개글 */}
        {/* 폭은 **재서 정한 값**이다(1280px 데스크톱 기준, 아래 소개문이 세 줄로 앉는 폭).
            380 일 때 네 줄이었는데 마지막 줄이 "합니다." 두 마디만 남아 허전했다.
              · 396  소개문이 세 줄이 되는 **최소** 폭. 여기 딱 붙이면 문구를 한 글자만
                     고쳐도 도로 네 줄이 된다.
              · 428  첫 줄이 "대시보드입니다."에서 끊기는 **최대** 폭. 이보다 넓으면
                     둘째 문장의 "코스피"가 첫 줄로 딸려 올라와, 마침표로 끝나야 할
                     줄이 다음 문장을 물고 끝난다.
              · 455  오른쪽 묶음(바로가기 + 데이터 출처, 485px)이 아래로 밀려나는 폭.
                     1004 − 64(gap) − 485 = 455.
            그래서 396~428 의 한가운데인 412 로 둔다. 소개문을 고칠 때는 세 줄과 첫 줄의
            마침표가 유지되는지 같이 볼 것 — 문장 길이가 바뀌면 이 두 문턱도 같이 움직인다. */}
        <div style={{ maxWidth: 412 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <GhostSymbol size={26} />
            {/* 워드마크와 버전만 baseline 으로 묶는다 — 둘 다 글자라 밑선이 맞아야 한 줄로
                읽힌다. 유령(svg)까지 같은 baseline 묶음에 넣으면 svg 의 baseline 은 제 아래
                모서리라 심볼이 혼자 들려 lockup 이 깨진다. 그래서 바깥은 center 유지. */}
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 9 }}>
              {/* 워드마크 + 베타 배지를 한 묶음으로 둔다(사이드바·탑바와 같은 gap 5, 윗선 맞춤).
                  배지를 버전과 같은 줄에 그냥 늘어놓으면 "hatzze v.1.0.0 베타" 가 되어 배지가
                  로고가 아니라 버전에 붙은 것처럼 읽힌다 — 배지는 로고 우측 상단이어야 한다.
                  이 묶음의 baseline 은 첫 항목인 워드마크의 것이라, 아래 버전은 그대로
                  워드마크 밑선에 맞는다(배지는 alignSelf 로 baseline 정렬에서 빠진다). */}
              <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 5 }}>
                <Wordmark size={26} />
                <BetaBadge logoSize={26} />
              </span>
              {/* 로고(26px 잉크)와 나란히 두되 크기·색을 확 낮춘다 — 비슷하게 두면
                  "hatzze v.1.0.0" 이 한 덩어리 워드마크처럼 읽힌다.

                  눌러서 업데이트 기록으로 간다. 밑줄을 늘 그어 두면 로고 옆에 줄 하나가
                  더 생겨 lockup 이 지저분해지므로, 호버에서만 긋고 평소엔 색으로만 둔다.
                  title 을 붙이는 이유는 이 글자만으로는 눌리는 것인지 모르기 때문이다. */}
              {/* ⚠️ 색과 밑줄은 인라인에 두지 않는다 — 인라인 style 은 globals.css 의
                  :hover 를 이겨서 호버가 통째로 안 먹는다(같은 함정을 '더 보기' 버튼과
                  MDD 기간 버튼에서 이미 밟았다). 글자꼴만 여기 두고 나머지는 클래스로. */}
              <Link
                href="/changelog"
                title="업데이트 기록 보기"
                className="hz-version-link"
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.02em" }}
              >
                v.{APP_VERSION}
              </Link>
            </span>
          </span>
          {/* ⚠️ `keep-all` 이 없으면 한글이 **낱말 한가운데서** 끊긴다(CJK 기본값이 그렇다).
              실제로 "코스피"가 코스/피 로, "개에서"가 개/에서 로 갈려 있었다. 폭만 넓혀서는
              못 고친다 — 폭을 바꾸면 끊기는 낱말만 바뀐다. 레포의 다른 한글 문단들과 같은
              처방이다(app/globals.css 의 .hz-news-text, app/page.tsx 의 지표 카드 제목·설명). */}
          <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.75, color: C.sub, wordBreak: "keep-all" }}>
            {/* ⚠️ 소개문은 **화면 다섯 개 전부**를 담아야 한다. 예전 문장은 "코스피 시장의
                과열도를 … 25개 지표를 한눈에"라 시장 브리핑 하나만 말했고, 그동안 카더라가
                국장·미장 둘로 갈리고 MDD·서학개미·내부자가 붙어 다섯 중 하나만 설명하는
                글이 됐다. 범위도 틀렸다 — 다섯 중 셋이 미국이라 "코스피 시장의"는 거짓이다.
                예시 지표를 버핏지수·VKOSPI 에서 바꾼 것도 같은 이유다. 그 둘은 어느
                사이트에나 있어서, 25개를 대표시키면 우리가 남과 뭐가 다른지가 안 보인다.
                ⛔ 옆 칸의 '바로가기'가 이미 페이지 목록이라 여기서 화면 이름을 다시 부르지
                   않는다. 재료(지표·이야기·기록) 쪽으로 적어야 두 칸이 안 겹친다. */}
            <b style={{ color: C.ink }}>hatzze(햇쩨)</b>는 국내와 미국 시장을 데이터와 여론으로 읽는
            대시보드입니다. 코스피 상승 속도·고점권 외국인 매도 등 25개 지표로 잰{" "}
            <b style={{ color: C.ink }}>과열도</b>, 주식 텔레그램 수백 개에서 오간 이야기,
            공시와 통계에 남은 기록을 매일 새로 정리합니다.
          </p>
          {/* 문의는 소개글과 한 줄 띄워 따로 앉힌다 — 소개 문장에 이어 붙이면 25개 지표
              얘기의 꼬리처럼 읽혀서, 연락처라는 게 눈에 안 들어온다. */}
          <p style={{ margin: "1em 0 0", fontSize: 13, lineHeight: 1.75, color: C.sub }}>
            {/* "문의:" 와 주소가 줄바꿈으로 갈라지면 라벨만 앞줄 끝에 남아 떠 보인다 — 한 덩어리로 묶는다. */}
            <span style={{ whiteSpace: "nowrap" }}>
              <b style={{ color: C.ink }}>문의</b>: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: C.sub, textDecoration: "none" }}>{CONTACT_EMAIL}</a>
            </span>
          </p>
        </div>

        {/* 우측 그룹: 내부 링크 + 데이터 출처 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 48px" }}>
          <nav aria-label="바로가기">
            <GroupLabel>바로가기</GroupLabel>
            <FooterLink href="/">시장 브리핑</FooterLink>
            {/* 카더라는 국장·미장 둘로 갈린다. 여기서는 구역 이름("카더라 리포트")이
                아니라 **갈 수 있는 페이지**를 적는다 — 푸터는 목적지 목록이라, 구역
                이름 하나만 두면 미장으로 가는 길이 푸터에서만 사라진다. 순서는
                사이드바(AppShell 의 NAV)와 같게 둔다. */}
            <FooterLink href="/kadera">국장 카더라</FooterLink>
            <FooterLink href="/kadera/us">미장 카더라</FooterLink>
            {/* ⚠️ 이 줄이 빠져 있었다. 화면을 여는 날(2026-08-26)에야 드러났는데, 예고
                시절엔 '준비 중'이라 없는 게 맞았고 그 뒤로 아무도 다시 안 봤다.
                ⭐ **여는 순간 고칠 곳이 NAV 의 badge 한 줄만은 아니다** — 푸터의 이
                목록도 사이드바를 그대로 따라야 한다(바로 위 주석의 규칙). */}
            <FooterLink href="/insider">내부자 리포트</FooterLink>
            <FooterLink href="/mdd">MDD 정밀분석</FooterLink>
            <FooterLink href="/seohak">서학개미 장부</FooterLink>
            {/* 사이드바가 모바일에서 숨겨져 텔레그램 링크가 사라진다 — 내부 내비게이션과
                같은 방식으로 푸터에 두어 좁은 화면에서도 닿게 한다. 라벨과 aria 는
                AppShell 의 TELEGRAM 상수와 같은 문구로 맞춘다(두 내비게이션이 같은
                항목이라 문구가 갈리면 다른 곳으로 가는 링크처럼 보인다). */}
            <FooterExternalLink href={TELEGRAM_URL} cta="community" aria="오늘 뭐래? 텔레그램 채널 열기(새 탭)">
              오늘 뭐래?
            </FooterExternalLink>
          </nav>
          <div>
            <GroupLabel>데이터 출처</GroupLabel>
            {/* ⚠️⚠️ 조판을 인라인이 아니라 **클래스**로 둔다. 칸 최소 140 × 2 + gap 32 = 312 를
                요구하는데 320px 화면에서 쓸 수 있는 폭은 278 이라 24 가 넘쳤고, 본문이
                overflow-x:hidden 이라 **가로 스크롤도 없이 그냥 잘렸다**(2026-08-25 실측).
                인라인 style 은 미디어쿼리가 못 이기므로 좁은 폭에서 한 칸으로 접으려면
                여기 있으면 안 된다(globals.css 의 .hz-foot-sources). */}
            <div className="hz-foot-sources">
              {SOURCE_GROUPS.map((g) => (
                <div key={g.label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{g.label}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: C.sub }}>{g.items}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 하단 바: 면책 + 저작권 */}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 20px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: 11, color: "var(--c-muted)" }}>
          이 서비스는 재미와 참고를 위한 정보 제공 목적이며, 투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과 책임은 이용자 본인에게 있습니다.
        </p>
        {/* 이용약관·개인정보처리방침은 법정 고지라 '바로가기'(서비스 메뉴)가 아니라 저작권
            옆에 둔다. 좁은 화면에서 두 줄로 갈리더라도 한 덩어리로 붙어 있게 감싼다.
            순서는 이용약관이 먼저다 — 서비스 전반을 정하는 쪽이 앞이고, 처리방침은 그중
            개인정보 한 갈래를 따로 떼어 놓은 문서다(약관 10항이 그쪽을 가리킨다). */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/terms" style={{ fontSize: 11, fontWeight: 600, color: C.sub, textDecoration: "none" }}>
            이용약관
          </Link>
          <Link href="/privacy" style={{ fontSize: 11, fontWeight: 600, color: C.sub, textDecoration: "none" }}>
            개인정보처리방침
          </Link>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "var(--c-muted)" }}>Copyright © {year} hatzze.</p>
        </div>
      </div>
    </footer>
  );
}

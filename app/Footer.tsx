import Link from "next/link";

import { SOURCES_HREF } from "./legal";
import { BetaBadge, GhostSymbol, Wordmark } from "./Logo";
import { C } from "./ui";
import { VersionLink } from "./VersionBadge";

/** 문의 창구. 여기 한 곳만 바꾸면 본문 문구와 mailto: 가 같이 따라온다. */
const CONTACT_EMAIL = "hatzze@proton.me";

// 푸터에는 소개 · 문의 · 법정 고지만 둔다. 색은 전부 CSS 변수(C.*)라 라이트/다크가 함께 전환된다.
//
// 2026-10-02 에 '바로가기'와 '데이터 출처' 두 칸을 걷었다(요청).
//   · 바로가기 — 같은 목록이 사이드바와 폰의 햄버거 메뉴에 있다(텔레그램 채널까지). 푸터에만 있던
//     주소(이용약관 · 개인정보처리방침 · 업데이트 기록)는 아래 줄과 버전 표기가 그대로 가리킨다.
//     검색엔진도 이 셋을 사이트맵으로 찾는다.
//   · 데이터 출처 — 목록째 이용약관 끝의 '데이터 출처'로 옮겼다(app/terms/page.tsx 의 SOURCE_GROUPS).
//     ⚠️ 단 **'한국거래소 통계정보' 한 마디는 여기 남는다.** KRX OPEN API 이용약관 제10조 ③ 이 "결과를
//     사용하여 화면을 제작한 경우, **해당 화면에** '한국거래소 통계정보'를 사용한 결과임을 명시"하라고
//     글자 그대로 요구한다. 약관 페이지 한 곳에만 적으면 다른 화면이 그 명시를 잃는다. 푸터는 전 화면
//     공통이라 이 한 문장으로 모든 화면의 의무가 채워진다 — 지우지 말 것. 글자도 바꾸지 말 것.

/**
 * @param year 저작권 연도. **서버가 한국 시각으로 정해** 넘긴다(app/layout.tsx → AppShell).
 *   예전엔 여기서 `new Date().getFullYear()` 를 불렀는데, 푸터는 서버(UTC)에서 한 번·브라우저(KST)에서 또 한 번
 *   그려져 해마다 1월 1일 00:00~09:00 KST 에는 서버 HTML 의 2026 과 브라우저의 2027 이 갈렸다 — 모든 화면이
 *   하이드레이션 불일치(React #418)로 셸을 통째로 다시 그렸다. 받은 값을 그대로 쓰면 두 쪽이 같다.
 */
export default function Footer({ year }: { year: number }) {
  return (
    /* 2026-09-04 리디자인: 위 여백 64 · 윗선 아래 40. 토스 푸터의 어법은 '조용한 회색 글 +
       넉넉한 여백'이라 크기·색은 그대로 두고 간격과 굵기만 손봤다. */
    <footer style={{ marginTop: 64, borderTop: `1px solid var(--c-divider-strong)`, paddingTop: 40 }}>
      {/* 브랜드 + 소개글 */}
      {/* 폭은 **재서 정한 값**이다(1280px 데스크톱 기준, 아래 소개문이 세 줄로 앉는 폭).
          380 일 때 네 줄이었는데 마지막 줄이 "합니다." 두 마디만 남아 허전했다.
            · 396  소개문이 세 줄이 되는 **최소** 폭. 여기 딱 붙이면 문구를 한 글자만
                   고쳐도 도로 네 줄이 된다.
            · 428  첫 줄이 "대시보드입니다."에서 끊기는 **최대** 폭. 이보다 넓으면
                   둘째 문장의 "코스피"가 첫 줄로 딸려 올라와, 마침표로 끝나야 할
                   줄이 다음 문장을 물고 끝난다.
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
                title 을 붙이는 이유는 이 글자만으로는 눌리는 것인지 모르기 때문이다.

                ⭐ 새 판이 나왔는데 아직 안 본 사람에게는 이 표기 우측 상단에 빨간 N 이
                붙는다. 그 판정은 방문자마다 다르고(localStorage) 서버는 모르는 값이라
                링크째 클라이언트 컴포넌트로 나가 있다 — app/VersionBadge.tsx.
                ⚠️ 배지가 붙어도 이 줄의 자리는 안 밀린다(배지는 글자 상자 위로 올라탄다).
                   여기서 세로 정렬을 baseline 으로 두는 것도 그대로여야 한다 — 위 묶음의
                   밑선은 첫 항목인 이 링크의 것이라, 링크를 flex 로 바꾼 뒤에도 워드마크와
                   같은 줄에 앉는다(워드마크+베타 묶음이 쓰는 성질과 같다). */}
            <VersionLink />
          </span>
        </span>
        {/* ⚠️ `keep-all` 이 없으면 한글이 **낱말 한가운데서** 끊긴다(CJK 기본값이 그렇다).
            실제로 "코스피"가 코스/피 로, "개에서"가 개/에서 로 갈려 있었다. 폭만 넓혀서는
            못 고친다 — 폭을 바꾸면 끊기는 낱말만 바뀐다. 레포의 다른 한글 문단들과 같은
            처방이다(app/globals.css 의 .hz-news-text, app/page.tsx 의 지표 카드 제목·설명). */}
        <p style={{ margin: "16px 0 0", fontSize: "var(--fs-13)", lineHeight: 1.8, color: C.sub, wordBreak: "keep-all" }}>
          {/* ⚠️ 소개문은 **화면 다섯 개 전부**를 담아야 한다. 예전 문장은 "코스피 시장의
              과열도를 … 25개 지표를 한눈에"라 시장 브리핑 하나만 말했고, 그동안 카더라가
              국장·미장 둘로 갈리고 MDD·서학개미·내부자가 붙어 다섯 중 하나만 설명하는
              글이 됐다. 범위도 틀렸다 — 다섯 중 셋이 미국이라 "코스피 시장의"는 거짓이다.
              예시 지표를 버핏지수·VKOSPI 에서 바꾼 것도 같은 이유다. 그 둘은 어느
              사이트에나 있어서, 25개를 대표시키면 우리가 남과 뭐가 다른지가 안 보인다.
              ⛔ 화면 이름은 사이드바가 부르므로 여기서 다시 부르지 않는다. 재료(지표·이야기·기록)
                 쪽으로 적는다. */}
          <b style={{ color: C.ink }}>hatzze(햇쩨)</b>는 국내와 미국 시장을 데이터와 여론으로 읽는
          대시보드입니다. 코스피 상승 속도·고점권 외국인 매도 등 25개 지표로 잰{" "}
          <b style={{ color: C.ink }}>과열도</b>, 주식 텔레그램 수백 개에서 오간 이야기,
          공시와 통계에 남은 기록을 매일 새로 정리합니다.
        </p>
        {/* 문의는 소개글과 한 줄 띄워 따로 앉힌다 — 소개 문장에 이어 붙이면 25개 지표
            얘기의 꼬리처럼 읽혀서, 연락처라는 게 눈에 안 들어온다. */}
        <p style={{ margin: "1em 0 0", fontSize: "var(--fs-13)", lineHeight: 1.8, color: C.sub }}>
          {/* "문의:" 와 주소가 줄바꿈으로 갈라지면 라벨만 앞줄 끝에 남아 떠 보인다 — 한 덩어리로 묶는다. */}
          <span style={{ whiteSpace: "nowrap" }}>
            <b style={{ color: C.ink }}>문의</b>: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: C.sub, textDecoration: "none" }}>{CONTACT_EMAIL}</a>
          </span>
        </p>
      </div>

      {/* 하단 바: 면책 + 출처 + 저작권 */}
      {/* 윗선 하나로 본문과 갈라 둔다 — 토스 푸터의 맨 아랫줄(회사 정보·저작권)이 그 꼴이다.
          면책 문장은 법률 고지라 글자를 키우지 않고(12) 색만 유지한다. */}
      <div
        style={{
          marginTop: 36,
          paddingTop: 18,
          borderTop: "1px solid var(--c-divider)",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 20px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: "var(--fs-12)", lineHeight: 1.6, color: "var(--c-muted)" }}>
          <p style={{ margin: 0 }}>
            이 서비스는 재미와 참고를 위한 정보 제공 목적이며, 투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과 책임은 이용자 본인에게 있습니다.
          </p>
          {/* ⚠️ '한국거래소 통계정보'는 KRX 약관이 지정한 글자다(위 머리 주석). 나머지 출처는 이용약관 끝에 모았다. */}
          <p style={{ margin: 0 }}>
            시세와 통계 일부는 한국거래소 통계정보를 사용한 결과입니다. 자료 출처는{" "}
            <Link href={SOURCES_HREF} className="hz-footer-link" style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
              데이터 출처
            </Link>
            에 모아 두었습니다.
          </p>
        </div>
        {/* 이용약관·개인정보처리방침은 법정 고지라 저작권 옆에 둔다. 좁은 화면에서 두 줄로
            갈리더라도 한 덩어리로 붙어 있게 감싼다.
            순서는 이용약관이 먼저다 — 서비스 전반을 정하는 쪽이 앞이고, 처리방침은 그중
            개인정보 한 갈래를 따로 떼어 놓은 문서다(약관 10항이 그쪽을 가리킨다). */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/terms" className="hz-footer-link" style={{ fontSize: "var(--fs-12)", fontWeight: 600 }}>
            이용약관
          </Link>
          <Link href="/privacy" className="hz-footer-link" style={{ fontSize: "var(--fs-12)", fontWeight: 600 }}>
            개인정보처리방침
          </Link>
          <p style={{ margin: 0, fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--c-muted)" }}>Copyright © {year} hatzze.</p>
        </div>
      </div>
    </footer>
  );
}

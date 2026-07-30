"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { DailyScore } from "@/lib/data";
import { track } from "@/lib/ga";
import { C, Icon, MONO, stageForScore } from "./ui";
import { LogoLockup } from "./Logo";
import Footer from "./Footer";
import GaEvents from "./GaEvents";

const NAV = [
  { href: "/", label: "시장 브리핑", icon: "monitoring" },
  { href: "/kadera", label: "카더라 리포트", icon: "forum" },
  { href: "/mdd", label: "MDD 정밀분석", icon: "trending_down" },
];

// 외부(텔레그램) 링크라 NAV 배열이 아니라 따로 둔다 — pathname 기반 active 판정 대상이
// 아니고, 새 탭으로 열려야 해서 next/link 가 아닌 <a> 를 쓴다. 사이드바와 모바일 탭바가
// 같은 값을 참조해야 두 내비게이션의 항목이 어긋나지 않는다.
//
// 라벨이 "커뮤니티 합류"가 아닌 이유: 채널이 파는 건 공간이 아니라 "오늘 장에서 무슨
// 말이 오갔나"라서, 들어가는 행위가 아니라 받는 내용을 이름으로 삼는다. 지수·브리핑
// 계열 이름은 전부 피했다 — 사이트에 이미 있는 것들이라 같은 메뉴가 둘로 보인다.
//
// aria-label 은 라벨과 따로 둔다. "오늘 뭐래?"만 읽히면 스크린리더 사용자는 이게 외부
// 텔레그램으로 나가는 링크라는 걸 알 수 없다.
const TELEGRAM = {
  href: "https://t.me/hatzze69",
  label: "오늘 뭐래?",
  aria: "오늘 뭐래? 텔레그램 채널 열기(새 탭)",
  icon: "send",
};

// 아직 페이지가 없는 예고 항목. NAV 에 넣지 않는 이유가 둘이다.
//  1. NAV 항목은 전부 <Link> 로 렌더되고 pathname 기반 active 판정을 받는다 — 갈 곳이
//     없는 항목이 그 배열에 섞이면 "링크인데 href 가 가짜"인 상태를 만들어야 한다.
//  2. NAV 는 모바일 하단 탭바와 공유한다. 탭바는 한 줄에 항목을 나눠 갖는 구조라
//     (지금 4개) 5번째가 들어가면 나머지 라벨이 눌린다. 게다가 탭바가 나오는 폭은
//     터치 화면이라 hover 가 없어 툴팁이 뜨지 않는다 — 눌러도 아무 일도 일어나지 않는
//     칸만 남는다. 그래서 사이드바에만 둔다. 페이지가 생기면 NAV 로 옮긴다.
const COMING_SOON = {
  label: "서학개미 해부도",
  badge: "준비 중",
  tip: "현재 오픈 준비 중입니다",
};

/**
 * 서학개미 아이콘. Material Symbols 에 개미가 없어서 직접 그렸다.
 *
 * 폰트를 먼저 뒤졌다: ant · insects · termite · bug 는 글리프 자체가 없어서 리거처가
 * 안 잡히고 "ANT" 같은 대문자 텍스트로 찍힌다. 실제로 있는 벌레는 pest_control 과
 * bug_report 둘뿐인데, 둘 다 몸통이 한 덩어리인 딱정벌레라 개미로 안 읽힌다.
 *
 * 어법은 브랜드 유령(Logo.tsx 의 GhostSymbol)을 따랐다 — 외곽선이 아니라 통으로 채운
 * 덩어리에 눈을 파낸다. 해부학적으로 정확한 개미(머리·가슴·배 3마디 + 다리 6개)를
 * 외곽선으로 그려도 봤는데, 이 아이콘이 실제로 쓰이는 16px 에서는 다리가 뭉개져
 * 그냥 얼룩이 된다. 덩어리는 작아져도 형태가 남는다.
 *
 * 눈은 흰 원이 아니라 fillRule="evenodd" 로 뚫은 구멍이다. 흰색으로 칠하면 다크모드
 * 카드(어두운 배경) 위에서 흰 점이 떠 버린다. 구멍이라야 배경을 안 가린다.
 *
 * 좌표는 Hun 이 준 시안을 1200px 기준으로 재서 24 박스로 옮긴 값이다(배율 0.0505).
 * 그래서 눈 지름 대 몸통 높이(32%), 더듬이 굵기(1.52) 같은 비율이 시안 그대로다.
 * 별도 transform 없이 그림이 이미 박스에 맞다 — bbox 는 x 3.8~20.0, y 1.6~22.5 다.
 *
 * 더듬이 두 가닥은 몸통 '안'(y 12.5·12.2)에서 끝난다. 몸통 테두리에 딱 맞춰 끝내면
 * 둥근 캡이 실루엣 위로 튀어나와 이음매에 혹 두 개가 생긴다. 채움 안쪽으로 밀어 넣으면
 * 캡이 덮여서 시안처럼 한 덩어리로 이어진다. 몸통 오른쪽 위 모서리(19.73)는 더듬이
 * 바깥선(18.97 + 굵기 절반 0.76)과 같은 값이라 둘이 단차 없이 만난다.
 */
function AntIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.52}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* 몸통 + 눈구멍(한 path 에 evenodd) */}
      <path
        fill="currentColor"
        stroke="none"
        fillRule="evenodd"
        d="M19.73 10.4 C19.9 12 19.98 13.5 19.98 15 C19.98 19.2 16.3 22.46 11.9 22.46 C7.5 22.46 3.82 19.2 3.82 15.6 C3.82 12.2 7 9.84 11.2 9.84 C14.6 9.84 18.2 9.9 19.73 10.4 Z M10.03 13.52 a2.02 2.02 0 1 0 4.04 0 a2.02 2.02 0 1 0 -4.04 0 Z"
      />
      {/* 뒤로 쓸리는 더듬이 두 가닥 */}
      <path d="M5.64 2.41 C9.8 1.55 14.8 2 17.2 4.3 C18.5 5.55 18.97 7.4 18.97 12.5" />
      <path d="M6.09 5.14 C9.8 4.4 14 4.8 16 6.6 C16.9 7.4 17.15 8.6 17.15 12.2" />
    </svg>
  );
}

/**
 * 마우스가 닿은(또는 손가락이 닿은·포커스가 온) 링크만 **전체 프리페치**로 올린다.
 *
 * Next 의 기본값은 동적 라우트에서 "가장 가까운 loading 경계까지"만 미리 받는다.
 * /kadera 는 데이터 가지가 12개라 클릭 시점에야 시작되는 서버 왕복이 0.7~1.5초다
 * (프로덕션 실측). prefetch 를 켜면 그 왕복이 클릭 **전에** 끝나 있어 즉시 열린다.
 *
 * 그런데 `prefetch` 를 항상 켜면 **카더라를 누를 생각이 없는 방문자까지 전원이**
 * 5분마다 /kadera 풀 렌더(왕복 60회)를 서버에 시킨다. Supabase 지연이 이미 불안정하고
 * 부하에 민감한 걸 확인한 터라, 사이트 전체를 느리게 만들 수 있는 거래다.
 * 그래서 **의도를 보인 사람만 비용을 낸다** — 커서가 링크에 닿는 순간 시작한다.
 *
 * 한번 켜면 끄지 않는다(목록에 쌓아 둔다). 마우스가 들락날락할 때마다 프리페치가
 * 껐다 켜지면 그게 더 낭비다.
 *
 * prefetch 는 **프로덕션 빌드에서만 동작한다** — `npm run dev` 로는 확인할 수 없고
 * `npm run build:local` + `start:local`(hatzze-prod) 로 봐야 한다.
 */
function useIntentPrefetch() {
  const [armed, setArmed] = useState<string[]>([]);
  const arm = (href: string) => setArmed((a) => (a.includes(href) ? a : [...a, href]));
  return (href: string) => ({
    // undefined = Next 기본값 유지(경계까지 부분 프리페치). true = 데이터까지 전부.
    prefetch: armed.includes(href) ? true : undefined,
    onMouseEnter: () => arm(href),
    onFocus: () => arm(href),
    onTouchStart: () => arm(href),
  });
}

/** NAV 항목의 현재 페이지 판정. 사이드바와 모바일 탭바가 같은 규칙을 써야 한다. */
function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const STAGE_COLOR: Record<string, string> = {
  저온: C.cold,
  상온: C.neutral,
  고온: C.hot,
  초고온: C.mania,
};

// 탑바 시세 티커. 햇쩨 지수는 서버에서 받은 일간 점수를 쓰고, 나머지 종목/지수/
// 환율은 5분 시세 소스를 붙이기 전까지 자리표시(—)로 둔다.
type Quote = { label: string; value: string; change: number | null; color?: string };

function Sidebar() {
  const intentPrefetch = useIntentPrefetch();
  const pathname = usePathname();
  // 로고를 감싸는 태그는 홈에서만 h1이다. 사이드바는 모든 페이지가 공유하는데,
  // 검색엔진은 h1을 그 페이지의 주제로 읽는다. 늘 h1이면 카더라·MDD가 자기 제목이
  // 아니라 "로고"를 주제로 선언하는 셈이고, 자기 h1이 있는 페이지는 h1이 둘이 된다.
  // 홈은 페이지 대표 제목이 따로 없고 사이트 자체가 주제라 로고가 h1인 게 맞다.
  // div로 바뀌어도 보이는 건 그대로다. globals.css에 h1~h6 규칙이 없고 Tailwind
  // preflight가 font-size·font-weight를 inherit으로 되돌려서, 태그 기본값 중 남는 게 없다.
  const LogoTag = pathname === "/" ? "h1" : "div";
  return (
    <aside
      className="hz-sidebar"
      style={{ width: 210, flexShrink: 0, background: C.card, borderRight: `1px solid ${C.line}`, padding: "32px 0" }}
    >
      <div style={{ padding: "0 32px", marginBottom: 48 }}>
        {/* 베타 배지는 로고 우측 상단에 붙인다 — 서비스 전체가 베타라는 표시라서,
            페이지마다(예전엔 카더라 제목 옆) 다는 것보다 여기 한 곳이 맞다.
            alignItems:flex-start 로 로고 윗선에 맞춰 위첨자처럼 올린다. */}
        <LogoTag style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 5 }}>
          {/* 로고는 메인(시장 브리핑)으로 가는 링크 — 어느 페이지에서든 홈으로 돌아올 수 있게. */}
          <Link href="/" aria-label="hatzze 홈" className="hz-logo-link" style={{ display: "inline-flex" }}>
            <LogoLockup symbolSize={29} wordmarkSize={30} gap={7} />
          </Link>
          <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 700, color: C.blue, background: "var(--c-blue-tint)", padding: "3px 8px", borderRadius: 999 }}>
            베타
          </span>
        </LogoTag>
        <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: "0.02em", lineHeight: 1.5 }}>
          데이터와 감성으로 읽는 시장
        </p>
      </div>
      <nav style={{ flex: 1, padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {NAV.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              {...intentPrefetch(item.href)}
              className={`hz-nav-item${active ? " hz-nav-active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 20px",
                color: active ? C.blue : C.sub,
                fontWeight: active ? 700 : 600,
                // 비활성일 때 background 를 인라인으로 두면(예전 "transparent") 인라인이
                // 우선순위에서 이겨 .hz-nav-item:hover 회색 배경이 먹히지 않는다. 값을 아예
                // 빼서 호버는 CSS 가 담당하게 한다.
                background: active ? "var(--c-blue-tint)" : undefined,
                borderRadius: 14,
                textDecoration: "none",
              }}
            >
              <Icon name={item.icon} />
              <span style={{ fontSize: 15 }}>{item.label}</span>
            </Link>
          );
        })}
        {/* 예고 항목. <a href> 가 아니라 <div> 인 게 "못 누른다"의 유일한 보장이다 —
            href 만 뺀 <a> 는 클릭은 안 먹어도 브라우저·확장 프로그램에 따라 링크로
            취급되는 변형이 남는다. div 는 포커스 순서에도 안 들어간다.

            hz-nav-item 을 안 붙인다. 그 클래스가 주는 cursor:pointer 와 회색 호버 배경은
            둘 다 "눌리는 요소"라는 신호라, 못 누르는 항목에 붙이면 거짓말이 된다.
            hz-tip 의 cursor:default 를 그대로 받아 평범한 화살표로 둔다.

            색은 C.sub(다른 항목) 보다 한 단 흐린 C.faint 로. 호버해 보기 전에도
            "지금은 아닌 것"이 보여야 한다. */}
        <div
          className="hz-tip"
          data-tip={COMING_SOON.tip}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            color: C.faint,
            fontWeight: 600,
            borderRadius: 14,
          }}
        >
          <AntIcon />
          {/* 배지는 라벨 '우측 상단'에 위첨자로 띄운다. 로고 옆 베타 배지처럼 flex 로
              나란히 두면 이 사이드바에서는 안 된다 — 210px 폭에서 아이콘(20)+간격(12)+
              라벨(92.9)까지 쓰고 남는 자리가 12px 인데 배지가 34.6px 라, 실측에서 배지가
              항목 밖으로 21px 삐져나와 사이드바 오른쪽 테두리에 붙었다(scrollWidth 178 >
              clientWidth 177). absolute 로 띄우면 배지가 행 폭 계산에서 빠져 라벨이
              눌리지도, 항목이 넘치지도 않는다. 라벨 길이가 바뀌어도 따라 붙는다. */}
          <span style={{ position: "relative", display: "inline-flex" }}>
            <span style={{ fontSize: 15, whiteSpace: "nowrap" }}>{COMING_SOON.label}</span>
            <span
              style={{
                position: "absolute",
                left: "100%",
                top: -4,
                marginLeft: 2,
                fontSize: 8,
                fontWeight: 700,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                color: C.faint,
                background: "var(--c-hover)",
                border: `1px solid ${C.line}`,
                padding: "1px 4px",
                borderRadius: 999,
              }}
            >
              {COMING_SOON.badge}
            </span>
          </span>
        </div>
        {/* 라벨은 바뀌었어도 data-ga-cta 는 "community" 그대로 둔다 — 값을 같이 바꾸면
            이름 변경 전후의 클릭수를 한 줄로 비교할 수 없다. 탭바·푸터도 같은 값이다. */}
        <a
          href={TELEGRAM.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={TELEGRAM.aria}
          className="hz-nav-item"
          data-ga="cta_click"
          data-ga-cta="community"
          data-ga-surface="sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            color: C.sub,
            fontWeight: 600,
            borderRadius: 14,
            textDecoration: "none",
          }}
        >
          <Icon name={TELEGRAM.icon} />
          <span style={{ fontSize: 15 }}>{TELEGRAM.label}</span>
        </a>
      </nav>
    </aside>
  );
}

// 모바일 메뉴(햄버거). 예전엔 하단 탭바였는데 탑바 오른쪽으로 올렸다.
//
// 탭바를 접은 이유는 그때 적어 둔 근거가 뒤집혔기 때문이다. "항목이 4개뿐이라 한 줄에
// 다 들어간다"가 전제였는데, 서학개미 해부도가 붙어 5개가 되면서 칸마다 라벨이 눌린다.
// 게다가 예고 항목은 탭 칸에 두면 눌러도 아무 일이 없어 고장으로 보인다 — 탭바가 뜨는
// 폭은 터치라 hover 가 없어서 "준비 중" 툴팁이 안 뜬다. 세로 목록은 배지를 그 자리에
// 늘 띄워 두므로 눌러 보기 전에 이유가 보인다.
//
// 열려 있는 동안에만 DOM 에 올린다. 데스크톱에서는 여는 버튼 자체가 없지만, 열어 둔
// 채로 창을 넓히는 경우가 있어 패널·백드롭의 display 는 미디어쿼리가 최종적으로 막는다.
function MobileMenu({ onClose }: { onClose: () => void }) {
  const intentPrefetch = useIntentPrefetch();
  const pathname = usePathname();

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 14px",
    borderRadius: 12,
    color: active ? C.blue : C.sub,
    fontWeight: active ? 700 : 600,
    // 사이드바와 같은 이유로 비활성 background 는 인라인에서 뺀다 — 값을 두면
    // .hz-nav-item:hover 를 인라인이 이겨버린다.
    background: active ? "var(--c-blue-tint)" : undefined,
    textDecoration: "none",
  });

  return (
    <>
      <div className="hz-menu-backdrop" onClick={onClose} />
      <nav className="hz-menu-panel" id="hz-mobile-menu" aria-label="주요 메뉴">
        {NAV.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              {...intentPrefetch(item.href)}
              className={`hz-nav-item${active ? " hz-nav-active" : ""}`}
              aria-current={active ? "page" : undefined}
              style={rowStyle(active)}
            >
              <Icon name={item.icon} style={{ fontSize: 20 }} />
              <span style={{ fontSize: 15 }}>{item.label}</span>
            </Link>
          );
        })}
        {/* 예고 항목 — 사이드바와 같은 이유로 <div> 다(링크가 아니고 포커스도 안 받는다).
            다만 배지는 위첨자가 아니라 라벨 옆에 나란히 둔다. 여기는 폭이 사이드바처럼
            210px 로 묶여 있지 않아 자리가 남고, 툴팁이 안 뜨는 화면이라 배지가 유일한
            설명이므로 겹쳐 두지 않고 또렷하게 보여야 한다. */}
        <div className="hz-tip" data-tip={COMING_SOON.tip} style={{ ...rowStyle(false), color: C.faint }}>
          <AntIcon size={20} />
          <span style={{ fontSize: 15 }}>{COMING_SOON.label}</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              color: C.faint,
              background: "var(--c-hover)",
              border: `1px solid ${C.line}`,
              padding: "2px 6px",
              borderRadius: 999,
            }}
          >
            {COMING_SOON.badge}
          </span>
        </div>
        <span style={{ height: 1, background: C.line, margin: "4px 8px" }} />
        {/* 라벨은 바뀌었어도 data-ga-cta 는 "community" 그대로 둔다 — 값을 같이 바꾸면
            이름 변경 전후의 클릭수를 한 줄로 비교할 수 없다. surface 만 tabbar → menu 로
            바꾼다. 그 자리는 실제로 없어졌으니 계속 tabbar 로 적으면 거짓이 된다. */}
        <a
          href={TELEGRAM.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={TELEGRAM.aria}
          className="hz-nav-item"
          data-ga="cta_click"
          data-ga-cta="community"
          data-ga-surface="menu"
          style={rowStyle(false)}
        >
          <Icon name={TELEGRAM.icon} style={{ fontSize: 20 }} />
          <span style={{ fontSize: 15 }}>{TELEGRAM.label}</span>
        </a>
      </nav>
    </>
  );
}

function ThemeToggle({ initial }: { initial: "light" | "dark" }) {
  // 초기값은 서버가 쿠키로 SSR한 값(prop)이라 아이콘도 첫 렌더부터 정확하다.
  const [theme, setTheme] = useState<"light" | "dark">(initial);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    // 기본이 라이트라, 이 이벤트는 "다크로 바꾼 사람"이 얼마나 되는지를 재는 쪽이
    // 주된 쓸모다. 전환 방향(to)이 있어야 양쪽이 구분된다.
    track("theme_toggle", { to: next });
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `hz-theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    // 모바일 주소창 색도 같이 돌린다. 이 메타는 layout.tsx 가 쿠키를 보고 SSR 하므로,
    // 여기서 안 고치면 다음 페이지 로드까지 주소창만 이전 테마로 남는다.
    // 값을 또 적지 않고 방금 바뀐 data-theme 의 --c-bg 를 읽어 globals.css 를 따라간다.
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  };

  return (
    <button
      onClick={toggle}
      aria-label="다크 모드 전환"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        borderRadius: 12,
        border: `1px solid ${C.line}`,
        background: C.bg,
        color: C.sub,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} style={{ fontSize: 20 }} />
    </button>
  );
}

function TickerItem({ q }: { q: Quote }) {
  const changeColor = q.change === null ? C.sub : q.change > 0 ? C.mania : q.change < 0 ? C.cold : C.sub;
  const arrow = q.change === null ? "" : q.change > 0 ? "▲" : q.change < 0 ? "▼" : "";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.sub }}>{q.label}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: q.color ?? C.ink }}>{q.value}</span>
      {q.change !== null && (
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: changeColor }}>
          {arrow}
          {Math.abs(q.change).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

// 시세 로드 전 자리표시. /api/ticker 응답이 오면 실데이터로 교체된다.
const PLACEHOLDER: Quote[] = [
  { label: "나스닥 선물", value: "—", change: null },
  { label: "코스피", value: "—", change: null },
  { label: "코스닥", value: "—", change: null },
  { label: "삼성전자", value: "—", change: null },
  { label: "SK하이닉스", value: "—", change: null },
  { label: "비트코인", value: "—", change: null },
  { label: "원/달러", value: "—", change: null },
];

function TopBar({
  dailyScore,
  theme,
  scrolledDown,
  menuOpen,
  onMenuToggle,
}: {
  dailyScore: DailyScore | null;
  theme: "light" | "dark";
  scrolledDown: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  // 햇쩨 지수는 일간 값이라 서버 prop을 쓰고, 나머지 시세는 10분마다 폴링한다.
  const [live, setLive] = useState<Quote[]>(PLACEHOLDER);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/ticker");
        if (!res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data.quotes)) setLive(data.quotes as Quote[]);
      } catch {}
    };
    load();
    const id = setInterval(load, 600_000); // 10분
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // 저장된 stage 대신 점수에서 직접 구간을 계산 — 히어로와 항상 일치하고 라벨 변경에 견고.
  const stageLabel = dailyScore ? stageForScore(dailyScore.score) : "";
  const hatzze: Quote = dailyScore
    ? {
        label: "햇쩨 지수",
        // 히어로와 같은 정수 반올림을 쓴다. 예전엔 formatIndicatorValue 가 30.86 을 "30"으로
        // 잘라서 히어로의 31℃ 와 한 화면에서 1도 어긋났고, 그 버림은 lib/format.ts 에서
        // 뿌리를 고쳤다. 그래도 여기서 Math.round 를 직접 쓰는 이유는 따로다 —
        // formatIndicatorValue 는 절댓값 10 미만을 소수점 둘째자리로 적어(저온장의 8.5점이
        // "8.50℃") 티커 한 줄에 맞지 않는다. 온도는 언제나 정수여야 한다.
        value: `${Math.round(dailyScore.score)}℃ · ${stageLabel}`,
        change: null,
        color: STAGE_COLOR[stageLabel] ?? C.ink,
      }
    : { label: "햇쩨 지수", value: "—", change: null };

  const quotes: Quote[] = [hatzze, ...live];

  // 메뉴가 열려 있으면 감추지 않는다 — 패널이 탑바 바로 아래에 붙어 있어서, 탑바만
  // 올라가면 패널이 허공에 뜬다.
  const hidden = scrolledDown && !menuOpen;

  return (
    <header
      className={`hz-topbar${hidden ? " hz-topbar-hidden" : ""}`}
      style={{
        height: 54,
        flexShrink: 0,
        background: C.card,
        borderBottom: `1px solid ${C.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        // 좌우 여백은 .hz-topbar 가 정한다(데스크톱 24 · 모바일 16). 인라인에 두면
        // 미디어쿼리가 못 이겨서, 폰에서 탑바 양끝이 카드(16)와 안 맞고 24 로 남는다.
      }}
    >
      {/* 모바일 전용 로고. 사이드바가 숨는 폭에서는 브랜드가 화면 어디에도 없었다.
          display 를 인라인으로 안 주는 이유는 아래 미디어쿼리가 이겨야 하기 때문이다. */}
      <Link href="/" aria-label="hatzze 홈" className="hz-topbar-logo hz-logo-link">
        <LogoLockup symbolSize={22} wordmarkSize={23} gap={6} />
      </Link>
      <div className="hz-ticker-wrap">
        <div className="hz-ticker-track">
          {[...quotes, ...quotes].map((q, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, paddingRight: 22 }}>
              <span style={{ width: 1, height: 18, background: C.line, flexShrink: 0 }} />
              <TickerItem q={q} />
            </div>
          ))}
        </div>
      </div>
      {/* 오른쪽 묶음: 테마 토글 + 햄버거(모바일 전용). 햄버거가 화면 맨 오른쪽 끝이다.
          데스크톱에서는 햄버거가 display:none 이라 flex 에서 아예 빠지고, 남는 건
          예전과 같은 토글 하나다 — 순서를 바꿔도 데스크톱은 그대로다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <ThemeToggle initial={theme} />
        <button
          type="button"
          className="hz-menu-btn"
          onClick={onMenuToggle}
          aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={menuOpen}
          aria-controls="hz-mobile-menu"
          style={{
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: 12,
            border: `1px solid ${C.line}`,
            background: C.bg,
            color: C.sub,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Icon name={menuOpen ? "close" : "menu"} style={{ fontSize: 20 }} />
        </button>
      </div>
    </header>
  );
}

/**
 * 스크롤을 내리면 true, 올리면 false. 모바일 탑바를 감췄다 꺼내는 데 쓴다.
 *
 * window 가 아니라 인자로 받은 요소를 듣는다. 이 셸은 바깥(document)이 스크롤되지
 * 않는다 — 루트가 overflow:hidden 이고 main.hz-scroll 이 자기 안에서 굴린다.
 * window 에 붙이면 이벤트가 한 번도 안 온다.
 *
 * 6px 문턱을 둔 이유는 관성 스크롤이 끝날 때 1~2px 씩 방향이 튀어서, 문턱이 없으면
 * 탑바가 깜빡이기 때문이다. 최상단(10px 이내)에서는 방향과 무관하게 늘 보여 준다.
 *
 * 데스크톱에서도 이 훅은 돌지만 보이는 변화는 없다 — 감추는 건 transform 이고,
 * 그 규칙은 560px 미디어쿼리 안에만 있다.
 */
function useScrolledDown(ref: React.RefObject<HTMLElement | null>) {
  const [scrolledDown, setScrolledDown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const y = el.scrollTop;
      const dy = y - last;
      if (Math.abs(dy) < 6) return;
      last = y;
      setScrolledDown(y > 10 && dy > 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  return scrolledDown;
}

export default function AppShell({
  dailyScore,
  theme,
  children,
}: {
  dailyScore: DailyScore | null;
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const scrolledDown = useScrolledDown(mainRef);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // 페이지를 옮기면 닫는다. 패널은 셸에 얹혀 있어 라우팅만으로는 사라지지 않는다.
  //
  // useEffect 가 아니라 렌더 중에 맞춘다. effect 로 하면 이미 그린 뒤에 다시 그리는
  // 셈이라 메뉴가 한 프레임 남고(cascading render), eslint 도 막는다. 링크마다
  // onClick 으로 닫는 방법도 있지만 그러면 뒤로가기·앞으로가기가 빠진다 — pathname 을
  // 보면 어떤 경로로 바뀌든 다 걸린다.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div
      className="hz-shell"
      style={{
        display: "flex",
        background: C.bg,
        color: C.ink,
        // 사이트 전체를 Pretendard 하나로 통일한다. 예전엔 Plus Jakarta Sans가 앞에 있어서
        // 라틴·숫자만 그 서체로 렌더되고 한글만 Pretendard로 떨어졌다 — 한 줄 안에서 서체가
        // 갈렸다. Pretendard는 next/font/local로 자체 호스팅하므로 mac·윈도우 모두 동일하다.
        fontFamily: "var(--font-pretendard), sans-serif",
        WebkitFontSmoothing: "antialiased",
        overflow: "hidden",
      }}
    >
      {/* 위임 리스너(클릭·툴팁·스크롤). 렌더 결과가 없으므로 어디에 두어도 되지만,
          셸 최상단에 두어 "모든 페이지에 걸린다"는 게 눈에 보이게 한다. */}
      <GaEvents />
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar
          dailyScore={dailyScore}
          theme={theme}
          scrolledDown={scrolledDown}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((v) => !v)}
        />
        {/* 메뉴는 탑바 '안'이 아니라 형제로 둔다. 안에 두면 백드롭이 탑바의 자식이 되어
            로고·햄버거까지 덮어 버려서, 정작 닫기 버튼을 누를 수 없다. */}
        {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
        {/* 여백은 globals.css 의 --hz-main-pad 가 폭에 따라 정한다(40 → 24 → 16).
            인라인이 아니라 .hz-main 클래스로 준다 — 모바일에서 탑바가 fixed 로 떠서
            흐름에서 빠지는데, 그만큼을 padding-top 으로 되메워야 첫 카드가 안 가린다.
            인라인 padding 은 미디어쿼리의 padding-top 을 이겨서 그게 안 먹는다. */}
        <main ref={mainRef} className="hz-scroll hz-main" style={{ flex: 1, overflowY: "auto" }}>
          {children}
          <Footer />
        </main>
      </div>
    </div>
  );
}

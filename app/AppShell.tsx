"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

// 모바일 하단 탭바 — 사이드바가 560px 아래에서 숨겨지는데(globals.css) 그 자리를 메우는
// 내비게이션이 없었다. /kadera·/mdd 로 가는 유일한 링크가 푸터(문서 y≈10,774px)라
// 사실상 닿을 수 없었다.
//
// 햄버거+드로어 대신 하단 탭바를 고른 이유:
//  1. 항목이 4개뿐이라 한 줄에 다 들어간다 — 접어 숨길 이유가 없다.
//  2. 이 화면의 문제는 "갈 곳이 있는 줄 모른다"였다. 드로어는 그걸 한 겹 더 감춘다.
//  3. 현재 페이지 표시(사이드바와 같은 파란 배경)가 늘 떠 있다 — 드로어는 열어야 보인다.
//
// position:fixed 가 아니라 셸 flex 칼럼의 마지막 칸으로 둔다. 스크롤은 바깥이 아니라
// main.hz-scroll 이 자체적으로 하므로, 흐름에 놓으면 마지막 콘텐츠를 덮을 일이 없다
// (하단 패딩으로 가림을 보정할 필요도 없다).
function MobileTabBar() {
  const intentPrefetch = useIntentPrefetch();
  const pathname = usePathname();

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    padding: "7px 2px",
    borderRadius: 12,
    color: active ? C.blue : C.sub,
    fontWeight: active ? 700 : 600,
    // 사이드바와 같은 이유로 비활성 background 는 인라인에서 뺀다 — 값을 두면
    // .hz-nav-item:hover 를 인라인이 이겨버린다.
    background: active ? "var(--c-blue-tint)" : undefined,
    textDecoration: "none",
  });

  return (
    <nav className="hz-tabbar" aria-label="주요 메뉴" style={{ flexShrink: 0, background: C.card, borderTop: `1px solid ${C.line}`, padding: "6px 8px" }}>
      {NAV.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            {...intentPrefetch(item.href)}
            className={`hz-tab hz-nav-item${active ? " hz-nav-active" : ""}`}
            aria-current={active ? "page" : undefined}
            style={tabStyle(active)}
          >
            <Icon name={item.icon} style={{ fontSize: 22 }} />
            <span style={{ fontSize: 10, whiteSpace: "nowrap" }}>{item.label}</span>
          </Link>
        );
      })}
      <a
        href={TELEGRAM.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={TELEGRAM.aria}
        className="hz-tab hz-nav-item"
        data-ga="cta_click"
        data-ga-cta="community"
        data-ga-surface="tabbar"
        style={tabStyle(false)}
      >
        <Icon name={TELEGRAM.icon} style={{ fontSize: 22 }} />
        <span style={{ fontSize: 10, whiteSpace: "nowrap" }}>{TELEGRAM.label}</span>
      </a>
    </nav>
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

function TopBar({ dailyScore, theme }: { dailyScore: DailyScore | null; theme: "light" | "dark" }) {
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

  return (
    <header
      style={{
        height: 54,
        flexShrink: 0,
        background: C.card,
        borderBottom: `1px solid ${C.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "0 24px",
      }}
    >
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
      <ThemeToggle initial={theme} />
    </header>
  );
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
        <TopBar dailyScore={dailyScore} theme={theme} />
        {/* 여백은 globals.css 의 --hz-main-pad 가 폭에 따라 정한다(40 → 24 → 16). */}
        <main className="hz-scroll" style={{ flex: 1, overflowY: "auto", padding: "var(--hz-main-pad)" }}>
          {children}
          <Footer />
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}

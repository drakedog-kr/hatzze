"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { track } from "@/lib/ga";
import { useShellEnv } from "./shell-env";
import { KR_THEME_SHORT, THEME_PAGE, US_THEME_PAGE } from "./theme/copy";
import { C, Icon, R } from "./ui";
import { useAppPathname } from "./use-app-pathname";

/**
 * 머리 오른쪽 도구 묶음(통화 · 시장 건너가기 · 다크 모드)과 그 부품들.
 *
 * 셸(AppShell)의 본문 머리와 폰 탑바가 쓰고, **자기 머리를 스스로 그리는 상세 화면**(종목 `/stock/…`)도
 * 제목 줄 오른쪽에 같은 묶음을 둔다 — 셸은 그 화면의 이름을 몰라 머리를 비우는데(app/stock/[code]/page.tsx
 * 머리말), 도구만 남기면 제목 없는 빈 띠(약 58px)가 생겼다(2026-09-30 점검). 그래서 AppShell 에서 떼어 냈다.
 */

/**
 * 이용자의 선택을 1년짜리 쿠키로 남긴다(테마 · 통화).
 *
 * ⚠️ 컴포넌트 **밖**에 둔다. 리액트 컴파일러 규칙이 컴포넌트 안에서 바깥 값(여기서는
 * `document.cookie`)에 대입하는 것을 막는다 — 함수로 감싸면 그 대입이 이 모듈의 일이
 * 되어 통과한다. 테마 토글이 먼저 쓰던 줄도 여기로 모았다.
 * ⚠️ 쿠키가 없으면 새로고침마다 기본값으로 돌아간다. 다음 방문 때는 layout.tsx 의
 * PREF_SCRIPT 가 이 쿠키를 읽어 페인트 전에 <html> 에 붙인다(서버는 쿠키를 안 읽는다).
 */
function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * 통화 스위치 — **달러 금액을 내는 화면에서만** 뜬다(지금은 내부자 리포트 하나).
 *
 * 내부자 리포트는 전부 달러라 한국 독자가 크기를 가늠하기 어렵다. 원화를 얹어 두고
 * 이 스위치로 갈아 끼운다. (처음엔 서학개미 장부가 같이 썼다. 그 화면은 2026-09-27 에 걷었다.)
 *
 * ## ⭐ 테마 토글과 같은 수다
 *
 * 뿌리 요소의 `data-cur` 하나를 바꾸면 globals.css 가 숨길 쪽을 고른다. 금액은 카드가
 * **두 벌 다 그려 놓았다**(`app/insider/parts.tsx` 의 `Money`) — 그 화면의 카드가 거의 다 서버
 * 컴포넌트라, 통화를 리액트 상태로 두면 그 전부를 클라이언트로 끌어와야 한다.
 *
 * ⚠️ 환율(FRED)을 못 받은 날에는 카드가 달러만 낸다(`Money` 가 그렇게 떨어진다).
 * 그때 이 스위치는 눌러도 화면이 안 바뀐다. **셸은 그 사정을 모른다** — 레이아웃이
 * 페이지의 로더 결과를 볼 수 없어서다. 드문 고장 경로이고, 그날은 페이지가 어차피
 * 성한 모습이 아니라 여기서 가리지 않는다.
 */
const CUR_EVENT = "hz-cur-change";

/**
 * 지금 고른 통화. 뿌리의 `data-cur` 가 유일한 정의라(layout.tsx 의 PREF_SCRIPT 가 페인트
 * 전에 쿠키 값을 붙인다) 리액트 상태를 따로 두지 않고 그 속성을 저장소로 읽는다.
 * PcHint 와 같은 수(useSyncExternalStore) — 서버 스냅샷은 null(안 고름)이라 SSR 과
 * 하이드레이션이 어긋나지 않고, 깨어난 직후 진짜 값으로 한 번 다시 그린다.
 */
const curStore = {
  subscribe(cb: () => void) {
    window.addEventListener(CUR_EVENT, cb);
    return () => window.removeEventListener(CUR_EVENT, cb);
  },
  getSnapshot(): "krw" | "usd" | null {
    const v = document.documentElement.getAttribute("data-cur");
    return v === "krw" || v === "usd" ? v : null;
  },
};

function CurrencyToggle({ fallback, compact = false }: { fallback: "krw" | "usd"; compact?: boolean }) {
  // 뿌리 속성이 없으면(아직 안 고름) 화면의 기본값이 눌린 칸이다. 이 값은 aria-pressed
  // 에만 쓴다 — **눌린 칸의 모양은 CSS 가 뿌리 속성을 보고 고른다**(mobile.css
  // .hz-cur-switch). 모양까지 리액트가 그리면 쿠키가 기본값과 다른 사람에게 첫 페인트에서
  // 엉뚱한 칸이 눌려 보였다가 하이드레이션 뒤에 옮겨 가며 깜빡인다.
  const picked = useSyncExternalStore(curStore.subscribe, curStore.getSnapshot, () => null);
  const cur = picked ?? fallback;
  const pick = (next: "krw" | "usd") => {
    if (next === cur) return;
    track("currency_toggle", { to: next });
    // ⚠️ 원화도 **값을 적는다**(예전엔 속성을 지웠다). 지우면 "안 고름"과 같아져서,
    //    달러가 기본인 화면(내부자 리포트)에서 ₩ 를 눌러도 달러로 돌아간다.
    document.documentElement.setAttribute("data-cur", next);
    remember("hz-cur", next);
    window.dispatchEvent(new Event(CUR_EVENT));
  };
  if (compact) {
    // 폰 탑바의 **한 칸 토글**. 두 칸 알약(70px)이 검색 단추가 더해진 탑바를 넘치게 했다 — 320px 에서 메뉴 단추가
    // 화면 밖으로 46px, 375px 에서 11px 잘렸다(2026-09-30 점검). 이웃 단추와 같은 38px 한 칸에 **지금 통화를 크게,
    // 누르면 바뀔 통화를 작게** 적는다. 어느 쪽을 보일지는 두 칸 알약과 같은 까닭으로 CSS 가 뿌리의 data-cur 를 보고
    // 고른다(mobile.css .hz-cur-one) — 리액트가 고르면 쿠키가 기본값과 다른 사람에게 첫 페인트 뒤 글자가 바뀐다.
    // 접근성 이름은 누르면 **일어날 일**을 말한다(하이드레이션 뒤 진짜 값으로 한 번 고쳐진다).
    return (
      <button
        type="button"
        className="hz-cur-one"
        data-cur-default={fallback}
        onClick={() => pick(cur === "usd" ? "krw" : "usd")}
        aria-label={cur === "usd" ? "원화로 보기" : "달러로 보기"}
        title="통화 바꾸기"
      >
        <span className="hz-cur-one-v" data-cur="usd" aria-hidden="true">
          $<small>₩</small>
        </span>
        <span className="hz-cur-one-v" data-cur="krw" aria-hidden="true">
          ₩<small>$</small>
        </span>
      </button>
    );
  }
  return (
    // data-cur-default: 쿠키로 고른 게 없을 때 CSS 가 눌린 칸으로 그릴 쪽. 화면 본문의
    // `[data-cur-default]`(insider 페이지들)와 같은 값이어야 눌린 칸과 보이는 금액이 맞는다.
    <span className="hz-cur-switch" role="group" aria-label="통화 바꾸기" data-cur-default={fallback}>
      {([["krw", "₩"], ["usd", "$"]] as const).map(([k, glyph]) => (
        <button key={k} type="button" onClick={() => pick(k)} aria-pressed={cur === k} data-cur={k}
                aria-label={k === "krw" ? "원화로 보기" : "달러로 보기"}>
          {glyph}
        </button>
      ))}
    </span>
  );
}

/**
 * 통화 스위치가 뜨는 화면과 그 화면의 **기본 통화**.
 *
 * ⚠️ 여기 없는 화면에 스위치를 두면 눌러도 아무것도 안 바뀌는 단추가 된다.
 * ⚠️ 기본값은 CSS 에도 적혀 있다(`[data-cur-default]`, globals.css). **두 곳이 같아야
 *    한다** — 갈리면 서버가 그린 화면과 스위치의 눌린 칸이 어긋난다.
 */
const CURRENCY_PAGES: { prefix: string; fallback: "krw" | "usd" }[] = [
  // 재료가 전부 미국 공시라 달러가 원본이고, 원화는 크기를 가늠하라고 얹은 것이다.
  { prefix: "/insider", fallback: "usd" },
];

/* 채널 등록 신청(.hz-btn-soft, 탑바)이 여기 있었다. 국장 카더라 히어로의 큰 단추 → 탑바 → **국장 '채널 파워 랭킹' 카드 머리**로
   옮겨 갔고(2026-09-22), 미장 카더라에서는 아예 뺐다 — 미장 채널은 우리가 고른 목록이라 신청을 받는 자리가 아니다.
   지금 이 단추를 그리는 곳은 app/kadera/page.tsx 한 곳이고 폼 주소는 app/brand.ts 의 CHANNEL_FORM 이다. */

/**
 * **시장 건너가기** — 머리 오른쪽, 다크 모드 단추 왼쪽(2026-09-22). 국장↔미장 짝이 있는 두 구역(카더라·테마 판세)이 같이 쓴다.
 *
 * 예전엔 두 화면 다 히어로 안에 큰 단추(.hz-tx-btn)를 뒀다. 테마 목록은 히어로 넓은 칸이 절반이라 거기 두니 배너처럼 무거웠고,
 * 도구 자리로 올리면 **어느 화면에서나 같은 자리**라 오가는 손이 자리를 다시 익히지 않는다. 카더라도 같이 옮겼다.
 * 부품은 카더라의 '채널 등록 신청'과 같은 것(.hz-btn-soft.hz-topbar-cta) — 폰(≤560)에서는 라벨이 접히고 아이콘만,
 * ≤900 에서는 도구 줄 자체가 접히므로 그 폭에서는 사이드바 메뉴로 오간다.
 *
 * 상세 화면(/theme/semiconductor)에서도 보이고, 건너가는 곳은 반대 시장의 **목록**이다 — 반도체의 짝이 미장에 따로 없다.
 */
const MARKET_PAIRS: { root: string; us: string; kr: { label: string; ga: string }; usSide: { label: string; ga: string } }[] = [
  { root: "/kadera", us: "/kadera/us", kr: { label: "국장 카더라", ga: "to_kr_kadera" }, usSide: { label: "미장 카더라", ga: "to_us_kadera" } },
  { root: THEME_PAGE.href, us: US_THEME_PAGE.href, kr: { label: KR_THEME_SHORT, ga: "to_kr_theme" }, usSide: { label: US_THEME_PAGE.short, ga: "to_us_theme" } },
];

function MarketSwap({ pathname }: { pathname: string }) {
  const pair = MARKET_PAIRS.find((m) => pathname === m.root || pathname.startsWith(`${m.root}/`));
  if (!pair) return null;
  const onUs = pathname === pair.us || pathname.startsWith(`${pair.us}/`);
  const to = onUs ? { href: pair.root, ...pair.kr } : { href: pair.us, ...pair.usSide };
  return (
    <Link
      href={to.href}
      className="hz-btn-soft hz-topbar-cta"
      title={`${to.label} 보기`}
      data-ga="cta_click"
      data-ga-cta={to.ga}
      data-ga-surface="page_tools"
    >
      <Icon name="swap_horiz" style={{ fontSize: "var(--fs-15)" }} />
      <span className="hz-topbar-cta-label">{to.label}</span>
    </Link>
  );
}

/**
 * 머리 오른쪽 도구 묶음. 통화 스위치와 채널 등록 신청이 **테마 단추 왼쪽**이다.
 *
 * ⚠️ 통화는 **달러 금액을 내는 화면에만** 있는 개념이라 경로로 가린다. 국장 화면에
 * 두면 눌러도 아무것도 안 바뀌는 단추가 된다.
 */
export function PageTools({ compact = false }: { compact?: boolean } = {}) {
  const pathname = useAppPathname();
  const { themeNav } = useShellEnv();
  return (
    <>
      {/* 쿠키로 고른 게 없으면 그 화면의 기본값을 눌린 칸으로 쓴다. */}
      {(() => {
        const page = CURRENCY_PAGES.find((p) => pathname.startsWith(p.prefix));
        return page ? <CurrencyToggle key={page.prefix} fallback={page.fallback} compact={compact} /> : null;
      })()}
      {/* 안 연 동안 배포에서는 /theme 가 404 라 단추도 내지 않는다(themeNav — ShellEnv 주석). */}
      {(themeNav || !pathname.startsWith(THEME_PAGE.href)) && <MarketSwap pathname={pathname} />}
      <ThemeToggle />
    </>
  );
}

function ThemeToggle() {
  // 상태를 두지 않는다. 지금 테마는 뿌리의 data-theme 이 유일한 정의고(layout.tsx 의
  // PREF_SCRIPT 가 페인트 전에 붙인다), 아이콘은 CSS 가 그 속성을 보고 고른다
  // (mobile.css .hz-if-light/.hz-if-dark). 리액트 상태로 아이콘을 고르면 서버가 쿠키를
  // 몰라 라이트 아이콘을 내보내고, 다크 이용자에게 하이드레이션 뒤 아이콘이 바뀌어
  // 보인다. 속성을 직접 읽으면 그 깜빡임이 없다.
  const toggle = () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    // 기본이 라이트라, 이 이벤트는 "다크로 바꾼 사람"이 얼마나 되는지를 재는 쪽이
    // 주된 쓸모다. 전환 방향(to)이 있어야 양쪽이 구분된다.
    track("theme_toggle", { to: next });
    // 라이트는 속성을 **지운다**(값 "light" 를 적지 않는다). CSS 가 `:root` = 라이트,
    // `[data-theme="dark"]` = 다크로 갈라 둬서 둘 다 라이트로 보이지만, PREF_SCRIPT 도
    // 라이트면 안 붙이므로 "쿠키 없음"과 "라이트 고름"의 DOM 을 같게 둔다.
    if (next === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    remember("hz-theme", next);
    // 모바일 주소창 색도 같이 돌린다. 이 메타는 layout.tsx 가 라이트 값으로 내보내고
    // PREF_SCRIPT 가 다크 쿠키면 바꾸므로, 여기서 안 고치면 다음 페이지 로드까지
    // 주소창만 이전 테마로 남는다.
    // 값을 또 적지 않고 방금 바뀐 data-theme 의 --c-bg 를 읽어 globals.css 를 따라간다.
    const bg = getComputedStyle(root).getPropertyValue("--c-bg").trim();
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
        borderRadius: R.control,
        border: `1px solid ${C.line}`,
        background: C.bg,
        color: C.sub,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {/* 둘 다 그려 두고 CSS 가 테마에 맞는 하나만 보인다(display:none 이라 접근성
          트리에도 하나만 남는다). 라이트에서는 달(다크로 가기), 다크에서는 해. */}
      <Icon name="dark_mode" className="hz-if-light" style={{ fontSize: "var(--fs-20)" }} />
      <Icon name="light_mode" className="hz-if-dark" style={{ fontSize: "var(--fs-20)" }} />
    </button>
  );
}

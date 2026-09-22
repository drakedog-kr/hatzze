import "server-only";

import { fmtKoDate } from "@/lib/stock-page";
import { THEME_NAMES, US_THEME_NAMES, marketThemeHref, themeStockHref, type ThemeMarketKey } from "@/lib/theme-href";

import { KR_THEME_SHORT, THEME_PAGE, US_THEME_PAGE } from "./copy";

/**
 * 테마 리포트의 **시장 한 벌** — 국장·미장이 같은 뷰(ThemeIndexView · ThemeDetailView)를 그리고, 다른 것은 여기 든 것뿐이다.
 * 주소·사전·시세 캡션·도움말의 낱말. 자료를 읽는 쪽은 lib/theme-page.ts(국장) · lib/us-theme-page.ts(미장)이고
 * 둘 다 같은 타입을 낸다. 클라이언트 부품(ReasonWeeks)엔 함수를 못 넘기니 `key` 만 넘기고 그쪽이 lib/theme-href.ts 로 주소를 만든다.
 */
export type ThemeMarket = {
  key: ThemeMarketKey;
  /** 목록 화면의 주소·이름(뒤로 가기 줄 · '테마 전체 보기'). */
  indexHref: string;
  indexLabel: string;
  /** 사전의 테마 이름(사전 순서). 이웃 테마·'n개 테마'가 쓴다. */
  themeNames: string[];
  themeHref: (theme: string) => string;
  stockHref: (code: string) => string;
  /** 히어로 '시세 반응'의 곁말. 국장은 KRX 종가 날짜, 미장은 야후 시세라 날짜가 없다. */
  quotesCaption: (date: string | null) => string;
  /** 등락의 이유 줄의 등락률이 무엇인지(툴팁). 국장은 확정 종가, 미장은 채널이 적은 값. */
  reasonRateNote: string;
  /** '이 테마는' 도움말에 드는 시장 낱말. */
  marketWord: string;
  /** 반대 시장으로 건너가는 통로(목록 히어로의 단추). 카더라 히어로의 '미장 카더라 보기'와 같은 부품·같은 자리다. */
  swap: { href: string; label: string; ga: string };
};

export const KR_MARKET: ThemeMarket = {
  key: "kr",
  indexHref: THEME_PAGE.href,
  indexLabel: THEME_PAGE.label,
  themeNames: THEME_NAMES,
  themeHref: (t) => marketThemeHref("kr", t),
  stockHref: (c) => themeStockHref("kr", c),
  quotesCaption: (date) => (date ? `${fmtKoDate(date)} 종가` : "종가"),
  reasonRateNote: "그날 종가 등락률",
  marketWord: "국내",
  swap: { href: US_THEME_PAGE.href, label: `${US_THEME_PAGE.short} 보기`, ga: "to_us_theme" },
};

export const US_MARKET: ThemeMarket = {
  key: "us",
  indexHref: US_THEME_PAGE.href,
  indexLabel: US_THEME_PAGE.label,
  themeNames: US_THEME_NAMES,
  themeHref: (t) => marketThemeHref("us", t),
  stockHref: (c) => themeStockHref("us", c),
  quotesCaption: () => "미국장 최근 시세",
  reasonRateNote: "채널이 적은 등락률",
  marketWord: "미국",
  swap: { href: THEME_PAGE.href, label: `${KR_THEME_SHORT} 보기`, ga: "to_kr_theme" },
};

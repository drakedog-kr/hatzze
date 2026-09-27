import "server-only";

import { getPreview } from "@/lib/kr-preview";
import { isLoadFailed } from "@/lib/load-state";
import { pickNextUpSlot, type NextUpClock, type NextUpSlot } from "@/lib/next-up-slot";
import { getSurgingStocks, getThemeRotation } from "@/lib/telegram-data";
import { THEME_SLUGS, themeHref } from "@/lib/theme-href";
import { THEME_PUBLIC } from "../screen-flags";

/**
 * 시장 브리핑 히어로 바닥 '오늘 눈에 띄는 것' 칩의 재료(국장 카더라 히어로와 같은 줄, .hz-tx-spot).
 *
 * 칩 둘 — 모두 집계값이라 LLM 문장이 아니다(카더라와 같은 원칙). 둘 다 다른 화면으로 보낸다.
 *   ① 시각 칩: 평일 06:30~10:00 간밤 미장(국장 미리보기), 그 밖엔 카더라 급부상 1위.
 *      규칙은 lib/next-up-slot.ts, 고르는 건 브라우저(HeroSpotlights).
 *   ② 테마 유입 1위 — 그 테마 리포트로. 카더라 히어로의 '테마 유입' 칩과 같은 값(점유율 증가폭 1위).
 *
 * 홈 본문에서 다른 화면으로 가는 링크가 0개였다(2026-09-28). 새 칸을 만들지 않고 카더라처럼
 * 히어로 바닥 한 줄에 둔다(요청 — "새 카드 생기면 안 되고, 카더라 브리핑 맨 아래처럼 심플하게").
 * 칩은 글자를 자르지 않는다 — 데일리 노트 제목을 말줄임으로 잘랐더니 거슬린다고 해서 노트 칩을 뺐다.
 *
 * ⭐ 조회가 실패해도 홈을 던지지 않는다. 홈은 조회 하나가 깨지면 사본을 안 만들고 던지는데
 *    (assertLoaded), 칩은 곁가지라 거기 묶으면 미리보기 조회 하나가 홈 전체를 막는다. 그 칩만 빠진다.
 */

export type SpotChip = {
  /** 칩 앞 회색 머리말. */
  cap: string;
  /** 굵은 이름. */
  name: string;
  /** 끝 숫자와 그 색. */
  val: string;
  ink: string;
  href: string;
  /** GA cta 값. */
  ga: string;
};

export type SpotlightData = {
  /** 시각 칩 후보(칸마다 하나). 어느 것을 보일지는 clock 으로 브라우저가 고른다. */
  timed: Record<NextUpSlot, SpotChip | null>;
  clock: NextUpClock;
  /** 사본을 만드는 순간 고른 칸. 브라우저는 이걸 먼저 그리고 제 시계로 다시 고른다. */
  initial: NextUpSlot;
  /** 시각과 상관없는 칩. */
  fixed: SpotChip[];
};

const HOT = "var(--c-hot-ink)";
const COLD = "var(--c-cold-ink)";
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

async function previewChip(): Promise<{ chip: SpotChip | null; date: string | null }> {
  try {
    const p = await getPreview();
    const top = p.sectors[0]?.movers[0];
    // 밤사이 미장이 쉬었거나 크게 움직인 종목이 없으면 칩을 안 세운다 — 할 말이 없는 칩이
    // 가장 붐비는 시각(평일 8시)에 선다. 그땐 카더라 칩이 선다.
    if (p.usHoliday || !top || !p.date) return { chip: null, date: null };
    return {
      chip: { cap: "간밤 미장", name: top.usName, val: pct(top.dp), ink: top.dp > 0 ? HOT : COLD, href: "/preview", ga: "spotlight_preview" },
      date: p.date,
    };
  } catch (e) {
    console.error("[spotlight] 국장 미리보기를 못 읽었습니다 — 간밤 미장 칩을 뺍니다", e);
    return { chip: null, date: null };
  }
}

async function surgingChip(): Promise<SpotChip | null> {
  try {
    const [top] = await getSurgingStocks(1, { withQuotes: false });
    if (!top) return null;
    return {
      cap: "급부상",
      name: top.name,
      // 신규 등장은 배수가 무한대라 숫자 대신 '신규'.
      val: top.isNew || !Number.isFinite(top.ratio) ? "신규" : `${top.ratio.toFixed(1)}배`,
      ink: HOT,
      href: "/kadera#surging",
      ga: "spotlight_surging",
    };
  } catch (e) {
    console.error("[spotlight] 급부상 종목을 못 읽었습니다 — 그 칩을 뺍니다", e);
    return null;
  }
}

async function themeChip(): Promise<SpotChip | null> {
  if (!THEME_PUBLIC) return null;
  try {
    const themes = await getThemeRotation(10);
    if (isLoadFailed(themes)) return null;
    // 카더라 히어로와 같은 규칙 — 점유율 증가폭(%p)이 가장 큰 테마. 늘어난 테마가 없으면 칩을 안 세운다.
    const moved = themes.filter((t) => t.shareDelta !== null && t.shareDelta > 0 && THEME_SLUGS[t.theme]);
    if (!moved.length) return null;
    const top = moved.reduce((a, b) => ((b.shareDelta ?? 0) > (a.shareDelta ?? 0) ? b : a));
    return {
      cap: "테마 유입",
      name: top.theme,
      val: `▲${(top.shareDelta ?? 0).toFixed(1)}%p`,
      ink: HOT,
      href: themeHref(top.theme),
      ga: "spotlight_theme",
    };
  } catch (e) {
    console.error("[spotlight] 테마 로테이션을 못 읽었습니다 — 그 칩을 뺍니다", e);
    return null;
  }
}

export async function loadSpotlight(): Promise<SpotlightData> {
  const [preview, surging, theme] = await Promise.all([previewChip(), surgingChip(), themeChip()]);
  const clock = { previewDate: preview.date };
  return {
    // 간밤 미장 칩이 없는 날(미장 휴장 등)엔 그 시각에도 카더라 칩이 선다(clock.previewDate 가 null).
    timed: { preview: preview.chip, kadera: surging },
    clock,
    // 시각은 여기서 읽는다 — 렌더 중에 Date.now() 를 부르면 react-hooks/purity 에 걸린다.
    initial: pickNextUpSlot(Date.now(), clock),
    fixed: theme ? [theme] : [],
  };
}

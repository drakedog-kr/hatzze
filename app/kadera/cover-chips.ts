import "server-only";

import { getKrIndexCloses } from "@/lib/data";
import { getPreview } from "@/lib/kr-preview";
import { isLoadFailed, withScopedLoadFailures } from "@/lib/load-state";
import { getSurgingStocks } from "@/lib/telegram-data";
import { getUsSurgingStocks } from "@/lib/us-telegram-data";

import type { CoverLink } from "./V2Modules";

/**
 * v2 국장 카더라 첫 줄의 칩 둘(2026-10-03 요청) — **이 화면에 없는 것**을 하나씩 싣고 다른 화면으로 보낸다.
 *   ① 밤사이 미장에서 크게 움직인 종목 → 국장 미리보기
 *   ② 미장 카더라 급부상 1위 → 미장 카더라
 * 홈 '오늘 눈에 띄는 것' 칩(app/home/spotlight-data.ts)과 같은 재료 · 같은 규칙이다.
 * ⛔ 국장 급부상 · 테마 유입 · 화제어 칩은 넣지 않는다 — 바로 아래 급부상 표 1행 · 테마 카드 · 이슈 키워드 1행과 같은 값이다
 *    (10/2 수치 띠를 걷은 까닭과 같다).
 *
 * 칩은 곁가지라 조회가 실패해도 화면을 던지지 않고 그 칩만 뺀다 — 칩마다 제 실패 목록에 모은다(spotlight-data 의 chipOrNone 과 같은 까닭).
 */
export type CoverChip = CoverLink;

async function scoped(label: string, make: () => Promise<CoverChip | null>): Promise<CoverChip | null> {
  try {
    const { value, failed } = await withScopedLoadFailures(make);
    if (!failed.length) return value;
    console.error(`[kadera-chips] ${label} 조회가 실패했습니다 — 그 칩을 뺍니다: ${failed.join(", ")}`);
  } catch (e) {
    console.error(`[kadera-chips] ${label} 칩을 못 만들었습니다 — 그 칩을 뺍니다`, e);
  }
  return null;
}

const md = (iso: string) => iso.slice(5).split("-").map(Number).join("/");

/**
 * ① 밤사이 미장 — 미장이 쉬었거나 크게 움직인 종목이 없으면 칩을 안 세운다(할 말이 없는 칩).
 * ⭐ 머리말은 '밤사이'가 아니라 **미국 거래일 날짜**다('10/1 미장'). 미리보기는 평일 아침에만 돌아서 주말 · 휴장 내내 그 전 세션이 남는데,
 *    이 칩은 홈과 달리 하루 종일 서 있다(홈은 평일 아침에만 미장 칩을 세운다). 토요일 새벽에 '밤사이 미장'이 목요일 밤 세션을 가리켰다.
 *    여러 세션을 묶은 날(연휴 뒤)은 '9/30~10/1 미장'.
 */
async function previewChip(): Promise<CoverChip | null> {
  const p = await getPreview();
  const top = p.sectors[0]?.movers[0];
  if (p.usHoliday || !top || !p.date || !p.usSession) return null;
  return {
    cap: `${p.usFrom && p.usFrom < p.usSession ? `${md(p.usFrom)}~` : ""}${md(p.usSession)} 미장`,
    name: top.usName,
    // 소수 둘째 자리 — 같은 띠 지수(+0.46%) · 미리보기 표(-10.22%)와 자릿수를 맞춘다(2026-10-05 점검).
    val: `${top.dp > 0 ? "+" : top.dp < 0 ? "-" : ""}${Math.abs(top.dp).toFixed(2)}%`,
    tone: top.dp > 0 ? "up" : top.dp < 0 ? "down" : "flat",
    href: "/preview",
    ga: "kadera_chip_preview",
  };
}

/** ② 미장 카더라 급부상 1위 — 배수 표기는 미장 카더라 화면과 같다(10 이상은 정수). ga 는 화면마다 다르다(어느 화면의 칸을 눌렀나). */
async function usSurgingChip(ga = "kadera_chip_us_surging"): Promise<CoverChip | null> {
  const [top] = await getUsSurgingStocks(1, { withQuotes: false });
  if (!top || !Number.isFinite(top.multiple)) return null;
  return {
    cap: "미장 급부상",
    name: top.name,
    // '언급' 을 붙인다 — '6.3배'만이면 주가 배수로도 읽혔다(2026-10-04 점검). 첫 언급은 배수 대신 그 말(카더라 표와 같다).
    val: top.isNew ? "첫 언급" : `언급 ${top.multiple >= 10 ? Math.round(top.multiple) : top.multiple.toFixed(1)}배`,
    // 색을 싣지 않는다 — 빨강 · 파랑은 주가 오르내림 말이라 언급 배수에 칠하면 오른 종목처럼 읽혔다(카더라 표와 같은 규칙, 2026-10-05 점검).
    tone: "flat",
    href: "/kadera/us#surging",
    ga,
  };
}

/** 국장 카더라 급부상 1위 — 국장 미리보기 첫 줄이 쓴다. 평소 언급이 없던 종목은 배수가 무한대라 '첫 언급'(카더라 v2 표기). */
async function krSurgingChip(ga: string): Promise<CoverChip | null> {
  const [top] = await getSurgingStocks(1, { withQuotes: false });
  if (!top) return null;
  return {
    cap: "국장 급부상",
    name: top.name,
    val: top.isNew || !Number.isFinite(top.ratio) ? "첫 언급" : `언급 ${top.ratio >= 10 ? Math.round(top.ratio) : top.ratio.toFixed(1)}배`,
    tone: "flat",
    href: "/kadera#surging",
    ga,
  };
}

/**
 * 국장 미리보기(v2, 2026-10-03) 첫 줄의 칸 둘 — 개장 전 채널에서 말이 몰리는 종목. 국장 급부상 → 국장 카더라 · 미장 급부상 → 미장 카더라.
 * ⛔ 위 ① 밤사이 미장 칸은 미리보기 자신을 가리키므로 여기선 안 쓴다.
 */
export async function loadPreviewCoverChips(): Promise<CoverChip[]> {
  const chips = await Promise.all([
    scoped("국장 급부상", () => krSurgingChip("preview_chip_kr_surging")),
    scoped("미장 급부상", () => usSurgingChip("preview_chip_us_surging")),
  ]);
  return chips.filter((c): c is CoverChip => c !== null);
}

export async function loadCoverChips(): Promise<CoverChip[]> {
  const chips = await Promise.all([scoped("국장 미리보기", previewChip), scoped("미장 급부상", () => usSurgingChip())]);
  return chips.filter((c): c is CoverChip => c !== null);
}

/** 국장 종가 칸 — 미장 카더라 첫 줄이 쓴다. 코스피 마지막 종가 등락 → 국장 카더라(그 화면 첫 줄의 지수 칸과 같은 값). */
async function krCloseChip(): Promise<CoverChip | null> {
  const r = await getKrIndexCloses();
  if (isLoadFailed(r) || !r.kospi || r.kospi.changePct == null) return null;
  const c = r.kospi.changePct;
  return {
    cap: `${md(r.kospi.date)} 국장`,
    name: "코스피",
    val: `${c > 0 ? "+" : c < 0 ? "-" : ""}${Math.abs(c).toFixed(2)}%`,
    tone: c > 0 ? "up" : c < 0 ? "down" : "flat",
    href: "/kadera",
    ga: "kadera_us_chip_kr_close",
  };
}

/**
 * 미장 카더라(v2, 2026-10-03) 첫 줄 — 시장 맥락 칸(그 미국 거래일 S&P500 등락) + 국장 칸 둘(코스피 종가 · 국장 급부상).
 * 국장 카더라 첫 줄(코스피 · 코스닥 종가 + 미장 칸 둘)의 짝이다. 이 화면에 없는 것 → 다른 화면.
 * 국장 칸이 하나뿐이던 때 1,440 에서 업데이트 칸 앞이 400px 비었다(2026-10-04 점검) — 국장 첫 줄처럼 칸 둘로 거울을 맞춘다.
 * ⛔ 밤사이 미장 칸(위 ①)은 안 쓴다 — 그 종목은 이 화면의 '크게 움직인 종목' 표와 같은 이야기다.
 * 시장 맥락은 국장 미리보기 수집기가 받아 둔 값(getPreview().spx)이다. 미리보기가 못 돌았으면 칸만 빠진다.
 */
export type UsCover = { index: { label: string; spx: number } | null; chips: CoverChip[] };

export async function loadUsCover(): Promise<UsCover> {
  const [index, kr, close] = await Promise.all([
    (async () => {
      try {
        const { value: p, failed } = await withScopedLoadFailures(getPreview);
        if (failed.length || p.spx == null || !p.usSession) return null;
        return { label: `${p.usFrom && p.usFrom < p.usSession ? `${md(p.usFrom)}~` : ""}${md(p.usSession)} 미장`, spx: p.spx };
      } catch (e) {
        console.error("[kadera-chips] 미장 시장 맥락 칸을 못 만들었습니다 — 그 칸을 뺍니다", e);
        return null;
      }
    })(),
    scoped("국장 급부상", () => krSurgingChip("kadera_us_chip_kr_surging")),
    scoped("국장 종가", krCloseChip),
  ]);
  return { index, chips: [close, kr].filter((c): c is CoverChip => c !== null) };
}

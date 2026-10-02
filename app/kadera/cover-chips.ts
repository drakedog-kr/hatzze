import "server-only";

import { getPreview } from "@/lib/kr-preview";
import { withScopedLoadFailures } from "@/lib/load-state";
import { getUsSurgingStocks } from "@/lib/us-telegram-data";

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
export type CoverChip = {
  cap: string;
  name: string;
  val: string;
  tone: "up" | "down" | "flat";
  href: string;
  ga: string;
};

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
    val: `${top.dp > 0 ? "+" : top.dp < 0 ? "-" : ""}${Math.abs(top.dp).toFixed(1)}%`,
    tone: top.dp > 0 ? "up" : top.dp < 0 ? "down" : "flat",
    href: "/preview",
    ga: "kadera_chip_preview",
  };
}

/** ② 미장 카더라 급부상 1위 — 배수 표기는 미장 카더라 화면과 같다(10 이상은 정수). */
async function usSurgingChip(): Promise<CoverChip | null> {
  const [top] = await getUsSurgingStocks(1, { withQuotes: false });
  if (!top || !Number.isFinite(top.multiple)) return null;
  return {
    cap: "미장 급부상",
    name: top.name,
    val: `${top.multiple >= 10 ? Math.round(top.multiple) : top.multiple.toFixed(1)}배`,
    tone: "up",
    href: "/kadera/us#surging",
    ga: "kadera_chip_us_surging",
  };
}

export async function loadCoverChips(): Promise<CoverChip[]> {
  const chips = await Promise.all([scoped("국장 미리보기", previewChip), scoped("미장 급부상", usSurgingChip)]);
  return chips.filter((c): c is CoverChip => c !== null);
}

/**
 * app/og-colors.ts — 공유 카드 색이 theme.css 의 라이트 토큰과 같은가. Satori 가 CSS 변수를 못 읽어 값을 손으로
 * 옮겨 두는데, 팔레트를 바꿀 때 두 번 조용히 뒤처졌다(넉 달치 옛 값 · 걷어 낸 4색 게이지). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BLUE, BLUE_2, CARD_BG, CHIP, COLD, INK, OG_STAGES, SUB, TRACK, WARM_2 } from "../app/og-colors.ts";

const THEME = readFileSync(new URL("../app/styles/theme.css", import.meta.url), "utf8");
const SOURCE = readFileSync(new URL("../app/og-colors.ts", import.meta.url), "utf8");

/**
 * 토큰의 **라이트** 값. theme.css 는 라이트 `:root` 블록이 먼저이고 다크가 뒤에서 같은 이름을 다시 적으므로
 * 처음 나온 값이 라이트다.
 */
function light(token: string): string {
  const m = THEME.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8})\\b`));
  assert.ok(m, `theme.css 에 ${token} 이 없습니다`);
  return m[1].toLowerCase();
}

describe("공유 카드 색", () => {
  it("기본 색이 토큰과 같다", () => {
    const pairs: [string, string][] = [
      [INK, "--c-ink"],
      [SUB, "--c-sub"],
      [CARD_BG, "--c-card"],
      [TRACK, "--c-track"],
      [BLUE, "--c-blue"],
      [COLD, "--c-cold"],
      [WARM_2, "--c-warm-2"],
      [BLUE_2, "--c-blue-2"],
      [CHIP, "--c-chip"],
    ];
    for (const [value, token] of pairs) assert.equal(value.toLowerCase(), light(token), token);
  });

  it("과열도 네 구간이 히어로와 같은 토큰이다 — 잉크·알약 바탕·막대 칸", () => {
    const names = ["cold", "neutral", "hot", "mania"];
    assert.deepEqual(OG_STAGES.map((s) => s.label), ["저온", "상온", "고온", "초고온"]);
    OG_STAGES.forEach((s, i) => {
      assert.equal(s.ink.toLowerCase(), light(`--c-${names[i]}`), `${s.label} ink`);
      assert.equal(s.tint.toLowerCase(), light(`--c-${names[i]}-tint`), `${s.label} tint`);
      assert.equal(s.band.toLowerCase(), light(`--c-band-${names[i]}`), `${s.label} band`);
    });
  });

  it("주석의 대조표가 실제로 붙어 있다 — 값마다 어느 토큰인지 적는다", () => {
    for (const line of SOURCE.split("\n").filter((l) => /"#[0-9a-f]{6}"/i.test(l))) {
      assert.match(line, /--c-[a-z-]+/, `토큰 주석이 없는 색: ${line.trim()}`);
    }
  });
});

describe("주소창 색(app/layout.tsx THEME_COLOR)", () => {
  it("라이트 값이 화면 바탕 토큰과 같다", () => {
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    const m = layout.match(/THEME_COLOR\s*=\s*\{\s*light:\s*"(#[0-9a-fA-F]{6})"/);
    assert.ok(m, "layout.tsx 에서 THEME_COLOR 를 못 찾았습니다");
    assert.equal(m[1].toLowerCase(), light("--c-bg"));
  });
});

/**
 * app/og-copy.ts ogVersion — 공유 카드 주소의 버전. 글이 바뀌면 바뀌고, 안 바뀌면 그대로여야 한다(괜히 다시 긁게 하지 않는다).
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KADERA_CARD, MDD_CARD, ogVersion, themeCard } from "../app/og-copy.ts";

describe("ogVersion", () => {
  it("같은 카드는 늘 같은 버전이다", () => {
    assert.equal(ogVersion(KADERA_CARD.alt), ogVersion(KADERA_CARD.alt));
  });

  it("카드마다 다르다", () => {
    assert.notEqual(ogVersion(KADERA_CARD.alt), ogVersion(MDD_CARD.alt));
  });

  it("alt 가 같아도 본문 줄이 바뀌면 바뀐다 — 정적 카드는 글 전부를 센다", () => {
    const before = ogVersion(KADERA_CARD.alt);
    const lines = KADERA_CARD.lines;
    try {
      (KADERA_CARD as { lines: string[] }).lines = [...lines.slice(0, -1), "바뀐 줄"];
      assert.notEqual(ogVersion(KADERA_CARD.alt), before);
    } finally {
      (KADERA_CARD as { lines: string[] }).lines = lines;
    }
    assert.equal(ogVersion(KADERA_CARD.alt), before);
  });

  it("테마 한 장 카드는 alt 로 센다 — 테마 이름이 다르면 다르다", () => {
    const a = themeCard("반도체", "kr", "/theme/semiconductor");
    const b = themeCard("로봇", "kr", "/theme/robot");
    assert.notEqual(ogVersion(a.alt), ogVersion(b.alt));
    assert.match(ogVersion(a.alt), /^[0-9a-z]+$/);
  });
});

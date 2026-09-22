/**
 * lib/treemap.ts 의 squarify. 테마 목록의 트리맵이 쓴다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { squarify } from "../lib/treemap.ts";

describe("squarify", () => {
  it("넓이가 값에 비례하고 전체를 정확히 채운다", () => {
    const rects = squarify(
      [
        { key: "a", value: 6 },
        { key: "b", value: 6 },
        { key: "c", value: 4 },
        { key: "d", value: 3 },
        { key: "e", value: 2 },
        { key: "f", value: 2 },
        { key: "g", value: 1 },
      ],
      6,
      4,
    );
    const area = rects.reduce((s, r) => s + r.w * r.h, 0);
    assert.ok(Math.abs(area - 24) < 1e-9);
    const a = rects.find((r) => r.key === "a")!;
    assert.ok(Math.abs(a.w * a.h - 6) < 1e-9);
    for (const r of rects) {
      assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 6 + 1e-9 && r.y + r.h <= 4 + 1e-9, `${r.key} 가 밖으로 나갔다`);
    }
  });

  it("칸끼리 겹치지 않는다", () => {
    const rects = squarify(
      Array.from({ length: 26 }, (_, i) => ({ key: i, value: 40 / (i + 1) })),
      100,
      50,
    );
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(overlap <= 1e-6 || overlapY <= 1e-6, `${a.key}·${b.key} 겹침`);
      }
    }
  });

  it("0 이하 값은 빼고, 전부 0 이면 빈 배열", () => {
    assert.deepEqual(squarify([{ key: "a", value: 0 }], 10, 10), []);
    const rects = squarify(
      [
        { key: "a", value: 1 },
        { key: "b", value: -2 },
      ],
      10,
      10,
    );
    assert.equal(rects.length, 1);
    assert.equal(rects[0].w * rects[0].h, 100);
  });

  it("가장 큰 값이 첫 줄에 서고 종횡비가 지나치게 길지 않다", () => {
    const rects = squarify(
      [
        { key: "big", value: 39 },
        { key: "m1", value: 10 },
        { key: "m2", value: 8 },
        { key: "s1", value: 3 },
        { key: "s2", value: 2 },
      ],
      100,
      50,
    );
    const big = rects.find((r) => r.key === "big")!;
    assert.equal(big.x, 0);
    assert.equal(big.y, 0);
    for (const r of rects) {
      const ratio = Math.max(r.w / r.h, r.h / r.w);
      assert.ok(ratio < 4, `${r.key} 종횡비 ${ratio.toFixed(2)}`);
    }
  });
});

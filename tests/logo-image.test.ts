/**
 * lib/logo-image.ts — /api/logo 가 주는 그림은 늘 요청한 크기의 정사각형이고, 바탕이 투명하거나 밝은 로고는 칸 안쪽 둥근 네모에
 * 같은 크기로 닿아야 한다. 2.14.14 는 sharp 의 처리 순서(크기 맞추기가 여백보다 먼저)를 놓쳐 128px 요청에 271×480 을 줬고,
 * 로고마다 여백이 달라 칸의 4할에서 꽉 참까지 퍼지고 끝에 닿은 로고는 마스크에 잘렸다(2026-10-19). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import { FIT, P, fitLogoWebp } from "../lib/logo-image.ts";

/** 로고가 있는 그림만 넣으므로 늘 그림이 나와야 한다. */
async function fit(...args: Parameters<typeof fitLogoWebp>): Promise<Buffer> {
  const out = await fitLogoWebp(...args);
  assert.ok(out, "빈 그림으로 읽었다");
  return out;
}

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const RED = { r: 220, g: 0, b: 30, alpha: 1 };

/** side × side 바탕에 w × h 색 상자를 (left, top) 에 얹은 PNG. */
async function canvas(side: number, bg: typeof CLEAR, boxes: Array<{ w: number; h: number; left: number; top: number; color?: typeof RED }>) {
  const parts = await Promise.all(
    boxes.map(async (b) => ({
      input: await sharp({ create: { width: b.w, height: b.h, channels: 4, background: b.color ?? RED } }).png().toBuffer(),
      left: b.left,
      top: b.top,
    })),
  );
  return sharp({ create: { width: side, height: side, channels: 4, background: bg } }).composite(parts).png().toBuffer();
}

/** 지름 d 의 빨간 동그라미를 가운데 둔 투명 PNG. */
async function circle(side: number, d: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${d / 2}" fill="rgb(220,0,30)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** 빨간 잉크(흰색 · 투명이 아닌 픽셀)의 상자와, 칸 가운데에서 잰 초타원 반지름의 최댓값(칸 반지름 대비). */
async function inkOf(buf: Buffer) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width;
  let x0 = n, x1 = -1, y0 = n, y1 = -1, reach = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      if (data[i + 3] < 128 || Math.min(data[i], data[i + 1], data[i + 2]) > 200) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const dx = Math.abs(x + 0.5 - n / 2);
      const dy = Math.abs(y + 0.5 - n / 2);
      reach = Math.max(reach, Math.cbrt(dx ** P + dy ** P) / (n / 2));
    }
  const corner = [...data.subarray(0, 4)];
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, width: info.width, height: info.height, reach, corner };
}

describe("fitLogoWebp", () => {
  it("어떤 그림이든 요청 크기의 정사각형", async () => {
    const inputs = [
      await canvas(512, CLEAR, [{ w: 512, h: 112, left: 0, top: 200 }]),
      await canvas(300, WHITE, [{ w: 40, h: 40, left: 130, top: 130 }]),
      await canvas(300, { r: 0, g: 80, b: 200, alpha: 1 }, [{ w: 60, h: 120, left: 120, top: 90, color: { r: 255, g: 255, b: 255, alpha: 1 } }]),
      await circle(256, 250),
    ];
    for (const body of inputs)
      for (const size of [32, 48, 64, 128]) {
        const got = await inkOf(await fit(body, size));
        assert.equal(got.width, size);
        assert.equal(got.height, size);
      }
  });

  it("여백이 큰 작은 심볼은 키워서, 칸 끝에 닿은 로고는 줄여서 같은 안쪽 선에 닿게 얹는다", async () => {
    const small = await canvas(512, CLEAR, [{ w: 100, h: 100, left: 206, top: 206 }]);
    // 흰 바탕에서 양 끝에 닿은 두 글자(가운데는 비었다 — 띠가 아니다). 왼쪽 글자는 위 귀퉁이까지 닿았다.
    const edge = await canvas(512, WHITE, [
      { w: 150, h: 300, left: 0, top: 0 },
      { w: 150, h: 300, left: 362, top: 100 },
    ]);
    for (const body of [small, edge]) {
      const got = await inkOf(await fit(body, 64));
      assert.ok(got.reach <= FIT + 0.04, `안쪽 선 밖으로 나갔다 ${got.reach}`);
      assert.ok(got.reach >= FIT - 0.06, `안쪽 선에 못 닿았다 ${got.reach}`);
    }
    // 정사각형 심볼의 한 변 = FIT · 칸 / 2^(1/P)
    const sq = await inkOf(await fit(small, 64));
    assert.ok(Math.abs(sq.w - (FIT * 64) / Math.cbrt(2)) <= 2, `한 변 ${sq.w}`);
  });

  it("흰 바탕 그림은 흰 바탕을 그대로 두고, 투명 바탕은 투명으로 둔다", async () => {
    const white = await inkOf(await fit(await canvas(300, WHITE, [{ w: 40, h: 40, left: 130, top: 130 }]), 64));
    assert.deepEqual(white.corner.slice(0, 3).map((c) => c > 245), [true, true, true]);
    assert.ok(white.corner[3] > 250);
    const clear = await inkOf(await fit(await canvas(300, CLEAR, [{ w: 40, h: 40, left: 130, top: 130 }]), 64));
    assert.ok(clear.corner[3] < 8);
  });

  it("칸을 거의 채운 굵은 글자는 속이 8할 넘게 차도 아이콘이 아니라 글자로 보고 안쪽 선에 얹는다", async () => {
    // 굵은 N 꼴(023810) — 두 기둥이 위아래 끝까지, 가운데는 위쪽만. 상자 97% · 속 83% · 가운데 줄은 비었다(띠 아님)
    const body = await canvas(512, CLEAR, [
      { w: 170, h: 496, left: 8, top: 8 },
      { w: 170, h: 496, left: 334, top: 8 },
      { w: 156, h: 232, left: 178, top: 8 },
    ]);
    const got = await inkOf(await fit(body, 64));
    assert.ok(got.reach <= FIT + 0.04, `안쪽 선 밖으로 나갔다 ${got.reach}`);
  });

  it("바탕을 칠한 아이콘 · 칸을 꽉 채운 아이콘 · 가로 띠는 칸에 그대로 채운다", async () => {
    const icon = await inkOf(await fit(await canvas(300, { r: 0, g: 80, b: 200, alpha: 1 }, [{ w: 60, h: 120, left: 120, top: 90, color: { r: 255, g: 255, b: 255, alpha: 1 } }]), 64));
    assert.ok(icon.corner[3] > 250);
    const full = await inkOf(await fit(await canvas(512, CLEAR, [{ w: 500, h: 500, left: 6, top: 6 }]), 64));
    assert.ok(full.w >= 60, `꽉 찬 아이콘이 줄었다 ${full.w}`);
    // 칸 크기 그대로 마스크 안에 드는 동그라미 아이콘도 줄이지 않는다
    const round = await inkOf(await fit(await circle(512, 504), 64));
    assert.ok(round.w >= 60, `동그라미 아이콘이 줄었다 ${round.w}`);
    // 가운데 줄이 끝에서 끝까지 찬 띠 — 화면이 띠 색을 칸 바탕으로 깔아 이어야 하므로 양 끝에 닿아 있어야 한다
    const band = await inkOf(await fit(await canvas(512, CLEAR, [{ w: 512, h: 112, left: 0, top: 200 }]), 64));
    assert.equal(band.w, 64);
  });

  it("동그라미 심볼은 지름이 FIT", async () => {
    const got = await inkOf(await fit(await circle(512, 200), 128));
    assert.ok(Math.abs(got.w - FIT * 128) <= 3, `지름 ${got.w}`);
  });

  it("자를 상자를 주면 그 안 로고만 얹는다 — 조각 귀퉁이가 글자에 닿아도 칠한 바탕으로 읽지 않는다", async () => {
    // 흰 바탕에 첫 글자(정사각형 120) · 둘째 글자(정사각형 120)가 나란한 긴 로고. 상자는 첫 글자에 꼭 맞다.
    const body = await canvas(512, WHITE, [
      { w: 120, h: 120, left: 40, top: 196 },
      { w: 120, h: 120, left: 200, top: 196, color: { r: 0, g: 0, b: 0, alpha: 1 } },
    ]);
    const got = await inkOf(await fit(body, 64, [40 / 512, 196 / 512, 120 / 512, 120 / 512]));
    assert.equal(got.width, 64);
    assert.ok(Math.abs(got.w - (FIT * 64) / Math.cbrt(2)) <= 2, `조각 한 변 ${got.w}`);
    assert.ok(got.reach <= FIT + 0.04);
  });
});

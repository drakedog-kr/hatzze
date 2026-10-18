/**
 * lib/logo-image.ts — /api/logo 가 주는 그림은 늘 요청한 크기의 정사각형이어야 한다.
 * 2.14.14 는 sharp 의 처리 순서(크기 맞추기가 여백보다 먼저)를 놓쳐 128px 요청에 271×480 을 줬고, 동그라미 안 로고가 작게만
 * 보였다(한미반도체 · 대덕전자, 2026-10-19). 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import { cropSquareWebp, logoInset, squareWebp } from "../lib/logo-image.ts";

/** 가로 512 · 세로 512 투명 바탕에 빨간 가로 띠(긴 글자 로고 흉내) — 가로 0~511, 세로 200~312. */
async function wideLogo(): Promise<Buffer> {
  const band = await sharp({ create: { width: 512, height: 112, channels: 4, background: { r: 220, g: 0, b: 30, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: band, top: 200, left: 0 }])
    .png()
    .toBuffer();
}

/** 불투명 픽셀의 가로 · 세로 폭. */
async function inkSpan(buf: Buffer): Promise<{ w: number; h: number; width: number; height: number }> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, x1 = -1, y0 = info.height, y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, width: info.width, height: info.height };
}

describe("logoInset", () => {
  it("안쪽은 한 변의 1/1.28 · 여백 합이 나머지", () => {
    for (const size of [32, 48, 64, 80, 96, 128]) {
      const { inner, before, after } = logoInset(size);
      assert.equal(inner + before + after, size);
      assert.equal(inner, Math.round(size / 1.28));
    }
  });
});

describe("cropSquareWebp · squareWebp", () => {
  it("자른 조각은 늘 요청 크기의 정사각형이고, 긴 쪽이 안쪽 폭을 채운다", async () => {
    const body = await wideLogo();
    for (const size of [48, 128]) {
      const out = await cropSquareWebp(body, [0, 200 / 512, 1, 112 / 512], size);
      const span = await inkSpan(out);
      assert.equal(span.width, size);
      assert.equal(span.height, size);
      // 띠의 가로가 안쪽 폭(size/1.28)만큼 — 2.14.14 처럼 가운데 작게 남지 않는다
      assert.ok(Math.abs(span.w - logoInset(size).inner) <= 2, `size ${size}: 폭 ${span.w}`);
    }
  });
  it("정사각형 그림도 요청 크기 그대로", async () => {
    const sq = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 80, b: 200, alpha: 1 } } }).png().toBuffer();
    const out = await squareWebp(sq, 64);
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 64);
    assert.equal(meta.height, 64);
  });
});

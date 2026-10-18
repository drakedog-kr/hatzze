/**
 * lib/logo-crisp.ts — 원본이 작아 흐린 단색 로고는 경계를 다시 세우고(삼성전기 파란 S), 그러데이션은 건드리지 않고(에코프로 E),
 * 한 색뿐인 그림(logo.dev 가 로고 대신 주는 새까만 네모)은 빈 그림으로 읽는다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import { STEEP_MIN, crispen, isBlank, steepness, type Raw } from "../lib/logo-crisp.ts";
import { fitLogoWebp } from "../lib/logo-image.ts";

async function raw(buf: Buffer): Promise<Raw> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function svgPng(svg: string, blur?: number): Promise<Buffer> {
  const img = sharp(Buffer.from(svg)).png();
  return blur ? sharp(await img.toBuffer()).blur(blur).png().toBuffer() : img.toBuffer();
}

/** 파란 네모에 가는 흰 S 꼴(획 6px) — 128px 를 흐려 '작은 원본을 키운' 그림을 흉내 낸다. */
const S_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <rect x="14" y="14" width="100" height="100" fill="rgb(20,40,160)"/>
  <path d="M84 40 H48 V62 H80 V88 H44" fill="none" stroke="white" stroke-width="6"/>
</svg>`;

/** 밝은 파랑에서 진한 파랑으로 가는 그러데이션 E 꼴. */
const GRADIENT_E = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(120,200,255)"/><stop offset="1" stop-color="rgb(0,60,170)"/></linearGradient></defs>
  <path d="M30 20 H100 V40 H52 V54 H92 V74 H52 V88 H100 V108 H30 Z" fill="url(#g)"/>
</svg>`;

describe("crispen", () => {
  it("흐린 단색 로고는 경계가 다시 서고 가는 흰 획이 남는다", async () => {
    const blurry = await raw(await svgPng(S_ICON, 3));
    assert.ok(steepness(blurry) < STEEP_MIN, `흐린 그림이 아니다 ${steepness(blurry)}`);
    const sharp2 = crispen(blurry);
    assert.ok(sharp2, "단색 로고인데 손대지 않았다");
    assert.ok(steepness(sharp2) >= STEEP_MIN, `여전히 흐리다 ${steepness(sharp2)}`);
    // 가운데 가로 획(y 62 · x 50~78)이 흰색으로 남는다 — 흐린 봉우리를 문턱으로 자르면 파란색에 묻힌다
    const at = (x: number, y: number) => sharp2.data[(y * sharp2.width + x) * 4];
    const light = [52, 58, 64, 70, 76].filter((x) => at(x, 62) > 200).length;
    assert.ok(light >= 4, `흰 획이 사라졌다 ${light}`);
  });

  it("그러데이션은 띠로 바꾸지 않는다 — 속은 그대로 두고 경계만 세운다", async () => {
    const blurry = await raw(await svgPng(GRADIENT_E, 3));
    const out = crispen(blurry);
    // 손대지 않거나(null), 손대더라도 E 의 속(가운데 가로 획 왼쪽)은 원본 색 그대로여야 한다
    let maxDiff = 0;
    if (out)
      for (let y = 60; y < 66; y++)
        for (let x = 34; x < 46; x++)
          for (let c = 0; c < 4; c++) maxDiff = Math.max(maxDiff, Math.abs(out.data[(y * 128 + x) * 4 + c] - blurry.data[(y * 128 + x) * 4 + c]));
    assert.ok(maxDiff <= 12, `그러데이션 속이 바뀌었다 ${maxDiff}`);
  });
});

describe("isBlank", () => {
  it("한 색뿐인 그림만 빈 그림이다", async () => {
    const black = await raw(await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer());
    assert.equal(isBlank(black), true);
    assert.equal(isBlank(await raw(await svgPng(S_ICON))), false);
  });
});

describe("fitLogoWebp · crisp", () => {
  it("흐린 단색 로고를 선명하게 얹고, 한 색뿐인 그림은 null", async () => {
    const blurry = await svgPng(S_ICON, 3);
    const plain = await raw((await fitLogoWebp(blurry, 64))!);
    const crisp = await raw((await fitLogoWebp(blurry, 64, null, true))!);
    assert.ok(steepness(crisp) > steepness(plain) + 20, `선명해지지 않았다 ${steepness(plain)} → ${steepness(crisp)}`);
    const black = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    assert.equal(await fitLogoWebp(black, 64, null, true), null);
  });
});

import sharp from "sharp";

/**
 * /api/logo 가 그림을 정사각형으로 다듬는 셈(sharp). `server-only` 를 안 불러 `npm test` 로 바로 돈다(tests/logo-image.test.ts).
 *
 * ⚠️ sharp 는 부른 순서가 아니라 **정해진 순서로** 처리한다 — 크기 맞추기(resize)가 먼저, 여백 붙이기(extend)가 나중이다.
 *    2.14.14 는 '여백 → 크기' 순으로 써서, 128px 로 줄인 조각에 원래 크기 기준의 여백이 붙어 271×480 같은 그림이 나갔다.
 *    동그라미(contain)에 넣으니 로고가 가운데 작게만 보였다(한미반도체 · 대덕전자, 2026-10-19). 그래서 안쪽 크기로 먼저
 *    맞추고(contain) 남는 만큼만 여백을 붙여, 늘 size × size 가 되게 한다.
 */

const TRANSPARENT = { r: 255, g: 255, b: 255, alpha: 0 };

/**
 * 정사각형 안에서 로고가 차지할 한 변(안쪽)과 앞뒤 여백. 안쪽은 한 변의 1/1.28 — data-pipeline/common/logo_shape.square_png 와
 * 같은 여백이라 우리 그림(own)과 잘라 준 그림의 로고 크기가 같다.
 */
export function logoInset(size: number): { inner: number; before: number; after: number } {
  const inner = Math.round(size / 1.28);
  const margin = size - inner;
  return { inner, before: Math.floor(margin / 2), after: margin - Math.floor(margin / 2) };
}

/** 그림을 투명 여백을 둔 size × size WebP 로(비율은 그대로, 안쪽 정사각형에 contain). */
export async function squareWebp(body: Buffer, size: number): Promise<Buffer> {
  const { inner, before, after } = logoInset(size);
  return sharp(body)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extend({ top: before, bottom: after, left: before, right: after, background: TRANSPARENT })
    .webp({ quality: 90 })
    .toBuffer();
}

/** 그림 안 상자([x, y, w, h], 비율)를 잘라 size × size WebP 로. */
export async function cropSquareWebp(body: Buffer, crop: [number, number, number, number], size: number): Promise<Buffer> {
  const meta = await sharp(body).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const left = Math.min(W - 1, Math.max(0, Math.round(crop[0] * W)));
  const top = Math.min(H - 1, Math.max(0, Math.round(crop[1] * H)));
  const width = Math.max(1, Math.min(W - left, Math.round(crop[2] * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(crop[3] * H)));
  const piece = await sharp(body).extract({ left, top, width, height }).png().toBuffer();
  return squareWebp(piece, size);
}

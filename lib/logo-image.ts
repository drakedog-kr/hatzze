import sharp from "sharp";

import { STEEP_MIN, crispen, isBlank, steepness, type Raw } from "./logo-crisp.ts";

/**
 * /api/logo 가 그림을 로고 칸에 맞게 다듬는 셈(sharp). `server-only` 를 안 불러 `npm test` 로 바로 돈다(tests/logo-image.test.ts).
 *
 * ## 왜
 *
 * 로고 칸은 둥근 네모 마스크다(app/styles/badges.css .hz-stock-logo). logo.dev 그림은 로고마다 둘레 여백이 제각각이라
 * 화면에서 로고 크기가 칸의 4할에서 꽉 참까지 퍼졌고, 칸 끝까지 닿은 로고는 마스크 모서리에 잘렸다(국장 454종목 실측
 * 2026-10-19: 보이는 크기 5~95% 구간 0.40~1.00 · 마스크 밖으로 1% 넘게 나간 로고 37개).
 *
 * 그래서 바탕이 투명하거나 고르게 밝은 그림은 바탕을 걷어 로고만 남기고, **로고가 마스크를 FIT 만큼 줄인 안쪽 둥근 네모에
 * 닿도록** 다시 얹는다. 둥근 네모는 지수 P 의 초타원으로 셈한다(마스크 path 의 대각선 점 0.789 와 같다). 그러면 긴 글자 로고는
 * 칸 폭에 가깝게, 정사각형 심볼은 모서리가 안쪽 선에 닿게, 동그라미 심볼은 지름이 FIT 가 되어 어느 것도 잘리지 않고 둘레
 * 틈이 같다.
 *
 * 바탕을 칠한 그림(앱 아이콘 · 귀퉁이까지 색이 찬 그림)과 칸을 꽉 채운 아이콘 · 가로 띠 로고는 그 바탕이 곧 로고라 그대로
 * 칸에 채운다. 둘레 여백만 있는 아이콘 꼴(꽉 찬 네모 · 동그라미)은 여백을 걷고 칸을 채운다 — 같은 꼴이 여백 유무로 크기가 달랐다.
 * 가로 띠는 화면(StockLogo readBandColor)이 띠 색을 칸 바탕으로 깔아 이어 준다.
 *
 * ⚠️ sharp 는 부른 순서가 아니라 **정해진 순서로** 처리한다 — 크기 맞추기(resize)가 먼저, 여백 붙이기(extend)가 나중이다.
 *    2.14.14 는 '여백 → 크기' 순으로 써서 128px 요청에 271×480 같은 그림이 나갔다. 그래서 얹을 크기로 먼저 맞추고 남는 만큼만
 *    여백을 붙여 늘 size × size 가 되게 한다.
 */

/** 로고가 닿는 안쪽 둥근 네모 — 마스크의 이 비율. 24px 칸이면 둘레에 2px 쯤 틈이 남는다. */
export const FIT = 0.84;
/** 마스크(둥근 네모)를 흉내 내는 초타원 지수. 대각선 점이 2^(-1/P) = 0.794 로 마스크 path 의 0.789 와 맞는다. */
export const P = 3;

const TRANSPARENT = { r: 255, g: 255, b: 255, alpha: 0 };

type Rgb = { r: number; g: number; b: number };
/** 그림의 바탕. 'transparent' · 고르게 밝은 색(plain) · null(바탕을 칠한 그림 — 바탕이 곧 로고). */
export type Backdrop = { kind: "transparent" } | { kind: "plain"; color: Rgb } | null;
type Box = { left: number; top: number; width: number; height: number };

/**
 * 테두리 한 바퀴로 바탕을 가린다. 7할 넘게 진하게 칠해져 있으면 null(바탕을 칠한 그림). 투명이 많으면 투명, 밝은 색이 많고
 * 고르면 그 색. 밝은데 고르지 않으면(옅은 그러데이션 · 사진) null. 귀퉁이 넷만 보면 글자가 귀퉁이에 닿은 로고를 칠한 바탕으로 읽고,
 * 문턱이 낮으면 양옆 끝까지 닿은 글자(H 의 두 기둥이 위아래 끝까지 닿으면 테두리의 절반)를 칠한 바탕으로 읽는다. 귀퉁이를
 * 둥글게 깎은 아이콘은 테두리가 덜 칠해져도 아래 fillsTile 이 칸을 채우는 아이콘으로 가른다.
 */
export function backdropOf({ data, width, height }: Raw): Backdrop {
  const ring: number[] = [];
  for (let x = 0; x < width; x++) ring.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) ring.push(y * width, y * width + width - 1);
  const clear: number[] = [];
  const light: number[] = [];
  for (const p of ring) {
    const i = p * 4;
    if (data[i + 3] < 128) clear.push(i);
    else if (Math.min(data[i], data[i + 1], data[i + 2]) >= 225) light.push(i);
  }
  if (ring.length - clear.length - light.length > 0.7 * ring.length) return null;
  if (clear.length >= light.length) return { kind: "transparent" };
  const avg = [0, 1, 2].map((o) => Math.round(light.reduce((a, i) => a + data[i + o], 0) / light.length));
  const even = light.filter((i) => [0, 1, 2].every((o) => Math.abs(data[i + o] - avg[o]) <= 24)).length;
  if (even < 0.9 * light.length) return null;
  return { kind: "plain", color: { r: avg[0], g: avg[1], b: avg[2] } };
}

function isInk(data: Buffer, i: number, bg: Exclude<Backdrop, null>): boolean {
  if (data[i + 3] < 32) return false;
  if (bg.kind === "transparent") return Math.min(data[i], data[i + 1], data[i + 2]) <= 235;
  const { r, g, b } = bg.color;
  return Math.max(Math.abs(data[i] - r), Math.abs(data[i + 1] - g), Math.abs(data[i + 2] - b)) > 28;
}

/**
 * 영역(area) 안 로고의 꼭 맞는 상자와, 그 상자 가운데에서 잰 초타원 반지름의 최댓값(norm · 원본 픽셀).
 * 줄마다 가장 왼쪽 · 오른쪽 잉크만 보면 된다 — 같은 줄에선 가운데서 먼 쪽이 늘 더 크다. 로고가 없으면 null.
 */
export type InkMeasure = {
  box: Box;
  /** 상자 가운데에서 잰 초타원 반지름의 최댓값(원본 픽셀) */
  norm: number;
  /** 상자 안 로고 픽셀 비율 */
  fill: number;
  /** 상자 안 윤곽 비율 — 줄마다 첫 로고 픽셀에서 끝 로고 픽셀까지를 찬 것으로 센다(속에 뚫린 글자 · 무늬는 찬 것) */
  silhouette: number;
  /** 상자 네 변에서 4% 안쪽 줄 · 칸이 로고 픽셀로 찬 비율 가운데 가장 작은 것(꽉 찬 네모면 크다) */
  edge: number;
};

export function measureInk(raw: Raw, area: Box, bg: Exclude<Backdrop, null>): InkMeasure | null {
  const { data, width } = raw;
  const rows: Array<[number, number, number]> = [];
  let ink = 0;
  for (let y = area.top; y < area.top + area.height; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = area.left; x < area.left + area.width; x++) {
      if (!isInk(data, (y * width + x) * 4, bg)) continue;
      if (lo < 0) lo = x;
      hi = x;
      ink++;
    }
    if (lo >= 0) rows.push([y, lo, hi]);
  }
  if (!rows.length) return null;
  const top = rows[0][0];
  const bottom = rows[rows.length - 1][0] + 1;
  const left = Math.min(...rows.map((r) => r[1]));
  const right = Math.max(...rows.map((r) => r[2])) + 1;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  let norm = 0;
  let span = 0;
  for (const [y, lo, hi] of rows) {
    const dy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
    const dx = Math.max(cx - lo, hi + 1 - cx);
    norm = Math.max(norm, (dx ** P + dy ** P) ** (1 / P));
    span += hi - lo + 1;
  }
  const box = { left, top, width: right - left, height: bottom - top };
  const inX = Math.floor(0.04 * box.width);
  const inY = Math.floor(0.04 * box.height);
  const covered = (x0: number, y0: number, dx: number, dy: number, n: number) => {
    let k = 0;
    for (let j = 0; j < n; j++) if (isInk(data, ((y0 + j * dy) * width + x0 + j * dx) * 4, bg)) k++;
    return k / n;
  };
  const edge = Math.min(
    covered(left, top + inY, 1, 0, box.width),
    covered(left, bottom - 1 - inY, 1, 0, box.width),
    covered(left + inX, top, 0, 1, box.height),
    covered(right - 1 - inX, top, 0, 1, box.height),
  );
  const areaPx = box.width * box.height;
  return { box, norm, fill: ink / areaPx, silhouette: span / areaPx, edge };
}

/** 원본 상자 크기와 초타원 반지름으로, size 칸에 얹을 크기 · 자리. 로고가 안쪽 둥근 네모(마스크 × FIT)에 닿는다. */
export function placement(box: { width: number; height: number }, norm: number, size: number) {
  const scale = (FIT * size) / 2 / norm;
  const width = Math.min(size, Math.max(1, Math.round(box.width * scale)));
  const height = Math.min(size, Math.max(1, Math.round(box.height * scale)));
  return { width, height, left: Math.floor((size - width) / 2), top: Math.floor((size - height) / 2) };
}

/**
 * 칸을 채우는 아이콘이거나 가운데 줄이 끝에서 끝까지 찬 가로 띠인가. 아이콘은 상자가 그림의 9할 넘게 차고, 속이 9할 넘게 찬
 * 네모(둥근 네모 포함)이거나, 7할 반 넘게 찬 채로 칸 크기 그대로 마스크 안에 드는 꼴(동그라미)이다. 굵은 글자(N)는 속이 8할
 * 넘게 차도 모서리가 마스크 밖으로 나가므로 아이콘이 아니다 — 안쪽 선에 다시 얹는다(023810, 2026-10-19).
 * 띠는 투명 바탕이면 불투명한 픽셀로(흰 띠도 띠다), 밝은 바탕이면 로고 픽셀로 센다 — 밝은 바탕 그림은 어느 줄이나 불투명하다.
 */
function fillsTile(raw: Raw, area: Box, m: InkMeasure, bg: Exclude<Backdrop, null>): boolean {
  if (m.box.width >= 0.9 * area.width && m.box.height >= 0.9 * area.height) {
    if (m.fill >= 0.9) return true;
    if (m.fill >= 0.75 && m.norm <= 0.51 * Math.max(area.width, area.height)) return true;
  }
  const y = area.top + Math.floor(area.height / 2);
  let full = 0;
  for (let x = area.left; x < area.left + area.width; x++) {
    const i = (y * raw.width + x) * 4;
    if (bg.kind === "transparent" ? raw.data[i + 3] >= 250 : isInk(raw.data, i, bg)) full++;
  }
  return full >= 0.95 * area.width;
}

/**
 * 로고 상자가 아이콘 꼴인가 — 거의 정사각형이면서
 *  - 꽉 찬 네모(둥근 네모 포함): 윤곽이 9할 넘게 차고, 네 변 바로 안쪽 줄 · 칸이 7할 반 넘게 찬다. 속에 흰 글자가 뚫려 있어도
 *    된다(삼성전기 파란 네모에 흰 S). 굵은 글자(N · D · H)는 어느 한 변이 비어 아니다.
 *  - 꽉 찬 동그라미: 윤곽이 7할 반 넘게 차고 로고 픽셀이 반 넘으며, 상자 크기 그대로 마스크 안에 든다(가는 고리는 아니다).
 * fillsTile 의 아이콘 규칙을 그림 테두리 대신 로고 상자에 댄 것이다.
 */
function iconShape(m: InkMeasure): boolean {
  const aspect = m.box.width / m.box.height;
  if (aspect < 0.85 || aspect > 1 / 0.85) return false;
  if (m.silhouette >= 0.9 && m.edge >= 0.75) return true;
  return m.silhouette >= 0.75 && m.fill >= 0.5 && m.norm <= 0.51 * Math.max(m.box.width, m.box.height);
}

/** 그림을 비율만 지켜 size × size 칸에 채운다(바탕을 칠한 그림 · 다듬지 못한 그림). */
export function containWebp(body: Buffer, size: number): Promise<Buffer> {
  return sharp(body).resize(size, size, { fit: "contain", background: TRANSPARENT }).webp({ quality: 90 }).toBuffer();
}

/**
 * 받은 그림(crop 을 주면 그 안 상자 [x, y, w, h] · 비율)을 로고 칸에 맞춘 size × size WebP 로. 한 색뿐인 그림(로고 대신 오는
 * 새까만 네모)이면 null — 라우트가 '없음'으로 준다.
 * 바탕은 그림 전체의 귀퉁이로 가린다 — 잘라 낸 조각은 귀퉁이가 글자에 닿아 있어 조각만 보면 '칠한 바탕'으로 잘못 읽힌다.
 * `crisp` 면(LOGO_FETCH_SIZE 그림) 흐린 단색 로고의 경계를 먼저 다시 세운다(lib/logo-crisp.ts · 문턱이 128px 에서 잰 값이다).
 */
export async function fitLogoWebp(
  input: Buffer,
  size: number,
  crop?: [number, number, number, number] | null,
  crisp = false,
): Promise<Buffer | null> {
  let body = input;
  const { data, info } = await sharp(body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let raw: Raw = { data, width: info.width, height: info.height };
  if (isBlank(raw)) return null;
  if (crisp && steepness(raw) < STEEP_MIN) {
    const sharper = crispen(raw);
    if (sharper) {
      raw = sharper;
      body = await sharp(sharper.data, { raw: { width: sharper.width, height: sharper.height, channels: 4 } }).png().toBuffer();
    }
  }
  const W = raw.width;
  const H = raw.height;
  let area: Box = { left: 0, top: 0, width: W, height: H };
  if (crop) {
    const left = Math.min(W - 1, Math.max(0, Math.round(crop[0] * W)));
    const top = Math.min(H - 1, Math.max(0, Math.round(crop[1] * H)));
    area = {
      left,
      top,
      width: Math.max(1, Math.min(W - left, Math.round(crop[2] * W))),
      height: Math.max(1, Math.min(H - top, Math.round(crop[3] * H))),
    };
  }
  const bg = backdropOf(raw) ?? (crop ? { kind: "transparent" as const } : null);
  const m = bg && measureInk(raw, area, bg);
  if (!bg || !m || (!crop && fillsTile(raw, area, m, bg))) {
    const whole = crop ? await sharp(body).extract(area).png().toBuffer() : body;
    return containWebp(whole, size);
  }
  // 둘레 여백만 있는 아이콘(파란 네모에 흰 S · 동그라미 심볼)은 여백을 걷고 칸을 채운다 — 여백 없이 오는 같은 꼴의 아이콘과
  // 크기를 맞춘다(삼성전기는 여백이 있어 작게, 삼성SDI 는 꽉 차게 나왔다).
  if (!crop && iconShape(m)) return containWebp(await sharp(body).extract(m.box).png().toBuffer(), size);
  const at = placement(m.box, m.norm, size);
  const fill = bg.kind === "plain" ? { ...bg.color, alpha: 1 } : TRANSPARENT;
  return sharp(body)
    .extract(m.box)
    .resize(at.width, at.height, { fit: "fill" })
    .extend({ top: at.top, bottom: size - at.height - at.top, left: at.left, right: size - at.width - at.left, background: fill })
    .webp({ quality: 90 })
    .toBuffer();
}

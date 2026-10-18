/**
 * 흐린 단색 로고의 경계를 다시 세우는 셈과 빈 그림 판정 — /api/logo 가 LOGO_FETCH_SIZE(128px) 그림에 쓴다(lib/logo-image.ts).
 * 순수 셈이라 `npm test` 로 바로 돈다(tests/logo-crisp.test.ts).
 *
 * ## 왜
 *
 * 원본이 작은 로고는 logo.dev 가 키워서 주므로 경계가 몇 픽셀에 걸쳐 뭉개져 있다(삼성전기 · 삼성SDI 파란 S, 2026-10-19). 티커로 받는
 * 국장 1,138곳 중 80곳이 그랬고, 대부분 도메인 쪽도 같은 그림이라 바꿀 원본이 없다. 그런데 이런 로고는 대개 두세 가지 순색으로만
 * 칠해져 있다. 흐림은 두 순색 사이를 섞을 뿐이니, 각 픽셀이 두 순색 사이 어디쯤인지(t)를 구해 가운데를 가파르게 밀면 경계가 다시
 * 선다.
 *
 * - 셈은 미리곱(premultiplied) RGBA 에서 한다 — 흐림은 이 공간에서 곧은 섞임이라 투명 바탕과 색 사이도 같은 셈으로 다룬다.
 * - 순색은 평평한 픽셀(이웃과 거의 같은 색)에서 찾는다. 흐려서 봉우리만 남은 가는 획(삼성 S 의 흰 획)은 평평한 자리가 없어,
 *   어느 두 순색 사이에도 없는 픽셀의 봉우리를 순색으로 더한다.
 * - 가운데(문턱)는 주변(반지름 CRISP_RADIUS) t 의 최소 · 최대 사이로 잡는다. 흐려서 봉우리가 낮아진 가는 획이 사라지지 않는다.
 *   주변 t 차이가 작은 곳(평평한 면 · 완만한 그러데이션의 속)은 그대로 둔다.
 * - 그러데이션 · 사진은 손대면 띠가 생긴다(에코프로 E). 순색이 셋을 넘거나, 다시 흐렸을 때 원본과 맞지 않으면(CRISP_REBLUR_MAX)
 *   하지 않는다. 흐린 80장 중 29장이 이 문을 지났다.
 */

export type Raw = { data: Buffer; width: number; height: number };

/** 128px 그림에서 이웃 픽셀 밝기 차이 상위 1% 평균이 이보다 작으면 흐린 원본(data-pipeline refresh_stock_logo_sources.py 와 같은 문턱). */
export const STEEP_MIN = 45;
const FLAT_STEP = 6; // 이웃과 이만큼 안쪽이면 평평한 픽셀
const SEED_GAP = 48; // 순색끼리 이만큼 넘게 떨어져야 다른 색
const FIT_TOL = 24; // 평평한 픽셀이 순색에서 이만큼 안쪽이어야 단색 로고
const FAR = 32; // 두 순색 사이 선분에서 이만큼 넘게 떨어지면 못 잡은 색
const MAX_COLORS = 3;
const CRISP_RADIUS = 5;
const CRISP_GAIN = 4; // 경계 폭을 이만큼 줄인다(128px 에서 5~6px → 1.5px 안팎)
const CRISP_REBLUR_MAX = 5.5;

/** 흰 바탕에 얹은 밝기에서 이웃 픽셀 차이 상위 1% 의 평균. 작으면 경계가 완만하다(흐림). */
export function steepness({ data, width, height }: Raw): number {
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    const a = data[i * 4 + 3] / 255;
    const ch = (c: number) => data[i * 4 + c] * a + 255 * (1 - a);
    lum[i] = Math.round(ch(0) * 0.299 + ch(1) * 0.587 + ch(2) * 0.114);
  }
  const diffs: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x + 1 < width) diffs.push(Math.abs(lum[i + 1] - lum[i]));
      if (y + 1 < height) diffs.push(Math.abs(lum[i + width] - lum[i]));
    }
  diffs.sort((a, b) => b - a);
  const top = diffs.slice(0, Math.max(10, Math.floor(diffs.length / 100)));
  return top.reduce((s, v) => s + v, 0) / top.length;
}

function premultiply({ data }: Raw): Float32Array {
  const p = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    p[i] = data[i] * a;
    p[i + 1] = data[i + 1] * a;
    p[i + 2] = data[i + 2] * a;
    p[i + 3] = data[i + 3];
  }
  return p;
}

const far4 = (p: Float32Array, i: number, c: ArrayLike<number>) =>
  Math.max(Math.abs(p[i] - c[0]), Math.abs(p[i + 1] - c[1]), Math.abs(p[i + 2] - c[2]), Math.abs(p[i + 3] - c[3]));

/** 한 색뿐인 그림(logo.dev 가 로고 대신 주는 새까만 네모 · 039440 · 357120)인가. 픽셀 99.5% 가 평균색에서 8 안쪽. */
export function isBlank(raw: Raw): boolean {
  const p = premultiply(raw);
  const n = raw.width * raw.height;
  const mean = [0, 0, 0, 0];
  for (let i = 0; i < p.length; i++) mean[i % 4] += p[i] / n;
  let off = 0;
  for (let i = 0; i < p.length; i += 4) if (far4(p, i, mean) > 8) off++;
  return off < 0.005 * n;
}

/** 두 순색 사이 선분 위 자리 t(0~1)와 선분까지의 거리. */
function onSegment(p: Float32Array, i: number, a: number[], b: number[]): { t: number; dist: number } {
  let num = 0;
  let den = 0;
  for (let c = 0; c < 4; c++) {
    num += (p[i + c] - a[c]) * (b[c] - a[c]);
    den += (b[c] - a[c]) ** 2;
  }
  const t = den > 0 ? Math.min(1, Math.max(0, num / den)) : 0;
  let dist = 0;
  for (let c = 0; c < 4; c++) dist = Math.max(dist, Math.abs(p[i + c] - (a[c] + t * (b[c] - a[c]))));
  return { t, dist };
}

function nearestSegment(p: Float32Array, i: number, colors: number[][]): { pair: number; t: number; dist: number } {
  let best = { pair: 0, t: 0, dist: Infinity };
  let pair = 0;
  for (let a = 0; a < colors.length; a++)
    for (let b = a + 1; b < colors.length; b++, pair++) {
      const s = onSegment(p, i, colors[a], colors[b]);
      if (s.dist < best.dist) best = { pair, ...s };
    }
  return best;
}

/** 순색 찾기 — 평평한 픽셀을 4비트 묶음으로 세어 씨앗을 뽑고 k-평균으로 다듬는다. 단색 로고가 아니면 null. */
function pureColors(p: Float32Array, width: number, height: number): number[][] | null {
  const n = width * height;
  const flat: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let g = 0;
      if (x > 0) g = Math.max(g, far4(p, i, p.subarray(i - 4, i)));
      if (x + 1 < width) g = Math.max(g, far4(p, i, p.subarray(i + 4, i + 8)));
      if (y > 0) g = Math.max(g, far4(p, i, p.subarray(i - width * 4, i - width * 4 + 4)));
      if (y + 1 < height) g = Math.max(g, far4(p, i, p.subarray(i + width * 4, i + width * 4 + 4)));
      if (g <= FLAT_STEP) flat.push(i);
    }
  if (flat.length < 0.3 * n) return null;
  const count = new Uint32Array(65536);
  const sum = new Float64Array(65536 * 4);
  for (const i of flat) {
    const key = (Math.floor(p[i] / 16) << 12) | (Math.floor(p[i + 1] / 16) << 8) | (Math.floor(p[i + 2] / 16) << 4) | Math.floor(p[i + 3] / 16);
    count[key]++;
    for (let c = 0; c < 4; c++) sum[key * 4 + c] += p[i + c];
  }
  const keys = [...count.keys()].filter((k) => count[k] >= 0.01 * flat.length).sort((a, b) => count[b] - count[a]);
  let colors: number[][] = [];
  for (const k of keys) {
    const c = [0, 1, 2, 3].map((o) => sum[k * 4 + o] / count[k]);
    if (colors.every((d) => Math.max(...c.map((v, o) => Math.abs(v - d[o]))) > SEED_GAP)) colors.push(c);
    if (colors.length === 5) break;
  }
  if (colors.length < 2) return null;
  for (let round = 0; round < 6; round++) {
    const acc = colors.map(() => [0, 0, 0, 0, 0]);
    for (const i of flat) {
      let best = 0;
      for (let k = 1; k < colors.length; k++) if (far4(p, i, colors[k]) < far4(p, i, colors[best])) best = k;
      for (let c = 0; c < 4; c++) acc[best][c] += p[i + c];
      acc[best][4]++;
    }
    colors = colors.map((c, k) => (acc[k][4] ? acc[k].slice(0, 4).map((v) => v / acc[k][4]) : c));
  }
  const fit = flat.filter((i) => Math.min(...colors.map((c) => far4(p, i, c))) <= FIT_TOL).length;
  return fit >= 0.97 * flat.length ? colors : null;
}

/** 미리곱 RGBA 를 표준편차 sigma 가우스로 흐린다(가장자리는 늘여 채움). */
function gaussian(p: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * r + 1 }, (_, j) => Math.exp(-((j - r) ** 2) / (2 * sigma * sigma)));
  const ks = k.reduce((s, v) => s + v, 0);
  const pass = (src: Float32Array, dx: number, dy: number) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 4; c++) {
          let s = 0;
          for (let j = -r; j <= r; j++) {
            const xx = Math.min(width - 1, Math.max(0, x + j * dx));
            const yy = Math.min(height - 1, Math.max(0, y + j * dy));
            s += k[j + r] * src[(yy * width + xx) * 4 + c];
          }
          out[(y * width + x) * 4 + c] = s / ks;
        }
    return out;
  };
  return pass(pass(p, 1, 0), 0, 1);
}

/**
 * 흐린 단색 로고를 선명하게 다시 그린 RGBA. 단색 로고가 아니거나(그러데이션 · 사진 · 순색 넷 이상) 다시 흐렸을 때 원본과 맞지
 * 않으면 null — 그때는 원본을 그대로 쓴다.
 */
export function crispen(raw: Raw): Raw | null {
  const { width, height } = raw;
  const n = width * height;
  const p = premultiply(raw);
  const colors = pureColors(p, width, height);
  if (!colors) return null;
  // 평평한 자리가 없는 색(흐려서 봉우리만 남은 가는 획)을 더한다 — 어느 선분에서도 먼 픽셀 가운데 가장 먼 1할의 평균.
  const segDist = () => Array.from({ length: n }, (_, q) => (colors.length > 1 ? nearestSegment(p, q * 4, colors).dist : Infinity));
  for (let round = 0; round < 3 && colors.length < 5; round++) {
    const dist = segDist();
    const far = dist.map((d, q) => [d, q]).filter(([d]) => d > FAR);
    if (far.length < 0.005 * n) break;
    far.sort((a, b) => b[0] - a[0]);
    const top = far.slice(0, Math.max(8, Math.floor(far.length * 0.1)));
    colors.push([0, 1, 2, 3].map((c) => top.reduce((s, [, q]) => s + p[q * 4 + c], 0) / top.length));
  }
  if (colors.length > MAX_COLORS) return null;
  if (segDist().filter((d) => d > FAR).length >= 0.02 * n) return null;

  const pair = new Int16Array(n);
  const t = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    const s = nearestSegment(p, q * 4, colors);
    pair[q] = s.pair;
    t[q] = s.t;
  }
  const pairs: Array<[number, number]> = [];
  for (let a = 0; a < colors.length; a++) for (let b = a + 1; b < colors.length; b++) pairs.push([a, b]);
  const out = new Float32Array(p.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const q = y * width + x;
      let lo = Infinity;
      let hi = -Infinity;
      for (let yy = Math.max(0, y - CRISP_RADIUS); yy <= Math.min(height - 1, y + CRISP_RADIUS); yy++)
        for (let xx = Math.max(0, x - CRISP_RADIUS); xx <= Math.min(width - 1, x + CRISP_RADIUS); xx++) {
          const r = yy * width + xx;
          if (pair[r] !== pair[q]) continue;
          if (t[r] < lo) lo = t[r];
          if (t[r] > hi) hi = t[r];
        }
      const range = hi - lo;
      const t2 = range >= 0.15 ? Math.min(1, Math.max(0, 0.5 + ((t[q] - (lo + hi) / 2) / range) * CRISP_GAIN)) : t[q];
      const [a, b] = pairs[pair[q]];
      for (let c = 0; c < 4; c++) out[q * 4 + c] = colors[a][c] + t2 * (colors[b][c] - colors[a][c]);
    }
  // 다시 흐렸을 때 원본과 맞아야 경계만 세운 것이다(그러데이션을 띠로 바꿨으면 안 맞는다).
  const err = Math.min(
    ...[1, 1.5, 2, 2.5, 3, 4].map((s) => {
      const b = gaussian(out, width, height, s);
      let e = 0;
      for (let i = 0; i < b.length; i++) e += Math.abs(b[i] - p[i]);
      return e / b.length;
    }),
  );
  if (err > CRISP_REBLUR_MAX) return null;
  const data = Buffer.alloc(p.length);
  for (let i = 0; i < p.length; i += 4) {
    const a = Math.min(255, Math.max(0, out[i + 3]));
    data[i + 3] = Math.round(a);
    for (let c = 0; c < 3; c++) data[i + c] = a > 0 ? Math.round(Math.min(255, Math.max(0, (out[i + c] * 255) / a))) : 0;
  }
  return { data, width, height };
}

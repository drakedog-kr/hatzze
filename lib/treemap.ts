/**
 * 트리맵 배치(squarify). 값이 큰 것부터 넣어 칸이 되도록 정사각형에 가깝게 나온다.
 *
 * 테마 목록(/theme)이 26테마를 점유율 크기의 칸으로 그리는 데 쓴다. 라이브러리를 안 들이는
 * 이유는 종목 화면의 막대와 같다 — 40줄짜리 순수 함수라 서버 컴포넌트에서 그대로 돌고
 * 클라이언트 번들이 안 는다.
 *
 * 알고리즘은 Bruls·Huizing·van Wijk(2000)의 squarified treemap 그대로다. 남은 직사각형의
 * 짧은 변을 따라 한 줄을 채우되, 다음 값을 더했을 때 그 줄의 **최악 종횡비**가 나빠지는
 * 순간 줄을 확정하고 남은 자리로 넘어간다.
 *
 * 좌표는 0~width · 0~height 다. 화면은 퍼센트로 그리므로 100×(100/종횡비)를 넣으면
 * 그대로 CSS 값이 된다.
 */

export type TreemapItem<K> = { key: K; value: number };
export type TreemapRect<K> = { key: K; value: number; x: number; y: number; w: number; h: number };

/** 한 줄(row)에 든 값들을 남은 변의 길이 `side` 로 놓았을 때의 최악 종횡비. 작을수록 좋다. */
function worst(row: number[], side: number, scale: number): number {
  const sum = row.reduce((a, b) => a + b, 0) * scale;
  if (!sum || !side) return Infinity;
  const thick = sum / side; // 줄의 두께
  let w = 0;
  for (const v of row) {
    const len = (v * scale) / thick; // 그 칸의 길이
    w = Math.max(w, len / thick, thick / len);
  }
  return w;
}

export function squarify<K>(items: TreemapItem<K>[], width: number, height: number): TreemapRect<K>[] {
  const out: TreemapRect<K>[] = [];
  // 0 이하는 칸이 없다. 값이 큰 순서로 넣어야 squarify 가 성립한다.
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  if (!total || width <= 0 || height <= 0) return out;
  const scale = (width * height) / total; // 값 1 = 이만큼의 넓이

  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: TreemapItem<K>[] = [];

  const layoutRow = () => {
    const side = Math.min(w, h);
    const area = row.reduce((s, i) => s + i.value, 0) * scale;
    const thick = area / side;
    let along = 0;
    for (const i of row) {
      const len = (i.value * scale) / thick;
      if (w >= h) {
        // 짧은 변이 세로 → 줄은 왼쪽에 세로로 선다.
        out.push({ key: i.key, value: i.value, x, y: y + along, w: thick, h: len });
      } else {
        out.push({ key: i.key, value: i.value, x: x + along, y, w: len, h: thick });
      }
      along += len;
    }
    if (w >= h) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
    row = [];
  };

  for (const item of sorted) {
    const side = Math.min(w, h);
    const vals = row.map((r) => r.value);
    if (row.length && worst([...vals, item.value], side, scale) > worst(vals, side, scale)) {
      layoutRow();
    }
    row.push(item);
  }
  if (row.length) layoutRow();
  return out;
}

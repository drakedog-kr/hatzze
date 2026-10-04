/**
 * 이슈 키워드 열 줄에서 같은 화제를 두 번 세우지 않는다 — data-pipeline/common/keyword_overlap.py 의 사본(손으로 맞춘다).
 * 2026-10-04 국장 열 칸 중 셋이 같은 이야기였다(데이터센터 58 · AI데이터센터 54 · AI 44). 한 낱말이 다른 낱말을 품으면
 * (대소문자 · 띄어쓰기 무시) 위에 선 쪽 하나만 남기고, 혼자서는 무엇의 이야기인지 말하지 못하는 넓은 낱말은 뺀다.
 */

/** 거의 모든 글에 붙는 말. 파이프라인 BROAD 와 같은 목록. */
const KEYWORD_BROAD = new Set(["ai"]);

const norm = (w: string) => w.replace(/\s+/g, "").toLowerCase();

/** 차례(위가 먼저)를 지키며 넓은 낱말과, 이미 남긴 낱말을 품거나 거기 품기는 낱말을 뺀다. */
export function dropOverlaps(words: string[]): string[] {
  const kept: string[] = [];
  const seen: string[] = [];
  for (const w of words) {
    const n = norm(w);
    if (!n || KEYWORD_BROAD.has(n)) continue;
    if (seen.some((k) => n.includes(k) || k.includes(n))) continue;
    kept.push(w);
    seen.push(n);
  }
  return kept;
}

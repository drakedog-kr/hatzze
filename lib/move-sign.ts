/**
 * 이유 한 줄이 실제 등락과 반대로 섰나 — 국장 테마 '등락의 이유' · 종목 '왜 움직였나'가 거른다.
 *
 * 10-15 테마 화면에 '삼성SDI · ESS 수요 확대 기대에 이차전지 강세 · -8.63%'가 섰다(2026-10-15 점검). 채널 글이 적은 표기
 * 등락(quoted)이 전날 장 정리 글이나 장중 반짝 오른 글에서 와 부호가 틀렸고, 이유도 그쪽 글을 옮겼다.
 *
 * 두 신호가 **함께** 반대일 때만 반대로 본다.
 *   · 표기 부호만 보면 맞는 문장까지 뺀다 — 10-01 뒤 338줄 중 31줄이 걸렸는데 'LG이노텍 · 그룹주 동반 하락 -8.23%'처럼
 *     문장은 맞고 표기만 틀린 줄이 절반 넘었다.
 *   · 문장 낱말만 보면 '상장폐지 가처분 소송 인용(+30%)'처럼 나쁜 낱말이 든 호재를 뺀다.
 *   둘 다 반대인 줄은 같은 기간 9줄이었고 모두 문장이 실제와 반대였다.
 * 파이프라인(generate_move_reasons.pick_quoted · digest 의 [등락 방향])이 표기와 문장을 더 맞게 만들지만, 장중에 오르다
 * 내린 종목은 남는다 — 화면이 마지막으로 거른다.
 */
const UP = /강세|급등|상승|수혜|기대|호조|호재|돌파|신고가|상향|흑자|반등|모멘텀|훈풍|랠리|최대 실적|사상 최대/;
const DOWN = /약세|급락|하락|부진|우려|악재|하향|폭락|쇼크|배임|적자|감소|축소|논란|하회|매도세|차익 실현|경계|충격|부담/;

/** 이유 문장이 가리키는 방향 — 오름 낱말만 있으면 1, 내림 낱말만 있으면 -1, 둘 다거나 없으면 0(모름). */
export function reasonDirection(reason: string): 1 | -1 | 0 {
  const up = UP.test(reason);
  const down = DOWN.test(reason);
  return up && !down ? 1 : down && !up ? -1 : 0;
}

/** 표기 등락과 실제 등락의 부호가 갈렸나. 둘 중 하나라도 없거나 0이면 false(모르면 남긴다). */
export function moveSignsDisagree(quoted: number | null | undefined, actual: number | null | undefined): boolean {
  if (quoted == null || actual == null || !Number.isFinite(quoted) || !Number.isFinite(actual)) return false;
  if (quoted === 0 || actual === 0) return false;
  return quoted > 0 !== actual > 0;
}

/** 이 이유 줄을 뺄까 — 표기 부호도, 문장 방향도 실제 등락과 반대일 때만. */
export function reasonContradictsMove(reason: string, quoted: number | null | undefined, actual: number | null | undefined): boolean {
  if (!moveSignsDisagree(quoted, actual)) return false;
  const dir = reasonDirection(reason);
  return dir !== 0 && dir > 0 !== (actual as number) > 0;
}

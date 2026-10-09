/**
 * LLM 문장에 지시문이 샜는지 — data-pipeline/common/text_check.py `prompt_leaks` 의 사본(낱말 · 꼴만).
 * 순수 함수만 둔다(서버 전용 모듈은 테스트가 못 부른다 — tests/prompt-leak.test.ts).
 *
 * 2026-10-09 미장 급부상 1위 마벨 칸에 "…이를 22~30자 한 문장으로 담백하게 적습니다."(126자)가 실렸다.
 * 만드는 쪽이 이제 거르지만 화면이 한 번 더 거른다. 한 줄 요약은 기준일분이 없으면 전날 문장을 쓰는데
 * (LLM_TEXT_CARRY_DAYS), 만드는 쪽이 오늘 문장을 버리면 **전날 저장된 누출 문장이 그 자리에 다시 선다.**
 * 낱말 · 꼴을 바꾸면 파이썬 원본도 같이 — data-pipeline/tests/test_prompt_leaks.py 가 둘을 대조한다.
 */

const LEAK_WORDS = ["발췌"];
const LEAK_PATTERNS = [
  /\d+\s*~\s*\d+\s*자\s*(?:한|로|이내|안팎|내외|분량|짜리)/,
  /한\s*문장으로/,
  /(?:담백|담담|간결|짧)하게\s*(?:적|씁|쓰|정리|요약)/,
  /(?:하게|으로|로)\s+(?:적(?:겠)?습니다|씁니다|쓰겠습니다|작성(?:하겠습|합)니다|정리(?:하겠습|합)니다|요약(?:하겠습|합)니다)/,
];

/** 급부상 한 줄의 상한. 카드 한 줄이 26자라 40자면 이미 두 줄이다(generate_surging_oneliners.py LEN_CEIL). */
export const ONELINER_CEIL = 40;

export function hasPromptLeak(text: string): boolean {
  return LEAK_WORDS.some((w) => text.includes(w)) || LEAK_PATTERNS.some((re) => re.test(text));
}

/** 급부상 카드에 세워도 되는 한 줄인가. 아니면 그 줄을 버려 전날 문장이나 흐름 요약으로 물러나게 한다. */
export function usableOneliner(text: string | null | undefined): text is string {
  return !!text && text.length <= ONELINER_CEIL && !hasPromptLeak(text);
}

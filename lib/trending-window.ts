/**
 * 카더라 트렌딩 '오늘' 창의 시작 시각. lib/telegram-data.ts 의 getTrendingMessages 가 부르는
 * 순수 계산이다(DB 없이 테스트하려고 뗐다).
 *
 * 파이썬 사본은 data-pipeline/scripts/calculate_telegram_trending.py · calculate_us_trending.py 의
 * window_start 이고, 두 테스트가 같은 예제로 같은 시작점을 확인한다(tests/trending-window.test.ts ·
 * data-pipeline/tests/test_trending_window.py). 저장된 '오늘' 목록은 시작점이 이 값과 같을 때만
 * 쓰이므로(storedTrending), 둘이 갈리면 저장해 둔 목록을 버리고 느린 길로 뽑는다.
 */

/**
 * '오늘' 창이 어제 0시에서 오늘 0시로 넘어가는 시각(KST).
 *
 * 발사 시각(06:30)이 아니라 **아침 트렌딩 스텝이 저장하는 시각**에 맞춘다. 그 스텝은
 * .github/workflows/daily-update.yml 의 'KRX 공표(08:00 KST) 대기 — 개장 전 값 전용' 뒤라
 * 늘 08시 이후에 돌고, 이 값이 그보다 늦으면 아침 저장분이 '어제 0시부터'로 앉는다.
 * 2026-09-23 발사를 06:30 으로 당긴 뒤로 9 로 남아 있어서, 09시부터 저녁 실행까지 국장은
 * 저장 목록을 버리고 느린 길로 뽑았고 미장은 어제 글이 대부분인 목록을 '오늘'로 실었다.
 * ⚠️ 파이프라인 두 사본(calculate_telegram_trending.py · calculate_us_trending.py)과 같은 값.
 */
export const FIRST_COLLECTION_HOUR_KST = 8;

/**
 * '오늘' 창의 시작 시각.
 *
 * KST 오늘 0시로 그냥 잡으면 자정 직후 이 카드가 통째로 빈다 — 수집이 아침·저녁에만
 * 돌아서 새벽에는 오늘 글이 DB 에 아예 없기 때문이다(실측 KST 2026-07-22 00:31:
 * 오늘 0건 / 어제 471건). 볼 게 없는 게 아니라 아직 안 담긴 것뿐인데 "아직 화제
 * 메시지가 없습니다" 만 뜬다.
 *
 * 그래서 08시 전에는 전날 0시를 창 시작으로 쓴다. 그 뒤엔 아침 실행이 그날 글을 담은
 * 목록을 저장하므로 오늘 0시로 넘어간다. 08시부터 그 저장까지(보통 수십 분)는 시작점이
 * 어긋나 느린 길로 뽑는데, 수집은 06:30 발사 직후라 그때도 오늘 글이 있다.
 */
export function trendingTodayStartISO(nowMs: number = Date.now()): string {
  // nowMs+9h 의 UTC 시각 = KST 시각(todayKstDate 와 같은 방식).
  const kstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  const start = new Date(`${kstNow.toISOString().slice(0, 10)}T00:00:00+09:00`);
  if (kstNow.getUTCHours() < FIRST_COLLECTION_HOUR_KST) {
    start.setUTCDate(start.getUTCDate() - 1);
  }
  return start.toISOString();
}

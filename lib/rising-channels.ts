/**
 * 뜨는 채널 — 구독자 스냅샷에서 채널마다 증감을 낸다. lib/telegram-data.ts getRisingChannels 가 부르는
 * 순수 함수다(DB 없이 테스트하려고 뗐다, tests/rising-channels.test.ts).
 *
 * ## 창은 자료의 최신일에 매단다 (2026-09-29)
 *
 * 카드는 "최근 7일 · 7일 증감"이라고 적는다. 그런데 예전엔 조회 하한(UTC 날짜 8일 전, 그날 포함)이 곧 창이라
 * 스냅샷이 9개(8일 구간), 아침 수집 뒤 09시 KST 전에는 10개(9일 구간)가 잡혀 증감이 14~29% 부풀었다.
 * 벽시계로 하한을 7일로 당기면 이번엔 자정~아침 수집 사이에 오늘 스냅샷이 없어 6일이 된다. 그래서 받은 행의
 * **최신 날짜**에서 7일 전까지만 잰다 — 채널 랭킹(getChannelRanking)이 최신일에 매다는 것과 같은 방식이다.
 */

/** 증감을 재는 구간(일). 카드의 "최근 7일"·"7일 증감"과 같은 값이어야 한다. */
export const RISING_WINDOW_DAYS = 7;

/** telegram_channel_stats 의 한 행. 채널 하나당 KST 하루 한 행이다(sync_telegram_channels.py). */
export type ChannelSnapshot = { channel_handle: string; date: string; subscriber_count: number | null };

export type ChannelDelta = { handle: string; subscriberCount: number; delta: number };

/** "YYYY-MM-DD" 에 n일을 더한 날짜(lib/telegram-data.ts addDaysISO 와 같다 — 저쪽은 server-only 라 못 부른다). */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 채널마다 창의 첫 스냅샷 → 마지막 스냅샷 구독자 증감과, 실제로 잰 구간(일). 창은 행의 최신 날짜에서
 * RISING_WINDOW_DAYS 일 전까지(양끝 포함)다. 창 안 스냅샷이 둘 미만인 채널은 뺀다.
 */
export function channelDeltas(rows: ChannelSnapshot[]): { deltas: ChannelDelta[]; spanDays: number } {
  const latest = rows.reduce((m, r) => (r.date > m ? r.date : m), "");
  const from = latest ? addDays(latest, -RISING_WINDOW_DAYS) : "";
  const inWindow = rows.filter((r) => r.date >= from);

  const byCh = new Map<string, { d: string; s: number }[]>();
  for (const r of inWindow) {
    if (r.subscriber_count == null) continue;
    const arr = byCh.get(r.channel_handle) ?? [];
    arr.push({ d: r.date, s: r.subscriber_count });
    byCh.set(r.channel_handle, arr);
  }
  // 스냅샷은 백필이 안 돼 오늘부터 하루씩 쌓인다 — 지금 잰 구간이 며칠인지 그대로 알린다.
  const snapDates = [...new Set(inWindow.map((r) => r.date))].sort();
  const spanDays = snapDates.length
    ? Math.round(
        (new Date(snapDates[snapDates.length - 1]).getTime() - new Date(snapDates[0]).getTime()) / (24 * 60 * 60 * 1000),
      )
    : 0;

  const deltas: ChannelDelta[] = [];
  for (const [h, arr] of byCh) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.d.localeCompare(b.d));
    const delta = arr[arr.length - 1].s - arr[0].s;
    deltas.push({
      handle: h,
      subscriberCount: arr[arr.length - 1].s,
      delta,
    });
  }
  return { deltas, spanDays };
}

import "server-only";

/**
 * 원/달러 환율(FRED `DEXKOUS`). 내부자 리포트가 달러 금액 옆에 원화를 얹을 때 쓴다.
 *
 * 우리 파이프라인이 안 만드는 자료라 표에 넣지 않고 **Next 의 Data Cache** 에 얹는다 — 페이지가
 * 매번 그려도 `fetch` 단위 캐시는 따로 돌아 하루 몇 번만 부른다.
 *
 * ⚠️ 실패하면 **null 을 돌린다.** 0 으로 흘리면 화면이 "환율이 0원"으로 떠 고장이 사실처럼 읽힌다.
 *
 * 저작권: `DEXKOUS` 는 연준이 내는 H.10 이라 미 정부 저작물이다. 출처(이용약관 '데이터 출처'의 '미 연준(FRED)')만 밝히면 된다.
 *
 * (서학개미 장부가 쓰던 `lib/seohak-external.ts` 에서 이것만 떼어 왔다. 그 화면은 2026-09-27 에 코드째 걷었다.)
 */

/** 환율은 장중에 움직이지만 이 값은 달러 금액 옆에 얹는 참고용이라 6시간이면 넉넉하다. */
const REVALIDATE = 6 * 60 * 60;

export type UsdKrw = {
  /** 가장 최근 영업일 환율. */
  now: number;
  nowDate: string;
};

/**
 * 원/달러 최신 일별 값.
 *
 * 서학개미 장부가 쓰던 시절엔 월평균(1994~)도 함께 받았는데, 그걸 읽던 화면이 없어져 걷었다.
 * 내부자 리포트는 `now` 만 읽는다.
 */
export async function getUsdKrw(): Promise<UsdKrw | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DEXKOUS&api_key=${key}&file_type=json&sort_order=desc&limit=10`;
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const json = (await res.json()) as { observations?: { date: string; value: string }[] };
    // ⚠️ FRED 는 휴일을 "." 로 채워 보낸다. 최신 몇 개를 받아 값이 있는 첫 줄을 쓴다.
    const latest = (json.observations ?? []).find((o) => o.value !== ".");
    if (!latest) return null;
    return { now: Number(latest.value), nowDate: latest.date };
  } catch {
    return null;
  }
}

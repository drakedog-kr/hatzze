/**
 * 테마별 급부상 종목 줄 세우기 — lib/theme-page.ts listThemeRisers(국장)·lib/us-theme-page.ts listUsThemeRisers(미장)가
 * 부르는 순수 함수다(DB 없이 테스트하려고 뗐다, tests/theme-risers.test.ts). 고르는 것은 파이프라인
 * (data-pipeline/common/theme_risers.py)이고 여기는 요약 행에 적힌 것을 읽어 줄만 세운다 — 까닭은 listThemeRisers 주석.
 */

/** 후보가 되려면 최근 사흘에 이만큼은 언급돼야 한다. 두세 번 스친 작은 종목이 "10배"로 오르는 걸 막는다. */
export const RISER_MIN_MENTIONS = 5;
/** '말이 늘었다'고 칠 최소 배수. 종목 지도의 첫 색 단(1.5배)과 같다. 그 아래는 늘었다기보다 요동이다. */
export const RISER_MIN_RATIO = 1.5;
/** 카드에 세우는 최대 줄 수. 후보가 적으면 적은 대로 보인다 — '더 보기'는 두지 않는다(2026-09-21). */
export const RISER_MAX = 10;

export type ThemeRiser = {
  theme: string;
  code: string;
  name: string;
  market: string | null;
  /** 최근 사흘 언급. */
  recent: number;
  /** 그 앞 사흘 언급. 0 이면 새로 등장. */
  prior: number;
  /**
   * 최근 사흘 **몫** ÷ 앞 사흘 몫(테마 대화 총량에서 차지한 몫 · data-pipeline/common/theme_risers.py). 언급 수의 비율
   * (recent / prior)과 다를 수 있다 — 주말이 낀 창은 총량이 작아서다. prior 가 0 이면 null(새로 등장).
   */
  ratio: number | null;
  /** 채널이 말한 까닭(LLM, 42~58자). 파이프라인이 못 썼으면 null. */
  reason: string | null;
};

/** 요약 행의 riser 칸(파이프라인이 쓴 그대로). code 는 국장이면 6자리 코드, 미장이면 티커. */
export type RiserRow = { theme: string; date: string; riser: { code: string; name: string; market: string | null; recent: number; prior: number; ratio: number | null; reason: string | null } | null };

/**
 * 최신순 행에서 테마마다 첫 것만 골라 줄을 세운다(새로 등장 > 배수 > 언급 수, 최대 RISER_MAX). 미장도 같은 규칙.
 *
 * ⚠️ riser 가 빈 행도 받아서 **그 테마의 최신 행으로 친다.** 파이프라인은 테마마다 하루 한 행을 쓰고 오늘 상위
 *    RISER_MAX 에 못 든 테마는 riser: null 이다. 그 행을 조회에서 빼거나 여기서 건너뛰면 어제 riser 가 최신이 돼,
 *    어제의 배수·까닭이 오늘 것과 섞여 줄을 서고 오늘 것을 카드 밖으로 밀어냈다.
 */
export function parseRisers(rows: RiserRow[], known: (theme: string) => boolean): ThemeRiser[] {
  const seen = new Set<string>();
  const out: ThemeRiser[] = [];
  for (const r of rows) {
    if (!known(r.theme) || seen.has(r.theme)) continue;
    seen.add(r.theme);
    if (!r.riser?.code) continue; // 그 테마의 최신 행에 후보가 없다 — 줄이 없다.
    const s = r.riser;
    // 횟수가 그대로거나 준 종목은 줄을 세우지 않는다 — 파이프라인 pick_risers 와 같은 거름(2026-10-04 점검). 그 규칙 전에 저장된 행에도 건다.
    if ((Number(s.prior) || 0) > 0 && (Number(s.recent) || 0) <= (Number(s.prior) || 0)) continue;
    out.push({
      theme: r.theme,
      code: s.code,
      name: s.name,
      market: s.market ?? null,
      recent: Number(s.recent) || 0,
      prior: Number(s.prior) || 0,
      ratio: s.ratio == null ? null : Number(s.ratio),
      reason: s.reason?.trim() || null,
    });
  }
  const better = (a: ThemeRiser, b: ThemeRiser) => {
    // 새로 등장 > 배수 > 언급 수.
    if ((a.ratio === null) !== (b.ratio === null)) return a.ratio === null;
    if (a.ratio !== null && b.ratio !== null && a.ratio !== b.ratio) return a.ratio > b.ratio;
    return a.recent > b.recent;
  };
  return out.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0)).slice(0, RISER_MAX);
}

/** 기준일에 줄이 하나도 없을 때 거슬러 갈 날수 — 연휴(추석 닷새)도 넘게. */
export const RISER_FALLBACK_DAYS = 7;

/**
 * 화면에 세울 줄 — 이유가 있는 줄만. 기준일(carryFrom 부터 이어 읽기, parseRisers) 줄이 하나도 없으면 그 앞 날 가운데 줄이 있는
 * **가장 최근 하루**의 목록을 그날 날짜(asOf)와 함께 준다. 화면은 asOf 가 있으면 머리에 'n/n 기준'을 적는다.
 *
 * 왜: 급부상은 최근 사흘과 앞 사흘을 견주고 언급 수도 늘어야 줄을 세운다(pick_risers). 최근 사흘이 토 · 일 · 대체공휴일(10/3~10/5)이고
 * 앞 사흘이 평일이면 모든 종목의 언급 수가 줄어 국장 · 미장 카드가 통째로 비었다(2026-10-05 운영자 지적 "하나도 안 나온다").
 * 평일 기준일은 늘 10줄이 찬다(9/19~10/4 되돌려 잼 — 비는 날은 연휴 끝자락뿐). 견주는 방식은 그대로 두고 빈 날만 앞 날로 채운다.
 */
export function risersWithFallback(
  rows: RiserRow[],
  known: (theme: string) => boolean,
  carryFrom: string,
): { risers: ThemeRiser[]; asOf: string | null } {
  const withReason = (rs: RiserRow[]) => parseRisers(rs, known).filter((r) => r.reason);
  const now = withReason(rows.filter((r) => r.date >= carryFrom));
  if (now.length) return { risers: now, asOf: null };
  // 날마다 따로 본다 — 어제(이어 읽기 안의 날)도 오늘 행에 가려졌을 수 있다(테마마다 최신 행만 보므로).
  const days = [...new Set(rows.map((r) => r.date))].sort().reverse();
  for (const d of days) {
    const l = withReason(rows.filter((r) => r.date === d));
    if (l.length) return { risers: l, asOf: d };
  }
  return { risers: [], asOf: null };
}

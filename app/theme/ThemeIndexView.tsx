import Link from "next/link";

import { KADERA_WINDOW_DAYS } from "@/lib/telegram-data";
import { formatKstUpdate } from "@/lib/format";
import { fmtKoDate } from "@/lib/stock-page";
import { THEME_FLOW_DAYS, THEME_FLOW_TOP, type ThemeOverview, type ThemeRiser } from "@/lib/theme-page";

import { StockLogo } from "../StockLogo";
import { CoverLinkCell, CoverMeta, Module, type CoverLink } from "../kadera/V2Modules";
import type { ThemeMarket } from "./market";
import { ShareBar } from "./ShareBar";
import { Treemap, TreemapLegend, themeTiles, toneForRatio } from "./Treemap";

/**
 * 테마 목록의 본문 — **국장(/theme)과 미장(/theme/us)이 같이 쓴다.** 자료는 각자 읽어(lib/theme-page.ts · lib/us-theme-page.ts)
 * 같은 타입으로 넘기고, 시장마다 다른 것(주소·사전)은 ThemeMarket(app/theme/market.ts)이 든다.
 *
 * ## v2(2026-10-03) — 카더라 · MDD · 배당에 쓴 규칙으로
 * 첫 줄 띠(가장 많이 늘어난 · 가장 많이 줄어든 · 새로 상위에 오른 테마 · 업데이트) → 점유율 지도(판 폭 전체, 3:1) → 테마 흐름 → 테마별 급부상 종목.
 * - 걷은 것: 화면 제목 · 부제(셸이 v2 화면에서 걷는다), 회색 타일 히어로('관심 변화' · '상위권'), 시트 머리의 아이콘 타일 · 설명 문장,
 *   지도 위 안내 말풍선, '오늘의 브리핑' 문단 — 같은 사실을 세 번 말했다('반도체 59.8%'가 브리핑 · 지도 · 흐름 표에, 급부상 종목이
 *   브리핑 태그 · 급부상 표에).
 * - 테마 흐름 표(순위 · 테마와 말 많은 종목 · 요즘 도는 얘기 첫 문장 · 점유율 · 열흘)는 한때 지도 옆 좁은 '테마 순위'로 줄였다가
 *   되살렸다(2026-10-03 "기존 테마 흐름 카드도 있으면 좋겠다"). 그래서 순위 칸은 걷고(같은 열 테마를 두 번 그렸다) 지도를 판 폭 전체에
 *   낮게 편다. 띠의 '1위 테마'도 걷었다 — 흐름 표 첫 줄과 같은 말이다(카더라 v2 '아래 모듈 1등을 되풀이하지 않는다').
 *
 * 제목은 셸이 그린다(화면에서만 걷고 h1 은 남는다 · AppShell isV2Page). 이 파일은 본문만 낸다.
 */

/**
 * 열흘 흐름 한 조각 — n일째 5위 안 · 다시 5위 안 · 처음 5위 안 · 열흘 중 n일 5위 안 · 5위 밖. 판정은 lib/theme-page.ts listThemeOverview.
 * ⭐ '상위'라 부르지 않고 몇 위인지 적는다 — 표가 '점유율 상위 10'이라 6~10위 줄에 '상위 밖'이 붙어 서로 반대말로 읽혔다(2026-10-04 점검).
 */
function flowCaption(t: ThemeOverview): { text: string; on: boolean } {
  const top = `${THEME_FLOW_TOP}위`;
  // 연속 하루째인데 열흘 안에 5위 안이던 날이 더 있으면 "돌아온" 것이다 — "1일째"는 어색하다.
  if (t.label === "streak") return { text: t.streak === 1 ? `다시 ${top} 안` : `${t.streak}일째 ${top} 안`, on: true };
  if (t.label === "new") return { text: t.streak === 1 ? `처음 ${top} 안` : `2일째 ${top} 안`, on: true };
  if (t.label === "intermittent") return { text: `10일 중 ${t.topDays}일 ${top} 안`, on: false };
  return { text: `${top} 밖`, on: false };
}

/** 흐름 표의 줄 수 — 상위 열 줄이면 지금 화제인 테마가 다 들어온다. 더 보기는 두지 않는다(2026-09-21) — 나머지는 지도에 있다. */
const FLOW_ROWS = 10;

/**
 * 태그 글자 — 바로 옆 칸의 **횟수**(최근 · 그 전)와 같은 잣대로 적는다. 몫의 배수(r.ratio, 줄 세우는 잣대)를 적으면 '39회 · 그 전 3회'
 * 옆에 '31.0배'가 서서 셈이 안 맞았다(2026-10-04 점검). 꼴은 테마 화면 '말 많은 종목'과 같다(3배부터 반올림 · 10배 넘게에서 멈춤).
 * 줄은 횟수가 는 종목만이라(lib/theme-risers.ts parseRisers) 손해로 읽히는 배수는 안 나온다.
 */
function riserMultiple(r: ThemeRiser): number | null {
  return r.ratio === null || r.prior <= 0 ? null : r.recent / r.prior;
}
function riserDelta(r: ThemeRiser): string {
  const x = riserMultiple(r);
  if (x === null) return "새로 등장";
  if (x >= 10) return "앞 3일의 10배 넘게";
  if (x >= 3) return `앞 3일의 ${Math.round(x)}배`;
  return `앞 3일보다 +${Math.round((x - 1) * 100)}%`;
}

// 부호는 반올림한 값으로 — −0.04 가 '−0.0%p'로 찍혔다(2026-10-04 점검).
const pp = (v: number) => {
  const r = Number(v.toFixed(1));
  return `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(1)}%p`;
};

export function ThemeIndexView({
  market,
  themes,
  risers,
  updatedAt,
}: {
  market: ThemeMarket;
  /** null = 집계를 못 읽었다. */
  themes: ThemeOverview[] | null;
  /** null = 요약 행을 못 읽었다. 이유 없는 줄은 부르는 쪽이 이미 걸렀다. */
  risers: ThemeRiser[] | null;
  /** 카더라 화면과 같은 기준 시각(themeUpdatedAt → lastKaderaUpdatedAt). */
  updatedAt: string | null;
}) {
  const all = themes ?? [];
  const flowDates = all[0]?.flowDates ?? [];

  /* 첫 줄 띠 — 오늘 무엇이 달라졌나. 칸마다 다른 테마를 세운다(옛 히어로 '같은 테마를 두 번 세우지 않는다'와 같은 규칙).
     관심 변화 둘(가장 많이 늘어난 · 줄어든, 5일 전 대비) + 상위권의 문 하나(새로 상위에 오른 → 없으면 상위에서 내려간 → 순위가 가장 오른). */
  const used = new Set<string>();
  const pick = <T,>(list: T[], nameOf: (x: T) => string) => {
    const x = list.find((y) => !used.has(nameOf(y))) ?? null;
    if (x) used.add(nameOf(x));
    return x;
  };
  const byDelta = all.filter((t) => t.shareDelta != null).sort((a, b) => (b.shareDelta as number) - (a.shareDelta as number));
  const gainer = pick(byDelta.filter((t) => (t.shareDelta as number) > 0), (t) => t.theme);
  const loser = pick([...byDelta].reverse().filter((t) => (t.shareDelta as number) < 0), (t) => t.theme);
  const fresh = pick(all.filter((t) => t.label === "new").sort((a, b) => a.rank - b.rank), (t) => t.theme);
  // 어제는 5위 안이었는데 오늘은 밖인 테마. 어제 · 오늘 둘 다 **표의 순위**(최근 3일 점유율)로 본다 — 어제 하루 순위와 견주면
  // 표에서 오르는 중인 조선이 '밀린 테마'로 떴다(2026-10-04 점검, lib/theme-flow.ts prevWindowRanks).
  const dropped = fresh
    ? null
    : pick(
        all
          .filter((t) => t.prevRank3 != null && t.prevRank3 <= THEME_FLOW_TOP && t.rank > THEME_FLOW_TOP)
          .sort((a, b) => a.rank - b.rank),
        (t) => t.theme,
      );
  // 흐름 표(FLOW_ROWS)에 서는 테마만 — 18위 '음식료 +6계단'은 표에도 지도 이름에도 없어 띠를 본 사람이 찾을 수 없었다(2026-10-05 점검).
  const climber =
    fresh || dropped
      ? null
      : pick(
          all.filter((t) => (t.rankChange ?? 0) > 0 && t.rank <= FLOW_ROWS).sort((a, b) => (b.rankChange as number) - (a.rankChange as number)),
          (t) => t.theme,
        );
  const coverLinks: CoverLink[] = [
    gainer ? { cap: "가장 많이 늘어난 테마", name: gainer.theme, val: pp(gainer.shareDelta as number), tone: "up" as const, href: market.themeHref(gainer.theme), ga: "theme_cover_gainer" } : null,
    loser ? { cap: "가장 많이 줄어든 테마", name: loser.theme, val: pp(loser.shareDelta as number), tone: "down" as const, href: market.themeHref(loser.theme), ga: "theme_cover_loser" } : null,
    fresh
      ? { cap: `새로 ${THEME_FLOW_TOP}위 안에 든 테마`, name: fresh.theme, val: `${fresh.rank}위`, tone: "up" as const, href: market.themeHref(fresh.theme), ga: "theme_cover_fresh" }
      : dropped
        ? { cap: `${THEME_FLOW_TOP}위 밖으로 밀린 테마`, name: dropped.theme, val: `${dropped.rank}위`, tone: "down" as const, href: market.themeHref(dropped.theme), ga: "theme_cover_dropped" }
        : climber
          ? { cap: "순위가 가장 오른 테마", name: climber.theme, val: `+${climber.rankChange}계단`, tone: "up" as const, href: market.themeHref(climber.theme), ga: "theme_cover_climber" }
          : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <div className="hz-tx v2-kd v2-tm">
      {/* 첫 줄 — 오늘 무엇이 달라졌나(링크 칸 셋) · 언제 · 무엇을 셌나 */}
      <div className="v2-cover">
        {coverLinks.map((c) => (
          <CoverLinkCell key={c.ga} c={c} />
        ))}
        {/* 근거는 걷었다 — '최근 3일 언급'은 지도 머리, 견준 기간은 흐름 머리가 말한다. 근거를 붙이면 링크 칸 셋 뒤 업데이트가
            1,280 · 1,366 · 1,440(미장)에서 둘째 줄로 내려가 띠 절반이 비었다(2026-10-05 점검). */}
        <CoverMeta updated={updatedAt ? formatKstUpdate(updatedAt, "업데이트") : "업데이트 준비 중"} />
      </div>

      {/* 둘째 줄 — 점유율 지도. 판 폭 전체에 낮게(3:1) — 칸 크기 = 최근 3일 언급 점유율, 색 = 5일 전 대비 변화. 누르면 그 테마 화면. */}
      {/* 견준 기간을 글자로 — '평소'는 테마 한 장에서 다른 잣대(말 많은 종목 태그 · 앞 27일)라 두 뜻이 됐다(2026-10-05 점검). */}
      <Module title="테마 점유율 지도" meta={`최근 ${KADERA_WINDOW_DAYS}일 언급 점유율 · 1~2주 전 대비`} className="v2-tm-map">
        {themes === null ? (
          <p className="v2-empty">테마 집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.</p>
        ) : themes.length === 0 ? (
          <p className="v2-empty">아직 집계된 테마가 없습니다.</p>
        ) : (
          <>
            <div className="v2-tm-map-in">
              <Treemap tiles={themeTiles(themes, market.key)} ariaLabel="테마별 최근 3일 언급 점유율" aspect={3} />
            </div>
            {/* 색은 평소(5일 이상 전 평균) 대비 변화 — '변화 ±0.3%p 안'은 무엇과 견준 변화인지 안 읽혔다(2026-10-04 점검). */}
            <div className="v2-tm-map-legend">
              <TreemapLegend up="늘어난 테마" flat="비슷" down="줄어든 테마" />
            </div>
            {/* 폰은 지도 대신 막대 하나(앞 다섯 + 나머지) — 3:2 지도에선 26칸 중 이름이 든 칸이 하나뿐이었다(2026-10-04 점검). */}
            <div className="v2-tm-map-bar">
              <ShareBar
                stocks={themes.map((t) => ({ code: t.theme, name: t.theme, mentions: t.sharePct }))}
                ariaLabel="테마별 최근 3일 언급 점유율"
                unit="테마"
              />
            </div>
          </>
        )}
      </Module>

      {/* 셋째 줄 — 테마 흐름. 점유율 상위 열 테마 한 줄씩: 순위 · 테마와 말 많은 종목 · 요즘 도는 얘기 첫 문장(✨) · 점유율(5일 전 대비) · 열흘.
          ⭐ 칸 차례는 이름 → 문장 → 숫자(2026-10-04 "텍스트 배치가 이상하다"). 숫자 칸(오른쪽 정렬)이 문장(왼쪽 정렬) 앞에 서면 '10일 중 3일 상위'와
          문장 첫 낱말이 12px 사이로 붙어 한 덩어리로 읽혔다. 숫자는 줄 오른쪽 끝에 모으고, 5일 전 대비(+4.0%p)는 테마 이름 옆에서 점유율 아래로 옮겼다 —
          그 숫자가 꾸미는 값 바로 밑이다. */}
      <Module
        id="flow"
        title="테마 흐름"
        // 요즘 도는 얘기 첫 문장이 AI 글이라 고지는 모듈 머리에 둔다(카더라 네 표와 같은 자리, 2026-10-04 점검).
        ai
        // 점유율 아래 +%p 는 평소(5일 이상 전 평균) 대비 — 머리에 적는다(2026-10-04 점검).
        // 날짜 범위는 뺐다 — 열흘 값처럼 읽혔는데 점유율 칸은 최근 3일이고 열흘은 마지막 칸('최근 10일' 머리 · 줄 툴팁)뿐이다(2026-10-04 점검).
        meta={`점유율 상위 ${FLOW_ROWS} · 1~2주 전 대비`}
      >
        {themes === null || themes.length === 0 ? (
          <p className="v2-empty">{themes === null ? "테마 집계를 지금 불러오지 못했습니다." : "아직 집계된 테마가 없습니다."}</p>
        ) : (
          <div className="v2-tbl v2-tm-flowtbl">
            <div className="v2-tr v2-th" aria-hidden="true">
              <span />
              <span>테마 · 말 많은 종목</span>
              <span>요즘 도는 얘기</span>
              <span>최근 {KADERA_WINDOW_DAYS}일 점유율</span>
              <span>최근 {flowDates.length || THEME_FLOW_DAYS}일</span>
            </div>
            <ol className="v2-tbody">
              {themes.slice(0, FLOW_ROWS).map((t) => {
                const cap = flowCaption(t);
                const d = t.shareDelta;
                return (
                  <li key={t.theme}>
                    {/* 날마다의 순위는 툴팁(줄 title)에 — 줄에는 열흘의 뜻 한 조각만(순위 칸 띠 · 색 띠 · 스파크라인 셋 다 "복잡하다"였다, 2026-09-19). */}
                    <Link
                      href={market.themeHref(t.theme)}
                      className="v2-tr"
                      // 마지막 칸은 칸 글자처럼 표의 순위(최근 3일)다 — 하루 순위를 적으면 칸('n일째 5위 안')과 어긋났다.
                      title={`최근 ${t.flowDates.length}일 순위 ${t.flow
                        .map((r, i) =>
                          i === t.flow.length - 1
                            ? `${fmtKoDate(t.flowDates[i])}(최근 3일) ${t.rank}위`
                            : `${fmtKoDate(t.flowDates[i])} ${r == null ? "집계 없음" : `${r}위`}`,
                        )
                        .join(" · ")}`}
                      data-ga="theme_flow_click"
                    >
                      <span className="v2-td-rank">{t.rank}</span>
                      <span className="v2-td-theme2">
                        <b>{t.theme}</b>
                        <span className="v2-td-sub">{t.topStocks.length ? t.topStocks.map((x) => x.name).join(" · ") : "최근 언급 없음"}</span>
                      </span>
                      <span className={`v2-td-text${t.briefLine ? "" : " is-pending"}`}>{t.briefLine ?? "-"}</span>
                      {/* 점유율 · 그 아래 5일 전 대비(움직임이 0.05%p 아래면 안 적는다). */}
                      <span className="v2-td-num v2-td-two v2-td-share">
                        {t.sharePct.toFixed(1)}%
                        {d != null && Math.abs(d) >= 0.05 && <em className={d > 0 ? "is-up" : "is-down"}>{pp(d)}</em>}
                      </span>
                      {/* 열흘 — 지속 · 첫 등장 · 간헐 한 조각. ⛔ 'n일째 오르는 중'은 걷었다 — 바로 옆 '-3.0%p'(1~2주 전 대비)와 잣대가 달라
                          한 줄에 반대말로 섰다(2026-10-05 점검). 날마다의 방향은 테마 한 장 30일 추이의 몫이다. */}
                      <span className="v2-td-two v2-td-flow2">
                        <span className={`v2-td-flow${cap.on ? " is-on" : ""}`}>{cap.text}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </Module>

      {/* 셋째 줄 — 테마별 급부상 종목. 테마마다 3일 전보다 언급(몫)이 가장 많이 는 종목 하나와 채널이 말한 까닭.
          고르는 것도 까닭을 쓰는 것도 파이프라인이고(generate_theme_briefs.py) 화면은 요약 행의 riser 를 읽는다. 카더라의 신호 표와 같은 줄 꼴.
          칸 차례는 테마 흐름과 같이 이름(테마 · 종목) → 문장 → 숫자(언급)다(2026-10-04). */}
      <Module id="risers" title="테마별 급부상 종목" meta={`최근 ${KADERA_WINDOW_DAYS}일 · 앞 3일 대비`} ai>
        {risers === null ? (
          <p className="v2-empty">테마 요약을 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.</p>
        ) : risers.length === 0 ? (
          <p className="v2-empty">앞 3일보다 언급이 늘고 채널이 이유를 말한 종목이 없습니다.</p>
        ) : (
          <div className="v2-tbl v2-tm-risertbl">
            <div className="v2-tr v2-th" aria-hidden="true">
              <span>테마</span>
              <span>종목</span>
              {/* 채널이 그 종목에 대해 말한 이유다 — 바로 위 테마 흐름 표의 '요즘 도는 얘기'(테마 요약 첫 문장)와 다른 글이라 이름을 가른다(상세 화면과 같은 말). */}
              <span>채널이 말한 이유</span>
              <span>최근 {KADERA_WINDOW_DAYS}일 언급</span>
            </div>
            <ol className="v2-tbody">
              {risers.map((r) => (
                <li key={r.theme} id={`riser-${r.code}`}>
                  <div className="v2-tr">
                    <Link href={market.themeHref(r.theme)} className="v2-td-theme" data-ga="theme_riser_theme_click">
                      {r.theme}
                    </Link>
                    {/* 종목 + 앞 3일 대비 태그(테마 화면 '말 많은 종목'과 같은 태그 · 같은 색 단계). 색은 태그에 적은 횟수 배수 그대로. */}
                    <Link href={market.stockHref(r.code)} className="v2-td-stock" data-ga="theme_riser_stock_click">
                      <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
                      <span className="v2-td-name">{r.name}</span>
                      <span className={`hz-theme-tag ${toneForRatio(riserMultiple(r), r.recent)}`}>{riserDelta(r)}</span>
                    </Link>
                    <span className="v2-td-text">{r.reason}</span>
                    <span className="v2-td-num v2-td-two">
                      {r.recent.toLocaleString("ko-KR")}회
                      {/* '앞 3일' — 태그('앞 3일의 9배')와 같은 말로. '새로 등장'(앞 3일 0회)이면 태그가 이미 말해 적지 않는다(2026-10-05 점검). */}
                      {r.prior > 0 && <em>앞 3일 {r.prior.toLocaleString("ko-KR")}회</em>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Module>
    </div>
  );
}

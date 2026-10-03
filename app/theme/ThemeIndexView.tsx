import Link from "next/link";

import { KADERA_WINDOW_DAYS } from "@/lib/telegram-data";
import { formatKstUpdate } from "@/lib/format";
import { fmtKoDate } from "@/lib/stock-page";
import { THEME_FLOW_DAYS, type ThemeOverview, type ThemeRiser } from "@/lib/theme-page";

import { StockLogo } from "../StockLogo";
import { CoverLinkCell, CoverMeta, Module, type CoverLink } from "../kadera/V2Modules";
import { AiMark } from "../ui";
import type { ThemeMarket } from "./market";
import { Treemap, TreemapLegend, themeTiles, toneForRatio } from "./Treemap";

/**
 * 테마 목록의 본문 — **국장(/theme)과 미장(/theme/us)이 같이 쓴다.** 자료는 각자 읽어(lib/theme-page.ts · lib/us-theme-page.ts)
 * 같은 타입으로 넘기고, 시장마다 다른 것(주소·사전)은 ThemeMarket(app/theme/market.ts)이 든다.
 *
 * ## v2(2026-10-03) — 카더라 · MDD · 배당에 쓴 규칙으로
 * 첫 줄 띠(1위 테마 · 가장 많이 늘어난 테마 · 새로 상위에 오른 테마 · 업데이트) → [점유율 지도 | 테마 순위] → 테마별 급부상 종목.
 * - 걷은 것: 화면 제목 · 부제(셸이 v2 화면에서 걷는다), 회색 타일 히어로('관심 변화' · '상위권'), 시트 머리의 아이콘 타일 · 설명 문장,
 *   지도 위 안내 말풍선, '오늘의 브리핑' 문단 — 같은 사실을 세 번 말했다('반도체 59.8%'가 브리핑 · 지도 · 흐름 표에, 급부상 종목이
 *   브리핑 태그 · 급부상 표에).
 * - 흐름 표의 테마별 '요즘 도는 얘기' 첫 문장은 걷었다 — 테마 화면 '요즘 도는 얘기'의 첫 문장이고, 지도 옆 좁은 칸에선 잘렸다.
 *   지도 옆 칸은 순위 · 점유율 · 5일 전 대비 · 열흘 흐름만 한 줄씩 싣는다.
 *
 * 제목은 셸이 그린다(화면에서만 걷고 h1 은 남는다 · AppShell isV2Page). 이 파일은 본문만 낸다.
 */

/** 열흘 흐름 한 조각 — n일째 상위 · 다시 상위 · 첫 등장 · 열흘 중 n일 상위 · 상위 밖. 판정은 lib/theme-page.ts listThemeOverview. */
function flowCaption(t: ThemeOverview): { text: string; on: boolean } {
  // 연속 하루째인데 열흘 안에 상위였던 날이 더 있으면 "돌아온" 것이다 — "1일째 상위"는 어색하다.
  if (t.label === "streak") return { text: t.streak === 1 ? "다시 상위" : `${t.streak}일째 상위`, on: true };
  if (t.label === "new") return { text: t.streak === 1 ? "첫 등장" : "2일째 상위", on: true };
  if (t.label === "intermittent") return { text: `10일 중 ${t.topDays}일 상위`, on: false };
  return { text: "상위 밖", on: false };
}

/** 지도 옆 순위 칸의 줄 수 — 상위 열 줄이면 지금 화제인 테마가 다 들어온다. 나머지는 지도에 있다. */
const RANK_ROWS = 10;

/** 태그 글자. 새로 등장이면 그 말을, 아니면 "3일 전 대비 2.1배"(후보는 1.5배 이상뿐이라 '배'가 손해로 읽힐 일이 없다). */
function riserDelta(r: ThemeRiser): string {
  return r.ratio === null ? "새로 등장" : `3일 전 대비 ${r.ratio.toFixed(1)}배`;
}

const pp = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%p`;

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
  const top = all[0] ?? null;

  /* 첫 줄 띠 — 칸마다 다른 테마를 세운다. 1위 테마가 가장 많이 늘어난 테마이기도 한 날이 잦아(국장은 반도체) 안 거르면 띠에
     같은 이름이 두 번 선다(옛 히어로 '같은 테마를 두 번 세우지 않는다'와 같은 규칙). */
  const used = new Set<string>(top ? [top.theme] : []);
  const pick = <T,>(list: T[], nameOf: (x: T) => string) => {
    const x = list.find((y) => !used.has(nameOf(y))) ?? null;
    if (x) used.add(nameOf(x));
    return x;
  };
  const gainer = pick(
    all.filter((t) => (t.shareDelta ?? 0) > 0).sort((a, b) => (b.shareDelta as number) - (a.shareDelta as number)),
    (t) => t.theme,
  );
  const fresh = pick(all.filter((t) => t.label === "new").sort((a, b) => a.rank - b.rank), (t) => t.theme);
  const climber = fresh ? null : pick(all.filter((t) => (t.rankChange ?? 0) > 0).sort((a, b) => (b.rankChange as number) - (a.rankChange as number)), (t) => t.theme);
  const coverLinks: CoverLink[] = [
    top ? { cap: "1위 테마", name: top.theme, val: `${top.sharePct.toFixed(1)}%`, tone: "flat" as const, href: market.themeHref(top.theme), ga: "theme_cover_top" } : null,
    gainer ? { cap: "가장 많이 늘어난 테마", name: gainer.theme, val: pp(gainer.shareDelta as number), tone: "up" as const, href: market.themeHref(gainer.theme), ga: "theme_cover_gainer" } : null,
    fresh
      ? { cap: "새로 상위에 오른 테마", name: fresh.theme, val: `${fresh.rank}위`, tone: "up" as const, href: market.themeHref(fresh.theme), ga: "theme_cover_fresh" }
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
        <CoverMeta
          updated={updatedAt ? formatKstUpdate(updatedAt, "업데이트") : "업데이트 준비 중"}
          basis={themes ? `테마 ${themes.length}개 · 최근 ${KADERA_WINDOW_DAYS}일 언급` : null}
        />
      </div>

      {/* 둘째 줄 — [점유율 지도 | 테마 순위]. 지도는 넓이로, 옆 칸은 숫자로 같은 열 테마를 말한다(같은 줄 · 같은 키). */}
      <div className="v2-tm-band">
        <Module title="테마 점유율 지도" meta={`최근 ${KADERA_WINDOW_DAYS}일 언급 점유율`} className="v2-tm-map">
          {themes === null ? (
            <p className="v2-empty">테마 집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.</p>
          ) : themes.length === 0 ? (
            <p className="v2-empty">아직 집계된 테마가 없습니다.</p>
          ) : (
            <>
              <div className="v2-tm-map-in">
                <Treemap tiles={themeTiles(themes, market.key)} ariaLabel="테마별 최근 3일 언급 점유율" />
              </div>
              <TreemapLegend up="관심이 늘어난 테마" flat="변화 ±0.3%p 안" down="줄어든 테마" />
            </>
          )}
        </Module>

        <Module
          title="테마 순위"
          meta={flowDates.length ? `${fmtKoDate(flowDates[0])} ~ ${fmtKoDate(flowDates[flowDates.length - 1])} 흐름` : `최근 ${THEME_FLOW_DAYS}일 흐름`}
          className="v2-tm-rank"
        >
          {themes === null || themes.length === 0 ? (
            <p className="v2-empty">{themes === null ? "테마 집계를 지금 불러오지 못했습니다." : "아직 집계된 테마가 없습니다."}</p>
          ) : (
            <div className="v2-tbl v2-tm-ranktbl">
              <div className="v2-tr v2-th" aria-hidden="true">
                <span />
                <span>테마</span>
                <span>점유율</span>
                <span>5일 전 대비</span>
                <span>열흘</span>
              </div>
              <ol className="v2-tbody">
                {themes.slice(0, RANK_ROWS).map((t) => {
                  const cap = flowCaption(t);
                  const d = t.shareDelta;
                  return (
                    <li key={t.theme}>
                      {/* 날마다의 순위는 툴팁(줄 title)에 — 줄에는 열흘의 뜻 한 조각만. */}
                      <Link
                        href={market.themeHref(t.theme)}
                        className="v2-tr"
                        title={`최근 ${t.flowDates.length}일 순위 ${t.flow.map((r, i) => `${fmtKoDate(t.flowDates[i])} ${r == null ? "집계 없음" : `${r}위`}`).join(" · ")}`}
                        data-ga="theme_rank_click"
                      >
                        <span className="v2-td-rank">{t.rank}</span>
                        <span className="v2-td-name">{t.theme}</span>
                        <span className="v2-td-num">{t.sharePct.toFixed(1)}%</span>
                        <span className={`v2-td-num v2-td-chg${d == null || Math.abs(d) < 0.05 ? "" : d > 0 ? " is-up" : " is-down"}`}>{d == null ? "-" : pp(d)}</span>
                        <span className={`v2-td-flow${cap.on ? " is-on" : ""}`}>{cap.text}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </Module>
      </div>

      {/* 셋째 줄 — 테마별 급부상 종목. 테마마다 3일 전보다 언급(몫)이 가장 많이 는 종목 하나와 채널이 말한 까닭.
          고르는 것도 까닭을 쓰는 것도 파이프라인이고(generate_theme_briefs.py) 화면은 요약 행의 riser 를 읽는다. 카더라의 신호 표와 같은 줄 꼴. */}
      <Module id="risers" title="테마별 급부상 종목" meta={`최근 ${KADERA_WINDOW_DAYS}일 · 3일 전 대비`}>
        {risers === null ? (
          <p className="v2-empty">테마 요약을 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.</p>
        ) : risers.length === 0 ? (
          <p className="v2-empty">3일 전보다 언급이 늘고 채널이 이유를 말한 종목이 없습니다.</p>
        ) : (
          <div className="v2-tbl v2-tm-risertbl">
            <div className="v2-tr v2-th" aria-hidden="true">
              <span>테마</span>
              <span>종목</span>
              <span>최근 {KADERA_WINDOW_DAYS}일 언급</span>
              <span>
                <AiMark size={11} />
                요즘 도는 얘기
              </span>
            </div>
            <ol className="v2-tbody">
              {risers.map((r) => (
                <li key={r.theme} id={`riser-${r.code}`}>
                  <div className="v2-tr">
                    <Link href={market.themeHref(r.theme)} className="v2-td-theme" data-ga="theme_riser_theme_click">
                      {r.theme}
                    </Link>
                    {/* 종목 + 3일 전 대비 태그(테마 화면 '이 테마의 주인공'과 같은 태그 · 같은 색 단계). 색은 배수 그대로. */}
                    <Link href={market.stockHref(r.code)} className="v2-td-stock" data-ga="theme_riser_stock_click">
                      <StockLogo code={r.code} name={r.name} market={r.market} size={22} />
                      <span className="v2-td-name">{r.name}</span>
                      <span className={`hz-theme-tag ${toneForRatio(r.ratio, r.recent)}`}>{riserDelta(r)}</span>
                    </Link>
                    <span className="v2-td-num v2-td-two">
                      {r.recent.toLocaleString("ko-KR")}회
                      <em>그 전 {r.prior.toLocaleString("ko-KR")}회</em>
                    </span>
                    <span className="v2-td-text">{r.reason}</span>
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { assertLoaded } from "@/lib/load-state";
import { fmtKoDate } from "@/lib/stock-page";
import { KADERA_WINDOW_DAYS } from "@/lib/telegram-data";
import { THEME_FLOW_DAYS, THEME_FLOW_TOP, listThemeOverview, themeHref, type ThemeOverview } from "@/lib/theme-page";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { THEME_PUBLIC } from "../screen-flags";
import { ExpandableList } from "../kadera/ExpandableList";
import { DeltaPp, Highlight, RankBadge, Sparkline } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { C, MONO } from "../ui";
import { THEME_PAGE } from "./copy";
import { Treemap, TreemapLegend, themeTiles } from "./Treemap";

/**
 * 테마 목록(`/theme`) — 위에 **점유율 지도**(트리맵), 아래에 **열흘 흐름** 표.
 *
 * 지도는 "지금 관심이 어디에 몰려 있나"를 한 번에 보인다 — 칸 크기가 최근 사흘 언급 점유율, 색이
 * 닷새 넘게 이전과 견준 변화다(app/theme/Treemap.tsx). 흐름 표는 다른 테마 사이트의 '테마 흐름'
 * 표에서 형식을 가져왔다(칸마다 그날 순위, 라벨은 지속·첫 등장·간헐). 그쪽은 급등 종목 수를
 * 세고 우리는 언급 점유율을 센다. 카더라의 테마 로테이션 카드가 '3일 vs 이전'을 숫자로
 * 말한다면 여기는 그것을 넓이와 색으로, 열흘을 칸으로 보인다.
 *
 * 제목은 셸이 그린다(안 연 동안은 DEEP_PAGES, 열면 NAV). 이 파일은 본문만 낸다.
 */

/** ⛔ 아직 안 연 화면이다. 스위치는 `app/screen-flags.ts` 한 곳에 있다. */
const PUBLIC = THEME_PUBLIC;
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export async function generateMetadata(): Promise<Metadata> {
  const meta = await pageMetadata({
    title: `${THEME_PAGE.label} | hatzze`,
    description: THEME_PAGE.description,
    path: THEME_PAGE.href,
    ownImage: KADERA_CARD.alt,
    imagePath: "/kadera",
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** 흐름 한 줄 글. 판정 규칙은 lib/theme-page.ts listThemeOverview 에 있다. */
function flowCaption(t: ThemeOverview): { text: string; on: boolean } {
  // 연속 하루째인데 열흘 안에 상위였던 날이 더 있으면 "돌아온" 것이다 — "1일째 상위"는 어색하다.
  if (t.label === "streak") return { text: t.streak === 1 ? "다시 상위" : `${t.streak}일째 상위`, on: true };
  if (t.label === "new") return { text: t.streak === 1 ? "첫 등장" : "이틀째 상위", on: true };
  if (t.label === "intermittent") return { text: `열흘 중 ${t.topDays}일 상위`, on: false };
  return { text: "상위 밖", on: false };
}

/**
 * 열흘 흐름 — 작은 막대(점유율)와 그 아래 한 줄 글(flowCaption). 순위 칸 띠였던 것을 카더라 테마 카드와
 * 같은 스파크라인으로 바꿨다(2026-09-19 "저 열흘 순위 자체가 별로다, 다른 형태로"). 막대는 날마다의 점유율이라
 * "커지고 있나 식고 있나"가 모양으로 읽히고, 글이 "며칠째 상위인가"를 말한다. 날짜·순위는 aria-label 에.
 */
function Flow({ t }: { t: ThemeOverview }) {
  const cap = flowCaption(t);
  const label = `최근 ${t.flowDates.length}일 점유율 ${t.shareFlow.map((v, i) => `${fmtKoDate(t.flowDates[i])} ${v.toFixed(1)}%`).join(", ")}`;
  return (
    <span className="hz-flow-col" aria-label={label}>
      <Sparkline data={t.shareFlow} width={80} height={24} />
      <span className="hz-flow-cap" style={{ color: cap.on ? "var(--c-cold-ink)" : C.sub2 }}>{cap.text}</span>
    </span>
  );
}

/** 처음 보이는 줄 수. 상위 열 줄이면 '지금 화제인 테마'가 다 들어오고, 나머지 열여섯은 펼쳐서 본다. */
const FLOW_ROWS_SHOWN = 10;

export default async function ThemeIndexPage() {
  if (!PUBLIC && DEPLOYED) notFound();
  const themes = await listThemeOverview();
  assertLoaded("/theme");

  const flowDates = themes?.[0]?.flowDates ?? [];
  const top = themes?.slice(0, 3) ?? [];
  // 흐름 표 위의 두 칸 — 새로 상위에 오른 테마와 가장 오래 상위인 테마. 표를 다 읽지 않아도 오늘 무엇이
  // 달라졌는지 보인다. 카더라 테마 로테이션의 하이라이트 두 칸(유입·이탈)과 같은 자리·같은 꼴.
  // 점유율 막대는 1위 대비다(kadera.css .hz-flow-share 주석). 절대값은 옆 숫자가 말한다.
  const maxShare = Math.max(0.1, ...(themes ?? []).map((t) => t.sharePct));
  const fresh = (themes ?? []).filter((t) => t.label === "new").sort((a, b) => a.rank - b.rank);
  // '계속'은 사흘 이상. 하루 이틀은 표의 알약이 말한다.
  const lasting = (themes ?? []).filter((t) => t.label === "streak" && t.streak >= 3).sort((a, b) => b.streak - a.streak || a.rank - b.rank);
  // 지도 머리의 한 줄 — 가장 큰 칸이 무엇이고 얼마인지 글자로도 적는다(넓이만으로 말하지 않는다).
  const lead =
    top.length >= 2
      ? `최근 ${KADERA_WINDOW_DAYS}일 언급의 ${top[0].sharePct.toFixed(1)}%가 ${top[0].theme}입니다. 그다음은 ${top
          .slice(1)
          .map((t) => `${t.theme} ${t.sharePct.toFixed(1)}%`)
          .join(", ")}입니다.`
      : "칸의 크기는 최근 사흘 언급 점유율, 색은 그 변화입니다.";

  return (
    <div className="hz-tx">
      {/* ── 점유율 지도 ── 칸 크기 = 점유율, 색 = 변화. 누르면 그 테마 화면으로. */}
      <section className="hz-sheet">
        <SectionHead
          icon="grid_view"
          title="테마 점유율 지도"
          note={`최근 ${KADERA_WINDOW_DAYS}일`}
          desc={lead}
          noteHelp="칸의 넓이는 최근 사흘 언급 점유율입니다. 색은 닷새 넘게 이전과 견준 변화로, 따뜻한 색이 늘어난 테마, 파랑이 줄어든 테마입니다. 사전 밖 종목(기타)은 지도에 없습니다."
          level={2}
        />
        {themes === null ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>
            테마 집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.
          </p>
        ) : themes.length === 0 ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>아직 집계된 테마가 없습니다.</p>
        ) : (
          <>
            <div style={{ padding: "16px 22px 0" }}>
              {/* 처음 온 사람에게 가장 큰 칸 안에서 한 번: 칸이 눌리는 곳이라는 것. 내부자 리포트의 쪽지와 같은 기계. */}
              <Treemap
                tiles={themeTiles(themes)}
                ariaLabel="테마별 최근 3일 언급 점유율"
                hint={{ id: "themes", text: (label) => `${label} 칸을 누르면 이 테마의 상세 정보가 열립니다` }}
              />
            </div>
            <TreemapLegend up="관심이 늘어난 테마" flat="변화 ±0.3%p 안" down="줄어든 테마" />
          </>
        )}
      </section>

      <section className="hz-sheet">
        <SectionHead
          icon="donut_small"
          title="테마 흐름"
          note={flowDates.length ? `${fmtKoDate(flowDates[0])} ~ ${fmtKoDate(flowDates[flowDates.length - 1])}` : `최근 ${THEME_FLOW_DAYS}일`}
          desc={`테마마다 요즘 무슨 얘기가 도는지 한 줄, 그리고 최근 ${THEME_FLOW_DAYS}일 점유율의 흐름입니다.`}
          noteHelp={`점유율은 최근 ${KADERA_WINDOW_DAYS}일 평균이고 분모는 테마 사전에 든 종목의 언급이라 스물여섯 줄을 다 더하면 100%가 됩니다. 막대는 날마다의 점유율이고 그 아래 글은 ${THEME_FLOW_TOP}위 안에 며칠째 드는지입니다. 집계가 있는 날만 세어 주말이 빠질 수 있습니다.`}
          level={2}
        />
        {themes === null ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>
            테마 집계를 지금 불러오지 못했습니다. 잠시 뒤 다시 열어 보십시오.
          </p>
        ) : themes.length === 0 ? (
          <p style={{ margin: 0, padding: "16px 22px 20px", fontSize: "var(--fs-12)", color: C.sub, lineHeight: 1.7 }}>아직 집계된 테마가 없습니다.</p>
        ) : (
          <>
            <div className="hz-kd-duo">
              <Highlight
                cap="새로 상위에 오른 테마"
                name={fresh[0]?.theme ?? "—"}
                value={fresh[0] ? (fresh[0].streak === 1 ? "첫 등장" : "이틀째") : undefined}
                valueColor="var(--c-hot-ink)"
                sub={
                  fresh.length > 1
                    ? `그 밖에 ${fresh.slice(1).map((t) => t.theme).join(" · ")}`
                    : fresh.length === 1
                      ? `${fresh[0].rank}위 · 점유율 ${fresh[0].sharePct.toFixed(1)}%`
                      : `열흘 사이 ${THEME_FLOW_TOP}위 안에 새로 든 테마가 없습니다`
                }
                divide
              />
              <Highlight
                cap="계속 상위인 테마"
                name={lasting[0]?.theme ?? "—"}
                value={lasting[0] ? `${lasting[0].streak}일째` : undefined}
                valueColor="var(--c-cold-ink)"
                sub={
                  lasting.length > 1
                    ? `그 밖에 ${lasting.slice(1).map((t) => `${t.theme} ${t.streak}일째`).join(" · ")}`
                    : lasting.length === 1
                      ? `${lasting[0].rank}위 · 점유율 ${lasting[0].sharePct.toFixed(1)}%`
                      : `사흘 넘게 ${THEME_FLOW_TOP}위 안에 이어진 테마가 없습니다`
                }
              />
            </div>
            <div className="hz-thead hz-cols-theme-list">
              <span>#</span>
              <span>테마 · 말 많은 종목 · 요즘 무슨 얘기</span>
              <span style={{ textAlign: "right" }}>점유율</span>
              <span>최근 {flowDates.length || THEME_FLOW_DAYS}일</span>
            </div>
            {/* 줄은 넷 — 순위 · 테마(이름 + 말 많은 종목 / 요즘 무슨 얘기 첫 문장) · 점유율 · 열흘 흐름.
                둘째 줄이 이 표의 본론이다: 순위·점유율은 "얼마나"만 말하는데 독자의 질문은 "무슨 얘기냐"라서,
                테마 화면의 요약(telegram_theme_brief) 첫 문장을 여기 끌어온다. 요약이 아직 없으면 종목 이름만.
                열 줄만 먼저 보이고 나머지는 '더 보기'로 펼친다(26줄을 한 번에 세우면 벽이 된다). */}
            <ExpandableList
              name="theme_flow"
              initial={FLOW_ROWS_SHOWN}
              step={themes.length - FLOW_ROWS_SHOWN}
              listStyle={{ display: "block" }}
              footerClassName="hz-sheet-foot-row"
              items={themes.map((t) => (
                <li key={t.theme}>
                  <Link href={themeHref(t.theme)} className="hz-trow hz-cols-theme-list" style={{ textDecoration: "none" }}>
                    <RankBadge n={t.rank} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      {/* 첫 줄: 이름 · 변화 · 말 많은 종목 셋(이름만). 종목은 이름 뒤에 흐리게 — 이름이 먼저 읽히고
                          종목은 "누가 만든 점유율인가"의 곁말이다. 좁으면 종목부터 줄임표로 잘린다. */}
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>{t.theme}</span>
                        <DeltaPp value={t.shareDelta} style={{ fontSize: "var(--fs-11)", flexShrink: 0 }} />
                        {t.topStocks.length > 0 && (
                          <span style={{ ...clip, minWidth: 0, fontSize: "var(--fs-12)", fontWeight: 500, color: C.sub2 }}>
                            {t.topStocks.map((s) => s.name).join(" · ")}
                          </span>
                        )}
                      </span>
                      {/* 둘째 줄: 요즘 무슨 얘기 첫 문장. 없으면 그 사정을 적는다(빈 줄을 두면 줄 높이가 흔들린다). */}
                      <span className="hz-flow-brief">
                        {t.briefLine ??
                          (t.topStocks.length
                            ? `최근 ${KADERA_WINDOW_DAYS}일 ${t.topStocks.map((s) => `${s.name} ${s.mentions}회`).join(" · ")}`
                            : `최근 ${KADERA_WINDOW_DAYS}일 언급된 종목이 없습니다`)}
                      </span>
                    </span>
                    <span className="hz-flow-share">
                      <span style={{ fontFamily: MONO, fontSize: "var(--fs-14)", fontWeight: 800, color: C.ink }}>{t.sharePct.toFixed(1)}%</span>
                      {/* 막대 채움만 인라인 — 폭은 값이다. 색·트랙은 .hz-bar(kadera.css). */}
                      <span className="hz-bar">
                        <span style={{ width: `${Math.max(2, (t.sharePct / maxShare) * 100)}%` }} />
                      </span>
                    </span>
                    <Flow t={t} />
                  </Link>
                </li>
              ))}
            />
          </>
        )}
      </section>
      <p style={{ margin: 0, fontSize: "var(--fs-11)", color: C.muted, textAlign: "right" }}>
        테마는 손으로 고른 대표 종목 묶음입니다. 언급은 주식 텔레그램 채널에서 셉니다.
      </p>
    </div>
  );
}

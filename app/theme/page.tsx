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
import { DeltaPp, Highlight, Pill, RankBadge } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { AiMark, C, MONO } from "../ui";
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
 * 열흘 흐름 — **글 한 조각뿐이다**(n일째 상위 · 다시 상위 · 열흘 중 n일 상위 · 상위 밖). 순위 칸 띠 → 색 띠 →
 * 스파크라인까지 세 번 그림으로 그렸는데 전부 "복잡하다"였다(2026-09-19). 열흘의 뜻은 결국 이 한 줄이고,
 * 날마다의 값은 툴팁(title)에 남긴다.
 */
function Flow({ t }: { t: ThemeOverview }) {
  const cap = flowCaption(t);
  const title = `최근 ${t.flowDates.length}일 순위 ${t.flow.map((r, i) => `${fmtKoDate(t.flowDates[i])} ${r == null ? "집계 없음" : `${r}위`}`).join(" · ")}`;
  return (
    <span title={title} style={{ display: "inline-flex" }}>
      <Pill tone={cap.on ? "blue" : "plain"}>{cap.text}</Pill>
    </span>
  );
}

/** 처음 보이는 타일 수. 3열 격자라 3의 배수 — 네 줄이면 '지금 화제인 테마'가 다 들어오고, 나머지는 펼쳐서 본다. */
const FLOW_TILES_SHOWN = 12;

export default async function ThemeIndexPage() {
  if (!PUBLIC && DEPLOYED) notFound();
  const themes = await listThemeOverview();
  assertLoaded("/theme");

  const flowDates = themes?.[0]?.flowDates ?? [];
  const top = themes?.slice(0, 3) ?? [];
  // 흐름 표 위의 두 칸 — 새로 상위에 오른 테마와 가장 오래 상위인 테마. 표를 다 읽지 않아도 오늘 무엇이
  // 달라졌는지 보인다. 카더라 테마 로테이션의 하이라이트 두 칸(유입·이탈)과 같은 자리·같은 꼴.
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
            {/* 표가 아니라 **타일**이다 — 카더라 '급등 종목'과 같은 3열 패널 격자. 표는 다섯 번을 다듬어도
                "복잡하다 · 빈 공간"이었다(2026-09-19). 타일이면 테마 하나가 한 덩어리로 읽히고, 문장이 반 폭을
                채워 빈 자리가 없고, 넓은 화면도 열 수로 받는다(3 → 2 → 1 열은 kadera.css 가 정한다).
                타일 안은 두 층뿐이다: 머리줄(순위 · 이름 · 변화 / 점유율 · 열흘 한 조각)과 문장 상자. */}
            <ExpandableList
              name="theme_flow"
              initial={FLOW_TILES_SHOWN}
              step={themes.length - FLOW_TILES_SHOWN}
              listClassName="hz-panelgrid hz-panelgrid-3"
              footerClassName="hz-sheet-foot-row"
              items={themes.map((t) => (
                <li key={t.theme} className="hz-panel-pad hz-theme-tile">
                  {/* 머리줄. 급등 종목 타일과 글자까지 같은 꼴 — 순위 배지 · 이름 · 변화, 오른쪽에 값 묶음. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                    <RankBadge n={t.rank} />
                    <Link href={themeHref(t.theme)} className="hz-stock-link" style={{ ...clip, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: 800, letterSpacing: "-.01em" }}>
                      <strong style={{ fontWeight: "inherit" }}>{t.theme}</strong>
                    </Link>
                    <DeltaPp value={t.shareDelta} style={{ fontSize: "var(--fs-11)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }} />
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: "var(--fs-15)", fontWeight: 800, letterSpacing: "-.02em", color: C.ink, whiteSpace: "nowrap" }}>
                        {t.sharePct.toFixed(1)}%
                      </span>
                      <Flow t={t} />
                    </span>
                  </div>
                  {/* 문장 상자. 급등 종목·주요 종목 리포트의 AI 상자와 같은 꼴(트레이 위 카드색 상자, ✨ 고지).
                      marginTop:auto — 머리줄이 두 줄이 된 타일에서도 문장 줄이 옆 타일과 나란히 선다. */}
                  <div style={{ marginTop: "auto", display: "flex", gap: 9, background: C.card, borderRadius: 12, padding: "12px 13px" }}>
                    {t.briefLine && <AiMark size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
                    <p style={{ margin: 0, fontSize: "var(--fs-13)", lineHeight: 1.7, color: t.briefLine ? "var(--c-ink-soft)" : C.sub2, wordBreak: "keep-all", textWrap: "pretty" }}>
                      {t.briefLine ??
                        (t.topStocks.length
                          ? `최근 ${KADERA_WINDOW_DAYS}일 ${t.topStocks.map((s) => `${s.name} ${s.mentions}회`).join(" · ")}가 언급되었습니다.`
                          : `최근 ${KADERA_WINDOW_DAYS}일 사이 이 테마 종목이 채널에서 언급되지 않았습니다.`)}
                    </p>
                  </div>
                </li>
              ))}
            />
          </>
        )}
      </section>
    </div>
  );
}

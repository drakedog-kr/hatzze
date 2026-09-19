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
import { DeltaPp, Pill, RankBadge } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { C, MONO } from "../ui";
import { THEME_PAGE } from "./copy";

/**
 * 테마 목록(`/theme`) — 26테마를 점유율 순으로 세우고, 테마마다 **열흘 흐름**을 붙인다.
 *
 * 흐름 칸은 다른 테마 사이트의 '테마 흐름' 표에서 형식을 가져왔다(칸마다 그날 순위, 라벨은
 * 지속·첫 등장·간헐). 그쪽은 급등 종목 수를 세고 우리는 언급 점유율을 센다. 카더라의
 * 테마 로테이션 카드가 '3일 vs 이전'을 숫자로 말한다면 여기는 열흘을 눈으로 보인다.
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

/** 흐름 라벨. 판정 규칙은 lib/theme-page.ts listThemeOverview 에 있다. */
function FlowLabel({ t }: { t: ThemeOverview }) {
  if (t.label === "streak") return <Pill tone="hot">{t.streak}일째 상위</Pill>;
  if (t.label === "new") return <Pill tone="blue">{t.streak === 1 ? "첫 등장" : "이틀째"}</Pill>;
  if (t.label === "intermittent") return <Pill tone="plain">열흘 중 {t.topDays}일</Pill>;
  return <span style={{ fontSize: "var(--fs-11)", color: C.sub2 }}>상위 밖</span>;
}

/** 열흘 흐름 칸. 상위면 파란 칸에 순위, 아니면 옅은 칸에 순위, 집계가 없던 날은 빈 테두리. */
function Flow({ t }: { t: ThemeOverview }) {
  return (
    <span className="hz-flow" aria-label={`최근 ${t.flow.length}일 순위 ${t.flow.map((r) => (r == null ? "없음" : `${r}위`)).join(", ")}`}>
      {t.flow.map((r, i) => (
        <span
          key={t.flowDates[i]}
          className={r == null ? "is-none" : r <= THEME_FLOW_TOP ? "is-top" : undefined}
          title={`${fmtKoDate(t.flowDates[i])}${r == null ? "" : ` · ${r}위`}`}
        >
          {r == null ? "" : r}
        </span>
      ))}
    </span>
  );
}

export default async function ThemeIndexPage() {
  if (!PUBLIC && DEPLOYED) notFound();
  const themes = await listThemeOverview();
  assertLoaded("/theme");

  const flowDates = themes?.[0]?.flowDates ?? [];

  return (
    <div className="hz-tx">
      <section className="hz-sheet">
        <SectionHead
          icon="donut_small"
          title="테마 흐름"
          note={flowDates.length ? `${fmtKoDate(flowDates[0])} ~ ${fmtKoDate(flowDates[flowDates.length - 1])}` : `최근 ${THEME_FLOW_DAYS}일`}
          desc={`점유율은 최근 ${KADERA_WINDOW_DAYS}일 평균, 흐름 칸은 날마다의 순위입니다. ${THEME_FLOW_TOP}위 안에 든 날은 파랗게 칠합니다.`}
          noteHelp="점유율의 분모는 테마 사전에 든 종목의 언급이라 열 줄 밖까지 다 더하면 100%가 됩니다. 흐름은 집계가 있는 날만 세어 주말이 빠질 수 있습니다."
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
            <div className="hz-thead hz-cols-theme-list">
              <span>#</span>
              <span>테마 · 최근 {KADERA_WINDOW_DAYS}일 말 많은 종목</span>
              <span style={{ textAlign: "right" }}>점유율</span>
              <span>최근 {flowDates.length || THEME_FLOW_DAYS}일 순위</span>
              <span>흐름</span>
            </div>
            <div>
              {themes.map((t) => (
                <Link key={t.theme} href={themeHref(t.theme)} className="hz-trow hz-cols-theme-list" style={{ textDecoration: "none" }}>
                  <RankBadge n={t.rank} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{ ...clip, minWidth: 0, fontSize: "var(--fs-13-5)", fontWeight: 700, color: C.ink }}>{t.theme}</span>
                      <DeltaPp value={t.shareDelta} style={{ fontSize: "var(--fs-11)" }} />
                    </span>
                    <span style={{ ...clip, fontSize: "var(--fs-11-5)", color: C.sub }}>
                      {t.topStocks.length
                        ? t.topStocks.map((s) => `${s.name} ${s.mentions}회`).join(" · ")
                        : `최근 ${KADERA_WINDOW_DAYS}일 언급된 종목이 없습니다`}
                    </span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: "var(--fs-13)", fontWeight: 800, color: C.ink, textAlign: "right" }}>{t.sharePct.toFixed(1)}%</span>
                  <span>
                    <Flow t={t} />
                  </span>
                  <span>
                    <FlowLabel t={t} />
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
      <p style={{ margin: 0, fontSize: "var(--fs-11)", color: C.muted, textAlign: "right" }}>
        테마는 손으로 고른 대표 종목 묶음입니다. 언급은 주식 텔레그램 채널에서 셉니다.
      </p>
    </div>
  );
}

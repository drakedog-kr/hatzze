import type { Metadata } from "next";

import { getSeohakDaily } from "@/lib/seohak-daily";
import { getSeohakOverview, type Cohort } from "@/lib/seohak-data";
import { getSeohakCalendar } from "@/lib/seohak-calendar";
import { getSeohakEtf } from "@/lib/seohak-etf";
import { getHouseholdAssets, getUsdKrw } from "@/lib/seohak-external";
import { getSeohakQuarterly } from "@/lib/seohak-quarterly";
import { DailySection } from "./DailyCards";
import { CalendarHero } from "./CalendarHero";
import { EtfSection } from "./EtfCards";
import { QuarterlyCards } from "./QuarterlyCards";
import { TradingCards } from "./TradingCards";
import { WealthCards } from "./WealthCards";
import { SectionCaps } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { pageMetadata } from "../seo";
import { C, R } from "../ui";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "서학개미 해부도 | hatzze",
    description:
      "한국인이 미국 주식에 넣은 돈은 얼마이고, 언제 넣었고, 지금 얼마가 됐는지. 미 재무부 통계로 1985년부터 되짚습니다.",
    path: "/seohak",
  });
}

export const dynamic = "force-dynamic";

/**
 * 백만 달러 단위 값을 "$1,234B" 로. 원천이 백만 달러라 나눗셈이 여기 한 곳에만 있다.
 *
 * ⚠️ 자릿수가 크기에 따라 다르다. $1B 아래는 **두 자리**를 준다 — 개인 코호트의 초기
 * 해가 $0.04B 인데 한 자리로 두면 `$0B` 가 되고, 그 줄이 "+560%" 를 달고 있어서
 * "아무것도 안 넣었는데 여섯 배"로 읽힌다.
 *
 * ⚠️ 음수 기호는 **통화 기호 앞**이다. `$-2.8B` 는 기호와 숫자 사이에 낀 빼기라 한 박자
 * 늦게 읽힌다(2023년 개인 순매도 줄).
 */
function usdB(mn: number): string {
  const abs = Math.abs(mn) / 1000;
  const digits = abs < 1 ? 2 : 1;
  return `${mn < 0 ? "−" : ""}$${abs.toLocaleString("ko-KR", { maximumFractionDigits: digits })}B`;
}

/** 음수는 U+2212(−)로 낸다. 본문에 손으로 적은 값과 부호 모양이 갈리면 안 된다. */
function pct(v: number, digits = 1): string {
  const n = Math.abs(v).toLocaleString("ko-KR", { maximumFractionDigits: digits });
  return `${v >= 0 ? "+" : "−"}${n}%`;
}

/** 코호트 표의 칸 배치. 머리줄과 몸줄이 어긋나면 안 되므로 한 곳에서 낸다. */
const COHORT_COLS = "44px 1fr 76px 62px";

/**
 * 코호트 줄. 막대는 '그 해 들어온 돈의 크기', 오른쪽 숫자는 '지금 수익률'이다.
 * 둘을 한 줄에 두는 이유는, 돈이 가장 많이 들어온 해가 수익률이 가장 낮은 해라는
 * 사실이 그 두 값을 나란히 놓아야만 보이기 때문이다.
 *
 * ⚠️ 좌우 여백(22px)은 이 줄이 아니라 **바깥 열 컨테이너**가 준다. 표를 2열로 세우면서
 * 줄마다 여백을 두면 오른쪽 열의 왼쪽에도 22px 이 붙어 가운데만 벌어진다.
 */
function CohortRow({ c, maxInflow }: { c: Cohort; maxInflow: number }) {
  // 막대는 절댓값이다. 음수 폭을 그대로 주면 CSS 가 0 으로 뭉개 순매도 해만 막대가 사라진다.
  const w = Math.max(2, (Math.abs(c.inflow) / maxInflow) * 100);
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: COHORT_COLS,
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderTop: `1px solid ${C.sheetRow}`,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.label }}>{c.year}</span>
      <span style={{ height: 8, background: C.track, borderRadius: R.pill, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${w}%`, height: "100%", background: C.bar }} />
      </span>
      <span style={{ fontSize: 12, color: C.sub2, textAlign: "right" }}>{usdB(c.inflow)}</span>
      {/* ⚠️ **순매도 해에는 수익률을 안 낸다.** 분자·분모가 둘 다 음수라 비가 양수로
          나오는데(2023년 −$2.8B → −$4.5B 가 "+61%"), 그건 수익이 아니라 "빼 간 돈이
          남았더라면"이다. 그 해에 한 일은 판 것이므로 그렇게 적는다. */}
      {c.inflow < 0 ? (
        <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: "right", color: C.faint }}>
          순매도
        </span>
      ) : (
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            textAlign: "right",
            color: c.returnPct >= 100 ? C.blue : C.ink,
          }}
        >
          {pct(c.returnPct, 0)}
        </span>
      )}
    </li>
  );
}

/**
 * 코호트 표 한 열. **머리줄을 열마다 다시 낸다** — 12해를 한 줄로 세우면 표만 456px 이라
 * 카드가 900px 가까이 자란다. 반씩 나눠 나란히 두면 그 절반이고, 막대는 두 열이 같은
 * `maxInflow` 로 정규화되므로 열이 갈려도 길이를 견줄 수 있다.
 */
function CohortColumn({ rows, maxInflow }: { rows: Cohort[]; maxInflow: number }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      <li
        style={{
          display: "grid",
          gridTemplateColumns: COHORT_COLS,
          gap: 10,
          padding: "0 0 8px",
          fontSize: 11,
          color: C.faint,
        }}
      >
        <span>들어온 해</span>
        <span />
        <span style={{ textAlign: "right" }}>넣은 돈</span>
        <span style={{ textAlign: "right" }}>지금</span>
      </li>
      {rows.map((c) => (
        <CohortRow key={c.year} c={c} maxInflow={maxInflow} />
      ))}
    </ul>
  );
}

export default async function SeohakPage() {
  const ov = await getSeohakOverview();
  // 아래 셋은 서로 의존이 없다. 순서대로 await 하면 왕복이 앞뒤로 붙으므로 함께 띄운다.
  // ⚠️ 분기·ETF 두 층은 표가 아직 없을 수 있어 null 을 돌려준다(마이그레이션 043·042).
  // 그 경우 그 섹션만 접고 나머지는 그대로 뜬다.
  const [daily, quarterly, etf, calendar, fx, household] = await Promise.all([
    getSeohakDaily(),
    getSeohakQuarterly(),
    getSeohakEtf(),
    getSeohakCalendar(),
    // ⚠️ 바깥 원천 둘. 실패하면 null 이라 그 카드만 접힌다(lib/seohak-external.ts 머리말).
    getUsdKrw(),
    getHouseholdAssets(),
  ]);
  // ⭐⭐ 코호트를 **개인 채널로** 낸다. TIC 전수(`ov.cohorts`)는 국민연금까지 포함한
  // 전 국민 숫자라, 개인을 분석하는 이 페이지의 주제와 모집단이 다르다. 합계가 통째로
  // 갈린다 — 전 국민 $317.1B → $814.6B(+157%), 개인 $106.7B → $195.7B(**+83%**).
  const co = ov.channel?.cohorts ?? [];
  const maxInflow = Math.max(...co.map((c) => Math.abs(c.inflow)), 1);
  // 코호트 표를 두 열로 나눈다. 홀수면 앞 열이 한 줄 길다 — 뒤 열이 길면 오른쪽만
  // 아래로 삐져나와 카드 바닥이 어긋난다.
  const cohortHalf = Math.ceil(co.length / 2);
  const cohortCols = [co.slice(0, cohortHalf), co.slice(cohortHalf)].filter((col) => col.length);
  // '최근'은 마지막 두 해다. 연도를 손으로 박으면 해가 바뀐 날 "2025년 이후"가 세 해가
  // 되면서 각주만 조용히 거짓이 된다. 개월 수도 같은 기준에서 낸다(2026-05 이면 17개월).
  const latestYear = co.length ? co[co.length - 1].year : Number(ov.asOf.slice(0, 4));
  const recentFrom = latestYear - 1;
  const recentMonths = (latestYear - recentFrom) * 12 + Number(ov.asOf.slice(5, 7));
  const chPrincipal = ov.channel?.principal ?? 0;
  const recent = co.filter((c) => c.year >= recentFrom).reduce((s, c) => s + c.inflow, 0);
  const recentShare = chPrincipal ? (recent / chPrincipal) * 100 : 0;
  const chValue = ov.channel?.value ?? 0;
  const chReturn = chPrincipal ? (chValue / chPrincipal - 1) * 100 : 0;

  return (
    // hz-cards 를 쓰지 않는다. 그건 브리핑의 4열 셀 격자라 자식마다 min-height 274px 가
    // 걸려 있어서, 짧은 시트 아래에 200px 짜리 빈 바닥이 생긴다(실측). 카더라와 같은
    // 맨 세로 흐름으로 둔다.
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── ② 오늘 · 일별 층 ──────────────────────────────────────────
          예탁원 결제 통계 하나에서 나오는 일곱 장. 브리핑과 같은 4열 셀 격자(.hz-cards)를
          써서 "카드 하나가 한 행을 통째로 먹는" 모양을 피한다 — 칸 합이 12라 3줄이 찬다.
          ⚠️ 이 격자는 아래 2열 래퍼 **바깥**에 있어야 한다. 안에 넣으면 380px 한 칸에
          갇혀 4열이 1열로 접힌다(실제로 그렇게 깨졌다). */}
      {/* 히어로 = 달력. 이 화면에서 가장 눈에 붙는 그림이고, 나머지 층이 그 아래에서
          '왜 그런가'를 답한다. */}
      {calendar && <CalendarHero c={calendar} />}

      {/* ── 구간 나누기 ───────────────────────────────────────────────
          카더라·브리핑·MDD 가 쓰는 것과 같은 머리 배지(SectionCaps)로 장을 가른다.
          히어로(달력)는 어느 장에도 안 넣는다 — 카더라도 히어로를 첫 배지 위에 둔다.

          기준은 **갱신 주기가 아니라 질문**이다. 주기로 나누면 "매일/매월/분기"가
          되는데, 그건 우리 파이프라인 사정이지 읽는 사람의 관심이 아니다. */}
      <SectionCaps label="어떻게 사고파나" count={ov.channel?.turnover ? 3 : 1} />
      <DailySection d={daily} />
      {/* 매매 습관 두 장. 예탁원 채널이라 위 카드와 모집단이 같다. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 14 }}>
        <TradingCards ch={ov.channel} />
      </div>

      {/* ── 분기 층 ───────────────────────────────────────────────────
          ⭐ 맨 아래였다. 13F 마감이 분기말 +45일이라 **갱신이 가장 느리다**는 이유로
          내려놓았는데, 그건 위 주석이 경계한 바로 그 기준이다 — 우리 파이프라인 사정이지
          읽는 사람의 관심이 아니다. 질문으로 보면 '누가'는 '어떻게'와 한 짝이라 바로
          뒤가 제자리다. 아래 두 장은 그릇('무엇에')과 잔고('얼마가')를 묻는 딴 갈래다. */}
      {quarterly && (
        <>
          <SectionCaps label="누구의 돈인가" count={1} />
          <QuarterlyCards q={quarterly} ch={ov.channel} />
        </>
      )}

      {/* ⭐ '무엇에 담았나'였다. 남은 둘이 전부 **국내 상장 ETF** 이야기라 이름을 그렇게
          바꿨다. 미국에 직접 상장된 QQQ 같은 건 안 들어오는 딴 그릇이라, 이름으로 그
          경계를 밝힌다. */}
      <SectionCaps label="국내 상장 ETF" count={etf ? 2 : 0} />
      {etf && <EtfSection e={etf} />}

      {/* ⛔ '종류별 구성'(미 재무부 SHL 연례)이 여기 있었는데 **뺐다.**
          그 카드는 부문을 안 나누는 조사라 **국민연금까지 포함한 전 국민** 값이었다.
          그런데 전 국민 잔고의 76%가 기관이므로, 그 구성(보통주 62.9%)은 사실상
          **기관의 포트폴리오를 그려 놓고 개인 페이지에 얹은 것**이었다.
          제목 배지와 설명 양쪽에 '전 국민'을 박아 두긴 했는데, 한 카드에 면책이 둘이나
          필요하다는 것 자체가 자리가 아니라는 신호였다.
          ⚠️ 표(`seohak_equity_type`)와 그걸 채우는 파이프라인은 그대로 남는다. 개인만
          가를 길이 생기면 그때 되살릴 것. */}
      <SectionCaps label="얼마가 쌓였나" count={1 + (fx ? 1 : 0) + (household ? 1 : 0)} />

{/* ── 넣은 돈과 그 결과 ────────────────────────────────────────
          맨 위에 있었는데 내렸다. 40년 곡선은 배경이지 주인공이 아니다 — 이 페이지가
          매일 답해야 하는 건 '오늘'이다.

          ## ⭐ '원금과 평가액'과 '시작 연도별 성과'를 한 장으로 합쳤다

          둘은 같은 산수였다. 앞 카드의 `+156.9%` 는 뒤 카드 열두 해를 합친 값이라,
          **앞 장이 뒤 장의 합계**였는데 이름이 달라 딴 이야기처럼 보였다. 지금은
          위가 전체, 아래가 그 전체를 들어온 해로 쪼갠 것이다.

          ⚠️ 표를 **2열**로 세운다. 12해를 한 줄로 늘이면 표만 456px 이라 카드가
          900px 가까이 자란다(합치기 전 두 장 합이 417+607=1,024px 였다). */}
      <section className="hz-sheet">
        <SectionHead
          icon="savings"
          title="시작 연도별 성과"
          desc="개인이 미국 주식에 넣은 원금이 지금 얼마가 됐는지, 들어온 해별로도 나눠 봅니다."
          note={`${ov.asOf} 기준`}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 22,
            alignItems: "baseline",
            padding: "16px 22px 4px",
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>넣은 원금</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.sub, letterSpacing: "-.02em" }}>
              {usdB(chPrincipal)}
            </div>
          </div>
          <div style={{ fontSize: 18, color: C.hint, alignSelf: "center" }}>→</div>
          <div>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>지금 평가액</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
              {usdB(chValue)}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: C.sub2, marginBottom: 3 }}>전체 손익</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.blue, letterSpacing: "-.02em" }}>
              {pct(chReturn)}
            </div>
          </div>
        </div>
        {/* 좌우 22px 은 여기서 준다(줄이 아니라). 열 사이 간격은 28px 로 두 열의 마지막
            칸('지금')과 다음 열의 첫 칸('들어온 해')이 붙어 보이지 않게 한다. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(330px, 100%), 1fr))",
            columnGap: 28,
            padding: "8px 22px 0",
            alignItems: "start",
          }}
        >
          {cohortCols.map((rows) => (
            <CohortColumn key={rows[0].year} rows={rows} maxInflow={maxInflow} />
          ))}
        </div>
        {/* ⚠️ `.hz-sheet-foot` 은 **display:flex** 다. 안에 <b> 를 직접 두면 맨 텍스트와
            <b> 가 각각 flex 항목이 되어, 칸이 좁아지는 순간 "원/금/의" 처럼 낱글자로
            눌린다(2열 격자로 바꾸자마자 실제로 깨졌다). 통째로 <span> 하나에 담는다.
            JSX 는 태그 사이 줄바꿈의 공백을 지우므로 조사 공백은 {" "} 로 명시한다. */}
        <div className="hz-sheet-foot" style={{ fontSize: 12, color: C.sub }}>
          {/* ⚠️ 앞 판은 "원금의 33%가 2025년 이후에 들어왔습니다"로 시작했다. **그 자리의
              '원금'이 무엇인지 문장 안에 없어서** 33% 의 분모를 알 수 없었다. 정의를 먼저
              놓고 발견을 뒤에 붙인다. */}
          <span>
            국내 증권사를 거쳐 {ov.channel?.from}년부터 쌓인 누적 순매수이고, 그중{" "}
            <b style={{ color: C.ink }}>
              {recentShare.toFixed(0)}%가 최근 {recentMonths}개월에
            </b>{" "}
            들어왔습니다. 같은 기간 전 국민 기준은 {usdB(ov.principal)} → {usdB(ov.marketValue)}(
            {pct(ov.returnPct, 0)})인데, 개인 쪽이 낮은 것은 실력이 아니라{" "}
            <b style={{ color: C.ink }}>늦게 들어왔기 때문</b>입니다. 해별 &apos;지금&apos;은 그
            해에 들어온 돈이 이후 시장을 그대로 따라갔다고 볼 때의 값이라 추정입니다.
          </span>
        </div>
      </section>

      {/* 원화·가계 두 장. 앞의 것은 예탁원 채널, 뒤의 것은 자금순환표 가계 부문이라
          **모집단이 다르다** — 두 카드의 숫자를 더하거나 나누면 안 된다(각주가 밝힌다). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
        <WealthCards ch={ov.channel} fx={fx} household={household} />
      </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: 16, alignItems: "start" }}>

      </div>

    </div>
  );
}

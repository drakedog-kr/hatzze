"use client";

// 위험 프로필 시트. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).
//
// ## 2026-09-23 다시 그린 것
//
// 오픈 뒤 리디자인을 안 받은 자리였다(인라인 헤어라인으로 칸을 가르는 옛 방식이 사이트에서
// MDD 히어로와 여기 둘뿐이었다). 한 시트 안에서 같은 말을 여러 번 하던 것을 걷었다.
//   · 세 패널 모두 **머리의 큰 숫자 둘을 바닥 요약 문장이 그대로 되풀이**했다("24.7% · −26%"
//     아래에 "해마다 −26% 낙폭을 견디고 연 +24.7%를 벌었습니다"). → 문장 하나를 머리로 올리고
//     숫자는 그 안에서 굵게 칠한다. 바닥 줄은 없앤다.
//   · 범례와 축 이름이 같은 말이었다("이 종목 · 코스피"가 두 번). → 범례를 없애고 축 이름 앞에 색 점.
//   · 셋째 패널이 두 낙폭을 거울 막대로 좌우에 갈라 그렸다 → 같은 방향 두 막대(TwinRow).
//   · 패널마다 붙은 작은 아이콘(balance·speed·sync) → 뺐다. 시트 머리 아이콘과 겹쳐 한 시트에
//     '아이콘 + 제목 + 부제' 묶음이 넷이었다.
//   · 칸을 가르던 헤어라인 → 다른 화면과 같은 회색 타일(.hz-panelgrid).
//   · 글자는 다른 화면의 회색 타일과 같은 눈금이다 — 타일 제목 14 · 문장 13 · 설명 12 · 막대 11.
//     (12 이상으로 키운 판을 로컬에서 보고, 다른 화면에 맞추라는 지적으로 되돌렸다.)
//   · 전체보기 아이콘 버튼 → "10년 전체 ›" 글자 버튼. 무엇을 여는지 눌러 보기 전에 보인다.
//
// ## 2026-09-24
//
//   · 타일 부제("감수한 위험만큼 돌려받았나" 등)를 걷었다. 제목과 머리 문장이 이미 같은 말을 한다.
//   · 부제 끝에 붙어 있던 "(최근 5건)"은 제목 옆으로 — 굵기만 빼고 같은 크기로 붙인다.
//   · "10년 전체" 버튼을 타일 바닥 오른쪽에서 **제목 줄 오른쪽**으로 올렸다. 팝오버는 그래서 아래로 편다.

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RiskProfile as RiskProfileData, YearStat } from "@/lib/mdd";
import { C, Icon } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { benchName, fmtDur, DOWN, UP, DOWN_BAR, UP_BAR_SOFT } from "./shared";
import { Sheet, MirrorRow, MirrorAxis, TwinRow, TwinAxis } from "./sheet";

const RISK_ROWS = 5; // 모든 타일이 쓰는 고정 줄 수(연도 5개 · 사건 5건)

/** 타일 본문 — 머리 문장(lead) · 막대 영역(viz) · 제목 줄 오른쪽 '전체' 버튼(more). */
type TileBody = { lead: React.ReactNode; viz: React.ReactNode; more?: React.ReactNode };

/** 머리 문장 안의 숫자. 문장이 곧 이 타일의 결론이라 숫자는 그 안에서만 굵게 선다. */
function Num({ children, color }: { children: React.ReactNode; color?: string }) {
  return <b style={{ fontWeight: 800, color: color ?? C.ink }}>{children}</b>;
}

/**
 * '10년 전체' — 막대에 안 깔린 해까지 조회 기간 전체를 펼친다.
 *
 * shadcn Popover(Base UI)다(2026-09-26) — 마우스를 올리거나 누르면 열리고 Esc·바깥 누르기로 닫힌다. 단추에
 * aria-expanded 가 붙어 화면 낭독기가 '펼침/접힘'을 읽는다. 예전엔 CSS 뿐이라(:hover · :focus-within) Esc 로 안 닫혔고,
 * 버튼을 눌러도 포커스를 안 주는 브라우저(아이폰 사파리)에선 여닫기가 :hover 흉내에 기댔다. 모양은 badges.css 의 .hz-yrpop.
 *
 * 예전엔 아이콘(open_in_full)만 있었다. 머리 줄에 글자를 얹을 자리가 없어서였는데, 바닥 요약
 * 줄이 빠지면서 자리가 생겼다 — 무엇을 여는지 글자로 적는다(토스 Predictable hint).
 */
function YearsPopover({ years, label }: { years: YearStat[]; label: string }) {
  const max = Math.max(...years.flatMap((y) => [Math.abs(y.ret), Math.abs(y.mdd)]), 1);
  return (
    <span className="hz-yrpop-host">
      <Popover>
        {/* 올리자마자 연다(예전 :hover 와 같다). 단추와 판은 4px 겹쳐 건너는 동안 안 닫힌다. */}
        <PopoverTrigger openOnHover delay={0} closeDelay={80} className="hz-yrpop-btn" aria-label={`${label} 연도별 성적 보기`}>
          {label} 전체
          <Icon name="chevron_right" style={{ fontSize: "var(--fs-15)" }} />
        </PopoverTrigger>
        {/* 아래로, 오른쪽 끝을 단추에 맞춰 편다. 아래가 모자라면 위로만 뒤집는다 — 옆으로 비켜 열리면 타일 막대를 가린다
            (위아래 모두 몇 px 모자란 자리에서 Floating UI 기본값은 오른쪽을 골랐다). 그래도 모자라면 높이가 줄고 판 안에서 스크롤. */}
        <PopoverContent
          side="bottom"
          align="end"
          // 오른쪽 끝을 단추 글자 칸(host)에 맞춘다 — 단추가 margin-right -4 로 밖에 나와 있어 단추 끝에 맞추면 4px 오른쪽에 선다(예전 판과 같게).
          alignOffset={4}
          sideOffset={-4}
          collisionAvoidance={{ side: "flip", align: "flip", fallbackAxisSide: "none" }}
          collisionPadding={8}
          className="hz-yrpop"
          aria-label={`${label} 연도별 성적`}
        >
          <span className="hz-yrpop-head">{label} 연도별 성적</span>
          {/* 오래된 해가 위, 올해가 맨 아래. 타일 막대와 같은 순서다. 한 해의 두 줄도 타일과 같은
              순서로 **낙폭이 먼저, 수익이 두 번째**다(2026-08-04 에 바로잡음). */}
          {years.map((y) => (
            <span key={y.year} className="hz-yrpop-row">
              <span className="hz-yrpop-year">{y.year}</span>
              <span className="hz-yrpop-bars">
                <span className="hz-yrpop-bar" style={{ width: `${Math.max(2, (Math.abs(y.mdd) / max) * 100)}%`, background: C.cold, opacity: 0.45 }} />
                <span className="hz-yrpop-bar" style={{ width: `${Math.max(2, (Math.abs(y.ret) / max) * 100)}%`, background: y.ret >= 0 ? C.mania : C.cold }} />
              </span>
              <span className="hz-yrpop-val">
                <span style={{ color: C.cold, opacity: 0.75 }}>{`${Math.round(y.mdd)}%`}</span>
                <span style={{ color: y.ret >= 0 ? C.mania : C.cold }}>{`${y.ret >= 0 ? "+" : "−"}${Math.abs(Math.round(y.ret))}%`}</span>
              </span>
            </span>
          ))}
        </PopoverContent>
      </Popover>
    </span>
  );
}

export function RiskProfile({ r, periodLabel, market }: { r: RiskProfileData; periodLabel: string; market: string | null }) {
  const yrs = Math.max(1, Math.round(r.years));
  const alone = r.withMarket === null ? 0 : r.bigDropCount - r.withMarket;
  const bench = benchName(market);
  /* 두 벌을 구분해서 든다.
       scoped — **조회 기간 전체**의 해들. 머리 문장이 세는 창이고, '전체' 팝오버가 펴는 것도 이것이다.
       yearly — 그중 막대로 깔 최근 RISK_ROWS 줄. 자리 때문에 자른 것뿐이다.
     ⚠️ `r.yearly` 를 그대로 쓰면 안 된다. yearlyStats 는 거래일이 20일 넘는 해를 다 세므로
     10년 조회에 11개(2016~2026)가 나온다 — 조회 기간만큼(`-yrs`) 잘라야 한다. */
  const scoped = r.yearly.slice(-yrs);
  const yearly = scoped.slice(-RISK_ROWS);
  const events = r.events.slice(-RISK_ROWS);

  // 뒤 두 타일의 한 줄은 '큰 하락 한 건'이라, 같은 해에 두 번 났으면 연도만으로는 두 줄이
  // 구분되지 않는다(삼성전자 2026). 그런 해에만 고점 월을 붙인다.
  const eventYearCount = new Map<number, number>();
  for (const e of events) eventYearCount.set(e.year, (eventYearCount.get(e.year) ?? 0) + 1);
  const eventLabels = events.map((e) => ((eventYearCount.get(e.year) ?? 0) > 1 ? `${e.year}.${e.month}` : `${e.year}`));

  /* 제목 옆 괄호. 뒤 두 타일(속도·동반성)은 막대 RISK_ROWS 줄이 전부라 **실제 줄 수**를 적는다
     (전체 건수를 적었더니 "7건"인데 5줄만 깔려 두 줄을 찾게 됐다). 앞 타일은 조회 기간 전체에
     닿는데, 그 기간은 시트 머리 딱지가 이미 말한다 — 여기 또 적으면 한 시트에 "최근 10년"이 셋이었다.
     부제 끝에 있다가 부제를 걷으며 제목 옆으로 왔다(2026-09-24). 괄호는 그리는 쪽이 친다. */
  const eventScope = events.length ? `최근 ${events.length}건` : "";

  const empty = (text: string) => <p style={{ margin: 0, fontSize: "var(--fs-11-5)", color: C.muted, lineHeight: 1.6 }}>{text}</p>;
  const rows = (children: React.ReactNode) => <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
  /** 거울 막대의 반쪽 폭 — 최댓값이 반폭(50%)을 꽉 채운다. */
  const half = (v: number, max: number) => (Math.abs(v) / max) * 50;
  /**
   * 제곱근 눈금(반폭 기준). 한 값이 나머지를 압도할 때 쓴다(SK하이닉스 10년: 2025년 수익 +280%가
   * 축을 다 먹어 낙폭 막대가 6~20px 로 뭉갰다). 단조 증가라 "어느 쪽이 긴가"는 그대로 남는다.
   */
  const halfSqrt = (v: number, max: number) => Math.sqrt(Math.abs(v) / max) * 50;

  /* 1 — 낙폭 대비 보상: 해마다 '그 해 최악 낙폭'(왼쪽·파랑)과 '그 해 수익'(오른쪽·빨강).
     손실인 해는 수익도 하락이므로 오른쪽이지만 파랑으로 칠한다.
     평균 낙폭은 **조회 기간 전체**(scoped)로 센다 — 옆의 연평균(복리)과 같은 창이어야 한다.
     ⚠️ '최악'(기간 전체 최대 낙폭)은 적지 않는다. 막대는 해 안에서 다시 잡은 고점 대비라 잣대가
     둘이 된다 — 기간 최저점은 히어로가 이미 크게 적는다.
     ⚠️ 수익은 **복리 연평균(CAGR)** 이라 문장에 "복리로"를 적는다. 산술 평균과 4~7%p 갈린다.
     ⚠️ 비율("보상 0.89배")은 쓰지 않는다 — 1 미만의 '배'는 손해로 먼저 읽힌다. */
  const avgYearMdd = scoped.length ? scoped.reduce((s, y) => s + y.mdd, 0) / scoped.length : 0;
  const tile1: TileBody =
    yearly.length === 0
      ? { lead: null, viz: empty("연도별 표본이 부족합니다.") }
      : {
          lead:
            r.annualReturn >= 0 && avgYearMdd < 0 ? (
              <>
                해마다 <Num color={DOWN}>−{Math.abs(Math.round(avgYearMdd))}%</Num> 낙폭을 견디고 복리로 연{" "}
                <Num color={UP}>+{r.annualReturn.toFixed(1)}%</Num>를 벌었습니다
              </>
            ) : (
              <>
                연평균(복리) <Num color={DOWN}>{Math.abs(r.annualReturn).toFixed(1)}%</Num> 손실이라 견딘 위험을 보상하지 못했습니다
              </>
            ),
          viz: (
            <>
              <MirrorAxis left={{ label: "그 해 낙폭", color: DOWN_BAR[2] }} right={{ label: "그 해 수익", color: UP_BAR_SOFT }} />
              {rows(
                (() => {
                  const max = Math.max(...yearly.flatMap((y) => [Math.abs(y.ret), Math.abs(y.mdd)]), 1);
                  return yearly.map((y) => (
                    <MirrorRow
                      key={y.year}
                      label={`${y.year}`}
                      left={{ pct: halfSqrt(y.mdd, max), value: `${Math.round(y.mdd)}%`, color: DOWN_BAR[2], ink: DOWN }}
                      right={{
                        pct: halfSqrt(y.ret, max),
                        value: `${y.ret >= 0 ? "+" : "−"}${Math.abs(Math.round(y.ret))}%`,
                        color: y.ret >= 0 ? UP_BAR_SOFT : DOWN_BAR[2],
                        ink: y.ret >= 0 ? UP : DOWN,
                      }}
                    />
                  ));
                })(),
              )}
            </>
          ),
          /* 막대가 이미 전부면(조회 기간이 짧아 잘릴 게 없으면) 버튼을 안 만든다. */
          more: scoped.length > yearly.length ? <YearsPopover years={scoped} label={`${yrs}년`} /> : null,
        };

  /* 2 — 하락 vs 회복 속도: 큰 하락마다 '빠지는 데'(왼쪽)와 '되돌아오는 데'(오른쪽).
     기간은 33일 ~ 1,387일처럼 자릿수 차가 커서 제곱근 눈금을 쓴다. */
  const tile2: TileBody =
    events.length === 0
      ? { lead: null, viz: empty("큰 하락 표본이 얇습니다.") }
      : {
          lead:
            r.dropDaysMedian !== null && r.recoverDaysMedian !== null ? (
              <>
                보통 <Num color={DOWN}>{fmtDur(r.dropDaysMedian)}</Num> 빠지고 <Num color={UP}>{fmtDur(r.recoverDaysMedian)}</Num> 만에
                되돌아왔습니다
              </>
            ) : (
              <>되찾은 큰 하락 표본이 얇습니다</>
            ),
          viz: (
            <>
              <MirrorAxis left={{ label: "빠지는 데", color: DOWN_BAR[2] }} right={{ label: "되찾는 데", color: UP_BAR_SOFT }} />
              {rows(
                (() => {
                  const max = Math.max(...events.map((e) => Math.max(e.dropDays, e.recoverDays ?? 0)), 1);
                  return events.map((e, i) => (
                    <MirrorRow
                      key={i}
                      label={eventLabels[i]}
                      left={{ pct: halfSqrt(e.dropDays, max), value: fmtDur(e.dropDays), color: DOWN_BAR[2], ink: DOWN }}
                      right={{
                        // 미회복은 '지금까지 걸린 시간'이 아직 안 끝났다는 뜻이라 짧은 점선만 둔다.
                        pct: e.recoverDays === null ? 4 : halfSqrt(e.recoverDays, max),
                        value: e.recoverDays === null ? "미회복" : fmtDur(e.recoverDays),
                        color: UP_BAR_SOFT,
                        ink: e.recoverDays === null ? C.sub : UP,
                        dashed: e.recoverDays === null,
                      }}
                    />
                  ));
                })(),
              )}
            </>
          ),
        };

  /* 3 — 혼자 빠지나, 같이 빠지나: 큰 하락마다 이 종목과 지수의 낙폭. 양쪽 다 낙폭이라 **둘 다
     파랑**이고, 어느 쪽인지는 명도로 가른다. 같은 방향 두 막대라 길이를 바로 견준다. */
  const tile3: TileBody =
    events.length === 0
      ? { lead: null, viz: empty("큰 하락이 없었습니다.") }
      : !events.some((e) => e.market !== null)
        ? { lead: null, viz: empty(`${bench} 데이터가 없습니다.`) }
        : {
            lead:
              r.withMarket === null ? (
                <>{bench} 데이터가 없습니다</>
              ) : alone > 0 ? (
                <>
                  큰 하락 <Num>{r.bigDropCount}번</Num> 중 <Num color={DOWN}>{alone}번</Num>은 이 종목만 빠졌습니다
                </>
              ) : (
                <>
                  큰 하락 <Num>{r.bigDropCount}번</Num> 모두 {bench}도 함께 빠졌습니다
                </>
              ),
            viz: (
              <>
                <TwinAxis a={{ label: "이 종목", color: DOWN_BAR[0] }} b={{ label: bench, color: DOWN_BAR[3] }} />
                {rows(
                  (() => {
                    const max = Math.max(...events.flatMap((e) => [Math.abs(e.stock), e.market !== null ? Math.abs(e.market) : 0]), 1);
                    return events.map((e, i) => (
                      <TwinRow
                        key={i}
                        label={eventLabels[i]}
                        a={{ pct: half(e.stock, max) * 2, value: `${Math.round(e.stock)}%`, color: DOWN_BAR[0], ink: DOWN }}
                        b={{
                          pct: e.market === null ? 0 : half(e.market, max) * 2,
                          value: e.market === null ? "—" : `${Math.round(e.market)}%`,
                          color: DOWN_BAR[3],
                          ink: C.sub,
                        }}
                      />
                    ));
                  })(),
                )}
              </>
            ),
          };

  const tiles: { label: string; scope: string; body: TileBody }[] = [
    { label: "낙폭 대비 보상", scope: "", body: tile1 },
    { label: "하락 vs 회복 속도", scope: eventScope, body: tile2 },
    { label: "혼자 빠지나, 같이 빠지나", scope: eventScope, body: tile3 },
  ];

  return (
    <Sheet>
      <SectionHead level={3}
        icon="monitoring"
        title="리스크 프로필"
        desc="이 종목을 들고 있으면 어떤 위험을 감수하게 되는지, 세 가지 각도로 봅니다"
        note={periodLabel}
      />
      {/* 세 타일이 [제목][문장][막대] 세 행을 공유한다(subgrid). 문장 길이가 타일마다 달라
          어떤 폭에서는 두 줄, 어떤 폭에서는 한 줄이 되는데, 타일마다 제 높이를 쓰면 막대 시작
          줄이 어긋난다. 행을 공유해 구조로 맞춘다. 타일 모양은 .hz-tx .hz-panelgrid 가 준다.
          '전체' 버튼 몫이던 넷째 행은 버튼이 제목 줄로 올라가며 없앴다(2026-09-24). */}
      <div className="hz-panelgrid hz-panelgrid-3" style={{ gridTemplateRows: "auto auto 1fr" }}>
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              display: "grid",
              gridTemplateRows: "subgrid",
              gridRow: "span 3",
              rowGap: 0,
              padding: "18px 20px",
              minWidth: 0,
            }}
          >
            {/* 제목 줄 — 왼쪽 제목(+ 굵지 않은 괄호), 오른쪽 '전체' 버튼. 가운데 맞춤이라 버튼(23px)이 줄 높이를
                키워도 세 타일의 제목이 같은 선에 선다(첫 행을 subgrid 로 공유한다). */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, marginBottom: 10 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: 700, letterSpacing: "-.01em", color: C.ink, wordBreak: "keep-all" }}>
                {t.label}
                {t.scope && (
                  <>
                    {" "}
                    {/* 크기·색은 첫 타일 제목 줄의 '10년 전체' 버튼(.hz-yrpop-btn: fs-11-5 · --c-sub)과 같다 —
                        한 줄에 선 두 부가 글자가 같은 생김새여야 한다(2026-09-24). 굵기는 뺀다(버튼은 600). */}
                    <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 400, color: C.sub, whiteSpace: "nowrap" }}>({t.scope})</span>
                  </>
                )}
              </span>
              {t.body.more}
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "var(--fs-13)", lineHeight: 1.7, color: C.inkSoft, wordBreak: "keep-all" }}>{t.body.lead}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{t.body.viz}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

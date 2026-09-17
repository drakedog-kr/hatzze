"use client";

// 위험 프로필 시트. MddExplorer.tsx 에서 그대로 옮겨 왔다(shared.ts 머리말 참고).

import type { RiskProfile as RiskProfileData, YearStat } from "@/lib/mdd";
import { C, Icon, MONO } from "../ui";
import { SectionHead } from "../kadera/SectionHead";
import { benchName, fmtDur, DOWN, UP, DOWN_BAR, UP_BAR_SOFT, UNRECOVERED } from "./shared";
import { Sheet, MirrorRow, MirrorAxis, Legend } from "./sheet";

const RISK_ROWS = 5; // 모든 타일이 쓰는 고정 줄 수(연도 5개 · 사건 5건)

/** 타일 본문 — 막대 영역(viz)과 맨 아래에 고정되는 요약 한 줄(foot)을 따로 들고 있는다. */
type TileBody = { head: React.ReactNode; viz: React.ReactNode; foot: React.ReactNode; more?: React.ReactNode };

/** 패널 머리의 큰 수치 둘 — 19px/800 + 작은 라벨. 세 패널이 같은 자리에 쓴다. */
function TileHead({ items }: { items: { value: string; label: string; tone: string }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <strong style={{ fontFamily: MONO, fontSize: "var(--fs-19)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, color: it.tone }}>
            {it.value}
          </strong>
          <span style={{ fontSize: "var(--fs-11)", color: C.muted, whiteSpace: "nowrap" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * '전체보기' — 막대에 안 깔린 해까지 조회 기간 전체를 펼친다.
 *
 * PC 는 마우스오버, 모바일은 탭으로 열린다. 여는 장치는 CSS 하나뿐이라(:hover 와
 * :focus-within, globals.css 의 .hz-yrpop) 상태도 이벤트 핸들러도 없다 — 카더라
 * 테마 로테이션의 .hz-theme-pop 과 같은 어법이다. 버튼이라 탭하면 포커스가 잡혀 열리고,
 * 딴 데를 누르면 포커스가 빠져 닫힌다.
 *
 * ⚠️ .hz-tip 은 :hover 전용이라 여기 못 쓴다(모바일에서 안 열린다).
 */
function YearsPopover({ years, label }: { years: YearStat[]; label: string }) {
  // 위로 편다 — 타일 맨 아래라 아래로 열면 카드 밖으로 나간다. 오른쪽 끝에 맞춰 세 번째
  // 타일에서도 카드 오른쪽으로 안 넘친다(넘치면 페이지에 가로 스크롤이 생긴다).
  const max = Math.max(...years.flatMap((y) => [Math.abs(y.ret), Math.abs(y.mdd)]), 1);
  return (
    <span className="hz-yrpop-host">
      {/* 글자 없이 아이콘만. 제목 줄에 "전체보기" 넉 자를 얹으면 부제와 부딪혀 제목이
          좁아진다. 뜻은 aria-label 이 지고, 커서·호버 색이 누를 수 있음을 알린다. */}
      <button type="button" className="hz-yrpop-btn" aria-label={`${label} 연도별 성적 보기`}>
        <Icon name="open_in_full" style={{ fontSize: "var(--fs-15)" }} />
      </button>
      <span className="hz-yrpop" role="group">
        <span className="hz-yrpop-head">
          {label} 연도별 성적
        </span>
        {/* 오래된 해가 위, 올해가 맨 아래. 타일 막대와 같은 순서라 펼쳤을 때 눈이
            같은 자리를 짚는다(막대도 2022→2026 으로 내려온다).

            한 해의 두 줄도 타일과 같은 순서로 **낙폭이 먼저, 수익이 두 번째**다.
            타일의 범례("그 해 최악 낙폭 · 그 해 수익")도, 거울 막대의 좌우(왼쪽 낙폭 ·
            오른쪽 수익)도 그 순서라, 여기만 뒤집혀 있으면 펼칠 때마다 읽는 순서가
            바뀐다(2026-08-04 에 바로잡음). */}
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
      </span>
    </span>
  );
}

export function RiskProfile({ r, periodLabel, market }: { r: RiskProfileData; periodLabel: string; market: string | null }) {
  const yrs = Math.max(1, Math.round(r.years));
  const alone = r.withMarket === null ? 0 : r.bigDropCount - r.withMarket;
  /* 두 벌을 구분해서 든다.
       scoped — **조회 기간 전체**의 해들. 요약 문장과 큰 수치가 세는 창이고,
                '전체보기' 팝오버가 펴는 것도 이것이다.
       yearly — 그중 막대로 깔 최근 RISK_ROWS 줄. 자리 때문에 자른 것뿐이다.

     ⚠️ `r.yearly` 를 그대로 쓰면 안 된다. yearlyStats 는 거래일이 20일 넘는 해를 다 세므로
     10년 조회에 11개(2016~2026)가 나온다 — 시작 해의 토막을 한 해로 세기 때문이다. 조회
     기간만큼(`-yrs`) 잘라야 "최근 10년"이라 적어 놓고 11년을 세는 일이 없다. */
  const scoped = r.yearly.slice(-yrs);
  const yearly = scoped.slice(-RISK_ROWS);
  const events = r.events.slice(-RISK_ROWS);

  // 뒤 두 타일의 한 줄은 '연도'가 아니라 '큰 하락 한 건'이라, 같은 해에 두 번 났으면
  // 연도만으로는 두 줄이 구분되지 않는다(삼성전자 2026 이 그렇다). 그런 해에만 고점 월을
  // 붙인다 — 한 번뿐인 해까지 붙이면 축이 괜히 시끄러워진다.
  const eventYearCount = new Map<number, number>();
  for (const e of events) eventYearCount.set(e.year, (eventYearCount.get(e.year) ?? 0) + 1);
  /* 연도는 네 자리 그대로 적는다. 예전엔 월이 붙는 줄만 두 자리로 줄였는데("2026.2" →
     "26.2"), 같은 축에서 `2024` 와 `26.2` 가 나란히 서니 무슨 해인지 한 번 더 세어야 했다.
     라벨 칸(MIRROR_LABEL_W)을 넓혀 두 자리로 줄이는 이유를 없앴다(2026-08-04). */
  const eventLabels = events.map((e) => ((eventYearCount.get(e.year) ?? 0) > 1 ? `${e.year}.${e.month}` : `${e.year}`));

  /* 타일 제목 옆 괄호. 두 타일과 한 타일이 서로 다른 것을 적는데, 다르게 적을 이유가 있다.
     기준은 하나다 — **괄호가 가리키는 것에 화면에서 닿을 수 있나.**

     뒤 두 타일(속도·동반성)은 막대 RISK_ROWS 줄이 전부라, 닿을 수 있는 건 그 줄들뿐이다.
     그래서 **실제 줄 수**를 적는다. 예전에 전체 건수(bigDropCount)를 적어 봤는데 SK하이닉스가
     "(최근 7건)"인데 5줄만 깔려서, 읽는 사람이 "7건을 보여준다"로 읽고 두 줄을 찾게 됐다.
     7 이라는 숫자는 그 타일 요약이 "7번 중 2번은…"으로 스스로 밝히니 잃지 않는다.

     앞 타일(보상)은 전체보기가 붙어 **조회 기간 전체에 실제로 닿는다.** 그래서 조회 기간을
     적는다. 막대는 최근 5줄이지만 나머지 해는 전체보기 안에 있고, 요약도 "최근 10년 해마다
     …"로 같은 창을 말한다. 셋이 같은 기간을 가리킨다.

     ⚠️ 이 타일에서 전체보기를 걷어내면 괄호도 같이 손봐야 한다. 그러면 10년이라 적고 5년만
     보여주는 상태로 되돌아간다(2026-07-30 에 실제로 그래서 어색했다). */
  const yearScope = yearly.length ? ` (최근 ${yrs}년)` : "";
  const eventScope = events.length ? ` (최근 ${events.length}건)` : "";

  const empty = (text: string) => <p style={{ margin: 0, fontSize: "var(--fs-11-5)", color: C.muted, lineHeight: 1.6 }}>{text}</p>;
  const rows = (children: React.ReactNode) => <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
  const summary = (text: string) => <p style={{ margin: 0, fontSize: "var(--fs-11)", color: C.sub2, lineHeight: 1.55, wordBreak: "keep-all" }}>{text}</p>;
  /** 거울 막대의 반쪽 폭 — 최댓값이 반폭(50%)을 꽉 채운다. */
  const half = (v: number, max: number) => (Math.abs(v) / max) * 50;
  /**
   * 제곱근 눈금(반폭 기준). 한 값이 나머지를 압도할 때 쓴다.
   *
   * 실측(SK하이닉스 10년): 2025년 수익 +280%가 축을 다 먹어 낙폭 막대가 6~20px 로
   * 뭉갰다(2023년 −17%는 6px). 제곱근은 짧은 쪽을 벌리면서 **순서와 좌우 비교를 지킨다**
   * — 단조 증가라 sqrt(a) > sqrt(b) 와 a > b 가 같은 뜻이고, 이 패널이 묻는 "어느 쪽이
   * 긴가"가 그대로 남는다. 대신 길이 '비율'은 실제보다 눌리므로 각주에 밝힌다.
   */
  const halfSqrt = (v: number, max: number) => Math.sqrt(Math.abs(v) / max) * 50;

  /* 1 — 낙폭 대비 보상: 해마다 '그 해 최악 낙폭'(왼쪽·파랑)과 '그 해 수익'(오른쪽·빨강).
         손실인 해는 수익도 하락이므로 오른쪽이지만 파랑으로 칠한다. */
  /* 큰 수치와 요약은 **조회 기간 전체**(scoped)로 센다. 막대에 깔린 최근 다섯 해가 아니다.
     예전엔 이 둘만 5년이라, 옆에 선 연평균(복리)은 10년인데 평균 낙폭은 5년이었고 그 둘을
     나눈 '보상 배수'는 창이 섞인 값이었다. 제목의 "(최근 10년)"·전체보기와도 어긋났다.
     (삼성전자 10년 실측: 평균 낙폭 −29% → −26%, 보상 0.78배 → 0.88배, 5년 중 3년 →
     10년 중 6년.) 2026-08-04.
     ⚠️ 여기 적힌 '보상 배수'도 '5년 중 3년'도 지금 화면에 없다. 둘 다 읽히지 않아
     걷어냈다(아래 foot 주석). 창을 맞춰야 하는 이유는 그대로다 — 남은 평균 낙폭이
     여전히 scoped 를 세고, 옆에 선 연평균(복리)과 같은 창이어야 한다. */
  const avgYearMdd = scoped.length ? scoped.reduce((s, y) => s + y.mdd, 0) / scoped.length : 0;
  const tile1: TileBody =
    yearly.length === 0
      ? { head: null, viz: empty("연도별 표본이 부족합니다."), foot: null }
      : {
          head: (
            <TileHead
              items={[
                { value: `${Math.abs(r.annualReturn).toFixed(1)}%`, label: `연평균(복리) ${r.annualReturn >= 0 ? "수익" : "손실"}`, tone: r.annualReturn >= 0 ? UP : DOWN },
                { value: `${Math.round(avgYearMdd)}%`, label: "해마다 겪은 평균 낙폭", tone: DOWN },
              ]}
            />
          ),
          viz: (
            <>
              <Legend
                items={[
                  { label: "그 해 최악 낙폭", background: DOWN_BAR[2] },
                  { label: "그 해 수익", background: UP_BAR_SOFT },
                ]}
              />
              <div style={{ margin: "11px 0 8px" }}>
                <MirrorAxis left="낙폭" right="수익" />
              </div>
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
          /* "연 +20.8%" 는 연도별 수익률을 그냥 평균 낸 값으로 읽히기 쉬운데, riskProfile 이
             내는 건 시작가·끝가만 쓰는 복리 연평균(CAGR)이다. 삼성전자 10년으로 재면 산술
             평균 +25.6% vs CAGR +20.8% 로 4.8%p 갈린다. 어느 쪽인지 이름으로 밝힌다.

             '최악'은 뺐다. 그 값은 **조회 기간 전체**의 최대 낙폭(고점이 해를 넘어간다)인데
             바로 위 막대는 **그 해 안에서** 다시 잡은 고점 대비라, 한 상자에 잣대가 둘이었다.
             삼성전자 10년이면 −45.2%(2021-01-11 → 2024-11-14)라 적히는데 막대의 어느 해에도
             그만큼 깊은 해가 없어(가장 깊은 2024년이 −43.2%) 읽는 사람이 찾다 만다.
             기간 전체 최저점은 헤드라인 카드가 '기간 최저점'으로 이미 크게 적는다. */
          /* 여기만 fmtPct 를 안 쓴다. 그 함수는 부호(+/−)를 붙이는데, 뒤에 '수익/손실'을
             달면 "−6.0% 손실"이 되어 부호와 낱말이 같은 말을 두 번 한다. 꼼꼼히 읽는
             사람은 "손실이 마이너스면 이득인가" 하고 한 번 멈춘다. 낱말이 부호보다 빨리
             읽히니 낱말을 남기고 부호를 뺀다. */
          /* 비율("위험 1을 견딜 때 보상 0.89배")도, 이긴 해 수("10년 중 6년은 보상이
             낙폭보다 컸습니다")도 걷어냈다. 남은 건 두 수치를 그대로 말하는 한 문장이다.

             비율을 버린 이유. '배'는 사람들이 원금 배수를 말할 때 쓰는 낱말이라 1 미만이면
             **손해로 먼저 읽힌다.** 삼성전자 0.89배가 실제로 그렇게 읽혔다 — 그 10년에
             7.9배가 된 종목인데 "0.89배면 손해 아닌가"가 첫 반응이었다. 앞에 "복리로는"을
             붙여 기준을 밝혀도 숫자 생김새가 이긴다. 라벨로는 안 고쳐지는 종류다.

             이긴 해 수를 버린 이유. 0.89 는 복리(CAGR)로 낸 값인데 "6년은 컸다"는 해마다의
             단순 수익이라, 한 문장 안에서 잣대가 둘이었다. 변동이 크면 복리가 산술평균보다
             낮아 둘이 어긋난다(삼성전자 10년: 산술 29.7% vs CAGR 22.9% → 같은 분모로
             1.15 와 0.89). "6/10 인데 왜 0.89인가"에서 멈추는 자리가 정확히 여기였다.
             비율만 걷어내도 표면은 가려지지만, 두 창이 섞여 있다는 사실 자체는 남는다.

             수익은 머리 수치와 같은 소수 한 자리로 적는다. 반올림해 "23%"로 적으면 두 줄
             위 "22.9%"와 어긋나 같은 상자에서 숫자가 둘이 된다.

             부호(−/+)를 붙인다. 바로 위 머리 수치는 낱말('수익'·'평균 낙폭')이 방향을
             말하니 부호를 뺐지만, 여기는 두 수치가 한 문장에 붙어 흐르므로 눈이 훑을 때
             방향을 잡아 줄 표시가 따로 필요하다. '낙폭'·'벌었습니다'와 뜻이 겹치는 건
             알고 넣은 것이다. 마이너스는 house 글리프인 U+2212(−)를 쓴다 — fmtPct 와
             막대 라벨이 그것이고, ASCII 하이픈을 섞으면 폭·높이가 갈린다.

             ⚠️ 해마다의 승패는 이제 문장이 아니라 **막대와 전체보기**에만 있다. 이 각주를
             다시 손댈 때 그 둘을 같이 지우면 연도별 대비가 화면에서 통째로 사라진다. */
          foot: summary(
            r.annualReturn >= 0 && avgYearMdd < 0
              ? `최근 ${yrs}년 해마다 −${Math.abs(Math.round(avgYearMdd))}% 낙폭을 견디고 연 +${r.annualReturn.toFixed(1)}%를 벌었습니다`
              : `최근 ${yrs}년은 연평균(복리) ${Math.abs(r.annualReturn).toFixed(1)}% 손실이라 견딘 위험을 보상하지 못했습니다`,
          ),
          /* 막대는 자리 때문에 최근 RISK_ROWS 줄뿐인데 제목·요약은 조회 기간 전체를 말한다.
             나머지 해를 여기서 펼쳐, 적어 둔 기간에 실제로 닿게 한다. 펴는 것은 요약이 세는
             것과 **같은 목록**(scoped)이라, 손으로 세어 봐도 문장과 맞는다.

             막대가 이미 전부면(조회 기간이 짧아 잘릴 게 없으면) 버튼을 안 만든다. */
          more: scoped.length > yearly.length ? <YearsPopover years={scoped} label={`최근 ${yrs}년`} /> : null,
        };

  /* 2 — 하락 vs 회복 속도: 큰 하락마다 '빠지는 데'(왼쪽)와 '되돌아오는 데'(오른쪽).
         ⚠️ 기간은 33일 ~ 1,387일처럼 자릿수 차가 커서 선형 눈금이면 짧은 막대가 사라진다.
         제곱근 눈금을 쓰고 각주에 밝힌다(MirrorRow 주석 참고). */
  const tile2: TileBody =
    events.length === 0
      ? { head: null, viz: empty("큰 하락 표본이 얇습니다."), foot: null }
      : {
          head: (
            <TileHead
              items={[
                { value: r.dropDaysMedian !== null ? fmtDur(r.dropDaysMedian) : "—", label: "하락 기간 중앙값", tone: DOWN },
                { value: r.recoverDaysMedian !== null ? fmtDur(r.recoverDaysMedian) : "—", label: "회복 기간 중앙값", tone: UP },
              ]}
            />
          ),
          viz: (
            <>
              <Legend
                items={[
                  { label: "빠지는 데", background: DOWN_BAR[2] },
                  { label: "되돌아오는 데", background: UP_BAR_SOFT },
                  { label: "미회복", background: UNRECOVERED },
                ]}
              />
              <div style={{ margin: "11px 0 8px" }}>
                <MirrorAxis left="하락" right="회복" />
              </div>
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
                        ink: e.recoverDays === null ? C.sub2 : UP,
                        dashed: e.recoverDays === null,
                      }}
                    />
                  ));
                })(),
              )}
            </>
          ),
          foot: summary(
            r.dropDaysMedian !== null && r.recoverDaysMedian !== null
              ? `보통 ${fmtDur(r.dropDaysMedian)} 빠지고 ${fmtDur(r.recoverDaysMedian)} 만에 되돌아왔습니다`
              : "되찾은 큰 하락 표본이 얇습니다",
          ),
        };

  /* 3 — 혼자 빠지나, 같이 빠지나: 큰 하락마다 이 종목과 코스피의 낙폭. */
  const tile3: TileBody =
    events.length === 0
      ? { head: null, viz: empty("큰 하락이 없었습니다."), foot: null }
      : !events.some((e) => e.market !== null)
        ? { head: null, viz: empty(`${benchName(market)} 데이터가 없습니다.`), foot: null }
        : {
            /* 양쪽 다 낙폭이라 **둘 다 파랑**이다 — 여기서 빨강을 쓰면 코스피 하락이
               회복으로 읽힌다. 어느 쪽인지는 명도로 가른다. */
            head: (
              <TileHead
                items={[
                  { value: `${r.bigDropCount}번`, label: "큰 하락", tone: DOWN },
                  { value: `${alone}번`, label: "이 종목만 빠짐", tone: C.ink },
                ]}
              />
            ),
            viz: (
              <>
                <Legend
                  items={[
                    { label: "이 종목", background: DOWN_BAR[0] },
                    { label: benchName(market), background: DOWN_BAR[3] },
                  ]}
                />
                <div style={{ margin: "11px 0 8px" }}>
                  <MirrorAxis left="이 종목" right={benchName(market)} />
                </div>
                {rows(
                  (() => {
                    const max = Math.max(...events.flatMap((e) => [Math.abs(e.stock), e.market !== null ? Math.abs(e.market) : 0]), 1);
                    return events.map((e, i) => (
                      <MirrorRow
                        key={i}
                        label={eventLabels[i]}
                        left={{ pct: half(e.stock, max), value: `${Math.round(e.stock)}%`, color: DOWN_BAR[0], ink: DOWN }}
                        right={{
                          pct: e.market === null ? 0 : half(e.market, max),
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
            foot: summary(
              r.withMarket === null
                ? `${benchName(market)} 데이터가 없습니다`
                : alone > 0
                  ? `${r.bigDropCount}번 중 ${alone}번은 이 종목만 빠졌습니다`
                  : `큰 하락 때마다 ${benchName(market)}도 함께 빠졌습니다`,
            ),
          };

  const tiles: { icon: string; label: string; sub: string; body: TileBody }[] = [
    { icon: "balance", label: "낙폭 대비 보상", sub: `감수한 위험만큼 돌려받았나${yearScope}`, body: tile1 },
    { icon: "speed", label: "하락 vs 회복 속도", sub: `빠지는 데 vs 되돌아오는 데${eventScope}`, body: tile2 },
    { icon: "sync", label: "혼자 빠지나, 같이 빠지나", sub: `큰 하락 때 ${benchName(market)}도 같이 빠졌나${eventScope}`, body: tile3 },
  ];

  return (
    <Sheet>
      <SectionHead level={2}
        icon="monitoring"
        title="리스크 프로필"
        desc="이 종목을 들고 있으면 어떤 위험을 감수하게 되는지, 세 가지 각도로 봅니다"
        note={periodLabel}
      />
      {/* 세 패널이 [머리말][큰 수치][막대][요약] 네 행을 공유한다(subgrid). 부제 길이가
          패널마다 달라 어떤 폭에서는 두 줄, 어떤 폭에서는 한 줄이 되는데, 패널마다 제
          높이를 쓰면 그만큼 막대 시작 줄이 어긋난다. 행을 공유해 구조로 맞춘다.
          ⚠️ minmax(min(280px,100%), 1fr) — 280px 를 그냥 두면 좁은 폭에서 트랙이
          컨테이너보다 넓어진다. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
          gridTemplateRows: "auto auto 1fr auto",
          alignItems: "stretch",
          // 아래 셀들이 긋는 마지막 줄 아랫선을 시트 밖으로 밀어 잘라낸다(위 히어로와 같은 짝).
          marginBottom: -1,
        }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              display: "grid",
              gridTemplateRows: "subgrid",
              gridRow: "span 4",
              rowGap: 0,
              padding: "18px 22px",
              minWidth: 0,
              // 오른쪽·아래 두 곳에 긋는다 — 좁은 폭에서 1열로 접히면 세로선은 시트
              // 테두리와 겹치고 패널 사이를 가르는 건 아랫선이다(히어로 cell 주석 참고).
              boxShadow: `inset -1px 0 0 ${C.line}, inset 0 -1px 0 ${C.line}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 13 }}>
              <Icon name={t.icon} style={{ fontSize: "var(--fs-17)", color: C.muted, marginTop: 1, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 800, letterSpacing: "-.01em", color: C.ink, wordBreak: "keep-all" }}>{t.label}</span>
                <span style={{ fontSize: "var(--fs-11)", lineHeight: 1.5, color: C.muted, wordBreak: "keep-all" }}>{t.sub}</span>
              </div>
            </div>
            <div style={{ marginBottom: 13 }}>{t.body.head}</div>
            <div>{t.body.viz}</div>
            {/* 요약과 전체보기가 한 줄을 나눠 쓴다. 팝오버가 이 칸 기준으로 위로 펴지므로
                relative 가 여기 있어야 한다(패널에 주면 요약 줄 위로 안 붙는다). */}
            {/* 요약은 폭을 가리지 않고 왼쪽이다(.mdd-tile-foot). '전체보기'가 있으면
                그것만 오른쪽 끝으로 밀린다. */}
            <div className="mdd-tile-foot" style={{ position: "relative", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.sheetRow}` }}>
              {/* foot 은 <p> 라 <span> 으로 감싸면 안 된다(span 은 phrasing content 만 받는다). */}
              <div style={{ minWidth: 0 }}>{t.body.foot}</div>
              {t.body.more}
            </div>
          </div>
        ))}
      </div>
      {/* 각주 띠가 있었다("파랑은 하락, 빨강은 회복·수익입니다…"). 2026-09-05 에 뺐다 —
          세 패널이 저마다 범례를 이미 달고 있어(그 해 최악 낙폭·그 해 수익 / 빠지는 데·
          되돌아오는 데 / 이 종목·코스피) 같은 말을 시트 바닥에서 한 번 더 한 것이었다.
          토스 라이팅의 Remove empty sentences. 눈금 이야기(제곱근)는 읽는 데 필요 없다. */}
    </Sheet>
  );
}

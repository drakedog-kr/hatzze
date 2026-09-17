// 홈의 감성 지표 카드들. app/page.tsx 에서 그대로 옮겨 왔다(app/home/parts.tsx 머리말 참고).

import { formatIndicatorValue, formatSampleCount, sentimentTone, shortDate } from "@/lib/format";
import { C, Icon, MONO, R } from "../ui";
import { overheatColor, Shell, TitleRow, Big, Foot, HeatFill, AreaChart } from "./parts";
import type { Pick } from "./parts";

// 신용융자 잔고 — DB 미보유 placeholder ("준비 중").
// 목업은 점선 상승 곡선이 아니라 **점선 상자 + 모래시계**다. 곡선은 "이런 모양일 것"이라는
// 가짜 데이터라, 값이 없는 카드에 그려 두면 한 번은 진짜로 읽힌다.
export function CardComingSoon() {
  return (
    <Shell minH={230}>
      <TitleRow icon="credit_score" name="신용융자 잔고" desc="빚내서 주식을 산 금액" badge="준비 중" />
      <div
        style={{
          flex: 1,
          minHeight: 96,
          borderRadius: R.control,
          border: `1.5px dashed ${C.line}`,
          background: C.soft,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Icon name="hourglass_empty" style={{ fontSize: "var(--fs-24)", color: C.muted }} />
        <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.sub }}>데이터 준비 중</span>
      </div>
      <Foot text="빚내서 주식 사는 돈이 불어나면 과열 신호입니다" />
    </Shell>
  );
}

// ── 소셜 지표 카드들 ──────────────────────────────────────────────

// '평소 대비 N배' — 절대 건수가 없는 네이버 검색지수(0~100 상대지수)를 직관적으로
// 보여준다. ratio = 현재 / 최근 30일 평균. 가운데 눈금(1배=평소)을 기준으로
// 오른쪽으로 넘으면 평소보다 활발(과열 방향).
/**
 * 1배(평소) 축 위에서 값이 갖는 색.
 *
 * 이 축은 양극이다 — 가운데가 평소이고 오른쪽이 '많다', 왼쪽이 '적다'. 그래서 색을
 * 카드의 과열도(v.color)에서 가져오면 안 된다. 외식 검색 1.3배는 평소보다 **많은데**
 * 그 지표의 과열도가 아직 상온이라 파랑으로 떴다 — 막대는 오른쪽으로 뻗는데 색은
 * 차갑다고 말하는 꼴이었다(2026-08-03).
 * 축이 스스로 말하게 둔다: 1배 위는 빨강, 아래는 파랑, 정확히 1배면 중립.
 */
function VsAvg({ ratio, knob, showScale = true }: { ratio: number; knob: string; showScale?: boolean }) {
  // **1배를 축 한가운데에 못박는다.** 예전엔 0~2배를 0~100%로 폈는데(1배가 가운데인 건
  // 같지만) 축이 넓어 1.0배와 1.3배가 15%p 차이로 붙어 보였다. ±0.5배를 양 끝으로 두면
  // 같은 차이가 30%p 로 벌어진다. 검색 지수는 1배 근처에서 노는 값이라 이쪽이 맞다.
  const pos = Math.max(0, Math.min(100, 50 + (ratio - 1) * 100));
  // 채움을 **가운데에서 뻗어 나가게** 한다. 왼쪽 끝에서부터 채우면 1.0배(평소)도 절반이
  // 차 있어 "꽤 많다"로 읽힌다. 가운데 기준이면 평소는 채움이 없고, 채운 길이가 곧
  // '평소에서 얼마나 벗어났나'다 — 두 줄을 위아래로 놓았을 때 방향이 바로 갈린다.
  const fillLeft = Math.min(50, pos);
  const fillWidth = Math.abs(pos - 50);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ position: "relative", height: 12 }}>
        <div style={{ height: "100%", borderRadius: R.pill, background: C.track }} />
        <span
          style={{
            position: "absolute",
            left: `${fillLeft}%`,
            top: 0,
            height: 12,
            width: `${fillWidth}%`,
            background: knob,
            borderRadius: R.pill,
          }}
        />
        {/* 1배 눈금. 채움이 없는 줄(평소 수준)에서도 축의 기준이 어디인지 보여야 한다. */}
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: -3,
            height: 18,
            width: 1.5,
            background: C.marker,
            transform: "translateX(-50%)",
          }}
        />
        {/* 노브는 흰 속을 둔 테두리 알약이다. 꽉 찬 점으로 두면 채움과 같은 색이라
            채움 끝에서 사라진다. clamp 로 양 끝에서도 트랙 밖으로 안 나간다. */}
        <span
          style={{
            position: "absolute",
            left: `clamp(7px, ${pos}%, 100% - 7px)`,
            top: -4,
            transform: "translateX(-50%)",
            width: 14,
            height: 18,
            borderRadius: 6,
            background: C.card,
            border: `3px solid ${knob}`,
            boxSizing: "border-box",
          }}
        />
      </div>
      {showScale && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {/* 눈금 라벨은 --c-sub 이상으로. faint 는 장식용 선에만 쓴다(대비 규칙). */}
          <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub }}>적음</span>
          <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: C.sub2 }}>평소(1배)</span>
          <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub }}>많음</span>
        </div>
      )}
    </div>
  );
}

// 실물–증시 괴리 — 실물 강도 / 증시 강세를 각자 역대 백분위로 매겨 나란히 둔다.
// 괴리는 둘의 '곱'이 아니라 '차이'(lead = 증시%ile − 실물%ile)다.
// 목업은 큰 막대 둘을 **타일 두 칸**으로 줄였다 — 결론(누가 몇 % 앞서나)이 이미 큰 수치로
// 나와 있어서, 아래는 근거 두 값이 나란히 있으면 된다.
export function CardDivergence({ v }: { v: Pick }) {
  const dt = v.details;
  const real = dt?.real_strength ?? 0;
  const market = dt?.market_strength ?? 0;
  const lead = dt?.lead ?? market - real; // +면 증시 강세, −면 실물 강세
  const marketLeads = lead >= 0;
  const leadWho = marketLeads ? "증시" : "실물 경제";
  const ccsi = dt?.ccsi_value;
  const gap = dt?.kospi_gap;
  const level = (x: number) => (x >= 66 ? "높음" : x >= 33 ? "보통" : "낮음");
  // ⚠️ 두 값의 **과열 방향이 반대**다. 이 지표의 과열도는 lead = 증시%ile − 실물%ile 이라
  // (calculate_score.py), 증시가 높을수록 과열이고 **실물이 높을수록 차갑다**("실물이 크게
  // 앞서면 차갑다로 읽히게 한다" — 그 주석). 그래서 색을 낼 때 실물만 100−값으로 뒤집는다.
  // 한때 둘 다 overheatColor(값) 으로 칠했는데, 그러면 실물 74(=건강)가 빨강으로 떠서
  // 카드가 "과열"이라고 말하는 꼴이었다(2026-08-03).
  const tiles = [
    {
      label: "실물 강도",
      hint: "소비심리(CCSI)",
      value: real,
      heat: 100 - real,
      tip:
        ccsi != null
          ? `한국은행 소비자심리지수(CCSI) 최신값은 ${ccsi}입니다. 이게 역대(2008~) 분포에서 몇 번째로 높은지를 0~100으로 매긴 값이 실물 강도입니다.`
          : undefined,
    },
    {
      label: "증시 강세",
      hint: "신고가 근접도",
      value: market,
      heat: market,
      tip:
        gap != null
          ? `코스피는 최근 종가 기준 전고점보다 ${Math.abs(gap)}% 아래입니다. 이 낙폭이 역대(10년) 분포에서 얼마나 얕은지를 0~100으로 매긴 값이 증시 강세입니다.`
          : undefined,
    },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="compare_arrows" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: "var(--fs-30)", fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
          {leadWho} <span style={{ fontFamily: MONO }}>{Math.round(Math.abs(lead))}%</span>
        </strong>
        <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2 }}>강세</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              className={t.tip ? "hz-tip hz-tip-wide hz-tip-start" : undefined}
              data-tip={t.tip}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.sub2 }}
            >
              {t.label}
              {/* ⚠️ `C.hint` 였다. 그 토큰은 **점선·비활성 아이콘**용이라 명암비가 라이트
                  1.49 · 다크 2.3 으로, 그림에 요구되는 3:1 에도 못 미친다. 이 물음표는
                  장식이 아니라 **툴팁이 있다는 유일한 표시**라 안 보이면 기능이 사라진다.
                  시트 머리(kadera/SectionHead)가 같은 이유로 이미 muted 로 옮겼다. */}
              {t.tip && <Icon name="help" style={{ fontSize: "var(--fs-13)", color: C.muted }} />}
            </span>
            <span style={{ fontSize: "var(--fs-11-5)", color: C.muted }}>{t.hint}</span>
            {/* 색은 값이 아니라 **그 값이 뜻하는 과열도**(heat)로 낸다 — 위 주석 참고.
                예전엔 '앞서는 쪽'만 파랑이고 나머지는 먹색이라, 같은 눈금의 두 수가 서로 다른
                규칙으로 칠해져 비교가 안 됐다. 어느 쪽이 앞서는지는 위 큰 수치가 이미 말한다. */}
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-17)", fontWeight: 800, color: overheatColor(t.heat) }}>
              {level(t.value)} {Math.round(t.value)}
              <span style={{ fontSize: "var(--fs-12)", color: C.sub }}>/100</span>
            </strong>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 초보검색 / 깃헙 봇 / 베스트셀러 — 모양이 둘로 갈린다.
//  · details.vs_avg 가 있으면(네이버 검색지수) '평소 대비 N배' 눈금
//  · 없으면 값 + 초고온 기준선까지의 진행 막대
// 목업이 스파크라인을 걷어냈다. 30일 선은 "언제 뛰었나"를 말하는데, 이 셋의 질문은
// "지금 얼마나 뜨거운가" 하나뿐이라 기준선까지의 거리가 그 답을 그대로 그린다.
export function CardTrend({ v, icon }: { v: Pick; icon: string }) {
  const vsAvg = v.details?.vs_avg ?? null;
  const arrow = vsAvg === null || vsAvg === 1 ? "" : vsAvg > 1 ? "↑" : "↓";
  // 진행 막대는 0 ~ 초고온 진입선을 축으로 쓴다. 카드가 "기준선 N"이라고 적는 그 값이다.
  const hot = v.ind?.latest?.details?.hot_threshold ?? null;
  const pct = hot && v.raw !== null ? Math.max(0, Math.min(100, (v.raw / hot) * 100)) : null;
  const chart = v.historyPoints.map((x) => ({ key: x.date, value: x.value }));
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon={icon} name={v.name} />
      {vsAvg !== null ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-32)", fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
              {vsAvg.toFixed(1)}배
            </strong>
            {/* 화살표·막대·숫자가 **한 색**이어야 한다. 예전엔 숫자만 온도색이고
                화살표·막대는 평균 대비 방향(>1 이면 빨강)이라, 1.1배(과열도 저온) 카드가
                파란 숫자 옆에 빨간 화살표를 달고 있었다 — 한 줄이 두 말을 했다.
                방향은 이미 화살표 모양과 막대가 뻗는 쪽이 말한다. 색은 온도만 맡는다. */}
            {arrow && <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 700, color: v.color }}>{arrow}</span>}
            <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2 }}>평소 대비</span>
          </div>
          <VsAvg ratio={vsAvg} knob={v.color} />
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <Big disp={v.disp} unit={v.unit} color={v.color} size={32} />
            {v.hotDisp && (
              <span style={{ fontFamily: MONO, fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.sub, background: C.chip, borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
                초고온 {v.hotDisp}
              </span>
            )}
          </div>
          {/* 진행 막대에서 차트로 되돌렸다(2026-08-03). 이 둘은 값이 하루하루
              오르내리는 계열이라 "지금 어디"보다 "어떻게 움직여 왔나"가 더 읽을 게 많다.
              기준선까지의 거리는 위 칩(초고온 N)이 그대로 말한다. */}
          {chart.length >= 2 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <AreaChart
                points={chart}
                color={v.color}
                tip={(x) => {
                  const g = formatIndicatorValue(x.value, v.ind?.unit ?? "");
                  return `${shortDate(x.key)} · ${g.display}${g.displayUnit}`;
                }}
              />
              {/* 기간은 차트의 캡션이지 큰 수치의 곁말이 아니다 — 차트 밑 오른쪽에 둔다. */}
              <span style={{ alignSelf: "flex-end", fontSize: "var(--fs-11)", color: C.sub }}>최근 30일</span>
            </div>
          ) : (
            pct !== null && <HeatFill pct={pct} />
          )}
        </>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

// 중앙 기준 감성/카운트 바 (커뮤니티/뉴스)
// 감성 지표(뉴스·커뮤니티) — 과열도가 아니라 비관↔낙관 양극 게이지로 보여준다.
// raw = (긍정-부정)/전체*100 이라 -100~+100 범위. 중앙=중립, 좌=비관, 우=낙관.
// 감성 카드의 헤드라인은 '낙관:비관 비율'(중립 제외) — 카더라 리포트의 테마 막대와
// 같은 언어다. 'N pt'(순감성)는 정확하지만 그 수가 뭔지 설명 없이는 안 읽혔다.
//
// 비율은 raw_value(순감성)만으로 되돌릴 수 없어(중립 건수가 사라진다) 파이프라인이
// details에 남긴 건수를 쓴다. 그 키가 아직 없는 과거 행은 예전 표기로 폴백한다 —
// 파이프라인이 한 번 더 돌면 자연히 새 표기로 바뀐다.
function sentimentRatio(
  details: Record<string, number> | null,
): { pos: number; neg: number; decided: number; total: number; days: number } | null {
  const p = details?.pos_count;
  const n = details?.neg_count;
  if (typeof p !== "number" || typeof n !== "number") return null;
  const decided = p + n;
  // 낙관+비관이 몇 건 안 되면 한두 건에 100:0이 찍혀 실제보다 단정적으로 보인다.
  // 카더라 테마 막대와 같은 하한(8건)을 쓴다.
  if (decided < 8) return null;
  const pos = Math.round((p / decided) * 100);
  // 전체 건수(중립 포함)는 '몇 건을 보고 낸 비율인지' 캡션에 쓴다. 옛 행에 없을 수 있어
  // 없으면 낙관+비관만으로 대신한다.
  const total = typeof details?.total_count === "number" ? details.total_count : decided;
  // 이 건수는 하루치가 아니라 **여러 날 합**이다(파이프라인이 감성 원자를 3일 풀링한다).
  // 며칠을 합쳤는지는 파이프라인이 pool_days 로 남기므로 3을 박지 말고 그걸 읽는다 —
  // 풀링 이전 행이나 시계열이 짧아 2일만 합쳐진 날에 "3일"은 거짓이 된다.
  const days = typeof details?.pool_days === "number" ? details.pool_days : 1;
  return { pos, neg: 100 - pos, decided, total, days };
}

export function CardSentiment({
  v,
  icon,
  // 무엇을 센 건수인지는 지표마다 다르다(디시=글, 뉴스=뉴스).
  //
  // 지금은 **풀링이 없는 행에서만** 쓰인다. 건수가 여러 날 합이면 알약이 낱말 대신 창("3일")을
  // 적기 때문이다 — 둘 다 넣을 폭이 없다(아래 알약 주석의 실측표). 파이프라인이 감성 원자를
  // 3일 풀링하므로 실제 화면은 대부분 창 쪽으로 간다.
  //
  // ⚠️ **짧게 유지할 것.** 이 낱말은 아래 알약에 들어가고, 알약은 헤드라인 숫자와 한 줄을
  // 나눠 쓴다(flexWrap). 넘치면 알약이 다음 줄로 내려가면서 그 아래 막대까지 통째로
  // 밀려서, 옆 카드와 막대 높이가 어긋난다.
  countNoun,
}: {
  v: Pick;
  icon: string;
  countNoun: string;
}) {
  const raw = v.raw ?? 0;
  const ratio = sentimentRatio(v.details);
  // 막대는 헤드라인과 **같은 기준**을 써야 한다. 비율 표기가 가능한 날엔 낙관 비중을
  // 그대로 축에 올린다(50=중립). 한 카드 안에서 헤드라인은 낙관인데 막대는 비관을
  // 가리키는 모순이 생기지 않게 하려는 것 — 카더라 센티먼트의 색/라벨 어긋남과 같은 종류의
  // 사고를 여기서 미리 막는다.
  //
  // 건수가 없는 옛 행은 순감성(-100~100) 부호만 쓴다 — 세 칸 막대는 건수가 있어야
  // 그릴 수 있어서, 그 경우엔 반반으로 두고 큰 수치만 순감성으로 적는다.
  const optimistic = ratio ? ratio.pos >= 50 : raw >= 0;
  // 두 칸(비관 : 낙관)으로 나눈다. **중립은 빼고 판정된 것끼리만** 견준다 —
  // 헤드라인의 "63:37" 이 이미 중립을 뺀 비율이라, 막대에 중립 칸을 넣으면 같은 카드
  // 안에서 두 숫자가 다른 분모를 쓰게 된다(2026-08-03 되돌림).
  const negW = ratio ? 100 - ratio.pos : 50;
  const posW = ratio ? ratio.pos : 50;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon={icon} name={v.name} />
      {ratio ? (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {/* 순서는 앱 전체에서 '비관 : 낙관'으로 통일한다(카더라 테마 막대도 동일). */}
            {/* 숫자도 막대와 같은 편을 든다 — 비관은 저온색, 낙관은 초고온색.
                한 색으로 적으면 "63:37" 중 어느 쪽이 어느 편인지 다시 라벨을 봐야 한다. */}
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-32)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1 }}>
              <span style={{ color: C.cold }}>{ratio.neg}</span>
              <span style={{ color: C.sub2 }}>:</span>
              <span style={{ color: C.mania }}>{ratio.pos}</span>
            </strong>
            <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2 }}>{sentimentTone(ratio.pos).label}</span>
          </div>
          {/* 표본 크기 알약. 낱말을 줄인 건 말맛이 아니라 **폭** 때문이다 — 이 알약은 왼쪽
              헤드라인(숫자 + 톤 라벨)과 한 줄을 나눠 쓰는데, 넘치면 다음 줄로 내려가면서
              아래 막대까지 밀어 옆 카드와 높이가 어긋난다.

              여기 건수는 하루치가 아니라 **N일 합**이라 창을 밝힌다(카더라 테마 막대와 같은
              규칙 — 창이 다른 수치를 라벨 없이 나란히 두지 않는다). 창을 적을 자리는 세는
              낱말(글·뉴스) 자리를 뺏어서 냈다. 아래 실측대로 **둘 다 넣을 폭이 없고**, 무엇을
              센 건지는 카드 이름과 아이콘에 남지만 창은 어디에도 안 남기 때문이다.

              4열(카드 247px, 사다리 전 구간의 최솟값)에서 잰 '줄바꿈 없이 버티는 최소 행 폭'.
              왼쪽 묶음은 톤 라벨이 "중립"이냐 "비관 우세"냐로 120 ↔ 144 를 오가므로 **넉 자
              라벨을 최악**으로 잡는다.
                글 8,961건            233  ✓ 여유 14  (옛 표기)
                3일 8,961건           240  ✓ 여유 7   ← 지금
                3일간 8,961건         250  ✗
                3일 글 8,961건        253  ✗ (낱말과 창을 둘 다 넣으면 넘친다)
                글 8,961건 · 3일      259  ✗
                최근 3일 8,961건      263  ✗

              자릿수가 늘면 이 여유 7px 이 바로 사라지므로(다섯 자리 248 ✗ · 여섯 자리 255 ✗)
              건수는 formatSampleCount 가 만 단위로 묶는다 — 폭이 자릿수에 안 딸리게 하는 게
              핵심이고, 그 함수 주석에 이 예산의 근거를 적어 뒀다. */}
          <span style={{ fontFamily: MONO, fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.sub, background: C.chip, borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            {ratio.days > 1 ? `${ratio.days}일` : countNoun} {formatSampleCount(ratio.total)}건
          </span>
        </div>
      ) : (
        <Big disp={`${raw > 0 ? "+" : ""}${v.disp}`} unit={v.unit} color={v.color} size={32} sub="순감성" />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, height: 12 }}>
          {/* 풋/콜 카드와 같은 어법이다 — 과열 쪽(낙관·콜)이 초고온색, 반대쪽(비관·풋)이
              저온색. 두 카드가 같은 '한쪽으로 쏠렸나'를 묻는 그림이라 색도 같아야 한다. */}
          <div style={{ width: `${negW}%`, borderRadius: "99px 0 0 99px", background: C.cold }} />
          <div style={{ width: `${posW}%`, borderRadius: "0 99px 99px 0", background: C.mania }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-11-5)", fontWeight: optimistic ? 600 : 700, color: C.cold }}>비관</span>
          <span style={{ fontSize: "var(--fs-11-5)", fontWeight: optimistic ? 700 : 600, color: C.mania }}>낙관</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 재테크 유튜브 조회수 — 평소(누적 평균) vs 오늘.
// 거래대금 급증도와 **같은 그림**이다(가로 두 줄). 같은 질문("평소보다 몇 배냐")에는
// 같은 그림을 쓴다는 규칙이라, 한쪽을 고치면 다른 쪽도 같이 봐야 한다.
export function CardYoutube({ v }: { v: Pick }) {
  const ratio = v.raw && v.threshold ? v.raw / v.threshold : null;
  const fmt = (n: number) => {
    const f = formatIndicatorValue(n, v.ind?.unit ?? "");
    return `${f.display}${f.displayUnit}`;
  };
  const max = Math.max(v.threshold ?? 0, v.raw ?? 0) || 1;
  const rows = [
    { label: "평소", value: v.threshold, fill: "var(--c-blue-5)", strong: false },
    { label: "오늘", value: v.raw, fill: C.blue, strong: true },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="play_circle" name={v.name} />
      {ratio !== null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontFamily: MONO, fontSize: "var(--fs-32)", fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
            {ratio.toFixed(1)}배
          </strong>
          {/* 초보 검색량 카드와 같은 화살표 규칙 — 기준은 1배(평소)다. */}
          {ratio !== 1 && (
            <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 700, color: ratio < 1 ? C.cold : C.hot }}>{ratio > 1 ? "↑" : "↓"}</span>
          )}
          <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2 }}>평소 대비</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, flexShrink: 0, fontSize: "var(--fs-12)", fontWeight: 600, color: C.sub2 }}>{r.label}</span>
            <div style={{ flex: 1, height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden", minWidth: 0 }}>
              <div style={{ width: `${((r.value ?? 0) / max) * 100}%`, height: "100%", borderRadius: R.pill, background: r.fill }} />
            </div>
            <span style={{ width: 78, textAlign: "right", fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 700, color: r.strong ? C.ink : C.label }}>
              {r.value != null ? fmt(r.value) : "-"}
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 여윳돈이 향하는 곳 — 명품·수입차 + 오마카세·파인다이닝. 지표 둘이 한 카드에 들어가는
// 유일한 카드다. 목업은 세로 구분선으로 반 가르지 않고 **두 줄을 위아래로** 쌓고,
// 눈금 라벨(적음·평소·많음)은 아래쪽 한 번만 적는다.
function SubSpend({ v, icon, showScale }: { v: Pick; icon: string; showScale: boolean }) {
  const ratio = v.details?.vs_avg ?? null;
  // 화살표와 색이 **같은 경계**를 써야 한다. 예전엔 화살표가 `ratio === 1` 로만 갈려서,
  // 0.98배(화면엔 "1.0배")가 색은 중립인데 화살표만 ↓ 로 떴다 — 한 줄이 두 말을 했다.
  // ±0.05 = 소수 첫째 자리로 1.0 으로 보이는 폭. 이 안에서는 화살표를 안 그린다.
  const flat = ratio === null || Math.abs(ratio - 1) < 0.05;
  const arrow = flat ? "" : (ratio as number) > 1 ? "↑" : "↓";
  const arrowColor = v.color;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} style={{ fontSize: "var(--fs-18)", color: "var(--c-blue-1)" }} />
        <span style={{ flex: 1, fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.label, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {v.name}
        </span>
        <strong
          style={{
            fontFamily: MONO,
            fontSize: "var(--fs-16)",
            fontWeight: 800,
            // 막대와 같은 색이어야 한다 — 숫자가 파랑인데 막대가 빨강이면 한 줄이 두 말을 한다.
            // 그 "같은 색"은 **온도**다(2026-08-04). 방향으로 맞췄더니 이번엔 이 줄만
            // 다른 카드와 규칙이 갈렸다.
            color: v.color,
            whiteSpace: "nowrap",
          }}
        >
          {ratio !== null ? `${ratio.toFixed(1)}배` : `${v.disp}${v.unit}`}
          {arrow && <span style={{ fontSize: "var(--fs-12)", color: arrowColor }}> {arrow}</span>}
        </strong>
      </div>
      {ratio !== null && <VsAvg ratio={ratio} knob={v.color} showScale={showScale} />}
    </div>
  );
}

export function CardSpending({ luxury, dining }: { luxury: Pick; dining: Pick }) {
  // 카드에 큰 수치가 없어 시트에서 이 셀만 리드아웃 자리가 비어 있었다(25칸이 같은
  // 높이에서 같은 종류를 만나야 표로 읽힌다). 지표가 둘인데 하나만 뽑아야 하므로
  // **평소에서 더 많이 벗어난 쪽**을 세운다 — 그게 이 카드가 하려는 말이다.
  const lr = luxury.details?.vs_avg ?? null;
  const dr = dining.details?.vs_avg ?? null;
  const lead =
    lr === null && dr === null
      ? null
      : lr === null
        ? { v: dining, r: dr as number, other: "명품" }
        : dr === null
          ? { v: luxury, r: lr, other: "외식" }
          : Math.abs(dr - 1) >= Math.abs(lr - 1)
            ? { v: dining, r: dr, other: "명품" }
            : { v: luxury, r: lr, other: "외식" };
  // 나머지 한쪽이 평소 수준이면 그렇다고 적는다 — 큰 숫자 하나만 두면 "둘 중 무엇이냐"가
  // 안 보인다. 0.05 는 소수 첫째 자리로 적었을 때 1.0 으로 보이는 폭이다.
  const otherR = lead && lead.other === "명품" ? lr : dr;
  const otherWord =
    otherR === null ? "" : Math.abs(otherR - 1) < 0.05 ? `${lead?.other}은 평소 수준` : `${lead?.other} ${otherR.toFixed(1)}배`;
  // 지표 둘이 한 셀이라 스크롤 목적지 id 는 하나만 붙는다(명품). 오마카세로 오는
  // 스크롤은 ANCHOR_ALIAS 가 이 id 로 돌려보낸다.
  return (
    <Shell slug={luxury.ind?.slug} hit={luxury.isHit || dining.isHit} warm={luxury.warm || dining.warm} minH={230}>
      <TitleRow icon="local_mall" name="여윳돈이 향하는 곳" desc="명품·외식 검색량으로 본 소비 심리" />
      {lead && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontFamily: MONO, fontSize: "var(--fs-32)", fontWeight: 800, letterSpacing: "-.03em", color: lead.v.color, lineHeight: 1, whiteSpace: "nowrap" }}>
            {lead.r.toFixed(1)}배
          </strong>
          <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>
            {lead.other === "명품" ? "외식" : "명품"} 검색{otherWord && ` · ${otherWord}`}
          </span>
        </div>
      )}
      <SubSpend v={luxury} icon="shopping_bag" showScale={false} />
      <SubSpend v={dining} icon="restaurant" showScale />
      {/* 지표가 둘이지만 설명은 하나로 합쳐 적는다. 두 문장을 이어 붙이면 이 카드만
          설명이 두 줄이 되어 같은 행 카드들과 밑선이 어긋난다. 제목("여윳돈이 향하는 곳")도
          DB 가 아니라 여기서 정하므로, 합친 문장도 같은 자리에 두는 게 맞다. */}
      <Foot text="명품·외식 검색이 늘면 여윳돈이 돈다는 뜻입니다" />
    </Shell>
  );
}

// 코인 투자 과열 지수 — 김치 프리미엄 + 코인 거래대금.
//
// 큰 숫자는 다른 카드와 같은 과열도(v.capped)다. 예전엔 raw_value 를 그대로 적었는데,
// 2026-08-01 재보정이 ceiling 85 를 얹으면서 둘이 갈렸다(과열도 = raw/85×100) —
// 초고온 배지가 켜지는 자리가 raw 63.75 라, 배지가 켜지는 날이면 언제나 75 에 못 미치는
// 수 옆에 배지가 붙게 돼 있었다. 레버리지 카드와 같은 이유로 같이 맞춘다.
export function CardUpbit({ v }: { v: Pick }) {
  const dt = v.details;
  const heat = v.capped === null ? null : Math.round(v.capped);
  const volLabel = (x: number) => (x >= 100 ? "HIGH" : x >= 60 ? "MID" : "LOW");
  const premium = dt?.kimchi_premium ?? null;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="currency_bitcoin" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontFamily: MONO, fontSize: "var(--fs-32)", fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
          {heat ?? "-"}
          <span style={{ fontSize: "var(--fs-17)", fontWeight: 700, color: C.sub }}>/100</span>
        </strong>
        <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2 }}>과열도</span>
      </div>
      <HeatFill pct={heat ?? 0} />
      {dt && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub2 }}>김치 프리미엄</span>
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-17)", fontWeight: 800, color: v.color }}>
              {premium !== null ? `${premium > 0 ? "+" : ""}${premium.toFixed(1)}%` : "-"}
            </strong>
          </div>
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub2 }}>거래량 강도</span>
            {/* HIGH/MID/LOW 도 0~100 진행률에서 나온 말이라 같은 밴드 규칙으로 칠한다.
                파랑으로 못박아 두면 HIGH 일 때도 차분한 색이라 값과 색이 반대말을 한다. */}
            <strong style={{ fontSize: "var(--fs-17)", fontWeight: 800, color: overheatColor(dt.volume_progress ?? 0) }}>
              {volLabel(dt.volume_progress ?? 0)}
            </strong>
          </div>
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

// 증권 앱 인기차트 순위 — 차트인 앱 수 + 최고 순위 + 앱 목록.
// 목업은 목록을 **회색 행**으로 깔고 순위를 흰 알약으로 앞에 세운다. 이름 길이가 제각각이라
// 오른쪽 정렬한 숫자는 눈이 매번 다른 자리를 찾아야 했는데, 왼쪽 알약은 자리가 고정이다.
export function CardBrokerage({ v }: { v: Pick }) {
  const count = v.details?.count ?? 0;
  const topRank = v.details?.top_rank ?? null;
  const charted = (v.details as unknown as { charted?: { name: string; rank: number }[] })?.charted ?? [];
  // 긴 앱 이름을 짧게: 첫 구분자(-, (, ,) 앞부분만, 18자 제한
  const shortName = (n: string) => (n.split(/[-(,]/)[0].trim().slice(0, 18) || n);
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="leaderboard" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={`${count}개`} color={v.color} size={32} sub="인기차트 진입" />
        {topRank !== null && (
          <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            최고 {topRank}위
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {charted.slice(0, 4).map((app, i) => (
          <div key={`${app.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, background: C.soft, borderRadius: 12, padding: "9px 12px", minWidth: 0 }}>
            <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: "var(--fs-11-5)", fontWeight: 800, color: i === 0 ? "var(--c-cold-ink)" : C.sub, background: C.card, borderRadius: 8, padding: "3px 8px" }}>
              {app.rank}위
            </span>
            <span style={{ flex: 1, fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shortName(app.name)}
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

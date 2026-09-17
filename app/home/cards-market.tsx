// 홈의 시장 지표 카드들. app/page.tsx 에서 그대로 옮겨 왔다(app/home/parts.tsx 머리말 참고).

import type { ClosePoint, StockHighGap } from "@/lib/data";
import { formatEokMixed, formatIndicatorValue, shortDate } from "@/lib/format";
import { BLUE_SCALE, C, MONO, R } from "../ui";
import { sourceDateBadge, Shell, TitleRow, Big, Foot, HeatKnob, HeatFill, HeatBar, AreaChart } from "./parts";
import type { Pick } from "./parts";

export function CardBuffett({ v }: { v: Pick }) {
  const dt = v.details;
  const ratio = v.raw !== null ? v.raw / 100 : null; // 시총/GDP 배수
  // GDP 막대는 시총을 100% 로 둔 상대 길이다. 둘이 같은 축 위에 있어야 "몇 배"가 그림으로 읽힌다.
  const gdpWidth = v.raw && v.raw > 0 ? Math.min(100, (100 / v.raw) * 100) : 50;
  const jo = (won: number) => Math.round(won / 1e12).toLocaleString("ko-KR"); // 원 → 조원
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      {/* ⚠️ payments(지폐) 였다. 이 지표는 돈의 크기가 아니라 **나라 경제(GDP) 대비 증시
          크기**라, 지폐보다 경제를 가리키는 그림이 가깝다. 지폐는 거래대금 카드로 옮겼다. */}
      <TitleRow desc={v.headline} icon="account_balance" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={v.disp} unit={v.unit} color={v.color} size={32} />
        {ratio !== null && (
          <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            {ratio.toFixed(1)}배
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: C.sub2 }}>
              나라 경제 (GDP){dt && dt.gdp_year ? ` · ${String(dt.gdp_year).slice(2)}년 ${dt.gdp_q}분기` : ""}
            </span>
            <span style={{ fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
              {dt && dt.gdp ? `약 ${jo(dt.gdp)}조원` : "기준 100"}
            </span>
          </div>
          <div style={{ height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden" }}>
            <div style={{ width: `${gdpWidth}%`, height: "100%", borderRadius: R.pill, background: "var(--c-blue-5)" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: C.sub2 }}>증시 시가총액</span>
            <span style={{ fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>
              {dt && dt.market_cap ? `약 ${jo(dt.market_cap)}조원` : `${v.disp}${v.unit}`}
            </span>
          </div>
          <div style={{ height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden" }}>
            <div style={{ width: "100%", height: "100%", borderRadius: R.pill, background: C.blue }} />
          </div>
        </div>
        <span style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: C.label, background: C.soft, borderRadius: R.control, padding: "9px 11px" }}>
          증시가 실물 경제보다 {ratio !== null ? `${ratio.toFixed(1)}배 커진` : "커진"} 상태입니다
        </span>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 레버리지 ETF·선물 미결제약정 종합 지수.
//
// 큰 숫자는 다른 카드와 **똑같은 과열도**(v.capped)다. 예전엔 두 서브바의 산술평균을
// 적었는데, 그 평균은 fetch 가 raw_value 로 저장하는 값일 뿐 화면이 말하는 과열도가
// 아니다(indicator_thresholds 가 floor 38 / ceiling 74 로 다시 눈금을 매긴다).
// 그래서 2026-08-02 에 실제로 어긋났다 — 과열도 75.06 이라 초고온 배지가 켜졌는데 큰
// 숫자는 평균 65 였다. 배지·히어로 카운트·종합점수가 모두 과열도를 쓰므로 여기도 맞춘다.
export function CardLeverage({ v }: { v: Pick }) {
  const dt = v.details;
  const heat = v.capped === null ? null : Math.round(v.capped);
  const etfAmount =
    dt?.etf_value != null
      ? (() => {
          const f = formatIndicatorValue(dt.etf_value, "억원");
          return `${f.display}${f.displayUnit}`;
        })()
      : null;
  const oiAmount = dt?.futures_oi != null ? `${Math.round(dt.futures_oi).toLocaleString("ko-KR")}` : null;
  // "기준 대비 N%" 는 두 타일이 **서로 다른 기준**을 같은 말로 부르던 라벨이었다.
  // ETF 는 4조원(고정), 선물은 "1년 평균의 1.5배" 라, 선물의 53% 는 두 단계 건너뛴 말이라
  // 카드만 보고는 풀 수 없었다. 이제 파이프라인이 기준 자체를 details 로 보낸다.
  //
  // 옛 행에는 그 두 필드가 없어서 상수로 물러선다. 값은 fetch_leverage_etf_volume.py 의
  // ETF_THRESHOLD(40,000억) · OI_SURGE_THRESHOLD(150) 와 같아야 한다 —
  // **다음 파이프라인 실행 뒤에는 이 폴백이 안 쓰인다.**
  const etfBaseEok = dt?.etf_base_eok ?? 40_000;
  const etfBaseLabel = (() => {
    const f = formatIndicatorValue(etfBaseEok, "억원");
    return `${f.display}${f.displayUnit}`;
  })();
  const oiVsAvg = dt?.oi_vs_avg ?? (dt?.futures_progress != null ? dt.futures_progress * 1.5 : null);
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="rocket_launch" name={v.name} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontFamily: MONO, fontSize: "var(--fs-32)", fontWeight: 800, letterSpacing: "-.03em", color: v.color, lineHeight: 1 }}>
          {heat ?? "-"}
          <span style={{ fontSize: "var(--fs-17)", fontWeight: 700, color: C.sub }}>/100</span>
        </strong>
        <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2 }}>종합 과열도</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <HeatFill pct={heat ?? 0} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>안심</span>
          <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>과열</span>
        </div>
      </div>
      {dt && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          {/* 서브바 두 개는 각자 '자기 기준 대비 달성률'이라 큰 숫자와 다른 눈금이다.
              라벨을 '기준 대비'로 갈라 둔 것이 그 표시다(같은 이름으로 부르면 안 된다). */}
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub2 }}>ETF 거래대금</span>
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-17)", fontWeight: 800, color: C.ink }}>{etfAmount ?? "-"}</strong>
            <span style={{ fontSize: "var(--fs-11)", color: C.muted }}>{etfBaseLabel} 대비 {Math.round(dt.etf_progress ?? 0)}%</span>
          </div>
          <div style={{ background: C.soft, borderRadius: R.control, padding: 13, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub2 }}>선물 미결제약정</span>
            <strong style={{ fontFamily: MONO, fontSize: "var(--fs-17)", fontWeight: 800, color: C.ink }}>{oiAmount ?? "-"}</strong>
            <span style={{ fontSize: "var(--fs-11)", color: C.muted }}>1년 평균 대비 {oiVsAvg !== null ? Math.round(oiVsAvg) : "-"}%</span>
          </div>
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 최근 한 달 매매 안전장치 동향 — 매수/매도 사이드카 · 서킷브레이커 발동 건수.
 *
 * 목업이 가로 막대 세 줄을 **회색 타일 세 칸**으로 바꿨다. 막대는 셋의 크기를 견주는
 * 그림인데 이 카드의 결론은 이미 "매도 우세" 한 줄로 나와 있어서, 아래는 근거 숫자만
 * 나란히 있으면 된다. 매수 칸만 강조색인 건 **매수 사이드카가 과열 쪽 신호**라서다.
 */
export function CardMarketActions({ v }: { v: Pick }) {
  const dt = v.details;
  const buyN = dt?.buy ?? 0;
  const sellN = dt?.sell ?? 0;
  const cbN = dt?.cb ?? 0;
  // 매수/매도 안전장치 중 무엇이 우세했는지 — 종합 점수가 0이어도 방향은 보여준다.
  //
  // 큰 글자의 색은 **이 판정을 따르고, 과열도(v.color)를 쓰지 않는다.** 과열도를 칠하면
  // "매도 우세"가 빨강으로 떴다 — 한 카드가 두 질문(누가 우세했나 / 얼마나 뜨겁나)에
  // 답하면서 서로 반대말을 한 것이다. 눈금의 50점 지점이 raw 0.25(= 매수가 매도+CB+2 의
  // 3분의 1)라, 매수 6·매도 8·CB 6 같은 패닉 국면도 54.5점이라 고온으로 넘어간다.
  // 저장된 391일을 현 눈금으로 재계산하면 고온 이상 134일 중 68일(51%)이 매수 우세가
  // 아닌 날이었다.
  //
  // 과열도는 셀 상단 라인(진행률 ≥75)이 계속 진다 — 그쪽은 391일 중 57일이 전부 매수
  // 우세라 판정과 어긋난 적이 없다. 어긋나던 건 ≥50 경계뿐이었다.
  // ⚠️ 눈금 자체는 그대로다. 히어로 '지표 분포'에서 이 지표는 여전히 고온 칸에 앉으므로,
  //    카드와 갈리는 게 거슬리면 indicator_thresholds 에 floor 0.25 를 얹는 재보정이
  //    따로 필요하다(그러면 오늘 값이 54.5 → 9.1 로 내려간다).
  const dir =
    buyN > sellN
      ? { label: "매수 우세", color: C.hot, hint: "달아오른 쪽이 잦았습니다" }
      : sellN > buyN
        ? { label: "매도 우세", color: C.neutral, hint: "식는 쪽이 잦았습니다" }
        : { label: "균형", color: C.ink, hint: "양쪽이 비슷했습니다" };
  // 세 값을 **같은 눈금**에 올린다. 숫자 타일 셋으로 흩어 두면 5·8·6 을 눈이 직접 빼야
  // 하는데, 같은 축의 막대로 두면 "매도가 더 잦았다"가 길이로 바로 증명된다.
  // 색이 방향을 진다 — 매수 안전장치(상승 제동)는 달아오른 쪽이라 고온, 매도 쪽은 식는
  // 쪽이라 상온 파랑, CB 는 둘 다 걸릴 수 있어 중립인 연파랑.
  const rows = [
    { label: "매수", n: buyN, fill: C.hot, ink: C.hot },
    { label: "매도", n: sellN, fill: C.neutral, ink: C.ink },
    { label: "CB", n: cbN, fill: "var(--c-blue-4)", ink: C.label },
  ];
  const maxN = Math.max(1, buyN, sellN, cbN);
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      {/* ⚠️ speed(속도계) 였다. 이 지표가 세는 것은 VI·사이드카·서킷브레이커 — 시장을
          **멈추는** 장치이지 속도가 아니다. 속도계는 MDD 의 '하락 vs 회복 속도' 타일이 쓴다. */}
      <TitleRow desc={v.headline} icon="shield" name={v.name} badge="최근 한 달" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        {/* 한글은 같은 font-size 라도 숫자보다 글리프가 커 보인다 — 다른 카드의 32px 숫자와
            '눈에 보이는 크기'를 맞춘 값이 30 이다. */}
        <strong style={{ fontSize: "var(--fs-30)", fontWeight: 800, letterSpacing: "-.03em", color: dir.color, lineHeight: 1 }}>{dir.label}</strong>
        <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>{dir.hint}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, flexShrink: 0, fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.sub2 }}>{r.label}</span>
            <div style={{ flex: 1, minWidth: 0, height: 14, borderRadius: 4, background: C.track, overflow: "hidden" }}>
              <div style={{ width: `${(r.n / maxN) * 100}%`, height: "100%", borderRadius: 4, background: r.fill }} />
            </div>
            <span style={{ width: 30, flexShrink: 0, textAlign: "right", fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 800, color: r.ink }}>
              {r.n}건
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 거래대금 쏠림도 — 상위10 비중을 **100% 스택 바**로.
//
// 도넛이었다. 도넛은 상위 넷만 조각으로 그리고 나머지는 트랙색 한 덩어리로 남겨서,
// "그럼 저 회색은 뭔데"에 답을 못 했다. 스택 바로 펴면 상위 4 + 나머지 상위 10종목 +
// 그 외 전 종목까지 100% 가 전부 드러난다. 각도보다 길이가 견주기도 쉽다.
export function CardTurnover({ v }: { v: Pick }) {
  const share = v.raw ?? 0; // 상위10 거래대금 비중 %
  const dt = v.details as unknown as { top5?: { name: string; share: number }[]; total_jo?: number } | null;
  const top = (dt?.top5 ?? []).slice(0, 4);
  // 비중만으론 "얼마"인지 안 보인다 — 전체 거래대금에 비중을 곱해 금액으로 준다.
  const totalJo = dt?.total_jo ?? null;
  const barTip =
    totalJo != null
      ? `전체 ${totalJo.toLocaleString("ko-KR")}조원 중 상위 10종목이 ${((totalJo * share) / 100).toFixed(1)}조원`
      : `상위 10종목이 전체 거래대금의 ${share.toFixed(1)}%`;
  // 100% 를 채우는 조각들. 앞 넷은 종목별, 다섯째는 상위10 중 남은 몫, 마지막은 그 외 전부.
  // ⚠️ 뺄셈이 음수가 되지 않게 막는다 — top5 가 상위10 비중보다 커지는 날이 있으면
  // (자료가 어긋난 날) 막대가 통째로 뒤집힌다.
  const namedSum = top.reduce((a, t) => a + t.share, 0);
  const restOfTop = Math.max(0, share - namedSum);
  const others = Math.max(0, 100 - share);
  const segs = [
    ...top.map((t, i) => ({ key: t.name, label: t.name, pct: t.share, fill: BLUE_SCALE[i] ?? "var(--c-blue-5)", ink: C.ink })),
    { key: "__rest", label: "나머지 상위 10종목", pct: restOfTop, fill: "var(--c-blue-5)", ink: C.ink },
    { key: "__others", label: "그 외 전 종목", pct: others, fill: C.track, ink: C.sub2 },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="pie_chart" name={v.name} />
      <Big disp={`${Math.round(share)}`} unit="%" color={v.color} size={32} sub="상위 10종목이 가져간 몫" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="hz-tip" data-tip={barTip} style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden" }}>
          {segs.map((s2) => (s2.pct <= 0 ? null : <div key={s2.key} style={{ width: `${s2.pct}%`, background: s2.fill }} />))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {segs.map((s2) =>
            s2.pct <= 0 ? null : (
              <div key={s2.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: s2.fill, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-12)", fontWeight: 600, color: C.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s2.label}
                </span>
                <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 800, color: s2.ink }}>{s2.pct.toFixed(1)}%</span>
              </div>
            ),
          )}
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 코스피 신고가 괴리율 — 지수 괴리율 + 거래대금 상위 3종목의 괴리율.
 *
 * 목업에서 '수위 통'(세로 물통)이 빠졌다. 통은 전고점을 눈금처럼 읽히게 하려던 장치인데,
 * 큰 수치 -28% 가 이미 같은 말을 하고 있어 한 카드에서 같은 사실을 두 번 그렸다.
 * 남은 자리는 종목 세 줄이 가져간다 — 지수 숫자가 어디서 온 건지는 그쪽이 말한다.
 *
 * ⚠️ 막대 길이의 뜻이 예전과 **반대**다. 예전엔 '고점에 얼마나 가까운가'(깊을수록 짧음)
 * 였는데 목업은 '얼마나 빠졌나'(깊을수록 김)로 그린다. 50% 낙폭을 꽉 찬 막대로 둔다.
 */
export function CardHighGap({ v, tops, failed = false }: { v: Pick; tops: StockHighGap[]; failed?: boolean }) {
  const gap = v.raw ?? 0;
  const priorHigh = v.details?.prior_high;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  // 순위대로 진한 파랑 → 옅은 파랑. 색조가 아니라 명도만 움직여 '서열'로 읽히게 한다.
  const rankColor = ["var(--c-blue-2)", "var(--c-blue-3)", "var(--c-blue-4)"];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow
        desc={v.headline}
        icon="vertical_align_top"
        name={v.name}
        badge={sourceDateBadge(v) ?? "최근 거래일 기준"}
      />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={`${gap > 0 ? "+" : ""}${v.disp}`} unit={v.unit} color={v.color} size={32} sub={gap > 0 ? "이전 전고점 돌파" : "전고점으로부터"} />
        {typeof priorHigh === "number" && (
          <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            전고점 {num(priorHigh)}
          </span>
        )}
      </div>
      {/* 조회가 깨졌을 때. 목록을 그냥 빼면 "오늘은 그런 종목이 없나 보다" 로 읽힌다. */}
      {failed && (
        <p style={{ margin: 0, fontSize: "var(--fs-12)", color: C.sub }}>
          고점 근접 종목을 불러오지 못했습니다.
        </p>
      )}
      {tops.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* 현재가·52주 고점 둘 다 야후 **종가**다. 실시간이 아니다 — 파이프라인이 하루 두 번
              받아 저장한 값을 읽기만 한다. 이 카드가 장중에 움직이면 왼쪽 지수 값·햇쩨 지수와
              시점이 갈리기 때문이다. */}
          <span
            className="hz-tip hz-tip-wide hz-tip-start"
            data-tip={`현재가와 52주 고점 모두 야후 파이낸스 종가 기준입니다${tops[0]?.priceDate ? ` (${tops[0].priceDate} 종가)` : ""}. 막대가 꽉 찰수록 고점에 가깝습니다.`}
            data-ga-tip="high_gap_source"
            style={{ fontSize: "var(--fs-11-5)", fontWeight: 700, color: C.muted }}
          >
            거래대금 상위 종목의 52주 고점 근접도
          </span>
          {tops.map((st, i) => (
            <div key={st.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 76, flexShrink: 0, fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.label, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {st.name}
              </span>
              <div style={{ flex: 1, height: 7, borderRadius: R.pill, background: C.track, overflow: "hidden", minWidth: 0 }}>
                {/* 막대 = **고점 근접도**(52주 고점 = 꽉 찬 막대). 오른쪽 숫자는 그대로
                    괴리율이라, 둘을 더하면 늘 100 이다.

                    ⚠️ 2026-08-04 에 방향을 되돌렸다. 목업을 따라 '얼마나 빠졌나'(깊을수록
                    긴 막대, 축은 −50%)로 그렸는데 두 가지가 어긋났다.
                    ① **이 화면에서 꽉 찬 막대는 늘 뜨겁다는 뜻**인데, 이 카드만 꽉 찬
                       막대가 가장 차가운 종목(고점에서 가장 많이 빠진 종목)이었다.
                    ② 축 −50% 가 실제 값을 못 담았다. 실측(2026-08-04) −47.5 / −36.0 /
                       −51.1 은 95% · 72% · **100%(잘림)** 으로 그려져, 셋 다 거의 꽉 찬
                       데다 −51 과 −80 이 같은 그림이 된다.
                    근접도로 두면 축이 '고점 = 100' 이라 임의로 정한 수가 없고, 잘릴 일도
                    없다(같은 값이 52.5 · 64.0 · 48.9 로 갈린다). */}
                <div style={{ width: `${Math.max(0, Math.min(100, 100 + st.gapPct))}%`, height: "100%", borderRadius: R.pill, background: rankColor[i] ?? "var(--c-blue-4)" }} />
              </div>
              <span style={{ width: 50, textAlign: "right", fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 700, color: C.ink }}>
                {st.gapPct >= 0 ? "+" : ""}{st.gapPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 코스피 상승 속도 — 60거래일 수익률(%).
 *
 * 목업이 60일 꺾은선을 **눈금 하나**로 바꿨다. 궤적은 "어떻게 왔나"를 말하지만 이 카드의
 * 질문은 "얼마나 빨리 왔나" 하나뿐이고, 그 답은 큰 수치와 눈금 위 위치로 끝난다.
 * 축은 ±20%로 고정한다 — 값에 따라 축이 움직이면 어제와 오늘의 위치를 견줄 수 없다.
 */
export function CardSpeed({ v, path = [], failed = false }: { v: Pick; path?: ClosePoint[]; failed?: boolean }) {
  const from = v.details?.from_close;
  const to = v.details?.to_close;
  const spd = v.raw ?? 0;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  // 차트는 지수 값이 아니라 **시작점 대비 %**를 그린다. 지수 값을 그리면 y축이 그 60일의
  // 최소~최대로 늘어나서 ±1% 든 ±30% 든 그림이 똑같아진다 — "얼마나" 움직였는지가
  // 통째로 사라진다. 시작점을 0%로 두면 y축이 곧 퍼센트라 높이가 그대로 크기다.
  const base = path[0]?.close ?? 0;
  const pts = base > 0 ? path.map((x) => ({ key: x.date, value: (x.close / base - 1) * 100 })) : [];
  const hi = pts.length ? Math.max(...pts.map((x) => x.value), 0) : null;
  const lo = pts.length ? Math.min(...pts.map((x) => x.value), 0) : null;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="trending_up" name={v.name} />
      <Big
        disp={`${spd >= 0 ? "+" : ""}${v.disp}`}
        unit={v.unit}
        color={v.color}
        size={32}
        sub={typeof from === "number" && typeof to === "number" ? `${num(from)} → ${num(to)}` : undefined}
      />
      {pts.length >= 2 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AreaChart
            points={pts}
            baseline="zero"
            tip={(x) => `${shortDate(x.key)} · ${x.value >= 0 ? "+" : ""}${x.value.toFixed(1)}%`}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>3개월 전 = 0%</span>
            {hi !== null && lo !== null && (
              <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>
                최고 {hi >= 0 ? "+" : ""}{hi.toFixed(1)}% · 최저 {lo.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      ) : (
        /* 점이 모자라면 게이지로 물러난다. 다만 **왜** 물러났는지는 갈린다 — 아직 궤적이
           안 쌓인 것과 조회가 깨진 것은 다른 일이라, 뒤엣것만 한 줄로 밝힌다.
           ⚠️ 실패했을 때만 감싼다. 늘 감싸면 **정상 경로의 마크업이 바뀌어** 이 카드가
              평소에 그리던 모양까지 건드리게 된다. 고칠 이유가 없는 자리는 안 건드린다. */
        failed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <HeatBar v={v} hideThreshold />
            <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>60일 궤적을 불러오지 못했습니다.</span>
          </div>
        ) : (
          <HeatBar v={v} hideThreshold />
        )
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * VKOSPI — 숫자를 하나만 쓴다.
 *
 * 예전엔 "과열도 23"과 "실제 VKOSPI 87"을 같이 보여줬는데, 초보에겐 둘 중 뭘 봐야 하는지도,
 * 왜 하나는 낮고 하나는 높은지도(과열도는 낮을수록 과열이라 역방향) 알 수 없었다.
 * 지수 값 하나만 크게 두고, 그 값이 높은지 낮은지는 최근 30일 범위 안의 위치로 보여준다 —
 * "87"만 봐선 모르지만 "73~97 중 여기"면 바로 읽힌다.
 */
export function CardVkospi({ v }: { v: Pick }) {
  const hist = v.history.filter((x) => typeof x === "number");
  const lo = hist.length ? Math.min(...hist) : null;
  const hi = hist.length ? Math.max(...hist) : null;
  const cur = v.raw;
  // 범위 안 위치(0=최저, 1=최고). 최근 30일이 평평하면 가운데로 둔다.
  const pos = cur !== null && lo !== null && hi !== null && hi > lo ? (cur - lo) / (hi - lo) : 0.5;
  const verdict = pos >= 0.66 ? "최근 30일 중 높은 편" : pos <= 0.33 ? "최근 30일 중 낮은 편" : "최근 30일 평균 수준";
  const knob = v.color;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="monitor_heart" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={v.disp} color={v.color} size={32} sub="변동성지수" />
        <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
          {verdict}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ position: "relative", height: 10 }}>
          <div style={{ height: "100%", borderRadius: R.pill, background: C.track, overflow: "hidden" }}>
            <div style={{ width: `${pos * 100}%`, height: "100%", borderRadius: R.pill, background: knob }} />
          </div>
          <HeatKnob left={pos * 100} color={knob} />
        </div>
        {/* 양 끝 라벨은 **변동성 자체**를 말한다(잔잔 ↔ 출렁). 예전엔 '방심 ↔ 불안'
            이었는데, 방심은 시장의 상태가 아니라 그 상태에 대한 평가라서 눈금 끝에
            적히면 무엇을 잰 값인지가 흐려졌다(2026-08-04). 낮은 쪽이 왜 과열 신호인지는
            셀 맨 아래 설명 한 줄이 맡는다. */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.muted }}>잔잔 {lo !== null ? Math.round(lo) : "-"}</span>
          <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>최근 30일 범위</span>
          <span style={{ fontSize: "var(--fs-11-5)", fontWeight: 600, color: C.muted }}>출렁 {hi !== null ? Math.round(hi) : "-"}</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

export function CardAsia({ v }: { v: Pick }) {
  const dt = v.details;
  const k = dt?.kospi ?? 0;
  const bars = dt
    ? [
        { label: "KOSPI", sub: "한국", index: 100, self: true },
        { label: "Nikkei", sub: "일본", index: 100 + ((dt.nikkei ?? 0) - k), self: false },
        { label: "HangSeng", sub: "홍콩", index: 100 + ((dt.hangseng ?? 0) - k), self: false },
        { label: "Taiex", sub: "대만", index: 100 + ((dt.taiex ?? 0) - k), self: false },
      ]
    : [];
  // 눈금 상한. 가장 큰 나라도 막대 끝에 딱 붙지 않게 4% 만큼 여유를 둔다 — 붙으면
  // "여기가 최대치"로 읽혀서, 실제로는 열려 있는 축이 닫힌 것처럼 보인다.
  const scaleMax = bars.length ? Math.max(...bars.map((b) => b.index)) * 1.04 : 1;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scaleMax) * 100))}%`;
  // 기준선(KOSPI)이 축 위에서 갖는 자리. 파선과 아래 캡션이 같은 값을 읽어야 어긋나지 않는다.
  const kospiPct = bars.length ? pct(bars[0].index) : "0%";
  // 라벨·값 칸 폭. 파선을 덮어씌우는 상자가 이 값을 그대로 되읽어야 막대 칸에 정확히
  // 겹친다(숫자를 두 곳에 적으면 반드시 어긋난다).
  const LABEL_W = 62;
  const VALUE_W = 34;
  const ROW_GAP = 9;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      {/* ⚠️ public(지구본) 이었다. 아래 CardNetBuy("고점권 외국인 매도")가 같은 지구본을
          쓰고 있어 한 화면에 둘이었다. 지구본은 그쪽이 갖는다 — 저 카드는 **누가** 사고파는지
          (외국인)를 말하는 자리라 방향에 매이지 않는 그림이 필요하고, 이 카드가 실제로 하는
          일은 네 나라를 **한 기준선에서 견주는 것**이다. 아이콘이 카드의 모양을 되풀이하는
          것은 이 화면의 어법이다(쏠림=pie_chart · 증권앱 순위=leaderboard). */}
      <TitleRow desc={v.headline} icon="align_horizontal_left" name={v.name} badge="최근 한 달" />
      <Big
        disp={`${v.raw !== null && v.raw > 0 ? "+" : ""}${v.disp}`}
        unit={v.unit}
        color={v.color}
        size={32}
        sub="코스피 초과수익률"
      />
      {bars.length > 0 ? (
        // 세로 막대 넷을 **가로 막대 넷**으로 바꿨다. 세로로 세우면 네 나라의 차이가
        // 높이차로만 남는데, 100 대 107 처럼 붙은 값들은 그 차이가 몇 px 이라 안 보인다.
        // 가로로 눕히면 같은 차이가 훨씬 긴 축 위에 놓이고, 무엇보다 **기준선(KOSPI)을
        // 세로 파선 하나로 그을 수 있어** "우리보다 앞선 나라"가 선 오른쪽으로 갈린다.
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* 파선은 막대 칸에만 걸쳐야 한다 — 라벨·값 칸까지 가로지르면 표를 관통하는
              줄이 돼서 기준선으로 안 읽힌다. 좌우를 그 두 칸 폭만큼 물린 상자를 깔고
              그 안에서 %로 세운다. 아래 캡션 줄(12+gap 10)만큼 bottom 도 물린다.
              ⚠️ zIndex 1 — 이 상자는 DOM 에서 막대보다 **앞**이라, 그냥 두면 뒤에 깔려
              KOSPI 를 넘어선 나라의 막대가 파선을 덮는다. 기준선은 자기가 가르는 막대
              위에 보여야 "여기까지가 우리"로 읽히므로 맨 앞 레이어로 올린다. */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 22,
              left: LABEL_W + ROW_GAP,
              right: VALUE_W + ROW_GAP,
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            <span style={{ position: "absolute", left: kospiPct, top: -2, bottom: 0, borderLeft: `1px dashed var(--c-blue-3)` }} />
          </span>
          {bars.map((b) => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: ROW_GAP }}>
              <span style={{ width: LABEL_W, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: "var(--fs-11)", fontWeight: b.self ? 800 : 700, color: b.self ? C.ink : C.label, whiteSpace: "nowrap" }}>
                  {b.label}
                </span>
                <span style={{ fontSize: "var(--fs-11)", fontWeight: 600, color: C.sub }}>{b.sub}</span>
              </span>
              <div style={{ position: "relative", flex: 1, minWidth: 0, height: 16 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: 4, background: C.track }} />
                {/* 기준국만 진한 파랑. 넷을 다 같은 색으로 두면 "누가 기준인지"를 라벨
                    굵기로만 말하게 되는데, 그건 막대를 훑는 눈에 안 걸린다. */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: pct(b.index),
                    borderRadius: 4,
                    background: b.self ? "var(--c-blue-1)" : "var(--c-blue-4)",
                  }}
                />
              </div>
              <span
                style={{
                  width: VALUE_W,
                  flexShrink: 0,
                  textAlign: "right",
                  fontFamily: MONO,
                  fontSize: "var(--fs-12)",
                  fontWeight: 800,
                  color: b.self ? C.ink : C.label,
                }}
              >
                {Math.round(b.index)}
              </span>
            </div>
          ))}
          {/* 파선이 무슨 선인지 적는 줄. 파선과 같은 kospiPct 를 쓰되 오른쪽 기준으로
              뒤집어 잡는다 — left 로 두면 캡션이 길어질 때 왼쪽으로 자라 선에서 밀린다. */}
          <div style={{ display: "flex", alignItems: "center", gap: ROW_GAP }}>
            <span style={{ width: LABEL_W, flexShrink: 0 }} />
            <div style={{ position: "relative", flex: 1, minWidth: 0, height: 12 }}>
              <span
                style={{
                  position: "absolute",
                  right: `calc(100% - ${kospiPct})`,
                  top: 0,
                  transform: "translateX(50%)",
                  fontSize: "var(--fs-11)",
                  fontWeight: 700,
                  color: "var(--c-cold-ink)",
                  whiteSpace: "nowrap",
                }}
              >
                KOSPI 100 기준
              </span>
            </div>
            <span style={{ width: VALUE_W, flexShrink: 0 }} />
          </div>
        </div>
      ) : (
        <HeatBar v={v} />
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

export function CardGoldRatio({ v }: { v: Pick }) {
  const k = v.details?.kospi_close;
  const g = v.details?.gold_close;
  const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  const note = typeof k === "number" && typeof g === "number" ? `코스피 ${num(k)} ÷ 금 ${num(g)}` : "코스피 지수 ÷ 금 시세";
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow icon="balance" name={v.name} desc={v.headline} />
      <Big disp={v.disp} unit={v.unit} color={v.color} size={32} sub={note} />
      <HeatBar v={v} />
      <Foot text={v.desc} />
    </Shell>
  );
}

// 거래대금 급증도 — 30일 평균 vs 최근 거래일.
// 목업은 세로 막대 둘이 아니라 **가로 막대 두 줄**이다(라벨 왼쪽·금액 오른쪽). 세로 막대는
// 높이를 견주려고 눈이 위아래로 오가는데, 가로 두 줄은 같은 기준선에서 시작해 길이만 다르다.
export function CardVolume({ v }: { v: Pick }) {
  const dt = v.details;
  const avg = dt?.avg_30d ?? null;
  const today = v.raw ?? null;
  const surge = dt?.surge_pct ?? null;
  const fmt = (n: number) => {
    const f = formatIndicatorValue(n, "억원");
    return `${f.display}${f.displayUnit}`;
  };
  // 두 막대는 같은 축 위에 있어야 길이 비교가 뜻을 갖는다 — 큰 쪽을 100%로 둔다.
  const max = Math.max(avg ?? 0, today ?? 0) || 1;
  const rows: { label: string; value: number | null; fill: string; strong: boolean }[] = [
    { label: "30일 평균", value: avg, fill: "var(--c-blue-5)", strong: false },
    { label: "최근 거래일", value: today, fill: C.blue, strong: true },
  ];
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      {/* ⚠️ groups(사람 셋) 였다. 이 카드가 내는 값은 사람 수가 아니라 **억원**이다 —
          "평소보다 돈이 얼마나 몰렸나". 지폐 그림은 위 버핏지수가 쓰던 것을 가져왔고,
          그쪽은 나라 경제를 가리키는 그림으로 옮겼다. */}
      <TitleRow desc={v.headline} icon="payments" name={v.name} />
      {surge !== null && (
        <Big disp={`${surge >= 0 ? "+" : ""}${surge}`} unit="%" color={v.color} size={32} sub="평소 대비" />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 60, flexShrink: 0, fontSize: "var(--fs-12)", fontWeight: 600, color: C.sub2 }}>{r.label}</span>
            <div style={{ flex: 1, height: 9, borderRadius: R.pill, background: C.track, overflow: "hidden", minWidth: 0 }}>
              <div style={{ width: `${((r.value ?? 0) / max) * 100}%`, height: "100%", borderRadius: R.pill, background: r.fill }} />
            </div>
            <span style={{ width: 58, textAlign: "right", fontFamily: MONO, fontSize: "var(--fs-12-5)", fontWeight: 700, color: r.strong ? C.ink : C.label }}>
              {r.value !== null ? fmt(r.value) : "-"}
            </span>
          </div>
        ))}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 원/달러 환율 변동성 — 최근 30일 출렁임.
// 알약 막대 열 개로 줄였다가 되돌렸다(2026-08-03). 이 지표의 뜻이 "잔잔한가"라서
// 값 하나하나보다 **선이 얼마나 평평한가**가 답이고, 막대는 그 평평함을 못 보여 준다.
export function CardFx({ v }: { v: Pick }) {
  const pts = v.historyPoints.map((b) => ({ key: b.date, value: b.value }));
  // 이 카드는 '얼마나 출렁였나'만 말해서, 정작 환율이 지금 얼마인지는 알 수가 없었다.
  // 파이프라인이 변동성을 계산한 **바로 그 종가**를 details 로 보내 준다 — 실시간이
  // 아니라 파이프라인이 받은 확정 종가라 왼쪽 ±%와 같은 시점을 가리킨다.
  const close = v.details?.usdkrw_close;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="waves" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={`±${v.disp}`} unit={v.unit} color={v.color} size={32} />
        {typeof close === "number" && (
          <span style={{ fontFamily: MONO, fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
            {close.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <AreaChart points={pts} color={v.color} tip={(x) => `${shortDate(x.key)} · ±${x.value.toFixed(2)}%`} />
        {/* 기간은 차트의 캡션이지 큰 수치의 곁말이 아니다 — 차트 밑 오른쪽에 둔다
            (경제 베스트셀러 비중이 쓰는 CardTrend 와 같은 자리·같은 활자).
            큰 수치 옆을 비워 주는 덤도 있다: 곁말이 있으면 4열 하한(칸 안쪽 237px)에서
            164+12+65=241 이라 배지가 아랫줄로 내려갔는데, 빼면 99+12+65=176 으로
            한 줄에 붙어 배지가 오른쪽 끝에 선다. */}
        <span style={{ alignSelf: "flex-end", fontSize: "var(--fs-11)", color: C.sub }}>최근 30일</span>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 고점권 외국인 매도 — 최근 5거래일 누적 + 일별 막대.
//
// 헤드라인은 raw 가 아니라 details.cum5(게이트 전 5일 누적)다. raw 는 고점권이 아니거나
// 외국인이 사는 중이면 0 인데, 최근 5년 기준 그런 날이 79% 라 raw 를 그대로 크게 띄우면
// 카드가 대부분의 날에 "0" 한 글자만 말하게 된다.
//
// ⚠️ 목업이 0선 기준 **양방향 막대를 한 방향**으로 바꿨다. 방향(순매수/순매도) 대신
// 크기만 그린다는 뜻이라, 부호는 색이 아니라 **막대 툴팁과 누적 수치의 라벨**이 들고 있다.
// 막대 색은 파랑 스케일에서 크기순으로 고른다 — 가장 크게 오간 날이 가장 진하다.
export function CardNetBuy({ v }: { v: Pick }) {
  const dt = v.details as unknown as {
    daily5?: number[]; dates5?: number[]; cum5?: number; high_gap?: number; at_high?: number;
  } | null;
  const cum = dt?.cum5 ?? v.raw ?? 0;
  const atHigh = dt?.at_high === 1;
  const gap = dt?.high_gap;
  const daily = dt?.daily5 ?? [];
  // 거래일은 주말·휴장을 건너뛰어 화면에서 역산할 수 없다 — 파이프라인이 넣어준 값을 쓴다.
  const dates = dt?.dates5 ?? [];
  const ymdShort = (ymd: number) => shortDate(`${String(ymd).slice(0, 4)}-${String(ymd).slice(4, 6)}-${String(ymd).slice(6, 8)}`);
  const maxAbs = Math.max(1, ...daily.map((d) => Math.abs(d)));
  const isBuy = cum >= 0;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="public" name={v.name} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* ⚠️ 기간("최근 5거래일")을 큰 수치 **위**에 한 줄로 두면 안 된다. 그 한 줄만큼
            이 셀의 큰 수치가 아래로 밀려, 같은 줄에 놓인 다른 카드들의 큰 수치와 가로선이
            어긋난다 — 시트의 제1규칙이 "같은 줄의 메인 지수는 같은 높이"다.
            기간은 다른 카드들과 똑같이 수치 옆 sub 로 붙인다. */}
        {/* 색은 **온도**다. 매수/매도 방향으로 칠하면 이 카드만 규칙이 갈린다 — 게이트
            (52주 고점 −5%)를 못 넘은 날은 아무리 크게 팔아도 과열도가 0(저온)인데,
            숫자만 빨갛게 떠서 셀이 뜨거운 것처럼 읽혔다. 방향은 부호(+/−)와 아래 곁말
            ("순매도")이 이미 말한다. */}
        <Big
          disp={`${cum >= 0 ? "+" : ""}${formatEokMixed(cum)}`}
          color={v.color}
          size={32}
          sub={`최근 5거래일 ${isBuy ? "순매수" : "순매도"}`}
        />
        {/* 게이트 상태. 이 카드에서 가장 자주 받을 질문이 "왜 과열도가 0인가" 인데,
            답이 여기 있다 — 고점권이 아니면 아무리 크게 팔아도 점수에 안 들어간다.
            조건이 gap 을 보는 건 옛 행(개인 순매수 시절)에 판정 자료가 없기 때문이다. */}
        {gap != null && (
          <span
            style={{
              alignSelf: "flex-start",
              fontSize: "var(--fs-11-5)",
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: R.pill,
              color: atHigh ? "var(--c-hot-ink)" : "var(--c-cold-ink)",
              background: atHigh ? "var(--c-mania-tint)" : "var(--c-blue-tint)",
            }}
          >
            {atHigh ? "고점권" : "고점권 아님"}
          </span>
        )}
      </div>
      {daily.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* 0선을 차트 전체에 한 줄로 긋고 막대가 위(순매수)·아래(순매도)로 자란다.
              방향이 곧 뜻이라 크기만 그리면 "샀나 팔았나"가 사라진다(2026-08-03 되돌림). */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: C.line }} />
            {daily.map((d, i) => {
              const px = Math.max(3, Math.round((Math.abs(d) / maxAbs) * 28));
              const buy = d >= 0;
              const ymd = dates[i];
              const label = ymd
                ? `${ymdShort(ymd)} · ${d >= 0 ? "+" : ""}${formatEokMixed(d)} ${d >= 0 ? "순매수" : "순매도"}`
                : `${d >= 0 ? "+" : ""}${formatEokMixed(d)}`;
              return (
                <div key={i} className="hz-tip" data-tip={label} style={{ flex: 1, position: "relative", height: 64 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: "16%",
                      right: "16%",
                      height: px,
                      borderRadius: 4,
                      background: buy ? C.cold : C.hot,
                      ...(buy ? { bottom: "50%" } : { top: "50%" }),
                    }}
                  />
                </div>
              );
            })}
          </div>
          {/* 날짜는 막대 칸 **밖**에 둔다. 칸 안에 두면 가장 크게 판 날(= 가장 봐야 할 날)의
              막대가 라벨을 파고든다 — 예전에 실제로 9.5px 겹쳤다. */}
          {dates.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {daily.map((_, i) => (
                <span key={i} style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: "var(--fs-11)", color: C.sub }}>
                  {dates[i] ? ymdShort(dates[i]) : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <Foot text={v.desc} />
    </Shell>
  );
}

/**
 * 급등 종목 비율 — 하루에 10% 넘게 오른 종목이 전체의 몇 %인가.
 *
 * 큰 수치를 퍼센트가 아니라 **종목 수**로 둔다. 이 지표에서 사람이 실제로 궁금해하는 게
 * "14.74%" 가 아니라 "뭐가 뛰었나"라서다. 퍼센트는 곁말로 분모와 함께 붙인다.
 *
 * ⚠️ 목업에서 등락률이 **알약 배지**가 됐고 색은 카드 상태(--card-accent)를 따른다.
 * 예전엔 30/20/10 에서 끊어 줄마다 강도를 색으로 갈랐는데, 새 팔레트가 빨강을 초고온에만
 * 쓰기로 해서 그 세 단계가 카드 안에서 갈 자리가 없어졌다. 강도별 개수는 아래 '외 N개'
 * 툴팁이 그대로 들고 있다.
 */
export function CardLimitUp({ v }: { v: Pick }) {
  const dt = v.details as unknown as {
    limit_n?: number; up20_n?: number; up10_n?: number; listed_n?: number;
    limit_names?: unknown[]; up20_names?: unknown[]; up10_names?: unknown[];
  } | null;

  // 옛 행은 종목명 문자열 배열이고 새 행은 {n, p} 객체 배열이다. 둘 다 받는다.
  const norm = (arr: unknown[] | undefined) =>
    (arr ?? []).map((x) =>
      typeof x === "string" ? { n: x, p: null as number | null } : (x as { n: string; p: number }),
    );

  const buckets = [
    { label: "상한가", n: dt?.limit_n ?? 0, items: norm(dt?.limit_names) },
    { label: "+20~29%", n: dt?.up20_n ?? 0, items: norm(dt?.up20_names) },
    { label: "+10~20%", n: dt?.up10_n ?? 0, items: norm(dt?.up10_names) },
  ];
  const surged = buckets.reduce((a, b) => a + b.n, 0);
  const listed = dt?.listed_n ?? 0;

  const ROWS = 5;
  const rank = buckets
    .flatMap((b) => b.items.map((it) => ({ ...it, label: b.label })))
    .sort((a, b) => (b.p ?? 0) - (a.p ?? 0))
    .slice(0, ROWS);
  const rest = Math.max(0, surged - rank.length);

  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      {/* KRX 일별매매정보는 하루이틀 늦게 열린다. 히어로가 페이지 전체를 "오늘 기준"으로
          액자에 넣으므로 이 카드만은 자기 자료일을 계속 밝힌다. */}
      <TitleRow desc={v.headline} icon="bolt" name={v.name} badge={sourceDateBadge(v) ?? "최근 거래일 기준"} />
      <Big
        disp={String(surged)}
        color={v.color}
        size={32}
        sub={`${listed ? `${listed.toLocaleString("ko-KR")}종목 중 ` : ""}${(v.raw ?? 0).toFixed(2)}%`}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rank.length === 0 ? (
          <span style={{ fontSize: "var(--fs-12-5)", color: C.sub }}>10% 넘게 오른 종목이 없습니다</span>
        ) : (
          rank.map((r, i) => (
            <div key={`${r.n}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 600, color: C.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.n}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: MONO,
                  fontSize: "var(--fs-12)",
                  fontWeight: 800,
                  color: "var(--card-accent-ink, var(--c-cold-ink))",
                  background: "var(--card-accent-tint, var(--c-blue-tint))",
                  borderRadius: R.pill,
                  padding: "3px 9px",
                }}
              >
                {r.p === null ? r.label : `+${r.p.toFixed(1)}%`}
              </span>
            </div>
          ))
        )}
        {rest > 0 && (
          <span
            className="hz-tip hz-tip-wide hz-tip-lines hz-tip-start"
            data-tip={
              buckets.map((b) => `${b.label}: ${b.n}종목`).join("\n") +
              (listed ? `\n전체: ${listed.toLocaleString("ko-KR")}종목` : "")
            }
            style={{ fontSize: "var(--fs-11-5)", color: C.sub }}
          >
            외 {rest}개
          </span>
        )}
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

// 옵션 풋/콜 비율 — 콜(상승 베팅) vs 풋(하락 대비) 거래량 비중.
// 목업은 두 칸을 **gap 4 로 떼어** 각자 알약으로 두고, 아래에 비중과 뜻풀이를 두 줄로 깐다.
export function CardPutCall({ v }: { v: Pick }) {
  const dt = v.details as unknown as {
    put_vol?: number; call_vol?: number; put_eok?: number; call_eok?: number;
  } | null;
  const put = dt?.put_vol ?? 0;
  const call = dt?.call_vol ?? 0;
  // 계약 수는 행사가마다 단가가 달라 규모 감각을 못 준다 — 툴팁엔 거래대금을 쓴다.
  const tip = (kind: "call" | "put") => {
    const vol = kind === "call" ? call : put;
    const eok = kind === "call" ? dt?.call_eok : dt?.put_eok;
    const head = kind === "call" ? "콜(상승 베팅)" : "풋(하락 대비)";
    return eok != null
      ? `${head} · ${formatEokMixed(eok)} · ${vol.toLocaleString("ko-KR")}계약`
      : `${head} · ${vol.toLocaleString("ko-KR")}계약`;
  };
  const total = put + call || 1;
  const callShare = (call / total) * 100;
  const ratio = call > 0 ? put / call : 0;
  const greedy = callShare >= 50;
  return (
    <Shell slug={v.ind?.slug} hit={v.isHit} warm={v.warm} minH={230}>
      <TitleRow desc={v.headline} icon="casino" name={v.name} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Big disp={ratio.toFixed(2)} color={v.color} size={32} sub="풋/콜" />
        <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--card-accent-ink)", background: "var(--card-accent-tint)", borderRadius: R.pill, padding: "5px 10px", whiteSpace: "nowrap" }}>
          {greedy ? "콜 우세" : "풋 우세"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, height: 12 }}>
          {/* 콜은 상승 베팅(탐욕) 쪽이라 초고온색, 풋은 하락 대비라 저온색이다. */}
          <div className="hz-tip" data-tip={tip("call")} style={{ width: `${callShare}%`, borderRadius: "99px 0 0 99px", background: C.mania }} />
          <div className="hz-tip" data-tip={tip("put")} style={{ width: `${100 - callShare}%`, borderRadius: "0 99px 99px 0", background: C.cold }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: C.mania }}>콜 {Math.round(callShare)}%</span>
          <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: C.cold }}>풋 {Math.round(100 - callShare)}%</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>콜 = 상승 베팅</span>
          <span style={{ fontSize: "var(--fs-11)", color: C.sub }}>풋 = 하락 대비</span>
        </div>
      </div>
      <Foot text={v.desc} />
    </Shell>
  );
}

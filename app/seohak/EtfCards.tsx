import type { EtfRow, SeohakEtf } from "@/lib/seohak-etf";
import { C, MONO, R } from "../ui";
import { BUY, SELL } from "./tone";
import { Card, Em, Verdict } from "./DailyCards";

/**
 * ETF 층 — 미국에 가는 두 번째 길.
 *
 * ⚠️ **곁길이라고 화면에 적어야 한다.** 서학개미 보유의 62.9% 는 미국 보통주 직접
 * 보유이고 펀드·ETF 는 20.6% 다(2025-06 조사 · 예전에 적혀 있던 72.1/20.2 는 2014년
 * 값이었다). 게다가 여기 담긴 건 **국내 상장** ETF 라 미국에
 * 직접 상장된 QQQ 같은 건 안 들어온다.
 */

/** 원 단위를 "1,234억"·"1.2조" 로. 이 층만 원화라 여기에만 둔다. */
const won = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(1)}조`;
  return `${sign}${Math.round(a / 1e8).toLocaleString("ko-KR")}억`;
};
const signed = (v: number) => (v >= 0 ? `+${won(v)}` : won(v));
/**
 * 좁은 칸에 맞게 이름을 줄인다.
 *
 * ⚠️ **운용사 접두어를 떼면 안 된다.** 처음에 그렇게 했다가 `TIGER 미국S&P500` 과
 * `KODEX 미국S&P500` 이 둘 다 "미국S&P500" 이 돼서 순위표에 같은 줄이 두 번 있는
 * 것처럼 보였다. 같은 지수를 담은 다른 상품이라는 게 이 층의 이야깃거리인데 그걸
 * 지운 셈이다.
 *
 * 대신 **'미국'을 뗀다.** 섹션 제목이 이미 국내 상장 미국 ETF 라고 밝히므로 모든
 * 줄에 붙는 군더더기다.
 */
const shortName = (name: string) => name.replace("미국", "").replace(/\s{2,}/g, " ").trim();

/**
 * ⑩ 제값과의 차이 — 100만 원어치를 살 때 붙는 웃돈.
 *
 * ## ⚠️⚠️⚠️ 세 판째다. 매번 다른 것이 문제였다
 *
 * 1판 202종목 점 분포 + "보통은 +0.07%, 가장 비싼 건 +1.28%"
 *     → **낱말이 낯설었다**(괴리율 · 순자산가치 · %가 큰지 작은지).
 * 2판 원 단위로 바꾸고 세 줄 표
 *     → **그림이 없고 글이 많았다.** "이 카드가 뭘 말하려는지 모르겠다".
 * 3판(지금) 문장 하나 + 3분할 막대 하나 + 이름 셋.
 *
 * ⭐ 이 카드는 **발견이 아니라 값을 말하는 카드**다. "이 그릇(국내 상장 미국 ETF)을 쓰면
 * 제값보다 얼마를 더 내나". 그래서 결론 문장은 금액이고, 그림은 그 금액의 분포다.
 *
 * ## ⛔ 재 봤지만 못 쓴 것들
 *
 * - **웃돈은 수요의 흔적이 아니다.** 자금 유입과의 순위상관이 22거래일 내내 −0.14~+0.23
 *   으로 0 근처다. "돈이 몰린 상품에 웃돈이 붙는다"는 그럴듯한 이야기가 안 맞는다.
 * - **'오른 것 vs 내린 것' 두 막대는 못 쓴다.** 22일 중 5일은 한쪽이 9~11종목뿐이다 —
 *   전부 미국 지수를 따라가니 같은 날은 대체로 같은 방향으로 움직인다.
 * - 거래대금이 작을수록 |웃돈| 이 크긴 한데(1~5억 0.26% → 20~100억 0.14%) 100억+ 에서
 *   0.20% 로 되올라가 단조롭지 않다.
 *
 * ⭐ 남은 하나는 **왜 웃돈이 생기나**다. 그날 등락과의 순위상관이 22일 중 18일 양수이고
 *   중앙 +0.46 이다 — 미국 장이 닫혀 있는 동안 국내에서 먼저 오르면 안에 든 자산 값은
 *   그대로라 그 차이가 웃돈으로 남는다. 발견이 아니라 **정의의 설명**이라 각주에 둔다.
 *
 * ⚠️ 문턱 ±0.2%(=100만 원당 2,000원)는 분위수가 아니라 **뜻으로** 잡았다. 분위수로 잡으면
 * 조용한 날에도 늘 3분의 1이 '웃돈'으로 찍힌다.
 */
const PER_MILLION = 1_000_000;
/**
 * 괴리율(%)을 100만 원어치를 살 때 더 내는(덜 내는) 돈으로. 부호는 문장이 진다.
 *
 * ⚠️ **반올림한다.** 그대로 내면 729원 · 12,803원 처럼 나오는데 원자료가 소수 둘째 자리
 * 괴리율이라 마지막 자리는 뜻이 없다.
 */
const perMillion = (premiumPct: number) => {
  const raw = Math.abs((premiumPct / 100) * PER_MILLION);
  const step = raw >= 1000 ? 100 : 10;
  return `${(Math.round(raw / step) * step).toLocaleString("ko-KR")}원`;
};
/**
 * 100만 원을 내면 실제로 몇 원어치를 받나. 100원 단위로 반올림한다.
 *
 * ⭐ "웃돈 730원" 보다 이 꼴이 먼저 온다. **"왜 돈을 더 내는가"를 물어 왔기 때문**이다 —
 * 낸 돈과 받은 것을 나란히 두면 그 물음이 문장 안에서 풀린다. 웃돈은 그 차액이다.
 */
const worthPerMillion = (premiumPct: number) => {
  const worth = PER_MILLION / (1 + premiumPct / 100);
  return `${(Math.round(worth / 100) * 100).toLocaleString("ko-KR")}원`;
};
/** 이 카드가 '거의 제값'으로 보는 폭. 100만 원당 2,000원. */
const FAIR_PCT = 0.2;

function Premium({ e }: { e: SeohakEtf }) {
  const cheap = e.liquid.filter((r) => r.premium < -FAIR_PCT).length;
  const rich = e.liquid.filter((r) => r.premium > FAIR_PCT).length;
  const fair = e.liquid.length - cheap - rich;
  const total = e.liquid.length || 1;
  const mid = e.medianPremium;

  /* 싸다 → 제값 → 웃돈. 왼쪽이 싼 쪽이라 숫자선처럼 읽힌다.
     색은 `EquityTypeSection` 과 같은 검증된 셋이고, 가장 큰 칸이 파랑인 규칙도 같다. */
  const parts = [
    { k: "cheap", label: "더 받는다", n: cheap, fill: C.marker, ink: C.ink },
    { k: "fair", label: "거의 제값", n: fair, fill: C.blue, ink: C.card },
    { k: "rich", label: "덜 받는다", n: rich, fill: C.inkSoft, ink: C.card },
  ];

  return (
    <>
      <Verdict>
        100만 원을 내면 <Em>{worthPerMillion(mid)}</Em>어치를 받습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", height: 30, gap: 2, minWidth: 0 }}>
          {parts.map((p) => (
            <span key={p.k} title={`${p.label} ${p.n}종목`}
                  style={{ width: `${(p.n / total) * 100}%`, background: p.fill, borderRadius: 3,
                           display: "flex", alignItems: "center", justifyContent: "center",
                           minWidth: 0, overflow: "hidden" }}>
              {/* 15% 미만이면 글자를 비운다. 아래 범례가 그 칸을 말한다. */}
              {p.n / total >= 0.15 && (
                <b style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: p.ink,
                            whiteSpace: "nowrap" }}>{p.n}종목</b>
              )}
            </span>
          ))}
        </div>
        {/* ⚠️ 문턱을 글자로 박아 두면 안 된다. `FAIR_PCT` 를 고치는 날 이 줄이 거짓이
            된다 — 같은 값에서 뽑는다. */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5,
                      color: C.faint }}>
          <span>{perMillion(FAIR_PCT)} 넘게 더 받는다</span>
          <span>±{perMillion(FAIR_PCT)}</span>
          <span>{perMillion(FAIR_PCT)} 넘게 덜 받는다</span>
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: "7px 0 0", display: "flex",
                     flexDirection: "column", gap: 5, borderTop: `1px solid ${C.line}` }}>
          <li style={{ fontSize: 10.5, color: C.faint }}>100만 원을 내면 받는 것</li>
          {e.richest.slice(0, 3).map((r) => (
            <li key={r.code} style={{ display: "flex", gap: 8, fontSize: 11.5, alignItems: "baseline" }}>
              <span style={{ color: C.sub, minWidth: 0, overflow: "hidden",
                             textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(r.name)}</span>
              <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO,
                             fontWeight: 700, color: C.ink }}>{worthPerMillion(r.premium)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * ⑪ ETF 자금 유입 — 가운데를 0 으로 두고 양쪽으로 뻗는 막대.
 *
 * 거래대금이 아니라 **상장좌수 변화 × NAV** 다. 같은 돈이 오간 것은 안 세고 설정·환매만
 * 센다 — 그래서 272종목 중 84종목만 값이 0 이 아니다.
 *
 * ## ⚠️⚠️ 앞 판은 빠져나간 돈도 **같은 방향으로** 뻗었다
 *
 * 막대가 전부 왼쪽에서 시작해 오른쪽으로 자랐고, 들어온 것과 빠진 것을 파랑(진함)과
 * 회색(연함)으로만 갈랐다. 그러니 **−113억이 +113억과 같은 그림**이었다 — 길이가 같고
 * 색만 옅다. 부호를 색의 진하기로 말하면 눈이 먼저 길이를 읽고 방향은 나중에 읽는다.
 *
 * 지금은 **0 을 가운데 두고 양쪽으로 뻗는다.** 방향이 위치로 드러나므로 색은 거들기만
 * 한다. 그리고 색은 국내 관행(`tone.ts`)을 따른다 — **들어오면 빨강, 빠지면 파랑.**
 *
 * ## ⚠️⚠️ 0 을 화면 가운데 두면 안 된다. **양쪽 실제 크기로 나눈다**
 *
 * 처음엔 축을 반씩(50:50) 갈랐다. 그런데 유출 최대가 113억, 유입 최대가 559억이라
 * **왼쪽 절반이 5분의 1만 차고 나머지가 텅 비었다**("여백의 미가 아니라 그냥 빈 느낌").
 *
 * 그래서 0 의 자리를 `유출최대 ÷ (유출최대+유입최대)` 로 잡는다 — 오늘은 16.8% 다.
 * 양쪽이 각자 제 공간을 다 쓰고, **1억이 차지하는 픽셀은 양쪽이 같다**(눈금이 안 휜다).
 *
 * ⚠️ 그래서 0 의 자리가 날마다 움직인다. 축에 '0' 을 찍어 어디가 기준인지 늘 보이게 한다.
 * ⚠️ 이름 칸도 34%(341px)에서 220px 로 줄였다. 가장 긴 이름이 170px 이라 남는 폭이
 * 그대로 빈칸이었다.
 *
 * ⭐ 이 카드의 진짜 발견은 순위표가 아니라 **환헤지형만 방향이 반대**라는 것이라, 그걸
 * 아래에 별도 줄로 세운다.
 */
function Flows({ e }: { e: SeohakEtf }) {
  // 큰 유입 → 큰 유출 순. 가운데 축을 쓰므로 값 순으로 세워야 위아래가 곧 방향이 된다.
  const rows = [...e.inflow, ...e.outflow].sort((a, b) => b.netFlow - a.netFlow);
  const maxIn = Math.max(0, ...rows.map((r) => r.netFlow));
  const maxOut = Math.max(0, ...rows.map((r) => -r.netFlow));
  const span = maxIn + maxOut || 1;
  /** 0 의 자리(%). 양쪽 실제 크기로 나눠 어느 쪽도 빈칸을 남기지 않는다. */
  const zero = (maxOut / span) * 100;
  const NAME = 220;
  const VALUE = 62;

  const bar = (r: EtfRow) => {
    const up = r.netFlow >= 0;
    /* 최소 1.2% 는 0 에 가까운 값도 한 획은 보이게 하는 값이다. */
    const w = Math.max(1.2, (Math.abs(r.netFlow) / span) * 100);
    return (
      <li key={r.code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
        <span style={{ flex: `0 0 ${NAME}px`, minWidth: 0, color: C.sub, overflow: "hidden",
                       textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(r.name)}</span>
        <span style={{ flex: 1, position: "relative", height: 11, minWidth: 0 }}>
          <span aria-hidden style={{ position: "absolute", left: `${zero}%`, top: 0, bottom: 0,
                                     width: 1, background: C.line }} />
          <span style={{ position: "absolute", top: 0, bottom: 0, width: `${w}%`,
                         ...(up ? { left: `${zero}%`, borderRadius: "0 3px 3px 0" }
                                : { right: `${100 - zero}%`, borderRadius: "3px 0 0 3px" }),
                         background: up ? BUY : SELL }} />
        </span>
        <span style={{ flex: `0 0 ${VALUE}px`, textAlign: "right", fontFamily: MONO, fontWeight: 700,
                       color: up ? BUY : SELL }}>{signed(r.netFlow)}</span>
      </li>
    );
  };

  const split = e.hedgedFlow < 0 && e.unhedgedFlow > 0;

  return (
    <>
      <Verdict>
        하루에 <Em>{signed(e.netFlowTotal)}</Em>이 실제로 들어왔습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        {/* 축. 0 의 자리가 날마다 움직이므로 그 자리에 '0' 을 찍는다. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10,
                      color: C.faint }}>
          <span style={{ flex: `0 0 ${NAME}px` }} />
          <span style={{ flex: 1, position: "relative", height: 13, minWidth: 0 }}>
            <span style={{ position: "absolute", left: 0 }}>← 빠졌다</span>
            <span style={{ position: "absolute", left: `${zero}%`, transform: "translateX(-50%)" }}>0</span>
            <span style={{ position: "absolute", right: 0 }}>들어왔다 →</span>
          </span>
          <span style={{ flex: `0 0 ${VALUE}px` }} />
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                     flexDirection: "column", gap: 5 }}>
          {rows.map(bar)}
        </ul>
        <div style={{ display: "flex", gap: 7, paddingTop: 7, borderTop: `1px solid ${C.line}` }}>
          {[
            { label: "환헤지형 (H)", v: e.hedgedFlow },
            { label: "환헤지 없음", v: e.unhedgedFlow },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: C.soft, borderRadius: R.control,
                                        padding: "7px 9px", display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 10, color: C.sub2, fontWeight: 600 }}>{s.label}</span>
              {/* 여기도 같은 규칙이다. 앞 판은 양수를 파랑으로 칠해 막대와 어긋났다. */}
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800,
                             color: s.v >= 0 ? BUY : SELL }}>{signed(s.v)}</span>
            </div>
          ))}
        </div>
        {split && (
          <span style={{ fontSize: 10.5, color: C.faint }}>
            환헤지형에서만 돈이 빠졌습니다
          </span>
        )}
      </div>
    </>
  );
}

/* ── ⑫ 이번 주 어디로 갔나 ─────────────────────────────────────────────
   등락과 자금은 서로 다른 축이라 산점도가 자연스러운데, 300px 칸에서 축 둘은 안
   읽힌다. 이 데이터가 실제로 답하는 건 **부호 조합 네 가지**뿐이라 2×2 격자로 접는다.
   "올랐는데 돈이 나갔다" 칸이 차 있으면 그게 이 주의 이야기다. */
function WeekGrid({ e }: { e: SeohakEtf }) {
  const cells = [
    { up: true, inflow: true, label: "올랐고 들어왔다" },
    { up: true, inflow: false, label: "올랐는데 나갔다" },
    { up: false, inflow: true, label: "내렸는데 들어왔다" },
    { up: false, inflow: false, label: "내렸고 나갔다" },
  ].map((c) => {
    const list = e.week.filter(
      (w) => w.changePct >= 0 === c.up && w.netFlow >= 0 === c.inflow && w.netFlow !== 0,
    );
    // 대표는 자금이 가장 크게 움직인 것으로 고른다. 등락으로 고르면 거래가 거의 없는
    // 종목이 뽑혀 "이 주의 이야기"가 안 된다.
    const lead = [...list].sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow))[0];
    return { ...c, count: list.length, lead };
  });
  const odd = cells.filter((c) => c.up !== c.inflow).reduce((s, c) => s + c.count, 0);
  const total = cells.reduce((s, c) => s + c.count, 0) || 1;

  return (
    <>
      <Verdict>
        {Math.round((odd / total) * 100)}% 는 <Em>값이 간 쪽과 돈이 간 쪽이 반대</Em>였습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {cells.map((c) => {
            const contrary = c.up !== c.inflow;
            return (
              <div key={c.label}
                   style={{ background: contrary ? C.chip : C.soft, borderRadius: R.control,
                            padding: "8px 9px", display: "flex", flexDirection: "column", gap: 2,
                            minWidth: 0 }}>
                <span style={{ fontSize: 10, color: C.sub2, fontWeight: 600 }}>{c.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800,
                               color: contrary ? C.blue : C.ink }}>{c.count}종목</span>
                <span style={{ fontSize: 10, color: C.faint, minWidth: 0, overflow: "hidden",
                               textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.lead ? shortName(c.lead.name) : "없음"}
                </span>
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: 10.5, color: C.faint }}>
          {e.weekFrom.slice(5)} ~ {e.asOf.slice(5)} · 파란 칸이 엇갈린 쪽입니다
        </span>
      </div>
    </>
  );
}

/**
 * 무엇에 담았나 — ETF 석 장.
 *
 * ⭐ **자금 유입이 전폭이다.** 이 섹션에서 매일 답하는 가장 값진 카드고, 종목 이름이
 * 붙은 목록이라 넓어지는 만큼 그대로 값을 한다(325px 칸에서는 "KODEX 배당커버드콜
 * 액티브…" 처럼 이름이 잘렸다). 괴리율과 등락은 그 아래 격자에 둔다.
 */
export function EtfSection({ e }: { e: SeohakEtf }) {
  return (
    <>
      <Card icon="input" title="ETF 자금 유입"
            desc="국내 상장 미국 ETF 로 실제로 들어온 돈입니다. 거래대금이 아닙니다."
            note={`${e.asOf} 기준`}
            foot="상장좌수 변화 × 순자산가치로 잽니다. 같은 돈이 오간 것은 안 셉니다.">
        <Flows e={e} />
      </Card>

      {/* ⚠️ `CARD_GRID` 를 쓰면 안 된다. 그건 **auto-fill** 이라 1,004px 에서 300px 트랙을
          셋 만들고, 카드가 둘뿐이니 325px 씩 쓰고 오른쪽 한 칸이 빈다. 여기는 늘 둘이므로
          auto-fit 으로 절반씩(494px) 나눠 쓴다. */}
      <div style={{ display: "grid", gap: 14,
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))",
                    alignItems: "start" }}>
        <Card icon="sell" title="제값과의 차이"
              desc="ETF 시세와, 그 안에 든 미국 주식 값의 차이입니다. 미국 장이 닫힌 동안 국내에서 시세만 먼저 움직여 생깁니다."
              note={`${e.asOf} 종가`}
              foot={`그날 시세가 오른 ETF 일수록 차이가 큽니다(22거래일 중 18일). 업계에서 괴리율이라 부르는 값이고, 거래대금 1억 이상 ${e.liquid.length}종목만 셉니다.`}>
          <Premium e={e} />
        </Card>

        <Card icon="grid_view" title="등락과 자금 방향"
              desc="국내 상장 미국 ETF 의 5영업일 등락과 그동안 오간 돈입니다."
              note="최근 5영업일"
              foot={`돈이 실제로 오간 종목만 셉니다. 레버리지·인버스는 거래대금의 ${e.leverageShare.toFixed(1)}% 뿐입니다.`}>
          <WeekGrid e={e} />
        </Card>
      </div>
    </>
  );
}

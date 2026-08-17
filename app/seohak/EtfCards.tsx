import type { EtfRow, SeohakEtf } from "@/lib/seohak-etf";
import { C, MONO, R } from "../ui";
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
 * ⑩ 제값과의 차이 — 괴리율을 **원**으로 말한다.
 *
 * ## ⚠️⚠️ 앞 판은 "뭔지 이해를 못 하겠다"를 받았다
 *
 * 202종목을 점으로 찍은 수직선 + "보통은 +0.07% 인데 가장 비싼 건 +1.28%" 였다. 분포를
 * 보여 주겠다는 뜻이었는데 읽는 사람에게는 셋 다 낯선 말이었다 — **괴리율 · 순자산가치 ·
 * 그리고 +0.07% 가 큰지 작은지.**
 *
 * ⭐ 고칠 것은 그림이 아니라 **단위**였다. 괴리율 1.28% 는 "100만 원어치를 사면서 웃돈
 * 12,800원을 더 낸다"는 뜻이다. 원으로 바꾸면 설명이 필요 없다. 이 카드의 모든 숫자를
 * 100만 원 기준 원화로 통일한다 — %는 어디에도 안 쓴다.
 *
 * ⭐ 점 202개도 지운다. 뭉친 자리가 곧 "보통은 이렇다"라는 건 그린 사람만 아는 규칙이고,
 * 같은 말을 **몇 종목인지 세어서** 하면 그림이 필요 없다.
 *
 * ⚠️ 문턱은 ±0.2%(=100만 원당 ±2,000원)다. 분위수가 아니라 **뜻으로** 잡았다 — 2,000원은
 * 100만 원 거래에서 사람이 신경 쓸 만한 가장 작은 단위다. 분위수로 잡으면 시장이 조용한
 * 날에도 늘 3분의 1이 '웃돈'으로 찍힌다.
 */
const PER_MILLION = 1_000_000;
/**
 * 괴리율(%)을 100만 원어치를 살 때 더 내는(덜 내는) 돈으로. 부호는 문장이 진다.
 *
 * ⚠️ **반올림한다.** 그대로 내면 729원 · 12,803원 · 14,156원 처럼 나오는데, 이 카드가
 * 하는 말은 "이만큼입니다"라 자릿수를 다 보여 줄 이유가 없다. 원자료가 소수 둘째 자리
 * 괴리율이라 마지막 자리는 어차피 뜻이 없다.
 */
const perMillion = (premiumPct: number) => {
  const raw = Math.abs((premiumPct / 100) * PER_MILLION);
  const step = raw >= 1000 ? 100 : 10;
  return `${(Math.round(raw / step) * step).toLocaleString("ko-KR")}원`;
};
/** 이 카드가 '거의 제값'으로 보는 폭. 100만 원당 2,000원. */
const FAIR_PCT = 0.2;

function Premium({ e }: { e: SeohakEtf }) {
  const rich = e.liquid.filter((r) => r.premium > FAIR_PCT);
  const cheap = e.liquid.filter((r) => r.premium < -FAIR_PCT);
  const fair = e.liquid.length - rich.length - cheap.length;
  const mid = e.medianPremium;

  const buckets = [
    { k: "거의 제값", n: fair, note: `100만 원당 ${perMillion(FAIR_PCT)} 안` },
    { k: "웃돈이 붙었다", n: rich.length, note: rich.length ? `최대 ${perMillion(rich[0].premium)}` : "" },
    { k: "오히려 싸다", n: cheap.length,
      note: cheap.length ? `최대 ${perMillion(cheap[cheap.length - 1].premium)}` : "" },
  ];

  return (
    <>
      <Verdict>
        100만 원어치를 사면 {mid >= 0 ? "웃돈이 보통" : "보통"}{" "}
        <Em>{perMillion(mid)}</Em>{mid >= 0 ? "입니다" : " 싸게 삽니다"}
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                     flexDirection: "column", gap: 7 }}>
          {buckets.map((b) => (
            <li key={b.k} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
              <span style={{ color: C.label, fontWeight: 600 }}>{b.k}</span>
              <span style={{ fontSize: 10.5, color: C.faint }}>{b.note}</span>
              <b style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 13,
                          fontWeight: 800, color: C.ink }}>{b.n}종목</b>
            </li>
          ))}
        </ul>

        {/* 이름을 붙여야 "그게 어느 상품이냐"가 남지 않는다. 웃돈이 큰 쪽만 낸다 —
            싸게 사는 쪽은 위 줄이 최대치를 이미 말했다. */}
        <ul style={{ listStyle: "none", margin: 0, padding: "7px 0 0", display: "flex",
                     flexDirection: "column", gap: 5, borderTop: `1px solid ${C.line}` }}>
          {e.richest.slice(0, 3).map((r) => (
            <li key={r.code} style={{ display: "flex", gap: 8, fontSize: 11.5, alignItems: "baseline" }}>
              <span style={{ color: C.sub, minWidth: 0, overflow: "hidden",
                             textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(r.name)}</span>
              <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO,
                             fontWeight: 700, color: C.ink }}>{perMillion(r.premium)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ── ⑪ 어느 ETF 로 돈이 들어갔나 ───────────────────────────────────────
   거래대금이 아니라 **상장좌수 변화 × NAV** 다. 같은 돈이 오간 것은 안 세고 설정·환매만
   센다 — 그래서 272종목 중 84종목만 값이 0 이 아니다.

   ⭐ 이 카드의 진짜 발견은 순위표가 아니라 **환헤지형만 방향이 반대**라는 것이라,
   그걸 아래에 별도 줄로 세운다. */
function Flows({ e }: { e: SeohakEtf }) {
  const rows = [...e.inflow, ...e.outflow];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.netFlow)));
  const bar = (r: EtfRow) => (
    <li key={r.code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
      <span style={{ flex: "0 0 47%", minWidth: 0, color: C.sub, overflow: "hidden",
                     textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(r.name)}</span>
      <span style={{ flex: 1, height: 7, background: C.soft, borderRadius: 4, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", borderRadius: 4,
                       width: `${(Math.abs(r.netFlow) / max) * 100}%`,
                       background: r.netFlow >= 0 ? C.blue : C.marker }} />
      </span>
      <span style={{ flex: "0 0 58px", textAlign: "right", fontFamily: MONO, fontWeight: 700,
                     color: r.netFlow >= 0 ? C.ink : C.sub2 }}>{signed(r.netFlow)}</span>
    </li>
  );

  const split = e.hedgedFlow < 0 && e.unhedgedFlow > 0;

  return (
    <>
      <Verdict>
        하루에 <Em>{signed(e.netFlowTotal)}</Em>이 실제로 들어왔습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
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
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800,
                             color: s.v >= 0 ? C.blue : C.ink }}>{signed(s.v)}</span>
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
              desc="ETF 한 주 값과, 그 안에 든 자산 값의 차이입니다. 100만 원어치를 살 때로 바꿔 적었습니다."
              note={`${e.asOf} 종가`}
              foot={`업계에서 괴리율이라 부르는 값입니다. 거래대금 1억 이상 ${e.liquid.length}종목만 셉니다. 예측이 아니라 산수입니다.`}>
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

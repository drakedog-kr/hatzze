import type { SeohakEtf } from "@/lib/seohak-etf";
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
 * ⑪ ETF 자금 유입 — 들어온 곳과 빠진 곳을 좌우로.
 *
 * 거래대금이 아니라 **상장좌수 변화 × NAV** 다. 같은 돈이 오간 것은 안 세고 설정·환매만
 * 센다 — 그래서 272종목 중 84종목만 값이 0 이 아니다.
 *
 * ## ⚠️⚠️⚠️ 막대를 지웠다. 세 판을 거쳐서
 *
 * 1판 한 방향 막대 — 빠져나간 돈도 오른쪽으로 자라고 부호는 색의 진하기로만 갈랐다.
 *     **−113억이 +113억과 같은 그림**이었다.
 * 2판 0 을 가운데 둔 양방향 막대 — 방향은 잡혔는데 유출 최대가 113억, 유입 최대가
 *     559억이라 **왼쪽 절반이 텅 비었다.**
 * 3판 0 을 양쪽 실제 크기로 나눠 빈칸을 없앴다.
 * 4판(지금) **막대 자체를 지웠다.**
 *
 * ⭐ 3판까지는 막대를 어떻게 그릴지만 고쳤는데, 정작 물어야 할 것은 **막대가 그 자리값을
 * 하느냐**였다. 줄이 일곱뿐이고 금액이 바로 옆에 적혀 있다 — 길이가 더 말해 주는 게 없다.
 * 그런데도 일곱 줄을 세로로 쓰면서 폭은 3분의 2만 썼다.
 *
 * 지금은 **들어온 곳과 빠진 곳을 좌우 두 칸으로** 담는다. 같은 정보에 높이는 절반이고
 * 폭은 다 쓴다. 방향은 색과 칸 제목이 지므로(빨강 왼쪽 · 파랑 오른쪽) 막대가 없어도
 * 헷갈릴 자리가 없다. 남은 자리는 종목을 넷에서 **다섯씩**으로 늘리는 데 썼다.
 *
 * ⭐ 이 카드의 진짜 발견은 순위표가 아니라 **환헤지형만 방향이 반대**라는 것이라, 그걸
 * 아래에 별도 줄로 세운다.
 */
function Flows({ e }: { e: SeohakEtf }) {
  const sides = [
    { key: "in", head: "들어온 곳", rows: e.inflow, tone: BUY },
    { key: "out", head: "빠진 곳", rows: e.outflow, tone: SELL },
  ];
  const split = e.hedgedFlow < 0 && e.unhedgedFlow > 0;

  return (
    <>
      <Verdict>
        하루에 <Em>{signed(e.netFlowTotal)}</Em>이 실제로 들어왔습니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "grid", gap: 14,
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
          {sides.map((s) => (
            <div key={s.key} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11,
                             color: C.sub2, fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.tone, flexShrink: 0 }} />
                {s.head}
              </span>
              <ul style={{ listStyle: "none", margin: 0, padding: "6px 0 0", display: "flex",
                           flexDirection: "column", gap: 5, borderTop: `1px solid ${C.line}` }}>
                {s.rows.map((r) => (
                  <li key={r.code} style={{ display: "flex", gap: 8, fontSize: 11.5,
                                            alignItems: "baseline" }}>
                    <span style={{ color: C.sub, minWidth: 0, overflow: "hidden",
                                   textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortName(r.name)}
                    </span>
                    <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO,
                                   fontWeight: 700, color: s.tone }}>{signed(r.netFlow)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 7, paddingTop: 9, borderTop: `1px solid ${C.line}` }}>
          {/* ⚠️ 이름만으로는 안 읽힌다("이거 무슨 뜻이니"). 국내 상장 미국 ETF 는 원화로
              사지만 안에 든 건 달러 자산이라, 환율까지 받을지 말지가 갈린다. 한 줄로 붙인다. */}
          {[
            { label: "환헤지형 (H)", note: "환율 영향을 막은 것", v: e.hedgedFlow },
            { label: "환헤지 없음", note: "환율을 그대로 받는 것", v: e.unhedgedFlow },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: C.soft, borderRadius: R.control,
                                        padding: "7px 9px", display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 10.5, color: C.label, fontWeight: 700 }}>{s.label}</span>
              <span style={{ fontSize: 10, color: C.faint }}>{s.note}</span>
              {/* 위 목록과 같은 규칙이다. 앞 판은 양수를 파랑으로 칠해 어긋나 있었다. */}
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

/**
 * ⑫ 주간 등락 — 5영업일 동안 많이 오른 것과 내린 것.
 *
 * ## ⛔ 앞 판(2×2 격자)은 **전제가 비어 있었다.** 지우고 다시 세웠다
 *
 * 값의 방향 × 돈의 방향으로 네 칸을 만들고 "44% 는 값이 간 쪽과 돈이 간 쪽이
 * 반대였습니다"를 결론으로 냈다. 그런데 **그 둘 사이에 관계가 없다.**
 *
 * 15주를 재 보니 두 축의 파이(phi)가 **−0.18 ~ +0.18** 을 오가고 부호도 7:8 로 갈렸다.
 * 카이제곱 p 는 대부분 0.05 위다. 즉 "44%"는 관계의 크기가 아니라 **그 주에 몇 종목이
 * 올랐는지**의 부산물이다 — 실제로 44% 도 66% 도 나왔고, 그 차이는 오름 종목 비율이
 * 만든 것이지 엇갈림이 커진 게 아니다. 읽는 사람은 그걸 신호로 읽는다.
 *
 * ⭐ 그래서 **관계를 주장하지 않는다.** 이 자료가 흔들림 없이 답하는 건 "무엇이 얼마나
 * 올랐나" 하나뿐이라 그것만 낸다. 옆에 그 주의 자금을 나란히 두되 **인과로 엮지 않는다** —
 * 둘 다 그 종목의 그 주 기록일 뿐이다.
 *
 * ⚠️ 분류(지수형·테마형)로 가르는 안도 재 봤는데 접었다. 이름으로 자를 수밖에 없는데
 * `KODEX 미국S&P500테크놀로지` 같은 섹터 상품이 지수형으로 딸려 들어온다. 채권 필터는
 * 실측으로 오분류가 0 이었지만 이쪽은 안 그렇다.
 *
 * 칸 꼴은 `Flows` 와 같다 — 오른 쪽 빨강, 내린 쪽 파랑, 좌우 두 칸.
 */
function WeekGrid({ e }: { e: SeohakEtf }) {
  const moved = e.week.filter((w) => Number.isFinite(w.changePct));
  const byChange = [...moved].sort((a, b) => b.changePct - a.changePct);
  const up = byChange.slice(0, 5);
  const down = byChange.slice(-5).reverse();
  const sides = [
    { key: "up", head: "오른 것", rows: up, tone: BUY },
    { key: "down", head: "내린 것", rows: down, tone: SELL },
  ];
  const chg = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

  return (
    <>
      <Verdict>
        가장 많이 오른 건 <Em>{chg(byChange[0]?.changePct ?? 0)}</Em>, 가장 많이 내린 건{" "}
        <Em>{chg(byChange[byChange.length - 1]?.changePct ?? 0)}</Em>입니다
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "grid", gap: 14,
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
          {sides.map((s) => (
            <div key={s.key} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11,
                             color: C.sub2, fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.tone, flexShrink: 0 }} />
                {s.head}
              </span>
              <ul style={{ listStyle: "none", margin: 0, padding: "6px 0 0", display: "flex",
                           flexDirection: "column", gap: 5, borderTop: `1px solid ${C.line}` }}>
                {s.rows.map((r) => (
                  <li key={r.code} style={{ display: "flex", gap: 8, fontSize: 11.5,
                                            alignItems: "baseline" }}>
                    <span style={{ color: C.sub, minWidth: 0, overflow: "hidden",
                                   textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {shortName(r.name)}
                    </span>
                    {/* 그 주 자금을 옆에 두되 **인과로 엮지 않는다.** 둘 다 그 주의 기록이다. */}
                    <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10,
                                   color: C.faint, fontFamily: MONO }}>
                      {r.netFlow ? signed(r.netFlow) : "—"}
                    </span>
                    <b style={{ flexShrink: 0, minWidth: 46, textAlign: "right", fontFamily: MONO,
                                fontWeight: 700, color: s.tone }}>{chg(r.changePct)}</b>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 10.5, color: C.faint }}>
          {e.weekFrom.slice(5)} ~ {e.asOf.slice(5)} · 회색은 그동안 오간 돈입니다
        </span>
      </div>
    </>
  );
}

/**
 * 무엇에 담았나 — 두 장, 각각 전폭 한 행.
 *
 * ⛔ '제값과의 차이'(괴리율)는 뺐다. 세 판을 고쳐 읽히게는 만들었지만 **발견이 아니라
 * 값을 말하는 카드**였고, 100만 원어치에 웃돈 730원은 이 페이지가 다루는 규모에서
 * 각주감이다. 지운 코드가 필요하면 히스토리를 볼 것 — 괴리율을 원으로 옮기는 요령
 * (`worthPerMillion`)과 ±0.2% 문턱을 뜻으로 잡은 근거가 거기 있다.
 *
 * ⭐ 남은 둘은 **좌우 두 열**이다(495px 씩). 전폭 두 행으로도 뒀다가 되돌렸다 — 한 행을
 * 통째로 쓰면 이름이 다 보이는 대신 섹션이 세로로 길어지고, 두 카드가 같은 꼴이라
 * 나란히 두면 견주기가 쉽다.
 *
 * ⚠️ 그래서 카드 안쪽 두 칸(들어온 곳/빠진 곳)은 495px 에서 **위아래로 접힌다**
 * (안쪽 minmax 가 280px). 접히는 편이 낫다 — 억지로 2열을 유지하면 한 칸이 218px 라
 * "TIGER 미국필라델피아반도체나스닥"(170px)이 값(62px)에 밀려 잘린다.
 */
export function EtfSection({ e }: { e: SeohakEtf }) {
  return (
    <div style={{ display: "grid", gap: 14, alignItems: "start",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
      <Card icon="input" title="ETF 자금 유입"
            desc="국내 상장 미국 ETF 로 실제로 들어온 돈입니다. 거래대금이 아닙니다."
            note={`${e.asOf} 기준`}
            foot="상장좌수 변화 × 순자산가치로 잽니다. 같은 돈이 오간 것은 안 셉니다. 이 페이지는 미국 주식 이야기라 국채·회사채·채권혼합형은 뺐습니다.">
        <Flows e={e} />
      </Card>

      <Card icon="grid_view" title="주간 등락"
            desc="국내 상장 미국 ETF 가 5영업일 동안 얼마나 오르내렸는지입니다."
            note="최근 5영업일"
            foot={`거래대금 1억 이상 ${e.week.length}종목을 셉니다. 돈이 안 오간 종목은 금액 자리가 비어 있습니다. 레버리지·인버스는 거래대금의 ${e.leverageShare.toFixed(1)}% 뿐입니다.`}>
        <WeekGrid e={e} />
      </Card>
    </div>
  );
}

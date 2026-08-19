import type { SeohakEtf } from "@/lib/seohak-etf";
import { C, MONO, R } from "../ui";
import { BUY, BUY_INK, SELL, SELL_INK } from "./tone";
import { CARD_GRID, Card, SignEm, Verdict } from "./DailyCards";
import { type Fx, Money, md } from "./money";
import { S, T } from "./scale";

/**
 * ETF 층 — 미국에 가는 두 번째 길.
 *
 * ⚠️ **곁길이라고 화면에 적어야 한다.** 여기 담긴 건 **국내 상장** ETF 라 미국에 직접
 * 상장된 QQQ 같은 건 안 들어온다. 개인이 미국 주식을 사는 주된 길은 국내 증권사를 거친
 * 직접 매매다.
 *
 * ⚠️ 예전엔 "보유의 62.9% 가 보통주"라고 적혀 있었다. 미 재무부 SHL 조사값인데 그건
 * 국민연금까지 포함한 **전 국민** 숫자라 이 페이지가 말하는 개인과 모집단이 다르다.
 * 그 카드를 뺄 때 인용도 같이 뗐다.
 */

/* 이 층의 `won()`·`signed()` 가 여기 있었다. KRX 자료라 원화가 원천인데, 통화 스위치가
   붙으면서 달러 짝을 함께 그려야 해서 `money.tsx` 의 `<Money krw={…}>` 로 넘어갔다.
   ⚠️ **환산 방향이 다른 카드와 반대다.** 여기는 원 → 달러다. */
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
 * 순위표 — **카더라의 테마 로테이션·이슈 키워드에서 가져온 조판이다.**
 *
 * 앞 판은 두 카드가 통째로 흰 바탕에 글자만 얹힌 목록이었다("다 하얀색이라 구분이 잘
 * 안돼"). 카더라의 그 두 시트가 흰 바탕에서도 갈라져 보이는 까닭은 넷이다. 그대로 옮긴다.
 *
 *   ① 머리 띠   `--c-soft` 로 파인 한 줄. 칸 이름을 여기서 대므로 줄마다 되풀이가 없다
 *   ② 순위 배지 `--c-plate` 판에 얹은 번호. 줄의 왼쪽 끝을 고정해 눈이 탈 세로선이 생긴다
 *   ③ 구분선   줄 사이 `--c-sheet-row`
 *   ④ 막대     제 칸을 쓰되 6px 이라 세로를 안 먹는다
 *
 * ⚠️ **색이 셋이다.** 머리 네모는 원색(BUY/SELL), 막대는 한 톤 옅은
 * `--c-warm-2`·`--c-blue-2`, 값 글자는 읽히는 값(BUY_INK/SELL_INK)이다.
 * ⛔ 값 글자에 원색을 쓰면 안 된다 — 파랑(#3182f6)이 흰 카드 위 **명암비 3.71** 이라
 * 4.5 에 못 미친다. 실제로 그렇게 돼 있었다. 자세한 건 `tone.ts` 머리말. 다섯 줄을 원색 막대로 세우면 그 칸이 카드에서
 * 제일 센 잉크가 되는데, 이 표에서 읽어야 할 것은 길이가 아니라 이름과 금액이다.
 * 카더라도 같은 이유로 막대만 2단계 색을 쓴다.
 *
 * ⚠️ 안쪽 하한이 320px 이다. 18(배지)+48(막대)+58(값)에 간격 24 를 더하면 148 이 고정이라
 * 280px 에서는 이름 칸이 132px 로 줄어 `TIGER 필라델피아반도체나스닥` 이 반 토막 난다.
 */
function RankTable({ head, hint, tone, ink, barTone, rows }: {
  head: string;
  /** 값 칸의 이름. 줄마다 단위를 되풀이하지 않으려고 머리 띠에 한 번만 적는다. */
  hint: string;
  /** 머리 네모의 **면** 색. */
  tone: string;
  /** 값 **글자** 색. 면 색과 다른 값이다(머리말 참고). */
  ink: string;
  barTone: string;
  rows: { key: string; name: string; weight: number; value: React.ReactNode }[];
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.weight)), 1);
  /* ⛔ 여기 다섯째 칸(옅은 회색 보조값)이 있었다. '주간 등락' 이 그 주 순유입을 등락
     옆에 세우는 데 썼는데 뺐다 — 까닭은 `WeekGrid` 머리말. 두 카드가 같은 네 칸을
     쓰게 되어 조건 분기도 함께 사라진다.
     ⚠️ 칸 폭은 이제 `.hz-rank-row`(globals.css)가 정한다. 좁은 화면에서 막대 칸을
     접어야 하는데 **인라인 style 은 미디어쿼리를 이기기 때문**이다. */

  return (
    /* ⭐ `height:100%` + 아래 `<ul>` 의 1fr 줄. 두 카드의 세로가 늘 같아야 하는데
       '주간 등락' 쪽이 22px 더 컸다(결론 문장이 한 줄 더 접힌다). 표가 그 폭을 줄
       간격으로 나눠 먹으면 짧은 쪽 바닥에 구멍이 안 생긴다. */
    <div style={{ minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ⭐ 머리 띠가 줄과 **같은 격자**를 쓴다. 예전엔 flex 라 이름이 칸 위가 아니라
          오른쪽 끝에 몰려 있었고, 그래서 회색 보조 칸만 이름이 없어 "회색은 그동안 오간
          돈" 이라는 각주가 따로 있어야 했다. 칸마다 이름을 붙이면 그 각주가 사라진다. */}
      <div className="hz-rank-row"
           style={{ padding: "5px 9px", background: C.soft, borderRadius: R.control,
                    fontSize: T.small, fontWeight: 700 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: tone,
                                   justifySelf: "center" }} />
        <span style={{ color: C.label }}>{head}</span>
        <span className="hz-rank-bar" />
        <span style={{ color: C.muted, fontWeight: 600, textAlign: "right" }}>{hint}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1, minHeight: 0,
                   display: "grid", gridTemplateRows: `repeat(${rows.length}, minmax(29px, 1fr))` }}>
        {rows.map((r, i) => (
          <li key={r.key} className="hz-rank-row"
              style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.sheetRow}` : undefined }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, background: "var(--c-plate)",
                           color: "var(--c-cold-ink)", fontSize: T.small, fontWeight: 800,
                           display: "flex", alignItems: "center", justifyContent: "center" }}>
              {i + 1}
            </span>
            {/* ⭐ 이 칸이 **행에서 제일 중요한데 제일 연하고 작았다**(11px/400/sub).
                본보기로 삼은 카더라의 테마 로테이션 행은 이름이 13.5px/700/잉크다 —
                순위표에서 읽는 것은 이름이고 숫자는 그 이름을 줄 세우는 자다.
                ⚠️ 크기는 12 로 잡는다. 1,060px 에서 이름 칸이 202px 인데 가장 긴 이름
                (`ACE 빅테크7+데일리타겟커버드콜(합성)`)이 12/600 에서 195px,
                13/600 에서는 211px 라 말줄임표가 붙는다. */}
            {/* ⚠️ 12px 로 올리면서 1,060px(이름 칸 178px)에서 가장 긴 이름 둘에 말줄임표가
                붙는다. 11px 로 두면 안 붙지만 그건 안 읽히는 크기였다 — 잘린 꼬리는
                `title` 로 되찾을 수 있고, 안 읽히는 글자는 되찾을 길이 없다. */}
            <span title={r.name}
                  style={{ fontSize: T.body, fontWeight: 600, color: C.ink, minWidth: 0,
                           overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.name}
            </span>
            {/* 막대는 클래스로 둔다. 인라인으로 두면 좁은 화면에서 이 칸을 접는 규칙을
                이겨서 막대만 살아남는다(카더라에서 실제로 터진 자리다). 채움 폭·색만 인라인. */}
            <span className="hz-bar hz-rank-bar">
              <span style={{ width: `${Math.max(4, (Math.abs(r.weight) / max) * 100)}%`,
                             background: barTone }} />
            </span>
            <span style={{ fontFamily: MONO, fontSize: T.small, fontWeight: 700, color: ink,
                           textAlign: "right" }}>{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * ⑪ ETF 자금 유입 — 들어온 곳과 빠진 곳을 좌우로.
 *
 * 거래대금이 아니라 **상장좌수 변화 × NAV** 다. 같은 돈이 오간 것은 안 세고 설정·환매만
 * 센다 — 그래서 272종목 중 84종목만 값이 0 이 아니다.
 *
 * ## ⚠️⚠️⚠️ 막대는 다섯 판을 거쳤다. 지금 자리가 왜 여기인지
 *
 * 1판 한 방향 막대 — 빠져나간 돈도 오른쪽으로 자라고 부호는 색의 진하기로만 갈랐다.
 *     **−113억이 +113억과 같은 그림**이었다.
 * 2판 0 을 가운데 둔 양방향 막대 — 방향은 잡혔는데 유출 최대가 113억, 유입 최대가
 *     559억이라 **왼쪽 절반이 텅 비었다.**
 * 3판 0 을 양쪽 실제 크기로 나눠 빈칸을 없앴다.
 * 4판 **막대 자체를 지웠다** — 자리를 너무 많이 먹었다("왜케 자리를 많이 차지해").
 * 5판(지금) **한 방향 막대를 제 칸에 되돌렸다.** 방향은 칸이 이미 나눠 놓았으므로
 *     막대는 그 칸 안의 크기만 말하면 된다 — 4판이 지운 것은 막대가 아니라 폭이었다.
 *
 * ⭐ 그래서 되돌려도 4판의 교훈이 안 깨진다. 지금 막대는 48px 짜리 제 칸에 6px 높이로
 * 앉아 세로를 한 픽셀도 안 먹는다. `RankTable` 머리말 참고.
 *
 * 방향은 색과 칸 제목이 진다(빨강 위 · 파랑 아래). 종목은 다섯씩이다.
 *
 * ## ⛔ 환헤지 두 상자를 뺐다. **"진짜 발견"이라고 적어 뒀던 것이 잡음이었다**
 *
 * 주석이 "환헤지형만 방향이 반대"를 이 카드의 요점이라고 적고 있었다. 149거래일로
 * 재니 무너졌다.
 *
 *   부호가 갈린 날 66/149일(44%)  ·  **두 축이 무관할 때 기대치 54%**
 *   일별 흐름 상관 r = +0.216 (약하지만 **같은 방향**)
 *
 * 우연보다 9.5%p **덜** 갈린다 — 주장의 반대다. 그런데도 갈릴 때마다 "환헤지형에서만
 * 돈이 빠졌습니다" 줄이 떠서 이틀에 한 번꼴로 발견처럼 보였다. 채권형을 빼면서 값이
 * −85억 → −10억 으로 준 것도 신호였다(근거의 대부분이 채권 ETF 였다).
 *
 * ⚠️ 규모도 안 맞는다. 환헤지형은 217종목 중 29개, 거래대금의 **2.4%**(중앙값)다.
 *
 * ⭐ 창을 늘리면 방향이 있긴 하다 — 149일 누적으로 헤지 −3,175억, 비헤지 +283,185억.
 * "환헤지를 버리고 환율을 그대로 받는 쪽으로 간다"는 일관된데, 전체의 1.1% 라 이 카드에
 * 자리를 줄 값어치가 없다고 봤다. 되살린다면 **하루치가 아니라 창 전체 값**으로 각주에.
 */
function Flows({ e, fx }: { e: SeohakEtf; fx: Fx | null }) {
  /* ⚠️ 두 칸이 `hint` 를 "하루 순유입" 으로 함께 쓰고 있었다. 빠진 곳에 그렇게 적으면
     **칸 이름과 값 이름이 서로 반대**를 가리킨다. 칸마다 제 이름을 준다. */
  const sides = [
    { key: "in", head: "들어온 곳", hint: "하루 순유입",
      rows: e.inflow, tone: BUY, ink: BUY_INK, bar: "var(--c-warm-2)" },
    { key: "out", head: "빠진 곳", hint: "하루 순유출",
      rows: e.outflow, tone: SELL, ink: SELL_INK, bar: "var(--c-blue-2)" },
  ];
  return (
    <>
      <Verdict>
        하루에{" "}
        <SignEm v={e.netFlowTotal}>
          <Money krw={e.netFlowTotal} at={e.asOf.slice(0, 7)} fx={fx} signed />
        </SignEm>
        이 실제로 들어왔습니다
      </Verdict>

      {/* ⚠️ `marginTop:auto` 를 안 쓴다. 격자가 stretch 라 남는 폭이 통째로
          결론 문장과 그림 사이로 밀려 들어가 빈 띠가 된다. 위에 붙이고 남는 건
          카드 바닥으로 보낸다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: S.md, flex: 1, minHeight: 0 }}>
        <div style={{ display: "grid", gap: S.md, flex: 1, minHeight: 0,
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
          {sides.map((s) => (
            <RankTable
              key={s.key}
              head={s.head}
              hint={s.hint}
              tone={s.tone}
              ink={s.ink}
              barTone={s.bar}
              rows={s.rows.map((r) => ({
                key: r.code,
                name: shortName(r.name),
                weight: r.netFlow,
                value: <Money krw={r.netFlow} at={e.asOf.slice(0, 7)} fx={fx} signed />,
              }))}
            />
          ))}
        </div>

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
 * 올랐나" 하나뿐이라 그것만 낸다.
 *
 * ## ⛔⛔ 그 주 자금을 옆 칸에 나란히 뒀었다. **뺐다**
 *
 * "인과로 엮지 않는다"고 주석에 적어 두고는, 정작 화면은 두 값을 **한 줄에 나란히**
 * 놓았다. 배치가 곧 주장이다 — 나란히 두면 읽는 사람은 잇는다.
 *
 * 실제로 그렇게 읽혔다. `ACE 미국우주테크액티브` 가 순유입 −12억에 등락 +17.0% 로
 * 찍히자 "돈이 빠졌는데 어떻게 올랐나" 라는 물음이 나왔다. 답은 **둘이 다른 것을
 * 재기 때문**이다.
 *
 *   종가  8,025 → 9,390원   (+17.0%)   ← 담고 있는 종목이 올랐다(NAV +17.5%)
 *   좌수  1,885 → 1,870만좌 (−0.8%)    ← 그 0.8% 가 −12억으로 찍힌다
 *   순자산 1,498 → 1,747억  (+249억)   ← 펀드는 오히려 커졌다
 *
 * ⭐ 한 문장으로 풀 수 있었지만 그 문장을 둘 자리가 없다(각주 띠는 짝과 어긋나고,
 * 칸 이름은 48px 다). **설명이 있어야 안 틀리는 배치라면 배치가 틀린 것이다.**
 * 이름을 '오간 돈' 에서 '주간 순유입' 으로 고쳐 봐도 오해의 결이 바뀔 뿐이었다.
 *
 * ⚠️ 자료(`SeohakEtf.week[].netFlow`)는 로더에 남겨 둔다. 되살린다면 등락 옆이 아니라
 * **제 카드**여야 한다.
 *
 * ⚠️ 분류(지수형·테마형)로 가르는 안도 재 봤는데 접었다. 이름으로 자를 수밖에 없는데
 * `KODEX 미국S&P500테크놀로지` 같은 섹터 상품이 지수형으로 딸려 들어온다. 채권 필터는
 * 실측으로 오분류가 0 이었지만 이쪽은 안 그렇다.
 *
 * 칸 꼴은 `Flows` 와 **완전히 같다** — 오른 쪽 빨강, 내린 쪽 파랑, `RankTable` 두 벌,
 * 네 칸. 보조 칸을 빼면서 이름 칸이 48px 넓어져 긴 종목명이 덜 잘린다.
 */
function WeekGrid({ e }: { e: SeohakEtf }) {
  const moved = e.week.filter((w) => Number.isFinite(w.changePct));
  const byChange = [...moved].sort((a, b) => b.changePct - a.changePct);
  const up = byChange.slice(0, 5);
  const down = byChange.slice(-5).reverse();
  const sides = [
    { key: "up", head: "오른 것", rows: up, tone: BUY, ink: BUY_INK, bar: "var(--c-warm-2)" },
    { key: "down", head: "내린 것", rows: down, tone: SELL, ink: SELL_INK, bar: "var(--c-blue-2)" },
  ];
  const chg = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

  return (
    <>
      <Verdict>
        가장 많이 오른 건{" "}
        <SignEm v={byChange[0]?.changePct ?? 0}>{chg(byChange[0]?.changePct ?? 0)}</SignEm>,{" "}
        가장 많이 내린 건{" "}
        <SignEm v={byChange[byChange.length - 1]?.changePct ?? 0}>
          {chg(byChange[byChange.length - 1]?.changePct ?? 0)}
        </SignEm>입니다
      </Verdict>

      {/* ⚠️ `marginTop:auto` 를 안 쓴다. 격자가 stretch 라 남는 폭이 통째로
          결론 문장과 그림 사이로 밀려 들어가 빈 띠가 된다. 위에 붙이고 남는 건
          카드 바닥으로 보낸다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: S.md, flex: 1, minHeight: 0 }}>
        <div style={{ display: "grid", gap: S.md, flex: 1, minHeight: 0,
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
          {sides.map((s) => (
            <RankTable
              key={s.key}
              head={s.head}
              hint="등락"
              tone={s.tone}
              ink={s.ink}
              barTone={s.bar}
              rows={s.rows.map((r) => ({
                key: r.code,
                name: shortName(r.name),
                weight: r.changePct,
                value: chg(r.changePct),
              }))}
            />
          ))}
        </div>
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
export function EtfSection({ e, fx }: { e: SeohakEtf; fx: Fx | null }) {
  return (
    // 두 카드의 자연 높이가 572 로 같아서 늘려도 구멍이 안 생긴다(`CARD_GRID` 머리말).
    <div style={CARD_GRID}>
      {/* ⚠️ 각주를 뗐다. 하던 말 둘 중 '거래대금이 아니다' 는 부제가 이미 하고, 채권형
          제외는 부제의 '미국 주식 ETF' 가 말한다. 같은 말을 두 자리에서 하고 있었다. */}
      <Card icon="input" title="ETF 자금 유입"
            /* ⚠️ 42자면 **두 줄로 접힌다.** 쓸 수 있는 폭이 303px 인데 351px 였다(1,280px
               실측). 옆 카드 부제는 한 줄이라 그 19px 차이가 그대로 아래로 밀려 두 표의
               머리가 서로 다른 높이에 앉았다(161 vs 143).
               ⭐ 길이를 **짝과 맞춰** 224px 로 잡는다(짝은 228px). 접히는 폭이 갈리면
               좁은 화면에서 한쪽만 두 줄이 되어 같은 어긋남이 되살아난다 — 249px 로
               두면 카드 463~488px 구간이 그 창이었다(뷰포트 1,226~1,276px). */
            desc="거래대금이 아니라 실제로 오간 미국 ETF 자금"
            note={`${md(e.asOf)} 기준`}
            /* 부제에서 밀려난 '채권형 제외' 가 여기로 온다. 짝도 같은 자리에 표본을
               밝히고 있어 두 카드가 같은 꼴이다. */
            noteHelp="상장좌수 변화 × 순자산가치로 재고, 채권형은 뺐습니다.">
        <Flows e={e} fx={fx} />
      </Card>

      {/* ## ⚠️ 각주 띠는 **둘 다 있거나 둘 다 없어야 한다**
          옆 카드의 각주를 떼자 이 카드만 39px 짜리 띠를 갖게 됐고, 두 카드를 같은
          높이로 늘리니 그 차이가 표로 갔다 — 줄 간격이 35 대 31, 둘째 표 머리가 20px
          어긋났다. 그래서 이 각주도 뗀다. 하던 말 둘은 각자 제자리를 찾아갔다.
            · "거래대금 1억 이상 N종목" → 알약 옆 물음표. 표본을 밝히는 문장이라
              없앨 수는 없지만, 늘 보일 필요는 없다.
            · "회색은 그동안 오간 돈" → 그 칸을 통째로 뺐으므로 설명할 것도 없어졌다
              (까닭은 `WeekGrid` 머리말). */}
      <Card icon="grid_view" title="주간 등락"
            desc="미국 ETF가 5영업일 동안 얼마나 오르내렸는지"
            note={`${md(e.weekFrom)} ~ ${md(e.asOf)}`}
            noteHelp={`거래대금 1억 이상 ${e.week.length}종목을 셉니다.`}>
        <WeekGrid e={e} />
      </Card>
    </div>
  );
}

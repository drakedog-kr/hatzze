import { type SeohakDaily } from "@/lib/seohak-daily";
import { SectionHead } from "../kadera/SectionHead";
import { BUY, SELL, signInk } from "./tone";
import { S, T } from "./scale";
import { type Fx, Money, rateOverMonths } from "./money";
import { C, MONO, R } from "../ui";

/**
 * 일별 층.
 *
 * ## 세 번째 판 — 규칙을 정하고 다시 짰다 (2026-08-16)
 *
 * 앞의 두 판이 "무슨 말인지 모르겠다"는 평을 받았다. 원인은 배치나 크기가 아니라
 * **무엇을 화면에 내놓았는가**였다.
 *
 *  ⛔ 지표를 정규화 배수(0.930 · 0.641 · 1.18)로 만들어 놓고 그 배수를 그대로 노출했다.
 *     그건 분석가의 언어다. 독자는 "0.930이 뭔데"에서 멈춘다.
 *  ⛔ 비교 대상이 화면에 없었다. 배수만 있고 '평소'가 안 보이니 크고 작음을 판단할 수 없다.
 *
 * 그래서 규칙 셋을 두고 전부 고쳤다.
 *
 *  ① **큰 숫자는 배수가 아니라 실제 값**이다. 배수는 그림의 눈금으로만 쓰고 안 보여준다.
 *  ② **결론은 문장으로** 쓴다. "평소보다 7% 적게 샀습니다" 처럼 읽으면 끝나야 한다.
 *  ③ 제목 아래 **설명 한 줄**을 둔다(브리핑의 desc 와 같은 자리). 각주는 출처·한계만.
 */

/* `usd()` 가 여기 있었다. 통화 스위치가 붙으면서 원화 짝과 한 자리에 있어야 해서
   `money.tsx` 로 옮겼다(달력도 제 사본을 갖고 있었다 — 이제 하나다). */
export const cnt = (v: number) => v.toLocaleString("ko-KR");
/* 배수를 "18% 더"·"26% 덜" 로 옮기던 `asPct` 가 여기 있었다. 타일이 배수를 그대로
   `88%` 로 내면서 부르는 곳이 0 이 됐다. 함께 배운 것은 아래 각주 줄에 남겨 뒀다. */

/**
 * 카드 껍데기.
 *
 * ## ⭐ 손으로 그리던 머리를 `SectionHead` 로 갈았다
 *
 * 이 페이지엔 시트 꼴이 **둘**이었다. 달력 쪽은 `SectionHead` 를 써서 머리에
 * `--c-title-band`(#eef3f9) 띠가 깔리는데, 이 `Card` 로 만든 카드들만 머리가 흰
 * 바탕이었다. 나란히 놓으면 같은 페이지의 카드들이 서로 다른 물건처럼 보인다.
 *
 * 머리를 손으로 그릴 이유가 애초에 없었다 — `SectionHead` 와 아이콘·제목·설명·기간
 * 알약이 전부 같고 값만 조금씩 어긋나 있었다(제목 13.5/800 → 14/700, 설명 sub2 → sub).
 *
 * 함께 달라진 것 둘.
 *   ① 안쪽 여백이 시트 전체(`--hz-card-pad`)가 아니라 **띠마다** 붙는다. 머리·각주는
 *      제 padding 을 갖고 본문만 여기서 준다 — 그래야 띠가 카드 폭을 꽉 채운다.
 *   ② 각주가 맨 `<p>` 에서 `.hz-sheet-foot` 띠로 바뀐다. 나란한 시트끼리 바닥 높이가
 *      같아진다(min-height 39px).
 *
 * ⚠️ `.hz-sheet-foot` 은 display:flex 다. 안에 맨 텍스트와 태그를 섞어 두면 좁은 폭에서
 * 낱글자로 눌린다 — 통째로 `<span>` 하나에 담는다.
 */
export function Card({
  icon,
  title,
  desc,
  note,
  noteHelp,
  foot,
  children,
}: {
  icon: string;
  /**
   * 제목 아래 한 줄.
   *
   * ⚠️ **명사구로 끝낸다.** 다른 화면(카더라·MDD)의 부제가 전부 그런데 이 페이지만
   * '~입니다' 로 문장을 쓰고 있었다.
   * ⚠️ **한 줄에 들어가야 한다.** 두 줄로 접히면 그만큼이 아래로 밀려 나란한 카드의
   * 표 머리가 서로 다른 높이에 앉는다. 쓸 수 있는 폭은 알약을 뺀 나머지다(1,280px
   * 에서 303px).
   */
  title: string;
  desc: string;
  note?: string;
  /**
   * 알약 옆 물음표에 담기는 한 문장.
   *
   * ⭐ 각주 띠와 다르다. 띠는 늘 자리를 차지해서 **한 카드에만 있으면 짝과 어긋나는데**,
   * 이건 찾을 때만 열린다. 표본을 밝히는 것처럼 늘 보일 필요는 없지만 없으면 안 되는
   * 문장에 쓴다.
   * ⚠️ 한 문장을 넘기면 툴팁이 아니다 — 열어 놓고 읽어야 하는 순간 각주로 돌아간 것이다.
   */
  noteHelp?: string;
  /** 없으면 바닥 띠를 아예 안 그린다. 적을 게 없는데 띠만 남으면 빈 칸이 된다. */
  foot?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hz-sheet" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <SectionHead level={3} icon={icon} title={title} desc={desc} note={note} noteHelp={noteHelp} />
      {/* flex:1 을 유지할 것. `Flows`·`WeekGrid` 가 `marginTop:auto` 로 목록을 카드 바닥에
          붙이는데, 이 칸이 안 늘어나면 그 auto 가 놀아서 두 카드의 목록 높이가 갈린다. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: S.md, minWidth: 0,
                    padding: "14px 22px" }}>
        {children}
      </div>
      {foot && (
        <div className="hz-sheet-foot" style={{ fontSize: T.body, color: C.sub }}>
          <span>{foot}</span>
        </div>
      )}
    </section>
  );
}

/** 결론 문장. 카드마다 같은 자리에서 같은 크기로 나온다. */
export function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: T.lead, lineHeight: 1.45, fontWeight: 700, color: C.ink,
                wordBreak: "keep-all" }}>
      {children}
    </p>
  );
}

/**
 * '여길 봐라' 파란 강조.
 *
 * ⚠️ `C.blue` 가 아니라 `C.blueInk` 다. 원색은 **면**(막대·칸)에 쓰는 값이라 흰 카드
 * 위 명암비가 **3.71** 로 4.5 에 못 미친다 — `ui.tsx` 가 "글자에 쓰지 말 것" 이라고
 * 적어 뒀는데 이 자리가 그걸 어기고 있었다. blueInk 는 5.23 이다.
 */
export const Em = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: C.blueInk }}>{children}</span>
);

/**
 * 부호 있는 값의 강조 — 파랑 대신 **방향 색**을 쓴다.
 *
 * ⚠️ `Em` 은 '여길 봐라' 라는 파란 강조고 그건 그대로 둔다. 다만 값에 부호가 붙으면
 * 얘기가 달라진다 — "가장 많이 오른 건 **+17.0%**, 가장 많이 내린 건 **−3.6%**" 가
 * 둘 다 파랑이라 **한 문장 안에서 오른 것과 내린 것이 같은 색**이었다. 게다가 한국
 * 독자에게 파란 플러스는 손해다.
 *
 * ⛔ 부호가 없는 값(7.3개월 · 100원 중 14원)에는 쓰지 말 것. 방향이 없는 곳에 방향
 * 색을 칠하면 없는 뜻이 생긴다.
 */
export const SignEm = ({ v, children }: { v: number; children: React.ReactNode }) => (
  <span style={{ color: signInk(v) }}>{children}</span>
);

/**
 * 요약 타일 한 줄 — 카드 바닥에 서는 작은 상자들.
 *
 * ## ⭐ 세 카드가 각자 만들던 걸 하나로 모았다
 *
 * '평소와의 차이'(셋) · '얼마나 오래 들고 있나'(둘) · '원화로 보면'(셋)이 거의 같은
 * 상자를 조금씩 다르게 그리고 있었다(글자 10/10.5/12 · 값 14/15/20 · 여백 7/10).
 *
 * ⭐ '평소와의 차이' 는 이걸 **세로로 쌓고** 있었다. 상자 셋이 160px 를 먹는데 담긴 건
 * 이름·보조·숫자뿐이라 "공간은 엄청 차지하는데 내용은 별로 없다"는 말을 들었다.
 * 가로로 눕히면 같은 내용이 64px 에 들어간다.
 *
 * ⛔ `v` 에 부호 있는 값이 오면 `ink` 에 `signInk(...)` 를 넘길 것. 다만 '평소의 88%'
 * 같은 비율에는 쓰지 않는다 — 이유는 `tone.ts` 의 `signInk` 머리말.
 */
export type Tile = {
  k: string;
  /** 이름 아래 한 줄. 단위나 분모처럼 값을 읽는 데 필요한 것만.
   *  ⚠️ 노드다 — 금액이 오면 `<Money>` 가 두 통화를 함께 그려야 한다. */
  n: React.ReactNode;
  v: React.ReactNode;
  /** 이름 앞 네모. 그림의 선과 이 타일을 잇는 자리에만 준다. */
  tone?: string;
  ink?: string;
  bg?: string;
};

export function Tiles({ items }: { items: Tile[] }) {
  return (
    <div style={{ display: "flex", gap: S.sm }}>
      {items.map((t) => (
        <div key={t.k} style={{ flex: 1, minWidth: 0, background: t.bg ?? C.soft,
                                borderRadius: R.control, padding: S.sm,
                                display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            {t.tone && (
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2,
                                         background: t.tone, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: T.small, fontWeight: 700, color: C.label, minWidth: 0,
                           overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.k}
            </span>
          </span>
          {/* ⚠️ `C.muted` 로는 **강조 타일에서만** 4.20 으로 떨어진다(빨강 틴트 위). 타일마다
              바탕이 다른데 글자색을 바탕에 따라 가르면 눈에 안 보이는 차이로 코드만 는다.
              어느 바탕에서도 4.5 를 넘는 값 하나로 둔다 — 흰 4.87 · 회색 5.26 · 틴트 4.87.
              (sub2 는 틴트 위 4.48 이라 아슬아슬하게 못 넘는다. 실측이 아니면 못 걸렀다.) */}
          {/* ⚠️ `nowrap` + 말줄임이었다. 좁은 화면에서 `1,288원 → 1,...` 로 **잘렸다.**
              접으면 타일이 두 줄이 되지만 세 칸이 함께 늘어나 높이는 안 어긋난다 —
              잘린 글자는 못 되찾고 두 줄은 읽을 수 있다. */}
          <span style={{ fontSize: T.small, color: C.sub, minWidth: 0, wordBreak: "keep-all" }}>
            {t.n}
          </span>
          <span style={{ fontFamily: MONO, fontSize: T.lead, fontWeight: 800,
                         color: t.ink ?? C.ink }}>{t.v}</span>
        </div>
      ))}
    </div>
  );
}

/** 그림의 좌표계. 두 그림이 같은 틀을 쓰므로 여기 한 곳에만 적는다. */
export const CHART = { w: 1000, h: 100 } as const;

/**
 * 그림틀 — 머리 한 줄 + 늘어나는 그림.
 *
 * ## ⚠️⚠️ SVG 안에 글자를 두면 안 된다
 *
 * '평소와의 차이' 의 축 라벨이 `fontSize={14}` 로 적혀 있었는데 **화면에는 6px 로
 * 그려지고 있었다.** viewBox 폭이 1000 인데 카드가 451px 라 안의 모든 것이 0.45배로
 * 줄기 때문이다. 그래서 라벨은 전부 이 머리 줄에 HTML 로 뺀다.
 *
 * ## ⭐ `flex:1` + `preserveAspectRatio="none"`
 *
 * 같은 행의 두 카드는 늘 세로가 같아야 하는데, 짝이 몇 줄로 접히느냐에 따라 높이가
 * 오르내린다. 그림이 그 폭을 먹으면 카드에 구멍이 안 생긴다. 대신 세로로 눌리고
 * 늘어나므로 안에 원을 그리면 타원이 되고, 선 굵기는 `non-scaling-stroke` 로 고정해야
 * 한다(`RefLine`·`Line` 이 이미 그렇게 돼 있다).
 *
 * ⛔ 세로 눈금이 폭마다 달라진다는 뜻이므로, 이 그림에 **각도로 읽는 말**("가파르게")을
 * 붙이면 안 된다. 읽는 것은 기준선과의 위아래뿐이다.
 */
export type ChartTip = { key: string; text: string };

export function Chart({ note, legend, aria, minHeight = 96, tips, children }: {
  note: string;
  legend: React.ReactNode;
  aria: string;
  /**
   * ⚠️⚠️ **바닥값을 넉넉히 줄 것.** `flex:1` 은 *남는* 폭만 먹으므로, 짝이 없어 늘어날
   * 일이 없는 폭(1열로 접힌 화면)에서는 그림이 이 값에 눌러앉는다. 62 로 뒀더니
   * 660px 폭 카드에서 그림이 70px 라 세로가 9배 눌린 띠가 됐다.
   */
  minHeight?: number;
  /**
   * 지점마다의 툴팁. **점 개수와 순서가 그림과 같아야 한다** — 띠를 균등하게 나누므로
   * 하나라도 어긋나면 엉뚱한 날짜가 뜬다.
   *
   * ⭐ 브리핑의 상승 속도·MDD 낙폭 차트와 같은 어법이다(`.hz-vline` 세로 기준선 +
   * `.hz-tip` 툴팁). 상태가 없어 서버 컴포넌트에서도 그대로 쓴다.
   */
  tips?: ChartTip[];
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.xs, flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: S.sm, fontSize: T.small, color: C.muted }}>
        <span style={{ flexShrink: 0 }}>{note}</span>
        {legend}
      </div>
      <div style={{ flex: 1, minHeight, position: "relative" }}>
        <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} preserveAspectRatio="none"
             style={{ width: "100%", height: "100%", display: "block" }}
             role="img" aria-label={aria}>
          {children}
        </svg>
        {/* 지점 띠. 그림 위를 균등하게 나눠 덮고, 마우스가 올라간 칸만 세로선과 툴팁을
            연다. ⚠️ 양 끝 넷은 여는 방향을 안쪽으로 튼다 — 안 그러면 폭 넓은 툴팁이
            카드 밖으로 나가 가로 스크롤을 만든다(브리핑에서 겪은 자리다). */}
        {tips && tips.length > 1 && (
          <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex" }}>
            {tips.map((t, i) => {
              const at = i / (tips.length - 1);
              const edge = at < 0.25 ? " hz-tip-start" : at > 0.75 ? " hz-tip-end" : "";
              return (
                <div key={t.key} className={`hz-tip hz-vline${edge}`} data-tip={t.text}
                     style={{ flex: 1, position: "relative" }} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 기준선 범례 — 점선 조각 + 이름. `Chart` 의 오른쪽 자리다.
 *
 * ⚠️ 점선 색이 `C.marker` 가 아니라 `C.sub2` 다. marker 는 '자' 라는 뜻에 맞지만
 * #c7d5e3 이라 환율 그림의 옅은 파란 채움 위에서 사라진다. 범례가 가리키는 선은
 * 반드시 보여야 하므로 읽히는 값으로 둔다.
 */
export function Baseline({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0,
                   overflow: "hidden", whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 12, height: 0, borderTop: `1.5px dashed ${C.sub2}`,
                                 flexShrink: 0 }} />
      <span style={{ color: C.sub, overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
    </span>
  );
}

/** 기준선. 가로 전폭. */
export function RefLine({ y }: { y: number }) {
  return (
    <line x1={0} x2={CHART.w} y1={y} y2={y} stroke={C.sub2} strokeWidth={1.5}
          strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
  );
}

/**
 * 카드 두 장을 나란히 놓는 격자. **세 층이 다 이걸 쓴다** — 손으로 적었을 때
 * 칸 사이가 14 · 16 · 14 로 갈려 있었다.
 *
 * ⚠️ 하한이 **380px** 이다. 300px 이던 시절에는 1,004px 폭에서 트랙이 셋 잡혀 카드가
 * 325px 로 쪼그라들고 오른쪽 한 칸이 빈 채로 남았다. 380 이면 3열에 1,168px 가 필요해
 * 2열로 떨어지고, 카드가 495px 씩 돼서 ETF 층과 폭이 같아진다.
 *
 * ## ⚠️⚠️ 같은 행의 카드는 **늘 세로가 같다**
 *
 * `alignItems` 를 주지 않는다(기본값 stretch). 이건 손으로 맞추는 값이 아니라 규칙이다 —
 * 카드를 빼고 넣을 때마다 짝을 다시 재는 건 지킬 수 없다.
 *
 * ⭐ 대신 **남는 폭이 어디로 가는지**를 못박아야 한다. 카드 안에서 `marginTop:auto` 를
 * 쓰면 남는 폭이 통째로 **결론 문장과 그림 사이**로 밀려 들어가 빈 띠가 된다("공백이
 * 너무 커보여"). 그래서 이 페이지의 카드는 내용을 위에 붙이고 남는 건 **바닥**으로
 * 보낸다 — 바닥 여백은 여백으로 읽히지만 가운데 여백은 고장으로 읽힌다.
 *
 * 실측(1,280px): 541=541 · 438=438 · 554=554.
 */
export const CARD_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))",
  gap: S.lg,
};

/* ── ① 평소와의 차이 (한 행 전체) ──────────────────────────────
   ⚠️⚠️ **네 번째 판이다.** 앞의 셋이 각각 이렇게 실패했다.

   1판 두 줄짜리 배수 선 — 두 번 평활돼 모양이 없었고, 기준(±60일)이 나중에 바뀌었다.
   2판 거울 막대 240개 — "눈 아프다".
   3판 옅은 띠 + 5일 평균선 — 차분해졌지만 **여전히 지저분했다.** 띠 2 + 선 2 + 점선 2 +
       라벨 2 + 축까지 아홉 덩어리였다. 게다가 옆 스파크라인은 기준점이 없어 뜻이 없었다.

   ⭐ 근본 원인은 **내가 데이터를 자랑하고 있었다**는 것이다. 이 카드가 하는 말은 하나다 —
   "요즘 사는 양은 평소의 88%, 파는 양은 63%".

   그래서 **'평소의 몇 %' 한 가지 언어로 통일한다.** 세로축도, 옆 숫자 셋도 같은 자다.
   그림에 남는 건 기준선 하나 + 선 둘 + 끝점 둘, 다섯뿐이다. 스파크라인은 지웠다 —
   횟수도 같은 언어의 숫자 하나로 말하면 그림이 필요 없다. */
function VsUsual({ d, fx }: { d: SeohakDaily; fx: Fx | null }) {
  const r = d.recentPct;
  const net = d.turnover.buy - d.turnover.sell;
  const vals = r.flatMap((p) => [p.buy, p.sell]);
  // 축은 늘 100(평소)을 품는다. 안 그러면 기준선이 밖으로 나가 '평소의 %'가 뜻을 잃는다.
  const lo = Math.min(100, ...vals) * 0.96;
  const hi = Math.max(100, ...vals) * 1.04;
  const x = (i: number) => (i / Math.max(1, r.length - 1)) * CHART.w;
  const y = (v: number) => CHART.h - ((v - lo) / (hi - lo)) * CHART.h;
  const path = (k: "buy" | "sell") =>
    r.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");

  /* ⛔ 값에 `signInk` 를 쓰지 않는다. 88% 는 부호가 아니라 평소 대비 비율이라 방향이
     둘로 갈린다 — 덜 파는 것이 나쁜 일인가? 사자·팔자 구분은 앞의 네모가 진다.
     ⚠️ '산 횟수' 에는 네모를 안 준다. 그림에 그 선이 없는데 네모를 달면 범례가 거짓이 된다. */
  /** 어제 하루치라 그달 환율이다. */
  const ym = d.asOf.slice(0, 7);
  const tiles = [
    { k: "사는 양", n: <>어제 <Money usd={d.today.buy} at={ym} fx={fx} /></>,
      v: `${Math.round(d.vsUsual.buy)}%`, tone: BUY },
    { k: "파는 양", n: <>어제 <Money usd={d.today.sell} at={ym} fx={fx} /></>,
      v: `${Math.round(d.vsUsual.sell)}%`, tone: SELL },
    /* ⚠️ '횟수 / N번' 이었다. 이 화면의 '번' 이 거래 건수와 **햇수**(`17번 중 17번`)
       둘을 겸하고 있어서 헷갈린다. 거래 쪽은 표준 단위인 `건` 으로 옮긴다. */
    { k: "산 건수", n: `어제 ${cnt(d.today.buyCount)}건`, v: `${Math.round(d.vsUsual.buyCount)}%` },
  ];
  const up = (v: number) => v >= 100;
  const verdict = up(d.vsUsual.buy) && up(d.vsUsual.sell) ? (
    <>요즘 <Em>사는 것도 파는 것도 평소보다 많습니다</Em></>
  ) : !up(d.vsUsual.buy) && !up(d.vsUsual.sell) ? (
    <>요즘 <Em>사는 것도 파는 것도 평소보다 적습니다</Em></>
  ) : up(d.vsUsual.buy) ? (
    <><Em>사는 쪽만</Em> 평소보다 많습니다</>
  ) : (
    <><Em>파는 쪽만</Em> 평소보다 많습니다</>
  );

  return (
    <>
      <Verdict>{verdict}</Verdict>

      {/* ⭐ 그림이 결론 바로 아래, 요약 타일이 그 아래. 이 페이지의 카드는 전부
          **결론 → 그림 → 보조** 순이다. 예전엔 그림과 타일이 좌우로 붙어 있었는데,
          카드가 495px 로 좁아지면서 어차피 위아래로 접혔다.
          ⭐ 각주 한 덩이를 여기서 없앴다. 세 문장짜리라 "읽어도 무슨 뜻인지 모르겠다"는
          말을 들었는데, 정작 꼭 필요한 '평소가 무엇인가' 는 기준선 범례가 그 선 옆에서
          한 마디로 말한다. 나머지 둘(5일 평균 · 결제 건수)은 값을 바꿔 읽게 하지 않는다. */}
      <Chart
        /* ⚠️ `replace("-", "년 ")` 만 하면 "2026년 02월" 이 된다. 앞자리 0 을 떼야 한다.
           ⭐ '5일 평균' 을 여기 적는다. 지운 각주에 있던 세 문장 중 이것만은 지점에
           마우스를 올리면 나오는 숫자의 뜻을 바꾼다 — 그날 하루가 아니라 닷새 평균이다. */
        note={`${r[0]?.date.slice(0, 4)}년 ${Number(r[0]?.date.slice(5, 7))}월 ~ 어제 · 5일 평균`}
        legend={<Baseline>평소(2년 중앙값) = 100%</Baseline>}
        aria="사는 양과 파는 양이 평소의 몇 %인지, 최근 반년"
        /* 이 카드의 주인공이라 다른 그림보다 바닥이 높다. 선이 둘이고 반년치라
           120 아래로 내려가면 두 선이 기준선 근처에서 엉겨 붙는다. */
        minHeight={120}
        tips={r.map((p) => ({
          key: p.date,
          text: `${p.date} · 사는 양 ${Math.round(p.buy)}% · 파는 양 ${Math.round(p.sell)}%`,
        }))}
      >
        <RefLine y={y(100)} />
        {(["sell", "buy"] as const).map((k) => (
          <path key={k} d={path(k)} fill="none" stroke={k === "buy" ? BUY : SELL}
                strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" />
        ))}
      </Chart>

      <Tiles items={tiles} />

      {/* ⭐ 카드 둘을 접으면서 **거기서 쓸모 있던 한 줄씩만** 데려왔다.
          - '얼마나 사고팔았나'(막대 셋)는 통째로 뺐다. 1년 총매수·총매도 막대는 이 카드가
            이미 '평소의 몇 %'로 말하는 것과 같은 이야기를 크기만 바꿔 되풀이했다.
            남길 값어치가 있던 건 마지막 줄, **그래서 얼마가 남았나** 하나뿐이다.
          - '사자와 팔자의 결'(막대 넷)도 뺐다. 알맹이는 "파는 쪽이 더 뜸하고 더 크다"
            한 문장인데, 그걸 말하려고 막대를 넷 그리고 있었다.

          ⚠️ 셋의 **창이 다르다**(그림 6개월 · 결 20일 · 순매수 250거래일). 한 카드에
          모으면 같은 창으로 읽히므로 문장마다 기간을 직접 적는다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: S.xs, paddingTop: S.md,
                    borderTop: `1px solid ${C.line}` }}>
        <span style={{ fontSize: T.body, lineHeight: 1.5, color: C.sub, wordBreak: "keep-all" }}>
          최근 {cnt(d.turnover.days)}거래일 동안{" "}
          {net >= 0 ? "산 것이 판 것보다" : "판 것이 산 것보다"}{" "}
          {/* ⚠️ 창이 250거래일이라 한 달로 못 집는다. 그 기간 **월평균의 평균**으로
              옮긴다 — 1년이면 환율이 ±5% 안팎이라 이 근사가 값의 뜻을 안 바꾼다. */}
          <b style={{ fontFamily: MONO, color: signInk(net) }}>
            <Money usd={Math.abs(net)} rate={fx ? rateOverMonths(fx, 12) : undefined} fx={fx} />
          </b> 많았습니다
        </span>
        {/* ⚠️ 이 줄을 "횟수가 25% 덜, 한 번에 13% 더 움직였습니다" 로 쓰면 말이 엉킨다.
            '덜·더' 어법은 **평소 대비** 배수용이지 사자와 팔자 두 쪽을 견주는 자리엔
            안 맞는다. 여기서는 '적고·큽니다' 로 쓴다.
            ⛔ 여기 숫자에는 부호색을 쓰지 않는다. 오르내림이 아니라 사자와 팔자를 견준
            값이라, 25% 가 빨강이면 "많이 사서 좋다"로 읽힌다. */}
        <span style={{ fontSize: T.body, lineHeight: 1.5, color: C.sub, wordBreak: "keep-all" }}>
          최근 20일, 파는 쪽은 사는 쪽보다{" "}
          <b style={{ color: C.ink }}>
            건수가 {Math.abs(Math.round((d.countRatio - 1) * 100))}%{" "}
            {d.countRatio < 1 ? "적고" : "많고"}, 한 건이{" "}
            {Math.abs(Math.round((d.sizeRatio - 1) * 100))}%{" "}
            {d.sizeRatio > 1 ? "큽니다" : "작습니다"}
          </b>
        </span>
      </div>
    </>
  );
}

/**
 * '어떻게 사고파나' — 이제 카드 **하나**다.
 *
 * ⭐ 셋이었다. '사자와 팔자의 결'과 '얼마나 사고팔았나'를 접고, 거기서 쓸모 있던 한
 * 줄씩만 이 카드 바닥으로 옮겼다. 셋 다 결국 같은 것을 세 번 그리고 있었다 — 사는 양과
 * 파는 양. 창만 6개월·20일·1년으로 달랐다.
 *
 * ⚠️ 카드가 하나뿐이라 격자가 필요 없다. 예전엔 `CARD_GRID` 에 셋을 담고 첫 카드만
 * 늘리려 애썼는데(span 이 열 수에 따라 어긋났다) 그 문제도 같이 사라진다.
 */
export function DailySection({ d, fx }: { d: SeohakDaily; fx: Fx | null }) {
  return (
    <Card icon="show_chart" title="평소와의 차이"
          /* ⚠️ "평소의 몇 %인지 · 반년치" 였다. 그건 **어떻게 재는지**이고, 그 답은
             그림의 기준선 범례가 이미 한다("평소(2년 중앙값) = 100%"). 부제는
             무엇을 알 수 있는지를 말한다. */
          desc="요즘 사고파는 양이 평소와 얼마나 다른지"
          note="최근 6개월">
      <VsUsual d={d} fx={fx} />
    </Card>
  );
}

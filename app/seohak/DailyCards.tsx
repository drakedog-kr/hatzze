import {
  CALENDAR_WINDOWS,
  REACTIONS,
  SIZE_RATIO_TYPICAL,
  type SeohakDaily,
} from "@/lib/seohak-daily";
import { C, Icon, MONO, R } from "../ui";

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

const usd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString("ko-KR")}`;
};
const cnt = (v: number) => v.toLocaleString("ko-KR");
/** 배수를 사람 말로. 1.184 → "18% 더". 0.739 → "26% 덜". */
const asPct = (mult: number) => {
  const d = Math.round(Math.abs(mult - 1) * 100);
  if (d === 0) return "평소와 같이";
  return `${d}% ${mult > 1 ? "더" : "덜"}`;
};

function Card({
  icon,
  title,
  desc,
  note,
  foot,
  children,
}: {
  icon: string;
  title: string;
  /** 제목 아래 한 줄. 이 카드가 무엇을 재는지 여기서 끝내야 한다. */
  desc: string;
  note?: string;
  foot: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hz-sheet" style={{ padding: "var(--hz-card-pad)", display: "flex",
                                           flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icon name={icon} style={{ fontSize: 18, color: C.muted, marginTop: 1, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: C.ink,
                       lineHeight: 1.3, letterSpacing: "-.01em", wordBreak: "keep-all" }}>{title}</h3>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{desc}</p>
        </div>
        {note && (
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.sub,
                         background: C.chip, borderRadius: R.pill, padding: "3px 8px" }}>{note}</span>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>{children}</div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: C.sub2, wordBreak: "keep-all" }}>{foot}</p>
    </section>
  );
}

/** 결론 문장. 카드마다 같은 자리에서 같은 크기로 나온다. */
function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, fontWeight: 700, color: C.ink, wordBreak: "keep-all" }}>
      {children}
    </p>
  );
}

const Em = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: C.blue }}>{children}</span>
);

/* ── ① 어제 얼마나 사고팔았나 ────────────────────────────────────────────
   배수를 다 걷어내고 실제 금액·건수만 남겼다. 두 막대는 같은 자로 그려 길이 차이가
   곧 "얼마나 더 샀나"가 되게 한다. */
function TodayTrade({ d }: { d: SeohakDaily }) {
  const net = d.today.buy - d.today.sell;
  const max = Math.max(d.today.buy, d.today.sell) || 1;
  const row = (label: string, amt: number, count: number, fill: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.label }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.ink }}>{usd(amt)}</span>
      </div>
      <span style={{ height: 14, background: C.track, borderRadius: 3, overflow: "hidden", display: "block" }}>
        <span style={{ display: "block", width: `${(amt / max) * 100}%`, height: "100%", background: fill }} />
      </span>
      <span style={{ fontSize: 11, color: C.sub2 }}>{cnt(count)}번</span>
    </div>
  );
  return (
    <>
      <Verdict>
        어제는 <Em>{usd(Math.abs(net))}</Em>어치를 더 {net >= 0 ? "샀습니다" : "팔았습니다"}
      </Verdict>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {row("산 금액", d.today.buy, d.today.buyCount, C.blue)}
        {row("판 금액", d.today.sell, d.today.sellCount, C.marker)}
      </div>
      <div style={{ marginTop: "auto", fontSize: 12, color: C.sub }}>
        한 번 살 때 평균{" "}
        <b style={{ fontFamily: MONO, color: C.ink }}>${Math.round(d.perTrade).toLocaleString("ko-KR")}</b>
      </div>
    </>
  );
}

/* ── ② 사자와 팔자 ─────────────────────────────────────────────────────
   산점도를 버렸다. 축 둘과 자취 40점을 250px 칸에서 읽히게 만들 방법이 없었고,
   카드가 할 말은 "어느 쪽이 움직였나" 하나였다. **평소를 0으로 둔 좌우 막대 둘**이면
   같은 말을 설명 없이 한다. */
function BuySellShift({ d }: { d: SeohakDaily }) {
  const rows = [
    { k: "사는 양", v: d.regime.buy, fill: C.blue },
    { k: "파는 양", v: d.regime.sell, fill: C.marker },
  ];
  const span = Math.max(0.2, ...rows.map((r) => Math.abs(r.v - 1))) * 1.2;
  const up = (v: number) => v >= 1;
  // 네 조합을 문장으로. 사분면 이름("둘 다 줄었다")을 그대로 쓰면 그게 무슨 뜻인지
  // 또 설명해야 하므로, 뜻을 바로 적는다.
  const verdict = up(d.regime.buy) && up(d.regime.sell) ? (
    <>평소보다 <Em>사는 것도 파는 것도 늘었습니다</Em></>
  ) : !up(d.regime.buy) && !up(d.regime.sell) ? (
    <>평소보다 <Em>사는 것도 파는 것도 줄었습니다</Em></>
  ) : up(d.regime.buy) ? (
    <><Em>사는 쪽만</Em> 평소보다 늘었습니다</>
  ) : (
    <><Em>파는 쪽만</Em> 평소보다 늘었습니다</>
  );
  return (
    <>
      <Verdict>{verdict}</Verdict>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: "auto" }}>
        {rows.map((r) => {
          const w = (Math.abs(r.v - 1) / span) * 50;
          const right = r.v >= 1;
          return (
            <div key={r.k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.label }}>{r.k}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: right ? C.ink : C.blue }}>
                  {asPct(r.v)}
                </span>
              </div>
              <span style={{ position: "relative", height: 14, background: C.soft, borderRadius: 3 }}>
                <span style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 1.5, background: C.marker }} />
                <span style={{ position: "absolute", top: 3, height: 8, borderRadius: 2,
                               left: right ? "50%" : `${50 - w}%`, width: `${Math.max(1, w)}%`, background: r.fill }} />
              </span>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint }}>
          <span>덜 한다</span>
          <span>평소</span>
          <span>더 한다</span>
        </div>
      </div>
    </>
  );
}

/* ── ③ 달력 ───────────────────────────────────────────────────────────
   막대·띠·목록을 차례로 버리고 **진짜 달력 격자**로 왔다. 이 데이터가 말하는 건
   "1년 중 어느 주에 무슨 일이 벌어지나"인데, 그건 달력의 생김새 그대로다 — 막대로
   그리면 독자가 머릿속에서 다시 달력으로 옮겨 놓아야 한다.

   가로 12칸이 월, 세로 5칸이 그달의 몇째 주다. 칸 하나가 한 주다. */
function CalendarCard({ asOf }: { asOf: string }) {
  /**
   * 색은 **한 가지**만 쓴다. 처음엔 '사는 주 / 파는 주'로 두 색을 썼는데, 달력이 답할
   * 질문은 "언제"지 "무엇을"이 아니다. 방향까지 색에 실으면 칸 하나가 두 가지를
   * 말하려다 둘 다 못 말한다 — 방향은 아래 목록의 문장이 맡는다.
   *
   * '미국 실적 시즌'은 뺐다. 1·4·7·10월 후반 12주라 격자의 4분의 1을 물들이는데
   * 실측 차이가 0.4%다. 아무 일도 없는 구간이 가장 넓게 칠해지면 그림이 거짓말을 한다.
   */
  const HIGHLIGHT = new Set(["newyear", "blackfriday", "xmas", "yearend"]);
  const shown = CALENDAR_WINDOWS.filter((w) => HIGHLIGHT.has(w.key));
  const meta = (k: string) => CALENDAR_WINDOWS.find((w) => w.key === k)!;

  // 주차는 1일부터 7일씩 끊는다. 요일 기준 주가 아니라 '그달 몇째 주'라 해마다 자리가 안 흔들린다.
  const wk = (d: number) => Math.min(5, Math.ceil(d / 7));
  const marks = new Map<string, string>();
  const put = (m: number, from: number, to: number, key: string) => {
    for (let w = wk(from); w <= wk(to); w++) marks.set(`${m}-${w}`, key);
  };
  put(1, 1, 8, "newyear");
  put(11, 24, 30, "blackfriday");
  put(12, 20, 24, "xmas");
  put(12, 26, 31, "yearend");

  const [, tm, td] = asOf.split("-").map(Number);
  const todayKey = `${tm}-${wk(td)}`;
  const hereKey = marks.get(todayKey);

  /** 매수·매도 중 더 크게 움직인 쪽을 문장으로. 한쪽만 보이면 큰 쪽을 놓친다. */
  const phrase = (w: (typeof CALENDAR_WINDOWS)[number]) => {
    const useBuy = Math.abs(w.buy - 1) >= Math.abs(w.sell - 1);
    const v = useBuy ? w.buy : w.sell;
    const pct = Math.round(Math.abs(v - 1) * 100);
    return `${pct}% ${v > 1 ? "더" : "덜"} ${useBuy ? "삽니다" : "팝니다"}`;
  };

  return (
    <>
      <Verdict>
        {hereKey ? (
          <>이번 주는 <Em>{meta(hereKey).label}</Em>입니다</>
        ) : (
          <>이번 주는 <Em>평범한 주</Em>입니다</>
        )}
      </Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3 }}>
          {[1, 2, 3, 4, 5].map((w) =>
            Array.from({ length: 12 }, (_, k) => k + 1).map((m) => {
              const key = marks.get(`${m}-${w}`);
              const isToday = todayKey === `${m}-${w}`;
              return (
                <span
                  key={`${m}-${w}`}
                  title={key ? `${m}월 ${w}째 주 · ${meta(key).label}` : `${m}월 ${w}째 주`}
                  style={{
                    height: 14,
                    borderRadius: 2,
                    background: key ? C.blue : C.track,
                    // 오늘 주는 색이 아니라 **테두리**로 표시한다. 색으로 하면 구간 색과
                    // 섞여 "오늘이 특별한 구간"으로 잘못 읽힌다.
                    boxShadow: isToday ? `0 0 0 2px ${C.ink}` : undefined,
                  }}
                />
              );
            }),
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3,
                      fontSize: 8.5, color: C.faint, textAlign: "center", letterSpacing: "-0.02em" }}>
          {Array.from({ length: 12 }, (_, k) => k + 1).map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>

        <ul style={{ listStyle: "none", margin: "3px 0 0", padding: 0, display: "flex",
                     flexDirection: "column", gap: 5 }}>
          {shown.map((m) => (
            <li key={m.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: C.blue }} />
              <span style={{ color: hereKey === m.key ? C.ink : C.sub,
                             fontWeight: hereKey === m.key ? 800 : 500, minWidth: 0,
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.label}
              </span>
              <span style={{ marginLeft: "auto", flexShrink: 0, color: C.sub2, fontWeight: 700 }}>
                {phrase(m)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ── ④ 무엇에 반응하나 ─────────────────────────────────────────────────
   달력 카드와 짝이다. 저쪽이 "언제 달라지나"라면 이쪽은 "무엇에 달라지나"인데,
   답이 **아무것에도**라서 그리기가 까다로웠다.

   막대 다섯 개를 나란히 놓으면 "짧다"만 보이지 "없다"가 안 보인다. 그래서 다섯 줄에
   걸쳐 **'차이 없음' 구역**을 하나의 세로 띠로 깔았다. 넷이 그 안에서 끝나고 하나만
   띠 밖으로 나가는 그림이라, 짧은 막대가 '작은 반응'이 아니라 '무반응'으로 읽힌다. */
function Reactions() {
  const yearend = CALENDAR_WINDOWS.find((w) => w.key === "yearend")!;
  const rows = [
    ...REACTIONS.map((r) => {
      const c: number[] = [];
      if (r.buy !== null) c.push(r.buy);
      if (r.sell !== null) c.push(r.sell);
      // 매수·매도 중 더 크게 움직인 쪽을 쓴다. 순매수로 뭉치면 둘이 서로 상쇄한다.
      const dev = c.length ? c.reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a)) : 1;
      return { label: r.label, diff: Math.round(Math.abs(dev - 1) * 100), strong: false };
    }),
    { label: "연말 마지막 주", diff: Math.round(Math.abs(yearend.sell - 1) * 100), strong: true },
  ];
  /** 축 오른쪽 끝(%). 가장 큰 값보다 넉넉히 잡아 막대가 벽에 닿지 않게 한다. */
  const AXIS = 20;
  /** 이 밖으로 나가야 '달라졌다'고 본다. 20영업일 창의 날짜별 흔들림이 이 폭이다. */
  const NOISE = 5;

  return (
    <>
      <Verdict>
        사건보다 <Em>날짜에 더 반응</Em>합니다
      </Verdict>

      <div style={{ marginTop: "auto", position: "relative", display: "flex",
                    flexDirection: "column", gap: 9, paddingTop: 4 }}>
        {/* 다섯 줄을 관통하는 '차이 없음' 구역. 막대보다 뒤에 깔린다. */}
        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 16,
                                   width: `${(NOISE / AXIS) * 100}%`, background: C.soft,
                                   borderRight: `1px dashed ${C.line}`, borderRadius: "3px 0 0 3px" }} />
        {rows.map((r) => (
          <div key={r.label} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5 }}>
              <span style={{ fontWeight: r.strong ? 800 : 600, color: r.strong ? C.ink : C.label,
                             minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </span>
              <span style={{ flexShrink: 0, fontWeight: 700, color: r.strong ? C.blue : C.sub2 }}>
                {r.diff <= NOISE ? "그대로" : `${r.diff}% 달라짐`}
              </span>
            </span>
            <span style={{ height: 7, borderRadius: 4, background: "transparent" }}>
              <span style={{ display: "block", height: "100%", borderRadius: 4,
                             width: `${Math.max(2, Math.min(100, (r.diff / AXIS) * 100))}%`,
                             background: r.strong ? C.blue : C.bar }} />
            </span>
          </div>
        ))}
        <span style={{ fontSize: 9.5, color: C.faint, marginTop: -2 }}>
          회색 구역 안({NOISE}% 이내)은 평소 흔들림과 구별되지 않습니다
        </span>
      </div>
    </>
  );
}

/* ── ⑤ 사람 수와 덩어리 ─────────────────────────────────────────────────
   두 숫자를 나란히 놓기만 했더니 "그래서 뭐"가 됐다. 사실 이 둘은 나란한 게 아니라
   **곱하면 판 돈÷산 돈이 되는 분해**다.

       판 돈 ÷ 산 돈 = (파는 횟수 ÷ 사는 횟수) × (한 번 팔 때 ÷ 한 번 살 때)

   항등식이라 눈금을 맞출 필요도 없다(같은 20일 창의 합계로 계산한다). 그래서 "파는
   쪽이 적다"가 **횟수가 적어서인지 덩어리가 작아서인지**를 그림이 바로 답한다. */
function CountVsSize({ d }: { d: SeohakDaily }) {
  const countPct = Math.round(d.countRatio * 100);
  const sizePct = Math.round(d.sizeRatio * 100);
  const totalPct = Math.round(d.sellBuy * 100);
  const typicalPct = Math.round(SIZE_RATIO_TYPICAL * 100);

  // 어느 쪽이 더 크게 벌어졌나. 결론 문장을 여기서 고른다.
  const countDev = Math.abs(d.countRatio - 1);
  const sizeDev = Math.abs(d.sizeRatio - 1);
  const verdict =
    countDev >= sizeDev ? (
      d.countRatio < 1 ? (
        <>파는 쪽은 <Em>횟수가 적을 뿐</Em>입니다</>
      ) : (
        <>파는 <Em>횟수가 더 많습니다</Em></>
      )
    ) : d.sizeRatio > 1 ? (
      <><Em>적은 사람이 크게</Em> 팝니다</>
    ) : (
      <>파는 쪽이 <Em>더 잘게 나눠</Em> 팝니다</>
    );

  const Factor = ({ label, value, note, accent }: {
    label: string; value: number; note: string; accent?: boolean;
  }) => (
    <div style={{ background: C.soft, borderRadius: R.control, padding: "9px 10px",
                  display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 10.5, color: C.sub2, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800,
                     color: accent ? C.blue : C.ink, letterSpacing: "-0.02em" }}>
        {value}%
      </span>
      <span style={{ fontSize: 10, color: C.faint }}>{note}</span>
    </div>
  );

  return (
    <>
      <Verdict>{verdict}</Verdict>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
                      gap: 8, paddingBottom: 8, borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>판 돈은 산 돈의</span>
          <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.ink,
                         letterSpacing: "-0.02em" }}>{totalPct}%</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 7, alignItems: "center" }}>
          <Factor label="파는 횟수" value={countPct} note="사는 횟수 대비"
                  accent={countDev >= sizeDev} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.faint }}>×</span>
          <Factor label="한 번의 크기" value={sizePct} note={`평소 ${typicalPct}%`}
                  accent={sizeDev > countDev} />
        </div>
      </div>
    </>
  );
}

/* ── ⑥ 오간 돈과 남은 돈 ──────────────────────────────────────────────── */
function Turnover({ d }: { d: SeohakDaily }) {
  const netPct = d.turnover.gross ? (Math.abs(d.turnover.net) / d.turnover.gross) * 100 : 0;
  return (
    <>
      <Verdict>
        1년간 <Em>{usd(d.turnover.gross)}</Em>이 오갔는데
        <br />
        실제로 늘어난 건 <Em>{usd(d.turnover.net)}</Em>입니다
      </Verdict>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 30, background: C.bar, borderRadius: 5, overflow: "hidden", position: "relative" }}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0,
                         width: `${Math.max(2, netPct)}%`, background: C.blue }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.sub }}>
          <span>
            늘어난 몫 <b style={{ color: C.ink }}>{netPct.toFixed(1)}%</b>
          </span>
          <span style={{ color: C.sub2 }}>나머지는 사고판 것이 서로 상쇄</span>
        </div>
      </div>
    </>
  );
}

export function DailySection({ d }: { d: SeohakDaily }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 }}>
      <Card icon="candlestick_chart" title="어제 얼마나 사고팔았나"
            desc="예탁결제원에 결제된 미국 주식 매매입니다."
            note={`${d.asOf} 결제`}
            foot="결제일 기준이라 거래일보다 하루 늦습니다.">
        <TodayTrade d={d} />
      </Card>

      <Card icon="swap_vert" title="평소보다 많이 했나, 적게 했나"
            desc="사는 양과 파는 양을 각각 평소와 견줍니다."
            note="최근 20일"
            foot="'평소'는 앞뒤 반년의 중앙값입니다.">
        <BuySellShift d={d} />
      </Card>

      <Card icon="calendar_month" title="해마다 되풀이되는 날들"
            desc="매년 같은 시기에 매매가 달라지는 구간입니다."
            note="2015~2026"
            foot="실적 시즌·여름·네 마녀의 날은 평소와 달라지지 않아 뺐습니다.">
        <CalendarCard asOf={d.asOf} />
      </Card>

      <Card icon="troubleshoot" title="무엇에 반응하나"
            desc="이런 일이 있던 다음 날, 매매가 얼마나 달라졌는지입니다."
            note="실측"
            foot="맨 아래 연말은 견주기용입니다. 어떤 사건도 그만큼 못 흔듭니다.">
        <Reactions />
      </Card>

      <Card icon="groups" title="사는 사람과 파는 사람"
            desc="판 돈이 산 돈보다 적은 까닭을 둘로 쪼갭니다."
            note="최근 20일"
            foot="두 값을 곱하면 위의 비율이 됩니다. 결제 건수라 사람 수가 아니라 거래 횟수입니다.">
        <CountVsSize d={d} />
      </Card>

      <Card icon="sync" title="오간 돈과 남은 돈"
            desc="사고판 금액을 다 더한 것과, 그 차이입니다."
            note="최근 1년"
            foot="같은 돈이 사고팔리며 여러 번 오갑니다.">
        <Turnover d={d} />
      </Card>
    </div>
  );
}

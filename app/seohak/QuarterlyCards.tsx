import type { SeohakOverview } from "@/lib/seohak-data";
import type { SeohakQuarterly } from "@/lib/seohak-quarterly";
import { C, MONO } from "../ui";
import { Card, Em, Verdict } from "./DailyCards";

/**
 * 분기 층 — 기관과 나머지.
 *
 * 이 층만 카드 둘이다. 하나는 **얼마나**(몫), 하나는 **얼마나 잘했나**(수익률)를 묻는다.
 *
 * ## 두 카드가 같은 각주를 쓴다
 *
 * 여기 '기관'은 SEC 에 13F 를 내는 한국 소재 **9곳**뿐이다. 보험사·중소 운용사·직접
 * 투자하는 법인은 안 잡히므로 기관 몫은 **하한**이고, 나머지는 '개인'이 아니라
 * '그 9곳이 아닌 전부'다. 각주에서 매번 밝힌다 — 이걸 흐리면 카드가 거짓말이 된다.
 */

/**
 * $B 표기. **$10B 아래는 소수 한 자리**로 낸다.
 *
 * ⚠️ 정수로만 두면 신고자 목록의 작은 줄이 `$0B` 가 된다("그 밖 3곳 $0B"). 값이 0.1 인데
 * 0 으로 적으면 "왜 이 줄이 있나"가 남는다.
 */
const usdB = (v: number) =>
  `$${(v / 1e9).toLocaleString("ko-KR", { maximumFractionDigits: Math.abs(v) < 1e10 ? 1 : 0 })}B`;
/**
 * ⚠️⚠️ **이 파일에는 단위가 둘이다.** 13F(`seohak_institution_13f.value_usd`)는 원 달러라
 * `usdB` 를 그대로 쓰고, TIC 에서 온 값(`SeohakOverview.channel`)은 **백만 달러**다.
 * 섞으면 $106.7B 가 $0.0B 로 찍힌다(실제로 그렇게 났다).
 */
const usdBmn = (mn: number) => usdB(mn * 1e6);

/**
 * 이 층의 두 색. **기관은 잉크, 나머지는 파랑**이다.
 *
 * ⚠️ 기관이 `C.marker`(#c7d5e3)였다. 곡선으로 그리면 **이긴 쪽이 가장 안 보이는 색**이
 * 되어(누적 +25.1% 로 위에 있는 선인데 배경에 묻혔다) 그림이 서툴러 보였다. 잉크로
 * 바꾸면 파랑과 명암·색상이 둘 다 갈려서 두 선이 나란히 읽힌다 — 종류별 구성이 쓰는
 * `blue ↔ inkSoft` 와 같은 어법이다.
 *
 * ⛔ BUY/SELL 빨강·파랑을 안 쓴다. 이 페이지에서 그 짝은 사자·팔자 뜻이라, 기관과
 * 개인을 그 색으로 가르면 한 화면에서 색이 두 말을 한다.
 */
const INST = C.inkSoft;
const REST = C.blue;

/** 원금·잔고 두 줄에 쓰는 가로 막대. 같은 자로 두 번 재는 게 이 카드의 요점이다. */
function SplitBar({ label, share, left, right }: {
  label: string;
  /** 개인 채널 몫(%). */
  share: number;
  left: string;
  right: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5 }}>
        <span style={{ color: C.sub2, fontWeight: 700 }}>{label}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, color: C.sub2 }}>{left}</span>
        <b style={{ fontFamily: MONO, fontSize: 14, color: C.ink, minWidth: 40, textAlign: "right" }}>
          {share.toFixed(0)}%
        </b>
      </div>
      <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden" }}>
        <span style={{ width: `${share}%`, background: REST }} />
        <span style={{ flex: 1, background: INST }} />
      </div>
      <span style={{ fontSize: 10.5, color: C.faint, textAlign: "right" }}>{right}</span>
    </div>
  );
}

/* ── ⑧ 개인과 기관 ────────────────────────────────────────────────
   ## ⛔ 앞 판은 **분자와 분모의 모집단이 달랐다**

   13F 9곳($219B)을 TIC 전수($681B)로 나눠 "기관 32% · 나머지 68%"라 적고 결론 문장을
   "68%는 기관 밖입니다"로 냈다. 13F 는 미국에 신고 의무가 있는 대형 9곳뿐이라 그 비율은
   기관 몫이 아니라 **13F 포착률**이다. 그 '나머지 $462B' 안에 13F 에 안 잡히는 기관이
   $293B 있었다 — 즉 나머지의 63%가 또 기관이었다.

   실측하면 개인 채널은 잔고의 **약 25%** 다. 화면의 68%는 세 배 가까이 틀렸고, 그걸
   32:68 막대로 칠해 그림으로까지 굳혀 놓고 있었다.

   ## 지금 판

   예탁원 결제(국내 증권사 경유)로 가른다. 자세한 근거·한계는 `SeohakOverview.channel`
   머리말에 있다. 13F 는 '기관 전부'가 아니라 **그 안에서 이름을 아는 곳**으로 자리를
   내려 신고자 목록으로만 남긴다.

   ⚠️ **두 자료의 기준일이 다르다.** 채널은 TIC 월 단위(2026-05), 신고자 목록은 13F
   분기(2026-03)다. 각 블록이 제 날짜를 달고 있어야 한다. */
function WhoOwns({ q, ch }: { q: SeohakQuarterly; ch: NonNullable<SeohakOverview["channel"]> }) {
  // 1% 아래는 한 줄로 접는다. 2026-03 기준 세 곳을 합쳐 0.1% 라, 각자 한 줄씩 주면
  // 막대가 안 보이는 줄만 셋이 된다.
  const big = q.filers.filter((f) => f.share >= 1);
  const small = q.filers.filter((f) => f.share < 1);
  const smallUsd = small.reduce((s, f) => s + f.usd, 0);
  const topShare = big[0]?.share ?? 0;

  return (
    <>
      <Verdict>
        넣은 돈의 <Em>{ch.principalShare.toFixed(0)}%</Em>, 지금 잔고의{" "}
        <Em>{ch.valueShare.toFixed(0)}%</Em>가 국내 증권사를 거친 돈입니다
      </Verdict>

      {/* ⭐ 카드가 전폭(1,004px)이라 안을 두 칸으로 나눈다. 한 칸으로 두면 신고자 줄의
          이름 칸이 700px 가 되어 "국민연금" 네 글자 뒤로 빈 벌판이 생긴다.
          하한 380px 은 왼쪽 칸 기준이다 — 막대 위 줄에 라벨·금액·%가 한 줄로 서려면
          그만큼 필요하다. 좁아지면 스스로 한 칸으로 접힌다. */}
      <div style={{ marginTop: "auto", display: "grid", gap: 18, alignItems: "start",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}>
        {/* 두 줄을 세로로 겹쳐 둔다. 파란 칸이 줄어드는 것 자체가 "개인 돈이 늦게
            들어와 덜 굴렀다"는 말이라, 나란히 놓여야 그 줄어듦이 보인다. */}
        <SplitBar label="넣은 돈" share={ch.principalShare}
                  left={usdBmn(ch.principal)} right={`전체 ${usdBmn(ch.principal / (ch.principalShare / 100))}`} />
        <SplitBar label="지금 잔고" share={ch.valueShare}
                  left={usdBmn(ch.value)} right={`전체 ${usdBmn(ch.value / (ch.valueShare / 100))}`} />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: REST, flexShrink: 0 }} />
            <span style={{ color: C.sub }}>국내 증권사를 거친 돈</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: INST, flexShrink: 0 }} />
            <span style={{ color: C.sub }}>수탁은행을 직접 쓰는 기관</span>
          </span>
        </div>

      </div>

        {/* 신고자 목록. 막대는 1위 대비라 1위가 칸을 꽉 채운다 — 전체 대비로 두면
            국민연금이 60% 라 나머지 넷이 전부 손톱만 해진다. */}
        {big.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, color: C.sub2, fontWeight: 600 }}>
              그 기관 중 이름을 아는 곳 · {q.asOf.slice(0, 7)} 기준 {usdB(q.institutionUsd)}
            </span>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                         flexDirection: "column" }}>
              {big.map((f, i) => (
                <li key={f.name}
                    title={`${f.name} · ${f.holdings.toLocaleString("ko-KR")}종목`}
                    style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 54px 34px",
                             alignItems: "center", gap: 8, padding: "5px 0",
                             borderBottom: i < big.length - 1 || small.length
                               ? `1px solid ${C.sheetRow}` : undefined }}>
                  <span style={{ fontSize: 11.5, color: C.sub, minWidth: 0, overflow: "hidden",
                                 textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span className="hz-bar">
                    <span style={{ width: `${Math.max(4, (f.share / topShare) * 100)}%`,
                                   background: INST }} />
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.ink, fontWeight: 700,
                                 textAlign: "right" }}>{usdB(f.usd)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint,
                                 textAlign: "right" }}>{f.share.toFixed(0)}%</span>
                </li>
              ))}
              {small.length > 0 && (
                <li style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 54px 34px",
                             alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <span style={{ fontSize: 11.5, color: C.faint }}>그 밖 {small.length}곳</span>
                  <span />
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.sub2,
                                 textAlign: "right" }}>{usdB(smallUsd)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint,
                                 textAlign: "right" }}>0%</span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

export function QuarterlyCards({ q, ch }: {
  q: SeohakQuarterly;
  ch: SeohakOverview["channel"];
}) {
  // ⭐ 카드가 하나뿐이라 격자를 안 쓴다. `CARD_GRID` 는 auto-fit 이라 혼자 남으면
  // 어차피 한 칸을 다 쓰는데, 격자를 통과시키면 그 사실이 코드에서 안 보인다.
  return (
    <>
      {ch && (
        <Card icon="account_balance" title="개인과 기관"
              desc="미국 주식에 든 한국 돈을 국내 증권사를 거친 것과 아닌 것으로 가릅니다."
              note={`${ch.from}년부터`}
              foot="예탁원 결제는 국내 증권사를 거친 것만 잡습니다. 수탁은행을 직접 쓰는 대형 기관은 안 들어오지만 국내 증권사를 쓰는 법인·중소 기관은 들어오므로, 파란 몫은 개인의 상한입니다. 잔고는 유입을 시장 수익으로 굴린 값이라 추정입니다. 눈금을 나스닥으로 바꿔도 1.5%p 안에서 움직입니다.">
          <WhoOwns q={q} ch={ch} />
        </Card>
      )}
    </>
  );
}

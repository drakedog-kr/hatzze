import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getManagerDetail } from "@/lib/insider-detail";

import { SectionHead } from "../../../kadera/SectionHead";
import { pageMetadata } from "../../../seo";
import { C, Icon, MONO } from "../../../ui";
import { ExpandableList } from "../../../kadera/ExpandableList";
import {
  Empty,
  GroupTitle,
  Money,
  T,
  WIDE_COLS,
  WideHead,
  quarterLabel,
  wideManagerExitedRows,
  wideManagerHoldingRows,
} from "../../parts";

/**
 * 거물 한 명의 상세 — 무엇을 들고 있고, 이번 분기에 무엇을 바꿨나.
 *
 * ## ⭐ FolioObs 와 갈리는 자리
 *
 * 저쪽은 섹터 배분 파이와 분기별 AUM 추이를 낸다. 우리는 섹터 원천이 없고 분기도 둘뿐
 * 이라 파이도 추이 곡선도 못 그린다 — **안 그린다.** 대신 둘로 낼 수 있는 것 하나만
 * 낸다: 히어로의 **직전 분기 대비 신고 합계 증감**이다(구간이 하나라 곡선이 아니라 값
 * 하나다). ⚠️ 그걸 "수익률"이라 부르지 않는다 — 아래 AUM 절 참고.
 *
 * ⚠️ 카더라 표시는 **줄마다 붙이지 않는다.** 알약을 종목마다 달았더니 보유 표가 알약
 *    밭이 됐다(버핏은 29종목 중 대부분이 카더라에 오른다). 대신 히어로에 "카더라에
 *    오른 것 N종목" 한 줄로 센다 — 같은 말을 한 번만 한다.
 *
 * ## ⭐ 줄의 생김새는 **종목 상세의 거물 표와 같다**
 *
 * 두 화면이 같은 자료(13F)를 사람 쪽·종목 쪽에서 보는 것이라, 줄이 갈리면 독자가 다른
 * 표로 읽는다. `WIDE_COLS.managerHoldings` 가 `stockHolders` 와 같은 값인 것도 그래서다.
 *
 * ## ⚠️⚠️ 히어로가 "운용자산"이라 적는다 — 물음표가 그 값을 치른다
 *
 * 13F 는 미국 상장주 롱 포지션만 신고한다. 채권·현금·공매도·해외주식은 안 들어가고,
 * 실측으로 버핏이 $299.3B 로 나오는데 버크셔의 실제 운용자산은 그보다 훨씬 크다.
 * 그래서 오래 **"신고한 미국 상장주 합계"** 라고 적었는데, 그 말이 히어로에서 읽히지
 * 않았다 — 숫자의 이름 자리에 열일곱 자짜리 설명이 앉아 있으니 아무도 안 읽는다.
 *
 * 08-23 에 이름은 "운용자산"으로 줄이고, **빠진 것을 물음표 툴팁이 말하게** 바꿨다.
 * ⛔ 그 툴팁을 지우거나 "미국 상장주만"이라는 대목을 빼면 화면이 그 자리에서 거짓말이
 *    된다. 이름을 짧게 쓰는 대가로 단서를 옮겨 둔 것이지, 없앤 것이 아니다.
 *
 * ## ⚠️⚠️ 분기 대비 증감은 **수익률이 아니다**
 *
 * 히어로가 "▼11.7%" 를 내지만, 13F 로는 그 안에 섞인 셋(주가 변동 · 새로 사고판 것 ·
 * 자금 유출입)을 못 가른다. 애크먼의 합계가 155.3억 → 137.1억 달러로 줄었는데 그게
 * 손실인지 환매인지 정리인지 13F 만으로는 알 수 없다. 그래서 라벨을 "신고한 미국
 * 상장주 합계"로 두고, 툴팁이 "수익률이 아닙니다"를 한 번 더 말한다.
 *
 * ⚠️ **단위를 의심할 것.** 13F 의 value 는 달러인 곳과 천 달러인 곳이 섞이고, 같은
 *    운용사가 분기마다 단위를 바꾸기도 한다(클라먼·드러켄밀러 실측). 보정은 수집기
 *    (`fetch_us_13f.py`)가 신고서 단위로 하며, 한쪽 분기만 보정되던 시절에는 이 증감이
 *    **+161,142%** 였다. 이 숫자가 터무니없으면 화면이 아니라 거기를 볼 것.
 */
export const dynamic = "force-dynamic";

/**
 * 처음 펴는 줄 수 · '더 보기' 증가분 · 실어 보내는 상한.
 *
 * ⚠️ 처음부터 다 펴면 화면이 자료에 파묻힌다(소로스가 258종목). 다섯 줄로 열고
 *    눌러서 늘린다. 안 보이는 줄도 전송되므로 상한이 따로 필요하다.
 */
const ROWS_OPEN = 5;
const ROWS_STEP = 10;
const ROWS_MAX = 60;

/** 시트의 줄 목록 + 바닥의 '더 보기'. 두 시트가 같은 꼴을 쓴다. */
function Rows({ items, name }: { items: React.ReactNode[]; name: string }) {
  return (
    <ExpandableList
      items={items}
      name={name}
      initial={ROWS_OPEN}
      step={ROWS_STEP}
      listStyle={{ padding: 0, display: "block" }}
      footerClassName="hz-sheet-foot-row"
      footerStyle={{ marginTop: "auto" }}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ cik: string }> }): Promise<Metadata> {
  const { cik } = await params;
  const d = await getManagerDetail(Number(cik));
  if (!d) return pageMetadata({ title: "내부자 리포트 | hatzze", description: "", path: "/insider" });
  return pageMetadata({
    title: `${d.person} 포트폴리오 · ${d.firm} 13F | hatzze`,
    description: `${d.person}(${d.firm})이 신고한 미국 상장주 ${d.holdings.length}종목. SEC 13F 공시 기준이며 직전 분기와 견준 변화를 함께 봅니다.`,
    path: `/insider/investor/${d.cik}`,
  });
}

export default async function InvestorDetailPage({ params }: { params: Promise<{ cik: string }> }) {
  const { cik } = await params;
  const n = Number(cik);
  if (!Number.isFinite(n)) notFound();
  const d = await getManagerDetail(n);
  if (!d) notFound();

  const counts = {
    new: d.holdings.filter((h) => h.move === "new").length,
    add: d.holdings.filter((h) => h.move === "add").length,
    trim: d.holdings.filter((h) => h.move === "trim").length,
    exit: d.exited.length,
  };
  const kaderaCount = d.holdings.filter((h) => h.inKadera).length;
  /**
   * 직전 분기 대비 신고 합계 증감(%). ⚠️ 수익률이 아니다 — 머리말의 AUM 절을 볼 것.
   *
   * ⚠️ 직전 분기가 없거나 그때 합계가 0 이면 **아예 안 낸다.** 0% 로 채우면
   *    "그대로였다"는 없는 사실이 된다.
   */
  const aumChange = d.priorDate && d.priorAum > 0 ? (d.aum / d.priorAum - 1) * 100 : null;
  /**
   * 집중도 막대의 칸 — 상위 다섯 종목 + 나머지.
   *
   * ⚠️ 비중은 이미 100% 를 분모로 하는 값이라 **여기서는 다시 눈금을 바꾸지 않는다.**
   *    목록 표의 막대와 반대다(거기는 서로 견주는 자, 여기는 전체 중 몫).
   * ⚠️ 보유가 다섯 이하면 "나머지" 칸은 만들지 않는다 — 0% 짜리 빈 칸이 남는다.
   */
  const head = d.holdings.slice(0, 5);
  const top5 = head.reduce((s, h) => s + h.weight, 0);
  const conc = head.length
    ? [
        ...head.map((h) => ({ key: h.ticker, weight: h.weight, rest: false })),
        ...(d.holdings.length > head.length
          ? [{ key: `나머지 ${d.holdings.length - head.length}종목`, weight: Math.max(0, 100 - top5), rest: true }]
          : []),
      ]
    : [];

  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고,
    // 원화는 크기를 가늠하라고 얹은 것이다. 쿠키로 한 번이라도 고르면 그 선택이 이긴다
    // (규칙은 globals.css 의 `[data-cur-default]`).
    <div data-cur-default="usd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Link
        href="/insider"
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          fontWeight: 700,
          color: C.sub,
          textDecoration: "none",
        }}
      >
        <Icon name="chevron_left" style={{ fontSize: 16 }} />
        내부자 리포트
      </Link>

      <section className="hz-sheet">
        <div className="hz-kd-hero">
          <div className="hz-kd-hero-q">
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <strong style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>{d.person}</strong>
              <span style={{ fontSize: T.body, color: C.sub }}>{d.firm}</span>
            </div>
            {/* ⭐ **라벨 → 값 → 끝.** 예전엔 값 아래에 회색 두 줄("신고한 미국 상장주 합계 ·
                2026 Q1" 과 "직전 2025 Q4 $15.5B")이 겹쳐 있었다. 굵기도 색도 같은 두 줄이라
                어느 쪽이 이 숫자의 이름인지 안 보였다. 이름은 위로 올리고, 단서는 물음표
                안으로 넣는다 — 히어로에 남는 글자는 이름·값·분기 셋뿐이다. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: T.small, fontWeight: 700, color: C.sub }}
              >
                운용자산 · {quarterLabel(d.reportDate)}
                {/* ⚠️⚠️ **"운용자산"은 엄밀히는 과장이다.** 13F 는 미국 상장주 롱만 신고해서
                    버핏이 $299.3B 로 나오는데 버크셔의 실제 운용자산은 그보다 훨씬 크다.
                    그래도 2026-08-23 에 이 말을 쓰기로 한 것은, 앞의 "신고한 미국 상장주
                    합계"가 히어로에서 읽히지 않아서다. **대신 물음표가 그 차이를 반드시
                    말해야 한다** — 이 툴팁을 지우면 화면이 거짓말이 된다. */}
                <span
                  className="hz-tip hz-tip-wide"
                  data-tip="미국 상장주만 셉니다. 채권·현금·해외 주식은 빠집니다."
                  style={{ display: "inline-flex", cursor: "help" }}
                >
                  <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                  <Money usd={d.aum} rate={d.usdKrw} />
                </strong>
                {aumChange != null && (
                  <span
                    className="hz-tip hz-tip-wide"
                    data-tip="직전 분기 대비입니다. 주가와 매매가 섞여 수익률은 아닙니다."
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      cursor: "help",
                      color:
                        aumChange > 0 ? "var(--c-hot-ink)" : aumChange < 0 ? "var(--c-cold-ink)" : C.sub2,
                    }}
                  >
                    {aumChange > 0 ? "▲" : aumChange < 0 ? "▼" : ""}
                    {Math.abs(aumChange).toFixed(1)}%
                  </span>
                )}
              </span>
              {/* ⭐ 견준 상대는 **각주 자리**다. 예전엔 이 줄이 라벨 줄과 같은 굵기·같은
                  색으로 나란히 서서 어느 쪽이 숫자의 이름인지 안 보였다. 라벨을 위로
                  올린 지금은 아래 한 줄만 남아 역할이 겹치지 않는다.
                  ⚠️ 분기 이름을 다시 적지 않는다 — 위 라벨이 이미 이번 분기를 말했고,
                  늦게 내는 곳도 "직전"은 자기 앞 신고를 가리켜 늘 맞는다. */}
              {aumChange != null && (
                <span style={{ fontSize: T.small, color: C.muted, marginTop: 1 }}>
                  직전 분기 <Money usd={d.priorAum} rate={d.usdKrw} />
                </span>
              )}
            </div>
          </div>

          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>
                이번 분기에 한 것
              </span>
            </div>
            {d.priorDate ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "새로 담음", n: counts.new },
                  { label: "늘림", n: counts.add },
                  { label: "줄임", n: counts.trim },
                  { label: "전량 정리", n: counts.exit },
                ].map((s) => (
                  <div key={s.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>{s.label}</span>
                    <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: s.n ? C.ink : C.muted }}>
                      {s.n}
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub2, marginLeft: 2 }}>종목</span>
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: T.body, color: C.sub, lineHeight: 1.7 }}>
                견줄 직전 분기가 아직 없습니다.
              </p>
            )}
          </div>

          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>한눈에</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
                {[
                  { n: `${d.holdings.length}`, unit: "종목", label: "보유" },
                  { n: `${top5.toFixed(0)}%`, unit: "", label: "상위 5종목 몫" },
                  { n: `${kaderaCount}`, unit: "종목", label: "카더라에 오른 것" },
                ].map((s) => (
                  <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                      <strong style={{ fontFamily: MONO, fontSize: 21, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                        {s.n}
                      </strong>
                      {s.unit && <span style={{ fontSize: T.small, fontWeight: 700, color: C.sub2 }}>{s.unit}</span>}
                    </span>
                    <span style={{ fontSize: T.small, color: C.sub, fontWeight: 600 }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* ⭐ 이 자리는 종목 상세에서 **언급 추이 막대**가 서는 칸이다(히어로의 절반 폭).
                  거기가 그림이면 여기도 그림이어야 화면 둘이 한 벌로 읽힌다.

                  ⭐ 그린 것은 **집중도**다. 표를 다섯 줄 훑어서는 안 보이고, 이 사람이 어떤
                  운용을 하는지 한눈에 말한다 — 히말라야는 8종목에 다 걸고 국민연금은 541종목에
                  펴 놓는다. 위의 "보유 N종목"과 짝이 되는 그림이다. */}
              {conc.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden", background: "var(--c-track)" }}>
                    {conc.map((c, i) => (
                      <span
                        key={c.key}
                        title={`${c.key} ${c.weight.toFixed(1)}%`}
                        style={{
                          width: `${c.weight}%`,
                          // 다섯 칸이 같은 파랑이면 경계가 안 보인다. 순서대로 옅어지게 두고
                          // 나머지는 트랙 색으로 남긴다 — 남은 자리가 곧 "펴 놓은 몫"이다.
                          background: c.rest ? "transparent" : `color-mix(in srgb, var(--c-blue) ${100 - i * 15}%, var(--c-card))`,
                        }}
                      />
                    ))}
                  </span>
                  <span style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: T.small, color: C.sub2, fontWeight: 600 }}>
                    {conc
                      .filter((c) => !c.rest)
                      .map((c) => (
                        <span key={c.key} style={{ whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: MONO, color: C.ink }}>{c.key}</span> {c.weight.toFixed(1)}%
                        </span>
                      ))}
                  </span>
                </div>
              )}

              {/* ⭐ 네 문장이었다가 한 문장으로 줄였다. 나머지 셋이 다른 데서 이미 나온다 —
                  "미국 상장주만 · 채권·현금·해외는 빠짐"은 왼쪽 칸 운용자산의 물음표가,
                  "무엇과 견줬나"는 그 아래 `직전 분기 $15.5B` 한 줄이 말한다. 같은 말을
                  두 번 하면 둘 다 안 읽힌다.
                  ⚠️ 남긴 문장은 **다른 화면과 글자까지 같아야 한다**(app/insider/lists.ts 의
                     `help` · 메인의 거물 카드 · 종목 상세의 거물 표가 같은 문장이다).
                     여기만 새로 지으면 같은 사실이 화면마다 다른 말로 나간다.
                  ⚠️⚠️ 예전엔 **"최대 넉 달까지 낡을 수 있습니다"** 였다. 최악만 적어서
                     자료가 실제보다 훨씬 뒤떨어진 것처럼 읽혔다 — 실측(2026-08-23)으로
                     63곳 중 62곳이 54일이고 넉 달을 넘긴 건 한 곳(늦게 내는 퍼싱)뿐이다.
                     ⛔ 그렇다고 "45일" 같은 **작은 숫자로 바꾸지 말 것.** 그건 신고 마감
                     규칙이지 화면에 뜬 자료의 나이가 아니다(퍼싱은 145일이다). 숫자를 빼고
                     "지금과 다를 수 있다"만 남기면 어느 쪽으로도 안 틀린다 — 크기는 옆에
                     붙은 분기 이름이 말한다. */}
              <p style={{ margin: 0, fontSize: T.small, color: C.sub2, lineHeight: 1.6, wordBreak: "keep-all" }}>
                13F는 분기말 기준이라 지금과 다를 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <GroupTitle>이 사람의 포트폴리오</GroupTitle>

      <section className="hz-sheet">
        <SectionHead
          icon="donut_large"
          title="보유 종목"
          note={`${d.holdings.length}종목 · ${quarterLabel(d.reportDate)}`}
          noteHelp="비중은 운용자산에서의 몫, 증감은 주식 수 기준입니다."
          desc="비중이 큰 순입니다. 종목을 누르면 그 종목의 공시로 갑니다."
        />
        {d.holdings.length === 0 ? (
          <Empty>신고된 보유가 없습니다.</Empty>
        ) : (
          <>
            <WideHead cols={WIDE_COLS.managerHoldings} labels={["종목", "주식 수", "포트폴리오 비중", "금액"]} />
            <Rows name="investor_holdings" items={wideManagerHoldingRows(d.holdings.slice(0, ROWS_MAX), d.usdKrw)} />
          </>
        )}
        {d.holdings.length > ROWS_MAX && (
          <div className="hz-sheet-foot">
            <span style={{ fontSize: T.small, color: C.sub2, lineHeight: 1.5 }}>
              비중이 큰 {ROWS_MAX}종목까지 그렸습니다. 전체는 {d.holdings.length}종목입니다.
            </span>
          </div>
        )}
      </section>

      {d.exited.length > 0 && (
        <section className="hz-sheet">
          <SectionHead
            icon="remove_circle_outline"
            title="이번 분기에 전량 정리한 종목"
            note={`${d.exited.length}종목`}
            noteHelp={`${quarterLabel(d.priorDate)}에 있었는데 ${quarterLabel(d.reportDate)} 신고에서 빠진 종목입니다.`}
            desc={`${quarterLabel(d.priorDate)} 기준 금액이 큰 순입니다.`}
          />
          <WideHead cols={WIDE_COLS.managerExited} labels={["종목", "정리 전 포트폴리오 비중", "정리 전 금액"]} />
          <Rows name="investor_exited" items={wideManagerExitedRows(d.exited.slice(0, ROWS_MAX), d.usdKrw)} />
        </section>
      )}

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는
          2026-08-23 에 뺐다. **전역 푸터(app/Footer.tsx)가 이미 같은 고지를 한다** —
          "투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과 책임은 이용자 본인에게
          있습니다." 그 푸터는 AppShell 이 모든 화면에 붙이므로 이 화면에도 뜬다.
          ⚠️ 다시 넣지 말 것. 넣더라도 **푸터가 그 고지를 잃은 뒤에만** 넣는다. */}
    </div>
  );
}

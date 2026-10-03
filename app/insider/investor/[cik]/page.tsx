import type { Metadata } from "next";
import { assertLoaded } from "@/lib/load-state";
import { notFound } from "next/navigation";

import { getManagerDetail } from "@/lib/insider-detail";
import { isCik } from "@/lib/insider-13f";

import { CoverMeta, Module } from "../../../kadera/V2Modules";
import { CurrencyToggle } from "../../../AppShell";
import { PageJsonLd } from "../../../JsonLd";
import { INSIDER_CARD } from "../../../og-copy";
import { pageMetadata } from "../../../seo";
import { Icon } from "../../../ui";
import { LoadFailedNote } from "../../../LoadFailedNote";
import { Money, moveKind, quarterLabel } from "../../parts";
import { DetailList, exitedLines, holdingLines } from "../../V2DetailRows";
import { BackTrail } from "@/components/back-trail";

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
 * 표로 읽는다. 둘 다 V2DetailRows 의 한 줄 네 칸(종목 · 거물 | 분기 움직임 | 비중 | 금액)을 쓰는 것도 그래서다.
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
// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx). 예전엔 여기가
// force-dynamic 이라 방문마다 서버가 새로 그렸다.
//
// 동적 구간([...])은 generateStaticParams 가 없으면 캐시 없이 요청마다 그린다(Next 문서:
// "빈 배열을 돌려줘야 런타임에 ISR 이 된다"). 빈 배열 = 빌드 때는 아무것도 안 만들고,
// 처음 방문한 주소를 그때 그려 사본에 담는다. 없는 주소의 notFound() 도 그대로 동작한다.
export async function generateStaticParams() {
  return [];
}

/**
 * 실어 보내는 줄 수 상한. 처음 펴는 줄 수와 '더 보기' 증가분은 V2DetailRows(DetailList)가 정한다.
 * ⚠️ 처음부터 다 펴면 화면이 자료에 파묻힌다(소로스가 258종목). 안 보이는 줄도 전송되므로 상한이 따로 필요하다.
 */
const ROWS_MAX = 60;

/** 이동 경로의 부모. 화면 맨 위 줄(BackTrail)과 구조화 데이터가 **같은 문자열**을 쓴다(JsonLd 머리말). */
const PARENT = { name: "내부자 리포트", path: "/insider" };

export async function generateMetadata({ params }: { params: Promise<{ cik: string }> }): Promise<Metadata> {
  const { cik } = await params;
  const d = await getManagerDetail(Number(cik));
  // ⛔ 없는 투자자에 canonical 을 주지 않는다. 예전엔 `/insider` 를 가리켜 "이 404 주소는 내부자 리포트와
  //    같은 화면"이라고 말했다(국장 종목 화면이 먼저 고친 실수 · app/stock/[code]/page.tsx). 색인하지 말라고만 한다.
  //    그냥 빼면 루트의 canonical `/` 를 물려받아 null 로 지운다(app/insider/stock/[ticker]/detail.tsx STOCK_NOT_FOUND_META).
  if (!d) return { title: "투자자를 찾을 수 없습니다 | hatzze", robots: { index: false, follow: false }, alternates: { canonical: null } };
  return pageMetadata({
    title: `${d.person} 포트폴리오 · ${d.firm} 13F | hatzze`,
    description: `${d.person}(${d.firm})이 신고한 미국 상장주 ${d.holdings.length}종목. SEC 13F 공시 기준이며 직전 분기와 견준 변화를 함께 봅니다.`,
    path: `/insider/investor/${d.cik}`,
    // 자기 폴더에 카드가 없어 구역(/insider)의 카드를 쓴다(app/seo.ts 의 imagePath).
    ownImage: INSIDER_CARD.alt,
    imagePath: "/insider",
  });
}

export default async function InvestorDetailPage({ params }: { params: Promise<{ cik: string }> }) {
  const { cik } = await params;
  const n = Number(cik);
  if (!isCik(n)) notFound();
  const d = await getManagerDetail(n);
  // notFound() 앞에서 던진다 — 조회가 죽어 null 이 온 것을 "없는 투자자"로 읽어 404 를
  // 사본에 담지 않도록(app/stock/[code]/page.tsx 와 같은 이유).
  assertLoaded("/insider/investor/[cik]");
  if (!d) notFound();

  // 이번 분기에 한 것 — 갈래마다 종목(비중 큰 순). 줄 글자와 같은 잣대(parts.tsx moveKind)라 표의 '유지' 줄은 늘림 · 줄임에 안 든다.
  const byKind = (k: "new" | "add" | "trim") => d.holdings.filter((h) => moveKind(h.move, h.sharesChange) === k).map((h) => h.ticker);
  const moves = [
    { label: "새로 담음", list: byKind("new") },
    { label: "늘림", list: byKind("add") },
    { label: "줄임", list: byKind("trim") },
    { label: "전량 정리", list: d.exited.map((e) => e.ticker) },
  ];
  const kaderaCount = d.holdings.filter((h) => h.inKadera).length;
  /**
   * 직전 분기 대비 신고 합계 증감(%). ⚠️ 수익률이 아니다 — 머리말의 AUM 절을 볼 것.
   *
   * ⚠️ 직전 분기가 없거나 그때 합계가 0 이면 **아예 안 낸다.** 0% 로 채우면
   *    "그대로였다"는 없는 사실이 된다.
   */
  const aumChange = d.priorDate && d.priorAum > 0 ? (d.aum / d.priorAum - 1) * 100 : null;
  // 상위 다섯 종목의 몫 — 첫 줄 띠의 '상위 5종목 %'. 이 사람이 몇 종목에 몰아 거는지 한 숫자로 말한다.
  const top5 = d.holdings.slice(0, 5).reduce((s, h) => s + h.weight, 0);

  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고,
    // 원화는 크기를 가늠하라고 얹은 것이다. 쿠키로 한 번이라도 고르면 그 선택이 이긴다
    // (규칙은 globals.css 의 `[data-cur-default]`).
    <div className="hz-tx v2-kd v2-in" data-cur-default="usd">
      <LoadFailedNote sources={d.failedSources} />
      {/* 셸은 이 화면의 이름을 몰라 구조화 데이터를 안 낸다(AppShell PageHeader 의 named). 여기서 낸다. */}
      <PageJsonLd
        title={d.person}
        description={`${d.firm} ${d.person}의 SEC 13F 신고 보유 종목과 직전 분기 대비 변화입니다.`}
        path={`/insider/investor/${d.cik}`}
        trail={[PARENT]}
      />
      <BackTrail parent={{ name: PARENT.name, href: PARENT.path }} current={d.person} />

      {/* ── 첫 줄 띠 · 둘째 줄(v2, 2026-10-03) ─────────────────────────────
          옛 히어로 세 칸(이름 · 운용자산 / 이번 분기에 한 것 / 한눈에)을 v2 꼴로 — 이름 · 운용자산 · 보유 규모 · 통화는 첫 줄 띠로,
          이번 분기에 한 것 · 집중도는 둘째 줄 짝으로. 히어로 바닥의 "13F는 분기말 기준이라 지금과 다를 수 있습니다"는 띠의 업데이트
          자리('2026 Q2 13F · 분기말 기준')가 말한다(설명 문장은 걷는다).
          ⚠️ 운용자산의 물음표('미국 상장주만 집계')는 지우지 말 것 — 버크셔의 실제 운용자산은 이보다 훨씬 크다. 이 툴팁이 없으면 화면이 거짓말이 된다. */}
      <div className="v2-cover">
        <div className="v2-cover-cell v2-sk-id">
          <h1>{d.person}</h1>
          <span className="v2-cover-k">{d.firm}</span>
        </div>
        <div className="v2-cover-cell">
          <span className="v2-cover-k">
            운용자산
            <span className="hz-tip hz-tip-wide v2-in-help" data-tip="미국 상장주만 집계" aria-label="미국 상장주만 집계" tabIndex={0}>
              <Icon name="help" />
            </span>
          </span>
          <span className="v2-cover-v">
            <b>
              <Money usd={d.aum} rate={d.usdKrw} />
            </b>
            {aumChange != null && (
              <span className={`v2-cover-chg hz-tip${aumChange > 0 ? " is-up" : aumChange < 0 ? " is-down" : ""}`} data-tip="직전 분기 대비">
                {aumChange > 0 ? "+" : aumChange < 0 ? "-" : ""}
                {Math.abs(aumChange).toFixed(1)}%
              </span>
            )}
          </span>
        </div>
        <div className="v2-cover-cell v2-cover-idx">
          <span className="v2-cover-k">보유</span>
          <span className="v2-cover-v">
            <b>{d.holdings.length}종목</b>
          </span>
          <span className="v2-cover-v">
            <em>상위 5종목</em>
            <b>{top5.toFixed(0)}%</b>
          </span>
          <span className="v2-cover-v">
            <em>카더라에 오른 것</em>
            <b>{kaderaCount}종목</b>
          </span>
        </div>
        {d.usdKrw != null && (
          <div className="v2-cover-cell v2-in-cur">
            <span className="v2-cover-k">통화</span>
            <CurrencyToggle fallback="usd" />
          </div>
        )}
        <CoverMeta updated={`${quarterLabel(d.reportDate)} 13F · 분기말 기준`} />
      </div>

      {/* 둘째 줄 — [보유 종목 | 이번 분기에 한 것 · 전량 정리한 종목](v2, 2026-10-04).
          ⭐ 보유 종목이 이 화면의 본문이라 넓은 칸을 준다. 옆 칸은 그 표를 읽는 실마리(무엇이 바뀌었나 · 무엇을 다 팔았나).
          ⛔ '상위 종목 몫'(집중도 막대) 모듈은 걷었다 — 다섯 칸이 보유 종목 표 위 다섯 줄과 같은 숫자였고, 집중도 자체는 첫 줄 띠의
             '상위 5종목 %'가 말한다(한 화면에 같은 숫자 세 번). 옛 시트 둘(보유 · 전량 정리)도 모듈로 옮겼다. */}
      <div className="v2-tm-band is-hot v2-isd-inv">
        <Module
          title="보유 종목"
          meta={`${d.holdings.length > ROWS_MAX ? `비중 상위 ${ROWS_MAX} / ` : ""}${d.holdings.length}종목 · 비중 순`}
          className="v2-isd-mod"
        >
          {d.holdings.length === 0 ? (
            <p className="v2-empty">신고된 보유가 없습니다.</p>
          ) : (
            <DetailList name="investor_holdings" cols="holding" open={10} items={holdingLines(d.holdings.slice(0, ROWS_MAX), d.usdKrw)} />
          )}
        </Module>
        <div className="v2-tm-side">
          <Module title="이번 분기에 한 것" meta={d.priorDate ? `직전 분기 대비` : undefined} className="v2-isd-facts-mod">
            {d.priorDate ? (
              <dl className="v2-isd-facts">
                {moves.map((s) => (
                  <div key={s.label}>
                    {/* 갈래 이름 아래 종목 — 표를 다 훑지 않아도 무엇을 바꿨는지 보인다(넷까지 · 나머지는 수로). */}
                    <dt>
                      {s.label}
                      {s.list.length > 0 && <em>{s.list.slice(0, 4).join(" · ") + (s.list.length > 4 ? ` 외 ${s.list.length - 4}` : "")}</em>}
                    </dt>
                    <dd>
                      <b className={s.list.length ? undefined : "is-zero"}>
                        {s.list.length}
                        <span>종목</span>
                      </b>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="v2-empty">견줄 직전 분기가 아직 없습니다.</p>
            )}
          </Module>
          {d.exited.length > 0 && (
            <Module title="전량 정리한 종목" meta={`${quarterLabel(d.priorDate)} 비중 · 금액`} className="v2-isd-mod">
              <DetailList name="investor_exited" cols="exited" open={5} items={exitedLines(d.exited.slice(0, ROWS_MAX), d.usdKrw)} />
            </Module>
          )}
        </div>
      </div>

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는
          2026-08-23 에 뺐다. 같은 고지("투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과
          책임은 이용자 본인에게 있습니다")는 투자 유의사항(/disclaimer)이 한다. 2026-10-02 까지는 전역
          푸터가 그 문장을 들었고, 지금은 모든 화면의 푸터가 투자 유의사항으로 건너가는 링크를 든다.
          ⚠️ 다시 넣지 말 것 — 고지를 화면마다 적지 않고 한 페이지에 모으기로 했다(2026-10-02). */}
    </div>
  );
}

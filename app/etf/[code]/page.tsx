import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { BackTrail } from "@/components/back-trail";
import { getEtfDetail } from "@/lib/etf-detail";
import { leverMult } from "@/lib/etf-extras";
import { fmtKoDate } from "@/lib/stock-page";

import { PageJsonLd } from "../../JsonLd";
import { CoverMeta } from "../../kadera/V2Modules";
import { ETF_CARD } from "../../og-copy";
import { ETF_PUBLIC } from "../../screen-flags";
import { pageMetadata } from "../../seo";
import { ETF_PAGE, etfHref } from "../copy";
import { fmtFee, fmtPct, fmtSize } from "../format";
import { buildEtfDetailBrief } from "./brief";
import { DetailBrief, DistModule, FlowModule, InfoList, ReturnCard, SiblingModule, cadenceLabel } from "./DetailParts";

/**
 * ETF 하나의 실주소(`/etf/069500`) — 메인 화면(/etf)의 표 이름이 여기로 잇는다.
 *
 * ## 무엇을 보이나(2026-10-12 리서치 · lib/etf-detail.ts 머리말)
 *
 * 개별 ETF 는 이름 그대로 검색하고, 이름 뒤에 붙는 말은 주가 · 차트 > 분배금 · 배당 > 연금 · 세금 · 지급일 순이다. 그래서
 *   첫 줄 띠   이름(h1) · 종가 · 순자산 · 총보수 · 분배율
 *   히어로 띠  수익률(1년 선 · 기간별) | ETF 브리핑(숫자로 지은 문장 다섯) | 기본 정보(운용사 · 상장일 · 추적 지수 · 분배 주기 · 운용 방식)
 *   자금 흐름  [일별 순유입 막대 석 달 | 기간별 순유입] — 우리만 가진 자료(좌수 변화 × NAV)
 *   분배금     [최근 분배 이력 | 달마다 받은 분배금] — 분배 기록이 없으면 안 그린다(종목 상세 배당과 같은 규칙)
 *   같은 지수  메인 화면 '지수별 ETF 비교'와 같은 칸, 이 ETF 줄은 고른 줄 꼴 — 같은 지수 ETF 가 없으면 안 그린다
 * 채널 언급은 두지 않는다(ETF 하나에 하루 한두 건 · 너무 얇다).
 *
 * ## ⭐ 서버가 그린다
 *
 * 종목 상세(app/stock/[code]/page.tsx)와 같다 — 값이 모두 서버 HTML 에 든다. 클라이언트 부품을 두지 않는다.
 *
 * ## ⛔ 자기 제목을 자기가 그린다
 *
 * 셸은 이 주소를 'ETF 자금 흐름'의 하위로 잡아 h1 을 그 이름으로 세운다 — app/AppShell.tsx SELF_TITLED_PREFIXES 에 '/etf/' 를 넣어
 * 셸 제목을 비우고, 이 파일이 첫 줄 띠에 ETF 이름 h1 과 구조화 데이터를 직접 낸다.
 */

/** 배포된 곳인가 — 메인 화면과 같은 문(ETF_PUBLIC 이 false 면 배포본에서 404, 로컬에서는 보인다). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

// 빈 배열 = 빌드 때는 아무것도 안 만들고 처음 방문한 주소를 그때 그려 사본에 담는다(종목 상세와 같은 까닭 · 캐시 주기는 루트 레이아웃).
export async function generateStaticParams() {
  return [];
}

/** 이동 경로의 부모 — 사이드바 NAV 라벨과 같은 문자열. */
const PARENT = { name: ETF_PAGE.label, path: ETF_PAGE.href };

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const d = await getEtfDetail(code.toUpperCase());
  if (!d)
    return {
      title: "ETF를 찾을 수 없습니다 | hatzze",
      robots: { index: false, follow: false },
    };
  const parts = [
    d.head.ret != null ? `${d.head.label} 수익률 ${fmtPct(d.head.ret)}` : null,
    d.dist?.yld != null ? `분배율 ${d.dist.yld.toFixed(2)}%` : null,
    d.fee != null ? `총보수 ${fmtFee(d.fee)}` : null,
  ].filter(Boolean);
  const meta = await pageMetadata({
    title: `${d.name}(${d.code}) 분배금 · 수익률 · 자금 흐름 | hatzze`,
    description: `${d.name}의 ${parts.join(", ")}. 날마다의 자금 유입·유출과 분배 이력, 같은 지수 ETF를 함께 봅니다.`,
    path: etfHref(d.code),
    // 상세는 자기 폴더에 카드가 없어 구역(/etf)의 카드를 쓴다 — 안 주면 홈 과열도 카드로 떨어진다(app/seo.ts imagePath).
    ownImage: ETF_CARD.alt,
    imagePath: ETF_PAGE.href,
  });
  return ETF_PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
/** "10월 8일(목)" — 날짜만 있는 값이라 UTC 자정으로 읽어 요일을 뽑는다. */
const koDay = (iso: string) => `${fmtKoDate(iso)}(${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
/** '레버리지 2배' · '인버스 2배' · '인버스' · '액티브' · '패시브' — 기본 정보 '운용 방식'. */
const styleLabel = (name: string, mult: number | null) =>
  mult ? (mult === -1 ? "인버스" : mult < 0 ? `인버스 ${-mult}배` : `레버리지 ${mult}배`) : name.includes("액티브") ? "액티브" : "패시브";
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? " is-up" : " is-down");
const signPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(2)}%`;

export default async function EtfDetailPage({ params }: { params: Promise<{ code: string }> }) {
  if (!ETF_PUBLIC && DEPLOYED) notFound();
  const { code } = await params;
  const upper = code.toUpperCase();
  const d = await getEtfDetail(upper);
  if (!d) notFound();
  if (code !== upper) permanentRedirect(etfHref(upper));

  const mult = leverMult(d.name);
  const brief = buildEtfDetailBrief(d, mult);
  const setup = d.setupDate ? `${d.setupDate.slice(0, 4)}년 ${fmtKoDate(d.setupDate)}` : "없음";
  const info = [
    { k: "운용사", v: d.manager ?? "없음" },
    { k: "상장일", v: setup },
    {
      k: "추적 지수",
      v: d.index?.label ?? "없음",
      title: d.index?.benchmark ?? d.index?.name,
    },
    { k: "분배", v: cadenceLabel(d.dist?.cadence ?? null) },
    // 운용 방식 — 배수 · 액티브 · 패시브, 해외 기초면 환헤지 여부까지(2026-10-12 브리핑이 다섯 줄이 되며 옆 칸도 다섯 줄로). 원자재 · 통화는
    // 원화로 사고팔아도 환 노출이 상품마다 달라 적지 않는다.
    { k: "운용 방식", v: styleLabel(d.name, mult) + (d.abroad && d.group !== "금·원자재·통화" ? (/\(H\)|환헤지|합성 H/.test(d.name) ? " · 환헤지" : " · 환노출") : "") },
  ];

  /* 얼개 — 뒤로 가기 줄 → 첫 줄 띠 → 히어로 띠 [수익률 | ETF 브리핑 | 기본 정보](메인 화면과 같은 25% · 1fr · 400) → 자금 흐름 →
     분배금(있을 때) → 같은 지수 ETF(있을 때). 줄 꼴 · 칸 폭은 메인 화면 한 벌을 그대로 써서 세로선이 같은 자리에 선다. */
  return (
    <div className="hz-tx v2-kd v2-etf v2-etfd">
      <PageJsonLd title={d.name} description={`${d.name}의 분배금 · 수익률 · 자금 흐름을 봅니다.`} path={etfHref(d.code)} trail={[PARENT]} />

      <BackTrail parent={{ name: PARENT.name, href: PARENT.path }} current={d.name} />

      {/* 첫 줄 — ETF(h1) · 종가 · 순자산 · 총보수 · 분배율 · 기준일. ⚠️ h1 은 이 칸의 이름이다(셸은 이 주소의 이름을 모른다). */}
      <div className="v2-cover">
        <div className="v2-cover-cell v2-sk-id">
          <h1>{d.name}</h1>
          <span className="v2-cover-k">
            {d.code} · {d.group}
          </span>
        </div>
        {d.close != null && (
          <div className="v2-cover-cell v2-cover-price">
            <span className="v2-cover-k">{md(d.asOf)} 종가</span>
            <span className="v2-cover-v">
              <b>{d.close.toLocaleString("ko-KR")}원</b>
              {d.changeRate != null && <span className={`v2-cover-chg${tone(d.changeRate)}`}>{signPct(d.changeRate)}</span>}
            </span>
          </div>
        )}
        <div className="v2-cover-cell">
          <span className="v2-cover-k">순자산</span>
          <span className="v2-cover-v">
            <b>{fmtSize(d.netAsset)}</b>
          </span>
        </div>
        <div className="v2-cover-cell">
          <span className="v2-cover-k">총보수</span>
          <span className="v2-cover-v">
            <b>{fmtFee(d.fee)}</b>
          </span>
        </div>
        <div className="v2-cover-cell">
          <span className="v2-cover-k">분배율</span>
          <span className="v2-cover-v">
            <b>{d.dist?.yld != null ? `${d.dist.yld.toFixed(2)}%` : "없음"}</b>
            {d.dist?.estimated && <em>예상치</em>}
          </span>
        </div>
        <CoverMeta updated={`${koDay(d.asOf)} 거래분까지`} />
      </div>

      <div className="v2-etf-band">
        <ReturnCard d={d} />
        <DetailBrief rows={brief} />
        {/* 브리핑 줄 수만큼 편다 — 두 모듈의 줄이 같은 수라야 가로선이 맞는다(보통 다섯). */}
        <InfoList items={info.slice(0, Math.max(brief.length, 1))} />
      </div>

      <FlowModule d={d} />
      {d.dist && <DistModule d={d} />}
      {d.siblings.length > 0 && <SiblingModule d={d} />}
    </div>
  );
}

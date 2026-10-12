import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getEtfExtras } from "@/lib/etf-extras";
import { getKrIndexClosesSide } from "@/lib/data";
import { TABLE_ROWS, getEtfFlowBoard } from "@/lib/etf-flow";
import { assertLoaded, isLoadFailed } from "@/lib/load-state";
import { fmtKoDate } from "@/lib/stock-page";

import { CoverIndexCell, CoverMeta, Module } from "../kadera/V2Modules";
import { ETF_PUBLIC } from "../screen-flags";
import { pageMetadata } from "../seo";
import { ETF_PAGE } from "./copy";
import { EtfCompare } from "./EtfCompare";
import { CoveredModule } from "./EtfExtras";
import { buildEtfBrief } from "./brief";
import { BriefModule, FlowHero, TopReturns } from "./EtfHero";
import { FlowCard } from "./FlowCard";
import { LeverModule } from "./LeverModule";
import { fmtSize } from "./format";

/** 배포된 곳인가. Vercel 에서만 `VERCEL_ENV` 가 있다 — 로컬에서는 ETF_PUBLIC 이 false 여도 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export async function generateMetadata(): Promise<Metadata> {
  // ⚠️ await 를 빼지 말 것 — robots 를 얹으려고 펼친다(app/preview/page.tsx 의 같은 자리 주석).
  const meta = await pageMetadata({
    title: `${ETF_PAGE.label} | hatzze`,
    description: ETF_PAGE.description,
    path: ETF_PAGE.href,
  });
  return ETF_PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx).

/** "10월 8일(목)" — 첫 줄 띠의 거래일. 날짜만 있는 값이라 UTC 자정으로 읽어 요일을 뽑는다. */
const koDay = (iso: string) => `${fmtKoDate(iso)}(${"일월화수목금토"[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

export default async function EtfPage() {
  if (!ETF_PUBLIC && DEPLOYED) notFound();

  // 지수 종가 · 아래 모듈은 곁가지다 — 못 받으면 그 칸만 비고 화면은 그대로 그린다(null · 실패를 렌더 목록에 안 적는다).
  const [board, extras, rawIndexes] = await Promise.all([getEtfFlowBoard(), getEtfExtras(), getKrIndexClosesSide()]);
  assertLoaded("/etf", { board });
  const b = isLoadFailed(board) ? null : board;
  const indexes = isLoadFailed(rawIndexes) ? null : rawIndexes;
  const empty = <p className="v2-empty">아직 받은 ETF 자료가 없습니다.</p>;
  // 브리핑 줄 수만큼 수익률 상위를 편다 — 두 모듈의 줄이 같은 수라야 가로선이 맞는다(보통 다섯 · 꾸준함 · 새 상장이 없는 날은 넷 · 셋).
  const brief = b ? buildEtfBrief(b) : [];

  /* 얼개(2026-10-11) — 첫 줄 띠(바탕: 크기 · 거래대금 · 지수 종가) → 히어로 띠 [ETF 순유입 | ETF 브리핑 | 수익률 상위](홈 [햇쩨 지수 | 오늘의 브리핑]과
     같은 꼴) → 물음 하나에 카드 하나: ETF 자금 흐름(왼쪽 유형 → 오른쪽 ETF) · 지수별 ETF 비교(왼쪽 지수 → 오른쪽 ETF) → [커버드콜 | 레버리지·인버스]
     (5:5). 살펴볼 ETF(괴리율 | 작은 ETF)는 걷었다(2026-10-12 "없어도 될 듯" · 관심도 괴리율 0.04 · 상장폐지 0.006 으로 가장 작았다).
     파킹형 수익률도 걷었다(2026-10-12 — 검색 관심이 커버드콜의 1/5 이고 1년 새 60% 줄었다. 같은 물음은 파킹통장 · CMA 쪽에서 크다).
     ⭐ 이어진 것은 한 카드에 둔다 — 고르는 목록과 보이는 표가 따로 선 카드면 서로 상관없어 보였다(2026-10-11 "같은 지수끼리와 같은 지수, 어떤 ETF 가
     동떨어진 카드다 · 국장 미리보기나 배당 바스켓처럼"). 왼쪽 목록 폭은 히어로 띠 첫 칸, 오른쪽 칸 폭은 히어로 띠 오른쪽 칸(400)과 같아 세로선이 이어진다.
     ⛔ 첫 줄 띠는 아래 모듈의 큰 숫자(1달 순유입 · 들어온 ETF 수)를 되풀이하지 않는다.
     ⛔ 모듈 근거 글은 기간 한 마디까지만(카더라 '최근 3일'처럼) — 셈의 조건 · 기준일을 적은 설명 글은 걷었다(2026-10-12 "짜잘한 설명이 많다"). */
  return (
    <div className="hz-tx v2-kd v2-etf">
      <div className="v2-cover">
        {b && (
          <>
            <div className="v2-cover-cell">
              <span className="v2-cover-k">ETF 순자산</span>
              <span className="v2-cover-v">
                <b>{fmtSize(b.netAsset)}</b>
              </span>
            </div>
            <div className="v2-cover-cell">
              <span className="v2-cover-k">하루 거래대금</span>
              <span className="v2-cover-v">
                <b>{fmtSize(b.tradeValue)}</b>
                <em>1주 평균</em>
              </span>
            </div>
          </>
        )}
        {indexes && <CoverIndexCell kospi={indexes.kospi} kosdaq={indexes.kosdaq} />}
        <CoverMeta updated={b ? `${koDay(b.asOf)} 거래분까지` : "자료 준비 중"} basis={b ? `ETF ${b.count.toLocaleString("ko-KR")}개` : null} />
      </div>

      {b && (
        <div className="v2-etf-band">
          <FlowHero b={b} />
          <BriefModule rows={brief} />
          <Module title="수익률 상위 ETF" meta="1달" className="v2-etf-topmod">
            {b.topReturns.length ? <TopReturns rows={b.topReturns.slice(0, Math.max(brief.length, 1))} /> : <p className="v2-empty">1달 수익률 자료가 없습니다.</p>}
          </Module>
        </div>
      )}

      {b ? (
        <FlowCard rows={b.rows} groups={b.groups} picks={b.picks} periods={b.periods} limit={TABLE_ROWS} />
      ) : (
        <Module title="ETF 자금 흐름" className="v2-etf-main">
          {empty}
        </Module>
      )}

      {/* ⛔ 무엇을 사라고 권하지 않는다 — 같은 지수의 ETF 를 견줄 사실만 나란히(EtfCompare.tsx). */}
      {b && b.compare.length > 0 && <EtfCompare indexes={b.compare} />}

      {/* [커버드콜 | 레버리지·인버스] 5:5 — 둘 다 '이 상품은 기초 지수만큼 갔나'를 묻는 표라 한 줄에 둔다(2026-10-12). 요약 칸 셋 + 여덟 줄로 키가 같다. */}
      {extras && (
        <div className="v2-etf-pair2">
          <CoveredModule year={extras.coveredYear} month={extras.coveredMonth} className="v2-etf-ccmod" />
          <LeverModule year={extras.leverYear} month={extras.leverMonth} className="v2-etf-lvmod" />
        </div>
      )}
    </div>
  );
}

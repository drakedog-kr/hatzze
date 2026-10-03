import type { Metadata } from "next";

import { assertLoaded } from "@/lib/load-state";
import { RANK_MIN_ANALYSTS, getInsiderOverview } from "@/lib/insider-data";
import Link from "next/link";

import { fmtKoDate } from "@/lib/stock-page";

import { CurrencyToggle } from "../AppShell";
import { CoverMeta, Module } from "../kadera/V2Modules";
import { insiderListHref } from "./lists";
import { addRows, analystTopRows, congressRows, execRows, fmtDate, holderRowsView, hotRowsView, insiderNote, managerAumRows, trimRows } from "./parts";
import { INSIDER_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { Icon } from "../ui";
import { LoadFailedNote } from "../LoadFailedNote";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "내부자 리포트 | hatzze",
    description:
      "미국 기업 임원, 미 하원의원, 월가 거물이 무엇을 사고팔았는지 공시 그대로 봅니다. 주식 텔레그램에서 회자되는 종목과 나란히 놓습니다.",
    path: "/insider",
    // ⚠️ `ownImage` 를 안 주면 옆의 opengraph-image.tsx 가 그린 카드가 아예 안 쓰인다(app/seo.ts).
    ownImage: INSIDER_CARD.alt,
  });
}

// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx). 예전엔 여기가
// force-dynamic 이라 방문마다 서버가 새로 그렸다.

/**
 * 모듈 하나가 펴는 줄 수. 다섯이다 — FolioObs 처럼 블록마다 질문 하나에 3~7줄(처음엔 표 하나에 9열 20행을 우겨넣어 "너무 복잡하다").
 * 나머지는 모듈 머리의 '전체 보기'(목록 화면)로 간다 — 안 보이는 줄도 클라이언트로 가므로 여기는 다섯 줄만 싣는다.
 */
const BLOCK_ROWS = 5;

/** 모듈 머리 오른쪽 '전체 보기' — 다른 화면(목록)으로 간다. 예전엔 모듈 바닥 띠였다. */
function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="v2-more" data-ga="insider_see_all" data-ga-list={href.split("/").pop()}>
      전체 보기
      <Icon name="chevron_right" />
    </Link>
  );
}

/** 모듈 안 줄 목록. 줄은 행 함수(parts.tsx)가 `<li>` 로 싸서 준다 — 메인 · 전체보기가 같은 함수를 쓴다. */
function Rows({ items }: { items: React.ReactNode[] }) {
  return <ul className="v2-in-rows">{items}</ul>;
}

/** "10월 2일(금)" — 첫 줄 띠의 공시 끝점. 날짜만 있고 시각이 없는 값이라 UTC 자정으로 읽어 요일을 뽑는다. */
const koDay = (iso: string) => `${fmtKoDate(iso)}(${"일월화수목금토"[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

export default async function InsiderPage() {
  const ov = await getInsiderOverview();
  assertLoaded("/insider");

  // 거물이 들고 있는 종목 — 카더라에 오른 종목 중 든 거물이 많은 순.
  const holderAll = [...ov.rows]
    .filter((r) => r.holders > 0)
    .sort((a, b) => b.holders - a.holders || b.mentions - a.mentions);

  /* ── v2(2026-10-03) — 카더라 · 시장 브리핑의 v2 규칙을 옮겼다 ──────────────────────────
     첫 줄 띠(새 신고 · 최근 90일 공시 규모 · 통화 · 업데이트) → 짝 모듈 네 줄. 페이지 제목 · 구간 제목('01 월가 거물의 분기 변화') ·
     시트 부제 · 누르면 된다는 안내 쪽지(TapHint)는 걷었다 — 모듈 머리 띠가 이름 · 근거 · 전체 보기를 말한다.
     ⛔ 옛 히어로의 '오늘의 브리핑' 넉 줄은 걷었다 — 아래 모듈 1등(임원 매매 · 의원 · 거물 늘린 · 줄인)을 그대로 끌어올린 되풀이였다.
     ⭐ 짝 순서는 **새로 들어오는 것부터**: 임원 · 의원 신고(매일) → 거물 분기 변화(분기) → 카더라에 오른 종목 → 거물 명단 · 증권가.
        예전엔 분기 자료가 맨 위라 오늘 들어온 신고가 1,000px 아래였다. */
  const quarter = insiderNote("adds", ov);
  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고, 원화는 크기를 가늠하라고 얹은 것이다.
    // 쿠키로 한 번이라도 고르면 그 선택이 이긴다(규칙은 globals.css 의 `[data-cur-default]`).
    <div className="hz-tx v2-kd v2-in" data-cur-default="usd">
      <LoadFailedNote sources={ov.failedSources} />
      {/* 첫 줄 — 새 신고(그 축이 마지막으로 받은 날 · 그날 들어온 신고서 수) · 최근 90일 공시 규모 · 통화 · 업데이트.
          ⚠️ 새 신고 숫자는 창 전체가 아니라 **마지막 접수일 하루치**다(InsiderOverview.latestInsiderFilings 주석). */}
      <div className="v2-cover">
        <div className="v2-cover-cell v2-cover-idx">
          <span className="v2-cover-k">새 신고</span>
          {[
            { k: "임원", f: ov.latestInsiderFilings },
            { k: "의원", f: ov.latestCongressFilings },
          ].map(({ k, f }) => (
            <span key={k} className="v2-cover-v">
              <em>{k}</em>
              <b>{f.count.toLocaleString("ko-KR")}건</b>
              {f.date && <span className="v2-cover-chg">{fmtDate(f.date)}</span>}
            </span>
          ))}
        </div>
        <div className="v2-cover-cell v2-cover-idx">
          <span className="v2-cover-k">최근 {ov.scale.windowDays}일 공시</span>
          {[
            { k: "기업 임원", n: ov.scale.officers },
            { k: "미 하원의원", n: ov.scale.members },
            { k: "월가 거물", n: ov.scale.managers },
          ].map((x) => (
            <span key={x.k} className="v2-cover-v">
              <em>{x.k}</em>
              <b>{x.n.toLocaleString("ko-KR")}명</b>
            </span>
          ))}
        </div>
        {/* 통화 — 환율을 못 받은 날(usdKrw null)은 달러만 내므로 스위치도 안 세운다(InsiderOverview.usdKrw 주석).
            페이지 머리 오른쪽에 있던 것을 v2 화면은 머리를 걷어 이 띠로 옮겼다. 폰(≤560)은 탑바에 그대로 있다. */}
        {ov.usdKrw != null && (
          <div className="v2-cover-cell v2-in-cur">
            <span className="v2-cover-k">통화</span>
            <CurrencyToggle fallback="usd" />
          </div>
        )}
        <CoverMeta
          updated={ov.asOf ? `${koDay(ov.asOf)} 공시까지` : "공시 준비 중"}
          basis={ov.mentionedCount ? `화제 종목 ${ov.mentionedCount.toLocaleString("ko-KR")}개` : null}
        />
      </div>

      {/* ① 임원 · 의원 신고 — 매일 들어온다 */}
      <div className="v2-in-pair">
        <Module title="임원이 신고한 매매" meta={`${insiderNote("exec", ov)} · 금액 순`} aside={<SeeAll href="/insider/list/exec" />}>
          {ov.buys.length === 0 ? <p className="v2-empty">최근에는 없습니다.</p> : <Rows items={execRows(ov.buys.slice(0, BLOCK_ROWS), ov.usdKrw)} />}
        </Module>
        <Module title="미 하원의원이 사고판 것" meta={`${insiderNote("congress", ov)} · 의원 수 순`} aside={<SeeAll href="/insider/list/congress" />}>
          {ov.congressTickers.length === 0 ? <p className="v2-empty">최근에는 없습니다.</p> : <Rows items={congressRows(ov.congressTickers.slice(0, BLOCK_ROWS))} />}
        </Module>
      </div>

      {/* ② 거물이 분기 사이에 움직인 것 — 같은 계산의 양쪽 끝이라 나란히. 오른쪽 숫자는 금액이 아니라 사람 수다(MoveRow 주석). */}
      <div className="v2-in-pair">
        <Module title="월가 거물이 늘린 종목" meta={`${quarter} · 늘린 거물 수 순`} aside={<SeeAll href="/insider/list/adds" />}>
          {ov.managerAdds.length === 0 ? <p className="v2-empty">견줄 직전 분기가 아직 없습니다.</p> : <Rows items={addRows(ov.managerAdds.slice(0, BLOCK_ROWS))} />}
        </Module>
        <Module title="월가 거물이 줄인 종목" meta={`${quarter} · 줄인 거물 수 순`} aside={<SeeAll href="/insider/list/trims" />}>
          {ov.managerTrims.length === 0 ? <p className="v2-empty">견줄 직전 분기가 아직 없습니다.</p> : <Rows items={trimRows(ov.managerTrims.slice(0, BLOCK_ROWS))} />}
        </Module>
      </div>

      {/* ③ 카더라에 오른 미장 종목 — 회자된 순 · 거물 몇 명이 들고 있나 */}
      <div className="v2-in-pair">
        <Module title="커뮤니티에서 뜨거운 종목" meta={`${insiderNote("hot", ov)} · 언급 순`} aside={<SeeAll href="/insider/list/hot" />}>
          {ov.rows.length === 0 ? <p className="v2-empty">아직 채울 자료가 없습니다.</p> : <Rows items={hotRowsView(ov.rows.slice(0, BLOCK_ROWS), ov.usdKrw)} />}
        </Module>
        <Module title="월가 거물이 들고 있는 종목" meta={`${insiderNote("holders", ov)} · 카더라 오른 종목`} aside={<SeeAll href="/insider/list/holders" />}>
          {holderAll.length === 0 ? <p className="v2-empty">최근에는 없습니다.</p> : <Rows items={holderRowsView(holderAll.slice(0, BLOCK_ROWS), ov.scale.managers)} />}
        </Module>
      </div>

      {/* ④ 거물 명단 · 증권가 시선 */}
      <div className="v2-in-pair">
        <Module title="월가 거물 명단" meta={`${insiderNote("managers", ov)} · 운용자산 순`} aside={<SeeAll href={insiderListHref("managers")} />}>
          {ov.managerRanks.length === 0 ? <p className="v2-empty">명단을 못 읽었습니다.</p> : <Rows items={managerAumRows(ov.managerRanks.slice(0, BLOCK_ROWS), ov.usdKrw)} />}
        </Module>
        <Module
          title="증권가가 긍정적으로 보는 종목"
          meta={`${insiderNote("analyst", ov)} · 애널리스트 ${RANK_MIN_ANALYSTS}명 이상`}
          aside={<SeeAll href={insiderListHref("analyst")} />}
        >
          {ov.analystTop.length === 0 ? <p className="v2-empty">아직 받은 컨센서스가 없습니다.</p> : <Rows items={analystTopRows(ov.analystTop.slice(0, BLOCK_ROWS))} />}
        </Module>
      </div>

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는 2026-08-23 에 뺐다. 같은 고지는 투자 유의사항
          (/disclaimer)이 한다 — 모든 화면의 푸터가 그리로 건너가는 링크를 든다. ⚠️ 다시 넣지 말 것(2026-10-02 결정). */}
    </div>
  );
}

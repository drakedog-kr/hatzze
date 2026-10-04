import type { Metadata } from "next";

import { insiderBrief, insiderLean } from "@/lib/insider-brief";
import { assertLoaded } from "@/lib/load-state";
import { RANK_MIN_ANALYSTS, getInsiderOverview } from "@/lib/insider-data";
import Link from "next/link";

import { fmtKoDate } from "@/lib/stock-page";

import { CurrencyToggle } from "../AppShell";
import { CoverMeta, Module } from "../kadera/V2Modules";
import { INSIDER_LISTS, insiderListHref } from "./lists";
import { fmtDate, insiderNote } from "./parts";
import { BriefRows, LeanRows, analystLines, congressLines, execLines, managerLines, moveLines } from "./V2Rows";
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

/** 모듈 안 줄 목록. 줄은 V2Rows.tsx 가 `<li>` 로 싸서 준다(한 줄 · 네 칸). 전체보기는 옛 행 함수(parts.tsx)를 그대로 쓴다. */
function Rows({ items }: { items: React.ReactNode[] }) {
  return <ul className="v2-in-rows">{items}</ul>;
}

/** "10월 2일(금)" — 첫 줄 띠의 공시 끝점. 날짜만 있고 시각이 없는 값이라 UTC 자정으로 읽어 요일을 뽑는다. */
const koDay = (iso: string) => `${fmtKoDate(iso)}(${"일월화수목금토"[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

export default async function InsiderPage() {
  const ov = await getInsiderOverview();
  assertLoaded("/insider");

  /* ── v2(2026-10-03) — 카더라 · 시장 브리핑의 v2 규칙을 옮겼다 ──────────────────────────
     첫 줄 띠(새 신고 · 통화 · 업데이트) → 짝 모듈 세 줄. 줄은 한 줄 · 네 칸(V2Rows.tsx — 순위 · 종목 · 곁 숫자 · 값).
     ⭐ 2차(같은 날 "너무 복잡하다"): 모듈 여덟 → 여섯 · 두 줄 + 알약 줄 → 한 줄.
     ⭐ 3차(2026-10-04 운영자 판단): '커뮤니티에서 뜨거운 종목' 걷고 '운용자산이 큰 순'(거물 명단) 되살림.
     ⛔ 옛 히어로 '오늘의 브리핑' 넉 줄(아래 모듈 1등의 되풀이) · 구간 제목 · 시트 부제 · 안내 쪽지(TapHint)는 걷었다.
     ⭐ 짝 순서는 **새로 들어오는 것부터**: 임원 · 의원 신고(매일) → 거물 분기 변화(분기) → 거물 명단 · 증권가.
     ⭐ 4차(2026-10-04 "브리핑 카드가 있으면" → 같은 날 "엉성하다"): 둘째 줄 [매매 방향 | 오늘의 브리핑] — 다른 v2 화면처럼 첫 칸은 숫자 카드
       (카더라 여론 칸과 같은 폭), 브리핑은 종목만. 옛 넉 줄과 달리 모듈 1등을 되풀이하지 않는다(lib/insider-brief.ts). */
  const quarter = insiderNote("adds", ov);
  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고, 원화는 크기를 가늠하라고 얹은 것이다.
    // 쿠키로 한 번이라도 고르면 그 선택이 이긴다(규칙은 globals.css 의 `[data-cur-default]`).
    <div className="hz-tx v2-kd v2-in" data-cur-default="usd">
      <LoadFailedNote sources={ov.failedSources} />
      {/* 첫 줄 — 새 신고(그 축이 마지막으로 받은 날 · 그날 들어온 신고서 수) · 통화 · 업데이트(공시 끝점 · 추적 규모).
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
        {/* 통화 — 환율을 못 받은 날(usdKrw null)은 달러만 내므로 스위치도 안 세운다(InsiderOverview.usdKrw 주석).
            v2 화면은 머리를 걷어 이 띠로 옮겼다. 폰(≤560)은 탑바에 그대로 있다. */}
        {ov.usdKrw != null && (
          <div className="v2-cover-cell v2-in-cur">
            <span className="v2-cover-k">통화</span>
            <CurrencyToggle fallback="usd" />
          </div>
        )}
        <CoverMeta
          updated={ov.asOf ? `${koDay(ov.asOf)} 공시까지` : "공시 준비 중"}
          basis={`최근 ${ov.scale.windowDays}일 임원 ${ov.scale.officers.toLocaleString("ko-KR")}명 · 의원 ${ov.scale.members.toLocaleString("ko-KR")}명`}
        />
      </div>

      {/* 둘째 줄 — 매매 방향(숫자) | 오늘의 브리핑(종목). 계산 문장이라 AI 표시가 없다.
          ⛔ 브리핑을 판 폭 한 장 · 두 단으로 두고 합계까지 문장에 넣었던 첫 판은 숫자가 글에 묻혀 "엉성하다"였다. */}
      <div className="v2-in-band">
        <Module title="매매 방향" className="v2-in-leanmod">
          <LeanRows rows={insiderLean(ov)} rate={ov.usdKrw} />
        </Module>
        <Module title="오늘의 브리핑" className="v2-in-briefmod">
          <BriefRows rows={insiderBrief(ov)} />
        </Module>
      </div>

      {/* ① 임원 · 의원 신고 — 매일 들어온다 */}
      <div className="v2-in-pair">
        <Module title="임원이 신고한 매매" meta={`${insiderNote("exec", ov)} · 금액 순`} aside={<SeeAll href="/insider/list/exec" />}>
          {ov.buys.length === 0 ? <p className="v2-empty">최근에는 없습니다.</p> : <Rows items={execLines(ov.buys.slice(0, BLOCK_ROWS), ov.usdKrw)} />}
        </Module>
        <Module title="미 하원의원이 사고판 것" meta={`${insiderNote("congress", ov)} · 의원 수 순`} aside={<SeeAll href="/insider/list/congress" />}>
          {ov.congressTickers.length === 0 ? <p className="v2-empty">최근에는 없습니다.</p> : <Rows items={congressLines(ov.congressTickers.slice(0, BLOCK_ROWS))} />}
        </Module>
      </div>

      {/* ② 거물이 분기 사이에 움직인 것 — 같은 계산의 양쪽 끝이라 나란히. 값은 금액이 아니라 사람 수다. */}
      <div className="v2-in-pair">
        <Module title="월가 거물이 늘린 종목" meta={`${quarter} · 늘린 거물 수 순`} aside={<SeeAll href="/insider/list/adds" />}>
          {ov.managerAdds.length === 0 ? <p className="v2-empty">견줄 직전 분기가 아직 없습니다.</p> : <Rows items={moveLines(ov.managerAdds.slice(0, BLOCK_ROWS), "add")} />}
        </Module>
        <Module title="월가 거물이 줄인 종목" meta={`${quarter} · 줄인 거물 수 순`} aside={<SeeAll href="/insider/list/trims" />}>
          {ov.managerTrims.length === 0 ? <p className="v2-empty">견줄 직전 분기가 아직 없습니다.</p> : <Rows items={moveLines(ov.managerTrims.slice(0, BLOCK_ROWS), "trim")} />}
        </Module>
      </div>

      {/* ③ 월가 거물 명단(운용자산 순) · 증권가 시선.
          2026-10-04 운영자 판단으로 '커뮤니티에서 뜨거운 종목'을 걷고 '운용자산이 큰 순'을 되살렸다(첫 줄 띠의 거물 명단 링크 칸은 이 모듈과 겹쳐 걷었다). */}
      <div className="v2-in-pair">
        <Module
          title={INSIDER_LISTS.managers.title}
          meta={`${insiderNote("managers", ov)} · 월가 거물 ${ov.scale.managers.toLocaleString("ko-KR")}명`}
          aside={<SeeAll href={insiderListHref("managers")} />}
        >
          {ov.managerRanks.length === 0 ? <p className="v2-empty">명단을 못 읽었습니다.</p> : <Rows items={managerLines(ov.managerRanks.slice(0, BLOCK_ROWS), ov.usdKrw)} />}
        </Module>
        <Module
          title="증권가가 긍정적으로 보는 종목"
          meta={`${insiderNote("analyst", ov)} · 애널리스트 ${RANK_MIN_ANALYSTS}명 이상`}
          aside={<SeeAll href={insiderListHref("analyst")} />}
        >
          {ov.analystTop.length === 0 ? <p className="v2-empty">아직 받은 컨센서스가 없습니다.</p> : <Rows items={analystLines(ov.analystTop.slice(0, BLOCK_ROWS))} />}
        </Module>
      </div>

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는 2026-08-23 에 뺐다. 같은 고지는 투자 유의사항
          (/disclaimer)이 한다 — 모든 화면의 푸터가 그리로 건너가는 링크를 든다. ⚠️ 다시 넣지 말 것(2026-10-02 결정). */}
    </div>
  );
}

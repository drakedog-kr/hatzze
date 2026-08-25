import type { Metadata } from "next";

import { RANK_MIN_ANALYSTS, getInsiderOverview } from "@/lib/insider-data";
import Link from "next/link";

import { SectionHead } from "../kadera/SectionHead";
import { TapHint } from "./TapHint";
import { insiderListHref } from "./lists";
import { Empty, GroupTitle, Money, T, addRows, congressRows, execRows, fmtDate, holderRowsView, hotRowsView, analystTopRows, insiderNote, managerAumRows, quarterLabel, trimRows } from "./parts";
import { pageMetadata } from "../seo";
import { C, Icon, MONO } from "../ui";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "내부자 리포트 | hatzze",
    description:
      "미국 기업 임원, 미 하원의원, 월가 거물이 무엇을 사고팔았는지 공시 그대로 봅니다. 주식 텔레그램에서 회자되는 종목과 나란히 놓습니다.",
    path: "/insider",
  });
}

export const dynamic = "force-dynamic";

/**
 * 블록 하나가 펴는 줄 수.
 *
 * ⭐ 5줄이다. 처음엔 표 하나에 9열 20행을 우겨넣었는데 "너무 복잡하다"는 말을 들었다.
 * FolioObs 를 다시 보니 저쪽은 **블록마다 질문이 하나씩이고 3~7줄로 끝난다.**
 * 한 화면에 표 하나가 아니라 작은 블록 여럿이 우리가 따라야 할 모양이다.
 */
const BLOCK_ROWS = 5;



/**
 * 두 시트를 한 줄에 나란히 놓을 때의 최소 폭. 카더라(app/kadera/page.tsx)와 같은 값이다.
 * ⚠️ 이보다 좁아지면 두 칸이 아니라 한 칸씩 세로로 흐른다. 종목 이름과 사람 이름이
 *    같은 줄에 있어서, 더 좁혀 두 칸을 유지하면 이름이 통째로 잘린다.
 */
const SHEET_PAIR_MIN = "min(460px, 100%)";


/** 성격이 비슷한 블록 둘을 한 줄에. 좁아지면 알아서 한 칸씩 세로로 흐른다. */
function Pair({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>{children}</div>;
}

/** 짝 안에 들어가는 시트. 두 시트의 높이가 달라도 각주 띠가 바닥에서 만나게 한다. */
function HalfSheet({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="hz-sheet"
      style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}
    >
      {children}
    </section>
  );
}




/**
 * 시트의 행 목록 + 바닥의 '전체보기' 줄.
 *
 * 예전엔 이 자리가 **각주 띠**였다. 각주는 알약의 물음표(noteHelp)로 옮겼다 — 시트마다
 * 한 줄씩 깔려 있으니 여섯 장이 모이면 화면 아래쪽이 잔글씨로 덮였고, 정작 "더 있나"를
 * 물을 자리가 없었다.
 *
 * ⚠️ **그 자리에서 늘어나지 않고 목록 페이지로 간다.** 카더라의 '더 보기'는 시트 안에서
 *    펴는데, 여기 목록은 그러기엔 너무 길다(임원 93 · 의원 321 · 거물 보유 1,454종목).
 *    안 보이는 줄도 클라이언트로 전송되므로 메인 화면은 다섯 줄만 싣는다.
 *
 * ⚠️ 행을 `<li>` 로 싼다. `.hz-trow` 의 마지막 줄 밑선 지우기 규칙에 `li:last-child`
 *    가 이미 들어 있어(globals.css) 이 꼴이라야 선이 두 겹으로 안 겹친다.
 * ⚠️ marginTop:auto — 짝지은 두 시트의 줄 수가 달라도 바닥 띠가 같은 높이에서 만난다.
 */
/**
 * 목록의 **맨 윗줄 바로 밑에** 안내 쪽지를 끼운다.
 *
 * 카드마다 다는 게 아니라 **두 장에만** 단다 — 늘린 종목(종목 상세로 가는 길)과
 * 운용자산이 큰 순(인물 상세로 가는 길). 이 화면의 상세 페이지가 그 둘뿐이라, 한 장씩만
 * 알려 주면 나머지 카드는 눌러 보지 않아도 같은 곳으로 간다는 걸 알게 된다. 여덟 블록에
 * 다 달면 안내가 아니라 잡음이 된다. 전체보기 페이지에도 안 단다 — 거기까지 온 사람은
 * 이미 눌러 본 사람이다.
 *
 * ⚠️ 한때 '증권가가 긍정적으로 보는 종목' 에도 달았다가 뗐다. 그 카드도 종목 상세로 가는데
 *    늘린 종목이 이미 같은 말을 하고 있어 두 번 배우는 꼴이었다.
 *
 * 표시는 id 별로 따로 남는다. 두 장이 가리키는 곳이 달라서 하나를 닫았다고 나머지를
 * 안 알려 주면 그 카드는 영영 못 배운다.
 */
function withTapHint(rows: React.ReactNode[], hint: { id: string; text: string }) {
  if (rows.length === 0) return rows;
  return [rows[0], <TapHint key="__taphint" {...hint} />, ...rows.slice(1)];
}

function RowList({ items, href }: { items: React.ReactNode[]; href: string }) {
  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{items}</ul>
      <div className="hz-sheet-foot-row" style={{ marginTop: "auto" }}>
        {/* `.hz-more-btn` 은 카더라의 '더 보기' 줄과 같은 클래스다. 버튼이 아니라 링크라
            바탕·글자색이 클래스에 있어야 한다 — 인라인으로 주면 :hover 를 이겨서 호버가
            통째로 죽는다(그 함정에 이 저장소가 두 번 걸렸다). */}
        {/* ⚠️ 글자 크기·굵기는 클래스가 아니라 **인라인**에 있어야 카더라의 '더 보기'와
            같아진다. `.hz-more-btn` 은 바탕·글자색·font-family 만 갖고, 11.5/700 은
            ExpandableList 가 인라인으로 준다(실측으로 맞췄다: 11.5px · 700 ·
            padding 0 12px · minHeight 32). 여기만 안 주면 본문 기본값 16px/400 이 된다. */}
        <Link
          href={href}
          className="hz-more-btn"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "0 12px",
            minHeight: 32,
            fontSize: 11.5,
            fontWeight: 700,
            textDecoration: "none",
          }}
          data-ga="insider_see_all"
          data-ga-list={href.split("/").pop()}
        >
          전체보기
          {/* 화살표는 남긴다 — 카더라의 '더 보기'는 그 자리에서 펴지만 이건 **다른
              페이지로 간다.** 같은 생김새에 다른 동작이면 눌러 보기 전엔 알 수 없다. */}
          <Icon name="chevron_right" style={{ fontSize: 15 }} />
        </Link>
      </div>
    </>
  );
}

export default async function InsiderPage() {
  const ov = await getInsiderOverview();

  
  // 전체보기 페이지가 같은 순서를 써야 해서 자르지 않고 통째로 만든다. 메인 화면은
  // 여기서 다섯 줄만 떼어 쓴다.
  const holderAll = [...ov.rows]
    .filter((r) => r.holders > 0)
    .sort((a, b) => b.holders - a.holders || b.mentions - a.mentions);
  // ⚠️ 신고 한 건씩 최신순으로 뽑았더니 **5줄 중 3줄이 같은 의원**이었다(많이 거래하는
  //    사람이 블록을 통째로 먹는다). 종목 단위로 묶고 **여러 의원이 건드린 순**으로
  //    세우면, 이름을 "외 N명"으로 줄일 수 있으면서 한 사람이 블록을 먹는 것도 풀린다.
  //
  // ⭐ 모집단은 **카더라 밖까지 650종목 전부**다. 안쪽(178개)만 보면 블록이 볼 수 있는 게
  //    4분의 1로 준다. 카더라에 오른 종목은 배지로 가른다.
  

  // ⚠️ 운용사마다 기준 분기가 다르다(퍼싱 스퀘어가 한 분기 늦다). 라벨은 **가장 흔한
  //    짝의 최신 분기**를 적고, 거기서 벗어난 곳이 있으면 툴팁이 그 수를 밝힌다.
  //    라벨만 두면 한 줄짜리 표기가 그 운용사에 대해 조용히 거짓이 된다.

  /**
   * 카드 배지는 **전부 "언제 기준인가"** 를 적는다.
   *
   * ⚠️ 예전엔 몇 건인지를 적었다(`63명` · `173종목`). 그 수는 **바로 아래 줄들이 이미
   *    말한다** — 거물 줄마다 종목 수가 있고, 목록 길이가 곧 개수다. 대신 어느 시점의
   *    자료인지는 어디에도 없었다. 축마다 기준일이 다른 화면이라(임원 8/20 · 의원 8/18 ·
   *    언급 8/24 · 컨센서스 8/23 · 13F 2026 Q2) 그게 더 급한 정보다.
   * ⚠️ 창을 보는 카드는 **끝점과 길이**를 같이 적는다. "최근 7일"만으로는 그 7일이
   *    언제 끝나는지 모른다 — 공시는 접수까지 며칠 걸려서 오늘까지가 아니다.
   */
  // 두 카드가 같은 각주를 쓴다. 짝지어 놓았으니 서로 다른 말을 적을 이유가 없다.
  // ⭐ 각주 띠를 걷고 그 자리를 '더 보기' 줄에 내줬다. 단서는 전부 알약의 물음표로
  //    옮긴다 — 지우면 라벨이 거짓이 되는 것들이다(제출이 늦은 곳·반대로 움직인 곳).
  const moveHelp =
    "분기말 두 시점의 차이입니다. 중간에 샀다 판 것은 안 보입니다." +
    (ov.offQuarter > 0 ? ` 늦게 낸 ${ov.offQuarter}곳은 직전 분기와 견줬습니다.` : "");

  // 히어로 오른쪽의 "오늘의 업데이트". ⚠️ 0 인 줄도 지우지 않는다 — 장내 매수가 0 인
  // 날이 흔한데, 그 줄이 사라지면 독자는 "오늘은 아무것도 없었다"가 아니라 "그런 걸
  // 안 보는 화면"으로 읽는다.
  /**
   * 히어로의 '오늘의 요점' 넉 줄. 아래 카드 넷의 **첫 줄을 그대로** 끌어올린다.
   *
   * ⚠️ 여기서 다시 정렬하지 않는다. 카드가 쓰는 배열의 [0] 을 그냥 집는다 — 순서
   *    규칙이 두 벌이 되면 "요점의 1위"와 "카드의 1위"가 언젠가 달라진다.
   * ⚠️ 비어 있는 줄은 아예 안 낸다. "-" 로 채우면 자리는 지키지만 읽을 게 없다.
   */
  const top = <T,>(arr: T[]): T | null => arr[0] ?? null;
  const bigBuy = top(ov.buys);
  const bigCongress = top(ov.congressTickers);
  const bigAdd = top(ov.managerAdds);
  const bigTrim = top(ov.managerTrims);
  const highlights = [
    bigBuy && {
      label: "임원이 크게 내놓은 곳",
      href: insiderListHref("exec"),
      ticker: bigBuy.ticker,
      name: bigBuy.name,
      value: <Money usd={bigBuy.value} rate={ov.usdKrw} />,
    },
    bigCongress && {
      label: "의원이 많이 건드린 곳",
      href: insiderListHref("congress"),
      ticker: bigCongress.ticker,
      name: bigCongress.name,
      value: `${bigCongress.members}명`,
    },
    bigAdd && {
      label: "거물이 많이 담은 곳",
      href: insiderListHref("adds"),
      ticker: bigAdd.ticker,
      name: bigAdd.name,
      value: `${bigAdd.movers}곳`,
    },
    bigTrim && {
      label: "거물이 많이 줄인 곳",
      href: insiderListHref("trims"),
      ticker: bigTrim.ticker,
      name: bigTrim.name,
      value: `${bigTrim.movers}곳`,
    },
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  /**
   * ⚠️⚠️ 세 줄의 문법을 맞춰 둔 것이다 — **그 축이 마지막으로 받은 날, 그날 들어온 양**.
   *    창 합계에 창 끝점 날짜를 붙이지 말 것. 칸 이름이 '오늘의 업데이트'라, 옆의 날짜가
   *    곧 그 숫자의 날로 읽힌다(자세한 전말은 InsiderOverview.latestInsiderFilings 주석).
   */
  const updates = [
    { label: "임원 신고", n: ov.latestInsiderFilings.count, unit: "건", when: fmtDate(ov.latestInsiderFilings.date) },
    { label: "의원 신고", n: ov.latestCongressFilings.count, unit: "건", when: fmtDate(ov.latestCongressFilings.date) },
    {
      label: "화제 종목",
      n: ov.mentionedCount,
      unit: "개",
      when: fmtDate(ov.mentionDate),
      // ⚠️ 라벨은 형제 둘("임원 신고"·"의원 신고")과 길이를 맞춰야 한다. 예전엔
      //    "커뮤니티에 오른 미국 종목"(14자·118px)이라 이 줄만 두 줄로 접혔고, 그 바람에
      //    줄 높이가 달라져 오른쪽 숫자 정렬까지 어긋났다. 짧게 두고 설명은 물음표가 한다.
      help: "그날 주식 텔레그램에서 이름이 오르내린 미국 종목 수입니다.",
    },
  ];

  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고,
    // 원화는 크기를 가늠하라고 얹은 것이다. 쿠키로 한 번이라도 고르면 그 선택이 이긴다
    // (규칙은 globals.css 의 `[data-cur-default]`).
    <div data-cur-default="usd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 히어로 ──────────────────────────────────────────────────
          세 칸이다 — **규모 · 네 축 교집합 · 오늘 새로 들어온 것.**

          ⭐ 가운데 칸이 이 화면의 요지다. 어느 원천 하나로는 못 내는 말이라 제일 넓은
          자리를 준다. 그전엔 그 자리에 "미국 기업 임원과 미 하원의원, 월가 거물이
          무엇을 사고팔았는지 봅니다" 라는 문단이 있었는데, **페이지 부제와 같은 말**
          이라 한 판을 통째로 되풀이에 쓰고 있었다. 그래서 휑했다.

          ⚠️ 그 전에는 "111개 중 59개" 같은 커버리지 통계가 제일 큰 자리였다. 그건
          우리 사정이지 독자의 관심사가 아니다. 되돌리지 말 것. */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          {/* ① 규모 — 신뢰의 근거. 숫자를 세로로 쌓아 좁은 칸에서도 안 접힌다. */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              {/* ⭐ 이름은 카더라 두 화면과 같다. 같은 자리에 같은 것이 서 있으므로 같은
                  이름이라야 한다 — 화면마다 달리 부르면 독자가 매번 다시 읽는다. */}
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>
                모니터링 현황
              </span>
              {/* ⚠️ 규모는 90일, 아래 블록들은 7일이다. 한 화면에 두 창이 있으므로
                  규모 옆에 그 사실을 적는다 — 안 적으면 "1,722명 중 5건"으로 읽힌다.
                  ⭐ 자리는 제목 줄의 오른쪽 끝이다. 목록 맨 아래에 뒀더니 마지막 줄에
                     붙어 "월가 거물"의 각주처럼 읽혔다 — 이 말은 세 줄 전부에 걸린다. */}
              <span style={{ marginLeft: "auto", fontSize: T.small, color: C.muted, whiteSpace: "nowrap" }}>
                최근 {ov.scale.windowDays}일 공시 기준
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* ⚠️ **왼쪽이 이름, 오른쪽이 숫자다.** 여기만 숫자를 앞에 세우고 있었는데,
                  옆 칸(오늘의 업데이트)도 아래 카드들도 전부 이름이 먼저다 — 한 화면에서
                  줄의 문법이 갈리면 눈이 매번 어느 쪽을 봐야 할지 다시 정한다.
                  ⚠️⚠️ 이 칸은 옆 칸('오늘의 업데이트')과 **줄 조리법이 같아야 한다** —
                     라벨 11.5 · 값 17 · 패딩 10 · 아랫선. 그래야 두 칸의 구분선이 같은
                     높이에서 만난다. 한때 값만 21 이었는데, 줄 높이는 가장 큰 글자의 줄
                     상자가 정하므로 그것만으로 줄이 6px 씩 높아져 **구분선이 6·12px 어긋났다**
                     (2026-08-23 실측). 패딩으로 메우려 하지 말 것 — 첫 줄은 한쪽만, 나머지는
                     양쪽에 패딩이 붙어서 필요한 값이 4 와 7 로 갈린다. 글자를 맞추는 게 답이다. */}
              {[
                { n: ov.scale.officers, unit: "명", label: "기업 임원" },
                { n: ov.scale.members, unit: "명", label: "미 하원의원" },
                { n: ov.scale.managers, unit: "명", label: "월가 거물" },
              ].map((s, i, arr) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: i === 0 ? "0 0 10px" : "10px 0",
                    borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--c-sheet-row)",
                  }}
                >
                  <span style={{ fontSize: 11.5, color: C.sub, fontWeight: 600, wordBreak: "keep-all", minWidth: 0 }}>
                    {s.label}
                  </span>
                  <strong
                    style={{
                      fontFamily: MONO,
                      fontSize: 17,
                      fontWeight: 800,
                      color: C.ink,
                      letterSpacing: "-.02em",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {s.n.toLocaleString("ko-KR")}
                    <span style={{ fontSize: T.small, fontWeight: 700, color: C.sub2, marginLeft: 2 }}>{s.unit}</span>
                  </strong>
                </div>
              ))}
            </div>
          </div>

          {/* ② 오늘의 업데이트 — 신선도 */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>
                오늘의 업데이트
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {updates.map((u, i) => (
                <div
                  key={u.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: i === 0 ? "0 0 10px" : "10px 0",
                    borderBottom: i === updates.length - 1 ? "none" : "1px solid var(--c-sheet-row)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: 4,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: C.sub,
                      wordBreak: "keep-all",
                      minWidth: 0,
                    }}
                  >
                    {u.label}
                    {u.help && (
                      <span
                        className="hz-tip hz-tip-wide"
                        data-tip={u.help}
                        data-ga-tip={u.label}
                        style={{ display: "inline-flex", alignSelf: "center", cursor: "help", flexShrink: 0 }}
                      >
                        <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
                      </span>
                    )}
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
                    <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: u.n ? C.ink : C.muted }}>
                      {u.n.toLocaleString("ko-KR")}
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub2, marginLeft: 2 }}>{u.unit}</span>
                    </strong>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, minWidth: 30, textAlign: "right" }}>
                      {u.when}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ③ 오늘의 요점 — 넷째 칸이 아니라 **제일 넓은 칸**이다(다른 화면과 같은
              q·q·h 순서). 아래 카드 넷의 첫 줄을 그대로 끌어올린다.

              ⚠️ 여기 있던 "네 곳 모두에 흔적이 있는 종목 13개"를 뺐다. 실측해 보니
              **거물 축이 거르는 게 0개**였다 — 거물 보유가 1,454종목이라 대형주는
              자동으로 통과한다(카더라∩임원 30 → +의원 13 → +거물 13). "네 곳"이라
              적었지만 실질은 세 곳이고, 남는 건 대형주 목록에 가까웠다.
              ⛔ 되살리려면 거물 축을 '보유'가 아니라 '이번 분기에 움직인 것'으로
                 좁혀야 한다. 그냥 되돌리지 말 것. */}
          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>오늘의 요점</span>
            </div>
            {highlights.length === 0 ? (
              <p style={{ margin: 0, fontSize: T.body, color: C.sub, lineHeight: 1.7 }}>아직 채울 자료가 없습니다.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {highlights.map((h, i) => (
                  <Link
                    key={h.label}
                    href={h.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: i === 0 ? "0 0 9px" : "9px 0",
                      borderBottom: i === highlights.length - 1 ? "none" : "1px solid var(--c-sheet-row)",
                      textDecoration: "none",
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>{h.label}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <strong style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.ink }}>{h.ticker}</strong>
                      <span
                        style={{ fontSize: T.body, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {h.name}
                      </span>
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: MONO,
                        fontSize: 12,
                        fontWeight: 800,
                        color: C.ink,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.value}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 짝 ①: 거물이 분기 사이에 움직인 것 ─────────────────────────
          같은 계산의 양쪽 끝이라 나란히 둔다. 왼쪽이 늘린 쪽, 오른쪽이 줄인 쪽이다. */}
      <GroupTitle>월가 거물의 분기 변화</GroupTitle>
      <Pair>
{/* ── ① 거물이 늘린 종목 ─────────────────────────────────────── */}
      <HalfSheet>
        <SectionHead
          icon="trending_up"
          title="월가 거물이 늘린 종목"
          note={insiderNote("adds", ov)}
          noteHelp={moveHelp}
          desc="새로 담았거나 주식 수를 늘린 곳입니다."
        />
        {ov.managerAdds.length === 0 ? (
          <Empty>견줄 직전 분기가 아직 없습니다.</Empty>
        ) : (
          <RowList
            href="/insider/list/adds"
            // 맨 윗줄 **바로 밑에** 안내 쪽지를 끼운다(폰 첫 방문에만 뜬다, TapHint 참고).
            // 이 블록에만 두는 이유는 화면에서 제일 먼저 나오는 카드라서다 — 여덟 블록에
            // 다 달면 안내가 아니라 잡음이 된다. 전체보기(/insider/list/adds)에는 안 단다.
            items={withTapHint(addRows(ov.managerAdds.slice(0, BLOCK_ROWS)), {
              id: "adds",
              text: "종목을 누르면 임원·의원 기록까지 함께 나옵니다",
            })}
          />
        )}
      </HalfSheet>

{/* ── ② 거물이 줄인 종목 ─────────────────────────────────────── */}
      <HalfSheet>
        <SectionHead
          icon="trending_down"
          title="월가 거물이 줄인 종목"
          note={insiderNote("trims", ov)}
          noteHelp={moveHelp}
          desc="주식 수를 줄였거나 전량 정리한 곳입니다."
        />
        {ov.managerTrims.length === 0 ? (
          <Empty>견줄 직전 분기가 아직 없습니다.</Empty>
        ) : (
          <RowList
            href="/insider/list/trims"
            items={trimRows(ov.managerTrims.slice(0, BLOCK_ROWS))}
          />
        )}
      </HalfSheet>
      </Pair>

      {/* ── 짝 ②: 거물이 누구인가 ─────────────────────────────────────
          ⭐ 이 화면의 **유일한 사람 축 카드**다. 나머지 여섯이 전부 "어느 종목"을 묻는
             종목 목록이라, 한 장은 "어느 사람"을 물어야 화면이 한 종류로 안 읽힌다.
          ⭐ 겸사겸사 길을 낸다 — 이 카드가 생기기 전에는 거물 63명 상세로 들어가는
             입구가 **종목 상세의 보유자 표 하나뿐**이었다(종목을 먼저 골라야 사람이
             보였다). */}
      <GroupTitle>거물 명단과 증권가 시선</GroupTitle>
      <Pair>
{/* ── ③ 신고 합계 큰 순 ──────────────────────────────────────── */}
      <HalfSheet>
        <SectionHead
          icon="groups"
          title="운용자산이 큰 순"
          note={insiderNote("managers", ov)}
          noteHelp="13F가 신고하는 미국 상장주만 셉니다. 채권·현금·해외 주식은 빠집니다."
          desc="이름을 누르면 그 사람이 무엇을 들고 있는지 봅니다."
        />
        {ov.managerRanks.length === 0 ? (
          <Empty>명단을 못 읽었습니다.</Empty>
        ) : (
          <RowList
            href={insiderListHref("managers")}
            items={withTapHint(managerAumRows(ov.managerRanks.slice(0, BLOCK_ROWS), ov.usdKrw), {
              id: "managers",
              text: "이름을 누르면 담은 종목이 비중 순으로 나옵니다",
            })}
          />
        )}
      </HalfSheet>

{/* ── ④ 증권가가 긍정적으로 보는 종목 ────────────────────────────
          ⚠️ 제목이 **"증권가가"** 로 시작해야 한다. 우리 판정이 아니라 남의 등급을
             옮긴 것이라는 게 첫 글자에서 읽혀야 한다. */}
      <HalfSheet>
        <SectionHead
          icon="reviews"
          title="증권가가 긍정적으로 보는 종목"
          note={insiderNote("analyst", ov)}
          noteHelp="stockanalysis.com이 싣는 S&P Global 집계입니다. 적극 매수를 낸 애널리스트가 많은 순입니다."
          desc={`등급을 낸 애널리스트가 ${RANK_MIN_ANALYSTS}명 이상인 종목만 세웁니다.`}
        />
        {ov.analystTop.length === 0 ? (
          <Empty>아직 받은 컨센서스가 없습니다.</Empty>
        ) : (
          <RowList href={insiderListHref("analyst")} items={analystTopRows(ov.analystTop.slice(0, BLOCK_ROWS))} />
        )}
      </HalfSheet>
      </Pair>

      {/* ── 짝 ③: 사람이 신고한 매매 ─────────────────────────────────
          임원과 의원은 둘 다 "자기 이름으로 신고할 의무가 있는 사람"이라 나란히 둔다. */}
      <GroupTitle>임원과 의원의 신고</GroupTitle>
      <Pair>
{/* ── ③ 임원이 자기 돈으로 산 것 ─────────────────────────────── */}
      <HalfSheet>
        <SectionHead
          icon="account_balance_wallet"
          title="임원이 신고한 매매"
          note={insiderNote("exec", ov)}
          noteHelp="옵션 행사에 딸린 매도가 섞입니다. 금액은 처분만 더한 값입니다."
          desc="종목으로 묶어 금액이 큰 순입니다. 장내 매수는 파랗게 적었습니다."
        />
        {ov.buys.length === 0 ? (
          <Empty>최근에는 없습니다.</Empty>
        ) : (
          <RowList
            href="/insider/list/exec"
            items={execRows(ov.buys.slice(0, BLOCK_ROWS), ov.usdKrw)}
          />
        )}
      </HalfSheet>

{/* ── ④ 의원이 사고판 것 ─────────────────────────────────────── */}
      <HalfSheet>
        <SectionHead
          icon="account_balance"
          title="미 하원의원이 사고판 것"
          note={insiderNote("congress", ov)}
          noteHelp="금액은 구간으로만 신고돼 건수로 적었습니다. 신고까지 최대 45일 걸립니다."
          desc="카더라 밖 종목까지 보고, 여러 의원이 건드린 순입니다."
        />
        {ov.congressTickers.length === 0 ? (
          <Empty>최근에는 없습니다.</Empty>
        ) : (
          <RowList
            href="/insider/list/congress"
            items={congressRows(ov.congressTickers.slice(0, BLOCK_ROWS))}
          />
        )}
      </HalfSheet>
      </Pair>

      {/* ── 짝 ④: 카더라에 오른 종목의 상태 ───────────────────────────
          "얼마나 회자되나"와 "거물이 들고 있나"는 같은 종목을 두 각도에서 본다. */}
      <GroupTitle>카더라에 오른 종목</GroupTitle>
      <Pair>
{/* ── ⑤ 커뮤니티에서 뜨거운 종목 ─────────────────────────────────── */}
      <HalfSheet>
        <SectionHead
          icon="local_fire_department"
          title="커뮤니티에서 뜨거운 종목"
          note={insiderNote("hot", ov)}
          noteHelp={`언급은 하루치, 임원 신고는 최근 ${ov.windowDays}일입니다. 시점이 다릅니다.`}
          desc="주식 텔레그램에서 가장 많이 회자된 미국 종목입니다."
        />
        {ov.rows.length === 0 ? (
          <Empty>아직 채울 자료가 없습니다.</Empty>
        ) : (
          <RowList
            href="/insider/list/hot"
            items={hotRowsView(ov.rows.slice(0, BLOCK_ROWS), ov.usdKrw)}
          />
        )}
      </HalfSheet>

{/* ── ⑥ 거물이 들고 있는 종목 ─────────────────────────────────── */}
      <HalfSheet>
        <SectionHead
          icon="groups"
          title="월가 거물이 들고 있는 종목"
          note={insiderNote("holders", ov)}
          noteHelp={`분기말 기준이라 지금과 다를 수 있습니다${
            ov.managerQuarters.length > 0 ? ` (기준 ${ov.managerQuarters.map(quarterLabel).join(" · ")})` : ""
          }.`}
          desc="카더라에 오른 종목을 거물 몇 명이 들고 있는지 봅니다."
        />
        {holderAll.length === 0 ? (
          <Empty>최근에는 없습니다.</Empty>
        ) : (
          <RowList
            href="/insider/list/holders"
            items={holderRowsView(holderAll.slice(0, BLOCK_ROWS), ov.scale.managers)}
          />
        )}
      </HalfSheet>
      </Pair>

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는
          2026-08-23 에 뺐다. **전역 푸터(app/Footer.tsx)가 이미 같은 고지를 한다** —
          "투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과 책임은 이용자 본인에게
          있습니다." 그 푸터는 AppShell 이 모든 화면에 붙이므로 이 화면에도 뜬다.
          ⚠️ 다시 넣지 말 것. 넣더라도 **푸터가 그 고지를 잃은 뒤에만** 넣는다. */}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getInsiderOverview } from "@/lib/insider-data";

import { SectionHead } from "../../../kadera/SectionHead";
import { pageMetadata } from "../../../seo";
import { C, Icon } from "../../../ui";
import { ExpandableList } from "../../../kadera/ExpandableList";
import { INSIDER_LISTS, INSIDER_LIST_MAX, INSIDER_LIST_SLUGS, type InsiderListSlug } from "../../lists";
import {
  Empty,
  WIDE_COLS,
  WideHead,
  insiderNote,
  wideAnalystRows,
  wideCongressRows,
  wideExecRows,
  wideHolderRows,
  wideHotRows,
  wideManagerRows,
  wideMoveRows,
} from "../../parts";

/**
 * 카드 하나의 **전체보기**. 여섯 장이 이 한 파일을 나눠 쓴다.
 *
 * ## ⚠️ 새로 조회하지 않는다
 *
 * `getInsiderOverview()` 를 그대로 부른다. 그 함수가 이미 목록을 **자르지 않고**
 * 만들어 두기 때문이다(메인 화면이 다섯 줄만 떼어 쓸 뿐이다). 여기서 따로 쿼리를
 * 짜면 정렬 규칙이 두 벌이 되고, 그러면 "카드의 6번째"와 "전체보기의 6번째"가
 * 언젠가 달라진다. `cache()` 로 감싸여 있어 같은 요청 안에서는 한 번만 돈다.
 *
 * ## ⚠️ 줄도 새로 그리지 않는다
 *
 * `parts.tsx` 의 같은 빌더를 부른다. 전체보기는 "이 카드의 나머지"라, 줄의 생김새가
 * 조금이라도 갈리면 다른 자료로 읽힌다.
 *
 * ## ⚠️ 시세는 위쪽 몇 줄에만 붙는다
 *
 * `getInsiderOverview` 가 시세를 상위 몇 종목만 받아 온다(야후 호출을 아끼려고).
 * 그 아래는 값이 비고, `Quote` 가 "-" 를 그린다 — 틀린 숫자보다 낫다.
 */
export const dynamic = "force-dynamic";

function specOf(kind: string) {
  return INSIDER_LIST_SLUGS.includes(kind as InsiderListSlug) ? INSIDER_LISTS[kind as InsiderListSlug] : null;
}

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  const spec = specOf(kind);
  if (!spec) return pageMetadata({ title: "내부자 리포트 | hatzze", description: "", path: "/insider" });
  return pageMetadata({
    title: `${spec.title} | 내부자 리포트 | hatzze`,
    description: spec.sub,
    path: `/insider/list/${kind}`,
  });
}

export default async function InsiderListPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const spec = specOf(kind);
  if (!spec) notFound();

  const ov = await getInsiderOverview();

  // ⚠️ 메인 화면과 **같은 정렬·같은 빌더**를 쓴다. 여기서 다시 sort 하지 말 것.
  // ⚠️ 자르는 것도 여기서 한다 — 안 그릴 줄까지 만들 이유가 없다.
  const cut = <T,>(rows: T[]) => rows.slice(0, INSIDER_LIST_MAX);

  /**
   * 이 페이지가 그릴 카드들.
   *
   * ⭐ 임원·의원은 **매수와 매도를 따로 카드로 낸다**. 한 카드에 섞어 놓으면
   * 금액 큰 매도가 목록을 덮어 드문 매수가 안 보인다 — 실측으로 임원 장내매수는 7일에
   * 6종목, 매도는 65종목이다.
   *
   * ⚠️ 한 종목이 양쪽에 다 뜰 수 있다. 여럿이 같은 종목을 사고팔았으면 그게 사실이다.
   */
  type Card = {
    title: string;
    icon: string;
    desc: string;
    items: React.ReactNode[];
    total: number;
    /** 열 구성과 머리 이름. 데이터 행과 **같은 문자열**을 써야 칸이 맞는다. */
    cols: string;
    heads: (string | null)[];
  };
  const cards: Card[] = ((): Card[] => {
    switch (kind as InsiderListSlug) {
      case "exec": {
        const bought = ov.buys.filter((b) => b.boughtValue > 0).sort((a, b) => b.boughtValue - a.boughtValue);
        const sold = ov.buys.filter((b) => b.disposedValue > 0).sort((a, b) => b.disposedValue - a.disposedValue);
        return [
          {
            title: "임원이 장내에서 산 종목",
            icon: "trending_up",
            desc: "자기 돈으로 산 것만 모았습니다. 우리 종목 신고의 1%뿐이라 드뭅니다.",
            items: wideExecRows(cut(bought), ov.usdKrw, "buy"),
            total: bought.length,
            cols: WIDE_COLS.exec,
            heads: ["종목", "신고", "금액"],
          },
          {
            title: "임원이 내놓은 종목",
            icon: "trending_down",
            desc: "금액이 큰 순입니다. 무엇으로 내놓았는지 옆에 적었습니다.",
            items: wideExecRows(cut(sold), ov.usdKrw, "sell"),
            total: sold.length,
            cols: WIDE_COLS.exec,
            heads: ["종목", "신고", "금액"],
          },
        ];
      }
      case "congress": {
        // ⚠️⚠️ **사람 수를 먼저 본다.** 건수로 세우면 많이 거래하는 의원 하나가 카드를
        //      통째로 먹는다 — 실제로 건수 정렬에서 한 사람이 두 카드의 1·2위였다.
        //      메인 카드가 같은 이유로 이미 사람 수 우선이다(insider-data.ts 주석).
        const bought = [...ov.congressTickers]
          .filter((c) => c.buys > 0)
          .sort((a, b) => b.buyMembers.length - a.buyMembers.length || b.buys - a.buys);
        const sold = [...ov.congressTickers]
          .filter((c) => c.sells > 0)
          .sort((a, b) => b.sellMembers.length - a.sellMembers.length || b.sells - a.sells);
        return [
          {
            title: "의원이 산 종목",
            icon: "trending_up",
            desc: "여러 의원이 산 순입니다. 이름은 산 의원만 적었습니다.",
            items: wideCongressRows(cut(bought), "buy"),
            total: bought.length,
            cols: WIDE_COLS.congress,
            heads: ["종목", "의원", "건수"],
          },
          {
            title: "의원이 판 종목",
            icon: "trending_down",
            desc: "여러 의원이 판 순입니다. 이름은 판 의원만 적었습니다.",
            items: wideCongressRows(cut(sold), "sell"),
            total: sold.length,
            cols: WIDE_COLS.congress,
            heads: ["종목", "의원", "건수"],
          },
        ];
      }
      case "adds":
        return [
          {
            title: spec.title,
            icon: spec.icon,
            desc: spec.sub,
            items: wideMoveRows(cut(ov.managerAdds), "add"),
            total: ov.managerAdds.length,
            cols: WIDE_COLS.move,
            heads: ["종목", "늘린 거물", "인원"],
          },
        ];
      case "trims":
        return [
          {
            title: spec.title,
            icon: spec.icon,
            desc: spec.sub,
            items: wideMoveRows(cut(ov.managerTrims), "trim"),
            total: ov.managerTrims.length,
            cols: WIDE_COLS.move,
            heads: ["종목", "줄인 거물", "인원"],
          },
        ];
      case "hot":
        return [
          {
            title: spec.title,
            icon: spec.icon,
            desc: spec.sub,
            items: wideHotRows(cut(ov.rows), ov.usdKrw),
            total: ov.rows.length,
            cols: WIDE_COLS.hot,
            heads: ["종목", "커뮤니티", "시세"],
          },
        ];
      case "managers":
        return [
          {
            title: spec.title,
            icon: spec.icon,
            desc: spec.sub,
            items: wideManagerRows(cut(ov.managerRanks), ov.usdKrw),
            total: ov.managerRanks.length,
            cols: WIDE_COLS.managers,
            heads: ["거물", "소속", "보유", "운용자산"],
          },
        ];
      case "analyst":
        return [
          {
            title: spec.title,
            icon: spec.icon,
            desc: spec.sub,
            items: wideAnalystRows(cut(ov.analystTop)),
            total: ov.analystTop.length,
            cols: WIDE_COLS.analyst,
            heads: ["종목", "증권가 종합", "적극 매수"],
          },
        ];
      case "holders": {
        // 메인 화면과 같은 순서. 저기서도 이 세 줄이 그대로다.
        const rows = [...ov.rows]
          .filter((r) => r.holders > 0)
          .sort((a, b) => b.holders - a.holders || b.mentions - a.mentions);
        return [
          {
            title: spec.title,
            icon: spec.icon,
            desc: spec.sub,
            items: wideHolderRows(cut(rows), ov.scale.managers),
            total: rows.length,
            cols: WIDE_COLS.holders,
            heads: ["종목", "든 거물", "보유"],
          },
        ];
      }
    }
  })();

  // ⚠️ 여기서 규칙을 다시 쓰지 않는다. 카드와 **같은 함수**를 부른다 — 한때 이 자리에
  //    자기 삼항식이 있었고, 카드만 날짜 기준으로 바뀌면서 넷이 어긋났다(insiderNote 주석).
  const note = insiderNote(kind as InsiderListSlug, ov);

  /** 잘렸으면 **알약이 그 사실을 적는다.** "전체보기"라 해 놓고 조용히 100개만 내면 거짓말이 된다. */
  const countNote = (total: number, shown: number) =>
    total > shown ? `${total.toLocaleString("ko-KR")}개 중 ${shown}개` : `${total.toLocaleString("ko-KR")}개`;
  /* ⚠️ 잘림은 **알약이 이미 말한다**("1,000개 중 100개"). 툴팁에 같은 말을 한 번 더
     넣었더니 96자가 되어 아무도 안 읽는 길이가 됐다 — 한 자리에서 한 번만 말한다. */

  return (
    // ⭐ 내부자 리포트는 **달러가 기본**이다 — 재료가 전부 미국 공시라 달러가 원본이고,
    // 원화는 크기를 가늠하라고 얹은 것이다. 쿠키로 한 번이라도 고르면 그 선택이 이긴다
    // (규칙은 globals.css 의 `[data-cur-default]`).
    <div data-cur-default="usd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 돌아갈 길. 사이드바가 /insider 를 켠 채로 두지만(주소가 그 아래라), 어느 카드에서
          왔는지는 사이드바가 못 말한다. */}
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

      {cards.map((card) => (
        <section className="hz-sheet" key={card.title}>
          <SectionHead
            icon={card.icon}
            title={card.title}
            // ⚠️ `right` 를 주면 SectionHead 가 note 알약을 통째로 안 그린다 — 물음표
            //    툴팁이 그 알약에 붙어 있어서 단서가 같이 사라진다. 개수는 알약 안에 적는다.
            note={`${note} · ${countNote(card.total, card.items.length)}`}
            noteHelp={spec.help}
            desc={card.desc}
          />
          {card.items.length === 0 ? (
            <Empty>최근에는 없습니다.</Empty>
          ) : (
            /* ⚠️ 처음부터 100줄을 펴면 카드 두 장이 200줄 벽이 된다. 열 줄로 열고
                눌러서 늘린다 — 카더라의 '더 보기'와 같은 부품이다. */
            <>
              {/* 열 머리 — 무슨 칸인지 말한다. 데이터 행과 **같은 격자**를 써야 칸이 맞는다. */}
              <WideHead cols={card.cols} labels={card.heads} />
              <ExpandableList
                items={card.items}
                name={`list_${kind}_${card.title}`}
                initial={10}
                step={20}
                listStyle={{ padding: 0, display: "block" }}
                footerClassName="hz-sheet-foot-row"
              />
            </>
          )}
        </section>
      ))}

      {/* ⛔ 여기 있던 "SEC와 미 하원이 공개한 공시를 그대로 옮긴 것입니다 …" 각주는
          2026-08-23 에 뺐다. **전역 푸터(app/Footer.tsx)가 이미 같은 고지를 한다** —
          "투자 조언이나 매수·매도 추천이 아닙니다. 모든 투자 판단과 책임은 이용자 본인에게
          있습니다." 그 푸터는 AppShell 이 모든 화면에 붙이므로 이 화면에도 뜬다.
          ⚠️ 다시 넣지 말 것. 넣더라도 **푸터가 그 고지를 잃은 뒤에만** 넣는다. */}
    </div>
  );
}


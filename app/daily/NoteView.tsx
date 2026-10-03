import Link from "next/link";

import { formatKstUpdate } from "@/lib/format";
import {
  fmtNoteDate,
  fmtNoteDateShort,
  fmtNoteDay,
  noteHref,
  type DailyNote,
  type NoteNeighbors,
  type NoteStocks,
  type NoteStub,
} from "@/lib/daily-note";
import { noteHeadings, parseNoteMarkdown, type NoteBlock, type NoteInline } from "@/lib/daily-note-md";
import { stockHref } from "@/lib/stock-page";

import { CoverLinkCell, CoverMeta, Module } from "../kadera/V2Modules";
import { StockLogo } from "../StockLogo";
import { Icon } from "../ui";
import { ShareButton } from "./ShareButton";
import { NoteArchiveList } from "./NoteArchiveList";

/**
 * 데일리 노트 한 편. `/daily`(최신)와 `/daily/[date]` 가 같은 것을 그린다.
 *
 * ## 서버가 그린다
 *
 * 글자가 전부인 화면이라 클라이언트 컴포넌트는 공유 단추와 지난 노트 넘김뿐이다. 크롤러가 첫 HTML 에서 본문을
 * 그대로 읽어야 이 화면이 검색에서 답할 수 있다(종목 실주소 화면과 같은 까닭). 목차의 이동도 `#sec-N` 앵커다.
 *
 * ## v2(2026-10-03) — 한 줄기
 *
 * 첫 줄 띠(이전 글 · 다음 글 · 업데이트) → 글(판 폭, 머리 아래 목차) → 언급된 종목(판 폭) → 지난 노트(판 폭, 한 주가 한 줄).
 * 예전엔 [글 | 오른쪽 칸(목차 · 언급된 종목 · 지난 노트)] 두 줄기였는데 글이 칸보다 늘 길어 칸 아래가 비었다 —
 * 1,440 에서 658px, 1,280 에서 2,032px(칸 321px 에 글 661px 로 눌려 글도 3,147px 로 길어졌다).
 * ⛔ 오른쪽 칸을 화면에 따라 붙이는 것(sticky)은 답이 아니다(2026-09-06 · 10-02 두 번) — 긴 것은 판 폭 전체로 뺀다.
 * 글 아래 앞뒤 글 카드는 걷었다 — 첫 줄 띠와 지난 노트가 같은 길을 낸다.
 *
 * ⚠️ h1 은 셸이 갖는다(`/daily` 는 sr-only '데일리 노트', 날짜 주소는 글 제목이 h1 — NoteArticle 주석).
 *    글 제목 · 모듈 제목은 h2, 꼭지는 h3 다.
 */

function Inline({ inline }: { inline: NoteInline[] }) {
  return (
    <>
      {inline.map((x, i) => {
        if (x.t === "strong") return <b key={i}>{x.s}</b>;
        if (x.t === "link") {
          // 굵게 표시 안에 있던 주소는 굵기를 지킨 채 링크가 된다(출처 줄이 그 자리다).
          const a = x.href.startsWith("/") ? (
            <Link href={x.href}>{x.s}</Link>
          ) : (
            <a href={x.href} target="_blank" rel="noopener noreferrer">
              {x.s}
            </a>
          );
          return x.strong ? <b key={i}>{a}</b> : <span key={i}>{a}</span>;
        }
        return <span key={i}>{x.s}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: NoteBlock }) {
  switch (block.k) {
    case "heading":
      return block.level === 2 ? <h2 id={block.id}>{block.text}</h2> : <h3 id={block.id}>{block.text}</h3>;
    case "rule":
      return <hr className="hz-note-rule" />;
    case "table":
      return (
        <div className="hz-note-tablewrap">
          <table className="hz-note-table">
            {block.head.length > 0 && (
              <thead>
                <tr>
                  {block.head.map((h, i) => (
                    <th key={i} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "para":
      return (
        <p className={block.kind === "body" ? undefined : `hz-note-${block.kind}`}>
          <Inline inline={block.inline} />
        </p>
      );
  }
}

/**
 * 글 한 편 — 머리(날짜 · 제목) · 목차 · 본문 · 공유.
 *
 * ⭐ 날짜 주소(`/daily/2026-09-05`)에서는 글 제목이 **h1** 이다. 셸은 그 주소의 '데일리 노트'를 h1 이 아닌 글자로 그린다
 * (AppShell LABEL_TITLED_PREFIXES). 예전엔 날짜마다 h1 이 똑같이 '데일리 노트'라 글마다 고유한 제목 신호가 없었다(2026-09-30 점검).
 * `/daily`(가장 최근 글)는 셸의 '데일리 노트'가 h1 이고 글 제목은 h2 그대로다 — 그 화면의 canonical 이 날짜 주소다.
 *
 * 목차는 꼭지(h3)만 — 그 글의 소제목이 곧 그날의 이야기 목록이다. 판 폭이라 두 단으로 편다.
 * ⛔ 꼭지 수("6꼭지")를 목차 머리에 적지 않는다(2026-09-06 지시) — 번호가 이미 센다.
 */
function NoteArticle({ note, blocks, dated }: { note: DailyNote; blocks: NoteBlock[]; dated: boolean }) {
  const Title = dated ? "h1" : "h2";
  const toc = noteHeadings(blocks).filter((h) => h.level === 3);
  return (
    <article className="v2-mod v2-nt-art">
      <header className="v2-nt-head">
        <time dateTime={note.date}>{fmtNoteDate(note.date)}</time>
        <Title className="v2-nt-title">{note.title}</Title>
      </header>
      {toc.length > 0 && (
        <nav className="v2-nt-toc" aria-label="글의 꼭지">
          <ol>
            {toc.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="hz-note-body v2-nt-body">
        {blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
      {/* 공유는 **날짜가 든 주소**로 넘긴다 — `/daily` 를 공유하면 내일 다른 글이 열린다. */}
      <div className="v2-nt-foot">
        <ShareButton path={noteHref(note.date)} title={note.title} />
      </div>
    </article>
  );
}

/**
 * 언급된 종목 — 판 폭에 여러 단(국내는 이름 · 종가 · 등락, 미국은 이름 · 티커). 종목이 많은 날(20곳 넘게)도 키가 낮다.
 *
 * ⚠️ 종가는 오늘 글이면 야후 실시간(카더라 카드와 같은 소스), 지난 글이면 `stocks` 표의 **최근** KRX 값이다 —
 *    지난 글을 열어도 오늘 시세가 보인다. 기준일이 다른 줄은 그 줄에 따로 적는다(lib/daily-note getNoteStocks 머리말).
 * ⭐ 등락은 +/− 부호(v2 공통) — ▲▼ 는 걷었다.
 */
function NoteStocksModule({ stocks }: { stocks: NoteStocks }) {
  if (!stocks.kr.length && !stocks.us.length) return null;
  const dates = stocks.kr.map((s) => s.priceDate).filter((d): d is string => Boolean(d));
  const latest = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  return (
    <Module id="stocks" title="언급된 종목" meta={`국내 ${stocks.kr.length} · 미국 ${stocks.us.length}`}>
      <ul className="v2-nt-stocks">
        {stocks.kr.map((s) => {
          const chg = s.changeRate;
          return (
            <li key={s.code}>
              <Link href={stockHref(s.code)} className="v2-nt-stock" data-ga="note_stock_click">
                <StockLogo code={s.code} name={s.name} market={s.market} size={20} />
                <span className="v2-nt-stock-name">{s.name}</span>
                <span className="v2-nt-stock-px">
                  {s.price != null ? <b>{s.price.toLocaleString("ko-KR")}</b> : <em>시세 없음</em>}
                  {chg != null && (
                    <i className={chg > 0 ? "is-up" : chg < 0 ? "is-down" : undefined}>
                      {chg > 0 ? "+" : chg < 0 ? "-" : ""}
                      {Math.abs(chg).toFixed(2)}%
                    </i>
                  )}
                  {s.priceDate && latest && s.priceDate !== latest && <em>{fmtNoteDay(s.priceDate)}</em>}
                </span>
              </Link>
            </li>
          );
        })}
        {/* 미국 종목은 종가 원천이 없어 이름 · 티커만. 같은 줄 꼴로 이어 세운다(예전 칩 꼴은 v2 결과 안 맞는다). */}
        {stocks.us.map((u) => (
          <li key={u.ticker}>
            <span className="v2-nt-stock is-us">
              <StockLogo code={u.ticker} name={u.name} market="US" size={20} />
              <span className="v2-nt-stock-name">{u.name}</span>
              <span className="v2-nt-stock-px">
                <em>{u.ticker}</em>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Module>
  );
}

/**
 * 글이 없을 때. **조회 실패와 '아직 없음' 을 다른 문장으로** 낸다 — 같은 문장으로 두면
 * 표가 없는 고장이 정상처럼 보인다(lib/daily-note.ts 머리말).
 */
function NoteEmpty({ failed }: { failed: boolean }) {
  return (
    <section className="v2-mod v2-nt-empty">
      <Icon name={failed ? "cloud_off" : "edit_note"} style={{ fontSize: 24 }} />
      <p>{failed ? "글을 불러오지 못했습니다. 잠시 뒤 다시 열어 주십시오." : "아직 올라온 글이 없습니다. 매일 저녁 한 편씩 올라옵니다."}</p>
    </section>
  );
}

export function NoteView({
  note,
  failed,
  neighbors,
  archive,
  stocks,
  dated = false,
}: {
  note: DailyNote | null;
  failed: boolean;
  neighbors: NoteNeighbors;
  archive: NoteStub[];
  stocks: NoteStocks;
  /** 날짜 주소에서 그리는가. 그러면 글 제목이 h1 이다(NoteArticle 주석). */
  dated?: boolean;
}) {
  const blocks = note ? parseNoteMarkdown(note.bodyMd) : [];
  const sections = noteHeadings(blocks).filter((h) => h.level === 3).length;
  // 표기 · 주소는 서버가 끝낸다. 지난 노트 넘김은 클라이언트 컴포넌트라 lib/daily-note.ts 를 못 문다.
  const items = archive.map((n) => ({ date: n.date, title: n.title, href: noteHref(n.date), label: fmtNoteDateShort(n.date) }));
  const { prev, next } = neighbors;
  return (
    <div className="hz-tx v2-kd v2-nt">
      {/* 첫 줄 — 앞뒤 글(한쪽이 없으면 그 칸을 안 세운다 · 안 눌리는 칸은 고장으로 보인다) · 업데이트 */}
      <div className="v2-cover">
        {prev && <CoverLinkCell c={{ cap: "이전 글", name: fmtNoteDateShort(prev.date), href: noteHref(prev.date), ga: "note_prev_click" }} />}
        {next && <CoverLinkCell c={{ cap: "다음 글", name: fmtNoteDateShort(next.date), href: noteHref(next.date), ga: "note_next_click" }} />}
        <CoverMeta
          updated={note ? formatKstUpdate(note.updatedAt, "업데이트") : "글 준비 중"}
          basis={note ? [sections ? `꼭지 ${sections}` : null, stocks.kr.length + stocks.us.length ? `종목 ${stocks.kr.length + stocks.us.length}` : null].filter(Boolean).join(" · ") || null : null}
        />
      </div>
      {note ? <NoteArticle note={note} blocks={blocks} dated={dated} /> : <NoteEmpty failed={failed} />}
      {note && <NoteStocksModule stocks={stocks} />}
      {items.length > 0 && <NoteArchiveList items={items} current={note?.date ?? null} />}
    </div>
  );
}

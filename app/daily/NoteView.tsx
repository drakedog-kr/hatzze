import Link from "next/link";

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

import { Icon, MONO } from "../ui";
import { ShareButton } from "./ShareButton";

/**
 * 데일리 노트 한 편 + 오른쪽 칸. `/daily`(최신)와 `/daily/[date]` 가 같은 것을 그린다.
 *
 * ## 서버가 그린다
 *
 * 글자가 전부인 화면이라 클라이언트 컴포넌트가 하나도 없다. 크롤러가 첫 HTML 에서 본문을
 * 그대로 읽어야 이 화면이 검색에서 답할 수 있다(종목 실주소 화면과 같은 까닭).
 * 목차의 이동도 `#sec-N` 앵커라 자바스크립트가 없다.
 *
 * ## 두 칸 (2026-09-06 피드백)
 *
 * 처음엔 본문 720px 한 칸이었는데 화면의 오른쪽 3분의 1이 비었다. 그 자리에 세 카드를 둔다 —
 * 목차(누르면 그 꼭지로), 언급된 종목(국내는 최근 종가와 함께), 지난 노트. 넓은 화면에서만
 * 두 칸이고 좁으면 본문 아래로 내려간다(globals.css `.hz-note-page`).
 *
 * ⚠️ h1 은 셸(PageHeader)이 갖는다 — "데일리 노트". 글 제목과 오른쪽 카드 제목은 h2, 꼭지는 h3 다.
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

function NoteArticle({ note, blocks }: { note: DailyNote; blocks: NoteBlock[] }) {
  return (
    <article className="hz-note hz-sheet">
      <header className="hz-note-head">
        <time className="hz-note-date" dateTime={note.date}>
          {fmtNoteDate(note.date)}
        </time>
        <h2 className="hz-note-title">{note.title}</h2>
      </header>
      <div className="hz-note-body">
        {blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
      {/* 공유는 **날짜가 든 주소**로 넘긴다 — `/daily` 를 공유하면 내일 다른 글이 열린다. */}
      <div className="hz-note-foot">
        <ShareButton path={noteHref(note.date)} title={note.title} />
      </div>
    </article>
  );
}

/** 앞뒤 글. 한쪽이 없으면 그 자리는 비운다 — 안 눌리는 글자를 두면 고장으로 보인다. */
function NoteNav({ neighbors }: { neighbors: NoteNeighbors }) {
  const { prev, next } = neighbors;
  if (!prev && !next) return null;
  return (
    <nav className="hz-note-nav" aria-label="앞뒤 글">
      {prev ? (
        <Link href={noteHref(prev.date)} className="hz-note-nav-prev">
          <Icon name="arrow_back" style={{ fontSize: 16 }} />
          <span>
            <small>{fmtNoteDateShort(prev.date)}</small>
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={noteHref(next.date)} className="hz-note-nav-next">
          <span>
            <small>{fmtNoteDateShort(next.date)}</small>
            {next.title}
          </span>
          <Icon name="arrow_forward" style={{ fontSize: 16 }} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** 오른쪽 칸의 카드 한 장. 제목은 h2 — 글 제목과 같은 층이다(둘 다 화면 h1 의 자식). */
function RailCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="hz-sheet hz-note-rail-card">
      <header className="hz-note-rail-head">
        <h2>{title}</h2>
        {note && <span>{note}</span>}
      </header>
      {children}
    </section>
  );
}

/** 목차. 꼭지(h3)만 — 그 글의 소제목이 곧 그날의 이야기 목록이다. 누르면 앵커로 뛴다. */
function NoteToc({ blocks }: { blocks: NoteBlock[] }) {
  const items = noteHeadings(blocks).filter((h) => h.level === 3);
  if (!items.length) return null;
  // ⛔ 꼭지 수("6꼭지")를 머리에 적지 않는다(2026-09-06 지시). 아래 번호가 이미 세고 있어
  //    같은 말이 두 번 나온다.
  return (
    <RailCard title="목차">
      <nav aria-label="글의 꼭지">
        <ol className="hz-note-toc">
          {items.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`}>{h.text}</a>
            </li>
          ))}
        </ol>
      </nav>
    </RailCard>
  );
}

/**
 * 언급된 종목. 국내는 이름·최근 종가·등락률, 미국은 이름만(종가 원천이 없다).
 *
 * ⚠️ 종가는 오늘 글이면 야후 실시간(카더라 카드와 같은 소스), 지난 글이면 `stocks` 표의
 *    **최근** KRX 값이다 — 지난 글을 열어도 오늘 시세가 보인다. 기준일이 다른 줄은 그 줄에
 *    따로 적는다(lib/daily-note getNoteStocks 머리말).
 */
function NoteStocksCard({ stocks }: { stocks: NoteStocks }) {
  if (!stocks.kr.length && !stocks.us.length) return null;
  const dates = stocks.kr.map((s) => s.priceDate).filter((d): d is string => Boolean(d));
  const latest = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  return (
    <RailCard title="언급된 종목" note={`국내 ${stocks.kr.length} · 미국 ${stocks.us.length}`}>
      {stocks.kr.length > 0 && (
        <ul className="hz-note-stocks">
          {stocks.kr.map((s) => {
            const chg = s.changeRate;
            return (
              <li key={s.code}>
                <Link href={stockHref(s.code)}>
                  <span className="hz-note-stock-name">{s.name}</span>
                  <span className="hz-note-stock-px" style={{ fontFamily: MONO }}>
                    {s.price != null ? <b>{s.price.toLocaleString("ko-KR")}</b> : <small>시세 없음</small>}
                    {chg != null && (
                      <i style={{ color: chg > 0 ? "var(--c-hot-ink)" : chg < 0 ? "var(--c-cold-ink)" : "var(--c-sub2)" }}>
                        {chg > 0 ? "▲" : chg < 0 ? "▼" : ""}
                        {Math.abs(chg).toFixed(2)}%
                      </i>
                    )}
                    {s.priceDate && latest && s.priceDate !== latest && <small>{fmtNoteDay(s.priceDate)}</small>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {stocks.us.length > 0 && (
        <div className="hz-note-us">
          <span className="hz-note-us-lbl">미국</span>
          {stocks.us.map((u) => (
            <span key={u.ticker} className="hz-note-chip">
              {u.name}
              <small>{u.ticker}</small>
            </span>
          ))}
        </div>
      )}
    </RailCard>
  );
}

/** 지난 노트 목록. 지금 보고 있는 글은 `aria-current` 로 표시하고 링크는 그대로 둔다. */
function NoteArchive({ notes, current }: { notes: NoteStub[]; current: string | null }) {
  if (!notes.length) return null;
  const year = notes[0].date.slice(0, 4);
  return (
    <RailCard title="지난 노트" note={`${year}년`}>
      <ul className="hz-note-archive" aria-label={`${year}년 지난 노트`}>
        {notes.map((n) => (
          <li key={n.date} aria-current={n.date === current ? "page" : undefined}>
            <Link href={noteHref(n.date)}>
              <time dateTime={n.date}>{fmtNoteDateShort(n.date)}</time>
              <span>{n.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

/**
 * 글이 없을 때. **조회 실패와 '아직 없음' 을 다른 문장으로** 낸다 — 같은 문장으로 두면
 * 표가 없는 고장이 정상처럼 보인다(lib/daily-note.ts 머리말).
 */
function NoteEmpty({ failed }: { failed: boolean }) {
  return (
    <div className="hz-note hz-sheet hz-note-empty">
      <Icon name={failed ? "cloud_off" : "edit_note"} style={{ fontSize: 28 }} />
      <p>{failed ? "글을 불러오지 못했습니다. 잠시 뒤 다시 열어 주십시오." : "아직 올라온 글이 없습니다. 매일 저녁 한 편씩 올라옵니다."}</p>
    </div>
  );
}

export function NoteView({
  note,
  failed,
  neighbors,
  archive,
  stocks,
}: {
  note: DailyNote | null;
  failed: boolean;
  neighbors: NoteNeighbors;
  archive: NoteStub[];
  stocks: NoteStocks;
}) {
  const blocks = note ? parseNoteMarkdown(note.bodyMd) : [];
  return (
    <div className="hz-tx hz-note-page">
      <div className="hz-note-main">
        {note ? (
          <>
            <NoteArticle note={note} blocks={blocks} />
            <NoteNav neighbors={neighbors} />
          </>
        ) : (
          <NoteEmpty failed={failed} />
        )}
      </div>
      <aside className="hz-note-rail" aria-label="글의 곁">
        {note && <NoteToc blocks={blocks} />}
        {note && <NoteStocksCard stocks={stocks} />}
        <NoteArchive notes={archive} current={note?.date ?? null} />
      </aside>
    </div>
  );
}

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
import { stockDetailHref } from "@/lib/insider-range";
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
 * ## v2(2026-10-03) — 두 줄기 [글 | 오른쪽 칸]
 *
 * 첫 줄 띠(이전 글 · 다음 글 · 업데이트) → [글 | 오른쪽 칸(목차 · 언급된 종목 · 지난 노트)].
 * ⭐ 오른쪽 칸은 **글을 읽으면서 옆에서 같이 보는 자리**다(2026-10-03 운영자 판단 — "언급된 종목을 옆에 같이 볼 수 있었던 게 아주 좋았다
 *    · 지난 노트 · 목차도 그 자리가 읽으면서 자연스럽다"). 한 번 한 줄기(글 판 폭 · 목차는 글 머리 아래 · 종목 · 지난 노트는 글 아래)로
 *    바꿨다가 되돌렸다. ⛔ 다시 한 줄기로 펴지 말 것 — 글이 칸보다 길어 칸 아래가 비는 것은 이 화면에선 감수한다.
 * ⛔ 오른쪽 칸을 화면에 따라 붙이지(sticky) 않는다(2026-09-06 지시: "맞춰서 움직이지 않게, 고정 형태").
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
 * 글 한 편 — 머리(날짜 · 제목) · 본문 · 공유.
 *
 * ⭐ 날짜 주소(`/daily/2026-09-05`)에서는 글 제목이 **h1** 이다. 셸은 그 주소의 '데일리 노트'를 h1 이 아닌 글자로 그린다
 * (AppShell LABEL_TITLED_PREFIXES). 예전엔 날짜마다 h1 이 똑같이 '데일리 노트'라 글마다 고유한 제목 신호가 없었다(2026-09-30 점검).
 * `/daily`(가장 최근 글)는 셸의 '데일리 노트'가 h1 이고 글 제목은 h2 그대로다 — 그 화면의 canonical 이 날짜 주소다.
 *
 */
function NoteArticle({ note, blocks, dated }: { note: DailyNote; blocks: NoteBlock[]; dated: boolean }) {
  const Title = dated ? "h1" : "h2";
  return (
    <article className="v2-mod v2-nt-art">
      {/* 머리 한 줄 — 제목 · 공유. 날짜는 바로 위 첫 줄 띠가 말해 화면에선 걷고 읽는 기계에만 남긴다. 공유는 글 끝 66px 꼬리 줄에
          혼자 섰던 것을 올렸다(2026-10-05 점검). 공유는 **날짜가 든 주소**로 넘긴다 — `/daily` 를 공유하면 내일 다른 글이 열린다. */}
      <header className="v2-nt-head">
        <time dateTime={note.date} className="sr-only">
          {fmtNoteDate(note.date)}
        </time>
        <Title className="v2-nt-title">{note.title}</Title>
        <ShareButton path={noteHref(note.date)} title={note.title} />
      </header>
      <div className="hz-note-body v2-nt-body">
        {blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    </article>
  );
}

/**
 * 목차 — 꼭지(h3)만. 그 글의 소제목이 곧 그날의 이야기 목록이다. 누르면 `#sec-N` 으로 뛴다.
 * ⛔ 꼭지 수("6꼭지")를 머리에 적지 않는다(2026-09-06 지시) — 번호가 이미 센다.
 */
function NoteTocModule({ blocks }: { blocks: NoteBlock[] }) {
  const items = noteHeadings(blocks).filter((h) => h.level === 3);
  if (!items.length) return null;
  return (
    // 판이 좁아 오른쪽 칸이 글 아래로 내려가면 숨긴다(v2.css .v2-nt-tocmod) — 다 읽은 뒤에 서는 목차는 쓸 데가 없고 언급된 종목을 한 화면 밀었다.
    <Module title="목차" className="v2-nt-tocmod">
      <nav aria-label="글의 꼭지">
        <ol className="v2-nt-toc">
          {items.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`}>{h.text}</a>
            </li>
          ))}
        </ol>
      </nav>
    </Module>
  );
}

/**
 * 언급된 종목 — 국내는 이름 · 종가 · 등락, 미국은 이름 · 티커 · 달러 시세 · 등락 · 미국 세션 날짜. 오른쪽 칸에 한 단으로 선다(좁은 판에선 글 아래 여러 단).
 *
 * ⚠️ 종가는 오늘 글이면 야후 실시간(카더라 카드와 같은 소스), 지난 글이면 `stocks` 표의 **최근** KRX 값이다 —
 *    지난 글을 열어도 오늘 시세가 보인다. 그래서 기준일이 글 날과 다르면 머리에 'n월 n일 종가'를 적고 등락률은 뺀다 —
 *    다른 날의 하루 등락을 글 옆에 두면 그날 등락으로 읽혔다(2026-10-04 점검, 9월 28일 글 옆 HLB −0.25%).
 *    기준일이 다른 줄은 그 줄에 따로 적는다(lib/daily-note getNoteStocks 머리말).
 * ⭐ 미국 종목은 미장 종목 화면(/insider/stock)으로 잇는다 — 국내 줄만 눌리고 미국 줄은 안 눌렸다.
 * ⭐ 등락은 +/− 부호(v2 공통) — ▲▼ 는 걷었다.
 */
function NoteStocksModule({ stocks, noteDate }: { stocks: NoteStocks; noteDate: string }) {
  if (!stocks.kr.length && !stocks.us.length) return null;
  const dates = stocks.kr.map((s) => s.priceDate).filter((d): d is string => Boolean(d));
  const latest = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  const stale = latest !== null && latest !== noteDate;
  // 미국 시세의 세션 날짜(뉴욕) — 국내 종가 날과 대개 하루 어긋나 머리에 따로 적는다(테마 띠의 '10월 2일 미국장'과 같은 말).
  const usDates = stocks.us.map((u) => u.priceDate).filter((d): d is string => Boolean(d));
  const usLatest = usDates.length ? usDates.reduce((a, b) => (a > b ? a : b)) : null;
  // 날짜는 제 시장 수 바로 뒤에 — 국내 날짜를 맨 앞에 두면 미국 줄도 그날 종가로 읽혔다.
  // ⚠️ 미국장 날짜는 **늘** 적는다. 글 날(KST) 본문이 다루는 미국장은 그 전날(뉴욕)이라, 글 날과 같은 날짜의 미국장은
  //    글을 쓴 뒤에 열린 장이다. '글 날과 다를 때만' 적던 때는 그 장이 끝나면 날짜가 빠져, 10월 7일 글 옆에 본문
  //    ('마이크론은 1.7% 내렸습니다', 10월 6일 장)과 다른 +4.06%(10월 7일 장)가 날짜 없이 섰다(2026-10-08 점검).
  const counts = [
    `국내 ${stocks.kr.length}`,
    ...(stale && latest ? [`${fmtNoteDay(latest)} 종가`] : []),
    `미국 ${stocks.us.length}`,
    ...(usLatest ? [`${fmtNoteDay(usLatest)} 미국장`] : []),
  ].join(" · ");
  return (
    <Module
      id="stocks"
      title="언급된 종목"
      meta={counts}
      // 종목 쪽지는 두지 않는다 — 글을 읽는 화면이라 줄 위에 뜬 쪽지가 걸렸다(2026-10-05 운영자 지시 "여긴 뜰 필요 없어").
      className="v2-nt-stockmod"
    >
      <ul className="v2-nt-stocks">
        {stocks.kr.map((s) => {
          // 등락률은 늘 보인다 — 글 날의 값일 때만 두었더니 주말 · 연휴 글엔 등락이 통째로 빠졌다(2026-10-05 운영자 판단 "기존처럼 등락 %").
          // 어느 날 종가 · 등락인지는 모듈 머리('10월 2일 종가')와 줄 끝 날짜가 말한다.
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
        {/* 미국 종목도 같은 줄 꼴로 달러 시세 · 등락을 선다(야후 · lib/daily-note usQuote). 세션 날짜는 머리('n월 n일 미국장')가 말하고,
            그와 다른 날의 줄만 줄 끝에 적는다(국내 줄과 같은 규칙). */}
        {stocks.us.map((u) => {
          const chg = u.changeRate;
          return (
            <li key={u.ticker}>
              <Link href={stockDetailHref(u.ticker)} className="v2-nt-stock is-us" data-ga="note_stock_click">
                <StockLogo code={u.ticker} name={u.name} market="US" size={20} />
                {/* 티커는 이름 꼬리로 — 값 자리에 서면 머리 '10월 2일 종가'의 값으로 읽혔다(2026-10-05 점검). */}
                <span className="v2-nt-stock-name">
                  {u.name}
                  {u.name !== u.ticker && <em>{u.ticker}</em>}
                </span>
                {u.price != null && (
                  <span className="v2-nt-stock-px">
                    <b>${u.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                    {chg != null && (
                      <i className={chg > 0 ? "is-up" : chg < 0 ? "is-down" : undefined}>
                        {chg > 0 ? "+" : chg < 0 ? "-" : ""}
                        {Math.abs(chg).toFixed(2)}%
                      </i>
                    )}
                    {u.priceDate && usLatest && u.priceDate !== usLatest && <em>{fmtNoteDay(u.priceDate)}</em>}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
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
  // 표기 · 주소는 서버가 끝낸다. 지난 노트 넘김은 클라이언트 컴포넌트라 lib/daily-note.ts 를 못 문다.
  const items = archive.map((n) => ({ date: n.date, title: n.title, href: noteHref(n.date), label: fmtNoteDateShort(n.date) }));
  const { prev, next } = neighbors;
  return (
    <div className="hz-tx v2-kd v2-nt">
      {/* 첫 줄 — 앞뒤 글(한쪽이 없으면 그 칸을 안 세운다 · 안 눌리는 칸은 고장으로 보인다) · 업데이트 */}
      <div className="v2-cover">
        {prev && <CoverLinkCell c={{ cap: "이전 글", name: fmtNoteDateShort(prev.date), href: noteHref(prev.date), ga: "note_prev_click", back: true }} />}
        {next && <CoverLinkCell c={{ cap: "다음 글", name: fmtNoteDateShort(next.date), href: noteHref(next.date), ga: "note_next_click" }} />}
        <CoverMeta
          updated={note ? formatKstUpdate(note.updatedAt, "업데이트") : "글 준비 중"}
          // 꼭지 수는 안 적는다(2026-10-04 운영자 판단 — 2026-09-06 의 "꼭지 수를 머리에 적지 않는다"와 같은 까닭). 종목 수만.
          // '종목 15'는 무엇의 15 인지 안 읽혔다(2026-10-04 점검) — 이 글에 언급된 종목 수.
          basis={note && stocks.kr.length + stocks.us.length ? `언급된 종목 ${stocks.kr.length + stocks.us.length}` : null}
        />
      </div>
      <div className="v2-nt-page">
        <div className="v2-nt-main">{note ? <NoteArticle note={note} blocks={blocks} dated={dated} /> : <NoteEmpty failed={failed} />}</div>
        <aside className="v2-nt-rail" aria-label="글의 곁">
          {note && <NoteTocModule blocks={blocks} />}
          {note && <NoteStocksModule stocks={stocks} noteDate={note.date} />}
          {items.length > 0 && <NoteArchiveList items={items} current={note?.date ?? null} />}
        </aside>
      </div>
    </div>
  );
}

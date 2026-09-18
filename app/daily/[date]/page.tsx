import type { Metadata } from "next";
import { LOAD_FAILED, assertLoaded } from "@/lib/load-state";
import { notFound } from "next/navigation";

import { EMPTY_STOCKS, getNote, getNoteStocks, isNoteDate, listNotes, noteHref, noteNeighbors } from "@/lib/daily-note";
import { noteDescription } from "@/lib/daily-note-md";

import { SITE_NAME, SITE_URL } from "../../brand";
import { NOTE_CARD } from "../../og-copy";
import { pageMetadata } from "../../seo";
import { DAILY_PUBLIC } from "../../screen-flags";
import { NOTE_PAGE } from "../copy";
import { NoteView } from "../NoteView";

/**
 * 데일리 노트 — 날짜로 한 편(`/daily/2026-09-05`).
 *
 * ## 날짜별 주소가 따로 있는 까닭
 *
 * `/daily` 는 늘 최신 글이라 어제 글을 가리킬 방법이 없다. 글마다 자기 주소가 있어야
 * 공유가 되고, 검색엔진이 하루 한 편을 각각 색인한다 — 매일 새 글이 쌓이는 화면은 이
 * 사이트에서 이것이 처음이다.
 *
 * ## 제목은 셸이, 구조화 데이터는 여기서
 *
 * 본문 헤더의 h1("데일리 노트")은 셸(AppShell)이 그린다. 셸은 클라이언트 컴포넌트라 글
 * 제목을 모르므로 `<title>` 과 Article 구조화 데이터는 이 파일이 낸다. 셸의 PageJsonLd 는
 * 이 주소에 안 나온다(NAV·DEEP_PAGES 어디에도 정확히 없는 경로라 `named` 가 false 다).
 */

const PUBLIC = DAILY_PUBLIC;
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx). 예전엔 여기가
// force-dynamic 이라 방문마다 서버가 새로 그렸다.
//
// 동적 구간([...])은 generateStaticParams 가 없으면 캐시 없이 요청마다 그린다(Next 문서:
// "빈 배열을 돌려줘야 런타임에 ISR 이 된다"). 빈 배열 = 빌드 때는 아무것도 안 만들고,
// 처음 방문한 주소를 그때 그려 사본에 담는다. 없는 주소의 notFound() 도 그대로 동작한다.
export async function generateStaticParams() {
  return [];
}

const MISSING: Metadata = { title: "글을 찾을 수 없습니다 | hatzze", robots: { index: false, follow: false } };

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  if (!isNoteDate(date)) return MISSING;
  const r = await getNote(date);
  if (!r.note) return MISSING;
  const meta = await pageMetadata({
    title: `${r.note.title} | hatzze`,
    description: noteDescription(r.note.bodyMd) || NOTE_PAGE.description,
    path: noteHref(date),
    // 날짜별 글은 자기 카드가 없어 목록(/daily)의 카드를 쓴다(app/seo.ts 의 imagePath).
    ownImage: NOTE_CARD.alt,
    imagePath: "/daily",
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

/**
 * Article 구조화 데이터. **연 뒤에만** 낸다 — 안 연 화면은 noindex 라 색인 대상이 아닌데
 * 구조화 데이터만 내면 서로 어긋난 신호가 된다(셸의 PageJsonLd 와 같은 규칙).
 */
function ArticleJsonLd({ title, date, updatedAt, description }: { title: string; date: string; updatedAt: string; description: string }) {
  const url = `${SITE_URL}${noteHref(date)}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: title,
    description,
    url,
    mainEntityOfPage: url,
    inLanguage: "ko-KR",
    datePublished: date,
    dateModified: updatedAt,
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    isPartOf: { "@type": "CollectionPage", "@id": `${SITE_URL}${NOTE_PAGE.href}#webpage`, name: `${NOTE_PAGE.label} | ${SITE_NAME}` },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default async function DailyDatePage({ params }: { params: Promise<{ date: string }> }) {
  if (!PUBLIC && DEPLOYED) notFound();

  const { date } = await params;
  if (!isNoteDate(date)) notFound();

  const r = await getNote(date);
  // 못 읽은 것과 없는 것을 가른다. 못 읽었으면 던져서 사본(ISR)에 안 담고(에러 화면),
  // 없으면 404. `failed` 는 getNote 가 던지지 않고 실어 주는 실패 표시라 여기서 이름을 단다.
  assertLoaded("/daily/[date]", { note: r.failed ? LOAD_FAILED : r.note });
  if (!r.note) notFound();

  const [archive, neighbors, stocks] = await Promise.all([
    listNotes(),
    noteNeighbors(date),
    r.note ? getNoteStocks(r.note.stocks, r.note.date) : Promise.resolve(EMPTY_STOCKS),
  ]);

  return (
    <>
      {PUBLIC && r.note && (
        <ArticleJsonLd title={r.note.title} date={r.note.date} updatedAt={r.note.updatedAt} description={noteDescription(r.note.bodyMd)} />
      )}
      <NoteView note={r.note} failed={r.failed} neighbors={neighbors} archive={archive.notes} stocks={stocks} />
    </>
  );
}

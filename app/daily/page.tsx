import type { Metadata } from "next";
import { assertLoaded } from "@/lib/load-state";
import { notFound } from "next/navigation";

import { EMPTY_STOCKS, getLatestNote, getNoteStocks, listNotes, noteHref, noteNeighbors, type NoteNeighbors } from "@/lib/daily-note";
import { noteDescription } from "@/lib/daily-note-md";

import { NOTE_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { DAILY_PUBLIC } from "../screen-flags";
import { NOTE_PAGE } from "./copy";
import { NoteView } from "./NoteView";

/**
 * 데일리 노트 — 가장 최근 글 한 편(`/daily`). 날짜별 주소는 `./[date]/page.tsx`.
 *
 * 글은 파이프라인이 아니라 사람이 올린다. 매일 저녁 세션에서 쓴 원고를
 * `data-pipeline/scripts/publish_daily_note.py` 로 표에 넣으면 이 화면이 읽어 그린다.
 * LLM 자동 생성은 비용을 보고 접었다(2026-09-06) — 그래서 이 화면에는 AI 고지가 없다.
 */

/**
 * ⛔ **아직 안 연 화면이다.** 스위치는 `app/screen-flags.ts` 한 곳에 있다 — 사이드바·푸터·
 * 사이트맵·소식 띠가 같은 값을 읽으므로 여는 날 고칠 곳이 흩어지지 않는다.
 */
const PUBLIC = DAILY_PUBLIC;

/** 배포된 곳인가. Vercel 에서만 `VERCEL_ENV` 가 있고 로컬에는 없다 — 로컬에서는 PUBLIC 이
 *  false 여도 그대로 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

// 캐시 주기는 루트 레이아웃의 `revalidate` 가 정한다(app/layout.tsx). 예전엔 여기가
// force-dynamic 이라 방문마다 서버가 새로 그렸다.

/**
 * ## canonical 은 그 글의 날짜 주소다
 *
 * 이 화면의 본문은 가장 최근 글 **그대로**이고, 같은 글이 `/daily/2026-09-29` 에도 자기 주소로 있다. 둘이 각자
 * canonical 을 내면 같은 본문이 두 주소로 색인을 다투고, 검색엔진이 아무 쪽이나 고른다(2026-09-30 점검).
 * 오래 남는 쪽은 날짜 주소라 그쪽을 가리킨다 — og:url 도 같이 따라가서, 이 화면을 공유해도 링크가 다음 날
 * 다른 글로 바뀌지 않는다. 설명도 고정 소개문 대신 그 글의 첫머리다.
 *
 * 그래서 `/daily` 는 사이트맵에 없다(app/sitemap-urls.ts · canonical 이 아닌 주소를 싣지 않는다). 날짜 주소는
 * app/sitemap-notes.xml 이 싣는다. 글이 아직 없거나 못 읽었으면 예전처럼 자기 주소다.
 */
export async function generateMetadata(): Promise<Metadata> {
  // 본문과 같은 조회다 — cache 라 한 번만 돈다.
  const latest = await getLatestNote();
  // ⚠️ await 를 빼지 말 것 — robots 를 얹으려고 펼친다(app/preview/page.tsx 의 같은 자리 주석).
  const meta = await pageMetadata({
    title: `${NOTE_PAGE.label} | hatzze`,
    description: (latest.note && noteDescription(latest.note.bodyMd)) || NOTE_PAGE.description,
    path: latest.note ? noteHref(latest.note.date) : NOTE_PAGE.href,
    ownImage: NOTE_CARD.alt,
    // 카드는 이 폴더의 것이다 — path 가 날짜 주소로 바뀌어도 그림 주소는 그대로 둔다.
    imagePath: NOTE_PAGE.href,
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

const NO_NEIGHBORS: NoteNeighbors = { prev: null, next: null };

export default async function DailyPage() {
  if (!PUBLIC && DEPLOYED) notFound();

  const latest = await getLatestNote();
  const [archive, neighbors, stocks] = await Promise.all([
    listNotes(),
    latest.note ? noteNeighbors(latest.note.date) : Promise.resolve(NO_NEIGHBORS),
    latest.note ? getNoteStocks(latest.note.stocks, latest.note.date) : Promise.resolve(EMPTY_STOCKS),
  ]);
  assertLoaded("/daily");

  return <NoteView note={latest.note} failed={latest.failed} neighbors={neighbors} archive={archive.notes} stocks={stocks} />;
}

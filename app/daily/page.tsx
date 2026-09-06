import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EMPTY_STOCKS, getLatestNote, getNoteStocks, listNotes, noteNeighbors, type NoteNeighbors } from "@/lib/daily-note";

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

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // ⚠️ await 를 빼지 말 것 — robots 를 얹으려고 펼친다(app/preview/page.tsx 의 같은 자리 주석).
  const meta = await pageMetadata({
    title: `${NOTE_PAGE.label} | hatzze`,
    description: NOTE_PAGE.description,
    path: NOTE_PAGE.href,
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
    latest.note ? getNoteStocks(latest.note.stocks) : Promise.resolve(EMPTY_STOCKS),
  ]);

  return <NoteView note={latest.note} failed={latest.failed} neighbors={neighbors} archive={archive.notes} stocks={stocks} />;
}

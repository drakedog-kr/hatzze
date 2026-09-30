import { SITE_NAME, SITE_URL } from "../../brand";
import { DAILY_PUBLIC } from "../../screen-flags";
import { NOTE_PAGE } from "../copy";
import { listFeedNotes } from "@/lib/daily-note";
import { noteDescription } from "@/lib/daily-note-md";
import { notesRssXml } from "@/lib/daily-rss";

/**
 * `/daily/rss.xml` — 데일리 노트 RSS 2.0. 최근 한 달(FEED_LIMIT)의 글을 싣는다. 본문은 lib/daily-rss.ts.
 *
 * 레이아웃 머리의 `<link rel="alternate" type="application/rss+xml">` 이 이 주소를 가리킨다. 네이버 서치어드바이저·
 * 다음 웹마스터도구에는 사람이 한 번 등록한다(사이트맵과 함께).
 *
 * ## 사본(ISR)과 실패
 *
 * 글은 하루 한 번 올라오고, 올리는 스크립트가 사본을 비운다(publish_daily_note.py revalidate_site). 그래서 한 시간
 * 사본이면 된다. ⛔ 못 읽었을 때 빈 피드를 내지 않는다 — 구독기가 글이 다 사라졌다고 읽는다. **던진다**: 사본이 있으면
 * 마지막 성공본이 계속 나가고 다음 요청에서 다시 만든다(app/api/search-index 와 같은 원리). 503 을 돌려주면 그 응답이
 * 사본에 담겨 한 시간 동안 피드가 죽는다.
 */
export const revalidate = 3600;

export async function GET() {
  // 안 연 동안은 없는 주소다. 날짜별 글이 noindex 인데 피드가 그 주소를 퍼뜨리면 두 신호가 어긋난다.
  if (!DAILY_PUBLIC) return new Response("Not Found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const notes = await listFeedNotes();
  if (notes === null) throw new Error("[daily/rss] 글 목록을 읽지 못해 피드를 만들지 않습니다");

  const body = notesRssXml({
    site: SITE_URL,
    title: `${SITE_NAME} ${NOTE_PAGE.label}`,
    description: NOTE_PAGE.description,
    listPath: NOTE_PAGE.href,
    feedPath: `${NOTE_PAGE.href}/rss.xml`,
    // 요약은 글 화면의 메타 설명과 같은 첫머리다(날짜 글 generateMetadata 의 description).
    items: notes.map((n) => ({ date: n.date, title: n.title, description: noteDescription(n.bodyMd), createdAt: n.createdAt })),
  });

  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}

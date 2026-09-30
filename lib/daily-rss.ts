/**
 * 데일리 노트 RSS 2.0 본문(app/daily/rss.xml/route.ts). DB 를 안 만지는 순수 함수라 단위 테스트
 * (tests/daily-rss.test.ts)가 그대로 부른다.
 *
 * ## 왜 RSS 인가
 *
 * 예전엔 "날짜별 영구 주소가 없어 RSS 가 사이트맵과 겹친다"며 만들지 않았다(.github/workflows/indexnow.yml 옛 머리말).
 * 지금은 글이 날마다 자기 주소(/daily/2026-09-30)로 쌓인다. 네이버 서치어드바이저는 RSS 제출을 새 글 수집 통로로
 * 안내하고, 피드 구독기·텔레그램 봇도 이걸 읽는다.
 */

export type RssItem = { date: string; title: string; description: string; createdAt: string };

/** XML 텍스트 노드에 그대로 넣으면 안 되는 다섯 글자. 글 제목·요약에 `&`·`<` 가 나올 수 있다. */
function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 은 RFC 822 날짜를 쓴다. `toUTCString()` 이 그 꼴이다("Wed, 30 Sep 2026 08:05:00 GMT"). */
const rfc822 = (iso: string) => new Date(iso).toUTCString();

export function notesRssXml({
  site,
  title,
  description,
  listPath,
  feedPath,
  items,
}: {
  /** 사이트 주소(끝 슬래시 없음). */
  site: string;
  title: string;
  description: string;
  /** 글 목록 화면(`/daily`). 채널의 link 다. */
  listPath: string;
  /** 이 피드의 주소(`/daily/rss.xml`). atom:link rel=self 로 적는다 — 검증기가 요구한다. */
  feedPath: string;
  /** 최신이 앞. 링크는 글의 날짜 주소다(`${listPath}/${date}`). */
  items: RssItem[];
}): string {
  const entries = items
    .map((n) => {
      const link = `${site}${listPath}/${n.date}`;
      return (
        `    <item>\n` +
        `      <title>${xmlEscape(n.title)}</title>\n` +
        `      <link>${xmlEscape(link)}</link>\n` +
        // 날짜 주소는 영구다 — 같은 날 다시 올려도 같은 글로 본다(구독기가 두 번 띄우지 않는다).
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>\n` +
        `      <pubDate>${rfc822(n.createdAt)}</pubDate>\n` +
        `      <description>${xmlEscape(n.description)}</description>\n` +
        `    </item>`
      );
    })
    .join("\n");
  const lastBuild = items.length ? `    <lastBuildDate>${rfc822(items[0].createdAt)}</lastBuildDate>\n` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${xmlEscape(title)}</title>\n` +
    `    <link>${xmlEscape(`${site}${listPath}`)}</link>\n` +
    `    <description>${xmlEscape(description)}</description>\n` +
    `    <language>ko</language>\n` +
    lastBuild +
    `    <atom:link href="${xmlEscape(`${site}${feedPath}`)}" rel="self" type="application/rss+xml" />\n` +
    (entries ? `${entries}\n` : "") +
    `  </channel>\n` +
    `</rss>\n`
  );
}

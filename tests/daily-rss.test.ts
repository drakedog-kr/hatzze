/**
 * lib/daily-rss.ts — 데일리 노트 RSS. 구독기·네이버 서치어드바이저가 읽는 자리라 규격(RFC 822 날짜 · 영구 guid ·
 * self 링크)과 이스케이프가 맞아야 한다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { notesRssXml } from "../lib/daily-rss.ts";

const base = { site: "https://hatzze.fun", title: "hatzze 데일리 노트", description: "매일 저녁 한 편", listPath: "/daily", feedPath: "/daily/rss.xml" };

describe("notesRssXml", () => {
  const xml = notesRssXml({
    ...base,
    items: [
      { date: "2026-09-30", title: "로봇주 & 원전 <상한가>", description: "첫 문단 \"요약\"", createdAt: "2026-09-30T08:05:00.000Z" },
      { date: "2026-09-29", title: "어제 글", description: "요약", createdAt: "2026-09-29T08:05:00Z" },
    ],
  });

  it("글마다 날짜 주소가 link 이자 영구 guid 다", () => {
    assert.match(xml, /<link>https:\/\/hatzze\.fun\/daily\/2026-09-30<\/link>/);
    assert.match(xml, /<guid isPermaLink="true">https:\/\/hatzze\.fun\/daily\/2026-09-30<\/guid>/);
  });

  it("날짜는 RFC 822 이고 채널의 마지막 빌드는 가장 최근 글이다", () => {
    assert.match(xml, /<pubDate>Wed, 30 Sep 2026 08:05:00 GMT<\/pubDate>/);
    assert.match(xml, /<lastBuildDate>Wed, 30 Sep 2026 08:05:00 GMT<\/lastBuildDate>/);
  });

  it("self 링크와 언어가 있다", () => {
    assert.match(xml, /<atom:link href="https:\/\/hatzze\.fun\/daily\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/);
    assert.match(xml, /<language>ko<\/language>/);
  });

  it("제목·요약을 XML 로 이스케이프한다", () => {
    assert.match(xml, /<title>로봇주 &amp; 원전 &lt;상한가&gt;<\/title>/);
    assert.match(xml, /<description>첫 문단 &quot;요약&quot;<\/description>/);
    assert.ok(!xml.includes("<상한가>"));
  });

  it("글이 없으면 item 없이 채널만", () => {
    const empty = notesRssXml({ ...base, items: [] });
    assert.doesNotMatch(empty, /<item>|lastBuildDate/);
    assert.match(empty, /<channel>[\s\S]*<\/channel>/);
  });
});

#!/usr/bin/env node
/**
 * IndexNow 로 알릴 주소를 고른다. `.github/workflows/indexnow.yml` 이 부른다.
 *
 *     node scripts/indexnow-urls.mjs hatzze.fun      → 한 줄에 주소 하나(표준 출력)
 *
 * ## 무엇을 읽나 — robots.txt 가 가리키는 사이트맵 전부
 *
 * 예전엔 `/sitemap.xml` 하나만 읽었다. 거기엔 코드에 박힌 60여 줄뿐이라 매일 바뀌는 종목 실주소
 * (sitemap-stocks.xml)와 매일 새로 생기는 데일리 노트(sitemap-notes.xml)가 빙·네이버에 한 번도 안 갔다
 * (2026-09-30 점검). 사이트맵 목록을 여기 또 적으면 어긋나므로 robots.txt 의 `Sitemap:` 줄을 따른다.
 * 같은 목록을 두 이름으로 내는 사이트맵(sitemap.xml · sitemap-pages.xml)이 있어 주소는 한 번씩만 남긴다.
 *
 * ## 무엇을 고르나 — 최근에 바뀐 주소만
 *
 * 안 바뀐 주소를 날마다 다시 보내면 IndexNow 쪽에서 신호 값이 떨어진다. 약관·개인정보·업데이트 기록이
 * 하루 두 번씩 나갔다. 규칙은 하나다.
 *
 *   lastmod 가 있으면    그 날짜가 기준일(한국 날짜로 어제) 이후일 때만
 *   lastmod 가 없으면    changefreq 가 daily 일 때만 — 날마다 내용이 바뀌는 화면(홈·카더라·테마)이다
 *
 * 수정일을 아는 사이트맵(종목·노트·업데이트 기록)은 그 날짜로, 모르는 줄은 스스로 적은 빈도로 판단한다
 * (app/sitemap-urls.ts 의 `lastmod` 주석). 파이프라인이 하루 두 번 돌고 그 뒤에 이게 도므로 기준일을 어제로
 * 잡으면 저녁 실행이 아침에 바뀐 주소를 한 번 더 보내는 정도다.
 *
 * ## 실패
 *
 * 사이트맵 하나가 500 이면(조회 실패 때 일부러 500 을 낸다) 그것만 건너뛰고 나머지는 보낸다. 고른 주소가
 * 하나도 없으면 1 로 끝나 워크플로가 알리지 않는다.
 */
import { pathToFileURL } from "node:url";

/** robots.txt 의 `Sitemap:` 줄. 대소문자를 가리지 않는다(규격). */
export function sitemapsFromRobots(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i)?.[1])
    .filter(Boolean);
}

const tag = (block, name) => block.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`))?.[1] ?? null;

/** 사이트맵 XML 의 `<url>` 들. 태그 몇 개만 읽는 규격이라 정규식으로 충분하다. */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => ({ loc: tag(m[1], "loc"), lastmod: tag(m[1], "lastmod"), changefreq: tag(m[1], "changefreq") }))
    .filter((e) => e.loc)
    .map((e) => ({ ...e, loc: e.loc.replace(/&amp;/g, "&") }));
}

/** 한국 날짜로 n 일 전(YYYY-MM-DD). 러너 시계는 UTC 라 9시간을 더해 날짜를 뗀다. */
export function kstDaysAgo(now, days) {
  return new Date(now.getTime() + 9 * 3600_000 - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 알릴 주소. 순서는 사이트맵에 나온 차례이고 같은 주소는 한 번만 남긴다.
 * `lastmod` 는 날짜(YYYY-MM-DD)든 시각(ISO)이든 앞 열 글자로 견준다.
 */
export function pickUrls(entries, since) {
  const out = new Set();
  for (const e of entries) {
    const fresh = e.lastmod ? e.lastmod.slice(0, 10) >= since : e.changefreq === "daily";
    if (fresh) out.add(e.loc);
  }
  return [...out];
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "hatzze-indexnow" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function main() {
  const host = process.argv[2];
  if (!host) {
    console.error("사용법: node scripts/indexnow-urls.mjs <host>");
    process.exit(2);
  }
  const sitemaps = sitemapsFromRobots(await get(`https://${host}/robots.txt`));
  if (!sitemaps.length) {
    console.error("robots.txt 에 사이트맵이 없습니다.");
    process.exit(1);
  }
  const entries = [];
  for (const url of sitemaps) {
    try {
      const got = parseSitemap(await get(url));
      console.error(`${url}: ${got.length}줄`);
      entries.push(...got);
    } catch (e) {
      // 하나가 죽었다고 나머지를 안 보낼 까닭은 없다. 다음 실행이 그 몫을 다시 본다.
      console.error(`${url}: 건너뜀 (${e.message})`);
    }
  }
  const since = kstDaysAgo(new Date(), 1);
  const urls = pickUrls(entries, since);
  console.error(`기준일 ${since} 이후 바뀐 주소 ${urls.length}개 (전체 ${entries.length}줄)`);
  if (!urls.length) process.exit(1);
  process.stdout.write(urls.join("\n") + "\n");
}

// 테스트가 불러 쓸 때는 돌지 않는다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

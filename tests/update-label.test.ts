/**
 * 화면 '업데이트' 라벨은 그 화면이 실제로 바뀐 때를 말해야 한다(2026-10-18).
 * 라벨은 **화면이 새로 그려진 시각**이 먼저다(lib/refreshed-at.ts — 그 화면 조회 사본의 응답 시각). 아침 화면은 자료가 쓰이고도
 * KRX 08:00 등락률을 기다려 한 묶음으로 바뀌어서, 자료 시각을 쓰면 08:05 에 바뀐 화면이 '오전 7시 30분'이 된다. 그 값을 못 읽을
 * 때만 **보여 주는 자료 가운데 가장 늦게 쓰인 시각**으로 물러선다. 예전엔 카더라 · 테마가 다 총평 시각을, 미리보기는 정각
 * '오전 7시'를 써서 08:13 에 바뀐 화면이 '오전 7시 30분'이었다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { latestIso } from "../lib/format.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("latestIso", () => {
  it("가장 늦은 시각을 고르고 빈 값은 건너뛴다", () => {
    assert.equal(latestIso("2026-10-17T22:40:51+00:00", null, "2026-10-17T23:00:28+00:00", undefined), "2026-10-17T23:00:28+00:00");
    assert.equal(latestIso(null, undefined, ""), null);
    assert.equal(latestIso("이상한 값", "2026-10-17T21:31:00Z"), "2026-10-17T21:31:00Z");
  });
});

describe("화면마다 라벨에 넣는 표", () => {
  it("국장 · 미장 카더라는 총평과 등락 이유 중 늦은 쪽 — 아침 국장은 KRX 등락률을 채운 뒤에 바뀐다", () => {
    const src = read("lib/telegram-data.ts");
    assert.match(src, /export async function kaderaShownAt[\s\S]*?telegram_stock_move_reason[\s\S]*?return latestIso\(brief, reasons\)/);
    assert.match(src, /storedCollectionStats\(db\), pageRefreshedAt\(\), kaderaShownAt\(db, "kr"\)/);
    assert.match(read("lib/us-telegram-data.ts"), /kaderaShownAt\(getSupabaseAdmin\(\), "us"\)/);
  });

  it("테마 목록은 총평과 테마 요약 중 늦은 쪽", () => {
    assert.match(read("lib/theme-page.ts"), /telegram_us_theme_brief" : "telegram_theme_brief"[\s\S]*?return latestIso\(brief, themes\)/);
  });

  it("미리보기는 정각이 아니라 보여 주는 자료의 가장 늦은 시각 — 실시간 값의 시각은 안 넣는다", () => {
    const src = read("app/preview/page.tsx");
    assert.ok(!src.includes("formatKstUpdateSnapped("), "정각 '오전 7시' 라벨이 남았다");
    assert.match(src, /formatKstUpdate\(shownAt, "업데이트"\)/);
    assert.match(src, /latestWrittenAt\(db, "kr_overnight", "captured_at"\)/);
    assert.ok(!/previewShownAt\([^)]*overnight\.capturedAt/.test(src), "실시간 덧씌움 시각을 넣으면 10분마다 라벨만 바뀐다");
  });
});

describe("라벨은 화면이 새로 그려진 시각이 먼저다", () => {
  it("그 시각은 이 화면 조회 사본(라우트 머리 · 무기한)의 응답 시각이다 — 시간으로 다시 그려져도 그대로다", () => {
    const src = read("lib/refreshed-at.ts");
    assert.match(src, /readCacheInit\(\{ headers: \{ apikey: key, Authorization: `Bearer \$\{key\}` \} \}, currentRoute\(\)\)/);
    assert.match(src, /res\.headers\.get\("date"\)/);
    // 실패하면 null — 던지면 화면이 통째로 안 그려진다.
    assert.match(src, /catch \{\n\s+return null;/);
  });

  it("다섯 화면이 그 시각을 먼저 쓰고, 못 읽으면 자료 시각으로 물러선다", () => {
    assert.match(read("app/page.tsx"), /formatKstUpdate\(refreshedAt \?\? dailyScore\.updated_at, "업데이트"\)/);
    assert.match(read("lib/telegram-data.ts"), /const lastUpdated = refreshed \?\? written;/);
    assert.match(read("lib/us-telegram-data.ts"), /lastUpdated: refreshed \?\? written,/);
    assert.match(read("lib/theme-page.ts"), /const refreshed = await pageRefreshedAt\(\);\n\s+if \(refreshed\) return refreshed;/);
    assert.match(read("app/preview/page.tsx"), /Promise\.all\(\[pageRefreshedAt\(\), preview\.then\(\(p\) => previewShownAt\(p\.updatedAt\)\)\]\)\.then\(\(\[r, w\]\) => r \?\? w\)/);
  });
});

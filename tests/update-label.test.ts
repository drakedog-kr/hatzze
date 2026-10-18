/**
 * 화면 '업데이트' 라벨은 그 화면이 실제로 바뀐 때를 말해야 한다(2026-10-18).
 * 라벨은 **화면을 마지막으로 비운 시각**이 먼저다(lib/refreshed-at.ts — /api/revalidate 가 DB 에 적는다). 아침 화면은 자료가 쓰이고도
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
  it("그 시각은 /api/revalidate 가 비우기 직전에 DB(page_refresh)에 적은 값이다 — 배포 · 캐시를 다시 받아도 같다", () => {
    const src = read("lib/refreshed-at.ts");
    assert.match(src, /\.from\("page_refresh"\)\s*\.select\("refreshed_at"\)\s*\.in\("target", labelRefreshKeys\(route\)\)/);
    // 응답 머리의 시각을 다시 읽지 않는다 — 운영에선 배포 즈음에 사본이 다시 받아져 라벨이 바뀌었다(10-18).
    assert.ok(!src.includes('headers.get("date")'), "응답 시각(date 머리)을 라벨로 다시 쓴다");
    // 실패하면 null — 이 조회 하나로 화면을 던지지 않는다.
    assert.match(src, /withScopedLoadFailures/);
    assert.match(src, /return failed\.length \? null : value;/);
  });

  it("비우기 API 는 비우기 앞에서 비운 자리마다 시각을 적는다", () => {
    const src = read("app/api/revalidate/route.ts");
    const stamp = src.indexOf("const stamped = await stampRefresh(refreshKeys(parsed));");
    assert.ok(stamp > 0, "시각을 적는 자리가 없다");
    const firstRevalidate = src.indexOf("revalidatePath(", src.indexOf("export async function POST"));
    assert.ok(stamp < firstRevalidate, "비운 뒤에 적으면 비운 직후 그린 화면이 옛 시각을 읽는다");
    assert.match(src, /\/rest\/v1\/page_refresh\?on_conflict=target/);
    assert.match(src, /Prefer: "resolution=merge-duplicates,return=minimal"/);
    assert.match(src, /cache: "no-store"/);
  });

  it("마이그레이션이 코드가 쓰는 표 · 칸을 만든다", () => {
    const sql = read("supabase/migration_105_page_refresh.sql");
    assert.match(sql, /create table if not exists public\.page_refresh \(\n\s+target text primary key,\n\s+refreshed_at timestamptz not null default now\(\),/);
    assert.match(sql, /alter table public\.page_refresh enable row level security;/);
  });

  it("다섯 화면이 그 시각을 먼저 쓰고, 못 읽으면 자료 시각으로 물러선다", () => {
    assert.match(read("app/page.tsx"), /formatKstUpdate\(refreshedAt \?\? dailyScore\.updated_at, "업데이트"\)/);
    assert.match(read("lib/telegram-data.ts"), /const lastUpdated = refreshed \?\? written;/);
    assert.match(read("lib/us-telegram-data.ts"), /lastUpdated: refreshed \?\? written,/);
    assert.match(read("lib/theme-page.ts"), /const refreshed = await pageRefreshedAt\(\);\n\s+if \(refreshed\) return refreshed;/);
    assert.match(read("app/preview/page.tsx"), /Promise\.all\(\[pageRefreshedAt\(\), preview\.then\(\(p\) => previewShownAt\(p\.updatedAt\)\)\]\)\.then\(\(\[r, w\]\) => r \?\? w\)/);
  });
});

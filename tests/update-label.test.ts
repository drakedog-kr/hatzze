/**
 * 화면 '업데이트' 라벨은 그 화면이 실제로 바뀐 때를 말해야 한다(2026-10-18).
 * 화면은 자기가 보여 주는 자료가 다 쓰인 직후에 바뀌므로(daily-update.yml 의 화면 비우기 자리), 라벨은 **그 자료 가운데 가장 늦게
 * 쓰인 시각**이다. 예전엔 카더라 · 테마가 다 총평 시각을, 미리보기는 정각 '오전 7시'를 써서 08:13 에 바뀐 화면이 '오전 7시 30분'이었다.
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
    assert.match(src, /storedCollectionStats\(db\), kaderaShownAt\(db, "kr"\)/);
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

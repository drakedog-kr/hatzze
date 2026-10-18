/**
 * scripts/finalize-revalidate.sh — 파이프라인 마지막 비우기가 이 실행에서 먼저 바뀐 화면을 빼는지(2026-10-18).
 * 화면 첫 줄 '업데이트' 라벨은 화면이 새로 그려진 시각이라(lib/refreshed-at.ts), 먼저 바뀐 화면을 또 비우면 라벨만 늦게 바뀐다.
 * 거꾸로 앞 자리가 실패했는데 빼면 그 화면은 다음 실행까지 옛 값이다. DRY_RUN=1 로 부를 명령만 받아 본다.
 * 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { TOP_SEGMENTS } from "../lib/revalidate-paths.ts";

const SCRIPT = fileURLToPath(new URL("../scripts/finalize-revalidate.sh", import.meta.url));

/** 부를 명령 줄만 돌려준다(안내 줄은 뺀다). */
function plan(env: Record<string, string>): string[] {
  const r = spawnSync("bash", [SCRIPT], { env: { NODE_ENV: "test", PATH: process.env.PATH ?? "/usr/bin:/bin", DRY_RUN: "1", ...env }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split("\n").filter((l) => l.startsWith("revalidate.sh")).map((l) => l.trimEnd());
}

const OK = "success";

describe("아침", () => {
  it("미리보기(06:31)와 한 묶음(홈 · 카더라 · 테마)이 바뀌었으면 둘 다 빼고 나머지를 비운다", () => {
    assert.deepEqual(plan({ SLOT: "morning", RV_PREVIEW_AM: OK, RV_MORNING_GROUP: OK }), ["revalidate.sh --all-except /preview / /kadera /theme"]);
  });

  it("한 묶음이 실패했거나 등락률을 못 기다렸으면 그 넷도 여기서 비운다", () => {
    for (const g of ["failure", "skipped", ""]) {
      assert.deepEqual(plan({ SLOT: "morning", RV_PREVIEW_AM: OK, RV_MORNING_GROUP: g }), ["revalidate.sh --all-except /preview"], g);
    }
  });

  it("06:31 미리보기 비우기가 실패했으면 미리보기도 여기서 비운다", () => {
    assert.deepEqual(plan({ SLOT: "morning", RV_PREVIEW_AM: "failure", RV_MORNING_GROUP: OK }), ["revalidate.sh --all-except / /kadera /theme"]);
    assert.deepEqual(plan({ SLOT: "morning" }), ["revalidate.sh"]);
  });

  it("아침엔 저녁 화면별 결과를 안 본다 — 그 스텝들은 아침에 안 돈다", () => {
    assert.deepEqual(plan({ SLOT: "morning", RV_HOME: OK, RV_KADERA: OK, RV_KADERA_US: OK, RV_THEME: OK }), ["revalidate.sh"]);
  });
});

describe("저녁", () => {
  it("화면별로 먼저 바뀐 자리를 뺀다", () => {
    assert.deepEqual(
      plan({ SLOT: "evening", RV_HOME: OK, RV_PREVIEW_PM: OK, RV_THEME: OK, RV_KADERA: OK, RV_KADERA_US: OK }),
      ["revalidate.sh --all-except / /preview /theme /kadera"],
    );
  });

  it("카더라 둘 중 하나만 바뀌었으면 /kadera 자리를 빼고 남은 하나를 따로 비운다", () => {
    assert.deepEqual(plan({ SLOT: "evening", RV_KADERA: OK, RV_KADERA_US: "failure" }), ["revalidate.sh --all-except /kadera", "revalidate.sh /kadera/us"]);
    assert.deepEqual(plan({ SLOT: "evening", RV_KADERA: "failure", RV_KADERA_US: OK }), ["revalidate.sh --all-except /kadera", "revalidate.sh /kadera"]);
  });

  it("아무것도 먼저 안 바뀌었으면 전부 비운다 — 손으로 돌린 실행 · 앞 잡이 죽은 실행", () => {
    assert.deepEqual(plan({ SLOT: "evening" }), ["revalidate.sh"]);
    assert.deepEqual(plan({}), ["revalidate.sh"]);
    assert.deepEqual(plan({ SLOT: "evening", RV_MORNING_GROUP: OK, RV_PREVIEW_AM: OK }), ["revalidate.sh"]);
  });
});

it("빼는 자리는 전부 API 가 받는 최상위 자리다 — 아니면 비우기가 400 으로 통째 실패한다", () => {
  const all = plan({ SLOT: "morning", RV_PREVIEW_AM: OK, RV_MORNING_GROUP: OK }).concat(
    plan({ SLOT: "evening", RV_HOME: OK, RV_PREVIEW_PM: OK, RV_THEME: OK, RV_KADERA: OK, RV_KADERA_US: OK }),
  );
  for (const line of all) {
    for (const seg of line.replace("revalidate.sh --all-except ", "").split(" ")) {
      assert.ok((TOP_SEGMENTS as readonly string[]).includes(seg), seg);
    }
  }
});

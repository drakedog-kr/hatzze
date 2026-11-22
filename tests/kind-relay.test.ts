/**
 * lib/kind-relay.ts — `/api/kind` 가 무엇을 KIND 로 넘기는지. 헐거우면 잠금 뒤에서 아무 주소나 서울에서 두드리게 되고,
 * 빡빡하면 파이프라인이 조용히 직접 묻는 길로 돌아가 다시 해외 IP 403 을 맞는다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { FORWARD_HEADERS, KIND_ORIGIN, authorize, forwardHeaders, kindTarget } from "../lib/kind-relay.ts";

describe("kindTarget", () => {
  it("파이프라인이 부르는 자리는 쿼리째 KIND 주소가 된다", () => {
    assert.equal(
      kindTarget(["corpgeneral", "corpList.do"], "?method=download&searchType=13"),
      "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13",
    );
    assert.equal(kindTarget(["disclosure", "details.do"], ""), "https://kind.krx.co.kr/disclosure/details.do");
    assert.equal(kindTarget(["disclosure", "details.do"], "?"), "https://kind.krx.co.kr/disclosure/details.do");
  });

  it("공시 본문(external/…htm)은 받는다", () => {
    assert.equal(
      kindTarget(["external", "2026", "11", "16", "000736", "20261116001405", "61500.htm"], ""),
      "https://kind.krx.co.kr/external/2026/11/16/000736/20261116001405/61500.htm",
    );
  });

  it("허락 밖 경로 · 올라가기 · 이상한 글자는 막는다", () => {
    assert.equal(kindTarget([], ""), null);
    assert.equal(kindTarget(["admin", "login.do"], ""), null);
    assert.equal(kindTarget(["disclosure", "..", "admin.do"], ""), null);
    assert.equal(kindTarget(["external", "a", "b.jsp"], ""), null);
    assert.equal(kindTarget(["disclosure", "details.do%2F..%2F"], ""), null);
    assert.equal(kindTarget(["evil.example", "x.do"], ""), null);
  });

  it("호스트는 늘 KIND 다", () => {
    const t = kindTarget(["valueup", "dividend.do"], "?u=https://evil.example");
    assert.ok(t?.startsWith(`${KIND_ORIGIN}/`));
  });
});

describe("파이프라인 스크립트의 KIND 주소가 전부 허락 안에 든다", () => {
  // 새 스크립트가 다른 KIND 자리를 부르면 여기서 깨진다 — lib/kind-relay.ts KIND_PATHS 에 한 줄 더할 것.
  // 빠진 채 나가면 그 스크립트만 400 을 받고 직접 묻는 길로 돌아가 다시 해외 IP 403 을 맞는다.
  const dirs = ["data-pipeline/scripts", "data-pipeline/common"];
  const urls = new Set<string>();
  for (const d of dirs) {
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".py")) continue;
      for (const m of readFileSync(`${d}/${f}`, "utf8").matchAll(/https:\/\/kind\.krx\.co\.kr\/([A-Za-z0-9_./-]+\.do)/g)) {
        urls.add(m[1]);
      }
    }
  }

  it("주소를 찾았다", () => assert.ok(urls.size >= 6, [...urls].join(", ")));
  for (const path of urls) {
    it(path, () => assert.notEqual(kindTarget(path.split("/"), ""), null));
  }
});

describe("forwardHeaders", () => {
  it("넷만 넘기고 비밀(authorization) · 쿠키는 넘기지 않는다", () => {
    const h = new Headers({
      authorization: "Bearer s",
      cookie: "a=1",
      "content-type": "application/x-www-form-urlencoded",
      referer: "https://kind.krx.co.kr/r",
      "user-agent": "hatzze/1.0",
      "x-requested-with": "XMLHttpRequest",
      "x-forwarded-for": "1.2.3.4",
    });
    assert.deepEqual(Object.keys(forwardHeaders(h)).sort(), [...FORWARD_HEADERS].sort());
  });
});

describe("authorize", () => {
  it("비밀이 서버에 없으면 열지 않는다", () => assert.equal(authorize("Bearer x", undefined), "unset"));
  it("맞으면 ok", () => assert.equal(authorize("Bearer s3", "s3"), "ok"));
  it("틀리거나 없으면 denied", () => {
    assert.equal(authorize("Bearer s4", "s3"), "denied");
    assert.equal(authorize(null, "s3"), "denied");
    assert.equal(authorize("s3", "s3"), "denied");
  });
});

/**
 * lib/json-ld.ts — 구조화 데이터를 script 태그에 넣는 자리. 값에 `</script>` 가 섞여도 태그가 안 끊기고,
 * 검색엔진이 되읽는 값은 원래 그대로여야 한다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { jsonLdHtml } from "../lib/json-ld.ts";

describe("jsonLdHtml", () => {
  const nasty = {
    headline: '오늘</script><script>alert("x")</script> & <!-- 끝',
    name: "줄\u2028구분\u2029자",
    nested: [{ description: "a<b>c" }],
  };

  it("script 태그를 닫거나 여는 글자가 남지 않는다", () => {
    const html = jsonLdHtml(nasty);
    assert.ok(!html.includes("<"), html);
    assert.ok(!html.includes(">"), html);
    assert.ok(!html.includes("&"), html);
    assert.ok(!/[\u2028\u2029]/.test(html));
  });

  it("되읽으면 원래 값이다", () => {
    assert.deepEqual(JSON.parse(jsonLdHtml(nasty)), nasty);
  });

  it("평범한 값은 JSON.stringify 와 같다", () => {
    const v = { "@context": "https://schema.org", name: "국장 카더라", n: 3 };
    assert.equal(jsonLdHtml(v), JSON.stringify(v));
  });
});

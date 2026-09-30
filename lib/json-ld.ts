/**
 * 구조화 데이터(JSON-LD)를 `<script type="application/ld+json">` 안에 넣을 문자열로 바꾼다.
 *
 * ## 왜 JSON.stringify 만으로는 모자라나
 *
 * JSON.stringify 는 따옴표·역슬래시는 이스케이프하지만 `<` 는 그대로 둔다. 값에 `</script>` 가 섞이면
 * HTML 파서가 거기서 스크립트를 닫고, 그 뒤는 마크업으로 읽힌다 — 태그가 끊기고, 값이 바깥에서 온
 * 문자열이면 스크립트 주입이 된다. 데일리 노트 글 제목·요약이 DB 에서 오고(app/daily/[date]/page.tsx),
 * 종목·투자자 이름도 그렇다. Next 문서(docs/01-app/02-guides/json-ld.md)가 `<` → `<` 를 권한다.
 *
 * `>` · `&` 와 줄 구분자 두 글자(U+2028·U+2029)도 같이 바꾼다. `<!--` 같은 조합과 옛 파서의 문자열 끊김을
 * 막는 흔한 묶음이다. 모두 JSON 안에서 같은 글자를 뜻하는 `\uXXXX` 라 검색엔진이 읽는 값은 그대로다
 * (tests/json-ld.test.ts 가 되읽어 본다).
 *
 * DB 를 안 만지는 순수 함수라 lib 에 두고, 구조화 데이터를 내는 세 곳(루트 레이아웃 · PageJsonLd ·
 * 데일리 노트 Article)이 모두 이것을 쓴다.
 */
export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

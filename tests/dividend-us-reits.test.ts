/**
 * lib/dividend.ts 의 미국 리츠 목록 — 배당으로 살기(/dividend)의 배당성향으로 거르는 바스켓(꾸준함 · 지금 배당수익률 · 성장 · 배당귀족 ·
 * 미국 배당성장)은 미국 리츠를 안 세우고, 리츠 줄에는 배당성향을 안 붙인다. 표(us_dividend_stock)에 리츠 표시가 없어서 화면이 티커 목록으로
 * 가르는데, 수집 대상은 세 갈래(카더라 사전 · 손목록 · S&P500 목록)로 들어온다. 목록이 손목록만 따라가서 S&P500 으로 들어온 리츠가 그 바스켓에
 * 섰고(2026-11-23 운영 화면: '지금 배당수익률 우선' 미국 첫 자리에 ARE, '배당귀족'에 FRT) 줄에는 EPS 기준 배당성향 알약이 섰다(디지털리얼티 204%).
 * 화면 목록과 수집 목록이 어긋나는 자리를 여기 붙박는다. 돌리는 법: `npm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SCREEN = read("lib/dividend.ts");

/** lib/dividend.ts 는 서버 전용이라 여기서 못 부른다 — 배열 글자를 그대로 읽는다. */
function tickersOf(name: string): string[] {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\];`).exec(SCREEN);
  assert.ok(m, `lib/dividend.ts 에서 ${name} 배열을 못 찾았다`);
  return [...m[1].matchAll(/"([A-Z.]+)"/g)].map((x) => x[1]);
}
/** 파이썬 dict 글자에서 열쇠(티커)만. */
const pyKeys = (text: string) => [...text.matchAll(/^\s*"([A-Z.]+)":/gm)].map((m) => m[1]);

const HAND = tickersOf("US_REITS");
const SP500_REITS = tickersOf("US_SP500_REITS");

describe("미국 리츠 목록 — 배당성향 바스켓에 안 세우고 배당성향도 안 붙인다", () => {
  it("배당성향 바스켓의 미국 후보는 손목록과 S&P500 리츠를 합친 것으로 거른다", () => {
    // 손목록(US_REITS)만으로 거르던 때 ARE · FRT 가 섰다. 한쪽 목록으로 되돌아가면 다시 선다.
    assert.match(SCREEN, /const US_REIT_CODES: ReadonlySet<string> = new Set\(\[\.\.\.US_REITS, \.\.\.US_SP500_REITS\]\);/);
    assert.match(SCREEN, /const usPayers = usPayersAll\.filter\(\(s\) => !US_REIT_CODES\.has\(s\.code\)\);/);
    for (const t of ["ARE", "FRT"]) assert.ok(SP500_REITS.includes(t), `${t} 가 US_SP500_REITS 에 없다`);
  });

  it("배당성향도 합친 목록으로 숨긴다", () => {
    // 손목록만 보던 때 S&P500 리츠 열아홉 줄에 EPS 기준 배당성향이 섰고 그중 열셋은 100% 를 넘겨 붉은 알약이었다.
    // 미국 줄은 toUsStock 이 값을 붙이는 자리에서, 국내와 같이 쓰는 isReitLike 는 그 식에서 본다.
    assert.match(SCREEN, /payout: r\.payout_pct != null && !US_REIT_CODES\.has\(r\.ticker\) \?/);
    assert.match(SCREEN, /const isReitLike = [^\n]*\(s\.currency === "USD" && US_REIT_CODES\.has\(s\.code\)\);/);
  });

  it("두 목록에 같은 티커가 두 번 없다", () => {
    const all = [...HAND, ...SP500_REITS];
    assert.deepEqual(all.filter((t, i) => all.indexOf(t) !== i), []);
  });

  it("S&P500 리츠는 전부 S&P500 수집 목록에 있는 티커다", () => {
    // 목록을 다시 옮겨 지수에서 빠진 리츠가 생기면 여기서 걸린다 — 그때 새로 든 리츠도 같이 맞춘다(us_sp500.py 머리말).
    const sp500 = new Set(pyKeys(read("data-pipeline/config/us_sp500.py")));
    assert.ok(sp500.size >= 400, `us_sp500.py 에서 읽은 티커가 ${sp500.size}개뿐이다`);
    assert.deepEqual(SP500_REITS.filter((t) => !sp500.has(t)), []);
  });

  it("수집 손목록의 '리츠·인프라' 묶음은 리츠(US_REITS)와 리츠 아닌 일곱으로 남김없이 갈린다", () => {
    // 묶음에 종목을 더하면 리츠인지 아닌지를 여기서 정해야 한다. 리츠인데 US_REITS 에 안 적으면 배당성향 바스켓에 선다.
    const NOT_REITS = ["MAIN", "ARCC", "EPD", "ET", "MPLX", "WMB", "OKE"]; // BDC 둘 · 가스관·송유관 회사 다섯
    const block = /EXTRA_US_DIVIDEND[^=\n]*=\s*\{([^}]*)\}/.exec(read("data-pipeline/config/us_dividend_universe.py"));
    assert.ok(block, "EXTRA_US_DIVIDEND 묶음을 못 찾았다");
    const lines = block[1].split("\n");
    // 묶음은 머리 주석에서 다음 묶음의 머리 주석 앞까지다(⚠️ 로 시작하는 주석은 묶음 안의 안내 줄).
    const start = lines.findIndex((l) => /^\s*# 리츠·인프라/.test(l));
    const end = lines.findIndex((l, i) => i > start && /^\s*# (?!⚠️)/.test(l));
    assert.ok(start >= 0 && end > start, "'리츠·인프라' 묶음의 머리 주석을 못 찾았다 — 주석을 고쳤으면 이 테스트의 표지도 고친다");
    const group = pyKeys(lines.slice(start, end).join("\n"));
    assert.deepEqual(HAND.filter((t) => !group.includes(t)), [], "US_REITS 에 수집 손목록의 리츠 묶음에 없는 티커가 있다");
    assert.deepEqual(group.filter((t) => !HAND.includes(t)).sort(), [...NOT_REITS].sort());
  });
});

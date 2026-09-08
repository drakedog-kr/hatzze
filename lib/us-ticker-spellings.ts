/**
 * 같은 회사인데 표마다 티커 표기가 다른 것을 하나로 본다.
 *
 * ## 왜 필요한가
 *
 * 원천이 넷인데 저마다 클래스 주식을 다르게 적는다. 버크셔가 그렇다.
 *
 *   us_stocks · telegram_us_stock_daily · us_insider_txn · us_analyst_consensus → `BRK`
 *   us_manager_holding(13F)                                                    → `BRK-B`
 *   us_congress_trade(의원)                                                     → `BRK.B`
 *
 * 상세 화면이 `.eq("ticker", ticker)` 로 표마다 따로 물으니 셋이 서로 못 만난다.
 * 그래서 `/insider/stock/BRK` 는 "월가 거물 보유 **0/63명**", `/insider/stock/BRK.B` 는
 * "임원 신고 **0건**" 이라고 **없다고 단언**했다. 실제로는 거물 16곳이 들고 있다.
 * 숫자가 조금 틀린 것과 없다고 말하는 것은 다르다 — 독자가 반증할 길이 없다.
 *
 * ## ⚠️⚠️ 접미사를 기계로 붙이면 다른 회사가 합쳐진다
 *
 * "뿌리 + A/B 는 같은 회사의 다른 클래스"라는 규칙이 그럴듯해 보이는데, 실제 표를
 * 전수로 훑으면 **전부 남남**이다. 우리 사전 194종목에 대해 재 본 것:
 *
 *   C  ↔ CB    씨티그룹 ↔ 처브(보험)
 *   HD ↔ HDB   홈디포 ↔ HDFC 은행(인도)
 *   MA ↔ MAA   마스터카드 ↔ 미드아메리카 아파트
 *   MS ↔ MSA/MSB · CVS ↔ CVSA · HON ↔ HONA · MU ↔ MUA  전부 별개 종목
 *
 * 그래서 **구분자가 있을 때만** 클래스로 본다. `BRK-B`·`BRK.B` 는 클래스이고
 * `CB` 는 아니다. 같은 이유로 뿌리와 클래스를 잇는 것은 기계 규칙이 아니라 아래
 * 손으로 적은 표다. 전수로 재 보니 지금 그 표에 들 것은 버크셔 하나뿐이다.
 *
 * ## 어디까지 하는가
 *
 * 표기를 **넓혀 조회**할 뿐 DB 를 고치지 않는다. 원천이 각자 자기 관례로 적는 것은
 * 그쪽 사정이고, 우리가 저장할 때 바꾸면 다음 수집이 도로 돌려놓는다. 읽는 자리에서
 * 합치는 편이 되돌리기 쉽다.
 */

/**
 * 우리 사전(`us_stocks`)이 뿌리로 들고 있는데 13F·의원 표는 클래스로 적는 종목.
 *
 * ⛔ **기계로 만들지 말 것.** 위 주석의 C↔CB·HD↔HDB 를 보라. 여기 한 줄을 더하기 전에
 *    두 티커가 정말 같은 회사인지 손으로 확인한다. 값에는 **구분자가 있는 표기만** 적는다.
 */
const CLASS_ALIASES: Record<string, readonly string[]> = {
  BRK: ["BRK-A", "BRK-B", "BRK.A", "BRK.B"],
};

/** 뿌리를 거꾸로 찾는 표. `BRK.B` → `BRK`. 위 표에서 한 번만 만든다. */
const ROOT_OF: Record<string, string> = Object.fromEntries(
  Object.entries(CLASS_ALIASES).flatMap(([root, list]) => list.map((cls) => [cls, root])),
);

/** 구두점을 뗀 비교용 열쇠. `BRK-B` · `BRK.B` · `BRKB` 가 모두 `BRKB` 가 된다. */
export function tickerKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[.\-]/g, "");
}

/**
 * 화면과 사전이 쓰는 대표 표기. 클래스로 들어와도 뿌리를 돌려준다.
 *
 * `/insider/stock/BRK.B` 로 들어와도 종목명을 `us_stocks` 의 `BRK` 에서 찾게 하려는 것이다.
 * 예전엔 그 주소가 이름을 못 찾아 **"이름 미상"** 으로 떴다.
 */
export function canonicalTicker(raw: string): string {
  const t = raw.trim().toUpperCase();
  return ROOT_OF[t] ?? t;
}

/**
 * 이 종목을 찾을 때 표에 물어야 할 표기 전부. `.in("ticker", …)` 에 그대로 넣는다.
 *
 * 넓히는 갈래가 둘이다.
 *   ① 구두점만 다른 표기 — `BRK-B` 로 들어오면 `BRK.B` · `BRKB` 도 같이 본다.
 *   ② 손으로 적은 클래스 표(CLASS_ALIASES) — `BRK` 로 들어오면 `BRK-B` · `BRK.B` 도 본다.
 *
 * ⚠️ ①은 **없는 표기를 더 만들어 내지 않는다.** 들어온 글자를 구두점만 바꿔 볼 뿐이라,
 *    `MSA` 로 들어와도 `MS` 를 부르지 않는다(그게 위 주석의 사고를 막는 자리다).
 */
export function tickerSpellings(raw: string): string[] {
  const t = raw.trim().toUpperCase();
  const out = new Set<string>([t]);

  // ① 구두점만 바꿔 본다. 들어온 자리에 있던 구분자를 다른 것으로 갈거나 뗄 뿐이다.
  if (/[.\-]/.test(t)) {
    out.add(t.replace(/[.\-]/g, "-"));
    out.add(t.replace(/[.\-]/g, "."));
    out.add(t.replace(/[.\-]/g, ""));
  }

  // ② 뿌리 ↔ 클래스. 어느 쪽으로 들어와도 같은 묶음을 본다.
  const root = canonicalTicker(t);
  out.add(root);
  for (const cls of CLASS_ALIASES[root] ?? []) out.add(cls);

  return [...out];
}

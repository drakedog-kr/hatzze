/**
 * 내부자 리포트가 **메인 화면과 전체보기 페이지에서 함께 쓰는** 표시 부품.
 *
 * 떼어낸 이유는 하나다 — 같은 줄이 두 화면에서 **똑같이** 그려져야 한다. 전체보기는
 * "이 카드의 나머지"라, 줄의 생김새가 조금이라도 갈리면 다른 자료로 읽힌다.
 *
 * ⚠️ 서버 컴포넌트다. "use client" 를 붙이지 말 것 — 이 부품들은 상태가 없고,
 *    붙이는 순간 여기 실린 데이터가 통째로 클라이언트 번들을 탄다.
 */
import { Fragment } from "react";

import Link from "next/link";

import type { AnalystTop, CongressTicker, InsiderActivity, InsiderOverview, InsiderRow, ManagerMove, ManagerRank } from "@/lib/insider-data";
import type { AnalystAction, AnalystConsensus, ManagerHolding, StockHolder } from "@/lib/insider-detail";

import { ExpandableList } from "../kadera/ExpandableList";
import type { InsiderListSlug } from "./lists";
import { Pill, type Tone } from "../kadera/parts";
import { StockLogo } from "../StockLogo";
import { C, Icon, MONO } from "../ui";

/** 이 화면의 자. 서학개미(scale.ts)와 같은 네 단이다. */
export const T = { big: 22, lead: 15, body: 12, small: 11 } as const;

/**
 * 목록 한 줄의 **글자 단**. 카드·전체보기·상세가 전부 이 셋만 쓴다.
 *
 * ## ⚠️ 왜 셋뿐인가
 *
 * 한 줄에 스타일이 다섯이었다 — 11 · 11 · 11.5 · 12 · 12.5px 에 굵기 400·600·700·800.
 * **1.5px 안에 다섯 단이 몰려 있으니 위계가 없다.** 명암비는 전부 4.6 위로 멀쩡했는데도
 * 읽기 어려웠던 게 그래서다. 눈이 무엇부터 볼지 못 정한다.
 *
 * ## ⚠️ 12px 이 바닥이다
 *
 * globals.css 의 '읽히는 잉크 램프'가 못박은 규칙이다 — **정보성 텍스트는 12px 이
 * 바닥이고 10~11px 은 차트 축 눈금뿐**이다. 보조줄을 11 로 쓰던 것이 그 규칙 위반이었다.
 *
 * ⭐ 크기 차이를 **또렷하게** 벌린다(13.5 / 13 / 12). 굵기는 둘(700 / 500)뿐이고,
 *   색도 잉크와 sub2 둘뿐이다.
 */
export const ROW = {
  /** 주인공 — 종목 이름이나 사람 이름. */
  lead: { fontSize: 13.5, fontWeight: 700, color: C.ink } as const,
  /** 값 — 숫자. 주인공과 같은 무게로 두어 눈이 좌우를 함께 짚는다. */
  value: { fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.ink } as const,
  /** 보조 — **한 종류뿐이다.** 여기에 또 단을 만들지 말 것. */
  sub: { fontSize: 12, fontWeight: 500, color: C.sub2 } as const,
} as const;

export function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 13F 의 기준일을 **발표 분기 이름**으로 — `"2026-06-30"` → `"2026 Q2"`.
 *
 * ⚠️ 예전엔 배지에 `3/31 → 6/30` 으로 적었다. 그건 우리가 안에서 무엇과 무엇을 견줬는지
 * 말하는 건데, 독자가 아는 이름은 **"2026년 2분기 13F"** 다 — 언론도 운용사도 그렇게
 * 부른다. 두 분기를 견줬다는 사실은 시트 설명과 물음표 툴팁이 이미 말한다.
 *
 * ⚠️ 13F 의 report_date 는 늘 분기말(3/31 · 6/30 · 9/30 · 12/31)이라 달만 보면 된다.
 * 그래도 `ceil` 로 뽑는다 — 원천이 분기 중간 날짜를 주더라도 분기가 밀리지 않는다.
 */
export function quarterLabel(iso: string | null): string {
  if (!iso) return "-";
  const [y, m] = iso.split("-");
  return `${y} Q${Math.ceil(Number(m) / 3)}`;
}

/**
 * 카드 배지와 **전체보기 배지의 한 벌짜리 규칙**. 두 화면이 같은 목록을 보여주므로
 * "무엇을 기준으로 센 값인가"도 한 문장이라야 한다.
 *
 * ## ⚠️⚠️ 규칙을 두 벌로 두면 조용히 갈라진다
 *
 * 실제로 갈라져 있었다. 메인 카드를 전부 날짜 기준으로 바꿨는데(2026-08-24) 전체보기
 * 쪽은 자기 사다리꼴 삼항식을 따로 들고 있어서 그대로 남았다. 같은 카드가 자리에 따라
 * 다른 말을 했다.
 *
 *   임원      카드 '8/20까지 7일'   ↔ 전체보기 '최근 7일'
 *   의원      카드 '8/18까지 90일'  ↔ 전체보기 '최근 90일'
 *   애널리스트 카드 '8/23 기준'      ↔ 전체보기 '지금 컨센서스'
 *   보유       카드 '2026 Q2'       ↔ 전체보기 '63명 중'   ← 날짜가 아예 없다
 *
 * ⭐ 그래서 두 곳이 이 함수 하나만 부른다. 규칙을 바꾸려면 여기만 고치면 되고,
 *   한쪽만 고쳐 어긋나게 만들 방법이 없다.
 */
export function insiderNote(kind: InsiderListSlug, ov: InsiderOverview): string {
  // 분기 축은 '무엇과 무엇을 견줬나'가 아니라 **최신 분기 이름**만 적는다. 짧아야 읽힌다.
  const quarter = ov.compareQuarters.length === 2 ? quarterLabel(ov.compareQuarters[1]) : "직전 분기 대비";
  // 날짜가 없으면 창 길이만 적는다. "-까지 7일"로 새는 것보다 낫다.
  const upTo = (d: string | null, days: number) => (d ? `${fmtDate(d)}까지 ${days}일` : `최근 ${days}일`);
  switch (kind) {
    case "exec":
      return upTo(ov.asOf, ov.windowDays);
    case "congress":
      return upTo(ov.congressAsOf, ov.congressWindowDays);
    case "hot":
      return `${fmtDate(ov.mentionDate)} 하루`;
    case "analyst":
      return ov.analystAsOf ? `${fmtDate(ov.analystAsOf)} 기준` : "받은 날 기준";
    case "adds":
    case "trims":
    case "managers":
    case "holders":
      return quarter;
  }
}

/**
 * 거래 코드의 한글 이름.
 *
 * ⚠️ 뭉뚱그려 "매도"라고 적으면 안 된다. 우리 종목 신고의 69%가 S 지만 그 상당수가
 * 스톡옵션 행사에 딸린 것이라, 성격을 갈라 적어야 거짓말이 안 된다.
 *
 * ⚠️ 색은 여기 없다. 이 이름들은 이제 알약이 아니라 **줄 가운데의 글자**로 나가고,
 *    방향을 말하는 색은 `MOVE_TONE` 한 군데서만 정한다.
 */
export const CODE_LABEL: Record<string, { text: string }> = {
  P: { text: "장내 매수" },
  S: { text: "장내 매도" },
  M: { text: "옵션 행사" },
  A: { text: "무상 취득" },
  F: { text: "세금 원천징수" },
  C: { text: "전환" },
  G: { text: "증여" },
  J: { text: "그 밖" },
};

/**
 * 변화를 "유지"로 접는 문턱(%). 13F 의 주식 수는 자잘하게 흔들린다 — 실측 2,616개
 * 보유 중 105개가 0 이 아니면서 0.5% 미만이었다(−0.072% 같은 값). 그대로 반올림하면
 * **"0% 줄임"** 이라는 없는 말이 나온다.
 */
const HOLD_FLOOR = 0.5;

/**
 * 방향 배지의 색 — **국내 증시 관례**다. 사는 쪽이 빨강, 파는 쪽이 파랑, 그대로면 회색.
 *
 * ⚠️⚠️ **여기 한 군데서만 정한다.** 방향을 말하는 알약이 이 화면에 다섯 자리 있다
 *    (거물 배지 · 늘린/줄인 종목의 신규·청산 · 장내 매수 표시 둘). 자리마다 색을 손으로
 *    적으면 한 곳을 고칠 때 나머지가 남아 **같은 뜻이 화면마다 다른 색**으로 뜬다.
 *
 * ⚠️ 미국 화면의 관례와 반대다(저쪽은 오르면 초록·내리면 빨강). 한국 독자가 보는
 *    화면이라 여기 관례를 따른다.
 *
 * ⚠️ `blue` 는 방향이 아니다 — "카더라 언급" 같은 알림표가 쓴다. 방향에는 `cold` 를
 *    쓴다(라이트에서 두 tint 가 같은 값이라 눈으로는 안 갈리지만, 뜻이 다른 자리는
 *    토큰도 달라야 나중에 한쪽만 바꿀 수 있다).
 */
const MOVE_TONE = { buy: "hot", sell: "cold", hold: "plain" } as const satisfies Record<string, Tone>;

/**
 * 거물의 분기 움직임 배지 — **방향만이 아니라 얼마나** 움직였는지 적는다.
 *
 * ## ⭐ 왜 칸을 안 늘렸나
 *
 * 증감률에 자기 칸을 주면 표가 다섯 칸이 된다. 대신 이미 있던 배지("추가"·"축소")를
 * 숫자가 든 말로 바꿨다 — 자리도 안 늘고, 숫자가 **그 일을 한 사람 바로 옆**에 선다.
 *
 * ## ⚠️ 이 %는 **주식 수** 기준이다
 *
 * 옆 칸의 "비중 9.4%" 와 다른 종류의 숫자다. 그래서 맨숫자(`−20%`)로 두지 않고
 * "20% 줄임"처럼 **동사를 붙인다** — 안 붙이면 수익률로 읽힌다.
 *
 * ## ⚠️ 큰 증가는 %가 아니라 배로 적는다
 *
 * 실측 최대가 +98,752% 다(엔비디아). 배지에 "98752% 늘림"이라 적으면 읽히지 않는다.
 * 두 배를 넘으면 "3배로 늘림"으로 접는다. 실측 p95 가 +112.6% 라 대부분은 % 로 남는다.
 *
 * ## ⚠️ 색은 **국내 증시 관례**를 따른다 — 사는 쪽이 빨강, 파는 쪽이 파랑
 *
 * 미국 화면의 관례(오르면 초록·내리면 빨강)와 반대다. 한국 독자가 보는 화면이라
 * 여기 관례를 따른다. 이 규칙은 `MOVE_TONE` 에 모아 두었고 화면 전체가 그걸 쓴다 —
 * 한 자리만 고치면 같은 뜻이 화면마다 다른 색으로 뜬다.
 */
export function moveBadge(
  move: "new" | "add" | "trim" | "hold" | null,
  sharesChange: number | null,
): { text: string; tone: Tone } | null {
  if (!move) return null;
  if (move === "new") return { text: "신규", tone: MOVE_TONE.buy };
  if (sharesChange == null || Math.abs(sharesChange) < HOLD_FLOOR) return { text: "유지", tone: MOVE_TONE.hold };
  if (sharesChange < 0) return { text: `${Math.round(-sharesChange)}% 줄임`, tone: MOVE_TONE.sell };
  if (sharesChange < 100) return { text: `${Math.round(sharesChange)}% 늘림`, tone: MOVE_TONE.buy };
  const times = 1 + sharesChange / 100;
  const t = times < 10 ? times.toFixed(1).replace(/\.0$/, "") : Math.round(times).toLocaleString("ko-KR");
  return { text: `${t}배로 늘림`, tone: MOVE_TONE.buy };
}

/**
 * 카드 묶음 앞에 붙는 **구간 이름**. 생김새는 `.hz-section-badge`(globals.css) —
 * 시장 브리핑·카더라·MDD 의 같은 줄과 한 벌이다.
 *
 * ⭐ 하는 일은 이름 짓기가 아니라 **박자 만들기**다. 카드가 줄줄이 이어지면 어디까지가
 *   한 이야기인지 안 보인다. 루트 gap 16 위에 클래스 기본 margin-top 14 가 얹혀 구간
 *   사이가 30 이 되므로, 카드 사이(16)보다 넓어져 장이 갈린다.
 *
 * ⚠️ **개수를 안 적는다.** 다른 화면의 배지는 "시장지표 15"처럼 묶음 크기를 함께 내는데,
 *    여기는 한두 장짜리 구간이 많아 숫자가 뜻을 잃는다.
 * ⚠️ 태그가 h2 인 것은 문서 구조다 — 페이지 h1 아래 구간 h2, 시트 제목이 h3 다.
 */
export function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="hz-section-badge">
      <h2>{children}</h2>
    </div>
  );
}

/**
 * "카더라 언급" 알약 — **회색이다.** 이 화면에서 색은 방향(사고 판 것)이 갖는다.
 *
 * ⚠️ 파랑이었는데 방향의 파랑(`cold`)과 라이트에서 **같은 값**이라(둘 다 `#e8f3fe`),
 *    한 줄에 나란히 서면 색으로 안 갈렸다 — 버핏 페이지 BAC 행이 "6% 줄임"과
 *    "카더라 언급" 둘 다 파랑이었다. 색은 방향에만 남기고 이 표시는 회색으로 내렸다.
 *
 * ⚠️ 여섯 자리가 이 알약을 쓴다. 자리마다 `<Pill>` 을 손으로 적으면 한 곳을 고칠 때
 *    나머지가 남는다 — 실제로 툴팁이 두 자리에만 붙어 있었다.
 *
 * ⚠️ **하루치다.** `ourTickers` 가 `telegram_us_stock_daily` 를 `.eq("date", mentionDate)`
 *    로 하루만 읽는다. 툴팁이 "최근 언급된 적이 있는" 이었는데 그건 쌓인 기간으로 읽혀서
 *    실물보다 넓었다 — 8/25 하루가 107종목인데 최근 7일이면 160종목이라, 기간으로
 *    읽으면 53종목이 빠져 보인다(2026-08-25 실측). 하루로 두기로 하고 문구를 좁혔다.
 */
export function KaderaPill() {
  return (
    <Pill tone="plain" title="오늘 주식 텔레그램에서 언급된 종목입니다">
      카더라 언급
    </Pill>
  );
}

/**
 * 한 종목의 코드 묶음을 한 줄로 편다 — "세금 원천징수 9 · 장내 매도 2".
 *
 * ⚠️ 종류가 서넛까지 가는데(루멘텀이 F·A·S 셋) 다 적으면 줄이 넘친다. 많은 순으로
 * 둘만 적고 나머지는 "외 N종"으로 접는다.
 */
export function codeSummary(codes: { code: string; n: number }[]): string {
  // ⚠️ 단위를 붙인다. "장내 매도 165" 는 165가 건수인지 금액인지 주식 수인지 안 말한다 —
  //    바로 옆 칸이 금액이라 특히 헷갈렸다.
  const head = codes.slice(0, 2).map((c) => `${CODE_LABEL[c.code]?.text ?? c.code} ${c.n}건`);
  return head.join(" · ") + (codes.length > 2 ? ` 외 ${codes.length - 2}종` : "");
}

export function money(v: number | null): string {
  if (v == null) return "금액 미상";
  // ⚠️ B 단이 없어서 버핏이 든 알파벳이 `$28157.6M` 로 찍혔다. 상세 화면은 조 단위를
  //    다루므로(거물 AUM 이 최대 $299B) 반드시 한 단 더 있어야 한다.
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

/**
 * 원화 표기. **위 `money()` 와 자릿수를 맞춘 짝**이다.
 *
 * ⚠️ 서학개미의 `won()` 을 그냥 못 쓴다. 그쪽은 조·억·만에서 끊는데 이 화면의 금액은
 * $21K~$189M 에 몰려 있어서, 같은 규칙을 쓰면 작은 값이 "2,700만원"처럼 길어져 좁은
 * 반쪽 카드에서 줄이 넘친다. 달러 쪽이 M·K 로 접는 만큼 여기도 조·억으로 접는다.
 */
export function wonOf(v: number | null, rate: number): string {
  if (v == null) return "금액 미상";
  const w = v * rate;
  if (w >= 1e12) return `${(w / 1e12).toFixed(1)}조원`;
  if (w >= 1e8) return `${Math.round(w / 1e8).toLocaleString("ko-KR")}억원`;
  if (w >= 1e4) return `${Math.round(w / 1e4).toLocaleString("ko-KR")}만원`;
  return `${Math.round(w).toLocaleString("ko-KR")}원`;
}

/**
 * 금액 한 자리 — 달러와 원을 **둘 다 그려 두고** CSS 가 하나만 보여 준다.
 *
 * ⭐ 서학개미와 같은 수다(`app/seohak/money.tsx`). 이 화면의 줄도 거의 다 서버
 * 컴포넌트라, 통화를 리액트 상태로 두면 그 전부를 클라이언트로 끌어와야 한다. 대신
 * 뿌리 요소의 `data-cur` 를 보고 globals.css 가 한쪽을 숨긴다 — 기본(속성 없음)이 원화다.
 *
 * ⚠️ 환율을 못 받으면 달러만 낸다. 0 으로 흘리면 "0원"이 고장이 아니라 사실처럼 읽힌다.
 */
export function Money({ usd, rate }: { usd: number | null; rate: number | null }) {
  if (usd == null) return <>금액 미상</>;
  if (!rate) return <>{money(usd)}</>;
  return (
    <>
      <span className="hz-usd">{money(usd)}</span>
      <span className="hz-krw">{wonOf(usd, rate)}</span>
    </>
  );
}

/** 현재가와 등락. 못 받으면 빈칸이다 — 틀린 숫자보다 낫다. */
export function Quote({
  price,
  change,
  rate,
  large,
}: {
  price: number | null;
  change: number | null;
  rate?: number | null;
  /** 히어로처럼 시세가 주인공인 자리. 표의 한 칸에서는 주지 않는다. */
  large?: boolean;
}) {
  const dollars = price == null ? "-" : `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  // ⚠️ 등락률은 통화와 무관하다. 환산하지 말 것.
  const wons = price == null || !rate ? null : `${Math.round(price * rate).toLocaleString("ko-KR")}원`;
  return (
    <span
      style={{
        display: "flex",
        flexDirection: large ? "row" : "column",
        alignItems: large ? "baseline" : "flex-end",
        gap: large ? 8 : 1,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: large ? 22 : 12,
          fontWeight: 800,
          color: C.ink,
          letterSpacing: large ? "-.02em" : undefined,
          whiteSpace: "nowrap",
        }}
      >
        {wons ? (
          <>
            <span className="hz-usd">{dollars}</span>
            <span className="hz-krw">{wons}</span>
          </>
        ) : (
          dollars
        )}
      </span>
      {change != null && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: large ? 13 : 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
            color: change > 0 ? "var(--c-hot-ink)" : change < 0 ? "var(--c-cold-ink)" : C.sub2,
          }}
        >
          {change > 0 ? "▲" : change < 0 ? "▼" : ""}
          {Math.abs(change).toFixed(2)}%
        </span>
      )}
    </span>
  );
}

/**
 * 종목 한 줄의 왼쪽 — 로고 · 티커 · 이름 · 보조줄. 모든 블록이 같은 꼴을 쓴다.
 *
 * ⭐ 통째로 **종목 상세로 가는 링크**다. 카드·전체보기·상세 어디서든 종목 이름을 누르면
 * 같은 곳으로 간다 — 자리마다 다르게 굴면 독자가 어디를 눌러야 할지 매번 확인해야 한다.
 */
/**
 * ` · ` 로 이어 붙인 보조줄. **넓은 화면에선 한 줄로 자르고, 폰에서는 접는다.**
 *
 * ⚠️⚠️ 자르기를 인라인 style 로 주면 미디어쿼리가 못 이긴다. 그래서 생김새는 전부
 *    `.hz-cellsub`(globals.css)에 있다 — 여기서 style 로 되돌리지 말 것.
 *
 * ⭐ 덩이를 `nowrap` 으로 묶되 **짧은 덩이만** 묶는다. 전부 묶었더니 ` · ` 가 없는 한
 *    덩이짜리 줄(`의원 Richard Dean Dr McCormick 외 6명`)이 통째로 안 접혀 그대로
 *    잘렸다 — 접힘을 막는 규칙이 접힘이 **필요한** 줄까지 막은 것이다.
 *
 * ⚠️ 문턱은 짐작이 아니라 실측이다(2026-08-23 · 375px). 이 칸의 폭이 117~194px 이고
 *    12px 프리텐다드에서 한글 한 자가 10.4px 라, **가장 좁은 칸이 한 줄에 담는 것은
 *    한글 열한 자**다. 넘치는 쪽이 잘림(사실이 사라진다)이고 모자라는 쪽은 낱말이
 *    한 번 갈리는 것(보기만 나쁘다)이라, 일부러 좁은 칸에 맞춰 낮게 잡는다.
 * ⚠️ 긴 덩이는 `word-break: keep-all`(globals.css)이 낱말 안에서 갈라지는 것만 막는다.
 */
const CHUNK_NOWRAP_MAX = 11;

function SubLine({ text }: { text: string }) {
  const parts = text.split(" · ");
  return (
    <span className="hz-cellsub" style={{ ...ROW.sub }}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <span style={p.length <= CHUNK_NOWRAP_MAX ? { whiteSpace: "nowrap" } : undefined}>{p}</span>
        </span>
      ))}
    </span>
  );
}

export function StockCell({
  ticker,
  name,
  sub,
  badge,
}: {
  ticker: string;
  name: string;
  /**
   * 글이면 ` · ` 덩이로 갈라 접고, 부품이면 그대로 앉힌다.
   *
   * ⚠️ 알약 같은 부품을 `badge`(첫 줄) 대신 여기로 보내는 자리가 있다. 첫 줄은
   *    `티커 + 이름` 만으로도 폰에서 꽉 차서, 거기에 알약을 더하면 **이름이 먼저 밀린다**
   *    — 실측(375px)으로 "PWR 콴.." 까지 갔다.
   */
  sub: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={`/insider/stock/${encodeURIComponent(ticker)}`}
      // ⚠️ 세로 정렬은 `.hz-cellbody-wrap` 이 쥔다 — 인라인으로 두면 폰에서 위 맞춤으로
      // 바꾸려 해도 인라인이 미디어쿼리를 이겨서 로고가 세 줄 한가운데 떠 있는다.
      className="hz-cellbody-wrap"
      style={{ display: "flex", gap: 10, minWidth: 0, textDecoration: "none" }}
    >
      <StockLogo code={ticker} name={name} market="US" size={26} />
      <span className="hz-cellbody" style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        {/* ⚠️ 자르기는 인라인이 아니라 `.hz-cellname` 이 쥔다 — 인라인은 미디어쿼리를 못 이겨
            폰에서도 계속 잘린다(globals.css 주석). 첫 줄은 `.hz-cellhead` 가 폰에서 접어
            알약을 아래로 내보낸다. */}
        <span className="hz-cellhead" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <strong style={{ ...ROW.lead, fontFamily: MONO }}>{ticker}</strong>
          <span className="hz-cellname" style={{ ...ROW.sub }}>{name}</span>
          {badge}
        </span>
        {typeof sub === "string" ? (
          <SubLine text={sub} />
        ) : (
          <span className="hz-cellsub" style={{ ...ROW.sub }}>
            {sub}
          </span>
        )}
      </span>
    </Link>
  );
}

/** 두 칸짜리 행(왼쪽 종목 · 오른쪽 값). 다섯 블록이 공유한다. */
export function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="hz-trow" style={{ gridTemplateColumns: "1fr auto" }}>
      {left}
      {right}
    </div>
  );
}

/**
 * 거물이 분기 사이에 움직인 종목 한 줄.
 *
 * ⚠️ 오른쪽 숫자는 **금액이 아니라 사람 수**다. 13F 금액은 주가가 움직여도 변해서,
 * 한 주도 안 사고 늘어난 것처럼 보인다(그래서 판정 자체를 주식 수로 한다). 사람 수는
 * 그런 오염이 없고, 옆 블록('거물이 들고 있는 종목')과 눈금이 같아 견주기도 쉽다.
 */
export function MoveRow({ m, kind }: { m: ManagerMove; kind: "add" | "trim" }) {
  const markLabel = kind === "add" ? "신규" : "청산";
  return (
    <Row
      left={
        <StockCell
          ticker={m.ticker}
          name={m.name}
          sub={`${m.names.slice(0, 2).join(" · ")}${m.names.length > 2 ? ` 외 ${m.names.length - 2}명` : ""}`}
          badge={m.inKadera ? <KaderaPill /> : undefined}
        />
      }
      right={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {m.mark > 0 && (
            <Pill tone={kind === "add" ? MOVE_TONE.buy : MOVE_TONE.sell} title={`반대로 움직인 곳 ${m.against}명`}>
              {markLabel} {m.mark}
            </Pill>
          )}
          <span style={{ ...ROW.value, whiteSpace: "nowrap" }}>
            {m.movers}
            <span style={{ ...ROW.sub, fontWeight: 600 }}>명</span>
          </span>
        </span>
      }
    />
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, padding: "20px 22px", fontSize: T.body, color: C.sub, lineHeight: 1.75 }}>{children}</p>
  );
}

/* ── 줄 만들기 ──────────────────────────────────────────────────────
   메인 화면은 다섯 줄, 전체보기는 전부 — **같은 함수가 만든다.** 전체보기는
   "이 카드의 나머지"라, 줄의 생김새가 갈리면 다른 자료로 읽힌다. */

export function execRows(rows: InsiderActivity[], rate: number | null) {
  return rows.map((b) => (
    <li key={b.ticker}>
      <Row
        left={
          <StockCell
            ticker={b.ticker}
            name={b.name}
            // ⚠️ 날짜는 여기서 뺐다 — 오른쪽 금액 아래로 갔다. 종목 이름 밑에 사실이 넷이면
            //    (사람 수 · 코드 둘 · 날짜) 줄이 나열이 되고, 정작 "무슨 거래였나"가 안 보인다.
            // ⭐ "임원"을 붙인다. 그냥 "5명"이면 무엇의 5명인지 이 줄만 봐서는 모른다.
            sub={`임원 ${b.people}명 · ${codeSummary(b.codes)}`}
            // ⭐ 장내 매수는 드물어서(신고의 1%) 배지로 세우지 않으면 목록에
            //    묻힌다. 이 카드에서 가장 뜻이 있는 사건이다.
            badge={b.buyCount > 0 ? <Pill tone={MOVE_TONE.buy}>장내 매수 {b.buyCount}</Pill> : undefined}
          />
        }
        right={
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span style={{ ...ROW.value, whiteSpace: "nowrap" }}>
              <Money usd={b.value} rate={rate} />
            </span>
            {/* ⚠️ 여기 "내놓은 금액"이라 적어 두었다가 2026-08-22 에 날짜로 바꿨다.
                취득이냐 처분이냐는 **왼쪽 코드 요약이 이미 말한다** — "장내 매도 165건 ·
                전환 7건" 은 이 금액이 무엇인지 라벨보다 정확히 말한다. 카드 물음표에도
                금액이 처분만 더한 값이라고 적혀 있다. */}
            <span style={{ ...ROW.sub, whiteSpace: "nowrap" }}>{fmtDate(b.filedDate)} 접수</span>
          </span>
        }
      />
    </li>
  ));
}

export function congressRows(rows: CongressTicker[]) {
  return rows.map((c) => (
    <li key={c.ticker}>
      <Row
        left={
          <StockCell
            ticker={c.ticker}
            name={c.name}
            // ⚠️ 날짜는 여기서 뺐다 — 오른쪽 건수 아래로 갔다(임원 카드와 같은 꼴).
            //    종목 이름 밑은 **누가**만 갖는다. 몇 건인지·언제인지는 오른쪽이 말한다.
            sub={`의원 ${c.memberNames[0] ?? "이름 없음"}${c.members > 1 ? ` 외 ${c.members - 1}명` : ""}`}
            badge={c.inKadera ? <KaderaPill /> : undefined}
          />
        }
        right={
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
              {/* ⚠️ 색은 국내 증시 관례다 — 사는 쪽 빨강, 파는 쪽 파랑.
                  ⚠️⚠️ **원색이 아니라 잉크 토큰을 쓴다.** 흰 카드 위 실측으로 원색은
                  `--c-hot` 3.91 · `--c-blue` 3.71 이라 AA(4.5)에 못 미친다. 잉크는
                  5.44 · 5.23 으로 넘는다. 알약(Pill)이 이미 같은 이유로 잉크를 쓴다. */}
              {c.buys > 0 && <span style={{ ...ROW.value, color: "var(--c-hot-ink)" }}>매수 {c.buys}</span>}
              {c.sells > 0 && <span style={{ ...ROW.value, color: "var(--c-cold-ink)" }}>매도 {c.sells}</span>}
            </span>
            <span style={{ ...ROW.sub, whiteSpace: "nowrap" }}>{fmtDate(c.latest)} 매매</span>
          </span>
        }
      />
    </li>
  ));
}

export function addRows(rows: ManagerMove[]) {
  return rows.map((m) => (
    <li key={m.ticker}>
      <MoveRow m={m} kind="add" />
    </li>
  ));
}

export function trimRows(rows: ManagerMove[]) {
  return rows.map((m) => (
    <li key={m.ticker}>
      <MoveRow m={m} kind="trim" />
    </li>
  ));
}

export function hotRowsView(rows: InsiderRow[], rate: number | null) {
  return rows.map((r) => (
    <li key={r.ticker}>
      <Row
        left={
          <StockCell
            ticker={r.ticker}
            name={r.name}
            sub={
              r.txns > 0
                ? `언급 ${r.mentions}회 · 채널 ${r.channels}곳 · 임원 신고 ${r.txns}건`
                : `언급 ${r.mentions}회 · 채널 ${r.channels}곳 · 임원 신고 없음`
            }
            badge={r.buys > 0 ? <Pill tone={MOVE_TONE.buy}>장내 매수 {r.buys}</Pill> : undefined}
          />
        }
        right={<Quote price={r.price} change={r.changeRate} rate={rate} />}
      />
    </li>
  ));
}

export function holderRowsView(rows: InsiderRow[], managers: number) {
  return rows.map((r) => (
    <li key={r.ticker}>
      <Row
        left={
          <StockCell
            ticker={r.ticker}
            name={r.name}
            sub={`${r.holderNames.slice(0, 2).join(" · ")}${r.holders > 2 ? ` 외 ${r.holders - 2}명` : ""}`}
          />
        }
        right={
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="hz-bar" style={{ width: 64, height: 7 }}>
              <span style={{ width: `${Math.max(6, (r.holders / Math.max(1, managers)) * 100)}%` }} />
            </span>
            <span style={{ ...ROW.value, whiteSpace: "nowrap" }}>
              {r.holders}
              <span style={{ ...ROW.sub, fontWeight: 600 }}>/{managers}</span>
            </span>
          </span>
        }
      />
    </li>
  ));
}

/**
 * 거물 한 명의 왼쪽 칸 — 이름과 소속. 통째로 그 사람의 상세로 가는 링크다.
 *
 * ⚠️ 종목 줄(StockCell)과 달리 로고가 없다. 사람에는 붙일 그림이 없고, 빈 자리를
 *    이니셜 원으로 채웠더니 63줄이 알록달록한 밭이 됐다.
 */
function PersonCell({ cik, person, sub }: { cik: number; person: string; sub: string }) {
  return (
    <Link
      href={`/insider/investor/${cik}`}
      style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, textDecoration: "none" }}
    >
      <strong className="hz-cellsub" style={{ ...ROW.lead }}>
        {person}
      </strong>
      <SubLine text={sub} />
    </Link>
  );
}

/**
 * '거물 명단과 증권가 시선' 짝의 **줄 안쪽 높이**(px).
 *
 * ⚠️⚠️ 두 카드가 나란히 서므로 줄 높이가 다르면 **구분선이 어긋난다.** 실측(2026-08-23)
 *      으로 거물 줄 40 · 증권가 줄 46 이라 넷째 줄에서 25px 벌어져 있었다. 큰 쪽에 맞춘다 —
 *      증권가 줄이 "숫자 + 알약" 두 층이라 46 이고, 거물 줄은 글자 두 층이라 40 이다.
 * ⚠️ 알약 크기나 글자 단을 바꾸면 **다시 재서 고칠 것.** 줄 높이는 그 줄에서 가장 큰
 *    것이 정하므로, 한쪽만 키우면 이 값이 조용히 거짓이 된다.
 */
const PAIR_ROW_H = 46;

/**
 * 거물 명단 — **신고 합계 큰 순.**
 *
 * ⚠️ 순위 숫자를 안 붙인다. 한때 "29종목 중 1위"처럼 등수를 적었다가 뺐다 — 줄이 이미
 *    큰 순이라 등수는 같은 말을 두 번 하는 것이고, 자리만 먹는다.
 */
export function managerAumRows(rows: ManagerRank[], rate: number | null) {
  return rows.map((m) => (
    <li key={m.cik}>
      <Row
        left={
          <PersonCell
            cik={m.cik}
            person={m.person}
            /* ⭐ 기관 이름만 적던 자리다. 옆 카드들이 전부 "이름 + 뒷받침하는 사실"인데
               여기만 이름 둘이라 줄이 비어 보였다. 가장 크게 담은 한 종목을 붙인다.
               ⚠️⚠️ 문구를 두 번 고쳤다. **"최대 애플"** 은 무엇이 최대인지 안 읽혔고,
                  **"애플에 22%"** 는 22% 의 분모가 안 적혀 있었다. 지금 꼴은 셋을 한 줄에
                  담는다 — 무엇을 재는지(비중) · 어느 종목인지 · 얼마인지.
               ⚠️ `비중` 은 이 저장소가 인물 상세의 열 이름("포트폴리오 비중")으로 이미
                  쓰는 말이다. 두 화면이 같은 뜻으로 같은 낱말을 써야 한다. */
            sub={
              m.topTicker
                ? `${m.firm} · 최대 비중 ${m.topName || m.topTicker} ${Math.round(m.topWeight)}%`
                : m.firm
            }
          />
        }
        right={
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 1,
              minHeight: PAIR_ROW_H,
            }}
          >
            <span style={{ ...ROW.value, whiteSpace: "nowrap" }}>
              <Money usd={m.aum} rate={rate} />
            </span>
            <span style={{ ...ROW.sub, whiteSpace: "nowrap" }}>{m.holdings}종목</span>
          </span>
        }
      />
    </li>
  ));
}

/**
 * 증권가가 긍정적으로 보는 종목.
 *
 * ## ⛔ 숫자를 손대지 않는다
 *
 * 오른쪽에 적는 건 원천이 준 두 수(`62명 중 49명`)를 **그대로** 옮긴 것이다. 비율은
 * 줄 세우는 데만 쓰고 숫자로 내지 않는다 — 약관이 "수정 없이" 를 요구한다.
 * 막대는 그 두 수의 관계를 눈에 보이게 하는 것이라 **절대 눈금**이다(1위를 가득 채우면
 * 옆 숫자와 다른 말을 하게 된다).
 *
 * ⚠️ **우리 판정이 아니다.** 카드 제목이 "증권가가" 로 시작해야 누가 그렇게 보는지가
 *    먼저 읽힌다. 출처는 카드 툴팁이 밝힌다.
 */
export function analystTopRows(rows: AnalystTop[]) {
  return rows.map((a) => {
    const share = a.analystCount > 0 ? (a.strongBuy / a.analystCount) * 100 : 0;
    return (
      <li key={a.ticker}>
        <Row
          left={<StockCell ticker={a.ticker} name={a.name} sub="" />}
          right={
            /* ⚠️ 알약은 **회색(plain)** 이다. 빨강으로 두면 우리가 미는 것처럼 읽힌다 —
                 남의 등급을 옮긴 것이라 온도를 얹으면 안 된다.
               ⚠️ 자리를 두 번 옮겼다. 티커 옆 첫 줄(badge)에 뒀더니 폰에서 회사 이름을
                 밀어냈고("PWR 콴.."), 왼쪽 둘째 줄로 내렸다가 **숫자 아래**로 왔다.
                 여기가 맞는 자리인 이유는 알약이 옆 숫자를 설명하는 말이기 때문이다 —
                 "16명 중 14명"이 무슨 등급으로 묶였는지가 바로 아래 붙는다. */
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 4,
                minHeight: PAIR_ROW_H,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="hz-bar" style={{ width: 72, height: 7 }}>
                  <span style={{ width: `${Math.max(1.5, Math.min(100, share))}%` }} />
                </span>
                <span style={{ ...ROW.value, whiteSpace: "nowrap" }}>
                  {a.analystCount}명 중 {a.strongBuy}명
                </span>
              </span>
              <Pill>{CONSENSUS_KO[a.consensus ?? ""] ?? a.consensus ?? "-"}</Pill>
            </span>
          }
        />
      </li>
    );
  });
}

/**
 * 차트 마커의 축. 배지 필터와 CSS 클래스와 마커 색이 이 표 하나를 공유한다.
 *
 * ## ⭐ 색은 **축**을, 채움은 **방향**을 말한다
 *
 * 처음엔 색을 방향(매수 파랑 / 매도 회색)에 쓰고 축은 크기로 갈랐다. 크기 차이(2.6·3.4·4)는
 * 실제 화면에서 안 읽혔다. 색을 축에 주고 방향을 채움으로 옮기면 둘 다 또렷해진다.
 *
 * ## ⚠️ 새 색을 만들지 않는다
 *
 * 이 저장소는 **2색 체계**다(파랑·빨강. 전역이라 카더라·MDD 도 같이 움직인다). 세 번째
 * 색조를 들이면 그 체계가 깨진다. 그래서 파랑·잉크·빨강 셋으로 가른다 — 전부 있는
 * 토큰이고 다크에서도 짝이 정의돼 있다.
 */
export const MARK_GROUPS = [
  { key: "all", label: "전체", color: null },
  { key: "insider", label: "임원", color: "var(--c-blue)" },
  { key: "manager", label: "거물", color: "var(--c-ink)" },
  { key: "congress", label: "의원", color: "var(--c-hot)" },
] as const;

/**
 * 마커 반지름. **하나뿐이다.**
 *
 * ⛔ 자리에 따라 키우지 말 것. 겹친 마커를 겹쳐 담으려고 반지름을 2씩 키웠더니 크기가
 *    제각각이 되어 "동그라미 크기 다른 건 뭐냐"는 말을 들었다. 이 화면에서 마커의 크기는
 *    아무 뜻도 없으므로, 다르면 그 자체가 없는 뜻을 만든다.
 */
const MARK_R = 3.6;

const MARK_COLOR: Record<string, string> = {
  insider: "var(--c-blue)",
  manager: "var(--c-ink)",
  congress: "var(--c-hot)",
};

export type ChartMark = {
  date: string;
  side: "buy" | "sell";
  who: "insider" | "congress" | "manager";
  count: number;
  names: string[];
  /** 이 점이 묶은 물량. 임원은 주식 수, 의원은 신고 구간(달러). 거물은 13F 라 없다. */
  shares: number | null;
  low: number | null;
  high: number | null;
};

/**
 * 주가 선 + **매매 시점 표시** + 축 + 호버.
 *
 * ## ⭐ 호버는 MDD 언더워터 차트와 같은 어법이다
 *
 * SVG 위에 투명한 세로 띠를 데이터 점 수만큼 깔고, 각 띠가 `.hz-tip` 의 `data-tip` 을
 * 든다(`app/mdd/MddExplorer.tsx` 의 crosshair). **CSS 만으로 열리므로 서버 컴포넌트로
 * 남는다** — 차트를 클라이언트로 끌어오면 일봉 130개가 통째로 번들을 탄다.
 * 양 끝에서는 `hz-tip-start`·`hz-tip-end` 로 여는 방향을 틀어 가로 스크롤을 막는다.
 *
 * ## ⚠️⚠️ 왜 장내 매수·매도만 찍나
 *
 * 임원 신고의 대부분은 옵션 행사(M)와 그에 딸린 세금 원천징수(F)다. 그걸 다 찍으면
 * 차트가 "임원이 계속 팔았다"고 말하는데 그건 틀린 말이다. 거르는 일은 데이터층이 한다.
 *
 * ## ⚠️ 세로축을 0 에서 시작하지 않는다
 *
 * 주가는 0 근처에 안 가므로 0 기준이면 선이 위쪽에 납작하게 눌린다. 실제 최저~최고에
 * 여백을 준다. 그래서 **세로축 라벨을 반드시 적어야 한다** — 안 적으면 20% 움직임과
 * 2% 움직임이 똑같은 그림이 된다.
 */
export function PriceChart({
  bars,
  marks,
  rate,
  height = 168,
}: {
  bars: { date: string; close: number }[];
  marks: ChartMark[];
  rate: number | null;
  height?: number;
}) {
  if (bars.length < 2) return null;
  const W = 720;
  const H = height;
  // 왼쪽 여백에 세로축 라벨이 앉는다(MDD 와 같은 계산 — 라벨 폭 + 간격).
  const PAD_L = 46;
  const LABEL_GAP = 8;
  const PAD_T = 10;
  const PAD_B = 22;
  const lo = Math.min(...bars.map((b) => b.close));
  const hi = Math.max(...bars.map((b) => b.close));
  const pad = (hi - lo) * 0.12 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const n = bars.length;
  const x = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L);
  const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

  const line = bars.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.close).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;

  // 가로축 — 달이 바뀌는 지점. 일봉 반년이면 6~7개라 겹치지 않는다.
  const monthTicks: { x: number; label: string }[] = [];
  for (let i = 1; i < n; i++) {
    if (bars[i].date.slice(5, 7) !== bars[i - 1].date.slice(5, 7)) {
      monthTicks.push({ x: x(i), label: `${Number(bars[i].date.slice(5, 7))}월` });
    }
  }
  // 세로축 — 위·가운데·아래 셋. 더 넣으면 반년짜리 작은 차트에서 시끄럽다.
  const rows = [max - pad / 2, (min + max) / 2, min + pad / 2];

  const at = new Map(bars.map((b, i) => [b.date, i]));
  // 매매일이 휴장일이면 그 다음 거래일에 붙인다 — 안 붙이면 마커가 통째로 사라진다.
  const nearest = (d: string) => (at.has(d) ? at.get(d)! : bars.findIndex((b) => b.date >= d));
  const whoLabel = { insider: "임원", congress: "의원", manager: "거물" } as const;

  /**
   * ## ⚠️⚠️ 마커를 그리기 전에 **같은 자리끼리 묶는다**
   *
   * 마커는 (날짜 × 방향 × 축)으로 만들어져서 한 봉에 최대 여섯 개가 **완전히 같은
   * 좌표**에 온다. 그대로 그리면 나중 것이 앞 것을 덮어 **하나가 통째로 안 보인다.**
   * 실측(10종목 × 4기간, 마커 1,018개): 84개(8%)가 그렇게 가려져 있었다 — 같은 축의
   * 매수·매도끼리 45개, 다른 축끼리 39개.
   *
   * ⭐ 같은 축이면 **한 점으로 합치고** 매수·매도 건수를 툴팁에 함께 적는다(실측 45개 해소).
   * ⚠️ 축이 다르면 못 합친다 — 색이 곧 축이고 필터도 축으로 흐린다. 그 39곳은 그림에서는
   *    맨 위 하나만 보이고, **설명은 손닿는 자리 하나에 축을 전부 적어** 잃지 않는다.
   *    (반지름을 키워 겹쳐 담아 봤다가 크기가 제각각이 되어 되돌렸다.)
   */
  const WHO_ORDER = ["insider", "congress", "manager"] as const;
  type Slot = {
    i: number;
    who: ChartMark["who"];
    buy: number;
    sell: number;
    names: string[];
    shares: number | null;
    low: number | null;
    high: number | null;
  };
  const slotOf = new Map<string, Slot>();
  for (const m of marks) {
    const i = nearest(m.date);
    if (i < 0) continue;
    const key = `${i}|${m.who}`;
    const s = slotOf.get(key) ?? { i, who: m.who, buy: 0, sell: 0, names: [], shares: null, low: null, high: null };
    if (m.side === "buy") s.buy += m.count;
    else s.sell += m.count;
    for (const nm of m.names) if (!s.names.includes(nm)) s.names.push(nm);
    if (m.shares != null) s.shares = (s.shares ?? 0) + m.shares;
    if (m.low != null) s.low = (s.low ?? 0) + m.low;
    if (m.high != null) s.high = (s.high ?? 0) + m.high;
    slotOf.set(key, s);
  }
  const perIndex = new Map<number, Slot[]>();
  for (const s of slotOf.values()) perIndex.set(s.i, [...(perIndex.get(s.i) ?? []), s]);
  // 축 순서를 못박아 둔다 — 같은 점에 겹치면 늘 같은 것이 위에 온다(그림이 안 흔들린다).
  for (const list of perIndex.values()) list.sort((a, b) => WHO_ORDER.indexOf(a.who) - WHO_ORDER.indexOf(b.who));
  const drawn = [...perIndex.values()].flat();

  /**
   * 호버에 뜰 한 줄 — **누가 · 언제 · 얼마나.**
   *
   * ⚠️ "얼마나"의 재료가 축마다 다르다. 임원은 주식 수, 의원은 신고 구간, 거물은 없다
   *    (13F 는 분기말 보유의 차이라 매매 물량이 아니다). 없는 축에 숫자를 지어내지 말 것.
   */
  const tipOf = (s: Slot) => {
    // 거물은 신고 "건"이 아니라 운용사 수다 — 한 곳이 한 번 신고한다.
    const unit = s.who === "manager" ? "곳" : "건";
    const acts = [s.buy ? `매수 ${s.buy}${unit}` : "", s.sell ? `매도 ${s.sell}${unit}` : ""].filter(Boolean).join(" · ");
    const qty =
      s.shares != null
        ? `${Math.round(s.shares).toLocaleString("ko-KR")}주`
        : s.low != null && s.high != null
          ? `${money(s.low)}~${money(s.high)}`
          : "";
    const who = s.names.length
      ? `${s.names.slice(0, 2).join(", ")}${s.names.length > 2 ? ` 외 ${s.names.length - 2}명` : ""}`
      : "";
    // ⚠️ 날짜는 여기서 안 붙인다. 한 자리에 축이 여럿이면 말풍선에 날짜가 두 번 나온다 —
    //    날짜는 손닿는 자리가 **한 번만** 앞에 적는다.
    return [`${whoLabel[s.who]} ${acts}`, qty, who, s.who === "manager" ? "분기말 기준" : ""]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} role="img"
           aria-label={`주가 ${bars[0].date}~${bars[n - 1].date}, 매매 시점 ${marks.length}곳`}>
        <defs>
          <linearGradient id="hz-pc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-blue)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--c-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {rows.map((v, i) => (
          <line key={i} x1={PAD_L} y1={y(v)} x2={W} y2={y(v)} stroke={C.line} strokeWidth="1" strokeDasharray="2 5" />
        ))}
        <path d={area} fill="url(#hz-pc)" />
        {/* ⚠️ 선을 먼저, 마커를 나중에. **고리 안으로 선이 지나가면 안 된다** — 순서를
            뒤집어 봤다가 되돌렸다. 마커가 선을 덮는 게 맞는 그림이다.
            ⚠️ 선은 마우스를 안 먹는다. 안 그러면 마커 호버 영역을 가린다. */}
        <path
          d={line}
          fill="none"
          stroke="var(--c-blue)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          pointerEvents="none"
        />
        {drawn.map((s) => {
          // ⭐ **선 위에 정확히 얹는다.** 예전엔 매수를 7 위로, 매도를 7 아래로 띄웠는데
          //    선이 가파른 자리에서 점이 선과 떨어져 보였다. 방향은 자리가 아니라
          //    **채움**이 말한다 — 채운 점이 매수, 빈 고리가 매도.
          // ⛔ 반지름을 자리마다 바꾸지 말 것. 겹친 마커를 겹쳐 담으려고 크기를 키웠더니
          //    "동그라미 크기가 왜 다르냐"가 됐다 — 크기는 이 화면에서 아무 뜻도 없다.
          const color = MARK_COLOR[s.who];
          const buyish = s.buy >= s.sell;
          return (
            <circle
              key={`${s.i}-${s.who}`}
              className={`hz-mk hz-mk-${s.who}`}
              cx={x(s.i)}
              cy={y(bars[s.i].close)}
              r={MARK_R}
              fill={buyish ? color : "var(--c-card)"}
              stroke={color}
              strokeWidth="1.6"
            />
          );
        })}
        {/* 세로축 — 값이 무엇인지 안 적으면 축이 0 에서 시작하지 않는다는 걸 알 길이 없다.
            ⚠️ 글꼴을 **반드시 준다**. SVG text 는 body 를 안 물려받아 기본 세리프로 떨어진다.
            ⚠️ 두 통화를 다 그려 두고 CSS 가 하나만 보여 준다 — 화면의 다른 금액과 같은 수다. */}
        {rows.map((v, i) => (
          <g key={i}>
            <text
              className="hz-krw"
              x={PAD_L - LABEL_GAP}
              y={y(v) + 4}
              fontSize="10.5"
              fontFamily={MONO}
              fill={C.muted}
              textAnchor="end"
            >
              {rate ? `${(Math.round((v * rate) / 1000) / 10).toFixed(1)}만` : `$${Math.round(v)}`}
            </text>
            <text
              className="hz-usd"
              x={PAD_L - LABEL_GAP}
              y={y(v) + 4}
              fontSize="10.5"
              fontFamily={MONO}
              fill={C.muted}
              textAnchor="end"
            >
              ${Math.round(v).toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {monthTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 6} fontSize="10.5" fontFamily={MONO} fill={C.muted} textAnchor="middle">
            {t.label}
          </text>
        ))}
      </svg>
      {/* 호버 띠 — 데이터 점마다 하나. MDD 크로스헤어와 같은 어법이라 새 언어를 안 만든다. */}
      <div
        className="hz-xhair"
        style={{
          position: "absolute",
          left: `${(PAD_L / W) * 100}%`,
          right: 0,
          top: `${(PAD_T / H) * 100}%`,
          bottom: `${(PAD_B / H) * 100}%`,
        }}
      >
        {bars.map((b, i) => {
          const at2 = i / (n - 1);
          const edge = at2 < 0.25 ? " hz-tip-start" : at2 > 0.75 ? " hz-tip-end" : "";
          const won = rate ? ` · ${Math.round(b.close * rate).toLocaleString("ko-KR")}원` : "";
          return (
            <div
              key={b.date}
              className={`hz-tip hz-vline${edge}`}
              data-tip={`${b.date} · $${b.close.toLocaleString("en-US", { maximumFractionDigits: 2 })}${won}`}
              style={{ flex: 1, position: "relative" }}
            />
          );
        })}
      </div>
      {/* ── 마커 호버 ──────────────────────────────────────────────────
          ⚠️ SVG 안에서는 이 화면의 말풍선(`.hz-tip` 의 `::after`)을 못 쓴다 — SVG 요소는
             `::before/::after` 를 안 그린다. 그래서 마커 자리마다 **HTML 점**을 하나씩
             얹고 그게 호버를 받는다. 차트는 그대로 서버 컴포넌트로 남는다.
          ⚠️ 크로스헤어 띠보다 **뒤에** 둔다 — 마커 위에서는 마커 말풍선이 이겨야 한다. */}
      {[...perIndex.entries()].map(([i, list]) => {
        const cx = x(i);
        const cy = y(bars[i].close);
        // ⚠️⚠️ 손닿는 자리는 **한 봉에 하나**다. 축마다 하나씩 두면 같은 점에 겹친 것들
        //    중 맨 위만 잡혀 나머지 설명이 영영 안 열린다(실측 39곳). 하나로 두고
        //    **그 자리의 축을 전부 적는다.**
        const tip = `${fmtDate(bars[i].date)} · ${list.map(tipOf).join("  /  ")}`;
        // ⚠️⚠️ 말풍선은 **줄바꿈**시킨다(`hz-tip-wide`, 240px). 한 줄로 두면 이름이 여럿
        //    붙는 거물 말풍선이 500px 을 넘어 카드를 넘친다.
        // ⚠️ 여는 방향은 앵커 위치지정이 알아서 튼다(globals.css 의 `position-try-fallbacks`).
        //    아래 start/end 는 그걸 모르는 브라우저용 보험이라 **셋으로 나눠** 준다 —
        //    말풍선 폭은 px 고정인데 차트는 늘었다 줄었다 해서, 뷰박스 단위로 문턱을 잡으면
        //    좁은 창에서 어긋난다(실제로 그래서 잘렸다).
        const at2 = (cx - PAD_L) / (W - PAD_L);
        const edge = at2 > 0.66 ? " hz-tip-end" : at2 < 0.34 ? " hz-tip-start" : "";
        // 뷰박스 비율로 크기와 자리를 잡는다 — 창이 달라져도 점과 손닿는 자리가 같이 움직인다.
        const wPct = (((MARK_R + 2.4) * 2) / W) * 100;
        return (
          <div
            key={`spot-${i}`}
            className={`hz-tip hz-tip-wide hz-mkspot${edge}`}
            data-tip={tip}
            style={{
              position: "absolute",
              // ⚠️⚠️ **transform 으로 가운데를 맞추면 안 된다.** transform 이 걸린 요소는
              //    `position: fixed` 자손의 컨테이닝 블록이 되는데, 이 화면의 말풍선은 시트의
              //    `overflow: hidden` 을 피하려고 fixed 로 서 있다. 그래서 점에 translate 를
              //    주는 순간 **말풍선이 다시 카드 경계에서 잘렸다.** 절반만큼 미리 빼서 놓는다.
              left: `${(cx / W) * 100 - wPct / 2}%`,
              // 세로는 컨테이너 높이 기준이라 가로세로 비를 곱해 환산한다(둘 다 같이 늘어난다).
              top: `${(cy / H) * 100 - (wPct / 2) * (W / H)}%`,
              width: `${wPct}%`,
              aspectRatio: "1",
              // 겹쳐 있으면 맨 위 마커의 색으로 불을 켠다.
              ["--mk" as string]: MARK_COLOR[list[list.length - 1].who],
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * 마커 필터의 **라디오만**. `.hz-mkfilter` 의 맨 앞 자식으로 둬야 한다.
 *
 * ⭐ 리액트 상태로 두면 차트가 클라이언트 컴포넌트가 되고 일봉 130개가 통째로 번들을
 * 탄다. 숨은 라디오 + CSS 형제 선택자로 푼다.
 *
 * ## ⚠️⚠️ `:has()` 를 쓰면 안 된다 — 규칙이 통째로 사라진다
 *
 * 처음엔 `.hz-mkfilter:has(#…:checked) .hz-mk:not(…)` 로 썼다. 셀렉터도 맞고
 * `querySelectorAll` 로 17개가 잡히는데 **opacity 가 안 바뀌었다.** 원인은
 * **Lightning CSS 가 같은 선언을 가진 셀렉터 셋을 `:is(A, B, C)` 로 합치는 것**이고,
 * 브라우저는 `:is()` 안의 `:has()` 를 거부해 규칙 전체를 버린다. 서빙되는 CSS 에는
 * 멀쩡히 있어서 파일만 봐서는 안 보인다(이 저장소가 box-shadow 로 이미 한 번 당했다).
 *
 * 그래서 **형제 선택자(`~`)** 로 간다. 라디오가 차트 상자보다 앞에 있으면 된다.
 */
export function MarkRadios({ id }: { id: string }) {
  return (
    <>
      {MARK_GROUPS.map((g) => (
        <input key={g.key} type="radio" name={id} id={`${id}-${g.key}`} defaultChecked={g.key === "all"} />
      ))}
    </>
  );
}

/**
 * 필터 배지. `for` 로 라디오를 가리키므로 라디오와 떨어져 있어도 된다.
 *
 * ⭐ **색 점을 배지 안에 넣는다.** 예전엔 차트 아래에 따로 범례를 뒀는데, 그러면
 * "임원이 무슨 색인지" 알려면 눈이 배지와 범례 사이를 오간다. 배지가 곧 범례다.
 *
 * ⚠️ 안 고른 축을 **지우지 않고 흐린다.** 지우면 남은 점의 자리가 그대로라 "이 종목엔
 *    이것뿐"으로 읽힌다. 흐리면 전체 안에서의 몫이 보인다.
 */
export function MarkBadges({ id }: { id: string }) {
  return (
    <span className="hz-mkfilter-set">
      {MARK_GROUPS.map((g) => (
        <label key={g.key} htmlFor={`${id}-${g.key}`} data-k={g.key}>
          {g.color && (
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <circle cx="4" cy="4" r="3.2" fill={g.color} />
            </svg>
          )}
          {g.label}
        </label>
      ))}
    </span>
  );
}

/**
 * 차트 아래 한 줄. **축 색은 배지가 말하므로** 여기서는 채움의 뜻과 단서만 적는다.
 * 예전엔 축 색까지 여기 다 적어서 배지와 같은 말을 두 번 하고 있었다.
 */
export function ChartLegend() {
  const dot = (filled: boolean) => (
    <svg width="11" height="11" viewBox="0 0 11 11" style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="3.6" fill={filled ? C.sub : "var(--c-card)"} stroke={C.sub} strokeWidth="1.6" />
    </svg>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", padding: "12px 22px 0" }}>
      {[
        { el: dot(true), text: "채운 점은 매수" },
        { el: dot(false), text: "빈 고리는 매도" },
      ].map((i) => (
        <span key={i.text} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.sub2 }}>
          {i.el}
          {i.text}
        </span>
      ))}
      <span style={{ fontSize: 11, color: C.sub2, lineHeight: 1.55, wordBreak: "keep-all" }}>
        옵션 행사와 세금 원천징수는 매매가 아니라 찍지 않았습니다. 거물 표시는 13F에 매매일이 없어 분기말에 찍은
        것이라, 그 분기 사이 어느 날인지는 공시에 없습니다.
      </span>
    </div>
  );
}

/* ── 매수·매도로 가른 줄 ────────────────────────────────────────────
   전체보기 페이지가 임원·의원을 두 카드로 나눠 쓴다. 메인 화면의 한 카드짜리 줄
   (execRows·congressRows)과 **같은 꼴**을 유지한다 — 자리마다 생김새가 갈리면 같은
   자료가 다른 자료로 읽힌다.

   ⚠️ 한 종목이 양쪽 카드에 다 뜰 수 있다. 임원 여럿이 같은 종목을 사고팔았거나,
      의원 하나가 같은 종목을 사고팔았으면 그게 사실이다. 감추지 않는다. */

/** 임원이 **장내에서 산** 종목. 드물어서 이 카드가 곧 신호다. */
export function execBuyRows(rows: InsiderActivity[], rate: number | null) {
  return rows.map((b) => (
    <li key={b.ticker}>
      <Row
        left={
          <StockCell
            ticker={b.ticker}
            name={b.name}
            sub={`${b.buyPeople}명 · 장내 매수 ${b.buyCount}건 · ${fmtDate(b.filedDate)} 접수`}
          />
        }
        right={
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span style={{ ...ROW.value, color: "var(--c-cold-ink)", whiteSpace: "nowrap" }}>
              <Money usd={b.boughtValue} rate={rate} />
            </span>
            <span style={{ ...ROW.sub, whiteSpace: "nowrap" }}>장내에서 사들임</span>
          </span>
        }
      />
    </li>
  ));
}

/** 임원이 **내놓은** 종목. 코드 요약을 함께 적어 장내 매도와 기계적 흐름을 가른다. */
export function execSellRows(rows: InsiderActivity[], rate: number | null) {
  return rows.map((b) => (
    <li key={b.ticker}>
      <Row
        left={
          <StockCell
            ticker={b.ticker}
            name={b.name}
            sub={`${b.sellPeople}명 · ${codeSummary(b.codes)} · ${fmtDate(b.filedDate)} 접수`}
          />
        }
        right={
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span style={{ ...ROW.value, whiteSpace: "nowrap" }}>
              <Money usd={b.disposedValue} rate={rate} />
            </span>
            <span style={{ ...ROW.sub, whiteSpace: "nowrap" }}>내놓은 금액</span>
          </span>
        }
      />
    </li>
  ));
}

/** 의원 매수·매도. 이름은 **그 방향으로 움직인 사람만** 적는다. */
function congressSideRows(rows: CongressTicker[], side: "buy" | "sell") {
  return rows.map((c) => {
    const names = side === "buy" ? c.buyMembers : c.sellMembers;
    const n = side === "buy" ? c.buys : c.sells;
    return (
      <li key={c.ticker}>
        <Row
          left={
            <StockCell
              ticker={c.ticker}
              name={c.name}
              sub={`${names[0] ?? "이름 없음"}${names.length > 1 ? ` 외 ${names.length - 1}명` : ""} · ${fmtDate(c.latest)} 매매`}
              badge={c.inKadera ? <KaderaPill /> : undefined}
            />
          }
          right={
            <span style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  fontWeight: 800,
                  color: side === "buy" ? "var(--c-cold-ink)" : C.ink,
                }}
              >
                {n}
                <span style={{ ...ROW.sub, fontWeight: 600 }}>건</span>
              </span>
              <span style={{ ...ROW.sub }}>{names.length}명</span>
            </span>
          }
        />
      </li>
    );
  });
}

export const congressBuyRows = (rows: CongressTicker[]) => congressSideRows(rows, "buy");
export const congressSellRows = (rows: CongressTicker[]) => congressSideRows(rows, "sell");

/* ── 전체보기의 **넓은 줄** ──────────────────────────────────────────
   ⚠️ 전체보기는 시트가 페이지 폭을 다 쓴다(1440px 에서 1,164). 메인 카드의 두 칸짜리
   줄(왼쪽 종목 · 오른쪽 값)을 그대로 쓰면 **가운데가 통째로 빈다** — 실측 68~75%가
   흰 여백이었다.

   그래서 같은 내용을 **여러 칸으로 편다.** 메인 카드에서 종목 밑에 작게 깔려 있던
   보조줄(사람 수 · 코드 · 날짜)이 여기서는 자기 칸을 갖는다. **담는 값도 말도 그대로**다 —
   자리만 달라진다. 열 머리(.hz-thead)가 무슨 칸인지 말한다.

   ⚠️ 열 머리와 데이터 행은 **같은 grid-template-columns** 를 써야 칸이 맞는다.
   ⚠️ 좁아지면 칸이 뭉개진다. 980 아래에서는 열 머리를 감추고 줄을 두 칸으로 되돌린다
      (globals.css 의 `.hz-wide`). */

/** 넓은 줄의 열 구성. 머리와 행이 이 문자열 하나를 나눠 쓴다. */
/**
 * 넓은 줄의 열 구성. 머리와 행이 이 문자열 하나를 나눠 쓴다.
 *
 * ## ⚠️ 칸을 늘리지 말 것
 *
 * 한때 다섯·여섯 칸이었다. 빈 가운데를 메우려고 사실을 하나씩 더 얹었는데, 그러면
 * **줄이 "정보의 나열"이 된다** — 눈이 무엇을 보는 줄인지 못 잡는다. 지금은 셋뿐이다:
 *
 *   ① 무엇   종목이나 사람 (주인공)
 *   ② 누가/무엇을  한 줄 설명
 *   ③ 얼마   그 카드가 세우는 값 하나
 *
 * 더 알고 싶으면 종목·인물 상세로 간다. 목록은 **고르는 자리**이지 읽는 자리가 아니다.
 */
export const WIDE_COLS = {
  exec: "minmax(220px, 1.2fr) minmax(0, 1.9fr) 128px",
  congress: "minmax(220px, 1.2fr) minmax(0, 1.9fr) 96px",
  move: "minmax(220px, 1.2fr) minmax(0, 1.9fr) 96px",
  hot: "minmax(220px, 1.2fr) minmax(0, 1.9fr) 128px",
  holders: "minmax(220px, 1.2fr) minmax(0, 1.9fr) 128px",
  /** 거물 명단. 사람이 주인공이라 첫 칸이 이름, 둘째가 대표 보유, 끝이 금액이다. */
  managers: "minmax(200px, 1.1fr) minmax(0, 1.6fr) 92px 124px",
  /** 증권가 순위. 끝 칸이 "62명 중 49명"이라 다른 표의 금액 칸보다 넓어야 한다. */
  analyst: "minmax(220px, 1.2fr) minmax(0, 1.6fr) 132px",
  /**
   * 종목 상세의 "이 종목을 든 월가 거물". 사람이 주인공이라 첫 칸이 이름이다.
   *
   * ⚠️ 소속 칸을 **줄이고** 비중 칸을 키웠다. 1.6fr 을 주고 있었는데 운용사 이름은
   *    길어야 96px 이라 실측 채움이 26% 였다 — 표 한복판이 통째로 비어 보인 자리다.
   *    남는 폭은 막대가 받는다(막대는 길어질수록 말을 더 잘 한다).
   */
  stockHolders: "minmax(190px, 1fr) minmax(0, 0.8fr) minmax(180px, 1.4fr) 116px",
  /**
   * 인물 상세의 "보유 종목". 종목 상세의 거물 표와 **같은 문법**이다 — 주인공 · 한 줄
   * 설명 · 비중 막대 · 금액. 두 화면이 같은 자료를 다른 각도로 보는 것이라, 줄의 생김새가
   * 갈리면 독자가 다른 표로 읽는다.
   */
  managerHoldings: "minmax(190px, 1fr) minmax(0, 0.8fr) minmax(180px, 1.4fr) 116px",
  /** 인물 상세의 "전량 정리". 설명 칸이 없어 셋이다. */
  managerExited: "minmax(190px, 1fr) minmax(180px, 1.4fr) 116px",
} as const;

export function WideHead({ cols, labels }: { cols: string; labels: (string | null)[] }) {
  return (
    <div className="hz-thead hz-wide-head" style={{ gridTemplateColumns: cols }}>
      {labels.map((l, i) => (
        <span key={i} style={{ textAlign: i === 0 || i === 1 ? "left" : "right" }}>
          {l}
        </span>
      ))}
    </div>
  );
}

/** 넓은 줄 하나. 첫 칸은 종목, 나머지는 오른쪽 정렬이 기본이다. */
function WideRow({ cols, cells }: { cols: string; cells: React.ReactNode[] }) {
  return (
    <div className="hz-trow hz-wide" style={{ gridTemplateColumns: cols }}>
      {/* ⚠️ 배열을 그대로 넣으면 React 가 칸마다 key 를 요구해 콘솔이 경고로 뒤덮인다
          (넓은 줄이 뜨는 화면 전부에서 났다). Fragment 는 DOM 을 안 만들어서 격자의
          칸 수가 그대로다 — 여기에 <div> 를 두르면 한 칸이 통째로 어긋난다. */}
      {cells.map((c, i) => (
        <Fragment key={i}>{c}</Fragment>
      ))}
    </div>
  );
}

const num = (v: React.ReactNode, muted?: string) => (
  <span style={{ ...ROW.value, textAlign: "right", whiteSpace: "nowrap" }}>
    {v}
    {/* 단위는 값보다 한 단 아래. 같은 크기로 두면 "9.4%" 가 두 덩이로 읽힌다. */}
    {muted && <span style={{ ...ROW.sub, fontWeight: 600 }}>{muted}</span>}
  </span>
);
/**
 * 넓은 줄의 한 칸.
 *
 * ⭐ 왼쪽 서술 칸이 글로 된 문자열이면 `SubLine` 으로 보낸다 — 폰에서 잘리는 대신 접히고,
 *    접힘은 ` · ` 덩이 경계에서만 일어난다. 실측(375px)으로 이 칸이 임원 목록 여섯 줄에서
 *    꼬리의 날짜를 삼키고 있었다.
 * ⚠️ 오른쪽 값 칸은 그대로 자른다. 숫자는 짧아 접힐 일이 없고, 오른쪽 정렬에서 접히면
 *    줄이 들쭉날쭉해진다.
 */
const text = (v: React.ReactNode, align: "left" | "right" = "right") =>
  align === "left" && typeof v === "string" ? (
    <SubLine text={v} />
  ) : (
    <span style={{ ...ROW.sub, textAlign: align, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {v}
    </span>
  );

/** 종목 칸 — 넓은 줄의 첫 칸. 보조줄이 없어 한 줄로 선다(정보는 옆 칸이 갖는다). */
function WideStock({ ticker, name, badge }: { ticker: string; name: string; badge?: React.ReactNode }) {
  return (
    <Link
      href={`/insider/stock/${encodeURIComponent(ticker)}`}
      className="hz-cellhead"
      style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, textDecoration: "none" }}
    >
      <StockLogo code={ticker} name={name} market="US" size={26} />
      <strong style={{ ...ROW.lead, fontFamily: MONO }}>{ticker}</strong>
      {name && name.toUpperCase() !== ticker.toUpperCase() && (
        <span className="hz-cellname" style={{ ...ROW.sub }}>{name}</span>
      )}
      {badge}
    </Link>
  );
}

/**
 * ⚠️ 칸이 **셋**이다. 한동안 다섯 칸을 세 칸짜리 격자에 밀어 넣고 있었다 — 남는 둘이
 *    아랫줄로 접혀 한 행이 두 줄(77px)이 됐고, 열 머리와도 어긋났다. 칸을 줄일 때
 *    이 builder 만 같이 안 줄인 탓이다. **cells 수와 WIDE_COLS 의 칸 수는 늘 같아야 한다.**
 */
export function wideExecRows(rows: InsiderActivity[], rate: number | null, side: "buy" | "sell") {
  return rows.map((b) => (
    <li key={b.ticker}>
      <WideRow
        cols={WIDE_COLS.exec}
        cells={[
          <WideStock key="s" ticker={b.ticker} name={b.name} />,
          text(
            `${side === "buy" ? `장내 매수 ${b.buyCount}건` : codeSummary(b.codes)} · ${
              side === "buy" ? b.buyPeople : b.sellPeople
            }명 · ${fmtDate(b.filedDate)} 접수`,
            "left",
          ),
          num(<Money usd={side === "buy" ? b.boughtValue : b.disposedValue} rate={rate} />),
        ]}
      />
    </li>
  ));
}

/** 전체보기의 거물 명단 줄. 메인 카드와 **같은 순서·같은 값**이다. */
export function wideManagerRows(rows: ManagerRank[], rate: number | null) {
  return rows.map((m) => (
    <li key={m.cik}>
      <WideRow
        cols={WIDE_COLS.managers}
        cells={[
          <Link
            key="p"
            href={`/insider/investor/${m.cik}`}
            style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, textDecoration: "none" }}
          >
            <strong className="hz-cellsub" style={{ ...ROW.lead }}>
              {m.person}
            </strong>
          </Link>,
          // ⚠️ 전체보기는 "이 카드의 나머지"다. 칸이 넓으니 소속과 대표 보유를 나눠 적되,
          //    **카드와 같은 사실**을 낸다(카드는 한 줄에 붙여 적는다).
          text(
            m.topTicker
              ? `${m.firm} · 최대 비중 ${m.topName || m.topTicker} ${Math.round(m.topWeight)}%`
              : m.firm,
            "left",
          ),
          num(<>{m.holdings}<span style={{ ...ROW.sub, fontWeight: 600 }}>종목</span></>),
          num(<Money usd={m.aum} rate={rate} />),
        ]}
      />
    </li>
  ));
}

/** 전체보기의 증권가 순위 줄. ⛔ 숫자는 원천 값 그대로다(analystTopRows 머리말 참고). */
export function wideAnalystRows(rows: AnalystTop[]) {
  return rows.map((a) => {
    const share = a.analystCount > 0 ? (a.strongBuy / a.analystCount) * 100 : 0;
    return (
      <li key={a.ticker}>
        <WideRow
          cols={WIDE_COLS.analyst}
          cells={[
            <WideStock key="s" ticker={a.ticker} name={a.name} />,
            <span key="b" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className="hz-bar" style={{ flex: 1, height: 7 }}>
                <span style={{ width: `${Math.max(1.5, Math.min(100, share))}%` }} />
              </span>
              <span style={{ ...ROW.sub, whiteSpace: "nowrap", flexShrink: 0 }}>
                {CONSENSUS_KO[a.consensus ?? ""] ?? a.consensus ?? "-"}
              </span>
            </span>,
            num(<>{a.analystCount}명 중 {a.strongBuy}명</>),
          ]}
        />
      </li>
    );
  });
}

export function wideCongressRows(rows: CongressTicker[], side: "buy" | "sell") {
  return rows.map((c) => {
    const names = side === "buy" ? c.buyMembers : c.sellMembers;
    return (
      <li key={c.ticker}>
        <WideRow
          cols={WIDE_COLS.congress}
          cells={[
            <WideStock key="s" ticker={c.ticker} name={c.name} badge={c.inKadera ? <KaderaPill /> : undefined} />,
            // 이름과 마지막 매매일을 한 칸에. 인원은 "외 N명"이 이미 말한다.
            text(
              `${names[0] ?? "이름 없음"}${names.length > 1 ? ` 외 ${names.length - 1}명` : ""} · ${fmtDate(c.latest)} 매매`,
              "left",
            ),
            num(side === "buy" ? c.buys : c.sells, "건"),
          ]}
        />
      </li>
    );
  });
}

export function wideMoveRows(rows: ManagerMove[], kind: "add" | "trim") {
  const markLabel = kind === "add" ? "신규" : "청산";
  return rows.map((m) => (
    <li key={m.ticker}>
      <WideRow
        cols={WIDE_COLS.move}
        cells={[
          <WideStock
            key="s"
            ticker={m.ticker}
            name={m.name}
            badge={
              m.mark > 0 ? (
                // 신규·청산은 배지로 종목 옆에 붙인다. 자기 칸을 주면 대부분 빈 칸이 된다.
                <Pill tone={kind === "add" ? MOVE_TONE.buy : MOVE_TONE.sell} title={`반대로 움직인 곳 ${m.against}명`}>
                  {markLabel} {m.mark}
                </Pill>
              ) : undefined
            }
          />,
          text(`${m.names.slice(0, 3).join(" · ")}${m.names.length > 3 ? ` 외 ${m.names.length - 3}명` : ""}`, "left"),
          num(m.movers, "명"),
        ]}
      />
    </li>
  ));
}

export function wideHotRows(rows: InsiderRow[], rate: number | null) {
  return rows.map((r) => (
    <li key={r.ticker}>
      <WideRow
        cols={WIDE_COLS.hot}
        cells={[
          <WideStock key="s" ticker={r.ticker} name={r.name} />,
          text(
            `언급 ${r.mentions}회 · 채널 ${r.channels}곳${r.txns > 0 ? ` · 임원 신고 ${r.txns}건` : ""}`,
            "left",
          ),
          <span key="q" style={{ display: "flex", justifyContent: "flex-end" }}>
            <Quote price={r.price} change={r.changeRate} rate={rate} />
          </span>,
        ]}
      />
    </li>
  ));
}

export function wideHolderRows(rows: InsiderRow[], managers: number) {
  return rows.map((r) => (
    <li key={r.ticker}>
      <WideRow
        cols={WIDE_COLS.holders}
        cells={[
          <WideStock key="s" ticker={r.ticker} name={r.name} />,
          text(`${r.holderNames.slice(0, 3).join(" · ")}${r.holders > 3 ? ` 외 ${r.holders - 3}명` : ""}`, "left"),
          num(r.holders, `/${managers}`),
        ]}
      />
    </li>
  ));
}

/**
 * 비중 한 칸 — **긴 막대 + 숫자**. 넓은 표 세 곳(종목 상세의 거물 · 인물 상세의 보유와
 * 정리)이 같은 자를 쓴다.
 *
 * ## ⚠️⚠️ 눈금은 **0~100% 절대값**이다
 *
 * 한때 "그 표의 최대 비중"을 가득 찬 길이로 놓고 서로 견주게 했다. 되돌렸다 —
 * **21%인데 막대가 꽉 차 있으면 그 자체가 거짓말이다.** 옆에 적힌 숫자와 막대가 다른
 * 말을 하면 둘 다 못 믿는다.
 *
 * ⚠️ 그 대가로 대부분의 줄이 짧아진다. 실측(종목 상세 거물 카드에 뜨는 3,017줄):
 *    중앙값 0.36% · **65%가 1% 미만**이다. 시장을 넓게 사는 곳은 어느 한 종목이
 *    원래 그만큼이라, 짧은 게 사실이다 — 길게 보이게 만들 이유가 없다.
 * ⭐ 다만 0 이 아닌 값은 **최소 잉크**를 남긴다. 아예 안 보이면 "안 갖고 있다"와
 *    구별이 안 된다.
 * ⚠️ 인물 상세는 사정이 다르다(중앙값 5.18% · 1% 미만이 4%뿐). 같은 자를 써도 거기선
 *    막대가 넉넉히 찬다.
 */
function weightCell(weight: number) {
  const ink = weight > 0 ? Math.min(100, Math.max(1.5, weight)) : 0;
  return (
    <span key="w" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
      <span className="hz-bar" style={{ flex: 1, minWidth: 56, height: 8 }}>
        <span style={{ width: `${ink}%` }} />
      </span>
      {/* ⚠️ 작은 값에 자리를 하나 더 준다. 한 자리로 반올림하면 버핏이 정리한 STZ 가
          **"0.0%"** 로 떴다 — 있는 값이 없는 값으로 보인다. */}
      <span style={{ ...ROW.sub, fontFamily: MONO, fontWeight: 600, minWidth: 42, textAlign: "right" }}>
        {weight >= 1 ? weight.toFixed(1) : weight.toFixed(2)}%
      </span>
    </span>
  );
}


/**
 * 종목 상세의 거물 보유 한 줄 — **넓은 줄**.
 *
 * ⚠️ 이 카드는 시트가 페이지 폭을 다 쓴다. 두 칸짜리 줄로 두면 **68%가 흰 여백**이었다
 * (실측 1,162px 중 793px). 종목 밑에 깔려 있던 소속·주식 수를 자기 칸으로 편다.
 */
export function wideStockHolderRows(rows: StockHolder[], rate: number | null) {
  /**
   * 막대의 분모 — **이 표에서 가장 큰 비중**이다. 0~100% 로 두면 안 된다.
   *
   * ⚠️⚠️ 실측 보유 3,126개의 비중 중앙값이 **0.36%** 다(p90 이 5.06% · p95 가 8.28%).
   *    100% 를 가득 찬 길이로 놓으면 절반이 넘는 줄에서 잉크가 1px 도 안 되고, 막대를
   *    길게 늘일수록 **회색 트랙만 길어진다.** 가장 큰 곳을 가득 채우고 나머지를 그것에
   *    견주면 그제야 막대가 "누가 더 걸었나"를 말한다.
   *
   * ⚠️ 절대값을 잃는 게 아니다 — 옆에 %가 그대로 적혀 있다. 막대는 견주는 자, 숫자는 값.
   * ⚠️ 분모는 **넘겨받은 목록 전체**에서 뽑는다. 화면에 다섯 줄만 펴져 있어도 '더 보기'로
   *    늘렸을 때 눈금이 흔들리면 안 된다.
   */
  return rows.map((h) => {
    const label = moveBadge(h.move, h.sharesChange);
    return (
      <li key={h.cik}>
        <WideRow
          cols={WIDE_COLS.stockHolders}
          cells={[
            <Link
              key="p"
              href={`/insider/investor/${h.cik}`}
              style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, textDecoration: "none" }}
            >
              <strong style={{ ...ROW.lead, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {h.person}
              </strong>
              {label && <Pill tone={label.tone}>{label.text}</Pill>}
            </Link>,
            text(h.firm, "left"),
            weightCell(h.weight),
            num(<Money usd={h.value} rate={rate} />),
          ]}
        />
      </li>
    );
  });
}

/**
 * 인물 상세의 보유 한 줄 — 종목 상세의 거물 표와 **같은 꼴**이다.
 *
 * ⚠️ 예전엔 두 칸짜리 줄에 종목 이름 밑으로 주식 수를 깔았다. 한 줄이 두 덩이가 되고
 *    (반쪽 카드에서 되돌린 것과 같은 실수) 오른쪽 막대는 54px 이라 비중이 안 갈렸다.
 *    주식 수는 자기 칸으로 내보내고 막대는 칸을 다 쓴다.
 */
export function wideManagerHoldingRows(rows: ManagerHolding[], rate: number | null) {
  return rows.map((h) => {
    const label = moveBadge(h.move, h.sharesChange);
    return (
      <li key={h.ticker}>
        <WideRow
          cols={WIDE_COLS.managerHoldings}
          cells={[
            <WideStock key="s" ticker={h.ticker} name={h.name} badge={label ? <Pill tone={label.tone}>{label.text}</Pill> : undefined} />,
            text(`${Math.round(h.shares).toLocaleString("ko-KR")}주`, "left"),
            weightCell(h.weight),
            num(<Money usd={h.value} rate={rate} />),
          ]}
        />
      </li>
    );
  });
}

/**
 * 인물 상세의 전량 정리 한 줄.
 *
 * ⭐ 막대가 **직전 분기** 비중이다. "$2.6B 정리"만으로는 그 사람 규모를 모르면 크기를
 *    못 가늠하는데, "4.1% 짜리 자리를 통째로"는 그 자체로 크기다.
 */
export function wideManagerExitedRows(
  rows: { ticker: string; name: string; value: number; weight: number }[],
  rate: number | null,
) {
  return rows.map((e) => (
    <li key={e.ticker}>
      <WideRow
        cols={WIDE_COLS.managerExited}
        cells={[
          <WideStock key="s" ticker={e.ticker} name={e.name} />,
          weightCell(e.weight),
          num(<Money usd={e.value} rate={rate} />),
        ]}
      />
    </li>
  ));
}

/**
 * 애널리스트 등급의 한글 이름과 색.
 *
 * ⚠️ 원문을 그대로 두지 않고 옮긴다 — "Strong Buy" 를 그냥 두면 한국 독자에게 등급 축이
 *    안 보인다. 다만 **원문도 함께 적는다**(툴팁) — 우리가 만든 등급이 아니라 옮긴 것이다.
 * ⭐ 색은 화면의 다른 방향 표시와 같은 규칙이다 — 사는 쪽 빨강, 파는 쪽 파랑, 가운데 회색.
 */
const RATING = [
  { key: "strongBuy", label: "적극 매수", tone: "var(--c-hot)" },
  { key: "buy", label: "매수", tone: "color-mix(in srgb, var(--c-hot) 55%, var(--c-card))" },
  { key: "hold", label: "보유", tone: "var(--c-bar)" },
  { key: "sell", label: "매도", tone: "color-mix(in srgb, var(--c-blue) 55%, var(--c-card))" },
  { key: "strongSell", label: "적극 매도", tone: "var(--c-blue)" },
] as const;

const CONSENSUS_KO: Record<string, string> = {
  "Strong Buy": "적극 매수",
  Buy: "매수",
  Hold: "보유",
  Sell: "매도",
  "Strong Sell": "적극 매도",
};

/**
 * "월가 애널리스트의 시선" 카드의 속 — 컨센서스 요약 + 개별 의견.
 *
 * ## ⚠️ 목표가를 "오르겠다"로 읽히게 쓰지 말 것
 *
 * 목표가는 예측이지 약속이 아니다. 현재가 대비 몇 %인지는 적되(그게 목표가의 뜻이다)
 * 화살표나 색으로 좋고 나쁨을 말하지 않는다. 이 화면은 공시를 옮기는 자리다.
 *
 * ## ⚠️ 애널리스트 수가 둘이라 자리를 갈라 적는다
 *
 * 등급을 낸 사람과 목표가를 낸 사람이 다르다(실측 62명 대 59명). 한 숫자로 뭉치면
 * 어느 쪽도 맞지 않는다.
 *
 * ## ⚠️ 출처 표기는 이용 조건이다
 *
 * 원천 약관이 "수정하지 않고 출처를 밝히면 발췌 허용"이라, 이 줄을 빼면 조건을 어긴다.
 */
/**
 * 컨센서스 카드 전용 금액 — **받은 값 그대로** 적는다.
 *
 * ⚠️⚠️ 여기서 `money()` 를 쓰면 안 된다. 그쪽은 $305 처럼 반올림하는데, 원천 약관이
 *    "수정하지 않고" 쓰라는 조건이라 목표가를 $304.73 → $305 로 바꾸면 그 조건을
 *    어긴다. 시세를 적는 `Quote` 와 같은 자릿수(소수 둘째까지)로 둔다.
 */
function ExactMoney({ usd, rate }: { usd: number | null; rate: number | null }) {
  if (usd == null) return <>-</>;
  const d = `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (!rate) return <>{d}</>;
  return (
    <>
      <span className="hz-usd">{d}</span>
      <span className="hz-krw">{`${Math.round(usd * rate).toLocaleString("ko-KR")}원`}</span>
    </>
  );
}

/**
 * 애널리스트가 한 "행동"의 한글 이름과 색.
 *
 * ⚠️ 색을 주는 것은 **상향·하향 둘뿐**이다. 유지·재확인·신규는 방향이 없어서, 색을
 *    주면 없는 뜻이 생긴다. 색 규칙은 화면의 다른 방향 표시와 같다(사는 쪽 빨강).
 */
const ACTION_KO: Record<string, { text: string; tone?: Tone }> = {
  Upgrades: { text: "상향", tone: "hot" },
  Downgrades: { text: "하향", tone: "cold" },
  Initiates: { text: "신규 개시" },
  Maintains: { text: "유지" },
  Reiterates: { text: "재확인" },
};

/**
 * 개별 애널리스트 의견 다섯 줄.
 *
 * ## ⚠️ 다섯 건에서 끊고 원문으로 보낸다
 *
 * 원천 약관이 "전문 재게시 금지 · 발췌 허용"이라, 저쪽 목록을 통째로 옮기면 조건을
 * 어긴다. 그래서 다섯 줄에서 끊는다.
 * ⛔ 애널리스트 적중률·순위는 아예 안 받아 온다 — 그쪽 유료 상품의 핵심이다.
 * ⛔ **출처 표기를 빼지 말 것.** 원문 링크는 뺐지만, 약관이 요구하는 것은
 *    링크가 아니라 "어디서 가져왔는지 밝히기"다 — 그건 카드 바닥의 출처 줄이 한다.
 *    그 줄까지 없어지면 조건을 어긴다.
 *
 * ## ⭐ 목표가는 **바뀐 것만** 앞뒤를 적는다
 *
 * 이 줄에서 가장 읽을 만한 값이 "얼마에서 얼마로"다. 안 바뀐 줄에 이전 값을 지어내지 말 것
 * (원천이 그때는 안 준다).
 */
export function AnalystActions({ rows, rate }: { rows: AnalystAction[]; rate: number | null }) {
  if (!rows.length) return null;
  // 목록이 덮는 기간. 하루치뿐이면 한쪽만 적는다(`8/20~8/20` 은 읽는 사람을 멈칫하게 한다).
  const dates = rows.map((r) => r.date).sort();
  const span =
    dates.length === 0
      ? null
      : dates[0] === dates[dates.length - 1]
        ? fmtDate(dates[0])
        : `${fmtDate(dates[0])}~${fmtDate(dates[dates.length - 1])}`;
  const items = rows.map((r, i) => {
    const act = r.action ? ACTION_KO[r.action] : undefined;
    return (
      <li key={`${r.date}-${r.firm}-${r.analyst}-${i}`}>
        <div className="hz-trow hz-actionrow" style={{ padding: "7px 0" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <strong className="hz-cellsub" style={{ ...ROW.lead, fontSize: 13 }}>
              {r.firm}
            </strong>
            <SubLine text={`${r.analyst === "Unknown Analyst" ? "이름 없음" : r.analyst} · ${fmtDate(r.date)}`} />
          </span>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
            {act && (act.tone ? <Pill tone={act.tone}>{act.text}</Pill> : <span style={{ ...ROW.sub }}>{act.text}</span>)}
            {r.rating && <span style={{ ...ROW.sub, fontWeight: 600, color: C.ink }}>{CONSENSUS_KO[r.rating] ?? r.rating}</span>}
          </span>
          <span style={{ ...ROW.value, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>
            {r.targetNow == null ? (
              <span style={{ ...ROW.sub }}>목표가 없음</span>
            ) : r.targetOld != null && r.targetOld !== r.targetNow ? (
              <>
                <span style={{ ...ROW.sub, fontFamily: MONO }}>
                  <ExactMoney usd={r.targetOld} rate={rate} />
                </span>
                <span style={{ ...ROW.sub, margin: "0 4px" }}>→</span>
                <ExactMoney usd={r.targetNow} rate={rate} />
              </>
            ) : (
              <ExactMoney usd={r.targetNow} rate={rate} />
            )}
          </span>
        </div>
      </li>
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--c-sheet-row)", paddingTop: 12 }}>
      {/* ⚠️⚠️ "최근 한 달"이라 못박지 말 것. 원천이 싣는 건 **최근 여덟 건**이지 한 달치가
          아니라, 목록이 덮는 기간이 종목마다 다르다 — 실측 177종목: 중앙값 15일이지만
          엔비디아는 사흘, 가장 긴 곳은 176일이다(커버리지가 뜸한 종목).
          그래서 기간을 **재서 적는다.** 그래야 "64명 중 왜 8명뿐이냐"에도 답이 된다 —
          64명은 등급을 걸어 둔 사람 수, 이 목록은 그 사이에 움직인 사람이다. */}
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "0 22px 4px" }}>
        <span style={{ ...ROW.sub, fontWeight: 600 }}>최근 의견</span>
        {span && <span style={{ fontSize: T.small, color: C.muted, fontFamily: MONO }}>{span}</span>}
      </span>
      {/* ⭐ 다섯 줄로 열고 눌러서 늘린다. 다 펴면 '접기'가 함께 뜬다(ExpandableList 기본).
          ⚠️⚠️ 바닥 띠는 **`hz-sheet-foot-row`** 를 쓴다. 기본 푸터로 뒀더니 카드 한가운데
             떠 있는 옅은 글자가 되어 **버튼으로 안 읽혔다** — 이미 있는데도 "더 보기를
             넣어 달라"는 말을 들었다. 화면의 다른 목록과 같은 띠라야 한다. */}
      <ExpandableList
        items={items}
        name="stock_analyst_actions"
        initial={5}
        step={10}
        listStyle={{ padding: "0 22px", display: "block" }}
        footerClassName="hz-sheet-foot-row"
      />
    </div>
  );
}

export function ConsensusBody({
  c,
  price,
  rate,
  children,
}: {
  c: AnalystConsensus;
  price: number | null;
  rate: number | null;
  /** 개별 애널리스트 목록. 위 두 칸 아래에 온다. */
  children?: React.ReactNode;
}) {
  const counts: Record<string, number> = {
    strongBuy: c.strongBuy ?? 0,
    buy: c.buy ?? 0,
    hold: c.hold ?? 0,
    sell: c.sell ?? 0,
    strongSell: c.strongSell ?? 0,
  };
  const total = RATING.reduce((a, r) => a + counts[r.key], 0);
  const upside = price && c.targetAvg ? ((c.targetAvg - price) / price) * 100 : null;
  // 현재가가 최저~최고 사이 어디인지. 목표가 구간이 없으면 안 그린다.
  const span = c.targetLow != null && c.targetHigh != null && c.targetHigh > c.targetLow;
  const pos = span && price ? Math.min(100, Math.max(0, ((price - c.targetLow!) / (c.targetHigh! - c.targetLow!)) * 100)) : null;

  return (
    // ⚠️ 가로 여백을 여기 두지 말 것. 아래 목록의 '더 보기' 띠가 **카드 폭을 꽉 채워야**
    //    다른 목록과 같은 모양이 된다(안 그러면 버튼이 그냥 떠 있는 글자로 보인다).
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ⭐ **두 값을 나란히 세운다.** 등급과 목표가는 이 카드가 답하는 질문 둘이라 위아래로
          쌓으면 카드가 길기만 하고 무엇이 요점인지 안 보인다. 좁아지면 저절로 접힌다. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "14px 22px 16px" }}>
        {total > 0 && (
          <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
            <span style={{ ...ROW.sub, fontWeight: 600 }}>증권가 종합</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <strong style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                {(c.consensus && CONSENSUS_KO[c.consensus]) ?? c.consensus ?? "등급 미상"}
              </strong>
              <span style={{ ...ROW.sub }} title={c.consensus ? `원문 등급 ${c.consensus}` : undefined}>
                애널리스트 {c.analystCount ?? total}명
              </span>
            </span>
            {/* 분포 막대. 한 줄에 쌓아 두면 "얼마나 한쪽으로 쏠렸나"가 숫자보다 빨리 읽힌다. */}
            <span style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", background: "var(--c-track)" }}>
              {RATING.filter((r) => counts[r.key] > 0).map((r) => (
                <span
                  key={r.key}
                  title={`${r.label} ${counts[r.key]}명`}
                  style={{ width: `${(counts[r.key] / total) * 100}%`, background: r.tone }}
                />
              ))}
            </span>
            <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {RATING.filter((r) => counts[r.key] > 0).map((r) => (
                <span key={r.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, ...ROW.sub }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: r.tone, flexShrink: 0 }} />
                  {r.label} <strong style={{ fontFamily: MONO, color: C.ink, fontWeight: 700 }}>{counts[r.key]}</strong>
                </span>
              ))}
            </span>
          </div>
        )}

        {c.targetAvg != null && (
          <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
            <span style={{ ...ROW.sub, fontWeight: 600 }}>
              1년 목표가 평균{c.targetCount != null ? ` · 애널리스트 ${c.targetCount}명` : ""}
            </span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <strong style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                <ExactMoney usd={c.targetAvg} rate={rate} />
              </strong>
              {upside != null && (
                // ⚠️ 색을 주지 않는다. 목표가는 예측이지 약속이 아니라, 화면이 좋고 나쁨을
                //    말하는 자리가 아니다.
                <span style={{ ...ROW.sub, fontFamily: MONO, fontWeight: 700 }}>
                  현재가 대비 {upside > 0 ? "+" : "−"}
                  {Math.abs(upside).toFixed(1)}%
                </span>
              )}
            </span>
            {span ? (
              <>
                {/* 채우는 막대가 아니라 **구간 위의 점**이다. 저점부터 채우면 "이만큼 올랐다"로
                    읽히는데, 이 값은 그게 아니라 예측 범위 안 어디에 지금 값이 있느냐다. */}
                <span className="hz-range" style={{ position: "relative", height: 10 }}>
                  {pos != null && <span className="hz-range-knob" style={{ left: `${pos}%` }} />}
                </span>
                {/* ⚠️ 숫자만 두면 그게 목표가의 양끝인지 축 눈금인지 안 보인다 — 바로 위가
                    막대라 특히 그렇다. 숫자 아래에 무엇인지 적는다. */}
                <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ ...ROW.sub, fontFamily: MONO, color: C.ink, fontWeight: 600 }}>
                      <ExactMoney usd={c.targetLow} rate={rate} />
                    </span>
                    <span style={{ fontSize: T.small, color: C.muted }}>최저 목표가</span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-end" }}>
                    <span style={{ ...ROW.sub, fontFamily: MONO, color: C.ink, fontWeight: 600 }}>
                      <ExactMoney usd={c.targetHigh} rate={rate} />
                    </span>
                    <span style={{ fontSize: T.small, color: C.muted }}>최고 목표가</span>
                  </span>
                </span>
              </>
            ) : (
              // 왼쪽 칸에 막대와 범례가 있어 높이가 맞아야 한다. 구간이 없으면 자리만 비운다.
              <span aria-hidden style={{ height: 10 }} />
            )}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

/**
 * 반쪽 카드(492~570px)의 한 줄 — **이름 · 한 줄 설명 · 값 하나.**
 *
 * 넓은 표(`WIDE_COLS`)와 **같은 문법**이다: ①누가 ②무엇을 언제 ③얼마. 폭만 다르다.
 *
 * ## ⚠️ 오른쪽에 사실을 쌓지 말 것
 *
 * 이 줄은 네 번 고쳤고, 세 번은 **사실을 어디에 쌓을까**를 잘못 고른 탓이었다.
 *
 *   ① 가운데에 막대 → 정보를 안 담았다(의원 금액이 구간이라 길이가 거의 같다).
 *   ② 이름 밑에 보조줄 → 한 줄이 두 덩이가 되어 다섯 줄 카드가 열 덩이로 읽혔다.
 *   ③ 값 밑에 보조줄 → 이번엔 오른쪽에 사실이 셋(금액·주식 수·날짜) 붙어 **덩어리를
 *      해독하는 자리**가 됐다. 왼쪽은 이름 하나뿐인데 오른쪽만 빽빽했다.
 *
 * 답은 쌓는 자리를 옮기는 게 아니라 **가로로 펴고 수를 줄이는 것**이었다. 지금은 칸이
 * 셋이고 칸마다 하나씩만 있다. 사실을 더 얹고 싶으면 그건 이 줄이 할 일이 아니다.
 *
 * ⚠️ 굵기는 이름(700)과 값(600) 둘뿐이다. 셋이 되면 어느 쪽도 주인공이 아니게 된다.
 */
export function HalfRow({
  name,
  note,
  value,
  valueMuted,
}: {
  name: React.ReactNode;
  /** 가운데 한 줄 설명 — **무엇을 언제.** 짧은 한 마디여야지 사실의 나열이면 안 된다. */
  note?: React.ReactNode;
  value: React.ReactNode;
  /**
   * 값이 금액이 아니라 대체값(주식 수)일 때. 한 칸에 단위가 섞이므로 색과 굵기를
   * 한 단 내려 "다른 종류의 숫자"로 보이게 한다.
   */
  valueMuted?: boolean;
}) {
  return (
    <div className="hz-trow hz-halfrow">
      <strong style={{ ...ROW.lead, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </strong>
      <span style={{ ...ROW.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</span>
      <span
        style={{
          ...(valueMuted ? { ...ROW.sub, fontFamily: MONO } : { ...ROW.value, fontWeight: 600 }),
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** 자료가 없는 카드. 빈 칸으로 두지 않고 **왜 없는지**를 적는다. */
export function EmptyCard({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "34px 26px",
        textAlign: "center",
      }}
    >
      <Icon name={icon} style={{ fontSize: 26, color: C.hint }} />
      {/* ⭐ **문장마다 줄을 바꾼다.** 흘려 두면 "…없습니다. 임원이" 처럼 두 문장이 한 줄에
          걸쳐 이어져, 빈 상태를 알리는 첫 문장과 그 이유를 대는 둘째 문장이 한 덩이로
          읽힌다. 자리는 어차피 남으니 문장 경계에서 끊는 편이 낫다.
          ⚠️ 마침표 뒤 공백이 아니라 **한글 뒤 마침표**로 가른다. 그냥 `. ` 로 자르면
             `stockanalysis.com ` 이나 소수점이 문장 끝으로 잡힌다.
          ⚠️ 한 문장짜리는 그대로 한 덩이다 — 넷 중 셋이 그렇다. */}
      <p style={{ margin: 0, fontSize: T.body, color: C.sub, lineHeight: 1.7, wordBreak: "keep-all", maxWidth: 300 }}>
        {typeof children === "string"
          ? children
              .split(/(?<=[가-힣]\.)\s+/)
              .map((line, i) => (
                <span key={i} style={{ display: "block" }}>
                  {line}
                </span>
              ))
          : children}
      </p>
    </div>
  );
}

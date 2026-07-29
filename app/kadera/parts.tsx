import { shortDate } from "@/lib/format";

import { C, MONO } from "../ui";

/**
 * 카더라 리포트가 공유하는 표시 프리미티브.
 *
 * 카드마다 제각각이던 알약·순위·아바타·스파크라인을 한곳에 모은다. 목적은 페이지
 * 전체가 같은 리듬(카드 → 타일 → 알약)으로 읽히게 하는 것이다. MDD 정밀분석의
 * CardHead/Stat/BarRow 와 같은 문법이라 두 페이지를 오가도 낯설지 않다.
 *
 * "use client" 를 붙이지 않아 서버·클라이언트 양쪽에서 그대로 쓰인다(SectionHead 와
 * 같은 원칙 — 색·서체 프리미티브 외에는 의존이 없다).
 */

/** 카드(1단계) — 페이지의 모든 섹션이 이 껍데기를 쓴다. */
export const card: React.CSSProperties = {
  background: C.card,
  borderRadius: 16,
  // 폭에 따라 24 → 18 (globals.css 의 --hz-card-pad).
  padding: "var(--hz-card-pad)",
  border: `1px solid ${C.line}`,
  // 그리드 칸 안에서 카드가 내용에 밀려 넓어지지 않도록(칸 비율 고정). 긴 채널명 등은
  // 카드 안에서 말줄임 처리되어야지, 카드를 늘려선 안 된다.
  minWidth: 0,
};

/** 카드 안의 타일(2단계) — 종목 타일·메시지 카드·종목 리포트가 공유한다. */
export const subCard: React.CSSProperties = {
  background: C.bg,
  borderRadius: 14,
  border: `1px solid ${C.line}`,
  minWidth: 0,
};

/** 순위 숫자 칸. 폭을 고정해 두 자리(10)가 되어도 아래 내용이 밀리지 않는다. */
export const rankNum: React.CSSProperties = {
  width: 17,
  textAlign: "right",
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 13,
  color: C.faint,
  flexShrink: 0,
};

export type Tone = "plain" | "blue" | "hot" | "cold";

/**
 * 알약 배지. 기간 표기("최근 7일")부터 종목 태그·급등 배수까지 전부 이 한 벌을 쓴다.
 *
 * 배경은 반드시 --c-*-tint 변수로 낸다. 인라인에서 `${C.hot}22` 처럼 알파를 이어붙이면
 * "var(--c-hot)22" 가 되어 CSS 가 통째로 버린다(급부상 종목 배지가 실제로 배경 없이
 * 글자만 떠 있었다).
 */
export function Pill({
  children,
  tone = "plain",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
}) {
  const bg =
    tone === "blue" ? "var(--c-blue-tint)" : tone === "hot" ? "var(--c-hot-tint)" : tone === "cold" ? "var(--c-cold-tint)" : C.track;
  const fg = tone === "blue" ? C.blue : tone === "hot" ? C.hot : tone === "cold" ? C.cold : C.sub;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.45,
        color: fg,
        background: bg,
        padding: "3px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** 순위 변동(▲3계단) — 0·null 이면 아무것도 그리지 않는다. */
export function RankDelta({ change, unit = "계단" }: { change: number | null; unit?: string }) {
  if (change === null || change === 0) return null;
  return (
    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: change > 0 ? C.hot : C.cold, whiteSpace: "nowrap" }}>
      {change > 0 ? "▲" : "▼"}
      {Math.abs(change)}
      {unit}
    </span>
  );
}

/**
 * 등락률(▲1.23%). 0 은 상승도 하락도 아니라 화살표를 떼고 중립색으로 그린다 —
 * 탑바 티커(app/AppShell.tsx 의 TickerItem)와 같은 규칙이다. 예전엔 `>= 0` 으로 갈라서
 * 시세가 잠깐 멈춘 동안 "▲0.00%" 가 상승색으로 떴는데, 바로 위 티커는 같은 0 을 화살표
 * 없이 그리고 있었다(2026-07-28 실측). 티커가 상승에 C.mania 를 쓰는 것만 다르고 규칙은
 * 하나다 — 한쪽을 고치면 다른 쪽도 같이 볼 것.
 *
 * null(전일 종가를 못 구해 등락률을 못 낸다)이면 아무것도 그리지 않는다.
 */
export function ChangeRate({ rate, style }: { rate: number | null; style?: React.CSSProperties }) {
  if (rate === null) return null;
  const [color, arrow] = rate > 0 ? [C.hot, "▲"] : rate < 0 ? [C.cold, "▼"] : [C.sub, ""];
  return (
    <span style={{ fontFamily: MONO, fontWeight: 600, color, ...style }}>
      {arrow}
      {Math.abs(rate).toFixed(2)}%
    </span>
  );
}

/**
 * 실시간이 아닌 시세의 기준일("7/27 종가"). 가격 아랫줄에서 위 ChangeRate 와 자리를
 * 나눠 쓰므로 둘 다 반드시 한 줄을 채운다 — 한쪽이 비면 타일 높이가 갈린다.
 *
 * 등락률 대신 날짜를 그리는 이유: 저장 종가로 폴백하면 등락률도 그날 것이라, 화살표를
 * 그대로 두면 가격뿐 아니라 방향까지 뒤집혀 보인다(2026-07-28 NAVER 가 실제
 * ▼6.67% 인 날 07-27 의 ▲8.43% 로 떴다). '지금 뭐가 뜨나' 카드에서 지난 거래일의
 * 등락률은 값어치가 낮아, 버리고 기준일로 갈음하는 편이 손해가 적다.
 *
 * 기준일을 모르면(마이그레이션 015 이전 폴백 등) 빈 배지가 뜨지 않게 날짜를 뺀
 * "종가 기준"으로 떨어뜨린다.
 */
export function QuoteDate({ date, style }: { date: string | null; style?: React.CSSProperties }) {
  return (
    <span style={{ fontFamily: MONO, fontWeight: 600, color: C.sub, ...style }}>
      {date ? `${shortDate(date)} 종가` : "종가 기준"}
    </span>
  );
}

/**
 * 채널 프로필 사진. 없으면 첫 글자 이니셜 아바타로 폴백.
 *
 * src 는 /api/channel-photo/... 주소다(lib/channel-photo.ts). base64 data URI 를 그대로
 * 받던 시절엔 같은 사진이 페이지에 최대 세 번씩 박혀 HTML 의 74%가 아바타였다.
 *
 * loading="lazy" 가 중요하다 — 트렌딩 메시지는 탭 세 벌이 다 그려져 있고 채널 랭킹은
 * '더보기'로 접혀 있어, 첫 화면에 실제로 보이는 아바타는 전체의 3분의 1도 안 된다.
 * 나머지는 눈에 들어올 때 받는다. width/height 를 속성으로도 주는 건 사진이 도착하기
 * 전에도 자리를 잡아 두라는 뜻이다(줄이 밀리지 않는다).
 */
export function Avatar({ photoUrl, title, size = 30 }: { photoUrl: string | null; title: string; size?: number }) {
  const common: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    objectFit: "cover",
    border: `1px solid ${C.line}`,
  };
  // 사진이 도착하기 전에는 이니셜 아바타와 같은 회색 원으로 자리를 지킨다. 배경이
  // 없으면 그동안 테두리만 남아 빈 링으로 보인다 — 사진이 HTML 에 박혀 있던 시절엔
  // 없던 순간이라, 빠르게 스크롤해 내려갈 때만 잠깐 스친다. 아래 폴백과 같은 C.track
  // 을 깔아 두면 그 순간이 '아직 안 온 사진'이 아니라 '원래 그 자리'로 읽힌다.
  if (photoUrl)
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ ...common, background: C.track }}
      />
    );
  return (
    <span
      style={{
        ...common,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.track,
        color: C.sub,
        fontSize: size * 0.42,
        fontWeight: 700,
      }}
    >
      {title.trim().charAt(0)}
    </span>
  );
}

/**
 * 미니 막대 그래프(테마 언급 추이). 폭을 고정해 데이터 개수가 달라도 행마다 같은
 * 자리에서 끝난다 — 예전엔 막대 폭이 고정이라 7일치와 14일치 행의 오른쪽 끝이 어긋났다.
 * 마지막 막대만 진하게 둬 "지금"이 어디인지 눈이 먼저 잡는다.
 */
export function Sparkline({ data, width = 62, height = 26 }: { data: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...data);
  const n = Math.max(1, data.length);
  const gap = 2;
  const barW = Math.max(2, (width - gap * (n - 1)) / n);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height, width, flexShrink: 0 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            width: barW,
            height: `${Math.max(2, (v / max) * height)}px`,
            background: C.blue,
            opacity: i === data.length - 1 ? 0.9 : 0.4,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

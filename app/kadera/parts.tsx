import { shortDate } from "@/lib/format";

import { C, MONO, R } from "../ui";

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

/* 카드 껍데기(1단계)는 여기 인라인 스타일 `card` 로 있었다. 2026-08 콘솔 리디자인이
   카드를 **시트**로 바꾸면서 두 페이지 모두 `.hz-sheet`(globals.css)로 옮겨 갔고,
   그때부터 이 상수를 import 하는 곳이 없었다. 시트는 그림자가 아니라 헤어라인
   (--c-sheet-line)으로 경계를 긋는다. */

/**
 * 카드 안의 타일(2단계) — 종목 타일·메시지 카드·종목 리포트가 공유한다.
 *
 * 흰 카드 위에 **파이는** 자리라 배경은 --c-soft 다(main 바탕색인 --c-bg 가 아니다 —
 * 둘은 한 톤 차이지만, bg 를 쓰면 카드 밖 바탕과 같은 색이라 타일이 카드에 뚫린 구멍
 * 처럼 보인다). 테두리는 뺀다 — 배경만으로 이미 한 겹 내려간 것이 읽히고, 선까지
 * 있으면 카드 한 장에 테두리가 열 개씩 생겨 격자가 시끄러워진다.
 */
export const subCard: React.CSSProperties = {
  background: C.soft,
  borderRadius: R.control,
  minWidth: 0,
};

/** 순위 숫자 칸. 폭을 고정해 두 자리(10)가 되어도 아래 내용이 밀리지 않는다. */
export const rankNum: React.CSSProperties = {
  width: 17,
  textAlign: "right",
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: 13,
  color: C.sub2,
  flexShrink: 0,
};

/** 한 줄 말줄임 — 이름 칸처럼 셀을 밀어낼 수 있는 글에 붙인다. 두 page.tsx 가
    각자 같은 상수를 들고 있는데, parts 안에서 쓰는 것은 여기 것을 쓴다. */
const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

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
    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: change > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)", whiteSpace: "nowrap" }}>
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
 * 셀 왼쪽 위의 순위 배지(1~6). 시트 안에서 셀 순서를 짚어 주는 자리라 순위 숫자
 * (rankNum, 회색 맨글씨)와 달리 판을 깔아 또렷하게 둔다.
 *
 * 글자색은 --c-cold-ink 다. --c-blue 를 그대로 얹으면 판(--c-plate) 위 명암비가
 * 2.9 라 안 읽힌다(globals.css 의 --c-hot-ink 주석과 같은 함정).
 */
export function RankBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        background: "var(--c-plate)",
        color: "var(--c-cold-ink)",
        fontSize: 11,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

/** 구간 머리 배지("최근 뜨는 것 3"). 시트 사이를 갈라 페이지를 장으로 묶는다.
    생김새는 .hz-section-badge(globals.css) — 시장 브리핑·MDD 의 같은 줄과 한 벌이다. */
export function SectionCaps({ label, count }: { label: string; count: number }) {
  return (
    <div className="hz-section-badge">
      <span>{label}</span>
      <span className="hz-section-badge-n">{count}</span>
    </div>
  );
}

/**
 * 일별 언급량 7일 막대 + 날짜 축.
 *
 * 색이 말하는 것은 **어느 칸이 이 셀의 수치에 들어갔나**다.
 *   - tone="warm"(급부상): 최근 창(hot 개)만 붉게. 그 안에서 제일 높은 칸이 --c-warm-1,
 *     나머지 최근 칸은 --c-warm-3, 창 밖은 --c-bar-mute.
 *   - tone="cold"(주요 종목 리포트): 파랑 램프. 최고 칸 --c-blue-2, 그다음 --c-blue-3,
 *     나머지 --c-blue-5. 창 **밖** 칸은 옅게 눌러 배경 맥락임을 표시한다.
 *
 * ⚠️ 창을 3 으로 못박지 않고 hot 으로 받는다. getSurgingStocks 의 배수는 집계가 얕은
 * 초기에 1~2일치로 나기도 하는데(recentDays), 그림만 3칸을 칠하면 "배수는 2일로 냈고
 * 그림은 3일을 가리키는" 날이 생긴다.
 *
 * ⚠️ cold 에서 창 밖을 눌러 두는 건 장식이 아니다. 막대는 7일인데 셀의 큰 숫자는 최근
 * 3일 합이라, 표시를 안 하면 "451회 언급" 옆에 "최다 944회"가 붙어 하루가 사흘 합보다
 * 큰 모순처럼 읽힌다(SK하이닉스 실측). 어느 칸이 그 숫자에 들어갔는지 눈으로 짚을 수
 * 있어야 두 수가 화해한다.
 *
 * 막대가 0 인 날에도 2px 은 남긴다 — 칸이 통째로 사라지면 7일 축의 자리가 비어
 * 며칠이 빠진 것처럼 보인다.
 */
export function DayBars({
  values,
  dates,
  tone,
  hot = 0,
  peakLabel,
  height = 44,
}: {
  values: number[];
  dates: string[];
  tone: "warm" | "cold";
  /** 셀의 큰 숫자가 실제로 센 **뒤쪽 칸 수**. warm 은 그 칸을 붉게 칠하고, cold 는
   *  그 **밖**을 옅게 눌러 같은 것을 말한다(0이면 아무 구분도 하지 않는다). */
  hot?: number;
  /** 최고 칸 위에 얹을 라벨("최다 159회"). 없으면 그리지 않는다. */
  peakLabel?: string;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(max);
  const n = values.length;
  /** 이 칸이 셀의 큰 숫자에 들어갔나(뒤에서 hot 칸). hot=0 이면 전부 창 안으로 친다. */
  const inWindow = (i: number) => hot <= 0 || i >= n - hot;

  const fill = (v: number, i: number): string => {
    if (tone === "warm") {
      if (!inWindow(i)) return "var(--c-bar-mute)";
      return v === max ? "var(--c-warm-1)" : "var(--c-warm-3)";
    }
    // cold 는 **한 색**이다(옛 디자인 그대로). 진하기만 두 단계로 갈라 "어디까지가 이
    // 숫자인가"를 색이 직접 말한다 — 최고일까지 따로 칠하면 단계가 셋이 되어 그 경계가
    // 안 읽힌다(globals.css 의 .hz-bars 주석에 같은 이유가 적혀 있다).
    return "var(--c-blue)";
  };
  /** 창 밖은 배경 맥락이라 옅게. 옛 .hz-bar / .hz-bar-ctx 와 같은 값(0.95 / 0.45). */
  const dim = (i: number): number => (tone === "cold" && !inWindow(i) ? 0.45 : tone === "cold" ? 0.95 : 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {/* 라벨을 막대 위에 절대배치로 얹는다. 흐름에 두면 라벨이 있는 셀만 그래픽이
          16px 내려앉아, 같은 줄의 다른 셀과 막대 밑선이 어긋난다. paddingTop 이 그
          자리를 늘 비워 둬서 라벨이 없는 셀도 높이가 같다. */}
      <div style={{ position: "relative", paddingTop: 16 }}>
        {peakLabel && (
          <span
            style={{
              position: "absolute",
              top: 0,
              // 칸 가운데. gap 을 무시한 근사지만 7칸에서 어긋남이 1px 미만이다.
              left: `${((peak + 0.5) / n) * 100}%`,
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              fontSize: 11,
              fontWeight: 700,
              color: tone === "warm" ? "var(--c-hot-ink)" : "var(--c-cold-ink)",
            }}
          >
            {peakLabel}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height }}>
          {values.map((v, i) => (
            <span
              key={dates[i] ?? i}
              /* 양 끝 칸은 툴팁을 안쪽으로 연다. 기본은 가운데 정렬이라 막대가 30px 남짓인
                 이 차트에서는 툴팁("7/29 · 944회")이 칸보다 훨씬 넓어 좌우로 삐져나가는데,
                 시트가 overflow:hidden 이라 **잘려서 안 읽힌다**. 두 칸씩 잡는 이유는
                 툴팁 폭이 한 칸 반을 넘기 때문이다. */
              className={`hz-tip${i <= 1 ? " hz-tip-start" : i >= n - 2 ? " hz-tip-end" : ""}`}
              data-tip={`${shortDate(dates[i] ?? "")} · ${v}회`}
              style={{
                flex: 1,
                minWidth: 0,
                height: `${Math.max(2, (v / max) * height)}px`,
                borderRadius: "2px 2px 0 0",
                background: fill(v, i),
                opacity: dim(i),
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {dates.map((d, i) => {
          // 강조하는 날짜는 tone 마다 다르다 — 급부상은 '가장 최근'이 주인공이고,
          // 종목 리포트는 '가장 많았던 날'이 주인공이다.
          const mark = tone === "warm" ? i === n - 1 : i === peak;
          return (
            <span
              key={d}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "center",
                fontSize: 11,
                fontFamily: MONO,
                fontWeight: mark ? 700 : 500,
                color: mark ? (tone === "warm" ? "var(--c-hot-ink)" : "var(--c-cold-ink)") : C.sub2,
              }}
            >
              {shortDate(d)}
            </span>
          );
        })}
      </div>
    </div>
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

/**
 * 요약 글에서 **그날의 주인공**을 굵게 집는다. 국장·미장 두 히어로가 함께 쓴다.
 *
 * 시장 브리핑의 '오늘의 브리핑'과 MDD 의 '이 하락의 맥락'은 문단을 JSX 로 조립해서
 * 지표명·핵심 수치에 <b> 를 직접 붙인다. 여기는 LLM 이 보낸 **통글**이라 같은 방법을
 * 못 쓴다 — 대신 화면에서 집는다.
 *
 * 처음엔 수치를 집었다가 걷었다("3일간·328억"). 카더라에서 눈이 찾는 것은 숫자가
 * 아니라 **무엇이 회자되나**다. 그래서 낱말은 그날 화면이 이미 뽑아 둔 것에서만
 * 가져온다 — 급부상 종목·주요 종목 리포트·테마 로테이션·이슈 키워드. 손으로 적어 둔
 * 목록이 아니라 **오늘 자 집계**라 낡지 않는다. 2차전지가 화제인 날은 2차전지가,
 * 아닌 날은 그날의 것이 굵어진다.
 *
 * ⚠️ 한 문단에 **최대 둘**이다. 굵은 데가 셋을 넘으면 강조가 아니라 얼룩이 된다.
 * 그리고 같은 낱말은 **글 전체에서 한 번만** 굵어진다 — used 를 문단마다 새로 만들면
 * 반도체가 2·3문단에서 각각 한 번씩, 화면에서는 두 번 굵어진다(실측). 세 문단이
 * 한 글이므로 셈도 글 단위로 한다. 그래서 호출자가 Set 을 들고 넘긴다.
 *
 * ⚠️ 긴 낱말을 먼저 대본다. "삼성전자"를 "삼성"보다 뒤에 대면 "삼성"만 굵어지고
 * "전자"가 떨어져 나온다. 그 정렬은 호출자가 한다(termsFor 참고).
 * ⚠️ 낱말 경계를 한글로는 못 가른다(\b 가 한글에 안 걸린다). 그렇다고 **뒤가 한글이면
 * 건너뛰기**로 막으면 안 된다 — 한국어는 조사가 명사에 바로 붙어서 "2차전지가",
 * "지주·밸류업과" 가 전부 걸러진다(실제로 반도체 하나만 굵어졌다). 뒤는 열어 두고,
 * 영문·숫자 낱말일 때만 뒤를 막는다("AI"가 "AI수요" 속에서 따로 굵어지는 것 방지).
 * 그 예외의 예외가 particleAfterLatin 이다(아래).
 *
 * ⚠️ 이 함수는 **한 벌만 있어야 한다.** 국장·미장이 각자 복사해 두면 한쪽만 고쳐진
 * 채로 두 화면의 강조 규칙이 갈린다(이 저장소가 파이썬↔TS 쌍둥이로 이미 겪은 일이다).
 */
const HANGUL = /[\uAC00-\uD7A3]/;

const MAX_BOLD_PER_PARAGRAPH = 2;

/**
 * 영문 이름 뒤에 **조사만** 붙었으면 그건 합성어가 아니라 낱말 경계다.
 *
 * 국장은 이름이 거의 한글이라 이 자리가 안 드러났다. 미장은 "TSMC의 7월 매출",
 * "AMD와" 처럼 라틴 이름 + 조사가 흔해서, 뒤가 한글이면 무조건 막는 규칙이 그대로
 * 걸리면 영문 종목은 하나도 안 굵어진다.
 *
 * 판정은 **뒤에 붙은 한글 덩어리 전체가 이 목록과 정확히 같은가**로 한다. 조사로
 * 시작하는지만 보면 "AI에이전트"의 '에'가 조사로 통과한다 — 덩어리째 대면 "에이전트"
 * 는 목록에 없어 그냥 막힌다. 못 맞히면 안 굵어질 뿐이라 실패가 안전한 쪽이다.
 *
 * ⚠️ 조사 목록을 문법책대로 넓히지 말 것. 넓힐수록 합성어가 새 들어온다 — 이 저장소가
 * 유령 종목 그물에서 이미 겪었다. 여기 있는 것은 국장 LLM 글 210편(21,539자)에서 실제로
 * 나온 '영문토큰 + 한글덩어리' 135건을 전수로 갈라 본 결과다. 이 목록으로 25건이 열리고
 * 110건이 막히는데, **열린 25건은 전부 조사였고 막힌 110건은 전부 합성어였다**
 * (SK+하이닉스는 · 20+일부터 · 000+억달러 …). 넓히려거든 그 대조를 다시 돌려
 * 오분류가 0인지부터 확인할 것.
 */
const LATIN_TRAILING_PARTICLES = new Set(
  (
    "의 가 이 은 는 을 를 와 과 도 만 로 에 랑 야 " +
    "에서 에게 으로 한테 처럼 보다 부터 까지 마저 조차 밖에 만큼 라고 로서 로써 " +
    "와의 과의 로의 에의 에도 에는 에선 으론 으로도 으로는 에게도 에게는 에서도 에서는 " +
    "로부터 으로서 으로써"
  ).split(" "),
);

const HANGUL_RUN = /^[\uAC00-\uD7A3]+/;

function trailingIsParticle(text: string, at: number): boolean {
  const run = HANGUL_RUN.exec(text.slice(at));
  return !!run && LATIN_TRAILING_PARTICLES.has(run[0]);
}

export function highlightTerms(
  text: string,
  terms: string[],
  used: Set<string>,
  /** particleAfterLatin: 영문 낱말 뒤가 조사면 굵힘을 허용한다(미장 히어로만 켠다). */
  opts?: { particleAfterLatin?: boolean },
): React.ReactNode[] {
  if (terms.length === 0) return [text];
  const out: React.ReactNode[] = [];
  let inThisParagraph = 0;
  let i = 0;
  let key = 0;
  let buf = "";
  outer: while (i < text.length) {
    if (inThisParagraph >= MAX_BOLD_PER_PARAGRAPH) break;
    for (const term of terms) {
      if (used.has(term)) continue;
      if (!text.startsWith(term, i)) continue;
      const before = text[i - 1];
      const after = text[i + term.length];
      if (before && HANGUL.test(before)) continue;
      if (
        after &&
        HANGUL.test(after) &&
        /^[A-Za-z0-9]+$/.test(term) &&
        !(opts?.particleAfterLatin && trailingIsParticle(text, i + term.length))
      )
        continue;
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(
        <b key={key++} style={{ fontWeight: 800, color: C.ink }}>
          {term}
        </b>,
      );
      used.add(term);
      inThisParagraph += 1;
      i += term.length;
      continue outer;
    }
    buf += text[i];
    i += 1;
  }
  // 상한에 걸려 중간에 멈췄으면 남은 글을 그대로 붙인다.
  if (i < text.length) buf += text.slice(i);
  if (buf) out.push(buf);
  return out;
}

/**
 * highlightTerms 에 넘길 낱말 목록을 다듬는다. **긴 것부터** 대야 "삼성전자"가
 * "삼성"에 먼저 걸리지 않는다. 한 글자는 뺀다 — 아무 데나 걸린다.
 */
export function termsFor(...groups: (string | null | undefined)[][]): string[] {
  return Array.from(new Set(groups.flat()))
    .filter((t): t is string => !!t && t.length >= 2)
    .sort((a, b) => b.length - a.length);
}

/**
 * 시트 머리 아래 **하이라이트 두 칸** — 표를 읽기 전에 "그래서 뭐가 제일 컸나"를
 * 먼저 답한다. 테마 로테이션·이슈 키워드가 국장·미장 양쪽에서 같은 얼개로 쓴다.
 *
 * name 과 value 를 나누는 이유: name 은 길이가 제각각이라 말줄임이 걸려야 하고
 * (`반도체 장비·소재`), value 는 절대 안 줄어야 한다(`▲13.5%p`). 한 문자열로 두면
 * 좁은 폭에서 수치부터 잘린다.
 *
 * divide 는 왼쪽 칸에만 준다 — 칸 사이 세로선이다. 폰(≤560)에서는 두 칸이 세로로
 * 서면서 globals.css 의 .hz-kd-duo 규칙이 이 선을 가로선으로 바꾼다.
 */
export function Highlight({ cap, name, value, valueColor, sub, divide }: {
  cap: string;
  name: string;
  value?: string;
  valueColor?: string;
  sub: string;
  divide?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        boxShadow: divide ? "inset -1px 0 0 var(--c-sheet-row)" : undefined,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>{cap}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
        <strong style={{ ...clip, fontSize: 16, fontWeight: 800, letterSpacing: "-.02em", color: C.ink }}>{name}</strong>
        {value && <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: valueColor, flexShrink: 0 }}>{value}</span>}
      </div>
      <span style={{ ...clip, fontSize: 11.5, color: C.sub }}>{sub}</span>
    </div>
  );
}

/**
 * 점유율 변동폭 배지(%p). 테마 로테이션·이슈 키워드가 국장·미장 네 자리에서 함께 쓴다.
 *
 * ⚠️ **문턱 아래를 빈칸으로 두지 않는다.** 0.05%p 미만은 소수 한 자리로 적으면 0.0%p 가
 * 되는데, 그렇다고 안 그리면 줄에 아무 표시도 없어 "왜 이 줄만 없지?"가 된다 — 국장
 * 테마 7~10위와 화제어 7·10위가 실제로 그렇게 보였다. 값이 작다는 것도 정보다.
 * 그래서 세 갈래로 적는다:
 *
 *   비교할 과거가 없다 →  —        (자료가 없다)
 *   0.05%p 미만        →  0.0%p    (화살표 없이 흐리게 — 움직이지 않았다)
 *   그 이상            →  ▲/▼N.N%p
 *
 * value 는 **이미 %p 로 환산된 값**이다. 화제어의 shareDelta 는 몫이라 호출부가 ×100 해서
 * 넘긴다 — 여기서 배율을 받으면 어느 쪽이 환산했는지가 흐려진다.
 */
export function DeltaPp({ value, style }: { value: number | null; style?: React.CSSProperties }) {
  const base: React.CSSProperties = { fontFamily: MONO, fontWeight: 700, flexShrink: 0, ...style };
  if (value === null) return <span style={{ ...base, color: C.sub2 }}>—</span>;
  if (Math.abs(value) < 0.05) return <span style={{ ...base, color: C.sub2 }}>0.0%p</span>;
  return (
    <span style={{ ...base, color: value > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)" }}>
      {value > 0 ? "▲" : "▼"}
      {Math.abs(value).toFixed(1)}%p
    </span>
  );
}

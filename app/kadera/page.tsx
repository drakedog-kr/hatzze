import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  getChannelRanking,
  getEcosystemSentiment,
  getIssueKeywords,
  getRisingChannels,
  getStockNarratives,
  getStockReport,
  getSurgingStocks,
  getTelegramSummary,
  getThemeRotation,
  getTopStocksWithTrend,
  getTrendingMessages,
  KADERA_WINDOW_DAYS,
} from "@/lib/telegram-data";
import type { ThemeRotation, TrendingMessage } from "@/lib/telegram-data";

import { formatKstUpdate } from "@/lib/format";

import { KADERA_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { AiMark, C, Icon, MONO, R } from "../ui";
import { ExpandableList } from "./ExpandableList";
import { Avatar, ChangeRate, DayBars, Pill, QuoteDate, RankBadge, RankDelta, SectionCaps, Sparkline, rankNum } from "./parts";
import { StockLogo } from "../StockLogo";
import { SectionHead } from "./SectionHead";
import { TrendingTabs } from "./TrendingTabs";

// 미리보기 이미지는 옆의 opengraph-image.tsx 가 그린다(ownImage). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "카더라 리포트 | hatzze",
    description: "주식 텔레그램 채널 수백 개를 대신 읽습니다. 오늘 가장 많이 언급된 종목과 가장 많이 퍼진 메시지를 매일 집계합니다.",
    path: "/kadera",
    ownImage: KADERA_CARD.alt,
  });
}

export const dynamic = "force-dynamic";

function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

/**
 * 요약 글에서 **그날의 주인공**을 굵게 집는다.
 *
 * 시장 브리핑의 '오늘의 브리핑'과 MDD 의 '이 하락의 맥락'은 문단을 JSX 로
 * 조립해서 지표명·핵심 수치에 <b> 를 직접 붙인다. 여기는 LLM 이 보낸 **통글**이라
 * 같은 방법을 못 쓴다 — 대신 화면에서 집는다.
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
 * "전자"가 떨어져 나온다.
 * ⚠️ 낱말 경계를 한글로는 못 가른다(\b 가 한글에 안 걸린다). 그렇다고 **뒤가 한글이면
 * 건너뛰기**로 막으면 안 된다 — 한국어는 조사가 명사에 바로 붙어서 "2차전지가",
 * "지주·밸류업과" 가 전부 걸러진다(실제로 반도체 하나만 굵어졌다). 뒤는 열어 두고,
 * 영문·숫자 낱말일 때만 뒤를 막는다("AI"가 "AI수요" 속에서 따로 굵어지는 것 방지).
 */
const HANGUL = /[\uAC00-\uD7A3]/;

const MAX_BOLD_PER_PARAGRAPH = 2;

function highlightTerms(text: string, terms: string[], used: Set<string>): React.ReactNode[] {
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
      if (after && HANGUL.test(after) && /^[A-Za-z0-9]+$/.test(term)) continue;
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

function formatKR(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, "")}만`;
  return n.toLocaleString("ko-KR");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(1, min)}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/** 그 종목의 MDD 정밀분석 주소. 이름은 MDD 페이지가 code 로 찾으므로 URL 엔 code·market
   만 실어 깔끔하게 둔다(코스닥은 market 으로 .KQ 심볼이 된다). */
function mddHref(code: string, market: string | null): string {
  return `/mdd?code=${code}${market ? `&market=${market}` : ""}`;
}

/** 셀 → 그 종목의 MDD 정밀분석으로 잇는 작은 링크. */
function MddLink({ code, market, label = "MDD 정밀분석" }: { code: string; market: string | null; label?: string }) {
  return (
    <Link href={mddHref(code, market)} className="hz-mdd-link">
      {label}
      <Icon name="arrow_outward" style={{ fontSize: 13 }} />
    </Link>
  );
}

/** 한 줄 말줄임 — 채널명·종목명처럼 셀을 밀어낼 수 있는 이름에 붙인다. */
const clip: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** 시트 안 열 머리·데이터 행이 공유하는 격자. 한 곳에서 내야 두 줄의 칸이 어긋나지 않는다. */
const KEYWORD_COLS = "26px minmax(80px,1fr) minmax(70px,1.5fr) 58px";

/**
 * 시트 두 장이 한 줄에 나란히 설 최소 폭.
 *
 * 320 이었는데, 그 값이면 창 1100(컨테이너 834)에서도 둘이 나란히 서서 시트 하나가
 * 409px 밖에 안 된다. 그 안에 5열을 넣으면 채널명 칸이 70~93px 로 눌려 최악 67% 가
 * 잘렸다(실측). 460 이면 둘이 서려면 컨테이너 936(창 ~1214) 이 필요해서, 그 아래에서는
 * 한 장씩 세로로 서고 시트가 컨테이너 폭을 통째로 쓴다.
 *
 * 데스크톱은 그대로다 — 창 1440 은 컨테이너 1164 라 936 을 넉넉히 넘긴다.
 */
/* ⚠️ min() 로 감싼다. 그냥 460 을 주면 **컨테이너가 그보다 좁을 때 시트가 안 줄어들어**
   부모를 넘치고, 위쪽 overflow:hidden 에 잘린다 — 360px 폰에서 이슈 키워드 시트가
   318px 칸 안에서 460px 로 버티며 오른쪽이 통째로 잘려 나갔다(#294 가 만든 회귀).
   min(460px, 100%) 면 넓을 땐 460 이 짝 기준으로 살아 있고, 좁을 땐 칸에 맞춰 접힌다. */
const SHEET_PAIR_MIN = "min(460px, 100%)";
/* 채널 표 두 벌(파워 랭킹·뜨는 채널)의 격자는 여기 없다 — globals.css 의 .hz-cols-ch /
   .hz-cols-rise 다. 폰에서 열을 접어야 하는데 인라인 style 은 미디어쿼리를 이겨서,
   여기 두면 @media 가 아무 일도 못 한다. 이유는 그 클래스 주석에 적어 뒀다. */

/* 테마 로테이션 한 줄의 세로 치수. 오른쪽 스파크라인의 밑선을 왼쪽 점유율 막대의
   밑선에 맞추려면 그 위에 무엇이 얼마나 쌓여 있는지 알아야 해서, 값을 흩어 두지 않고
   여기 모은다(한 곳만 고치면 정렬이 따라온다). */
const THEME_NAME_H = 20; // 테마명 줄(lineHeight 로 고정)
const THEME_BAR_TOP = 7; // 이름 줄 ↔ 막대 사이 여백
const THEME_BAR_H = 7; // 막대 두께
const SPARK_H = 26; // Sparkline 기본 높이와 같아야 한다
/** 스파크라인을 이만큼 내리면 밑선이 막대 밑선과 같아진다. */
const THEME_SPARK_TOP = THEME_NAME_H + THEME_BAR_TOP + THEME_BAR_H - SPARK_H;

/** 시트 안 '2분할 하이라이트'(테마 로테이션·이슈 키워드의 머리 아래 두 칸). */
function Highlight({ cap, name, value, valueColor, sub, divide }: {
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
 * 트렌딩 메시지 목록(말풍선 카드). 기간 탭이 세 벌을 미리 렌더해 넘기므로 목록
 * 마크업만 여기로 뽑아 재사용한다 — 조회는 서버에 그대로 남는다.
 *
 * 표가 아니라 말풍선인 이유: 원본이 텔레그램 메시지라 그 매체의 형태를 유지하면
 * "이건 우리가 센 수치가 아니라 누가 한 말"이라는 것이 형태만으로 읽힌다.
 */
function TrendingList({ items }: { items: TrendingMessage[] }) {
  const nodes = items.map((m, i) => {
    const tags = [...m.stocks, ...m.topics.map((t) => `#${t}`)];
    return (
      // hz-lift — 호버에 살짝 떠오르고(translateY −2) 테두리가 파랗게 든다. 패널이라
      // 이미 테두리가 있어 색만 바뀌면 되고, 트레이 여백 14 안에서 움직여 시트를 안 넘는다.
      // 레포가 이미 쓰던 클래스라 다른 카드와 감이 같다.
      <li key={`${m.channelHandle}-${m.messageId}`} className="hz-lift" style={{ display: "flex", padding: "16px 18px", gap: 12, minWidth: 0 }}>
        {/* 원문 메시지로 이동 — 텔레그램 공개 채널은 t.me/핸들/메시지ID 로 열린다 */}
        <a
          href={`https://t.me/${m.channelHandle}/${m.messageId}`}
          target="_blank"
          rel="noopener noreferrer"
          data-ga="kadera_message_click"
          data-ga-channel={m.channelHandle}
          style={{ display: "flex", gap: 12, minWidth: 0, width: "100%", textDecoration: "none" }}
        >
          <Avatar photoUrl={m.channelPhotoUrl} title={m.channelTitle} size={34} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ ...clip, fontSize: 12.5, fontWeight: 800, letterSpacing: "-.01em", color: "var(--c-cold-ink)", maxWidth: 220 }}>
                {m.channelTitle}
              </span>
              <span style={{ fontSize: 11, fontFamily: MONO, color: C.sub2 }}>{timeAgo(m.postedAt)}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 800, color: C.sub }}>#{i + 1}</span>
            </div>

            <div className="hz-bubble">
              {/* overflowWrap:anywhere 가 없으면 원문에 섞인 긴 URL 이 줄바꿈을 못 해
                  말풍선 밖으로 잘려 나간다(실제로 뉴스 링크가 통째로 잘려 있었다). */}
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: "var(--c-ink-soft)",
                  overflowWrap: "anywhere",
                  textWrap: "pretty",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {m.text}
              </p>
              {tags.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {tags.map((t) => (
                    // 말풍선 바탕(--c-soft) 위라 칩은 흰 판으로 띄운다 — 회색 칩을 쓰면
                    // 배경과 한 톤이라 태그가 말풍선에 녹아 안 보인다.
                    <span
                      key={t}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.label,
                        background: C.card,
                        borderRadius: 999,
                        padding: "3px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 2, fontSize: 11, fontFamily: MONO, fontWeight: 700, color: C.sub }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="visibility" style={{ fontSize: 14, color: C.faint }} />
                  {compact(m.views)}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="shortcut" style={{ fontSize: 14, color: C.faint }} />
                  {compact(m.forwards)}
                </span>
                {m.replies > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="chat_bubble" style={{ fontSize: 12, color: C.faint }} />
                    {m.replies}
                  </span>
                )}
              </div>
            </div>
          </div>
        </a>
      </li>
    );
  });

  return (
    <ExpandableList
      items={nodes}
      name="trending_messages"
      initial={6}
      step={10}
      listClassName="hz-panelgrid hz-panelgrid-auto"
      footerClassName="hz-sheet-foot-row"
    />
  );
}

/**
 * 트렌딩 메시지 — **이 시트 한 장만 나머지와 떼어 놓는다.**
 *
 * 페이지의 열두 갈래는 원래 `Promise.all` 하나로 묶여 있어서, 제일 늦는 갈래 하나가
 * 판 전체를 붙잡았다. 그 제일 늦는 갈래가 여기다 — 세 창(오늘·7일·30일)이 각각
 * `telegram_messages` 를 `views` 순으로 정렬해 상위 200건을 받는데, **그 열엔 인덱스가
 * 없어서**(migration_026 이 붙이는 것이 그것이다) 창이 넓을수록 표를 통째로 훑는다.
 * 2026-08-06 실측으로 이 한 쿼리가 같은 창·같은 200행인데 정렬 키만 인덱스 있는 것으로
 * 바꾸면 중앙값 244ms → 112ms 였고, 무엇보다 **최대치가 6,750ms → 129ms** 였다.
 * 꼬리가 길어서 평균이 아니라 최악이 화면을 정한다.
 *
 * 인덱스가 붙으면 이 갈래도 빨라지지만, 떼어 놓는 것은 그것과 별개로 남길 값이 있다 —
 * 갈래 하나가 느려질 때 **그 시트 한 장만 늦게 차고 나머지는 제때 뜬다.** 열두 갈래를
 * 한 덩어리로 묶어 두면 앞으로 어느 하나가 느려져도 매번 판 전체가 멈춘다.
 *
 * 왜 하필 여기만인가: 히어로의 굵은 낱말(summaryTerms)이 급부상·종목 리포트·테마·이슈
 * 키워드 넷을 한꺼번에 봐야 정해진다. 그 넷을 떼면 **맨 위가 제일 늦게 차는** 이상한
 * 순서가 된다. 트렌딩만 그 얽힘이 없다.
 */
async function TrendingSection() {
  // 기간 탭이 즉시 전환되도록 세 창을 한 번에 받아둔다(병렬이라 지연은 한 번 분).
  // 6건만 보여주고 '더 보기'로 10건씩 늘리므로, 세 번 펼칠 만큼(36) 미리 받아둔다.
  const [trendingToday, trending, trendingMonth] = await Promise.all([
    getTrendingMessages("today", 36),
    getTrendingMessages(7, 36),
    getTrendingMessages(30, 36),
  ]);
  return (
    <section className="hz-sheet">
      {/* 머리(SectionHead)는 TrendingTabs 안에서 그린다 — 기간 탭이 머리 우측에
          들어가고 목록은 그 아래라, 둘을 한 컴포넌트가 감싸야 상태를 공유한다. */}
      <TrendingTabs
        icon="campaign"
        title="트렌딩 메시지"
        desc="조회·공유로 가장 널리 퍼진 메시지"
        panels={[
          { key: "today", label: "오늘", count: trendingToday.length, node: <TrendingList items={trendingToday} /> },
          { key: "w1", label: "최근 7일", count: trending.length, node: <TrendingList items={trending} /> },
          { key: "m1", label: "최근 30일", count: trendingMonth.length, node: <TrendingList items={trendingMonth} /> },
        ]}
      />
    </section>
  );
}

/**
 * 위 시트가 차기 전의 자리표시자. 골격은 loading.tsx 의 시트와 같게 두되 **높이는
 * 실제 시트에 맞춘다**(머리 74 + 본문 745 + 바닥 39 = 858, 2026-08-06 실측).
 *
 * loading.tsx 는 이 칸을 300 으로 그려도 됐다 — 그 화면은 결과가 오면 통째로 교체되지
 * 시트별로 하나씩 차지 않기 때문이다. 여기는 반대로 **이 한 장만 나중에 찬다.**
 * 낮게 잡으면 트렌딩이 도착하는 순간 아래 채널 시트가 446px 밀린다.
 */
/* 실측으로 맞춘 값이다. 계산으로 745−40=705 를 넣었더니 시트가 846 이라 14px 짧았다 —
   자리표시자 머리(60)가 진짜 머리(74)보다 낮아서다. 그 차이를 본문에 얹었다. */
const TRENDING_SKELETON_BODY = 719;

function TrendingSkeleton() {
  const block = (h: number, w: number | string = "100%", r = 8) => (
    <div className="hz-shimmer" style={{ height: h, width: w, borderRadius: r, background: C.bg }} />
  );
  return (
    <section className="hz-sheet" aria-hidden>
      <div className="hz-sheet-head">
        {block(18, 18, 5)}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {block(13, 116, 5)}
          {block(11, 196, 5)}
        </div>
      </div>
      <div style={{ padding: "20px 22px" }}>{block(TRENDING_SKELETON_BODY)}</div>
      <div style={{ height: 39 }} />
    </section>
  );
}

export default async function KaderaPage() {
  // 종목 리포트는 "어느 종목인지"를 먼저 알아야 해서 getTopStocksWithTrend 에 매여 있다.
  // 그렇다고 이걸 await 한 **뒤에** 나머지를 시작하면, 나머지와 아무 상관 없는 그 왕복이
  // 페이지 앞에 통째로 붙는다(실측 240ms, 콜드 1,976ms). 독립적인 조회들은 지금 바로
  // 띄우고, 종목 리포트만 이 프로미스에 이어 붙인다 — 둘이 나란히 간다.
  // 4종목인 이유: 시트 안 2×2 격자라 넷이어야 줄이 찬다. 파이프라인은 상위 6종목까지
  // 흐름 요약을 만들므로(NARRATIVE_TOP_N) 넷째 칸에도 문단이 붙는다.
  const topStocksPromise = getTopStocksWithTrend(4);
  const reportsPromise = topStocksPromise.then((tops) =>
    Promise.all(tops.map((s) => getStockReport(s.code))),
  );
  const [
    summary,
    surging,
    channels,
    rising,
    themes,
    reports,
    sentiment,
    keywords,
    narratives,
  ] =
    await Promise.all([
      getTelegramSummary(),
      // 3×2 셀 격자라 여섯이어야 줄이 찬다(예전 카드 배치에선 다섯이었다).
      getSurgingStocks(6),
      getChannelRanking(),
      getRisingChannels(10),
      getThemeRotation(10),
      reportsPromise,
      getEcosystemSentiment(),
      getIssueKeywords(10),
      getStockNarratives(),
    ]);
  const stockReports = reports.filter((r): r is NonNullable<typeof r> => r !== null);

  /* 요약 글에서 굵게 집을 낱말. **오늘 화면이 이미 뽑아 둔 것**만 쓴다(highlightTerms
     주석 참고). 여기 없는 종목은 요약에 나와도 굵어지지 않는다 — 회자되는 것과
     지나가는 이름을 가르는 것이 이 목록의 일이다.
     긴 것부터 대야 "삼성전자"가 "삼성"에 먼저 걸리지 않는다. */
  const summaryTerms = Array.from(
    new Set([
      ...surging.map((x) => x.name),
      ...stockReports.map((x) => x.name),
      ...themes.slice(0, 4).map((x) => x.theme),
      ...keywords.slice(0, 5).map((x) => x.word),
    ]),
  )
    .filter((t) => t && t.length >= 2)
    .sort((a, b) => b.length - a.length);

  /* 채널을 세는 세 줄은 전부 **지금 수집 중인 채널**을 센다(getTelegramSummary 주석).
     목록에 있어도 peer 캐시가 없어 한 건도 안 걷히는 채널은 모니터링하고 있는 것이
     아니다. 화면에 덧붙이는 표시는 없다 — 숫자 자체가 사실이면 설명할 것이 없다. */
  const miniStats: { label: string; note?: string; value: string; unit: string; help?: string }[] = [
    { label: "모니터링 채널", value: `${summary.channelCount}`, unit: "개" },
    { label: "총 구독자", value: formatKR(summary.totalSubscribers).replace(/[만억]$/, ""), unit: formatKR(summary.totalSubscribers).slice(-1) },
    { label: "활성 채널", note: "7일", value: `${summary.activeChannels}`, unit: "개", help: "최근 7일 안에 메시지를 올린 채널입니다." },
    { label: "총 메시지", note: "7일", value: summary.messages7d.toLocaleString("ko-KR"), unit: "개" },
  ];

  // ── 테마 로테이션 ──────────────────────────────────────────────────
  // 표는 **점유율 순위 그대로**(themes 가 이미 그 순서다) 순위 번호를 달아 나열한다 —
  // 옆 이슈 키워드와 같은 골격이라 두 시트를 나란히 훑을 수 있다.
  // 막대는 **점유율**이다(변화폭이 아니다). 변화폭으로 그리면 1위 반도체(28%)가 +1.1%p
  // 라는 이유로 작은 막대가 되어, 순위표인데 순위가 그림에서 사라진다. 변화폭은 오른쪽
  // 값 칸이 부호·색으로 말한다(이슈 키워드의 ▲/▼ 횟수와 같은 자리).
  const delta = (t: ThemeRotation) => (t.shareDelta === null ? 0 : t.shareDelta);
  // 위 하이라이트 두 칸에 쓸 최대·최소. 표 순서와는 무관하므로 따로 고른다.
  const moved = themes.filter((t) => t.shareDelta !== null);
  const topIn = moved.length ? moved.reduce((a, b) => (delta(b) > delta(a) ? b : a)) : null;
  const topOut = moved.length ? moved.reduce((a, b) => (delta(b) < delta(a) ? b : a)) : null;

  const themeRow = (t: ThemeRotation, i: number, total: number) => {
    const d = delta(t);
    const ink = d > 0 ? "var(--c-hot-ink)" : d < 0 ? "var(--c-cold-ink)" : C.hint;
    return (
      <div
        key={t.theme}
        className="hz-theme-row-sheet"
        /* 표가 아니라 **쌓인 줄**이다(옛 디자인). 한 줄이 [이름 + 변화폭] / [점유율 막대] /
           [점유율·종목·횟수] 세 층이라, 열로 쪼갤 때보다 테마 하나가 한 덩어리로 읽힌다.
           오른쪽 스파크라인은 14일 추이라 여기서만 볼 수 있는 값이다. */
        /* 세로 패딩 9.35px — 줄 사이 간격은 위 줄의 아래 패딩과 아래 줄의 위 패딩을 더한
           값(11+11=22)이라, 그 22 를 15% 줄인 18.7 을 두 줄이 반씩 나눠 가진 것이다.
           가로 22 는 시트의 다른 표(.hz-trow)와 같은 값이라 건드리지 않는다. */
        /* 첫 칸 19px — 순위 숫자가 14px 이 되면서 두 자리("10")가 18.34px 을 먹는다
           (이 글꼴의 숫자는 폭이 고정이라 9.17 × 2). 17px 이던 예전 폭에 두면 10위만
           오른끝이 1.34px 삐져나와 아홉 줄과 안 맞는다. */
        style={{ display: "grid", gridTemplateColumns: "19px minmax(0,1fr) 62px", alignItems: "start", gap: 12, padding: "9.35px 22px" }}
        /* 마우스가 없어도(키보드·터치) 종목 목록을 열 수 있게 초점을 받는다.
           언급된 종목이 없는 테마는 열 것도 없으니 초점도 주지 않는다. */
        tabIndex={t.stocks.length ? 0 : undefined}
        aria-label={t.stocks.length ? `${t.theme} 테마를 이룬 종목 ${t.stockCount}개 보기` : undefined}
      >
        {/* 순위 숫자를 테마명과 같은 14px 로 세우고, 줄 상자도 테마명 줄과 같은
            THEME_NAME_H 로 준다. 글자 크기와 줄 높이가 둘 다 같으면 두 상자의 윗변이
            같은 자리에서 시작하는 것만으로 밑선이 저절로 맞는다(그리드가 alignItems:start
            라 윗변은 이미 같다) — 보정값이 필요 없다. 크기가 달랐을 땐 줄 상자 안에서
            글자가 앉는 깊이가 달라 paddingTop 으로 그 차를 걷어 내야 했다. */}
        <span style={{ ...rankNum, width: 19, fontSize: 14, lineHeight: `${THEME_NAME_H}px` }}>{t.rank}</span>
        <div style={{ minWidth: 0 }}>
          {/* 줄 높이를 못 박는다 — 오른쪽 스파크라인을 막대 밑선에 맞추려면(THEME_SPARK_TOP)
              이 줄이 몇 px 인지 확정돼야 한다. lineHeight 만으론 모자란다: 14·12·10px
              글자의 베이스라인을 맞추느라 줄이 1px 더 커진다. */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, height: THEME_NAME_H, lineHeight: `${THEME_NAME_H}px` }}>
            <span style={{ ...clip, fontWeight: 700, fontSize: 14, color: C.ink }}>{t.theme}</span>
            <RankDelta change={t.rankChange} />
            {t.shareDelta !== null && Math.abs(d) >= 0.1 && (
              <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ink }}>
                {d >= 0 ? "▲" : "▼"}
                {Math.abs(d).toFixed(1)}%p
              </span>
            )}
          </div>
          {/* 막대는 1위 대비 점유율. 절대 점유율을 폭으로 쓰면 1위 28%·10위 0.9% 라 아홉
              줄이 빈 트랙만 남아 순위가 눈에 안 들어온다. */}
          <div style={{ margin: `${THEME_BAR_TOP}px 0 5px`, height: THEME_BAR_H, background: C.track, borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(2, Math.min(100, (t.sharePct / Math.max(0.1, themes[0].sharePct)) * 100))}%`,
                height: "100%",
                borderRadius: 999,
                background: d > 0 ? "var(--c-warm-2)" : d < 0 ? "var(--c-blue-3)" : C.hint,
              }}
            />
          </div>
          <div style={{ ...clip, fontSize: 11.5, color: C.sub2 }}>
            점유율 <b style={{ color: C.sub, fontFamily: MONO }}>{t.sharePct.toFixed(1)}%</b> · 종목 {t.stockCount}개 ·{" "}
            <span style={{ fontFamily: MONO }}>{t.mentions}회</span>
          </div>
        </div>
        {/* 스파크라인은 위에서부터 그려지므로, 밑선을 왼쪽 막대의 밑선에 맞추려면 그만큼
            내려 앉혀야 한다. 기간은 툴팁으로만 밝힌다 — 이 줄의 다른 숫자(점유율·종목·회)는
            최근 3일 기준인데 이 그래프만 14일이라, 적어 두지 않으면 알 길이 없다. */}
        <span
          className="hz-tip hz-tip-wide hz-tip-end"
          data-tip={`최근 ${t.series.length}일 일별 점유율입니다.`}
          style={{ display: "block", marginTop: THEME_SPARK_TOP }}
        >
          <Sparkline data={t.series} />
        </span>

        {/* 이 테마의 점유율을 만든 종목 목록. 줄에 마우스를 올리거나 초점이 가면 열린다
            (CSS 만, globals.css 의 .hz-theme-pop). 아래쪽 줄은 위로 펼친다 — 아래로 열면
            시트를 벗어나 다음 섹션을 덮는다. */}
        {t.stocks.length > 0 && (
          <div className={`hz-theme-pop${i >= total - 4 ? " hz-theme-pop-up" : ""}`}>
            <div className="hz-theme-pop-head">최근 3일 언급 {t.stockCount}종목 · 주목도순</div>
            {t.stocks.map((s) => (
              <Link key={s.code} href={mddHref(s.code, s.market)} className="hz-theme-pop-item">
                <span className="hz-theme-pop-name">{s.name}</span>
                <span className="hz-theme-pop-cnt">{s.mentions}회</span>
                <span className="hz-theme-pop-go">
                  <Icon name="arrow_outward" style={{ fontSize: 13 }} />
                </span>
              </Link>
            ))}
            <div className="hz-theme-pop-foot">종목을 누르면 MDD 정밀분석이 열립니다.</div>
          </div>
        )}
      </div>
    );
  };

  // ── 채널 파워 랭킹 행 ──────────────────────────────────────────────
  const channelItems = channels.map((c, i) => (
    <li key={c.handle}>
      <a
        href={`https://t.me/${c.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="hz-trow hz-cols-ch"
        style={{ textDecoration: "none" }}
        data-ga="kadera_channel_click"
        data-ga-channel={c.handle}
        data-ga-surface="power_rank"
        data-ga-rank={i + 1}
      >
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.sub2 }}>{i + 1}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Avatar photoUrl={c.photoUrl} title={c.title} size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{c.title}</span>
            <span style={{ ...clip, fontSize: 11, fontFamily: MONO, color: C.sub2 }}>
              구독자 {c.subscriberCount ? compact(c.subscriberCount) : "-"}
              {/* 폰에서 접히는 조회율·순위 변동을 여기로 되살린다(.hz-ch-meta 는 기본 숨김).
                  값을 버리지 않으려는 것이다 — 폰에서 열을 접는 건 자리가 없어서지
                  그 숫자가 덜 중요해서가 아니다. 순위 변동은 색을 유지한다: 오르내림을
                  ▲▼ 모양 하나로만 두면 잿빛 캡션 안에서 눈에 안 걸린다. */}
              <span className="hz-ch-meta">
                {c.viewRate != null ? ` · 조회 ${c.viewRate.toFixed(1)}%` : ""}
                {c.rankChange ? (
                  <span style={{ color: c.rankChange > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)", fontWeight: 700 }}>
                    {` · ${c.rankChange > 0 ? "▲" : "▼"}${Math.abs(c.rankChange)}`}
                  </span>
                ) : null}
              </span>
            </span>
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.label, textAlign: "right" }}>
          {c.viewRate != null ? `${c.viewRate.toFixed(1)}%` : "—"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, textAlign: "right", color: c.rankChange ? (c.rankChange > 0 ? "var(--c-hot-ink)" : "var(--c-cold-ink)") : C.sub2 }}>
          {c.rankChange ? `${c.rankChange > 0 ? "▲" : "▼"}${Math.abs(c.rankChange)}` : "—"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.ink, textAlign: "right" }}>
          {c.influenceScore.toFixed(0)}
        </span>
      </a>
    </li>
  ));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── 히어로: 모니터링 25 · 센티먼트 25 · 오늘의 요약 50 ───────────── */}
      <section className="hz-sheet">
        <div className="hz-kd-hero">
          {/* ① 모니터링 현황 */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title">
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>모니터링 현황</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {miniStats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    // baseline 이 아니라 center 다. 라벨(11.5px)과 값(19px)은 줄 상자
                    // 높이가 17.25 : 28.5 로 달라서, 밑선을 맞추면 짧은 라벨이 줄 가운데보다
                    // 아래로 처진다(실측 1.2~2.4px). 게다가 그 처짐이 값에 무슨 글자가
                    // 들었느냐에 따라 흔들려서("42,552개"는 쉼표가 밑선 아래로 내려가 1.2px,
                    // 나머지는 2.3px) 네 줄의 라벨 높이가 서로 어긋나 보였다.
                    // 값이 늘 가장 높은 요소라 center 로 바꿔도 값의 자리는 그대로다
                    // (줄 안쪽 높이 28.5 도 그대로) — 라벨만 제자리를 찾는다.
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    // 첫 줄만 위 여백을 뺀다 — 제목 슬롯 아래 gap 16 이 이미 그 자리를 잡고
                    // 있어서, 여기에 11 을 또 주면 317 만 옆 칸 66% 보다 내려앉는다.
                    padding: i === 0 ? "0 0 11px" : "11px 0",
                    borderBottom: i === miniStats.length - 1 ? "none" : "1px solid var(--c-sheet-row)",
                  }}
                >
                  {/* wordBreak:keep-all — 이 칸은 25% 폭이라 좁은 구간에서 230px 까지
                      내려간다. 기본 규칙이면 "활성 채널"이 토막나 읽히지 않는다. */}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub, display: "inline-flex", alignItems: "baseline", gap: 4, minWidth: 0, wordBreak: "keep-all" }}>
                    {s.label}
                    {s.note && <span style={{ fontSize: 11, color: C.sub2 }}>{s.note}</span>}
                    {/* alignSelf:center — 이 줄은 라벨과 '7일'의 밑선을 맞추느라 baseline
                        정렬인데, 물음표까지 거기 딸려 가면 안 된다. 아이콘 글꼴은 글리프
                        밑변이 곧 밑선이라, 밑선에 맞추면 12px 상자가 글자보다 통째로
                        3.1px 떠오른다(실측). 글자와 눈높이를 맞추려면 상자를 줄 한가운데
                        세워야 한다 — 옆 칸 '제외 후 환산 ?' 이 쓰는 것과 같은 기준이다. */}
                    {s.help && (
                      <span className="hz-tip hz-tip-wide" data-tip={s.help} data-ga-tip={s.label} style={{ display: "inline-flex", alignSelf: "center", cursor: "help", flexShrink: 0 }}>
                        <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
                      </span>
                    )}
                  </span>
                  {/* 숫자는 절대 안 쪼갠다 — "46,189" 와 "개" 가 두 줄로 갈리면 수치가
                      아니라 오류처럼 보인다. */}
                  <strong style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, color: C.ink, letterSpacing: "-.03em", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {s.value}
                    {/* 단위는 숫자에서 떼어 놓는다. 부모의 letterSpacing −.03em 은 마지막
                        숫자와 이 글자 **사이**에도 걸려서, 아무것도 안 주면 "317개" 가
                        한 낱말처럼 붙어 버린다. 음수분을 되돌리는 값(≈0.6px)에 여백을
                        더해 3px. letterSpacing 을 normal 로 되돌리면 글자 **뒤**에도
                        붙어 오른끝 정렬이 어긋나므로 마진으로만 벌린다. */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.sub2, marginLeft: 3 }}>{s.unit}</span>
                  </strong>
                </div>
              ))}
            </div>
            {/* 통계 넷 바로 아래. marginTop:auto 로 칸 바닥에 붙인다 — 옆 '오늘의 요약'
                칸이 문단 길이만큼 늘어나면 이 칸도 같이 늘어나는데, 그때 남는 자리가
                통계 줄 사이가 아니라 버튼 위 한 곳에만 생긴다. */}
            <div style={{ marginTop: "auto", paddingTop: 14 }}>
              <a
                href="https://forms.gle/PRapNH9rz8YuF2zu9"
                target="_blank"
                rel="noopener noreferrer"
                className="hz-btn-soft"
                data-ga="cta_click"
                data-ga-cta="register_channel"
                data-ga-surface="channel_rank"
              >
                <Icon name="add_circle" style={{ fontSize: 15 }} />
                채널 등록 신청
              </a>
            </div>
          </div>

          {/* ② 생태계 센티먼트 */}
          <div className="hz-kd-hero-q">
            <div className="hz-kd-hero-title" style={{ justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>생태계 센티먼트</span>
              {sentiment && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: sentiment.tone === "hot" ? "var(--c-warm-2)" : sentiment.tone === "cold" ? "var(--c-blue-2)" : C.hint,
                    }}
                  />
                  {sentiment.label}
                </span>
              )}
            </div>
            {!sentiment ? (
              <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>아직 분석된 메시지가 없습니다.</p>
            ) : (
              <>
                {/* 이 칸이 답하는 건 "지금 분위기 좋아, 나빠?" 하나다. 그래서 숫자도 한 벌만
                    쓴다 — 낙관도(중립 제외) 하나로 말하고, 아래 막대는 그 비율을 그림으로
                    반복한다(숫자와 그림이 어긋날 수가 없다). 중립을 얼마나 뺐는지만 옆에. */}
                {/* alignItems:flex-start — 66% 의 **글자 윗선**을 옆 칸 317 의 윗선에 맞추려면
                    이 줄이 세로 가운데 정렬이면 안 된다(오른쪽 두 줄 캡션 높이에 따라 숫자가
                    위아래로 떠다닌다). */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <strong
                    style={{
                      fontFamily: MONO,
                      fontSize: 40,
                      fontWeight: 800,
                      /* 옆 칸 '317' 의 **숫자 윗선**에 맞춘 값이다. 줄 상자 위끝끼리 맞추면
                         안 된다 — 40px 과 19px 은 줄 상자 안에서 글자가 앉는 깊이가 달라서,
                         상자를 맞추면 정작 눈에 보이는 숫자 윗선이 7px 어긋난다.
                         브라우저에서 두 캡 윗선을 재서 남은 차이를 이 값으로 걷었다
                         (globals.css 의 .hz-kd-hero-title 주석과 한 세트).
                         ↳ 4 → 1. 이 숫자의 **밑선**이 오른쪽 캡션 끝줄('중립 N% 제외 후
                         환산')보다 3.1px 아래에 있었다. 줄 상자가 아니라 baseline 을 재서
                         걷은 값이다 — 40px 과 11.5px 은 상자 안에서 글자가 앉는 깊이가
                         달라 상자 밑끝을 맞추면 눈에 보이는 밑선이 어긋난다.
                         덤으로 317 과의 윗선 차이도 2.1 → 0.9 로 줄었다. */
                      lineHeight: 1,
                      marginTop: 1,
                      letterSpacing: "-.04em",
                      color: sentiment.tone === "cold" ? C.cold : sentiment.tone === "hot" ? C.hot : C.ink,
                    }}
                  >
                    {sentiment.score}
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em" }}>%</span>
                  </strong>
                  {/* 두 줄 캡션은 숫자 윗선이 아니라 숫자 덩어리 가운데에 오게 살짝 내린다. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, marginTop: 2 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.sub }}>
                      최근 {KADERA_WINDOW_DAYS}일 · {sentiment.messageCount.toLocaleString("ko-KR")}건 분석
                    </span>
                    {/* 툴팁은 문장이 아니라 물음표에 건다. 글 전체가 hz-tip 이면 마우스를
                        올리기 전엔 설명이 있다는 것 자체가 안 보이고(cursor 가 바뀌어야만
                        안다), 옆 '활성 채널 ?' 과도 규칙이 달라진다. 이 칸의 다른 설명들과
                        같이 물음표를 세워 두고 그 위에서만 연다. */}
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content" }}>
                      중립 {sentiment.neutral}% 제외 후 환산
                      <span
                        className="hz-tip hz-tip-wide"
                        data-tip="메시지를 비관/중립/낙관으로 나눈 뒤, 중립을 뺀 비관↔낙관 비율입니다. 시황·공시 같은 담담한 글이 절반이라, 같이 세면 늘 비관으로 기웁니다."
                        data-ga-tip="sentiment_ratio"
                        style={{ display: "inline-flex", cursor: "help", flexShrink: 0 }}
                      >
                        <Icon name="help" style={{ fontSize: 12, color: C.muted }} />
                      </span>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", height: 11, borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ width: `${100 - sentiment.score}%`, background: "var(--c-blue-2)" }} />
                    <span style={{ width: `${sentiment.score}%`, background: "var(--c-warm-2)" }} />
                  </div>
                  {/* 두 라벨을 막대의 양 끝에 붙여 어느 쪽이 어느 색인지 위치로 읽히게 한다. */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>
                    <span style={{ color: "var(--c-cold-ink)" }}>비관 {100 - sentiment.score}</span>
                    <span style={{ color: "var(--c-hot-ink)" }}>낙관 {sentiment.score}</span>
                  </div>
                </div>
                {/* marginTop:auto — 이 블록의 **밑선**을 옆 칸 '채널 등록 신청' 버튼의
                    밑선에 맞춘다. 두 칸은 같은 높이로 늘어나므로(flex), 둘 다 바닥에
                    붙이면 밑선이 정확히 같아진다. 남는 높이는 위 스플릿 막대와 이 블록
                    사이로 간다. */}
                {sentiment.byTheme.length > 0 && (
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9, paddingTop: 14, borderTop: "1px solid var(--c-sheet-row)" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: C.sub }}>인기 테마별 비관 ↔ 낙관</span>
                    {sentiment.byTheme.map((t) => (
                      <div
                        key={t.name}
                        className="hz-tip hz-tip-wide"
                        data-tip={`${t.name} 언급 ${t.total}건 중 비관 ${t.negative}건 · 낙관 ${t.positive}건 (중립 제외 비율)`}
                        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
                      >
                        {/* 이름 칸 폭을 고정한다 — flex 로 두면 테마명 길이에 따라 막대
                            시작점이 행마다 어긋나 눈이 세로로 훑질 못한다. */}
                        <span style={{ ...clip, width: 62, flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.label }}>{t.name}</span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", height: 7, borderRadius: 999, overflow: "hidden" }}>
                          <span style={{ width: `${100 - t.pos}%`, background: "var(--c-blue-3)" }} />
                          <span style={{ width: `${t.pos}%`, background: "var(--c-warm-3)" }} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ③ 오늘의 요약 */}
          <div className="hz-kd-hero-h">
            <div className="hz-kd-hero-title">
              {/* 시장 브리핑의 '오늘의 브리핑'과 같은 표식이다 — 옅은 하늘색 타일에 앉힌
                  ✨. 맨 아이콘으로 두면 누를 수 있는 것(= 생성형 AI 고지)으로 안 보인다.
                  타일이 22px 인 건 이 제목 슬롯이 22px 로 못박혀 있어서다(globals.css 의
                  .hz-kd-hero-title). 브리핑 쪽 26px 을 그대로 가져오면 슬롯을 넘겨,
                  세 칸의 주인공 숫자(317 · 66% · 문단)가 서로 다른 높이에 선다.
                  모서리도 26:9 비례를 지켜 7px. */}
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  background: "var(--c-blue-tint)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AiMark size={13} style={{ alignSelf: "center" }} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>오늘의 요약</span>
            </div>
            {/* 높이를 안 잡는다 — 글이 3줄이면 3줄, 4줄이면 4줄로 흐른다. 길이 자체는
                파이프라인이 잡는다(generate_telegram_narratives.py 의 BRIEF_*_LEN).
                여기서 다시 자르지 않는 이유는, 잘라 두면 그쪽이 망가졌을 때 화면이
                조용히 문장을 먹어 치우기 때문이다.

                파이프라인이 세 대목을 빈 줄로 이어 보낸다. 여기서 쪼개 문단을 만든다 —
                500자에 가까운 글을 한 덩어리로 두면 눈이 미끄러진다. 문단 사이는 10px 로,
                칸의 gap(16) 보다 좁게 잡았다. 같은 글 안의 문단 사이가 제목과 본문 사이보다
                벌어지면 세 문단이 별개의 블록으로 읽힌다.
                구분자가 없는 옛 데이터(한 덩어리)는 그대로 한 문단이 된다. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(() => {
                /* 굵힌 낱말을 **세 문단에 걸쳐** 기억한다. 문단마다 새로 세면 반도체가
                   2문단·3문단에서 각각 한 번씩 굵어져 화면에는 두 번으로 보인다. */
                const used = new Set<string>();
                return (sentiment?.summary ?? "오늘의 요약을 준비하고 있습니다.")
                  .split(/\n{2,}/)
                  .map((para, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--c-ink-soft)", textWrap: "pretty", wordBreak: "keep-all" }}>
                      {highlightTerms(para, summaryTerms, used)}
                    </p>
                  ));
              })()}
            </div>
            {/* 기준 시각은 **언제나 이 칸 맨 아래 왼쪽**이다 — 요약 글이 날마다 3줄·4줄로
                달라져도 자리가 안 흔들려야 "이 화면의 기준 시각"으로 읽힌다(시장 브리핑
                히어로가 쓰는 것과 같은 조판·같은 schedule 아이콘).
                formatKstUpdate 가 이미 "… 기준"으로 끝난다 — 또 붙이면 "기준 기준". */}
            {summary.lastUpdated && (
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 7, paddingTop: 10 }}>
                <Icon name="schedule" style={{ fontSize: 14, color: C.muted }} />
                <span style={{ fontSize: 11.5, color: C.sub }}>최종 업데이트 · {formatKstUpdate(summary.lastUpdated)}</span>
              </div>
            )}
          </div>
        </div>
        {/* 이 문장은 빼면 안 된다(공개 저장소·법률). 히어로 시트의 각주 띠에 두면 첫
            화면 안에 들면서도 그래픽을 밀어내지 않는다. */}
        <div className="hz-sheet-foot">
          <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub }}>
            한국 주식 텔레그램 채널들이 지금 무엇에 주목하는지를 모아 보여줍니다 · 조회·확산·언급량을 종합한 화제성 지표이며, 매수·매도 신호가 아닙니다
          </span>
        </div>
      </section>

      <SectionCaps label="최근 뜨는 것" count={3} />

      {/* ── 급부상 종목: 시트 안 3×2 셀 ─────────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="local_fire_department"
          title="급부상 종목"
          note="최근 3일 vs 평소"
          desc="평소보다 언급이 갑자기 뛴 종목 · 배수가 클수록 갑작스러운 관심"
        />
        {surging.length === 0 ? (
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>
            아직 급부상 신호가 뚜렷한 종목이 없습니다. 데이터가 쌓일수록 또렷해집니다.
          </p>
        ) : (
          <>
            <div className="hz-panelgrid hz-panelgrid-3">
              {surging.map((s, i) => {
                const values = s.series.slice(-7);
                const dates = s.seriesDates.slice(-7);
                return (
                  <div key={s.code} className="hz-panel-pad">
                    {/* baseline 정렬이어야 한다. flex-start 는 **상자 윗변**을 맞추는데,
                        이 줄엔 14px 종목명과 11px 코드·11.5px 표본이 섞여 있어 상자를 맞추면
                        정작 눈에 보이는 글자 밑선이 어긋난다(실측 3.8px). 순위 배지는 판이라
                        글자 밑선이 아니라 판의 광학 중심으로 읽히므로 같이 내려가도 된다. */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <RankBadge n={i + 1} />
                      {/* minWidth:0 — flex 항목의 기본 min-width:auto 가 살아 있으면 이름이
                          줄지 않아 말줄임이 안 걸리고 셀 밖으로 넘친다(820px 에서 실측 3px).
                          줄어도 되는 건 이름뿐이라 여기만 풀어 준다. */}
                      <strong style={{ ...clip, minWidth: 0, fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: C.ink }}>{s.name}</strong>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2, flexShrink: 0 }}>{s.code}</span>
                      <span style={{ flex: 1 }} />
                      {/* '몇 개 채널'과 '며칠에 몇 회'는 둘 다 이 배수의 표본 크기를 말한다 —
                          한 덩어리로 오른쪽 위에 모아 두면 아래 그래픽이 배수와 막대만 남는다.
                          ⚠️ '평소 N회'는 여기 없다. 배수는 언급 **횟수**가 아니라 그날 전체
                          대화에서 차지한 **몫(share)** 을 평활해 낸 값이라(getSurgingStocks),
                          횟수 둘을 나란히 두면 그 비가 배수와 안 맞아 눈금이 둘 생긴다. */}
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                        <span style={{ fontSize: 11.5, color: C.sub2, whiteSpace: "nowrap" }}>{s.channelCount}개 채널</span>
                        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: C.label, whiteSpace: "nowrap" }}>
                          최근 {s.recentDays}일 기준 {s.recentMentions}회
                        </span>
                      </span>
                    </div>

                    {/* 이 셀이 말하려는 건 시세가 아니라 이 배수다 — 30px 로 올려 주인공을 못박는다. */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                      <strong style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1, color: C.hot }}>
                        {s.ratio.toFixed(1)}
                        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em" }}>배</span>
                      </strong>
                      <span style={{ fontSize: 11.5, color: C.sub2 }}>평소 대비</span>
                      {s.isNew && <Pill tone="blue">신규 등장</Pill>}
                    </div>

                    <DayBars values={values} dates={dates} tone="warm" hot={Math.min(s.recentDays, values.length)} />

                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, paddingTop: 2, flexWrap: "wrap" }}>
                      {s.closePrice != null ? (
                        <>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.label, whiteSpace: "nowrap", flexShrink: 0 }}>
                            {s.closePrice.toLocaleString("ko-KR")}원
                          </span>
                          {/* 야후 실시간이 아니면(KRX 저장 종가 폴백) 등락률 대신 기준일을 단다.
                              폴백이면 등락률도 그날 것이라, 화살표를 그대로 두면 가격뿐 아니라
                              방향까지 뒤집혀 보인다(QuoteDate 주석). */}
                          {s.isLive ? (
                            <ChangeRate rate={s.changeRate} style={{ fontSize: 11.5, fontWeight: 800 }} />
                          ) : (
                            <QuoteDate date={s.priceDate} style={{ fontSize: 11.5 }} />
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 11.5, color: C.sub2 }}>가격 정보 준비 중</span>
                      )}
                      <span style={{ flex: 1 }} />
                      <MddLink code={s.code} market={s.market} label="MDD" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hz-sheet-foot">
              <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub }}>
                막대는 최근 7일 일별 언급량이고, 붉은 칸이 배수를 낸 최근 창입니다 · 배수는 언급 횟수가 아니라 그날 전체 대화에서 차지한 몫을 견준 값입니다
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── 테마 로테이션 · 이슈 키워드 (50:50) ──────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          <SectionHead
            icon="donut_small"
            title="테마 로테이션"
            note="3일 vs 이전"
            desc="관심이 어느 테마로 옮겨가는지 · 점유율 변화 기준"
            noteHelp="최근 3일 평균 점유율을 그 이전과 비교합니다. 하루치끼리 재면 표본 얇은 날에 크게 요동쳐서, 며칠씩 묶어서 봅니다."
          />
          {themes.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 집계된 테마가 없습니다.</p>
          ) : (
            <>
              <div className="hz-kd-duo" style={{ borderBottom: "1px solid var(--c-sheet-line)" }}>
                <Highlight
                  cap="가장 많이 유입"
                  name={topIn?.theme ?? "—"}
                  value={topIn ? `▲${Math.abs(delta(topIn)).toFixed(1)}%p` : undefined}
                  valueColor="var(--c-hot-ink)"
                  sub={topIn ? `점유율 ${topIn.sharePct.toFixed(1)}% · ${topIn.rank}위` : "관심이 새로 몰린 테마가 없습니다"}
                  divide
                />
                <Highlight
                  cap="가장 많이 이탈"
                  name={topOut?.theme ?? "—"}
                  value={topOut ? `▼${Math.abs(delta(topOut)).toFixed(1)}%p` : undefined}
                  valueColor="var(--c-cold-ink)"
                  sub={
                    topOut
                      ? topOut.rankChange
                        ? `순위도 ${Math.abs(topOut.rankChange)}계단 ${topOut.rankChange > 0 ? "상승" : "하락"}`
                        : `점유율 ${topOut.sharePct.toFixed(1)}% · ${topOut.rank}위`
                      : "관심이 빠져나간 테마가 없습니다"
                  }
                />
              </div>

              {/* 열 머리를 두지 않는다 — 줄이 표가 아니라 세 층으로 쌓인 덩어리라
                  가리킬 열이 없다(옆 이슈 키워드는 표라서 머리가 있다).
                  행을 상자로 감싸 남는 높이를 행들이 나눠 갖게 한다(justify-content 로
                  벌리면 줄 사이만 멀어져 덩어리가 흩어져 보인다). */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingBottom: 6 }}>
                {themes.map((t, i) => themeRow(t, i, themes.length))}
              </div>
            </>
          )}
        </section>

        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="tag" title="이슈 키워드" note="최근 7일" desc="종목명이 아닌 화제어 · 언급 횟수 기준" />
          {keywords.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 뽑을 화제어가 없습니다.</p>
          ) : (
            <>
              {(() => {
                const top = keywords[0];
                const totalTop = keywords.reduce((a, k) => a + k.count, 0);
                const sharePct = Math.round((top.count / Math.max(1, totalTop)) * 100);
                const second = keywords[1];
                return (
                  <div className="hz-kd-duo" style={{ borderBottom: "1px solid var(--c-sheet-line)" }}>
                    <Highlight
                      cap="이번 주 화제어 1위"
                      name={top.word}
                      value={`${top.count.toLocaleString("ko-KR")}회`}
                      valueColor="var(--c-hot-ink)"
                      sub={second ? `2위 ${second.word}의 ${(top.count / Math.max(1, second.count)).toFixed(1)}배` : "비교할 2위가 없습니다"}
                      divide
                    />
                    <Highlight
                      cap={`상위 ${keywords.length}개 중 비중`}
                      name={`${sharePct}%`}
                      sub={sharePct >= 30 ? "한 키워드에 관심이 쏠린 상태" : "관심이 여러 화제어에 흩어진 상태"}
                    />
                  </div>
                );
              })()}

              <div className="hz-thead" style={{ gridTemplateColumns: KEYWORD_COLS }}>
                <span>#</span>
                <span>키워드</span>
                <span>언급량</span>
                <span style={{ textAlign: "right" }}>횟수</span>
              </div>
              {/* 1위는 위 하이라이트가 맡았으므로 목록은 2위부터. 막대는 1위 대비라
                  정의상 한 줄도 100% 가 되지 않는다(1위가 목록에 없다).

                  행마다 flex:1 을 줘 남는 높이를 **행이 나눠 갖게** 한다. 이 시트는 9줄이고
                  짝인 테마 로테이션은 그룹 알약까지 12줄이라 늘 이쪽이 짧은데, 그냥 두면
                  마지막 줄과 각주 사이가 통째로 빈다. space-between 으로 벌리면 구분선이
                  서로 떨어져 표가 끊겨 보이므로, 줄 자체를 고르게 키운다(선은 붙어 있다). */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {keywords.slice(1).map((k, i) => (
                <div key={k.word} className="hz-trow" style={{ gridTemplateColumns: KEYWORD_COLS, flex: 1 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.sub2 }}>{i + 2}</span>
                  <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{k.word}</span>
                  <span style={{ height: 7, borderRadius: 999, background: C.track, overflow: "hidden" }}>
                    <span
                      style={{
                        display: "block",
                        width: `${(k.count / Math.max(1, keywords[0].count)) * 100}%`,
                        height: "100%",
                        // 길이는 7일 횟수, 색은 3일 점유율 방향 — 눈금이 둘이라 각주에 둘 다 적는다.
                        background: k.trend === "up" ? "var(--c-warm-2)" : k.trend === "down" ? "var(--c-blue-3)" : C.hint,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 800,
                      textAlign: "right",
                      color: k.trend === "up" ? "var(--c-hot-ink)" : k.trend === "down" ? "var(--c-cold-ink)" : C.sub,
                    }}
                  >
                    {k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : ""}
                    {k.count.toLocaleString("ko-KR")}
                    {/* 단위를 붙여 위 하이라이트("1,204회")와 같은 문법으로 읽히게 한다.
                        머리글이 '횟수'라 해도 이 숫자만 떼어 보면 무엇의 400 인지 모른다. */}
                    <span style={{ fontWeight: 700, color: C.sub2, marginLeft: 1 }}>회</span>
                  </span>
                </div>
              ))}
              </div>
              {/* ⚠️ "지난주보다 증가"라고 쓰면 거짓이다 — trend 는 주 대비도, 횟수 대비도
                  아니고 **최근 3일 점유율** 방향이다(getIssueKeywords 주석). 막대 길이와
                  색이 서로 다른 눈금이라는 것도 여기서 밝힌다. */}
              <div className="hz-sheet-foot" style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.sub }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: "var(--c-warm-2)" }} />
                    최근 3일 관심 점유율 증가
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.sub }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: "var(--c-blue-3)" }} />
                    감소
                  </span>
                </div>
                <span style={{ fontSize: 12, color: C.sub }}>막대 길이는 7일 언급 횟수 · 종목명·티커는 제외</span>
              </div>
            </>
          )}
        </section>
      </div>

      <SectionCaps label="무슨 얘기가 오갔나" count={2} />

      {/* ── 주요 종목 리포트: 시트 안 2×2 셀 ────────────────────────── */}
      <section className="hz-sheet">
        <SectionHead
          icon="query_stats"
          title="주요 종목 리포트"
          note={`최근 ${KADERA_WINDOW_DAYS}일 · 상위 ${Math.max(1, stockReports.length)}종목`}
          desc="가장 많이 회자된 종목의 언급 추이와 흐름"
        />
        {stockReports.length === 0 ? (
          <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 리포트를 만들 종목이 없습니다.</p>
        ) : (
          <div className="hz-panelgrid hz-panelgrid-2">
            {stockReports.map((r, i) => {
              const peak = Math.max(0, ...r.series.map((d) => d.mentions));
              /* ⚠️ 목업의 "▼30% 이전 3일" 배지는 넣지 않는다.
                 집계 창(scored, 최근 3일)의 일평균을 앞쪽 4일과 견주면 **주말이 낀 날은
                 전 종목이 일제히 ▼로 찍힌다.** 실제로 그랬다(2026-08-03 기준: 최근 창이
                 토·일·월이고 이전 창이 화~금이라 상위 4종목이 ▼75 · ▼66 · ▼67 · ▼34).
                 종목끼리의 차이가 아니라 요일을 재고 있는 셈이라 값어치가 없다.
                 급부상 배수가 share 기반인 것도 같은 이유고(getSurgingStocks 주석),
                 여기서 같은 보정을 하려면 그날 전체 대화량이 필요한데 StockReport 엔 없다.
                 추이는 아래 7일 막대와 AI 문장이 이미 말한다. */
              return (
                <div key={r.code} className="hz-panel-pad">
                  {/* 순위 배지가 아니라 **로고 + 종목명**이다. 이 시트는 순위표가 아니라
                      종목별 리포트라, 몇 등인지보다 어느 회사인지가 먼저 읽혀야 한다
                      (급부상 셀은 반대라 그쪽엔 배지가 남는다).
                      폰에서는 시세가 다음 줄로 내려간다(globals.css 의 .hz-stock-head) —
                      한 줄에 다 넣으면 시세 묶음이 nowrap 이라 안 줄고, 줄어들 수 있는 건
                      종목명뿐이라 이름이 먼저 0 으로 눌려 사라진다. */}
                  <div className="hz-stock-head" style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                    <StockLogo code={r.code} name={r.name} market={r.market} size={30} />
                    <strong style={{ ...clip, minWidth: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-.02em", color: C.ink }}>{r.name}</strong>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2, flexShrink: 0 }}>{r.code}</span>
                    {r.price != null && (
                      <span className="hz-stock-price" style={{ display: "flex", alignItems: "baseline", gap: 7, whiteSpace: "nowrap", flexShrink: 0 }}>
                        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
                          {r.price.toLocaleString("ko-KR")}원
                        </span>
                        <ChangeRate rate={r.changeRate} style={{ fontSize: 12.5, fontWeight: 800 }} />
                      </span>
                    )}
                  </div>

                  {/* hot = 큰 숫자(totalMentions)가 실제로 센 날 수. StockReport.series 의
                      scored 가 그 창을 표시해 둔다 — 창 밖 칸은 막대가 옅어진다. */}
                  <DayBars
                    values={r.series.map((d) => d.mentions)}
                    dates={r.series.map((d) => d.date)}
                    tone="cold"
                    hot={r.series.filter((d) => d.scored).length}
                    peakLabel={peak > 0 ? `최다 ${peak}회` : undefined}
                  />

                  {narratives[r.code] && (
                    <div style={{ display: "flex", gap: 9, background: C.soft, borderRadius: R.control, padding: "12px 13px" }}>
                      <AiMark size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--c-ink-soft)", textWrap: "pretty", wordBreak: "keep-all" }}>
                        {narratives[r.code]}
                      </p>
                    </div>
                  )}
                  {/* 표본 크기는 왼쪽 아래, MDD 링크는 오른쪽 아래. 한 줄에 마주 보게 두면
                      "이 리포트가 몇 건을 봤나"와 "더 파고들기"가 같은 높이에서 끝난다. */}
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingTop: 2 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.sub2, whiteSpace: "nowrap" }}>
                      언급 {r.totalMentions.toLocaleString("ko-KR")}회 · {r.channelCount}개 채널
                    </span>
                    <MddLink code={r.code} market={r.market} label="MDD 정밀분석" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 트렌딩 메시지 ────────────────────────────────────────────── */}
      {/* 이 한 장만 Suspense 로 떼어 놨다. 이유는 TrendingSection 주석에. */}
      <Suspense fallback={<TrendingSkeleton />}>
        <TrendingSection />
      </Suspense>

      <SectionCaps label="채널" count={2} />

      {/* ── 채널 파워 랭킹 · 뜨는 채널 (50:50) ───────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          <SectionHead icon="military_tech" title="채널 파워 랭킹" desc="조회율·확산력까지 반영한 채널 영향력" />
          {channels.length === 0 ? (
            <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 채널 점수가 없습니다.</p>
          ) : (
            <>
              <div className="hz-thead hz-cols-ch">
                <span>#</span>
                <span>채널</span>
                <span style={{ textAlign: "right" }}>조회율</span>
                {/* 며칠을 견주는지는 lib/telegram-data.ts 의 RANK_COMPARE_DAYS 와 맞춰야 한다. */}
                <span style={{ textAlign: "right" }}>순위 변동</span>
                <span
                  className="hz-tip hz-tip-wide hz-tip-end"
                  data-tip="조회율·포워드율·구독자 규모·게시 빈도를 합쳐 52~100으로 낸 점수입니다. 구독자만 많고 안 읽히는 채널은 낮게 나옵니다. ▲▼ 는 3일 전 순위와 견준 것입니다."
                  data-ga-tip="influence_score"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3, cursor: "help" }}
                >
                  영향력
                  <Icon name="help" style={{ fontSize: 12, color: C.hint }} />
                </span>
              </div>
              <ExpandableList
                items={channelItems}
                name="channel_rank"
                initial={10}
                step={10}
                listStyle={{ display: "block" }}
                footerClassName="hz-sheet-foot-row"
              />
              {/* 남는 높이를 먹던 빈 칸은 뺐다. 이 시트가 옆 시트 키에 맞춰 늘어나면
                  그 여백이 '더 보기' 띠 아래에 깔려 호버 배경이 시트 바닥에 못 닿았다
                  — 이제 띠 자신이 margin-top:auto 로 바닥에 붙는다(.hz-sheet-foot-row).
                  둘을 같이 두면 auto 마진이 둘이라 여백을 반씩 나눠 갖는다. */}
            </>
          )}
        </section>

        <section className="hz-sheet" style={{ flex: "1 1 calc(50% - 8px)", minWidth: SHEET_PAIR_MIN, display: "flex", flexDirection: "column" }}>
          {/* 기간 표기는 옆 시트와 "최근 7일"로 맞춘다. 구독자 스냅샷은 백필이 안 돼
              하루씩 쌓이므로 실제로 잰 구간이 그보다 짧은 날이 있다(getRisingChannels 의
              spanDays). 시트에 그 사정까지 적진 않는다. */}
          <SectionHead icon="rocket_launch" title="뜨는 채널" note="최근 7일" desc="최근 구독자가 많이 늘어난 채널" />
          {(() => {
            const real = rising.filter((r) => !r.isPlaceholder);
            const topDelta = Math.max(1, ...real.map((r) => Math.abs(r.delta7d)));
            if (real.length === 0) {
              return <p style={{ margin: 0, padding: "20px 22px", color: C.sub, fontSize: 13 }}>아직 구독자 변화를 잴 만큼 스냅샷이 쌓이지 않았습니다.</p>;
            }
            return (
              <>
                <div className="hz-thead hz-cols-rise">
                  <span>#</span>
                  <span>채널</span>
                  {/* 셋째 칸은 막대(1위 대비 상대 길이), 넷째 칸은 그 증감의 실수치다.
                      넷째를 '구독자'로 적어 두면 아래 ▲1,234 가 구독자 수로 읽힌다 —
                      구독자 총수는 채널명 아랫줄에 이미 있다. */}
                  <span>증가폭</span>
                  <span style={{ textAlign: "right" }}>7일 증감</span>
                </div>
                {real.map((r, i) => {
                  const row = (
                    <>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.sub2 }}>{i + 1}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <Avatar photoUrl={r.photoUrl} title={r.title} size={26} />
                        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                          <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: C.ink }}>{r.title}</span>
                          <span style={{ ...clip, fontSize: 11, fontFamily: MONO, color: C.sub2 }}>구독자 {compact(r.subscriberCount)}</span>
                        </span>
                      </span>
                      <span style={{ height: 7, borderRadius: 999, background: C.track, overflow: "hidden" }}>
                        <span
                          style={{
                            display: "block",
                            width: `${Math.max(2, (Math.abs(r.delta7d) / topDelta) * 100)}%`,
                            height: "100%",
                            background: r.delta7d >= 0 ? "var(--c-warm-2)" : "var(--c-blue-3)",
                          }}
                        />
                      </span>
                      {/* 정원을 채우느라 증감이 없거나 줄어든 채널까지 들어올 수 있어 부호를 그대로 쓴다 */}
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 800,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color: r.delta7d > 0 ? "var(--c-hot-ink)" : r.delta7d < 0 ? "var(--c-cold-ink)" : C.sub,
                        }}
                      >
                        {r.delta7d > 0 ? "▲" : r.delta7d < 0 ? "▼" : ""}
                        {Math.abs(r.delta7d).toLocaleString("ko-KR")}
                        {/* 단위를 붙인다 — 이 칸의 1,866 은 구독자 **수**이고, 바로 옆
                            채널명 아랫줄엔 총 구독자가 또 있어 둘이 헷갈리기 쉽다. */}
                        <span style={{ fontWeight: 700, color: C.sub2, marginLeft: 1 }}>명</span>
                      </span>
                    </>
                  );
                  return r.handle ? (
                    <a
                      key={`${r.handle}-${i}`}
                      href={`https://t.me/${r.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hz-trow hz-cols-rise"
                      style={{ textDecoration: "none" }}
                      data-ga="kadera_channel_click"
                      data-ga-channel={r.handle}
                      data-ga-surface="rising"
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={`${r.title}-${i}`} className="hz-trow hz-cols-rise">
                      {row}
                    </div>
                  );
                })}
                {/* 폰에서는 막대 열을 접으므로(.hz-cols-rise) 이 각주도 같이 접는다 —
                    화면에 없는 것을 설명하는 문장만 남으면 안 된다. */}
                <div className="hz-sheet-foot hz-rise-barnote" style={{ marginTop: "auto" }}>
                  <span style={{ fontSize: 12, color: C.sub }}>
                    막대는 1위({real[0] ? Math.abs(real[0].delta7d).toLocaleString("ko-KR") : "-"}명) 기준 상대 증가폭입니다
                  </span>
                </div>
              </>
            );
          })()}
        </section>
      </div>
    </div>
  );
}

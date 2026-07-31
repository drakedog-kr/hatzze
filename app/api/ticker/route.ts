import { NextResponse } from "next/server";

import { C } from "@/app/ui";
import {
  KADERA_WINDOW_DAYS,
  getEcosystemSentiment,
  getIssueKeywords,
  getSurgingStocks,
  getTopStocksWithTrend,
} from "@/lib/telegram-data";

// 탑바 티커에 실을 값. 전부 우리가 만든 데이터다(카더라 집계).
//
// 예전엔 야후 파이낸스 시세 6종과 업비트 비트코인이었다. 걷어낸 이유는 둘이다.
//
//   ① 약관. 야후는 자동 수집·상업적 이용·"경쟁하거나 실질적 대체물이 되는 데이터피드"
//      생성을 모두 금지한다(ToS §2(e)(i)). 이 라우트는 야후 시세를 받아 우리 도메인에서
//      최종 이용자에게 10분 캐시로 다시 내보내던 것이라 정확히 그 데이터피드였다.
//      업비트도 같다 — 시세 데이터는 "회원 본인의 개인적 이용 목적"에 한정되고
//      재배포·가공이 금지돼 있다. 무료로 쓸 수 있는 실시간 시세 소스는 사실상 전부
//      같은 제한이 걸려 있어, 소스를 갈아끼우는 것으로는 풀리지 않는다.
//
//   ② 시세 티커는 어디에나 있다. 네이버 금융에도 증권사 앱에도 있어서, 화면 맨 위 줄을
//      그걸로 채우면 정작 여기서만 볼 수 있는 것은 스크롤을 내려야 나온다.
//
// 그래서 남의 데이터를 빌려오는 대신 우리 것을 올린다. 약관 걱정이 사라지고, 티커가
// 곧 이 사이트가 무엇을 하는 곳인지에 대한 한 줄 요약이 된다.
//
// 햇쩨 지수(온도)는 여기 없다 — 레이아웃이 이미 서버에서 들고 있어 탑바가 prop 으로
// 바로 그린다(AppShell 의 TopBar 참고). 여기로 옮기면 첫 화면에 "—" 가 한 번 스쳤다가
// 채워진다.
export const dynamic = "force-dynamic";

type Quote = { key: string; label: string; value: string; change: number | null; color?: string };

export async function GET() {
  // 넷 중 하나가 넘어져도 나머지는 띄운다. 티커는 곁다리라 여기서 던지면 탑바가 통째로
  // 빈 채 남는다.
  const [surging, top, sentiment, keywords] = await Promise.all([
    // withQuotes:false — 여기선 종목명과 배수만 쓴다. 켜 두면 종목마다 야후 시세를 한 번씩
    // 부르는데, 야후를 걷어내려고 만든 라우트가 야후를 기다리게 된다.
    getSurgingStocks(2, { withQuotes: false }).catch(() => []),
    getTopStocksWithTrend(1).catch(() => []),
    getEcosystemSentiment().catch(() => null),
    getIssueKeywords(3).catch(() => []),
  ]);

  const quotes: Quote[] = [];

  // 급부상 — 배수(▲3.1배)로 적는다. 카더라 카드가 쓰는 단위와 같아야 한다(그쪽은
  // "언급 ▲ 3.1배"). 퍼센트로 바꿔 적으면 같은 숫자가 두 화면에서 다른 말이 된다.
  // 신규 등장은 비교할 과거가 없어 배수 자리에 "신규" 를 넣는다(카드와 같은 어법).
  if (surging.length) {
    quotes.push({
      key: "surging",
      label: "급부상",
      value: surging
        .map((s) => (s.isNew ? `${s.name} 신규` : `${s.name} ▲${s.ratio.toFixed(1)}배`))
        .join(" · "),
      change: null,
    });
  }

  // 주목도 1위 — 카더라 '주요 종목 리포트'와 **같은 함수·같은 창**에서 뽑는다. 두 화면이
  // 서로 다른 종목을 1위로 부르면 안 된다.
  // "최다 언급"이라 안 적는 이유: 이 순위는 언급 수가 아니라 채널 영향력을 반영한
  // weighted_score 기준이라, 언급만 많고 얇은 채널에서만 돈 종목은 위로 안 온다.
  // 옆에 붙는 회수는 그 종목의 실제 언급 수라 라벨과 어긋나지 않는다.
  if (top.length) {
    quotes.push({
      key: "top-stock",
      label: `주목도 1위 ${KADERA_WINDOW_DAYS}일`,
      value: `${top[0].name} ${top[0].mentions.toLocaleString("ko-KR")}회`,
      change: null,
    });
  }

  // 생태계 센티먼트 — score 는 **중립을 뺀** 비관↔낙관 비율(낙관도)이다. 카더라 카드의
  // 헤드라인 숫자와 같은 값·같은 말(낙관)을 쓴다. 전체 대비 '긍정 비율'(sentiment.positive)
  // 을 쓰면 안 된다 — 중립이 절반쯤이라 구조적으로 낮게 나오고, 예전에 한 카드 안에서
  // '낙관'이 두 숫자로 갈렸던 바로 그 사고가 이번엔 두 화면 사이에서 난다.
  if (sentiment) {
    quotes.push({
      key: "sentiment",
      label: "생태계 센티먼트",
      value: `낙관 ${sentiment.score}%`,
      change: null,
      color: sentiment.tone === "hot" ? C.hot : sentiment.tone === "cold" ? C.cold : C.ink,
    });
  }

  // 이슈 키워드 — 종목명이 아닌 화제어. 건수는 뺀다(셋을 나열하는데 각각에 회수까지
  // 붙이면 티커 한 칸이 화면 폭을 넘는다).
  if (keywords.length) {
    quotes.push({
      key: "keywords",
      label: "이슈 키워드",
      value: keywords.map((k) => k.word).join(" · "),
      change: null,
    });
  }

  // 파이프라인이 하루 못 돌면 여기가 통째로 빌 수 있다. 그때는 캐시를 짧게 물려, 복구된
  // 뒤에도 빈 티커가 10분씩 더 남지 않게 한다(예전 야후 폴백에서 쓰던 판단과 같다).
  const cache = quotes.length
    ? "public, s-maxage=600, stale-while-revalidate=300"
    : "public, s-maxage=60, stale-while-revalidate=60";

  return NextResponse.json({ quotes, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": cache } });
}

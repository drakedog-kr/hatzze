/**
 * 내부자 리포트의 **전체보기 페이지 명단** — 카드 여섯 장과 1:1 이다.
 *
 * 메인 화면(`/insider`)의 카드는 다섯 줄만 보여주고, 바닥의 '전체보기'가 여기로 온다.
 * 그 자리에서 늘리지 않는 이유는 목록이 너무 길어서다 — 임원 93 · 의원 321 ·
 * 거물 보유 1,454종목이고, 안 보이는 줄도 클라이언트로 전송된다.
 *
 * ## ⚠️ 이 파일에 JSX 를 넣지 말 것
 *
 * 사이드바(`app/AppShell.tsx`)가 이걸 읽어 페이지 제목을 만든다. AppShell 은
 * 클라이언트 컴포넌트라, 여기에 화면 부품이 섞이면 그게 통째로 클라이언트 번들을 탄다.
 * 줄을 그리는 쪽은 `app/insider/parts.tsx` 다.
 *
 * ## ⚠️ 문구는 카드와 **같은 말**이어야 한다
 *
 * 전체보기는 "이 카드의 나머지"다. 제목이나 설명이 갈리면 독자가 다른 자료로 읽는다.
 * 카드의 `noteHelp` 를 여기 `help` 가 그대로 받고, 카드 제목을 `title` 이 받는다.
 */
export type InsiderListSlug = "exec" | "congress" | "adds" | "trims" | "hot" | "holders" | "managers" | "analyst";

export type InsiderListSpec = {
  /** 페이지 h1 . 카드 제목과 같다. */
  title: string;
  /** 제목 아래 한 줄. 카드의 desc 와 같다. */
  sub: string;
  /** 알약 물음표의 툴팁. 카드의 noteHelp 와 같다. */
  help: string;
  /** 목록 아이콘. 카드의 것과 같다. */
  icon: string;
};

export const INSIDER_LIST_SLUGS: InsiderListSlug[] = ["exec", "congress", "adds", "trims", "hot", "holders", "managers", "analyst"];

export const INSIDER_LISTS: Record<InsiderListSlug, InsiderListSpec> = {
  exec: {
    title: "임원이 신고한 매매",
    sub: "종목으로 묶어 금액이 큰 순입니다. 장내 매수는 파랗게 적었습니다.",
    help: "옵션 행사에 딸린 매도가 섞입니다. 금액은 처분만 더한 값입니다.",
    icon: "account_balance_wallet",
  },
  congress: {
    title: "미 하원의원이 사고판 것",
    sub: "카더라 밖 종목까지 보고, 여러 의원이 건드린 순입니다.",
    help: "금액은 구간으로만 신고돼 건수로 적었습니다. 신고까지 최대 45일 걸립니다.",
    icon: "account_balance",
  },
  adds: {
    title: "월가 거물이 늘린 종목",
    sub: "새로 담았거나 주식 수를 늘린 곳입니다.",
    help: "분기말 두 시점의 차이입니다. 중간에 샀다 판 것은 안 보입니다.",
    icon: "trending_up",
  },
  trims: {
    title: "월가 거물이 줄인 종목",
    sub: "주식 수를 줄였거나 전량 정리한 곳입니다.",
    help: "분기말 두 시점의 차이입니다. 중간에 샀다 판 것은 안 보입니다.",
    icon: "trending_down",
  },
  hot: {
    title: "채팅방이 뜨거운 종목",
    sub: "주식 텔레그램에서 가장 많이 회자된 미국 종목입니다.",
    help: "언급은 하루치, 임원 신고는 최근 7일입니다. 시점이 다릅니다.",
    icon: "local_fire_department",
  },
  managers: {
    title: "운용자산이 큰 순",
    sub: "이름을 누르면 그 사람이 무엇을 들고 있는지 봅니다.",
    help: "13F가 신고하는 미국 상장주만 셉니다. 채권·현금·해외 주식은 빠집니다.",
    icon: "groups",
  },
  analyst: {
    title: "증권가가 긍정적으로 보는 종목",
    sub: "등급을 낸 애널리스트가 10명 이상인 종목만 세웁니다.",
    help: "stockanalysis.com이 싣는 S&P Global 집계입니다. 적극 매수를 낸 애널리스트가 많은 순입니다.",
    icon: "reviews",
  },
  holders: {
    title: "월가 거물이 들고 있는 종목",
    sub: "카더라에 오른 종목을 거물 몇 명이 들고 있는지 봅니다.",
    help: "13F는 분기말 기준이라 지금과 다를 수 있습니다.",
    icon: "groups",
  },
};

export const insiderListHref = (slug: InsiderListSlug) => `/insider/list/${slug}`;

/**
 * 전체보기 한 장에 그리는 최대 줄 수.
 *
 * ⚠️⚠️ **잘렸으면 반드시 화면에 적어야 한다.** "전체보기"라 적어 놓고 604개 중 100개만
 * 내면 그건 거짓말이다. 알약이 "604개 중 100개"로 적고, 툴팁이 왜 잘랐는지 말한다.
 *
 * 왜 100인가: 안 보이는 줄도 전송된다. 거물이 줄인 종목이 604개인데 전부 실으면
 * 페이지가 그만큼 무거워지고, 100줄 아래까지 훑어 내려가는 독자도 사실상 없다.
 */
export const INSIDER_LIST_MAX = 100;

import type { IconName } from "@/lib/icon-names";
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
  /**
   * 셈법 한 마디 — 전체보기 머리 근거에 그대로 적는다('618개 중 100개 · 직전 분기말 대비'). 물음표 말풍선이었다가
   * 보이게 했다("헬프 툴팁이 필요하면 심플하지 않다", 2026-10-04). 빈 글자면 안 적는다.
   */
  note: string;
  /** 목록 아이콘. 카드의 것과 같다. */
  icon: IconName;
};

export const INSIDER_LIST_SLUGS: InsiderListSlug[] = ["exec", "congress", "adds", "trims", "hot", "holders", "managers", "analyst"];

export const INSIDER_LISTS: Record<InsiderListSlug, InsiderListSpec> = {
  exec: {
    title: "임원이 신고한 매매",
    sub: "종목으로 묶어 금액이 큰 순입니다.",
    note: "옵션 행사 매도 포함",
    icon: "account_balance_wallet",
  },
  congress: {
    title: "미 하원의원이 사고판 것",
    sub: "카더라 밖 종목까지 보고, 여러 의원이 건드린 순입니다.",
    note: "신고 건수",
    icon: "account_balance",
  },
  adds: {
    title: "월가 거물이 늘린 종목",
    sub: "새로 담았거나 주식 수를 늘린 곳입니다.",
    note: "직전 분기말 대비",
    icon: "trending_up",
  },
  trims: {
    title: "월가 거물이 줄인 종목",
    sub: "주식 수를 줄였거나 전량 정리한 곳입니다.",
    note: "직전 분기말 대비",
    icon: "trending_down",
  },
  hot: {
    title: "커뮤니티에서 뜨거운 종목",
    sub: "주식 텔레그램에서 가장 많이 회자된 미국 종목입니다.",
    note: "언급 하루 · 임원 7일",
    icon: "local_fire_department",
  },
  managers: {
    // '운용자산이 큰 순'이었다 — 값은 13F 신고 합계(미국 상장주만)라 운용자산이 아니고, 그 단서를 물음표에 숨겨 두었다.
    // 제목이 글자 그대로의 뜻을 말하게 바꿨다(2026-10-04 "헬프 툴팁이 필요하면 심플하지 않다").
    title: "미국 주식을 많이 든 거물",
    sub: "이름을 누르면 그 사람이 무엇을 들고 있는지 봅니다.",
    note: "",
    icon: "groups",
  },
  analyst: {
    title: "증권가가 긍정적으로 보는 종목",
    sub: "등급을 낸 애널리스트가 10명 이상인 종목만 세웁니다.",
    // 출처는 투자 유의사항(/disclaimer) 한 곳에만 적는다(2026-10-02 결정).
    note: "",
    icon: "reviews",
  },
  holders: {
    title: "월가 거물이 들고 있는 종목",
    sub: "카더라에 오른 종목을 거물 몇 명이 들고 있는지 봅니다.",
    note: "분기말 기준",
    // ⚠️ groups 였다. 같은 화면의 `managers`("운용자산이 큰 순")가 이미 그 그림을 쓰고 있어
    //    한 화면에 같은 아이콘이 둘이었다. groups 는 사람 명단인 managers 쪽이 갖는 것이 맞다 —
    //    이 카드의 주어는 사람이 아니라 **종목**이고, 묻는 것은 "그 종목을 들고 있나"다.
    icon: "inventory_2",
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

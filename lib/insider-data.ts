/**
 * 내부자 리포트(`/insider`) 데이터층.
 *
 * 이 화면의 주어는 **공시가 아니라 카더라**다. 행의 왼쪽 끝이 언급량이고 공시가 그
 * 오른쪽에 붙는다. 순서가 뒤집히면 미국 공시를 늦게 옮겨 적는 화면이 된다.
 *
 * 읽는 표:
 *   telegram_us_stock_daily  날짜 × 티커 언급 (migration_033)
 *   us_stocks                티커 ↔ 한글 표기
 *   us_insider_daily         창 × 티커 공시 집계 (migration_045)
 *   us_insider_txn           거래 한 건 (migration_045)
 *   us_manager               추적하는 거물 62명 (migration_046)
 *   us_manager_holding       그 62명의 보유 **전부** (migration_046 · 필터는 051 에서 뗐다)
 *   us_congress_trade        미 하원의원 주식 매매 신고 (migration_047)
 *
 * ⛔ **채팅방 밖까지 훑던 발굴 축은 없다.** "채팅방 밖에서 임원이 산 종목" 카드를
 *    2026-08-21 에 뺐고, 그걸 받치던 표(us_market_buy)와 수집기도 2026-08-25 에
 *    지웠다 — 읽는 곳이 없는 표가 남아 있으면 다음 사람이 "이건 어디서 왔나"를 다시 판다.
 *    ⭐ 되살릴 근거는 실측으로 남아 있다: 하루치 Form 4 전수(2,056건)에서 장내 매수는
 *      221건·54종목인데 **그중 카더라에 오른 종목이 0건**이었다(카더라 종목의 매수 비율
 *      0.7% vs 시장 전체 17%). 의미 있는 임원 매수는 거의 전부 우리 코퍼스 밖에 있다.
 *
 * ## ⚠️ 두 축의 기준일이 다르다
 *
 * 카더라 언급은 **어제까지**의 하루치이고, 공시는 **7일 창**이다. 게다가 공시는
 * 거래일에서 접수까지 0~4일 걸린다. 한 행에 나란히 놓이지만 같은 시점이 아니다.
 * 그래서 두 날짜를 각각 돌려주고, 화면이 표 **위에** 적는다. 표를 읽고 난 뒤에
 * "사실 며칠 전 값입니다"를 만나면 이미 잘못 읽은 뒤다.
 *
 * ## ⚠️ buys 가 0 인 날이 정상이다
 *
 * 장내 매수(P)는 우리 종목에서 1% 안팎이다(실측). 대형 기술주라 임원이 자기 돈으로
 * 사는 일이 드물다. 0 이라고 카드를 숨기면 안 된다 — 그 드묾 자체가 이 화면의 정보다.
 */
import { cache } from "react";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getUsdKrw } from "@/lib/seohak-external";
import { fetchAllRows } from "@/lib/telegram-data";
import { usQuotes } from "@/lib/us-telegram-data";
import { displayName } from "@/lib/us-ticker-names";

/**
 * 공시 집계 창. 파이프라인(fetch_us_insider.py 의 WINDOW_DAYS)과 **반드시 같아야 한다.**
 * 한쪽만 고치면 화면이 파이프라인이 안 만든 창을 조회해 통째로 빈다.
 *
 * ⭐ 2026-08-20 에 7 → 90 으로 늘렸다. 히어로가 "기업 임원 N명"을 규모로 내세우는데
 *   창이 짧으면 그 수가 작게 잡힌다(실측: 7일 243명 · 14일 426명 · 30일 557명).
 */
export const INSIDER_WINDOW_DAYS = 90;

/**
 * 소식을 볼 짧은 창. 히어로의 "오늘의 업데이트"와 블록 다섯이 이걸 쓴다.
 *
 * ⭐ 규모와 소식은 **다른 창이라야 한다.** 하나로 두면 둘 중 하나가 거짓말한다 —
 * 90일 하나만 쓰던 동안 "임원이 자기 돈으로 산 것" 블록이 3개월치 목록이 됐고,
 * "오늘의 업데이트"에 90일 누적이 실렸다.
 *
 * ⚠️ 파이프라인(fetch_us_insider.py 의 RECENT_DAYS)과 반드시 같아야 한다.
 */
export const INSIDER_RECENT_DAYS = 7;

/**
 * 의원 신고를 볼 창.
 *
 * ⚠️ 임원(7일)보다 훨씬 길다. STOCK Act 은 거래 인지 후 30일, 늦어도 45일 안에 신고하게
 * 돼 있어서 7일 창으로 보면 대부분의 날에 0 이 뜬다. 제도가 만든 지연이라 창으로 덮는다.
 */
export const CONGRESS_WINDOW_DAYS = 90;

/**
 * 시세를 받아 올 행 수. 표가 펴는 행 수(app/insider/page.tsx 의 VISIBLE_ROWS)와 맞춘다.
 * ⚠️ 한쪽만 늘리면 표 아래쪽 행의 가격이 통째로 빈칸이 된다.
 */
export const QUOTE_ROWS = 20;

export type InsiderRow = {
  ticker: string;
  name: string;
  /** 카더라 언급 수(기준일 하루치). 이 화면의 정렬 기본값이다. */
  mentions: number;
  channels: number;
  filings: number;
  txns: number;
  buys: number;
  sells: number;
  options: number;
  others: number;
  people: number;
  latestFiled: string | null;
  /** 이 종목을 가진 거물 수(30명 중). ⚠️ 0 이 흔하다 — 36종목은 아무도 안 들고 있다. */
  holders: number;
  /** 화면에 이름으로 적을 사람들. 평가금액이 큰 순으로 앞 둘만 쓴다. */
  holderNames: string[];
  /** 창 안에 이 종목을 신고한 의원 매수·매도 건수. ⚠️ 신고는 최대 45일 늦다. */
  congressBuys: number;
  congressSells: number;
  /** 신고한 의원 수(사람 기준). 같은 사람이 여러 건 낸 것과 여럿이 움직인 것은 뜻이 다르다. */
  congressMembers: number;
  /** 가장 최근 신고의 실제 매매일. */
  congressLatest: string | null;
  /** 신고한 의원 이름. 건수가 많은 순이고, 화면은 앞 하나만 쓰고 나머지는 "외 N명"으로 적는다. */
  congressNames: string[];
  /** 야후 현재가. 못 받으면 null 이다 — 틀린 숫자보다 빈칸이 낫다. */
  price: number | null;
  /** 전일 종가 대비 등락률(%). */
  changeRate: number | null;
};

/**
 * 임원 신고를 **종목 하나로 묶은** 줄. 카드가 이걸 다섯 개 그린다.
 *
 * ## ⚠️ 왜 묶는가
 *
 * 신고 한 건씩 금액순으로 세웠더니 **다섯 줄 중 넷이 루멘텀**이었다. 임원 넷이 같은
 * 날 세금 원천징수를 신고했기 때문이다. 한 회사가 카드를 통째로 먹는다.
 *
 * ## ⚠️⚠️ 취득과 처분을 절대 한 숫자로 합치지 않는다
 *
 * 같은 주식이 **세 줄로 신고된다** — 옵션 행사(M) → 세금 원천징수(F) → 장내 매도(S).
 * 전부 더하면 같은 주식을 두세 번 센다. 실측(7일 창)으로 93종목 중 **49개(53%)가
 * 취득·처분을 함께 신고**했고, 다 더하면 제너럴다이내믹스가 "매수 0 · 매도 0"인데
 * $34.2M 으로 2위에 올랐다(전부 행사와 세금이라 장내에서 오간 게 없는데도).
 *
 * 그래서 **처분(D)만 더한다.** 취득 쪽은 대부분 보상 제도에 딸린 기계적 흐름이라
 * 금액으로 내세우면 매매처럼 읽힌다.
 *
 * ## ⚠️ 다만 장내 매수(P)는 따로 센다
 *
 * P 는 취득이라 위 규칙대로면 금액이 0 이 된다. 그런데 이 카드에서 **가장 드물고
 * 가장 뜻이 있는 사건**이라(우리 종목 신고의 1%), 사라지면 안 된다. 따로 담아
 * 정렬에도 쓰고 화면에도 파란 배지로 세운다.
 */
export type InsiderActivity = {
  ticker: string;
  name: string;
  /** 처분(D) 금액 합계. 취득과 섞지 않는다. */
  disposedValue: number;
  /** 장내 매수(P) 금액 합계. */
  boughtValue: number;
  /** 장내 매수 건수. 0 이면 배지를 안 낸다. */
  buyCount: number;
  /** 신고한 사람 수(법인 신고자 포함 — 10% 대주주도 Form 4 를 낸다). */
  people: number;
  /** 장내 매수한 사람 수. 매수 카드가 이걸 쓴다. */
  buyPeople: number;
  /** 무언가 내놓은 사람 수. 매도 카드가 이걸 쓴다. */
  sellPeople: number;
  /** 화면에 적을 이름. 움직인 금액이 큰 순. */
  names: string[];
  /** 코드별 건수, 많은 순. 화면이 "세금 원천징수 9" 로 편다. */
  codes: { code: string; n: number }[];
  /** 창 안에서 가장 늦은 접수일. */
  filedDate: string;
  /** 정렬·표시에 쓰는 금액. 아래 direction 이 이 숫자의 뜻을 정한다. */
  value: number;
  /** value 가 장내 매수인지 처분인지. 화면이 색과 말을 이걸로 고른다. */
  direction: "buy" | "disposed";
};

export type ManagerBrief = {
  cik: number;
  person: string;
  firm: string;
  /** ⚠️ 운용사마다 다르다. 한 화면에 섞이므로 각자 자기 분기를 들고 있어야 한다. */
  reportDate: string | null;
};

/** 의원이 건드린 종목 하나. **카더라 밖 종목도 들어온다.** */
export type CongressTicker = {
  ticker: string;
  /** 우리 사전에 있으면 한글 표기, 없으면 빈 문자열(화면은 티커만 보여준다). */
  name: string;
  buys: number;
  sells: number;
  members: number;
  /** 건수가 많은 의원 순. 화면은 앞 하나만 쓰고 나머지를 "외 N명"으로 적는다. */
  memberNames: string[];
  /**
   * 방향별 의원 이름. **매수 카드에 판 사람 이름이 뜨면 안 된다.**
   * ⚠️ 한 사람이 같은 종목을 사고팔았으면 양쪽에 다 들어간다 — 실제로 그런 신고가 있다.
   */
  buyMembers: string[];
  sellMembers: string[];
  latest: string | null;
  /** ⚠️ 이 블록의 모집단은 650종목이고 대부분 카더라 밖이다. 그래서 안쪽을 표시한다. */
  inKadera: boolean;
};

/**
 * 거물들이 직전 분기 대비 늘리거나 줄인 종목.
 *
 * ⚠️ 13F 는 분기 스냅샷이라 "샀다/팔았다"가 아니라 **두 분기의 차이**다. 분기 중간에
 * 사고팔았다면 안 보인다. 화면이 "늘렸다/줄였다"로 적어야 하는 이유다.
 */
export type ManagerMove = {
  ticker: string;
  name: string;
  /**
   * 아예 들고 있지 않다가 새로 담은(또는 전량 정리한) 사람 수.
   *
   * ⭐ '조금 늘렸다'와 뜻이 달라서 따로 센다. 어느 쪽인지는 카드가 안다 — 늘린 카드면
   * 신규, 줄인 카드면 청산이다.
   */
  mark: number;
  /**
   * 화면에 적을 이름. 움직인 금액이 큰 순.
   *
   * ⚠️ **그 카드의 방향으로 움직인 사람만** 담는다. 양쪽을 한 목록에 섞었더니 알파벳이
   * '늘린'과 '줄인' 양쪽에 같은 이름줄로 떠서, 두 카드가 서로를 반박하는 꼴이 됐다.
   */
  names: string[];
  /** 이 카드 방향으로 움직인 사람 수. 오른쪽 숫자가 이것이다. */
  movers: number;
  /** 반대로 움직인 사람 수. 각주에서만 쓴다. */
  against: number;
  inKadera: boolean;
};

/** 히어로의 규모 숫자. "우리가 몇 명을 보고 있나"를 말한다. */
export type InsiderScale = {
  /** 창 안 공시에 나타난 서로 다른 임원 수. 고정 명단이 아니라 결과다. */
  officers: number;
  /** 창 안 신고에 나타난 서로 다른 의원 수. 역시 결과다. */
  members: number;
  /** 손으로 고른 거물 명단 크기. 이것만 고정이다. */
  managers: number;
  /** 위 임원·의원 수를 센 창의 길이(일). 화면이 "90일 기준"이라 적는다. */
  windowDays: number;
};

export type InsiderOverview = {
  /** 공시 창의 끝점(= us_insider_daily.as_of_date). 없으면 표가 비었다는 뜻이다. */
  asOf: string | null;
  windowDays: number;
  /** 카더라 언급의 기준일. asOf 와 다를 수 있다. */
  mentionDate: string | null;
  rows: InsiderRow[];
  buys: InsiderActivity[];
  /** 언급된 종목 수(= 표의 모집단). 공시가 없는 종목도 포함한다. */
  mentionedCount: number;
  /**
   * 히어로 '오늘의 업데이트'용 — **마지막으로 신고가 들어온 날 + 그날 접수된 신고 수**.
   *
   * ## ⚠️⚠️ 이 칸의 세 줄은 문법이 같아야 한다
   *
   * 한때 세 줄이 제각각이었다. '임원 신고 93건 · 8/20' 의 93 은 **7일 창의 종목 수**였고,
   * '의원 신고 766건 · 8/18' 의 766 은 **90일 창 전체의 거래 수**였다. 옆에 붙은 날짜는
   * 창의 끝점일 뿐인데, 읽는 사람에겐 "그날 766건이 들어왔다"로 보인다(8/18 실제는 3건).
   * 칸 이름이 '오늘의 업데이트'라 더 그렇다.
   *
   * ⭐ 그래서 셋 다 '그 축이 마지막으로 받은 날, 그날 들어온 양'으로 맞췄다.
   * ⭐ 단위는 **신고서**다(거래 줄이 아니라). Form 4 한 장에 거래 줄이 여럿이라, 줄로
   *   세면 40건이 283건이 되어 "얼마나 새로 왔나"를 부풀린다.
   * ⚠️ 날짜를 `asOf`(us_insider_daily.as_of_date)로 가정하지 않는다. 집계일과 접수일이
   *   갈리는 순간 개수가 조용히 0 이 된다. 받아 온 행의 최대 접수일에서 직접 센다.
   */
  latestInsiderFilings: { date: string | null; count: number };
  /** 위와 같은 규칙, 의원 쪽(PTR 문서 수). */
  latestCongressFilings: { date: string | null; count: number };
  /** 추적 중인 거물 수. 화면의 "N명 중" 분모다. */
  managerCount: number;
  /** 거물들이 낸 13F 의 기준 분기. 섞여 있으면 여럿이다. */
  managerQuarters: string[];
  /**
   * 최신 원/달러 환율. 화면이 금액을 두 통화로 그린다(기본은 원화).
   *
   * ⚠️ 이 화면의 금액은 **전부 지금 값**이다(임원 신고 7일치·실시간 시세). 서학개미처럼
   * 달마다 다른 환율을 쓸 이유가 없어 최신값 하나만 들고 온다.
   * ⚠️ FRED 키가 없거나 못 받으면 null 이다. 그때는 달러만 내고 통화 스위치도 안 뜬다 —
   *    0 으로 흘리면 "0원"이 고장이 아니라 사실처럼 읽힌다.
   */
  usdKrw: number | null;
  /** 의원 신고를 본 창의 길이(일). */
  congressWindowDays: number;
  /** 그 창 안 신고 가운데 가장 늦은 접수일. */
  congressAsOf: string | null;
  /** 의원이 건드린 종목을 묶은 것. 카더라 밖까지 전부 담는다. */
  congressTickers: CongressTicker[];
  /** 거물들이 분기 사이에 늘린 종목(많이 늘린 순). */
  managerAdds: ManagerMove[];
  /** 줄인 종목(많이 줄인 순). */
  managerTrims: ManagerMove[];
  /**
   * 비교에 쓴 두 분기 중 **가장 흔한 짝**. [직전, 최신] 순. 하나도 없으면 비교가 안 된다.
   *
   * ⚠️ 운용사마다 제출이 늦을 수 있어 한 짝으로 다 못 덮는다(퍼싱 스퀘어가 한 분기
   * 늦어 12/31→3/31 이다). 그래서 몇 곳이 이 짝과 다른지 `offQuarter` 로 같이 낸다 —
   * 화면이 그 수를 각주에 적어야 라벨이 거짓말을 안 한다.
   */
  compareQuarters: string[];
  /** 위 짝과 다른 분기로 견준 운용사 수. 0 이면 라벨 한 줄로 전부 덮인다. */
  offQuarter: number;
  scale: InsiderScale;
  /** 거물 명단 — 신고 합계 큰 순. */
  managerRanks: ManagerRank[];
  /** 증권가가 긍정적으로 보는 종목. 적극 매수를 낸 애널리스트 비율이 높은 순. */
  analystTop: AnalystTop[];
  /**
   * 컨센서스를 **받아 온 날**. 화면의 배지가 "언제 기준인가"로 이 값을 쓴다.
   *
   * ⚠️ 원천이 기준 시점을 안 줘서 우리가 받은 날이다(us_analyst_consensus.as_of_date).
   *    다른 축의 `asOf`(공시 접수일)와 뜻이 다르다 — 그쪽은 원천이 준 날짜다.
   */
  analystAsOf: string | null;
};

/**
 * 거물 한 명을 **사람 축**으로 세운 줄. 화면의 나머지 카드가 전부 종목 축이라, 이 줄만
 * "어느 종목"이 아니라 "어느 사람"을 묻는다.
 *
 * ⚠️ 메인에서 거물 상세로 들어가는 길이 여기 생기기 전에는 **종목 상세의 보유자 표
 *    하나뿐**이었다. 종목을 먼저 고르지 않으면 63명 명단을 볼 방법이 없었다.
 */
export type ManagerRank = {
  cik: number;
  person: string;
  firm: string;
  /** 최신 분기 신고 합계(달러). ⚠️ 13F 라 미국 상장주 롱만이다 — 진짜 운용자산이 아니다. */
  aum: number;
  /** 그 분기에 신고한 종목 수. */
  holdings: number;
  /**
   * 금액이 가장 큰 보유 한 종목. 줄의 보조줄이 기관 이름만 적고 있어 **비어 보였다** —
   * 옆 카드들이 전부 "이름 + 뒷받침하는 사실"인데 여기만 이름 둘이었다.
   *
   * ⚠️ 이름은 카더라 사전에 없으면 표시 전용 이름표(us-ticker-names)를 본다. 거물 보유는
   *    1,454종목이라 사전(178) 밖이 훨씬 많다.
   */
  topTicker: string | null;
  topName: string | null;
  /**
   * 그 한 종목이 차지하는 비중(%).
   *
   * ⭐ 이름만 적으면 "그중 하나"로 읽힌다. 숫자가 붙어야 **얼마나 몰아 담았는지**가 같이
   *    보인다 — 실측(2026-08-23)으로 4%~97% 에 중앙값 18% 라, 국민연금(엔비디아 7%)과
   *    무바달라(GFS 95%)가 같은 자리에서 전혀 다른 이야기를 한다.
   */
  topWeight: number;
};

/**
 * 증권가가 긍정적으로 보는 종목 한 줄.
 *
 * ## ⛔ 숫자를 손대지 않는다
 *
 * 원천(stockanalysis.com) 약관이 **"수정 없이 출처를 밝히면 발췌 허용"** 이다. 그래서
 * 화면에 나가는 값은 저쪽이 준 `strong_buy` 와 `analyst_count` 를 **그대로** 적는다
 * ("62명 중 49명"). 비율은 **줄 세우는 데만** 쓰고 숫자로 내지 않는다 — 반올림한 값을
 * 내면 우리가 만든 수치가 되어 발췌를 벗어난다.
 *
 * ⛔ 저쪽의 `score`(0~10)로 줄 세우지 않는다. 그건 저쪽이 계산한 값이라 발췌가 아니라
 *    그 상품을 옮기는 것에 가깝고, 독자에게도 "9.06 이 뭔데"로 읽힌다.
 * ⚠️ 우리 판정이 아니다. 라벨이 반드시 **누가 그렇게 보는지**를 먼저 말해야 한다.
 */
export type AnalystTop = {
  ticker: string;
  name: string;
  /** 저쪽이 준 그대로. 적극 매수를 낸 애널리스트 수. */
  strongBuy: number;
  /** 저쪽이 준 그대로. 등급을 낸 애널리스트 총원. */
  analystCount: number;
  /** "Strong Buy"·"Buy"·"Hold" 등 원문 라벨. 화면이 한국어로 옮긴다. */
  consensus: string | null;
};

/**
 * 증권가 순위에 세울 최소 애널리스트 수.
 *
 * ⚠️ 문턱이 없으면 **두세 명이 본 종목이 1위를 먹는다.** 두 명 중 두 명이 적극 매수면
 *    100% 다. 179종목 중 10명 이상이 173종목이라 잃는 것도 거의 없다(실측 2026-08-23).
 */
export const RANK_MIN_ANALYSTS = 10;

const EMPTY: InsiderOverview = {
  asOf: null,
  windowDays: INSIDER_RECENT_DAYS,
  mentionDate: null,
  rows: [],
  buys: [],
  mentionedCount: 0,
  latestInsiderFilings: { date: null, count: 0 },
  latestCongressFilings: { date: null, count: 0 },
  managerCount: 0,
  managerQuarters: [],
  usdKrw: null,
  congressWindowDays: CONGRESS_WINDOW_DAYS,
  congressAsOf: null,
  congressTickers: [],
  managerAdds: [],
  managerTrims: [],
  compareQuarters: [],
  offQuarter: 0,
  scale: { officers: 0, members: 0, managers: 0, windowDays: INSIDER_WINDOW_DAYS },
  managerRanks: [],
  analystTop: [],
  analystAsOf: null,
};

/** 표의 가장 최근 날짜 한 개. 없으면 null(표가 비었거나 조회가 실패했다). */
async function latestDate(table: string, column: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from(table).select(column).order(column, { ascending: false }).limit(1);
  // ⚠️ error 를 안 받으면 조회 실패가 조용히 '데이터 없음'이 된다(telegram-data.ts 가
  //    같은 함정에 13곳 중 12곳이 걸려 있었다). 실패는 실패로 남긴다.
  if (error) {
    console.error(`[insider] ${table}.${column} 최신 날짜 조회 실패`, error);
    return null;
  }
  const row = data?.[0] as unknown as Record<string, string> | undefined;
  return row?.[column] ?? null;
}

export const getInsiderOverview = cache(async (): Promise<InsiderOverview> => {
  const db = getSupabaseAdmin();

  // 두 축의 최신 날짜를 따로 잡는다. 하나로 묶으면 한쪽이 하루 늦은 날 표가 통째로 빈다.
  const [asOf, mentionDate] = await Promise.all([
    latestDate("us_insider_daily", "as_of_date"),
    latestDate("telegram_us_stock_daily", "date"),
  ]);
  if (!mentionDate) return EMPTY;

  const congressFrom = (() => {
    const d = new Date(`${mentionDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (CONGRESS_WINDOW_DAYS - 1));
    return d.toISOString().slice(0, 10);
  })();

  const [mentionRows, insiderRows, stockRows, managerRows, holdingRows, congressRows, consensusRows] =
    await Promise.all([
    fetchAllRows<{ ticker: string; mention_count: number | null; channel_count: number | null }>(
      "ticker",
      () => db.from("telegram_us_stock_daily").select("ticker,mention_count,channel_count").eq("date", mentionDate),
      { onError: (e) => console.error("[insider] 언급 조회 실패", e) },
    ),
    asOf
      ? fetchAllRows<Record<string, number | string | null>>(
          "ticker",
          () =>
            db
              .from("us_insider_daily")
              .select(
                "ticker,filing_count,txn_count,buy_count,sell_count,option_count,other_count,person_count,latest_filed_date",
              )
              .eq("as_of_date", asOf)
              // 블록이 읽는 값이라 **짧은 창**이다. 규모(scale.officers)는 창과 무관하게
              // us_insider_txn 전체에서 세므로 여기 영향을 안 받는다.
              .eq("window_days", INSIDER_RECENT_DAYS),
          { onError: (e) => console.error("[insider] 공시 집계 조회 실패", e) },
        )
      : Promise.resolve([]),
    // ⚠️ 열 이름이 `name` 이 아니라 `name_ko`/`name_en` 이다. `name` 으로 고르면
    //    PostgREST 가 조용히 빈 값을 주고, 화면에는 티커가 두 번 찍힌다(실제로 그랬다).
    fetchAllRows<{ ticker: string; name_ko: string | null; name_en: string | null }>(
      "ticker",
      () => db.from("us_stocks").select("ticker,name_ko,name_en"),
      { onError: (e) => console.error("[insider] 종목 사전 조회 실패", e) },
    ),
    fetchAllRows<{ cik: number; person: string; firm: string; report_date: string | null }>(
      "cik",
      () => db.from("us_manager").select("cik,person,firm,report_date"),
      { onError: (e) => console.error("[insider] 거물 명단 조회 실패", e) },
    ),
    // ⚠️ 이 표는 **현재 보유만** 담는다(파이프라인이 분기마다 갈아 끼운다). 그래서
    //    날짜로 거르지 않는다. 362행이라 한 번에 들어오지만 명단이 늘 수 있어 페이징한다.
    // ⚠️ 이제 표가 분기를 쌓는다(migration_050). report_date 를 같이 받아 **운용사별
    //    최신 분기**를 골라야 한다 — 전체 최신 분기로 자르면 한 분기 늦은 곳(퍼싱
    //    스퀘어)이 통째로 빠진다.
    fetchAllRows<{ cik: number; ticker: string; value: number | null; shares: number | null; report_date: string }>(
      "ticker",
      () => db.from("us_manager_holding").select("cik,ticker,value,shares,report_date"),
      { onError: (e) => console.error("[insider] 거물 보유 조회 실패", e) },
    ),
    // 의원 신고. 창이 90일이라 행이 늘 수 있어 페이징한다(정렬 키는 유일해야 하므로 doc_id).
    fetchAllRows<{
      doc_id: string;
      ticker: string;
      member: string;
      state_dst: string | null;
      transaction_type: string | null;
      transaction_date: string | null;
      filed_date: string;
      amount_low: number | null;
      amount_high: number | null;
    }>(
      "doc_id",
      () =>
        db
          .from("us_congress_trade")
          .select("doc_id,ticker,member,state_dst,transaction_type,transaction_date,filed_date,amount_low,amount_high")
          .gte("filed_date", congressFrom),
      { onError: (e) => console.error("[insider] 의원 신고 조회 실패", e) },
    ),
    // 애널리스트 컨센서스. ⚠️ 종목마다 **날짜별로 쌓이므로** 최신 한 줄만 골라야 한다 —
    //    안 고르면 같은 종목이 여러 번 세어져 비중이 부풀어 오른다.
    fetchAllRows<{
      ticker: string;
      as_of_date: string;
      consensus: string | null;
      analyst_count: number | null;
      strong_buy: number | null;
    }>(
      "ticker",
      () => db.from("us_analyst_consensus").select("ticker,as_of_date,consensus,analyst_count,strong_buy"),
      { onError: (e) => console.error("[insider] 애널리스트 컨센서스 조회 실패", e) },
    ),
  ]);

  // ⚠️ 카더라 사전(us_stocks)은 178종목뿐인데 의원·발굴 축은 그 밖까지 담는다.
  //    사전에 없으면 **표시 전용 이름표**(lib/us-ticker-names.ts)를 본다. 그 파일은
  //    본문 매칭에 안 쓰이므로 사전을 넓힐 때 생기는 오탐(비자·블록·줌)이 없다.
  const nameOf = new Map(stockRows.map((s) => [s.ticker, s.name_ko || s.name_en || s.ticker]));
  const labelOf = (ticker: string) => displayName(ticker, stockRows.length ? nameOf.get(ticker) ?? null : null);
  const managerOf = new Map(managerRows.map((m) => [m.cik, m]));
  // 티커 → 그 종목을 가진 사람들. 평가금액 큰 순으로 둔다 — 화면이 앞 둘만 이름으로 적는데,
  // 그 둘이 "가장 크게 건 사람"이라야 뜻이 있다(가나다순이면 아무 뜻도 없다).
  // 운용사별 최신 분기와 그 직전 분기를 가른다.
  const quartersOf = new Map<number, string[]>();
  for (const h of holdingRows) {
    const qs = quartersOf.get(h.cik) ?? [];
    if (!qs.includes(h.report_date)) qs.push(h.report_date);
    quartersOf.set(h.cik, qs);
  }
  for (const qs of quartersOf.values()) qs.sort((a, b) => b.localeCompare(a));
  const latestQ = (cik: number) => quartersOf.get(cik)?.[0] ?? null;
  const priorQ = (cik: number) => quartersOf.get(cik)?.[1] ?? null;

  const holdersOf = new Map<string, { person: string; value: number }[]>();
  for (const h of holdingRows) {
    const m = managerOf.get(h.cik);
    if (!m || h.report_date !== latestQ(h.cik)) continue;
    const list = holdersOf.get(h.ticker) ?? [];
    list.push({ person: m.person, value: h.value ?? 0 });
    holdersOf.set(h.ticker, list);
  }
  for (const list of holdersOf.values()) list.sort((a, b) => b.value - a.value);


  // 티커 → 의원 신고. 매수·매도를 따로 센다 — 의원 축은 임원과 달리 재량 매매라
  // 방향이 뜻을 갖는다(임원 매도는 대부분 보상 흐름이라 방향을 세면 안 됐다).
  // ⚠️ 이 묶음은 **카더라 밖 종목까지** 담는다. 의원 축의 모집단이 650종목인데
  //    카더라 사전은 178개뿐이라, 안쪽만 보면 블록이 볼 수 있는 게 4분의 1로 준다.
  type Cg = {
    buys: number;
    sells: number;
    members: Map<string, number>;
    buyers: Map<string, number>;
    sellers: Map<string, number>;
    latest: string | null;
  };
  const congressOf = new Map<string, Cg>();
  for (const c of congressRows) {
    const cur =
      congressOf.get(c.ticker) ??
      {
        buys: 0,
        sells: 0,
        members: new Map<string, number>(),
        buyers: new Map<string, number>(),
        sellers: new Map<string, number>(),
        latest: null,
      };
    if (c.transaction_type === "P") {
      cur.buys += 1;
      cur.buyers.set(c.member, (cur.buyers.get(c.member) ?? 0) + 1);
    } else if (c.transaction_type === "S") {
      cur.sells += 1;
      cur.sellers.set(c.member, (cur.sellers.get(c.member) ?? 0) + 1);
    }
    cur.members.set(c.member, (cur.members.get(c.member) ?? 0) + 1);
    const d = c.transaction_date ?? c.filed_date;
    if (d && (!cur.latest || d > cur.latest)) cur.latest = d;
    congressOf.set(c.ticker, cur);
  }
  const ins = new Map(insiderRows.map((r) => [String(r.ticker), r]));

  const rows: InsiderRow[] = mentionRows.map((m) => {
    const i = ins.get(m.ticker);
    const n = (k: string) => Number(i?.[k] ?? 0);
    return {
      ticker: m.ticker,
      name: nameOf.get(m.ticker) ?? m.ticker,
      mentions: m.mention_count ?? 0,
      channels: m.channel_count ?? 0,
      filings: n("filing_count"),
      txns: n("txn_count"),
      buys: n("buy_count"),
      sells: n("sell_count"),
      options: n("option_count"),
      others: n("other_count"),
      people: n("person_count"),
      latestFiled: (i?.latest_filed_date as string | null) ?? null,
      holders: holdersOf.get(m.ticker)?.length ?? 0,
      holderNames: (holdersOf.get(m.ticker) ?? []).map((h) => h.person),
      congressBuys: congressOf.get(m.ticker)?.buys ?? 0,
      congressSells: congressOf.get(m.ticker)?.sells ?? 0,
      congressMembers: congressOf.get(m.ticker)?.members.size ?? 0,
      congressLatest: congressOf.get(m.ticker)?.latest ?? null,
      // 건수가 많은 의원을 앞에 둔다 — 화면이 첫 이름만 적고 나머지를 "외 N명"으로 줄이므로,
      // 그 첫 이름이 그 종목을 가장 많이 건드린 사람이라야 뜻이 있다.
      congressNames: [...(congressOf.get(m.ticker)?.members ?? new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name),
      price: null,
      changeRate: null,
    };
  });
  rows.sort((a, b) => b.mentions - a.mentions || b.txns - a.txns || a.ticker.localeCompare(b.ticker));

  // ⚠️ 시세는 **화면에 실제로 뜨는 행만** 받는다. 언급 종목이 하루 70~126개인데 전부
  //    물어보면 렌더마다 야후 왕복이 그만큼 난다. 표는 20행만 펴므로 그만큼만 받는다.
  //    (야후는 15분 재검증이 걸려 있어 같은 티커 반복 조회는 왕복이 안 난다.)
  // 발굴 블록도 시세를 쓴다. 같은 왕복에 얹어 두 번 묻지 않는다.
  //
  // ⚠️ 한 종목이 여러 날 신고되면 창 안에서 여러 행으로 온다. **종목 단위로 합쳐야**
  //    "이 종목을 며칠에 걸쳐 몇 명이 샀나"가 나온다. 날짜별로 두면 같은 회사가 목록에
  //    두 번 뜬다.
  const ourTickers = new Set(rows.map((r) => r.ticker));

  // ── 분기 비교: 늘린 종목 · 줄인 종목 ──────────────────────────────
  // ⚠️ 13F 는 분기 스냅샷이라 "샀다"가 아니라 **두 분기의 차이**다. 분기 중간에 사고팔면
  //    안 보인다. 그래서 화면 문구도 "늘렸다/줄였다"로 적는다.
  type Side = { count: number; mark: number; who: { n: string; v: number }[] };
  type Move = { up: Side; down: Side };
  const blank = (): Move => ({ up: { count: 0, mark: 0, who: [] }, down: { count: 0, mark: 0, who: [] } });
  const moveOf = new Map<string, Move>();
  const byCikTicker = new Map<string, Map<string, { shares: number; value: number }>>();
  for (const h of holdingRows) {
    const key = `${h.cik}|${h.report_date}`;
    const m = byCikTicker.get(key) ?? new Map();
    m.set(h.ticker, { shares: h.shares ?? 0, value: h.value ?? 0 });
    byCikTicker.set(key, m);
  }
  for (const [cik, m] of managerOf) {
    const lq = latestQ(cik);
    const pq = priorQ(cik);
    if (!lq || !pq) continue; // 비교할 과거가 없는 운용사는 건너뛴다
    const now = byCikTicker.get(`${cik}|${lq}`) ?? new Map();
    const before = byCikTicker.get(`${cik}|${pq}`) ?? new Map();
    for (const ticker of new Set([...now.keys(), ...before.keys()])) {
      const a = now.get(ticker);
      const b = before.get(ticker);
      const mv = moveOf.get(ticker) ?? blank();
      if (a && !b) {
        mv.up.count += 1;
        mv.up.mark += 1; // 신규
        mv.up.who.push({ n: m.person, v: a.value });
      } else if (!a && b) {
        mv.down.count += 1;
        mv.down.mark += 1; // 청산
        mv.down.who.push({ n: m.person, v: b.value });
      } else if (a && b && a.shares !== b.shares) {
        // ⚠️ 금액이 아니라 **주식 수**로 판정한다. 값은 주가가 움직여도 변해서, 한 주도
        //    안 사고 늘어난 것처럼 보인다.
        const side = a.shares > b.shares ? mv.up : mv.down;
        const moved = b.shares ? (Math.abs(a.shares - b.shares) / b.shares) * b.value : 0;
        side.count += 1;
        side.who.push({ n: m.person, v: moved });
      }
      moveOf.set(ticker, mv);
    }
  }
  /**
   * ⭐ 한 종목이 두 카드에 같이 뜨지 않게 **순증감**으로 가른다.
   *
   * 대형주는 62명 중 열몇씩 양쪽으로 움직여서, 방향별 머릿수로만 세우면 알파벳이
   * '늘린' 1위이면서 '줄인' 2위가 된다(실제로 그랬다). 많이 움직인 쪽에만 놓으면
   * 그 모순이 사라지고, 여러 곳이 **한 방향으로** 모인 종목이 위로 올라온다.
   */
  const toMove = (ticker: string, side: Side, other: Side): ManagerMove => ({
    ticker,
    name: labelOf(ticker),
    mark: side.mark,
    names: [...side.who].sort((a, b) => b.v - a.v).map((w) => w.n),
    movers: side.count,
    against: other.count,
    inKadera: ourTickers.has(ticker),
  });
  const entries = [...moveOf.entries()];
  const managerAdds = entries
    .filter(([, mv]) => mv.up.count > mv.down.count)
    .map(([t, mv]) => toMove(t, mv.up, mv.down))
    .sort((a, b) => b.movers - b.against - (a.movers - a.against) || b.movers - a.movers);
  const managerTrims = entries
    .filter(([, mv]) => mv.down.count > mv.up.count)
    .map(([t, mv]) => toMove(t, mv.down, mv.up))
    .sort((a, b) => b.movers - b.against - (a.movers - a.against) || b.movers - a.movers);
  // ⚠️ 전체 분기 목록에서 최신 둘을 집으면 안 된다. 제출이 늦는 곳(퍼싱 스퀘어)이
  //    자기 짝을 못 찾고, 라벨이 그 운용사에 대해 거짓이 된다. **실제로 견준 짝**을
  //    운용사별로 세어 가장 흔한 것을 쓴다.
  const pairCount = new Map<string, number>();
  for (const cik of managerOf.keys()) {
    const lq = latestQ(cik);
    const pq = priorQ(cik);
    if (lq && pq) pairCount.set(`${pq}|${lq}`, (pairCount.get(`${pq}|${lq}`) ?? 0) + 1);
  }
  const ranked = [...pairCount.entries()].sort((a, b) => b[1] - a[1]);
  const compareQuarters = ranked.length ? ranked[0][0].split("|") : [];
  const offQuarter = ranked.slice(1).reduce((n, [, c]) => n + c, 0);
  const congressTickers: CongressTicker[] = [...congressOf.entries()]
    .map(([ticker, c]) => ({
      ticker,
      name: labelOf(ticker),
      buys: c.buys,
      sells: c.sells,
      members: c.members.size,
      memberNames: [...c.members].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      buyMembers: [...c.buyers].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      sellMembers: [...c.sellers].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      latest: c.latest,
      inKadera: ourTickers.has(ticker),
    }))
    // 여러 의원이 건드린 종목을 먼저. 한 사람이 여러 종목을 산 것보다 여럿이 한 종목을
    // 산 게 읽을 만하고, 최신순으로만 뽑으면 많이 거래하는 의원 하나가 블록을 먹는다.
    .sort(
      (a, b) =>
        b.members - a.members ||
        b.buys + b.sells - (a.buys + a.sells) ||
        (b.latest ?? "").localeCompare(a.latest ?? ""),
    );

  // 의원 쪽도 같은 규칙 — 마지막 접수일에 들어온 PTR **문서** 수.
  const lastPtrDate = congressRows.reduce<string | null>((m, c) => (m && m >= c.filed_date ? m : c.filed_date), null);
  const latestCongressFilings = lastPtrDate
    ? {
        date: lastPtrDate,
        count: new Set(congressRows.filter((c) => c.filed_date === lastPtrDate).map((c) => c.doc_id)).size,
      }
    : { date: null, count: 0 };

  const quoted = rows.slice(0, QUOTE_ROWS).map((r) => r.ticker);
  // 환율과 시세는 서로 남이라 같이 기다린다.
  const [quotes, fx] = await Promise.all([usQuotes(quoted), getUsdKrw()]);
  for (const r of rows) {
    const q = quotes.get(r.ticker);
    r.price = q?.price ?? null;
    r.changeRate = q?.changeRate ?? null;
  }
  /**
   * 히어로의 규모 숫자. **창 안** 공시에 나타난 서로 다른 임원 수다.
   *
   * ⚠️ 이건 명단이 아니라 결과다 — 카더라에 오른 종목에 공시가 뜨면 그 사람이 들어온다.
   *    거물 63곳만 손으로 고른 고정 명단이다(config/us_managers.py).
   *
   * ## ⚠️⚠️ 창을 반드시 걸 것 — 안 걸면 배지가 거짓말한다
   *
   * 한동안 `us_insider_txn` 을 **통째로** 세고 있었다. 화면 배지는 "최근 90일 공시 기준"
   * 이라 적혀 있고 바로 옆 두 줄(의원·거물)은 창을 제대로 보는데, 이 한 줄만 규칙이
   * 달랐다. 표가 122일치를 담고 있어서 **1,326명이 1,722명으로, 30% 부풀려 나갔다**
   * (2026-08-25 실측). 표가 자랄수록 격차도 같이 자란다.
   *
   * ⭐ 덤으로 조회가 가벼워진다 — 15,633행을 전부 받다가 창 안 11,447행만 받는다.
   */
  let officerCount = 0;
  if (asOf) {
    const from = new Date(`${asOf}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - (INSIDER_WINDOW_DAYS - 1));
    const fromIso = from.toISOString().slice(0, 10);
    const names = await fetchAllRows<{ accession_no: string; seq: number; owner_name: string | null }>(
      "accession_no",
      () => db.from("us_insider_txn").select("accession_no,seq,owner_name").gte("filed_date", fromIso),
      { onError: (e) => console.error("[insider] 임원 수 조회 실패", e) },
    );
    officerCount = new Set(names.map((n) => n.owner_name).filter(Boolean)).size;
  }

  // 임원 신고를 **종목 하나로** 묶는다. 규칙은 InsiderActivity 주석 참고.
  let buys: InsiderActivity[] = [];
  let latestInsiderFilings: { date: string | null; count: number } = { date: null, count: 0 };
  if (asOf) {
    const from = new Date(`${asOf}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - (INSIDER_RECENT_DAYS - 1));
    // ⚠️ `.limit(1000)` 이었다. 7일 창이 1,243건이라 **가장 오래된 하루가 조용히
    //    잘려 나갔다.** 에러도 안 난다. 전량을 받는다.
    // ⚠️ 정렬 키가 유일해야 페이징이 행을 건너뛰지 않는다. accession_no 하나로는
    //    한 공시에 여러 줄이라 유일하지 않다 — build 가 accession_no 를 먼저 걸고
    //    fetchAllRows 가 seq 를 얹어 (accession_no, seq) 복합 키가 된다.
    const rows = await fetchAllRows<{
      ticker: string;
      owner_name: string | null;
      shares: number | null;
      price: number | null;
      filed_date: string;
      transaction_code: string | null;
      acquired_disposed: string | null;
      accession_no: string;
    }>(
      "seq",
      () =>
        db
          .from("us_insider_txn")
          .select("ticker,owner_name,shares,price,filed_date,transaction_code,acquired_disposed,seq,accession_no")
          .gte("filed_date", from.toISOString().slice(0, 10))
          .lte("filed_date", asOf)
          .order("accession_no"),
      { onError: (e) => console.error("[insider] 임원 신고 조회 실패", e) },
    );

    // 마지막 접수일과 그날 들어온 **신고서** 수. 위 조회를 다시 쓰므로 왕복이 늘지 않는다.
    const lastFiled = rows.reduce<string | null>((m, r) => (m && m >= r.filed_date ? m : r.filed_date), null);
    if (lastFiled) {
      const docs = new Set(rows.filter((r) => r.filed_date === lastFiled).map((r) => r.accession_no));
      latestInsiderFilings = { date: lastFiled, count: docs.size };
    }

    type Acc = {
      disposed: number;
      bought: number;
      buyCount: number;
      who: Map<string, number>;
      buyers: Set<string>;
      sellers: Set<string>;
      codes: Map<string, number>;
      filed: string;
    };
    const byTicker = new Map<string, Acc>();
    for (const r of rows) {
      const acc =
        byTicker.get(r.ticker) ??
        {
          disposed: 0,
          bought: 0,
          buyCount: 0,
          who: new Map(),
          buyers: new Set<string>(),
          sellers: new Set<string>(),
          codes: new Map(),
          filed: r.filed_date,
        };
      const value = (r.shares ?? 0) * (r.price ?? 0);
      if (r.acquired_disposed === "D") {
        acc.disposed += value;
        if (r.owner_name) acc.sellers.add(r.owner_name);
      }
      if (r.transaction_code === "P") {
        acc.bought += value;
        acc.buyCount += 1;
        if (r.owner_name) acc.buyers.add(r.owner_name);
      }
      if (r.owner_name) acc.who.set(r.owner_name, (acc.who.get(r.owner_name) ?? 0) + value);
      const code = r.transaction_code ?? "?";
      acc.codes.set(code, (acc.codes.get(code) ?? 0) + 1);
      if (r.filed_date > acc.filed) acc.filed = r.filed_date;
      byTicker.set(r.ticker, acc);
    }

    buys = [...byTicker.entries()]
      .map(([ticker, a]) => {
        // ⭐ 장내 매수가 처분보다 크면 그 종목의 이야기는 '샀다'다. 그때만 매수를
        //    앞세운다 — 안 그러면 P 가 취득이라 금액 0 으로 밀려 목록에서 사라진다.
        const buyLed = a.bought > a.disposed;
        return {
          ticker,
          name: labelOf(ticker),
          disposedValue: a.disposed,
          boughtValue: a.bought,
          buyCount: a.buyCount,
          people: a.who.size,
          buyPeople: a.buyers.size,
          sellPeople: a.sellers.size,
          names: [...a.who.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n),
          codes: [...a.codes.entries()].sort((x, y) => y[1] - x[1]).map(([code, n]) => ({ code, n })),
          filedDate: a.filed,
          value: buyLed ? a.bought : a.disposed,
          direction: (buyLed ? "buy" : "disposed") as "buy" | "disposed",
        };
      })
      // 금액이 큰 순. 접수일 순은 같은 날이 몰려 있어 순서가 사실상 임의다.
      .sort((a, b) => b.value - a.value);
  }

  /* ── 거물 명단(사람 축) ──────────────────────────────────────────────
     ⚠️ 컨센서스는 종목마다 날짜별로 쌓이므로 **종목당 최신 한 줄**만 남긴다.
        안 고르면 같은 종목이 여러 번 세어져 비중이 부풀어 오른다. */
  const latestConsensus = new Map<string, (typeof consensusRows)[number]>();
  for (const c of consensusRows) {
    const prev = latestConsensus.get(c.ticker);
    if (prev && prev.as_of_date >= c.as_of_date) continue;
    latestConsensus.set(c.ticker, c);
  }
  const holdingsOfCik = new Map<number, typeof holdingRows>();
  for (const h of holdingRows) {
    if (h.report_date !== latestQ(h.cik)) continue;
    const list = holdingsOfCik.get(h.cik) ?? [];
    list.push(h);
    holdingsOfCik.set(h.cik, list);
  }
  const managerRanks: ManagerRank[] = managerRows
    .map((m) => {
      const mine = holdingsOfCik.get(m.cik) ?? [];
      const aumOfMine = mine.reduce((sum, h) => sum + (h.value ?? 0), 0);
      const top = mine.reduce<(typeof mine)[number] | null>(
        (best, h) => (best === null || (h.value ?? 0) > (best.value ?? 0) ? h : best),
        null,
      );
      return {
        cik: m.cik,
        person: m.person,
        firm: m.firm,
        aum: aumOfMine,
        holdings: mine.length,
        topTicker: top?.ticker ?? null,
        topName: top ? labelOf(top.ticker) : null,
        topWeight: top && aumOfMine > 0 ? ((top.value ?? 0) / aumOfMine) * 100 : 0,
      };
    })
    .sort((a, b) => b.aum - a.aum);

  /* ── 증권가가 긍정적으로 보는 종목 ──────────────────────────────────
     ⛔ 정렬만 비율로 하고 **화면에 나가는 숫자는 원천 값 그대로**다. 이유는 AnalystTop
        머리말 참고(약관이 "수정 없이" 를 요구한다). */
  const analystTop: AnalystTop[] = [...latestConsensus.values()]
    .filter((c) => (c.analyst_count ?? 0) >= RANK_MIN_ANALYSTS && (c.strong_buy ?? 0) > 0)
    .map((c) => ({
      ticker: c.ticker,
      name: labelOf(c.ticker),
      strongBuy: c.strong_buy ?? 0,
      analystCount: c.analyst_count ?? 0,
      consensus: c.consensus,
    }))
    .sort((a, b) => b.strongBuy / b.analystCount - a.strongBuy / a.analystCount);
  const analystAsOf =
    [...latestConsensus.values()].map((c) => c.as_of_date).sort().slice(-1)[0] ?? null;

  return {
    asOf,
    // 블록이 "최근 N일"로 적는 값이라 짧은 창을 내보낸다. 규모의 90일과 다르다.
    windowDays: INSIDER_RECENT_DAYS,
    mentionDate,
    rows,
    buys,
    mentionedCount: rows.length,
    latestInsiderFilings,
    latestCongressFilings,
    managerCount: managerRows.length,
    usdKrw: fx?.now ?? null,
    managerQuarters: [...new Set(managerRows.map((m) => m.report_date).filter(Boolean) as string[])].sort(),
    congressWindowDays: CONGRESS_WINDOW_DAYS,
    congressAsOf: congressRows.length ? congressRows.map((c) => c.filed_date).sort().slice(-1)[0] : null,
    congressTickers,
    managerAdds,
    managerTrims,
    compareQuarters,
    offQuarter,
    managerRanks,
    analystTop,
    analystAsOf,
    scale: {
      // ⚠️ 임원·의원 수는 **명단이 아니라 결과**다. 카더라에 오른 종목에 공시가 뜨면
      //    그 사람이 자동으로 들어온다. 거물 30명만 손으로 고른 고정 명단이다.
      officers: officerCount,
      members: new Set(congressRows.map((c) => c.member)).size,
      managers: managerRows.length,
      windowDays: INSIDER_WINDOW_DAYS,
    },
  };
});

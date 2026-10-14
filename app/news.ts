import type { IconName } from "@/lib/icon-names";

/**
 * 셸 맨 위 소식 띠와 사이드바 · 폰 메뉴의 시황 구독 단추가 같이 쓰는 정의. 서버(app/layout.tsx — 걸 소식 고르기 · 첫 그림 전 숨김)와
 * 셸(app/AppShell.tsx NewsStrip)이 함께 읽어야 해서 클라이언트 모듈 밖에 둔다.
 *
 * 띠는 서버에서 그린다(2026-10-14). 예전엔 하이드레이션 뒤 localStorage 를 읽고서야 끼어들어, 띠를 안 닫은 방문자의 모든 화면이
 * 첫 그림 1~2초 뒤 본문째 67px(폰) · 54px(PC) 내려갔다(폰 4G 흉내 CLS 0.069).
 */

// 외부(텔레그램) 링크라 NAV 배열이 아니라 따로 둔다 — pathname 기반 active 판정 대상이
// 아니고, 새 탭으로 열려야 해서 next/link 가 아닌 <a> 를 쓴다. 사이드바와 폰 메뉴가
// 같은 값을 참조해야 두 내비게이션의 항목이 어긋나지 않는다.
//
// 라벨 "시황 구독하기"(2026-10-08, "오늘 뭐래?"에서 바꿈 — 운영자가 더 정식인 이름을 원했다).
// "커뮤니티 합류"처럼 들어가는 행위가 아니라 **받는 것**(시황)과 누르면 되는 일(구독)을 말한다.
// 지수·브리핑·리포트·카더라 계열 이름은 피했다 — 사이트에 이미 있는 것들이라 같은 메뉴가 둘로
// 보인다. '텔레그램'도 라벨에 안 넣는다 — 앞세우면 리딩방 류로 읽힌다(소식 띠 TELEGRAM_NEWS 와 같은 판단).
// ⚠️ 사이드바 단추에서 글자 자리는 약 97px(13px · 600)이다. 이 라벨이 71px.
//
// aria-label 은 라벨과 따로 둔다. 라벨만 읽히면 스크린리더 사용자는 이게 외부
// 텔레그램으로 나가는 링크라는 걸 알 수 없다.
export const TELEGRAM: { href: string; label: string; aria: string; icon: IconName } = {
  href: "https://t.me/hatzze69",
  label: "시황 구독하기",
  aria: "시황 구독하기 텔레그램 채널 열기(새 탭)",
  icon: "send",
};

/* 문구를 머리·이름·꼬리로 나눈 건 **이름에만 밑줄을 긋기** 위해서다 — 띠 전체가 이미
   링크지만, 눌러서 가는 곳이 **어디인지**는 이름이 말해야 한다. 머리(head)는 이름 앞에
   문장을 먼저 세울 때만 채운다(2026-09-19 텔레그램 소식이 처음).

   ⚠️ **아이콘과 GA 라벨도 소식마다 갈아야 한다.** 예전엔 이 둘이 본문에 박혀 있어서
   문구만 바꾸고 넘어갔고, 내부자 소식에 미장 카더라의 자유의 여신상이 그대로 붙어
   있었다(2026-08-26). 갈아 끼울 것을 한 덩이로 모아 둔다.
   ⭐ 아이콘은 **사이드바 NAV 의 그 화면 아이콘과 같은 것**을 쓴다. 띠를 눌러 가면
     사이드바에서 방금 본 그림이 그 자리에 켜져 있어야 같은 곳이라고 읽힌다.

   ⭐ 키를 갈아 끼우는 것이 곧 **띠를 되쓰는 것**이다. 소식은 하나뿐이라 이 덩이만
   바꾸면 이전 소식은 사라지고 새 소식만 뜬다. 예전 소식을 닫아 둔 사람도 키가 달라져
   다시 본다(닫힌 표시는 옛 키에 남아 있을 뿐 새 키를 막지 않는다).
   ⚠️ 옛 키를 되쓰지 말 것 — 그 소식을 닫았던 사람은 새 소식을 못 본다.

   ⛔⛔ **아직 안 연 화면을 알리는 띠는 화면을 여는 날 함께 켜진다.** 이 띠에는 사이드바
   NAV 같은 조건부가 없어서, 띠만 먼저 넣으면 프로덕션에서 눌러 404 로 간다. 그때는
   `app/screen-flags.ts` 의 플래그로 갈라 목적지가 열려 있을 때만 걸리게 한다(국장
   미리보기·배당으로 살기·테마 리포트 때 그렇게 했다). */
/* 지금 거는 소식은 하나(NEWS). 목적지가 우리 화면이면 **그 구역 안에서는 안 그린다**(NewsStrip 의 startsWith).
   이전 소식들(내부자 → 국장 미리보기 → 데일리 노트 → 텔레그램 2판 → 배당으로 살기 → 텔레그램 3판 → 테마 리포트 오픈)은
   git 이력에 있다 — 되살릴 땐 키를 새로 딴다.
   ⚠️ 문구에 숫자를 넣지 않는다(위 주석).
   ⛔ 소식을 새로 걸거나 문구를 고칠 때는 app/releases.ts 에 판을 올리지 않는다(2026-10-01 지시 — 업데이트 기록에 안 싣는다). */
/* tailShort: 폰(≤560)에서 tail 대신 쓰는 짧은 꼬리. 이름이 앞에 서는 소식은 폰에서 한 줄로 잘리므로(components.css 의
   .hz-news-namefirst) 긴 tail 은 문장 중간에서 '…'로 끊긴다. 한 줄(360px 폰에서 글자 칸 238px)에 들어가는 문장을 따로 둔다. */
/* until: 이 시각부터는 안 띄운다(없으면 계속). 마감이 있는 소식(설문 · 행사)이 끝난 뒤에 남지 않게. */
export type NewsItem = { key: string; from: string; until?: string; href: string; head?: string; name: string; tail: string; tailShort?: string; aria?: string; icon: IconName; ga: string };

/* 2026-10-01 · 텔레그램 구독 권유 4판. 테마 리포트 오픈 소식(9/23~)을 내리고 다시 건다.
   ⭐ **문장이 먼저 오고 밑줄 이름이 뒤에 선다**(head → name → tail). 사람들이 가장 궁금해하는 '왜 올랐나'가 주인공이고
   텔레그램은 뒤로 뺐다 — 텔레그램 채널이라는 말을 앞세우면 리딩방 류로 읽혀 반감이 먼저 온다(2026-09-19 결정, 3판부터).
   그래서 문장 어디에도 '텔레그램'이 없고, 어디로 가는지는 아이콘(사이드바 채널과 같은 send)과 링크의 aria-label 이 말한다.
   3판("매일 개장 전과 마감 뒤에 그날의 이야기와 이유를 정리합니다. 구독하고 받아 보세요!")은 git 이력에 있다.
   ⚠️ 키를 새로 땄다(v4) — 3판을 닫았던 사람에게도 다시 뜬다. */
export const TELEGRAM_NEWS: NewsItem = {
  key: "hz-news-telegram-v4",
  // 머지·배포 직후부터. 채널은 이미 열려 있으니 기다릴 글이 없다.
  from: "2026-10-01T00:00:00+09:00",
  href: TELEGRAM.href,
  // 밑줄 앞에 서는 문장. 끝의 공백이 이름과의 사이를 띄운다.
  head: "오늘 왜 올랐는지, 장이 끝나면 정리해서 보내 드립니다. ",
  name: "받아 보기",
  tail: "",
  // 문장이 목적지를 말하지 않으므로 스크린리더에는 여기서 말한다(사이드바 TELEGRAM.aria 와 같은 꼴).
  aria: "오늘 왜 올랐는지, 장이 끝나면 정리해서 보내 드립니다. 받아 보기. 텔레그램 채널 열기(새 탭)",
  // 사이드바·모바일 탭바의 채널 아이콘과 같은 것. 본문에서는 안 쓰는 아이콘이라 한 화면 두 번 규칙에 안 걸린다.
  icon: TELEGRAM.icon,
  ga: "news-telegram",
};

/* 2026-10-05 · v2 의견 설문(구글 설문, 1분 · 추첨 10명 커피 기프티콘 · 10월 20일 마감). 텔레그램 4판을 내리고 건다.
   문구는 운영자가 후보 열 중에 고른 것이다. 상품 수 · 마감일은 문장에 안 넣고(설문 첫 장이 말한다) '1분'과 '커피'만 둔다.
   ⚠️ 키를 새로 땄다 — 텔레그램 띠를 닫았던 사람에게도 한 번 뜬다. 마감 다음 날 0시(KST)부터는 저절로 텔레그램 4판으로 돌아간다(until ·
   아래 NEWS). 4판을 이미 닫은 사람에게는 안 뜬다 — 다시 모두에게 띄우려면 그때 4판 키를 새로 딴다.
   아이콘 campaign 은 본문 어디에도 안 쓰는 그림이라 한 화면 두 번 규칙에 안 걸린다. */
export const SURVEY_NEWS: NewsItem = {
  key: "hz-news-survey-v2",
  from: "2026-10-05T00:00:00+09:00",
  until: "2026-10-21T00:00:00+09:00",
  href: "https://forms.gle/otD2jw73frGsTBqb9",
  head: "hatzze가 새로 바뀌었습니다. 1분 의견 설문에 답하시면 추첨으로 커피를 드립니다. ",
  name: "참여하기",
  tail: "",
  aria: "hatzze가 새로 바뀌었습니다. 1분 의견 설문에 답하시면 추첨으로 커피를 드립니다. 참여하기. 의견 설문 열기(새 탭)",
  icon: "campaign",
  ga: "news-survey",
};

/** 거는 차례 — 앞에서부터 기간 안인 첫 소식 하나를 건다. 설문이 끝나면(until) 텔레그램 4판으로 돌아간다. 소식을 바꿀 땐 이 줄과 위 덩이만 갈아 끼운다. */
export const NEWS_ITEMS: NewsItem[] = [SURVEY_NEWS, TELEGRAM_NEWS];

/** 그 시각에 걸려 있나. 개발 서버에서는 시각과 무관하게 띄운다 — 문구 · 아이콘을 로컬에서 보려면 날짜를 기다릴 수 없다. */
export const newsLiveAt = (news: NewsItem, now: number) =>
  process.env.NODE_ENV !== "production" || (now >= Date.parse(news.from) && (!news.until || now < Date.parse(news.until)));

/** 그 시각에 걸 소식 — 레이아웃이 그릴 때 고르고(서버) 셸이 키로 받는다. 둘이 따로 고르면 마감 시각을 사이에 두고 갈렸다. */
export const newsAt = (now: number): NewsItem | null => NEWS_ITEMS.find((n) => newsLiveAt(n, now)) ?? null;
export const newsByKey = (key: string): NewsItem | null => NEWS_ITEMS.find((n) => n.key === key) ?? null;

/**
 * 닫은 소식은 첫 그림부터 숨긴다 — 띠를 서버에서 그리므로(셸 NewsStrip) 닫은 사람에게 하이드레이션까지 보였다 사라지면 안 된다.
 * 첫 그림 전 스크립트(layout PREF_SCRIPT)가 닫은 키를 <html data-news-off> 에 적고 아래 CSS 가 그 띠를 숨긴다. localStorage 를 못 읽으면
 * 셸도 안 띄우므로(NewsStrip getSnapshot) 모두 닫은 것으로 친다.
 */
export const NEWS_OFF_SCRIPT = `try{var nk=${JSON.stringify(NEWS_ITEMS.map((n) => n.key))},no=[];try{for(var q=0;q<nk.length;q++)if(localStorage.getItem(nk[q])!==null)no.push(nk[q]);}catch(e){no=nk;}if(no.length)document.documentElement.setAttribute("data-news-off",no.join(" "));}catch(e){}`;
export const NEWS_OFF_CSS = NEWS_ITEMS.map((n) => `html[data-news-off~="${n.key}"] .hz-news[data-news="${n.key}"]{display:none}`).join("");

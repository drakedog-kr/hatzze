/**
 * 아직 안 연 화면의 스위치. **여는 일이 여러 파일에 흩어지지 않게** 한 곳에 모은다.
 *
 * ## 왜 만들었나
 *
 * 이 저장소는 화면을 열 때 같은 실수를 두 번 했다.
 *
 *   ① 2026-08-26 내부자 리포트를 열었는데 **푸터 '바로가기'에 줄이 빠져 있었다.** 예고
 *      시절엔 없는 게 맞았고, 여는 날 아무도 그 목록을 다시 안 봤다.
 *   ② 2026-08-30 국장 미리보기를 '준비 중' 배지만 달고 사이드바 NAV 에 href 를 뒀더니
 *      **프로덕션에서 그냥 눌려 들어가졌다.** 배지는 표시일 뿐 잠금이 아니다.
 *
 * 둘 다 "여는 것"과 "가리키는 것"이 서로 다른 파일에 있어서 생겼다. 여기 플래그 하나를
 * 두고 그 파일들이 이걸 읽으면, 여는 날 고칠 곳이 **이 줄 하나**가 된다.
 *
 * ## 이 플래그를 읽는 곳
 *
 *   app/preview/page.tsx  배포된 곳에서 404 를 낼지(`!PUBLIC && DEPLOYED`), 색인을 막을지
 *   app/AppShell.tsx      소식 띠가 어느 화면을 가리킬지(NEWS)
 *
 * ⚠️ 사이드바(app/AppShell.tsx)는 아직 이 플래그를 안 읽는다. 거기는 항목의 **모양**이
 *    갈려서다 — 안 연 화면은 `COMING_SOON`(href 가 아예 없는 타입)에, 연 화면은 `NAV` 에
 *    산다. 여는 날 그 항목을 손으로 옮겨야 한다. 옮기는 것을 잊어도 링크가 생기지는
 *    않으므로(그쪽은 href 필드 자체가 없다) 유출로는 이어지지 않는다.
 *
 * ## 여는 절차
 *
 *   1. 아래 값을 true 로 바꾼다.
 *      ↳ 이것만으로 **소식 띠**가 함께 켜진다. 띠 문구는 정해 뒀다.
 *   2. `app/AppShell.tsx` 의 COMING_SOON 항목을 지우고 NAV 에 `{ href: "/preview", ... }` 를
 *      같은 자리에 넣는다.
 *   3. `app/releases.ts` 에 한 줄 올린다(화면이 하나 느는 것이라 Minor).
 *
 * ⛔ **여라는 말이 있기 전에는 바꾸지 말 것.** 화면이 다 만들어졌다는 것과 여는 것은
 *    다른 판단이다.
 */
export const PREVIEW_PUBLIC = true;

/**
 * 데일리 노트(/daily) — 매일 저녁 한 편의 시장 정리 글. 2026-09-06 에 만들었고 **아직 안 열었다.**
 *
 * 국장 미리보기 때보다 읽는 곳이 하나 더다 — **사이드바도 이 값을 읽는다.** 안 연 동안은
 * COMING_SOON(href 없음)에, 열면 NAV 에 서도록 같은 플래그로 갈라 두어서, 여는 날 항목을
 * 손으로 옮기다 잊는 일(위 ②의 사고)이 없다.
 *
 *   app/daily/page.tsx · app/daily/[date]/page.tsx   배포된 곳에서 404 를 낼지, noindex 를 달지
 *   app/AppShell.tsx                                  NAV ↔ COMING_SOON · DEEP_PAGES · 소식 띠(NEWS)
 *   app/sitemap-urls.ts · app/sitemap-notes.xml       사이트맵(목록 화면 + 날짜별 글)
 *   app/robots.ts                                     sitemap-notes.xml 을 적을지
 *   scripts/check-routes.mjs                          안 연 동안 사이트맵에 없는 것을 정상으로 볼지
 *
 * ## 여는 절차
 *
 *   1. 아래 값을 true 로 바꾼다. 위 자리가 전부 같이 켜진다.
 *   2. `app/releases.ts` 에 한 줄 올린다(화면이 하나 느는 것이라 Minor).
 *   3. 머지 뒤 프로덕션을 찔러 본다 — `curl -s -o /dev/null -w '%{http_code}' https://hatzze.fun/daily` 가 200.
 *
 * ⛔ **여라는 말이 있기 전에는 바꾸지 말 것.** 화면이 다 만들어졌다는 것과 여는 것은
 *    다른 판단이다.
 */
export const DAILY_PUBLIC = true;

/**
 * 배당으로 살기(/dividend) — 종목과 주수를 넣으면 1년에 얼마 받는지 계산하는 화면. 2026-09-11 에
 * 만들었고 **아직 안 열었다.** 읽는 곳은 데일리 노트와 같다(사이드바·사이트맵·검사) + 투자 유의사항의 데이터 출처.
 *
 *   app/dividend/page.tsx     배포된 곳에서 404 를 낼지, noindex 를 달지
 *   app/AppShell.tsx          NAV ↔ COMING_SOON · DEEP_PAGES
 *   app/disclaimer/page.tsx   투자 유의사항 '데이터 출처'의 배당 줄
 *   app/sitemap-urls.ts       사이트맵
 *   scripts/check-routes.mjs  안 연 동안 사이트맵에 없는 것을 정상으로 볼지
 *
 * ## 여는 절차
 *
 *   1. 아래 값을 true 로 바꾼다. 위 자리가 전부 같이 켜진다.
 *   2. `app/releases.ts` 에 한 줄 올린다(화면이 하나 느는 것이라 Minor).
 *   3. 머지 뒤 프로덕션을 찔러 본다 — `curl -s -o /dev/null -w '%{http_code}' https://hatzze.fun/dividend` 가 200.
 *
 * ⛔ **여라는 말이 있기 전에는 바꾸지 말 것.** 화면이 다 만들어졌다는 것과 여는 것은
 *    다른 판단이다.
 */
export const DIVIDEND_PUBLIC = true;

/**
 * 테마 리포트(/theme · /theme/[테마]) — 테마 하나를 두고 채널에서 무슨 얘기가 도는지 보는 화면.
 * 2026-09-19 에 만들어 **2026-09-23 에 열었다.** 읽는 곳은 배당으로 살기와 같다(사이드바·사이트맵·검사).
 *
 *   app/theme/page.tsx · app/theme/[theme]/page.tsx   배포된 곳에서 404 를 낼지, noindex 를 달지
 *   app/AppShell.tsx                                   NAV ↔ COMING_SOON · DEEP_PAGES · 소식 띠(NEWS) · 머리 도구의 건너가기 단추
 *   app/sitemap-urls.ts                                사이트맵(목록 + 테마별 실주소)
 *   scripts/check-routes.mjs                           안 연 동안 사이트맵에 없는 것을 정상으로 볼지
 *
 * ## 여는 절차
 *
 *   1. 아래 값을 true 로 바꾼다. 위 자리가 전부 같이 켜진다(소식 띠 문구·키·아이콘은 정해 뒀다 — AppShell 의 NEWS).
 *   2. `app/releases.ts` 에 한 줄 올린다(화면이 하나 느는 것이라 Minor).
 *   3. 머지 뒤 프로덕션을 찔러 본다 — `curl -s -o /dev/null -w '%{http_code}' https://hatzze.fun/theme` 가 200.
 *
 * ⛔ **여라는 말이 있기 전에는 바꾸지 말 것.** 화면이 다 만들어졌다는 것과 여는 것은
 *    다른 판단이다.
 */
export const THEME_PUBLIC = true;

// 화면 캐시를 비우고 데우는 자리는 손댈 것이 없다 — `scripts/revalidate.sh` 의 DEFAULT_WARM 에 /theme·/theme/us 가 이미 있고,
// 파이프라인의 '테마 리포트 화면만 먼저 비우고 데우기' 스텝도 그대로다(안 연 동안은 404 라 아무 일이 없다).

/**
 * ETF 자금 흐름(/etf) — 국내 상장 ETF 하나하나에 돈이 얼마나 들어오고 나갔는지(설정·환매) 보는 화면.
 * 2026-10-11 에 만들기 시작했고 2026-10-13 운영자 지시로 연다 — PR #718 이 머지되는 순간 열린다(배포본 404 · noindex 를 푼다).
 *
 *   app/etf/page.tsx   배포된 곳에서 404 를 낼지, noindex 를 달지
 *
 * ## 여는 절차
 *
 *   1. 아래 값을 true 로 바꾼다.
 *   2. 사이드바 항목은 이미 걸려 있다 — `app/AppShell.tsx` buildNav 의 시장 브리핑 다음 줄이 이 값으로 선다('오늘 시장' 묶음 ·
 *      이름 · 아이콘 swap_vert · 부제는 app/etf/copy.ts). `app/sitemap-urls.ts` 에 주소를 싣고, 이용약관(app/terms/page.tsx)
 *      '서비스의 내용'에 시장 브리핑 다음 한 줄을 더하고 시행일을 올린다(그 자리 주석).
 *   3. 투자 유의사항(/disclaimer) '데이터 출처'의 KRX 줄에 ETF 일별매매정보가 들었는지, 세이브로 줄에 ETF종합정보(총보수 · 분류)가 들었는지 본다.
 *   4. `scripts/revalidate.sh` 의 DEFAULT_WARM 에 /etf 를 더한다 — 수집(daily-update.yml 배당 잡 끝의 ETF 세 스텝)은 이미 돌고,
 *      finalize 의 전체 비우기가 사본은 지우지만 데우는 목록에 없으면 첫 방문자가 새로 그린다.
 *   5. `app/releases.ts` 에 한 줄 올린다(화면이 하나 느는 것이라 Minor).
 *
 * 다섯 단계를 다 밟았다(2026-10-13) — 사이트맵 · 약관 2 · 3 · 8조와 시행일 · 투자 유의사항 묶음과 출처 · DEFAULT_WARM · 업데이트 기록 2.10.0.
 * 공유 카드(app/etf/opengraph-image.tsx · og-copy.ts ETF_CARD)도 같이 만들었다.
 */
export const ETF_PUBLIC = true;

/**
 * 사이드바에 ETF 항목을 세우나 — 열었거나, **개발 서버(next dev)**일 때. 만드는 동안 로컬에서 사이드바로 들어가 보려고 둔다
 * (2026-10-11 "일단 개발서버에서 보게 넣어줘"). `NODE_ENV` 는 빌드 때 박히므로 배포(Vercel)와 로컬 `next start` 에선 false 다 —
 * 배포 화면은 ETF_PUBLIC 전까지 404 라(app/etf/page.tsx) 사이드바에 서면 깨진 길이 된다. 여는 날엔 ETF_PUBLIC 만 바꾸면 된다.
 */
export const ETF_NAV = ETF_PUBLIC || process.env.NODE_ENV === "development";

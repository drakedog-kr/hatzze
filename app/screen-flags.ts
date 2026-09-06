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
 *   app/Footer.tsx        '바로가기' 목록에 줄을 낼지
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
 *      ↳ 이것만으로 푸터 바로가기와 **소식 띠**가 함께 켜진다. 띠 문구는 정해 뒀다.
 *   2. `app/AppShell.tsx` 의 COMING_SOON 항목을 지우고 NAV 에 `{ href: "/preview", ... }` 를
 *      같은 자리(서학개미 다음)에 넣는다.
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
 *   app/Footer.tsx                                    '바로가기' 목록
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

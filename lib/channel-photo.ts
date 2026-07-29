import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 채널 프로필 사진의 주소를 만들고 검증한다.
 *
 * 사진은 telegram_channels.photo 에 base64 data URI 로 들어 있다. 예전엔 그 문자열을
 * 그대로 `<img src>` 에 박았는데, 카더라 페이지가 3.3MB 가 되고 그중 2.5MB(74%)가
 * base64 였다. 같은 채널이 트렌딩 3개 탭·채널 랭킹·뜨는 채널에 겹쳐 나오는 탓에
 * **186번 박히는데 서로 다른 사진은 64개** — 1.6MB 는 순전히 같은 바이트의 반복이었다.
 * 이제 HTML 에는 짧은 주소만 싣고, 바이트는 이 라우트가 캐시 가능한 JPEG 로 준다.
 *
 * ## 왜 서명을 붙이나
 *
 * 주소가 `/api/channel-photo/<핸들>` 뿐이면 **감시 채널 목록을 캐낼 수 있다** — 아무
 * 핸들이나 넣어 보고 200 이 오면 우리가 그 채널을 보고 있다는 뜻이 된다. 목록을
 * 비공개로 두는 건 마이그레이션 008 이 명시한 의도라(레포가 public 이다) 그 구멍을
 * 열 수 없다. 그래서 핸들마다 HMAC 을 붙이고, 서명이 안 맞으면 채널이 있든 없든
 * 똑같이 404 를 준다. 페이지에 이미 그려진 채널(=핸들이 t.me 링크로 공개된 것)만
 * 유효한 주소를 갖는다.
 *
 * 키는 SUPABASE_SECRET_KEY 를 그대로 쓴다. 서버에만 있고, 이미 이 데이터를 읽는 권한
 * 자체라 관리 지점을 늘리지 않는다. HMAC 은 단방향이라 서명에서 키가 새지 않는다.
 * 키가 바뀌면 옛 주소는 404 가 되는데, /kadera 는 force-dynamic 이라 주소가 매 요청
 * 새로 발급되므로 남아 있는 옛 주소가 없다.
 */

const SIG_LEN = 12; // hex 12자 = 48비트. 위조 시도를 막기엔 충분하고 주소가 짧다.

function sign(handle: string): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY 환경변수가 설정되어 있지 않습니다.");
  return createHmac("sha256", key).update(handle).digest("hex").slice(0, SIG_LEN);
}

/** 페이지가 `<img src>` 에 넣을 주소. 핸들 하나당 길이 60자 안팎이다. */
export function channelPhotoUrl(handle: string): string {
  return `/api/channel-photo/${encodeURIComponent(handle)}?v=${sign(handle)}`;
}

/** 라우트가 받은 서명이 우리가 발급한 것인지. 길이가 다르면 비교 자체를 하지 않는다. */
export function verifyChannelPhotoSig(handle: string, sig: string | null): boolean {
  if (!sig || sig.length !== SIG_LEN) return false;
  const expected = Buffer.from(sign(handle));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

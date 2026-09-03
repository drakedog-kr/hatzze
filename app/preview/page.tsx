import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getOvernightLive, type OvernightRow } from "@/lib/kr-overnight";
import { getPreview, type PreviewLink, type PreviewMover } from "@/lib/kr-preview";

import { SectionCaps } from "../kadera/parts";
import { SectionHead } from "../kadera/SectionHead";
import { pageMetadata } from "../seo";
import { PREVIEW_PUBLIC } from "../screen-flags";
import { StockLogo } from "../StockLogo";
import { KOSPI_AFTER } from "../kr-preview-table";
import { C, Icon, MONO } from "../ui";
import { formatKstUpdate } from "@/lib/format";

/**
 * 국장 미리보기 — 간밤 미장에서 크게 움직인 종목이 오늘 아침 국내 어디와 엮이는지.
 *
 * 재료는 `data-pipeline/config/us_kr_pairs.py`(관계 153쌍 · 5년 실측)이고, 계산은 전부
 * 파이프라인이 개장 전에 끝내 표에 넣는다. 여기서는 그리기만 한다.
 *
 * ## 이 화면이 파는 것은 예보가 아니라 해설이다
 *
 * ⚠️⚠️ **효과는 거의 다 개장 갭에서 끝난다.** 사용자가 09:00 에 무엇을 하려는 순간 이미
 * 지나간 일이다. 숨기면 며칠 안에 들통나고, 먼저 밝히면 카드가 정직해진다.
 * ⚠️ 이 화면 안에는 '매수·매도 신호가 아니다' 라는 고지가 **없다**. 히어로 브리핑 끝 줄과
 * 시트 각주가 차례로 그 말을 하고 있었는데 2026-09-03 에 둘 다 다른 말로 바뀌었다. 지금은
 * 전역 푸터가 모든 화면에서 그 고지를 한다. 화면 안에 다시 넣기로 한다면 카더라처럼 각주
 * 끝에 "· 매수·매도 신호가 아닙니다" 를 붙이는 형태다.
 *
 * ⚠️ 여기 **"장중 기여가 정확히 0"** 이라고 적혀 있었는데 그건 적중률로만 본 값이라
 * 틀렸다(2026-09-03 재측정). 크기로 재면 대조군을 뺀 순수 몫이 개장 +0.548% · 장중
 * +0.178% 로 **장중이 24.5%** 다. 그래서 화면 문구는 "대부분 개장 순간에 끝납니다" 이지
 * "개장에서 끝납니다" 가 아니다 — 그 "대부분" 을 지우지 말 것.
 *
 * ⚠️ **적중률로 말하지 않는다.** 2026 년에 세 분기 연속 적중률이 55%·52%·60% 로 떨어진
 * 적이 있는데, 신호 크기는 오히려 커졌고(+2.15% → +3.38%) 코스피 개장 폭이 0.9% → 2.3%
 * 로 뛴 게 원인이었다. 잡음이 오르면 적중률만 무너진다. 크기와 횟수로 말하면 그 국면에서도
 * 안 깨진다.
 *
 * ⚠️ **"코스피보다" 를 지우지 말 것.** 원본 상관은 51,626쌍 중 98.3% 가 양수다 — 지수 몫을
 * 안 빼면 모든 카드가 같은 날 다 맞고 같은 날 다 틀린다. 그건 종목 카드가 아니라 지수 카드다.
 *
 * ⚠️⚠️ **화면 글자는 "밤사이" 다. "간밤"·"어젯밤" 으로 되돌리지 말 것.** 두 번 고친 자리다
 * (2026-09-03).
 *
 *   · "간밤" 은 증권가 기사에서 흔하지만 "살면서 몇 번 못 봤다" 는 지적을 받았다. 아는
 *     사람에게 자연스러운 말과 처음 보는 사람에게 읽히는 말은 다르고, 여기는 뒤쪽을 고른다.
 *   · "어젯밤" 은 **틀린 말이었다.** 미장은 한국 시각 22:30(겨울 23:30)에 열려 **05:00
 *     (겨울 06:00)에 닫는다** — 화면이 내는 종가는 어젯밤이 아니라 **오늘 새벽** 것이다.
 *   · "밤사이" 는 '밤이 지나는 동안' 이라 새벽까지 덮고(일기예보에서 매일 쓰는 말이라
 *     낯설지도 않다), 명사라서 "밤사이 뉴욕"·"밤사이 S&P 500" 처럼 이름 앞에도 선다.
 *     열 자리 중 여섯이 그 자리라 이 조건이 결정적이었다("밤새" 는 그 자리에서 어색하다).
 *
 * **주석과 DB 코멘트의 '간밤' 은 그대로 둔다** — 거기는 코드 안 말이라 바꿀 이유가 없고,
 * 화면 글자만 한 낱말로 맞춰 두면 다음에 고칠 자리도 분명해진다.
 *
 * ## 배치는 시장 브리핑과 같은 뼈대다
 *
 * 히어로 판(`.hz-hero-panel`) + 구간 배지 + 섹터 카드 벽. 히어로는 시장 브리핑이 쓰는
 * 그 판을 그대로 쓴다 — 1fr·1fr·2fr 격자라 넓은 화면은 한 줄, 1399 아래에서는 브리핑이
 * 아랫줄을 통째로 쓰는 **두 줄**이 된다.
 *
 * ⚠️ 카더라식 `hz-kd-hero`(q·q·h)로 되돌리지 말 것. 그건 셋이 늘 한 줄에 서서 오늘의
 * 브리핑이 25%~50% 폭에 갇힌다. 이 화면의 요지는 문장 쪽이라 아랫줄을 다 줘야 한다.
 *
 * ⚠️ 섹터 카드에 설명을 달지 말 것. 처음엔 머리마다 "국내 종목을 짚으면…" 을 넣었는데,
 * 섹터가 열한 개라 **같은 문장이 열한 번** 나왔다. 그 안내는 카드 벽 위에 한 번만 둔다.
 */

/**
 * ⛔ **아직 안 연 화면이다.** 스위치는 `app/screen-flags.ts` 한 곳에 있다 — 푸터의
 * '바로가기' 목록도 같은 값을 읽으므로, 여는 날 고칠 곳이 흩어지지 않는다.
 * 여는 절차와 왜 그렇게 모았는지는 그 파일 머리말에 있다.
 */
const PUBLIC = PREVIEW_PUBLIC;

/** 배포된 곳인가. Vercel 에서만 `VERCEL_ENV` 가 있고 로컬에는 없다 — 그래서 로컬에서는
 *  PUBLIC 이 false 여도 그대로 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export async function generateMetadata(): Promise<Metadata> {
  // ⚠️ **await 를 빼지 말 것.** 다른 화면은 `return pageMetadata(...)` 로 프라미스를 그대로
  // 돌려주지만 여기는 robots 를 얹으려고 펼친다 — 안 기다린 프라미스를 펼치면 자기 속성이
  // 없어 **빈 객체**가 되고, 제목·설명·canonical 이 통째로 루트 것으로 떨어진다.
  // 타입은 통과한다(Metadata 의 필드가 다 선택이라 `{}` 도 맞는 값이다). 2026-09-03 에
  // 실제로 그 상태였고, robots 만 붙어 있어서 겉으로는 멀쩡해 보였다.
  const meta = await pageMetadata({
    title: "국장 미리보기",
    description:
      "밤사이 미국에서 크게 움직인 종목과 사업으로 엮인 국내 종목을 개장 전에 잇습니다. 최근 5년, 그런 날 국내가 몇 %에 열려 몇 %로 닫았는지를 함께 봅니다.",
    path: "/preview",
  });
  // 안 연 동안은 색인도 막는다. 아래에서 404 를 내므로 사실상 덤이지만, 사이드바에
  // 링크가 있던 동안 크롤러가 주소를 이미 봤을 수 있다.
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

const HOT = "var(--c-hot-ink)";
const COLD = "var(--c-cold-ink)";

// 초과분(gap)은 이제 화면에 안 낸다 — 쌍을 고르고 검증하는 기준으로만 쓴다.

/**
 * 종목 이름 뒤에 붙일 **조사만** 돌려준다(이름 자체는 <strong> 안에 따로 그린다).
 *
 * 브리핑 문장이 이름을 그대로 끼워 넣는데, 이름은 매일 바뀐다. 고정 문구로 두면
 * "엔비디아은" 같은 게 나온다. 한글이 아닌 이름(ASML·KT&G)은 받침 있는 쪽으로 보낸다 —
 * 자음으로 끝나는 약어가 대부분이라 그편이 덜 틀린다.
 */
function josa(word: string, withJong: string, withoutJong: string): string {
  const last = word.trim().slice(-1).charCodeAt(0);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  const hasJong = !hangul || (last - 0xac00) % 28 !== 0;
  return hasJong ? withJong : withoutJong;
}

/**
 * "으로 / 로" 만 따로 본다. **위 josa() 로는 못 낸다** — 받침이 있어도 그게 ㄹ 이면 "로" 라서
 * 받침 유무 두 갈래로 갈리지 않는다.
 *
 * 브리핑이 관계 이름(`why`)에 이걸 붙이는데, 사전의 102가지 중 넷이 ㄹ 로 끝난다
 * ("석화 사이클"·"카메라 모듈"·"태양광 모듈"·"화장품 수출"). josa() 를 그대로 쓰면
 * "카메라 모듈으로" 가 된다. 그래서 예전엔 화면에 "(으)로" 라고 두 벌을 다 적어 뒀는데,
 * 그건 채우다 만 자리로 읽힌다(2026-09-03).
 *
 * ⚠️ 한글이 아닌 이름은 **"로"** 로 보낸다. josa() 는 받침 있는 쪽으로 보내지만 여기서는
 * 반대다 — 사전의 ADC·FPCB·SMR·RNA 는 소리내면 씨·비·알·에이로 끝나 넷 다 "로" 다.
 */
function euro(word: string): string {
  const last = word.trim().slice(-1).charCodeAt(0);
  if (last < 0xac00 || last > 0xd7a3) return "로";
  const jong = (last - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}

/**
 * 시트 부제 — **그날 뜬 관계로 문장을 짓는다.**
 *
 * ⚠️⚠️ **고정 문구로 되돌리지 말 것.** 예전엔 "미국 기업에 납품하거나 같은 업종이라…" 였는데,
 * 그건 그날 화면이 아니라 **사전 전체의 구성**을 말한 것이었다(161쌍 중 같은 업종 84 · 납품 48
 * 로 둘이 82%). 유가나 기술이전 쌍만 뜨는 날에는 화면에 없는 것을 가리킨다(2026-09-03 지적).
 *
 * ⚠️ 종류가 셋 이상이면 **"대부분" 을 붙인다.** 상위 둘만 이름을 부르면서 "…으로 엮인
 * 곳입니다" 로 끝내면 나머지 한 갈래를 없는 것으로 만든다. 둘 이하면 그 말이 정확하므로 안 붙인다.
 *
 * ⚠️ cycle 을 "같은 업황" 으로 쓰지 말 것. peer 가 "같은 업종" 이라 둘이 함께 뜨는 날
 * ("같은 업종과 같은 업황") 같은 말이 두 번 나온다. 실제로 그런 날이 흔하다.
 */
const KIND_LABEL: Record<string, string> = {
  peer: "같은 업종",
  supply: "납품",
  cycle: "업황",
  license: "기술이전",
  channel: "유통",
  rival: "경쟁",
};

const FALLBACK_DESC = "사업으로 엮여 있고 기록에서도 같이 움직인 곳입니다";


function sheetDesc(links: PreviewLink[]): string {
  const count = new Map<string, number>();
  for (const l of links) {
    const label = l.kind ? KIND_LABEL[l.kind] : undefined;
    if (label) count.set(label, (count.get(label) ?? 0) + 1);
  }
  // 마이그레이션 061 전에 쓰인 줄뿐이면 종류를 알 수 없다. 그때는 두루 참인 문장으로.
  if (count.size === 0) return FALLBACK_DESC;
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const tail = count.size > 2 ? "엮인 곳이 대부분입니다" : "엮인 곳입니다";
  if (top.length === 1) return `오늘은 ${top[0]}${euro(top[0])} ${tail}`;
  return `오늘은 ${top[0]}${josa(top[0], "과", "와")} ${top[1]}${euro(top[1])} ${tail}`;
}

/* ── 히어로 조각 ─────────────────────────────────────────────────────────── */

/** 히어로 셀의 머리. 시장 브리핑의 셀 머리와 같은 크기·굵기다. */
function CellHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", color: C.ink }}>{title}</h2>
      {note && <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>{note}</span>}
    </div>
  );
}

/* ── 종목 타일 ───────────────────────────────────────────────────────────── */

const PCT = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

/**
 * 살아 있는 값의 '시점' 표기 — "9/4 오전 2:40".
 *
 * ⚠️⚠️ **날짜를 ISO 문자열에서 잘라 쓰지 말 것.** `capturedAt` 은 UTC 라 한국 새벽에는
 * 하루 전 날짜가 나온다(02:40 KST = 전날 17:40Z). 이 카드가 제일 많이 읽히는 시간대가
 * 바로 그 새벽이라 그 실수는 매일 밤 틀린다.
 *
 * ⚠️ 시·분과 **같은 포매터**에서 뽑는다. 날짜와 시각을 따로 만들면 자정 언저리에서 둘이
 * 다른 날을 가리킬 수 있다(00:00 KST 는 전날 15:00Z 다).
 *
 * ⚠️ ko-KR 의 기본 `format()` 은 "9. 4. 오전 2:40" 처럼 점을 찍는다. 슬래시로 적으려고
 * 조각을 직접 잇는다 — 다른 화면의 짧은 날짜(shortDate)와 같은 모양이다.
 */
const STAMP_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
function kstStamp(iso: string): string {
  const parts = STAMP_FMT.formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("dayPeriod")} ${get("hour")}:${get("minute")}`;
}

/**
 * 국내 장이 닫힌 동안 밖에서 붙은 값. 종목 하나가 타일 하나다.
 *
 * ⚠️⚠️ **"오를 것" 으로 쓰지 말 것.** 이 값은 실측으로 그날 개장 갭과 상관 0.94~0.97 에
 * 기울기 1.0 이라, 사실상 개장가를 미리 아는 것에 가깝다. 그래서 더 조심해야 한다 —
 * 화면은 **"밖에서는 지금 얼마에 거래되고 있다" 는 사실**만 적고 예상을 말하지 않는다.
 *
 * ⚠️ **견준 종가의 날짜를 함께 낸다.** 그 종가가 직전 영업일 것이 아니면 아래 퍼센트는
 * 거짓인데 화면에서는 그럴듯해 보인다. 날짜가 있어야 읽는 사람이 스스로 알아챈다.
 *
 * ⚠️ 출처(선물 심볼)를 지우지 말 것. 국내 거래소 값이 아니라 해외 무기한선물 값이다.
 * 어디서 온 숫자인지 안 밝히면 KRX 시세로 오해한다.
 */
function OvernightPanel({ r }: { r: OvernightRow }) {
  const up = r.diffPct > 0;
  const ink = up ? HOT : COLD;
  const won = Math.round(r.krw - r.prevClose);
  return (
    <div className="hz-panel-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <StockLogo code={r.code} name={r.name} market="KOSPI" size={30} />
        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-.01em" }}>{r.name}</strong>
          {/* 심볼이 곧 출처 링크다. 이 값이 어디서 온 것인지 화면 어디에도 안 적혀
              있었는데, 심볼은 이미 그 시장의 주소 노릇을 한다 — 따로 '출처' 줄을
              만들지 않고 이걸 누를 수 있게 한다.
              ⚠️ 주소에는 **API 이름**(xyz:SMSN)을 그대로 넣는다. 하이퍼리퀴드가
              보여 주는 이름은 다르지만(xyz:SAMSUNG) 사이트가 알아서 옮겨 준다
              (2026-09-04 실측: SMSN→SAMSUNG · SKHX→SKHYNIX · HYUNDAI 그대로).
              화면에 적힌 심볼과 주소가 같아야 '이 줄을 눌렀다'가 성립한다.
              ⚠️ 파랗게 칠하지 않는다. 누를 수 있다는 것은 화살표와 호버로만 말한다 —
              MDD·종목 이름 링크가 이미 쓰는 방식이다(globals.css 주석 참고). */}
          <a
            className="hz-perp-link"
            href={`https://app.hyperliquid.xyz/trade/${r.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            data-ga="preview_perp_click"
            data-ga-symbol={r.symbol}
            style={{ fontFamily: MONO, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 2, width: "fit-content" }}
          >
            {r.symbol}
            {/* 11px 글자 옆이라 아이콘도 11px 이다. 12 로 두면 글자보다 커서 화살표가
                먼저 눈에 든다 — 여기서 주인공은 심볼이다. */}
            <Icon name="north_east" style={{ fontSize: 11 }} />
          </a>
        </span>
      </div>

      {/* ⚠️⚠️ **값과 견줌을 두 줄로 나눈다.** 한 줄에 다 넣었더니 SK하이닉스만 자릿수가
          일곱이라(1,579,154) 저 혼자 접혀 타일 키가 30px 어긋났다(2026-09-03 실측).
          줄을 나누면 종목이 몇이든 세 장이 같은 키다.
          ⚠️⚠️ **"국장 종가 대비" 를 지우지 말 것.** 이 카드에는 시장이 둘이라(해외 선물 ·
          국내 종가) 라벨이 없으면 이 퍼센트가 선물의 하루 등락으로 읽힌다 — 실제로는
          어제 국장 종가와 견준 값이다. 아래 '09/02 국장 종가' 줄과 짝이다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <strong style={{ fontFamily: MONO, fontSize: 27, fontWeight: 800, letterSpacing: "-.03em",
                           lineHeight: 1.1, color: C.ink }}>
            {r.krw.toLocaleString("ko-KR")}
          </strong>
          <span style={{ fontSize: 13, color: C.sub }}>원</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.muted }}>국장 종가 대비</span>
          {/* ⚠️ 아래 퍼센트와 **같은 크기·같은 굵기**다. 한때 12.5/700 과 14/800 로 갈라 뒀는데
              둘은 한 쌍(얼마 · 몇 %)이라 크기가 다르면 하나가 딸린 것처럼 읽힌다. */}
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: ink, letterSpacing: "-.02em" }}>
            {/* 단위를 붙인다. 옆의 퍼센트와 나란히 서면 숫자 둘이 같은 종류로 보이는데,
                하나는 원이고 하나는 %다. 아래 '1,613,000원' 과도 표기가 맞는다. */}
            {up ? "+" : ""}{won.toLocaleString("ko-KR")}원
          </span>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: ink, letterSpacing: "-.02em" }}>
            {PCT(r.diffPct)}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 12,
                    borderTop: "1px solid var(--c-sheet-row)" }}>
        {([
          // ⭐ "국장" 을 붙인다. 이 카드에는 값이 두 종류(해외 선물 · 국내 종가)라
          // 그냥 "종가" 면 위의 큰 숫자와 같은 시장 것으로 읽힌다.
          [`${r.prevCloseDate.slice(5).replace("-", "/")} 국장 종가`, `${r.prevClose.toLocaleString("ko-KR")}원`],
          // ⚠️ 환율을 여기 붙이지 말 것. 그날 하나뿐인 값이라 시트 부제가 한 번 말한다.
          ["달러 표시가", `$${r.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`],
          ["24시간 거래대금", r.volumeUsd == null ? "—" : `$${Math.round(r.volumeUsd / 1e6).toLocaleString("en-US")}M`],
        ] as const).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.muted }}>{k}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.sub, whiteSpace: "nowrap" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 간밤 크게 움직인 **미국 종목 하나**가 타일 하나다.
 *
 * ⚠️⚠️ **섹터로 묶어 큰 상자를 만들지 말 것.** 섹터마다 종목이 1~5 로 달라 상자 키가
 * 제각각이 되고, 짝지어 세우면 짧은 쪽 바닥이 빈다. 섹터는 타일 위 **작은 라벨**로 남긴다 —
 * 정보는 그대로고 모양만 고르게 된다(카더라 '급부상 종목'의 타일과 같은 짜임).
 *
 * ⚠️⚠️ **숫자는 미국 줄과 같은 단위(%)로 적는다.** 한때 "173번 중 130번" 이었는데,
 * 위가 "+2.38%" 인데 아래가 횟수면 두 숫자가 같은 종류로 안 보여서 무엇을 어쩌라는 건지
 * 읽히지 않았다(2026-09-02). 같은 단위라야 눈이 바로 잇는다.
 *
 * ⚠️⚠️ **코스피 줄을 지우지 말 것.** "보통 +2.25%" 만 있으면 이 종목 덕인지 그날 장이
 * 좋아서인지 구별이 안 된다. 같은 날들의 코스피 평균이 위에 한 줄 서 있어야, 밑의 숫자들이
 * 저마다 그것과 견줘 읽힌다. 설명 문장 없이도 뜻이 서는 건 이 한 줄 덕이다.
 */
function MoverPanel({ m }: { m: PreviewMover }) {
  const ink = m.dp > 0 ? HOT : COLD;
  return (
    <div className="hz-panel-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <StockLogo code={m.ticker} name={m.usName} market="US" size={30} />
        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
            <strong style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" }}>
              {m.ticker}
            </strong>
            <span className="hz-cellname" style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>{m.usName}</span>
          </span>
          <span style={{ fontSize: 11, color: C.muted }}>{m.sector}</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
          {/* ⭐ "간밤" 을 붙인다. 밑에도 퍼센트가 줄줄이 있어서, 라벨이 없으면 위아래가
              같은 종류로 읽힌다 — 위는 **어젯밤 실제로 일어난 일**이고 아래는 **과거 평균**이다. */}
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 11, color: C.muted }}>밤사이</span>
            <strong style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: ink, letterSpacing: "-.02em" }}>
              {PCT(m.dp)}
            </strong>
          </span>
          {/* ⭐ 등락률만으로는 큰 움직임인지 알 수 없다 — 종목마다 평소 폭이 다르다. */}
          <span style={{ fontSize: 11, fontWeight: 600, color: C.sub2, whiteSpace: "nowrap" }}>
            평소보다 {m.z.toFixed(1)}배
          </span>
        </span>
      </div>

      {/* ⚠️⚠️ 위(사실)와 아래(과거)를 **선으로 가른다.** 둘 다 퍼센트라, 선이 없으면 눈이
          한 덩이로 읽고 "어젯밤 이 종목이 +0.38% 올랐다" 로 오해한다. 아랫단은 어젯밤 일이
          아니라 **과거 5년의 평균**이다. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12,
                    borderTop: "1px solid var(--c-sheet-row)" }}>
        {/* 이 한 줄이 밑의 숫자들에 기준을 준다. */}
        {/* ⚠️ 쉼표로 끝나는 매달린 문장을 쓰지 말 것. 예전엔 "…열렸고," 로 끝나 밑의
            줄들이 그 문장의 뒷부분처럼 보였는데, 줄마다 종목이 달라 문장이 안 이어진다.
            여기는 **목록의 머리**다 — 밑의 숫자들이 무엇과 견줘야 하는지만 세워 준다. */}
        {/* ⚠️ 여기에 코스피 평균을 같이 적지 말 것. 시장 몫과 견주라고 넣어 봤는데
            값이 −0.15%·+0.09% 같은 잡음 수준이라 판단에 보탬은 없고 자리만 먹었다
            (2026-09-02). 시장 몫은 쌍을 고를 때 이미 뺐다. */}
        {/* ⚠️⚠️ "과거 이런 날" 처럼 얼버무리지 말 것. **얼마나 오래**인지가 없으면 표본이
            열흘인지 십 년인지 모른다. 방향도 적는다 — 오른 날과 내린 날은 다른 표다. */}
        <div style={{ paddingBottom: 2, fontSize: 11.5, color: C.sub, wordBreak: "keep-all" }}>
          최근 5년, 이렇게 {m.dp > 0 ? "오른" : "내린"} 날 국내 개장은
        </div>
        {m.links.map((l) => {
          // 하루 전체는 담지 않는다 — 개장과 개장 뒤를 곱해 정확히 낸다.
          const day = l.krOpen != null && l.krIntra != null
            ? ((1 + l.krOpen / 100) * (1 + l.krIntra / 100) - 1) * 100
            : null;
          return (
            <div key={l.stock} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <StockLogo code={l.code} name={l.stock} market={l.market} size={18} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>{l.stock}</span>
                {/* 관계는 한 낱말짜리 꼬리표다. 자리가 모자라면 이것만 줄어든다. */}
                <span style={{ fontSize: 11, color: C.sub2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.why}
                </span>
              </div>
              {/* ⚠️⚠️ 셋을 **다 낸다.** 개장만 있으면 "그리고 그 뒤로는 별일 없었다" 를 못
                  말한다 — 이 화면이 예보가 아니라 개장 해설인 근거가 그 두 번째 숫자다.
                  히어로가 코스피로 같은 셋을 내므로 앞뒤도 맞는다.
                  ⚠️ 라벨을 떼지 말 것. 숫자 셋이 라벨 없이 서면 무엇이 무엇인지 모른다. */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingLeft: 25, flexWrap: "wrap" }}>
                {([["개장", l.krOpen], ["장 중", l.krIntra], ["종가", day]] as const).map(([label, v]) => (
                  <span key={label} style={{ display: "inline-flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                                   color: v == null ? C.sub2 : v > 0 ? HOT : COLD }}>
                      {v == null ? "—" : PCT(v)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 화면 ────────────────────────────────────────────────────────────────── */

export default async function PreviewPage() {
  // ⛔ 안 연 화면이라 배포된 곳에서는 없는 페이지다. 사이드바 링크를 지우는 것만으로는
  // 부족하다 — 주소를 알면 그대로 열린다.
  if (!PUBLIC && DEPLOYED) notFound();

  // ⚠️ 둘을 나란히 부른다. 표가 서로 달라 한쪽이 비어도 다른 쪽은 그린다 —
  // 하이퍼리퀴드 표가 아직 없던 날에도 아래 시트는 멀쩡해야 한다.
  const [{ date, updatedAt, spx, sectors, moverCount }, overnight] = await Promise.all([
    getPreview(),
    getOvernightLive(),
  ]);
  const stamp = date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} 아침 기준` : undefined;

  const movers = sectors.flatMap((s) => s.movers);

  // 평소 대비 가장 크게 움직인 넷. z 로 세운다 — 등락률로 세우면 늘 변동성 큰 종목만
  // 올라와서 "평소와 달랐던 밤"이라는 이 칸의 뜻이 사라진다.
  //
  // ⚠️ 다섯이었다. "너무 길어진다"는 지적을 받았고(2026-09-03), 다섯을 지키던 근거도
  // 이미 사라져 있었다 — 옆 칸이 섹터 분포 일곱 줄이라 줄 수를 맞춰야 했던 시절의
  // 값이다. 그 목록은 08-30 에 빠졌다.
  // ⚠️ 셋으로는 줄이지 말 것. 이 칸이 답하는 것은 "어젯밤 어디가 시끄러웠나" 인데,
  //    셋이면 하루 평균 6~12종목 중 절반도 못 보인다.
  const loudest = [...movers].sort((a, b) => b.z - a.z).slice(0, 4);

  // 브리핑 문장의 재료.
  const biggest = movers.reduce<PreviewMover | null>((a, m) => (!a || Math.abs(m.dp) > Math.abs(a.dp) ? m : a), null);
  const strongest = movers
    .flatMap((m) => m.links.map((l) => ({ m, l })))
    .reduce<{ m: PreviewMover; l: PreviewLink } | null>((a, x) => (!a || Math.abs(x.l.gap) > Math.abs(a.l.gap) ? x : a), null);
  // ⭐ 여러 미국 종목에 동시에 걸린 국내 종목. 오늘 대한항공이 부킹홀딩스·사우스웨스트·
  // 보잉 세 곳에서 같이 밀렸는데, 섹터 카드를 따로 읽으면 셋으로 흩어져 안 보인다.
  // 이 문장이 그 화면에서 유일하게 그걸 말한다.
  const linkCount = new Map<string, number>();
  for (const m of movers) for (const l of m.links) linkCount.set(l.stock, (linkCount.get(l.stock) ?? 0) + 1);
  const crowded = [...linkCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const stockCount = linkCount.size;
  // 간밤 S&P 가 든 구간의 과거 코스피 성적. 사전의 정적 표에서 고른다.
  const after = spx == null ? null : KOSPI_AFTER.find(([lo, hi]) => spx >= lo && spx < hi) ?? null;

  /**
   * 타일을 세울 차례. **평소 대비 큰 순**이다.
   *
   * ⭐ 타일이 고르게 생겨서(미국 한 종목 + 국내 1~3줄) 크기로 짝을 맞출 이유가 없어졌다.
   * 예전에 섹터 상자를 쓸 땐 종목 수가 1~5 로 달라 키를 맞추느라 크기 순으로 세웠는데,
   * 그건 배치를 위해 순서를 내준 것이었다. 지금은 신호가 센 것이 위에 온다.
   */
  const wall = [...movers].sort((a, b) => b.z - a.z);

  return (
    <>
      {/* ── 히어로 — 간밤 뉴욕 · 평소와 달랐던 곳 · 오늘의 브리핑(아랫줄 전체) ── */}
      <section className="hz-hero-panel">
        {/* ① 간밤 뉴욕 — 이 밤이 얼마나 시끄러웠나 */}
        <div className="hz-hero-cell">
          <CellHead title="밤사이 뉴욕" note={stamp} />
          {/* ⚠️⚠️ 여기에 섹터 분포를 두지 말 것. "그날 어디가 움직였나" 는 이 화면이 답할
              물음이 아니다 — 개장 전에 사람이 궁금한 건 **"간밤 미국이 이랬는데 우리 장은
              어떻게 열리나"** 하나다(2026-09-02 지적). 섹터는 타일마다 라벨로 이미 있다. */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontFamily: MONO, fontSize: 38, fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1,
                             color: spx == null ? C.ink : spx > 0 ? HOT : COLD }}>
              {spx == null ? "—" : PCT(spx)}
            </strong>
            <span style={{ flex: 1 }} />
            {/* ⚠️⚠️ **이 라벨 밑에 풀이를 달지 말 것.** "미국 대표 500개 기업 평균입니다 ·
                이 가운데 N곳이 평소보다 크게 움직였고 M곳이 올랐습니다" 가 붙어 있었는데,
                앞 절은 바로 위 'S&P 500' 을 되풀이한 것이고 뒷 절은 셋째 칸 브리핑의 첫
                문장("간밤에는 N곳이 평소보다 크게 움직였습니다")과 같은 말이었다
                (2026-09-03 지적). 한 화면에서 같은 사실을 두 번 적으면 둘 다 값이 떨어진다. */}
            <span style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, textAlign: "right", wordBreak: "keep-all" }}>
              밤사이 S&amp;P 500
            </span>
          </div>

          {/* ⭐⭐ 이 세 줄이 화면의 뼈대를 숫자로 보인다. 간밤 S&P 와 코스피 **개장 갭**의
              상관은 0.547 인데 **장중**과는 0.018 이다 — 장중 줄이 어느 구간에서나 0 언저리인
              게 그 증거고, 그래서 이 화면은 예보가 아니라 개장 해설이다.
              ⚠️ 장중 줄을 빼지 말 것. 그게 없으면 "개장에서 끝난다" 가 각주의 주장으로만 남는다. */}
          {/* ⚠️⚠️ **이 블록이 칸의 남는 높이를 먹는다(flex:1).** 예전엔 칸 맨 밑에 "오늘 국내
              N종목이 여기에 이어집니다" 라는 바닥 줄이 있어서 그게 칸을 채웠는데, 아래 시트가
              같은 말을 이미 하고 있어 뺐다(2026-09-03). 그러자 이 칸만 바닥이 60px 남아
              옆 두 칸과 어긋났다 — 이 저장소의 히어로는 **세 칸 모두 바닥까지 찬다**(시장
              브리핑 실측: 세 칸 다 269 에서 끝난다).
              ⚠️ 남는 높이를 고정 padding 으로 메우지 말 것. 그 값은 셋째 칸 브리핑이 두
              문단인지 네 문단인지에 따라 매일 달라진다. 늘어나는 쪽으로 풀어야 한다. */}
          {/* paddingTop 10 은 **좁은 화면 몫**이다. 넓은 화면에서는 남는 높이가 알아서 머리글
              위를 벌리지만(아래 flex-end), 칸이 세로로 쌓이는 375px 에서는 남는 높이가 0 이라
              그 벌어짐이 사라진다 — 실측으로 위 16 · 아래 15 가 되어 머리글이 다시 가운데에
              떴다. 이 값이 어느 폭에서나 최소 간격을 만든다. */}
          {/* ⚠️⚠️ **자료가 없는 날의 바닥을 비워 두지 말 것.** 구간표를 못 고르면(표가 비었거나
              조회가 실패해 spx 가 null 이면) 이 칸은 큰 숫자에서 끝나고 **바닥에 220px 이
              빈다**(2026-09-03 전수검사에서 실측). 옆 두 칸은 그날도 각자 할 말이 있어서
              칸 하나만 덩그러니 비어 고장처럼 보인다. 그래서 그 자리를 한 줄로 메운다. */}
          {!after && (
            <span style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--c-sheet-row)",
                           fontSize: 12, lineHeight: 1.6, color: C.sub }}>
              과거 같은 구간을 고를 자료를 아직 못 받았습니다
            </span>
          )}
          {after && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 10,
                          // ⚠️⚠️ 남는 높이는 **머리글 위로** 보낸다(flex-end). 한때 세 줄이
                          // 나눠 갖게 했는데(flex:1), 줄이 늘면 글자가 줄 상자 가운데로
                          // 내려앉아 머리글과 첫 줄 사이가 27px 로 벌어졌다 — 위의 큰 숫자와는
                          // 16px 이라 **머리글이 아래 목록보다 위 숫자에 붙어 보였다**
                          // (2026-09-03 지적·실측). 머리글은 목록의 것이다.
                          flex: 1, justifyContent: "flex-end" }}>
              {/* ⚠️⚠️ **"189번 뒤" 처럼 횟수로 쓰지 말 것.** 1,000일 중 189번인지 200일 중
                  189번인지 알 수 없어 크기가 안 잡힌다(2026-09-02 지적). 사람이 아는 단위는
                  **기간**이다 — "최근 5년" 이면 표본이 얼마나 두꺼운지 바로 가늠된다. */}
              {/* ⚠️ paddingBottom 을 되살리지 말 것. 6 이 붙어 있어서 머리글과 첫 줄 사이가
                  22px 였는데 줄과 줄 사이가 27px 이라 **머리글이 목록의 넷째 줄처럼** 보였다.
                  머리글은 목록보다 확실히 붙어 있어야 목록의 머리로 읽힌다(지금 16 대 27). */}
              <span style={{ fontSize: 11.5, color: C.sub, wordBreak: "keep-all" }}>
                최근 5년, 미국이 이만큼 {spx != null && spx > 0 ? "오른" : "내린"} 아침에 코스피는
              </span>
              {/* ⭐ 라벨은 **개장 · 장 중 · 종가** 로 못박는다(2026-09-02 확정).
                  ⚠️ "개장 뒤" 로 쓰지 말 것 — 개장 직후 잠깐으로 읽히는데 실제로는 9시 시가에서
                  15시 30분 종가까지 **하루 장 전체**다. 화면 두 곳(히어로·타일)이 같은 말을
                  써야 위아래가 이어진다. */}
              {([["개장", after[3]], ["장 중", after[4]], ["종가", after[5]]] as const).map(([label, v], k) => (
                <div
                  key={label}
                  style={{
                    // ⚠️ 여기에 flex:1 을 주지 말 것. 위 블록 주석 참고 — 줄이 늘면 글자가
                    // 가운데로 내려앉아 머리글이 목록에서 떨어진다. 줄 높이는 늘 같게 둔다.
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    // ⚠️⚠️ **마지막 줄만 바닥 여백을 뺀다(2026-09-03 지적).** 이 칸은 바닥 줄이
                    // 없어서 '종가' 가 칸의 마지막 글자인데, 옆 두 칸의 마지막 글자는 바닥 설명이다.
                    // 상자 바닥은 셋이 같은데(463) 글자 바닥이 450 대 460 으로 10px 어긋나 있었다 —
                    // 이 줄은 아래로 padding 8 + 행간 5 를 깔고 있고 설명 줄은 3 뿐이라서다.
                    // padding 8 을 빼고 marginBottom 으로 나머지를 맞춘다.
                    // ⚠️ **글꼴 크기를 건드리면 이 값을 다시 재야 한다.** 실제로 그랬다 —
                    //    옆 칸 설명을 11.5 에서 집안 표준인 12 로 올리자 그 칸이 1px 높아져
                    //    판 전체가 따라 커졌고, 바닥에 붙어 있던 이 줄도 1px 내려갔다.
                    //    그래서 −2 가 −1 이 됐다(2026-09-03).
                    // ⚠️ 부호를 헷갈리지 말 것. 이 블록은 flex-end 라 **음수를 키우면 내려간다**
                    //    (바깥 높이가 줄어 바닥이 상자 밖으로 나간다). 올리려면 0 쪽으로 간다.
                    padding: k === 2 ? "8px 0 0" : "8px 0",
                    marginBottom: k === 2 ? -1 : undefined,
                    borderBottom: k === 2 ? "none" : "1px solid var(--c-sheet-row)",
                  }}
                >
                  {/* ⚠️ 가운데 줄만 작게·흐리게 두지 말 것. "개장 뒤는 거의 0" 이라는 걸
                      크기로 말하려 했는데, 세 줄이 같은 종류라 가운데만 작으면 그냥 어긋나
                      보인다(2026-09-02 지적). **그 말은 숫자가 이미 하고 있다.** */}
                  <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{label}</span>
                  <strong style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800,
                                   letterSpacing: "-.02em", whiteSpace: "nowrap",
                                   color: v > 0 ? HOT : COLD }}>
                    {PCT(v)}
                  </strong>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* ② 평소와 가장 달랐던 곳
            ⚠️⚠️ **이 칸을 ① 에 합치지 말 것.** 한 번 합쳐서 판을 두 칸으로 만들었는데,
            이 저장소의 히어로는 어디서나 1:1:2 세 칸이고 한 칸을 위아래로 가르는 화면도
            없다. 이 화면만 다른 뼈대를 쓸 이유가 없다(2026-09-02 지적).
            칸이 비어 보이던 건 칸 수 탓이 아니라 **바닥 줄이 없어서**였다. */}
        <div className="hz-hero-cell hz-hero-divide">
          <CellHead title="밤사이 가장 크게 움직인 곳" />
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {loudest.length === 0 ? (
              <span style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.7 }}>아직 채울 자료가 없습니다.</span>
            ) : (
              loudest.map((m) => (
                <div key={m.ticker} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <StockLogo code={m.ticker} name={m.usName} market="US" size={24} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <strong style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.ink }}>{m.ticker}</strong>
                    <span className="hz-cellname" style={{ fontSize: 11, color: C.sub2 }}>{m.usName}</span>
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                    <strong style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", color: m.dp > 0 ? HOT : COLD }}>
                      {PCT(m.dp)}
                    </strong>
                    <span style={{ fontSize: 11, color: C.sub2, whiteSpace: "nowrap" }}>평소보다 {m.z.toFixed(1)}배</span>
                  </span>
                </div>
              ))
            )}
          </div>
          {/* ⚠️⚠️ **바닥 줄은 한 줄로 끝나야 한다.** 두 줄이 되면 그만큼 선이 위로 올라가
              옆 칸과 어긋난다 — 넓은 화면에서 세 칸이 한 줄에 설 때 바로 드러난다(실측:
              어긋났을 때 404·386·255, 시장 브리핑은 242·240·240). 좁은 칸(1800폭에서 334px)
              에서도 안 접히게 20자 안팎으로 적을 것. */}
          {/* ⚠️ 12px 이다. 시장 브리핑의 히어로 바닥 줄이 12 이고 '최종 업데이트' 만 11.5 다
              (2026-09-03 실측). 여기만 11.5 로 두면 같은 자리 같은 역할의 글자가 화면마다
              다른 크기가 된다. */}
          <span style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--c-sheet-row)",
                         fontSize: 12, color: C.sub, lineHeight: 1.6, whiteSpace: "nowrap",
                         overflow: "hidden", textOverflow: "ellipsis" }}>
            그 종목이 평소 하루에 움직이던 폭과 견준 순서
          </span>
        </div>

        {/* ③ 오늘의 브리핑 — 아랫줄을 통째로 쓴다.
            ⚠️ 문장을 LLM 에 맡기지 않는다. 재료가 숫자 넷뿐이라 틀이 고정이고, 매일 두 번
            도는 화면에 모델 값을 태울 이유가 없다. 이름 뒤 조사만 josa() 로 받침에 맞춘다. */}
        <div className="hz-hero-cell hz-hero-divide hz-hero-wide">
          <CellHead title="오늘의 브리핑" />
          {moverCount === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
              밤사이 크게 움직인 종목이 없습니다. 눈여겨보는 미국 종목 가운데 평소 폭을 크게 넘어선 곳이 없었다는
              뜻이고, 고장이 아니라 조용한 밤이었습니다. 한 해에 여드레쯤 이런 날이 옵니다.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* ⚠️⚠️ **숫자보다 이 문장이 먼저다.** 이걸 빼고 수치부터 늘어놓으면 화면 전체가
                  무슨 말인지 안 읽힌다 — 내용을 아는 사람도 못 읽었다(2026-09-02). 아래 카드의
                  두 줄(미국 등락 / 국내 평균)이 무엇과 무엇인지를 여기서 한 번 밝혀야 그 뒤로
                  나오는 조각들이 문장으로 붙는다. */}
              {/* ⚠️ "코스피보다 얼마나" 같은 말을 쓰지 말 것. 지수 대비 초과분은 코드 안 개념이고,
                  화면이 내는 숫자는 **그 종목이 실제로 몇 % 열렸나** 다. 문장도 그렇게 적는다. */}
              <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
                미국 종목이 평소보다 크게 움직인 날, 그 회사와 사업으로 엮인 국내 종목이 다음 날 아침 몇 %에
                열렸는지를 최근 5년치로 세어 보여 드립니다.
              </p>
              {biggest && (
                <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
                  밤사이 {moverCount}곳이 평소보다 크게 움직였습니다. 그중 제일 큰 것은{" "}
                  <strong style={{ color: C.ink, fontWeight: 700 }}>{biggest.usName}</strong>
                  {josa(biggest.usName, "으로", "로")},{" "}
                  {/* ⚠️ 여기에 {" "} 를 넣지 말 것. 조사는 앞말에 붙는다 — "+2.89% 로" 가 아니라
                      "+2.89%로" 다(2026-09-03 지적). JSX 는 줄바꿈 뒤 여는 공백을 지우므로
                      **아무것도 안 넣는 것이 붙여 쓰는 것**이다. 낱말 사이를 띄울 때만 넣는다. */}
                  <strong style={{ color: biggest.dp > 0 ? HOT : COLD, fontWeight: 700 }}>{PCT(biggest.dp)}</strong>
                  로 평소 하루에 움직이던 폭의 {biggest.z.toFixed(1)}배였습니다.
                </p>
              )}
              {strongest && (
                <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
                  {/* ⚠️ %p 를 문장에 쓰지 말 것. 지수 대비 초과분이라 읽는 사람에게 뜻이 안 선다.
                      화면 어디에서나 **그 종목이 실제로 몇 %에 열렸나** 로 적는다. */}
                  국내에서 가장 크게 따라갔던 곳은{" "}
                  <strong style={{ color: C.ink, fontWeight: 700 }}>{strongest.l.stock}</strong>
                  {/* ⚠️ 관계 이름과 조사를 두 칸으로 나누지 말 것. 줄바꿈을 사이에 두면
                      JSX 가 공백을 지워 붙긴 하지만, 읽는 사람이 붙는지 뜨는지 알 수 없다.
                      한 식으로 이어 붙여 **눈에 보이는 대로** 둔다. */}
                  입니다. {strongest.m.usName}에 {strongest.l.why + euro(strongest.l.why)} 엮여 있는데,
                  최근 5년 이만큼 움직인 날 이 종목은
                  아침에 평균{" "}
                  <strong style={{ color: (strongest.l.krOpen ?? 0) > 0 ? HOT : COLD, fontWeight: 700 }}>
                    {strongest.l.krOpen == null ? "—" : PCT(strongest.l.krOpen)}
                  </strong>
                  에 열렸습니다.
                </p>
              )}
              {crowded && crowded[1] > 1 && (
                <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.75, wordBreak: "keep-all" }}>
                  <strong style={{ color: C.ink, fontWeight: 700 }}>{crowded[0]}</strong>
                  {josa(crowded[0], "은", "는")} 밤사이 크게 움직인 미국 종목 {crowded[1]}곳과 한꺼번에 엮입니다.
                </p>
              )}
            </div>
          )}
          {/* ⭐ **최종 업데이트는 이 저장소의 공용 어법이다**(시장 브리핑·카더라와 같은 모양:
              schedule 아이콘 + `formatKstUpdate`). 값은 그날 줄의 `created_at` 이고, 수집기가
              그날 것을 통째로 갈아 끼우므로 그게 곧 마지막 실행 시각이다.
              ⚠️ `formatKstUpdate` 는 예정 시각(오전 9시·오후 8시) ±2시간이면 그 정각으로
              스냅한다. 아침 자동 실행은 07:35 쯤 끝나 "오전 9시 기준" 이 되고, 손으로 돌린
              실행은 스냅에서 벗어나 "오후 3시경" 처럼 실제 시각이 적힌다 — 그게 맞는 동작이다.

              ⚠️⚠️ 여기 **"움직임은 대부분 개장 순간에 끝납니다 · 매수·매도 신호가 아닙니다"**
              가 있었다(2026-09-03 에 최종 업데이트로 바뀜). 그 고지를 통째로 없앤 게 아니라
              **시트 맨 아래 각주가 그대로 들고 있다** — 그 각주를 지우면 화면에서 '신호 아님'
              이 사라진다. 절대 지우지 말 것.

              ⚠️ **칸의 직계 자식이어야 한다.** 안쪽 래퍼에 두면 marginTop:auto 가 래퍼 안에서만
              놀아 칸 바닥까지 안 밀리고, 옆 칸과 높이가 어긋난다(2026-09-02 실측). */}
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 7,
                        paddingTop: 10, borderTop: "1px solid var(--c-sheet-row)" }}>
            <Icon name="schedule" style={{ fontSize: 14, color: C.muted }} />
            {/* ⚠️ lineHeight 를 빼지 말 것. 이 줄만 아이콘과 나란히 서는 flex 라 줄 상자가
                작아지고, 그러면 기준선이 옆 두 칸보다 3px 내려앉는다(2026-09-03 실측).
                옆 칸 설명과 같은 1.6 을 줘야 셋이 같은 줄에 앉는다. */}
            <span style={{ fontSize: 11.5, lineHeight: 1.6, color: C.sub }}>
              최종 업데이트 · {updatedAt ? formatKstUpdate(updatedAt) : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* ── 타일 벽 ────────────────────────────────────────────────────────
          ⭐ 구간 배지를 **이제는 쓴다.** 2026-09-02 에는 "가를 것이 없는데 배지 하나만 떠
          있어 어색하다" 며 뺐는데, 09-03 에 위에 시트가 하나 더 생기면서 그 이유가 사라졌다.
          가르는 것은 성격이다 — 위는 그 종목 자신의 **지금 값**이고 여기는 **과거 기록**이다.
          ⚠️ 배지가 하나만 남게 되면 다시 뺄 것.

          ⚠️ 섹터로 시트를 나누지도 말 것. 섹터마다 종목이 1~5 라 상자 키가 제각각이 되고,
          짝지어 세우면 짧은 쪽 바닥이 빈다. 섹터는 타일 위 작은 라벨로 남긴다.

          ⚠️⚠️ **desc 를 달지 말 것.** 예전엔 여기에 "윗줄은 …, 아랫줄은 …" 이라고 읽는 법을
          적었는데, **그 설명이 있어야 읽히는 카드면 이미 진 것이다.** 타일이 스스로
          말하도록 고친 뒤로는 필요가 없어졌다. 다시 적고 싶어지면 카드를 고칠 때다. */}
      {/* ⚠️ 배지는 **시트 제목과 다른 말**이어야 한다. 제목("미국과 엮인 국내 종목")이
          무엇을 모아 뒀는지 말하고, 배지는 그게 어떤 성격의 이야기인지 한 마디로 짚는다.
          한때 "과거 기록" 이었는데 그건 자료를 분류한 말이지 읽는 사람의 말이 아니었다. */}
      <SectionCaps label="미장의 여파" />
      <section className="hz-sheet">
        {/* ⚠️ desc 를 비워 두지 말 것. 이 저장소의 시트 머리는 어디서나 제목 + 부제 한 줄이라,
            여기만 없으면 카드가 덜 만들어진 것처럼 보인다(2026-09-02 지적).
            ⚠️⚠️ 다만 **읽는 법을 적는 자리가 아니다.** 한때 "윗줄은 …, 아랫줄은 …" 이라고
            사용법을 적었는데, 그 설명이 있어야 읽히는 카드면 이미 진 것이다. 무엇을 모아
            둔 자리인지만 적는다.

            ⚠️⚠️ **제목은 짧게.** "간밤 크게 움직인 곳과 이어진 국내 종목"(20자)이었다.
            이 저장소의 시트 제목은 "급부상 종목"·"이슈 키워드"·"임원이 신고한 매매" 처럼
            대개 열 자 안팎이고, 긴 제목은 오른쪽 알약과 한 줄을 다투다 좁은 화면에서 먼저
            눌린다(SectionHead 주석의 375px 실측). '간밤' 은 히어로 첫 칸이 이미 말한다.

            ⚠️⚠️ **관계를 낱말만 나열하지 말 것.** 부제가 "납품·고객·같은 업종·기술이전"
            이었는데 동사가 없어 걸러 낸 조건표처럼 읽혔고, '고객' 은 누가 누구의 고객인지도
            모호했다(2026-09-03 지적). 여기는 **왜 이 국내 종목이 저 미국 종목 밑에 붙어
            있는지**를 한 문장으로 말하는 자리다. 쌍마다 다른 개별 관계는 타일 안 `l.why`
            꼬리표가 이미 붙이므로 여기서 다 셀 이유가 없다.

            ⚠️ **부제는 이제 고정 문구가 아니다** — `sheetDesc()` 가 그날 뜬 관계를 세어
            짓는다. 왜 그렇게 했는지는 그 함수 주석에 있다. 문구를 손볼 일이 있으면 여기가
            아니라 거기다. */}
        {/* ⚠️ level={2} 를 빼지 말 것. 기본값 3 은 시트 위에 구간 제목(h2)이 한 겹 더 있는
            화면(내부자·홈)에 맞춘 값이다. 이 화면은 그 겹이 없어서 h3 를 쓰면 히어로 칸
            제목(h2)의 하위처럼 읽힌다. 시장 브리핑·카더라도 같은 자리에서 h2 다. */}
        <SectionHead
          level={2}
          icon="call_split"
          title="미국과 엮인 국내 종목"
          note={moverCount ? `미국 ${moverCount}종목 · 국내 ${stockCount}종목` : undefined}
          desc={sheetDesc(movers.flatMap((m) => m.links))}
        />
        {wall.length === 0 ? (
          <p style={{ margin: 0, padding: "20px 22px", fontSize: 13, lineHeight: 1.75, color: C.sub, wordBreak: "keep-all" }}>
            밤사이 크게 움직인 종목이 없어 이어 붙일 자리도 없습니다. 한 해에 여드레쯤 이런 날이 옵니다.
          </p>
        ) : (
          <>
            <div className="hz-panelgrid hz-panelgrid-2">
              {wall.map((m) => (
                <MoverPanel key={m.ticker} m={m} />
              ))}
            </div>
            {/* ⭐ **이 목록이 날마다 바뀐다는 것**만 각주로 낸다.

                2026-09-03 에는 각주 띠를 아예 떼기로 했었다. 그때 후보였던 말들이("개장·장 중·
                종가 모두 최근 5년 평균입니다" 따위) **이미 타일 안에 있는 사실을 열세 번째로
                되풀이**했기 때문이다. 그 판단은 그 문구들에 대해서는 지금도 맞다.
                ⛔ 그러니 여기에 표본 크기·대조군·사전 규모·5년 평균을 도로 적지 말 것.
                ⛔ '매수·매도 신호가 아니다' 고지도 여기 적지 말 것 — 전역 푸터가 한다.
                ⭐ 이 한 줄만 다른 이유: **화면 어디에도 없는 사실**이라서다. 머리의 알약은
                  "미국 8종목 · 국내 12종목" 이라고 오늘 숫자만 말하고, 타일은 저마다 자기
                  종목만 말한다. 그래서 읽는 사람은 이 열두 곳이 **늘 같은 목록**인 줄 안다.
                  실측(2026-09-04): 최근 여섯 날이 하루 4~19곳으로 오르내렸고, 9/1 과 9/2 는
                  겹치는 종목이 둘뿐이었다. */}
            <div className="hz-sheet-foot" style={{ marginTop: "auto" }}>
              {/* ⚠️ 안쪽에 세로 padding 을 주지 말 것 — 띠가 이미 위아래 11px 을 들고 있다
                  (globals.css 의 .hz-sheet-foot 주석 참고). */}
              {/* ⚠️ 폰(375)에서 이 띠의 글 칸은 343px 이고, 12px 글자로 **37자가 310px** 이다
                  (실측 2026-09-04). 지금 문구는 49자 413px 이라 폰에서 두 줄이고 띠가 44 → 64px 이
                  된다 — 알고 쓰는 것이다. 한 줄로 되돌리려면 37자 아래로 줄여야 한다.
                  ⚠️ 처음 쓴 98자짜리는 폰에서 세 줄(83px)이었다. 거기까지 늘리지 말 것. */}
              <span style={{ fontSize: 12, lineHeight: 1.6, color: C.sub, wordBreak: "keep-all" }}>
                고정된 목록이 아닙니다. 그날 평소보다 크게 움직인 종목만 남고 목록이 날마다 바뀝니다.
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── 해외에서 거래 중인 값 ───────────────────────────────────────────
          ⚠️ **이 시트는 위 것 뒤다**(2026-09-03 에 앞뒤를 바꿨다). 처음엔 "그 종목 자신의
          값이니 가까운 것을 먼저" 라며 앞에 뒀는데, 그러면 히어로(밤사이 뉴욕 → 크게 움직인
          미국 종목 → 브리핑)에서 이어지던 이야기가 한 번 끊긴다. 위 시트가 히어로의 연장이고
          이건 다른 축이라 뒤가 맞다.
          ⚠️ 자료가 없는 날(수집 실패·표 없음)에는 시트째 그리지 않는다. 빈 시트를 남기면
          고장으로 읽힌다 — 아래 시트는 그날도 자기 할 말이 있다. */}
      {overnight.rows.length > 0 && (
        <SectionCaps label="개장 전 지금" />
      )}
      {overnight.rows.length > 0 && (
        <section className="hz-sheet">
          {/* ⭐ '시점' 알약은 살아 있는 값일 때 **날짜와 분까지** 적는다("9/4 오전 2:40 시점").
              10분마다 새로 받으므로 "오후 8시" 로 뭉개면 방금 값인지 두 시간 전 값인지 구별이
              안 되고, 날짜가 없으면 새벽에 어제 것인지 오늘 것인지가 안 갈린다.
              담아 둔 값으로 물러선 날에는 집안 어법(formatKstUpdate)을 쓴다 — 그쪽은 이미
              연·월·일과 요일을 다 적는다(그때는 아침 실행 시각이다).

              ⭐ 환율은 **부제에 한 번만** 적는다(2026-09-03). 카드마다 되풀이하면 종목 셋에
              같은 숫자가 세 번 나오는데, 환율은 그날 하나뿐이라 카드의 값이 아니라 이 시트
              전체의 전제다.
              ⚠️ 원 단위로 반올림한다. 카드의 원화 값이 이미 원 단위라 여기만 소수점을 적으면
              정밀도가 어긋나 보인다. */}
          <SectionHead
            level={2}
            icon="schedule"
            title="해외에서 거래 중인 값"
            note={
              overnight.capturedAt
                ? overnight.live
                  ? `${kstStamp(overnight.capturedAt)} 시점`
                  : `${formatKstUpdate(overnight.capturedAt).replace(" 기준", "")} 시점`
                : undefined
            }
            desc={`국장이 닫힌 동안 해외 무기한선물에서 거래된 값입니다. 환율 ${Math.round(
              // ⚠️ 환율은 **하루에 하나**다(수집기가 실행마다 한 번 받아 모든 줄에 같은 값을
              //    넣는다). 그래서 어느 줄에서 꺼내도 같지만, 줄 순서가 거래대금 순이라
              //    rows[0] 은 날마다 다른 종목이다 — 가장 큰 값을 집어 뜻을 못박는다.
              Math.max(...overnight.rows.map((r) => r.fx)),
            ).toLocaleString("ko-KR")}원 기준입니다.`}
          />
          {/* ⚠️ 여기는 **3열**이다(아래 미국 타일 벽은 2열). 종목이 셋뿐이라 2열이면 둘째 줄에
              한 장만 남아 오른쪽이 빈다. 좁은 화면에서는 globals.css 가 1120 아래에서 2열,
              700 아래에서 1열로 알아서 접는다. */}
          <div className="hz-panelgrid hz-panelgrid-3">
            {overnight.rows.map((r) => (
              <OvernightPanel key={r.code} r={r} />
            ))}
          </div>
        </section>
      )}

    </>
  );
}

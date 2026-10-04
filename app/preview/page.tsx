import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getKrIndexClosesSide } from "@/lib/data";
import { formatKstSnappedShort, formatKstUpdateSnapped } from "@/lib/format";
import { getOvernightLive, type OvernightData, type OvernightRow } from "@/lib/kr-overnight";
import { getPreview, sessionWord, type PreviewLink, type PreviewMover } from "@/lib/kr-preview";
import { assertLoaded, isLoadFailed } from "@/lib/load-state";
import { stockHref } from "@/lib/stock-page";

import { loadPreviewCoverChips } from "../kadera/cover-chips";
import { CoverIndexCell, CoverLinkCell, CoverMeta, Module } from "../kadera/V2Modules";
import { KOSPI_AFTER } from "../kr-preview-table";
import { PREVIEW_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { PREVIEW_PUBLIC } from "../screen-flags";
import { StockLogo } from "../StockLogo";

/**
 * 국장 미리보기 — 간밤 미장에서 크게 움직인 종목이 오늘 아침 국내 어디와 엮이는지.
 *
 * 재료는 `data-pipeline/config/us_kr_pairs.py`(관계 158쌍 · 5년 실측)이고, 계산은 전부
 * 파이프라인이 개장 전에 끝내 표에 넣는다. 여기서는 그리기만 한다.
 *
 * ## v2(2026-10-03) — 카더라 · 시장 브리핑 · 테마 판세와 같은 규칙
 *
 * 첫 줄 띠(지수 종가 · 국장 · 미장 급부상 링크 칸 · 업데이트) → 둘째 줄 [밤사이 뉴욕 | 해외에서 거래 중인 값 | 오늘의 브리핑]
 * → 엮인 국장 종목 표(판 폭). 페이지 제목 · 구간 제목('01 미장의 여파') · 시트 부제 · 각주는 걷었다(v2 는 모듈 머리 띠가 이름을 말한다).
 *   · 해외 값을 맨 아래에서 둘째 줄로 올렸다 — 그날 개장 갭과 상관 0.94~0.97 이라 개장 전에 가장 쓸모 있는 값인데 1,440 에서 1,900px 아래였다.
 *   · '밤사이 가장 크게 움직인 곳' 네 줄은 걷었다 — 아래 표가 같은 순서(평소 폭 대비 큰 순)라 표 첫 네 묶음과 같은 말이었다.
 *   · 미장 종목 타일 2열(카드 다섯 장)은 표 하나로 — 종목 수가 1~7 로 달라 짝 타일 바닥이 305px 비었고, 국장 종목끼리 열이 안 맞았다.
 *   · 브리핑 첫 문단("…최근 5년치로 세어 보여 드립니다")은 화면 설명이라 걷고, 나머지 셋은 시장 브리핑처럼 이름표 줄로.
 *
 * ## 이 화면이 파는 것은 예보가 아니라 해설이다
 *
 * ⚠️⚠️ **효과는 거의 다 개장 갭에서 끝난다.** 사용자가 09:00 에 무엇을 하려는 순간 이미
 * 지나간 일이다. 그래서 '장 중' 숫자를 늘 함께 낸다 — 그 숫자가 0 언저리인 것이 이 화면이 예보가
 * 아니라는 증거다(밤사이 뉴욕 모듈 · 표의 장 중 칸). ⛔ 장 중 칸을 빼지 말 것.
 * ⚠️ 이 화면 안에는 '매수·매도 신호가 아니다' 라는 고지가 **없다**. 투자 유의사항(/disclaimer, 모든
 * 화면의 푸터가 가리킨다)이 그 고지를 한다.
 *
 * ⚠️ 크기로 재면 대조군을 뺀 순수 몫이 개장 +0.548% · 장중 +0.178% 로 **장중이 24.5%** 다(2026-09-03
 * 재측정). 화면에 "개장에서 끝납니다" 라고 단정해 적지 말 것 — "대부분" 이다.
 *
 * ⚠️ **적중률로 말하지 않는다.** 2026 년에 세 분기 연속 적중률이 55%·52%·60% 로 떨어진
 * 적이 있는데, 신호 크기는 오히려 커졌고(+2.15% → +3.38%) 코스피 개장 폭이 0.9% → 2.3%
 * 로 뛴 게 원인이었다. 잡음이 오르면 적중률만 무너진다. 크기와 횟수로 말하면 그 국면에서도
 * 안 깨진다.
 *
 * ⚠️ 원본 상관은 51,626쌍 중 98.3% 가 양수다 — 쌍은 지수 몫을 빼고 골랐다. 그래서 밤사이 뉴욕 모듈의
 * 코스피 세 줄(같은 구간 평균)이 표 숫자의 기준선 노릇을 한다. ⛔ 그 세 줄을 지우지 말 것.
 *
 * ⚠️⚠️ **화면 글자는 "밤사이" 다. "간밤"·"어젯밤" 으로 되돌리지 말 것.** 두 번 고친 자리다
 * (2026-09-03).
 *   · "간밤" 은 증권가 기사에서 흔하지만 "살면서 몇 번 못 봤다" 는 지적을 받았다.
 *   · "어젯밤" 은 **틀린 말이었다.** 미장은 한국 시각 22:30(겨울 23:30)에 열려 **05:00
 *     (겨울 06:00)에 닫는다** — 화면이 내는 종가는 어젯밤이 아니라 **오늘 새벽** 것이다.
 *   · "밤사이" 는 새벽까지 덮고, 명사라서 "밤사이 뉴욕" 처럼 이름 앞에도 선다.
 * 주말 · 연휴 뒤에는 그 자리가 "금요일" · "연휴 동안" 이 된다(sessionWord).
 * **주석과 DB 코멘트의 '간밤' 은 그대로 둔다** — 거기는 코드 안 말이다.
 */

/**
 * 화면 사본(ISR)의 수명. 루트 기본값(1시간)보다 짧은 건 밤사이 시세가 10분마다 새로 오기
 * 때문이다(lib/kr-overnight.ts REVALIDATE_SEC). ⚠️ 리터럴이어야 한다.
 */
export const revalidate = 600;

/** ⛔ 여는 스위치는 `app/screen-flags.ts` 한 곳이다(2026-09-04 열림). */
const PUBLIC = PREVIEW_PUBLIC;

/** 배포된 곳인가. Vercel 에서만 `VERCEL_ENV` 가 있고 로컬에는 없다 — 그래서 로컬에서는
 *  PUBLIC 이 false 여도 그대로 보인다(만드는 중에 봐야 하니까). */
const DEPLOYED = Boolean(process.env.VERCEL_ENV);

export async function generateMetadata(): Promise<Metadata> {
  // ⚠️ **await 를 빼지 말 것.** 여기는 robots 를 얹으려고 펼친다 — 안 기다린 프라미스를 펼치면
  // 빈 객체가 되고, 제목·설명·canonical 이 통째로 루트 것으로 떨어진다(2026-09-03 실제로 그랬다).
  const meta = await pageMetadata({
    title: "국장 미리보기 | hatzze",
    description:
      "밤사이 미장에서 크게 움직인 종목과 사업으로 엮인 국장 종목을 개장 전에 잇습니다. 최근 5년, 그런 날 국장이 몇 %에 열려 몇 %로 닫았는지를 함께 봅니다.",
    path: "/preview",
    ownImage: PREVIEW_CARD.alt,
  });
  return PUBLIC ? meta : { ...meta, robots: { index: false, follow: false } };
}

/**
 * 종목 이름 뒤에 붙일 **조사만** 돌려준다. 이름은 매일 바뀌어 고정 문구면 "엔비디아은" 이 나온다.
 * 한글이 아닌 이름(ASML·KT&G)은 받침 있는 쪽으로 보낸다 — 자음으로 끝나는 약어가 대부분이다.
 * ⚠️ "으로 / 로" 에는 쓰지 말 것 — ㄹ 받침은 "로" 다(아래 euro). 2026-10-03 까지 브리핑이
 *    이걸로 "웨스턴디지털으로" 를 냈다.
 */
function josa(word: string, withJong: string, withoutJong: string): string {
  const last = word.trim().slice(-1).charCodeAt(0);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  const hasJong = !hangul || (last - 0xac00) % 28 !== 0;
  return hasJong ? withJong : withoutJong;
}

/**
 * "으로 / 로". 받침이 없거나 ㄹ 이면 "로"("카메라 모듈로" · "웨스턴디지털로").
 * ⚠️ 한글이 아닌 이름은 **"로"** — 사전의 ADC·FPCB·SMR·RNA 는 소리내면 씨·비·알·에이로 끝난다.
 */
function euro(word: string): string {
  const last = word.trim().slice(-1).charCodeAt(0);
  if (last < 0xac00 || last > 0xd7a3) return "로";
  const jong = (last - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}

const PCT = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number | null | undefined) => (n == null || n === 0 ? "" : n > 0 ? " is-up" : " is-down");

/**
 * 미장 세션 날짜를 "9/4(금)" 으로. 미장이 쉰 날 '마지막 거래일' 에만 쓴다.
 * ⚠️ 이 날짜는 **미 동부 달력의 날**이라 시각이 없다. KST 로 옮기지 말 것 — UTC 자정으로 읽고 UTC 요일.
 */
const sessionDay = (iso: string) =>
  `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}(${"일월화수목금토"[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

/** "2026-10-02" → "10/2" */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/**
 * 24시간 거래대금($). 백만 달러 단위로 적되 **1M 이 안 되는 마켓을 0M 으로 뭉개지 않는다.**
 * ⚠️ 2026-09-06 현대차가 실제로 $102,986(0.10M)였는데 "$0M" 이라 떠 거래가 없던 것처럼 읽혔다.
 *    1M 이상은 정수, 그 아래는 소수 한 자리, 0.1M 도 안 되면 상한만("<$0.1M"). 진짜 0 은 "$0M".
 */
const VOL = (v: number | null) => {
  if (v == null) return "없음";
  if (v <= 0) return "$0M";
  const m = v / 1e6;
  if (m >= 1) return `$${Math.round(m).toLocaleString("en-US")}M`;
  if (m >= 0.1) return `$${m.toFixed(1)}M`;
  return "<$0.1M";
};

/** 하이퍼리퀴드에 이 마켓들을 띄운 빌더의 이름. 저장된 심볼의 접두사(`xyz:SMSN`)이고 주소에는 그대로 쓴다.
 *  ⚠️ `data-pipeline/scripts/fetch_kr_overnight.py` 의 `DEX` 와 같은 값이다. */
const HL_DEX = "xyz";

/**
 * 이 화면의 자료가 **실제로 쓰이는 시각**(KST). `formatKstUpdateSnapped` 가 이 정각에 붙인다.
 *   HERO_HOURS   종목 줄은 파이프라인 **맨 앞 스텝**이라 07시다(06:31 에 쓰여도 2시간 안이라 7시에 붙는다).
 *   PERP_HOURS   하이퍼리퀴드는 **KRX 08:00 게이트 바로 뒤**라 아침 08시 · 저녁 18시다
 *                (실시간을 못 받아 담아 둔 값으로 물러선 날에만 쓰인다).
 * ⚠️ 스텝 자리를 옮기면 이 값도 함께 옮길 것. 라벨은 조용히 틀린다.
 */
const HERO_HOURS = [7] as const;
const PERP_HOURS = [8, 18] as const;

/**
 * 살아 있는 값의 '시점' 표기 — "9/4 오전 2:40".
 * ⚠️⚠️ **날짜를 ISO 문자열에서 잘라 쓰지 말 것.** `capturedAt` 은 UTC 라 한국 새벽에는 하루 전 날짜가 나온다.
 * ⚠️ 시·분과 **같은 포매터**에서 뽑는다 — 따로 만들면 자정 언저리에서 둘이 다른 날을 가리킨다.
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

/* ── 둘째 줄 ─────────────────────────────────────────────────────────────── */

/**
 * 밤사이 뉴욕 — S&P 500 과, 최근 5년 같은 구간에 든 아침의 코스피(개장 · 장 중 · 종가).
 * ⭐ 간밤 S&P 와 코스피 **개장 갭**의 상관은 0.547 인데 **장중**과는 0.018 이다 — 장 중 줄이 어느 구간에서나
 *    0 언저리인 게 이 화면이 예보가 아니라 개장 해설인 증거다. ⛔ 장 중 줄을 빼지 말 것.
 * ⚠️ 미장이 쉰 날은 큰 숫자 대신 "휴장" — 그날 spx 는 마지막 거래일 것이라 크게 두면 밤사이 움직임으로 읽힌다.
 *    그 값은 바닥 줄로 내린다.
 */
function NightModule({
  when,
  spx,
  usHoliday,
  usSession,
}: {
  when: string;
  spx: number | null;
  usHoliday: string | null;
  usSession: string | null;
}) {
  // 간밤 S&P 가 든 구간의 과거 코스피. ⚠️ 미장이 쉰 날은 고르지 않는다 — 그날 spx 의 움직임은 전날 개장에서 이미 끝났다.
  const after = spx == null || usHoliday ? null : (KOSPI_AFTER.find(([lo, hi]) => spx >= lo && spx < hi) ?? null);
  return (
    <Module id="night" title={`${when} 뉴욕`} meta="S&P500">
      <div className="v2-pv-night">
        <div className="v2-pv-big">
          <b className={usHoliday ? undefined : tone(spx).trim() || undefined}>{usHoliday ? "휴장" : spx == null ? "없음" : PCT(spx)}</b>
          {usHoliday && <span>{usHoliday}</span>}
        </div>
        {after ? (
          <dl className="v2-pv-after">
            {/* ⚠️ 횟수("189번 뒤")가 아니라 기간(최근 5년)으로 — 사람이 아는 단위는 기간이다(2026-09-02).
                날 수(231일)는 걷었다 — 무엇을 센 날인지 안 읽혔다(2026-10-04 지적). '이런 날'이 위 큰 숫자를 가리킨다. */}
            <div className="v2-pv-after-head">
              <dt>최근 5년 이런 날 코스피</dt>
            </div>
            {/* ⭐ 라벨은 개장 · 장 중 · 종가(2026-09-02 확정). '개장 뒤'로 쓰지 말 것 — 개장 직후로 읽힌다. 아래 표와 같은 말이다. */}
            {([["개장", after[3]], ["장 중", after[4]], ["종가", after[5]]] as const).map(([label, v]) => (
              <div key={label} className="v2-pv-after-row">
                <dt>{label}</dt>
                <dd className={tone(v).trim() || undefined}>{PCT(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="v2-pv-night-foot">
            {usHoliday ? (
              <>
                마지막 거래일{usSession ? ` ${sessionDay(usSession)}` : ""} S&amp;P500{" "}
                <b className={tone(spx).trim() || undefined}>{spx == null ? "없음" : PCT(spx)}</b>
              </>
            ) : (
              "과거 같은 구간을 고를 자료를 아직 못 받았습니다"
            )}
          </p>
        )}
      </div>
    </Module>
  );
}

/**
 * 해외에서 거래 중인 값 — 국내 장이 닫힌 동안 해외 무기한선물(하이퍼리퀴드)에서 붙은 값. 종목 하나가 한 줄이다.
 *
 * ⚠️⚠️ **"오를 것" 으로 쓰지 말 것.** 이 값은 실측으로 그날 개장 갭과 상관 0.94~0.97 에 기울기 1.0 이라,
 * 사실상 개장가를 미리 아는 것에 가깝다. 그래서 더 조심한다 — "밖에서는 지금 얼마에 거래되고 있다" 는 사실만 적는다.
 * ⚠️ **견준 종가의 날짜를 함께 낸다**(값 칸 아래 'M/D 종가'). 그 종가가 직전 영업일 것이 아니면 퍼센트는 거짓인데
 *    화면에서는 그럴듯해 보인다. 날짜가 있어야 읽는 사람이 스스로 알아챈다.
 * ⚠️⚠️ **"국장 대비" 머리를 지우지 말 것.** 시장이 둘이라(해외 선물 · 국내 종가) 라벨이 없으면 퍼센트가
 *    선물의 하루 등락으로 읽힌다.
 * ⚠️ 출처를 지우지 말 것 — 국내 거래소 값이 아니다. 거래소 이름은 머리 근거(Hyperliquid)에, 마켓 심볼은 이름 아래
 *    링크로 둔다. ⚠️ 심볼의 `xyz` 는 마켓을 띄운 **빌더의 이름**이라 화면에선 떼고, 주소 · GA 에는 그대로 쓴다
 *    (⛔ 주소까지 바꾸지 말 것 — 그 사이트에 없는 마켓이 된다).
 * ⭐ 환율은 머리에 한 번만(그날 하나뿐인 값이라 줄마다 되풀이하지 않는다). 달러 표시가는 걷었다(원 값 ÷ 환율, 2026-10-03).
 */
function OvernightModule({ overnight }: { overnight: OvernightData & { live: boolean } }) {
  const at = overnight.capturedAt
    ? overnight.live
      ? `${kstStamp(overnight.capturedAt)} 시점`
      : `${formatKstSnappedShort(overnight.capturedAt, PERP_HOURS)} 시점`
    : null;
  // ⚠️ 환율은 하루에 하나다(수집기가 실행마다 한 번 받아 모든 줄에 같은 값을 넣는다). 줄 순서가 거래대금 순이라
  //    rows[0] 은 날마다 다른 종목이다 — 가장 큰 값을 집어 뜻을 못박는다. 원 단위로 반올림(카드 값이 원 단위다).
  const fx = Math.round(Math.max(...overnight.rows.map((r) => r.fx)));
  return (
    <Module id="perp" title="해외에서 거래 중인 값" meta={["Hyperliquid", at].filter(Boolean).join(" · ")} aside={`환율 ${fx.toLocaleString("ko-KR")}원`} className="v2-pv-perpmod">
      <div className="v2-tbl v2-pv-perp">
        <div className="v2-pv-th">
          <span>종목</span>
          <span>해외 값</span>
          {/* '국장 대비'면 국장 종가와 견준 것으로 읽힌다 — '종가'까지 풀어 쓰면 길기만 했다(2026-10-04 지적). */}
          <span>국장 대비</span>
          <span>24시간 거래</span>
        </div>
        <ol className="v2-tbody">
          {overnight.rows.map((r) => (
            <li key={r.code}>
              <PerpRow r={r} />
            </li>
          ))}
        </ol>
      </div>
    </Module>
  );
}

function PerpRow({ r }: { r: OvernightRow }) {
  const won = Math.round(r.krw - r.prevClose);
  return (
    <div className="v2-tr">
      <span className="v2-td-stock">
        <StockLogo code={r.code} name={r.name} market="KOSPI" size={24} />
        <span className="v2-pv-name">
          {/* 이름은 아래 엮인 국장 종목 표처럼 종목 화면으로 잇는다. */}
          <Link href={stockHref(r.code)} className="v2-pv-stock" data-ga="cta_click" data-ga-cta="stock" data-ga-surface="preview_perp">
            {r.name}
          </Link>
          {/* 심볼이 곧 출처 링크다. 파랗게 칠하지 않고 화살표도 달지 않는다 — 세 줄마다 같은 아이콘이 섰다(2026-10-04 점검). 호버 밑줄로 알린다. */}
          <a
            className="v2-pv-sym"
            href={`https://app.hyperliquid.xyz/trade/${r.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            data-ga="preview_perp_click"
            data-ga-symbol={r.symbol}
          >
            {r.symbol.replace(`${HL_DEX}:`, "")}
          </a>
        </span>
      </span>
      <span className="v2-td-two" data-k="해외 값">
        <b>{r.krw.toLocaleString("ko-KR")}원</b>
        <em>
          {md(r.prevCloseDate)} 종가 {r.prevClose.toLocaleString("ko-KR")}원
        </em>
      </span>
      {/* 얼마 · 몇 % 는 한 쌍이라 같은 칸에 위아래로. 원에도 단위를 붙인다(옆 % 와 같은 종류로 읽히지 않게). */}
      <span className={`v2-td-two v2-pv-diff${tone(r.diffPct)}`}>
        <b>{PCT(r.diffPct)}</b>
        <em>
          {won > 0 ? "+" : ""}
          {won.toLocaleString("ko-KR")}원
        </em>
      </span>
      <span className="v2-td-num v2-pv-vol" data-k="거래">
        {VOL(r.volumeUsd)}
      </span>
    </div>
  );
}

/**
 * 오늘의 브리핑 — 이름표 줄 셋(시장 브리핑의 v2-brief3 꼴). 문장은 LLM 이 아니라 틀이다 — 재료가 숫자 몇 개라
 * 틀이 고정이고, 이름 뒤 조사만 받침에 맞춘다(josa · euro).
 * ⚠️ "코스피보다 얼마나" · %p 를 쓰지 말 것 — 지수 대비 초과분은 코드 안 개념이다. 화면은 **그 종목이 실제로 몇 %에 열렸나**로 적는다.
 * ⭐ 겹친 곳 줄 — 여러 미국 종목에 동시에 걸린 국내 종목. 표에선 묶음마다 흩어져 안 보인다(대한항공이 부킹홀딩스 ·
 *    사우스웨스트 · 보잉 세 곳에서 같이 밀린 날). 이 줄이 화면에서 유일하게 그걸 말한다.
 */
function BriefModule({
  when,
  usHoliday,
  moverCount,
  movers,
}: {
  when: string;
  usHoliday: string | null;
  moverCount: number;
  movers: PreviewMover[];
}) {
  const biggest = movers.reduce<PreviewMover | null>((a, m) => (!a || Math.abs(m.dp) > Math.abs(a.dp) ? m : a), null);
  const strongest = movers
    .flatMap((m) => m.links.map((l) => ({ m, l })))
    // 문장에 적는 값(개장)으로 고른다. 화면에 없는 코스피 대비 초과분(gap)으로 고르면 표에 더 큰 개장 값이 있어
    // '가장 크게'가 틀려 보였다(2026-10-04 한화솔루션 +1.39% · 표의 SK하이닉스 −1.86%).
    .reduce<{ m: PreviewMover; l: PreviewLink } | null>(
      (a, x) => (!a || Math.abs(x.l.krOpen ?? 0) > Math.abs(a.l.krOpen ?? 0) ? x : a),
      null,
    );
  const linkCount = new Map<string, number>();
  for (const m of movers) for (const l of m.links) linkCount.set(l.stock, (linkCount.get(l.stock) ?? 0) + 1);
  const crowded = [...linkCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const crowdedWith = crowded ? movers.filter((m) => m.links.some((l) => l.stock === crowded[0])).map((m) => m.usName) : [];

  return (
    <Module id="brief" title="오늘의 브리핑" className="v2-pv-briefmod">
      {usHoliday ? (
        // ⚠️ '조용한 밤' 문구와 섞지 말 것. 그건 미장이 열렸는데 크게 움직인 곳이 없던 밤이고, 이건 미장이 아예 안 열린 밤이다.
        <p className="v2-pv-briefp">
          밤사이 미장은 {usHoliday}
          {euro(usHoliday)} 열리지 않았습니다. 새로 움직인 종목이 없어 오늘은 이어 붙일 국장 종목도 없습니다.
        </p>
      ) : moverCount === 0 ? (
        <p className="v2-pv-briefp">
          {when} 크게 움직인 종목이 없습니다. 눈여겨보는 미국 종목 가운데 평소 폭을 크게 넘어선 곳이 없었다는 뜻이고, 고장이 아니라
          조용한 밤이었습니다. 한 해에 두세 번 있는 밤입니다.
        </p>
      ) : (
        <dl className="v2-brief3">
          {biggest && (
            <div className="v2-brief3-row">
              <dt>미장</dt>
              <dd>
                {when} {moverCount}곳이 평소 폭을 넘게 움직였습니다. 가장 큰 곳은 <b>{biggest.usName}</b>
                {euro(biggest.usName)} <b className={tone(biggest.dp).trim() || undefined}>{PCT(biggest.dp)}</b>, 평소 폭의 {zx(biggest.z)}배였습니다.
              </dd>
            </div>
          )}
          {strongest && (
            <div className="v2-brief3-row">
              <dt>국장</dt>
              <dd>
                {/* 관계는 표와 같은 꼬리표로 둔다 — '엮여 있어' 같은 술어는 공급 · 경쟁 관계에 안 맞고 문장만 길었다(2026-10-05 점검). */}
                가장 크게 따라간 곳은 <b>{strongest.l.stock}</b>({strongest.m.usName} · {strongest.l.why})입니다. 최근 5년 이런 날 평균{" "}
                <b className={tone(strongest.l.krOpen).trim() || undefined}>{strongest.l.krOpen == null ? "없음" : PCT(strongest.l.krOpen)}</b>에 열렸습니다.
              </dd>
            </div>
          )}
          {crowded && crowded[1] > 1 && (
            <div className="v2-brief3-row">
              <dt>겹친 곳</dt>
              <dd>
                {/* 어느 미장 종목인지 이름으로 — 수만 적으면 표를 뒤져야 했다(2026-10-05 점검). 넷 이상이면 셋 + '등 N곳'. */}
                <b>{crowded[0]}</b>
                {josa(crowded[0], "은", "는")} {crowdedWith.length > 3 ? `${crowdedWith.slice(0, 3).join(" · ")} 등 ${crowdedWith.length}곳` : crowdedWith.join(" · ")}
                {crowdedWith.length > 3 ? "과" : josa(crowdedWith[crowdedWith.length - 1], "과", "와")} 함께 움직입니다.
              </dd>
            </div>
          )}
        </dl>
      )}
    </Module>
  );
}

/** 평소 폭 배수. 문턱(1.0)을 막 넘은 값이 '1.0배'로 찍히면 평소와 같다는 말로 읽혀, 1.5 밑은 소수 둘째 자리(1.04배)까지 적는다. */
function zx(z: number): string {
  return z < 1.5 ? z.toFixed(2) : z.toFixed(1);
}

/* ── 엮인 국장 종목 표 ───────────────────────────────────────────────────── */

/**
 * 미장 종목 한 묶음 = 왼쪽 칸(그 미장 종목, 옅은 면) + 오른쪽 국장 줄들(엮인 종목 · 관계 · 개장 · 장 중 · 종가). 폰은 미장 칸이 묶음 머리 줄.
 * ⛔ 데스크톱도 머리 줄 꼴로 바꿨다가 되돌렸다(2026-10-05 운영자 판단 "바로 전 단계가 더 좋다"). 국장 줄이 여럿인 묶음의 미장 칸 아래는
 *    옅은 면이 메운다(v2.css .v2-pv-us).
 *
 * ⚠️⚠️ 국장 숫자 셋은 **최근 5년, 그 미장 종목이 이만큼(같은 방향) 움직인 날의 평균**이다 — 오늘 일이 아니다.
 *    모듈 머리 근거('최근 5년 이런 날 평균')와 위아래를 가르는 칸 경계가 그 말을 한다(옛 타일은 선과 머리줄로 갈랐다).
 * ⚠️⚠️ 셋을 **다 낸다.** 개장만 있으면 "그 뒤로는 별일 없었다" 를 못 말한다. 하루 전체는 담지 않고 개장과 장 중을 곱해 낸다.
 * ⚠️ '평소 폭의 N배' — 등락률만으로는 큰 움직임인지 알 수 없다(종목마다 평소 폭이 다르다). "평소보다 1.0배" 는
 *    평소와 같다는 말로 읽혀 바꿨다(2026-10-03, 그날 다섯 중 셋이 1.0~1.1배).
 * ⭐ 묶음 순서는 **평소 폭 대비 큰 순**(z) — 등락률로 세우면 늘 변동성 큰 종목만 올라와 "평소와 달랐던 밤" 이 사라진다.
 */
function MoverGroup({ m, when }: { m: PreviewMover; when: string }) {
  return (
    <li className="v2-pv-grp" id={`mv-${m.ticker}`}>
      <div className="v2-pv-us">
        <StockLogo code={m.ticker} name={m.usName} market="US" size={24} />
        <span className="v2-pv-usname">
          <span>
            <b>{m.ticker}</b>
            <em>{m.usName}</em>
          </span>
          <em>{m.sector}</em>
        </span>
        <span className="v2-td-two">
          <b className={tone(m.dp).trim() || undefined}>
            <span className="v2-pv-when">{when} </span>
            {PCT(m.dp)}
          </b>
          <em>평소 폭의 {zx(m.z)}배</em>
        </span>
      </div>
      <ol className="v2-pv-krs">
        {m.links.map((l) => {
          const day = l.krOpen != null && l.krIntra != null ? ((1 + l.krOpen / 100) * (1 + l.krIntra / 100) - 1) * 100 : null;
          return (
            <li key={l.stock}>
              <Link href={stockHref(l.code)} className="v2-pv-kr" data-ga="preview_stock_click" data-ga-symbol={l.code}>
                <span className="v2-td-stock">
                  <StockLogo code={l.code} name={l.stock} market={l.market} size={20} />
                  <span className="v2-td-name">{l.stock}</span>
                </span>
                {/* 관계는 짧은 꼬리표다 — 쌍마다 다른 개별 관계(사전의 why). */}
                <span className="v2-pv-why">{l.why}</span>
                {/* ⛔ 개장 값 갈림 막대를 걷었다 — 축도 이름도 없어 무엇인지 안 읽혔다(2026-10-04 지적). 관계 칸이 남는 폭을 받는다. */}
                <span className="v2-pv-nums">
                  {([["개장", l.krOpen], ["장 중", l.krIntra], ["종가", day]] as const).map(([label, v]) => (
                    <span key={label} className={`v2-td-num v2-td-chg${tone(v)}`} data-k={label}>
                      {v == null ? "없음" : PCT(v)}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

/* ── 화면 ────────────────────────────────────────────────────────────────── */

export default async function PreviewPage() {
  // ⛔ 스위치가 꺼져 있으면 배포된 곳에서는 없는 페이지다 — 사이드바 링크를 지우는 것만으로는 부족하다.
  if (!PUBLIC && DEPLOYED) notFound();

  // ⚠️ 나란히 부른다. 표가 서로 달라 한쪽이 비어도 다른 쪽은 그린다 — 하이퍼리퀴드 표가 없던 날에도 아래 표는 멀쩡해야 한다.
  // 첫 줄의 지수 종가 · 링크 칸 둘은 곁들이는 칸이다(칸 하나가 실패하면 그 칸만 뺀다 — cover-chips 의 scoped).
  const [{ date, updatedAt, spx, sectors, moverCount, usHoliday, usSession, usFrom }, overnight, rawIndexes, coverLinks] = await Promise.all([
    getPreview(),
    getOvernightLive(),
    getKrIndexClosesSide(),
    loadPreviewCoverChips(),
  ]);
  assertLoaded("/preview");
  const indexes = isLoadFailed(rawIndexes) ? null : rawIndexes;

  // "밤사이" 자리에 들어갈 말(sessionWord 주석). ⚠️ 휴장한 날은 늘 "밤사이" 다 — 요일로 바꾸면 "금요일 뉴욕 · 휴장" 처럼
  // 금요일이 쉰 것으로 읽힌다.
  const when = usHoliday ? "밤사이" : sessionWord(date, usSession, usFrom);
  const movers = sectors.flatMap((s) => s.movers);
  const wall = [...movers].sort((a, b) => b.z - a.z);
  const hasOvernight = overnight.rows.length > 0;

  return (
    <div className="hz-tx v2-kd v2-pv">
      {/* 첫 줄 — 지수 종가(어제 국장이 어디서 닫았나) · 개장 전 채널에서 말이 몰리는 종목(국장 · 미장 급부상) · 업데이트 */}
      <div className="v2-cover">
        {indexes && <CoverIndexCell kospi={indexes.kospi} kosdaq={indexes.kosdaq} />}
        {coverLinks.map((c) => (
          <CoverLinkCell key={c.ga} c={c} />
        ))}
        {/* ⚠️ 다른 화면의 30분 눈금이 아니라 HERO_HOURS 정각에 붙인다(06:31 에 쓰여 늘 '오전 7시'). 손으로 밖에서 돌린 실행만 '오후 3시경'. */}
        {/* 근거(미장 N종목 · 국장 N종목)는 걷었다 — 링크 칸 둘 뒤에 붙이면 1,100 · 1,280 · 1,366 에서 업데이트 글자가 혼자 둘째 줄을
            차지해 띠 절반이 비었다(2026-10-05 점검). 같은 수를 브리핑 첫 줄과 표가 말한다. */}
        <CoverMeta updated={updatedAt ? formatKstUpdateSnapped(updatedAt, HERO_HOURS, "업데이트") : "업데이트 준비 중"} />
      </div>

      {/* 둘째 줄 — 밤사이 뉴욕 | 해외에서 거래 중인 값 | 오늘의 브리핑. 해외 값이 없는 날(수집 실패 · 표 없음)은 그 모듈째 빼고 두 칸.
          ⚠️ 빈 모듈을 남기지 말 것 — 고장으로 읽힌다. */}
      <div className={`v2-pv-band${hasOvernight ? "" : " is-pair"}`}>
        <NightModule when={when} spx={spx} usHoliday={usHoliday} usSession={usSession} />
        {hasOvernight && <OvernightModule overnight={overnight} />}
        <BriefModule when={when} usHoliday={usHoliday} moverCount={moverCount} movers={movers} />
      </div>

      {/* 엮인 국장 종목 — 판 폭 표. ⛔ 섹터로 나누지 말 것(섹터마다 종목이 1~5 라 덩어리 키가 제각각). 섹터는 미장 칸의 곁말.
          묶을 미장 종목이 없는 날(휴장 · 조용한 밤)은 모듈째 안 그린다 — 브리핑이 "이어 붙일 국장 종목도 없습니다"를 이미 말한다. */}
      {wall.length > 0 && (
        <Module
          id="links"
          title="함께 움직인 국장 종목"
          meta="최근 5년 이런 날 평균"
          // 국장 줄이 종목 화면으로 가는 링크다(카더라 · 데일리 노트와 같은 가르침 'stock-row' — 한 번 보면 셋 다 끝).
          hint={{ id: "stock-row", anchor: ".v2-pv-krs > li:first-child", text: "종목을 누르면 언급 추이와 요즘 도는 얘기가 나옵니다" }}
        >
          <div className="v2-pv-tbl">
            <div className="v2-pv-grp v2-pv-head">
              <span className="v2-pv-us">{when} 미장</span>
              <span className="v2-pv-kr">
                <span>국장 종목</span>
                <span>관계</span>
                <span className="v2-pv-nums">
                  <span>개장</span>
                  <span>장 중</span>
                  <span>종가</span>
                </span>
              </span>
            </div>
            <ol>
              {wall.map((m) => (
                <MoverGroup key={m.ticker} m={m} when={when} />
              ))}
            </ol>
          </div>
        </Module>
      )}
    </div>
  );
}

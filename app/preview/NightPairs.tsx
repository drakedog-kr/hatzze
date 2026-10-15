import Link from "next/link";

import { sessionWord, type NightPair, type NightPairs } from "@/lib/kr-preview";

import { Module, type CoverLink } from "../kadera/V2Modules";
import { StockLogo } from "../StockLogo";
import { Icon } from "../ui";

/**
 * 국장 종목 화면(/stock/[code])의 '함께 움직이는 미국 종목' — 국장 미리보기의 사전(깊은 쌍)을 종목 하나의 자리에서 본다(2026-10-15).
 * 그 종목에 엮인 미국 종목들의 밤사이 등락과, 그런 밤 이 종목의 5년 평균. 화면 맨 아래 판 폭.
 * ⛔ 미장 종목 화면의 '함께 움직이는 국장 종목' 은 같은 날 걷었다(운영자 지시) — 다시 세우지 말 것.
 *
 * ⭐ 아침에 사람들이 먼저 여는 곳은 자기 종목 화면이다. 미리보기 표에서 종목을 눌러 넘어와도 왜 엮였는지가 그 화면에서 끊겼다.
 * ⭐ **그날 국장 미리보기 표에 선 짝만** 세우고, 숫자 셋(개장 · 장 중 · 종가)은 그 표의 그 줄 값 그대로다 — 어느 화면이든
 *    국장 미리보기에 나온 값만 보인다(2026-10-15 운영자 결정). 최근 5년 이런 날의 평균이고 오늘 일이 아니다.
 *    ⛔ 표에 안 선 짝(평소 폭 1.0배 미만)에 이 화면만의 숫자를 만들지 말 것 — 1.0배 미만 칸을 따로 재 채웠더니 MU −4.10%
 *       (S&P −1.08%) 밤에 SK하이닉스 +0.01% 가 섰다. 초과분이 작은 날 칸은 평범한 날들이라 그날을 말하지 못한다.
 *    그 종목의 짝이 하나도 표에 안 선 밤에는 카드가 빠진다.
 * ⚠️ 장 중 칸을 빼지 말 것 — 개장만 있으면 오를 것으로 읽힌다(미리보기 머리말).
 * ⚠️ 자료는 수집기가 담은 짝 목록 하나(kr_preview_day.pairs)다. 사전 수치를 TS 로 옮기지 않는다.
 */

const PCT = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number | null | undefined) => (n == null || n === 0 ? "" : n > 0 ? " is-up" : " is-down");
const dayOf = (p: NightPair) => (p.open != null && p.intra != null ? ((1 + p.open / 100) * (1 + p.intra / 100) - 1) * 100 : null);
const byZ = (a: NightPair, b: NightPair) => b.z - a.z;
/** 그날 국장 미리보기 표에 선 짝 — 수집기가 표의 그 줄 숫자를 붙인 것만 open 이 있다(fetch_kr_preview.py 의 짝 목록). */
const onTable = (p: NightPair) => p.open != null;

/** 그 국장 종목이 오늘 미리보기 표에 섰으면(평소 폭을 넘은 짝이 있으면) 첫 줄 띠 칸 — 누르면 표의 그 묶음으로. */
export function krNightCover(code: string, night: NightPairs | null): CoverLink | null {
  const top = night?.pairs.filter((p) => p.code === code && onTable(p)).sort(byZ)[0];
  if (!night || !top) return null;
  const n = night.pairs.filter((p) => p.code === code && onTable(p)).length;
  return {
    cap: `${sessionWord(night.date, night.usSession, night.usFrom)} 미장`,
    name: n > 1 ? `${top.us} 외 ${n - 1}곳` : top.us,
    val: PCT(top.dp),
    tone: top.dp > 0 ? "up" : top.dp < 0 ? "down" : "flat",
    href: `/preview#mv-${top.t}`,
    ga: "stock_cover_preview",
  };
}

function Nums({ p }: { p: NightPair }) {
  return (
    <>
      {([["개장", p.open], ["장 중", p.intra], ["종가", dayOf(p)]] as const).map(([label, v]) => (
        <span key={label} className={`v2-td-num v2-td-chg${tone(v)}${v == null ? " is-none" : ""}`} data-k={label}>
          {v == null ? "–" : PCT(v)}
        </span>
      ))}
    </>
  );
}

/** 국장 종목 화면 — 함께 움직이는 미국 종목. 그날 표에 선 짝이 없으면(사전 밖 · 짝이 다 조용한 밤) 안 그린다. */
export function KrNightPairs({ code, night }: { code: string; night: NightPairs | null }) {
  const rows = night?.pairs.filter((p) => p.code === code && onTable(p)).sort(byZ) ?? [];
  if (!night || rows.length === 0) return null;
  const when = sessionWord(night.date, night.usSession, night.usFrom);
  return (
    <Module
      className="v2-np-mod"
      title="함께 움직이는 미국 종목"
      meta="최근 5년 이런 날 평균"
      aside={
        <Link href="/preview" className="v2-add-btn" data-ga="cta_click" data-ga-cta="preview" data-ga-surface="stock_page">
          <Icon name="preview" />
          국장 미리보기
        </Link>
      }
    >
      <div className="v2-np v2-np-kr">
        <div className="v2-np-th">
          <span>미국 종목</span>
          <span>관계</span>
          <span>{when}</span>
          <span>개장</span>
          <span>장 중</span>
          <span>종가</span>
        </div>
        <ol>
          {rows.map((p) => (
            <li key={p.t}>
              <Link href={`/preview#mv-${p.t}`} className="v2-np-tr" data-ga="stock_night_pair" data-ga-symbol={p.t}>
                <span className="v2-td-stock">
                  <StockLogo code={p.t} name={p.us} market="US" size={22} lazy />
                  <span className="v2-np-name">
                    <b>{p.t}</b>
                    {p.us !== p.t && <em>{p.us}</em>}
                  </span>
                </span>
                <span className="v2-np-why">{p.why}</span>
                <span className="v2-np-move">
                  <b className={tone(p.dp).trim() || undefined}>{PCT(p.dp)}</b>
                  <em>평소 폭의 {p.z.toFixed(2)}배</em>
                </span>
                <span className="v2-np-nums">
                  <Nums p={p} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Module>
  );
}

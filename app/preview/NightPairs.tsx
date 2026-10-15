import Link from "next/link";

import { stockDetailHref } from "@/lib/insider-range";
import { sessionWord, type NightPair, type NightPairs } from "@/lib/kr-preview";
import { stockHref } from "@/lib/stock-page";

import { Module, type CoverLink } from "../kadera/V2Modules";
import { StockLogo } from "../StockLogo";

/**
 * 종목 화면의 '함께 움직이는' 짝 — 국장 미리보기의 사전(깊은 쌍)을 종목 하나의 자리에서 본다(2026-10-15).
 *
 *   국장 /stock/[code]           함께 움직이는 미국 종목 — 그 종목에 엮인 미국 종목들의 밤사이 등락
 *   미장 /insider/stock/[ticker]  함께 움직이는 국장 종목 — 그 미국 종목에 엮인 국장 종목들(국장 · 미장 같이 고친다)
 *
 * ⭐ 아침에 사람들이 먼저 여는 곳은 자기 종목 화면이다. 미리보기 표에서 종목을 눌러 넘어와도 왜 엮였는지가 그 화면에서 끊겼다.
 * ⭐ 숫자 셋(개장 · 장 중 · 종가)은 미리보기 표와 같은 값이다 — **최근 5년, 그 미국 종목이 이만큼 움직인 날의 평균**이고 오늘 일이 아니다.
 *    평소 폭(1.0배)을 넘지 않은 밤은 '이런 날' 이 아니라 숫자 칸을 비워 둔다(–). 줄은 세운다 — 짝이 조용했다는 것도 아침의 정보다.
 * ⚠️ 장 중 칸을 빼지 말 것 — 개장만 있으면 오를 것으로 읽힌다(미리보기 머리말).
 * ⚠️ 자료는 수집기가 담은 짝 목록 하나(kr_preview_day.pairs)다. 사전 수치를 TS 로 옮기지 않는다.
 */

const PCT = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number | null | undefined) => (n == null || n === 0 ? "" : n > 0 ? " is-up" : " is-down");
const dayOf = (p: NightPair) => (p.open != null && p.intra != null ? ((1 + p.open / 100) * (1 + p.intra / 100) - 1) * 100 : null);
const byZ = (a: NightPair, b: NightPair) => b.z - a.z;

/** 그 국장 종목이 오늘 미리보기 표에 섰으면(평소 폭을 넘은 짝이 있으면) 첫 줄 띠 칸 — 누르면 표의 그 묶음으로. */
export function krNightCover(code: string, night: NightPairs | null): CoverLink | null {
  const top = night?.pairs.filter((p) => p.code === code && p.z >= 1).sort(byZ)[0];
  if (!night || !top) return null;
  const n = night.pairs.filter((p) => p.code === code && p.z >= 1).length;
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

/** 국장 종목 화면 — 함께 움직이는 미국 종목. 깊은 쌍이 없는 종목(사전 밖 · 문턱 미달)은 안 그린다. */
export function KrNightPairs({ code, night }: { code: string; night: NightPairs | null }) {
  const rows = night?.pairs.filter((p) => p.code === code).sort(byZ) ?? [];
  if (!night || rows.length === 0) return null;
  const when = sessionWord(night.date, night.usSession, night.usFrom);
  return (
    <Module
      className="v2-np-mod"
      title="함께 움직이는 미국 종목"
      meta="최근 5년 이런 날 평균"
      aside={
        <Link href="/preview" className="v2-more" data-ga="cta_click" data-ga-cta="preview" data-ga-surface="stock_page">
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
              <Link href={p.z >= 1 ? `/preview#mv-${p.t}` : stockDetailHref(p.t)} className={`v2-np-tr${p.z >= 1 ? "" : " is-quiet"}`} data-ga="stock_night_pair" data-ga-symbol={p.t}>
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

/** 미장 종목 화면 — 함께 움직이는 국장 종목. 국장 짝이 없는 미국 종목(사전 밖)은 안 그린다. */
export function UsNightPairs({ ticker, night }: { ticker: string; night: NightPairs | null }) {
  const t = ticker.toUpperCase();
  const rows = night?.pairs.filter((p) => p.t === t) ?? [];
  if (!night || rows.length === 0) return null;
  const when = sessionWord(night.date, night.usSession, night.usFrom);
  const { dp, z } = rows[0];
  return (
    <Module
      className="v2-np-mod"
      title="함께 움직이는 국장 종목"
      // 그날 이 종목의 움직임이 아래 숫자를 고른다 — 평소 폭을 넘었으면 그 크기 칸의 5년 평균, 아니면 비운다.
      meta={`${when} ${PCT(dp)} · 평소 폭의 ${z.toFixed(2)}배 · 최근 5년 이런 날 평균`}
      aside={
        <Link href={z >= 1 ? `/preview#mv-${t}` : "/preview"} className="v2-more" data-ga="cta_click" data-ga-cta="preview" data-ga-surface="insider_stock_page">
          국장 미리보기
        </Link>
      }
    >
      <div className="v2-np v2-np-us">
        <div className="v2-np-th">
          <span>국장 종목</span>
          <span>관계</span>
          <span>개장</span>
          <span>장 중</span>
          <span>종가</span>
        </div>
        <ol>
          {rows.map((p) => (
            <li key={p.code}>
              <Link href={stockHref(p.code)} className={`v2-np-tr${z >= 1 ? "" : " is-quiet"}`} data-ga="stock_night_pair" data-ga-symbol={p.code}>
                <span className="v2-td-stock">
                  <StockLogo code={p.code} name={p.stock} market={p.market ?? null} size={22} lazy />
                  <span className="v2-np-name">
                    <b>{p.stock}</b>
                  </span>
                </span>
                <span className="v2-np-why">{p.why}</span>
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

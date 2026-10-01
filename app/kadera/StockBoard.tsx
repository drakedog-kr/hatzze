"use client";

import Link from "next/link";
import { useState } from "react";

import { track } from "@/lib/ga";

import { StockLogo } from "../StockLogo";
import { AiMark, Icon } from "../ui";

/**
 * 국장 카더라 v2 의 가운데 판 — 종목 보드(2026-10-02).
 *
 * 예전엔 급부상(3×2 셀) · 급등 종목(3×3 셀) · 주요 종목 리포트(2×2 셀)가 세 시트로 따로 섰고, 셀마다
 * 배수·막대·AI 문장·시세가 제 자리를 잡아 열여덟 장을 Z 자로 훑어야 했다. 여기선 **탭 셋이 한 표를 나눠 쓰고,
 * 고른 종목 하나의 이야기는 오른쪽 상세 패널이 다 든다**(토스증권 '실시간 차트' + 종목 패널의 얼개).
 * 표는 견주는 숫자만, 문장은 패널에. 그래서 표의 줄이 한 줄 높이로 줄어 위아래로 훑힌다.
 *
 * 조회는 하지 않는다. 서버(page.tsx)가 세 목록을 종목 하나의 사실 묶음(BoardStock)으로 합쳐 넘긴다 —
 * 한 종목이 여러 탭에 오르면 패널이 그 사실을 다 모아 보여 준다(급부상이면서 오른 종목의 까닭 등).
 */
export type BoardStock = {
  code: string;
  name: string;
  market: string | null;
  price: number | null;
  /** 실시간 등락률. 저장 종가 폴백이면 null 이고 priceNote 가 그 자리에 선다. */
  change: number | null;
  priceNote: string | null;
  /** 언급 막대. 없으면(급등 탭에서만 온 종목) 패널이 막대를 그리지 않는다. */
  series: number[];
  dates: string[];
  /** 막대에서 수치에 들어간 뒤쪽 칸 수. */
  hot: number;
  themes: { name: string; href: string | null }[];
  surge?: { ratio: number; isNew: boolean; mentions: number; days: number; channels: number | null; line: string | null };
  move?: { reason: string; change: number | null; date: string; channels: number };
  talk?: { mentions: number; days: number; channels: number | null; narrative: string | null };
};

export type BoardTab = {
  key: "surge" | "move" | "talk";
  label: string;
  /** 탭 옆 조건 알약("최근 3일 vs 평소"). */
  note: string;
  codes: string[];
  /** 순위·종목 뒤, 현재가 앞에 서는 열 머리. 셋째 열은 좁은 표에서 숨는다(급등 탭은 둘뿐). */
  heads: string[];
  /** 목록이 비었을 때 표 자리에 설 말. */
  empty: string;
};

const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function Change({ rate, size }: { rate: number | null; size?: "lg" }) {
  if (rate === null) return null;
  const [cls, arrow] = rate > 0 ? ["is-up", "▲"] : rate < 0 ? ["is-down", "▼"] : ["", ""];
  return (
    <span className={`v2-chg ${cls}${size === "lg" ? " is-lg" : ""}`}>
      {arrow}
      {Math.abs(rate).toFixed(2)}%
    </span>
  );
}

/**
 * 언급 막대. 수치에 들어간 뒤쪽 칸(hot)만 진하고, 그중 가장 높은 칸이 가장 진하다.
 * 0 인 날도 2px 은 남긴다 — 칸이 통째로 사라지면 며칠이 빠진 것처럼 보인다.
 */
function Bars({ values, dates, hot, tone, big }: { values: number[]; dates: string[]; hot: number; tone: "warm" | "cold"; big?: boolean }) {
  const max = Math.max(1, ...values);
  const start = values.length - Math.min(hot, values.length);
  let peak = -1;
  for (let i = start; i < values.length; i++) if (peak < 0 || values[i] > values[peak]) peak = i;
  const [on, onSoft, off] =
    tone === "warm" ? ["var(--c-warm-1)", "var(--c-warm-3)", "var(--c-bar-mute)"] : ["var(--c-blue-2)", "var(--c-blue-4)", "var(--c-bar-mute)"];
  return (
    <div className={`v2-bars${big ? " is-big" : ""}`} role="img" aria-label={values.map((v, i) => `${shortDate(dates[i])} ${v}회`).join(", ")}>
      {values.map((v, i) => (
        <span
          key={dates[i] ?? i}
          title={`${shortDate(dates[i])} ${v}회`}
          style={{
            height: v > 0 ? `max(3px, ${(v / max) * 100}%)` : 2,
            background: i < start ? off : i === peak ? on : onSoft,
          }}
        />
      ))}
    </div>
  );
}

/** 표 한 줄의 가운데 칸들. 탭마다 견주는 숫자가 다르다. */
function Cells({ tab, s }: { tab: BoardTab["key"]; s: BoardStock }) {
  if (tab === "surge" && s.surge) {
    return (
      <>
        <span className="v2-num v2-ratio">
          {s.surge.ratio.toFixed(1)}
          <small>배</small>
        </span>
        <span className="v2-cell-bars">
          <Bars values={s.series.slice(-7)} dates={s.dates.slice(-7)} hot={s.surge.days} tone="warm" />
        </span>
        <span className="v2-num v2-hide-sm">{s.surge.mentions}회</span>
      </>
    );
  }
  if (tab === "move" && s.move) {
    return (
      <>
        <span className="v2-num">
          <Change rate={s.move.change} />
        </span>
        <span className="v2-reason">{s.move.reason}</span>
      </>
    );
  }
  if (tab === "talk" && s.talk) {
    return (
      <>
        <span className="v2-num">{s.talk.mentions.toLocaleString("ko-KR")}회</span>
        <span className="v2-cell-bars">
          <Bars values={s.series.slice(-7)} dates={s.dates.slice(-7)} hot={s.talk.days} tone="cold" />
        </span>
        <span className="v2-num v2-hide-sm">{s.talk.channels ?? "-"}곳</span>
      </>
    );
  }
  return null;
}

function Detail({ s, tab }: { s: BoardStock; tab: BoardTab["key"] }) {
  // 패널 막대는 가진 것 중 가장 긴 줄(급부상은 14일, 주요 종목은 7일).
  const tone = tab === "talk" ? "cold" : "warm";
  const hot = s.surge?.days ?? s.talk?.days ?? 0;
  const facts: { k: string; v: React.ReactNode }[] = [];
  if (s.surge) {
    facts.push({ k: "평소 대비", v: <b className="v2-hot">{s.surge.ratio.toFixed(1)}배</b> });
    facts.push({ k: `최근 ${s.surge.days}일 언급`, v: `${s.surge.mentions}회` });
  } else if (s.talk) {
    facts.push({ k: `최근 ${s.talk.days}일 언급`, v: `${s.talk.mentions.toLocaleString("ko-KR")}회` });
  }
  const channels = s.surge?.channels ?? s.talk?.channels ?? s.move?.channels ?? null;
  if (channels !== null) facts.push({ k: "말한 채널", v: `${channels}곳` });
  if (s.surge?.isNew) facts.push({ k: "처음 등장", v: "신규" });
  if (s.move) facts.push({ k: `${shortDate(s.move.date)} 등락`, v: <Change rate={s.move.change} /> });

  const notes: { cap: string; text: string | null; fallback: string }[] = [];
  if (s.surge) notes.push({ cap: "왜 뜨나", text: s.surge.line, fallback: "한 줄 요약은 오늘 집계가 끝나면 붙습니다." });
  if (s.move) notes.push({ cap: "왜 움직였나", text: s.move.reason, fallback: "" });
  if (s.talk) notes.push({ cap: "흐름 요약", text: s.talk.narrative, fallback: "흐름 요약은 오늘 집계가 끝나면 붙습니다." });

  return (
    <aside className="v2-detail" aria-live="polite">
      <div className="v2-detail-head">
        <StockLogo code={s.code} name={s.name} market={s.market} size={40} />
        <div className="v2-detail-id">
          <Link href={`/stock/${s.code}`} className="v2-detail-name">
            {s.name}
          </Link>
          <span className="v2-detail-code">
            {s.code}
            {s.market && ` · ${s.market === "KOSDAQ" ? "코스닥" : "코스피"}`}
          </span>
        </div>
      </div>
      <div className="v2-detail-quote">
        {s.price !== null ? (
          <>
            <strong>{fmtWon(s.price)}</strong>
            {s.change !== null ? <Change rate={s.change} size="lg" /> : s.priceNote && <span className="v2-muted">{s.priceNote}</span>}
          </>
        ) : (
          <span className="v2-muted">가격 정보 준비 중</span>
        )}
      </div>
      {s.themes.length > 0 && (
        <div className="v2-detail-themes">
          {s.themes.map((t) =>
            t.href ? (
              <Link key={t.name} href={t.href} className="v2-chip">
                {t.name}
              </Link>
            ) : (
              <span key={t.name} className="v2-chip">
                {t.name}
              </span>
            ),
          )}
        </div>
      )}

      {s.series.length > 0 && (
        <div className="v2-detail-chart">
          <span className="v2-cap">최근 {s.series.length}일 언급</span>
          <Bars values={s.series} dates={s.dates} hot={hot} tone={tone} big />
          <span className="v2-axis">
            <span>{shortDate(s.dates[0])}</span>
            <span>{shortDate(s.dates[s.dates.length - 1])}</span>
          </span>
        </div>
      )}

      {facts.length > 0 && (
        <dl className="v2-facts">
          {facts.map((f) => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      )}

      {notes.map((n) => (
        <div key={n.cap} className="v2-note">
          <span className="v2-cap">
            <AiMark size={13} />
            {n.cap}
          </span>
          <p className={n.text ? undefined : "v2-muted"}>{n.text ?? n.fallback}</p>
        </div>
      ))}

      <div className="v2-detail-links">
        <Link href={`/stock/${s.code}`} className="v2-link">
          종목 화면
          <Icon name="chevron_right" />
        </Link>
        <Link href={`/mdd?code=${s.code}${s.market ? `&market=${s.market}` : ""}`} className="v2-link">
          MDD 정밀분석
          <Icon name="chevron_right" />
        </Link>
      </div>
    </aside>
  );
}

export function StockBoard({ tabs, stocks }: { tabs: BoardTab[]; stocks: Record<string, BoardStock> }) {
  const [tabKey, setTabKey] = useState<BoardTab["key"]>(tabs[0].key);
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const [picked, setPicked] = useState<string | null>(null);
  const code = picked && tab.codes.includes(picked) ? picked : tab.codes[0];
  const sel = code ? stocks[code] : undefined;

  return (
    <div className="v2-board">
      <div className="v2-board-main">
        <div className="v2-board-top">
          <div className="v2-tabs" role="tablist" aria-label="종목 목록">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === tab.key}
                className="v2-tab"
                onClick={() => {
                  setTabKey(t.key);
                  setPicked(null);
                  track("kadera_board", { action: "tab", tab: t.key });
                }}
              >
                {t.label}
                <span className="v2-tab-n">{t.codes.length}</span>
              </button>
            ))}
          </div>
          <span className="v2-pill">{tab.note}</span>
        </div>

        {tab.codes.length === 0 ? (
          <p className="v2-empty">{tab.empty}</p>
        ) : (
          <div className={`v2-bt v2-bt-${tab.key}`} role="tabpanel">
            <div className="v2-bt-head" aria-hidden="true">
              <span>#</span>
              <span>종목</span>
              {tab.heads.map((h, i) => (
                <span key={h} className={tab.key !== "move" && i === 2 ? "v2-hide-sm" : undefined}>
                  {h}
                </span>
              ))}
              <span>현재가</span>
            </div>
            <ol className="v2-bt-body">
              {tab.codes.map((c, i) => {
                const s = stocks[c];
                if (!s) return null;
                return (
                  <li key={c}>
                    <button
                      type="button"
                      className="v2-bt-row"
                      aria-pressed={c === code}
                      onClick={() => {
                        setPicked(c);
                        track("kadera_board", { action: "pick", tab: tab.key, rank: i + 1 });
                      }}
                    >
                      <span className="v2-rank">{i + 1}</span>
                      <span className="v2-stock">
                        <StockLogo code={s.code} name={s.name} market={s.market} size={28} />
                        <span className="v2-stock-txt">
                          <span className="v2-name">{s.name}</span>
                          <span className="v2-sub">
                            {s.code}
                            {tab.key === "surge" && s.surge?.isNew && <span className="v2-tag">신규</span>}
                          </span>
                        </span>
                      </span>
                      <Cells tab={tab.key} s={s} />
                      <span className="v2-num v2-price">
                        {s.price !== null ? fmtWon(s.price) : "-"}
                        {tab.key !== "move" && <Change rate={s.change} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
      {sel && <Detail s={sel} tab={tab.key} />}
    </div>
  );
}

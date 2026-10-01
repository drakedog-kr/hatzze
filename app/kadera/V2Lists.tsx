import Link from "next/link";

import type { UpcomingEvent } from "@/lib/kadera-why";
import type { ChannelRank, IssueKeyword, RisingChannel, ThemeRotation, TrendingMessage } from "@/lib/telegram-data";

import { Avatar } from "./parts";
import TimeAgo from "./TimeAgo";
import { timeAgoInitial } from "./time-ago";

/**
 * v2 대시보드의 목록들(2026-10-02). 테마·화제어·일정·채널·커뮤니티 글이 **한 가지 줄 꼴**을 쓴다:
 *   순위(흐린 숫자) · 이름 · 값(오른쪽) · 변화(▲▼ 색)
 * 예전엔 목록마다 막대·스파크라인·순위 배지·말풍선·칩이 제각각이라 한 화면에 그래픽 종류가 열 가지를 넘었다.
 * 여기선 색을 오르내림(빨강·파랑) 하나에만 쓰고, 나머지는 글자와 정렬로 가른다.
 */

function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

/** ▲1.6%p · ▼3계단. 0·null 은 흐린 '-'. */
function Delta({ v, unit, digits = 1 }: { v: number | null; unit: string; digits?: number }) {
  if (v === null || v === 0 || Number.isNaN(v)) return <span className="v2-li-delta">-</span>;
  return (
    <span className={`v2-li-delta ${v > 0 ? "is-up" : "is-down"}`}>
      {v > 0 ? "▲" : "▼"}
      {Math.abs(v).toFixed(digits)}
      {unit}
    </span>
  );
}

function Head({ cols }: { cols: string[] }) {
  return (
    <div className="v2-lh" aria-hidden="true">
      {cols.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  );
}

export function ThemeRows({ themes, hrefOf }: { themes: ThemeRotation[]; hrefOf: (theme: string) => string | null }) {
  if (!themes.length) return <p className="v2-empty">아직 집계된 테마가 없습니다.</p>;
  return (
    <>
      <Head cols={["#", "테마", "점유율", "변화"]} />
      <ol className="v2-list">
        {themes.map((t) => {
          const inner = (
            <>
              <span className="v2-li-rank">{t.rank}</span>
              <span className="v2-li-main">{t.theme}</span>
              <span className="v2-li-val">{t.sharePct.toFixed(1)}%</span>
              <Delta v={t.shareDelta} unit="%p" />
            </>
          );
          const href = hrefOf(t.theme);
          return (
            <li key={t.theme}>
              {href ? (
                <Link href={href} className="v2-li">
                  {inner}
                </Link>
              ) : (
                <div className="v2-li">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function KeywordRows({ keywords }: { keywords: IssueKeyword[] }) {
  if (!keywords.length) return <p className="v2-empty">아직 뽑을 화제어가 없습니다.</p>;
  return (
    <>
      <Head cols={["#", "화제어", "언급", "변화"]} />
      <ol className="v2-list">
        {keywords.map((k) => (
          <li key={k.word}>
            <div className="v2-li">
              <span className="v2-li-rank">{k.rank}</span>
              <span className="v2-li-main">{k.word}</span>
              <span className="v2-li-val">{k.count.toLocaleString("ko-KR")}회</span>
              {/* shareDelta 는 몫(0~1)의 차라 %p 로 적으려면 100 을 곱한다(IssueKeyword 주석). */}
              <Delta v={k.shareDelta === null ? null : k.shareDelta * 100} unit="%p" />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 다가오는 일정 — 날짜 머리 아래 그날 것. 좁은 패널이라 달력 대신 목록이다. */
export function EventRows({ events, today }: { events: UpcomingEvent[]; today: string }) {
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || b.channels - a.channels);
  if (!upcoming.length) return <p className="v2-empty">앞으로 5주 안에 날짜가 짚인 일정이 아직 없습니다.</p>;
  const groups = new Map<string, UpcomingEvent[]>();
  for (const e of upcoming) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
  return (
    <div className="v2-ev">
      {[...groups].map(([date, items]) => {
        const [, m, d] = date.split("-").map(Number);
        // 한국 정오는 UTC 로도 같은 날이라 getUTCDay 가 그날 요일이다(서버 시간대와 무관).
        const wd = WEEKDAY[new Date(`${date}T12:00:00+09:00`).getUTCDay()];
        return (
          <section key={date}>
            <h3 className="v2-ev-date">
              {m}월 {d}일 ({wd}){date === today && <span className="v2-tag">오늘</span>}
            </h3>
            <ul className="v2-list">
              {items.map((e) => {
                const inner = (
                  <>
                    <span className="v2-li-main">{e.name}</span>
                    <span className="v2-ev-text">{e.event}</span>
                    <span className="v2-li-val v2-li-soft">{e.channels}곳</span>
                  </>
                );
                return (
                  <li key={`${e.code}-${e.event}`}>
                    {/^\d{6}$/.test(e.code) ? (
                      <Link href={`/stock/${e.code}`} className="v2-li v2-ev-row">
                        {inner}
                      </Link>
                    ) : (
                      <div className="v2-li v2-ev-row">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function ChannelRows({ channels }: { channels: ChannelRank[] }) {
  if (!channels.length) return <p className="v2-empty">채널 순위를 아직 못 셌습니다.</p>;
  return (
    <>
      <Head cols={["#", "채널", "영향력", "변동"]} />
      <ol className="v2-list">
        {channels.map((c, i) => (
          <li key={c.handle}>
            <a
              href={`https://t.me/${c.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="v2-li"
              data-ga="kadera_channel_click"
              data-ga-channel={c.handle}
              data-ga-surface="power_rank"
              data-ga-rank={i + 1}
            >
              <span className="v2-li-rank">{i + 1}</span>
              <span className="v2-li-main v2-li-who">
                <Avatar photoUrl={c.photoUrl} title={c.title} size={20} />
                <span>{c.title}</span>
              </span>
              <span className="v2-li-val">{c.influenceScore.toFixed(0)}</span>
              <Delta v={c.rankChange} unit="" digits={0} />
            </a>
          </li>
        ))}
      </ol>
    </>
  );
}

export function RisingRows({ rising }: { rising: RisingChannel[] }) {
  const real = rising.filter((r) => !r.isPlaceholder);
  if (!real.length) return <p className="v2-empty">아직 구독자 변화를 잴 만큼 기록이 쌓이지 않았습니다.</p>;
  return (
    <>
      <Head cols={["#", "채널", "구독자", "7일 증감"]} />
      <ol className="v2-list">
        {real.map((r, i) => {
          const inner = (
            <>
              <span className="v2-li-rank">{i + 1}</span>
              <span className="v2-li-main v2-li-who">
                <Avatar photoUrl={r.photoUrl} title={r.title} size={20} />
                <span>{r.title}</span>
              </span>
              <span className="v2-li-val">{compact(r.subscriberCount)}</span>
              <Delta v={r.delta7d} unit="명" digits={0} />
            </>
          );
          return (
            <li key={`${r.handle ?? r.title}-${i}`}>
              {r.handle ? (
                <a
                  href={`https://t.me/${r.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v2-li"
                  data-ga="kadera_channel_click"
                  data-ga-channel={r.handle}
                  data-ga-surface="rising"
                >
                  {inner}
                </a>
              ) : (
                <div className="v2-li">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** 커뮤니티 글 — 뉴스 피드처럼 줄로(Blockworks 'News'). 누르면 원문(텔레그램)으로 나간다. */
export function FeedRows({ items, label }: { items: TrendingMessage[]; label: string }) {
  if (!items.length) return <p className="v2-empty">{label} 기준으로는 아직 화제 글이 없습니다.</p>;
  return (
    <ol className="v2-feed">
      {items.map((m) => (
        <li key={`${m.channelHandle}-${m.messageId}`}>
          <a
            href={`https://t.me/${m.channelHandle}/${m.messageId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="v2-feed-item"
            data-ga="kadera_message_click"
            data-ga-channel={m.channelHandle}
          >
            <span className="v2-feed-head">
              <Avatar photoUrl={m.channelPhotoUrl} title={m.channelTitle} size={20} />
              <b>{m.channelTitle}</b>
              <span className="v2-feed-meta">
                <TimeAgo iso={m.postedAt} initial={timeAgoInitial(m.postedAt)} /> · 조회 {compact(m.views)}
              </span>
            </span>
            <span className="v2-feed-text">{m.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

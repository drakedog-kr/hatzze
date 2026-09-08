"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 지난 노트 목록을 **달력 주(월~일) 단위**로 보여 주고, 아래 [지난주]·[다음주]로 넘긴다.
 *
 * 처음엔 최근 30편을 한 번에 늘어놓았다. 하루 한 편이라 한 달이면 서른 줄이고, 그 줄이
 * 본문 옆 칸을 세로로 다 채워 목차·언급된 종목보다 길어졌다(2026-09-09 지적). 한 번 "7편씩"
 * 잘라 봤는데 편수는 달력과 어긋난다 — 사람은 "지난주 글"을 찾지 "일곱 편 전"을 찾지 않는다.
 * 그래서 주로 묶는다. 이번 주 글이 둘뿐이면 둘만 보이고, 지난주로 넘기면 그 주의 글이 보인다.
 *
 * ⭐ 지금 읽는 글이 실린 주에서 시작한다. 지난 글을 열었는데 목록이 이번 주만 보여 주면
 *    "내가 어디 있지"가 안 보인다 — `aria-current` 가 붙은 줄이 첫 화면에 있어야 한다.
 * ⭐ 글이 없는 주는 건너뛴다. 넘김 단추는 **글이 있는** 이웃 주로 간다.
 * ⭐ 자료는 서버가 다 만들어 준다(주소·날짜 표기까지). 여기서는 주로 묶고 넘기기만 한다 —
 *    kadera 의 ExpandableList 와 같은 역할 분담이다. 쪽을 넘겨도 조회가 없고 주소도 안
 *    바뀐다. 오른쪽 칸 목록을 넘기려고 글 전체를 다시 그릴 이유가 없다.
 * ⚠️ lib/daily-note.ts 를 여기서 import 하지 않는다 — Supabase 서버 클라이언트를 물고
 *    있어 클라이언트 번들에 못 들어온다. 그래서 표기까지 서버가 끝내서 넘긴다.
 */
export type NoteArchiveItem = { date: string; title: string; href: string; label: string };

/** 그 날짜가 든 주의 월요일(ISO). 날짜는 'YYYY-MM-DD' 라 UTC 로 셈해 시간대에 안 흔들린다. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // 월=0 … 일=6
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "9월 7일" — 넘김 줄의 주 범위에 쓴다. 요일은 각 줄의 날짜 칸이 이미 갖고 있어 여기선 뺀다. */
function md(iso: string): string {
  return `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
}

export function NoteArchiveList({ items, current }: { items: NoteArchiveItem[]; current: string | null }) {
  // 글이 있는 주만, 최신 주가 앞. items 는 최신이 앞이라 순서가 그대로 보존된다.
  const weeks: string[] = [];
  for (const n of items) {
    const w = mondayOf(n.date);
    if (weeks[weeks.length - 1] !== w) weeks.push(w);
  }
  const startAt = current ? weeks.indexOf(mondayOf(current)) : -1;
  const [at, setAt] = useState(startAt >= 0 ? startAt : 0);
  const week = weeks[at];
  const shown = items.filter((n) => mondayOf(n.date) === week);

  return (
    <>
      <ul className="hz-note-archive" aria-label="지난 노트">
        {shown.map((n) => (
          <li key={n.date} aria-current={n.date === current ? "page" : undefined}>
            <Link href={n.href}>
              <time dateTime={n.date}>{n.label}</time>
              <span>{n.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* 한 주뿐이면 넘길 것이 없으니 줄 자체를 안 그린다. */}
      {weeks.length > 1 && week && (
        <nav className="hz-note-archive-pager" aria-label="지난 노트 주 넘기기">
          {/* 최신이 위라 '지난주'가 더 오래된 쪽이다. 글 아래 이전·다음 글 단추와 같은 방향이다. */}
          <button type="button" onClick={() => setAt((i) => Math.min(weeks.length - 1, i + 1))} disabled={at >= weeks.length - 1}>
            지난주
          </button>
          <span aria-live="polite">
            {md(week)} ~ {md(addDays(week, 6))}
          </span>
          <button type="button" onClick={() => setAt((i) => Math.max(0, i - 1))} disabled={at <= 0}>
            다음주
          </button>
        </nav>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 지난 노트 목록을 **한 주(7편)씩** 넘겨 본다.
 *
 * 처음엔 최근 30편을 한 번에 늘어놓았다. 하루 한 편이라 한 달이면 서른 줄이고, 그 줄이
 * 본문 옆 칸을 세로로 다 채워 목차·언급된 종목보다 길어졌다(2026-09-09 지적: "모든 노트를
 * 다 보여 주는 건 안 될 것 같다"). 최근 일주일만 보이고 나머지는 넘겨 본다.
 *
 * ⭐ 지금 읽는 글이 실린 쪽에서 시작한다. 지난 글을 열었는데 목록이 이번 주만 보여 주면
 *    "내가 어디 있지"가 안 보인다 — `aria-current` 가 붙은 줄이 첫 화면에 있어야 한다.
 * ⭐ 자료는 서버가 다 만들어 준다(주소·날짜 표기까지). 여기서는 자르고 넘기기만 한다 —
 *    kadera 의 ExpandableList 와 같은 역할 분담이다. 쪽을 넘겨도 조회가 없고 주소도 안
 *    바뀐다. 오른쪽 칸 목록을 넘기려고 글 전체를 다시 그릴 이유가 없다.
 * ⚠️ lib/daily-note.ts 를 여기서 import 하지 않는다 — Supabase 서버 클라이언트를 물고
 *    있어 클라이언트 번들에 못 들어온다. 그래서 표기까지 서버가 끝내서 넘긴다.
 */
export const NOTE_ARCHIVE_PAGE = 7;

export type NoteArchiveItem = { date: string; title: string; href: string; label: string };

export function NoteArchiveList({ items, current }: { items: NoteArchiveItem[]; current: string | null }) {
  const pages = Math.max(1, Math.ceil(items.length / NOTE_ARCHIVE_PAGE));
  const at = current ? items.findIndex((n) => n.date === current) : -1;
  const [page, setPage] = useState(at >= 0 ? Math.floor(at / NOTE_ARCHIVE_PAGE) : 0);
  const slice = items.slice(page * NOTE_ARCHIVE_PAGE, (page + 1) * NOTE_ARCHIVE_PAGE);
  const newest = slice[0];
  const oldest = slice[slice.length - 1];

  return (
    <>
      <ul className="hz-note-archive" aria-label="지난 노트">
        {slice.map((n) => (
          <li key={n.date} aria-current={n.date === current ? "page" : undefined}>
            <Link href={n.href}>
              <time dateTime={n.date}>{n.label}</time>
              <span>{n.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* 한 쪽뿐이면 넘길 것이 없으니 줄 자체를 안 그린다. 지금이 그렇다(노트 7편). */}
      {pages > 1 && (
        <nav className="hz-note-archive-pager" aria-label="지난 노트 넘기기">
          {/* 최신이 위라 '이전 주'가 더 오래된 쪽이다. 글 아래 이전·다음 글 단추와 같은 방향이다. */}
          <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
            이전 주
          </button>
          <span aria-live="polite">
            {oldest && newest ? `${oldest.label} ~ ${newest.label}` : ""}
            <small>{page + 1} / {pages}</small>
          </span>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>
            다음 주
          </button>
        </nav>
      )}
    </>
  );
}

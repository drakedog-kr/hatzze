import type { Metadata } from "next";

import { DocCell, DocCover } from "../legal";
import { Module } from "../kadera/V2Modules";
import { RELEASES } from "../releases";
import { CHANGELOG_CARD } from "../og-copy";
import { pageMetadata } from "../seo";
import { ChangelogSeen } from "../VersionBadge";

// og:image URL 에 그날의 도수가 실려 있어 요청마다 다시 계산해야 한다(상수로 두면
// 서버가 살아 있는 동안 어제 URL 을 계속 내보낸다). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "업데이트 기록 | hatzze",
    description: "hatzze의 버전별 변경 사항과 배포일을 모아 둔 기록입니다.",
    path: "/changelog",
    ownImage: CHANGELOG_CARD.alt,
  });
}

/** '2026-10-02' → '10/2'. 달 머리 아래 줄이라 해를 안 적는다. */
const md = (iso: string) => iso.slice(5).split("-").map(Number).join("/");
/** '2026-08-06' → '2026년 8월 6일'. */
const koDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

/**
 * 업데이트 기록. 푸터의 버전 표기를 누르면 여기로 온다.
 *
 * 내용은 app/releases.ts 한 곳에서 온다 — 버전을 올릴 때 그 목록 맨 앞에 한 줄 넣으면
 * 푸터 표기와 이 페이지가 같이 따라온다.
 *
 * v2(2026-10-04) — 판마다 테두리 카드 한 장(124장, 1,440 에서 18,285px)이던 것을 **달마다 모듈 한 장 · 판마다 한 줄**로 바꿨다.
 * 줄 = 버전 · 배포일 · 바뀐 것(한 줄에 하나). 바뀐 것은 짧은 줄이라(가운데값 38자) 판 폭 전체를 써도 읽기 길이가 안 늘어난다 —
 * 오른쪽 칸을 두지 않는다. 첫 줄 띠는 지금 판 · 지금까지 판 수 · 첫 공개.
 * ⛔ '최근 30일 몇 번'처럼 오늘 기준 숫자는 안 둔다 — 이 화면은 배포 때 한 번 그려져 날이 지나면 거짓이 된다.
 */
export default function ChangelogPage() {
  const latest = RELEASES[0];
  const first = RELEASES[RELEASES.length - 1];
  // 달마다 묶는다(앞이 최신 — RELEASES 순서 그대로).
  const months: { key: string; rows: typeof RELEASES }[] = [];
  for (const rel of RELEASES) {
    const key = rel.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.rows.push(rel);
    else months.push({ key, rows: [rel] });
  }
  return (
    <div className="hz-tx v2-kd v2-dc v2-cl">
      {/* 이 화면을 봤다는 표시. 푸터 버전 옆의 빨간 N 이 여기서 꺼진다. 푸터를 눌러 온
          사람은 누르는 순간 이미 꺼지지만, 사이드바·검색·주소 직접 입력으로 닿은 사람은
          이 줄이 없으면 다 읽고 나가도 배지가 그대로 켜져 있다. 그리는 것은 없다. */}
      <ChangelogSeen />
      <DocCover title="업데이트 기록" links={[]}>
        <DocCell k="지금 판" v={`v${latest.version}`} sub={md(latest.date)} />
        <DocCell k="지금까지" v={`${RELEASES.length.toLocaleString("ko-KR")}번`} />
        <DocCell k="첫 공개" v={koDate(first.date)} sub={`v${first.version}`} />
      </DocCover>
      {months.map((m) => {
        const [y, mo] = m.key.split("-").map(Number);
        return (
          <Module key={m.key} id={`m-${m.key}`} title={`${y}년 ${mo}월`} meta={`${m.rows.length}번`} className="v2-cl-mod">
            <ol className="v2-cl-list">
              {m.rows.map((rel) => (
                <li key={rel.version} className="v2-cl-row">
                  <span className="v2-cl-ver">
                    v{rel.version}
                    {/* 맨 앞이 곧 지금 쓰이는 판이다 — 푸터에서 본 숫자를 여기서 다시 찾게. */}
                    {rel === latest && <span className="v2-badge">현재</span>}
                  </span>
                  <time dateTime={rel.date}>{md(rel.date)}</time>
                  <ul>
                    {rel.changes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Module>
        );
      })}
    </div>
  );
}

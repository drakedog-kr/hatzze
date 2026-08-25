import type { Metadata } from "next";

import { DOC_WIDTH } from "../legal";
import { RELEASES } from "../releases";
import { pageMetadata } from "../seo";
import { C, MONO, R } from "../ui";

// og:image URL 에 그날의 도수가 실려 있어 요청마다 다시 계산해야 한다(상수로 두면
// 서버가 살아 있는 동안 어제 URL 을 계속 내보낸다). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "업데이트 기록 | hatzze",
    description: "hatzze의 버전별 변경 사항과 배포일을 모아 둔 기록입니다.",
    path: "/changelog",
  });
}

/**
 * 업데이트 기록. 푸터의 버전 표기를 누르면 여기로 온다.
 *
 * 내용은 app/releases.ts 한 곳에서 온다 — 버전을 올릴 때 그 목록 맨 앞에 한 줄 넣으면
 * 푸터 표기와 이 페이지가 같이 따라온다.
 *
 * 조판은 법정 고지(개인정보처리방침·이용약관)와 같은 문서 폭을 쓴다. 카드 그리드로
 * 두면 지표 화면처럼 보여서, 눌러 들어온 사람이 "읽는 곳"이라는 걸 늦게 안다.
 */
export default function ChangelogPage() {
  return (
    <div style={{ maxWidth: DOC_WIDTH }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
        업데이트 기록
      </h1>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--c-muted)" }}>
        무엇이 언제 바뀌었는지 적어 둡니다.
      </p>

      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
        {RELEASES.map((rel, i) => (
          <section
            key={rel.version}
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: R.card,
              padding: "18px 20px",
            }}
          >
            {/* 버전과 날짜를 한 줄에 마주 보게 둔다. 버전은 등고선처럼 훑는 값이라
                고정폭으로 두어야 자릿수가 달라져도 세로로 정렬돼 보인다. */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: "0.01em" }}>
                v{rel.version}
              </span>
              {/* 맨 앞이 곧 지금 쓰이는 버전이다. 눌러 들어온 사람이 푸터에서 본 숫자를
                  여기서 다시 찾을 수 있게 표시해 둔다. */}
              {i === 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    // ⚠️ C.blue 는 **면**에 쓰는 원색이라 파란 tint 위 글자로는 3.3 이다.
                    //    파란 글자 전용 값(blueInk)은 같은 tint 위에서 4.66 이다.
                    color: C.blueInk,
                    background: "var(--c-blue-tint)",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  현재
                </span>
              )}
              <span style={{ flex: 1 }} />
              <time dateTime={rel.date} style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-muted)" }}>
                {rel.date}
              </time>
            </div>

            {/* Tailwind 프리플라이트가 list-style 을 지운다. 여기서 되살리지 않으면
                항목이 들여쓴 문단처럼 보여 몇 가지가 바뀐 건지 눈에 안 들어온다. */}
            <ul
              style={{
                margin: "12px 0 0",
                paddingLeft: 18,
                listStyle: "disc outside",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 14,
                lineHeight: 1.75,
                color: C.sub,
              }}
            >
              {rel.changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

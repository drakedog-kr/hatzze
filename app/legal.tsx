import { C } from "./ui";

// 법정 고지 문서(개인정보처리방침·이용약관)가 공유하는 조판.
//
// 이 파일은 개인정보처리방침 안에 있던 것을 그대로 꺼낸 것이다. 이용약관이 생기면서
// 같은 조판이 둘이 됐는데, 두 문서는 나란히 놓고 읽히는 물건이라 자간·여백이 갈리면
// 한쪽이 다른 사이트에서 옮겨온 것처럼 보인다. 한곳에서 정하면 그럴 일이 없다.
//
// 카드 그리드가 아니라 한 줄로 읽히는 문서 형태로 두고, 본문 폭을 68ch 로 묶는다.
// 지표 카드와 달리 문장이 길어서, 줄이 길면 다음 줄 첫 글자를 찾기 어려워진다.
export const DOC_WIDTH = "68ch";

export function DocTitle({ title, effectiveDate }: { title: string; effectiveDate: string }) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
        {title}
      </h1>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--c-muted)" }}>시행일 · {effectiveDate}</p>
    </>
  );
}

/** 제목 아래 들어가는 머리말. 조항이 아니라 문서 전체의 전제를 적는 자리다. */
export function Lead({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 24, fontSize: 14, lineHeight: 1.85, color: C.sub }}>{children}</div>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.85, color: C.sub }}>{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

/** 본문 안에서 한 마디를 잉크색으로 올린다(조항의 핵심어). */
export function B({ children }: { children: React.ReactNode }) {
  return <b style={{ color: C.ink }}>{children}</b>;
}

// Tailwind 프리플라이트가 ul 의 list-style 을 지운다. 여기서 되살리지 않으면 항목이
// 들여쓰기만 된 문단처럼 보여서, 고지 사항의 개수와 경계가 눈에 안 들어온다.
export function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20, listStyle: "disc outside", display: "flex", flexDirection: "column", gap: 6 }}>
      {children}
    </ul>
  );
}

/**
 * 항목·값이 짝을 이루는 고지(쿠키 목록, 국외 이전 내역)를 담는 상자.
 * 표(table)로 두면 좁은 화면에서 가로 스크롤이 생기는데, 법정 고지가 잘려 보이는 건
 * 피해야 해서 라벨-값을 세로로 쌓는 형태로 만든다.
 */
export function InfoBlock({ heading, rows }: { heading: string; rows: [string, React.ReactNode][] }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 10 }}>{heading}</div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 16px" }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ fontSize: 12, fontWeight: 600, color: "var(--c-muted)", whiteSpace: "nowrap" }}>{label}</dt>
            {/* 값 칸에는 끊을 자리가 없는 긴 문자열이 들어온다(처리방침 URL
                "policies.google.com/privacy"). 기본값이면 그 한 덩어리가 최소 폭을 밀어올려
                375px 화면에서 표가 7px 넘쳤다. 이 칸만 중간에서 끊게 둔다. */}
            <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: C.sub, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none", fontWeight: 600 }}>
      {children}
    </a>
  );
}

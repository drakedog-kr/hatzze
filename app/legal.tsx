import { C, R } from "./ui";

// 법정 고지 문서(개인정보처리방침·이용약관)가 공유하는 조판.
//
// 이 파일은 개인정보처리방침 안에 있던 것을 그대로 꺼낸 것이다. 이용약관이 생기면서
// 같은 조판이 둘이 됐는데, 두 문서는 나란히 놓고 읽히는 물건이라 자간·여백이 갈리면
// 한쪽이 다른 사이트에서 옮겨온 것처럼 보인다. 한곳에서 정하면 그럴 일이 없다.
//
// 카드 그리드가 아니라 한 줄로 읽히는 문서 형태로 두고, 본문 폭을 68ch 로 묶는다.
// 지표 카드와 달리 문장이 길어서, 줄이 길면 다음 줄 첫 글자를 찾기 어려워진다.
export const DOC_WIDTH = "68ch";

/**
 * 이용약관·개인정보처리방침 시행일. 본문 조항(약관 1조 · 방침 12조), 셸의 제목 아래 줄(DOC_PAGES),
 * 문서 맨 위의 개정 안내(Revision)가 같이 쓴다.
 *
 * ⚠️ 두 문서가 스스로 "시행 7일 전부터 이 페이지를 통해 알려 드린다"고 적었다. 고친 판은 **배포일 + 7일
 *    이후**를 시행일로 잡는다. 머지가 늦어지면 이 날짜도 같이 뒤로 민다.
 */
export const TERMS_EFFECTIVE = "2026년 10월 5일";
export const PRIVACY_EFFECTIVE = "2026년 10월 5일";
/** 바로 앞 판의 시행일(베타 오픈일). 개정 안내 상자가 "이전 판"으로 가리킨다. */
export const PREV_EFFECTIVE = "2026년 8월 6일";

/**
 * 문서 화면 셋(업데이트 기록·이용약관·개인정보처리방침)의 제목과 그 아래 한 줄. **셸(AppShell)의 페이지 머리가 그린다** —
 * 다른 화면과 같은 자리·같은 크기다(DEEP_PAGES 에 섞인다).
 *
 * 예전엔 문서마다 본문 안에 24px 제목을 따로 그렸다(DocTitle). 셸은 NAV·DEEP_PAGES 에 없는 주소라 제목 칸을 비워 두는데
 * 그 빈 머리(38px)는 그대로 남아서, 제목이 다른 화면보다 58px 아래(148 vs 90)에 작게(24/700 vs 30/800) 섰다(2026-09-26).
 *
 * `ld` 는 구조화 데이터를 어떻게 낼지다. 법정 고지는 검색 대상이 아니라 안 낸다(none) — 셸이 원래 지키던 규칙이다.
 * 업데이트 기록은 사이트맵에 있으니 보통 웹페이지로 낸다.
 */
export const DOC_PAGES: Record<string, { label: string; sub: string; ld: "WebPage" | "none" }> = {
  "/changelog": { label: "업데이트 기록", sub: "무엇이 언제 바뀌었는지 적어 둡니다", ld: "WebPage" },
  "/terms": { label: "이용약관", sub: `시행일 · ${TERMS_EFFECTIVE}`, ld: "none" },
  "/privacy": { label: "개인정보처리방침", sub: `시행일 · ${PRIVACY_EFFECTIVE}`, ld: "none" },
};

/**
 * 개정 안내. 문서 맨 위(머리말 앞)에 둔다.
 *
 * 고친 판은 시행일보다 먼저 올라가므로(위 ⚠️), 시행 전 7일 동안 이 상자가 두 문서가 약속한 '이 페이지를 통한
 * 알림'이 된다. 시행 뒤에도 문장이 그대로 맞도록 "바뀐 곳입니다"처럼 시제를 두지 않는다. 다음 개정 때는
 * 상자 안 목록을 그 판의 것으로 갈아 끼운다.
 */
export function Revision({ effective, prev, children }: { effective: string; prev: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: R.card, padding: "16px 18px", marginBottom: 24 }}>
      <div style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: C.ink, marginBottom: 6 }}>{effective} 시행 개정</div>
      <div style={{ fontSize: "var(--fs-13)", lineHeight: 1.7, color: C.sub }}>
        <p style={{ margin: "0 0 8px" }}>
          {prev}부터 시행한 이전 판에서 바뀐 곳입니다. {effective} 전까지는 이전 판이 적용됩니다.
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, listStyle: "disc outside", display: "flex", flexDirection: "column", gap: 4 }}>
          {children}
        </ul>
      </div>
    </div>
  );
}

/** 문서 맨 앞 머리말. 조항이 아니라 문서 전체의 전제를 적는 자리다. */
export function Lead({ children }: { children: React.ReactNode }) {
  // 문서의 첫 덩어리라 위 여백이 없다 — 제목은 셸의 페이지 머리가 그리고, 머리와 본문 사이는 셸이 띄운다.
  return <div style={{ fontSize: "var(--fs-14)", lineHeight: 1.85, color: C.sub }}>{children}</div>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: "var(--fs-17)", fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      <div style={{ fontSize: "var(--fs-14)", lineHeight: 1.85, color: C.sub }}>{children}</div>
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
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: R.card, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: C.ink, marginBottom: 10 }}>{heading}</div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 16px" }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--c-muted)", whiteSpace: "nowrap" }}>{label}</dt>
            {/* 값 칸에는 끊을 자리가 없는 긴 문자열이 들어온다(처리방침 URL
                "policies.google.com/privacy"). 기본값이면 그 한 덩어리가 최소 폭을 밀어올려
                375px 화면에서 표가 7px 넘쳤다. 이 칸만 중간에서 끊게 둔다. */}
            <dd style={{ margin: 0, fontSize: "var(--fs-13)", lineHeight: 1.7, color: C.sub, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    /* ⚠️ C.blue 가 아니라 C.blueInk 다. 원색은 면(막대·알약 바탕)에 쓰는 값이라 흰 바탕
       위 글자로는 3.71 밖에 안 나온다 — 이 저장소가 ui.tsx 주석에 이미 적어 둔 규칙인데
       법률 페이지의 바깥 링크만 원색으로 남아 있었다(2026-08-25 실측). */
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: C.blueInk, textDecoration: "none", fontWeight: 600 }}>
      {children}
    </a>
  );
}

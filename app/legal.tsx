import { Children, isValidElement } from "react";
import Link from "next/link";

import { Module } from "./kadera/V2Modules";
import { C, Icon } from "./ui";

// 법정 고지 문서(개인정보처리방침·이용약관)가 공유하는 조판.
//
// 이 파일은 개인정보처리방침 안에 있던 것을 그대로 꺼낸 것이다. 이용약관이 생기면서
// 같은 조판이 둘이 됐는데, 두 문서는 나란히 놓고 읽히는 물건이라 자간·여백이 갈리면
// 한쪽이 다른 사이트에서 옮겨온 것처럼 보인다. 한곳에서 정하면 그럴 일이 없다.
//
// v2(2026-10-04) — 문서 화면 넷(업데이트 기록 · 투자 유의사항 · 개인정보처리방침 · 이용약관)도 v2 얼개다.
// 첫 줄 띠(문서 이름 h1 · 시행일 · 다른 문서) → [글 | 오른쪽 칸(목차 · 덧붙는 모듈)]. 데일리 노트(app/daily/NoteView.tsx)와 같은
// 읽는 화면의 얼개라 판 960 미만이면 오른쪽 칸이 글 아래로 내려간다(목차는 그때 숨긴다 — 글 뒤의 목차는 쓸 데가 없다).
// ⭐ 본문 글자는 옛 조판 그대로다(14 · 줄 1.85 · 굵기 400 · --c-sub). 데일리 노트에서 v2 눈금(500 · 투명 회색)이 긴 글에
//    빽빽하고 흐리다는 판단을 받았다(2026-10-03) — 법정 문서도 긴 글이다. ⛔ 본문을 v2 눈금으로 덮지 말 것.

/** 오류 · 없는 주소 화면의 글 폭. 문서 화면은 v2 칸 폭을 쓰고 이 값을 안 쓴다(2026-10-04). */
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
 * 투자 유의사항(토스증권 '투자 유의사항'의 자리). 면책 고지와 데이터 출처를 여기 모은다 — 화면마다 적지 않고
 * 모든 화면의 푸터 맨 아랫줄이 이리로 건너온다(2026-10-02, app/Footer.tsx 머리 주석).
 */
export const DISCLAIMER_HREF = "/disclaimer";

/**
 * 문서 화면 넷(업데이트 기록·이용약관·개인정보처리방침·투자 유의사항)의 제목과 그 아래 한 줄. DEEP_PAGES 에 섞여 구조화 데이터 ·
 * 이동 경로가 이 이름을 쓴다. v2(2026-10-04)부터 화면의 제목은 문서가 첫 줄 띠에 h1 로 직접 그린다(DocCover) — 셸은 이 주소들의
 * 제목 칸을 비운다(AppShell SELF_TITLED). 사이드바에 없는 화면이라 셸처럼 숨기면 이름이 화면에서 사라진다.
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
  [DISCLAIMER_HREF]: { label: "투자 유의사항", sub: "정보를 이용하시기 전에 확인해 주십시오", ld: "none" },
};

/**
 * 개정 안내. 글 칸 맨 위(문서 모듈 앞)에 모듈 한 장으로 둔다 — 폭이 좁아 오른쪽 칸이 글 아래로 내려가도 맨 위에 남아야 한다.
 *
 * 고친 판은 시행일보다 먼저 올라가므로(위 ⚠️), 시행 전 7일 동안 이 모듈이 두 문서가 약속한 '이 페이지를 통한
 * 알림'이 된다. 시행 뒤에도 문장이 그대로 맞도록 "바뀐 곳입니다"처럼 시제를 두지 않는다. 다음 개정 때는
 * 목록을 그 판의 것으로 갈아 끼운다. ⛔ 첫 문장은 고지라 '설명 문장 금지'에 안 걸린다 — 지우지 말 것.
 */
export function Revision({ effective, prev, children }: { effective: string; prev: string; children: React.ReactNode }) {
  return (
    <Module title={`${effective} 시행 개정`} meta={`이전 판 ${prev} 시행`} className="v2-dc-rev">
      <div className="v2-dc-revbody">
        <p>
          {prev}부터 시행한 이전 판에서 바뀐 곳입니다. {effective} 전까지는 이전 판이 적용됩니다.
        </p>
        <ul>{children}</ul>
      </div>
    </Module>
  );
}

/** 문서 맨 앞 머리말. 조항이 아니라 문서 전체의 전제를 적는 자리다. */
export function Lead({ children }: { children: React.ReactNode }) {
  // 문서 모듈의 첫 덩어리. 글자는 조항 본문과 같다(v2.css .v2-dc-txt).
  return <div className="v2-dc-txt v2-dc-lead">{children}</div>;
}

/** 투자 유의사항의 '데이터 출처' 절. ⚠️ 주소의 앵커는 영문이어야 한다(한글 주소 금지 규칙). */
export const SOURCES_ID = "sources";

/**
 * 조항 하나. id 는 목차가 뛰어오는 앵커다 — '1. 약관의 효력과 변경'처럼 번호로 시작하면 저절로 `art-1`, 번호 없는 절(투자 유의사항)은
 * 영문 id 를 적는다(⛔ 주소에 한글 금지).
 */
export function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    // scroll-margin — 목차에서 뛰어오면 제목이 화면 맨 위에 딱 붙지 않게 한 줄 띄운다(v2.css).
    <section id={id ?? articleId(title)} className="v2-dc-sec">
      <h2>{title}</h2>
      <div className="v2-dc-txt">{children}</div>
    </section>
  );
}

/** '3. 제공하는 정보의 성격' → { n: 3, text: '제공하는 정보의 성격' }. 번호가 없으면 n 은 null. */
function splitNumber(title: string): { n: number | null; text: string } {
  const m = /^(\d+)\.\s*(.*)$/.exec(title);
  return m ? { n: Number(m[1]), text: m[2] } : { n: null, text: title };
}
const articleId = (title: string) => {
  const { n } = splitNumber(title);
  return n === null ? undefined : `art-${n}`;
};

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
 * 항목·값이 짝을 이루는 고지(쿠키 목록, 국외 이전 내역)를 담는 작은 표.
 * 표(table)로 두면 좁은 화면에서 가로 스크롤이 생기는데, 법정 고지가 잘려 보이는 건
 * 피해야 해서 라벨-값을 세로로 쌓는 형태로 만든다. v2 — 카드 속 카드(흰 판 + 테두리 + 둥근 모서리) 대신 1px 선 · 머리 줄 면(v2.css .v2-dc-info).
 */
export function InfoBlock({ heading, rows }: { heading: string; rows: [string, React.ReactNode][] }) {
  return (
    <div className="v2-dc-info">
      <div className="v2-dc-info-h">{heading}</div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            {/* 값 칸에는 끊을 자리가 없는 긴 문자열이 들어온다(처리방침 URL
                "policies.google.com/privacy"). 기본값이면 그 한 덩어리가 최소 폭을 밀어올려
                375px 화면에서 표가 7px 넘쳤다. 이 칸만 중간에서 끊게 둔다(v2.css). */}
            <dd>{value}</dd>
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

/* ── v2 문서 화면의 얼개 ───────────────────────────────────────────────────────── */

export type DocLink = { href: string; label: string };

/**
 * 첫 줄 띠 — 문서 이름(h1) · 곁 칸(시행일 따위) · 다른 문서로 가는 칸. 문서 화면은 사이드바에 없어 셸이 아니라 여기서 이름을 그린다.
 * 다른 문서 칸은 v2 링크 칸(.v2-cover-go)과 같은 꼴 — 이 화면에 없는 것을 싣고 다른 화면으로 보낸다.
 */
export function DocCover({ title, links, children }: { title: string; links: DocLink[]; children?: React.ReactNode }) {
  return (
    <div className="v2-cover">
      <div className="v2-cover-cell v2-sk-id">
        <h1>{title}</h1>
      </div>
      {children}
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="v2-cover-cell v2-cover-go" data-ga="doc_link_click">
          <span className="v2-cover-v">
            <b>{l.label}</b>
          </span>
          <Icon name="chevron_right" />
        </Link>
      ))}
    </div>
  );
}

/** 첫 줄 띠의 값 칸 하나(머리말 · 값 · 곁 글). */
export function DocCell({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="v2-cover-cell">
      <span className="v2-cover-k">{k}</span>
      <span className="v2-cover-v">
        <b>{v}</b>
        {sub && <em>{sub}</em>}
      </span>
    </div>
  );
}

/**
 * 법정 문서 한 장(이용약관 · 개인정보처리방침 · 투자 유의사항).
 *   첫 줄 띠 → [개정 안내 · 문서 모듈 | 오른쪽 칸: 목차 · rail]
 * 목차는 children 가운데 Section 의 제목에서 뽑는다 — 목록을 따로 적으면 조항을 고칠 때 둘이 갈린다.
 * Section 은 children 의 **바로 아래**에 있어야 목차에 잡힌다(Fragment 로 감싸지 말 것).
 */
export function DocPage({
  title,
  links,
  cells,
  revision,
  toc = [],
  rail,
  children,
}: {
  title: string;
  links: DocLink[];
  /** 첫 줄 띠의 값 칸들(시행일). */
  cells?: React.ReactNode;
  /** 개정 안내(Revision). 글 칸 맨 위. */
  revision?: React.ReactNode;
  /** 목차 끝에 더할 항목 — 오른쪽 칸 모듈로 옮긴 절(투자 유의사항의 데이터 출처). */
  toc?: { id: string; title: string }[];
  /** 오른쪽 칸 목차 아래에 서는 모듈. */
  rail?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items = [
    ...Children.toArray(children).flatMap((el) => {
      if (!isValidElement<{ title: string; id?: string }>(el) || el.type !== Section) return [];
      const id = el.props.id ?? articleId(el.props.title);
      return id ? [{ id, title: el.props.title }] : [];
    }),
    ...toc,
  ];
  return (
    <div className="hz-tx v2-kd v2-dc">
      <DocCover title={title} links={links}>
        {cells}
      </DocCover>
      <div className="v2-dc-page">
        <div className="v2-dc-main">
          {revision}
          <article className="v2-mod v2-dc-doc">{children}</article>
        </div>
        <aside className="v2-dc-rail">
          {items.length > 0 && (
            <Module title="목차" className="v2-dc-tocmod">
              <nav aria-label={`${title} 목차`}>
                <ol className="v2-dc-toc">
                  {items.map((it, i) => {
                    const { n, text } = splitNumber(it.title);
                    return (
                      <li key={it.id}>
                        <a href={`#${it.id}`}>
                          <i>{n ?? i + 1}</i>
                          <span>{text}</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </Module>
          )}
          {rail}
        </aside>
      </div>
    </div>
  );
}

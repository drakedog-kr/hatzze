import { C, Icon } from "../ui";

/**
 * 카더라 리포트 카드의 머리(아이콘 + 제목 + 우측 보조 + 설명).
 *
 * page.tsx 안에 있었는데, 트렌딩 메시지의 기간 탭이 이 머리의 우측에 들어가면서
 * 클라이언트 컴포넌트(TrendingTabs)도 같은 머리를 그려야 해서 파일로 분리했다.
 * "use client" 를 붙이지 않아 서버에서도 그대로 쓰이고, 서버 전용 의존이 없어
 * 클라이언트 번들에 들어가도 안전하다(색·아이콘은 ../ui 프리미티브뿐).
 */
export function SectionHead({
  icon,
  title,
  note,
  desc,
  noteHelp,
  right,
}: {
  icon: string;
  title: string;
  note?: string;
  desc?: string;
  noteHelp?: string;
  /** 우측에 붙일 임의의 조작부(예: 기간 탭). note 와 동시에 쓰지 않는다. */
  right?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={icon} style={{ fontSize: 22, color: C.blue }} />
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.ink }}>{title}</h3>
        {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
        {!right && note && (
          <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {note}
            {noteHelp && (
              <span className="hz-tip hz-tip-wide" data-tip={noteHelp} style={{ display: "inline-flex", cursor: "help" }}>
                <Icon name="help" style={{ fontSize: 14, color: C.sub }} />
              </span>
            )}
          </span>
        )}
      </div>
      {desc && <p style={{ margin: "7px 0 0", fontSize: 12, lineHeight: 1.5, color: C.sub }}>{desc}</p>}
    </div>
  );
}

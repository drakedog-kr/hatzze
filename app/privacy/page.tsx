import type { Metadata } from "next";

import { C } from "../ui";
import { pageMetadata } from "../seo";

// og:image URL 에 그날의 도수가 실려 있어 요청마다 다시 계산해야 한다(상수로 두면
// 서버가 살아 있는 동안 어제 URL 을 계속 내보낸다). 자세한 건 app/seo.ts 주석 참고.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "개인정보처리방침 | hatzze",
    description:
      "hatzze가 수집하는 정보와 이용 목적, 쿠키의 설치·운영 및 거부 방법을 안내합니다.",
    path: "/privacy",
  });
}

/** 방침 시행일. 베타 오픈일과 맞춘다. 내용을 고치면 이 날짜도 같이 올려야 한다. */
const EFFECTIVE_DATE = "2026년 7월 31일";
/** 문의 창구. Footer 와 같은 주소를 쓴다(두 곳이 갈리면 이용자가 어디로 보낼지 헷갈린다). */
const CONTACT_EMAIL = "hatzze@proton.me";

// 이 페이지는 법정 고지라 카드 그리드가 아니라 한 줄로 읽히는 문서 형태로 둔다.
// 본문 폭을 68ch 로 묶는 이유는 지표 카드와 달리 문장이 길어서다(줄이 길면 다음 줄
// 첫 글자를 찾기 어려워진다).

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.85, color: C.sub }}>{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

// Tailwind 프리플라이트가 ul 의 list-style 을 지운다. 여기서 되살리지 않으면 항목이
// 들여쓰기만 된 문단처럼 보여서, 고지 사항의 개수와 경계가 눈에 안 들어온다.
function Ul({ children }: { children: React.ReactNode }) {
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
function InfoBlock({ heading, rows }: { heading: string; rows: [string, React.ReactNode][] }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 10 }}>{heading}</div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 16px" }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ fontSize: 12, fontWeight: 700, color: "var(--c-muted)", whiteSpace: "nowrap" }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: C.sub }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none", fontWeight: 600 }}>
      {children}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: "68ch" }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: "-0.01em" }}>
        개인정보처리방침
      </h1>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--c-muted)" }}>시행일 · {EFFECTIVE_DATE}</p>

      <div style={{ marginTop: 24, fontSize: 14, lineHeight: 1.85, color: C.sub }}>
        <P>
          hatzze(이하 &quot;서비스&quot;)는 「개인정보 보호법」 등 관련 법령을 준수하며, 이용자의 정보를
          최소한으로만 처리합니다.
        </P>
        <P>
          <b style={{ color: C.ink }}>서비스에는 회원가입 절차가 없습니다.</b> 이름·연락처·계좌 등 이용자를
          직접 식별하는 정보를 입력받는 화면 자체가 없으며, 아래에 적힌 항목은 모두 웹사이트를 이용하는
          과정에서 자동으로 생성되는 정보입니다.
        </P>
      </div>

      <Section title="1. 수집하는 정보 항목">
        <P>서비스는 방문 통계 분석을 위해 다음 정보를 자동으로 수집합니다.</P>
        <Ul>
          <li>IP 주소를 통해 추정한 접속 지역(국가·도시 수준)</li>
          <li>쿠키에 저장되는 방문자 구분용 임의 식별자</li>
          <li>브라우저 종류·운영체제·기기 유형·화면 해상도·언어 설정</li>
          <li>방문 일시, 조회한 페이지, 페이지 체류 시간, 유입 경로 및 검색어</li>
          <li>서비스 안에서의 조작 기록(클릭한 항목, 검색하신 종목명, 화면 설정)</li>
        </Ul>
        <P>
          분석 도구(Google Analytics 4)는 IP 주소를 지역 추정에만 사용하고 저장하지 않습니다. 다만
          웹사이트가 동작하려면 접속 요청이 오가야 하므로, 호스팅 사업자와 글꼴 제공자의 서버 기록에는
          IP 주소가 일시적으로 남을 수 있습니다.
        </P>
      </Section>

      <Section title="2. 이용 목적">
        <Ul>
          <li>어떤 지표와 화면이 실제로 이용되는지 파악해 서비스를 개선하기 위해</li>
          <li>방문 규모와 유입 경로를 파악하기 위해</li>
          <li>오류를 확인하고 안정적으로 운영하기 위해</li>
        </Ul>
        <P>서비스는 수집한 정보를 광고 노출이나 이용자 개인을 겨냥한 목적으로 사용하지 않습니다.</P>
      </Section>

      <Section title="3. 보유 및 이용 기간">
        <Ul>
          <li>방문자 단위 분석 데이터: 수집일로부터 14개월이 지나면 자동 삭제됩니다</li>
          <li>개인을 식별할 수 없는 형태로 집계된 통계: 기간 제한 없이 보관합니다</li>
          <li>호스팅 접속 기록: 해당 사업자의 정책에 따릅니다</li>
        </Ul>
      </Section>

      <Section title="4. 제3자 제공">
        <P>
          서비스는 이용자의 정보를 제3자에게 판매하거나 제공하지 않습니다. 다만 서비스 운영에 필요한
          범위에서 아래 5항과 같이 처리를 위탁하며, 이 과정에서 정보가 국외로 이전됩니다.
        </P>
      </Section>

      <Section title="5. 처리위탁 및 국외 이전">
        <InfoBlock
          heading="Google LLC (방문 통계 분석)"
          rows={[
            ["이전 항목", "1항의 자동 수집 정보"],
            ["이전 국가", "미국"],
            ["이전 일시·방법", "서비스 이용 시점에 네트워크를 통해 전송"],
            ["이용 목적", "Google Analytics 4를 통한 방문 통계 분석"],
            ["보유 기간", "14개월(집계 통계는 기간 제한 없음)"],
            ["처리방침", <Ext key="ga" href="https://policies.google.com/privacy">policies.google.com/privacy</Ext>],
          ]}
        />
        <InfoBlock
          heading="Google LLC (웹 글꼴 제공)"
          rows={[
            ["이전 항목", "IP 주소, 브라우저 정보"],
            ["이전 국가", "미국"],
            ["이전 일시·방법", "페이지를 열 때 글꼴 요청과 함께 전송"],
            ["이용 목적", "Google Fonts를 통한 글꼴 제공"],
            ["보유 기간", "해당 사업자의 정책에 따름"],
            ["처리방침", <Ext key="gf" href="https://policies.google.com/privacy">policies.google.com/privacy</Ext>],
          ]}
        />
        <InfoBlock
          heading="Vercel Inc. (웹사이트 호스팅)"
          rows={[
            ["이전 항목", "IP 주소, 접속 기록"],
            ["이전 국가", "미국(서비스 서버는 대한민국 서울 리전에서 운영합니다)"],
            ["이전 일시·방법", "서비스 이용 시점에 네트워크를 통해 전송"],
            ["이용 목적", "웹사이트 호스팅 및 전송"],
            ["보유 기간", "해당 사업자의 정책에 따름"],
            ["처리방침", <Ext key="vc" href="https://vercel.com/legal/privacy-policy">vercel.com/legal/privacy-policy</Ext>],
          ]}
        />
      </Section>

      <Section title="6. 쿠키의 설치·운영 및 거부">
        <P>서비스는 다음 쿠키를 사용합니다.</P>
        <InfoBlock
          heading="hz-theme (필수)"
          rows={[
            ["설정 주체", "서비스"],
            ["용도", "밝은 화면·어두운 화면 선택을 기억"],
            ["보관 기간", "1년"],
          ]}
        />
        <InfoBlock
          heading="_ga, _ga_로 시작하는 쿠키 (분석)"
          rows={[
            ["설정 주체", "Google Analytics"],
            ["용도", "재방문 여부와 방문 횟수를 구분"],
            ["보관 기간", "최대 2년"],
          ]}
        />
        <P>
          <b style={{ color: C.ink }}>거부 방법</b>은 세 가지입니다.
        </P>
        <Ul>
          <li>
            사용하시는 브라우저의 설정에서 쿠키를 차단하실 수 있습니다. 이 경우 화면 테마 선택이
            저장되지 않습니다.
          </li>
          <li>
            <Ext href="https://tools.google.com/dlpage/gaoptout">Google 애널리틱스 차단 부가기능</Ext>을
            설치하시면 모든 사이트에서 수집이 중단됩니다.
          </li>
          <li>
            이 사이트에서만 수집을 원하지 않으시면{" "}
            <b style={{ color: C.ink }}>hatzze.fun/?ga=off</b> 주소로 한 번 접속해 주십시오. 해당 기기에서는
            이후 수집이 이루어지지 않습니다. 되돌리시려면{" "}
            <b style={{ color: C.ink }}>hatzze.fun/?ga=on</b> 으로 접속하시면 됩니다.
          </li>
        </Ul>
      </Section>

      <Section title="7. 정보주체의 권리와 행사 방법">
        <P>
          이용자는 자신의 정보에 대해 열람·정정·삭제·처리정지를 요구하실 수 있습니다. 아래 문의처로
          연락 주시면 지체 없이 처리해 드립니다.
        </P>
        <P>
          다만 서비스는 이용자를 식별할 수 있는 정보를 보관하지 않으므로, 특정 개인의 기록을 찾아
          삭제하는 것이 기술적으로 어려울 수 있습니다. 이 경우 6항의 거부 방법으로 이후 수집을 중단하시는
          편이 확실합니다.
        </P>
      </Section>

      <Section title="8. 정보의 파기">
        <P>
          보유 기간이 지난 정보는 지체 없이 파기합니다. 전자적 파일 형태의 정보는 복구할 수 없는 방법으로
          삭제합니다.
        </P>
      </Section>

      <Section title="9. 안전성 확보 조치">
        <Ul>
          <li>모든 통신 구간을 HTTPS로 암호화하여 전송합니다</li>
          <li>서비스는 이용자 개인정보를 담는 별도의 데이터베이스를 운영하지 않습니다</li>
          <li>분석 도구 접근 권한은 운영자로 한정합니다</li>
        </Ul>
      </Section>

      <Section title="10. 개인정보 보호책임자">
        <InfoBlock
          heading="문의처"
          rows={[
            ["책임자", "hatzze 운영자"],
            ["이메일", <a key="m" href={`mailto:${CONTACT_EMAIL}`} style={{ color: C.blue, textDecoration: "none", fontWeight: 600 }}>{CONTACT_EMAIL}</a>],
          ]}
        />
        <P>개인정보와 관련한 문의·불만·피해구제에 관한 사항을 접수하시면 지체 없이 답변해 드립니다.</P>
      </Section>

      <Section title="11. 권익침해 구제 방법">
        <P>아래 기관에 분쟁 해결이나 상담을 신청하실 수 있습니다.</P>
        <Ul>
          <li>개인정보분쟁조정위원회 · 1833-6972 · <Ext href="https://www.kopico.go.kr">kopico.go.kr</Ext></li>
          <li>개인정보침해신고센터 · 118 · <Ext href="https://privacy.kisa.or.kr">privacy.kisa.or.kr</Ext></li>
          <li>대검찰청 사이버수사과 · 1301 · <Ext href="https://www.spo.go.kr">spo.go.kr</Ext></li>
          <li>경찰청 사이버수사국 · 182 · <Ext href="https://ecrm.police.go.kr">ecrm.police.go.kr</Ext></li>
        </Ul>
      </Section>

      <Section title="12. 방침의 변경">
        <P>
          본 방침은 {EFFECTIVE_DATE}부터 시행합니다. 내용이 변경되는 경우 시행 7일 전부터 이 페이지를 통해
          알려 드립니다.
        </P>
      </Section>
    </div>
  );
}

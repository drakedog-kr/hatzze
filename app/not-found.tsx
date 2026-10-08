import type { Metadata } from "next";

import { DocCover } from "./legal";

/**
 * 없는 주소가 왔을 때의 화면. 루트 레이아웃(사이드바·탑바·푸터) 안에 그려진다.
 *
 * ## 왜 있어야 하나
 *
 * 이 파일이 없으면 Next 는 영문 기본 화면("404: This page could not be found")을 내고,
 * 페이지가 `notFound()` 를 부른 경우엔 한술 더 떠 **본문이 통째로 빈 흰 화면**이 됐다
 * (2026-09-09 전수조사 · `/stock/000000` · `/daily/2020-01-01`). 종목 코드를 잘못 친 사람이
 * 아무 글자도 없는 화면을 보는 셈이었다.
 *
 * ## 어디에 뜨나
 *
 * - 라우트 자체가 없는 주소(`/nonexistent`). 상태 404.
 * - 페이지가 `notFound()` 를 부른 주소(없는 종목·없는 날짜). 상태 404.
 * - `loading.tsx` 가 감싸는 세그먼트 안에서 `notFound()` 를 부른 주소(`/insider/stock/ZZZZZ`).
 *   이때는 골격이 먼저 200 으로 나가 버려 **상태는 200 이지만** 이 화면이 스트리밍으로
 *   들어오고, Next 가 `<meta name="robots" content="noindex">` 를 같이 넣는다. 예전엔
 *   이 파일이 없어 그 자리에 로딩 골격만 영원히 남았다.
 *
 * ⚠️ 셸의 `PageHeader` 는 주소로 제목을 고르므로, `/insider/…` 아래 없는 주소에서는
 *    위에 "내부자 리포트" 제목이 그대로 남는다. 여기 h1 과 둘이 되는데, 없는 주소의
 *    화면이라 감수한다. 셸을 고쳐 이 화면을 알아보게 하는 건 값에 비해 얻는 게 없다.
 */
/**
 * 404 의 머리 태그. 상태 404 로 나가는 없는 주소(`/nonexistent` · `/stock/000000`)는 페이지의 generateMetadata 가
 * 아니라 **이 파일의** 메타데이터를 쓴다(레이아웃 → not-found 순으로 모은다 · next/dist/lib/metadata/resolve-metadata.js).
 *
 * ⛔ canonical 을 **지운다.** 안 적으면 루트가 선언한 canonical `/` 를 물려받아(app/seo.ts 주석) 모든 404 가
 *    "나는 홈과 같은 화면"이라고 말했다(2026-09-30 실측 · `/stock/999999` 의 canonical 이 `https://hatzze.fun`).
 *    제목도 없어 루트의 사이트 제목이 그대로 나갔다. noindex 는 Next 가 404 에 알아서 넣으므로 적지 않는다(두 벌이 된다).
 */
export const metadata: Metadata = {
  title: "찾을 수 없는 주소입니다 | hatzze",
  alternates: { canonical: null },
};

/**
 * v2 문서 화면과 같은 첫 줄 띠 하나(2026-10-08 마지막 점검). 꼬리표 '404' · 안내 문장 · 아이콘 단추를 걷었다 — 설명 문장은 두지 않고,
 * 갈 곳 셋은 띠의 링크 칸이 맡는다.
 */
export default function NotFound() {
  return (
    <div className="hz-tx v2-kd v2-dc">
      <DocCover
        title="찾을 수 없는 주소입니다"
        links={[
          { href: "/", label: "시장 브리핑" },
          { href: "/kadera", label: "국장 카더라" },
          { href: "/insider", label: "내부자 리포트" },
        ]}
      />
    </div>
  );
}

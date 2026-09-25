import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * 상세 화면 맨 위의 "부모 › 지금 화면" 줄(shadcn Breadcrumb).
 *
 * 예전엔 다섯 화면(종목 · 내부자 종목 · 투자자 · 내부자 목록 · 테마 상세)이 "‹ 부모" 링크를 저마다 인라인 스타일로
 * 복사해 두고 있었다. 지금 화면 이름까지 한 줄에 적어 어디에 와 있는지를 말한다.
 * `hz-back-link` 는 폰에서 누르는 칸을 넓히는 규칙(mobile.css)이 붙는 이름이라 링크에 그대로 둔다.
 */
export function BackTrail({ parent, current }: { parent: { name: string; href: string }; current: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink className="hz-back-link" render={<Link href={parent.href} />}>
            {parent.name}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

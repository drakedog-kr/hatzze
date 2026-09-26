"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SortKey } from "./Holdings";

/** 표 위 '정렬' 목록. 고르면 순서 자체가 바뀌어 저장된다(DividendCalculator.sortLines). */
const SORTS: { key: SortKey; label: string }[] = [
  { key: "net", label: "배당 많은 순" },
  { key: "invest", label: "투자금 많은 순" },
  { key: "yield", label: "수익률 높은 순" },
  { key: "name", label: "이름순" },
];

/**
 * 표 위 '정렬' — shadcn DropdownMenu. 정렬은 한 번 세우는 동작이라 값이 남지 않는다 — 고르는 칸(select)이 아니라 메뉴다.
 * Holdings 가 따로 받아 온다(next/dynamic): 표는 담은 종목이 둘 이상일 때만 서고 그건 브라우저 저장소에서 오니, 메뉴(Base UI Menu ·
 * 위치 잡기)를 배당 화면 첫 로드에 싣지 않는다. 받는 동안은 같은 모양의 멈춘 단추가 선다.
 */
export function SortMenu({ onSort }: { onSort: (key: SortKey) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="dv-tsort" aria-label="담은 종목 정렬">
        정렬
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SORTS.map((o) => (
          <DropdownMenuItem key={o.key} onClick={() => onSort(o.key)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

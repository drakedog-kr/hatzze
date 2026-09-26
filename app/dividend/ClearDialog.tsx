"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/**
 * '모두 빼기' 확인 판(shadcn AlertDialog). DividendCalculator 가 '모두 빼기'를 처음 누를 때 받아 온다(next/dynamic) —
 * Base UI 대화상자(gzip 약 20KB)를 배당 화면 첫 로드에 싣지 않는다. 문구는 합쇼체.
 */
export function ClearDialog({ open, onOpenChange, count, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; count: number; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>담은 종목 {count}개를 모두 빼겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>적어 둔 주수·평단·계좌도 함께 지워지고 되돌릴 수 없습니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            모두 빼기
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

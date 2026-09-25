"use client";

/**
 * shadcn/ui Command(cmdk 바탕, 2026-09 레지스트리)를 옮긴 것이다. 모양은 app/styles/shadcn.css 의
 * `cn-command-*` 규칙(rhea 스타일).
 *
 * 원본과 다른 점: 아이콘 자리를 Material Symbols `Icon` 으로 바꿨고(dialog.tsx 머리말), 검색칸을 감싸는
 * InputGroup 은 이 파일 안에 필요한 만큼만 옮겼다(부품 하나를 위해 파일을 하나 더 들이지 않는다).
 */
import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "cn";

import { Icon } from "@/app/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive data-slot="command" className={cn("cn-command flex size-full flex-col overflow-hidden", className)} {...props} />
  );
}

function CommandDialog({
  title = "검색",
  description = "찾을 테마·종목을 입력하세요",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("cn-command-dialog top-1/3 translate-y-0 overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="cn-command-input-wrapper">
      <div
        data-slot="input-group"
        role="group"
        className="group/input-group cn-input-group cn-command-input-group relative flex w-full min-w-0 items-center outline-none"
      >
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn("cn-command-input outline-hidden disabled:cursor-not-allowed disabled:opacity-50", className)}
          {...props}
        />
        <div
          role="group"
          data-slot="input-group-addon"
          data-align="inline-start"
          className="cn-input-group-addon cn-input-group-addon-align-inline-start order-first flex cursor-text items-center justify-center select-none"
        >
          <Icon name="search" className="cn-command-input-icon" style={{ fontSize: 16 }} />
        </div>
      </div>
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("cn-command-list overflow-x-hidden overflow-y-auto", className)}
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" className={cn("cn-command-empty", className)} {...props} />;
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot="command-group" className={cn("cn-command-group", className)} {...props} />;
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator data-slot="command-separator" className={cn("cn-command-separator", className)} {...props} />;
}

function CommandItem({ className, children, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "cn-command-item group/command-item data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="command-shortcut" className={cn("cn-command-shortcut", className)} {...props} />;
}

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator };

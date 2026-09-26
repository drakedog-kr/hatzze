/**
 * shadcn/ui Button(Base UI 바탕, 2026-09 레지스트리 rhea)을 옮긴 것이다. 모양은 app/styles/shadcn.css 의 `cn-button-*`.
 *
 * 원본과 다른 점.
 * - 변형 표(cva)를 들이지 않고 이름 → 클래스 표 둘로 적었다. `class-variance-authority` 한 벌이 늘지 않는다.
 * - 클래스 합치기는 `cx`(lib/cx.ts). 넘겨받는 클래스가 기본 클래스와 부딪치지 않게 쓴다.
 * - 글자 굵기는 rhea 의 medium(500)이 아니라 bold(700)다 — 이 사이트의 단추·세그먼트가 전부 700 이라
 *   500 짜리 하나만 흐려 보인다(shadcn.css 의 .cn-button 참고).
 */
import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { cx } from "@/lib/cx";

const VARIANT = {
  default: "cn-button-default",
  outline: "cn-button-outline",
  secondary: "cn-button-secondary",
  ghost: "cn-button-ghost",
  destructive: "cn-button-destructive",
} as const;

const SIZE = {
  default: "cn-button-size-default",
  sm: "cn-button-size-sm",
  lg: "cn-button-size-lg",
  icon: "cn-button-size-icon",
} as const;

type ButtonProps = Omit<ButtonPrimitive.Props, "className"> & {
  className?: string;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
};

function buttonClass(variant: keyof typeof VARIANT = "default", size: keyof typeof SIZE = "default", className?: string) {
  return cx("cn-button", VARIANT[variant], SIZE[size], className);
}

function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return <ButtonPrimitive data-slot="button" data-variant={variant} className={buttonClass(variant, size, className)} {...props} />;
}

export { Button, buttonClass };
export type { ButtonProps };

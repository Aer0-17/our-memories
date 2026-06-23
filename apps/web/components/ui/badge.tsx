import type { HTMLAttributes } from "react";

type BadgeVariant =
  | "neutral"
  | "sakura"
  | "sky"
  | "mint"
  | "danger"
  | "warning";

const variantClass: Record<BadgeVariant, string> = {
  neutral: "border-dim/80 bg-dim/30 text-ink/70",
  sakura: "border-sakura bg-sakura/52 text-rose-ink",
  sky: "border-mist bg-mist/40 text-slate",
  mint: "border-mint bg-mint/40 text-leaf",
  danger: "border-rose/30 bg-rose/12 text-rose",
  warning: "border-bloom/40 bg-bloom/18 text-rose-ink",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** 圆角药丸标签，用于状态 / 角色 / 套餐等标记。 */
export function Badge({
  variant = "neutral",
  className = "",
  children,
  ...props
}: Readonly<BadgeProps>) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${variantClass[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

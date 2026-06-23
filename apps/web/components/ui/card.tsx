import type { HTMLAttributes, ReactNode } from "react";

type CardVariant = "default" | "elevated" | "ghost";

const variantClass: Record<CardVariant, string> = {
  default:
    "border border-dim/80 bg-cream/78 backdrop-blur shadow-[var(--shadow-card)]",
  elevated:
    "border border-dim/80 bg-cream shadow-[var(--shadow-card-strong)]",
  ghost: "border border-transparent bg-transparent",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClass: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-8",
};

/** 统一卡片容器：磨砂玻璃 / 浮空 / 幽灵三种变体。 */
export function Card({
  variant = "default",
  padding = "md",
  className = "",
  children,
  ...props
}: Readonly<CardProps> & { children?: ReactNode }) {
  return (
    <div
      className={`rounded-[8px] ${variantClass[variant]} ${paddingClass[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/** 卡片标题区，含可选右侧操作槽。 */
export function CardHeader({
  title,
  subtitle,
  action,
  className = "",
}: Readonly<{
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-ink/60">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

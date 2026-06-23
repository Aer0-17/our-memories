import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "border-sakura bg-sakura text-rose-ink hover:bg-bloom hover:text-cream",
  secondary: "border-dim bg-cream/78 text-ink hover:border-sky hover:text-sky",
  ghost: "border-transparent bg-transparent text-ink/62 hover:bg-dim/28 hover:text-ink",
  danger: "border-sakura bg-sakura/42 text-rose-ink hover:bg-bloom hover:text-cream",
};

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[7px] border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${variantClass[variant]} ${className}`}
      type="button"
      {...props}
    />
  );
}

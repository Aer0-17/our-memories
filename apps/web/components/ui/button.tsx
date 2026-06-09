import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "border-[#F5DCE0] bg-[#F5DCE0] text-[#B85D70] hover:bg-[#E8B8C2] hover:text-[#FAFBF7]",
  secondary: "border-[#D8DDD8] bg-[#FAFBF7]/78 text-[#5A6670] hover:border-[#A8C8DC] hover:text-[#A8C8DC]",
  ghost: "border-transparent bg-transparent text-[#5A6670]/62 hover:bg-[#D8DDD8]/28 hover:text-[#5A6670]",
  danger: "border-[#F5DCE0] bg-[#F5DCE0]/42 text-[#B85D70] hover:bg-[#E8B8C2] hover:text-[#FAFBF7]",
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

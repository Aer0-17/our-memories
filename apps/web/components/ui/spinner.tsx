import { Loader2 } from "lucide-react";

type SpinnerSize = "sm" | "md" | "lg";

const sizeClass: Record<SpinnerSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-8 w-8",
};

/** 旋转加载指示器，配合 lucide Loader2。 */
export function Spinner({
  size = "md",
  className = "",
}: Readonly<{ size?: SpinnerSize; className?: string }>) {
  return (
    <Loader2
      className={`animate-spin text-bloom ${sizeClass[size]} ${className}`}
      aria-label="加载中"
    />
  );
}

/** 居中加载占位，适合页面/区块初次加载。 */
export function LoadingBlock({
  label = "加载中…",
  className = "",
}: Readonly<{ label?: string; className?: string }>) {
  return (
    <div
      className={`grid place-items-center gap-3 py-12 text-ink/60 ${className}`}
    >
      <Spinner size="lg" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

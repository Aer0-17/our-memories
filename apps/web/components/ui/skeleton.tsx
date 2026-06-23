/** 骨架屏占位块，模拟内容加载中的形状。 */
export function Skeleton({
  className = "",
}: Readonly<{ className?: string }>) {
  return (
    <div
      className={`animate-pulse rounded-[6px] bg-dim/40 ${className}`}
      aria-hidden
    />
  );
}

/** 卡片骨架：图标圆 + 两行文字，适合列表项加载态。 */
export function SkeletonCard({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <div
      className={`rounded-[8px] border border-dim/80 bg-cream/78 p-4 shadow-[var(--shadow-card)] ${className}`}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

/** 列表骨架：N 行等高占位。 */
export function SkeletonList({
  rows = 3,
  className = "",
}: Readonly<{ rows?: number; className?: string }>) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

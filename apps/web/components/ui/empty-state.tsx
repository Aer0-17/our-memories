import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  children,
}: Readonly<{
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}>) {
  return (
    <div className="grid min-h-[320px] place-items-center rounded-[8px] border border-dashed border-[#D8DDD8] bg-[#FAFBF7]/58 px-6 py-12 text-center shadow-[0_14px_34px_rgba(90,102,112,0.045)] backdrop-blur">
      <div className="max-w-[420px]">
        {icon && (
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[8px] border border-[#F5DCE0] bg-[#F5DCE0]/42 text-[#B85D70]">
            {icon}
          </div>
        )}
        <h2 className="mt-4 text-xl font-semibold text-[#5A6670]">{title}</h2>
        {children && <div className="mt-3 text-sm leading-7 text-[#5A6670]/60">{children}</div>}
      </div>
    </div>
  );
}

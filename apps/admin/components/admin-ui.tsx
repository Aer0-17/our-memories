"use client";

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "premium";

const toneClass: Record<Tone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  premium: "border-violet-200 bg-violet-50 text-violet-700",
};

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-[var(--foreground)] sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  const classes = {
    primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]",
    secondary: "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]",
    ghost: "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 ${classes[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({
  type = "info",
  children,
}: {
  type?: "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const Icon = type === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${toneClass[type]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: Tone;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--muted-foreground)]">{label}</span>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${toneClass[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="text-2xl font-semibold text-[var(--foreground)]">{value}</div>
      {detail && <div className="mt-2 text-xs text-[var(--muted-foreground)]">{detail}</div>}
    </section>
  );
}

export function Panel({
  title,
  description,
  children,
  actions,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm ${className}`}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="font-semibold text-[var(--foreground)]">{title}</h2>}
            {description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 h-2 w-16 rounded-full bg-[var(--border)]" />
      <div className="font-medium text-[var(--foreground)]">{title}</div>
      {description && <div className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</div>}
    </div>
  );
}

export function LoadingState({ label = "加载中..." }: { label?: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border)] px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[var(--muted-foreground)]">
        共 {total.toLocaleString()} 条 · 第 {page} / {totalPages} 页
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft size={16} />
          上一页
        </Button>
        <Button
          variant="secondary"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          下一页
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
      {label}
      {children}
    </label>
  );
}

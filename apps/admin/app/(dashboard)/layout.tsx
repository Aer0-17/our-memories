"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, getSession, type AdminSession } from "@/lib/api";
import {
  Archive,
  DatabaseBackup,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { href: "/spaces", label: "空间管理", icon: Archive },
  { href: "/users", label: "用户管理", icon: Users },
  { href: "/orders", label: "订单管理", icon: ReceiptText },
  { href: "/backup", label: "备份迁移", icon: DatabaseBackup },
  { href: "/image-generation", label: "生图节点", icon: Sparkles },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const currentPath = pathname?.startsWith("/admin/")
    ? pathname.slice("/admin".length)
    : pathname;

  useEffect(() => {
    let mounted = true;

    queueMicrotask(() => {
      if (!mounted) return;
      const storedSession = getSession();
      setSession(storedSession);
      if (!storedSession) router.push("/login");
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogout = () => {
    logout();
  };

  if (!session) return null;

  const nav = (
    <>
      <div className="border-b border-slate-800/80 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-400 text-slate-950">
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Our Memories</h1>
            <p className="text-xs text-slate-400">Admin Console</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setNavOpen(false)}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                isActive
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800/80 p-3">
        <div className="mb-2 rounded-lg bg-slate-800/80 px-3 py-3">
          <div className="truncate text-sm font-medium text-white">{session.admin.displayName}</div>
          <div className="truncate text-xs text-slate-400">@{session.admin.username}</div>
        </div>
        <button
          onClick={handleLogout}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={18} />
          <span>退出登录</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-950 lg:flex">
        {nav}
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--border)] bg-white/95 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setNavOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--muted)]"
          aria-label="打开导航"
        >
          <Menu size={22} />
        </button>
        <div className="text-sm font-semibold">Our Memories Admin</div>
        <button
          onClick={handleLogout}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--muted)]"
          aria-label="退出登录"
        >
          <LogOut size={20} />
        </button>
      </header>

      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setNavOpen(false)}
            aria-label="关闭导航遮罩"
          />
          <aside className="relative flex h-full w-72 flex-col bg-slate-950 shadow-2xl">
            <button
              onClick={() => setNavOpen(false)}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label="关闭导航"
            >
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

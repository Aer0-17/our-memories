"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";
import { Button, Notice } from "@/components/admin-ui";
import { LockKeyhole, ShieldCheck, Sparkles, UserRound } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
      router.push("/dashboard");
    } catch {
      setError("登录失败，请检查用户名和密码");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
            <ShieldCheck size={18} className="text-teal-300" />
            私有部署管理控制台
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-tight tracking-normal">
            Our Memories
            <span className="mt-3 block text-slate-300">把空间、用户、订单和迁移集中管理。</span>
          </h1>
          <div className="mt-10 grid max-w-3xl grid-cols-3 gap-3">
            {["空间状态", "备份迁移", "生图节点"].map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/5 px-4 py-5">
                <Sparkles size={20} className="mb-4 text-teal-300" />
                <div className="text-sm font-medium text-white">{item}</div>
                <div className="mt-1 text-xs text-slate-400">Admin ready</div>
              </div>
            ))}
          </div>
        </section>

        <div className="w-full rounded-lg border border-white/10 bg-white p-6 text-[var(--foreground)] shadow-2xl sm:p-8">
          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-teal-50 text-[var(--primary)]">
              <ShieldCheck size={24} />
            </div>
            <h2 className="text-2xl font-semibold">管理员登录</h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              使用部署时创建的管理员账号进入后台。
            </p>
          </div>

          {error && (
            <div className="mb-5">
              <Notice type="danger">{error}</Notice>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="grid gap-2 text-sm font-medium">
              用户名
              <div className="relative">
                <UserRound
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] py-2.5 pl-10 pr-3"
                  required
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              密码
              <div className="relative">
                <LockKeyhole
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] py-2.5 pl-10 pr-3"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </label>

            <Button type="submit" loading={loading} className="w-full">
              登录后台
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import useSWR from "swr";
import { apiGet } from "@/lib/api";
import {
  Activity,
  Archive,
  ArrowRight,
  DatabaseBackup,
  ReceiptText,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { Badge, EmptyState, LoadingState, MetricCard, PageHeader, Panel } from "@/components/admin-ui";
import { formatCurrency } from "@/lib/format";

interface Stats {
  totalSpaces: number;
  activeSpaces: number;
  lifetimeSpaces: number;
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
}

export default function DashboardPage() {
  const { data: stats, error } = useSWR<Stats>("/api/v1/admin/stats", apiGet);

  if (error) {
    return <EmptyState title="统计加载失败" description="请确认后端服务可访问，或重新登录后台。" />;
  }

  if (!stats) {
    return <LoadingState />;
  }

  const activeRate = stats.totalSpaces > 0 ? ((stats.activeSpaces / stats.totalSpaces) * 100).toFixed(1) : "0.0";
  const paidRate = stats.totalSpaces > 0 ? ((stats.lifetimeSpaces / stats.totalSpaces) * 100).toFixed(1) : "0.0";

  const cards = [
    {
      title: "总空间数",
      value: stats.totalSpaces,
      icon: Archive,
      tone: "info" as const,
      detail: "包含活跃、暂停和已删除空间",
    },
    {
      title: "活跃空间",
      value: stats.activeSpaces,
      icon: Activity,
      tone: "success" as const,
      detail: `${activeRate}% 仍在使用`,
    },
    {
      title: "付费空间",
      value: stats.lifetimeSpaces,
      icon: WalletCards,
      tone: "premium" as const,
      detail: `${paidRate}% 转化率`,
    },
    {
      title: "总用户数",
      value: stats.totalUsers,
      icon: Users,
      tone: "neutral" as const,
      detail: "按空间成员累计",
    },
  ];

  return (
    <div>
      <PageHeader title="仪表盘" description="运营健康度、付费转化、关键管理入口都集中在这里。" />

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <MetricCard
            key={card.title}
            label={card.title}
            value={card.value.toLocaleString()}
            icon={card.icon}
            tone={card.tone}
            detail={card.detail}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="收入统计" description="人工确认订单后会同步升级对应空间。">
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div>
              <div className="text-sm text-[var(--muted-foreground)]">总订单数</div>
              <div className="mt-2 text-2xl font-semibold">{stats.totalOrders.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted-foreground)]">总收入</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--primary)]">
                {formatCurrency(stats.totalRevenue)}
              </div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted-foreground)]">转化率</div>
              <div className="mt-2 text-2xl font-semibold">{paidRate}%</div>
            </div>
          </div>
        </Panel>

        <Panel title="快速操作" description="高频后台任务入口。">
          <div className="divide-y divide-[var(--border)]">
            {[
              { href: "/spaces", label: "检查空间状态", icon: Archive, badge: "空间" },
              { href: "/orders", label: "处理待确认订单", icon: ReceiptText, badge: "订单" },
              { href: "/backup", label: "导出或导入备份", icon: DatabaseBackup, badge: "迁移" },
              { href: "/image-generation", label: "维护生图节点", icon: Sparkles, badge: "配置" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-4 transition hover:bg-[var(--muted)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--secondary)] text-[var(--primary)]">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
                  <Badge>{item.badge}</Badge>
                  <ArrowRight size={16} className="text-[var(--muted-foreground)]" />
                </Link>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

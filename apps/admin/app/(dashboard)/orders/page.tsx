"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiGet, apiPost } from "@/lib/api";
import { CheckCircle2, RefreshCw, ReceiptText } from "lucide-react";
import { Badge, Button, EmptyState, LoadingState, Notice, PageHeader, Pagination, Panel } from "@/components/admin-ui";
import { formatCurrency, formatDateTime, shortId } from "@/lib/format";

interface Order {
  id: string;
  spaceId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paidAt: string;
  createdAt: string;
  spaceCode: string;
  spaceName: string;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

const pageSize = 20;

const statusLabel: Record<string, string> = {
  pending: "待处理",
  paid: "已支付",
  cancelled: "已取消",
};

function statusTone(status: string) {
  if (status === "paid") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "cancelled") return "danger" as const;
  return "neutral" as const;
}

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "danger"; text: string } | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (status) params.set("status", status);
    return params.toString();
  }, [page, status]);

  const { data, error, mutate, isLoading } = useSWR<OrdersResponse>(`/api/v1/admin/orders?${query}`, apiGet);

  const handleConfirmOrder = async (order: Order) => {
    const confirmed = window.confirm(`确认将订单 ${shortId(order.id)} 标记为已付款，并升级空间 ${order.spaceCode}？`);
    if (!confirmed) return;
    setBusyId(order.id);
    setNotice(null);
    try {
      await apiPost(`/api/v1/admin/orders/${order.id}/confirm`);
      await mutate();
      setNotice({ type: "success", text: "订单已确认，空间已升级为终身版" });
    } catch {
      setNotice({ type: "danger", text: "订单确认失败，可能已被处理或不存在" });
    } finally {
      setBusyId("");
    }
  };

  const orders = data?.orders || [];

  return (
    <div>
      <PageHeader
        title="订单管理"
        description="查看付费订单并手动确认待处理订单，确认后会同步升级对应空间。"
        actions={
          <Button variant="secondary" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw size={16} />
            刷新
          </Button>
        }
      />

      {notice && (
        <div className="mb-5">
          <Notice type={notice.type}>{notice.text}</Notice>
        </div>
      )}

      <Panel className="mb-5">
        <div className="grid gap-3 p-4 sm:grid-cols-[220px_1fr]">
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2.5"
          >
            <option value="">全部状态</option>
            <option value="pending">待处理</option>
            <option value="paid">已支付</option>
            <option value="cancelled">已取消</option>
          </select>
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
            <ReceiptText size={16} />
            当前筛选：{status ? statusLabel[status] : "全部订单"}
          </div>
        </div>
      </Panel>

      <Panel>
        {error && <EmptyState title="订单加载失败" description="请确认管理端登录状态或后端服务。" />}
        {!error && isLoading && <LoadingState />}
        {!error && !isLoading && orders.length === 0 && <EmptyState title="没有匹配的订单" description="调整状态筛选后再试。" />}
        {!error && orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">订单</th>
                  <th className="px-5 py-3 font-medium">空间</th>
                  <th className="px-5 py-3 font-medium">金额</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">时间</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {orders.map((order) => (
                  <tr key={order.id} className="transition hover:bg-[var(--muted)]/70">
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs text-[var(--foreground)]">{shortId(order.id)}</div>
                      <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {order.paymentMethod || "manual"}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium">{order.spaceName || "未命名空间"}</div>
                      <div className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{order.spaceCode}</div>
                    </td>
                    <td className="px-5 py-4 font-semibold">{formatCurrency(order.amount, order.currency || "CNY")}</td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(order.status)}>{statusLabel[order.status] || order.status}</Badge>
                    </td>
                    <td className="px-5 py-4 text-[var(--muted-foreground)]">
                      <div>{formatDateTime(order.createdAt)}</div>
                      {order.paidAt && <div className="mt-1 text-xs">支付：{formatDateTime(order.paidAt)}</div>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {order.status === "pending" ? (
                        <Button
                          variant="secondary"
                          loading={busyId === order.id}
                          onClick={() => handleConfirmOrder(order)}
                        >
                          <CheckCircle2 size={16} />
                          确认支付
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">无可用操作</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pagination page={page} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />}
      </Panel>
    </div>
  );
}

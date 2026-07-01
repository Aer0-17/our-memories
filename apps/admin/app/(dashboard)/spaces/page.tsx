"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiDelete, apiGet, apiPut } from "@/lib/api";
import { Archive, Eye, HardDrive, RefreshCw, Search, ShieldAlert, Trash2, Users } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  LoadingState,
  MetricCard,
  Notice,
  PageHeader,
  Pagination,
  Panel,
} from "@/components/admin-ui";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";

interface Space {
  id: string;
  spaceCode: string;
  name: string;
  status: string;
  tier: string;
  storageUsedBytes: number;
  purchasedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

interface SpaceUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
}

interface SpaceDetailResponse {
  space: Space;
  users: SpaceUser[];
  stats: {
    memoryCount: number;
    photoCount: number;
  };
}

interface SpacesResponse {
  spaces: Space[];
  total: number;
  page: number;
  pageSize: number;
}

const pageSize = 20;

const statusLabel: Record<string, string> = {
  active: "活跃",
  suspended: "已暂停",
  deleted: "已删除",
};

const tierLabel: Record<string, string> = {
  free: "免费版",
  lifetime: "终身版",
};

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "suspended") return "warning" as const;
  if (status === "deleted") return "danger" as const;
  return "neutral" as const;
}

export default function SpacesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "danger"; text: string } | null>(null);
  const [busyId, setBusyId] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    return params.toString();
  }, [page, search, status]);

  const { data, error, mutate, isLoading } = useSWR<SpacesResponse>(`/api/v1/admin/spaces?${query}`, apiGet);
  const { data: detail, mutate: mutateDetail } = useSWR<SpaceDetailResponse>(
    selectedSpaceId ? `/api/v1/admin/spaces/${selectedSpaceId}` : null,
    apiGet,
  );

  const handleStatusChange = async (space: Space, newStatus: string) => {
    if (space.status === newStatus) return;
    const confirmed = window.confirm(`确认将空间 ${space.spaceCode} 改为「${statusLabel[newStatus] || newStatus}」？`);
    if (!confirmed) return;
    setBusyId(space.id);
    setNotice(null);
    try {
      await apiPut(`/api/v1/admin/spaces/${space.id}/status`, { status: newStatus });
      await mutate();
      if (selectedSpaceId === space.id) await mutateDetail();
      setNotice({ type: "success", text: "空间状态已更新" });
    } catch {
      setNotice({ type: "danger", text: "空间状态更新失败" });
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (space: Space) => {
    const confirmed = window.confirm(`确认删除空间 ${space.spaceCode}？这是软删除，可通过状态恢复为活跃。`);
    if (!confirmed) return;
    setBusyId(space.id);
    setNotice(null);
    try {
      await apiDelete(`/api/v1/admin/spaces/${space.id}`);
      await mutate();
      if (selectedSpaceId === space.id) await mutateDetail();
      setNotice({ type: "success", text: "空间已标记为删除" });
    } catch {
      setNotice({ type: "danger", text: "删除空间失败" });
    } finally {
      setBusyId("");
    }
  };

  const spaces = data?.spaces || [];

  return (
    <div>
      <PageHeader
        title="空间管理"
        description="查看每个情侣空间的状态、套餐、存储占用和成员，并执行暂停、恢复或软删除。"
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
        <div className="grid gap-3 p-4 lg:grid-cols-[1fr_190px]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
              size={18}
            />
            <input
              type="search"
              placeholder="搜索空间码或名称"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-[var(--border)] py-2.5 pl-10 pr-3"
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2.5"
          >
            <option value="">全部状态</option>
            <option value="active">活跃</option>
            <option value="suspended">已暂停</option>
            <option value="deleted">已删除</option>
          </select>
        </div>
      </Panel>

      <Panel>
        {error && <EmptyState title="空间加载失败" description="请检查管理端登录状态或后端服务。" />}
        {!error && isLoading && <LoadingState />}
        {!error && !isLoading && spaces.length === 0 && (
          <EmptyState title="没有匹配的空间" description="调整搜索词或状态筛选后再试。" />
        )}
        {!error && spaces.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">空间</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">套餐</th>
                  <th className="px-5 py-3 font-medium">存储</th>
                  <th className="px-5 py-3 font-medium">创建时间</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {spaces.map((space) => (
                  <tr key={space.id} className="transition hover:bg-[var(--muted)]/70">
                    <td className="px-5 py-4">
                      <div className="font-medium text-[var(--foreground)]">{space.name || "未命名空间"}</div>
                      <div className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{space.spaceCode}</div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(space.status)}>{statusLabel[space.status] || space.status}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={space.tier === "lifetime" ? "premium" : "neutral"}>
                        {tierLabel[space.tier] || space.tier}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-[var(--muted-foreground)]">{formatBytes(space.storageUsedBytes)}</td>
                    <td className="px-5 py-4 text-[var(--muted-foreground)]">{formatDate(space.createdAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <IconButton label="查看详情" onClick={() => setSelectedSpaceId(space.id)}>
                          <Eye size={17} />
                        </IconButton>
                        <select
                          value={space.status}
                          disabled={busyId === space.id}
                          onChange={(event) => handleStatusChange(space, event.target.value)}
                          className="h-9 rounded-lg border border-[var(--border)] px-2 text-xs"
                        >
                          <option value="active">活跃</option>
                          <option value="suspended">暂停</option>
                          <option value="deleted">删除</option>
                        </select>
                        <IconButton
                          label="软删除空间"
                          disabled={busyId === space.id || space.status === "deleted"}
                          onClick={() => handleDelete(space)}
                          className="hover:text-rose-600"
                        >
                          <Trash2 size={17} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pagination page={page} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />}
      </Panel>

      {selectedSpaceId && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setSelectedSpaceId(null)}
            aria-label="关闭空间详情"
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-white px-5 py-4">
              <div>
                <h2 className="font-semibold">空间详情</h2>
                <p className="text-xs text-[var(--muted-foreground)]">成员、内容规模和状态操作</p>
              </div>
              <Button variant="secondary" onClick={() => setSelectedSpaceId(null)}>
                关闭
              </Button>
            </div>

            {!detail && <LoadingState />}
            {detail && (
              <div className="space-y-5 p-5">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold">{detail.space.name || "未命名空间"}</h3>
                      <p className="mt-1 font-mono text-sm text-[var(--muted-foreground)]">{detail.space.spaceCode}</p>
                    </div>
                    <Badge tone={statusTone(detail.space.status)}>{statusLabel[detail.space.status] || detail.space.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MetricCard label="成员" value={detail.users.length} icon={Users} tone="info" />
                    <MetricCard label="回忆" value={detail.stats.memoryCount} icon={Archive} tone="success" />
                    <MetricCard label="照片" value={detail.stats.photoCount} icon={HardDrive} tone="premium" />
                    <MetricCard label="存储" value={formatBytes(detail.space.storageUsedBytes)} icon={ShieldAlert} tone="warning" />
                  </div>
                </div>

                <Panel title="基础信息">
                  <dl className="grid gap-3 p-5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted-foreground)]">套餐</dt>
                      <dd>{tierLabel[detail.space.tier] || detail.space.tier}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted-foreground)]">购买时间</dt>
                      <dd>{formatDateTime(detail.space.purchasedAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted-foreground)]">创建时间</dt>
                      <dd>{formatDateTime(detail.space.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--muted-foreground)]">更新时间</dt>
                      <dd>{formatDateTime(detail.space.updatedAt)}</dd>
                    </div>
                  </dl>
                </Panel>

                <Panel title="成员">
                  <div className="divide-y divide-[var(--border)]">
                    {detail.users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between gap-3 px-5 py-4">
                        <div>
                          <div className="font-medium">{user.displayName || user.username}</div>
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            @{user.username} · {formatDate(user.createdAt)}
                          </div>
                        </div>
                        <Badge tone={user.role === "owner" ? "premium" : "neutral"}>
                          {user.role === "owner" ? "拥有者" : "成员"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

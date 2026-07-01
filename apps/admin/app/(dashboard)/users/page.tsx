"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiGet, apiPut } from "@/lib/api";
import { RefreshCw, Search, ShieldCheck, UserRoundCog } from "lucide-react";
import { Badge, Button, EmptyState, LoadingState, Notice, PageHeader, Pagination, Panel } from "@/components/admin-ui";
import { formatDate } from "@/lib/format";

interface User {
  id: string;
  spaceId: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  spaceCode: string;
  spaceName: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
}

const pageSize = 20;

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "danger"; text: string } | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [page, search]);

  const { data, error, mutate, isLoading } = useSWR<UsersResponse>(`/api/v1/admin/users?${query}`, apiGet);

  const updateRole = async (user: User, role: string) => {
    if (user.role === role) return;
    const confirmed = window.confirm(`确认将 ${user.displayName || user.username} 的角色改为「${role === "owner" ? "拥有者" : "成员"}」？`);
    if (!confirmed) return;
    setBusyId(user.id);
    setNotice(null);
    try {
      await apiPut(`/api/v1/admin/users/${user.id}/role`, { role });
      await mutate();
      setNotice({ type: "success", text: "用户角色已更新" });
    } catch {
      setNotice({ type: "danger", text: "用户角色更新失败" });
    } finally {
      setBusyId("");
    }
  };

  const users = data?.users || [];

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="按用户名、显示名或空间码检索成员，并维护空间内的 owner/member 角色。"
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
        <div className="p-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
              size={18}
            />
            <input
              type="search"
              placeholder="搜索用户名、显示名或空间码"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-[var(--border)] py-2.5 pl-10 pr-3"
            />
          </div>
        </div>
      </Panel>

      <Panel>
        {error && <EmptyState title="用户加载失败" description="请确认管理端登录状态或后端服务。" />}
        {!error && isLoading && <LoadingState />}
        {!error && !isLoading && users.length === 0 && (
          <EmptyState title="没有匹配的用户" description="调整搜索条件后再试。" />
        )}
        {!error && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">用户</th>
                  <th className="px-5 py-3 font-medium">角色</th>
                  <th className="px-5 py-3 font-medium">所属空间</th>
                  <th className="px-5 py-3 font-medium">创建时间</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.map((user) => (
                  <tr key={user.id} className="transition hover:bg-[var(--muted)]/70">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)] text-[var(--primary)]">
                          <UserRoundCog size={18} />
                        </div>
                        <div>
                          <div className="font-medium">{user.displayName || user.username}</div>
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={user.role === "owner" ? "premium" : "neutral"}>
                        {user.role === "owner" ? "拥有者" : "成员"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium">{user.spaceName || "未命名空间"}</div>
                      <div className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{user.spaceCode}</div>
                    </td>
                    <td className="px-5 py-4 text-[var(--muted-foreground)]">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <ShieldCheck size={16} className="text-[var(--muted-foreground)]" />
                        <select
                          value={user.role}
                          disabled={busyId === user.id}
                          onChange={(event) => updateRole(user, event.target.value)}
                          className="h-9 rounded-lg border border-[var(--border)] px-2 text-xs"
                        >
                          <option value="owner">拥有者</option>
                          <option value="member">成员</option>
                        </select>
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
    </div>
  );
}

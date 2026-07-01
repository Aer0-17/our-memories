"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, DatabaseBackup, Download, FileJson, RefreshCw, Upload } from "lucide-react";
import { apiDownload, apiGet, apiPost } from "@/lib/api";
import { Button, EmptyState, Field, Notice, PageHeader, Panel } from "@/components/admin-ui";
import { formatBytes, formatDate } from "@/lib/format";

interface Space {
  id: string;
  spaceCode: string;
  name: string;
  status: string;
  tier: string;
  storageUsedBytes: number;
  createdAt: string;
}

interface SpacesResponse {
  spaces: Space[];
  total: number;
  page: number;
  pageSize: number;
}

interface ImportResponse {
  ok: boolean;
  spaceId: string;
  spaceCode: string;
  reloginRequired: boolean;
}

interface BackupPreview {
  format?: string;
  version?: number;
  space?: {
    space_code?: string;
  };
  source?: {
    spaceId?: string;
    spaceCode?: string;
    name?: string;
  };
  media?: unknown[];
  tables?: Record<string, unknown[]>;
}

export default function BackupPage() {
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "danger" | "warning"; text: string } | null>(null);

  const { data, error, mutate, isLoading } = useSWR<SpacesResponse>(
    "/api/v1/admin/spaces?page=1&pageSize=100",
    apiGet,
  );

  const selectedSpace = useMemo(
    () => data?.spaces.find((space) => space.id === selectedSpaceId),
    [data?.spaces, selectedSpaceId],
  );

  const handleFileChange = async (file: File | null) => {
    setBackupFile(file);
    setBackupPreview(null);
    setNotice(null);
    if (!file) return;
    try {
      const raw = await file.text();
      setBackupPreview(JSON.parse(raw) as BackupPreview);
    } catch {
      setNotice({ type: "danger", text: "无法解析备份文件，请选择有效的 JSON 文件。" });
    }
  };

  const handleExport = async () => {
    if (!selectedSpaceId) {
      setNotice({ type: "warning", text: "请选择要导出的空间。" });
      return;
    }

    setNotice(null);
    setIsExporting(true);
    try {
      const { blob, filename } = await apiDownload(`/api/v1/admin/spaces/${selectedSpaceId}/backup/export`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice({ type: "success", text: `已导出 ${selectedSpace?.spaceCode || "空间"} 的备份。` });
    } catch {
      setNotice({ type: "danger", text: "导出失败，请确认空间仍存在且后端服务正常。" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!backupFile || !backupPreview) {
      setNotice({ type: "warning", text: "请选择可解析的备份 JSON 文件。" });
      return;
    }

    const spaceCode = backupPreview.source?.spaceCode || backupPreview.space?.space_code || "未知空间";
    const mediaCount = backupPreview.media?.length || 0;
    const memoryCount = backupPreview.tables?.memories?.length || 0;

    const confirmed = window.confirm(
      `确认导入 ${spaceCode}？\n\n这会替换服务器上同 ID 或同空间码的现有空间。\n备份中包含 ${memoryCount} 条回忆和 ${mediaCount} 个媒体引用。`,
    );
    if (!confirmed) return;

    setNotice(null);
    setIsImporting(true);
    try {
      const result = await apiPost<ImportResponse>("/api/v1/admin/backup/import", backupPreview);
      setNotice({ type: "success", text: `导入完成：${result.spaceCode || result.spaceId}` });
      setBackupFile(null);
      setBackupPreview(null);
      await mutate();
    } catch {
      setNotice({ type: "danger", text: "导入失败，请确认备份格式、版本和空间数据完整。" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="备份迁移"
        description="导出单个空间的可迁移 JSON 备份，或将备份导入当前服务器。"
        actions={
          <Button variant="secondary" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw size={16} />
            刷新空间
          </Button>
        }
      />

      {notice && (
        <div className="mb-5">
          <Notice type={notice.type}>{notice.text}</Notice>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="导出备份"
          description="生成一个包含空间、内容表和媒体引用的 JSON 文件。"
          actions={<DatabaseBackup size={20} className="text-[var(--primary)]" />}
        >
          <div className="space-y-5 p-5">
            {error && <EmptyState title="空间列表加载失败" description="无法选择导出空间。" />}
            {!error && (
              <>
              <Field label="空间">
                <select
                  value={selectedSpaceId}
                  onChange={(event) => setSelectedSpaceId(event.target.value)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2.5"
                >
                  <option value="">选择空间</option>
                  {data?.spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.spaceCode} / {space.name || "未命名空间"}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedSpace && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm">
                  <div className="font-medium">{selectedSpace.name || "未命名空间"}</div>
                  <div className="mt-1 text-[var(--muted-foreground)]">
                    {selectedSpace.spaceCode} · {selectedSpace.status} · {selectedSpace.tier} ·{" "}
                    {formatBytes(selectedSpace.storageUsedBytes)} · {formatDate(selectedSpace.createdAt)}
                  </div>
                </div>
              )}

              <Button onClick={handleExport} loading={isExporting} disabled={!selectedSpaceId}>
                <Download size={18} />
                下载备份
              </Button>
              </>
            )}
          </div>
        </Panel>

        <Panel
          title="导入备份"
          description="导入会替换同 ID 或同空间码的数据，建议先导出现有空间。"
          actions={<Upload size={20} className="text-[var(--primary)]" />}
        >
          <div className="space-y-5 p-5">
            <Field label="备份文件">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-6 text-center transition hover:bg-[var(--secondary)]">
                <FileJson size={26} className="text-[var(--primary)]" />
                <span className="text-sm font-medium">{backupFile ? backupFile.name : "选择 JSON 备份文件"}</span>
                {backupFile && (
                  <span className="text-xs text-[var(--muted-foreground)]">{formatBytes(backupFile.size)}</span>
                )}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
                />
              </label>
            </Field>

            {backupPreview && (
              <div className="grid gap-2 rounded-lg border border-[var(--border)] px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--muted-foreground)]">空间</span>
                  <span>{backupPreview.source?.spaceCode || backupPreview.space?.space_code || "-"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--muted-foreground)]">回忆</span>
                  <span>{backupPreview.tables?.memories?.length || 0}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--muted-foreground)]">媒体引用</span>
                  <span>{backupPreview.media?.length || 0}</span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>导入只处理数据库和媒体引用。图片文件需要先按备份中的 key 复制到新对象存储。</span>
            </div>

            <Button onClick={handleImport} loading={isImporting} disabled={!backupFile || !backupPreview}>
              <Upload size={18} />
              导入备份
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

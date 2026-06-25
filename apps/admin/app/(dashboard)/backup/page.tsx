"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Download, FileJson, Loader2, Upload } from "lucide-react";
import { apiDownload, apiGet, apiPost } from "@/lib/api";

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
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { data } = useSWR<SpacesResponse>(
    "/api/v1/admin/spaces?page=1&pageSize=100",
    apiGet
  );

  const selectedSpace = useMemo(
    () => data?.spaces.find((space) => space.id === selectedSpaceId),
    [data?.spaces, selectedSpaceId]
  );

  const handleExport = async () => {
    if (!selectedSpaceId) {
      setError("请选择要导出的空间");
      return;
    }

    setError("");
    setMessage("");
    setIsExporting(true);
    try {
      const { blob, filename } = await apiDownload(
        `/api/v1/admin/spaces/${selectedSpaceId}/backup/export`
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`已导出 ${selectedSpace?.spaceCode || "空间"} 的备份`);
    } catch {
      setError("导出失败");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!backupFile) {
      setError("请选择备份 JSON 文件");
      return;
    }

    setError("");
    setMessage("");
    setIsImporting(true);
    try {
      const raw = await backupFile.text();
      const payload = JSON.parse(raw) as BackupPreview;
      const spaceCode = payload.source?.spaceCode || payload.space?.space_code || "未知空间";
      const mediaCount = payload.media?.length || 0;
      const memoryCount = payload.tables?.memories?.length || 0;

      const confirmed = confirm(
        `确认导入 ${spaceCode}？\n\n这会替换服务器上同 ID 或同空间码的现有空间。\n备份中包含 ${memoryCount} 条回忆和 ${mediaCount} 个媒体引用。`
      );
      if (!confirmed) return;

      const result = await apiPost<ImportResponse>("/api/v1/admin/backup/import", payload);
      setMessage(`导入完成：${result.spaceCode || result.spaceId}`);
      setBackupFile(null);
    } catch {
      setError("导入失败，请确认文件格式正确");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[var(--foreground)]">
          备份迁移
        </h1>
        <p className="text-[var(--muted-foreground)] mt-2">
          导出空间数据，或将备份导入到当前服务器
        </p>
      </div>

      {(message || error) && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                导出备份
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                生成一个可迁移的 JSON 文件
              </p>
            </div>
          </div>

          <label className="block text-sm font-medium mb-2">空间</label>
          <select
            value={selectedSpaceId}
            onChange={(event) => setSelectedSpaceId(event.target.value)}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="">选择空间</option>
            {data?.spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.spaceCode} / {space.name}
              </option>
            ))}
          </select>

          {selectedSpace && (
            <div className="mt-4 rounded-lg bg-[var(--muted)] px-4 py-3 text-sm">
              <div className="font-medium">{selectedSpace.name}</div>
              <div className="text-[var(--muted-foreground)]">
                {selectedSpace.spaceCode} · {selectedSpace.status} · {selectedSpace.tier}
              </div>
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={isExporting || !selectedSpaceId}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            下载备份
          </button>
        </section>

        <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center">
              <Upload size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                导入备份
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                恢复备份里的原始空间和数据
              </p>
            </div>
          </div>

          <label className="block text-sm font-medium mb-2">备份文件</label>
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)] px-4 py-6 text-center hover:bg-[var(--secondary)]">
            <FileJson size={24} className="text-[var(--primary)]" />
            <span className="text-sm font-medium">
              {backupFile ? backupFile.name : "选择 JSON 备份文件"}
            </span>
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => setBackupFile(event.target.files?.[0] || null)}
            />
          </label>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>
              导入会替换服务器上同 ID 或同空间码的空间。图片文件需要先按备份中的 key 复制到新对象存储。
            </span>
          </div>

          <button
            onClick={handleImport}
            disabled={isImporting || !backupFile}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-50"
          >
            {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            导入备份
          </button>
        </section>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";

interface ImageGenerationNode {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  apiKeySet?: boolean;
  model: string;
  enabled: boolean;
  priority: number;
}

interface ImageGenerationSettings {
  nodes: ImageGenerationNode[];
  avatarPromptTemplate: string;
  avatarNegativePrompt: string;
}

const emptyNode = (priority: number): ImageGenerationNode => ({
  id: "",
  name: `生图节点 ${priority + 1}`,
  baseUrl: "",
  apiKey: "",
  model: "gpt-image-1",
  enabled: true,
  priority,
});

export default function ImageGenerationPage() {
  const { data, error, mutate, isLoading } = useSWR<ImageGenerationSettings>(
    "/api/v1/admin/image-generation",
    apiGet,
  );
  const [nodes, setNodes] = useState<ImageGenerationNode[]>([]);
  const [avatarPromptTemplate, setAvatarPromptTemplate] = useState("");
  const [avatarNegativePrompt, setAvatarNegativePrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (data?.nodes) {
      queueMicrotask(() => {
        setNodes(data.nodes.length > 0 ? data.nodes : [emptyNode(0)]);
        setAvatarPromptTemplate(data.avatarPromptTemplate || "");
        setAvatarNegativePrompt(data.avatarNegativePrompt || "");
      });
    }
  }, [data]);

  const enabledCount = useMemo(
    () => nodes.filter((node) => node.enabled && node.baseUrl && (node.apiKey || node.apiKeySet)).length,
    [nodes],
  );

  const updateNode = (index: number, patch: Partial<ImageGenerationNode>) => {
    setNodes((current) => current.map((node, nodeIndex) => (nodeIndex === index ? { ...node, ...patch } : node)));
  };

  const addNode = () => {
    setNodes((current) => [...current, emptyNode(current.length)]);
  };

  const removeNode = (index: number) => {
    setNodes((current) => current.filter((_, nodeIndex) => nodeIndex !== index));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    setFormError("");
    try {
      const normalized = nodes.map((node, index) => ({
        ...node,
        name: node.name.trim(),
        baseUrl: node.baseUrl.trim().replace(/\/$/, ""),
        model: node.model.trim(),
        apiKey: node.apiKey?.trim() || "",
        priority: Number.isFinite(node.priority) ? node.priority : index,
      }));
      const result = await apiPut<ImageGenerationSettings>("/api/v1/admin/image-generation", {
        nodes: normalized,
        avatarPromptTemplate,
        avatarNegativePrompt,
      });
      setNodes(result.nodes.length > 0 ? result.nodes : [emptyNode(0)]);
      setAvatarPromptTemplate(result.avatarPromptTemplate || "");
      setAvatarNegativePrompt(result.avatarNegativePrompt || "");
      await mutate(result, false);
      setMessage("生图节点已保存");
    } catch {
      setFormError("保存失败，请检查节点配置");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return <div className="py-12 text-center text-[var(--muted-foreground)]">加载失败</div>;
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--foreground)]">生图节点</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            配置用于地图角色生成的 OpenAI 兼容图片接口，按优先级自动主备切换。
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          保存配置
        </button>
      </div>

      {(message || formError || enabledCount === 0) && (
        <div
          className={`mb-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            formError || enabledCount === 0
              ? "border-yellow-200 bg-yellow-50 text-yellow-800"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {message ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{formError || message || "还没有可用节点，用户设置页将无法生成地图角色。"}</span>
        </div>
      )}

      <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)] text-[var(--primary)]">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--foreground)]">角色提示词模板</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              用占位符拼接用户提示词，统一控制像素边缘、帧动画和画风质量。
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            正向模板
            <textarea
              value={avatarPromptTemplate}
              onChange={(event) => setAvatarPromptTemplate(event.target.value)}
              rows={12}
              className="min-h-64 resize-y rounded-lg border border-[var(--border)] px-4 py-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            负面提示词
            <textarea
              value={avatarNegativePrompt}
              onChange={(event) => setAvatarNegativePrompt(event.target.value)}
              rows={4}
              className="resize-y rounded-lg border border-[var(--border)] px-4 py-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </label>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-xs leading-6 text-[var(--muted-foreground)]">
            可用占位符：{"{gender}"} 性别描述、{"{prompt}"} 用户提示词、{"{reference}"} 参考图说明、{"{displayName}"} 用户名、{"{negative}"} 负面提示词。
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {nodes.map((node, index) => (
          <section key={node.id || index} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)] text-[var(--primary)]">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="font-semibold text-[var(--foreground)]">{node.name || `生图节点 ${index + 1}`}</h2>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {node.apiKeySet ? "密钥已配置" : "未配置密钥"} · 优先级 {node.priority}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <input
                    type="checkbox"
                    checked={node.enabled}
                    onChange={(event) => updateNode(index, { enabled: event.target.checked })}
                  />
                  启用
                </label>
                <button
                  onClick={() => removeNode(index)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
                  aria-label="删除节点"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                节点名称
                <input
                  value={node.name}
                  onChange={(event) => updateNode(index, { name: event.target.value })}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                优先级
                <input
                  type="number"
                  value={node.priority}
                  onChange={(event) => updateNode(index, { priority: Number(event.target.value) })}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium lg:col-span-2">
                Base URL
                <input
                  value={node.baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => updateNode(index, { baseUrl: event.target.value })}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                模型
                <input
                  value={node.model}
                  placeholder="gpt-image-1"
                  onChange={(event) => updateNode(index, { model: event.target.value })}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                API Key
                <input
                  type="password"
                  value={node.apiKey || ""}
                  placeholder={node.apiKeySet ? "留空则沿用已保存密钥" : "输入节点密钥"}
                  onChange={(event) => updateNode(index, { apiKey: event.target.value })}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>
            </div>
          </section>
        ))}
      </div>

      <button
        onClick={addNode}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
      >
        <Plus size={18} />
        添加备用节点
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Plus, X, Archive, Trash2, Edit } from "lucide-react";
import { MemoryPageShell } from "@/components/MemoryNav";
import { Button } from "@/components/ui/button";
import { DatePicker, Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { apiJson } from "@/lib/apiClient";
import { useContentEditAccess } from "@/lib/useContentEditAccess";
import { readSession } from "@/lib/authStore";

type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  content: string;
  isOpened: boolean;
  createdById: string;
  createdAt: string;
};

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// 获取今天日期字符串（用于min限制）
function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

export default function TimeCapsule() {
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", openDate: "", content: "" });
  const [loading, setLoading] = useState(true);
  const isAdmin = useContentEditAccess();
  const session = readSession();

  const load = async () => {
    setLoading(true);
    const data = await apiJson<{ timeCapsules: TimeCapsule[] }>("/api/v1/time-capsules");
    setCapsules(data.timeCapsules || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const openDialog = (capsule?: TimeCapsule) => {
    if (capsule) {
      setEditingId(capsule.id);
      setForm({ title: capsule.title, openDate: capsule.openDate, content: capsule.content });
    } else {
      setEditingId(null);
      setForm({ title: "", openDate: "", content: "" });
    }
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setForm({ title: "", openDate: "", content: "" });
  };

  const save = async () => {
    if (!form.title.trim() || !form.openDate || !form.content.trim()) {
      alert("请填写所有必填项");
      return;
    }

    // 验证日期必须是今天之后
    const selectedDate = new Date(form.openDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate <= today) {
      alert("开启日期必须是今天之后");
      return;
    }

    if (editingId) {
      // 编辑模式 - 需要后端支持PATCH
      await apiJson(`/api/v1/time-capsules/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
    } else {
      // 创建模式
      await apiJson("/api/v1/time-capsules", {
        method: "POST",
        body: JSON.stringify({ ...form, photos: [] }),
      });
    }
    closeDialog();
    void load();
  };

  const deleteCapsule = async (id: string) => {
    if (!confirm("确定删除这个时光胶囊吗？")) return;
    await apiJson(`/api/v1/time-capsules/${id}`, { method: "DELETE" });
    void load();
  };

  return (
    <MemoryPageShell active="capsule">
      <header>
        <h1 className="text-2xl font-bold text-[#273846]">📦 时光宝盒</h1>
        <p className="text-sm text-gray-500 mt-1">查看时光胶囊</p>
      </header>

      <button
        className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 disabled:opacity-50"
        onClick={() => openDialog()}
        disabled={!isAdmin}
      >
        <Plus className="h-6 w-6" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4 animate-in fade-in duration-200"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingId ? "编辑时光胶囊" : "埋下时光胶囊"}</h2>
              <button onClick={closeDialog}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <Input
                placeholder="标题 *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-[#E8B8C2]"
              />
              <input
                type="date"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#E8B8C2]"
                value={form.openDate}
                min={getTodayString()}
                onChange={(e) => setForm({ ...form, openDate: e.target.value })}
                required
              />
              <Textarea
                placeholder="写给未来的话... *"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={5}
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-[#E8B8C2]"
              />
              <Button className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]" onClick={save}>
                {editingId ? "保存" : "埋下胶囊"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          // 骨架屏
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            ))}
          </>
        ) : capsules.length === 0 ? (
          <EmptyState icon={<Archive className="h-7 w-7" />} title="还没有时光胶囊">
            创建第一个时光胶囊吧。
          </EmptyState>
        ) : (
          capsules.map((cap) => {
            const days = daysUntil(cap.openDate);
            const isLocked = days > 0;
            const canEdit = cap.createdById === session?.user?.id && isLocked; // 只有未开启时创建人可编辑

            return (
              <div
                key={cap.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">{cap.title}</h3>
                  {canEdit && isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDialog(cap)}
                        className="text-gray-400 transition-all duration-200 hover:text-blue-500 hover:scale-110 active:scale-95"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteCapsule(cap.id)}
                        className="text-gray-400 transition-all duration-200 hover:text-red-500 hover:scale-110 active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">开启日期：{cap.openDate}</p>

                {isLocked ? (
                  <div className="rounded bg-blue-50 p-3 text-center border border-blue-200">
                    <p className="text-2xl font-bold text-blue-600">{days}</p>
                    <p className="text-xs text-gray-500">天后开启</p>
                  </div>
                ) : (
                  <div>
                    <div className="rounded bg-yellow-50 p-3 text-sm mb-2">
                      <p className="whitespace-pre-wrap">{cap.content}</p>
                    </div>
                    <p className="text-xs text-green-600 text-center">✓ 已打开</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </MemoryPageShell>
  );
}


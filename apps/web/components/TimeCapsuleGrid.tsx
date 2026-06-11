"use client";

import { useEffect, useState } from "react";
import { Lock, LockOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker, Input, Textarea } from "@/components/ui/input";
import { apiJson } from "@/lib/apiClient";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  content: string;
  isOpened: boolean;
  createdAt: string;
};

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function TimeCapsuleGrid() {
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", openDate: "", content: "" });
  const isAdmin = useContentEditAccess();

  const load = async () => {
    const data = await apiJson<{ timeCapsules: TimeCapsule[] }>("/api/v1/time-capsules");
    setCapsules(data.timeCapsules || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!form.title.trim() || !form.openDate || !form.content.trim()) return;
    await apiJson("/api/v1/time-capsules", {
      method: "POST",
      body: JSON.stringify({ ...form, photos: [] }),
    });
    setForm({ title: "", openDate: "", content: "" });
    setOpen(false);
    void load();
  };

  const openCapsule = async (id: string) => {
    await apiJson(`/api/v1/time-capsules/${id}/open`, { method: "POST" });
    void load();
  };

  return (
    <div className="space-y-6">
      <button
        className="fixed bottom-28 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-lg transition hover:scale-105 disabled:opacity-50 lg:bottom-6"
        onClick={() => setOpen(true)}
        disabled={!isAdmin}
      >
        <Plus className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">埋下时光胶囊</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <Input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <DatePicker value={form.openDate} onChange={(date) => setForm({ ...form, openDate: date })} />
              <Textarea placeholder="写给未来的话..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} />
              <Button className="w-full" onClick={create}>埋下</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capsules.map((cap) => {
          const days = daysUntil(cap.openDate);
          const canOpen = days <= 0;
          return (
            <div key={cap.id} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
              <div className="absolute top-3 right-3">
                {canOpen ? <LockOpen className="h-5 w-5 text-green-500" /> : <Lock className="h-5 w-5 text-gray-400" />}
              </div>
              <h3 className="font-semibold text-lg mb-2">{cap.title}</h3>
              <p className="text-sm text-gray-500 mb-3">开启日期：{cap.openDate}</p>
              {canOpen ? (
                cap.content ? (
                  <div className="rounded bg-yellow-50 p-3 text-sm mb-3">
                    <p className="whitespace-pre-wrap">{cap.content}</p>
                  </div>
                ) : (
                  <Button onClick={() => openCapsule(cap.id)}>打开胶囊</Button>
                )
              ) : (
                <div className="rounded bg-blue-50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{days}</p>
                  <p className="text-xs text-gray-500">天后开启</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

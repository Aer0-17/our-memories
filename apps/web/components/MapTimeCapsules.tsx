"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { apiJson } from "@/lib/apiClient";

type TimeCapsule = {
  id: string;
  title: string;
  openDate: string;
  createdAt: string;
};

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function MapTimeCapsules() {
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiJson<{ timeCapsules: TimeCapsule[] }>("/api/v1/time-capsules");
        // 只显示未开启的（未到期的且未开启）
        const unopened = (data.timeCapsules || []).filter(c => {
          const days = daysUntil(c.openDate);
          return days > 0;
        });
        setCapsules(unopened.slice(0, 3)); // 最多3个
      } catch (e) {
        console.error(e);
      }
    };
    void load();
  }, []);

  if (capsules.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+10.5rem)] left-3 right-3 z-30 flex gap-2 overflow-x-auto pb-2 lg:hidden">
      {capsules.map((cap, index) => {
        const days = daysUntil(cap.openDate);
        return (
          <div
            key={cap.id}
            className="relative flex h-12 w-32 shrink-0 items-center justify-center rounded-full border-2 border-[#E8B8C2] bg-gradient-to-r from-[#F5DCE0] to-[#E8B8C2] px-4 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <Lock className="absolute left-3 h-4 w-4 text-white/80" />
            <div className="ml-2 text-center">
              <p className="text-xs font-bold text-white">{days}天</p>
              <p className="text-[10px] text-white/90">后开启</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

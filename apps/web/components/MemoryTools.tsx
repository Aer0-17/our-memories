"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Heart,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cities } from "@/data/cities";
import { MemoryPageShell, type MemoryNavKey } from "@/components/MemoryNav";
import {
  memoryStoreUpdatedEvent,
  type LocalMemoryStore,
} from "@/data/progress";
import {
  readAppSettings,
  writeAppSettings,
  syncAppSettings,
  defaultAnniversaryDate,
  defaultAnniversaryLabel,
  defaultCoupleLogo,
  defaultWeatherCityIds,
  maxWeatherCities,
  type AppSettings,
  type LoginPhotoText,
} from "@/data/appSettings";
import {
  deleteLoginPhotoText,
  deleteLoginPhoto,
  loginPhotosUpdatedEvent,
  readLoginPhotoTexts,
  readLoginPhotos,
  writeLoginPhotoText,
  writeLoginPhoto,
} from "@/data/loginPhotoStore";
import { LocalPrivacyImage } from "@/components/LocalPrivacyImage";
import { DatePicker } from "@/components/ui/input";
import { apiFetch } from "@/lib/apiClient";
import { readSession } from "@/lib/authStore";
import { useContentEditAccess } from "@/lib/useContentEditAccess";

type StoredItem = {
  id: string;
  title: string;
  date?: string;
  note: string;
  cityId?: string;
};
type CityAssetStore = Record<string, string>;
type AuxiliaryPayload = {
  items?: StoredItem[];
};

type ToolConfig = {
  active: MemoryNavKey;
  icon: typeof Heart;
  title: string;
  subtitle: string;
  storageKey: string;
  kind: "favorite" | "anniversary" | "capsule";
};

const configs = {
  favorite: {
    active: "favorites",
    icon: Heart,
    title: "地点收藏",
    subtitle: "先收好想一起去的地方，不点亮地图。",
    storageKey: "mapofus:favorites",
    kind: "favorite",
  },
  anniversary: {
    active: "anniversaries",
    icon: CalendarDays,
    title: "纪念日",
    subtitle: "把重要的日子放在这里，慢慢倒数。",
    storageKey: "mapofus:anniversaries",
    kind: "anniversary",
  },
  capsule: {
    active: "capsule",
    icon: Archive,
    title: "悄悄话",
    subtitle: "只属于我们的对话，记录彼此的心里话。",
    storageKey: "mapofus:capsules",
    kind: "capsule",
  },
} satisfies Record<string, ToolConfig>;

const auxiliaryStorageKeys = ["mapofus:favorites", "mapofus:anniversaries", "mapofus:capsules"] as const;
const loginPhotoVersion = "placeholder-20260601";
const loginPhotoFallback = (fileName: string) => `/photos/login/${fileName}.jpg?v=${loginPhotoVersion}`;

const loginPhotoSlots = [
  { id: "hangzhou", city: "杭州", label: "春日湖畔", fallback: loginPhotoFallback("hangzhou") },
  { id: "shanghai", city: "上海", label: "外滩傍晚", fallback: loginPhotoFallback("shanghai") },
  { id: "macau", city: "澳门", label: "旧城花影", fallback: loginPhotoFallback("macau") },
  { id: "hongkong", city: "香港", label: "夜色亮起", fallback: loginPhotoFallback("hongkong") },
  { id: "qingdao", city: "青岛", label: "海风经过", fallback: loginPhotoFallback("qingdao") },
  { id: "zhengzhou", city: "郑州", label: "见面那天", fallback: loginPhotoFallback("zhengzhou") },
  { id: "zhuhai", city: "珠海", label: "海边散步", fallback: loginPhotoFallback("zhuhai") },
  { id: "guangzhou", city: "广州", label: "旧街热气", fallback: loginPhotoFallback("guangzhou") },
  { id: "jinan", city: "济南", label: "泉边小记", fallback: loginPhotoFallback("jinan") },
] as const;

const readItems = (key: string): StoredItem[] => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;

    return normalizeItems(parsed);
  } catch {
    return [];
  }
};

const writeItems = (key: string, items: StoredItem[]) => {
  window.localStorage.setItem(key, JSON.stringify(items));
};

const normalizeItems = (value: unknown): StoredItem[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as Partial<StoredItem>;
    if (typeof candidate.id !== "string" || typeof candidate.title !== "string") return [];

    return [{
      id: candidate.id,
      title: candidate.title,
      date: typeof candidate.date === "string" ? candidate.date : undefined,
      note: typeof candidate.note === "string" ? candidate.note : "",
      cityId: typeof candidate.cityId === "string" ? candidate.cityId : undefined,
    }];
  });
};

const auxiliaryEndpoint = (kind: ToolConfig["kind"]) =>
  `/auxiliary-items?kind=${encodeURIComponent(kind)}`;

const auxiliaryStorageKeyByKind = {
  favorite: "mapofus:favorites",
  anniversary: "mapofus:anniversaries",
  capsule: "mapofus:capsules",
} satisfies Record<ToolConfig["kind"], (typeof auxiliaryStorageKeys)[number]>;

const auxiliaryMigrationKey = (kind: ToolConfig["kind"]) => `mapofus:${kind}:migrated-to-server-v1`;

const loadAuxiliaryItems = async (config: ToolConfig) => {
  const localItems = readItems(config.storageKey);
  const response = await apiFetch(auxiliaryEndpoint(config.kind), { cache: "no-store" }).catch(() => null);

  if (!response?.ok) return localItems;

  const data = (await response.json().catch(() => null)) as AuxiliaryPayload | null;
  let serverItems = normalizeItems(data?.items ?? []);
  const migrationKey = auxiliaryMigrationKey(config.kind);
  const shouldMigrate = localItems.length > 0 && window.localStorage.getItem(migrationKey) !== "1";

  if (shouldMigrate) {
    const existingFingerprints = new Set(
      serverItems.map((item) => `${item.title}|${item.date ?? ""}|${item.note}|${item.cityId ?? ""}`),
    );
    const localOnlyItems = localItems.filter(
      (item) => !existingFingerprints.has(`${item.title}|${item.date ?? ""}|${item.note}|${item.cityId ?? ""}`),
    );

    await Promise.all(
      localOnlyItems.map((item) =>
        apiFetch("/auxiliary-items", {
          method: "POST",
          body: JSON.stringify({ ...item, kind: config.kind }),
        }).catch(() => null),
      ),
    );
    window.localStorage.setItem(migrationKey, "1");

    const migratedResponse = await apiFetch(auxiliaryEndpoint(config.kind), { cache: "no-store" }).catch(() => null);
    const migratedData = (await migratedResponse?.json().catch(() => null)) as AuxiliaryPayload | null;
    serverItems = normalizeItems(migratedData?.items ?? serverItems);
  }

  writeItems(config.storageKey, serverItems);
  return serverItems;
};

const readAuxiliaryBackup = async () => {
  const localBackup = Object.fromEntries(auxiliaryStorageKeys.map((key) => [key, readJsonArray(key)]));
  const response = await apiFetch("/auxiliary-items", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return localBackup;

  const data = (await response.json().catch(() => null)) as
    | { items?: Array<StoredItem & { kind?: ToolConfig["kind"] }> }
    | null;
  const grouped: Record<(typeof auxiliaryStorageKeys)[number], StoredItem[]> = {
    "mapofus:favorites": [],
    "mapofus:anniversaries": [],
    "mapofus:capsules": [],
  };

  for (const item of data?.items ?? []) {
    if (!item.kind || !(item.kind in auxiliaryStorageKeyByKind)) continue;
    grouped[auxiliaryStorageKeyByKind[item.kind]].push({
      id: item.id,
      title: item.title,
      date: item.date,
      note: item.note,
      cityId: item.cityId,
    });
  }

  return grouped;
};

const useAdminMode = () => {
  return true;
};

const readJsonArray = (key: string) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const imageFileToSettingImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Invalid image"));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new window.Image();

    image.addEventListener("load", () => {
      const maxSize = 1800;
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      URL.revokeObjectURL(url);

      if (!context) {
        reject(new Error("Canvas unavailable"));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image read failed"));
    });

    image.src = url;
  });

const normalizeAppSettings = (value: unknown): AppSettings => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const settings = value as AppSettings & { loginCoverImage?: string };
  const loginPhotos =
    settings.loginPhotos && typeof settings.loginPhotos === "object" && !Array.isArray(settings.loginPhotos)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotos).filter(
            ([key, photo]) =>
              loginPhotoSlots.some((slot) => slot.id === key) &&
              typeof photo === "string" &&
              photo.startsWith("data:image/"),
          ),
        )
      : {};
  const loginPhotoTexts =
    settings.loginPhotoTexts && typeof settings.loginPhotoTexts === "object" && !Array.isArray(settings.loginPhotoTexts)
      ? Object.fromEntries(
          Object.entries(settings.loginPhotoTexts)
            .filter(([key]) => loginPhotoSlots.some((slot) => slot.id === key))
            .map(([key, value]) => {
              if (typeof value !== "object" || value === null || Array.isArray(value)) return [key, {}];
              const item = value as LoginPhotoText;

              return [
                key,
                {
                  city: typeof item.city === "string" ? item.city : undefined,
                  label: typeof item.label === "string" ? item.label : undefined,
                },
              ];
            }),
        )
      : {};

  if (
    Object.keys(loginPhotos).length === 0 &&
    typeof settings.loginCoverImage === "string" &&
    settings.loginCoverImage.startsWith("data:image/")
  ) {
    return { loginPhotos: { hangzhou: settings.loginCoverImage }, loginPhotoTexts };
  }

  return { loginPhotos, loginPhotoTexts };
};

const daysUntil = (value?: string) => {
  if (!value || !/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split(".").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
};

function MemoryToolPage({ config }: Readonly<{ config: ToolConfig }>) {
  const Icon = config.icon;
  const canEdit = useContentEditAccess();
  const [items, setItems] = useState<StoredItem[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadAuxiliaryItems(config)
        .then((nextItems) => {
          if (!cancelled) setItems(nextItems);
        })
        .catch(() => {
          if (!cancelled) {
            setItems(readItems(config.storageKey));
            setStatus("读取在线内容失败，已显示本地缓存。");
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [config]);

  const cityOptions = useMemo(() => cities.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")), []);
  const canSave = title.trim().length > 0;

  const resetForm = () => {
    setTitle("");
    setDate("");
    setNote("");
    setEditingId("");
    setOpen(false);
  };

  const save = async () => {
    if (!canEdit) {
      setStatus("请先登录后再保存。");
      return;
    }
    if (!canSave) return;

    setIsWorking(true);
    setStatus("");

    try {
      if (editingId) {
        // 更新现有项
        const item = {
          id: editingId,
          title: title.trim(),
          date: date.trim(),
          note: note.trim(),
          cityId: config.kind === "favorite" ? cityId : undefined,
        };

        const response = await apiFetch(`/api/v1/auxiliary-items/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...item, kind: config.kind }),
        });
        if (!response.ok) throw new Error("Update failed");

        const nextItems = items.map((current) => (current.id === editingId ? item : current));
        setItems(nextItems);
        writeItems(config.storageKey, nextItems);
        resetForm();
        setStatus("已保存修改。");
      } else {
        // 创建新项
        const item = {
          id: `${config.kind}-${Date.now()}`,
          title: title.trim(),
          date: date.trim(),
          note: note.trim(),
          cityId: config.kind === "favorite" ? cityId : undefined,
        };

        const response = await apiFetch("/api/v1/auxiliary-items", {
          method: "POST",
          body: JSON.stringify({ ...item, kind: config.kind }),
        });
        if (!response.ok) throw new Error("Create failed");

        const nextItems = [item, ...items];
        setItems(nextItems);
        writeItems(config.storageKey, nextItems);
        resetForm();
        setStatus("已保存。");
      }

      // 刷新数据
      const refreshedItems = await loadAuxiliaryItems(config);
      setItems(refreshedItems);
    } catch {
      setStatus("保存失败，请确认网络和登录状态后重试。");
    } finally {
      setIsWorking(false);
    }
  };

  const startEdit = (item: StoredItem) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setTitle(item.title);
    setDate(item.date ?? "");
    setNote(item.note);
    if (item.cityId) setCityId(item.cityId);
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!canEdit) {
      setStatus("请先登录后再删除。");
      return;
    }
    setIsWorking(true);
    setStatus("");

    try {
      const response = await apiFetch(`/api/v1/auxiliary-items/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");

      const nextItems = items.filter((item) => item.id !== id);
      setItems(nextItems);
      writeItems(config.storageKey, nextItems);
      if (editingId === id) resetForm();
      setStatus("已删除。");
    } catch {
      setStatus("删除失败，请稍后再试。");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <MemoryPageShell active={config.active}>
      <header className="flex flex-wrap items-start justify-between gap-4 sm:gap-5">
        <div>
          <div className="flex items-center gap-3">
            <Icon className="h-6 w-6 fill-[#F5DCE0] text-[#E8B8C2] sm:h-8 sm:w-8" />
            <h1 className="text-2xl font-semibold leading-tight text-[#5A6670] sm:text-[34px]">{config.title}</h1>
          </div>
          <p className="mt-2 hidden text-sm font-medium text-[#5A6670]/58 sm:block">{config.subtitle}</p>
        </div>
        <div className="rounded-[8px] border border-[#D8DDD8]/80 bg-[#FAFBF7]/72 px-4 py-2 text-sm font-semibold text-[#5A6670]/62 shadow-[0_8px_24px_rgba(90,102,112,0.08)] backdrop-blur">
          {items.length} 条
        </div>
      </header>

      <section className="mt-6 sm:mt-10">
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const city = cities.find((candidate) => candidate.id === item.cityId);
            const leftDays = daysUntil(item.date);

            return (
              <article
                key={item.id}
                className="rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/76 p-4 shadow-[0_12px_28px_rgba(90,102,112,0.06)] backdrop-blur sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#5A6670]">{item.title}</h2>
                    {city && <p className="mt-1 text-sm text-[#A8C8DC]">{city.name}</p>}
                    {item.date && <p className="mt-1 text-sm text-[#5A6670]/54">{item.date}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/42 transition hover:bg-[#D6E8F0]/34 hover:text-[#A8C8DC]"
                      type="button"
                      onClick={() => startEdit(item)}
                      aria-label="编辑"
                      disabled={!canEdit || isWorking}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/42 transition hover:bg-[#F5DCE0]/45 hover:text-[#E8B8C2]"
                      type="button"
                      onClick={() => void remove(item.id)}
                      aria-label="删除"
                      disabled={!canEdit || isWorking}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {leftDays !== null && (
                  <p className="mt-3 text-sm font-semibold text-[#E8B8C2]">
                    {leftDays >= 0 ? `还有 ${leftDays} 天` : `已经过去 ${Math.abs(leftDays)} 天`}
                  </p>
                )}
                {item.note && <p className="mt-3 text-sm leading-6 text-[#5A6670]/68">{item.note}</p>}
              </article>
            );
          })}
          {items.length === 0 && (
            <div className="rounded-[8px] border border-dashed border-[#D8DDD8] px-6 py-12 text-center text-sm text-[#5A6670]/54 md:col-span-2">
              这里还空着，先放下第一条吧。
            </div>
          )}
        </div>
      </section>

      {/* 浮动添加按钮 */}
      <button
        className="fixed bottom-24 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#E8B8C2] text-white shadow-[0_8px_24px_rgba(232,184,194,0.45)] transition hover:scale-105 hover:bg-[#D86F82] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6"
        type="button"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        disabled={!canEdit}
        aria-label={`新增${config.title}`}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* 弹窗表单 */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#273846]/32 px-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[8px] border border-[#D8DDD8] bg-[#FAFBF7] shadow-[0_28px_90px_rgba(39,56,70,0.24)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#D8DDD8] bg-white/90 px-5 py-4 backdrop-blur">
              <h2 className="text-lg font-semibold text-[#5A6670]">{editingId ? "编辑" : "新增"}</h2>
              <button
                className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/28"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label className="block text-xs font-semibold text-[#5A6670]/58">
                {config.kind === "favorite" ? "地点" : "标题"}
                <input
                  className="mt-1 w-full rounded-[7px] border border-[#D8DDD8] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={config.kind === "favorite" ? "想去的地方" : "标题"}
                  disabled={isWorking}
                />
              </label>

              {config.kind === "favorite" && (
                <label className="block text-xs font-semibold text-[#5A6670]/58">
                  城市
                  <select
                    className="mt-1 w-full rounded-[7px] border border-[#D8DDD8] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#E8B8C2]"
                    value={cityId}
                    onChange={(event) => setCityId(event.target.value)}
                    disabled={isWorking}
                  >
                    {cityOptions.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {config.kind !== "favorite" && (
                <label className="block text-xs font-semibold text-[#5A6670]/58">
                  日期
                  <DatePicker
                    className="mt-1 border-[#D8DDD8] bg-white focus:border-[#E8B8C2]"
                    value={date}
                    onChange={setDate}
                    disabled={isWorking}
                  />
                </label>
              )}

              <label className="block text-xs font-semibold text-[#5A6670]/58">
                备注
                <textarea
                  className="mt-1 w-full resize-none rounded-[7px] border border-[#D8DDD8] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#E8B8C2]"
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="写一点备注……"
                  disabled={isWorking}
                />
              </label>

              <button
                className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#E8B8C2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#D86F82] disabled:opacity-50"
                type="button"
                onClick={() => void save()}
                disabled={!canSave || isWorking}
              >
                {isWorking ? "保存中" : editingId ? "保存修改" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <p className="mt-5 rounded-[8px] border border-[#D8DDD8]/78 bg-[#FAFBF7]/72 px-4 py-3 text-sm text-[#5A6670]/66">
          {status}
        </p>
      )}
    </MemoryPageShell>
  );
}

export function FavoritesPage() {
  return <MemoryToolPage config={configs.favorite} />;
}

export function AnniversariesPage() {
  return <MemoryToolPage config={configs.anniversary} />;
}

export function TimeCapsulePage() {
  return <MemoryToolPage config={configs.capsule} />;
}


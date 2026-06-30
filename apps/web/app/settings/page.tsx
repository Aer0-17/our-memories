"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  CloudSun,
  Download,
  MapPin,
  RefreshCw,
  Save,
  Upload,
  UserRound,
} from "lucide-react";
import { MemoryPageShell } from "@/components/MemoryNav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import {
  appSettingsStorageKey,
  appSettingsUpdatedEvent,
  defaultSelfCityId,
  normalizeAppSettings,
  normalizeMemberProfiles,
  readAppSettings,
  writeAppSettings,
  type AppSettings,
  type PartnerGender,
  type PartnerProfile,
} from "@/data/appSettings";
import { cities } from "@/data/cities";
import { provinces } from "@/data/provinces";
import { authSessionUpdatedEvent, readSession, sessionKey, type StoredSession } from "@/lib/authStore";

type BackupPayload = {
  app: "our-memories";
  version: 1;
  exportedAt: string;
  localStorage: Record<string, string>;
};

const genderOptions = [
  { value: "female", label: "女生" },
  { value: "male", label: "男生" },
  { value: "neutral", label: "不限定" },
] satisfies Array<{ value: PartnerGender; label: string }>;

const backupKeyAllowed = (key: string) =>
  key.startsWith("mapofus:") &&
  key !== sessionKey &&
  key !== "mapofus:jpush-registration-id" &&
  !key.startsWith("mapofus:swr-cache:");

function sessionDisplayName(session: StoredSession | null) {
  return session?.user?.displayName || session?.user?.username || "我";
}

function sessionMemberKey(session: StoredSession | null) {
  return session?.user?.id || session?.user?.username || "local-user";
}

function settingsWithProfile(
  settings: AppSettings,
  memberKey: string,
  profile: PartnerProfile,
  displayName: string,
): AppSettings {
  return {
    ...settings,
    memberProfiles: {
      ...normalizeMemberProfiles(settings.memberProfiles),
      [memberKey]: {
        ...profile,
        name: displayName,
      },
    },
  };
}

function cityName(cityId?: string) {
  return cities.find((city) => city.id === cityId)?.name ?? "未选择";
}

function readBackupLocalStorage() {
  const data: Record<string, string> = {};

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !backupKeyAllowed(key)) continue;

    const value = window.localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }

  if (!data[appSettingsStorageKey]) {
    data[appSettingsStorageKey] = JSON.stringify(readAppSettings());
  }

  return data;
}

function SelfSettingsCard({
  displayName,
  profile,
  onChange,
}: Readonly<{
  displayName: string;
  profile: PartnerProfile;
  onChange: (profile: PartnerProfile) => void;
}>) {
  const selectedCity = cities.find((city) => city.id === profile.cityId);
  const update = (patch: PartnerProfile) => onChange({ ...profile, ...patch });

  return (
    <Card padding="md" className="min-w-0">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <UserRound className="h-4 w-4 text-bloom" />
            我的设置
          </span>
        }
        subtitle={selectedCity ? `${selectedCity.name} · ${selectedCity.landmark}` : "选择地图上的位置"}
      />

      <div className="mt-5 grid gap-4">
        <div className="grid gap-1.5 text-sm font-semibold text-ink/72">
          名字
          <div className="flex min-h-10 items-center rounded-[7px] border border-dim/80 bg-cream/58 px-3 text-sm text-ink">
            {displayName}
          </div>
        </div>

        <div className="grid gap-1.5">
          <span className="text-sm font-semibold text-ink/72">性别</span>
          <SegmentedControl
            value={profile.gender ?? "neutral"}
            options={genderOptions}
            onChange={(gender) => update({ gender })}
          />
        </div>

        <label className="grid gap-1.5 text-sm font-semibold text-ink/72">
          地点
          <select
            className="min-h-10 w-full rounded-[7px] border border-dim/80 bg-cream/76 px-3 text-sm text-ink outline-none transition focus:border-sky focus:bg-white"
            value={profile.cityId ?? ""}
            onChange={(event) => update({ cityId: event.target.value })}
          >
            {provinces.map((province) => {
              const provinceCities = cities.filter((city) => city.provinceId === province.id);
              if (provinceCities.length === 0) return null;

              return (
                <optgroup key={province.id} label={province.name}>
                  {provinceCities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>

      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({});
  const [session, setSession] = useState<StoredSession | null>(null);
  const [profile, setProfile] = useState<PartnerProfile>({
    gender: "neutral",
    cityId: defaultSelfCityId,
  });
  const [saving, setSaving] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSession = readSession();
      const nextSettings = readAppSettings();
      const memberKey = sessionMemberKey(nextSession);
      const profiles = normalizeMemberProfiles(nextSettings.memberProfiles);
      setSettings(nextSettings);
      setSession(nextSession);
      setProfile({
        gender: "neutral",
        cityId: defaultSelfCityId,
        ...profiles[memberKey],
        name: sessionDisplayName(nextSession),
      });
    }, 0);

    const syncSession = () => setSession(readSession());
    window.addEventListener(authSessionUpdatedEvent, syncSession);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(authSessionUpdatedEvent, syncSession);
    };
  }, []);

  const displayName = sessionDisplayName(session);
  const memberKey = sessionMemberKey(session);
  const summary = useMemo(() => {
    return `${displayName} 在 ${cityName(profile.cityId)}`;
  }, [displayName, profile.cityId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextSettings = settingsWithProfile(settings, memberKey, profile, displayName);
      await writeAppSettings(nextSettings);
      setSettings(normalizeAppSettings(nextSettings));
      toast("设置已保存", "success");
    } catch {
      toast("设置已保存在本机，同步到后端失败", "warning");
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = () => {
    const payload: BackupPayload = {
      app: "our-memories",
      version: 1,
      exportedAt: new Date().toISOString(),
      localStorage: readBackupLocalStorage(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `our-memories-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("备份已导出", "success");
  };

  const handleRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const payload = parsed as Partial<BackupPayload> & { settings?: unknown };

      if (payload.localStorage && typeof payload.localStorage === "object" && !Array.isArray(payload.localStorage)) {
        Object.entries(payload.localStorage).forEach(([key, value]) => {
          if (backupKeyAllowed(key) && typeof value === "string") {
            window.localStorage.setItem(key, value);
          }
        });
      } else if (payload.settings) {
        window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(normalizeAppSettings(payload.settings)));
      } else {
        window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(normalizeAppSettings(parsed)));
      }

      const restoredSettings = readAppSettings();
      const restoredProfiles = normalizeMemberProfiles(restoredSettings.memberProfiles);
      setSettings(restoredSettings);
      setProfile({
        gender: "neutral",
        cityId: defaultSelfCityId,
        ...restoredProfiles[memberKey],
        name: displayName,
      });
      window.dispatchEvent(new CustomEvent(appSettingsUpdatedEvent, { detail: restoredSettings }));
      toast("恢复完成", "success");
    } catch {
      toast("恢复失败，文件格式不正确", "error");
    }
  };

  return (
    <MemoryPageShell active="settings">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-ink sm:text-3xl">设置</h1>
            <p className="mt-2 text-sm leading-6 text-ink/62">{summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleBackup}>
              <Download className="h-4 w-4" />
              备份
            </Button>
            <Button variant="secondary" onClick={() => restoreInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              恢复
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </div>
        </div>

        <input
          ref={restoreInputRef}
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={handleRestoreFile}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <SelfSettingsCard
            displayName={displayName}
            profile={profile}
            onChange={setProfile}
          />
          <Card padding="md">
            <CardHeader title="数据" subtitle="本机备份与恢复" />
            <div className="mt-5 grid gap-2">
              <Button variant="secondary" className="w-full justify-start" onClick={handleBackup}>
                <Download className="h-4 w-4" />
                备份
              </Button>
              <Button variant="secondary" className="w-full justify-start" onClick={() => restoreInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                恢复
              </Button>
            </div>
          </Card>
        </div>

        <Card padding="md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <MapPin className="h-4 w-4 text-bloom" />
                地图角色
              </div>
              <p className="mt-1 text-sm text-ink/60">
                保存后，你的地图角色会站到当前城市上方。
              </p>
            </div>
            <Link
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[7px] border border-dim bg-cream/78 px-4 py-2 text-sm font-semibold text-ink transition hover:border-sky hover:text-sky"
              href="/map"
            >
              <CloudSun className="h-4 w-4" />
              回到地图
            </Link>
          </div>
        </Card>
      </div>
    </MemoryPageShell>
  );
}

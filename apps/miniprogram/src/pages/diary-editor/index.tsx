import { useEffect, useMemo, useState } from "react";
import { Button, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import type { PickerSelectorProps } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  createDiary,
  getDiaries,
  getMemories,
  readSession,
  updateDiary,
  type Diary,
  type DiaryHistoryEntry,
} from "../../lib/api";
import { cityById, getCitiesByProvince, provinces, type City } from "../../data/geo";
import type { Memory } from "@map-of-us/shared";
import "./index.scss";

const TITLE_LIMIT = 80;
const BODY_LIMIT = 1200;

function localDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function pickerDate(value: string) {
  return value.slice(0, 10).replace(/\./g, "-") || localDateValue();
}

function apiDate(value: string) {
  return value.replace(/-/g, ".");
}

function flattenMemories(store: Record<string, Memory[]>) {
  return Object.values(store).flat();
}

function clientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function historyDate(value: string) {
  if (!value) return "较早之前";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "较早之前";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function DiaryEditorPage() {
  const router = useRouter();
  const diaryId = typeof router.params.id === "string" ? router.params.id : "";
  const [diary, setDiary] = useState<Diary | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(Boolean(diaryId));
  const [working, setWorking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localDateValue);
  const [body, setBody] = useState("");
  const [provinceId, setProvinceId] = useState(provinces[0]?.id || "");
  const [cityId, setCityId] = useState("");
  const [linkedMemoryId, setLinkedMemoryId] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const cityOptions = useMemo(() => getCitiesByProvince(provinceId), [provinceId]);
  const allMemoryOptions = useMemo(
    () => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
    [memories],
  );
  const linkedMemory = memories.find((memory) => memory.id === linkedMemoryId);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }

    void Promise.all([
      getMemories().then((data) => flattenMemories(data.memories)),
      diaryId ? getDiaries() : Promise.resolve([] as Diary[]),
    ])
      .then(([loadedMemories, loadedDiaries]) => {
        setMemories(loadedMemories);
        if (!diaryId) {
          const firstCity = cityOptions[0];
          if (firstCity) {
            setProvinceId(firstCity.provinceId);
            setCityId(firstCity.id);
          }
          return;
        }
        const current = loadedDiaries.find((item) => item.id === diaryId);
        if (!current) throw new Error("Diary not found");
        const city = cityById.get(current.cityId);
        const fallbackCity = city || getCitiesByProvince(provinces[0]?.id || "")[0];
        setDiary(current);
        setTitle(current.title);
        setDate(pickerDate(current.date));
        setBody(current.body);
        setCityId(current.cityId || fallbackCity?.id || "");
        setProvinceId(fallbackCity?.provinceId || provinces[0]?.id || "");
        setLinkedMemoryId(current.linkedMemoryId || "");
      })
      .catch(() => {
        setUnavailable(Boolean(diaryId));
        setStatus(diaryId ? "没有找到这篇日记，请返回列表后重试。" : "暂时无法读取已有回忆，请稍后再试。");
      })
      .finally(() => setLoading(false));
    // The initial city list is only used to seed a new draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaryId]);

  const selectProvince: NonNullable<PickerSelectorProps["onChange"]> = (event) => {
    const nextProvince = provinces[Number(event.detail.value)];
    if (!nextProvince) return;
    setProvinceId(nextProvince.id);
    setCityId(getCitiesByProvince(nextProvince.id)[0]?.id || "");
  };

  const selectCity: NonNullable<PickerSelectorProps["onChange"]> = (event) => {
    setCityId(cityOptions[Number(event.detail.value)]?.id || "");
  };

  const selectMemory: NonNullable<PickerSelectorProps["onChange"]> = (event) => {
    const index = Number(event.detail.value);
    const next = index === 0 ? undefined : allMemoryOptions[index - 1];
    setLinkedMemoryId(next?.id || "");
    if (!next) return;
    const city = cityById.get(next.cityId);
    setDate(pickerDate(next.date));
    setProvinceId(city?.provinceId || provinceId);
    setCityId(next.cityId);
    if (!title.trim()) setTitle(next.title || `${next.city}的小记`);
  };

  const save = async () => {
    const normalizedTitle = title.trim();
    const normalizedBody = body.trim();
    const selectedCity = cityById.get(cityId);
    if (!normalizedTitle || !normalizedBody || !date || !selectedCity) {
      setStatus("标题、日期、城市和正文都需要填写。");
      return;
    }
    if (working || loading || unavailable) return;

    setWorking(true);
    setStatus("");
    const editorName = readSession()?.user.displayName || readSession()?.user.username || "某个人";
    const previousHistory = diary?.history || [];
    const history: DiaryHistoryEntry[] =
      diary && diary.body !== normalizedBody && diary.body.trim()
        ? [{
            id: clientId("history"),
            text: diary.body,
            editedAt: new Date().toISOString(),
            editorName,
          }, ...previousHistory].slice(0, 12)
        : previousHistory;
    const payload = {
      title: normalizedTitle,
      date: apiDate(date),
      body: normalizedBody,
      cityId: linkedMemory?.cityId || selectedCity.id,
      linkedMemoryId: linkedMemory?.id,
      linkedMemoryTitle: linkedMemory?.title || linkedMemory?.text?.slice(0, 24),
      linkedMemoryDate: linkedMemory?.date,
      history,
    };

    try {
      if (diary) {
        await updateDiary(diary.id, payload);
      } else {
        await createDiary(payload);
      }
      Taro.showToast({ title: diary ? "日记已更新" : "日记已保存", icon: "success" });
      Taro.navigateBack({ delta: 1 });
    } catch {
      setStatus("保存失败，请检查网络和登录状态后重试。");
    } finally {
      setWorking(false);
    }
  };

  const provinceIndex = Math.max(0, provinces.findIndex((item) => item.id === provinceId));
  const cityIndex = Math.max(0, cityOptions.findIndex((item: City) => item.id === cityId));
  const memoryIndex = linkedMemoryId ? Math.max(0, allMemoryOptions.findIndex((item) => item.id === linkedMemoryId) + 1) : 0;

  return (
    <View className="page diary-editor-page">
      <AppHeader title={diary ? "编辑双人日记" : "写双人日记"} back />

      <View className="screen-intro diary-editor-intro">
        <Text className="screen-title">{diary ? "把这段记忆再写完整" : "留下一段只属于我们的文字"}</Text>
        <Text className="screen-subtitle">双方都可以编辑，保存后会保留共同修改过的版本。</Text>
      </View>

      {status && <ErrorBanner copy={status} />}
      {loading ? <LoadingState compact /> : !unavailable ? (
        <View className="diary-form">
          <View className="diary-editor-section card">
            <View className="diary-editor-heading">
              <Text className="diary-editor-section-title">这篇日记</Text>
              <Text className="diary-editor-section-note">标题和日期会显示在日记列表</Text>
            </View>

            <View className="diary-field-group">
              <View className="diary-label-row">
                <Text className="diary-label">标题 *</Text>
                <Text className="diary-counter">{title.length} / {TITLE_LIMIT}</Text>
              </View>
              <Input
                className="field"
                disabled={working}
                maxlength={TITLE_LIMIT}
                value={title}
                onInput={(event) => setTitle(event.detail.value)}
                placeholder="例如：在海边吃完晚饭"
              />
            </View>

            <View className="diary-field-group">
              <Text className="diary-label">日期 *</Text>
              <Picker mode="date" value={date} onChange={(event) => setDate(event.detail.value)}>
                <View className="field diary-date-picker">{date}</View>
              </Picker>
            </View>

            <View className="diary-field-group">
              <Text className="diary-label">城市 *</Text>
              <View className="diary-picker-row">
                <Picker mode="selector" range={provinces.map((item) => item.name)} value={provinceIndex} onChange={selectProvince}>
                  <View className="field diary-picker">{provinces[provinceIndex]?.name || "选择省份"}</View>
                </Picker>
                <Picker mode="selector" range={cityOptions.map((item) => item.name)} value={cityIndex} onChange={selectCity}>
                  <View className="field diary-picker">{cityOptions[cityIndex]?.name || "选择城市"}</View>
                </Picker>
              </View>
            </View>
          </View>

          <View className="diary-editor-section card">
            <View className="diary-editor-heading">
              <View className="diary-editor-heading-copy">
                <Text className="diary-editor-section-title">正文</Text>
                <Text className="diary-editor-section-note">写下细节、心情，或者一句想对对方说的话</Text>
              </View>
              <Text className="diary-counter">{body.length} / {BODY_LIMIT}</Text>
            </View>
            <Textarea
              className="field diary-textarea"
              disabled={working}
              maxlength={BODY_LIMIT}
              value={body}
              onInput={(event) => setBody(event.detail.value)}
              placeholder="今天发生了什么？"
            />
          </View>

          <View className="diary-editor-section card">
            <View className="diary-editor-heading">
              <View className="diary-editor-heading-copy">
                <Text className="diary-editor-section-title">关联回忆</Text>
                <Text className="diary-editor-section-note">可选，方便从日记回到那一天</Text>
              </View>
            </View>
            <Picker mode="selector" range={["不关联", ...allMemoryOptions.map((item) => `${item.date} · ${item.title || item.city}`)]} value={memoryIndex} onChange={selectMemory}>
              <View className="field diary-memory-picker">
                {linkedMemory ? `${linkedMemory.date} · ${linkedMemory.title || linkedMemory.city}` : "不关联已有回忆"}
              </View>
            </Picker>
          </View>

          {diary && diary.history.length > 0 && (
            <View className="diary-editor-section card">
              <Button className="diary-history-toggle" onClick={() => setShowHistory((current) => !current)}>
                <View className="diary-history-toggle-copy">
                  <Text className="diary-editor-section-title">共同编辑历史</Text>
                  <Text className="diary-editor-section-note">{diary.history.length} 个旧版本</Text>
                </View>
                <Text className="diary-history-toggle-mark">{showHistory ? "收起" : "展开"}</Text>
              </Button>
              {showHistory && (
                <View className="diary-history-list">
                  {diary.history.map((entry) => (
                    <View className="diary-history-item" key={entry.id}>
                      <View className="diary-history-item-head">
                        <Text className="diary-history-editor">{entry.editorName}</Text>
                        <Text className="diary-history-time">{historyDate(entry.editedAt)}</Text>
                      </View>
                      <Text className="diary-history-text">{entry.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View className="diary-editor-submit-bar">
            <Button className="btn diary-editor-submit" disabled={working} loading={working} onClick={() => void save()}>
              {working ? "正在保存..." : diary ? "保存修改" : "保存日记"}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

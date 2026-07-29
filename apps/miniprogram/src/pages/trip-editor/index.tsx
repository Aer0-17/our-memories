import { useEffect, useMemo, useState } from "react";
import { Button, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  createTripGuide,
  getTripGuides,
  readSession,
  updateTripGuide,
  type TripCheckpoint,
  type TripGuide,
  type TripGuidePayload,
} from "../../lib/api";
import { normalizedTripPlans, tripDayDate, tripInclusiveDays } from "../../lib/trips";
import "./index.scss";

const TITLE_LIMIT = 80;
const PLACE_LIMIT = 80;
const NOTES_LIMIT = 2000;
const STOP_LIMIT = 80;
const MAX_STOPS_PER_DAY = 12;
const dayOptions = Array.from({ length: 30 }, (_, index) => `${index + 1} 天`);

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function newCheckpointId(day: number, index: number) {
  return `stop-${Date.now()}-${day}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function TripEditorPage() {
  const router = useRouter();
  const tripId = typeof router.params.id === "string" ? router.params.id : "";
  const [guide, setGuide] = useState<TripGuide | null>(null);
  const [title, setTitle] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState(2);
  const [notes, setNotes] = useState("");
  const [dayInputs, setDayInputs] = useState<string[]>(["", ""]);
  const [loading, setLoading] = useState(Boolean(tripId));
  const [working, setWorking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState("");

  const resizeDays = (nextDays: number) => {
    const normalized = Math.max(1, Math.min(30, nextDays));
    setDays(normalized);
    setDayInputs((current) => Array.from({ length: normalized }, (_, index) => current[index] || ""));
  };

  useEffect(() => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!tripId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void getTripGuides()
      .then((data) => {
        const current = (data.guides || []).find((item) => item.id === tripId);
        if (!current) {
          setUnavailable(true);
          return;
        }
        const payload = current.payload;
        const dateDays = tripInclusiveDays(payload.startDate, payload.endDate);
        const effectiveDays = dateDays && dateDays <= 30 ? dateDays : payload.days;
        const plans = normalizedTripPlans({ ...payload, days: effectiveDays });
        setGuide(current);
        setTitle(payload.title || "");
        setOrigin(payload.origin || "");
        setDestination(payload.destination || "");
        setStartDate(payload.startDate || "");
        setEndDate(payload.endDate || "");
        setDays(plans.length);
        setNotes(payload.notes || "");
        setDayInputs(plans.map((plan) => plan.checkpoints.map((checkpoint) => checkpoint.name).join("\n")));
      })
      .catch(() => setStatus("旅行计划暂时没有同步成功，请稍后再试。"))
      .finally(() => setLoading(false));
  }, [tripId]);

  const existingPlans = useMemo(() => guide ? normalizedTripPlans(guide.payload) : [], [guide]);
  const dateDrivenDays = tripInclusiveDays(startDate, endDate);
  const canSave = Boolean(title.trim() && destination.trim() && !working && !loading && !unavailable);

  const updateDayInput = (index: number, value: string) => {
    setDayInputs((current) => current.map((item, currentIndex) => currentIndex === index ? value : item));
  };

  const selectStartDate = (value: string) => {
    setStartDate(value);
    const inclusiveDays = tripInclusiveDays(value, endDate);
    if (inclusiveDays && inclusiveDays <= 30) resizeDays(inclusiveDays);
  };

  const selectEndDate = (value: string) => {
    setEndDate(value);
    const inclusiveDays = tripInclusiveDays(startDate, value);
    if (inclusiveDays && inclusiveDays <= 30) resizeDays(inclusiveDays);
  };

  const buildCheckpoints = (day: number, value: string): TripCheckpoint[] | null => {
    const names = value.split("\n").map((item) => item.trim()).filter(Boolean);
    if (names.length > MAX_STOPS_PER_DAY || names.some((name) => name.length > STOP_LIMIT)) return null;
    const previous = existingPlans.find((plan) => plan.day === day)?.checkpoints || [];
    const used = new Set<string>();
    return names.map((name, index) => {
      const matched = previous.find((checkpoint) => checkpoint.name === name && !used.has(checkpoint.id));
      if (matched) {
        used.add(matched.id);
        return matched;
      }
      return { id: newCheckpointId(day, index), name, done: false };
    });
  };

  const save = async () => {
    if (!canSave) return;
    setStatus("");
    if (title.trim().length > TITLE_LIMIT || origin.trim().length > PLACE_LIMIT || destination.trim().length > PLACE_LIMIT) {
      setStatus("标题或地点文字太长，请精简后再保存。");
      return;
    }
    if (notes.trim().length > NOTES_LIMIT) {
      setStatus("出发前的话最多 2000 个字。");
      return;
    }
    if (Boolean(startDate) !== Boolean(endDate)) {
      setStatus("如果填写日期，请同时选择出发和返程日期；也可以都留空，之后再定。");
      return;
    }
    const inclusiveDays = tripInclusiveDays(startDate, endDate);
    if (startDate && (!inclusiveDays || inclusiveDays > 30)) {
      setStatus("返程日期不能早于出发日期，一段计划最多安排 30 天。");
      return;
    }

    const daysPlan = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const checkpoints = buildCheckpoints(day, dayInputs[index] || "");
      return checkpoints ? {
        day,
        date: tripDayDate(startDate, day) || undefined,
        checkpoints,
      } : null;
    });
    if (daysPlan.some((plan) => plan === null)) {
      setStatus(`每天最多 ${MAX_STOPS_PER_DAY} 个安排，每行最多 ${STOP_LIMIT} 个字。`);
      return;
    }

    const payload: TripGuidePayload = {
      title: title.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      days,
      status: guide?.payload.status === "completed" ? "completed" : "planning",
      notes: notes.trim() || undefined,
      daysPlan: daysPlan.filter((plan): plan is NonNullable<typeof plan> => plan !== null),
    };

    setWorking(true);
    try {
      const response = guide
        ? await updateTripGuide(guide.id, payload)
        : await createTripGuide(payload);
      Taro.showToast({ title: guide ? "行程已更新" : "旅行计划已创建", icon: "success" });
      Taro.redirectTo({ url: `/pages/trip-detail/index?id=${encodeURIComponent(response.guide.id)}` });
    } catch {
      setStatus("旅行计划没有保存成功，请检查网络后再试。");
    } finally {
      setWorking(false);
    }
  };

  if (unavailable) {
    return (
      <View className="page trip-editor-page">
        <AppHeader title="编辑旅行" back />
        <View className="trip-editor-unavailable">
          <Text className="trip-editor-unavailable-mark">⌁</Text>
          <Text className="trip-editor-unavailable-title">这份旅行计划已经不在了</Text>
          <Text className="trip-editor-unavailable-copy">可能已被另一位成员删除，返回旅行清单看看吧。</Text>
          <Button className="btn" onClick={() => Taro.redirectTo({ url: "/pages/trips/index" })}>返回旅行清单</Button>
        </View>
      </View>
    );
  }

  return (
    <View className="page trip-editor-page">
      <AppHeader title={guide ? "共同编辑行程" : "计划新旅程"} back />

      <View className="screen-intro trip-editor-intro">
        <Text className="screen-title">{guide ? "把沿途安排补得更完整" : "先定下一站，再慢慢靠近"}</Text>
        <Text className="screen-subtitle">双方都可以修改这份计划。每日安排每行写一项，保存后就会变成共同打卡清单。</Text>
      </View>

      {status && <ErrorBanner copy={status} />}
      {loading ? (
        <LoadingState />
      ) : (
        <View className="trip-editor-form">
          <View className="trip-editor-section card">
            <View className="trip-editor-heading">
              <View className="trip-editor-heading-copy">
                <Text className="trip-editor-section-title">旅程信息</Text>
                <Text className="trip-editor-section-note">日期还没定也没关系，可以先留空。</Text>
              </View>
              <Text className="trip-editor-counter">{title.length}/{TITLE_LIMIT}</Text>
            </View>

            <View className="trip-editor-field-group">
              <Text className="trip-editor-label">计划名称 *</Text>
              <Input
                className="field"
                maxlength={TITLE_LIMIT}
                value={title}
                onInput={(event) => setTitle(event.detail.value)}
                placeholder="例如：杭州的两天一夜"
              />
            </View>

            <View className="trip-editor-place-grid">
              <View className="trip-editor-field-group">
                <Text className="trip-editor-label">从哪里出发</Text>
                <Input
                  className="field"
                  maxlength={PLACE_LIMIT}
                  value={origin}
                  onInput={(event) => setOrigin(event.detail.value)}
                  placeholder="例如：上海"
                />
              </View>
              <View className="trip-editor-field-group">
                <Text className="trip-editor-label">要去哪里 *</Text>
                <Input
                  className="field"
                  maxlength={PLACE_LIMIT}
                  value={destination}
                  onInput={(event) => setDestination(event.detail.value)}
                  placeholder="例如：杭州"
                />
              </View>
            </View>

            <View className="trip-editor-date-grid">
              <View className="trip-editor-field-group">
                <Text className="trip-editor-label">出发日期</Text>
                <Picker mode="date" value={startDate || localDateValue()} onChange={(event) => selectStartDate(event.detail.value)}>
                  <View className={startDate ? "trip-editor-picker selected" : "trip-editor-picker field"}>
                    <Text>{startDate || "选择日期"}</Text><Text>›</Text>
                  </View>
                </Picker>
              </View>
              <View className="trip-editor-field-group">
                <Text className="trip-editor-label">返程日期</Text>
                <Picker mode="date" value={endDate || startDate || localDateValue()} onChange={(event) => selectEndDate(event.detail.value)}>
                  <View className={endDate ? "trip-editor-picker selected" : "trip-editor-picker field"}>
                    <Text>{endDate || "选择日期"}</Text><Text>›</Text>
                  </View>
                </Picker>
              </View>
            </View>
            {(startDate || endDate) && (
              <Button className="trip-editor-clear-date" onClick={() => { setStartDate(""); setEndDate(""); }}>
                日期还没定，先清空
              </Button>
            )}

            <View className="trip-editor-field-group">
              <Text className="trip-editor-label">计划天数</Text>
              {dateDrivenDays && dateDrivenDays <= 30 ? (
                <View className="trip-editor-picker selected">
                  <Text>{dateDrivenDays} 天（按日期自动计算）</Text><Text>✓</Text>
                </View>
              ) : (
                <Picker mode="selector" range={dayOptions} value={days - 1} onChange={(event) => resizeDays(Number(event.detail.value) + 1)}>
                  <View className="trip-editor-picker selected"><Text>{days} 天</Text><Text>›</Text></View>
                </Picker>
              )}
            </View>

            <View className="trip-editor-field-group">
              <View className="trip-editor-label-row">
                <Text className="trip-editor-label">写在出发前</Text>
                <Text className="trip-editor-counter">{notes.length}/{NOTES_LIMIT}</Text>
              </View>
              <Textarea
                className="field trip-editor-notes"
                maxlength={NOTES_LIMIT}
                value={notes}
                onInput={(event) => setNotes(event.detail.value)}
                placeholder="想去的原因、交通提醒，或者想对彼此说的话…"
              />
            </View>
          </View>

          <View className="trip-editor-itinerary">
            <View className="trip-editor-itinerary-heading">
              <View>
                <Text className="trip-editor-section-title">每日安排</Text>
                <Text className="trip-editor-section-note">每行一个地点或事项，每天最多 {MAX_STOPS_PER_DAY} 项。</Text>
              </View>
              <Text className="trip-editor-day-count">{days} 天</Text>
            </View>

            {dayInputs.map((value, index) => {
              const day = index + 1;
              const stopCount = value.split("\n").map((item) => item.trim()).filter(Boolean).length;
              return (
                <View className="trip-editor-day card" key={day}>
                  <View className="trip-editor-day-heading">
                    <View className="trip-editor-day-number"><Text>{day}</Text></View>
                    <View className="trip-editor-day-copy">
                      <Text className="trip-editor-day-title">第 {day} 天</Text>
                      <Text className="trip-editor-day-date">{tripDayDate(startDate, day) || "日期待定"}</Text>
                    </View>
                    <Text className="trip-editor-counter">{stopCount}/{MAX_STOPS_PER_DAY}</Text>
                  </View>
                  <Textarea
                    className="field trip-editor-day-input"
                    maxlength={1000}
                    value={value}
                    onInput={(event) => updateDayInput(index, event.detail.value)}
                    placeholder={`第 ${day} 天想去哪里？\n每行写一个地点或安排`}
                  />
                </View>
              );
            })}
          </View>

          <View className="trip-editor-submit-bar">
            <Button className="btn trip-editor-submit" disabled={!canSave} loading={working} onClick={() => void save()}>
              {working ? "正在同步…" : guide ? "保存共同修改" : "写进共同旅行计划"}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

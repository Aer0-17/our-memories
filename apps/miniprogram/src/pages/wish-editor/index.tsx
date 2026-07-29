import { useEffect, useMemo, useState } from "react";
import { Button, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  createWish,
  getWishes,
  readSession,
  updateWish,
  type Wish,
  type WishInput,
} from "../../lib/api";
import "./index.scss";

const TITLE_LIMIT = 80;
const DESCRIPTION_LIMIT = 500;

function localDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function pickerDate(value: string) {
  return value.slice(0, 10).replace(/\./g, "-") || localDateValue();
}

export default function WishEditorPage() {
  const router = useRouter();
  const wishId = typeof router.params.id === "string" ? router.params.id : "";
  const [wish, setWish] = useState<Wish | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(Boolean(wishId));
  const [unavailable, setUnavailable] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!wishId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void getWishes()
      .then((items) => {
        const current = items.find((item) => item.id === wishId);
        if (!current) throw new Error("Wish not found");
        setWish(current);
        setTitle(current.title);
        setDescription(current.description);
        setTargetDate(current.targetDate ? pickerDate(current.targetDate) : "");
      })
      .catch(() => {
        setUnavailable(true);
        setStatus("没有找到这个愿望，请返回清单后重试。");
      })
      .finally(() => setLoading(false));
  }, [wishId]);

  const canSave = useMemo(
    () => Boolean(title.trim() && !working && !loading && !unavailable),
    [loading, title, unavailable, working],
  );

  const save = async () => {
    if (!canSave) {
      setStatus("请先写下想一起完成的事情。");
      return;
    }
    const payload: WishInput = {
      title: title.trim().slice(0, TITLE_LIMIT),
      targetDate,
      description: description.trim().slice(0, DESCRIPTION_LIMIT),
      status: wish?.status || "planned",
      completedAt: wish?.completedAt,
      completedBy: wish?.completedBy,
    };
    setWorking(true);
    setStatus("");
    try {
      if (wish) {
        await updateWish(wish.id, payload);
      } else {
        await createWish(payload);
      }
      Taro.showToast({ title: wish ? "愿望已更新" : "愿望已写下", icon: "success" });
      Taro.navigateBack({ delta: 1 });
    } catch {
      setStatus("愿望没有保存成功，请检查网络后再试。");
    } finally {
      setWorking(false);
    }
  };

  return (
    <View className="page wish-editor-page">
      <AppHeader title={wish ? "编辑愿望" : "写下愿望"} back />

      <View className="screen-intro wish-editor-intro">
        <Text className="screen-title">{wish ? "让期待更清楚一点" : "想和你一起做什么"}</Text>
        <Text className="screen-subtitle">不用写得宏大，一件想一起完成的小事就很好。</Text>
      </View>

      {status && <ErrorBanner copy={status} />}
      {loading ? <LoadingState compact /> : !unavailable ? (
        <View className="wish-form">
          <View className="wish-editor-section card">
            <View className="wish-editor-heading">
              <View className="wish-editor-heading-copy">
                <Text className="wish-editor-section-title">这件想做的事</Text>
                <Text className="wish-editor-section-note">双方都可以回来继续修改</Text>
              </View>
            </View>

            <View className="wish-field-group">
              <View className="wish-label-row">
                <Text className="wish-label">愿望 *</Text>
                <Text className="wish-counter">{title.length} / {TITLE_LIMIT}</Text>
              </View>
              <Input
                className="field"
                disabled={working}
                maxlength={TITLE_LIMIT}
                placeholder="例如：一起去看一次日出"
                value={title}
                onInput={(event) => setTitle(event.detail.value)}
              />
            </View>

            <View className="wish-field-group">
              <View className="wish-label-row">
                <Text className="wish-label">一句期待</Text>
                <Text className="wish-counter">{description.length} / {DESCRIPTION_LIMIT}</Text>
              </View>
              <Textarea
                className="field wish-textarea"
                disabled={working}
                maxlength={DESCRIPTION_LIMIT}
                placeholder="为什么想做、想去哪里，或者想对 TA 说的话…"
                value={description}
                onInput={(event) => setDescription(event.detail.value)}
              />
            </View>
          </View>

          <View className="wish-editor-section card">
            <View className="wish-editor-heading">
              <View className="wish-editor-heading-copy">
                <Text className="wish-editor-section-title">期待的日期</Text>
                <Text className="wish-editor-section-note">可以不设日期，不把愿望变成压力</Text>
              </View>
            </View>
            <View className="wish-date-row">
              <Picker
                mode="date"
                value={targetDate || localDateValue()}
                onChange={(event) => setTargetDate(String(event.detail.value))}
              >
                <View className={targetDate ? "field wish-date-picker selected" : "field wish-date-picker"}>
                  <Text>{targetDate || "选择一个期待的日期"}</Text>
                  <Text className="wish-date-arrow">⌄</Text>
                </View>
              </Picker>
              {targetDate && (
                <Button className="wish-date-clear" disabled={working} onClick={() => setTargetDate("")}>
                  暂不设日期
                </Button>
              )}
            </View>
          </View>

          {wish?.status === "completed" && (
            <View className="wish-completed-note card">
              <Text className="wish-completed-mark">✓</Text>
              <View className="wish-completed-copy">
                <Text className="wish-completed-title">这个愿望已经实现</Text>
                <Text className="wish-completed-subtitle">修改文字不会改变完成状态，可在清单页重新放回待实现。</Text>
              </View>
            </View>
          )}

          <View className="wish-editor-submit-bar">
            <Button className="btn wish-editor-submit" disabled={!canSave} loading={working} onClick={() => void save()}>
              {working ? "正在保存…" : wish ? "保存修改" : "写进共同愿望"}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

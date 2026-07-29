import { useState } from "react";
import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner } from "../../components/PageStates";
import { createCoupleQuestion, readSession } from "../../lib/api";
import "./index.scss";

const PROMPT_LIMIT = 200;

const promptIdeas = [
  "第一次见面时，你对我的第一印象是什么？",
  "哪一个平凡瞬间，让你觉得我们很幸福？",
  "我做过哪件小事，让你一直记到现在？",
  "如果重走一次旅行，你最想回到哪里？",
  "最近有什么话，你想认真告诉我？",
  "你最期待我们一起完成的下一件事是什么？",
];

export default function QuestionEditorPage() {
  const [prompt, setPrompt] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");

  useDidShow(() => {
    if (!readSession()) Taro.switchTab({ url: "/pages/index/index" });
  });

  const submit = async () => {
    if (working) return;
    const normalized = prompt.trim();
    if (!normalized) {
      setStatus("先留下一道想和 TA 一起回答的问题。");
      return;
    }
    setWorking(true);
    setStatus("");
    try {
      const data = await createCoupleQuestion(normalized);
      Taro.showToast({ title: "问题已经留下", icon: "success" });
      Taro.redirectTo({
        url: `/pages/question-detail/index?id=${encodeURIComponent(data.question.id)}`,
      });
    } catch {
      setStatus("这道问题暂时没有保存成功，请检查网络后再试。");
    } finally {
      setWorking(false);
    }
  };

  return (
    <View className="page question-editor-page">
      <AppHeader title="出一道题" back />

      <View className="screen-intro">
        <Text className="screen-title">想听 TA 重新说起什么？</Text>
        <Text className="screen-subtitle">问题会同时出现在两个人那里；答案不会先后影响彼此。</Text>
      </View>

      {status && <ErrorBanner copy={status} />}

      <View className="question-editor-card card">
        <View className="question-editor-label-row">
          <Text className="question-editor-label">这一次想问</Text>
          <Text className="question-editor-counter">{prompt.length} / {PROMPT_LIMIT}</Text>
        </View>
        <Textarea
          className="field question-editor-textarea"
          disabled={working}
          maxlength={PROMPT_LIMIT}
          placeholder="例如：最近哪一个瞬间，让你突然很想我？"
          value={prompt}
          onInput={(event) => setPrompt(event.detail.value)}
        />
        <View className="question-editor-privacy">
          <View className="question-editor-lock"><Text>♡</Text></View>
          <Text>双方都回答之前，任何一方都看不到另一份答案。</Text>
        </View>
      </View>

      <View className="question-ideas-section">
        <View className="question-ideas-heading">
          <Text className="question-ideas-title">也可以从这些问题开始</Text>
          <Text className="question-ideas-subtitle">点一下就能继续修改，不必照着原句。</Text>
        </View>
        <View className="question-ideas-list">
          {promptIdeas.map((idea, index) => (
            <Button
              className={prompt === idea ? "question-idea selected" : "question-idea"}
              disabled={working}
              key={idea}
              onClick={() => {
                setPrompt(idea);
                setStatus("");
              }}
            >
              <Text className="question-idea-number">{String(index + 1).padStart(2, "0")}</Text>
              <Text className="question-idea-copy">{idea}</Text>
            </Button>
          ))}
        </View>
      </View>

      <Button className="btn question-editor-submit" disabled={working} loading={working} onClick={() => void submit()}>
        {working ? "正在轻轻放下…" : "把问题留给我们"}
      </Button>
    </View>
  );
}

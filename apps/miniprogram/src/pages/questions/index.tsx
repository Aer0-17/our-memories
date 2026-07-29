import { useCallback, useMemo, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/PageStates";
import { getCoupleQuestions, readSession, type CoupleQuestion } from "../../lib/api";
import "./index.scss";

type QuestionFilter = "pending" | "revealed" | "all";

function questionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚留下";
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function questionState(question: CoupleQuestion) {
  if (question.revealed) return "已经一起揭晓";
  if (!question.answeredByMe && question.partnerAnswered) return "TA 已写好，等你回答";
  if (!question.answeredByMe) return "轮到你写下答案";
  return "你的答案已封存，等待 TA";
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<CoupleQuestion[]>([]);
  const [filter, setFilter] = useState<QuestionFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadQuestions = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getCoupleQuestions();
      setQuestions(data.questions || []);
    } catch {
      setStatus("心动问答暂时没有同步成功，请检查网络后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void loadQuestions(Boolean(questions.length));
  });

  usePullDownRefresh(() => {
    void loadQuestions(true).finally(() => Taro.stopPullDownRefresh());
  });

  const waitingForMe = questions.filter((item) => !item.revealed && !item.answeredByMe).length;
  const waitingForPartner = questions.filter((item) => !item.revealed && item.answeredByMe).length;
  const revealedCount = questions.filter((item) => item.revealed).length;
  const filtered = useMemo(() => questions.filter((item) => {
    if (filter === "pending") return !item.revealed;
    if (filter === "revealed") return item.revealed;
    return true;
  }), [filter, questions]);

  const filters: Array<{ key: QuestionFilter; label: string; count: number }> = [
    { key: "pending", label: "待揭晓", count: questions.length - revealedCount },
    { key: "revealed", label: "已揭晓", count: revealedCount },
    { key: "all", label: "全部", count: questions.length },
  ];

  const openEditor = () => Taro.navigateTo({ url: "/pages/question-editor/index" });
  const openQuestion = (id: string) => Taro.navigateTo({
    url: `/pages/question-detail/index?id=${encodeURIComponent(id)}`,
  });

  return (
    <View className="page questions-page">
      <AppHeader title="心动问答" back />

      <View className="questions-hero">
        <View className="questions-hero-copy">
          <Text className="questions-kicker">先各自写下，再一起翻开</Text>
          <Text className="questions-title">
            {waitingForMe ? `有 ${waitingForMe} 道题，正在等你` : "两个人的答案，慢慢写"}
          </Text>
          <Text className="questions-subtitle">第一份答案会被好好封存，直到另一份也来到这里。</Text>
        </View>
        <View className="questions-seal"><Text>♡</Text></View>
      </View>

      <View className="questions-stats card">
        <View className="questions-stat">
          <Text className="questions-stat-value">{waitingForMe}</Text>
          <Text className="questions-stat-label">等我回答</Text>
        </View>
        <View className="questions-stat-divider" />
        <View className="questions-stat">
          <Text className="questions-stat-value">{waitingForPartner}</Text>
          <Text className="questions-stat-label">等待 TA</Text>
        </View>
        <View className="questions-stat-divider" />
        <View className="questions-stat">
          <Text className="questions-stat-value">{revealedCount}</Text>
          <Text className="questions-stat-label">已经揭晓</Text>
        </View>
      </View>

      <Button className="btn questions-create" onClick={openEditor}>出一道新的题</Button>

      <View className="questions-filters">
        {filters.map((item) => (
          <Button
            className={filter === item.key ? "questions-filter active" : "questions-filter"}
            key={item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label} {item.count}
          </Button>
        ))}
      </View>

      {status && <ErrorBanner copy={status} onRetry={() => void loadQuestions()} />}
      {loading && questions.length === 0 ? (
        <LoadingState compact />
      ) : questions.length === 0 && !status ? (
        <EmptyState
          title="还没有留下第一道题"
          copy="选一个想重新听 TA 说起的话题，答案会等两个人都写完再揭晓。"
          actionLabel="出第一道题"
          onAction={openEditor}
        />
      ) : filtered.length === 0 && !status ? (
        <EmptyState
          title="这个分类还没有问答"
          copy="换个分类看看，或者再留下一道想一起回答的问题。"
          actionLabel="查看全部"
          onAction={() => setFilter("all")}
        />
      ) : (
        <View className="question-card-list">
          {filtered.map((question) => (
            <Button
              className={question.revealed ? "question-card revealed" : "question-card sealed"}
              key={question.id}
              onClick={() => openQuestion(question.id)}
            >
              <View className="question-card-topline">
                <Text className="question-card-state">{questionState(question)}</Text>
                <Text className="question-card-date">{questionTime(question.createdAt)}</Text>
              </View>
              <Text className="question-card-prompt">{question.prompt}</Text>
              <View className="question-card-footer">
                <View className="question-answer-progress">
                  <View
                    className="question-answer-progress-fill"
                    style={{ width: `${Math.min(100, (question.answerCount / Math.max(1, question.requiredAnswers)) * 100)}%` }}
                  />
                </View>
                <Text className="question-card-count">
                  {question.revealed ? "两份答案都在这里" : `${question.answerCount}/${question.requiredAnswers} 已回答`}
                </Text>
              </View>
              <Text className="question-card-arrow">›</Text>
            </Button>
          ))}
        </View>
      )}
    </View>
  );
}

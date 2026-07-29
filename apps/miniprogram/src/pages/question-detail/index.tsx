import { useCallback, useMemo, useState } from "react";
import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { AppHeader } from "../../components/AppHeader";
import { ErrorBanner, LoadingState } from "../../components/PageStates";
import {
  answerCoupleQuestion,
  deleteCoupleQuestion,
  getCoupleQuestions,
  readSession,
  type CoupleQuestion,
} from "../../lib/api";
import "./index.scss";

const ANSWER_LIMIT = 1000;

function answerTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function QuestionDetailPage() {
  const router = useRouter();
  const questionId = typeof router.params.id === "string" ? router.params.id : "";
  const [question, setQuestion] = useState<CoupleQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [workingKey, setWorkingKey] = useState("");

  const loadQuestion = useCallback(async (background = false) => {
    if (!readSession()) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }
    if (!questionId) {
      setStatus("没有找到要查看的心动问答。");
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    setStatus("");
    try {
      const data = await getCoupleQuestions();
      const current = (data.questions || []).find((item) => item.id === questionId);
      if (!current) throw new Error("Question not found");
      setQuestion(current);
      if (!current.revealed) setAnswer(current.myAnswer?.content || "");
    } catch {
      setStatus("这道问答暂时没有同步成功，请稍后再试。");
    } finally {
      if (!background) setLoading(false);
    }
  }, [questionId]);

  useDidShow(() => {
    void loadQuestion(Boolean(question));
  });

  usePullDownRefresh(() => {
    void loadQuestion(true).finally(() => Taro.stopPullDownRefresh());
  });

  const revealedAnswers = useMemo(() => [...(question?.answers || [])].sort((left, right) => {
    if (left.isMine === right.isMine) return 0;
    return left.isMine ? -1 : 1;
  }), [question]);

  const saveAnswer = async () => {
    if (!question || question.revealed || workingKey) return;
    const normalized = answer.trim();
    if (!normalized) {
      setStatus("先写下属于你的答案，再把它轻轻封存。");
      return;
    }
    setWorkingKey("answer");
    setStatus("");
    try {
      const data = await answerCoupleQuestion(question.id, normalized);
      setQuestion(data.question);
      if (data.question.revealed) {
        Taro.showToast({ title: "两份答案一起揭晓啦", icon: "success" });
      } else {
        setAnswer(data.question.myAnswer?.content || normalized);
        Taro.showToast({ title: "答案已封存", icon: "success" });
      }
    } catch {
      setStatus("这份答案暂时没有保存成功，请检查网络后再试。");
    } finally {
      setWorkingKey("");
    }
  };

  const removeQuestion = async () => {
    if (!question || workingKey) return;
    const result = await Taro.showModal({
      title: "删除这道心动问答？",
      content: "删除后，两个人都无法再看到问题和已经写下的答案。",
      confirmText: "删除",
    });
    if (!result.confirm) return;
    setWorkingKey("delete");
    setStatus("");
    try {
      await deleteCoupleQuestion(question.id);
      Taro.showToast({ title: "问答已删除", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 300);
    } catch {
      setStatus("这道问答暂时没有删除成功，请稍后再试。");
      setWorkingKey("");
    }
  };

  return (
    <View className="page question-detail-page">
      <AppHeader title="心动问答" back />

      {status && <ErrorBanner copy={status} onRetry={() => void loadQuestion()} />}
      {loading && !question ? (
        <LoadingState compact />
      ) : question ? (
        <View className="question-detail-content">
          <View className={question.revealed ? "question-detail-hero revealed" : "question-detail-hero sealed"}>
            <View className="question-detail-status-row">
              <Text className="question-detail-kicker">
                {question.revealed ? "两份答案已经一起抵达" : "答案揭晓前，请只听自己的心"}
              </Text>
              <View className="question-detail-seal"><Text>{question.revealed ? "✓" : "♡"}</Text></View>
            </View>
            <Text className="question-detail-prompt">{question.prompt}</Text>
            <Text className="question-detail-progress">
              {question.revealed
                ? `揭晓于 ${answerTime(question.revealedAt)}`
                : `${question.answerCount}/${question.requiredAnswers} 份答案已经封存`}
            </Text>
          </View>

          {question.revealed ? (
            <View className="question-reveal-section">
              <View className="question-reveal-heading">
                <Text className="question-reveal-title">原来我们是这样想的</Text>
                <Text className="question-reveal-subtitle">没有标准答案，只有两个人认真留下的那一刻。</Text>
              </View>
              <View className="question-revealed-answers">
                {revealedAnswers.map((item) => (
                  <View className={item.isMine ? "question-answer-card mine" : "question-answer-card partner"} key={item.userId}>
                    <View className="question-answer-card-heading">
                      <View className="question-answer-avatar"><Text>{item.isMine ? "我" : "TA"}</Text></View>
                      <View className="question-answer-author">
                        <Text className="question-answer-name">{item.isMine ? "我的答案" : `${item.displayName} 的答案`}</Text>
                        <Text className="question-answer-time">{answerTime(item.answeredAt)}</Text>
                      </View>
                    </View>
                    <Text className="question-answer-copy">{item.content}</Text>
                  </View>
                ))}
              </View>
              <Button
                className="btn question-detail-next"
                onClick={() => Taro.navigateTo({ url: "/pages/question-editor/index" })}
              >
                再留下一道题
              </Button>
            </View>
          ) : (
            <View className="question-sealed-section">
              <View className="question-answer-editor card">
                <View className="question-answer-label-row">
                  <View className="question-answer-label-copy">
                    <Text className="question-answer-label">{question.answeredByMe ? "我的答案" : "写下我的答案"}</Text>
                    <Text className="question-answer-note">
                      {question.answeredByMe ? "揭晓前还可以修改，最后保存的版本会被打开。" : "写具体的小事，比漂亮的话更珍贵。"}
                    </Text>
                  </View>
                  <Text className="question-answer-counter">{answer.length} / {ANSWER_LIMIT}</Text>
                </View>
                <Textarea
                  className="field question-answer-textarea"
                  disabled={Boolean(workingKey)}
                  maxlength={ANSWER_LIMIT}
                  placeholder="把第一时间想到的话写在这里…"
                  value={answer}
                  onInput={(event) => {
                    setAnswer(event.detail.value);
                    setStatus("");
                  }}
                />
                <Button
                  className="btn question-answer-submit"
                  disabled={Boolean(workingKey)}
                  loading={workingKey === "answer"}
                  onClick={() => void saveAnswer()}
                >
                  {workingKey === "answer" ? "正在封存…" : question.answeredByMe ? "更新封存的答案" : "封存我的答案"}
                </Button>
              </View>

              <View className={question.partnerAnswered ? "partner-answer-state answered" : "partner-answer-state"}>
                <View className="partner-answer-mark"><Text>{question.partnerAnswered ? "✓" : "…"}</Text></View>
                <View className="partner-answer-copy">
                  <Text className="partner-answer-title">
                    {question.partnerAnswered ? "TA 已经写好了" : "TA 还在慢慢想"}
                  </Text>
                  <Text className="partner-answer-subtitle">
                    {question.partnerAnswered
                      ? question.answeredByMe ? "两份答案正在一起揭晓，请下拉刷新。" : "答案已封存，但会等你写完才打开。"
                      : question.answeredByMe ? "你的答案很安全，TA 回答后会一起揭晓。" : "你们谁先写都不会影响另一份答案。"}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <Button className="question-detail-delete" disabled={Boolean(workingKey)} onClick={() => void removeQuestion()}>
            {workingKey === "delete" ? "正在删除…" : "删除这道问答"}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

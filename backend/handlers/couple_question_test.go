package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"our-memories-backend/events"
)

func coupleQuestionRequest(
	t *testing.T,
	method string,
	path string,
	questionID string,
	userID string,
	body gin.H,
	handler gin.HandlerFunc,
) *httptest.ResponseRecorder {
	t.Helper()
	var encoded []byte
	var err error
	if body != nil {
		encoded, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, bytes.NewReader(encoded))
	if body != nil {
		c.Request.Header.Set("Content-Type", "application/json")
	}
	if questionID != "" {
		c.Params = gin.Params{{Key: "id", Value: questionID}}
	}
	c.Set("spaceID", "space-1")
	c.Set("userID", userID)
	handler(c)
	return w
}

func TestCoupleQuestionAnswersStayHiddenUntilBothAnswer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupSignalHandlerTestDB(t)
	recorder := &signalEventRecorder{}
	SetEventPublisher(recorder)

	w := coupleQuestionRequest(
		t,
		http.MethodPost,
		"/api/v1/couple-questions",
		"",
		"user-1",
		gin.H{"prompt": "哪一个平凡瞬间让你觉得很幸福？"},
		CreateCoupleQuestion,
	)
	if w.Code != http.StatusOK {
		t.Fatalf("expected question create to succeed, got %d: %s", w.Code, w.Body.String())
	}
	var created struct {
		Question coupleQuestionView `json:"question"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Question.ID == "" || created.Question.Revealed || len(recorder.items) != 1 || recorder.items[0].Type != events.CoupleQuestionCreated {
		t.Fatalf("unexpected created question or event: question=%#v events=%#v", created.Question, recorder.items)
	}

	w = coupleQuestionRequest(
		t,
		http.MethodPut,
		"/api/v1/couple-questions/"+created.Question.ID+"/answer",
		created.Question.ID,
		"user-1",
		gin.H{"content": "一起在厨房做晚饭的时候。"},
		AnswerCoupleQuestion,
	)
	if w.Code != http.StatusOK {
		t.Fatalf("expected first answer to succeed, got %d: %s", w.Code, w.Body.String())
	}
	var firstAnswer struct {
		Question coupleQuestionView `json:"question"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &firstAnswer); err != nil {
		t.Fatal(err)
	}
	if firstAnswer.Question.Revealed || !firstAnswer.Question.AnsweredByMe || firstAnswer.Question.MyAnswer == nil {
		t.Fatalf("unexpected first answer view: %#v", firstAnswer.Question)
	}
	if len(recorder.items) != 2 || recorder.items[1].Type != events.CoupleQuestionAnswered {
		t.Fatalf("expected couple_question.answered event, got %#v", recorder.items)
	}

	w = coupleQuestionRequest(
		t,
		http.MethodGet,
		"/api/v1/couple-questions",
		"",
		"user-2",
		nil,
		GetCoupleQuestions,
	)
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), "一起在厨房做晚饭的时候") {
		t.Fatalf("expected partner answer to stay hidden, got %d: %s", w.Code, w.Body.String())
	}
	var hidden struct {
		Questions []coupleQuestionView `json:"questions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &hidden); err != nil {
		t.Fatal(err)
	}
	if len(hidden.Questions) != 1 || !hidden.Questions[0].PartnerAnswered || hidden.Questions[0].AnsweredByMe {
		t.Fatalf("unexpected hidden partner state: %#v", hidden.Questions)
	}

	w = coupleQuestionRequest(
		t,
		http.MethodPut,
		"/api/v1/couple-questions/"+created.Question.ID+"/answer",
		created.Question.ID,
		"user-2",
		gin.H{"content": "你下班回来先抱住我的时候。"},
		AnswerCoupleQuestion,
	)
	if w.Code != http.StatusOK {
		t.Fatalf("expected second answer to succeed, got %d: %s", w.Code, w.Body.String())
	}
	var revealed struct {
		Question coupleQuestionView `json:"question"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &revealed); err != nil {
		t.Fatal(err)
	}
	if !revealed.Question.Revealed || len(revealed.Question.RevealedAnswers) != 2 || revealed.Question.MyAnswer != nil {
		t.Fatalf("expected both answers to reveal, got %#v", revealed.Question)
	}
	if !strings.Contains(w.Body.String(), "一起在厨房做晚饭的时候") || !strings.Contains(w.Body.String(), "你下班回来先抱住我的时候") {
		t.Fatalf("expected revealed response to contain both answers: %s", w.Body.String())
	}
	if len(recorder.items) != 3 || recorder.items[2].Type != events.CoupleQuestionRevealed {
		t.Fatalf("expected couple_question.revealed event, got %#v", recorder.items)
	}
	backup, err := backupService().Export("space-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(backup.Payload.Tables["couple_questions"]) != 1 || len(backup.Payload.Tables["couple_question_answers"]) != 2 {
		t.Fatalf("expected question and answers in backup, got %#v", backup.Payload.Tables)
	}

	w = coupleQuestionRequest(
		t,
		http.MethodPut,
		"/api/v1/couple-questions/"+created.Question.ID+"/answer",
		created.Question.ID,
		"user-1",
		gin.H{"content": "揭晓后不应再改。"},
		AnswerCoupleQuestion,
	)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected revealed answer to be locked, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCoupleQuestionValidatesPromptAndAnswerLength(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupSignalHandlerTestDB(t)

	w := coupleQuestionRequest(
		t,
		http.MethodPost,
		"/api/v1/couple-questions",
		"",
		"user-1",
		gin.H{"prompt": strings.Repeat("问", maxCoupleQuestionRunes+1)},
		CreateCoupleQuestion,
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected oversized prompt to be rejected, got %d: %s", w.Code, w.Body.String())
	}

	w = coupleQuestionRequest(
		t,
		http.MethodPost,
		"/api/v1/couple-questions",
		"",
		"user-1",
		gin.H{"prompt": "最近最想一起做什么？"},
		CreateCoupleQuestion,
	)
	var created struct {
		Question coupleQuestionView `json:"question"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	w = coupleQuestionRequest(
		t,
		http.MethodPut,
		"/api/v1/couple-questions/"+created.Question.ID+"/answer",
		created.Question.ID,
		"user-1",
		gin.H{"content": strings.Repeat("答", maxCoupleAnswerRunes+1)},
		AnswerCoupleQuestion,
	)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected oversized answer to be rejected, got %d: %s", w.Code, w.Body.String())
	}
}

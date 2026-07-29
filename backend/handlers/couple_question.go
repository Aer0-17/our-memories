package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/events"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

const (
	maxCoupleQuestions     = 100
	maxCoupleQuestionRunes = 200
	maxCoupleAnswerRunes   = 1000
)

type coupleQuestionAnswerView struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	Content     string `json:"content"`
	AnsweredAt  string `json:"answeredAt"`
	IsMine      bool   `json:"isMine"`
}

type coupleQuestionView struct {
	ID              string                     `json:"id"`
	Prompt          string                     `json:"prompt"`
	CreatedByID     string                     `json:"createdById"`
	CreatedAt       string                     `json:"createdAt"`
	UpdatedAt       string                     `json:"updatedAt"`
	RevealedAt      string                     `json:"revealedAt,omitempty"`
	Revealed        bool                       `json:"revealed"`
	AnsweredByMe    bool                       `json:"answeredByMe"`
	PartnerAnswered bool                       `json:"partnerAnswered"`
	AnswerCount     int                        `json:"answerCount"`
	RequiredAnswers int                        `json:"requiredAnswers"`
	MyAnswer        *coupleQuestionAnswerView  `json:"myAnswer,omitempty"`
	RevealedAnswers []coupleQuestionAnswerView `json:"answers,omitempty"`
}

func GetCoupleQuestions(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	questions, err := coupleQuestionRepo().List(spaceID)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch couple questions")
		return
	}
	members, err := coupleQuestionMembers(spaceID)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch couple question members")
		return
	}
	views := make([]coupleQuestionView, 0, len(questions))
	for _, question := range questions {
		views = append(views, coupleQuestionResponse(question, members, c.GetString("userID")))
	}
	utils.Success(c, gin.H{"questions": views})
}

func CreateCoupleQuestion(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "Invalid request")
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" || utf8.RuneCountInString(prompt) > maxCoupleQuestionRunes {
		utils.Error(c, http.StatusBadRequest, "Invalid couple question prompt")
		return
	}

	spaceID := c.GetString("spaceID")
	members, err := coupleQuestionMembers(spaceID)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch couple question members")
		return
	}
	if len(members) < 2 {
		utils.Error(c, http.StatusConflict, "Couple questions require two members")
		return
	}
	existing, err := coupleQuestionRepo().List(spaceID)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to create couple question")
		return
	}
	if len(existing) >= maxCoupleQuestions {
		utils.Error(c, http.StatusConflict, "Too many couple questions")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	question, err := coupleQuestionRepo().Create(repositories.CoupleQuestionRecord{
		ID:          utils.NewID(),
		SpaceID:     spaceID,
		Prompt:      prompt,
		CreatedByID: c.GetString("userID"),
		RevealedAt:  "",
		CreatedAt:   now,
		UpdatedAt:   now,
	})
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to create couple question")
		return
	}
	_ = domainPublisher.Publish(c.Request.Context(), events.DomainEvent{
		Type:     events.CoupleQuestionCreated,
		SpaceID:  spaceID,
		ActorID:  c.GetString("userID"),
		TargetID: question.Question.ID,
	})
	utils.Success(c, gin.H{"question": coupleQuestionResponse(question, members, c.GetString("userID"))})
}

func AnswerCoupleQuestion(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "Invalid request")
		return
	}
	content := strings.TrimSpace(req.Content)
	if content == "" || utf8.RuneCountInString(content) > maxCoupleAnswerRunes {
		utils.Error(c, http.StatusBadRequest, "Invalid couple question answer")
		return
	}

	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	members, err := coupleQuestionMembers(spaceID)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch couple question members")
		return
	}
	memberIDs := make([]string, 0, len(members))
	isMember := false
	for _, member := range members {
		memberIDs = append(memberIDs, member.ID)
		isMember = isMember || member.ID == userID
	}
	if !isMember || len(memberIDs) < 2 {
		utils.Error(c, http.StatusForbidden, "Couple question member not found")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	question, isNew, justRevealed, err := coupleQuestionRepo().UpsertAnswer(
		spaceID,
		c.Param("id"),
		repositories.CoupleQuestionAnswerRecord{
			ID:         utils.NewID(),
			QuestionID: c.Param("id"),
			UserID:     userID,
			Content:    content,
			AnsweredAt: now,
		},
		memberIDs,
	)
	if err != nil {
		writeCoupleQuestionError(c, err, "Failed to answer couple question")
		return
	}
	if isNew {
		eventType := events.CoupleQuestionAnswered
		if justRevealed {
			eventType = events.CoupleQuestionRevealed
		}
		_ = domainPublisher.Publish(c.Request.Context(), events.DomainEvent{
			Type:     eventType,
			SpaceID:  spaceID,
			ActorID:  userID,
			TargetID: question.Question.ID,
		})
	}
	utils.Success(c, gin.H{"question": coupleQuestionResponse(question, members, userID)})
}

func DeleteCoupleQuestion(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	questionID := c.Param("id")
	if err := coupleQuestionRepo().Delete(spaceID, questionID); err != nil {
		writeCoupleQuestionError(c, err, "Failed to delete couple question")
		return
	}
	_ = domainPublisher.Publish(c.Request.Context(), events.DomainEvent{
		Type:     events.CoupleQuestionDeleted,
		SpaceID:  spaceID,
		ActorID:  c.GetString("userID"),
		TargetID: questionID,
	})
	utils.Success(c, gin.H{"ok": true})
}

func coupleQuestionResponse(
	item repositories.CoupleQuestionWithAnswers,
	members []models.User,
	userID string,
) coupleQuestionView {
	names := make(map[string]string, len(members))
	for _, member := range members {
		names[member.ID] = member.DisplayName
	}
	view := coupleQuestionView{
		ID:              item.Question.ID,
		Prompt:          item.Question.Prompt,
		CreatedByID:     item.Question.CreatedByID,
		CreatedAt:       item.Question.CreatedAt,
		UpdatedAt:       item.Question.UpdatedAt,
		RevealedAt:      item.Question.RevealedAt,
		Revealed:        item.Question.RevealedAt != "",
		RequiredAnswers: len(members),
	}
	for _, answer := range item.Answers {
		if _, ok := names[answer.UserID]; !ok {
			continue
		}
		answerView := coupleQuestionAnswerView{
			UserID:      answer.UserID,
			DisplayName: names[answer.UserID],
			Content:     answer.Content,
			AnsweredAt:  answer.AnsweredAt,
			IsMine:      answer.UserID == userID,
		}
		view.AnswerCount++
		if answer.UserID == userID {
			view.AnsweredByMe = true
			own := answerView
			view.MyAnswer = &own
		} else {
			view.PartnerAnswered = true
		}
		if view.Revealed {
			view.RevealedAnswers = append(view.RevealedAnswers, answerView)
		}
	}
	if view.Revealed {
		view.MyAnswer = nil
	}
	return view
}

func coupleQuestionMembers(spaceID string) ([]models.User, error) {
	return repositories.NewAccountRepository(db.Gorm).UsersBySpace(spaceID)
}

func coupleQuestionRepo() *repositories.CoupleQuestionRepository {
	return repositories.NewCoupleQuestionRepository(db.Gorm)
}

func writeCoupleQuestionError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrCoupleQuestionNotFound):
		utils.Error(c, http.StatusNotFound, "Couple question not found")
	case errors.Is(err, repositories.ErrCoupleQuestionRevealed):
		utils.Error(c, http.StatusConflict, "Couple question is already revealed")
	default:
		utils.Error(c, http.StatusInternalServerError, fallback)
	}
}

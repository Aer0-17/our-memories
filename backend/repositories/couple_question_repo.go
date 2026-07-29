package repositories

import (
	"database/sql"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrCoupleQuestionNotFound = sql.ErrNoRows
var ErrCoupleQuestionRevealed = errors.New("couple question already revealed")

type CoupleQuestionRecord struct {
	ID          string `gorm:"column:id;primaryKey"`
	SpaceID     string `gorm:"column:space_id"`
	Prompt      string `gorm:"column:prompt"`
	CreatedByID string `gorm:"column:created_by_id"`
	RevealedAt  string `gorm:"column:revealed_at"`
	CreatedAt   string `gorm:"column:created_at"`
	UpdatedAt   string `gorm:"column:updated_at"`
}

func (CoupleQuestionRecord) TableName() string { return "couple_questions" }

type CoupleQuestionAnswerRecord struct {
	ID         string `gorm:"column:id;primaryKey"`
	QuestionID string `gorm:"column:question_id"`
	UserID     string `gorm:"column:user_id"`
	Content    string `gorm:"column:content"`
	AnsweredAt string `gorm:"column:answered_at"`
}

func (CoupleQuestionAnswerRecord) TableName() string { return "couple_question_answers" }

type CoupleQuestionWithAnswers struct {
	Question CoupleQuestionRecord
	Answers  []CoupleQuestionAnswerRecord
}

type CoupleQuestionRepository struct {
	db *gorm.DB
}

func NewCoupleQuestionRepository(db *gorm.DB) *CoupleQuestionRepository {
	return &CoupleQuestionRepository{db: db}
}

func (r *CoupleQuestionRepository) List(spaceID string) ([]CoupleQuestionWithAnswers, error) {
	var questions []CoupleQuestionRecord
	if err := r.db.Where("space_id = ?", spaceID).Order("created_at DESC, id DESC").Find(&questions).Error; err != nil {
		return nil, err
	}
	return r.attachAnswers(questions)
}

func (r *CoupleQuestionRepository) Create(record CoupleQuestionRecord) (CoupleQuestionWithAnswers, error) {
	if err := r.db.Create(&record).Error; err != nil {
		return CoupleQuestionWithAnswers{}, err
	}
	return CoupleQuestionWithAnswers{Question: record, Answers: []CoupleQuestionAnswerRecord{}}, nil
}

func (r *CoupleQuestionRepository) UpsertAnswer(
	spaceID string,
	questionID string,
	answer CoupleQuestionAnswerRecord,
	memberIDs []string,
) (CoupleQuestionWithAnswers, bool, bool, error) {
	result := CoupleQuestionWithAnswers{}
	isNew := false
	justRevealed := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var question CoupleQuestionRecord
		query := tx.Where("id = ? AND space_id = ?", questionID, spaceID).First(&question)
		if errors.Is(query.Error, gorm.ErrRecordNotFound) {
			return ErrCoupleQuestionNotFound
		}
		if query.Error != nil {
			return query.Error
		}
		if question.RevealedAt != "" {
			return ErrCoupleQuestionRevealed
		}

		var existing int64
		if err := tx.Model(&CoupleQuestionAnswerRecord{}).
			Where("question_id = ? AND user_id = ?", questionID, answer.UserID).
			Count(&existing).Error; err != nil {
			return err
		}
		isNew = existing == 0
		if err := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "question_id"}, {Name: "user_id"}},
			DoUpdates: clause.Assignments(map[string]any{
				"content":     answer.Content,
				"answered_at": answer.AnsweredAt,
			}),
		}).Create(&answer).Error; err != nil {
			return err
		}

		var answerCount int64
		if err := tx.Model(&CoupleQuestionAnswerRecord{}).
			Where("question_id = ? AND user_id IN ?", questionID, memberIDs).
			Count(&answerCount).Error; err != nil {
			return err
		}
		if len(memberIDs) >= 2 && answerCount >= int64(len(memberIDs)) {
			now := time.Now().UTC().Format(time.RFC3339)
			if err := tx.Model(&CoupleQuestionRecord{}).
				Where("id = ? AND space_id = ? AND revealed_at = ''", questionID, spaceID).
				Updates(map[string]any{"revealed_at": now, "updated_at": now}).Error; err != nil {
				return err
			}
			question.RevealedAt = now
			question.UpdatedAt = now
			justRevealed = true
		} else {
			now := time.Now().UTC().Format(time.RFC3339)
			if err := tx.Model(&CoupleQuestionRecord{}).
				Where("id = ? AND space_id = ?", questionID, spaceID).
				Update("updated_at", now).Error; err != nil {
				return err
			}
			question.UpdatedAt = now
		}

		var answers []CoupleQuestionAnswerRecord
		if err := tx.Where("question_id = ?", questionID).Order("answered_at ASC, id ASC").Find(&answers).Error; err != nil {
			return err
		}
		result = CoupleQuestionWithAnswers{Question: question, Answers: answers}
		return nil
	})
	return result, isNew, justRevealed, err
}

func (r *CoupleQuestionRepository) Delete(spaceID string, questionID string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&CoupleQuestionRecord{}).
			Where("id = ? AND space_id = ?", questionID, spaceID).
			Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrCoupleQuestionNotFound
		}
		if err := tx.Where("question_id = ?", questionID).Delete(&CoupleQuestionAnswerRecord{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND space_id = ?", questionID, spaceID).Delete(&CoupleQuestionRecord{}).Error
	})
}

func (r *CoupleQuestionRepository) attachAnswers(questions []CoupleQuestionRecord) ([]CoupleQuestionWithAnswers, error) {
	result := make([]CoupleQuestionWithAnswers, len(questions))
	if len(questions) == 0 {
		return result, nil
	}
	ids := make([]string, len(questions))
	byID := make(map[string]int, len(questions))
	for index, question := range questions {
		ids[index] = question.ID
		byID[question.ID] = index
		result[index] = CoupleQuestionWithAnswers{Question: question, Answers: []CoupleQuestionAnswerRecord{}}
	}
	var answers []CoupleQuestionAnswerRecord
	if err := r.db.Where("question_id IN ?", ids).Order("answered_at ASC, id ASC").Find(&answers).Error; err != nil {
		return nil, err
	}
	for _, answer := range answers {
		if index, ok := byID[answer.QuestionID]; ok {
			result[index].Answers = append(result[index].Answers, answer)
		}
	}
	return result, nil
}

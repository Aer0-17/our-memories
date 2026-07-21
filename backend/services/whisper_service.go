package services

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"our-memories-backend/events"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

const (
	maxWhisperTitleLength   = 120
	maxWhisperContentLength = 2000
	maxWhisperVoiceURLBytes = 4096
)

var ErrInvalidWhisperTitle = errors.New("invalid whisper title")
var ErrWhisperContentTooLong = errors.New("whisper content too long")
var ErrWhisperVoiceURLTooLong = errors.New("whisper voice URL too long")

type CreateWhisperRequest struct {
	Title    string `json:"title" binding:"required"`
	Content  string `json:"content"`
	VoiceURL string `json:"voiceUrl"`
}

type ReplyWhisperRequest struct {
	Content  string `json:"content"`
	VoiceURL string `json:"voiceUrl"`
}

type WhisperService struct {
	repo      *repositories.WhisperRepository
	publisher events.Publisher
}

func NewWhisperService(repo *repositories.WhisperRepository, publisher ...events.Publisher) *WhisperService {
	var eventPublisher events.Publisher
	if len(publisher) > 0 {
		eventPublisher = publisher[0]
	}
	return &WhisperService{
		repo:      repo,
		publisher: events.PublisherOrNoop(eventPublisher),
	}
}

func (s *WhisperService) List(spaceID string, userID string) ([]models.Whisper, error) {
	whispers, err := s.repo.List(spaceID)
	if err != nil {
		return nil, err
	}
	for i := range whispers {
		whispers[i].CreatorIsMine = whispers[i].CreatedByID == userID
		for messageIndex := range whispers[i].Messages {
			whispers[i].Messages[messageIndex].IsMine = whispers[i].Messages[messageIndex].UserID == userID
		}
	}
	return whispers, nil
}

func (s *WhisperService) Create(spaceID string, userID string, req CreateWhisperRequest) (string, error) {
	title := strings.TrimSpace(req.Title)
	content := strings.TrimSpace(req.Content)
	voiceURL := strings.TrimSpace(req.VoiceURL)
	if title == "" || utf8.RuneCountInString(title) > maxWhisperTitleLength {
		return "", ErrInvalidWhisperTitle
	}
	if utf8.RuneCountInString(content) > maxWhisperContentLength {
		return "", ErrWhisperContentTooLong
	}
	if len(voiceURL) > maxWhisperVoiceURLBytes {
		return "", ErrWhisperVoiceURLTooLong
	}

	whisperID := utils.NewID()
	var firstReply *repositories.WhisperReplyRecord
	if content != "" || voiceURL != "" {
		firstReply = &repositories.WhisperReplyRecord{
			ID:        utils.NewID(),
			WhisperID: whisperID,
			UserID:    userID,
			Content:   content,
			VoiceURL:  voiceURL,
		}
	}

	if err := s.repo.Create(repositories.WhisperRecord{
		ID:          whisperID,
		SpaceID:     spaceID,
		Title:       title,
		CreatedByID: userID,
	}, firstReply); err != nil {
		return "", err
	}
	s.publish(events.WhisperCreated, spaceID, userID, whisperID)
	return whisperID, nil
}

func (s *WhisperService) Reply(spaceID string, userID string, whisperID string, req ReplyWhisperRequest) (string, error) {
	content := strings.TrimSpace(req.Content)
	voiceURL := strings.TrimSpace(req.VoiceURL)
	if content == "" && voiceURL == "" {
		return "", ErrInvalidContent
	}
	if utf8.RuneCountInString(content) > maxWhisperContentLength {
		return "", ErrWhisperContentTooLong
	}
	if len(voiceURL) > maxWhisperVoiceURLBytes {
		return "", ErrWhisperVoiceURLTooLong
	}
	replyID := utils.NewID()
	err := s.repo.AddReply(spaceID, repositories.WhisperReplyRecord{
		ID:        replyID,
		WhisperID: whisperID,
		UserID:    userID,
		Content:   content,
		VoiceURL:  voiceURL,
	})
	if err == nil {
		s.publish(events.WhisperReplied, spaceID, userID, whisperID)
	}
	return replyID, err
}

func (s *WhisperService) Delete(spaceID string, userID string, whisperID string) error {
	createdByID, err := s.repo.CreatedByID(whisperID, spaceID)
	if err != nil {
		return err
	}
	if createdByID != userID {
		return ErrForbidden
	}
	if err := s.repo.Delete(whisperID, spaceID); err != nil {
		return err
	}
	s.publish(events.WhisperDeleted, spaceID, userID, whisperID)
	return nil
}

func (s *WhisperService) publish(eventType events.Type, spaceID string, actorID string, targetID string) {
	_ = s.publisher.Publish(context.Background(), events.DomainEvent{
		Type:     eventType,
		SpaceID:  spaceID,
		ActorID:  actorID,
		TargetID: targetID,
	})
}

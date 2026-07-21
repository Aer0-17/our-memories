package services

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"our-memories-backend/cache"
	"our-memories-backend/events"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

const (
	maxTimeCapsuleTitleLength   = 120
	maxTimeCapsuleContentLength = 10000
	maxTimeCapsuleVoiceURLBytes = 4096
	maxTimeCapsulePhotos        = 6
)

var (
	ErrTimeCapsuleLimit           = errors.New("time capsule unopened limit reached")
	ErrTimeCapsuleLocked          = errors.New("time capsule locked")
	ErrTimeCapsuleImmutable       = errors.New("time capsule can no longer be modified")
	ErrInvalidTimeCapsuleTitle    = errors.New("invalid time capsule title")
	ErrInvalidTimeCapsuleContent  = errors.New("invalid time capsule content")
	ErrInvalidTimeCapsuleOpenDate = errors.New("invalid time capsule open date")
	ErrTimeCapsuleVoiceURLTooLong = errors.New("time capsule voice URL too long")
	ErrTooManyTimeCapsulePhotos   = errors.New("too many time capsule photos")
)

type CreateTimeCapsuleRequest struct {
	Title    string       `json:"title" binding:"required"`
	OpenDate string       `json:"openDate" binding:"required"`
	Content  string       `json:"content" binding:"required"`
	VoiceURL string       `json:"voiceUrl"`
	OpenMode string       `json:"openMode"`
	Photos   []PhotoInput `json:"photos"`
}

type UpdateTimeCapsuleRequest struct {
	Title    string        `json:"title"`
	OpenDate string        `json:"openDate"`
	Content  string        `json:"content"`
	VoiceURL string        `json:"voiceUrl"`
	OpenMode string        `json:"openMode"`
	Photos   *[]PhotoInput `json:"photos"`
}

type TimeCapsuleService struct {
	repo      *repositories.TimeCapsuleRepository
	upload    PhotoUploader
	delete    PhotoDeleter
	publisher events.Publisher
}

func NewTimeCapsuleService(
	repo *repositories.TimeCapsuleRepository,
	upload PhotoUploader,
	delete PhotoDeleter,
	publisher ...events.Publisher,
) *TimeCapsuleService {
	var eventPublisher events.Publisher
	if len(publisher) > 0 {
		eventPublisher = publisher[0]
	}
	return &TimeCapsuleService{
		repo:      repo,
		upload:    upload,
		delete:    delete,
		publisher: events.PublisherOrNoop(eventPublisher),
	}
}

func (s *TimeCapsuleService) List(spaceID string, userID string) ([]models.TimeCapsule, error) {
	capsules, err := s.repo.List(spaceID)
	if err != nil {
		return nil, err
	}

	visiblePhotoCapsuleIDs := []string{}
	for i := range capsules {
		unlocked := CanOpenTimeCapsule(capsules[i].OpenDate)
		isCreator := capsules[i].CreatedByID == userID
		if (!unlocked && !isCreator) || (unlocked && !capsules[i].IsOpened) {
			capsules[i].Content = ""
			capsules[i].VoiceURL = ""
			capsules[i].Photos = []models.Photo{}
			continue
		}
		visiblePhotoCapsuleIDs = append(visiblePhotoCapsuleIDs, capsules[i].ID)
	}

	photosByCapsuleID, err := s.repo.PhotosByCapsuleIDs(visiblePhotoCapsuleIDs)
	if err != nil {
		return nil, err
	}
	for i := range capsules {
		if photos, ok := photosByCapsuleID[capsules[i].ID]; ok {
			capsules[i].Photos = photos
		}
	}
	return capsules, nil
}

func (s *TimeCapsuleService) Create(spaceID string, userID string, req CreateTimeCapsuleRequest) (string, error) {
	normalized, err := normalizeTimeCapsuleInput(
		req.Title,
		req.OpenDate,
		req.Content,
		req.VoiceURL,
		req.OpenMode,
		req.Photos,
	)
	if err != nil {
		return "", err
	}

	count, err := s.repo.UnopenedCount(spaceID)
	if err != nil {
		return "", err
	}
	if count >= 3 {
		return "", ErrTimeCapsuleLimit
	}
	if err := s.upload(spaceID, "time-capsules", normalized.Photos); err != nil {
		return "", err
	}

	capsuleID := utils.NewID()
	if err := s.repo.Create(repositories.TimeCapsuleRecord{
		ID:          capsuleID,
		SpaceID:     spaceID,
		Title:       normalized.Title,
		OpenDate:    normalized.OpenDate,
		Content:     normalized.Content,
		VoiceURL:    normalized.VoiceURL,
		OpenMode:    normalized.OpenMode,
		CreatedByID: userID,
	}, timeCapsulePhotoRecords(capsuleID, normalized.Photos)); err != nil {
		return "", err
	}

	s.publish(events.TimeCapsuleCreated, spaceID, userID, capsuleID)
	cache.ClearTimeCapsuleSpace(spaceID)
	return capsuleID, nil
}

func (s *TimeCapsuleService) Update(spaceID string, userID string, capsuleID string, req UpdateTimeCapsuleRequest) error {
	capsule, err := s.repo.ByID(capsuleID, spaceID)
	if err != nil {
		return err
	}
	if capsule.CreatedByID != userID {
		return ErrForbidden
	}
	if capsule.IsOpened || !isFutureTimeCapsuleDate(capsule.OpenDate, time.Now()) {
		return ErrTimeCapsuleImmutable
	}

	photosForValidation := []PhotoInput{}
	if req.Photos != nil {
		photosForValidation = *req.Photos
	}
	normalized, err := normalizeTimeCapsuleInput(
		req.Title,
		req.OpenDate,
		req.Content,
		req.VoiceURL,
		req.OpenMode,
		photosForValidation,
	)
	if err != nil {
		return err
	}

	var oldPhotos []StoredPhoto
	replacePhotos := req.Photos != nil
	if replacePhotos {
		oldPhotos, err = s.collectPhotos(capsuleID)
		if err != nil {
			return err
		}
		if err := s.upload(spaceID, "time-capsules", normalized.Photos); err != nil {
			return err
		}
	}

	photos := []repositories.TimeCapsulePhotoRecord{}
	if replacePhotos {
		photos = timeCapsulePhotoRecords(capsuleID, normalized.Photos)
	}
	if err := s.repo.Update(capsuleID, spaceID, map[string]any{
		"title":     normalized.Title,
		"open_date": normalized.OpenDate,
		"content":   normalized.Content,
		"voice_url": normalized.VoiceURL,
		"open_mode": normalized.OpenMode,
	}, photos, replacePhotos); err != nil {
		return err
	}

	if replacePhotos {
		if err := s.deleteRemovedPhotos(spaceID, oldPhotos, normalized.Photos); err != nil {
			cache.ClearTimeCapsuleSpace(spaceID)
			return err
		}
	}

	s.publish(events.TimeCapsuleUpdated, spaceID, userID, capsuleID)
	cache.ClearTimeCapsuleSpace(spaceID)
	return nil
}

type normalizedTimeCapsuleInput struct {
	Title    string
	OpenDate string
	Content  string
	VoiceURL string
	OpenMode string
	Photos   []PhotoInput
}

func normalizeTimeCapsuleInput(
	title string,
	openDate string,
	content string,
	voiceURL string,
	openMode string,
	photos []PhotoInput,
) (normalizedTimeCapsuleInput, error) {
	normalized := normalizedTimeCapsuleInput{
		Title:    strings.TrimSpace(title),
		OpenDate: strings.TrimSpace(openDate),
		Content:  strings.TrimSpace(content),
		VoiceURL: strings.TrimSpace(voiceURL),
		OpenMode: normalizeTimeCapsuleOpenMode(openMode),
		Photos:   photos,
	}

	if normalized.Title == "" || utf8.RuneCountInString(normalized.Title) > maxTimeCapsuleTitleLength {
		return normalizedTimeCapsuleInput{}, ErrInvalidTimeCapsuleTitle
	}
	if normalized.Content == "" || utf8.RuneCountInString(normalized.Content) > maxTimeCapsuleContentLength {
		return normalizedTimeCapsuleInput{}, ErrInvalidTimeCapsuleContent
	}
	if !isFutureTimeCapsuleDate(normalized.OpenDate, time.Now()) {
		return normalizedTimeCapsuleInput{}, ErrInvalidTimeCapsuleOpenDate
	}
	if len(normalized.VoiceURL) > maxTimeCapsuleVoiceURLBytes {
		return normalizedTimeCapsuleInput{}, ErrTimeCapsuleVoiceURLTooLong
	}
	if len(normalized.Photos) > maxTimeCapsulePhotos {
		return normalizedTimeCapsuleInput{}, ErrTooManyTimeCapsulePhotos
	}

	return normalized, nil
}

func isFutureTimeCapsuleDate(openDate string, now time.Time) bool {
	date, err := time.Parse("2006-01-02", openDate)
	if err != nil {
		return false
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	openDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, now.Location())
	return openDay.After(today)
}

func (s *TimeCapsuleService) Open(spaceID string, userID string, capsuleID string) error {
	openDate, err := s.repo.OpenDate(capsuleID, spaceID)
	if err != nil {
		return err
	}
	if !CanOpenTimeCapsule(openDate) {
		return ErrTimeCapsuleLocked
	}
	capsule, err := s.repo.MarkOpened(capsuleID, spaceID, userID)
	if err != nil {
		return err
	}

	if capsule.IsOpened {
		s.publish(events.TimeCapsuleOpened, spaceID, userID, capsuleID)
	} else {
		s.publish(events.TimeCapsuleUpdated, spaceID, userID, capsuleID)
	}
	cache.ClearTimeCapsuleSpace(spaceID)
	return nil
}

func (s *TimeCapsuleService) Delete(spaceID string, userID string, capsuleID string) error {
	capsule, err := s.repo.ByID(capsuleID, spaceID)
	if err != nil {
		return err
	}
	if capsule.CreatedByID != userID {
		return ErrForbidden
	}
	if capsule.IsOpened || !isFutureTimeCapsuleDate(capsule.OpenDate, time.Now()) {
		return ErrTimeCapsuleImmutable
	}

	photos, err := s.collectPhotos(capsuleID)
	if err != nil {
		return err
	}
	if err := s.delete(spaceID, photos); err != nil {
		return err
	}
	if err := s.repo.Delete(capsuleID, spaceID); err != nil {
		return err
	}

	s.publish(events.TimeCapsuleDeleted, spaceID, userID, capsuleID)
	cache.ClearTimeCapsuleSpace(spaceID)
	return nil
}

func (s *TimeCapsuleService) publish(eventType events.Type, spaceID string, actorID string, targetID string) {
	_ = s.publisher.Publish(context.Background(), events.DomainEvent{
		Type:     eventType,
		SpaceID:  spaceID,
		ActorID:  actorID,
		TargetID: targetID,
	})
}

func (s *TimeCapsuleService) collectPhotos(capsuleID string) ([]StoredPhoto, error) {
	photos, err := s.repo.PhotosForCapsule(capsuleID)
	if err != nil {
		return nil, err
	}
	result := make([]StoredPhoto, 0, len(photos))
	for _, photo := range photos {
		result = append(result, StoredPhoto{Key: photo.Key, URL: photo.URL})
	}
	return result, nil
}

func (s *TimeCapsuleService) deleteRemovedPhotos(spaceID string, oldPhotos []StoredPhoto, newPhotos []PhotoInput) error {
	keep := map[string]bool{}
	for _, photo := range newPhotos {
		if photo.Key != "" {
			keep[photo.Key] = true
		}
		if photo.URL != "" {
			keep[photo.URL] = true
		}
	}

	removed := []StoredPhoto{}
	for _, photo := range oldPhotos {
		if (photo.Key == "" || !keep[photo.Key]) && (photo.URL == "" || !keep[photo.URL]) {
			removed = append(removed, photo)
		}
	}
	if len(removed) == 0 {
		return nil
	}
	return s.delete(spaceID, removed)
}

func CanOpenTimeCapsule(openDate string) bool {
	return canOpenTimeCapsuleAt(openDate, time.Now())
}

func canOpenTimeCapsuleAt(openDate string, now time.Time) bool {
	t, err := time.Parse("2006-01-02", openDate)
	if err != nil {
		t, err = time.Parse(time.RFC3339, openDate)
		if err != nil {
			return false
		}
		now = now.UTC()
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	openDay := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, today.Location())
	return !today.Before(openDay)
}

func normalizeTimeCapsuleOpenMode(value string) string {
	if value == "together" {
		return "together"
	}
	return "single"
}

func timeCapsulePhotoRecords(capsuleID string, photos []PhotoInput) []repositories.TimeCapsulePhotoRecord {
	records := make([]repositories.TimeCapsulePhotoRecord, 0, len(photos))
	for i, photo := range photos {
		records = append(records, repositories.TimeCapsulePhotoRecord{
			ID:            utils.NewID(),
			TimeCapsuleID: capsuleID,
			Key:           photo.Key,
			URL:           photo.URL,
			MimeType:      photo.MimeType,
			SortOrder:     i,
		})
	}
	return records
}

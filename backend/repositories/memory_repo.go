package repositories

import (
	"database/sql"
	"encoding/json"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"our-memories-backend/models"
)

var ErrMemoryNotFound = sql.ErrNoRows
var ErrMemoryCoverPhotoNotFound = errors.New("cover photo not found")

type MemoryRecord struct {
	ID                  string `gorm:"column:id;primaryKey"`
	SpaceID             string `gorm:"column:space_id"`
	CityID              string `gorm:"column:city_id"`
	City                string `gorm:"column:city"`
	CityEn              string `gorm:"column:city_en"`
	Title               string `gorm:"column:title"`
	Date                string `gorm:"column:date"`
	Text                string `gorm:"column:text"`
	Mood                string `gorm:"column:mood"`
	Tags                string `gorm:"column:tags"`
	Visibility          string `gorm:"column:visibility"`
	PartnerNote         string `gorm:"column:partner_note"`
	PartnerNoteAuthorID string `gorm:"column:partner_note_author_id"`
	PlaceName           string `gorm:"column:place_name"`
	CoverPhotoID        string `gorm:"column:cover_photo_id"`
	CreatedByID         string `gorm:"column:created_by_id"`
	CreatedAt           string `gorm:"column:created_at"`
	UpdatedAt           string `gorm:"column:updated_at"`
}

func (MemoryRecord) TableName() string {
	return "memories"
}

type MemoryPhotoRecord struct {
	ID        string `gorm:"column:id;primaryKey"`
	MemoryID  string `gorm:"column:memory_id"`
	Key       string `gorm:"column:key"`
	URL       string `gorm:"column:url"`
	MimeType  string `gorm:"column:mime_type"`
	Width     int    `gorm:"column:width"`
	Height    int    `gorm:"column:height"`
	SortOrder int    `gorm:"column:sort_order"`
	CreatedAt string `gorm:"column:created_at"`
}

func (MemoryPhotoRecord) TableName() string {
	return "memory_photos"
}

type MemoryRepository struct {
	db *gorm.DB
}

func NewMemoryRepository(db *gorm.DB) *MemoryRepository {
	return &MemoryRepository{db: db}
}

func (r *MemoryRepository) CreatedByID(memoryID string, spaceID string) (string, error) {
	var record MemoryRecord
	err := r.db.
		Select("created_by_id").
		Where("id = ? AND space_id = ?", memoryID, spaceID).
		First(&record).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrMemoryNotFound
	}
	return record.CreatedByID, err
}

func (r *MemoryRepository) ListVisible(spaceID string, userID string, cityID string) ([]models.Memory, error) {
	var records []MemoryRecord
	query := r.db.
		Where("space_id = ? AND (visibility = ? OR created_by_id = ?)", spaceID, "both", userID)
	if cityID != "" {
		query = query.Where("city_id = ?", cityID)
	}
	if err := query.Order("date DESC, created_at DESC").Find(&records).Error; err != nil {
		return nil, err
	}

	memories := make([]models.Memory, 0, len(records))
	for _, record := range records {
		memory := memoryModel(record)
		if err := json.Unmarshal([]byte(record.Tags), &memory.Tags); err != nil || memory.Tags == nil {
			memory.Tags = []string{}
		}
		memories = append(memories, memory)
	}
	return memories, nil
}

func (r *MemoryRepository) Create(memory MemoryRecord, photos []MemoryPhotoRecord) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("created_at", "updated_at").Create(&memory).Error; err != nil {
			return err
		}
		if len(photos) == 0 {
			return nil
		}
		return tx.Omit("created_at").Create(&photos).Error
	})
}

func (r *MemoryRepository) UpdatePartnerNote(memoryID string, spaceID string, partnerNote string, authorID string) error {
	return r.updateFields(memoryID, spaceID, map[string]any{
		"partner_note":           partnerNote,
		"partner_note_author_id": authorID,
	})
}

func (r *MemoryRepository) UpdateCore(memoryID string, spaceID string, patch map[string]any) error {
	return r.updateFields(memoryID, spaceID, patch)
}

func (r *MemoryRepository) ReplacePhotos(
	memoryID string,
	spaceID string,
	photos []MemoryPhotoRecord,
	coverImage string,
	fallbackCoverImage string,
	keyFromURL func(string) string,
) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("memory_id = ?", memoryID).Delete(&MemoryPhotoRecord{}).Error; err != nil {
			return err
		}
		if len(photos) > 0 {
			if err := tx.Omit("created_at").Create(&photos).Error; err != nil {
				return err
			}
		}

		nextCoverImage := coverImage
		if nextCoverImage == "" {
			nextCoverImage = fallbackCoverImage
		}
		if err := setMemoryCoverPhoto(tx, memoryID, nextCoverImage, keyFromURL); err != nil {
			if errors.Is(err, ErrMemoryCoverPhotoNotFound) && coverImage == "" {
				return setMemoryCoverPhoto(tx, memoryID, "", keyFromURL)
			}
			return err
		}

		return updateMemoryTimestamp(tx, memoryID, spaceID)
	})
}

func (r *MemoryRepository) SetCoverPhoto(spaceID string, memoryID string, coverImage string, keyFromURL func(string) string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := setMemoryCoverPhoto(tx, memoryID, coverImage, keyFromURL); err != nil {
			return err
		}
		return updateMemoryTimestamp(tx, memoryID, spaceID)
	})
}

func (r *MemoryRepository) Delete(memoryID string, spaceID string) error {
	result := r.db.Where("id = ? AND space_id = ?", memoryID, spaceID).Delete(&MemoryRecord{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func (r *MemoryRepository) PhotosForMemory(memoryID string) ([]models.Photo, error) {
	var records []MemoryPhotoRecord
	if err := r.db.
		Where("memory_id = ?", memoryID).
		Order("sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	photos := make([]models.Photo, 0, len(records))
	for _, record := range records {
		photos = append(photos, models.Photo{
			ID:        record.ID,
			MemoryID:  record.MemoryID,
			Key:       record.Key,
			URL:       record.URL,
			MimeType:  record.MimeType,
			Width:     record.Width,
			Height:    record.Height,
			SortOrder: record.SortOrder,
			CreatedAt: record.CreatedAt,
		})
	}
	return photos, nil
}

func (r *MemoryRepository) PhotosByMemoryIDs(memoryIDs []string) (map[string][]models.Photo, error) {
	photosByMemoryID := emptyPhotoMap(memoryIDs)
	if len(memoryIDs) == 0 {
		return photosByMemoryID, nil
	}

	var records []MemoryPhotoRecord
	if err := r.db.
		Where("memory_id IN ?", memoryIDs).
		Order("memory_id, sort_order").
		Find(&records).
		Error; err != nil {
		return nil, err
	}

	for _, record := range records {
		photosByMemoryID[record.MemoryID] = append(photosByMemoryID[record.MemoryID], memoryPhotoModel(record))
	}
	return photosByMemoryID, nil
}

func (r *MemoryRepository) CurrentCoverImage(memoryID string) (string, error) {
	var photo MemoryPhotoRecord
	err := r.db.
		Table("memory_photos AS p").
		Select("p.*").
		Joins("JOIN memories m ON m.cover_photo_id = p.id").
		Where("m.id = ? AND p.memory_id = ?", memoryID, memoryID).
		First(&photo).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return photo.URL, nil
}

func (r *MemoryRepository) updateFields(memoryID string, spaceID string, fields map[string]any) error {
	fields["updated_at"] = gorm.Expr("CURRENT_TIMESTAMP")
	result := r.db.Model(&MemoryRecord{}).
		Where("id = ? AND space_id = ?", memoryID, spaceID).
		Updates(fields)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func setMemoryCoverPhoto(tx *gorm.DB, memoryID string, coverImage string, keyFromURL func(string) string) error {
	if coverImage == "" {
		return tx.Model(&MemoryRecord{}).
			Where("id = ?", memoryID).
			Updates(map[string]any{"cover_photo_id": nil, "updated_at": gorm.Expr("CURRENT_TIMESTAMP")}).
			Error
	}

	photoID, err := findMemoryPhotoID(tx, memoryID, coverImage, keyFromURL)
	if err != nil {
		return err
	}

	return tx.Model(&MemoryRecord{}).
		Where("id = ?", memoryID).
		Updates(map[string]any{"cover_photo_id": photoID, "updated_at": gorm.Expr("CURRENT_TIMESTAMP")}).
		Error
}

func findMemoryPhotoID(tx *gorm.DB, memoryID string, coverImage string, keyFromURL func(string) string) (string, error) {
	var photo MemoryPhotoRecord
	key := keyFromURL(coverImage)
	query := tx.Select("id").Where("memory_id = ?", memoryID).Limit(1)
	if key != "" {
		query = query.
			Where("(url = ? OR key = ?)", coverImage, key).
			Order(clause.Expr{SQL: "CASE WHEN url = ? THEN 0 ELSE 1 END", Vars: []interface{}{coverImage}})
	} else {
		query = query.Where("url = ?", coverImage)
	}

	err := query.First(&photo).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrMemoryCoverPhotoNotFound
	}
	if err != nil {
		return "", err
	}
	return photo.ID, nil
}

func updateMemoryTimestamp(tx *gorm.DB, memoryID string, spaceID string) error {
	result := tx.Model(&MemoryRecord{}).
		Where("id = ? AND space_id = ?", memoryID, spaceID).
		Update("updated_at", gorm.Expr("CURRENT_TIMESTAMP"))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMemoryNotFound
	}
	return nil
}

func memoryModel(record MemoryRecord) models.Memory {
	return models.Memory{
		ID:                  record.ID,
		SpaceID:             record.SpaceID,
		CityID:              record.CityID,
		City:                record.City,
		CityEn:              record.CityEn,
		Title:               record.Title,
		Date:                record.Date,
		Text:                record.Text,
		Mood:                record.Mood,
		Visibility:          record.Visibility,
		PartnerNote:         record.PartnerNote,
		PartnerNoteAuthorID: record.PartnerNoteAuthorID,
		PlaceName:           record.PlaceName,
		CoverPhotoID:        record.CoverPhotoID,
		CreatedByID:         record.CreatedByID,
		CreatedAt:           record.CreatedAt,
		UpdatedAt:           record.UpdatedAt,
	}
}

func memoryPhotoModel(record MemoryPhotoRecord) models.Photo {
	return models.Photo{
		ID:        record.ID,
		MemoryID:  record.MemoryID,
		Key:       record.Key,
		URL:       record.URL,
		MimeType:  record.MimeType,
		Width:     record.Width,
		Height:    record.Height,
		SortOrder: record.SortOrder,
		CreatedAt: record.CreatedAt,
	}
}

func emptyPhotoMap(parentIDs []string) map[string][]models.Photo {
	photosByParentID := make(map[string][]models.Photo, len(parentIDs))
	for _, parentID := range parentIDs {
		photosByParentID[parentID] = []models.Photo{}
	}
	return photosByParentID
}

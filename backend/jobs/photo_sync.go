package jobs

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"our-memories-backend/cache"
	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/storage"
)

type photoTable struct {
	name      string
	folder    string
	idColumn  string
	joinTable string
	joinOn    string
}

var photoTables = []photoTable{
	{
		name:      "memory_photos",
		folder:    "memories",
		idColumn:  "id",
		joinTable: "memories",
		joinOn:    "memory_photos.memory_id = memories.id",
	},
	{
		name:      "anniversary_photos",
		folder:    "anniversaries",
		idColumn:  "id",
		joinTable: "anniversary_cards",
		joinOn:    "anniversary_photos.anniversary_card_id = anniversary_cards.id",
	},
	{
		name:      "time_capsule_photos",
		folder:    "time-capsules",
		idColumn:  "id",
		joinTable: "time_capsules",
		joinOn:    "time_capsule_photos.time_capsule_id = time_capsules.id",
	},
}

// StartPhotoSync runs one image sync shortly after startup, then repeats on PHOTO_SYNC_INTERVAL.
func StartPhotoSync() {
	interval, err := time.ParseDuration(config.Get().PhotoSyncInterval)
	if err != nil || interval <= 0 {
		log.Printf("photo sync disabled: invalid PHOTO_SYNC_INTERVAL=%q", config.Get().PhotoSyncInterval)
		return
	}

	log.Printf("photo sync scheduled: interval=%s local_dir=%s", interval, config.Get().LocalImageDir)
	go func() {
		time.Sleep(3 * time.Second)
		runAndLogPhotoSync()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			runAndLogPhotoSync()
		}
	}()
}

func runAndLogPhotoSync() {
	start := time.Now()
	log.Printf("photo sync started")
	updated, err := RunPhotoSyncOnce()
	if err != nil {
		log.Printf("photo sync finished with errors: updated=%d duration=%s err=%v", updated, time.Since(start).Round(time.Millisecond), err)
		return
	}
	log.Printf("photo sync finished: updated=%d duration=%s", updated, time.Since(start).Round(time.Millisecond))
}

// RunPhotoSyncOnce uploads inline/local fallback images and updates database URLs.
func RunPhotoSyncOnce() (int, error) {
	return runPhotoSyncOnce(storage.Default())
}

func runPhotoSyncOnce(objectStorage storage.ObjectStorage) (int, error) {
	totalUpdated := 0
	errs := []error{}

	for _, table := range photoTables {
		updated, err := syncPhotoTable(table, objectStorage)
		totalUpdated += updated
		if err != nil {
			errs = append(errs, err)
		}
	}

	if totalUpdated > 0 {
		cache.Clear()
	}

	return totalUpdated, errors.Join(errs...)
}

func syncPhotoTable(table photoTable, objectStorage storage.ObjectStorage) (int, error) {
	repo := repositories.NewPhotoSyncRepository(db.Gorm)
	pending, err := repo.PendingRows(photoSyncTable(table))
	if err != nil {
		return 0, err
	}

	updated := 0
	errs := []error{}
	for _, row := range pending {
		rowUpdated, err := syncPhotoRow(repo, table, row, objectStorage)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if rowUpdated {
			updated++
		}
	}
	return updated, errors.Join(errs...)
}

func syncPhotoRow(
	repo *repositories.PhotoSyncRepository,
	table photoTable,
	row repositories.PhotoSyncRow,
	objectStorage storage.ObjectStorage,
) (bool, error) {
	nextURL, nextKey, err := nextPhotoLocation(table, row, objectStorage)
	if err != nil {
		return false, err
	}
	if nextURL == "" || nextURL == row.URL {
		return false, nil
	}

	affected, err := repo.UpdatePhotoLocation(photoSyncTable(table), row, nextURL, nextKey)
	if err != nil {
		cleanupNewObject(objectStorage, nextURL, nextKey)
		return false, fmt.Errorf("%s %s update failed: %w", table.name, row.ID, err)
	}
	if affected != 1 {
		cleanupNewObject(objectStorage, nextURL, nextKey)
		return false, fmt.Errorf("%s %s update affected %d rows", table.name, row.ID, affected)
	}

	if localKey := objectStorage.LocalKeyFromURL(row.URL); localKey != "" && objectStorage.KeyFromURL(nextURL) != "" {
		if err := objectStorage.DeleteLocalObject(localKey); err != nil {
			return true, fmt.Errorf("%s %s local cleanup failed: %w", table.name, row.ID, err)
		}
	}
	return true, nil
}

func nextPhotoLocation(
	table photoTable,
	row repositories.PhotoSyncRow,
	objectStorage storage.ObjectStorage,
) (string, string, error) {
	if strings.HasPrefix(row.URL, "data:image/") {
		nextURL, nextKey, err := objectStorage.UploadImageWithKey(row.SpaceID, table.folder, row.URL)
		if err != nil {
			return "", "", fmt.Errorf("%s %s inline upload failed: %w", table.name, row.ID, err)
		}
		return nextURL, nextKey, nil
	}

	localKey := objectStorage.LocalKeyFromURL(row.URL)
	if localKey == "" {
		return "", "", nil
	}
	if !objectStorage.Enabled() {
		return "", "", nil
	}
	nextURL, err := objectStorage.UploadLocalObjectToS3(localKey)
	if err != nil {
		return "", "", fmt.Errorf("%s %s local upload failed: %w", table.name, row.ID, err)
	}
	return nextURL, localKey, nil
}

func photoSyncTable(table photoTable) repositories.PhotoSyncTable {
	return repositories.PhotoSyncTable{
		Name:      table.name,
		IDColumn:  table.idColumn,
		JoinTable: table.joinTable,
		JoinOn:    table.joinOn,
	}
}

func cleanupNewObject(objectStorage storage.ObjectStorage, url, key string) {
	if key == "" {
		return
	}
	if objectStorage.LocalKeyFromURL(url) != "" {
		_ = objectStorage.DeleteLocalObject(key)
		return
	}
	if objectStorage.KeyFromURL(url) != "" {
		_ = objectStorage.DeleteObject(key)
	}
}

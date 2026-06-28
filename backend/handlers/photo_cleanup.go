package handlers

import (
	"errors"
	"fmt"
	"log"

	"our-memories-backend/storage"
)

type storedPhoto struct {
	key string
	url string
}

func storedPhotoKey(photo storedPhoto) string {
	if photo.key != "" {
		return photo.key
	}
	return storage.Default().KeyFromURL(photo.url)
}

// deletePhotos 同步批量清理 OSS 对象；删除失败会返回错误，避免父记录删除后留下孤儿对象。
func deletePhotos(spaceID string, photos []storedPhoto) error {
	if len(photos) == 0 {
		return nil
	}

	seen := map[string]bool{}
	errs := []error{}
	objectStorage := storage.Default()
	for _, p := range photos {
		key := storedPhotoKey(p)
		if key == "" {
			continue
		}
		if !objectStorage.KeyBelongsToSpace(key, spaceID) {
			log.Printf("skip deleting object outside current space (space=%s key=%s)", spaceID, key)
			continue
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		if err := objectStorage.DeletePhotoObject(key, p.url); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", key, err))
		}
	}
	return errors.Join(errs...)
}

package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"log"

	"our-memories-backend/db"
	"our-memories-backend/storage"
)

type storedPhoto struct {
	key string
	url string
}

// collectPhotos 读取某父记录下的图片 key/url（query 必须 SELECT key, url ...）。
// 用于删除父记录前先抓取要清理的 OSS 对象（外键级联会先删掉照片行）。
func collectPhotos(query string, args ...interface{}) []storedPhoto {
	rows, err := db.DB.Query(query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []storedPhoto
	for rows.Next() {
		var key, url sql.NullString
		if err := rows.Scan(&key, &url); err == nil {
			out = append(out, storedPhoto{key: key.String, url: url.String})
		}
	}
	return out
}

func storedPhotoKey(photo storedPhoto) string {
	if photo.key != "" {
		return photo.key
	}
	return storage.KeyFromURL(photo.url)
}

func photoInputKey(photo photoInput) string {
	if photo.Key != "" {
		return photo.Key
	}
	return storage.KeyFromURL(photo.URL)
}

// deletePhotos 同步批量清理 OSS 对象；删除失败会返回错误，避免父记录删除后留下孤儿对象。
func deletePhotos(spaceID string, photos []storedPhoto) error {
	if len(photos) == 0 {
		return nil
	}

	seen := map[string]bool{}
	errs := []error{}
	for _, p := range photos {
		key := storedPhotoKey(p)
		if key == "" {
			continue
		}
		if !storage.KeyBelongsToSpace(key, spaceID) {
			log.Printf("skip deleting object outside current space (space=%s key=%s)", spaceID, key)
			continue
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		if err := storage.DeletePhotoObject(key, p.url); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", key, err))
		}
	}
	return errors.Join(errs...)
}

// deleteRemovedPhotos 在编辑「删旧再插新」场景下，清理那些不在新集合里的旧对象。
func deleteRemovedPhotos(spaceID string, old []storedPhoto, kept []photoInput) error {
	keep := map[string]bool{}
	for _, p := range kept {
		k := photoInputKey(p)
		if k != "" {
			keep[k] = true
		}
	}
	removed := []storedPhoto{}
	for _, op := range old {
		k := storedPhotoKey(op)
		if k != "" && !keep[k] {
			removed = append(removed, op)
		}
	}
	return deletePhotos(spaceID, removed)
}

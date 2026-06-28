package storage

import (
	"sync"

	"our-memories-backend/config"
)

type ObjectStorage interface {
	Enabled() bool
	UploadImageWithKey(spaceID string, folder string, dataURL string) (string, string, error)
	UploadImage(spaceID string, folder string, dataURL string) (string, error)
	PresignPut(spaceID string, folder string, contentType string) (string, string, string, error)
	KeyFromURL(url string) string
	LocalKeyFromURL(url string) string
	PublicURLForKey(key string) string
	LocalPathForKey(key string) (string, bool)
	KeyBelongsToSpace(key string, spaceID string) bool
	DeleteObject(key string) error
	DeletePhotoObject(key string, url string) error
	DeleteObjectByURL(url string) error
	DeleteLocalObject(key string) error
	UploadLocalObjectToS3(key string) (string, error)
}

var (
	defaultMu      sync.RWMutex
	defaultStorage ObjectStorage
)

func InitS3() {
	SetDefault(NewS3Storage(config.Get()))
}

func Default() ObjectStorage {
	defaultMu.RLock()
	current := defaultStorage
	defaultMu.RUnlock()
	if current != nil {
		return current
	}

	defaultMu.Lock()
	defer defaultMu.Unlock()
	if defaultStorage == nil {
		defaultStorage = NewS3Storage(config.Get())
	}
	return defaultStorage
}

func SetDefault(next ObjectStorage) func() {
	defaultMu.Lock()
	previous := defaultStorage
	defaultStorage = next
	defaultMu.Unlock()

	return func() {
		defaultMu.Lock()
		defaultStorage = previous
		defaultMu.Unlock()
	}
}

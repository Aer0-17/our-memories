package handlers

import (
	"testing"

	"our-memories-backend/storage"
)

type avatarHistoryStorage struct {
	deleted []string
}

func (s *avatarHistoryStorage) Enabled() bool { return true }
func (s *avatarHistoryStorage) UploadImageWithKey(string, string, string) (string, string, error) {
	return "", "", nil
}
func (s *avatarHistoryStorage) UploadImage(string, string, string) (string, error) { return "", nil }
func (s *avatarHistoryStorage) PresignPut(string, string, string) (string, string, string, error) {
	return "", "", "", nil
}
func (s *avatarHistoryStorage) KeyFromURL(url string) string      { return url }
func (s *avatarHistoryStorage) LocalKeyFromURL(string) string     { return "" }
func (s *avatarHistoryStorage) PublicURLForKey(key string) string { return key }
func (s *avatarHistoryStorage) LocalPathForKey(string) (string, bool) {
	return "", false
}
func (s *avatarHistoryStorage) KeyBelongsToSpace(string, string) bool { return true }
func (s *avatarHistoryStorage) DeleteObject(key string) error {
	s.deleted = append(s.deleted, key)
	return nil
}
func (s *avatarHistoryStorage) DeletePhotoObject(key string, url string) error {
	if key == "" {
		key = url
	}
	s.deleted = append(s.deleted, key)
	return nil
}
func (s *avatarHistoryStorage) DeleteObjectByURL(url string) error {
	s.deleted = append(s.deleted, url)
	return nil
}
func (s *avatarHistoryStorage) DeleteLocalObject(string) error               { return nil }
func (s *avatarHistoryStorage) UploadLocalObjectToS3(string) (string, error) { return "", nil }

func TestAppendAvatarSpriteHistoryKeepsLatestFiveAndDeletesOlder(t *testing.T) {
	fakeStorage := &avatarHistoryStorage{}
	restore := storage.SetDefault(fakeStorage)
	defer restore()

	history := []avatarSpriteHistoryItem{
		{URL: "https://cdn.example.com/avatar-1.png", Key: "avatar-1"},
		{URL: "https://cdn.example.com/avatar-2.png", Key: "avatar-2"},
		{URL: "https://cdn.example.com/avatar-3.png", Key: "avatar-3"},
		{URL: "https://cdn.example.com/avatar-4.png", Key: "avatar-4"},
		{URL: "https://cdn.example.com/avatar-5.png", Key: "avatar-5"},
	}

	next := appendAvatarSpriteHistory(history, avatarSpriteHistoryItem{
		URL: "https://cdn.example.com/avatar-6.png",
		Key: "avatar-6",
	})

	if len(next) != maxAvatarSpriteHistory {
		t.Fatalf("expected %d history items, got %d", maxAvatarSpriteHistory, len(next))
	}
	if next[0].Key != "avatar-2" || next[4].Key != "avatar-6" {
		t.Fatalf("expected to keep avatar-2 through avatar-6, got %#v", next)
	}
	if len(fakeStorage.deleted) != 1 || fakeStorage.deleted[0] != "avatar-1" {
		t.Fatalf("expected avatar-1 to be deleted, got %#v", fakeStorage.deleted)
	}
}

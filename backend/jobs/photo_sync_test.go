package jobs

import (
	"fmt"
	"strings"
	"testing"

	"our-memories-backend/repositories"
	"our-memories-backend/storage"
)

type fakeObjectStorage struct {
	enabled        bool
	inlineUploads  []string
	localUploads   []string
	deletedObjects []string
	deletedLocal   []string
}

var _ storage.ObjectStorage = (*fakeObjectStorage)(nil)

func (f *fakeObjectStorage) Enabled() bool { return f.enabled }

func (f *fakeObjectStorage) UploadImageWithKey(spaceID string, folder string, dataURL string) (string, string, error) {
	f.inlineUploads = append(f.inlineUploads, fmt.Sprintf("%s/%s/%s", spaceID, folder, dataURL[:10]))
	key := spaceID + "/" + folder + "/inline.jpg"
	return "https://cdn.example.com/" + key, key, nil
}

func (f *fakeObjectStorage) UploadImage(spaceID string, folder string, dataURL string) (string, error) {
	url, _, err := f.UploadImageWithKey(spaceID, folder, dataURL)
	return url, err
}

func (f *fakeObjectStorage) PresignPut(string, string, string) (string, string, string, error) {
	return "", "", "", nil
}

func (f *fakeObjectStorage) KeyFromURL(rawURL string) string {
	return strings.TrimPrefix(rawURL, "https://cdn.example.com/")
}

func (f *fakeObjectStorage) LocalKeyFromURL(rawURL string) string {
	rawURL = strings.TrimPrefix(rawURL, "/local-images/")
	if rawURL == "" || strings.HasPrefix(rawURL, "http") {
		return ""
	}
	return rawURL
}

func (f *fakeObjectStorage) PublicURLForKey(key string) string {
	if key == "" {
		return ""
	}
	return "https://cdn.example.com/" + key
}

func (f *fakeObjectStorage) LocalPathForKey(string) (string, bool) { return "", false }

func (f *fakeObjectStorage) KeyBelongsToSpace(key string, spaceID string) bool {
	return strings.HasPrefix(key, spaceID+"/")
}

func (f *fakeObjectStorage) DeleteObject(key string) error {
	f.deletedObjects = append(f.deletedObjects, key)
	return nil
}

func (f *fakeObjectStorage) DeletePhotoObject(key string, _ string) error {
	return f.DeleteObject(key)
}

func (f *fakeObjectStorage) DeleteObjectByURL(rawURL string) error {
	return f.DeleteObject(f.KeyFromURL(rawURL))
}

func (f *fakeObjectStorage) DeleteLocalObject(key string) error {
	f.deletedLocal = append(f.deletedLocal, key)
	return nil
}

func (f *fakeObjectStorage) UploadLocalObjectToS3(key string) (string, error) {
	f.localUploads = append(f.localUploads, key)
	return "https://cdn.example.com/" + key, nil
}

func TestNextPhotoLocationUsesInjectedStorage(t *testing.T) {
	objectStorage := &fakeObjectStorage{enabled: true}
	table := photoTable{name: "memory_photos", folder: "memories"}

	inlineURL, inlineKey, err := nextPhotoLocation(table, repositories.PhotoSyncRow{
		ID: "photo-1", SpaceID: "space-1", URL: "data:image/jpeg;base64,AAAA",
	}, objectStorage)
	if err != nil {
		t.Fatal(err)
	}
	if inlineURL != "https://cdn.example.com/space-1/memories/inline.jpg" || inlineKey != "space-1/memories/inline.jpg" {
		t.Fatalf("unexpected inline upload location url=%q key=%q", inlineURL, inlineKey)
	}
	if len(objectStorage.inlineUploads) != 1 {
		t.Fatalf("expected injected storage to receive inline upload, got %#v", objectStorage.inlineUploads)
	}

	localURL, localKey, err := nextPhotoLocation(table, repositories.PhotoSyncRow{
		ID: "photo-2", SpaceID: "space-1", URL: "/local-images/space-1/memories/local.jpg",
	}, objectStorage)
	if err != nil {
		t.Fatal(err)
	}
	if localURL != "https://cdn.example.com/space-1/memories/local.jpg" || localKey != "space-1/memories/local.jpg" {
		t.Fatalf("unexpected local upload location url=%q key=%q", localURL, localKey)
	}
	if len(objectStorage.localUploads) != 1 || objectStorage.localUploads[0] != "space-1/memories/local.jpg" {
		t.Fatalf("expected injected storage to receive local upload, got %#v", objectStorage.localUploads)
	}

	disabledStorage := &fakeObjectStorage{}
	nextURL, nextKey, err := nextPhotoLocation(table, repositories.PhotoSyncRow{
		ID: "photo-3", SpaceID: "space-1", URL: "/local-images/space-1/memories/local.jpg",
	}, disabledStorage)
	if err != nil {
		t.Fatal(err)
	}
	if nextURL != "" || nextKey != "" || len(disabledStorage.localUploads) != 0 {
		t.Fatalf("expected disabled storage to skip local upload, url=%q key=%q uploads=%#v", nextURL, nextKey, disabledStorage.localUploads)
	}
}

func TestCleanupNewObjectUsesInjectedStorage(t *testing.T) {
	objectStorage := &fakeObjectStorage{}

	cleanupNewObject(objectStorage, "/local-images/space-1/memories/local.jpg", "space-1/memories/local.jpg")
	if len(objectStorage.deletedLocal) != 1 || objectStorage.deletedLocal[0] != "space-1/memories/local.jpg" {
		t.Fatalf("expected local cleanup through injected storage, got %#v", objectStorage.deletedLocal)
	}

	cleanupNewObject(objectStorage, "https://cdn.example.com/space-1/memories/cdn.jpg", "space-1/memories/cdn.jpg")
	if len(objectStorage.deletedObjects) != 1 || objectStorage.deletedObjects[0] != "space-1/memories/cdn.jpg" {
		t.Fatalf("expected object cleanup through injected storage, got %#v", objectStorage.deletedObjects)
	}
}

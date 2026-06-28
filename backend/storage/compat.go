package storage

import "fmt"

func Enabled() bool { return Default().Enabled() }

func PresignPut(spaceID, folder, contentType string) (key, uploadURL, publicURL string, err error) {
	return Default().PresignPut(spaceID, folder, contentType)
}

func KeyFromURL(url string) string {
	return Default().KeyFromURL(url)
}

func LocalPathForKey(key string) (string, bool) {
	return Default().LocalPathForKey(key)
}

func PublicURLForKey(key string) string {
	return Default().PublicURLForKey(key)
}

func DeleteObject(key string) error {
	return Default().DeleteObject(key)
}

func DeletePhotoObject(key, url string) error {
	return Default().DeletePhotoObject(key, url)
}

func DeleteObjectByURL(url string) error {
	return Default().DeleteObjectByURL(url)
}

func UploadImageWithKey(spaceID, folder, dataURL string) (string, string, error) {
	return Default().UploadImageWithKey(spaceID, folder, dataURL)
}

func UploadImage(spaceID, folder, dataURL string) (string, error) {
	return Default().UploadImage(spaceID, folder, dataURL)
}

func SaveLocalImage(key string, data []byte) error {
	defaultStorage, ok := Default().(*S3Storage)
	if !ok {
		return fmt.Errorf("default storage does not support local image save")
	}
	return defaultStorage.SaveLocalImage(key, data)
}

func UploadLocalObjectToS3(key string) (string, error) {
	return Default().UploadLocalObjectToS3(key)
}

func DeleteLocalObject(key string) error {
	return Default().DeleteLocalObject(key)
}

package handlers

import (
	"fmt"
	"strings"

	"our-memories-backend/storage"
)

type photoInput struct {
	Key      string `json:"key"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}

func uploadDataURL(spaceID, folder, value string) (string, error) {
	if !strings.HasPrefix(value, "data:image/") {
		return value, nil
	}
	url, _, err := storage.UploadImageWithKey(spaceID, folder, value)
	return url, err
}

func uploadPhotoInputs(spaceID, folder string, photos []photoInput) error {
	for index := range photos {
		url, key, err := storage.UploadImageWithKey(spaceID, folder, photos[index].URL)
		if err != nil {
			return err
		}
		photos[index].URL = url
		if key != "" {
			photos[index].Key = key
		}
		if photos[index].Key == "" {
			photos[index].Key = storage.KeyFromURL(photos[index].URL)
		}
		if photos[index].Key != "" && !storage.KeyBelongsToSpace(photos[index].Key, spaceID) {
			return fmt.Errorf("photo key is outside current space")
		}
	}
	return nil
}

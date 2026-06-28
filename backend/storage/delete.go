package storage

import (
	"log"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
)

// DeleteObject deletes one object. Empty keys and unconfigured storage are ignored.
func (s *S3Storage) DeleteObject(key string) error {
	if s == nil || s.client == nil || key == "" {
		return nil
	}
	cfg := s.config()
	input := &s3.DeleteObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	}
	_, err := s.client.DeleteObject(input)
	if err != nil && s.pathStyleClient != nil {
		if _, fallbackErr := s.pathStyleClient.DeleteObject(input); fallbackErr == nil {
			return nil
		}
	}
	return err
}

// DeletePhotoObject prefers the persisted key, then falls back to URL parsing.
func (s *S3Storage) DeletePhotoObject(key, url string) error {
	if key == "" {
		key = s.KeyFromURL(url)
	}
	if key == "" {
		key = s.LocalKeyFromURL(url)
	}
	if key == "" {
		return nil
	}
	if s.LocalKeyFromURL(url) != "" {
		if err := s.DeleteLocalObject(key); err != nil {
			log.Printf("delete local object failed (key=%s): %v", key, err)
			return err
		}
		return nil
	}
	if err := s.DeleteObject(key); err != nil {
		log.Printf("delete oss object failed (key=%s): %v", key, err)
		return err
	}
	return nil
}

// DeleteObjectByURL parses an object key from a public URL and deletes it best-effort.
func (s *S3Storage) DeleteObjectByURL(url string) error {
	return s.DeletePhotoObject("", url)
}

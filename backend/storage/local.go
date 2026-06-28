package storage

import (
	"bytes"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
)

// LocalPathForKey resolves a local fallback object key to an on-disk path.
func (s *S3Storage) LocalPathForKey(key string) (string, bool) {
	key = cleanObjectKeyFromURLPath(key)
	if key == "" {
		return "", false
	}
	base, err := filepath.Abs(s.config().LocalImageDir)
	if err != nil {
		return "", false
	}
	filePath, err := filepath.Abs(filepath.Join(base, filepath.FromSlash(key)))
	if err != nil {
		return "", false
	}
	if filePath != base && !strings.HasPrefix(filePath, base+string(os.PathSeparator)) {
		return "", false
	}
	return filePath, true
}

// SaveLocalImage writes a fallback image under LOCAL_IMAGE_DIR using the object key.
func (s *S3Storage) SaveLocalImage(key string, data []byte) error {
	filePath, ok := s.LocalPathForKey(key)
	if !ok {
		return fmt.Errorf("invalid local image key")
	}
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

// UploadLocalObjectToS3 uploads a server-local fallback image to object storage using the same key.
func (s *S3Storage) UploadLocalObjectToS3(key string) (string, error) {
	if s == nil || s.client == nil {
		return "", fmt.Errorf("object storage not configured")
	}
	filePath, ok := s.LocalPathForKey(key)
	if !ok {
		return "", fmt.Errorf("invalid local image key")
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	contentType := mime.TypeByExtension(filepath.Ext(filePath))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}

	cfg := s.config()
	input := &s3.PutObjectInput{
		Bucket:      aws.String(cfg.S3Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	}
	if cfg.S3ObjectACL != "" {
		input.ACL = aws.String(cfg.S3ObjectACL)
	}
	if _, err := s.client.PutObject(input); err != nil {
		return "", err
	}
	return publicURLForKey(cfg, key), nil
}

// DeleteLocalObject removes a server-local fallback image.
func (s *S3Storage) DeleteLocalObject(key string) error {
	filePath, ok := s.LocalPathForKey(key)
	if !ok {
		return nil
	}
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

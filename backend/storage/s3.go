package storage

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"our-memories-backend/config"
	"our-memories-backend/utils"
)

var s3Client *s3.S3

func InitS3() {
	cfg := config.Get()
	if cfg.S3Endpoint == "" {
		return
	}

	sess := session.Must(session.NewSession(&aws.Config{
		Endpoint:         aws.String(cfg.S3Endpoint),
		Region:           aws.String("us-east-1"), // 阿里云OSS不使用region，填任意值
		Credentials:      credentials.NewStaticCredentials(cfg.S3AccessKeyID, cfg.S3SecretAccessKey, ""),
		S3ForcePathStyle: aws.Bool(false), // 阿里云OSS需要虚拟主机样式
	}))

	s3Client = s3.New(sess)
}

func UploadImage(spaceID, folder, dataURL string) (string, error) {
	if !strings.HasPrefix(dataURL, "data:image/") {
		return dataURL, nil
	}

	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid data URL")
	}

	mimeType := strings.TrimPrefix(strings.TrimSuffix(parts[0], ";base64"), "data:")
	ext := ".jpg"
	if strings.Contains(mimeType, "png") {
		ext = ".png"
	} else if strings.Contains(mimeType, "webp") {
		ext = ".webp"
	}

	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}

	key := filepath.Join(spaceID, folder, utils.NewID()+ext)
	cfg := config.Get()

	if s3Client != nil {
		_, err = s3Client.PutObject(&s3.PutObjectInput{
			Bucket:      aws.String(cfg.S3Bucket),
			Key:         aws.String(key),
			Body:        bytes.NewReader(data),
			ContentType: aws.String(mimeType),
		})
		if err != nil {
			return "", err
		}

		if cfg.S3PublicBaseURL != "" {
			return cfg.S3PublicBaseURL + "/" + key, nil
		}
		return fmt.Sprintf("%s/%s/%s", cfg.S3Endpoint, cfg.S3Bucket, key), nil
	}

	return dataURL, nil
}

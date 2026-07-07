package main

import (
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/joho/godotenv"
)

type uploadedAsset struct {
	Key string `json:"key"`
	URL string `json:"url"`
}

func env(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}

func publicURL(baseURL, endpoint, bucket, key string) string {
	key = strings.TrimLeft(key, "/")
	if baseURL != "" {
		return strings.TrimRight(baseURL, "/") + "/" + key
	}
	return fmt.Sprintf("%s/%s/%s", strings.TrimRight(endpoint, "/"), strings.Trim(bucket, "/"), key)
}

func contentType(path string) string {
	if strings.HasSuffix(path, ".webp") {
		return "image/webp"
	}
	if strings.HasSuffix(path, ".png") {
		return "image/png"
	}
	if detected := mime.TypeByExtension(filepath.Ext(path)); detected != "" {
		return detected
	}
	return "application/octet-stream"
}

func main() {
	_ = godotenv.Load()

	endpoint := env("S3_ENDPOINT")
	region := env("S3_REGION")
	accessKey := env("S3_ACCESS_KEY_ID")
	secretKey := env("S3_SECRET_ACCESS_KEY")
	bucket := env("S3_BUCKET")
	baseURL := env("S3_PUBLIC_BASE_URL")
	acl := env("S3_OBJECT_ACL")
	if endpoint == "" || region == "" || accessKey == "" || secretKey == "" || bucket == "" {
		log.Fatal("S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET are required")
	}

	roots := []string{
		"../apps/web/public/sprites/characters/generated",
		"../apps/web/public/sprites/weather/generated",
		"../apps/web/public/sprites/decorations/generated",
	}
	allowedPrefixes := []string{
		"map-avatar-",
		"map-couple-holding-",
		"future-spirit-",
		"weather-",
		"badge-flower-",
	}

	sess := session.Must(session.NewSession(&aws.Config{
		Endpoint:    aws.String(endpoint),
		Region:      aws.String(region),
		Credentials: credentials.NewStaticCredentials(accessKey, secretKey, ""),
	}))
	client := s3.New(sess)
	uploaded := map[string]uploadedAsset{}

	for _, root := range roots {
		if err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			name := entry.Name()
			matched := false
			for _, prefix := range allowedPrefixes {
				if strings.HasPrefix(name, prefix) {
					matched = true
					break
				}
			}
			if !matched {
				return nil
			}

			body, err := os.Open(path)
			if err != nil {
				return err
			}
			defer body.Close()

			key := "static/generated-assets/" + name
			input := &s3.PutObjectInput{
				Bucket:       aws.String(bucket),
				Key:          aws.String(key),
				Body:         body,
				ContentType:  aws.String(contentType(path)),
				CacheControl: aws.String("public, max-age=31536000, immutable"),
			}
			if acl != "" {
				input.ACL = aws.String(acl)
			}
			if _, err := client.PutObject(input); err != nil {
				return fmt.Errorf("upload %s: %w", path, err)
			}
			uploaded[name] = uploadedAsset{Key: key, URL: publicURL(baseURL, endpoint, bucket, key)}
			log.Printf("uploaded %s", key)
			return nil
		}); err != nil {
			log.Fatal(err)
		}
	}

	encoded, err := json.MarshalIndent(uploaded, "", "  ")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(string(encoded))
}

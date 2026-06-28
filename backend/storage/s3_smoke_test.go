package storage

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/joho/godotenv"
	"our-memories-backend/config"
)

const tinyPNGDataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

func TestOSSSmokeUploadDelete(t *testing.T) {
	if os.Getenv("RUN_OSS_SMOKE") != "1" {
		t.Skip("set RUN_OSS_SMOKE=1 to run the live OSS upload/delete smoke test")
	}

	initSmokeS3(t)

	spaceID := "codex-smoke-" + time.Now().UTC().Format("20060102150405")
	publicURL, key, err := UploadImageWithKey(spaceID, "uploads", tinyPNGDataURL)
	if err != nil {
		t.Fatalf("upload smoke object: %v", err)
	}
	if key == "" {
		t.Fatal("upload smoke object returned empty key")
	}
	defer func() {
		_ = DeletePhotoObject(key, publicURL)
	}()

	if err := headObject(key); err != nil {
		t.Fatalf("head uploaded smoke object %q: %v", key, err)
	}

	if err := DeletePhotoObject(key, publicURL); err != nil {
		t.Fatalf("delete smoke object %q: %v", key, err)
	}

	if err := waitUntilObjectGone(key, 10*time.Second); err != nil {
		t.Fatal(err)
	}
}

func TestOSSSmokeDeleteKeys(t *testing.T) {
	rawKeys := os.Getenv("OSS_SMOKE_DELETE_KEYS")
	if rawKeys == "" {
		t.Skip("set OSS_SMOKE_DELETE_KEYS to delete known live OSS smoke objects")
	}

	initSmokeS3(t)

	for _, key := range strings.Split(rawKeys, ",") {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if err := DeleteObject(key); err != nil {
			t.Fatalf("delete smoke object %q: %v", key, err)
		}
		if err := waitUntilObjectGone(key, 10*time.Second); err != nil {
			t.Fatal(err)
		}
	}
}

func initSmokeS3(t *testing.T) {
	t.Helper()

	_ = godotenv.Load("../.env")
	config.Load()
	InitS3()
	if !Enabled() {
		t.Fatal("object storage is not configured")
	}
}

func headObject(key string) error {
	cfg := config.Get()
	store, ok := Default().(*S3Storage)
	if !ok || store.client == nil {
		return fmt.Errorf("object storage is not configured")
	}
	_, err := store.client.HeadObject(&s3.HeadObjectInput{
		Bucket: aws.String(cfg.S3Bucket),
		Key:    aws.String(key),
	})
	return err
}

func waitUntilObjectGone(key string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		if err := headObject(key); err != nil {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("smoke object still exists after delete: %s", key)
		}
		time.Sleep(500 * time.Millisecond)
	}
}

package storage

import (
	"testing"

	"our-memories-backend/config"
)

func loadS3TestConfig(t *testing.T, publicBaseURL string) {
	t.Helper()
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("S3_ENDPOINT", "https://oss-cn-hangzhou.aliyuncs.com")
	t.Setenv("S3_REGION", "cn-hangzhou")
	t.Setenv("S3_BUCKET", "our-memories")
	t.Setenv("S3_PUBLIC_BASE_URL", publicBaseURL)
	config.Load()
	InitS3()
}

func TestKeyFromURLWithPublicBaseURL(t *testing.T) {
	loadS3TestConfig(t, "https://cdn.example.com/assets/")

	got := KeyFromURL("https://cdn.example.com/assets/space-1/memories/photo.jpg?x-oss-process=image/resize")
	want := "space-1/memories/photo.jpg"
	if got != want {
		t.Fatalf("KeyFromURL() = %q, want %q", got, want)
	}
}

func TestKeyFromURLWithPathStyleURL(t *testing.T) {
	loadS3TestConfig(t, "")

	got := KeyFromURL("https://oss-cn-hangzhou.aliyuncs.com/our-memories/space-1/memories/photo.jpg")
	want := "space-1/memories/photo.jpg"
	if got != want {
		t.Fatalf("KeyFromURL() = %q, want %q", got, want)
	}
}

func TestKeyFromURLWithAliyunVirtualHostedURL(t *testing.T) {
	loadS3TestConfig(t, "")

	got := KeyFromURL("https://our-memories.oss-cn-hangzhou.aliyuncs.com/space-1/memories/photo.jpg")
	want := "space-1/memories/photo.jpg"
	if got != want {
		t.Fatalf("KeyFromURL() = %q, want %q", got, want)
	}
}

func TestPublicURLForKeyTrimsDuplicateSlashes(t *testing.T) {
	cfg := &config.Config{S3PublicBaseURL: "https://cdn.example.com/assets/"}

	got := publicURLForKey(cfg, "/space-1/memories/photo.jpg")
	want := "https://cdn.example.com/assets/space-1/memories/photo.jpg"
	if got != want {
		t.Fatalf("publicURLForKey() = %q, want %q", got, want)
	}
}

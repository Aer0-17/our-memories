package securebackup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestEncryptedArchiveRoundTrip(t *testing.T) {
	root := t.TempDir()
	databasePath := filepath.Join(root, "snapshot.db")
	mediaDirectory := filepath.Join(root, "images")
	if err := os.MkdirAll(filepath.Join(mediaDirectory, "space-1", "memories"), 0700); err != nil {
		t.Fatal(err)
	}
	databaseData := []byte("consistent-sqlite-snapshot")
	mediaData := []byte("private-photo-bytes")
	if err := os.WriteFile(databasePath, databaseData, 0600); err != nil {
		t.Fatal(err)
	}
	mediaPath := filepath.Join(mediaDirectory, "space-1", "memories", "photo.jpg")
	if err := os.WriteFile(mediaPath, mediaData, 0600); err != nil {
		t.Fatal(err)
	}

	key := testEncryptionKey(t)
	createdAt := time.Date(2026, 7, 31, 8, 30, 0, 0, time.UTC)
	var encrypted bytes.Buffer
	written, err := WriteEncryptedArchive(
		&encrypted,
		key,
		databasePath,
		mediaDirectory,
		createdAt,
		true,
	)
	if err != nil {
		t.Fatal(err)
	}
	if written.DatabaseBytes != int64(len(databaseData)) ||
		written.MediaFiles != 1 ||
		written.MediaBytes != int64(len(mediaData)) ||
		!written.RemoteObjectStorageExcluded {
		t.Fatalf("unexpected written manifest: %#v", written)
	}

	verified, err := VerifyEncryptedArchive(bytes.NewReader(encrypted.Bytes()), key)
	if err != nil {
		t.Fatal(err)
	}
	if verified.Format != FullBackupFormat || verified.CreatedAt != createdAt || len(verified.Entries) != 2 {
		t.Fatalf("unexpected verified manifest: %#v", verified)
	}

	extractedDirectory := filepath.Join(root, "restored")
	extracted, err := ExtractEncryptedArchive(bytes.NewReader(encrypted.Bytes()), key, extractedDirectory)
	if err != nil {
		t.Fatal(err)
	}
	if extracted.Format != FullBackupFormat {
		t.Fatalf("unexpected extracted manifest: %#v", extracted)
	}
	assertFileContent(t, filepath.Join(extractedDirectory, filepath.FromSlash(databaseEntryPath)), databaseData)
	assertFileContent(
		t,
		filepath.Join(extractedDirectory, "media", "space-1", "memories", "photo.jpg"),
		mediaData,
	)
}

func TestArchiveRejectsMediaSymlink(t *testing.T) {
	root := t.TempDir()
	databasePath := filepath.Join(root, "snapshot.db")
	mediaDirectory := filepath.Join(root, "images")
	if err := os.WriteFile(databasePath, []byte("db"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(mediaDirectory, 0700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(root, "outside.txt")
	if err := os.WriteFile(outside, []byte("must-not-be-read"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(mediaDirectory, "escape.txt")); err != nil {
		t.Skipf("symlinks are unavailable: %v", err)
	}

	var encrypted bytes.Buffer
	_, err := WriteEncryptedArchive(
		&encrypted,
		testEncryptionKey(t),
		databasePath,
		mediaDirectory,
		time.Now(),
		false,
	)
	if err == nil {
		t.Fatal("expected media symlink to be rejected")
	}
}

func TestExtractRejectsOversizedAndDuplicateManifest(t *testing.T) {
	key := testEncryptionKey(t)
	oversized := encryptedTestArchive(t, key, func(archive *tar.Writer) {
		writeTestArchiveEntry(t, archive, manifestPath, bytes.Repeat([]byte{0}, maximumManifest+1))
	})
	if _, err := ExtractEncryptedArchive(bytes.NewReader(oversized), key, filepath.Join(t.TempDir(), "oversized")); err == nil || !strings.Contains(err.Error(), "manifest is too large") {
		t.Fatalf("expected oversized manifest rejection, got %v", err)
	}

	duplicate := encryptedTestArchive(t, key, func(archive *tar.Writer) {
		writeTestArchiveEntry(t, archive, manifestPath, []byte(`{}`))
		writeTestArchiveEntry(t, archive, manifestPath, []byte(`{}`))
	})
	if _, err := ExtractEncryptedArchive(bytes.NewReader(duplicate), key, filepath.Join(t.TempDir(), "duplicate")); err == nil || !strings.Contains(err.Error(), "duplicate manifest") {
		t.Fatalf("expected duplicate manifest rejection, got %v", err)
	}
}

func TestExtractValidatesManifestEntryHashes(t *testing.T) {
	key := testEncryptionKey(t)
	manifest := Manifest{
		Format:        FullBackupFormat,
		Version:       FullBackupVersion,
		CreatedAt:     time.Now().UTC(),
		Encryption:    "AES-256-GCM-CHUNKED",
		DatabasePath:  databaseEntryPath,
		DatabaseBytes: 2,
		MediaRoot:     "media",
		Entries: []ManifestEntry{{
			Path:   databaseEntryPath,
			Size:   2,
			SHA256: strings.Repeat("0", 64),
		}},
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	encrypted := encryptedTestArchive(t, key, func(archive *tar.Writer) {
		writeTestArchiveEntry(t, archive, databaseEntryPath, []byte("db"))
		writeTestArchiveEntry(t, archive, manifestPath, encoded)
	})
	if _, err := ExtractEncryptedArchive(bytes.NewReader(encrypted), key, filepath.Join(t.TempDir(), "hash")); err == nil || !strings.Contains(err.Error(), "integrity check failed") {
		t.Fatalf("expected manifest hash rejection, got %v", err)
	}
}

func encryptedTestArchive(t *testing.T, key []byte, writeEntries func(*tar.Writer)) []byte {
	t.Helper()
	var destination bytes.Buffer
	encrypted, err := NewEncryptWriter(&destination, key)
	if err != nil {
		t.Fatal(err)
	}
	compressed := gzip.NewWriter(encrypted)
	archive := tar.NewWriter(compressed)
	writeEntries(archive)
	for _, closeErr := range []error{archive.Close(), compressed.Close(), encrypted.Close()} {
		if closeErr != nil {
			t.Fatal(closeErr)
		}
	}
	return destination.Bytes()
}

func writeTestArchiveEntry(t *testing.T, archive *tar.Writer, name string, data []byte) {
	t.Helper()
	header := &tar.Header{Name: name, Mode: 0600, Size: int64(len(data)), Typeflag: tar.TypeReg}
	if err := archive.WriteHeader(header); err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(archive, bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
}

func assertFileContent(t *testing.T, filePath string, expected []byte) {
	t.Helper()
	actual, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, expected) {
		t.Fatalf("unexpected file content at %s", filePath)
	}
}

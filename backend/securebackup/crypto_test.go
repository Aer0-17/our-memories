package securebackup

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"testing"
)

func testEncryptionKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, encryptionKeySize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		t.Fatal(err)
	}
	return key
}

func encryptForTest(t *testing.T, plaintext, key []byte, chunkSize int) []byte {
	t.Helper()
	var encrypted bytes.Buffer
	w, err := newEncryptWriter(&encrypted, key, chunkSize)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write(plaintext); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return encrypted.Bytes()
}

func decryptForTest(encrypted, key []byte) ([]byte, error) {
	r, err := NewDecryptReader(bytes.NewReader(encrypted), key)
	if err != nil {
		return nil, err
	}
	return io.ReadAll(r)
}

func TestEncryptedStreamRoundTrip(t *testing.T) {
	key := testEncryptionKey(t)
	chunkSize := minimumChunkSize
	for _, size := range []int{0, 1, chunkSize - 1, chunkSize, chunkSize + 1, chunkSize*3 + 17} {
		t.Run(fmt.Sprintf("bytes-%d", size), func(t *testing.T) {
			plaintext := make([]byte, size)
			for index := range plaintext {
				plaintext[index] = byte((index*31 + 7) % 251)
			}
			encrypted := encryptForTest(t, plaintext, key, chunkSize)
			decrypted, err := decryptForTest(encrypted, key)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(decrypted, plaintext) {
				t.Fatalf("round trip mismatch for %d bytes", size)
			}
		})
	}
}

func TestEncryptedStreamRejectsTamperingAndTruncation(t *testing.T) {
	key := testEncryptionKey(t)
	plaintext := bytes.Repeat([]byte("private-memory-data"), 500)
	encrypted := encryptForTest(t, plaintext, key, minimumChunkSize)

	tampered := append([]byte(nil), encrypted...)
	tampered[len(tampered)-1] ^= 0x40
	if _, err := decryptForTest(tampered, key); !errors.Is(err, ErrInvalidEncryptedBackup) {
		t.Fatalf("expected authentication failure, got %v", err)
	}

	truncated := encrypted[:len(encrypted)-5]
	if _, err := decryptForTest(truncated, key); !errors.Is(err, ErrTruncatedBackup) {
		t.Fatalf("expected truncation failure, got %v", err)
	}

	wrongKey := testEncryptionKey(t)
	if _, err := decryptForTest(encrypted, wrongKey); !errors.Is(err, ErrInvalidEncryptedBackup) {
		t.Fatalf("expected wrong-key authentication failure, got %v", err)
	}
}

func TestParseEncryptionKey(t *testing.T) {
	key := testEncryptionKey(t)
	parsed, err := ParseEncryptionKey(base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(parsed, key) {
		t.Fatal("parsed key does not match")
	}
	if _, err := ParseEncryptionKey("short-password"); err == nil {
		t.Fatal("expected weak encryption key to be rejected")
	}
}

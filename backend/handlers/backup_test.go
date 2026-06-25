package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
	"our-memories-backend/db"
)

func setupBackupTestDB(t *testing.T) {
	t.Helper()
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("S3_PUBLIC_BASE_URL", "https://new-cdn.example.com")

	testDB, err := sql.Open("sqlite", "file:backup-test?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		testDB.Close()
	})
	db.DB = testDB
	db.Migrate()
}

func TestImportBackupReplacesCurrentSpaceAndRewritesMediaURLs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupBackupTestDB(t)

	_, err := db.DB.Exec(`
		INSERT INTO spaces (id, space_code, password_hash, name) VALUES ('target-space', 'target', 'hash', 'Target');
		INSERT INTO users (id, space_id, username, display_name) VALUES ('target-user', 'target-space', 'me', 'Target User');
	`)
	if err != nil {
		t.Fatal(err)
	}

	payload := backupPayload{
		Format:  backupFormat,
		Version: backupVersion,
		Space: backupRow{
			"id":            "source-space",
			"space_code":    "source",
			"password_hash": "source-hash",
			"name":          "Source Space",
		},
		Tables: map[string][]backupRow{
			"users": {
				{"id": "source-user", "space_id": "source-space", "username": "me", "display_name": "Source User"},
			},
			"memories": {
				{
					"id": "memory-1", "space_id": "source-space", "city_id": "shanghai", "city": "Shanghai",
					"city_en": "Shanghai", "date": "2026-01-01", "text": "hello", "created_by_id": "source-user",
				},
			},
			"memory_photos": {
				{
					"id": "photo-1", "memory_id": "memory-1", "key": "source-space/memories/photo-1.jpg",
					"url": "https://old-cdn.example.com/source-space/memories/photo-1.jpg", "mime_type": "image/jpeg",
				},
			},
		},
		Media: []backupMediaReference{
			{
				Kind: "memory_photo", ID: "photo-1", ParentID: "memory-1",
				Key: "source-space/memories/photo-1.jpg", URL: "https://old-cdn.example.com/source-space/memories/photo-1.jpg",
			},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/backup/import", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("spaceID", "target-space")

	ImportBackup(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected import to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var targetCount int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM spaces WHERE id = 'target-space'`).Scan(&targetCount); err != nil {
		t.Fatal(err)
	}
	if targetCount != 0 {
		t.Fatalf("expected target space to be replaced, found %d", targetCount)
	}

	var photoURL string
	if err := db.DB.QueryRow(`SELECT url FROM memory_photos WHERE id = 'photo-1'`).Scan(&photoURL); err != nil {
		t.Fatal(err)
	}
	wantURL := "https://new-cdn.example.com/source-space/memories/photo-1.jpg"
	if photoURL != wantURL {
		t.Fatalf("expected rewritten photo url %q, got %q", wantURL, photoURL)
	}
}

func TestAdminImportBackupReplacesConflictingSpaceCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupBackupTestDB(t)

	_, err := db.DB.Exec(`
		INSERT INTO spaces (id, space_code, password_hash, name) VALUES ('seed-space', 'source', 'hash', 'Seed');
		INSERT INTO users (id, space_id, username, display_name) VALUES ('seed-user', 'seed-space', 'me', 'Seed User');
	`)
	if err != nil {
		t.Fatal(err)
	}

	payload := backupPayload{
		Format:  backupFormat,
		Version: backupVersion,
		Space: backupRow{
			"id":            "source-space",
			"space_code":    "source",
			"password_hash": "source-hash",
			"name":          "Source Space",
		},
		Tables: map[string][]backupRow{
			"users": {
				{"id": "source-user", "space_id": "source-space", "username": "me", "display_name": "Source User"},
			},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/admin/backup/import", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("adminID", "admin-1")

	AdminImportBackup(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected admin import to succeed, got %d: %s", w.Code, w.Body.String())
	}

	var seedCount int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM spaces WHERE id = 'seed-space'`).Scan(&seedCount); err != nil {
		t.Fatal(err)
	}
	if seedCount != 0 {
		t.Fatalf("expected conflicting seed space to be removed, found %d", seedCount)
	}

	var sourceName string
	if err := db.DB.QueryRow(`SELECT name FROM spaces WHERE id = 'source-space'`).Scan(&sourceName); err != nil {
		t.Fatal(err)
	}
	if sourceName != "Source Space" {
		t.Fatalf("expected imported source space, got %q", sourceName)
	}
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}

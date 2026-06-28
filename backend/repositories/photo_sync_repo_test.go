package repositories_test

import (
	"database/sql"
	"strings"
	"testing"

	_ "github.com/glebarez/sqlite"
	sqlitegorm "github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
)

func setupRepositoryTestDB(t *testing.T) {
	t.Helper()

	name := strings.NewReplacer("/", "-", " ", "-", ":", "-").Replace(t.Name())
	testDB, err := sql.Open("sqlite", "file:"+name+"?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = testDB.Close()
	})

	db.DB = testDB
	db.Gorm, err = gorm.Open(sqlitegorm.Dialector{Conn: testDB}, &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Migrate()

	_, err = db.DB.Exec(`
		INSERT INTO spaces (id, space_code, password_hash, name) VALUES ('space-1', 'space-one', 'hash', 'Space One');
		INSERT INTO users (id, space_id, username, display_name, role) VALUES ('user-1', 'space-1', 'me', 'Me', 'owner');
		INSERT INTO memories (id, space_id, city_id, city, city_en, date, text, created_by_id) VALUES
			('memory-1', 'space-1', 'shanghai', '上海', 'Shanghai', '2026.06.28', 'one', 'user-1');
		INSERT INTO memory_photos (id, memory_id, key, url, mime_type, sort_order) VALUES
			('photo-1', 'memory-1', '', 'data:image/jpeg;base64,AAAA', 'image/jpeg', 0),
			('photo-2', 'memory-1', 'space-1/memories/local.jpg', '/local-images/space-1/memories/local.jpg', 'image/jpeg', 1),
			('photo-3', 'memory-1', 'space-1/memories/proxy.jpg', 'http://localhost:8080/local-images/space-1/memories/proxy.jpg', 'image/jpeg', 2),
			('photo-4', 'memory-1', 'space-1/memories/cdn.jpg', 'https://cdn.example.com/space-1/memories/cdn.jpg', 'image/jpeg', 3);
	`)
	if err != nil {
		t.Fatal(err)
	}
}

func TestPhotoSyncRepositoryPendingRowsAndConditionalUpdate(t *testing.T) {
	setupRepositoryTestDB(t)
	repo := repositories.NewPhotoSyncRepository(db.Gorm)
	table := repositories.PhotoSyncTable{
		Name:      "memory_photos",
		IDColumn:  "id",
		JoinTable: "memories",
		JoinOn:    "memory_photos.memory_id = memories.id",
	}

	pending, err := repo.PendingRows(table)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 3 {
		t.Fatalf("expected 3 pending rows, got %#v", pending)
	}
	if pending[0].ID != "photo-1" || pending[0].SpaceID != "space-1" || !strings.HasPrefix(pending[0].URL, "data:image/") {
		t.Fatalf("unexpected first pending row: %#v", pending[0])
	}
	if pending[2].ID != "photo-3" {
		t.Fatalf("expected pending rows ordered by id, got %#v", pending)
	}

	affected, err := repo.UpdatePhotoLocation(table, pending[0], "https://cdn.example.com/space-1/memories/photo-1.jpg", "space-1/memories/photo-1.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if affected != 1 {
		t.Fatalf("expected one row to update, got %d", affected)
	}

	affected, err = repo.UpdatePhotoLocation(table, pending[0], "https://cdn.example.com/space-1/memories/stale.jpg", "space-1/memories/stale.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if affected != 0 {
		t.Fatalf("expected stale URL update to affect 0 rows, got %d", affected)
	}

	var urlValue, keyValue string
	if err := db.DB.QueryRow(`SELECT url, key FROM memory_photos WHERE id = 'photo-1'`).Scan(&urlValue, &keyValue); err != nil {
		t.Fatal(err)
	}
	if urlValue != "https://cdn.example.com/space-1/memories/photo-1.jpg" || keyValue != "space-1/memories/photo-1.jpg" {
		t.Fatalf("unexpected updated photo location url=%q key=%q", urlValue, keyValue)
	}
}

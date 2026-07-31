package securebackup

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/glebarez/sqlite"
)

func TestServiceCreatesVerifiedBackupAndEnforcesRetention(t *testing.T) {
	root := t.TempDir()
	dataDirectory := filepath.Join(root, "data")
	mediaDirectory := filepath.Join(dataDirectory, "images")
	backupDirectory := filepath.Join(root, "backups")
	if err := os.MkdirAll(filepath.Join(mediaDirectory, "space-1", "memories"), 0700); err != nil {
		t.Fatal(err)
	}
	mediaPath := filepath.Join(mediaDirectory, "space-1", "memories", "photo.jpg")
	if err := os.WriteFile(mediaPath, []byte("encrypted-media"), 0600); err != nil {
		t.Fatal(err)
	}

	databasePath := filepath.Join(dataDirectory, "ourMemories.db")
	database, err := sql.Open("sqlite", databasePath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if _, err := database.Exec(`
		CREATE TABLE memories (id TEXT PRIMARY KEY, text TEXT NOT NULL);
		INSERT INTO memories (id, text) VALUES ('memory-1', 'first');
	`); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 7, 31, 10, 0, 0, 0, time.UTC)
	key := testEncryptionKey(t)
	service, err := NewService(ServiceConfig{
		Enabled:         true,
		Database:        database,
		DatabasePath:    databasePath,
		MediaDirectory:  mediaDirectory,
		BackupDirectory: backupDirectory,
		EncryptionKey:   key,
		RetentionCount:  2,
		Interval:        24 * time.Hour,
		Now:             func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}

	var latest CreateResult
	for index := 0; index < 3; index++ {
		latest, err = service.Create(context.Background(), "test")
		if err != nil {
			t.Fatal(err)
		}
		now = now.Add(time.Second)
	}
	if latest.RemovedFiles != 1 {
		t.Fatalf("expected one expired backup to be removed, got %#v", latest)
	}
	if latest.Backup.MediaFiles != 1 || latest.Backup.MediaBytes != int64(len("encrypted-media")) {
		t.Fatalf("unexpected backup media stats: %#v", latest.Backup)
	}

	files, err := os.ReadDir(backupDirectory)
	if err != nil {
		t.Fatal(err)
	}
	backupFiles := 0
	for _, file := range files {
		if validBackupFileName(file.Name()) {
			backupFiles++
		}
	}
	if backupFiles != 2 {
		t.Fatalf("expected two retained backups, got %d", backupFiles)
	}

	status := service.Status()
	if status.LastSuccess == nil || status.LastSuccess.FileName != latest.Backup.FileName || status.LastError != "" {
		t.Fatalf("unexpected service status: %#v", status)
	}
	if service.Due(now) {
		t.Fatal("new backup should not be due immediately")
	}

	backupPath := filepath.Join(backupDirectory, latest.Backup.FileName)
	backupFile, err := os.Open(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := VerifyEncryptedArchive(backupFile, key)
	_ = backupFile.Close()
	if err != nil {
		t.Fatal(err)
	}
	if manifest.DatabaseBytes == 0 || manifest.MediaFiles != 1 {
		t.Fatalf("unexpected verified manifest: %#v", manifest)
	}

	restoreDirectory := filepath.Join(root, "restore")
	backupFile, err = os.Open(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = ExtractEncryptedArchive(backupFile, key, restoreDirectory)
	_ = backupFile.Close()
	if err != nil {
		t.Fatal(err)
	}
	restoredDB, err := sql.Open("sqlite", filepath.Join(restoreDirectory, filepath.FromSlash(databaseEntryPath)))
	if err != nil {
		t.Fatal(err)
	}
	defer restoredDB.Close()
	var memoryCount int
	if err := restoredDB.QueryRow(`SELECT COUNT(*) FROM memories`).Scan(&memoryCount); err != nil {
		t.Fatal(err)
	}
	if memoryCount != 1 {
		t.Fatalf("expected restored database row, got %d", memoryCount)
	}

	if err := os.Remove(backupPath); err != nil {
		t.Fatal(err)
	}
	reloaded, err := NewService(ServiceConfig{
		Enabled:         true,
		Database:        database,
		DatabasePath:    databasePath,
		MediaDirectory:  mediaDirectory,
		BackupDirectory: backupDirectory,
		EncryptionKey:   key,
		RetentionCount:  2,
		Interval:        24 * time.Hour,
		Now:             func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Status().LastSuccess != nil {
		t.Fatal("missing indexed backup must not be reported as a successful backup")
	}
	if !reloaded.Due(now) {
		t.Fatal("service should immediately replace a missing indexed backup")
	}
}

func TestServiceRejectsUnsafeConfigurationAndConcurrentRun(t *testing.T) {
	disabled, err := NewService(ServiceConfig{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := disabled.Create(context.Background(), "manual"); !errors.Is(err, ErrFullBackupDisabled) {
		t.Fatalf("expected disabled error, got %v", err)
	}

	root := t.TempDir()
	databasePath := filepath.Join(root, "data.db")
	database, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.Exec(`CREATE TABLE test (id INTEGER)`); err != nil {
		t.Fatal(err)
	}
	if _, err := NewService(ServiceConfig{
		Enabled:         true,
		Database:        database,
		DatabasePath:    databasePath,
		MediaDirectory:  filepath.Join(root, "media"),
		BackupDirectory: filepath.Join(root, "media", "backups"),
		EncryptionKey:   testEncryptionKey(t),
		RetentionCount:  2,
		Interval:        time.Hour,
	}); err == nil {
		t.Fatal("expected overlapping media and backup directories to be rejected")
	}

	service, err := NewService(ServiceConfig{
		Enabled:         true,
		Database:        database,
		DatabasePath:    databasePath,
		MediaDirectory:  filepath.Join(root, "media"),
		BackupDirectory: filepath.Join(root, "backups"),
		EncryptionKey:   testEncryptionKey(t),
		RetentionCount:  2,
		Interval:        time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	service.createMu.Lock()
	_, err = service.Create(context.Background(), "manual")
	service.createMu.Unlock()
	if !errors.Is(err, ErrFullBackupInProgress) {
		t.Fatalf("expected in-progress error, got %v", err)
	}
}

func TestRetentionAlwaysKeepsCurrentBackup(t *testing.T) {
	backupDirectory := t.TempDir()
	current := "our-memories-full-20260731T100000Z-00000000.ombak"
	for _, name := range []string{
		current,
		"our-memories-full-20260731T100000Z-11111111.ombak",
		"our-memories-full-20260731T100000Z-22222222.ombak",
	} {
		if err := os.WriteFile(filepath.Join(backupDirectory, name), []byte(name), 0600); err != nil {
			t.Fatal(err)
		}
	}

	service := &Service{config: ServiceConfig{BackupDirectory: backupDirectory, RetentionCount: 2}}
	removed, err := service.enforceRetention(current)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("expected one backup to be removed, got %d", removed)
	}
	if _, err := os.Stat(filepath.Join(backupDirectory, current)); err != nil {
		t.Fatalf("current backup must be retained: %v", err)
	}
}

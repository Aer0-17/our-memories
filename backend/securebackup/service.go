package securebackup

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	backupFilePrefix = "our-memories-full-"
	backupFileSuffix = ".ombak"
	statusFileName   = ".full-backup-status.json"
)

var (
	ErrFullBackupDisabled   = errors.New("encrypted full backup is disabled")
	ErrFullBackupInProgress = errors.New("encrypted full backup is already running")
)

type ServiceConfig struct {
	Enabled                       bool
	Database                      *sql.DB
	DatabasePath                  string
	MediaDirectory                string
	BackupDirectory               string
	EncryptionKey                 []byte
	RetentionCount                int
	Interval                      time.Duration
	RemoteObjectStorageConfigured bool
	Now                           func() time.Time
}

type BackupInfo struct {
	CreatedAt                   time.Time `json:"createdAt"`
	VerifiedAt                  time.Time `json:"verifiedAt"`
	FileName                    string    `json:"fileName"`
	Size                        int64     `json:"size"`
	DatabaseBytes               int64     `json:"databaseBytes"`
	MediaFiles                  int       `json:"mediaFiles"`
	MediaBytes                  int64     `json:"mediaBytes"`
	RemoteObjectStorageExcluded bool      `json:"remoteObjectStorageExcluded"`
}

type Status struct {
	Enabled              bool        `json:"enabled"`
	EncryptionConfigured bool        `json:"encryptionConfigured"`
	Encryption           string      `json:"encryption"`
	Running              bool        `json:"running"`
	IntervalSeconds      int64       `json:"intervalSeconds"`
	RetentionCount       int         `json:"retentionCount"`
	LastAttemptAt        *time.Time  `json:"lastAttemptAt,omitempty"`
	LastErrorAt          *time.Time  `json:"lastErrorAt,omitempty"`
	LastError            string      `json:"lastError,omitempty"`
	LastSuccess          *BackupInfo `json:"lastSuccess,omitempty"`
	NextRunAt            *time.Time  `json:"nextRunAt,omitempty"`
}

type CreateResult struct {
	Backup       BackupInfo `json:"backup"`
	RemovedFiles int        `json:"removedFiles"`
	Warning      string     `json:"warning,omitempty"`
}

type persistedStatus struct {
	LastSuccess *BackupInfo `json:"lastSuccess,omitempty"`
}

type Service struct {
	config ServiceConfig
	key    []byte
	now    func() time.Time

	createMu sync.Mutex
	statusMu sync.RWMutex
	running  bool
	status   persistedStatus
	lastTry  *time.Time
	lastFail *time.Time
	lastErr  string
}

func NewService(cfg ServiceConfig) (*Service, error) {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	service := &Service{
		config: cfg,
		now:    cfg.Now,
		key:    append([]byte(nil), cfg.EncryptionKey...),
	}
	if !cfg.Enabled {
		return service, nil
	}
	if cfg.Database == nil {
		return nil, fmt.Errorf("full backup database is nil")
	}
	if len(cfg.EncryptionKey) != encryptionKeySize {
		return nil, fmt.Errorf("full backup encryption key must be 32 bytes")
	}
	if cfg.RetentionCount < 2 || cfg.RetentionCount > 365 {
		return nil, fmt.Errorf("full backup retention count must be between 2 and 365")
	}
	if cfg.Interval < time.Hour {
		return nil, fmt.Errorf("full backup interval must be at least one hour")
	}
	if strings.TrimSpace(cfg.DatabasePath) == "" ||
		strings.TrimSpace(cfg.MediaDirectory) == "" ||
		strings.TrimSpace(cfg.BackupDirectory) == "" {
		return nil, fmt.Errorf("full backup paths must not be empty")
	}
	if err := validateServicePaths(cfg.DatabasePath, cfg.MediaDirectory, cfg.BackupDirectory); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(cfg.BackupDirectory, 0700); err != nil {
		return nil, fmt.Errorf("create full backup directory: %w", err)
	}
	if err := os.Chmod(cfg.BackupDirectory, 0700); err != nil {
		return nil, fmt.Errorf("secure full backup directory: %w", err)
	}
	if err := service.loadStatus(); err != nil {
		return nil, err
	}
	return service, nil
}

func (s *Service) Enabled() bool {
	return s != nil && s.config.Enabled
}

func (s *Service) Due(now time.Time) bool {
	if !s.Enabled() {
		return false
	}
	s.statusMu.RLock()
	latest := cloneBackupInfo(s.status.LastSuccess)
	s.statusMu.RUnlock()
	if latest == nil {
		return true
	}
	return !now.UTC().Before(latest.CreatedAt.Add(s.config.Interval))
}

func (s *Service) Status() Status {
	if s == nil {
		return Status{}
	}
	s.statusMu.RLock()
	status := Status{
		Enabled:              s.config.Enabled,
		EncryptionConfigured: len(s.key) == encryptionKeySize,
		Encryption:           "AES-256-GCM",
		Running:              s.running,
		IntervalSeconds:      int64(s.config.Interval / time.Second),
		RetentionCount:       s.config.RetentionCount,
		LastAttemptAt:        cloneTime(s.lastTry),
		LastErrorAt:          cloneTime(s.lastFail),
		LastError:            s.lastErr,
		LastSuccess:          cloneBackupInfo(s.status.LastSuccess),
	}
	s.statusMu.RUnlock()
	if status.Enabled {
		next := s.now().UTC()
		if status.LastSuccess != nil {
			next = status.LastSuccess.CreatedAt.Add(s.config.Interval)
			if next.Before(s.now().UTC()) {
				next = s.now().UTC()
			}
		}
		status.NextRunAt = &next
	}
	return status
}

func (s *Service) Create(ctx context.Context, trigger string) (CreateResult, error) {
	if !s.Enabled() {
		return CreateResult{}, ErrFullBackupDisabled
	}
	if !s.createMu.TryLock() {
		return CreateResult{}, ErrFullBackupInProgress
	}
	defer s.createMu.Unlock()

	attemptedAt := s.now().UTC()
	s.statusMu.Lock()
	s.running = true
	s.lastTry = &attemptedAt
	s.statusMu.Unlock()
	defer func() {
		s.statusMu.Lock()
		s.running = false
		s.statusMu.Unlock()
	}()

	result, err := s.create(ctx, attemptedAt, trigger)
	if err != nil {
		s.statusMu.Lock()
		s.lastFail = &attemptedAt
		s.lastErr = "加密完整备份失败，请检查服务器日志。"
		s.statusMu.Unlock()
		return CreateResult{}, err
	}

	s.statusMu.Lock()
	s.status.LastSuccess = cloneBackupInfo(&result.Backup)
	s.lastFail = nil
	s.lastErr = ""
	s.statusMu.Unlock()
	return result, nil
}

func (s *Service) create(ctx context.Context, createdAt time.Time, trigger string) (CreateResult, error) {
	if err := ctx.Err(); err != nil {
		return CreateResult{}, err
	}
	snapshotPath, err := s.createDatabaseSnapshot(ctx)
	if err != nil {
		return CreateResult{}, fmt.Errorf("create SQLite snapshot: %w", err)
	}
	defer os.Remove(snapshotPath)

	suffix, err := randomSuffix()
	if err != nil {
		return CreateResult{}, err
	}
	fileName := fmt.Sprintf(
		"%s%s-%s%s",
		backupFilePrefix,
		createdAt.Format("20060102T150405Z"),
		suffix,
		backupFileSuffix,
	)
	finalPath := filepath.Join(s.config.BackupDirectory, fileName)
	partialPath := finalPath + ".partial"
	output, err := os.OpenFile(partialPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return CreateResult{}, fmt.Errorf("create encrypted backup file: %w", err)
	}
	removePartial := true
	defer func() {
		_ = output.Close()
		if removePartial {
			_ = os.Remove(partialPath)
		}
	}()

	manifest, archiveErr := WriteEncryptedArchive(
		output,
		s.key,
		snapshotPath,
		s.config.MediaDirectory,
		createdAt,
		s.config.RemoteObjectStorageConfigured,
	)
	if archiveErr != nil {
		return CreateResult{}, fmt.Errorf("write encrypted backup archive: %w", archiveErr)
	}
	if err := output.Sync(); err != nil {
		return CreateResult{}, fmt.Errorf("sync encrypted backup file: %w", err)
	}
	if err := output.Close(); err != nil {
		return CreateResult{}, fmt.Errorf("close encrypted backup file: %w", err)
	}
	if err := verifyBackupFile(partialPath, s.key); err != nil {
		return CreateResult{}, fmt.Errorf("verify encrypted backup file: %w", err)
	}
	if err := os.Rename(partialPath, finalPath); err != nil {
		return CreateResult{}, fmt.Errorf("publish encrypted backup file: %w", err)
	}
	removePartial = false
	if err := syncDirectory(s.config.BackupDirectory); err != nil {
		return CreateResult{}, fmt.Errorf("sync encrypted backup directory: %w", err)
	}
	info, err := os.Stat(finalPath)
	if err != nil {
		return CreateResult{}, err
	}

	backup := BackupInfo{
		CreatedAt:                   manifest.CreatedAt,
		VerifiedAt:                  s.now().UTC(),
		FileName:                    fileName,
		Size:                        info.Size(),
		DatabaseBytes:               manifest.DatabaseBytes,
		MediaFiles:                  manifest.MediaFiles,
		MediaBytes:                  manifest.MediaBytes,
		RemoteObjectStorageExcluded: manifest.RemoteObjectStorageExcluded,
	}
	result := CreateResult{Backup: backup}
	warnings := []string{}
	if err := s.persistStatus(&backup); err != nil {
		warnings = append(warnings, "备份已完成，但状态索引写入失败。")
	}
	removed, err := s.enforceRetention(fileName)
	result.RemovedFiles = removed
	if err != nil {
		warnings = append(warnings, "备份已完成，但旧备份清理失败。")
	}
	result.Warning = strings.Join(warnings, " ")
	_ = trigger // reserved for future audit metadata without exposing it in the archive
	return result, nil
}

func (s *Service) createDatabaseSnapshot(ctx context.Context) (string, error) {
	temporary, err := os.CreateTemp("", "our-memories-snapshot-*.db")
	if err != nil {
		return "", err
	}
	path := temporary.Name()
	if err := temporary.Close(); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	if err := os.Remove(path); err != nil {
		return "", err
	}
	query := "VACUUM INTO " + quoteSQLiteString(path)
	if _, err := s.config.Database.ExecContext(ctx, query); err != nil {
		return "", err
	}
	if err := os.Chmod(path, 0600); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func verifyBackupFile(filePath string, key []byte) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = VerifyEncryptedArchive(file, key)
	return err
}

func (s *Service) loadStatus() error {
	encoded, err := os.ReadFile(filepath.Join(s.config.BackupDirectory, statusFileName))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read full backup status: %w", err)
	}
	var status persistedStatus
	if err := json.Unmarshal(encoded, &status); err != nil {
		return fmt.Errorf("decode full backup status: %w", err)
	}
	if status.LastSuccess != nil && !validBackupFileName(status.LastSuccess.FileName) {
		return fmt.Errorf("full backup status contains invalid file name")
	}
	if status.LastSuccess != nil {
		backupPath := filepath.Join(s.config.BackupDirectory, status.LastSuccess.FileName)
		info, statErr := os.Stat(backupPath)
		if errors.Is(statErr, os.ErrNotExist) {
			s.status = persistedStatus{}
			return s.persistStatus(nil)
		}
		if statErr != nil {
			return fmt.Errorf("stat indexed full backup: %w", statErr)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("indexed full backup is not a regular file")
		}
	}
	s.status = status
	return nil
}

func (s *Service) persistStatus(latest *BackupInfo) error {
	encoded, err := json.Marshal(persistedStatus{LastSuccess: latest})
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(s.config.BackupDirectory, ".full-backup-status-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0600); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := writeAll(temporary, encoded); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryPath, filepath.Join(s.config.BackupDirectory, statusFileName)); err != nil {
		return err
	}
	return syncDirectory(s.config.BackupDirectory)
}

func (s *Service) enforceRetention(currentFileName string) (int, error) {
	entries, err := os.ReadDir(s.config.BackupDirectory)
	if err != nil {
		return 0, err
	}
	files := []os.DirEntry{}
	for _, entry := range entries {
		if entry.IsDir() || !validBackupFileName(entry.Name()) {
			continue
		}
		files = append(files, entry)
	}
	sort.Slice(files, func(i, j int) bool {
		if files[i].Name() == currentFileName {
			return true
		}
		if files[j].Name() == currentFileName {
			return false
		}
		return files[i].Name() > files[j].Name()
	})
	removed := 0
	errList := []error{}
	for index := s.config.RetentionCount; index < len(files); index++ {
		if files[index].Name() == currentFileName {
			continue
		}
		if err := os.Remove(filepath.Join(s.config.BackupDirectory, files[index].Name())); err != nil {
			errList = append(errList, err)
			continue
		}
		removed++
	}
	if removed > 0 {
		if err := syncDirectory(s.config.BackupDirectory); err != nil {
			errList = append(errList, err)
		}
	}
	return removed, errors.Join(errList...)
}

func validateServicePaths(databasePath string, mediaDirectory string, backupDirectory string) error {
	database, err := filepath.Abs(databasePath)
	if err != nil {
		return err
	}
	media, err := filepath.Abs(mediaDirectory)
	if err != nil {
		return err
	}
	backup, err := filepath.Abs(backupDirectory)
	if err != nil {
		return err
	}
	if pathWithin(database, backup) {
		return fmt.Errorf("database file must not be stored inside full backup directory")
	}
	if pathWithin(backup, media) || pathWithin(media, backup) {
		return fmt.Errorf("media and full backup directories must not overlap")
	}
	return nil
}

func pathWithin(candidate string, parent string) bool {
	relative, err := filepath.Rel(parent, candidate)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator)))
}

func quoteSQLiteString(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func randomSuffix() (string, error) {
	var value [4]byte
	if _, err := io.ReadFull(rand.Reader, value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}

func validBackupFileName(value string) bool {
	return strings.HasPrefix(value, backupFilePrefix) && strings.HasSuffix(value, backupFileSuffix) && filepath.Base(value) == value
}

func syncDirectory(directory string) error {
	file, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer file.Close()
	err = file.Sync()
	if errors.Is(err, syscall.EINVAL) || errors.Is(err, syscall.ENOTSUP) || errors.Is(err, syscall.EBADF) {
		return nil
	}
	return err
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneBackupInfo(value *BackupInfo) *BackupInfo {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

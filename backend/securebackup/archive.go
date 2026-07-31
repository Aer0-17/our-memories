package securebackup

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	FullBackupFormat  = "our-memories-full-backup"
	FullBackupVersion = 1
	manifestPath      = "manifest.json"
	databaseEntryPath = "database/ourMemories.db"
	maximumEntries    = 1_000_000
	maximumManifest   = 16 << 20
)

type ManifestEntry struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type Manifest struct {
	Format                      string          `json:"format"`
	Version                     int             `json:"version"`
	CreatedAt                   time.Time       `json:"createdAt"`
	Encryption                  string          `json:"encryption"`
	DatabasePath                string          `json:"databasePath"`
	DatabaseBytes               int64           `json:"databaseBytes"`
	MediaRoot                   string          `json:"mediaRoot"`
	MediaFiles                  int             `json:"mediaFiles"`
	MediaBytes                  int64           `json:"mediaBytes"`
	RemoteObjectStorageExcluded bool            `json:"remoteObjectStorageExcluded"`
	Entries                     []ManifestEntry `json:"entries"`
}

type archiveSource struct {
	DiskPath    string
	ArchivePath string
	Media       bool
}

func WriteEncryptedArchive(
	destination io.Writer,
	key []byte,
	databaseSnapshotPath string,
	mediaDirectory string,
	createdAt time.Time,
	remoteObjectStorageExcluded bool,
) (Manifest, error) {
	sources, err := collectArchiveSources(databaseSnapshotPath, mediaDirectory)
	if err != nil {
		return Manifest{}, err
	}

	encrypted, err := NewEncryptWriter(destination, key)
	if err != nil {
		return Manifest{}, err
	}
	compressed := gzip.NewWriter(encrypted)
	archive := tar.NewWriter(compressed)

	manifest := Manifest{
		Format:                      FullBackupFormat,
		Version:                     FullBackupVersion,
		CreatedAt:                   createdAt.UTC(),
		Encryption:                  "AES-256-GCM-CHUNKED",
		DatabasePath:                databaseEntryPath,
		MediaRoot:                   "media",
		RemoteObjectStorageExcluded: remoteObjectStorageExcluded,
		Entries:                     make([]ManifestEntry, 0, len(sources)),
	}

	writeErr := func() error {
		for _, source := range sources {
			entry, err := writeArchiveFile(archive, source)
			if err != nil {
				return err
			}
			manifest.Entries = append(manifest.Entries, entry)
			if source.Media {
				manifest.MediaFiles++
				manifest.MediaBytes += entry.Size
			} else {
				manifest.DatabaseBytes = entry.Size
			}
		}

		encoded, err := json.Marshal(manifest)
		if err != nil {
			return err
		}
		header := &tar.Header{
			Name:     manifestPath,
			Mode:     0600,
			Size:     int64(len(encoded)),
			ModTime:  manifest.CreatedAt,
			Typeflag: tar.TypeReg,
			Format:   tar.FormatPAX,
		}
		if err := archive.WriteHeader(header); err != nil {
			return err
		}
		if _, err := archive.Write(encoded); err != nil {
			return err
		}
		return nil
	}()

	closeErr := errors.Join(archive.Close(), compressed.Close(), encrypted.Close())
	if writeErr != nil {
		return Manifest{}, writeErr
	}
	if closeErr != nil {
		return Manifest{}, closeErr
	}
	return manifest, nil
}

func collectArchiveSources(databaseSnapshotPath string, mediaDirectory string) ([]archiveSource, error) {
	databaseInfo, err := os.Stat(databaseSnapshotPath)
	if err != nil {
		return nil, fmt.Errorf("stat database snapshot: %w", err)
	}
	if !databaseInfo.Mode().IsRegular() {
		return nil, fmt.Errorf("database snapshot is not a regular file")
	}

	sources := []archiveSource{{
		DiskPath:    databaseSnapshotPath,
		ArchivePath: databaseEntryPath,
	}}
	mediaInfo, err := os.Stat(mediaDirectory)
	if errors.Is(err, os.ErrNotExist) {
		return sources, nil
	}
	if err != nil {
		return nil, fmt.Errorf("stat media directory: %w", err)
	}
	if !mediaInfo.IsDir() {
		return nil, fmt.Errorf("media path is not a directory")
	}

	err = filepath.WalkDir(mediaDirectory, func(filePath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("media directory contains unsupported symbolic link: %s", filePath)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("media directory contains unsupported file type: %s", filePath)
		}
		relative, err := filepath.Rel(mediaDirectory, filePath)
		if err != nil {
			return err
		}
		archivePath := path.Join("media", filepath.ToSlash(relative))
		if err := validateArchivePath(archivePath); err != nil {
			return err
		}
		sources = append(sources, archiveSource{
			DiskPath:    filePath,
			ArchivePath: archivePath,
			Media:       true,
		})
		if len(sources) > maximumEntries {
			return fmt.Errorf("backup contains too many files")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(sources[1:], func(i, j int) bool {
		return sources[i+1].ArchivePath < sources[j+1].ArchivePath
	})
	return sources, nil
}

func writeArchiveFile(archive *tar.Writer, source archiveSource) (ManifestEntry, error) {
	file, err := os.Open(source.DiskPath)
	if err != nil {
		return ManifestEntry{}, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return ManifestEntry{}, err
	}
	if !info.Mode().IsRegular() {
		return ManifestEntry{}, fmt.Errorf("backup source changed file type: %s", source.DiskPath)
	}
	header := &tar.Header{
		Name:     source.ArchivePath,
		Mode:     0600,
		Size:     info.Size(),
		ModTime:  info.ModTime().UTC(),
		Typeflag: tar.TypeReg,
		Format:   tar.FormatPAX,
	}
	if err := archive.WriteHeader(header); err != nil {
		return ManifestEntry{}, err
	}
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(archive, hash), file)
	if err != nil {
		return ManifestEntry{}, err
	}
	if written != info.Size() {
		return ManifestEntry{}, fmt.Errorf("backup source changed while being read: %s", source.DiskPath)
	}
	return ManifestEntry{
		Path:   source.ArchivePath,
		Size:   written,
		SHA256: hex.EncodeToString(hash.Sum(nil)),
	}, nil
}

func VerifyEncryptedArchive(source io.Reader, key []byte) (Manifest, error) {
	decrypted, err := NewDecryptReader(source, key)
	if err != nil {
		return Manifest{}, err
	}
	compressed, err := gzip.NewReader(decrypted)
	if err != nil {
		return Manifest{}, fmt.Errorf("open compressed backup: %w", err)
	}
	archive := tar.NewReader(compressed)

	actual := map[string]ManifestEntry{}
	var manifest Manifest
	manifestFound := false
	entryCount := 0
	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return Manifest{}, fmt.Errorf("read backup archive: %w", err)
		}
		entryCount++
		if entryCount > maximumEntries+1 {
			return Manifest{}, fmt.Errorf("backup archive contains too many entries")
		}
		if err := validateRegularArchiveHeader(header); err != nil {
			return Manifest{}, err
		}
		if header.Name == manifestPath {
			if manifestFound {
				return Manifest{}, fmt.Errorf("backup archive contains duplicate manifest")
			}
			if header.Size > maximumManifest {
				return Manifest{}, fmt.Errorf("backup manifest is too large")
			}
			encoded, err := io.ReadAll(io.LimitReader(archive, maximumManifest+1))
			if err != nil {
				return Manifest{}, err
			}
			if int64(len(encoded)) != header.Size {
				return Manifest{}, fmt.Errorf("backup manifest is truncated")
			}
			if err := json.Unmarshal(encoded, &manifest); err != nil {
				return Manifest{}, fmt.Errorf("decode backup manifest: %w", err)
			}
			manifestFound = true
			continue
		}
		if _, exists := actual[header.Name]; exists {
			return Manifest{}, fmt.Errorf("backup archive contains duplicate entry: %s", header.Name)
		}
		hash := sha256.New()
		written, err := io.Copy(hash, archive)
		if err != nil {
			return Manifest{}, err
		}
		if written != header.Size {
			return Manifest{}, fmt.Errorf("backup entry is truncated: %s", header.Name)
		}
		actual[header.Name] = ManifestEntry{
			Path:   header.Name,
			Size:   written,
			SHA256: hex.EncodeToString(hash.Sum(nil)),
		}
	}
	if _, err := io.Copy(io.Discard, compressed); err != nil {
		return Manifest{}, fmt.Errorf("finish compressed backup verification: %w", err)
	}
	if err := compressed.Close(); err != nil {
		return Manifest{}, err
	}
	if _, err := io.Copy(io.Discard, decrypted); err != nil {
		return Manifest{}, err
	}

	if !manifestFound {
		return Manifest{}, fmt.Errorf("backup archive is missing manifest")
	}
	if err := validateManifest(manifest, actual); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifest(manifest Manifest, actual map[string]ManifestEntry) error {
	if manifest.Format != FullBackupFormat || manifest.Version != FullBackupVersion {
		return fmt.Errorf("unsupported full backup format or version")
	}
	if manifest.Encryption != "AES-256-GCM-CHUNKED" {
		return fmt.Errorf("backup manifest encryption marker is invalid")
	}
	if manifest.DatabasePath != databaseEntryPath {
		return fmt.Errorf("backup manifest database path is invalid")
	}
	if _, exists := actual[databaseEntryPath]; !exists {
		return fmt.Errorf("backup archive is missing database snapshot")
	}
	if len(manifest.Entries) != len(actual) {
		return fmt.Errorf("backup manifest entry count does not match archive")
	}
	seen := map[string]bool{}
	for _, expected := range manifest.Entries {
		if seen[expected.Path] {
			return fmt.Errorf("backup manifest contains duplicate entry: %s", expected.Path)
		}
		seen[expected.Path] = true
		current, exists := actual[expected.Path]
		if !exists || current.Size != expected.Size || current.SHA256 != expected.SHA256 {
			return fmt.Errorf("backup entry integrity check failed: %s", expected.Path)
		}
	}
	database := actual[databaseEntryPath]
	if manifest.DatabaseBytes != database.Size {
		return fmt.Errorf("backup database size does not match manifest")
	}
	mediaFiles := 0
	var mediaBytes int64
	for archivePath, entry := range actual {
		if strings.HasPrefix(archivePath, "media/") {
			mediaFiles++
			mediaBytes += entry.Size
		}
	}
	if manifest.MediaFiles != mediaFiles || manifest.MediaBytes != mediaBytes {
		return fmt.Errorf("backup media totals do not match manifest")
	}
	return nil
}

func ExtractEncryptedArchive(source io.Reader, key []byte, destinationDirectory string) (Manifest, error) {
	root, err := filepath.Abs(destinationDirectory)
	if err != nil {
		return Manifest{}, err
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		return Manifest{}, err
	}
	if err := os.Chmod(root, 0700); err != nil {
		return Manifest{}, err
	}

	decrypted, err := NewDecryptReader(source, key)
	if err != nil {
		return Manifest{}, err
	}
	compressed, err := gzip.NewReader(decrypted)
	if err != nil {
		return Manifest{}, err
	}
	archive := tar.NewReader(compressed)
	var manifest Manifest
	manifestFound := false
	actual := map[string]ManifestEntry{}
	entryCount := 0
	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return Manifest{}, err
		}
		entryCount++
		if entryCount > maximumEntries+1 {
			return Manifest{}, fmt.Errorf("backup archive contains too many entries")
		}
		if err := validateRegularArchiveHeader(header); err != nil {
			return Manifest{}, err
		}
		if header.Name == manifestPath {
			if manifestFound {
				return Manifest{}, fmt.Errorf("backup archive contains duplicate manifest")
			}
			if header.Size > maximumManifest {
				return Manifest{}, fmt.Errorf("backup manifest is too large")
			}
		} else if _, exists := actual[header.Name]; exists {
			return Manifest{}, fmt.Errorf("backup archive contains duplicate entry: %s", header.Name)
		}
		target, err := safeExtractionPath(root, header.Name)
		if err != nil {
			return Manifest{}, err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return Manifest{}, err
		}
		file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return Manifest{}, err
		}
		hash := sha256.New()
		writer := io.Writer(file)
		if header.Name != manifestPath {
			writer = io.MultiWriter(file, hash)
		}
		written, copyErr := io.Copy(writer, archive)
		closeErr := file.Close()
		if copyErr != nil {
			return Manifest{}, copyErr
		}
		if closeErr != nil {
			return Manifest{}, closeErr
		}
		if written != header.Size {
			return Manifest{}, fmt.Errorf("backup entry is truncated: %s", header.Name)
		}
		if header.Name == manifestPath {
			encoded, err := os.ReadFile(target)
			if err != nil {
				return Manifest{}, err
			}
			if err := json.Unmarshal(encoded, &manifest); err != nil {
				return Manifest{}, err
			}
			manifestFound = true
		} else {
			actual[header.Name] = ManifestEntry{
				Path:   header.Name,
				Size:   written,
				SHA256: hex.EncodeToString(hash.Sum(nil)),
			}
		}
	}
	if _, err := io.Copy(io.Discard, compressed); err != nil {
		return Manifest{}, err
	}
	if err := compressed.Close(); err != nil {
		return Manifest{}, err
	}
	if _, err := io.Copy(io.Discard, decrypted); err != nil {
		return Manifest{}, err
	}
	if !manifestFound {
		return Manifest{}, fmt.Errorf("backup archive is missing manifest")
	}
	if err := validateManifest(manifest, actual); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateRegularArchiveHeader(header *tar.Header) error {
	if header == nil || header.Typeflag != tar.TypeReg {
		return fmt.Errorf("backup archive contains unsupported entry type")
	}
	if header.Size < 0 {
		return fmt.Errorf("backup archive contains invalid entry size")
	}
	return validateArchivePath(header.Name)
}

func validateArchivePath(value string) error {
	if value == "" || strings.Contains(value, "\\") || path.IsAbs(value) {
		return fmt.Errorf("backup archive contains unsafe path")
	}
	cleaned := path.Clean(value)
	if cleaned != value || cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return fmt.Errorf("backup archive contains unsafe path")
	}
	return nil
}

func safeExtractionPath(root string, archivePath string) (string, error) {
	if err := validateArchivePath(archivePath); err != nil {
		return "", err
	}
	target, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(archivePath)))
	if err != nil {
		return "", err
	}
	if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("backup archive path escapes extraction directory")
	}
	return target, nil
}

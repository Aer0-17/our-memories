package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"our-memories-backend/repositories"
	"our-memories-backend/storage"
)

const (
	BackupFormat  = "our-memories-backup"
	BackupVersion = 1
)

var (
	ErrBackupSpaceNotFound = errors.New("backup space not found")
	ErrUnsupportedBackup   = errors.New("unsupported backup format")
	ErrBackupSpaceMissing  = errors.New("backup space is missing")
)

type BackupPayload struct {
	Format     string                 `json:"format"`
	Version    int                    `json:"version"`
	ExportedAt string                 `json:"exportedAt"`
	Source     BackupSource           `json:"source"`
	Space      repositories.BackupRow `json:"space"`
	Tables     BackupTableRows        `json:"tables"`
	Media      []BackupMediaReference `json:"media"`
}

type BackupTableRows map[string][]repositories.BackupRow

type BackupSource struct {
	SpaceID   string `json:"spaceId"`
	SpaceCode string `json:"spaceCode"`
	Name      string `json:"name"`
}

type BackupMediaReference struct {
	Kind     string `json:"kind"`
	ParentID string `json:"parentId,omitempty"`
	ID       string `json:"id,omitempty"`
	Key      string `json:"key,omitempty"`
	URL      string `json:"url,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

type BackupExportResult struct {
	Payload  BackupPayload
	Filename string
}

type BackupImportResult struct {
	SpaceID         string
	SpaceCode       string
	ReloginRequired bool
	CacheSpaceIDs   []string
}

type BackupService struct {
	repo *repositories.BackupRepository
}

func NewBackupService(repo *repositories.BackupRepository) *BackupService {
	return &BackupService{repo: repo}
}

func (s *BackupService) Export(spaceID string) (BackupExportResult, error) {
	spaceRows, err := s.repo.QueryRows(`SELECT * FROM spaces WHERE id = ?`, spaceID)
	if err != nil {
		return BackupExportResult{}, err
	}
	if len(spaceRows) == 0 {
		return BackupExportResult{}, ErrBackupSpaceNotFound
	}

	payload := BackupPayload{
		Format:     BackupFormat,
		Version:    BackupVersion,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Space:      spaceRows[0],
		Tables:     BackupTableRows{},
	}
	payload.Source = BackupSource{
		SpaceID:   BackupString(payload.Space["id"]),
		SpaceCode: BackupString(payload.Space["space_code"]),
		Name:      BackupString(payload.Space["name"]),
	}

	for _, spec := range backupTableSpecs {
		rows, err := s.repo.QueryRows(spec.Query, spaceID)
		if err != nil {
			return BackupExportResult{}, err
		}
		payload.Tables[spec.Name] = rows
	}
	payload.Media = collectBackupMedia(payload.Tables)

	filename := fmt.Sprintf("our-memories-%s-%s.json", payload.Source.SpaceCode, time.Now().UTC().Format("20060102T150405Z"))
	return BackupExportResult{
		Payload:  payload,
		Filename: SanitizeBackupFilename(filename),
	}, nil
}

func (s *BackupService) Import(currentSpaceID string, isAdmin bool, payload BackupPayload) (BackupImportResult, error) {
	if payload.Format != BackupFormat || payload.Version != BackupVersion {
		return BackupImportResult{}, ErrUnsupportedBackup
	}
	backupSpaceID := BackupString(payload.Space["id"])
	if backupSpaceID == "" {
		return BackupImportResult{}, ErrBackupSpaceMissing
	}
	if payload.Tables == nil {
		payload.Tables = BackupTableRows{}
	}

	rewriteBackupMediaURLs(&payload)
	spaceCode := BackupString(payload.Space["space_code"])
	if err := s.repo.Restore(currentSpaceID, isAdmin, backupSpaceID, spaceCode, payload.Space, payload.Tables, backupImportOrder); err != nil {
		return BackupImportResult{}, err
	}

	cacheSpaceIDs := []string{backupSpaceID}
	if !isAdmin {
		cacheSpaceIDs = append(cacheSpaceIDs, currentSpaceID)
	}
	return BackupImportResult{
		SpaceID:         backupSpaceID,
		SpaceCode:       spaceCode,
		ReloginRequired: !isAdmin && backupSpaceID != currentSpaceID,
		CacheSpaceIDs:   uniqueBackupStrings(cacheSpaceIDs),
	}, nil
}

var backupTableSpecs = []repositories.BackupTableSpec{
	{
		Name:  "users",
		Query: `SELECT * FROM users WHERE space_id = ? ORDER BY username, id`,
	},
	{
		Name:  "memories",
		Query: `SELECT * FROM memories WHERE space_id = ? ORDER BY date, created_at, id`,
	},
	{
		Name: "memory_photos",
		Query: `SELECT p.* FROM memory_photos p
			JOIN memories m ON m.id = p.memory_id
			WHERE m.space_id = ?
			ORDER BY p.memory_id, p.sort_order, p.id`,
	},
	{
		Name:  "anniversary_cards",
		Query: `SELECT * FROM anniversary_cards WHERE space_id = ? ORDER BY sort_order, date, id`,
	},
	{
		Name: "anniversary_photos",
		Query: `SELECT p.* FROM anniversary_photos p
			JOIN anniversary_cards a ON a.id = p.anniversary_card_id
			WHERE a.space_id = ?
			ORDER BY p.anniversary_card_id, p.sort_order, p.id`,
	},
	{
		Name:  "settings",
		Query: `SELECT * FROM settings WHERE space_id = ? ORDER BY key, id`,
	},
	{
		Name:  "auxiliary_items",
		Query: `SELECT * FROM auxiliary_items WHERE space_id = ? ORDER BY created_at, id`,
	},
	{
		Name:  "whispers",
		Query: `SELECT * FROM whispers WHERE space_id = ? ORDER BY created_at, id`,
	},
	{
		Name: "whisper_replies",
		Query: `SELECT r.* FROM whisper_replies r
			JOIN whispers w ON w.id = r.whisper_id
			WHERE w.space_id = ?
			ORDER BY r.whisper_id, r.created_at, r.id`,
	},
	{
		Name:  "time_capsules",
		Query: `SELECT * FROM time_capsules WHERE space_id = ? ORDER BY open_date, created_at, id`,
	},
	{
		Name: "time_capsule_photos",
		Query: `SELECT p.* FROM time_capsule_photos p
			JOIN time_capsules t ON t.id = p.time_capsule_id
			WHERE t.space_id = ?
			ORDER BY p.time_capsule_id, p.sort_order, p.id`,
	},
	{
		Name:  "orders",
		Query: `SELECT * FROM orders WHERE space_id = ? ORDER BY created_at, id`,
	},
}

var backupImportOrder = []string{
	"users",
	"memories",
	"memory_photos",
	"anniversary_cards",
	"anniversary_photos",
	"settings",
	"auxiliary_items",
	"whispers",
	"whisper_replies",
	"time_capsules",
	"time_capsule_photos",
	"orders",
}

func collectBackupMedia(tables map[string][]repositories.BackupRow) []BackupMediaReference {
	seen := map[string]bool{}
	media := []BackupMediaReference{}

	add := func(ref BackupMediaReference) {
		if ref.Key == "" && ref.URL != "" {
			ref.Key = storage.KeyFromURL(ref.URL)
		}
		if ref.Key == "" && ref.URL == "" {
			return
		}
		identity := ref.Kind + "\x00" + ref.Key + "\x00" + ref.URL
		if seen[identity] {
			return
		}
		seen[identity] = true
		media = append(media, ref)
	}

	for _, row := range tables["memory_photos"] {
		add(BackupMediaReference{
			Kind:     "memory_photo",
			ParentID: BackupString(row["memory_id"]),
			ID:       BackupString(row["id"]),
			Key:      BackupString(row["key"]),
			URL:      BackupString(row["url"]),
			MimeType: BackupString(row["mime_type"]),
		})
	}
	for _, row := range tables["anniversary_photos"] {
		add(BackupMediaReference{
			Kind:     "anniversary_photo",
			ParentID: BackupString(row["anniversary_card_id"]),
			ID:       BackupString(row["id"]),
			Key:      BackupString(row["key"]),
			URL:      BackupString(row["url"]),
			MimeType: BackupString(row["mime_type"]),
		})
	}
	for _, row := range tables["time_capsule_photos"] {
		add(BackupMediaReference{
			Kind:     "time_capsule_photo",
			ParentID: BackupString(row["time_capsule_id"]),
			ID:       BackupString(row["id"]),
			Key:      BackupString(row["key"]),
			URL:      BackupString(row["url"]),
			MimeType: BackupString(row["mime_type"]),
		})
	}
	for _, row := range tables["settings"] {
		for _, ref := range mediaFromSettingValue(BackupString(row["key"]), BackupString(row["value"])) {
			add(ref)
		}
	}

	sort.Slice(media, func(i, j int) bool {
		if media[i].Kind != media[j].Kind {
			return media[i].Kind < media[j].Kind
		}
		if media[i].ParentID != media[j].ParentID {
			return media[i].ParentID < media[j].ParentID
		}
		if media[i].Key != media[j].Key {
			return media[i].Key < media[j].Key
		}
		return media[i].URL < media[j].URL
	})
	return media
}

func mediaFromSettingValue(settingKey, valueJSON string) []BackupMediaReference {
	var value interface{}
	if valueJSON == "" || json.Unmarshal([]byte(valueJSON), &value) != nil {
		return nil
	}

	refs := []BackupMediaReference{}
	var walk func(interface{})
	walk = func(value interface{}) {
		switch v := value.(type) {
		case string:
			key := storage.KeyFromURL(v)
			if key != "" || strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
				refs = append(refs, BackupMediaReference{Kind: "setting:" + settingKey, Key: key, URL: v})
			}
		case []interface{}:
			for _, item := range v {
				walk(item)
			}
		case map[string]interface{}:
			for _, item := range v {
				walk(item)
			}
		}
	}
	walk(value)
	return refs
}

func rewriteBackupMediaURLs(payload *BackupPayload) {
	oldToNewURL := map[string]string{}
	for _, ref := range payload.Media {
		if ref.Key == "" || ref.URL == "" {
			continue
		}
		if newURL := storage.PublicURLForKey(ref.Key); newURL != "" {
			oldToNewURL[ref.URL] = newURL
		}
	}

	for _, tableName := range []string{"memory_photos", "anniversary_photos", "time_capsule_photos"} {
		for _, row := range payload.Tables[tableName] {
			key := BackupString(row["key"])
			if key == "" {
				continue
			}
			if newURL := storage.PublicURLForKey(key); newURL != "" {
				if oldURL := BackupString(row["url"]); oldURL != "" {
					oldToNewURL[oldURL] = newURL
				}
				row["url"] = newURL
			}
		}
	}

	if len(oldToNewURL) == 0 {
		return
	}
	for _, row := range payload.Tables["settings"] {
		valueJSON := BackupString(row["value"])
		if valueJSON == "" {
			continue
		}
		if rewritten, ok := rewriteJSONStrings(valueJSON, oldToNewURL); ok {
			row["value"] = rewritten
		}
	}
}

func rewriteJSONStrings(valueJSON string, replacements map[string]string) (string, bool) {
	var value interface{}
	if json.Unmarshal([]byte(valueJSON), &value) != nil {
		return valueJSON, false
	}

	changed := false
	var rewrite func(interface{}) interface{}
	rewrite = func(value interface{}) interface{} {
		switch v := value.(type) {
		case string:
			if replacement, ok := replacements[v]; ok {
				changed = true
				return replacement
			}
			return v
		case []interface{}:
			for i := range v {
				v[i] = rewrite(v[i])
			}
			return v
		case map[string]interface{}:
			for key, item := range v {
				v[key] = rewrite(item)
			}
			return v
		default:
			return v
		}
	}

	value = rewrite(value)
	if !changed {
		return valueJSON, false
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return valueJSON, false
	}
	return string(encoded), true
}

func BackupString(value interface{}) string {
	switch v := value.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	case nil:
		return ""
	default:
		return fmt.Sprint(v)
	}
}

func SanitizeBackupFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "our-memories-backup.json"
	}
	replacer := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "-", "?", "-", `"`, "-", "<", "-", ">", "-", "|", "-")
	return replacer.Replace(value)
}

func uniqueBackupStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

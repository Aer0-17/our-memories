package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

const (
	backupFormat  = "our-memories-backup"
	backupVersion = 1
)

type backupPayload struct {
	Format     string                 `json:"format"`
	Version    int                    `json:"version"`
	ExportedAt string                 `json:"exportedAt"`
	Source     backupSource           `json:"source"`
	Space      map[string]interface{} `json:"space"`
	Tables     map[string][]backupRow `json:"tables"`
	Media      []backupMediaReference `json:"media"`
}

type backupSource struct {
	SpaceID   string `json:"spaceId"`
	SpaceCode string `json:"spaceCode"`
	Name      string `json:"name"`
}

type backupMediaReference struct {
	Kind     string `json:"kind"`
	ParentID string `json:"parentId,omitempty"`
	ID       string `json:"id,omitempty"`
	Key      string `json:"key,omitempty"`
	URL      string `json:"url,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

type backupRow map[string]interface{}

type backupTableSpec struct {
	Name  string
	Query string
}

var backupTableSpecs = []backupTableSpec{
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

func ExportBackup(c *gin.Context) {
	exportBackup(c, c.GetString("spaceID"))
}

func AdminExportSpaceBackup(c *gin.Context) {
	exportBackup(c, c.Param("id"))
}

func exportBackup(c *gin.Context, spaceID string) {
	spaceRows, err := queryBackupRows(`SELECT * FROM spaces WHERE id = ?`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to export backup")
		return
	}
	if len(spaceRows) == 0 {
		utils.Error(c, 404, "Space not found")
		return
	}

	payload := backupPayload{
		Format:     backupFormat,
		Version:    backupVersion,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Space:      spaceRows[0],
		Tables:     map[string][]backupRow{},
	}
	payload.Source = backupSource{
		SpaceID:   backupString(payload.Space["id"]),
		SpaceCode: backupString(payload.Space["space_code"]),
		Name:      backupString(payload.Space["name"]),
	}

	for _, spec := range backupTableSpecs {
		rows, err := queryBackupRows(spec.Query, spaceID)
		if err != nil {
			utils.Error(c, 500, "Failed to export backup")
			return
		}
		payload.Tables[spec.Name] = rows
	}
	payload.Media = collectBackupMedia(payload.Tables)

	filename := fmt.Sprintf("our-memories-%s-%s.json", payload.Source.SpaceCode, time.Now().UTC().Format("20060102T150405Z"))
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, sanitizeBackupFilename(filename)))
	c.JSON(200, payload)
}

func ImportBackup(c *gin.Context) {
	importBackup(c, c.GetString("spaceID"), false)
}

func AdminImportBackup(c *gin.Context) {
	importBackup(c, "", true)
}

func importBackup(c *gin.Context, currentSpaceID string, isAdmin bool) {
	var payload backupPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.Error(c, 400, "Invalid backup file")
		return
	}
	if payload.Format != backupFormat || payload.Version != backupVersion {
		utils.Error(c, 400, "Unsupported backup format")
		return
	}
	backupSpaceID := backupString(payload.Space["id"])
	if backupSpaceID == "" {
		utils.Error(c, 400, "Backup space is missing")
		return
	}

	rewriteBackupMediaURLs(&payload)

	tx, err := db.DB.Begin()
	if err != nil {
		utils.Error(c, 500, "Failed to import backup")
		return
	}
	defer tx.Rollback()

	spacesToDelete := []string{}
	if isAdmin {
		spacesToDelete = append(spacesToDelete, backupSpaceID)
		conflictingSpaceIDs, err := spaceIDsByCode(tx, backupString(payload.Space["space_code"]), backupSpaceID)
		if err != nil {
			utils.Error(c, 500, "Failed to import backup")
			return
		}
		spacesToDelete = append(spacesToDelete, conflictingSpaceIDs...)
	} else {
		spacesToDelete = append(spacesToDelete, currentSpaceID)
	}

	if !isAdmin && backupSpaceID != currentSpaceID {
		exists, err := spaceExists(tx, backupSpaceID)
		if err != nil {
			utils.Error(c, 500, "Failed to import backup")
			return
		}
		if exists {
			utils.Error(c, 409, "Backup space already exists; please log in to that space before importing again")
			return
		}
	}

	for _, spaceID := range uniqueBackupStrings(spacesToDelete) {
		if err := deleteSpaceForBackupImport(tx, spaceID); err != nil {
			utils.Error(c, 500, "Failed to clear existing data")
			return
		}
	}
	if err := insertBackupRows(tx, "spaces", []backupRow{payload.Space}); err != nil {
		utils.Error(c, 500, "Failed to restore space")
		return
	}
	for _, tableName := range backupImportOrder {
		if err := insertBackupRows(tx, tableName, payload.Tables[tableName]); err != nil {
			utils.Error(c, 500, "Failed to restore "+tableName)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		utils.Error(c, 500, "Failed to import backup")
		return
	}

	if isAdmin {
		logAuditAction(c.GetString("adminID"), "import_backup", "space", backupSpaceID, gin.H{
			"spaceCode": backupString(payload.Space["space_code"]),
		})
	} else {
		clearBackupCaches(currentSpaceID)
	}
	clearBackupCaches(backupSpaceID)
	utils.Success(c, gin.H{
		"ok":              true,
		"spaceId":         backupSpaceID,
		"spaceCode":       backupString(payload.Space["space_code"]),
		"reloginRequired": !isAdmin && backupSpaceID != currentSpaceID,
	})
}

func queryBackupRows(query string, args ...interface{}) ([]backupRow, error) {
	rows, err := db.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	result := []backupRow{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		targets := make([]interface{}, len(columns))
		for i := range values {
			targets[i] = &values[i]
		}
		if err := rows.Scan(targets...); err != nil {
			return nil, err
		}

		row := backupRow{}
		for i, column := range columns {
			row[column] = normalizeBackupValue(values[i])
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func normalizeBackupValue(value interface{}) interface{} {
	switch v := value.(type) {
	case nil:
		return nil
	case []byte:
		return string(v)
	case time.Time:
		return v.UTC().Format(time.RFC3339)
	default:
		return v
	}
}

func collectBackupMedia(tables map[string][]backupRow) []backupMediaReference {
	seen := map[string]bool{}
	media := []backupMediaReference{}

	add := func(ref backupMediaReference) {
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
		add(backupMediaReference{
			Kind:     "memory_photo",
			ParentID: backupString(row["memory_id"]),
			ID:       backupString(row["id"]),
			Key:      backupString(row["key"]),
			URL:      backupString(row["url"]),
			MimeType: backupString(row["mime_type"]),
		})
	}
	for _, row := range tables["anniversary_photos"] {
		add(backupMediaReference{
			Kind:     "anniversary_photo",
			ParentID: backupString(row["anniversary_card_id"]),
			ID:       backupString(row["id"]),
			Key:      backupString(row["key"]),
			URL:      backupString(row["url"]),
			MimeType: backupString(row["mime_type"]),
		})
	}
	for _, row := range tables["time_capsule_photos"] {
		add(backupMediaReference{
			Kind:     "time_capsule_photo",
			ParentID: backupString(row["time_capsule_id"]),
			ID:       backupString(row["id"]),
			Key:      backupString(row["key"]),
			URL:      backupString(row["url"]),
			MimeType: backupString(row["mime_type"]),
		})
	}
	for _, row := range tables["settings"] {
		for _, ref := range mediaFromSettingValue(backupString(row["key"]), backupString(row["value"])) {
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

func mediaFromSettingValue(settingKey, valueJSON string) []backupMediaReference {
	var value interface{}
	if valueJSON == "" || json.Unmarshal([]byte(valueJSON), &value) != nil {
		return nil
	}

	refs := []backupMediaReference{}
	var walk func(interface{})
	walk = func(value interface{}) {
		switch v := value.(type) {
		case string:
			key := storage.KeyFromURL(v)
			if key != "" || strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
				refs = append(refs, backupMediaReference{Kind: "setting:" + settingKey, Key: key, URL: v})
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

func rewriteBackupMediaURLs(payload *backupPayload) {
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
			key := backupString(row["key"])
			if key == "" {
				continue
			}
			if newURL := storage.PublicURLForKey(key); newURL != "" {
				if oldURL := backupString(row["url"]); oldURL != "" {
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
		valueJSON := backupString(row["value"])
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

func spaceExists(tx *sql.Tx, spaceID string) (bool, error) {
	var existing string
	err := tx.QueryRow(`SELECT id FROM spaces WHERE id = ?`, spaceID).Scan(&existing)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func spaceIDsByCode(tx *sql.Tx, spaceCode string, exceptSpaceID string) ([]string, error) {
	if spaceCode == "" {
		return nil, nil
	}
	rows, err := tx.Query(`SELECT id FROM spaces WHERE space_code = ? AND id != ?`, spaceCode, exceptSpaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func deleteSpaceForBackupImport(tx *sql.Tx, spaceID string) error {
	if spaceID == "" {
		return nil
	}
	statements := []string{
		`DELETE FROM memory_photos WHERE memory_id IN (SELECT id FROM memories WHERE space_id = ?)`,
		`DELETE FROM anniversary_photos WHERE anniversary_card_id IN (SELECT id FROM anniversary_cards WHERE space_id = ?)`,
		`DELETE FROM time_capsule_photos WHERE time_capsule_id IN (SELECT id FROM time_capsules WHERE space_id = ?)`,
		`DELETE FROM whisper_replies WHERE whisper_id IN (SELECT id FROM whispers WHERE space_id = ?)`,
		`DELETE FROM orders WHERE space_id = ?`,
		`DELETE FROM settings WHERE space_id = ?`,
		`DELETE FROM auxiliary_items WHERE space_id = ?`,
		`DELETE FROM time_capsules WHERE space_id = ?`,
		`DELETE FROM whispers WHERE space_id = ?`,
		`DELETE FROM anniversary_cards WHERE space_id = ?`,
		`DELETE FROM memories WHERE space_id = ?`,
		`DELETE FROM users WHERE space_id = ?`,
		`DELETE FROM spaces WHERE id = ?`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(statement, spaceID); err != nil {
			return err
		}
	}
	return nil
}

func insertBackupRows(tx *sql.Tx, tableName string, rows []backupRow) error {
	if len(rows) == 0 {
		return nil
	}

	tableColumns, err := backupTableColumns(tx, tableName)
	if err != nil {
		return err
	}
	for _, row := range rows {
		columns := []string{}
		args := []interface{}{}
		for _, column := range tableColumns {
			if value, ok := row[column]; ok {
				columns = append(columns, column)
				args = append(args, value)
			}
		}
		if len(columns) == 0 {
			continue
		}

		quotedColumns := make([]string, len(columns))
		placeholders := make([]string, len(columns))
		for i, column := range columns {
			quotedColumns[i] = quoteBackupIdent(column)
			placeholders[i] = "?"
		}
		query := fmt.Sprintf(
			`INSERT INTO %s (%s) VALUES (%s)`,
			quoteBackupIdent(tableName),
			strings.Join(quotedColumns, ", "),
			strings.Join(placeholders, ", "),
		)
		if _, err := tx.Exec(query, args...); err != nil {
			return err
		}
	}
	return nil
}

func backupTableColumns(tx *sql.Tx, tableName string) ([]string, error) {
	rows, err := tx.Query(`PRAGMA table_info(` + quoteBackupIdent(tableName) + `)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := []string{}
	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, err
		}
		columns = append(columns, name)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return columns, nil
}

func quoteBackupIdent(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func backupString(value interface{}) string {
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

func sanitizeBackupFilename(value string) string {
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

func clearBackupCaches(spaceID string) {
	if spaceID == "" {
		return
	}
	clearMemoriesCache(spaceID)
	clearAnniversaryCardsCache(spaceID)
	clearCityAssetsCache(spaceID)
	clearTimeCapsulesCache(spaceID)
	cache.DeletePrefix("admin:")
}

package repositories

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

var ErrBackupSpaceAlreadyExists = errors.New("backup space already exists")

type BackupRow map[string]interface{}

type BackupTableSpec struct {
	Name  string
	Query string
}

type BackupRepository struct {
	db *gorm.DB
}

func NewBackupRepository(db *gorm.DB) *BackupRepository {
	return &BackupRepository{db: db}
}

func (r *BackupRepository) QueryRows(query string, args ...interface{}) ([]BackupRow, error) {
	rows, err := r.db.Raw(query, args...).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBackupRows(rows)
}

func (r *BackupRepository) Restore(
	currentSpaceID string,
	isAdmin bool,
	backupSpaceID string,
	spaceCode string,
	space BackupRow,
	tables map[string][]BackupRow,
	importOrder []string,
) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		spacesToDelete := []string{}
		if isAdmin {
			spacesToDelete = append(spacesToDelete, backupSpaceID)
			conflictingSpaceIDs, err := spaceIDsByCode(tx, spaceCode, backupSpaceID)
			if err != nil {
				return err
			}
			spacesToDelete = append(spacesToDelete, conflictingSpaceIDs...)
		} else {
			spacesToDelete = append(spacesToDelete, currentSpaceID)
		}

		if !isAdmin && backupSpaceID != currentSpaceID {
			exists, err := spaceExists(tx, backupSpaceID)
			if err != nil {
				return err
			}
			if exists {
				return ErrBackupSpaceAlreadyExists
			}
		}

		for _, spaceID := range uniqueBackupStrings(spacesToDelete) {
			if err := deleteSpaceForBackupImport(tx, spaceID); err != nil {
				return err
			}
		}
		if err := insertBackupRows(tx, "spaces", []BackupRow{space}); err != nil {
			return err
		}
		for _, tableName := range importOrder {
			if err := insertBackupRows(tx, tableName, tables[tableName]); err != nil {
				return err
			}
		}
		return nil
	})
}

func scanBackupRows(rows *sql.Rows) ([]BackupRow, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	result := []BackupRow{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		targets := make([]interface{}, len(columns))
		for i := range values {
			targets[i] = &values[i]
		}
		if err := rows.Scan(targets...); err != nil {
			return nil, err
		}

		row := BackupRow{}
		for i, column := range columns {
			row[column] = NormalizeBackupValue(values[i])
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func NormalizeBackupValue(value interface{}) interface{} {
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

func spaceExists(tx *gorm.DB, spaceID string) (bool, error) {
	var existing string
	err := tx.Raw(`SELECT id FROM spaces WHERE id = ?`, spaceID).Scan(&existing).Error
	if err != nil {
		return false, err
	}
	return existing != "", nil
}

func spaceIDsByCode(tx *gorm.DB, spaceCode string, exceptSpaceID string) ([]string, error) {
	if spaceCode == "" {
		return nil, nil
	}
	var ids []string
	err := tx.Raw(`SELECT id FROM spaces WHERE space_code = ? AND id != ?`, spaceCode, exceptSpaceID).Scan(&ids).Error
	return ids, err
}

func deleteSpaceForBackupImport(tx *gorm.DB, spaceID string) error {
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
		if err := tx.Exec(statement, spaceID).Error; err != nil {
			return err
		}
	}
	return nil
}

func insertBackupRows(tx *gorm.DB, tableName string, rows []BackupRow) error {
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
		if err := tx.Exec(query, args...).Error; err != nil {
			return err
		}
	}
	return nil
}

func backupTableColumns(tx *gorm.DB, tableName string) ([]string, error) {
	rows, err := tx.Raw(`PRAGMA table_info(` + quoteBackupIdent(tableName) + `)`).Rows()
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

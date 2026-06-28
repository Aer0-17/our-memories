package repositories

import (
	"fmt"

	"gorm.io/gorm"
)

type PhotoSyncTable struct {
	Name      string
	IDColumn  string
	JoinTable string
	JoinOn    string
}

type PhotoSyncRow struct {
	ID      string
	SpaceID string
	Key     string
	URL     string
}

type PhotoSyncRepository struct {
	db *gorm.DB
}

func NewPhotoSyncRepository(db *gorm.DB) *PhotoSyncRepository {
	return &PhotoSyncRepository{db: db}
}

func (r *PhotoSyncRepository) PendingRows(table PhotoSyncTable) ([]PhotoSyncRow, error) {
	rows, err := r.db.Raw(fmt.Sprintf(`
		SELECT %s.%s, %s.space_id, COALESCE(%s.key, ''), %s.url
		FROM %s
		JOIN %s ON %s
		WHERE %s.url LIKE 'data:image/%%'
		   OR %s.url LIKE '/local-images/%%'
		   OR %s.url LIKE 'http%%/local-images/%%'
		ORDER BY %s.%s
	`, table.Name, table.IDColumn, table.JoinTable, table.Name, table.Name, table.Name, table.JoinTable, table.JoinOn, table.Name, table.Name, table.Name, table.Name, table.IDColumn)).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pending := []PhotoSyncRow{}
	for rows.Next() {
		var row PhotoSyncRow
		if err := rows.Scan(&row.ID, &row.SpaceID, &row.Key, &row.URL); err != nil {
			return nil, err
		}
		pending = append(pending, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return pending, nil
}

func (r *PhotoSyncRepository) UpdatePhotoLocation(table PhotoSyncTable, row PhotoSyncRow, nextURL string, nextKey string) (int64, error) {
	result := r.db.Exec(
		fmt.Sprintf(`UPDATE %s SET url = ?, key = ? WHERE %s = ? AND url = ?`, table.Name, table.IDColumn),
		nextURL,
		nextKey,
		row.ID,
		row.URL,
	)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

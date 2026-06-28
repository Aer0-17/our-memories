package repositories

import (
	"database/sql"
	"errors"

	"gorm.io/gorm"
	"our-memories-backend/models"
)

var ErrAdminTargetNotFound = sql.ErrNoRows

type OrderRecord struct {
	ID            string  `gorm:"column:id;primaryKey"`
	SpaceID       string  `gorm:"column:space_id"`
	Amount        float64 `gorm:"column:amount"`
	Currency      string  `gorm:"column:currency"`
	Status        string  `gorm:"column:status"`
	PaymentMethod string  `gorm:"column:payment_method"`
	PaidAt        string  `gorm:"column:paid_at"`
	CreatedAt     string  `gorm:"column:created_at"`
}

func (OrderRecord) TableName() string {
	return "orders"
}

type AuditLogRecord struct {
	ID         string `gorm:"column:id;primaryKey"`
	AdminID    string `gorm:"column:admin_id"`
	Action     string `gorm:"column:action"`
	TargetType string `gorm:"column:target_type"`
	TargetID   string `gorm:"column:target_id"`
	Details    string `gorm:"column:details"`
	CreatedAt  string `gorm:"column:created_at"`
}

func (AuditLogRecord) TableName() string {
	return "audit_logs"
}

type AdminRepository struct {
	db *gorm.DB
}

func NewAdminRepository(db *gorm.DB) *AdminRepository {
	return &AdminRepository{db: db}
}

func (r *AdminRepository) ListSpaces(pageSize int, offset int, search string, status string) ([]models.Space, int64, error) {
	query := r.db.Model(&SpaceRecord{})
	if search != "" {
		searchPattern := "%" + search + "%"
		query = query.Where("space_code LIKE ? OR name LIKE ?", searchPattern, searchPattern)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var records []SpaceRecord
	if err := query.
		Order("created_at DESC").
		Limit(pageSize).
		Offset(offset).
		Find(&records).
		Error; err != nil {
		return nil, 0, err
	}

	spaces := make([]models.Space, 0, len(records))
	for _, record := range records {
		spaces = append(spaces, spaceModel(record))
	}
	return spaces, total, nil
}

func (r *AdminRepository) SpaceDetail(spaceID string) (models.Space, []models.User, int64, int64, error) {
	var spaceRecord SpaceRecord
	err := r.db.Where("id = ?", spaceID).First(&spaceRecord).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.Space{}, nil, 0, 0, ErrAdminTargetNotFound
	}
	if err != nil {
		return models.Space{}, nil, 0, 0, err
	}

	var userRecords []UserRecord
	if err := r.db.Where("space_id = ?", spaceID).Find(&userRecords).Error; err != nil {
		return models.Space{}, nil, 0, 0, err
	}

	var memoryCount int64
	if err := r.db.Model(&MemoryRecord{}).Where("space_id = ?", spaceID).Count(&memoryCount).Error; err != nil {
		return models.Space{}, nil, 0, 0, err
	}

	var photoCount int64
	if err := r.db.Model(&MemoryPhotoRecord{}).
		Joins("JOIN memories m ON m.id = memory_photos.memory_id").
		Where("m.space_id = ?", spaceID).
		Count(&photoCount).
		Error; err != nil {
		return models.Space{}, nil, 0, 0, err
	}

	users := make([]models.User, 0, len(userRecords))
	for _, record := range userRecords {
		users = append(users, userModel(record))
	}
	return spaceModel(spaceRecord), users, memoryCount, photoCount, nil
}

func (r *AdminRepository) UpdateSpaceStatus(spaceID string, status string) error {
	result := r.db.Model(&SpaceRecord{}).
		Where("id = ?", spaceID).
		Updates(map[string]any{"status": status, "updated_at": gorm.Expr("CURRENT_TIMESTAMP")})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrAdminTargetNotFound
	}
	return nil
}

func (r *AdminRepository) ListUsers(pageSize int, offset int, search string) ([]AdminUserRow, int64, error) {
	query := r.db.Table("users AS u").Joins("JOIN spaces s ON u.space_id = s.id")
	if search != "" {
		searchPattern := "%" + search + "%"
		query = query.Where("u.username LIKE ? OR u.display_name LIKE ? OR s.space_code LIKE ?", searchPattern, searchPattern, searchPattern)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []AdminUserRow
	if err := query.
		Select("u.id, u.space_id, u.username, u.display_name, COALESCE(u.avatar, '') AS avatar, u.role, u.created_at, s.space_code, s.name AS space_name").
		Order("u.created_at DESC").
		Limit(pageSize).
		Offset(offset).
		Scan(&rows).
		Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

type AdminUserRow struct {
	ID          string `gorm:"column:id"`
	SpaceID     string `gorm:"column:space_id"`
	Username    string `gorm:"column:username"`
	DisplayName string `gorm:"column:display_name"`
	Avatar      string `gorm:"column:avatar"`
	Role        string `gorm:"column:role"`
	CreatedAt   string `gorm:"column:created_at"`
	SpaceCode   string `gorm:"column:space_code"`
	SpaceName   string `gorm:"column:space_name"`
}

func (r *AdminRepository) UpdateUserRole(userID string, role string) error {
	result := r.db.Model(&UserRecord{}).Where("id = ?", userID).Update("role", role)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrAdminTargetNotFound
	}
	return nil
}

func (r *AdminRepository) ListOrders(pageSize int, offset int, status string) ([]AdminOrderRow, int64, error) {
	query := r.db.Table("orders AS o").Joins("JOIN spaces s ON o.space_id = s.id")
	if status != "" {
		query = query.Where("o.status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []AdminOrderRow
	if err := query.
		Select("o.id, o.space_id, o.amount, o.currency, o.status, COALESCE(o.payment_method, '') AS payment_method, COALESCE(o.paid_at, '') AS paid_at, o.created_at, s.space_code, s.name AS space_name").
		Order("o.created_at DESC").
		Limit(pageSize).
		Offset(offset).
		Scan(&rows).
		Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

type AdminOrderRow struct {
	ID            string  `gorm:"column:id"`
	SpaceID       string  `gorm:"column:space_id"`
	Amount        float64 `gorm:"column:amount"`
	Currency      string  `gorm:"column:currency"`
	Status        string  `gorm:"column:status"`
	PaymentMethod string  `gorm:"column:payment_method"`
	PaidAt        string  `gorm:"column:paid_at"`
	CreatedAt     string  `gorm:"column:created_at"`
	SpaceCode     string  `gorm:"column:space_code"`
	SpaceName     string  `gorm:"column:space_name"`
}

func (r *AdminRepository) ConfirmOrder(orderID string) (string, error) {
	var spaceID string
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var order OrderRecord
		err := tx.Select("space_id").
			Where("id = ? AND status = ?", orderID, "pending").
			First(&order).
			Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAdminTargetNotFound
		}
		if err != nil {
			return err
		}
		spaceID = order.SpaceID

		if err := tx.Model(&OrderRecord{}).
			Where("id = ?", orderID).
			Updates(map[string]any{"status": "paid", "paid_at": gorm.Expr("CURRENT_TIMESTAMP")}).
			Error; err != nil {
			return err
		}

		return tx.Model(&SpaceRecord{}).
			Where("id = ?", spaceID).
			Updates(map[string]any{
				"tier":         "lifetime",
				"purchased_at": gorm.Expr("CURRENT_TIMESTAMP"),
				"updated_at":   gorm.Expr("CURRENT_TIMESTAMP"),
			}).
			Error
	})
	return spaceID, err
}

func (r *AdminRepository) Stats() (AdminStats, error) {
	var stats AdminStats
	if err := r.db.Model(&SpaceRecord{}).Count(&stats.TotalSpaces).Error; err != nil {
		return stats, err
	}
	if err := r.db.Model(&SpaceRecord{}).Where("status = ?", "active").Count(&stats.ActiveSpaces).Error; err != nil {
		return stats, err
	}
	if err := r.db.Model(&SpaceRecord{}).Where("tier = ?", "lifetime").Count(&stats.LifetimeSpaces).Error; err != nil {
		return stats, err
	}
	if err := r.db.Model(&UserRecord{}).Count(&stats.TotalUsers).Error; err != nil {
		return stats, err
	}
	if err := r.db.Model(&OrderRecord{}).Count(&stats.TotalOrders).Error; err != nil {
		return stats, err
	}
	if err := r.db.Model(&OrderRecord{}).
		Where("status = ?", "paid").
		Select("COALESCE(SUM(amount), 0)").
		Scan(&stats.TotalRevenue).
		Error; err != nil {
		return stats, err
	}
	return stats, nil
}

type AdminStats struct {
	TotalSpaces    int64
	ActiveSpaces   int64
	LifetimeSpaces int64
	TotalUsers     int64
	TotalOrders    int64
	TotalRevenue   float64
}

func (r *AdminRepository) CreateAuditLog(record AuditLogRecord) error {
	return r.db.Omit("created_at").Create(&record).Error
}

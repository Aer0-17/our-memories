package handlers

import (
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

// canOpen 判断时光胶囊是否到达可开启日期（openDate 当天及之后）
func canOpen(openDate string) bool {
	t, err := time.Parse("2006-01-02", openDate)
	if err != nil {
		// 兼容带时间的格式
		t, err = time.Parse(time.RFC3339, openDate)
		if err != nil {
			return false
		}
	}
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	return !today.Before(t.Truncate(24 * time.Hour))
}

// GetTimeCapsules 获取所有时光胶囊（未到期的不返回正文内容）
func GetTimeCapsules(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	rows, err := db.DB.Query(`
		SELECT id, space_id, title, open_date, content, created_by_id, is_opened, created_at
		FROM time_capsules
		WHERE space_id = ?
		ORDER BY open_date ASC
	`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch time capsules")
		return
	}
	defer rows.Close()

	capsules := []models.TimeCapsule{}
	for rows.Next() {
		var tc models.TimeCapsule
		var isOpenedInt int
		if err := rows.Scan(&tc.ID, &tc.SpaceID, &tc.Title, &tc.OpenDate, &tc.Content,
			&tc.CreatedByID, &isOpenedInt, &tc.CreatedAt); err != nil {
			continue
		}
		tc.IsOpened = isOpenedInt == 1

		unlocked := canOpen(tc.OpenDate)
		isCreator := tc.CreatedByID == userID

		// 未到期且非创建人：隐藏内容和照片
		if !unlocked && !isCreator {
			tc.Content = ""
			tc.Photos = []models.Photo{}
		} else {
			photoRows, _ := db.DB.Query(`SELECT id, time_capsule_id, key, url, COALESCE(mime_type, ''), sort_order, created_at
				FROM time_capsule_photos WHERE time_capsule_id = ? ORDER BY sort_order`, tc.ID)
			tc.Photos = []models.Photo{}
			for photoRows.Next() {
				var p models.Photo
				photoRows.Scan(&p.ID, &p.MemoryID, &p.Key, &p.URL, &p.MimeType, &p.SortOrder, &p.CreatedAt)
				tc.Photos = append(tc.Photos, p)
			}
			photoRows.Close()
		}

		capsules = append(capsules, tc)
	}

	utils.Success(c, gin.H{"timeCapsules": capsules})
}

// CreateTimeCapsule 创建一个时光胶囊
func CreateTimeCapsule(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 检查未开启的时光胶囊数量（限制3个）
	var unopenedCount int
	db.DB.QueryRow(`SELECT COUNT(*) FROM time_capsules
		WHERE space_id = ? AND datetime(open_date) > datetime('now')`, spaceID).Scan(&unopenedCount)
	if unopenedCount >= 3 {
		utils.Error(c, 400, "最多只能有3个未开启的时光胶囊")
		return
	}

	var req struct {
		Title    string `json:"title" binding:"required"`
		OpenDate string `json:"openDate" binding:"required"`
		Content  string `json:"content" binding:"required"`
		Photos   []struct {
			Key      string `json:"key"`
			URL      string `json:"url"`
			MimeType string `json:"mimeType"`
		} `json:"photos"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	capsuleID := utils.NewID()
	_, err := db.DB.Exec(`INSERT INTO time_capsules (id, space_id, title, open_date, content, created_by_id)
		VALUES (?, ?, ?, ?, ?, ?)`,
		capsuleID, spaceID, req.Title, req.OpenDate, req.Content, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to create time capsule")
		return
	}

	for i, photo := range req.Photos {
		photoID := utils.NewID()
		db.DB.Exec(`INSERT INTO time_capsule_photos (id, time_capsule_id, key, url, mime_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
			photoID, capsuleID, photo.Key, photo.URL, photo.MimeType, i)
	}

	utils.Success(c, gin.H{"id": capsuleID})
}

// OpenTimeCapsule 标记时光胶囊为已开启（仅到期后允许）
func OpenTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	var openDate string
	if err := db.DB.QueryRow(`SELECT open_date FROM time_capsules WHERE id = ? AND space_id = ?`, id, spaceID).Scan(&openDate); err != nil {
		utils.Error(c, 404, "Time capsule not found")
		return
	}

	if !canOpen(openDate) {
		utils.Error(c, 403, "时光胶囊还未到开启日期")
		return
	}

	db.DB.Exec(`UPDATE time_capsules SET is_opened = 1 WHERE id = ? AND space_id = ?`, id, spaceID)
	utils.Success(c, gin.H{"ok": true})
}

// DeleteTimeCapsule 删除时光胶囊
func DeleteTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	_, err := db.DB.Exec(`DELETE FROM time_capsules WHERE id = ? AND space_id = ?`, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete time capsule")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

// UpdateTimeCapsule 编辑时光胶囊
func UpdateTimeCapsule(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	var req struct {
		Title    string `json:"title"`
		OpenDate string `json:"openDate"`
		Content  string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	_, err := db.DB.Exec(`UPDATE time_capsules SET title = ?, open_date = ?, content = ? WHERE id = ? AND space_id = ?`,
		req.Title, req.OpenDate, req.Content, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update time capsule")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

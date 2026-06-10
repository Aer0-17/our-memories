package handlers

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/models"
	"our-memories-backend/utils"
)

func GetAnniversaryCards(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	rows, err := db.DB.Query(`
		SELECT id, space_id, title, date, note, COALESCE(cover_photo_id, ''), repeat_yearly, pinned, sort_order,
		       COALESCE(created_by_id, ''), created_at, updated_at
		FROM anniversary_cards
		WHERE space_id = ?
		ORDER BY pinned DESC, sort_order, date
	`, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch anniversary cards")
		return
	}
	defer rows.Close()

	cards := []models.AnniversaryCard{}
	for rows.Next() {
		var card models.AnniversaryCard
		var repeatInt, pinnedInt int
		err := rows.Scan(&card.ID, &card.SpaceID, &card.Title, &card.Date, &card.Note, &card.CoverPhotoID,
			&repeatInt, &pinnedInt, &card.SortOrder, &card.CreatedByID, &card.CreatedAt, &card.UpdatedAt)
		if err != nil {
			continue
		}
		card.RepeatYearly = repeatInt == 1
		card.Pinned = pinnedInt == 1

		photoRows, _ := db.DB.Query(`SELECT id, anniversary_card_id, key, url, COALESCE(mime_type, ''), sort_order, created_at
			FROM anniversary_photos WHERE anniversary_card_id = ? ORDER BY sort_order`, card.ID)
		card.Photos = []models.Photo{}
		for photoRows.Next() {
			var p models.Photo
			photoRows.Scan(&p.ID, &p.MemoryID, &p.Key, &p.URL, &p.MimeType, &p.SortOrder, &p.CreatedAt)
			card.Photos = append(card.Photos, p)
		}
		photoRows.Close()

		cards = append(cards, card)
	}

	utils.Success(c, gin.H{"anniversaryCards": cards})
}

func CreateAnniversaryCard(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req struct {
		Title        string `json:"title" binding:"required"`
		Date         string `json:"date" binding:"required"`
		Note         string `json:"note"`
		RepeatYearly bool   `json:"repeatYearly"`
		Pinned       bool   `json:"pinned"`
		Photos       []struct {
			Key      string `json:"key"`
			URL      string `json:"url"`
			MimeType string `json:"mimeType"`
		} `json:"photos"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	cardID := utils.NewID()
	repeatInt := 0
	if req.RepeatYearly {
		repeatInt = 1
	}
	pinnedInt := 0
	if req.Pinned {
		pinnedInt = 1
	}

	_, err := db.DB.Exec(`INSERT INTO anniversary_cards (id, space_id, title, date, note, repeat_yearly, pinned, created_by_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		cardID, spaceID, req.Title, req.Date, req.Note, repeatInt, pinnedInt, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to create anniversary card")
		return
	}

	for i, photo := range req.Photos {
		photoID := utils.NewID()
		db.DB.Exec(`INSERT INTO anniversary_photos (id, anniversary_card_id, key, url, mime_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
			photoID, cardID, photo.Key, photo.URL, photo.MimeType, i)
	}

	utils.Success(c, gin.H{"id": cardID})
}

func UpdateAnniversaryCard(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	var req struct {
		Title        string `json:"title"`
		Date         string `json:"date"`
		Note         string `json:"note"`
		RepeatYearly bool   `json:"repeatYearly"`
		Pinned       bool   `json:"pinned"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	repeatInt := 0
	if req.RepeatYearly {
		repeatInt = 1
	}
	pinnedInt := 0
	if req.Pinned {
		pinnedInt = 1
	}

	_, err := db.DB.Exec(`UPDATE anniversary_cards SET title = ?, date = ?, note = ?, repeat_yearly = ?, pinned = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND space_id = ?`,
		req.Title, req.Date, req.Note, repeatInt, pinnedInt, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to update anniversary card")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func DeleteAnniversaryCard(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")

	_, err := db.DB.Exec(`DELETE FROM anniversary_cards WHERE id = ? AND space_id = ?`, id, spaceID)
	if err != nil {
		utils.Error(c, 500, "Failed to delete anniversary card")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

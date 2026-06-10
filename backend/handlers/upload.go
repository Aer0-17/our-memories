package handlers

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/storage"
	"our-memories-backend/utils"
)

func UploadImage(c *gin.Context) {
	spaceID := c.GetString("spaceID")

	var req struct {
		DataURL string `json:"dataUrl" binding:"required"`
		Folder  string `json:"folder"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if req.Folder == "" {
		req.Folder = "uploads"
	}

	url, err := storage.UploadImage(spaceID, req.Folder, req.DataURL)
	if err != nil {
		utils.Error(c, 500, "Upload failed")
		return
	}

	utils.Success(c, gin.H{"url": url})
}

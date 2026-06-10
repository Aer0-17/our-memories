package handlers

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

func ImportBackup(c *gin.Context) {
	utils.Error(c, 501, "Import backup not implemented yet")
}

func ExportBackup(c *gin.Context) {
	utils.Error(c, 501, "Export backup not implemented yet")
}

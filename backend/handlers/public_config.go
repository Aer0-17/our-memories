package handlers

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

func GetPublicConfig(c *gin.Context) {
	utils.Success(c, accountService().PublicConfig())
}

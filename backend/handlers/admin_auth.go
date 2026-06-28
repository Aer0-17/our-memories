package handlers

import (
	"errors"

	"github.com/gin-gonic/gin"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

// AdminLogin 管理员登录
func AdminLogin(c *gin.Context) {
	var req services.AdminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	result, err := accountService().AdminLogin(req)
	if err != nil {
		writeAdminLoginError(c, err)
		return
	}

	utils.Success(c, gin.H{
		"token": result.Token,
		"admin": gin.H{
			"id":          result.Admin.ID,
			"username":    result.Admin.Username,
			"displayName": result.Admin.DisplayName,
		},
	})
}

func writeAdminLoginError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrInvalidCredentials):
		utils.Error(c, 401, "Invalid username or password")
	default:
		utils.Error(c, 500, "Failed to login")
	}
}

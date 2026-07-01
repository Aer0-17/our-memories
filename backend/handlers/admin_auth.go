package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"our-memories-backend/middleware"
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

	setAdminCookie(c, result.Token)
	utils.Success(c, gin.H{
		"token": result.Token,
		"admin": gin.H{
			"id":          result.Admin.ID,
			"username":    result.Admin.Username,
			"displayName": result.Admin.DisplayName,
		},
	})
}

func AdminLogout(c *gin.Context) {
	clearAdminCookie(c)
	utils.Success(c, gin.H{"ok": true})
}

func setAdminCookie(c *gin.Context, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     middleware.AdminTokenCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   24 * 60 * 60,
		HttpOnly: true,
		Secure:   isSecureRequest(c),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearAdminCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     middleware.AdminTokenCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureRequest(c),
		SameSite: http.SameSiteLaxMode,
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

package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

const (
	AccessTokenCookieName  = "mapofus_access_token"
	RefreshTokenCookieName = "mapofus_refresh_token"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c.GetHeader("Authorization"))
		if token == "" {
			token, _ = c.Cookie(AccessTokenCookieName)
		}
		if token == "" {
			utils.Error(c, 401, "Authentication required")
			c.Abort()
			return
		}

		claims, err := utils.VerifyAccessToken(token)
		if err != nil {
			utils.Error(c, 401, "Invalid or expired token")
			c.Abort()
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("spaceID", claims.SpaceID)
		c.Next()
	}
}

func bearerToken(authHeader string) string {
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			utils.Error(c, 401, "Authentication required")
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			utils.Error(c, 401, "Invalid authorization header")
			c.Abort()
			return
		}

		claims, err := utils.VerifyToken(parts[1])
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

package middleware

import (
	"github.com/gin-gonic/gin"
	"our-memories-backend/utils"
)

const AdminTokenCookieName = "mapofus_admin_token"

// AdminAuthMiddleware 管理员认证中间件
func AdminAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c.GetHeader("Authorization"))
		if token == "" {
			token, _ = c.Cookie(AdminTokenCookieName)
		}
		if token == "" {
			utils.Error(c, 401, "Authentication required")
			c.Abort()
			return
		}

		claims, err := utils.VerifyToken(token)
		if err != nil {
			utils.Error(c, 401, "Invalid or expired token")
			c.Abort()
			return
		}

		// 检查是否为管理员 token
		if !claims.IsAdmin {
			utils.Error(c, 403, "Admin permission required")
			c.Abort()
			return
		}

		c.Set("adminID", claims.UserID)
		c.Next()
	}
}

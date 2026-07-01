package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"our-memories-backend/config"
	"our-memories-backend/utils"
)

var builtInAllowedOrigins = map[string]bool{
	"capacitor://localhost": true,
	"ionic://localhost":     true,
	"https://localhost":     true,
}

func OriginGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if origin == "" || !isUnsafeMethod(c.Request.Method) {
			c.Next()
			return
		}

		if !isSameRequestOrigin(c, origin) && !IsAllowedOrigin(origin) {
			utils.Error(c, http.StatusForbidden, "Origin not allowed")
			c.Abort()
			return
		}

		c.Next()
	}
}

func IsSameRequestOrigin(r *http.Request, origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}

	return strings.EqualFold(parsed.Scheme, requestScheme(r)) && strings.EqualFold(parsed.Host, r.Host)
}

func isSameRequestOrigin(c *gin.Context, origin string) bool {
	return IsSameRequestOrigin(c.Request, origin)
}

func requestScheme(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	if proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); proto != "" {
		return strings.ToLower(strings.Split(proto, ",")[0])
	}
	return "http"
}

func IsAllowedOrigin(origin string) bool {
	if builtInAllowedOrigins[origin] {
		return true
	}

	for _, allowedOrigin := range config.Get().AllowedOrigins {
		if origin == strings.TrimSpace(allowedOrigin) {
			return true
		}
	}
	return false
}

func isUnsafeMethod(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

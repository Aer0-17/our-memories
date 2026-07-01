package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"our-memories-backend/config"
	"our-memories-backend/utils"
)

func TestAuthMiddlewareAcceptsAccessTokenCookie(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	config.Load()
	gin.SetMode(gin.TestMode)

	token, err := utils.GenerateAccessToken("user-1", "space-1")
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.GET("/private", AuthMiddleware(), func(c *gin.Context) {
		if c.GetString("userID") != "user-1" || c.GetString("spaceID") != "space-1" {
			t.Fatalf("unexpected claims: user=%q space=%q", c.GetString("userID"), c.GetString("spaceID"))
		}
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/private", nil)
	request.AddCookie(&http.Cookie{Name: AccessTokenCookieName, Value: token})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected cookie auth to pass, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminAuthMiddlewareAcceptsAdminTokenCookie(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	config.Load()
	gin.SetMode(gin.TestMode)

	token, err := utils.GenerateAdminToken("admin-1")
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.GET("/admin/private", AdminAuthMiddleware(), func(c *gin.Context) {
		if c.GetString("adminID") != "admin-1" {
			t.Fatalf("unexpected admin id: %q", c.GetString("adminID"))
		}
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/admin/private", nil)
	request.AddCookie(&http.Cookie{Name: AdminTokenCookieName, Value: token})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected admin cookie auth to pass, got %d: %s", response.Code, response.Body.String())
	}
}

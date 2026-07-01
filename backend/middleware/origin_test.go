package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"our-memories-backend/config"
)

func TestOriginGuardBlocksUnsafeCrossOriginRequest(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("ALLOWED_ORIGINS", "https://app.example.com")
	config.Load()
	gin.SetMode(gin.TestMode)

	router := originGuardTestRouter()
	response := performOriginGuardRequest(router, http.MethodPost, "https://evil.example.com")

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden origin to be blocked, got %d", response.Code)
	}
}

func TestOriginGuardAllowsTrustedOrigin(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("ALLOWED_ORIGINS", "https://app.example.com")
	config.Load()
	gin.SetMode(gin.TestMode)

	router := originGuardTestRouter()
	response := performOriginGuardRequest(router, http.MethodPost, "https://app.example.com")

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected trusted origin to pass, got %d", response.Code)
	}
}

func TestOriginGuardAllowsSameRequestOrigin(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("ALLOWED_ORIGINS", "https://configured.example.com")
	config.Load()
	gin.SetMode(gin.TestMode)

	router := originGuardTestRouter()
	request := httptest.NewRequest(http.MethodPost, "/resource", nil)
	request.Host = "memories.example.com"
	request.Header.Set("X-Forwarded-Proto", "https")
	request.Header.Set("Origin", "https://memories.example.com")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected same request origin to pass, got %d", response.Code)
	}
}

func TestOriginGuardAllowsRequestsWithoutOrigin(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("ALLOWED_ORIGINS", "https://app.example.com")
	config.Load()
	gin.SetMode(gin.TestMode)

	router := originGuardTestRouter()
	response := performOriginGuardRequest(router, http.MethodPost, "")

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected request without origin to pass, got %d", response.Code)
	}
}

func TestOriginGuardAllowsSafeMethodFromUnknownOrigin(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("ALLOWED_ORIGINS", "https://app.example.com")
	config.Load()
	gin.SetMode(gin.TestMode)

	router := originGuardTestRouter()
	response := performOriginGuardRequest(router, http.MethodGet, "https://evil.example.com")

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected safe method to pass, got %d", response.Code)
	}
}

func originGuardTestRouter() *gin.Engine {
	router := gin.New()
	router.Use(OriginGuard())
	router.Any("/resource", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	return router
}

func performOriginGuardRequest(router http.Handler, method string, origin string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, "/resource", nil)
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

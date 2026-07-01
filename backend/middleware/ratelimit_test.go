package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRateLimitBlocksRequestsAfterThreshold(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/limited", RateLimit(time.Minute, 2), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	for index := 0; index < 2; index += 1 {
		response := performRateLimitRequest(router)
		if response.Code != http.StatusNoContent {
			t.Fatalf("request %d should pass, got %d", index+1, response.Code)
		}
	}

	response := performRateLimitRequest(router)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected rate-limited request to return 429, got %d", response.Code)
	}
}

func TestRateLimitDisabledWhenLimitIsZero(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/limited", RateLimit(time.Minute, 0), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	for index := 0; index < 3; index += 1 {
		response := performRateLimitRequest(router)
		if response.Code != http.StatusNoContent {
			t.Fatalf("disabled limiter should pass request %d, got %d", index+1, response.Code)
		}
	}
}

func performRateLimitRequest(router http.Handler) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, "/limited", nil)
	request.RemoteAddr = "192.0.2.10:1234"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

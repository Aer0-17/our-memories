package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	_ "github.com/glebarez/sqlite"
	sqlitegorm "github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/dbschema"
	"our-memories-backend/middleware"
	"our-memories-backend/utils"
)

func setupAdminAuthCookieTestDB(t *testing.T) {
	t.Helper()
	t.Setenv("JWT_SECRET", "test-secret-with-enough-length")
	t.Setenv("S3_PUBLIC_BASE_URL", "https://new-cdn.example.com")
	config.Load()

	name := strings.NewReplacer("/", "-", " ", "-", ":", "-").Replace(t.Name())
	testDB, err := sql.Open("sqlite", "file:"+name+"?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = testDB.Close()
	})

	db.DB = testDB
	db.Gorm, err = gorm.Open(sqlitegorm.Dialector{Conn: testDB}, &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := dbschema.AutoMigrate(db.Gorm); err != nil {
		t.Fatal(err)
	}

	_, err = db.DB.Exec(`
		INSERT INTO admins (id, username, password_hash, display_name)
		VALUES ('admin-1', 'admin', ?, 'Admin User');
	`, utils.HashPassword("correct-admin-password"))
	if err != nil {
		t.Fatal(err)
	}
}

func TestAdminLoginSetsHttpOnlyCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAdminAuthCookieTestDB(t)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/admin/login",
		strings.NewReader(`{"username":"admin","password":"correct-admin-password"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = request

	AdminLogin(c)

	if response.Code != http.StatusOK {
		t.Fatalf("expected admin login to pass, got %d: %s", response.Code, response.Body.String())
	}
	assertAdminAuthCookie(t, response.Result().Cookies(), middleware.AdminTokenCookieName)

	var payload struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Token == "" {
		t.Fatal("expected response body to retain token for non-browser clients")
	}
}

func TestAdminLogoutClearsCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/logout", nil)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = request

	AdminLogout(c)

	if response.Code != http.StatusOK {
		t.Fatalf("expected admin logout to pass, got %d: %s", response.Code, response.Body.String())
	}
	assertClearedAuthCookie(t, response.Result().Cookies(), middleware.AdminTokenCookieName)
}

func assertAdminAuthCookie(t *testing.T, cookies []*http.Cookie, name string) {
	t.Helper()
	for _, cookie := range cookies {
		if cookie.Name != name {
			continue
		}
		if !cookie.HttpOnly {
			t.Fatalf("%s should be HttpOnly", name)
		}
		if cookie.Value == "" {
			t.Fatalf("%s should have value", name)
		}
		return
	}
	t.Fatalf("missing cookie %s", name)
}

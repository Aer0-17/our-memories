package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"our-memories-backend/securebackup"
)

func TestFullBackupStatusDoesNotExposeSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service, err := securebackup.NewService(securebackup.ServiceConfig{})
	if err != nil {
		t.Fatal(err)
	}
	SetFullBackupService(service)
	t.Cleanup(func() { SetFullBackupService(nil) })

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/backup/full/status", nil)
	GetFullBackupStatus(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status success, got %d: %s", w.Code, w.Body.String())
	}
	if strings.Contains(strings.ToLower(w.Body.String()), "encryptionkey") ||
		strings.Contains(w.Body.String(), "FULL_BACKUP_ENCRYPTION_KEY") {
		t.Fatalf("status leaked encryption key details: %s", w.Body.String())
	}
}

func TestCreateFullBackupRejectsDisabledService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service, err := securebackup.NewService(securebackup.ServiceConfig{})
	if err != nil {
		t.Fatal(err)
	}
	SetFullBackupService(service)
	t.Cleanup(func() { SetFullBackupService(nil) })

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/backup/full", nil)
	CreateFullBackup(c)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected disabled service rejection, got %d: %s", w.Code, w.Body.String())
	}
}

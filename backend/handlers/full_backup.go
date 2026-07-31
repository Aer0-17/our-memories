package handlers

import (
	"errors"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"our-memories-backend/securebackup"
	"our-memories-backend/utils"
)

var (
	fullBackupMu      sync.RWMutex
	fullBackupService *securebackup.Service
)

func SetFullBackupService(service *securebackup.Service) {
	fullBackupMu.Lock()
	fullBackupService = service
	fullBackupMu.Unlock()
}

func currentFullBackupService() *securebackup.Service {
	fullBackupMu.RLock()
	service := fullBackupService
	fullBackupMu.RUnlock()
	return service
}

func GetFullBackupStatus(c *gin.Context) {
	service := currentFullBackupService()
	if service == nil {
		c.JSON(http.StatusOK, securebackup.Status{})
		return
	}
	c.JSON(http.StatusOK, service.Status())
}

func CreateFullBackup(c *gin.Context) {
	service := currentFullBackupService()
	if service == nil || !service.Enabled() {
		utils.Error(c, http.StatusServiceUnavailable, "Encrypted full backup is not configured")
		return
	}

	result, err := service.Create(c.Request.Context(), "manual")
	if errors.Is(err, securebackup.ErrFullBackupInProgress) {
		utils.Error(c, http.StatusConflict, "A full backup is already running")
		return
	}
	if errors.Is(err, securebackup.ErrFullBackupDisabled) {
		utils.Error(c, http.StatusServiceUnavailable, "Encrypted full backup is not configured")
		return
	}
	if err != nil {
		log.Printf(
			"manual encrypted full backup failed (space=%s user=%s): %v",
			c.GetString("spaceID"),
			c.GetString("userID"),
			err,
		)
		utils.Error(c, http.StatusInternalServerError, "Failed to create encrypted full backup")
		return
	}
	c.JSON(http.StatusCreated, result)
}

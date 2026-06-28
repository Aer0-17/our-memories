package handlers

import (
	"errors"
	"fmt"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

const (
	backupFormat  = services.BackupFormat
	backupVersion = services.BackupVersion
)

type backupPayload = services.BackupPayload
type backupRow = repositories.BackupRow
type backupMediaReference = services.BackupMediaReference

func ExportBackup(c *gin.Context) {
	exportBackup(c, c.GetString("spaceID"))
}

func AdminExportSpaceBackup(c *gin.Context) {
	exportBackup(c, c.Param("id"))
}

func exportBackup(c *gin.Context, spaceID string) {
	result, err := backupService().Export(spaceID)
	if err != nil {
		if errors.Is(err, services.ErrBackupSpaceNotFound) {
			utils.Error(c, 404, "Space not found")
			return
		}
		utils.Error(c, 500, "Failed to export backup")
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, result.Filename))
	c.JSON(200, result.Payload)
}

func ImportBackup(c *gin.Context) {
	importBackup(c, c.GetString("spaceID"), false)
}

func AdminImportBackup(c *gin.Context) {
	importBackup(c, "", true)
}

func importBackup(c *gin.Context, currentSpaceID string, isAdmin bool) {
	var payload services.BackupPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.Error(c, 400, "Invalid backup file")
		return
	}

	result, err := backupService().Import(currentSpaceID, isAdmin, payload)
	if err != nil {
		writeBackupServiceError(c, err)
		return
	}

	if isAdmin {
		logAuditAction(c.GetString("adminID"), "import_backup", "space", result.SpaceID, gin.H{
			"spaceCode": result.SpaceCode,
		})
	}
	for _, spaceID := range result.CacheSpaceIDs {
		clearBackupCaches(spaceID)
	}

	utils.Success(c, gin.H{
		"ok":              true,
		"spaceId":         result.SpaceID,
		"spaceCode":       result.SpaceCode,
		"reloginRequired": result.ReloginRequired,
	})
}

func writeBackupServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrUnsupportedBackup):
		utils.Error(c, 400, "Unsupported backup format")
	case errors.Is(err, services.ErrBackupSpaceMissing):
		utils.Error(c, 400, "Backup space is missing")
	case errors.Is(err, repositories.ErrBackupSpaceAlreadyExists):
		utils.Error(c, 409, "Backup space already exists; please log in to that space before importing again")
	default:
		utils.Error(c, 500, "Failed to import backup")
	}
}

func backupService() *services.BackupService {
	return services.NewBackupService(repositories.NewBackupRepository(db.Gorm))
}

func clearBackupCaches(spaceID string) {
	if spaceID == "" {
		return
	}
	cache.ClearSpace(spaceID)
	cache.ClearAdmin()
}

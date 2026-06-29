package handlers

import (
	"errors"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

func RegisterPushDevice(c *gin.Context) {
	var req services.RegisterPushDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if err := pushService().RegisterDevice(c.GetString("spaceID"), c.GetString("userID"), req); err != nil {
		utils.Error(c, 400, err.Error())
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func SendTestPush(c *gin.Context) {
	var req services.TestPushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if err := pushService().SendTest(c.GetString("spaceID"), req); err != nil {
		switch {
		case errors.Is(err, services.ErrPushNotConfigured):
			utils.Error(c, 503, "JPush is not configured")
		case errors.Is(err, services.ErrNoPushDevices):
			utils.Error(c, 404, "No push devices registered")
		default:
			utils.Error(c, 502, "Failed to send push")
		}
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

func pushService() *services.PushService {
	return services.NewPushService(repositories.NewPushRepository(db.Gorm))
}

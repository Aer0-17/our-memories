package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/handlers"
	"our-memories-backend/middleware"
	"our-memories-backend/storage"
)

func main() {
	config.Load()
	db.Init()
	storage.InitS3()

	r := gin.Default()

	r.Use(middleware.CORSMiddleware())

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	api := r.Group("/api/v1")
	{
		api.POST("/auth/login", handlers.Login)
		api.POST("/auth/refresh", handlers.Refresh)

		auth := api.Group("")
		auth.Use(middleware.AuthMiddleware())
		{
			auth.GET("/me", handlers.GetMe)
			auth.PUT("/auth/password", handlers.UpdatePassword)

			auth.GET("/memories", handlers.GetMemories)
			auth.POST("/memories", handlers.CreateMemory)
			auth.PATCH("/memories/:id", handlers.UpdateMemory)
			auth.DELETE("/memories/:id", handlers.DeleteMemory)

			auth.GET("/city-assets", handlers.GetCityAssets)
			auth.PUT("/city-assets", handlers.UpdateCityAsset)
			auth.DELETE("/city-assets", handlers.DeleteCityAsset)

			auth.GET("/anniversary-cards", handlers.GetAnniversaryCards)
			auth.POST("/anniversary-cards", handlers.CreateAnniversaryCard)
			auth.PATCH("/anniversary-cards/:id", handlers.UpdateAnniversaryCard)
			auth.DELETE("/anniversary-cards/:id", handlers.DeleteAnniversaryCard)

			auth.POST("/upload", handlers.UploadImage)

			auth.GET("/settings", handlers.GetSettings)
			auth.PUT("/settings/:key", handlers.UpdateSetting)

			auth.GET("/auxiliary-items", handlers.GetAuxiliaryItems)
			auth.POST("/auxiliary-items", handlers.CreateAuxiliaryItem)
			auth.PATCH("/auxiliary-items/:id", handlers.UpdateAuxiliaryItem)
			auth.DELETE("/auxiliary-items/:id", handlers.DeleteAuxiliaryItem)

			auth.GET("/login-photos", handlers.GetLoginPhotos)
			auth.PUT("/login-photos", handlers.UpdateLoginPhoto)
			auth.PATCH("/login-photos", handlers.PatchLoginPhotos)
			auth.DELETE("/login-photos", handlers.DeleteLoginPhoto)

			auth.POST("/backup/import", handlers.ImportBackup)
			auth.GET("/backup/export", handlers.ExportBackup)

			auth.GET("/trip-guides", handlers.GetTripGuides)
			auth.POST("/trip-guides", handlers.CreateTripGuide)
			auth.PATCH("/trip-guides/:id", handlers.UpdateTripGuide)
			auth.DELETE("/trip-guides/:id", handlers.DeleteTripGuide)
			auth.PATCH("/trip-guide-drafts/:id", handlers.UpdateTripDraft)
			auth.DELETE("/trip-guide-drafts/:id", handlers.DeleteTripDraft)
			auth.POST("/trip-guide-drafts/:id/accept", handlers.AcceptTripDraft)

			auth.POST("/ai/memory-polish", handlers.PolishMemory)
			auth.POST("/activation-codes", handlers.CreateActivationCode)

			auth.GET("/whispers", handlers.GetWhispers)
			auth.POST("/whispers", handlers.CreateWhisper)
			auth.POST("/whispers/:id/reply", handlers.ReplyWhisper)
			auth.DELETE("/whispers/:id", handlers.DeleteWhisper)

			auth.GET("/time-capsules", handlers.GetTimeCapsules)
			auth.POST("/time-capsules", handlers.CreateTimeCapsule)
			auth.PATCH("/time-capsules/:id", handlers.UpdateTimeCapsule)
			auth.POST("/time-capsules/:id/open", handlers.OpenTimeCapsule)
			auth.DELETE("/time-capsules/:id", handlers.DeleteTimeCapsule)
		}
	}

	log.Printf("Server starting on port %s", config.Get().Port)
	if err := r.Run(":" + config.Get().Port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

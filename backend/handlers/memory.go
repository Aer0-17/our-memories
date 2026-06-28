package handlers

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"our-memories-backend/cache"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

func GetMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	// 尝试从缓存获取
	cacheKey := fmt.Sprintf("memories:%s:%s:full", spaceID, userID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"memories": cached})
		return
	}

	memories, err := loadMemoryStore(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memories")
		return
	}

	// 缓存30秒
	cache.Set(cacheKey, memories, 30*time.Second)
	utils.Success(c, gin.H{"memories": memories})
}

func GetCityMemories(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")
	cityID := strings.TrimSpace(c.Param("cityId"))
	if cityID == "" {
		utils.Error(c, 400, "cityId is required")
		return
	}

	cacheKey := fmt.Sprintf("memories:%s:%s:city:%s", spaceID, userID, cityID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"memories": cached})
		return
	}

	memories, err := loadMemoryStoreForCity(spaceID, userID, cityID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch city memories")
		return
	}

	cache.Set(cacheKey, memories, 30*time.Second)
	utils.Success(c, gin.H{"memories": memories})
}

func GetMemorySummary(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	cacheKey := fmt.Sprintf("memories:%s:%s:summary", spaceID, userID)
	if cached, found := cache.Get(cacheKey); found {
		utils.Success(c, gin.H{"summary": cached})
		return
	}

	summary, err := loadMemorySummary(spaceID, userID)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch memory summary")
		return
	}

	cache.Set(cacheKey, summary, 30*time.Second)
	utils.Success(c, gin.H{"summary": summary})
}

func clearMemoriesCache(spaceID string) {
	cache.ClearMemorySpace(spaceID)
}

func loadMemoryStore(spaceID string, userID string) (map[string][]gin.H, error) {
	return loadMemoryStoreWithCity(spaceID, userID, "")
}

func loadMemoryStoreForCity(spaceID string, userID string, cityID string) (map[string][]gin.H, error) {
	return loadMemoryStoreWithCity(spaceID, userID, cityID)
}

func loadMemoryStoreWithCity(spaceID string, userID string, cityID string) (map[string][]gin.H, error) {
	return memoryService().ListByCity(spaceID, userID, cityID)
}

func loadMemorySummary(spaceID string, userID string) (map[string]gin.H, error) {
	return memoryService().Summary(spaceID, userID)
}

func CreateMemory(c *gin.Context) {
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.CreateMemoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	memoryID, memories, err := memoryService().Create(spaceID, userID, req)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to create memory")
		return
	}

	utils.Success(c, gin.H{"id": memoryID, "memories": memories})
}

func UpdateMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	var req services.UpdateMemoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	memories, err := memoryService().Update(spaceID, userID, id, req)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to update memory")
		return
	}

	utils.Success(c, gin.H{"ok": true, "memories": memories})
}

func DeleteMemory(c *gin.Context) {
	id := c.Param("id")
	spaceID := c.GetString("spaceID")
	userID := c.GetString("userID")

	memories, err := memoryService().Delete(spaceID, userID, id)
	if err != nil {
		writeMemoryServiceError(c, err, "Failed to delete memory")
		return
	}

	utils.Success(c, gin.H{"ok": true, "memories": memories})
}

func memoryService() *services.MemoryService {
	return services.NewMemoryService(
		repositories.NewMemoryRepository(db.Gorm),
		loadMemoryStore,
		uploadServicePhotoInputs,
		deleteServicePhotos,
	)
}

func uploadServicePhotoInputs(spaceID string, folder string, photos []services.PhotoInput) error {
	items := make([]photoInput, len(photos))
	for i, photo := range photos {
		items[i] = photoInput(photo)
	}
	if err := uploadPhotoInputs(spaceID, folder, items); err != nil {
		return err
	}
	for i, photo := range items {
		photos[i] = services.PhotoInput(photo)
	}
	return nil
}

func deleteServicePhotos(spaceID string, photos []services.StoredPhoto) error {
	items := make([]storedPhoto, len(photos))
	for i, photo := range photos {
		items[i] = storedPhoto{key: photo.Key, url: photo.URL}
	}
	return deletePhotos(spaceID, items)
}

func writeMemoryServiceError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrMemoryNotFound):
		utils.Error(c, 404, "Memory not found")
	case errors.Is(err, repositories.ErrMemoryCoverPhotoNotFound):
		utils.Error(c, 400, "Cover photo not found")
	case errors.Is(err, services.ErrForbidden):
		utils.Error(c, 403, "Only the creator can modify this memory")
	default:
		utils.Error(c, 500, fallback)
	}
}

package handlers

import (
	"encoding/json"
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
	"our-memories-backend/utils"
)

// GetSpaces 获取空间列表（分页、搜索）
func GetSpaces(c *gin.Context) {
	pageReq := adminPageRequest(c)
	search := c.Query("search")
	status := c.Query("status")

	spaces, total, err := adminService().ListSpaces(pageReq, search, status)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch spaces")
		return
	}

	utils.Success(c, gin.H{
		"spaces":   spaces,
		"total":    total,
		"page":     pageReq.Page,
		"pageSize": pageReq.PageSize,
	})
}

// GetSpaceDetail 获取空间详情
func GetSpaceDetail(c *gin.Context) {
	spaceID := c.Param("id")

	space, users, stats, err := adminService().SpaceDetail(spaceID)
	if err != nil {
		writeAdminServiceError(c, err, "Failed to fetch space")
		return
	}

	utils.Success(c, gin.H{
		"space": space,
		"users": users,
		"stats": stats,
	})
}

// UpdateSpaceStatus 更新空间状态
func UpdateSpaceStatus(c *gin.Context) {
	spaceID := c.Param("id")
	adminID := c.GetString("adminID")

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if err := adminService().UpdateSpaceStatus(adminID, spaceID, req.Status); err != nil {
		writeAdminServiceError(c, err, "Failed to update space status")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

// DeleteSpace 删除空间（软删除）
func DeleteSpace(c *gin.Context) {
	spaceID := c.Param("id")
	adminID := c.GetString("adminID")

	if err := adminService().DeleteSpace(adminID, spaceID); err != nil {
		writeAdminServiceError(c, err, "Failed to delete space")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

// GetUsers 获取用户列表
func GetUsers(c *gin.Context) {
	pageReq := adminPageRequest(c)
	search := c.Query("search")

	users, total, err := adminService().ListUsers(pageReq, search)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch users")
		return
	}

	utils.Success(c, gin.H{
		"users":    users,
		"total":    total,
		"page":     pageReq.Page,
		"pageSize": pageReq.PageSize,
	})
}

// UpdateUserRole 修改用户角色
func UpdateUserRole(c *gin.Context) {
	userID := c.Param("id")
	adminID := c.GetString("adminID")

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "Invalid request")
		return
	}

	if err := adminService().UpdateUserRole(adminID, userID, req.Role); err != nil {
		writeAdminServiceError(c, err, "Failed to update user role")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

// GetOrders 获取订单列表
func GetOrders(c *gin.Context) {
	pageReq := adminPageRequest(c)
	status := c.Query("status")

	orders, total, err := adminService().ListOrders(pageReq, status)
	if err != nil {
		utils.Error(c, 500, "Failed to fetch orders")
		return
	}

	utils.Success(c, gin.H{
		"orders":   orders,
		"total":    total,
		"page":     pageReq.Page,
		"pageSize": pageReq.PageSize,
	})
}

// ConfirmOrder 手动确认订单（标记为已付款）
func ConfirmOrder(c *gin.Context) {
	orderID := c.Param("id")
	adminID := c.GetString("adminID")

	if err := adminService().ConfirmOrder(adminID, orderID); err != nil {
		if errors.Is(err, repositories.ErrAdminTargetNotFound) {
			utils.Error(c, 404, "Order not found or already processed")
			return
		}
		utils.Error(c, 500, "Failed to confirm order")
		return
	}

	utils.Success(c, gin.H{"ok": true})
}

// GetStats 获取统计数据
func GetStats(c *gin.Context) {
	stats, err := adminService().Stats()
	if err != nil {
		utils.Error(c, 500, "Failed to fetch stats")
		return
	}

	utils.Success(c, gin.H{
		"totalSpaces":    stats.TotalSpaces,
		"activeSpaces":   stats.ActiveSpaces,
		"lifetimeSpaces": stats.LifetimeSpaces,
		"totalUsers":     stats.TotalUsers,
		"totalOrders":    stats.TotalOrders,
		"totalRevenue":   stats.TotalRevenue,
	})
}

func logAuditAction(adminID, action, targetType, targetID string, details gin.H) {
	if db.Gorm == nil {
		detailsJSON := ""
		if details != nil {
			jsonBytes, _ := json.Marshal(details)
			detailsJSON = string(jsonBytes)
		}
		_, _ = db.DB.Exec(`INSERT INTO audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
			utils.NewID(), adminID, action, targetType, targetID, detailsJSON)
		return
	}
	_ = adminService().LogAuditAction(adminID, action, targetType, targetID, details)
}

func adminService() *services.AdminService {
	return services.NewAdminService(repositories.NewAdminRepository(db.Gorm))
}

func adminPageRequest(c *gin.Context) services.PageRequest {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return services.PageRequest{Page: page, PageSize: pageSize}
}

func writeAdminServiceError(c *gin.Context, err error, fallback string) {
	switch {
	case errors.Is(err, repositories.ErrAdminTargetNotFound):
		utils.Error(c, 404, "Space not found")
	case errors.Is(err, services.ErrInvalidAdminStatus):
		utils.Error(c, 400, "Invalid status")
	case errors.Is(err, services.ErrInvalidAdminRole):
		utils.Error(c, 400, "Invalid role")
	default:
		utils.Error(c, 500, fallback)
	}
}

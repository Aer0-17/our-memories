package services

import (
	"encoding/json"
	"errors"

	"github.com/gin-gonic/gin"
	"our-memories-backend/models"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

var ErrInvalidAdminStatus = errors.New("invalid admin status")
var ErrInvalidAdminRole = errors.New("invalid admin role")

type PageRequest struct {
	Page     int
	PageSize int
}

type AdminService struct {
	repo *repositories.AdminRepository
}

func NewAdminService(repo *repositories.AdminRepository) *AdminService {
	return &AdminService{repo: repo}
}

func (s *AdminService) ListSpaces(pageReq PageRequest, search string, status string) ([]models.Space, int64, error) {
	pageReq = normalizePage(pageReq)
	return s.repo.ListSpaces(pageReq.PageSize, offset(pageReq), search, status)
}

func (s *AdminService) SpaceDetail(spaceID string) (models.Space, []models.User, gin.H, error) {
	space, users, memoryCount, photoCount, err := s.repo.SpaceDetail(spaceID)
	if err != nil {
		return models.Space{}, nil, nil, err
	}
	return space, users, gin.H{
		"memoryCount": memoryCount,
		"photoCount":  photoCount,
	}, nil
}

func (s *AdminService) UpdateSpaceStatus(adminID string, spaceID string, status string) error {
	if status != "active" && status != "suspended" && status != "deleted" {
		return ErrInvalidAdminStatus
	}
	if err := s.repo.UpdateSpaceStatus(spaceID, status); err != nil {
		return err
	}
	return s.LogAuditAction(adminID, "update_space_status", "space", spaceID, gin.H{"status": status})
}

func (s *AdminService) DeleteSpace(adminID string, spaceID string) error {
	if err := s.repo.UpdateSpaceStatus(spaceID, "deleted"); err != nil {
		return err
	}
	return s.LogAuditAction(adminID, "delete_space", "space", spaceID, nil)
}

func (s *AdminService) ListUsers(pageReq PageRequest, search string) ([]gin.H, int64, error) {
	pageReq = normalizePage(pageReq)
	rows, total, err := s.repo.ListUsers(pageReq.PageSize, offset(pageReq), search)
	if err != nil {
		return nil, 0, err
	}
	users := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		users = append(users, gin.H{
			"id":          row.ID,
			"spaceId":     row.SpaceID,
			"username":    row.Username,
			"displayName": row.DisplayName,
			"avatar":      row.Avatar,
			"role":        row.Role,
			"createdAt":   row.CreatedAt,
			"spaceCode":   row.SpaceCode,
			"spaceName":   row.SpaceName,
		})
	}
	return users, total, nil
}

func (s *AdminService) UpdateUserRole(adminID string, userID string, role string) error {
	if role != "owner" && role != "member" {
		return ErrInvalidAdminRole
	}
	if err := s.repo.UpdateUserRole(userID, role); err != nil {
		return err
	}
	return s.LogAuditAction(adminID, "update_user_role", "user", userID, gin.H{"role": role})
}

func (s *AdminService) ListOrders(pageReq PageRequest, status string) ([]gin.H, int64, error) {
	pageReq = normalizePage(pageReq)
	rows, total, err := s.repo.ListOrders(pageReq.PageSize, offset(pageReq), status)
	if err != nil {
		return nil, 0, err
	}
	orders := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		orders = append(orders, gin.H{
			"id":            row.ID,
			"spaceId":       row.SpaceID,
			"amount":        row.Amount,
			"currency":      row.Currency,
			"status":        row.Status,
			"paymentMethod": row.PaymentMethod,
			"paidAt":        row.PaidAt,
			"createdAt":     row.CreatedAt,
			"spaceCode":     row.SpaceCode,
			"spaceName":     row.SpaceName,
		})
	}
	return orders, total, nil
}

func (s *AdminService) ConfirmOrder(adminID string, orderID string) error {
	spaceID, err := s.repo.ConfirmOrder(orderID)
	if err != nil {
		return err
	}
	return s.LogAuditAction(adminID, "confirm_order", "order", orderID, gin.H{"spaceId": spaceID})
}

func (s *AdminService) Stats() (repositories.AdminStats, error) {
	return s.repo.Stats()
}

func (s *AdminService) LogAuditAction(adminID, action, targetType, targetID string, details gin.H) error {
	detailsJSON := ""
	if details != nil {
		jsonBytes, _ := json.Marshal(details)
		detailsJSON = string(jsonBytes)
	}
	return s.repo.CreateAuditLog(repositories.AuditLogRecord{
		ID:         utils.NewID(),
		AdminID:    adminID,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Details:    detailsJSON,
	})
}

func normalizePage(pageReq PageRequest) PageRequest {
	if pageReq.Page < 1 {
		pageReq.Page = 1
	}
	if pageReq.PageSize < 1 || pageReq.PageSize > 100 {
		pageReq.PageSize = 20
	}
	return pageReq
}

func offset(pageReq PageRequest) int {
	return (pageReq.Page - 1) * pageReq.PageSize
}

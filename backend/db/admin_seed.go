package db

import (
	"errors"
	"log"

	"our-memories-backend/config"
	"our-memories-backend/repositories"
	"our-memories-backend/utils"
)

func EnsureAdminFromEnv() {
	cfg := config.Get()
	if cfg.AdminUsername == "" && cfg.AdminPassword == "" {
		return
	}
	if cfg.AdminUsername == "" || cfg.AdminPassword == "" {
		log.Fatal("ADMIN_USERNAME and ADMIN_PASSWORD must be set together")
	}

	displayName := cfg.AdminDisplayName
	if displayName == "" {
		displayName = cfg.AdminUsername
	}

	passwordHash := utils.HashPassword(cfg.AdminPassword)
	repo := repositories.NewAccountRepository(Gorm)

	created := false
	if _, err := repo.AdminByUsername(cfg.AdminUsername); errors.Is(err, repositories.ErrAccountNotFound) {
		created = true
	} else if err != nil {
		log.Fatal("检查管理员失败:", err)
	}

	if err := repo.UpsertAdminByUsername(repositories.AdminRecord{
		ID:           utils.NewID(),
		Username:     cfg.AdminUsername,
		PasswordHash: passwordHash,
		DisplayName:  displayName,
	}); err != nil {
		log.Fatal("保存管理员失败:", err)
	}

	if created {
		log.Printf("管理员账号已创建: %s", cfg.AdminUsername)
		return
	}
	log.Printf("管理员账号已更新: %s", cfg.AdminUsername)
}

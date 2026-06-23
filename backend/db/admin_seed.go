package db

import (
	"log"

	"our-memories-backend/config"
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

	var adminID string
	err := DB.QueryRow(`SELECT id FROM admins WHERE username = ?`, cfg.AdminUsername).Scan(&adminID)
	if err == nil {
		if _, err := DB.Exec(
			`UPDATE admins SET password_hash = ?, display_name = ? WHERE id = ?`,
			passwordHash,
			displayName,
			adminID,
		); err != nil {
			log.Fatal("更新管理员失败:", err)
		}
		log.Printf("管理员账号已更新: %s", cfg.AdminUsername)
		return
	}

	adminID = utils.NewID()
	if _, err := DB.Exec(
		`INSERT INTO admins (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)`,
		adminID,
		cfg.AdminUsername,
		passwordHash,
		displayName,
	); err != nil {
		log.Fatal("创建管理员失败:", err)
	}
	log.Printf("管理员账号已创建: %s", cfg.AdminUsername)
}

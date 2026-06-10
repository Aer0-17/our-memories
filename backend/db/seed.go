package db

import (
	"log"

	"our-memories-backend/config"
	"our-memories-backend/utils"
)

func Seed() {
	var count int
	DB.QueryRow("SELECT COUNT(*) FROM spaces").Scan(&count)
	if count > 0 {
		log.Println("数据库已存在数据，跳过种子数据")
		return
	}

	cfg := config.Get()
	spaceID := utils.NewID()
	passwordHash := utils.HashPassword(cfg.DefaultPassword)

	_, err := DB.Exec(`INSERT INTO spaces (id, space_code, password_hash, name) VALUES (?, ?, ?, ?)`,
		spaceID, cfg.DefaultSpaceCode, passwordHash, "我们的回忆")
	if err != nil {
		log.Fatal("创建空间失败:", err)
	}

	userMeID := utils.NewID()
	userTaID := utils.NewID()

	_, err = DB.Exec(`INSERT INTO users (id, space_id, username, display_name) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
		userMeID, spaceID, "me", "刘永伦",
		userTaID, spaceID, "ta", "郭文盈")
	if err != nil {
		log.Fatal("创建用户失败:", err)
	}

	log.Println("种子数据初始化完成")
}

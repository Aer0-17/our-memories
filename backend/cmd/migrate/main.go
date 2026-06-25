package main

import (
	"log"

	"our-memories-backend/config"
	"our-memories-backend/db"
)

func main() {
	config.Load()
	db.Init()
	db.EnsureAdminFromEnv()
	if db.DB != nil {
		_ = db.DB.Close()
	}
	log.Println("数据库迁移完成")
}

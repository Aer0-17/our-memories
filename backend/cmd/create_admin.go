package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"our-memories-backend/config"
	"our-memories-backend/db"
	"our-memories-backend/repositories"
	"our-memories-backend/services"
)

func main() {
	username := flag.String("username", "", "管理员用户名")
	password := flag.String("password", "", "管理员密码")
	displayName := flag.String("name", "", "管理员显示名称")
	flag.Parse()

	if *username == "" || *password == "" || *displayName == "" {
		fmt.Println("用法: go run create_admin.go -username=admin -password=yourpassword -name=\"Admin User\"")
		os.Exit(1)
	}

	config.Load()
	db.Init()

	accountService := services.NewAccountService(repositories.NewAccountRepository(db.Gorm))
	admin, err := accountService.CreateAdmin(*username, *password, *displayName)
	if errors.Is(err, services.ErrAdminAlreadyExists) {
		log.Fatal("管理员用户名已存在")
	}
	if err != nil {
		log.Fatal("创建管理员失败:", err)
	}

	fmt.Printf("✅ 管理员创建成功!\n")
	fmt.Printf("ID: %s\n", admin.ID)
	fmt.Printf("Username: %s\n", admin.Username)
	fmt.Printf("Display Name: %s\n", admin.DisplayName)
}

package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
	"our-memories-backend/config"
)

var DB *sql.DB

func Init() {
	cfg := config.Get()

	dir := filepath.Dir(cfg.DatabasePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatal("创建数据库目录失败:", err)
	}

	var err error
	DB, err = sql.Open("sqlite", cfg.DatabasePath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		log.Fatal("打开数据库失败:", err)
	}

	if err := DB.Ping(); err != nil {
		log.Fatal("连接数据库失败:", err)
	}

	Migrate()

	if cfg.AutoSeed {
		Seed()
	}

	log.Println("数据库初始化完成")
}

func Migrate() {
	schema := `
	CREATE TABLE IF NOT EXISTS spaces (
		id TEXT PRIMARY KEY,
		space_code TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		name TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		username TEXT NOT NULL,
		display_name TEXT NOT NULL,
		avatar TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		UNIQUE(space_id, username)
	);

	CREATE TABLE IF NOT EXISTS memories (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		city_id TEXT NOT NULL,
		city TEXT NOT NULL,
		city_en TEXT NOT NULL,
		title TEXT,
		date TEXT NOT NULL,
		text TEXT NOT NULL,
		mood TEXT,
		tags TEXT,
		visibility TEXT DEFAULT 'both',
		partner_note TEXT,
		place_name TEXT,
		cover_photo_id TEXT,
		created_by_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		FOREIGN KEY (created_by_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_memories_space_city ON memories(space_id, city_id);
	CREATE INDEX IF NOT EXISTS idx_memories_space_date ON memories(space_id, created_at);

	CREATE TABLE IF NOT EXISTS memory_photos (
		id TEXT PRIMARY KEY,
		memory_id TEXT NOT NULL,
		key TEXT NOT NULL,
		url TEXT NOT NULL,
		mime_type TEXT,
		width INTEGER,
		height INTEGER,
		sort_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_memory_photos_memory ON memory_photos(memory_id);

	CREATE TABLE IF NOT EXISTS anniversary_cards (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		title TEXT NOT NULL,
		date TEXT NOT NULL,
		note TEXT DEFAULT '',
		cover_photo_id TEXT,
		repeat_yearly INTEGER DEFAULT 1,
		pinned INTEGER DEFAULT 0,
		sort_order INTEGER DEFAULT 0,
		created_by_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		FOREIGN KEY (created_by_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_anniversary_space_pinned ON anniversary_cards(space_id, pinned, sort_order);

	CREATE TABLE IF NOT EXISTS anniversary_photos (
		id TEXT PRIMARY KEY,
		anniversary_card_id TEXT NOT NULL,
		key TEXT NOT NULL,
		url TEXT NOT NULL,
		mime_type TEXT,
		sort_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (anniversary_card_id) REFERENCES anniversary_cards(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS settings (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		key TEXT NOT NULL,
		value TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id),
		UNIQUE(space_id, key)
	);

	CREATE TABLE IF NOT EXISTS auxiliary_items (
		id TEXT PRIMARY KEY,
		space_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		title TEXT NOT NULL,
		date TEXT,
		note TEXT DEFAULT '',
		city_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (space_id) REFERENCES spaces(id)
	);

	CREATE INDEX IF NOT EXISTS idx_auxiliary_space_kind ON auxiliary_items(space_id, kind);
	`

	if _, err := DB.Exec(schema); err != nil {
		log.Fatal("数据库迁移失败:", err)
	}
}

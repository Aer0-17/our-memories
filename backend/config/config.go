package config

import (
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                       string
	DatabasePath               string
	PublicDir                  string
	JWTSecret                  string
	AllowedOrigins             []string
	TrustedProxies             []string
	DefaultSpaceCode           string
	DefaultSpaceName           string
	DefaultPassword            string
	DefaultUserMeDisplayName   string
	DefaultUserTaDisplayName   string
	DefaultAnniversaryDate     string
	DefaultAnniversaryLabel    string
	LoginPasscodeLength        int
	ExposeLoginPersonalization bool
	AdminUsername              string
	AdminPassword              string
	AdminDisplayName           string
	AutoSeed                   bool
	S3Endpoint                 string
	S3Region                   string
	S3AccessKeyID              string
	S3SecretAccessKey          string
	S3Bucket                   string
	S3PublicBaseURL            string
	S3ObjectACL                string
	LocalImageDir              string
	PhotoSyncInterval          string
	JPushAppKey                string
	JPushMasterSecret          string
}

var cfg *Config

func Load() {
	_ = godotenv.Load()

	cfg = &Config{
		Port:                       getEnv("PORT", "8080"),
		DatabasePath:               getEnv("DATABASE_PATH", "./data/ourMemories.db"),
		PublicDir:                  getEnv("PUBLIC_DIR", "./public"),
		JWTSecret:                  getEnv("JWT_SECRET", "change-me-at-least-24-characters"),
		AllowedOrigins:             strings.Split(getEnv("ALLOWED_ORIGINS", "http://localhost:3002"), ","),
		TrustedProxies:             splitNonEmpty(getEnv("TRUSTED_PROXIES", "")),
		DefaultSpaceCode:           getEnv("DEFAULT_SPACE_CODE", "our-space-2026"),
		DefaultSpaceName:           getEnv("DEFAULT_SPACE_NAME", "回忆地图"),
		DefaultPassword:            getEnv("DEFAULT_PASSWORD", ""),
		DefaultUserMeDisplayName:   getEnv("DEFAULT_USER_ME_DISPLAY_NAME", "我"),
		DefaultUserTaDisplayName:   getEnv("DEFAULT_USER_TA_DISPLAY_NAME", "TA"),
		DefaultAnniversaryDate:     getEnv("DEFAULT_ANNIVERSARY_DATE", ""),
		DefaultAnniversaryLabel:    getEnv("DEFAULT_ANNIVERSARY_LABEL", ""),
		LoginPasscodeLength:        getEnvInt("LOGIN_PASSCODE_LENGTH", 4),
		ExposeLoginPersonalization: getEnv("EXPOSE_LOGIN_PERSONALIZATION", "false") == "true",
		AdminUsername:              getEnv("ADMIN_USERNAME", ""),
		AdminPassword:              getEnv("ADMIN_PASSWORD", ""),
		AdminDisplayName:           getEnv("ADMIN_DISPLAY_NAME", "Admin User"),
		AutoSeed:                   getEnv("AUTO_SEED", "false") == "true",
		S3Endpoint:                 getEnv("S3_ENDPOINT", ""),
		S3Region:                   getEnv("S3_REGION", "us-east-1"),
		S3AccessKeyID:              getEnv("S3_ACCESS_KEY_ID", ""),
		S3SecretAccessKey:          getEnv("S3_SECRET_ACCESS_KEY", ""),
		S3Bucket:                   getEnv("S3_BUCKET", "our-memories"),
		S3PublicBaseURL:            getEnv("S3_PUBLIC_BASE_URL", ""),
		S3ObjectACL:                getEnv("S3_OBJECT_ACL", ""),
		LocalImageDir:              getEnv("LOCAL_IMAGE_DIR", "./data/images"),
		PhotoSyncInterval:          getEnv("PHOTO_SYNC_INTERVAL", "10m"),
		JPushAppKey:                getEnv("JPUSH_APP_KEY", ""),
		JPushMasterSecret:          getEnv("JPUSH_MASTER_SECRET", ""),
	}

	if err := Validate(cfg); err != nil {
		log.Fatal(err)
	}
}

func Validate(cfg *Config) error {
	if len(cfg.JWTSecret) < 24 {
		return fmt.Errorf("JWT_SECRET must be at least 24 characters")
	}

	if cfg.JWTSecret == "change-me-at-least-24-characters" {
		return fmt.Errorf("JWT_SECRET must be changed from default value for security")
	}

	for _, origin := range cfg.AllowedOrigins {
		if strings.TrimSpace(origin) == "*" {
			return fmt.Errorf("ALLOWED_ORIGINS must not contain * when credentialed cookies are enabled")
		}
	}

	for _, proxy := range cfg.TrustedProxies {
		if ip := net.ParseIP(proxy); ip != nil {
			continue
		}
		_, network, err := net.ParseCIDR(proxy)
		if err != nil || network.String() == "0.0.0.0/0" || network.String() == "::/0" {
			return fmt.Errorf("TRUSTED_PROXIES must contain only specific proxy IPs or restricted CIDRs")
		}
	}

	if cfg.AutoSeed && len(cfg.DefaultPassword) < 4 {
		return fmt.Errorf("DEFAULT_PASSWORD must be at least 4 characters when AUTO_SEED=true")
	}
	if cfg.LoginPasscodeLength < 4 || cfg.LoginPasscodeLength > 12 {
		return fmt.Errorf("LOGIN_PASSCODE_LENGTH must be between 4 and 12")
	}

	if cfg.AdminUsername != "" || cfg.AdminPassword != "" {
		if cfg.AdminUsername == "" || cfg.AdminPassword == "" {
			return fmt.Errorf("ADMIN_USERNAME and ADMIN_PASSWORD must be set together")
		}
		if len(cfg.AdminPassword) < 12 || cfg.AdminPassword == "admin123456" {
			return fmt.Errorf("ADMIN_PASSWORD must be at least 12 characters and changed from the example value")
		}
	}

	return nil
}

func Get() *Config {
	if cfg == nil {
		Load()
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func splitNonEmpty(value string) []string {
	result := []string{}
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return -1
	}
	return parsed
}

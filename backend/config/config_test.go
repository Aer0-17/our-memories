package config

import "testing"

func TestLoadReadsDefaultPublicRuntimeConfig(t *testing.T) {
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("DEFAULT_SPACE_CODE", "home")
	t.Setenv("DEFAULT_SPACE_NAME", "测试空间")
	t.Setenv("DEFAULT_USER_ME_DISPLAY_NAME", "成员A")
	t.Setenv("DEFAULT_USER_TA_DISPLAY_NAME", "成员B")
	t.Setenv("DEFAULT_ANNIVERSARY_DATE", "2026.07.07")
	t.Setenv("DEFAULT_ANNIVERSARY_LABEL", "在一起")

	Load()

	got := Get()
	if got.DefaultSpaceCode != "home" ||
		got.DefaultSpaceName != "测试空间" ||
		got.DefaultUserMeDisplayName != "成员A" ||
		got.DefaultUserTaDisplayName != "成员B" ||
		got.DefaultAnniversaryDate != "2026.07.07" ||
		got.DefaultAnniversaryLabel != "在一起" {
		t.Fatalf("unexpected default runtime config: %#v", got)
	}
}

func TestValidateAllowsExplicitSecureConfig(t *testing.T) {
	cfg := secureTestConfig()
	cfg.AutoSeed = true
	cfg.DefaultPassword = "local-space-password"
	cfg.AdminUsername = "admin"
	cfg.AdminPassword = "strong-admin-password"

	if err := Validate(cfg); err != nil {
		t.Fatalf("expected secure config to pass, got %v", err)
	}
}

func TestValidateAllowsFourCharacterAutoSeedPassword(t *testing.T) {
	cfg := secureTestConfig()
	cfg.AutoSeed = true
	cfg.DefaultPassword = "1234"

	if err := Validate(cfg); err != nil {
		t.Fatalf("expected four-character seed password to pass, got %v", err)
	}
}

func TestValidateRejectsWeakAutoSeedPassword(t *testing.T) {
	cfg := secureTestConfig()
	cfg.AutoSeed = true
	cfg.DefaultPassword = "123"

	if err := Validate(cfg); err == nil {
		t.Fatal("expected weak seed password to fail")
	}
}

func TestValidateRejectsIncompleteAdminCredentials(t *testing.T) {
	cfg := secureTestConfig()
	cfg.AdminUsername = "admin"

	if err := Validate(cfg); err == nil {
		t.Fatal("expected incomplete admin credentials to fail")
	}
}

func TestValidateRejectsExampleAdminPassword(t *testing.T) {
	cfg := secureTestConfig()
	cfg.AdminUsername = "admin"
	cfg.AdminPassword = "admin123456"

	if err := Validate(cfg); err == nil {
		t.Fatal("expected example admin password to fail")
	}
}

func TestValidateRejectsWildcardAllowedOrigin(t *testing.T) {
	cfg := secureTestConfig()
	cfg.AllowedOrigins = []string{"http://localhost:3002", "*"}

	if err := Validate(cfg); err == nil {
		t.Fatal("expected wildcard allowed origin to fail")
	}
}

func secureTestConfig() *Config {
	return &Config{
		JWTSecret: "0123456789abcdef0123456789abcdef",
	}
}

package utils

import (
	"testing"

	"our-memories-backend/config"
)

func TestTokenTypesCannotBeUsedInterchangeably(t *testing.T) {
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	config.Load()

	accessToken, err := GenerateAccessToken("user-1", "space-1")
	if err != nil {
		t.Fatal(err)
	}
	refreshToken, err := GenerateRefreshToken("user-1", "space-1")
	if err != nil {
		t.Fatal(err)
	}
	adminToken, err := GenerateAdminToken("admin-1")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := VerifyAccessToken(accessToken); err != nil {
		t.Fatalf("expected access token to verify: %v", err)
	}
	if _, err := VerifyRefreshToken(refreshToken); err != nil {
		t.Fatalf("expected refresh token to verify: %v", err)
	}
	if _, err := VerifyAdminToken(adminToken); err != nil {
		t.Fatalf("expected admin token to verify: %v", err)
	}

	for name, check := range map[string]func() error{
		"refresh token as access token": func() error {
			_, err := VerifyAccessToken(refreshToken)
			return err
		},
		"access token as refresh token": func() error {
			_, err := VerifyRefreshToken(accessToken)
			return err
		},
		"admin token as access token": func() error {
			_, err := VerifyAccessToken(adminToken)
			return err
		},
	} {
		t.Run(name, func(t *testing.T) {
			if err := check(); err == nil {
				t.Fatal("expected token type mismatch to be rejected")
			}
		})
	}
}

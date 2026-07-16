package handlers

import (
	"net/http/httptest"
	"testing"

	"our-memories-backend/config"
)

func TestWebSocketOriginGuard(t *testing.T) {
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("ALLOWED_ORIGINS", "https://app.example.com")
	config.Load()

	sameOrigin := httptest.NewRequest("GET", "https://memories.example.com/api/v1/ws", nil)
	sameOrigin.Host = "memories.example.com"
	sameOrigin.Header.Set("Origin", "https://memories.example.com")
	if !websocketOriginAllowed(sameOrigin) {
		t.Fatal("expected same-origin WebSocket request to pass")
	}

	trustedOrigin := httptest.NewRequest("GET", "https://memories.example.com/api/v1/ws", nil)
	trustedOrigin.Header.Set("Origin", "https://app.example.com")
	if !websocketOriginAllowed(trustedOrigin) {
		t.Fatal("expected configured origin to pass")
	}

	untrustedOrigin := httptest.NewRequest("GET", "https://memories.example.com/api/v1/ws", nil)
	untrustedOrigin.Header.Set("Origin", "https://evil.example.com")
	if websocketOriginAllowed(untrustedOrigin) {
		t.Fatal("expected untrusted origin to be rejected")
	}
}

func TestWebSocketProtocolToken(t *testing.T) {
	got := websocketProtocolToken("our-memories, auth.header.payload.signature")
	if got != "header.payload.signature" {
		t.Fatalf("unexpected protocol token: %q", got)
	}
	if got := websocketProtocolToken("our-memories"); got != "" {
		t.Fatalf("expected missing auth protocol to return empty token, got %q", got)
	}
}

package utils

import (
	"crypto/rand"
	"encoding/base32"
	"strings"
)

func NewID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}

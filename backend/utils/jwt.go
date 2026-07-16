package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"our-memories-backend/config"
)

const tokenIssuer = "our-memories"

type TokenType string

const (
	AccessTokenType  TokenType = "access"
	RefreshTokenType TokenType = "refresh"
	AdminTokenType   TokenType = "admin"
)

type Claims struct {
	UserID  string    `json:"userId"`
	SpaceID string    `json:"spaceId"`
	IsAdmin bool      `json:"isAdmin,omitempty"`
	Type    TokenType `json:"type"`
	jwt.RegisteredClaims
}

func GenerateAccessToken(userID, spaceID string) (string, error) {
	claims := Claims{
		UserID:  userID,
		SpaceID: spaceID,
		Type:    AccessTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    tokenIssuer,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.Get().JWTSecret))
}

func GenerateRefreshToken(userID, spaceID string) (string, error) {
	claims := Claims{
		UserID:  userID,
		SpaceID: spaceID,
		Type:    RefreshTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    tokenIssuer,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.Get().JWTSecret))
}

func VerifyAccessToken(tokenString string) (*Claims, error) {
	return verifyToken(tokenString, AccessTokenType)
}

func VerifyRefreshToken(tokenString string) (*Claims, error) {
	return verifyToken(tokenString, RefreshTokenType)
}

func VerifyAdminToken(tokenString string) (*Claims, error) {
	return verifyToken(tokenString, AdminTokenType)
}

func verifyToken(tokenString string, expectedType TokenType) (*Claims, error) {
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(tokenIssuer),
	)
	token, err := parser.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.Get().JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid && claims.Type == expectedType {
		return claims, nil
	}

	return nil, errors.New("invalid token type")
}

func GenerateAdminToken(adminID string) (string, error) {
	claims := Claims{
		UserID:  adminID,
		IsAdmin: true,
		Type:    AdminTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    tokenIssuer,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.Get().JWTSecret))
}

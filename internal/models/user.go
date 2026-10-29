package models

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// User represents the users table row
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	FullName     string    `json:"fullName"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// RegisterRequest contains payload for user registration
type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"fullName"`
}

// LoginRequest contains payload for user login
type LoginRequest struct {
	Username string `json:"username"` // username or email
	Password string `json:"password"`
}

// AuthResponse is sent back upon successful login or register
type AuthResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token"`
	User    User   `json:"user"`
	Message string `json:"message,omitempty"`
}

// UserClaims defines JWT token claims
type UserClaims struct {
	UserID   int64  `json:"userId"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

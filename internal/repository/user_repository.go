package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"excaliflow/internal/models"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// CreateUser inserts a new user
func (r *UserRepository) CreateUser(username, email, passwordHash, fullName string) (*models.User, error) {
	query := `
		INSERT INTO users (username, email, password_hash, full_name, created_at, updated_at)
		VALUES (?, ?, ?, ?, NOW(), NOW())
	`
	res, err := r.db.Exec(query, username, email, passwordHash, fullName)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get user last insert id: %w", err)
	}

	return r.GetUserByID(id)
}

// GetUserByUsernameOrEmail finds a user by username or email
func (r *UserRepository) GetUserByUsernameOrEmail(identifier string) (*models.User, error) {
	identifier = strings.TrimSpace(identifier)
	query := `
		SELECT id, username, email, password_hash, full_name, created_at, updated_at
		FROM users
		WHERE username = ? OR email = ?
		LIMIT 1
	`
	var user models.User
	err := r.db.QueryRow(query, identifier, identifier).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.PasswordHash,
		&user.FullName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query user: %w", err)
	}

	return &user, nil
}

// GetUserByID finds a user by primary key ID
func (r *UserRepository) GetUserByID(id int64) (*models.User, error) {
	query := `
		SELECT id, username, email, password_hash, full_name, created_at, updated_at
		FROM users
		WHERE id = ?
		LIMIT 1
	`
	var user models.User
	err := r.db.QueryRow(query, id).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.PasswordHash,
		&user.FullName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query user by id: %w", err)
	}

	return &user, nil
}

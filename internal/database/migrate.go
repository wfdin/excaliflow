package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"strings"
)

//go:embed migrations/000001_create_workspaces_tables.up.sql
var migration000001Up string

//go:embed migrations/000002_create_users_table.up.sql
var migration000002Up string

type migrationItem struct {
	version int64
	name    string
	sqlText string
}

// RunMigrations executes pending database migrations
func RunMigrations(db *sql.DB) error {
	log.Println("[MIGRATION] Checking database migrations...")

	// 1. Ensure schema_migrations table exists
	createMigrationTableQuery := `
	CREATE TABLE IF NOT EXISTS schema_migrations (
		version BIGINT NOT NULL PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
	`
	if _, err := db.Exec(createMigrationTableQuery); err != nil {
		return fmt.Errorf("failed to create schema_migrations table: %w", err)
	}

	migrations := []migrationItem{
		{version: 1, name: "000001_create_workspaces_tables", sqlText: migration000001Up},
		{version: 2, name: "000002_create_users_table", sqlText: migration000002Up},
	}

	for _, m := range migrations {
		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = ?", m.version).Scan(&count)
		if err != nil {
			return fmt.Errorf("failed to query schema_migrations for version %d: %w", m.version, err)
		}

		if count == 0 {
			log.Printf("[MIGRATION] Applying migration %s (v%d)...", m.name, m.version)

			statements := splitSqlStatements(m.sqlText)
			for _, stmt := range statements {
				trimmed := strings.TrimSpace(stmt)
				if trimmed == "" {
					continue
				}
				if _, err := db.Exec(trimmed); err != nil {
					return fmt.Errorf("failed executing migration %s statement [%s]: %w", m.name, trimmed, err)
				}
			}

			_, err = db.Exec("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", m.version, m.name)
			if err != nil {
				return fmt.Errorf("failed to record migration %s: %w", m.name, err)
			}
			log.Printf("[MIGRATION] Migration %s applied successfully.", m.name)
		}
	}

	log.Println("[MIGRATION] All database migrations are up to date.")
	return nil
}

func splitSqlStatements(sqlText string) []string {
	var statements []string
	var current strings.Builder

	lines := strings.Split(sqlText, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") || strings.HasPrefix(trimmed, "#") {
			continue // skip comment lines
		}
		current.WriteString(line + "\n")
		if strings.HasSuffix(trimmed, ";") {
			statements = append(statements, current.String())
			current.Reset()
		}
	}
	if current.Len() > 0 && strings.TrimSpace(current.String()) != "" {
		statements = append(statements, current.String())
	}
	return statements
}

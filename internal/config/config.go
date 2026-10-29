package config

import (
	"fmt"
	"log"
	"os"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	ServerPort string
	StaticDir  string
	JWTSecret  string
	// Comma-separated list of allowed CORS origins, or "*" to allow all.
	AllowedOrigins string
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func LoadConfig() *Config {
	// Load the local .env file first (if present). Real environment variables
	// always win, so .env only fills in the values that are not set yet.
	envFile := getEnv("ENV_FILE", ".env")
	if loaded, err := loadDotEnv(envFile); err != nil {
		log.Printf("[CONFIG] Warning: failed to read %s: %v", envFile, err)
	} else if loaded {
		log.Printf("[CONFIG] Loaded environment variables from %s", envFile)
	}

	return &Config{
		DBHost:         getEnv("DB_HOST", "localhost"),
		DBPort:         getEnv("DB_PORT", "3306"),
		DBUser:         getEnv("DB_USER", "root"),
		DBPassword:     getEnv("DB_PASSWORD", "12345678"),
		DBName:         getEnv("DB_NAME", "excaliflow"),
		ServerPort:     getEnv("PORT", "3000"),
		StaticDir:      getEnv("STATIC_DIR", "."),
		JWTSecret:      getEnv("JWT_SECRET", "excaliflow-secret-key-change-in-production"),
		AllowedOrigins: getEnv("CORS_ORIGINS", "*"),
	}
}

func (c *Config) DSN() string {
	// Format: username:password@tcp(host:port)/dbname?charset=utf8mb4&parseTime=true&loc=Local
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=true&loc=Local&multiStatements=true",
		c.DBUser,
		c.DBPassword,
		c.DBHost,
		c.DBPort,
		c.DBName,
	)
}

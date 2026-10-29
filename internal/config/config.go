package config

import (
	"fmt"
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
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func LoadConfig() *Config {
	return &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "3306"),
		DBUser:     getEnv("DB_USER", "root"),
		DBPassword: getEnv("DB_PASSWORD", "12345678"),
		DBName:     getEnv("DB_NAME", "excaliflow"),
		ServerPort: getEnv("PORT", "3000"),
		StaticDir:  getEnv("STATIC_DIR", "."),
		JWTSecret:  getEnv("JWT_SECRET", "excaliflow-secret-key-change-in-production"),
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

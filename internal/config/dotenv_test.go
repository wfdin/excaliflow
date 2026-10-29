package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDotEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")

	content := "\uFEFF# comment line\n" +
		"\n" +
		"DB_HOST=db.internal\n" +
		"export DB_PORT=3307\n" +
		"DB_PASSWORD=\"p@ss word\"\n" +
		"DB_NAME='excaliflow_test'\n" +
		"JWT_SECRET=already-set\n" +
		"INVALID_LINE\n"

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write temp .env: %v", err)
	}

	// A real environment variable must win over the .env value.
	t.Setenv("JWT_SECRET", "from-environment")
	for _, key := range []string{"DB_HOST", "DB_PORT", "DB_PASSWORD", "DB_NAME"} {
		os.Unsetenv(key)
		t.Cleanup(func() { os.Unsetenv(key) })
	}

	loaded, err := loadDotEnv(path)
	if err != nil {
		t.Fatalf("loadDotEnv returned error: %v", err)
	}
	if !loaded {
		t.Fatal("expected .env file to be reported as loaded")
	}

	want := map[string]string{
		"DB_HOST":     "db.internal",
		"DB_PORT":     "3307",
		"DB_PASSWORD": "p@ss word",
		"DB_NAME":     "excaliflow_test",
		"JWT_SECRET":  "from-environment",
	}
	for key, expected := range want {
		if got := os.Getenv(key); got != expected {
			t.Errorf("%s = %q, want %q", key, got, expected)
		}
	}
}

func TestLoadDotEnvMissingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "does-not-exist.env")

	loaded, err := loadDotEnv(path)
	if err != nil {
		t.Fatalf("missing .env should not be an error, got: %v", err)
	}
	if loaded {
		t.Fatal("missing .env should report loaded = false")
	}
}

func TestLoadConfigUsesDotEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "custom.env")
	if err := os.WriteFile(path, []byte("DB_HOST=from-dotenv\nDB_PORT=3399\n"), 0o600); err != nil {
		t.Fatalf("failed to write temp env: %v", err)
	}

	t.Setenv("ENV_FILE", path)
	os.Unsetenv("DB_HOST")
	os.Unsetenv("DB_PORT")
	t.Cleanup(func() {
		os.Unsetenv("DB_HOST")
		os.Unsetenv("DB_PORT")
	})

	cfg := LoadConfig()
	if cfg.DBHost != "from-dotenv" {
		t.Errorf("DBHost = %q, want %q", cfg.DBHost, "from-dotenv")
	}
	if cfg.DBPort != "3399" {
		t.Errorf("DBPort = %q, want %q", cfg.DBPort, "3399")
	}
	if cfg.DBUser != "root" {
		t.Errorf("DBUser = %q, want default %q", cfg.DBUser, "root")
	}
}

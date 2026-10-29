package main

import (
	"flag"
	"log"
	"os"

	"excaliflow/internal/config"
	"excaliflow/internal/database"
	"excaliflow/internal/handlers"
	"excaliflow/internal/repository"
	"excaliflow/internal/server"
)

func main() {
	migrateOnly := flag.Bool("migrate", false, "Run migrations and exit")
	flag.Parse()

	log.Println("==================================================")
	log.Println("           EXCALIFLOW GO BACKEND SERVER           ")
	log.Println("==================================================")

	// Load configuration
	cfg := config.LoadConfig()
	log.Printf("[CONFIG] Database: %s:%s@tcp(%s:%s)/%s",
		cfg.DBUser, "********", cfg.DBHost, cfg.DBPort, cfg.DBName)

	// Connect to MySQL
	db, err := database.Connect(cfg.DSN())
	if err != nil {
		log.Fatalf("[FATAL] Database connection failed: %v\nMake sure MySQL is running on port %s and database '%s' exists.",
			err, cfg.DBPort, cfg.DBName)
	}
	defer db.Close()
	log.Println("[DATABASE] Successfully connected to MySQL database.")

	// Execute migrations
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("[FATAL] Migration execution failed: %v", err)
	}

	if *migrateOnly {
		log.Println("[MIGRATION] Migration completed successfully. Exiting.")
		os.Exit(0)
	}

	// Initialize repositories and handlers
	userRepo := repository.NewUserRepository(db)
	authHandler := handlers.NewAuthHandler(cfg, userRepo)
	workspaceRepo := repository.NewWorkspaceRepository(db)
	workspaceHandler := handlers.NewWorkspaceHandler(workspaceRepo, authHandler)
	srv := server.NewServer(cfg, workspaceHandler, authHandler)

	// Start server
	if err := srv.Start(); err != nil {
		log.Fatalf("[FATAL] Server error: %v", err)
	}
}

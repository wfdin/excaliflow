package server

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"excaliflow/internal/config"
	"excaliflow/internal/handlers"
)

var mimeTypes = map[string]string{
	".html":       "text/html; charset=utf-8",
	".js":         "application/javascript; charset=utf-8",
	".css":        "text/css; charset=utf-8",
	".json":       "application/json; charset=utf-8",
	".excaliflow": "application/json; charset=utf-8",
	".excalidraw": "application/json; charset=utf-8",
	".png":        "image/png",
	".webp":       "image/webp",
	".svg":        "image/svg+xml",
	".ico":        "image/x-icon",
	".woff2":      "font/woff2",
	".woff":       "font/woff",
	".ttf":        "font/ttf",
	".webm":       "video/webm",
	".mp4":        "video/mp4",
}

type Server struct {
	cfg         *config.Config
	handler     *handlers.WorkspaceHandler
	authHandler *handlers.AuthHandler
}

func NewServer(cfg *config.Config, handler *handlers.WorkspaceHandler, authHandler *handlers.AuthHandler) *Server {
	return &Server{
		cfg:         cfg,
		handler:     handler,
		authHandler: authHandler,
	}
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	allowed := parseAllowedOrigins(s.cfg.AllowedOrigins)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isOriginAllowed(origin, allowed) {
			w.Header().Set("Access-Control-Allow-Origin", originOrStar(origin))
		}
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func parseAllowedOrigins(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(strings.TrimSuffix(part, "/"))
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func isOriginAllowed(origin string, allowed []string) bool {
	if len(allowed) == 0 {
		return false
	}
	for _, a := range allowed {
		if a == "*" || (origin != "" && strings.EqualFold(a, origin)) {
			return true
		}
	}
	return false
}

func originOrStar(origin string) string {
	if origin == "" {
		return "*"
	}
	return origin
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// Auth API endpoints
	mux.HandleFunc("/api/auth/register", s.authHandler.Register)
	mux.HandleFunc("/api/auth/login", s.authHandler.Login)
	mux.HandleFunc("/api/auth/me", s.authHandler.Me)

	// Workspace API endpoints
	mux.HandleFunc("/api/health", s.handler.HealthCheck)
	mux.HandleFunc("/api/workspace", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead:
			s.handler.GetWorkspace(w, r)
		case http.MethodPost, http.MethodPut:
			s.handler.SaveWorkspace(w, r)
		case http.MethodDelete:
			s.handler.DeleteWorkspace(w, r)
		default:
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/workspaces", s.handler.ListWorkspaces)

	// Static files handler with security check
	staticAbs, err := filepath.Abs(s.cfg.StaticDir)
	if err != nil {
		staticAbs = "."
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		cleanPath := filepath.Clean(r.URL.Path)
		if cleanPath == "/" || cleanPath == "\\" || cleanPath == "." {
			cleanPath = "index.html"
		} else {
			cleanPath = strings.TrimPrefix(cleanPath, "/")
			cleanPath = strings.TrimPrefix(cleanPath, "\\")
		}

		targetPath := filepath.Join(staticAbs, cleanPath)

		// Security: Prevent directory traversal
		if !strings.HasPrefix(targetPath, staticAbs) {
			http.Error(w, "403 Forbidden", http.StatusForbidden)
			return
		}

		info, err := os.Stat(targetPath)
		if err != nil || info.IsDir() {
			indexPath := filepath.Join(staticAbs, "index.html")
			if _, err := os.Stat(indexPath); err == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Header().Set("Cache-Control", "no-cache")
				http.ServeFile(w, r, indexPath)
				return
			}
			http.NotFound(w, r)
			return
		}

		ext := strings.ToLower(filepath.Ext(targetPath))
		if mime, exists := mimeTypes[ext]; exists {
			w.Header().Set("Content-Type", mime)
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, targetPath)
	})

	return s.corsMiddleware(mux)
}

func (s *Server) Start() error {
	addr := ":" + s.cfg.ServerPort
	log.Printf("[SERVER] Excaliflow Go Server running at http://localhost%s", addr)
	return http.ListenAndServe(addr, s.Routes())
}

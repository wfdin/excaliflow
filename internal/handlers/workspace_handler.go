package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"excaliflow/internal/models"
	"excaliflow/internal/repository"
)

type WorkspaceHandler struct {
	repo        *repository.WorkspaceRepository
	authHandler *AuthHandler
}

func NewWorkspaceHandler(repo *repository.WorkspaceRepository, authHandler *AuthHandler) *WorkspaceHandler {
	return &WorkspaceHandler{
		repo:        repo,
		authHandler: authHandler,
	}
}

// HealthCheck returns database connection status
func (h *WorkspaceHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "ok",
		"database": "connected",
		"service":  "Excaliflow Go Backend",
	})
}

// requireUser resolves the authenticated user. Workspaces are per account and
// guests keep their work in localStorage only, so anonymous requests are
// rejected here instead of falling back to a shared user_id IS NULL row.
func (h *WorkspaceHandler) requireUser(w http.ResponseWriter, r *http.Request) *int64 {
	userID := h.authHandler.ExtractUserFromRequest(r)
	if userID == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("WWW-Authenticate", `Bearer realm="excaliflow"`)
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Authentication required",
		})
		return nil
	}
	return userID
}

// GetWorkspace handles GET /api/workspace?id=...
func (h *WorkspaceHandler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID := h.requireUser(w, r)
	if userID == nil {
		return
	}
	workspaceID := strings.TrimSpace(r.URL.Query().Get("id"))
	if workspaceID == "" {
		workspaceID = "default"
	}

	record, err := h.repo.GetWorkspace(userID, workspaceID)
	if err != nil {
		log.Printf("[API ERROR] GetWorkspace failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to load workspace from database",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if record == nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Workspace not found in database",
			"id":      workspaceID,
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(record.Data)
}

// SaveWorkspace handles POST and PUT /api/workspace
func (h *WorkspaceHandler) SaveWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID := h.requireUser(w, r)
	if userID == nil {
		return
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 50*1024*1024))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	if len(bodyBytes) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Request body cannot be empty",
		})
		return
	}

	workspaceID := strings.TrimSpace(r.URL.Query().Get("id"))

	var payload models.WorkspacePayload
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		log.Printf("[API ERROR] Invalid JSON payload: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid JSON workspace structure",
		})
		return
	}

	workspaceName := "Default Workspace"
	if len(payload.Tabs) > 0 && strings.TrimSpace(payload.Tabs[0].Name) != "" {
		workspaceName = payload.Tabs[0].Name
	}

	activeTabID := payload.ActiveTabID
	if activeTabID == "" && len(payload.Tabs) > 0 {
		activeTabID = payload.Tabs[0].ID
	}

	savedRecord, err := h.repo.SaveWorkspace(
		userID,
		workspaceID,
		workspaceName,
		activeTabID,
		payload.AppState,
		bodyBytes,
		payload.Tabs,
	)

	if err != nil {
		log.Printf("[API ERROR] SaveWorkspace failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to save workspace into database",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"id":          savedRecord.ID,
		"userId":      savedRecord.UserID,
		"activeTabId": activeTabID,
		"tabCount":    len(payload.Tabs),
		"message":     "Workspace saved successfully to MySQL database",
	})
}

// WorkspaceShare handles GET/POST/DELETE /api/workspace/share?id=...
// It manages the public read-only link of a workspace owned by the caller.
func (h *WorkspaceHandler) WorkspaceShare(w http.ResponseWriter, r *http.Request) {
	userID := h.requireUser(w, r)
	if userID == nil {
		return
	}

	workspaceID := strings.TrimSpace(r.URL.Query().Get("id"))
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"error":   "Workspace ID is required",
		})
		return
	}

	switch r.Method {
	case http.MethodGet:
		share, err := h.repo.GetWorkspaceShare(*userID, workspaceID)
		if err != nil {
			log.Printf("[API ERROR] GetWorkspaceShare failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"success": false,
				"error":   "Failed to load share settings",
			})
			return
		}
		if share == nil {
			writeJSON(w, http.StatusNotFound, map[string]interface{}{
				"success": false,
				"error":   "Workspace not found",
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"enabled": share.Enabled,
			"token":   share.Token,
		})

	case http.MethodPost, http.MethodPut:
		share, err := h.repo.EnableWorkspaceShare(*userID, workspaceID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusNotFound, map[string]interface{}{
					"success": false,
					"error":   "Workspace not found",
				})
				return
			}
			log.Printf("[API ERROR] EnableWorkspaceShare failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"success": false,
				"error":   "Failed to create public link",
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"enabled": share.Enabled,
			"token":   share.Token,
		})

	case http.MethodDelete:
		if err := h.repo.DisableWorkspaceShare(*userID, workspaceID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusNotFound, map[string]interface{}{
					"success": false,
					"error":   "Workspace not found",
				})
				return
			}
			log.Printf("[API ERROR] DisableWorkspaceShare failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"success": false,
				"error":   "Failed to disable public link",
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"enabled": false,
		})

	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// PublicWorkspace handles GET /api/public/workspace/{token}. It is the only
// anonymous workspace endpoint and exposes just the diagram payload.
func (h *WorkspaceHandler) PublicWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	token := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/public/workspace/"), "/")
	if token == "" {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{
			"success": false,
			"error":   "Shared diagram not found",
		})
		return
	}

	record, err := h.repo.GetSharedWorkspace(token)
	if err != nil {
		log.Printf("[API ERROR] GetSharedWorkspace failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"error":   "Failed to load shared diagram",
		})
		return
	}
	if record == nil {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{
			"success": false,
			"error":   "Shared diagram not found or link disabled",
		})
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"id":        record.ID,
		"name":      record.Name,
		"updatedAt": record.UpdatedAt,
		"workspace": record.Data,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

// ListWorkspaces handles GET /api/workspaces
func (h *WorkspaceHandler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID := h.requireUser(w, r)
	if userID == nil {
		return
	}
	list, err := h.repo.ListWorkspaces(userID)
	if err != nil {
		log.Printf("[API ERROR] ListWorkspaces failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to list workspaces",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"userId":     userID,
		"workspaces": list,
	})
}

// DeleteWorkspace handles DELETE /api/workspace?id=...
func (h *WorkspaceHandler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID := h.requireUser(w, r)
	if userID == nil {
		return
	}
	workspaceID := strings.TrimSpace(r.URL.Query().Get("id"))
	if workspaceID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Workspace ID is required",
		})
		return
	}

	if err := h.repo.DeleteWorkspace(userID, workspaceID); err != nil {
		log.Printf("[API ERROR] DeleteWorkspace failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Failed to delete workspace or unauthorized",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Workspace deleted successfully",
		"id":      workspaceID,
	})
}

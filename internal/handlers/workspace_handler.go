package handlers

import (
	"encoding/json"
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

// GetWorkspace handles GET /api/workspace?id=...
func (h *WorkspaceHandler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID := h.authHandler.ExtractUserFromRequest(r)
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

	userID := h.authHandler.ExtractUserFromRequest(r)

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

// ListWorkspaces handles GET /api/workspaces
func (h *WorkspaceHandler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID := h.authHandler.ExtractUserFromRequest(r)
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

	userID := h.authHandler.ExtractUserFromRequest(r)
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

package models

import (
	"encoding/json"
	"time"
)

// WorkspacePayload represents the full JSON serialized workspace sent from the frontend
type WorkspacePayload struct {
	Type        string          `json:"type"`
	Version     int             `json:"version"`
	Source      string          `json:"source"`
	ActiveTabID string          `json:"activeTabId"`
	Elements    json.RawMessage `json:"elements,omitempty"`
	AppState    json.RawMessage `json:"appState,omitempty"`
	Tabs        []TabPayload    `json:"tabs"`
}

// TabPayload represents a single canvas tab inside the workspace payload
type TabPayload struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Elements    json.RawMessage `json:"elements"`
	ScrollX     float64         `json:"scrollX"`
	ScrollY     float64         `json:"scrollY"`
	Zoom        float64         `json:"zoom"`
	CanvasBg    string          `json:"canvasBg"`
	FlowEnabled bool            `json:"flowEnabled"`
	FlowMode    string          `json:"flowMode"`
	FlowSpeed   float64         `json:"flowSpeed"`
}

// WorkspaceRecord represents the row in the `workspaces` table
type WorkspaceRecord struct {
	ID          string          `json:"id"`
	UserID      *int64          `json:"userId,omitempty"`
	Name        string          `json:"name"`
	ActiveTabID string          `json:"activeTabId"`
	AppState    json.RawMessage `json:"appState,omitempty"`
	Data        json.RawMessage `json:"data"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// WorkspaceSummary is used for listing available workspaces
type WorkspaceSummary struct {
	ID          string    `json:"id"`
	UserID      *int64    `json:"userId,omitempty"`
	Name        string    `json:"name"`
	ActiveTabID string    `json:"activeTabId"`
	TabCount    int       `json:"tabCount"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

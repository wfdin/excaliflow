package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"excaliflow/internal/config"
	"excaliflow/internal/database"
	"excaliflow/internal/handlers"
	"excaliflow/internal/models"
	"excaliflow/internal/repository"
	"excaliflow/internal/server"
)

func setupTestApp(t *testing.T) (*repository.WorkspaceRepository, *handlers.WorkspaceHandler, *handlers.AuthHandler, http.Handler) {
	cfg := config.LoadConfig()
	db, err := database.Connect(cfg.DSN())
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}

	if err := database.RunMigrations(db); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	userRepo := repository.NewUserRepository(db)
	authHandler := handlers.NewAuthHandler(cfg, userRepo)
	workspaceRepo := repository.NewWorkspaceRepository(db)
	workspaceHandler := handlers.NewWorkspaceHandler(workspaceRepo, authHandler)
	srv := server.NewServer(cfg, workspaceHandler, authHandler)

	return workspaceRepo, workspaceHandler, authHandler, srv.Routes()
}

func TestHealthCheck(t *testing.T) {
	_, _, _, router := setupTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", rec.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if res["status"] != "ok" || res["database"] != "connected" {
		t.Fatalf("Unexpected response body: %v", res)
	}
}

func TestUserRegistrationAndLogin(t *testing.T) {
	_, _, _, router := setupTestApp(t)
	uniqueSuffix := time.Now().UnixNano()

	regBody := fmt.Sprintf(`{
		"username": "user_%d",
		"email": "user_%d@example.com",
		"password": "secretpassword123",
		"fullName": "Test User"
	}`, uniqueSuffix, uniqueSuffix)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(regBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created from register, got %d: %s", rec.Code, rec.Body.String())
	}

	var authRes models.AuthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &authRes); err != nil {
		t.Fatalf("Failed to parse register response: %v", err)
	}
	if authRes.Token == "" || authRes.User.ID == 0 {
		t.Fatalf("Expected valid token and user in response, got %v", authRes)
	}

	// Test login with email
	loginBody := fmt.Sprintf(`{
		"username": "user_%d@example.com",
		"password": "secretpassword123"
	}`, uniqueSuffix)

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginRec := httptest.NewRecorder()
	router.ServeHTTP(loginRec, loginReq)

	if loginRec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK from login, got %d: %s", loginRec.Code, loginRec.Body.String())
	}

	var loginRes models.AuthResponse
	if err := json.Unmarshal(loginRec.Body.Bytes(), &loginRes); err != nil {
		t.Fatalf("Failed to parse login response: %v", err)
	}
	if loginRes.Token == "" {
		t.Fatalf("Login response missing token")
	}

	// Test /api/auth/me
	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+loginRes.Token)
	meRec := httptest.NewRecorder()
	router.ServeHTTP(meRec, meReq)

	if meRec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK from /api/auth/me, got %d", meRec.Code)
	}
}

func TestWorkspaceEndpointsRequireAuth(t *testing.T) {
	_, _, _, router := setupTestApp(t)

	cases := []struct {
		name   string
		method string
		target string
		body   string
	}{
		{"get", http.MethodGet, "/api/workspace?id=default", ""},
		{"save", http.MethodPost, "/api/workspace?id=default", `{"tabs":[]}`},
		{"list", http.MethodGet, "/api/workspaces", ""},
		{"delete", http.MethodDelete, "/api/workspace?id=default", ""},
		{"share", http.MethodGet, "/api/workspace/share?id=default", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.target, bytes.NewBufferString(tc.body))
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("Expected 401 for anonymous %s %s, got %d: %s",
					tc.method, tc.target, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestMultiUserWorkspaceIsolation(t *testing.T) {
	_, _, _, router := setupTestApp(t)
	uniqueSuffix := time.Now().UnixNano()

	// 1. Register User Alpha
	alphaReg := fmt.Sprintf(`{"username":"alpha_%d","email":"alpha_%d@test.com","password":"password123","fullName":"Alpha"}`, uniqueSuffix, uniqueSuffix)
	alphaReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(alphaReg))
	alphaRec := httptest.NewRecorder()
	router.ServeHTTP(alphaRec, alphaReq)
	var alphaAuth models.AuthResponse
	json.Unmarshal(alphaRec.Body.Bytes(), &alphaAuth)

	// 2. Register User Beta
	betaReg := fmt.Sprintf(`{"username":"beta_%d","email":"beta_%d@test.com","password":"password123","fullName":"Beta"}`, uniqueSuffix, uniqueSuffix)
	betaReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(betaReg))
	betaRec := httptest.NewRecorder()
	router.ServeHTTP(betaRec, betaReq)
	var betaAuth models.AuthResponse
	json.Unmarshal(betaRec.Body.Bytes(), &betaAuth)

	// 3. User Alpha saves workspace
	alphaWs := `{
		"type": "excaliflow",
		"version": 2,
		"source": "Excaliflow",
		"activeTabId": "tab_alpha",
		"elements": [{"id":"box_a","type":"rectangle","text":"Alpha Architecture"}],
		"tabs": [{"id":"tab_alpha","name":"Alpha Cloud","elements":[]}]
	}`
	saveAlphaReq := httptest.NewRequest(http.MethodPost, "/api/workspace?id=alpha_project", bytes.NewBufferString(alphaWs))
	saveAlphaReq.Header.Set("Authorization", "Bearer "+alphaAuth.Token)
	saveAlphaRec := httptest.NewRecorder()
	router.ServeHTTP(saveAlphaRec, saveAlphaReq)
	if saveAlphaRec.Code != http.StatusOK {
		t.Fatalf("Failed to save Alpha workspace: %s", saveAlphaRec.Body.String())
	}

	// 4. User Beta saves workspace
	betaWs := `{
		"type": "excaliflow",
		"version": 2,
		"source": "Excaliflow",
		"activeTabId": "tab_beta",
		"elements": [{"id":"box_b","type":"ellipse","text":"Beta Workflow"}],
		"tabs": [{"id":"tab_beta","name":"Beta Pipeline","elements":[]}]
	}`
	saveBetaReq := httptest.NewRequest(http.MethodPost, "/api/workspace?id=beta_project", bytes.NewBufferString(betaWs))
	saveBetaReq.Header.Set("Authorization", "Bearer "+betaAuth.Token)
	saveBetaRec := httptest.NewRecorder()
	router.ServeHTTP(saveBetaRec, saveBetaReq)
	if saveBetaRec.Code != http.StatusOK {
		t.Fatalf("Failed to save Beta workspace: %s", saveBetaRec.Body.String())
	}

	// 5. Verify User Alpha's workspace list contains ONLY Alpha's workspace
	listAlphaReq := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	listAlphaReq.Header.Set("Authorization", "Bearer "+alphaAuth.Token)
	listAlphaRec := httptest.NewRecorder()
	router.ServeHTTP(listAlphaRec, listAlphaReq)

	var alphaList struct {
		Workspaces []models.WorkspaceSummary `json:"workspaces"`
	}
	json.Unmarshal(listAlphaRec.Body.Bytes(), &alphaList)

	for _, ws := range alphaList.Workspaces {
		if ws.ID == "beta_project" {
			t.Fatalf("SECURITY LEAK: User Alpha can see User Beta's workspace: beta_project")
		}
	}

	// 6. Verify User Beta's workspace list contains ONLY Beta's workspace
	listBetaReq := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	listBetaReq.Header.Set("Authorization", "Bearer "+betaAuth.Token)
	listBetaRec := httptest.NewRecorder()
	router.ServeHTTP(listBetaRec, listBetaReq)

	var betaList struct {
		Workspaces []models.WorkspaceSummary `json:"workspaces"`
	}
	json.Unmarshal(listBetaRec.Body.Bytes(), &betaList)

	for _, ws := range betaList.Workspaces {
		if ws.ID == "alpha_project" {
			t.Fatalf("SECURITY LEAK: User Beta can see User Alpha's workspace: alpha_project")
		}
	}
}

// TestWorkspaceTabIDReuse covers the duplicate-key crash seen in production:
// the browser generates tab ids that are only unique inside one workspace, so
// saving a second workspace with a reused tab id must not fail on PRIMARY.
func TestWorkspaceTabIDReuse(t *testing.T) {
	_, _, _, router := setupTestApp(t)
	uniqueSuffix := time.Now().UnixNano()

	regBody := fmt.Sprintf(`{"username":"tabs_%d","email":"tabs_%d@test.com","password":"password123","fullName":"Tabs"}`, uniqueSuffix, uniqueSuffix)
	regReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(regBody))
	regRec := httptest.NewRecorder()
	router.ServeHTTP(regRec, regReq)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("Failed to register user: %s", regRec.Body.String())
	}

	var authRes models.AuthResponse
	if err := json.Unmarshal(regRec.Body.Bytes(), &authRes); err != nil {
		t.Fatalf("Failed to parse register response: %v", err)
	}

	save := func(wsID, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/workspace?id="+wsID, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+authRes.Token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	// Same tab id, two different workspaces.
	first := save(fmt.Sprintf("ws_reuse_a_%d", uniqueSuffix), `{
		"type": "excaliflow", "version": 2, "source": "Excaliflow",
		"activeTabId": "tab_1006_3520",
		"tabs": [{"id":"tab_1006_3520","name":"Canvas 1","elements":[]}]
	}`)
	if first.Code != http.StatusOK {
		t.Fatalf("First save failed with %d: %s", first.Code, first.Body.String())
	}

	second := save(fmt.Sprintf("ws_reuse_b_%d", uniqueSuffix), `{
		"type": "excaliflow", "version": 2, "source": "Excaliflow",
		"activeTabId": "tab_1006_3520",
		"tabs": [{"id":"tab_1006_3520","name":"Canvas 1","elements":[]}]
	}`)
	if second.Code != http.StatusOK {
		t.Fatalf("Second workspace with reused tab id failed with %d: %s", second.Code, second.Body.String())
	}

	// Duplicate tab ids inside a single payload must be normalized too.
	duplicate := save(fmt.Sprintf("ws_reuse_c_%d", uniqueSuffix), `{
		"type": "excaliflow", "version": 2, "source": "Excaliflow",
		"activeTabId": "tab_dup",
		"tabs": [
			{"id":"tab_dup","name":"Canvas 1","elements":[]},
			{"id":"tab_dup","name":"Canvas 2","elements":[]}
		]
	}`)
	if duplicate.Code != http.StatusOK {
		t.Fatalf("Save with duplicate tab ids failed with %d: %s", duplicate.Code, duplicate.Body.String())
	}
}

// TestWorkspacePublicShare covers enabling, resolving and revoking a public
// read-only share link, plus ownership isolation.
func TestWorkspacePublicShare(t *testing.T) {
	_, _, _, router := setupTestApp(t)
	uniqueSuffix := time.Now().UnixNano()

	register := func(name string) models.AuthResponse {
		body := fmt.Sprintf(`{"username":"%s_%d","email":"%s_%d@test.com","password":"password123","fullName":"%s"}`, name, uniqueSuffix, name, uniqueSuffix, name)
		req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("Failed to register %s: %s", name, rec.Body.String())
		}
		var auth models.AuthResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &auth); err != nil {
			t.Fatalf("Failed to parse register response: %v", err)
		}
		return auth
	}

	owner := register("share_owner")
	other := register("share_other")
	wsID := fmt.Sprintf("ws_shared_%d", uniqueSuffix)

	saveReq := httptest.NewRequest(http.MethodPost, "/api/workspace?id="+wsID, bytes.NewBufferString(`{
		"type": "excaliflow", "version": 2, "source": "Excaliflow",
		"activeTabId": "tab_public",
		"tabs": [{"id":"tab_public","name":"Public Architecture","elements":[{"id":"n1","type":"rectangle","text":"Public"}]}]
	}`))
	saveReq.Header.Set("Authorization", "Bearer "+owner.Token)
	saveRec := httptest.NewRecorder()
	router.ServeHTTP(saveRec, saveReq)
	if saveRec.Code != http.StatusOK {
		t.Fatalf("Failed to save workspace: %s", saveRec.Body.String())
	}

	shareCall := func(method, userToken, id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api/workspace/share?id="+id, nil)
		if userToken != "" {
			req.Header.Set("Authorization", "Bearer "+userToken)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	// Disabled by default.
	status := shareCall(http.MethodGet, owner.Token, wsID)
	if status.Code != http.StatusOK {
		t.Fatalf("Share status failed: %s", status.Body.String())
	}
	var statusRes struct {
		Enabled bool   `json:"enabled"`
		Token   string `json:"token"`
	}
	json.Unmarshal(status.Body.Bytes(), &statusRes)
	if statusRes.Enabled || statusRes.Token != "" {
		t.Fatalf("New workspace must not be shared: %+v", statusRes)
	}

	// Another user cannot enable sharing for someone else's workspace.
	if res := shareCall(http.MethodPost, other.Token, wsID); res.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 when sharing a foreign workspace, got %d: %s", res.Code, res.Body.String())
	}

	// Enable the public link.
	enabled := shareCall(http.MethodPost, owner.Token, wsID)
	if enabled.Code != http.StatusOK {
		t.Fatalf("Failed to enable share: %s", enabled.Body.String())
	}
	var enabledRes struct {
		Enabled bool   `json:"enabled"`
		Token   string `json:"token"`
	}
	json.Unmarshal(enabled.Body.Bytes(), &enabledRes)
	if !enabledRes.Enabled || enabledRes.Token == "" {
		t.Fatalf("Expected an enabled link with token, got %+v", enabledRes)
	}

	// Anyone can read the shared payload without a token.
	publicReq := httptest.NewRequest(http.MethodGet, "/api/public/workspace/"+enabledRes.Token, nil)
	publicRec := httptest.NewRecorder()
	router.ServeHTTP(publicRec, publicReq)
	if publicRec.Code != http.StatusOK {
		t.Fatalf("Public share lookup failed with %d: %s", publicRec.Code, publicRec.Body.String())
	}
	var publicRes struct {
		Name      string          `json:"name"`
		Workspace json.RawMessage `json:"workspace"`
	}
	if err := json.Unmarshal(publicRec.Body.Bytes(), &publicRes); err != nil {
		t.Fatalf("Failed to decode public payload: %v", err)
	}
	if !bytes.Contains(publicRes.Workspace, []byte("tab_public")) || !bytes.Contains(publicRes.Workspace, []byte("Public Architecture")) {
		t.Fatalf("Public payload is missing diagram data: %s", publicRes.Workspace)
	}
	if bytes.Contains(publicRec.Body.Bytes(), []byte(owner.User.Email)) {
		t.Fatalf("Public payload must not leak the owner email: %s", publicRec.Body.String())
	}

	// Unknown tokens are rejected.
	missingReq := httptest.NewRequest(http.MethodGet, "/api/public/workspace/does-not-exist", nil)
	missingRec := httptest.NewRecorder()
	router.ServeHTTP(missingRec, missingReq)
	if missingRec.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 for unknown share token, got %d", missingRec.Code)
	}

	// Revoking kills the link immediately.
	if res := shareCall(http.MethodDelete, owner.Token, wsID); res.Code != http.StatusOK {
		t.Fatalf("Failed to disable share: %s", res.Body.String())
	}
	revokedReq := httptest.NewRequest(http.MethodGet, "/api/public/workspace/"+enabledRes.Token, nil)
	revokedRec := httptest.NewRecorder()
	router.ServeHTTP(revokedRec, revokedReq)
	if revokedRec.Code != http.StatusNotFound {
		t.Fatalf("Revoked share link must return 404, got %d", revokedRec.Code)
	}
}

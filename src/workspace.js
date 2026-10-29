    /* -------------------------------------------------------------------------
     * 14b. Multi-Canvas Workspace Tabs & LocalStorage / Database Auto-Save
     * ------------------------------------------------------------------------- */
    const WORKSPACE_STORAGE_KEY = 'excaliflow_workspace_v1';
    const AUTH_TOKEN_KEY = 'excaliflow_auth_token';
    const CURRENT_WS_KEY = 'excaliflow_current_ws';

    let workspaceSaveTimer = null;
    let dbSaveTimer = null;
    let isSavingToDb = false;
    let currentUser = null;
    let currentWorkspaceId = (function() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(CURRENT_WS_KEY) || 'default';
        }
      } catch (e) {}
      return 'default';
    })();

    function getAuthToken() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
        }
      } catch (e) {}
      return '';
    }

    function setAuthToken(token) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
          else window.localStorage.removeItem(AUTH_TOKEN_KEY);
        }
      } catch (e) {}
    }

    function getAuthHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      const token = getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    }

    function updateAuthUI() {
      if (typeof document === 'undefined') return;
      const label = document.getElementById('userAuthLabel');
      const headerName = document.getElementById('dropdownUserName');
      const headerEmail = document.getElementById('dropdownUserEmail');
      const userBtn = document.getElementById('userAuthBtn');
      if (!label) return;

      if (currentUser) {
        label.textContent = currentUser.username || currentUser.fullName || 'User';
        if (headerName) headerName.textContent = currentUser.fullName || currentUser.username;
        if (headerEmail) headerEmail.textContent = currentUser.email;
        if (userBtn) userBtn.title = `Logged in as ${currentUser.username}`;
      } else {
        label.textContent = 'Sign In';
        if (headerName) headerName.textContent = 'Guest User';
        if (headerEmail) headerEmail.textContent = 'Local Mode';
        if (userBtn) userBtn.title = 'Sign In or Create Account';
      }
    }

    function updateDbSyncStatus(status, text) {
      if (typeof document === 'undefined') return;
      const badge = document.getElementById('dbSyncBadge');
      const dot = document.getElementById('dbSyncDot');
      const label = document.getElementById('dbSyncText');
      if (!badge) return;
      badge.className = `db-sync-badge ${status}`;
      if (label) label.textContent = text || (status === 'synced' ? 'DB Synced' : status === 'saving' ? 'Saving...' : 'DB Offline');
      if (dot) {
        dot.className = `db-sync-dot ${status}`;
      }
    }

    async function saveWorkspaceToDatabase(wsId = null) {
      if (typeof fetch !== 'function' || typeof window === 'undefined') return false;
      if (state.tabs.length === 0) return false;
      const targetId = wsId || currentWorkspaceId || 'default';
      try {
        isSavingToDb = true;
        updateDbSyncStatus('saving', 'Saving...');
        const payload = serializeWorkspace();
        const res = await fetch(`/api/workspace?id=${encodeURIComponent(targetId)}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const respData = await res.json().catch(() => ({}));
          if (respData.id && (!currentWorkspaceId || currentWorkspaceId === 'default')) {
            currentWorkspaceId = respData.id;
            try { window.localStorage.setItem(CURRENT_WS_KEY, currentWorkspaceId); } catch(e) {}
          }
          updateDbSyncStatus('synced', 'DB Synced');
          return true;
        } else {
          updateDbSyncStatus('error', 'DB Error');
          return false;
        }
      } catch (err) {
        updateDbSyncStatus('offline', 'DB Offline');
        return false;
      } finally {
        isSavingToDb = false;
      }
    }

    async function loadWorkspaceFromDatabase(wsId = null) {
      if (typeof fetch !== 'function' || typeof window === 'undefined') return false;
      const targetId = wsId || currentWorkspaceId || 'default';
      try {
        updateDbSyncStatus('saving', 'Loading DB...');
        const res = await fetch(`/api/workspace?id=${encodeURIComponent(targetId)}`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.tabs) && data.tabs.length > 0) {
            const restored = restoreWorkspaceData(data);
            if (restored) {
              if (wsId) {
                currentWorkspaceId = wsId;
                try { window.localStorage.setItem(CURRENT_WS_KEY, currentWorkspaceId); } catch(e) {}
              }
              updateDbSyncStatus('synced', 'DB Synced');
              return true;
            }
          }
        }
        updateDbSyncStatus('offline', 'No DB Data');
        return false;
      } catch (err) {
        updateDbSyncStatus('offline', 'DB Offline');
        return false;
      }
    }

    async function fetchCurrentUser() {
      if (typeof fetch !== 'function' || typeof window === 'undefined') return null;
      const token = getAuthToken();
      if (!token) {
        currentUser = null;
        updateAuthUI();
        return null;
      }
      try {
        const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          currentUser = data.user;
          updateAuthUI();
          return currentUser;
        } else {
          setAuthToken('');
          currentUser = null;
          updateAuthUI();
          return null;
        }
      } catch (e) {
        return null;
      }
    }

    async function loginUser(identifier, password) {
      if (typeof fetch !== 'function') return false;
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to login');
      }
      setAuthToken(data.token);
      currentUser = data.user;
      updateAuthUI();
      currentWorkspaceId = 'default';
      try { window.localStorage.removeItem(CURRENT_WS_KEY); } catch (e) {}
      await loadWorkspaceFromDatabase('default');
      showToast(`Welcome back, ${currentUser.fullName || currentUser.username}!`);
      return data;
    }

    async function registerUser(username, email, password, fullName) {
      if (typeof fetch !== 'function') return false;
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, fullName })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register');
      }
      setAuthToken(data.token);
      currentUser = data.user;
      updateAuthUI();
      currentWorkspaceId = 'default';
      try { window.localStorage.removeItem(CURRENT_WS_KEY); } catch (e) {}
      await saveWorkspaceToDatabase('default');
      showToast(`Account created! Welcome, ${currentUser.fullName || currentUser.username}!`);
      return data;
    }

    function logoutUser() {
      setAuthToken('');
      currentUser = null;
      currentWorkspaceId = 'default';
      try { window.localStorage.removeItem(CURRENT_WS_KEY); } catch (e) {}
      updateAuthUI();
      showToast('Signed out');
      loadWorkspaceFromStorage();
    }

    async function listUserWorkspaces() {
      if (typeof fetch !== 'function') return [];
      try {
        const res = await fetch('/api/workspaces', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          return data.workspaces || [];
        }
      } catch (e) {}
      return [];
    }

    async function switchUserWorkspace(wsId) {
      if (!wsId) return false;
      const ok = await loadWorkspaceFromDatabase(wsId);
      if (ok) {
        currentWorkspaceId = wsId;
        try { window.localStorage.setItem(CURRENT_WS_KEY, currentWorkspaceId); } catch(e) {}
        showToast('Switched diagram project');
      }
      return ok;
    }

    async function createNewUserWorkspace(name) {
      const cleanName = (name || '').trim() || 'Untitled Project';
      const newWsId = 'ws_' + Math.random().toString(36).slice(2, 10);
      currentWorkspaceId = newWsId;
      try { window.localStorage.setItem(CURRENT_WS_KEY, currentWorkspaceId); } catch(e) {}
      state.elements = [];
      state.selectedIds.clear();
      state.tabs = [];
      ensureInitialTab(cleanName);
      await saveWorkspaceToDatabase(newWsId);
      showToast(`Created project "${cleanName}"`);
      return newWsId;
    }

    async function deleteUserWorkspace(wsId) {
      if (!wsId || typeof fetch !== 'function') return false;
      try {
        const res = await fetch(`/api/workspace?id=${encodeURIComponent(wsId)}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          if (currentWorkspaceId === wsId) {
            currentWorkspaceId = 'default';
            try { window.localStorage.removeItem(CURRENT_WS_KEY); } catch(e) {}
            await loadWorkspaceFromDatabase('default');
          }
          showToast('Project deleted');
          return true;
        }
      } catch (e) {}
      return false;
    }

    function getBrowserStorage() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
        if (typeof localStorage !== 'undefined') return localStorage;
      } catch (err) {
        return null;
      }
      return null;
    }

    function syncActiveTabFromState() {
      if (state.tabs.length === 0) return;
      const tab = state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];
      if (!tab) return;
      state.activeTabId = tab.id;
      tab.elements = state.elements;
      tab.scrollX = state.scrollX;
      tab.scrollY = state.scrollY;
      tab.zoom = state.zoom;
      tab.canvasBg = state.canvasBg;
      tab.flowEnabled = state.flowEnabled;
      tab.flowMode = state.flowMode;
      tab.flowSpeed = state.flowSpeed;
      tab.history = {
        undoStack: [...state.history.undoStack],
        redoStack: [...state.history.redoStack]
      };
    }

    function ensureInitialTab(defaultName = 'AI Agent Swarm') {
      if (state.tabs.length > 0) {
        if (!state.activeTabId || !state.tabs.some(t => t.id === state.activeTabId)) {
          state.activeTabId = state.tabs[0].id;
        }
        return state.tabs.find(t => t.id === state.activeTabId);
      }
      const tab = {
        id: nextId('tab'),
        name: defaultName,
        elements: state.elements,
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom,
        canvasBg: state.canvasBg,
        flowEnabled: state.flowEnabled,
        flowMode: state.flowMode,
        flowSpeed: state.flowSpeed,
        history: {
          undoStack: [...state.history.undoStack],
          redoStack: [...state.history.redoStack]
        }
      };
      state.tabs.push(tab);
      state.activeTabId = tab.id;
      renderCanvasTabs();
      return tab;
    }

    function applyTabToState(tab) {
      if (!tab) return;
      state.activeTabId = tab.id;
      state.elements = Array.isArray(tab.elements) ? tab.elements : [];
      state.scrollX = Number.isFinite(tab.scrollX) ? tab.scrollX : 0;
      state.scrollY = Number.isFinite(tab.scrollY) ? tab.scrollY : 0;
      state.zoom = Number.isFinite(tab.zoom) && tab.zoom > 0 ? tab.zoom : 1;
      state.flowEnabled = tab.flowEnabled !== false;
      state.flowMode = ALLOWED_FLOW_MODES.has(tab.flowMode) ? tab.flowMode : 'comets';
      state.flowSpeed = Number.isFinite(Number(tab.flowSpeed)) && Number(tab.flowSpeed) > 0
        ? Math.max(0.2, Math.min(5.0, Number(tab.flowSpeed)))
        : 1.0;
      state.history = {
        undoStack: Array.isArray(tab.history?.undoStack) ? [...tab.history.undoStack] : [],
        redoStack: Array.isArray(tab.history?.redoStack) ? [...tab.history.redoStack] : []
      };
      state.selectedIds.clear();
      state.activePulses = [];
      ShapeCache.clear();
      setCanvasBackground(tab.canvasBg === '#000000' ? '#000000' : '#ffffff');
      syncZoomReadout();
      if (typeof document !== 'undefined') {
        document.querySelectorAll('#flowModeGrid [data-flow-mode]').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-flow-mode') === state.flowMode);
        });
        document.querySelectorAll('#flowSpeedRow [data-flow-speed]').forEach(b => {
          b.classList.toggle('active', Number(b.getAttribute('data-flow-speed')) === state.flowSpeed);
        });
      }
      syncUIWithSelection();
      renderCanvasTabs();
    }

    function serializeWorkspace() {
      ensureInitialTab();
      syncActiveTabFromState();
      return {
        type: 'excaliflow',
        version: 2,
        source: 'Excaliflow',
        activeTabId: state.activeTabId,
        elements: state.elements,
        appState: {
          viewBackgroundColor: state.canvasBg,
          scrollX: state.scrollX,
          scrollY: state.scrollY,
          zoom: { value: state.zoom },
          flowEnabled: state.flowEnabled,
          flowMode: state.flowMode,
          flowSpeed: state.flowSpeed
        },
        tabs: state.tabs.map(t => ({
          id: t.id,
          name: t.name,
          elements: t.elements,
          scrollX: t.scrollX,
          scrollY: t.scrollY,
          zoom: t.zoom,
          canvasBg: t.canvasBg,
          flowEnabled: t.flowEnabled,
          flowMode: t.flowMode,
          flowSpeed: t.flowSpeed
        }))
      };
    }

    function saveWorkspaceToStorage() {
      if (state.tabs.length === 0) return false;
      let ok = false;
      const storage = getBrowserStorage();
      if (storage && typeof storage.setItem === 'function') {
        try {
          storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(serializeWorkspace()));
          ok = true;
        } catch (err) {
          ok = false;
        }
      }
      if (typeof fetch === 'function' && typeof window !== 'undefined') {
        saveWorkspaceToDatabase();
      }
      return ok;
    }

    function scheduleWorkspaceSave() {
      if (state.tabs.length === 0) return;
      syncActiveTabFromState();
      clearTimeout(workspaceSaveTimer);
      clearTimeout(dbSaveTimer);
      workspaceSaveTimer = setTimeout(() => {
        const storage = getBrowserStorage();
        if (storage && typeof storage.setItem === 'function') {
          try {
            storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(serializeWorkspace()));
          } catch (err) {}
        }
      }, 150);
      dbSaveTimer = setTimeout(() => {
        saveWorkspaceToDatabase();
      }, 400);
    }

    function restoreWorkspaceData(data) {
      if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) return false;
      const restoredTabs = [];
      for (let i = 0; i < data.tabs.length; i++) {
        const rawTab = data.tabs[i];
        if (!rawTab || typeof rawTab !== 'object') continue;
        const tabId = typeof rawTab.id === 'string' && rawTab.id.trim() ? rawTab.id.trim() : nextId('tab');
        syncIdCounterWithId(tabId);
        const name = typeof rawTab.name === 'string' && rawTab.name.trim()
          ? rawTab.name.trim().slice(0, 48)
          : `Canvas ${i + 1}`;
        const elements = sanitizeElementsArray(rawTab.elements || []);
        restoredTabs.push({
          id: tabId,
          name,
          elements,
          scrollX: Number.isFinite(rawTab.scrollX) ? rawTab.scrollX : 0,
          scrollY: Number.isFinite(rawTab.scrollY) ? rawTab.scrollY : 0,
          zoom: Number.isFinite(rawTab.zoom) && rawTab.zoom > 0 ? Math.max(0.25, Math.min(3.0, rawTab.zoom)) : 1,
          canvasBg: rawTab.canvasBg === '#000000' ? '#000000' : '#ffffff',
          flowEnabled: rawTab.flowEnabled !== false,
          flowMode: ALLOWED_FLOW_MODES.has(rawTab.flowMode) ? rawTab.flowMode : 'comets',
          flowSpeed: Number.isFinite(Number(rawTab.flowSpeed)) && Number(rawTab.flowSpeed) > 0
            ? Math.max(0.2, Math.min(5.0, Number(rawTab.flowSpeed)))
            : 1.0,
          history: { undoStack: [], redoStack: [] }
        });
      }
      if (restoredTabs.length === 0) return false;
      state.tabs = restoredTabs;
      const targetActive = restoredTabs.find(t => t.id === data.activeTabId) || restoredTabs[0];
      applyTabToState(targetActive);
      return true;
    }

    function loadWorkspaceFromStorage() {
      const storage = getBrowserStorage();
      if (!storage || typeof storage.getItem !== 'function') return false;
      try {
        const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        return restoreWorkspaceData(data);
      } catch (err) {
        return false;
      }
    }

    let lastRenderedTabSig = '';
    let lastScrolledActiveTabId = null;

    function renderCanvasTabs(force = false) {
      if (typeof document === 'undefined') return;
      const activeIdx = Math.max(0, state.tabs.findIndex(t => t.id === state.activeTabId));
      const activeTab = state.tabs[activeIdx] || state.tabs[0];

      const labelEl = document.getElementById('activeCanvasLabel');
      if (labelEl && activeTab) labelEl.textContent = activeTab.name;
      const countEl = document.getElementById('activeCanvasCount');
      if (countEl) countEl.textContent = `${activeIdx + 1}/${Math.max(1, state.tabs.length)}`;

      const strip = document.getElementById('canvasTabStrip');
      if (!strip || typeof strip.appendChild !== 'function') return;

      const sig = state.tabs.map(t => {
        const elCount = (t.id === state.activeTabId ? state.elements : t.elements)?.length || 0;
        return `${t.id}:${t.name}:${elCount}`;
      }).join('|') + '::' + state.activeTabId + '::' + (state.editingTabId || '');

      if (!force && sig === lastRenderedTabSig && strip.children && strip.children.length === state.tabs.length) {
        return;
      }
      lastRenderedTabSig = sig;

      strip.innerHTML = '';
      if (Array.isArray(strip.children)) strip.children.length = 0;

      for (let i = 0; i < state.tabs.length; i++) {
        const tab = state.tabs[i];
        const isActive = tab.id === state.activeTabId;
        const pill = document.createElement('div');
        pill.className = `canvas-tab-pill${isActive ? ' active' : ''}`;
        pill.setAttribute?.('role', 'tab');
        pill.setAttribute?.('aria-selected', isActive ? 'true' : 'false');
        pill.setAttribute?.('data-tab-id', tab.id);
        pill.title = `${tab.name} (Click to switch · Double-click to rename · ⌥${i + 1})`;

        const numBadge = document.createElement('span');
        numBadge.className = 'tab-num-badge';
        numBadge.textContent = String(i + 1);
        pill.appendChild?.(numBadge);

        if (state.editingTabId === tab.id) {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'tab-rename-input';
          input.value = tab.name;
          input.addEventListener?.('click', e => e.stopPropagation?.());
          input.addEventListener?.('keydown', e => {
            e.stopPropagation?.();
            if (e.key === 'Enter') {
              e.preventDefault?.();
              renameCanvasTab(tab.id, input.value);
            } else if (e.key === 'Escape') {
              e.preventDefault?.();
              state.editingTabId = null;
              renderCanvasTabs(true);
            }
          });
          input.addEventListener?.('blur', () => {
            if (state.editingTabId === tab.id) {
              renameCanvasTab(tab.id, input.value);
            }
          });
          pill.appendChild?.(input);
          setTimeout(() => {
            input.focus?.();
            input.select?.();
          }, 0);
        } else {
          const label = document.createElement('span');
          label.className = 'tab-label';
          label.textContent = tab.name;
          pill.appendChild?.(label);

          if (state.tabs.length > 1) {
            const closeBtn = document.createElement('span');
            closeBtn.className = 'tab-close';
            closeBtn.textContent = '×';
            closeBtn.title = `Close ${tab.name}`;
            closeBtn.addEventListener?.('click', e => {
              e.stopPropagation?.();
              closeCanvasTab(tab.id);
            });
            pill.appendChild?.(closeBtn);
          }

          pill.addEventListener?.('click', () => {
            if (state.activeTabId !== tab.id) {
              switchCanvasTab(tab.id);
            }
          });
          pill.addEventListener?.('dblclick', e => {
            e.stopPropagation?.();
            state.editingTabId = tab.id;
            renderCanvasTabs(true);
          });
        }

        strip.appendChild?.(pill);
        if (isActive && state.activeTabId !== lastScrolledActiveTabId) {
          lastScrolledActiveTabId = state.activeTabId;
          setTimeout(() => {
            pill.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          }, 0);
        }
      }

      // Populate top-left #canvasesDropdown menu for quick vertical switching
      const dropdown = document.getElementById('canvasesDropdown');
      if (dropdown && typeof dropdown.appendChild === 'function') {
        dropdown.innerHTML = '';
        if (Array.isArray(dropdown.children)) dropdown.children.length = 0;
        for (let i = 0; i < state.tabs.length; i++) {
          const tab = state.tabs[i];
          const isActive = tab.id === state.activeTabId;
          const elCount = (isActive ? state.elements : tab.elements)?.length || 0;
          const item = document.createElement('button');
          item.className = `ui-btn menu-item${isActive ? ' active' : ''}`;
          const leftSpan = document.createElement('span');
          leftSpan.textContent = `${i + 1}. ${tab.name}`;
          const rightSpan = document.createElement('span');
          rightSpan.textContent = `${elCount} item${elCount === 1 ? '' : 's'} · ⌥${i + 1}`;
          item.appendChild?.(leftSpan);
          item.appendChild?.(rightSpan);
          item.addEventListener?.('click', e => {
            e.stopPropagation?.();
            closeAllDropdowns();
            if (!isActive) switchCanvasTab(tab.id);
          });
          dropdown.appendChild?.(item);
        }
        const sep = document.createElement('div');
        sep.className = 'menu-sep';
        dropdown.appendChild?.(sep);

        const newBtn = document.createElement('button');
        newBtn.className = 'ui-btn menu-item';
        const nl = document.createElement('span');
        nl.textContent = '+ New Blank Canvas';
        const nr = document.createElement('span');
        nr.textContent = '⌥T';
        newBtn.appendChild?.(nl);
        newBtn.appendChild?.(nr);
        newBtn.addEventListener?.('click', e => {
          e.stopPropagation?.();
          closeAllDropdowns();
          createCanvasTab();
        });
        dropdown.appendChild?.(newBtn);

        const forkBtn = document.createElement('button');
        forkBtn.className = 'ui-btn menu-item';
        const fl = document.createElement('span');
        fl.textContent = '⧉ Duplicate Current Canvas';
        const fr = document.createElement('span');
        fr.textContent = 'Fork';
        forkBtn.appendChild?.(fl);
        forkBtn.appendChild?.(fr);
        forkBtn.addEventListener?.('click', e => {
          e.stopPropagation?.();
          closeAllDropdowns();
          duplicateCanvasTab();
        });
        dropdown.appendChild?.(forkBtn);
      }
    }

    function createCanvasTab(opts = {}) {
      if (state.editingId) commitInlineEditor();
      ensureInitialTab();
      syncActiveTabFromState();
      const nextIndex = state.tabs.length + 1;
      const name = (typeof opts.name === 'string' && opts.name.trim())
        ? opts.name.trim().slice(0, 48)
        : `Canvas ${nextIndex}`;
      const newTab = {
        id: nextId('tab'),
        name,
        elements: Array.isArray(opts.elements) ? sanitizeElementsArray(opts.elements) : [],
        scrollX: Number.isFinite(opts.scrollX) ? opts.scrollX : 0,
        scrollY: Number.isFinite(opts.scrollY) ? opts.scrollY : 0,
        zoom: Number.isFinite(opts.zoom) && opts.zoom > 0 ? opts.zoom : 1,
        canvasBg: opts.canvasBg === '#000000' ? '#000000' : state.canvasBg,
        flowEnabled: opts.flowEnabled !== undefined ? Boolean(opts.flowEnabled) : state.flowEnabled,
        flowMode: ALLOWED_FLOW_MODES.has(opts.flowMode) ? opts.flowMode : state.flowMode,
        flowSpeed: Number.isFinite(Number(opts.flowSpeed)) ? Number(opts.flowSpeed) : state.flowSpeed,
        history: { undoStack: [], redoStack: [] }
      };
      state.tabs.push(newTab);
      applyTabToState(newTab);
      if (opts.templateName) {
        loadTemplate(opts.templateName);
        state.history.undoStack = [];
        updateHeaderButtons();
      }
      renderCanvasTabs(true);
      saveWorkspaceToStorage();
      showToast(`Created "${newTab.name}" (${state.tabs.length}/${state.tabs.length})`);
      return newTab;
    }

    function duplicateCanvasTab(tabId = state.activeTabId) {
      if (state.editingId) commitInlineEditor();
      ensureInitialTab();
      syncActiveTabFromState();
      const sourceIdx = state.tabs.findIndex(t => t.id === tabId);
      const sourceTab = sourceIdx >= 0 ? state.tabs[sourceIdx] : state.tabs[state.tabs.length - 1];
      if (!sourceTab) return null;

      const idMap = new Map();
      const clonedElements = sourceTab.elements.map(el => {
        const newId = nextId(el.type);
        idMap.set(el.id, newId);
        const copy = JSON.parse(JSON.stringify(el));
        copy.id = newId;
        copy.seed = Math.floor(Math.random() * 1000000) + 1;
        return copy;
      });
      for (const c of clonedElements) {
        if (c.startBinding?.elementId && idMap.has(c.startBinding.elementId)) {
          c.startBinding.elementId = idMap.get(c.startBinding.elementId);
        }
        if (c.endBinding?.elementId && idMap.has(c.endBinding.elementId)) {
          c.endBinding.elementId = idMap.get(c.endBinding.elementId);
        }
      }

      const newTab = {
        id: nextId('tab'),
        name: `${sourceTab.name} Copy`.slice(0, 48),
        elements: clonedElements,
        scrollX: sourceTab.scrollX,
        scrollY: sourceTab.scrollY,
        zoom: sourceTab.zoom,
        canvasBg: sourceTab.canvasBg,
        flowEnabled: sourceTab.flowEnabled,
        flowMode: sourceTab.flowMode,
        flowSpeed: sourceTab.flowSpeed,
        history: { undoStack: [], redoStack: [] }
      };
      const insertAt = sourceIdx >= 0 ? sourceIdx + 1 : state.tabs.length;
      state.tabs.splice(insertAt, 0, newTab);
      applyTabToState(newTab);
      renderCanvasTabs(true);
      saveWorkspaceToStorage();
      showToast(`Duplicated "${sourceTab.name}"`);
      return newTab;
    }

    function switchCanvasTab(tabId) {
      if (!tabId || tabId === state.activeTabId) return false;
      if (state.editingId) commitInlineEditor();
      ensureInitialTab();
      syncActiveTabFromState();
      const targetIdx = state.tabs.findIndex(t => t.id === tabId);
      const target = targetIdx >= 0 ? state.tabs[targetIdx] : null;
      if (!target) return false;
      applyTabToState(target);
      renderCanvasTabs(true);
      saveWorkspaceToStorage();
      showToast(`Canvas ${targetIdx + 1}/${state.tabs.length} · ${target.name}`);
      return true;
    }

    function stepCanvasTab(delta = 1) {
      ensureInitialTab();
      if (state.tabs.length <= 1) return false;
      const curIdx = Math.max(0, state.tabs.findIndex(t => t.id === state.activeTabId));
      const nextIdx = (curIdx + delta + state.tabs.length) % state.tabs.length;
      return switchCanvasTab(state.tabs[nextIdx].id);
    }

    function renameCanvasTab(tabId, newName) {
      ensureInitialTab();
      const tab = state.tabs.find(t => t.id === tabId);
      if (!tab) return false;
      const cleaned = String(newName ?? '').trim().slice(0, 48);
      if (cleaned.length > 0) {
        tab.name = cleaned;
      }
      state.editingTabId = null;
      renderCanvasTabs();
      saveWorkspaceToStorage();
      return true;
    }

    function closeCanvasTab(tabId) {
      if (state.editingId) commitInlineEditor();
      ensureInitialTab();
      const idx = state.tabs.findIndex(t => t.id === tabId);
      if (idx === -1) return false;
      if (state.tabs.length <= 1) {
        pushHistory();
        state.elements = [];
        state.selectedIds.clear();
        state.tabs[0].name = 'Canvas 1';
        ShapeCache.clear();
        syncUIWithSelection();
        renderCanvasTabs();
        saveWorkspaceToStorage();
        return true;
      }
      const wasActive = state.activeTabId === tabId;
      state.tabs.splice(idx, 1);
      if (wasActive) {
        const nextTab = state.tabs[Math.min(idx, state.tabs.length - 1)];
        applyTabToState(nextTab);
      } else {
        renderCanvasTabs();
      }
      saveWorkspaceToStorage();
      return true;
    }

    function exportExcalidrawJson() {
      closeAllDropdowns();
      const payload = serializeWorkspace();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      downloadBlob(blob, 'diagram.excaliflow');
      showToast('Saved diagram.excaliflow');
    }

    function importExcalidrawJson(jsonString) {
      closeAllDropdowns();
      try {
        const data = JSON.parse(jsonString);
        if (data && Array.isArray(data.tabs) && data.tabs.length > 0) {
          if (restoreWorkspaceData(data)) {
            saveWorkspaceToStorage();
            showToast(`Loaded ${state.tabs.length} canvas tab${state.tabs.length > 1 ? 's' : ''}`);
            return true;
          }
        }
        if (data && Array.isArray(data.elements)) {
          pushHistory();
          state.elements = sanitizeElementsArray(data.elements);
          if (data.appState && typeof data.appState === 'object') {
            if (data.appState.viewBackgroundColor) setCanvasBackground(data.appState.viewBackgroundColor);
            if (typeof data.appState.flowMode === 'string' && ALLOWED_FLOW_MODES.has(data.appState.flowMode)) {
              state.flowMode = data.appState.flowMode;
            }
            if (data.appState.flowSpeed !== undefined) {
              const spd = Number(data.appState.flowSpeed);
              if (Number.isFinite(spd) && spd > 0) {
                state.flowSpeed = Math.max(0.2, Math.min(5.0, spd));
              }
            }
          }
          state.selectedIds.clear();
          ShapeCache.clear();
          fitToScreen();
          syncUIWithSelection();
          saveWorkspaceToStorage();
          showToast('Loaded Excaliflow scene');
          return true;
        }
      } catch (err) {
        showToast('Invalid JSON file');
      }
      return false;
    }

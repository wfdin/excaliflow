    /* -------------------------------------------------------------------------
     * 16. DOM Wiring & 60fps Animation Loop
     * ------------------------------------------------------------------------- */
    function initStudioDOM() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const staticCanvas = document.getElementById('staticCanvas');
      const interactiveCanvas = document.getElementById('interactiveCanvas');
      if (!staticCanvas || !interactiveCanvas) return;

      const hudDots = document.getElementById('hudColorDots');
      if (hudDots && hudDots.children.length === 0) {
        for (const c of SEMANTIC_COLORS) {
          const dot = document.createElement('button');
          dot.className = 'hud-dot';
          dot.style.background = c.hex;
          dot.setAttribute?.('data-color', c.hex);
          dot.title = c.name;
          dot.addEventListener('click', () => applyStyleProperty('strokeColor', c.hex));
          hudDots.appendChild(dot);
        }
      }

      const resizeCanvases = () => {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        for (const c of [staticCanvas, interactiveCanvas]) {
          c.width = Math.floor(w * dpr);
          c.height = Math.floor(h * dpr);
          c.style.width = `${w}px`;
          c.style.height = `${h}px`;
        }
      };
      resizeCanvases();
      window.addEventListener('resize', resizeCanvases);

      // Keep --header-h in sync with the real header bottom edge. The header
      // wraps onto extra rows on narrow windows, and floating panels (e.g. the
      // properties sidebar) must never overlap it.
      const headerBar = document.getElementById('topHeaderBar');
      const syncHeaderOffset = () => {
        if (!headerBar || typeof headerBar.getBoundingClientRect !== 'function') return;
        const rect = headerBar.getBoundingClientRect();
        const bottom = Math.ceil(rect?.bottom) || 56;
        document.documentElement?.style?.setProperty?.('--header-h', `${bottom}px`);
      };
      syncHeaderOffset();
      window.addEventListener('resize', syncHeaderOffset);
      window.addEventListener('orientationchange', syncHeaderOffset);
      if (headerBar && typeof ResizeObserver !== 'undefined') {
        try {
          new ResizeObserver(syncHeaderOffset).observe(headerBar);
        } catch (err) {}
      }

      interactiveCanvas.addEventListener('pointerdown', e => {
        interactiveCanvas.setPointerCapture?.(e.pointerId);
        const pt = screenToWorld(e.clientX, e.clientY);
        pointerDownWorld(pt.x, pt.y, {
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          screenX: e.clientX,
          screenY: e.clientY
        });
      });

      interactiveCanvas.addEventListener('pointermove', e => {
        const pt = screenToWorld(e.clientX, e.clientY);
        pointerMoveWorld(pt.x, pt.y, {
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          screenX: e.clientX,
          screenY: e.clientY
        });
      });

      interactiveCanvas.addEventListener('pointerup', e => {
        const pt = screenToWorld(e.clientX, e.clientY);
        pointerUpWorld(pt.x, pt.y);
      });

      interactiveCanvas.addEventListener('dblclick', e => {
        const pt = screenToWorld(e.clientX, e.clientY);
        const hit = hitTestElement(pt.x, pt.y);
        if (hit) {
          if (hit.type === 'arrow') {
            pushHistory();
            hit.curveOffset = 0;
            syncUIWithSelection();
            return;
          }
          startInlineEditing(hit);
        } else {
          pushHistory();
          const box = createElement('rectangle', {
            x: pt.x - 72,
            y: pt.y - 34,
            width: 144,
            height: 68,
            text: 'New Node'
          });
          state.elements.push(box);
          state.selectedIds.clear();
          state.selectedIds.add(box.id);
          syncUIWithSelection();
          startInlineEditing(box);
        }
      });

      interactiveCanvas.addEventListener('wheel', e => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const factor = e.deltaY < 0 ? 1.08 : 0.92;
          setZoom(state.zoom * factor, e.clientX, e.clientY);
        } else {
          state.scrollX -= e.deltaX / state.zoom;
          state.scrollY -= e.deltaY / state.zoom;
          updateQuickHudPosition();
        }
      }, { passive: false });

      const ta = document.getElementById('inlineTextEditor');
      if (ta) {
        ta.addEventListener('input', () => {
          const el = state.elements.find(e => e.id === state.editingId);
          if (el) {
            autoFitElementToText(el, ta.value);
            const scr = worldToScreen(el.x + (el.width || 0) / 2, el.y + (el.height || 0) / 2);
            const w = Math.max(120, (el.width || 120) * state.zoom);
            const h = Math.max(36, (el.height || 44) * state.zoom);
            const wrap = document.getElementById('inlineEditorWrap');
            if (wrap) {
              wrap.style.left = `${scr.x - w / 2}px`;
              wrap.style.top = `${scr.y - h / 2}px`;
            }
            ta.style.width = `${w}px`;
            ta.style.height = `${h}px`;
          }
        });
        ta.addEventListener('blur', () => commitInlineEditor());
      }

      window.addEventListener('keydown', e => {
        // Ignore all canvas shortcuts when a modal is open or focus is in a text input
        const activeTag = document.activeElement?.tagName?.toUpperCase();
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
        if (document.getElementById('authModalBackdrop')?.style.display !== 'none') return;
        if (document.getElementById('workspacesModalBackdrop')?.style.display !== 'none') return;
        if (isConfirmModalOpen()) return;

        if (e.code === 'Space' && !state.editingId) {
          state.isSpacePanning = true;
          updateInteractiveCursor();
        }
        handleKeyDown(e);
      });
      window.addEventListener('keyup', e => {
        if (e.code === 'Space') {
          state.isSpacePanning = false;
          updateInteractiveCursor();
        }
      });

      // Drag-and-drop .excaliflow / .excalidraw / .json scene files directly onto the window
      window.addEventListener('dragover', e => e.preventDefault?.());
      window.addEventListener('drop', e => {
        e.preventDefault?.();
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => importExcalidrawJson(String(ev.target?.result || ''));
        reader.readAsText(file);
      });

      // ---------------------------------------------------------------------
      // Tool dock → dropdown palette when the header has no room for it.
      // The dock keeps the exact same buttons (state, shortcuts and listeners
      // untouched); only its layout changes, so every tool stays available.
      // ---------------------------------------------------------------------
      const toolDock = document.getElementById('bottomToolDock');
      const toolsMenuBtn = document.getElementById('toolsMenuBtn');
      const leftIsland = headerBar?.querySelector?.('.header-group');
      const rightIsland = headerBar?.querySelector?.('.header-group:last-child');
      let dockNaturalWidth = 0;
      let dockCompact = false;
      let dockSyncQueued = false;

      const closeToolDock = () => {
        if (toolDock?.classList?.contains('open')) toolDock.classList.remove('open');
        toolsMenuBtn?.setAttribute?.('aria-expanded', 'false');
      };

      // Keep the palette's right edge under the "Tools" button while staying
      // inside the header (it becomes a fixed-width grid when compact).
      const positionToolDock = () => {
        if (!headerBar || !toolDock || !toolsMenuBtn) return;
        if (typeof headerBar.getBoundingClientRect !== 'function') return;
        if (typeof toolsMenuBtn.getBoundingClientRect !== 'function') return;
        const headerRect = headerBar.getBoundingClientRect();
        const buttonRect = toolsMenuBtn.getBoundingClientRect();
        const panelWidth = toolDock.offsetWidth || 202;
        const maxOffset = Math.max(0, headerBar.clientWidth - panelWidth);
        const offset = Math.round(headerRect.right - buttonRect.right);
        toolDock.style.right = `${Math.max(0, Math.min(offset, maxOffset))}px`;
      };

      const applyToolDockMode = compact => {
        if (!headerBar || typeof headerBar.classList?.toggle !== 'function') return;
        headerBar.classList.toggle('dock-compact', compact);
        closeToolDock();
        if (compact) positionToolDock();
      };

      const syncToolDockMode = () => {
        dockSyncQueued = false;
        if (!headerBar || !toolDock || !leftIsland || !rightIsland) return;

        // Remember the unscrolled width of the dock while it is inline.
        if (!dockCompact) dockNaturalWidth = Math.max(dockNaturalWidth, toolDock.scrollWidth);

        // Width the right island would need without the "Tools" button + gap.
        const toolsBtnWidth = dockCompact && toolsMenuBtn ? toolsMenuBtn.offsetWidth + 4 : 0;
        const needed = leftIsland.offsetWidth +
          (rightIsland.offsetWidth - toolsBtnWidth) +
          dockNaturalWidth + 20; // two 10px gaps between the three islands
        const compact = needed > headerBar.clientWidth - 2;
        if (compact === dockCompact) {
          if (dockCompact) positionToolDock();
          return;
        }

        dockCompact = compact;
        applyToolDockMode(compact);
        if (!compact) dockNaturalWidth = Math.max(dockNaturalWidth, toolDock.scrollWidth);
      };

      const queueToolDockSync = () => {
        if (dockSyncQueued) return;
        dockSyncQueued = true;
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(syncToolDockMode);
        } else {
          syncToolDockMode();
        }
      };

      toolsMenuBtn?.addEventListener('click', e => {
        e.stopPropagation?.();
        if (!dockCompact) return;
        closeAllDropdowns();
        const open = toolDock.classList.toggle('open');
        if (open) positionToolDock();
        toolsMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      queueToolDockSync();
      window.addEventListener('resize', queueToolDockSync);
      if (typeof ResizeObserver !== 'undefined') {
        try {
          const dockObserver = new ResizeObserver(queueToolDockSync);
          if (leftIsland) dockObserver.observe(leftIsland);
          if (rightIsland) dockObserver.observe(rightIsland);
        } catch (err) {}
      }
      if (document.fonts?.ready?.then) {
        document.fonts.ready.then(queueToolDockSync).catch(() => {});
      }

      // Dropdown toggles
      document.getElementById('canvasSwitcherBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        const menu = document.getElementById('canvasesDropdown');
        const wasOpen = menu?.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
          renderCanvasTabs(true);
          menu?.classList.add('open');
        }
      });
      document.getElementById('templatesMenuBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        const menu = document.getElementById('templatesDropdown');
        const wasOpen = menu?.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) menu?.classList.add('open');
      });
      document.getElementById('exportMenuBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        const menu = document.getElementById('exportDropdown');
        const wasOpen = menu?.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) menu?.classList.add('open');
      });
      window.addEventListener('click', () => {
        closeAllDropdowns();
        closeToolDock();
      });

      // User Profile & Auth Modal Handlers
      const authBackdrop = document.getElementById('authModalBackdrop');
      const wsBackdrop = document.getElementById('workspacesModalBackdrop');
      const userBtn = document.getElementById('userAuthBtn');
      const userDropdown = document.getElementById('userDropdown');
      let authMode = 'login';

      function openAuthModal(mode = 'login') {
        authMode = mode;
        const title = document.getElementById('authModalTitle');
        const submitBtn = document.getElementById('authSubmitBtn');
        const fnGroup = document.getElementById('fullNameGroup');
        const emGroup = document.getElementById('emailGroup');
        const alertBanner = document.getElementById('authAlertBanner');
        const unLabel = document.getElementById('authUsernameLabel');
        const tabLogin = document.getElementById('tabAuthLogin');
        const tabReg = document.getElementById('tabAuthRegister');

        if (alertBanner) alertBanner.style.display = 'none';
        tabLogin?.classList.toggle('active', mode === 'login');
        tabReg?.classList.toggle('active', mode === 'register');

        if (mode === 'login') {
          if (title) title.textContent = 'Sign In to Excaliflow';
          if (submitBtn) submitBtn.textContent = 'Sign In';
          if (unLabel) unLabel.textContent = 'Username or Email';
          if (fnGroup) fnGroup.style.display = 'none';
          if (emGroup) emGroup.style.display = 'none';
        } else {
          if (title) title.textContent = 'Create Account';
          if (submitBtn) submitBtn.textContent = 'Create Account';
          if (unLabel) unLabel.textContent = 'Username';
          if (fnGroup) fnGroup.style.display = 'block';
          if (emGroup) emGroup.style.display = 'block';
        }
        if (authBackdrop) authBackdrop.style.display = 'flex';
      }

      function closeAuthModal() {
        if (authBackdrop) authBackdrop.style.display = 'none';
      }

      userBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (currentUser) {
          const wasOpen = userDropdown?.classList.contains('open');
          closeAllDropdowns();
          if (!wasOpen) userDropdown?.classList.add('open');
        } else {
          closeAllDropdowns();
          openAuthModal('login');
        }
      });

      document.getElementById('tabAuthLogin')?.addEventListener('click', () => openAuthModal('login'));
      document.getElementById('tabAuthRegister')?.addEventListener('click', () => openAuthModal('register'));
      document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuthModal);
      authBackdrop?.addEventListener('click', e => {
        if (e.target === authBackdrop) closeAuthModal();
      });

      document.getElementById('authForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const alertBanner = document.getElementById('authAlertBanner');
        const submitBtn = document.getElementById('authSubmitBtn');
        const unVal = document.getElementById('authUsername')?.value?.trim();
        const pwVal = document.getElementById('authPassword')?.value;
        const emVal = document.getElementById('authEmail')?.value?.trim();
        const fnVal = document.getElementById('authFullName')?.value?.trim();

        if (alertBanner) alertBanner.style.display = 'none';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Please wait...';
        }

        try {
          if (authMode === 'login') {
            await loginUser(unVal, pwVal);
          } else {
            await registerUser(unVal, emVal, pwVal, fnVal);
          }
          closeAuthModal();
        } catch (err) {
          if (alertBanner) {
            alertBanner.textContent = err.message || 'Authentication error';
            alertBanner.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
          }
        }
      });

      document.getElementById('btnSignOut')?.addEventListener('click', () => {
        closeAllDropdowns();
        logoutUser();
      });

      // Workspaces / Projects Modal
      async function renderWorkspacesListModal() {
        const container = document.getElementById('workspacesListContainer');
        if (!container) return;
        container.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted)">Loading diagrams...</div>';
        const list = await listUserWorkspaces();
        if (!list || list.length === 0) {
          container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted)">No saved diagrams yet. Create your first project above!</div>';
          return;
        }
        container.innerHTML = '';
        list.forEach(ws => {
          const card = document.createElement('div');
          const isCurrent = ws.id === currentWorkspaceId;
          card.className = `workspace-card${isCurrent ? ' active' : ''}`;
          const dateStr = ws.updatedAt ? new Date(ws.updatedAt).toLocaleDateString() : '';
          card.innerHTML = `
            <div class="workspace-info">
              <span class="workspace-title">${ws.name || 'Untitled Diagram'} ${isCurrent ? '<small style="color:var(--accent);font-weight:700">(Active)</small>' : ''}</span>
              <span class="workspace-meta">${ws.tabCount || 1} canvas tab(s) Â· Updated ${dateStr}</span>
            </div>
            <div class="workspace-actions">
              <button class="ui-btn" style="padding:4px 8px;font-size:11px" data-open-ws="${ws.id}">Open</button>
              <button class="workspace-del-btn" title="Delete diagram" data-del-ws="${ws.id}">ðŸ—‘</button>
            </div>
          `;
          card.querySelector('[data-open-ws]')?.addEventListener('click', async ev => {
            ev.stopPropagation();
            await switchUserWorkspace(ws.id);
            if (wsBackdrop) wsBackdrop.style.display = 'none';
          });
          card.querySelector('[data-del-ws]')?.addEventListener('click', async ev => {
            ev.stopPropagation();
            if (confirm(`Delete diagram "${ws.name}"?`)) {
              await deleteUserWorkspace(ws.id);
              renderWorkspacesListModal();
            }
          });
          container.appendChild(card);
        });
      }

      document.getElementById('btnMyWorkspaces')?.addEventListener('click', () => {
        closeAllDropdowns();
        if (!currentUser) {
          openAuthModal('login');
          return;
        }
        if (wsBackdrop) wsBackdrop.style.display = 'flex';
        renderWorkspacesListModal();
      });

      document.getElementById('btnNewProject')?.addEventListener('click', () => {
        closeAllDropdowns();
        if (!currentUser) {
          openAuthModal('login');
          return;
        }
        if (wsBackdrop) wsBackdrop.style.display = 'flex';
        renderWorkspacesListModal();
        document.getElementById('newWorkspaceNameInput')?.focus();
      });

      document.getElementById('btnCreateWorkspaceConfirm')?.addEventListener('click', async () => {
        const input = document.getElementById('newWorkspaceNameInput');
        const name = input?.value?.trim();
        if (!name) return;
        await createNewUserWorkspace(name);
        if (input) input.value = '';
        if (wsBackdrop) wsBackdrop.style.display = 'none';
      });

      document.getElementById('closeWorkspacesModalBtn')?.addEventListener('click', () => {
        if (wsBackdrop) wsBackdrop.style.display = 'none';
      });
      wsBackdrop?.addEventListener('click', e => {
        if (e.target === wsBackdrop) wsBackdrop.style.display = 'none';
      });

      // Destructive-action confirmation dialog
      const confirmBackdrop = document.getElementById('confirmModalBackdrop');
      document.getElementById('confirmModalCancelBtn')?.addEventListener('click', () => closeConfirmModal(false));
      document.getElementById('closeConfirmModalBtn')?.addEventListener('click', () => closeConfirmModal(false));
      document.getElementById('confirmModalOkBtn')?.addEventListener('click', () => closeConfirmModal(true));
      confirmBackdrop?.addEventListener('click', e => {
        if (e.target === confirmBackdrop) closeConfirmModal(false);
      });
      window.addEventListener('keydown', e => {
        if (!isConfirmModalOpen()) return;
        // Enter is left to the focused button (Cancel is focused by default).
        if (e.key === 'Escape') {
          e.preventDefault?.();
          closeConfirmModal(false);
        }
      });

      document.getElementById('sidebarToggleBtn')?.addEventListener('click', toggleSidebar);
      document.getElementById('prevCanvasBtn')?.addEventListener('click', () => stepCanvasTab(-1));
      document.getElementById('nextCanvasBtn')?.addEventListener('click', () => stepCanvasTab(1));
      document.getElementById('addCanvasTabBtn')?.addEventListener('click', () => createCanvasTab());
      document.getElementById('forkCanvasTabBtn')?.addEventListener('click', () => duplicateCanvasTab());
      document.getElementById('bottomAddTabBtn')?.addEventListener('click', () => createCanvasTab());
      document.getElementById('bottomForkTabBtn')?.addEventListener('click', () => duplicateCanvasTab());
      // Persist on the way out. visibilitychange/pagehide also cover mobile
      // and tab switches; the sendBeacon call was removed because it could not
      // send the Authorization header (guests now never write to MySQL, so it
      // would only ever get a 401).
      window.addEventListener('beforeunload', flushWorkspaceNow);
      window.addEventListener('pagehide', flushWorkspaceNow);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushWorkspaceNow();
      });
      document.getElementById('btnUndo')?.addEventListener('click', undo);
      document.getElementById('btnRedo')?.addEventListener('click', redo);
      document.getElementById('bgWhiteBtn')?.addEventListener('click', () => setCanvasBackground('#ffffff'));
      document.getElementById('bgBlackBtn')?.addEventListener('click', () => setCanvasBackground('#000000'));

      document.getElementById('masterFlowBtn')?.addEventListener('click', () => {
        state.flowEnabled = !state.flowEnabled;
        updateHeaderButtons();
      });

      document.getElementById('btnSavePng')?.addEventListener('click', save2xPng);
      document.getElementById('btnCopyPng')?.addEventListener('click', copy2xPng);
      document.getElementById('btnRecordVideo')?.addEventListener('click', recordWebmVideo);
      document.getElementById('btnSaveJson')?.addEventListener('click', exportExcalidrawJson);
      document.getElementById('btnLoadJson')?.addEventListener('click', () => {
        document.getElementById('jsonFileInput')?.click();
      });
      document.getElementById('jsonFileInput')?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => importExcalidrawJson(String(ev.target?.result || ''));
        reader.readAsText(file);
        e.target.value = '';
      });
      document.getElementById('btnClearScene')?.addEventListener('click', () => {
        closeAllDropdowns();
        pushHistory();
        state.elements = [];
        state.selectedIds.clear();
        ShapeCache.clear();
        syncUIWithSelection();
      });

      document.querySelectorAll('[data-quick-add]').forEach(btn => {
        btn.addEventListener('click', () => quickAddShape(btn.getAttribute('data-quick-add')));
      });

      document.querySelectorAll('#flowModeGrid [data-flow-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.flowMode = btn.getAttribute('data-flow-mode');
          document.querySelectorAll('#flowModeGrid [data-flow-mode]').forEach(b => {
            b.classList.toggle('active', b === btn);
          });
          updateHeaderButtons();
        });
      });

      document.querySelectorAll('#flowSpeedRow [data-flow-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.flowSpeed = Number(btn.getAttribute('data-flow-speed')) || 1;
          document.querySelectorAll('#flowSpeedRow [data-flow-speed]').forEach(b => {
            b.classList.toggle('active', b === btn);
          });
          updateHeaderButtons();
        });
      });

      for (const { selector, attr, prop, numeric } of STYLE_CONTROL_BINDINGS) {
        document.querySelectorAll(selector).forEach(btn => {
          btn.addEventListener('click', () => {
            const raw = btn.getAttribute(attr);
            applyStyleProperty(prop, numeric ? Number(raw) : raw);
          });
        });
      }

      document.querySelectorAll('[data-template]').forEach(btn => {
        btn.addEventListener('click', () => {
          closeAllDropdowns();
          loadTemplate(btn.getAttribute('data-template'));
        });
      });

      document.querySelectorAll('#hudNodeControls [data-hud-morph]').forEach(btn => {
        btn.addEventListener('click', () => {
          const newType = btn.getAttribute('data-hud-morph');
          pushHistory();
          for (const id of state.selectedIds) {
            const el = state.elements.find(e => e.id === id);
            if (el && isNodeElement(el)) {
              el.type = newType;
              autoFitElementToText(el, el.text);
              ShapeCache.invalidate(el);
            }
          }
          syncUIWithSelection();
        });
      });
      document.getElementById('hudPulseBtn')?.addEventListener('click', () => triggerNodePulse());
      document.getElementById('hudNextBtn')?.addEventListener('click', () => {
        const firstId = Array.from(state.selectedIds)[0];
        const el = state.elements.find(e => e.id === firstId);
        if (el && isNodeElement(el)) chainNodeFrom(el, 'right', null, true);
      });
      document.getElementById('hudArrowFlowBtn')?.addEventListener('click', () => {
        pushHistory();
        for (const id of state.selectedIds) {
          const el = state.elements.find(e => e.id === id);
          if (el && el.type === 'arrow') el.flowEnabled = el.flowEnabled === false;
        }
        syncUIWithSelection();
      });
      document.getElementById('hudFlipArrowBtn')?.addEventListener('click', () => {
        pushHistory();
        for (const id of state.selectedIds) {
          const el = state.elements.find(e => e.id === id);
          if (el && el.type === 'arrow') {
            const tmpBind = el.startBinding;
            el.startBinding = el.endBinding;
            el.endBinding = tmpBind;
            const tx = el.x, ty = el.y;
            el.x = el.x2; el.y = el.y2;
            el.x2 = tx; el.y2 = ty;
            el.curveOffset = -(Number(el.curveOffset) || 0);
          }
        }
        syncUIWithSelection();
      });
      document.getElementById('hudDuplicateBtn')?.addEventListener('click', duplicateSelection);
      document.getElementById('hudDeleteBtn')?.addEventListener('click', deleteSelection);

      document.getElementById('toolLockBtn')?.addEventListener('click', () => toggleToolLock());
      document.querySelectorAll('#bottomToolDock [data-tool]').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.getAttribute('data-tool')));
      });

      document.getElementById('zoomOutBtn')?.addEventListener('click', () => setZoom(state.zoom * 0.85));
      document.getElementById('zoomInBtn')?.addEventListener('click', () => setZoom(state.zoom * 1.15));
      document.getElementById('zoomResetBtn')?.addEventListener('click', () => setZoom(1.0));
      document.getElementById('zoomFitBtn')?.addEventListener('click', fitToScreen);

      // Warm up official Excalidraw web fonts (Excalifont, Virgil, Cascadia, Assistant)
      if (document.fonts && document.fonts.load) {
        Promise.allSettled([
          document.fonts.load('16px Excalifont'),
          document.fonts.load('16px Virgil'),
          document.fonts.load('16px Cascadia'),
          document.fonts.load('500 16px Assistant')
        ]);
      }

      if (!loadWorkspaceFromStorage()) {
        loadTemplate('AI Agent Swarm');
        state.history.undoStack = [];
        ensureInitialTab('AI Agent Swarm');
        saveWorkspaceToStorage();
      }
      updateHeaderButtons();

      // Check and sync with MySQL database
      if (typeof fetch === 'function' && typeof window !== 'undefined') {
        fetchCurrentUser().then(() => {
          return loadWorkspaceFromDatabase();
        }).then(loadedFromDb => {
          if (!loadedFromDb) {
            saveWorkspaceToDatabase();
          }
          updateHeaderButtons();
        }).catch(() => {});
      }

      let lastFrameTime = performance.now() / 1000;
      const tick = (nowMs) => {
        const timeSec = nowMs / 1000;
        const dt = Math.min(0.05, Math.max(0.001, timeSec - lastFrameTime));
        lastFrameTime = timeSec;

        for (let i = state.activePulses.length - 1; i >= 0; i--) {
          const p = state.activePulses[i];
          p.progress += dt * (p.speed || 1.35);
          if (p.progress > 1.05) {
            state.activePulses.splice(i, 1);
          }
        }

        const dpr = window.devicePixelRatio || 1;
        const sCtx = staticCanvas.getContext('2d');
        const iCtx = interactiveCanvas.getContext('2d');

        sCtx.save();
        sCtx.setTransform(1, 0, 0, 1, 0, 0);
        sCtx.fillStyle = state.canvasBg;
        sCtx.fillRect(0, 0, staticCanvas.width, staticCanvas.height);
        sCtx.scale(dpr * state.zoom, dpr * state.zoom);
        sCtx.translate(state.scrollX, state.scrollY);
        const arrowGeoms = renderScenePasses(sCtx, timeSec, { canvasBg: state.canvasBg });
        sCtx.restore();

        iCtx.save();
        iCtx.setTransform(1, 0, 0, 1, 0, 0);
        iCtx.clearRect(0, 0, interactiveCanvas.width, interactiveCanvas.height);
        iCtx.scale(dpr * state.zoom, dpr * state.zoom);
        iCtx.translate(state.scrollX, state.scrollY);
        drawInteractiveOverlay(iCtx, arrowGeoms);
        iCtx.restore();

        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    if (typeof window !== 'undefined') {
      Object.assign(window, {
        state,
        WORKSPACE_STORAGE_KEY,
        mulberry32,
        clipSegmentToShape,
        clampPointToShapeInterior,
        roughEdge,
        roughRoundRect,
        roughEllipse,
        ShapeCache,
        drawStaticElement,
        drawElementText,
        computeGraphDepths,
        triggerNodePulse,
        getArrowGeometry,
        computeBindingForShape,
        getBindingBoundaryPoint,
        findMagneticShape,
        hitTestArrowHandle,
        hitTestQuickPorts,
        hitTestElement,
        autoFitElementToText,
        findSplitTargetArrow,
        trySplitArrowWithNode,
        getDiagramExportBounds,
        renderScenePasses,
        pointerDownWorld,
        pointerMoveWorld,
        pointerUpWorld,
        handleKeyDown,
        setTool,
        toggleToolLock,
        loadTemplate,
        quickAddShape,
        createElement,
        cloneElementsWithBindings,
        undo,
        redo,
        importExcalidrawJson,
        applyStyleProperty,
        createCanvasTab,
        duplicateCanvasTab,
        switchCanvasTab,
        stepCanvasTab,
        renameCanvasTab,
        closeCanvasTab,
        requestCloseCanvasTab,
        openConfirmModal,
        closeConfirmModal,
        isConfirmModalOpen,
        saveWorkspaceToStorage,
        loadWorkspaceFromStorage,
        saveWorkspaceToDatabase,
        loadWorkspaceFromDatabase,
        loginUser,
        registerUser,
        logoutUser,
        fetchCurrentUser,
        listUserWorkspaces,
        switchUserWorkspace,
        createNewUserWorkspace,
        deleteUserWorkspace,
        serializeWorkspace,
        restoreWorkspaceData,
        apiUrl,
        API_BASE
      });
      window.addEventListener('DOMContentLoaded', initStudioDOM);
    }
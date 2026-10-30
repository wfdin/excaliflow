    /* -------------------------------------------------------------------------
     * 15. UI Chrome Synchronization & Viewport Controls
     * ------------------------------------------------------------------------- */
    function closeAllDropdowns() {
      if (typeof document === 'undefined') return;
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    }

    /* -------------------------------------------------------------------------
     * Confirmation dialog for destructive actions.
     * openConfirmModal() resolves true only when the user explicitly confirms,
     * so data is never deleted from a single stray click.
     * ------------------------------------------------------------------------- */
    let confirmModalResolve = null;

    function isConfirmModalOpen() {
      if (typeof document === 'undefined') return false;
      const backdrop = document.getElementById('confirmModalBackdrop');
      return Boolean(backdrop) && backdrop.style.display !== 'none';
    }

    function closeConfirmModal(confirmed = false) {
      if (typeof document === 'undefined') return;
      const backdrop = document.getElementById('confirmModalBackdrop');
      if (backdrop) backdrop.style.display = 'none';
      const resolve = confirmModalResolve;
      confirmModalResolve = null;
      if (resolve) resolve(Boolean(confirmed));
    }

    function openConfirmModal(options = {}) {
      if (typeof document === 'undefined') return Promise.resolve(false);
      const backdrop = document.getElementById('confirmModalBackdrop');
      if (!backdrop) return Promise.resolve(false);

      const titleEl = document.getElementById('confirmModalTitle');
      const messageEl = document.getElementById('confirmModalMessage');
      const okBtn = document.getElementById('confirmModalOkBtn');
      const cancelBtn = document.getElementById('confirmModalCancelBtn');

      if (titleEl) titleEl.textContent = options.title || 'Are you sure?';
      if (messageEl) messageEl.textContent = options.message || '';
      if (okBtn) okBtn.textContent = options.confirmLabel || 'Confirm';

      // A dialog that is already open has been superseded: release its caller
      // as "cancelled" instead of leaving the promise hanging.
      if (confirmModalResolve) {
        const previous = confirmModalResolve;
        confirmModalResolve = null;
        previous(false);
      }

      backdrop.style.display = 'flex';
      // Focus the safe choice so a stray Enter can never destroy data.
      cancelBtn?.focus?.();

      return new Promise(resolve => {
        confirmModalResolve = resolve;
      });
    }

    function setCanvasBackground(color) {
      state.canvasBg = color === '#000000' ? '#000000' : '#ffffff';
      if (state.isReadOnly) {
        if (typeof document === 'undefined') return;
        document.body.classList.toggle('dark-canvas', state.canvasBg === '#000000');
        document.getElementById('bgWhiteBtn')?.classList.toggle('active', state.canvasBg === '#ffffff');
        document.getElementById('bgBlackBtn')?.classList.toggle('active', state.canvasBg === '#000000');
        return;
      }
      if (typeof document === 'undefined') return;
      document.body.classList.toggle('dark-canvas', state.canvasBg === '#000000');
      document.getElementById('bgWhiteBtn')?.classList.toggle('active', state.canvasBg === '#ffffff');
      document.getElementById('bgBlackBtn')?.classList.toggle('active', state.canvasBg === '#000000');
      scheduleWorkspaceSave();
    }

    function syncZoomReadout() {
      if (typeof document !== 'undefined') {
        const zBtn = document.getElementById('zoomResetBtn');
        if (zBtn) zBtn.textContent = `${Math.round(state.zoom * 100)}%`;
      }
      updateQuickHudPosition();
      scheduleWorkspaceSave();
    }

    function setZoom(nextZoom, centerScreenX, centerScreenY) {
      const clamped = Math.max(0.25, Math.min(3.0, nextZoom));
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const sx = centerScreenX ?? vw / 2;
      const sy = centerScreenY ?? vh / 2;

      const worldBefore = screenToWorld(sx, sy);
      state.zoom = clamped;
      state.scrollX = sx / state.zoom - worldBefore.x;
      state.scrollY = sy / state.zoom - worldBefore.y;
      syncZoomReadout();
    }

    function fitToScreen() {
      const bounds = getDiagramExportBounds(64);
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const sidebarOffset = (typeof document !== 'undefined' &&
        !document.getElementById('leftSidebar')?.classList.contains('collapsed')) ? 115 : 0;

      const availW = Math.max(320, vw - sidebarOffset - 80);
      const availH = Math.max(240, vh - 140);
      const nextZoom = Math.max(0.25, Math.min(1.5, Math.min(availW / bounds.width, availH / bounds.height)));

      state.zoom = nextZoom;
      state.scrollX = (vw + sidebarOffset) / (2 * state.zoom) - (bounds.x + bounds.width / 2);
      state.scrollY = vh / (2 * state.zoom) - (bounds.y + bounds.height / 2);
      syncZoomReadout();
    }

    function toggleSidebar() {
      if (typeof document === 'undefined') return;
      const sb = document.getElementById('leftSidebar');
      if (sb) sb.classList.toggle('collapsed');
    }

    function updateHeaderButtons() {
      if (typeof document === 'undefined') return;
      const u = document.getElementById('btnUndo');
      const r = document.getElementById('btnRedo');
      if (u) u.disabled = state.history.undoStack.length === 0;
      if (r) r.disabled = state.history.redoStack.length === 0;

      const dot = document.getElementById('flowStatusDot');
      const mBtn = document.getElementById('masterFlowBtn');
      const badge = document.getElementById('flowBadgeText');
      if (dot) dot.classList.toggle('paused', !state.flowEnabled);
      if (mBtn) {
        mBtn.textContent = state.flowEnabled ? 'Flow: ON' : 'Flow: OFF';
        mBtn.classList.toggle('active', state.flowEnabled);
      }
      if (badge) {
        badge.textContent = `${state.flowMode.toUpperCase()} · ${state.flowSpeed}X`;
      }
      scheduleWorkspaceSave();
    }

    function updateQuickHudPosition() {
      if (typeof document === 'undefined') return;
      const hud = document.getElementById('quickHud');
      if (!hud) return;

      if (state.selectedIds.size === 0 || state.editingId) {
        hud.classList.remove('visible');
        return;
      }

      const selected = state.elements.filter(el => state.selectedIds.has(el.id));
      if (selected.length === 0) {
        hud.classList.remove('visible');
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity;
      for (const el of selected) {
        if (el.type === 'arrow') {
          const geom = getArrowGeometry(el);
          for (const p of geom.samples) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
          }
        } else {
          minX = Math.min(minX, el.x);
          minY = Math.min(minY, el.y);
          maxX = Math.max(maxX, el.x + (el.width || 0));
        }
      }

      const topCenterScreen = worldToScreen((minX + maxX) / 2, minY);
      const clampedX = Math.max(220, Math.min(window.innerWidth - 220, topCenterScreen.x));
      const clampedY = Math.max(108, topCenterScreen.y - 18);

      hud.style.left = `${clampedX}px`;
      hud.style.top = `${clampedY}px`;
      hud.classList.add('visible');

      const first = selected[0];
      const isArrowOnly = selected.every(e => e.type === 'arrow');
      const nodeCtrls = document.getElementById('hudNodeControls');
      const arrowCtrls = document.getElementById('hudArrowControls');
      if (nodeCtrls) nodeCtrls.style.display = isArrowOnly ? 'none' : 'inline-flex';
      if (arrowCtrls) arrowCtrls.style.display = isArrowOnly ? 'inline-flex' : 'none';

      if (isArrowOnly) {
        const flowBtn = document.getElementById('hudArrowFlowBtn');
        if (flowBtn) {
          const on = first.flowEnabled !== false;
          flowBtn.textContent = on ? 'Flow ON' : 'Flow OFF';
          flowBtn.classList.toggle('active', on);
        }
      }
    }

    const STYLE_CONTROL_BINDINGS = [
      { selector: '#sidebarSwatches .color-swatch', attr: 'data-color', prop: 'strokeColor' },
      { selector: '#fillStyleRow .seg-btn', attr: 'data-fill-style', prop: 'fillStyle' },
      { selector: '#fontFamilyRow .seg-btn', attr: 'data-font-family', prop: 'fontFamily' },
      { selector: '#fontSizeRow .seg-btn', attr: 'data-font-size', prop: 'fontSize', numeric: true },
      { selector: '#roughnessRow .seg-btn', attr: 'data-roughness', prop: 'roughness', numeric: true },
      { selector: '#strokeWidthRow .seg-btn', attr: 'data-stroke-width', prop: 'strokeWidth', numeric: true },
      { selector: '#strokeStyleRow .seg-btn', attr: 'data-stroke-style', prop: 'strokeStyle' },
      { selector: '#curveTypeRow .seg-btn', attr: 'data-curve-type', prop: 'curveType' },
      { selector: '#hudFontGroup .ui-btn', attr: 'data-hud-font', prop: 'fontFamily' },
      { selector: '#hudArrowControls [data-hud-curve]', attr: 'data-hud-curve', prop: 'curveType' }
    ];

    function syncUIWithSelection() {
      if (typeof document === 'undefined') return;
      const selected = state.elements.filter(el => state.selectedIds.has(el.id));
      const ref = selected[0] || state.defaults;

      const setActiveAttr = (selector, attr, val) => {
        document.querySelectorAll(selector).forEach(btn => {
          btn.classList.toggle('active', String(btn.getAttribute(attr)) === String(val));
        });
      };

      for (const { selector, attr, prop } of STYLE_CONTROL_BINDINGS) {
        const val = prop === 'fontFamily' ? normalizeFontFamily(ref.fontFamily) : ref[prop];
        setActiveAttr(selector, attr, val);
      }
      setActiveAttr('#hudColorDots .hud-dot', 'data-color', ref.strokeColor);

      renderCanvasTabs();
      updateHeaderButtons();
      updateQuickHudPosition();
      scheduleWorkspaceSave();
    }

    function applyStyleProperty(prop, value) {
      if (state.isReadOnly) return;
      if (prop === 'fontFamily') value = normalizeFontFamily(value);
      state.defaults[prop] = value;
      if (prop === 'curveType' && (value === 'straight' || value === 'elbow')) {
        state.defaults.curveOffset = 0;
      }

      const targets = prop === 'roughness'
        ? state.elements
        : (state.selectedIds.size > 0
            ? state.elements.filter(el => state.selectedIds.has(el.id))
            : (prop === 'fontFamily' ? state.elements : []));

      if (targets.length > 0) {
        pushHistory();
        for (const el of targets) {
          el[prop] = value;
          if (prop === 'curveType') {
            if (value === 'straight' || value === 'elbow') {
              el.curveOffset = 0;
            } else if (value === 'curved' && Math.abs(Number(el.curveOffset) || 0) < 2) {
              el.curveOffset = -36;
            }
          }
          if (prop === 'fontFamily' || prop === 'fontSize') {
            autoFitElementToText(el, el.text);
          }
          ShapeCache.invalidate(el);
        }
      }
      syncUIWithSelection();
    }

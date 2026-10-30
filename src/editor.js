    /* -------------------------------------------------------------------------
     * 13. Inline Text Editor & Keyboard Shortcuts
     * ------------------------------------------------------------------------- */
    function startInlineEditing(el) {
      if (!el || el.type === 'arrow' || typeof document === 'undefined') return;
      state.editingId = el.id;
      state.editingPreSnap = snapshotScene();
      const wrap = document.getElementById('inlineEditorWrap');
      const ta = document.getElementById('inlineTextEditor');
      if (!wrap || !ta) return;

      const cx = el.x + (el.width || 0) / 2;
      const cy = el.y + (el.height || 0) / 2;

      const scr = worldToScreen(cx, cy);
      const fontSize = (Number(el.fontSize) || 16) * state.zoom;
      const w = Math.max(120, ((el.width || 120) - 12) * state.zoom);
      const h = Math.max(36, ((el.height || 44) - 8) * state.zoom);

      wrap.style.display = 'block';
      wrap.style.left = `${scr.x - w / 2}px`;
      wrap.style.top = `${scr.y - h / 2}px`;
      ta.style.width = `${w}px`;
      ta.style.height = `${h}px`;
      ta.style.fontFamily = FONT_MAP[normalizeFontFamily(el.fontFamily)];
      ta.style.fontSize = `${fontSize}px`;
      ta.style.color = resolveStrokeColor(el.strokeColor, state.canvasBg);
      ta.value = el.text || '';
      ta.focus?.();
      ta.select?.();
    }

    function commitInlineEditor() {
      if (!state.editingId) return;
      const el = state.elements.find(e => e.id === state.editingId);
      const wrap = typeof document !== 'undefined' ? document.getElementById('inlineEditorWrap') : null;
      const ta = typeof document !== 'undefined' ? document.getElementById('inlineTextEditor') : null;
      if (el && ta) {
        if (state.editingPreSnap && ta.value !== el.text) {
          pushHistory(state.editingPreSnap);
        }
        autoFitElementToText(el, ta.value);
      }
      state.editingId = null;
      state.editingPreSnap = null;
      if (wrap) wrap.style.display = 'none';
    }

    function setTool(tool) {
      state.activeTool = tool;
      if (typeof document === 'undefined') return;
      document.querySelectorAll('#bottomToolDock [data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
      });
      updateInteractiveCursor();
    }

    function toggleToolLock(forceVal) {
      state.toolLocked = typeof forceVal === 'boolean' ? forceVal : !state.toolLocked;
      if (typeof document !== 'undefined') {
        const btn = document.getElementById('toolLockBtn');
        if (btn) btn.classList.toggle('active', state.toolLocked);
      }
      return state.toolLocked;
    }

    function handleKeyDown(e) {
      // Don't hijack keyboard when a modal dialog is open or focus is in a form input
      const activeTag = document.activeElement?.tagName?.toUpperCase();
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
      if (document.getElementById('authModalBackdrop')?.style.display !== 'none') return;
      if (document.getElementById('workspacesModalBackdrop')?.style.display !== 'none') return;
      if (isConfirmModalOpen()) return;

      if (state.editingTabId) return;
      const isEditing = Boolean(state.editingId);
      if (isEditing) {
        if (e.key === 'Escape') {
          e.preventDefault?.();
          commitInlineEditor();
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault?.();
          const editedEl = state.elements.find(el => el.id === state.editingId);
          commitInlineEditor();
          if (editedEl && isNodeElement(editedEl)) {
            chainNodeFrom(editedEl, 'right', null, true);
          }
          return;
        }
        return;
      }

      if (e.key === 'Escape') {
        closeAllDropdowns();
        if (state.selectedIds.size > 0) {
          state.selectedIds.clear();
          syncUIWithSelection();
        }
        if (state.activeTool !== 'select' && !state.toolLocked) {
          setTool('select');
        }
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      const key = String(e.key || '').toLowerCase();

      if (e.altKey && !meta) {
        if (/^[1-9]$/.test(String(e.key || ''))) {
          const idx = Number(e.key) - 1;
          if (state.tabs[idx]) {
            e.preventDefault?.();
            switchCanvasTab(state.tabs[idx].id);
            return;
          }
        }
        if (e.key === '[' || e.code === 'BracketLeft') {
          e.preventDefault?.();
          stepCanvasTab(-1);
          return;
        }
        if (e.key === ']' || e.code === 'BracketRight') {
          e.preventDefault?.();
          stepCanvasTab(1);
          return;
        }
        if (key === 't' || e.code === 'KeyT') {
          e.preventDefault?.();
          createCanvasTab();
          return;
        }
      }

      if (meta && key === '\\') {
        e.preventDefault?.();
        toggleSidebar();
        return;
      }
      if (meta && key === 'z') {
        e.preventDefault?.();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && key === 'd') {
        e.preventDefault?.();
        duplicateSelection();
        return;
      }
      if (meta && key === 'a') {
        e.preventDefault?.();
        state.selectedIds = new Set(state.elements.map(el => el.id));
        syncUIWithSelection();
        return;
      }
      if (meta && key === 'c') {
        e.preventDefault?.();
        if (e.shiftKey) {
          copy2xPng();
          return;
        }
        state.clipboard = JSON.parse(JSON.stringify(
          state.elements.filter(el => state.selectedIds.has(el.id))
        ));
        state.pasteCount = 0;
        return;
      }
      if (meta && key === 'v') {
        e.preventDefault?.();
        if (state.clipboard.length > 0) {
          pushHistory();
          state.pasteCount += 1;
          const offset = 28 * state.pasteCount;
          cloneElementsWithBindings(state.clipboard, offset, offset);
          syncUIWithSelection();
        }
        return;
      }

      if (e.key === 'Tab') {
        const selectedNodes = Array.from(state.selectedIds)
          .map(id => state.elements.find(el => el.id === id))
          .filter(el => el && isNodeElement(el));
        if (selectedNodes.length === 1) {
          e.preventDefault?.();
          chainNodeFrom(selectedNodes[0], 'right', null, true);
          return;
        }
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault?.();
        deleteSelection();
        return;
      }

      const shortcutMap = {
        '1': 'select',
        'v': 'select',
        'h': 'hand',
        '2': 'rectangle',
        'r': 'rectangle',
        '3': 'diamond',
        'd': 'diamond',
        '4': 'ellipse',
        'o': 'ellipse',
        '5': 'arrow',
        '6': 'arrow',
        'a': 'arrow',
        '7': 'freedraw',
        'p': 'freedraw',
        '8': 'text',
        't': 'text',
        '9': 'sticky',
        'n': 'sticky',
        'k': 'laser',
        '0': 'eraser',
        'e': 'eraser'
      };

      if (key === 'q') {
        e.preventDefault?.();
        toggleToolLock();
        return;
      }

      if (shortcutMap[key]) {
        e.preventDefault?.();
        setTool(shortcutMap[key]);
      }
    }

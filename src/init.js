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
      window.addEventListener('click', () => closeAllDropdowns());

      document.getElementById('sidebarToggleBtn')?.addEventListener('click', toggleSidebar);
      document.getElementById('prevCanvasBtn')?.addEventListener('click', () => stepCanvasTab(-1));
      document.getElementById('nextCanvasBtn')?.addEventListener('click', () => stepCanvasTab(1));
      document.getElementById('addCanvasTabBtn')?.addEventListener('click', () => createCanvasTab());
      document.getElementById('forkCanvasTabBtn')?.addEventListener('click', () => duplicateCanvasTab());
      document.getElementById('bottomAddTabBtn')?.addEventListener('click', () => createCanvasTab());
      document.getElementById('bottomForkTabBtn')?.addEventListener('click', () => duplicateCanvasTab());
      window.addEventListener('beforeunload', () => saveWorkspaceToStorage());
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
        saveWorkspaceToStorage,
        loadWorkspaceFromStorage,
        serializeWorkspace,
        restoreWorkspaceData
      });
      window.addEventListener('DOMContentLoaded', initStudioDOM);
    }
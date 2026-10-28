    /* -------------------------------------------------------------------------
     * 11. Camera Transforms & Interactive Overlay Rendering
     * ------------------------------------------------------------------------- */
    function worldToScreen(wx, wy) {
      return {
        x: (wx + state.scrollX) * state.zoom,
        y: (wy + state.scrollY) * state.zoom
      };
    }

    function screenToWorld(sx, sy) {
      return {
        x: sx / state.zoom - state.scrollX,
        y: sy / state.zoom - state.scrollY
      };
    }

    function drawInteractiveOverlay(ctx, arrowGeoms) {
      const zoom = state.zoom || 1;
      const isDark = state.canvasBg === '#000000';
      const accent = isDark ? '#8b87ff' : '#6965db';

      ctx.save();

      const elementsMap = getElementMap();

      // 1. Magnetic snap target outline, center-to-perimeter angle ray & glowing ring
      if (state.snapPreview) {
        const sp = state.snapPreview;
        const targetShape = elementsMap.get(sp.shapeId);
        if (targetShape) {
          const paths = ShapeCache.get(targetShape);
          const scx = targetShape.x + targetShape.width / 2;
          const scy = targetShape.y + targetShape.height / 2;

          ctx.save();
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2.4 / zoom;
          ctx.shadowColor = accent;
          ctx.shadowBlur = 12;
          ctx.stroke(paths.fillPath);

          // Dashed radial guide from shape center to perimeter attachment point
          ctx.beginPath();
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.lineWidth = 1.3 / zoom;
          ctx.globalAlpha = 0.65;
          ctx.moveTo(scx, scy);
          ctx.lineTo(sp.point.x, sp.point.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;

          // Glowing perimeter anchor ring
          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2.5 / zoom;
          ctx.arc(sp.point.x, sp.point.y, 6.5 / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // 2. Subtle hover cue on hovered unselected node
      if (state.hoveredId && !state.selectedIds.has(state.hoveredId) && !state.drag) {
        const hovEl = elementsMap.get(state.hoveredId);
        if (hovEl && isNodeElement(hovEl) && hovEl.type !== 'text') {
          ctx.save();
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 1.5 / zoom;
          const pad = 5 / zoom;
          ctx.strokeRect(hovEl.x - pad, hovEl.y - pad, (hovEl.width || 0) + pad * 2, (hovEl.height || 0) + pad * 2);
          ctx.restore();
        }
      }

      // 3. Selection Bounding Box + 8-Way Resize Handles + Quick-Connect '+' Ports
      const portOwnerIds = new Set(state.selectedIds);
      if (state.hoveredId) portOwnerIds.add(state.hoveredId);

      for (const id of state.selectedIds) {
        const el = elementsMap.get(id);
        if (!el || el.type === 'arrow') continue;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.4 / zoom;
        const pad = 6 / zoom;
        ctx.strokeRect(el.x - pad, el.y - pad, (el.width || 0) + pad * 2, (el.height || 0) + pad * 2);

        // Draw 8 resize handles when single shape is selected
        if (state.selectedIds.size === 1 && isNodeElement(el) && el.type !== 'text') {
          const hs = 4.2 / zoom;
          for (const h of getResizeHandles(el)) {
            ctx.fillStyle = isDark ? '#1e1e24' : '#ffffff';
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.5 / zoom;
            ctx.beginPath();
            ctx.rect(h.x - hs, h.y - hs, hs * 2, hs * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      if (state.activeTool === 'select') {
        for (const id of portOwnerIds) {
          const el = elementsMap.get(id);
          if (!el || !isNodeElement(el) || el.type === 'text') continue;
          const ports = getQuickConnectPorts(el);
          for (const p of ports) {
            const isHoveredPort = state.hoveredPort &&
              state.hoveredPort.elementId === el.id &&
              state.hoveredPort.dir === p.dir;
            const r = (isHoveredPort ? 9.5 : 7.2) / zoom;
            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = isHoveredPort ? accent : (isDark ? '#1e1e26' : '#ffffff');
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.6 / zoom;
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            const arm = 3.3 / zoom;
            ctx.beginPath();
            ctx.strokeStyle = isHoveredPort ? '#ffffff' : accent;
            ctx.lineWidth = 1.6 / zoom;
            ctx.moveTo(p.x - arm, p.y);
            ctx.lineTo(p.x + arm, p.y);
            ctx.moveTo(p.x, p.y - arm);
            ctx.lineTo(p.x, p.y + arm);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 4. Hover-Visible & Selected Arrow Endpoint Handles ('start', 'curve', 'end')
      for (const el of state.elements) {
        if (el.type !== 'arrow') continue;
        const showHandles = state.selectedIds.has(el.id) || state.hoveredId === el.id ||
          (state.hoveredArrowHandle && state.hoveredArrowHandle.elementId === el.id);
        if (!showHandles) continue;

        const geom = arrowGeoms.get(el.id) || getArrowGeometry(el);
        const handles = [
          { name: 'start', pt: geom.p0, bound: Boolean(el.startBinding?.elementId) },
          ...((el.curveType || 'curved') !== 'straight' ? [{ name: 'curve', pt: geom.curveHandlePt, bound: false }] : []),
          { name: 'end',   pt: geom.p1, bound: Boolean(el.endBinding?.elementId) }
        ];

        for (const h of handles) {
          const isHot = state.hoveredArrowHandle &&
            state.hoveredArrowHandle.elementId === el.id &&
            state.hoveredArrowHandle.handle === h.name;
          const r = (isHot ? 7.4 : 5.6) / zoom;
          ctx.save();
          ctx.beginPath();
          ctx.fillStyle = h.bound ? accent : (isDark ? '#18181f' : '#ffffff');
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2 / zoom;
          if (h.name === 'curve') {
            const d = r * 1.15;
            ctx.moveTo(h.pt.x, h.pt.y - d);
            ctx.lineTo(h.pt.x + d, h.pt.y);
            ctx.lineTo(h.pt.x, h.pt.y + d);
            ctx.lineTo(h.pt.x - d, h.pt.y);
            ctx.closePath();
          } else {
            ctx.arc(h.pt.x, h.pt.y, r, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // 5. Live Port-Wire Drag Preview
      if (state.drag && state.drag.mode === 'port-wire') {
        const d = state.drag;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(d.startPt.x, d.startPt.y);
        const mx = (d.startPt.x + d.currPt.x) / 2;
        const my = (d.startPt.y + d.currPt.y) / 2 - 24 / zoom;
        ctx.quadraticCurveTo(mx, my, d.currPt.x, d.currPt.y);
        ctx.stroke();
        ctx.restore();
      }

      // 6. Marquee Selection Box
      if (state.drag && state.drag.mode === 'marquee') {
        const d = state.drag;
        const x = Math.min(d.startX, d.currX);
        const y = Math.min(d.startY, d.currY);
        const w = Math.abs(d.currX - d.startX);
        const h = Math.abs(d.currY - d.startY);
        ctx.save();
        ctx.fillStyle = 'rgba(105, 101, 219, 0.09)';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.2 / zoom;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }

      // 7. Laser Pointer 900ms Decaying Red Glow Trail
      const nowMs = performance.now();
      state.laserPoints = state.laserPoints.filter(p => nowMs - p.t < 900);
      if (state.laserPoints.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < state.laserPoints.length; i++) {
          const p0 = state.laserPoints[i - 1];
          const p1 = state.laserPoints[i];
          const age = (nowMs - p1.t) / 900;
          const alpha = Math.max(0, 1 - age);
          ctx.beginPath();
          ctx.strokeStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = (4.5 * alpha) / zoom;
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 8. Empty Canvas Watermark Guide (when switching to a newly created blank tab)
      if (state.elements.length === 0 && !state.drag) {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const centerW = screenToWorld(vw / 2, vh / 2);
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        const tabIdx = Math.max(0, state.tabs.findIndex(t => t.id === state.activeTabId));
        const tabTitle = activeTab ? activeTab.name : `Canvas ${tabIdx + 1}`;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDark ? 'rgba(244, 244, 248, 0.72)' : 'rgba(27, 27, 31, 0.68)';
        ctx.font = `600 ${Math.round(18 / zoom)}px Assistant, system-ui, sans-serif`;
        ctx.fillText(`${tabTitle} — Empty Canvas`, centerW.x, centerW.y - 14 / zoom);
        ctx.fillStyle = isDark ? 'rgba(244, 244, 248, 0.44)' : 'rgba(27, 27, 31, 0.44)';
        ctx.font = `500 ${Math.round(13 / zoom)}px Assistant, system-ui, sans-serif`;
        ctx.fillText('Double-click anywhere to add a node, draw with tools above, or pick a Template', centerW.x, centerW.y + 14 / zoom);
        ctx.restore();
      }

      ctx.restore();
    }

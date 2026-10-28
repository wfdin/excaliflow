    /* -------------------------------------------------------------------------
     * 7. Hit Testing, 8-Way Resize Handles, Ports & Inline Node Splitting
     * ------------------------------------------------------------------------- */
    function getResizeHandles(el) {
      if (!isNodeElement(el) || el.type === 'text') return [];
      const pad = 6 / (state.zoom || 1);
      const x = el.x - pad;
      const y = el.y - pad;
      const w = (el.width || 0) + pad * 2;
      const h = (el.height || 0) + pad * 2;
      return [
        { dir: 'nw', x: x,         y: y,         cursor: 'nwse-resize' },
        { dir: 'n',  x: x + w / 2, y: y,         cursor: 'ns-resize' },
        { dir: 'ne', x: x + w,     y: y,         cursor: 'nesw-resize' },
        { dir: 'e',  x: x + w,     y: y + h / 2, cursor: 'ew-resize' },
        { dir: 'se', x: x + w,     y: y + h,     cursor: 'nwse-resize' },
        { dir: 's',  x: x + w / 2, y: y + h,     cursor: 'ns-resize' },
        { dir: 'sw', x: x,         y: y + h,     cursor: 'nesw-resize' },
        { dir: 'w',  x: x,         y: y + h / 2, cursor: 'ew-resize' }
      ];
    }

    function hitTestResizeHandles(wx, wy) {
      if (state.selectedIds.size !== 1) return null;
      const id = Array.from(state.selectedIds)[0];
      const el = state.elements.find(e => e.id === id);
      if (!el || !isNodeElement(el) || el.type === 'text') return null;

      const tol = 8 / (state.zoom || 1);
      for (const h of getResizeHandles(el)) {
        if (Math.hypot(wx - h.x, wy - h.y) <= tol) {
          return { elementId: el.id, dir: h.dir, cursor: h.cursor };
        }
      }
      return null;
    }

    function getQuickConnectPorts(el) {
      if (!isNodeElement(el) || el.type === 'text') return [];
      const gap = 18 / (state.zoom || 1);
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      return [
        { dir: 'top',    x: cx,                    y: el.y - gap,              angle: -Math.PI / 2 },
        { dir: 'right',  x: el.x + el.width + gap, y: cy,                      angle: 0 },
        { dir: 'bottom', x: cx,                    y: el.y + el.height + gap,  angle: Math.PI / 2 },
        { dir: 'left',   x: el.x - gap,            y: cy,                      angle: Math.PI }
      ];
    }

    function hitTestQuickPorts(wx, wy) {
      const candidateIds = new Set(state.selectedIds);
      if (state.hoveredId) candidateIds.add(state.hoveredId);
      const hitRadius = 12 / (state.zoom || 1);

      for (const id of candidateIds) {
        const el = state.elements.find(e => e.id === id);
        if (!el || !isNodeElement(el) || el.type === 'text') continue;
        const ports = getQuickConnectPorts(el);
        for (const p of ports) {
          if (Math.hypot(wx - p.x, wy - p.y) <= hitRadius) {
            return { elementId: el.id, dir: p.dir, x: p.x, y: p.y };
          }
        }
      }
      return null;
    }

    function hitTestArrowHandle(wx, wy) {
      const radius = 18 / (state.zoom || 1);
      const elementsMap = getElementMap();

      const arrows = state.elements.filter(e => e.type === 'arrow');
      arrows.sort((a, b) => {
        const aPri = (state.selectedIds.has(a.id) || state.hoveredId === a.id) ? 1 : 0;
        const bPri = (state.selectedIds.has(b.id) || state.hoveredId === b.id) ? 1 : 0;
        return bPri - aPri;
      });

      for (const arr of arrows) {
        const geom = getArrowGeometry(arr, elementsMap);
        if (Math.hypot(wx - geom.p0.x, wy - geom.p0.y) <= radius) {
          return { elementId: arr.id, handle: 'start', point: geom.p0 };
        }
        if (Math.hypot(wx - geom.p1.x, wy - geom.p1.y) <= radius) {
          return { elementId: arr.id, handle: 'end', point: geom.p1 };
        }
        if ((arr.curveType || 'curved') !== 'straight' && Math.hypot(wx - geom.curveHandlePt.x, wy - geom.curveHandlePt.y) <= radius) {
          return { elementId: arr.id, handle: 'curve', point: geom.curveHandlePt };
        }
      }
      return null;
    }

    function distanceToArrowShaft(arrow, wx, wy, elementsMap = null) {
      const geom = getArrowGeometry(arrow, elementsMap);
      let minDist = Infinity;
      const samples = geom.samples;
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((wx - a.x) * dx + (wy - a.y) * dy) / len2)) : 0;
        const px = a.x + t * dx;
        const py = a.y + t * dy;
        const d = Math.hypot(wx - px, wy - py);
        if (d < minDist) minDist = d;
      }
      return minDist;
    }

    function hitTestElement(wx, wy) {
      const elementsMap = getElementMap();
      const arrowTol = 11 / (state.zoom || 1);

      for (let i = state.elements.length - 1; i >= 0; i--) {
        const el = state.elements[i];
        if (el.type === 'arrow') {
          if (distanceToArrowShaft(el, wx, wy, elementsMap) <= arrowTol) {
            return el;
          }
          continue;
        }
        if (el.type === 'freedraw') {
          const pts = el.points || [];
          for (const p of pts) {
            if (Math.hypot(wx - (el.x + p[0]), wy - (el.y + p[1])) <= 10 / (state.zoom || 1)) {
              return el;
            }
          }
          continue;
        }
        if (el.type === 'ellipse') {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const rx = Math.max(4, el.width / 2 + 4);
          const ry = Math.max(4, el.height / 2 + 4);
          if (((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2 <= 1) return el;
          continue;
        }
        if (el.type === 'diamond') {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const hw = Math.max(4, el.width / 2 + 4);
          const hh = Math.max(4, el.height / 2 + 4);
          if (Math.abs(wx - cx) / hw + Math.abs(wy - cy) / hh <= 1) return el;
          continue;
        }
        if (wx >= el.x && wx <= el.x + el.width && wy >= el.y && wy <= el.y + el.height) {
          return el;
        }
      }
      return null;
    }

    function findSplitTargetArrow(node) {
      if (!node || !isNodeElement(node) || node.type === 'text') return null;
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const elementsMap = getElementMap();
      const threshold = Math.min(node.width, node.height) * 0.45;

      for (const el of state.elements) {
        if (el.type !== 'arrow') continue;
        if (el.startBinding?.elementId === node.id || el.endBinding?.elementId === node.id) continue;
        const d = distanceToArrowShaft(el, cx, cy, elementsMap);
        if (d <= threshold) return el;
      }
      return null;
    }

    function trySplitArrowWithNode(node) {
      const arrow = findSplitTargetArrow(node);
      if (!arrow) return false;

      const origEndBinding = arrow.endBinding ? { ...arrow.endBinding } : null;
      const origX2 = arrow.x2;
      const origY2 = arrow.y2;

      const nodeCenter = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
      const geom = getArrowGeometry(arrow);

      arrow.endBinding = computeBindingForShape(node, geom.p0);
      arrow.curveOffset = 0;

      const newArrow = createElement('arrow', {
        x: nodeCenter.x,
        y: nodeCenter.y,
        x2: origX2,
        y2: origY2,
        strokeColor: arrow.strokeColor,
        strokeWidth: arrow.strokeWidth,
        strokeStyle: arrow.strokeStyle,
        curveType: arrow.curveType,
        curveOffset: 0,
        startBinding: computeBindingForShape(node, geom.p1),
        endBinding: origEndBinding,
        flowEnabled: arrow.flowEnabled !== false
      });

      state.elements.push(newArrow);
      state.splitTargetArrowId = null;
      return true;
    }

    /* -------------------------------------------------------------------------
     * 12. Pointer Interaction Engine (World-Space & DOM Events)
     * ------------------------------------------------------------------------- */
    function updateInteractiveCursor() {
      if (typeof document === 'undefined') return;
      const ic = document.getElementById('interactiveCanvas');
      if (!ic) return;

      if (state.drag) {
        if (state.drag.mode === 'pan' || state.drag.mode === 'move' || state.drag.mode === 'arrow-handle') {
          ic.style.cursor = 'grabbing';
          return;
        }
        if (state.drag.mode === 'resize') {
          ic.style.cursor = state.drag.cursor || 'nwse-resize';
          return;
        }
      }

      if (state.activeTool === 'hand' || state.isSpacePanning) {
        ic.style.cursor = 'grab';
        return;
      }
      if (state.activeTool !== 'select') {
        ic.style.cursor = 'crosshair';
        return;
      }

      if (state.hoveredResizeHandle) {
        ic.style.cursor = state.hoveredResizeHandle.cursor;
      } else if (state.hoveredPort) {
        ic.style.cursor = 'pointer';
      } else if (state.hoveredArrowHandle) {
        ic.style.cursor = 'grab';
      } else if (state.hoveredId) {
        ic.style.cursor = 'move';
      } else {
        ic.style.cursor = 'default';
      }
    }

    function cloneElementsWithBindings(sourceElements, offsetX = 0, offsetY = 0) {
      if (!Array.isArray(sourceElements) || sourceElements.length === 0) return [];
      const idMap = new Map();
      const clones = [];
      for (const el of sourceElements) {
        const newId = nextId(el.type);
        idMap.set(el.id, newId);
        const copy = JSON.parse(JSON.stringify(el));
        copy.id = newId;
        copy.x = (Number(copy.x) || 0) + offsetX;
        copy.y = (Number(copy.y) || 0) + offsetY;
        if (typeof copy.x2 === 'number') copy.x2 += offsetX;
        if (typeof copy.y2 === 'number') copy.y2 += offsetY;
        copy.seed = Math.floor(Math.random() * 1000000) + 1;
        clones.push(copy);
      }
      for (const c of clones) {
        if (c.startBinding?.elementId && idMap.has(c.startBinding.elementId)) {
          c.startBinding.elementId = idMap.get(c.startBinding.elementId);
        }
        if (c.endBinding?.elementId && idMap.has(c.endBinding.elementId)) {
          c.endBinding.elementId = idMap.get(c.endBinding.elementId);
        }
        state.elements.push(c);
      }
      state.selectedIds = new Set(clones.map(c => c.id));
      return clones;
    }

    function cloneSelectedForAltDrag() {
      const selected = state.elements.filter(el => state.selectedIds.has(el.id));
      cloneElementsWithBindings(selected, 0, 0);
    }

    function pointerDownWorld(wx, wy, opts = {}) {
      if (state.editingId) commitInlineEditor();
      closeAllDropdowns();

      const shiftKey = Boolean(opts.shiftKey);
      const altKey = Boolean(opts.altKey);
      const tool = state.activeTool;

      if (tool === 'hand' || state.isSpacePanning) {
        state.drag = {
          mode: 'pan',
          startScreenX: opts.screenX ?? wx * state.zoom,
          startScreenY: opts.screenY ?? wy * state.zoom,
          origScrollX: state.scrollX,
          origScrollY: state.scrollY
        };
        updateInteractiveCursor();
        return;
      }

      if (tool === 'laser') {
        state.laserPoints.push({ x: wx, y: wy, t: performance.now() });
        state.drag = { mode: 'laser' };
        return;
      }

      if (tool === 'eraser') {
        pushHistory();
        const hit = hitTestElement(wx, wy);
        if (hit) deleteElementById(hit.id);
        state.drag = { mode: 'eraser' };
        return;
      }

      if (tool === 'freedraw') {
        pushHistory();
        const el = createElement('freedraw', {
          x: wx,
          y: wy,
          width: 1,
          height: 1,
          points: [[0, 0]]
        });
        state.elements.push(el);
        state.selectedIds.clear();
        state.selectedIds.add(el.id);
        state.drag = { mode: 'freedraw', element: el };
        return;
      }

      if (tool === 'text' || tool === 'sticky') {
        pushHistory();
        const w = tool === 'sticky' ? 156 : 120;
        const h = tool === 'sticky' ? 112 : 38;
        const el = createElement(tool, {
          x: wx - w / 2,
          y: wy - h / 2,
          width: w,
          height: h,
          text: tool === 'sticky' ? 'Sticky Note' : 'Label'
        });
        state.elements.push(el);
        state.selectedIds.clear();
        state.selectedIds.add(el.id);
        if (!state.toolLocked) setTool('select');
        syncUIWithSelection();
        startInlineEditing(el);
        return;
      }

      if (tool === 'rectangle' || tool === 'ellipse' || tool === 'diamond') {
        pushHistory();
        const el = createElement(tool, {
          x: wx,
          y: wy,
          width: 4,
          height: 4,
          text: ''
        });
        state.elements.push(el);
        state.selectedIds.clear();
        state.selectedIds.add(el.id);
        state.drag = { mode: 'draw-shape', element: el, startX: wx, startY: wy };
        return;
      }

      if (tool === 'arrow') {
        pushHistory();
        const startShape = findMagneticShape(wx, wy, null);
        const startBinding = startShape ? computeBindingForShape(startShape, { x: wx, y: wy }) : null;
        const startPt = startShape
          ? getBindingBoundaryPoint(startShape, startBinding, { x: wx, y: wy }, 4)
          : { x: wx, y: wy };

        const arrow = createElement('arrow', {
          x: startPt.x,
          y: startPt.y,
          x2: wx,
          y2: wy,
          startBinding,
          endBinding: null
        });
        state.elements.push(arrow);
        state.selectedIds.clear();
        state.selectedIds.add(arrow.id);
        state.drag = { mode: 'arrow-handle', arrow, handle: 'end', isNewArrow: true };
        return;
      }

      // SELECT MODE
      // 0. Check 8-Way Resize Handles on selected node
      const resizeHit = hitTestResizeHandles(wx, wy);
      if (resizeHit) {
        const el = state.elements.find(e => e.id === resizeHit.elementId);
        if (el) {
          pushHistory();
          state.drag = {
            mode: 'resize',
            element: el,
            dir: resizeHit.dir,
            cursor: resizeHit.cursor,
            startX: wx,
            startY: wy,
            origX: el.x,
            origY: el.y,
            origW: el.width,
            origH: el.height
          };
          updateInteractiveCursor();
          return;
        }
      }

      // 1. Check Quick-Connect '+' Ports
      const portHit = hitTestQuickPorts(wx, wy);
      if (portHit) {
        const sourceEl = state.elements.find(e => e.id === portHit.elementId);
        if (sourceEl) {
          state.drag = {
            mode: 'port-wire',
            sourceEl,
            dir: portHit.dir,
            startPt: { x: portHit.x, y: portHit.y },
            currPt: { x: wx, y: wy },
            moved: false
          };
          return;
        }
      }

      // 2. Check 1-Click Arrow Endpoint / Curve Handle Grabbing (18px / zoom radius across ALL arrows)
      const handleHit = hitTestArrowHandle(wx, wy);
      if (handleHit) {
        pushHistory();
        const arrow = state.elements.find(e => e.id === handleHit.elementId);
        if (arrow) {
          state.selectedIds.clear();
          state.selectedIds.add(arrow.id);
          syncUIWithSelection();
          state.drag = { mode: 'arrow-handle', arrow, handle: handleHit.handle };
          updateInteractiveCursor();
          return;
        }
      }

      // 3. Hit-test scene elements
      const hitEl = hitTestElement(wx, wy);
      if (hitEl) {
        pushHistory();

        if (hitEl.type === 'arrow' && !altKey) {
          const geom = getArrowGeometry(hitEl);
          const endGrabRadius = 32 / (state.zoom || 1);
          const nearStart = Math.hypot(wx - geom.p0.x, wy - geom.p0.y) <= endGrabRadius;
          const nearEnd = Math.hypot(wx - geom.p1.x, wy - geom.p1.y) <= endGrabRadius;
          const hasStartBind = Boolean(hitEl.startBinding?.elementId);
          const hasEndBind = Boolean(hitEl.endBinding?.elementId);
          const isStraight = (hitEl.curveType || 'curved') === 'straight';

          if (nearStart || nearEnd) {
            state.selectedIds.clear();
            state.selectedIds.add(hitEl.id);
            syncUIWithSelection();
            state.drag = { mode: 'arrow-handle', arrow: hitEl, handle: nearStart ? 'start' : 'end' };
            updateInteractiveCursor();
            return;
          }

          if (hasStartBind && !hasEndBind) {
            state.selectedIds.clear();
            state.selectedIds.add(hitEl.id);
            syncUIWithSelection();
            state.drag = { mode: 'arrow-handle', arrow: hitEl, handle: 'end' };
            updateInteractiveCursor();
            return;
          }

          if (!hasStartBind && hasEndBind) {
            state.selectedIds.clear();
            state.selectedIds.add(hitEl.id);
            syncUIWithSelection();
            state.drag = { mode: 'arrow-handle', arrow: hitEl, handle: 'start' };
            updateInteractiveCursor();
            return;
          }

          if (hasStartBind && hasEndBind) {
            state.selectedIds.clear();
            state.selectedIds.add(hitEl.id);
            syncUIWithSelection();
            if (!isStraight) {
              state.drag = { mode: 'arrow-handle', arrow: hitEl, handle: 'curve' };
            }
            updateInteractiveCursor();
            return;
          }
        }

        if (shiftKey) {
          if (state.selectedIds.has(hitEl.id)) state.selectedIds.delete(hitEl.id);
          else state.selectedIds.add(hitEl.id);
        } else if (!state.selectedIds.has(hitEl.id)) {
          state.selectedIds.clear();
          state.selectedIds.add(hitEl.id);
        }

        if (altKey) {
          cloneSelectedForAltDrag();
        }

        const initialPositions = new Map();
        for (const id of state.selectedIds) {
          const item = state.elements.find(e => e.id === id);
          if (item) {
            initialPositions.set(id, {
              x: item.x,
              y: item.y,
              x2: item.x2,
              y2: item.y2
            });
          }
        }
        syncUIWithSelection();
        state.drag = {
          mode: 'move',
          startX: wx,
          startY: wy,
          initialPositions
        };
        updateInteractiveCursor();
        return;
      }

      // 4. Empty Canvas -> Marquee Selection
      state.selectedIds.clear();
      syncUIWithSelection();
      state.drag = {
        mode: 'marquee',
        startX: wx,
        startY: wy,
        currX: wx,
        currY: wy
      };
    }

    function pointerMoveWorld(wx, wy, opts = {}) {
      if (!state.drag) {
        state.hoveredResizeHandle = hitTestResizeHandles(wx, wy);
        state.hoveredPort = state.hoveredResizeHandle ? null : hitTestQuickPorts(wx, wy);
        state.hoveredArrowHandle = (state.hoveredResizeHandle || state.hoveredPort) ? null : hitTestArrowHandle(wx, wy);
        const elHit = hitTestElement(wx, wy);
        state.hoveredId = elHit ? elHit.id : null;
        updateInteractiveCursor();
        return;
      }

      const d = state.drag;
      if (d.mode === 'pan') {
        const sx = opts.screenX ?? wx * state.zoom;
        const sy = opts.screenY ?? wy * state.zoom;
        state.scrollX = d.origScrollX + (sx - d.startScreenX) / state.zoom;
        state.scrollY = d.origScrollY + (sy - d.startScreenY) / state.zoom;
        updateQuickHudPosition();
        return;
      }

      if (d.mode === 'resize') {
        const el = d.element;
        const dx = wx - d.startX;
        const dy = wy - d.startY;
        const minW = 64;
        const minH = 42;
        let nx = d.origX;
        let ny = d.origY;
        let nw = d.origW;
        let nh = d.origH;

        if (d.dir.includes('e')) nw = Math.max(minW, d.origW + dx);
        if (d.dir.includes('s')) nh = Math.max(minH, d.origH + dy);
        if (d.dir.includes('w')) {
          const possibleW = d.origW - dx;
          if (possibleW >= minW) {
            nw = possibleW;
            nx = d.origX + dx;
          }
        }
        if (d.dir.includes('n')) {
          const possibleH = d.origH - dy;
          if (possibleH >= minH) {
            nh = possibleH;
            ny = d.origY + dy;
          }
        }
        el.x = nx;
        el.y = ny;
        el.width = nw;
        el.height = nh;
        ShapeCache.invalidate(el);
        updateQuickHudPosition();
        return;
      }

      if (d.mode === 'laser') {
        state.laserPoints.push({ x: wx, y: wy, t: performance.now() });
        return;
      }

      if (d.mode === 'eraser') {
        const hit = hitTestElement(wx, wy);
        if (hit) deleteElementById(hit.id);
        return;
      }

      if (d.mode === 'freedraw') {
        const el = d.element;
        el.points.push([wx - el.x, wy - el.y]);
        return;
      }

      if (d.mode === 'draw-shape') {
        const el = d.element;
        el.x = Math.min(d.startX, wx);
        el.y = Math.min(d.startY, wy);
        el.width = Math.max(24, Math.abs(wx - d.startX));
        el.height = Math.max(24, Math.abs(wy - d.startY));
        ShapeCache.invalidate(el);
        return;
      }

      if (d.mode === 'arrow-handle') {
        const arrow = d.arrow;
        if (d.handle === 'start' || d.handle === 'end') {
          const isStart = d.handle === 'start';
          const otherBinding = isStart ? arrow.endBinding : arrow.startBinding;
          const fallbackPt = isStart
            ? { x: arrow.x2 || wx, y: arrow.y2 || wy }
            : { x: arrow.x || wx, y: arrow.y || wy };
          const targetShape = findMagneticShape(wx, wy, otherBinding?.elementId || null);

          let binding = null;
          let endPt = { x: wx, y: wy };
          if (targetShape) {
            binding = computeBindingForShape(targetShape, endPt);
            endPt = getBindingBoundaryPoint(targetShape, binding, fallbackPt, 4);
            state.snapPreview = { shapeId: targetShape.id, point: endPt, angle: binding.focusAngle };
          } else {
            state.snapPreview = null;
          }

          if (otherBinding?.elementId) {
            const otherShape = state.elements.find(e => e.id === otherBinding.elementId);
            if (otherShape) {
              const ocx = otherShape.x + otherShape.width / 2;
              const ocy = otherShape.y + otherShape.height / 2;
              const angleToTarget = Math.atan2(endPt.y - ocy, endPt.x - ocx);
              if (d.isNewArrow && !isStart) {
                otherBinding.focusAngle = angleToTarget;
              } else if (!otherBinding.side && typeof otherBinding.focusAngle === 'number') {
                const diff = Math.abs(Math.atan2(
                  Math.sin(angleToTarget - otherBinding.focusAngle),
                  Math.cos(angleToTarget - otherBinding.focusAngle)
                ));
                if (diff > Math.PI * 0.52) {
                  otherBinding.focusAngle = angleToTarget;
                }
              }
            }
          }

          if (isStart) {
            arrow.startBinding = binding;
            arrow.x = endPt.x;
            arrow.y = endPt.y;
          } else {
            arrow.endBinding = binding;
            arrow.x2 = endPt.x;
            arrow.y2 = endPt.y;
          }
        } else if (d.handle === 'curve') {
          const geom = getArrowGeometry(arrow);
          const { p0, p1 } = geom;
          const mx = (p0.x + p1.x) / 2;
          const my = (p0.y + p1.y) / 2;
          if ((arrow.curveType || 'curved') === 'elbow') {
            const baseMid = geom.elbowBaseMid || { x: mx, y: my };
            arrow.curveOffset = geom.elbowAxis === 'y' ? (wy - baseMid.y) * 2 : (wx - baseMid.x) * 2;
          } else if (arrow.curveType === 'straight') {
            arrow.curveOffset = 0;
          } else {
            const chordDx = p1.x - p0.x;
            const chordDy = p1.y - p0.y;
            const chordLen = Math.hypot(chordDx, chordDy) || 1;
            const nx = -chordDy / chordLen;
            const ny = chordDx / chordLen;
            const proj = (wx - mx) * nx + (wy - my) * ny;
            arrow.curveOffset = proj * 2;
          }
        }
        updateQuickHudPosition();
        return;
      }

      if (d.mode === 'port-wire') {
        d.currPt = { x: wx, y: wy };
        if (Math.hypot(wx - d.startPt.x, wy - d.startPt.y) > 8 / (state.zoom || 1)) {
          d.moved = true;
        }
        const targetShape = findMagneticShape(wx, wy, d.sourceEl.id);
        if (targetShape) {
          const binding = computeBindingForShape(targetShape, { x: wx, y: wy });
          const bPt = getBindingBoundaryPoint(targetShape, binding, d.startPt, 4);
          state.snapPreview = { shapeId: targetShape.id, point: bPt, angle: binding.focusAngle };
        } else {
          state.snapPreview = null;
        }
        return;
      }

      if (d.mode === 'move') {
        const dx = wx - d.startX;
        const dy = wy - d.startY;
        let singleNode = null;

        for (const [id, initPos] of d.initialPositions.entries()) {
          const el = state.elements.find(e => e.id === id);
          if (!el) continue;
          el.x = initPos.x + dx;
          el.y = initPos.y + dy;
          if (el.type === 'arrow') {
            if (!el.startBinding?.elementId && typeof initPos.x === 'number') el.x = initPos.x + dx;
            if (!el.endBinding?.elementId && typeof initPos.x2 === 'number') {
              el.x2 = initPos.x2 + dx;
              el.y2 = initPos.y2 + dy;
            }
          } else {
            ShapeCache.invalidate(el);
            if (d.initialPositions.size === 1 && isNodeElement(el)) {
              singleNode = el;
            }
          }
        }

        // Re-orient unpinned bindings when connected nodes cross past each other
        for (const el of state.elements) {
          if (el.type !== 'arrow') continue;
          const sId = el.startBinding?.elementId;
          const eId = el.endBinding?.elementId;
          if (!sId && !eId) continue;
          if (!d.initialPositions.has(sId) && !d.initialPositions.has(eId)) continue;

          const sShape = sId ? state.elements.find(n => n.id === sId) : null;
          const eShape = eId ? state.elements.find(n => n.id === eId) : null;
          const sCenter = sShape
            ? { x: sShape.x + sShape.width / 2, y: sShape.y + sShape.height / 2 }
            : { x: el.x, y: el.y };
          const eCenter = eShape
            ? { x: eShape.x + eShape.width / 2, y: eShape.y + eShape.height / 2 }
            : { x: el.x2 ?? el.x, y: el.y2 ?? el.y };

          if (sShape && !el.startBinding.side && typeof el.startBinding.focusAngle === 'number') {
            const ang = Math.atan2(eCenter.y - sCenter.y, eCenter.x - sCenter.x);
            const diff = Math.abs(Math.atan2(Math.sin(ang - el.startBinding.focusAngle), Math.cos(ang - el.startBinding.focusAngle)));
            if (diff > Math.PI * 0.52) el.startBinding.focusAngle = ang;
          }
          if (eShape && !el.endBinding.side && typeof el.endBinding.focusAngle === 'number') {
            const ang = Math.atan2(sCenter.y - eCenter.y, sCenter.x - eCenter.x);
            const diff = Math.abs(Math.atan2(Math.sin(ang - el.endBinding.focusAngle), Math.cos(ang - el.endBinding.focusAngle)));
            if (diff > Math.PI * 0.52) el.endBinding.focusAngle = ang;
          }
        }

        if (singleNode) {
          const splitArrow = findSplitTargetArrow(singleNode);
          state.splitTargetArrowId = splitArrow ? splitArrow.id : null;
        } else {
          state.splitTargetArrowId = null;
        }
        updateQuickHudPosition();
        return;
      }

      if (d.mode === 'marquee') {
        d.currX = wx;
        d.currY = wy;
        const x1 = Math.min(d.startX, d.currX);
        const y1 = Math.min(d.startY, d.currY);
        const x2 = Math.max(d.startX, d.currX);
        const y2 = Math.max(d.startY, d.currY);
        state.selectedIds.clear();
        for (const el of state.elements) {
          const ex1 = el.type === 'arrow' ? Math.min(el.x, el.x2 ?? el.x) : el.x;
          const ey1 = el.type === 'arrow' ? Math.min(el.y, el.y2 ?? el.y) : el.y;
          const ex2 = el.type === 'arrow' ? Math.max(el.x, el.x2 ?? el.x) : el.x + (el.width || 0);
          const ey2 = el.type === 'arrow' ? Math.max(el.y, el.y2 ?? el.y) : el.y + (el.height || 0);
          if (ex2 >= x1 && ex1 <= x2 && ey2 >= y1 && ey1 <= y2) {
            state.selectedIds.add(el.id);
          }
        }
        syncUIWithSelection();
      }
    }

    function pointerUpWorld(wx, wy) {
      if (!state.drag) return;
      const d = state.drag;
      state.drag = null;
      state.snapPreview = null;
      updateInteractiveCursor();

      if (d.mode === 'draw-shape') {
        const el = d.element;
        if (el.width < 32 && el.height < 32) {
          el.width = el.type === 'diamond' ? 148 : 144;
          el.height = el.type === 'diamond' ? 86 : 68;
          el.text = el.type === 'diamond' ? 'Decision?' : 'Node';
          ShapeCache.invalidate(el);
        }
        if (!state.toolLocked) setTool('select');
        syncUIWithSelection();
        return;
      }

      if (d.mode === 'arrow-handle') {
        if (!state.toolLocked && state.activeTool === 'arrow') {
          setTool('select');
        }
        discardRedundantUndoSnapshot();
        syncUIWithSelection();
        return;
      }

      if (d.mode === 'port-wire') {
        if (!d.moved) {
          chainNodeFrom(d.sourceEl, d.dir, null, true);
        } else {
          pushHistory();
          const targetShape = findMagneticShape(wx, wy, d.sourceEl.id);
          const sc = { x: d.sourceEl.x + d.sourceEl.width / 2, y: d.sourceEl.y + d.sourceEl.height / 2 };
          const outAng = Math.atan2(wy - sc.y, wx - sc.x);

          if (targetShape) {
            const endBind = computeBindingForShape(targetShape, { x: wx, y: wy });
            const arr = createElement('arrow', {
              x: d.startPt.x,
              y: d.startPt.y,
              x2: wx,
              y2: wy,
              strokeColor: d.sourceEl.strokeColor,
              startBinding: { elementId: d.sourceEl.id, focusAngle: outAng, side: d.dir, gap: 4 },
              endBinding: endBind
            });
            state.elements.push(arr);
            state.selectedIds.clear();
            state.selectedIds.add(arr.id);
          } else {
            const newW = 144;
            const newH = 68;
            const newNode = createElement(d.sourceEl.type === 'text' ? 'rectangle' : d.sourceEl.type, {
              x: wx - newW / 2,
              y: wy - newH / 2,
              width: newW,
              height: newH,
              strokeColor: d.sourceEl.strokeColor,
              text: 'Connected Node'
            });
            const inAng = Math.atan2(sc.y - wy, sc.x - wx);
            const arr = createElement('arrow', {
              x: d.startPt.x,
              y: d.startPt.y,
              x2: wx,
              y2: wy,
              strokeColor: d.sourceEl.strokeColor,
              startBinding: { elementId: d.sourceEl.id, focusAngle: outAng, side: d.dir, gap: 4 },
              endBinding: { elementId: newNode.id, focusAngle: inAng, side: angleToSide(inAng), gap: 4 }
            });
            state.elements.push(newNode, arr);
            state.selectedIds.clear();
            state.selectedIds.add(newNode.id);
            startInlineEditing(newNode);
          }
          syncUIWithSelection();
        }
        return;
      }

      if (d.mode === 'move' || d.mode === 'resize') {
        if (d.mode === 'move' && state.splitTargetArrowId && state.selectedIds.size === 1) {
          const nodeId = Array.from(state.selectedIds)[0];
          const node = state.elements.find(e => e.id === nodeId);
          if (node) trySplitArrowWithNode(node);
        }
        state.splitTargetArrowId = null;
        discardRedundantUndoSnapshot();
        syncUIWithSelection();
      }
    }

    function deleteElementById(id) {
      state.elements = state.elements.filter(el => el.id !== id);
      for (const el of state.elements) {
        if (el.type === 'arrow') {
          if (el.startBinding?.elementId === id) el.startBinding = null;
          if (el.endBinding?.elementId === id) el.endBinding = null;
        }
      }
      state.selectedIds.delete(id);
      ShapeCache.invalidate(id);
      syncUIWithSelection();
    }

    function deleteSelection() {
      if (state.selectedIds.size === 0) return;
      pushHistory();
      const ids = Array.from(state.selectedIds);
      for (const id of ids) deleteElementById(id);
    }

    function duplicateSelection() {
      const selected = state.elements.filter(el => state.selectedIds.has(el.id));
      if (selected.length === 0) return [];
      pushHistory();
      const clones = cloneElementsWithBindings(selected, 28, 28);
      syncUIWithSelection();
      return clones;
    }

    /* -------------------------------------------------------------------------
     * 6. Multi-Pass Occlusion-Free Rendering Engine
     * ------------------------------------------------------------------------- */
    // Exact Excalidraw dash array formulas from packages/element/src/shape.ts
    function applyDashStyle(ctx, strokeStyle, strokeWidth) {
      const sw = Number(strokeWidth) || 2;
      if (strokeStyle === 'dashed') {
        ctx.setLineDash([8, 8 + sw]);
      } else if (strokeStyle === 'dotted') {
        ctx.setLineDash([1.5, 6 + sw]);
      } else {
        ctx.setLineDash([]);
      }
    }

    function drawStaticElement(ctx, el, opts = {}) {
      if (!el || el.type === 'arrow') return;
      const canvasBg = opts.canvasBg || state.canvasBg;
      const strokeColor = resolveStrokeColor(el.strokeColor, canvasBg);
      const fillTint = resolveFillTint(el.strokeColor, canvasBg, el.type === 'sticky');
      const sw = Number(el.strokeWidth) || 2.2;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const auraEnergy = state.nodeArrivalEnergy.get(el.id) || 0;
      if (auraEnergy > 0.02 && isNodeElement(el) && el.type !== 'text') {
        ctx.save();
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 16 * auraEnergy;
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = Math.min(0.45, auraEnergy * 0.45);
        ctx.lineWidth = sw + 2;
        const paths = ShapeCache.get(el);
        ctx.stroke(paths.fillPath);
        ctx.restore();
      }

      if (el.type === 'freedraw') {
        const pts = el.points || [];
        if (pts.length > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = sw;
          applyDashStyle(ctx, el.strokeStyle, sw);
          ctx.beginPath();
          ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            const pPrev = pts[i - 1];
            const pCurr = pts[i];
            const mx = el.x + (pPrev[0] + pCurr[0]) / 2;
            const my = el.y + (pPrev[1] + pCurr[1]) / 2;
            ctx.quadraticCurveTo(el.x + pPrev[0], el.y + pPrev[1], mx, my);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(el.x + last[0], el.y + last[1]);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      if (el.type === 'text') {
        ctx.restore();
        return;
      }

      const paths = ShapeCache.get(el);
      const fillStyle = el.fillStyle || 'hachure';

      if (fillStyle !== 'none') {
        ctx.save();
        ctx.fillStyle = fillTint;
        if (el.type === 'sticky') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.14)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 4;
        }
        ctx.fill(paths.fillPath);
        ctx.restore();
      }

      if (fillStyle === 'hachure' || fillStyle === 'cross-hatch') {
        ctx.save();
        ctx.clip(paths.fillPath);
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = canvasBg === '#000000' ? 0.44 : 0.36;
        // Excalidraw shape.ts: fillWeight = element.strokeWidth / 2
        ctx.lineWidth = Math.max(1.0, sw * 0.5);
        ctx.setLineDash([]);
        ctx.stroke(paths.hachurePath);
        ctx.restore();
      }

      ctx.strokeStyle = strokeColor;
      // Excalidraw shape.ts: for non-solid strokes, increase width by +0.5
      ctx.lineWidth = (el.strokeStyle && el.strokeStyle !== 'solid') ? sw + 0.5 : sw;
      applyDashStyle(ctx, el.strokeStyle, sw);
      ctx.stroke(paths.strokePath);

      ctx.restore();
    }

    function drawArrowAndParticles(ctx, el, geom, depth, timeSec, opts = {}) {
      const canvasBg = opts.canvasBg || state.canvasBg;
      const isSplitTarget = state.splitTargetArrowId === el.id;
      const strokeColor = isSplitTarget ? '#10b981' : resolveStrokeColor(el.strokeColor, canvasBg);
      const baseSw = Number(el.strokeWidth) || 2.2;
      const sw = isSplitTarget ? Math.max(3.2, baseSw + 1.2) : baseSw;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = (el.strokeStyle && el.strokeStyle !== 'solid') ? sw + 0.5 : sw;
      applyDashStyle(ctx, el.strokeStyle, sw);

      if (isSplitTarget) {
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 12;
      }

      const curveType = el.curveType || 'curved';
      const roughness = Number(el.roughness ?? 0.85);
      const isCartoon = roughness > 1.2;
      const samples = geom.samples;

      const strokeShaftPass = (offsetX, offsetY, cpBowOffset) => {
        ctx.beginPath();
        if (curveType === 'elbow' && geom.waypoints && geom.waypoints.length >= 2) {
          const pts = geom.waypoints;
          ctx.moveTo(pts[0].x + offsetX * 0.3, pts[0].y + offsetY * 0.3);
          for (let i = 1; i < pts.length - 1; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const next = pts[i + 1];
            const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
            const cornerR = Math.min(8, d1 * 0.35, d2 * 0.35);
            const cx = curr.x + offsetX;
            const cy = curr.y + offsetY;
            if (cornerR > 1.5 && typeof ctx.arcTo === 'function') {
              ctx.arcTo(cx, cy, next.x + offsetX, next.y + offsetY, cornerR);
            } else {
              ctx.lineTo(cx, cy);
            }
          }
          const lastPt = pts[pts.length - 1];
          ctx.lineTo(lastPt.x, lastPt.y);
        } else if (curveType === 'straight' || Math.abs(Number(el.curveOffset) || 0) < 0.5) {
          if (Math.abs(cpBowOffset) < 0.05) {
            ctx.moveTo(geom.p0.x, geom.p0.y);
            ctx.lineTo(geom.p1.x, geom.p1.y);
          } else {
            const dx = geom.p1.x - geom.p0.x;
            const dy = geom.p1.y - geom.p0.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const midX = (geom.p0.x + geom.p1.x) / 2 + nx * cpBowOffset;
            const midY = (geom.p0.y + geom.p1.y) / 2 + ny * cpBowOffset;
            ctx.moveTo(geom.p0.x + offsetX * 0.3, geom.p0.y + offsetY * 0.3);
            ctx.quadraticCurveTo(midX, midY, geom.p1.x, geom.p1.y);
          }
        } else {
          const dx = geom.p1.x - geom.p0.x;
          const dy = geom.p1.y - geom.p0.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          ctx.moveTo(geom.p0.x + offsetX * 0.3, geom.p0.y + offsetY * 0.3);
          ctx.quadraticCurveTo(
            geom.cp.x + nx * cpBowOffset + offsetX,
            geom.cp.y + ny * cpBowOffset + offsetY,
            geom.p1.x,
            geom.p1.y
          );
        }
        ctx.stroke();
      };

      strokeShaftPass(0, 0, 0);

      if (roughness > 0.01 && (!el.strokeStyle || el.strokeStyle === 'solid')) {
        const rng = mulberry32((Number(el.seed) || 1) + 77);
        const extraPasses = isCartoon ? 2 : 1;
        ctx.save();
        ctx.lineWidth = Math.max(1.2, sw * (isCartoon ? 0.9 : 0.8));
        ctx.globalAlpha = isCartoon ? 0.88 : 0.72;
        for (let p = 0; p < extraPasses; p++) {
          const sign = p === 0 ? 1 : -1;
          const off = (isCartoon ? 3.2 : 1.4) * sign;
          const bow = (isCartoon ? 6.5 : 2.6) * sign * (0.7 + rng() * 0.5);
          strokeShaftPass(off * (rng() - 0.2), -off * (rng() - 0.2), bow);
        }
        ctx.restore();
      }

      // Excalidraw solid arrowhead cap (~25 degree spread)
      ctx.setLineDash([]);
      const endSample = samples[samples.length - 1] || { tx: 1, ty: 0 };
      const tipAngle = typeof geom.tipAngle === 'number'
        ? geom.tipAngle
        : Math.atan2(endSample.ty, endSample.tx);
      const headLen = Math.max(11, sw * 4.6);
      const spread = 0.44;
      ctx.beginPath();
      ctx.moveTo(
        geom.p1.x - headLen * Math.cos(tipAngle - spread),
        geom.p1.y - headLen * Math.sin(tipAngle - spread)
      );
      ctx.lineTo(geom.p1.x, geom.p1.y);
      ctx.lineTo(
        geom.p1.x - headLen * Math.cos(tipAngle + spread),
        geom.p1.y - headLen * Math.sin(tipAngle + spread)
      );
      ctx.stroke();

      if (isCartoon) {
        ctx.save();
        ctx.lineWidth = Math.max(1.2, sw * 0.85);
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        ctx.moveTo(
          geom.p1.x - (headLen + 2.5) * Math.cos(tipAngle - spread - 0.08),
          geom.p1.y - (headLen + 2.5) * Math.sin(tipAngle - spread - 0.08)
        );
        ctx.lineTo(geom.p1.x + 1.5, geom.p1.y - 1.5);
        ctx.lineTo(
          geom.p1.x - (headLen + 2.5) * Math.cos(tipAngle + spread + 0.08),
          geom.p1.y - (headLen + 2.5) * Math.sin(tipAngle + spread + 0.08)
        );
        ctx.stroke();
        ctx.restore();
      }

      const arrowFlowActive = state.flowEnabled && (el.flowEnabled !== false);
      if (arrowFlowActive && geom.totalLen > 24) {
        const packetCount = Math.max(1, Math.min(4, Math.round(geom.totalLen / 150)));
        const speed = (Number(state.flowSpeed) || 1.0) * 0.55;
        const hopOffset = -(Number(depth) || 0) * 0.38;
        const mode = state.flowMode || 'comets';

        for (let k = 0; k < packetCount; k++) {
          let phase = (timeSec * speed + hopOffset + k / packetCount) % 1;
          if (phase < 0) phase += 1;

          if (phase > 0.82 && el.endBinding?.elementId) {
            const boost = (phase - 0.82) / 0.18;
            const prev = state.nodeArrivalEnergy.get(el.endBinding.elementId) || 0;
            state.nodeArrivalEnergy.set(el.endBinding.elementId, Math.max(prev, Math.sin(boost * Math.PI)));
          }

          const dist = phase * geom.totalLen;
          drawFlowParticleAt(ctx, geom, dist, phase, strokeColor, sw, mode, canvasBg);
        }
      }

      for (let i = state.activePulses.length - 1; i >= 0; i--) {
        const pulse = state.activePulses[i];
        if (pulse.arrowId !== el.id) continue;
        if (pulse.progress >= 0 && pulse.progress <= 1) {
          const dist = pulse.progress * geom.totalLen;
          drawFlowParticleAt(ctx, geom, dist, pulse.progress, strokeColor, sw * 1.45, 'neon', canvasBg, true);
          if (pulse.progress > 0.8 && el.endBinding?.elementId) {
            state.nodeArrivalEnergy.set(el.endBinding.elementId, 1.0);
          }
        }
      }

      ctx.restore();
    }

    function drawFlowParticleAt(ctx, geom, dist, phase, color, sw, mode, canvasBg, isBurst = false) {
      const pt = pointAtArcLength(geom, dist);
      const isDark = canvasBg === '#000000';
      const coreColor = isDark || isBurst ? '#ffffff' : color;

      ctx.save();
      if (mode === 'comets') {
        const tailLen = Math.min(34, geom.totalLen * 0.22);
        const segs = 7;
        for (let s = 0; s < segs; s++) {
          const d0 = Math.max(0, dist - (s / segs) * tailLen);
          const d1 = Math.max(0, dist - ((s + 1) / segs) * tailLen);
          if (d0 <= d1) continue;
          const pA = pointAtArcLength(geom, d0);
          const pB = pointAtArcLength(geom, d1);
          const frac = 1 - s / segs;
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.globalAlpha = frac * (isDark ? 0.92 : 0.82);
          ctx.lineWidth = Math.max(1.2, sw * 2.1 * frac);
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.shadowColor = color;
        ctx.shadowBlur = isDark ? 14 : 8;
        ctx.fillStyle = coreColor;
        ctx.arc(pt.x, pt.y, Math.max(2.8, sw * 1.35), 0, Math.PI * 2);
        ctx.fill();
      } else if (mode === 'pulses') {
        const ringExpand = (phase * 4) % 1;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = (1 - ringExpand) * 0.75;
        ctx.lineWidth = 1.8;
        ctx.arc(pt.x, pt.y, 3 + ringExpand * 11, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(pt.x, pt.y, Math.max(3, sw * 1.3), 0, Math.PI * 2);
        ctx.fill();
      } else if (mode === 'neon') {
        const tailLen = Math.min(28, geom.totalLen * 0.18);
        const pTail = pointAtArcLength(geom, Math.max(0, dist - tailLen));
        ctx.beginPath();
        ctx.shadowColor = color;
        ctx.shadowBlur = isDark ? 18 : 12;
        ctx.strokeStyle = color;
        ctx.lineWidth = sw * 2.6;
        ctx.globalAlpha = 0.85;
        ctx.moveTo(pTail.x, pTail.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.4, sw * 0.95);
        ctx.globalAlpha = 0.95;
        ctx.moveTo(pTail.x, pTail.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      } else if (mode === 'dashed') {
        const segLen = 10;
        const pBack = pointAtArcLength(geom, Math.max(0, dist - segLen));
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = sw * 1.9;
        ctx.moveTo(pBack.x, pBack.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawElementText(ctx, el, opts = {}) {
      // Never render text on arrows
      if (!el || el.type === 'arrow' || !el.text || String(el.text).trim().length === 0) return;
      if (state.editingId === el.id && !opts.forExport) return;

      const canvasBg = opts.canvasBg || state.canvasBg;
      const strokeColor = resolveStrokeColor(el.strokeColor, canvasBg);
      const fontSize = Number(el.fontSize) || 16;
      const lineHeight = Math.round(fontSize * EXCALIDRAW_LINE_HEIGHT);
      const lines = String(el.text).split('\n');

      ctx.save();
      ctx.font = getFontCss(el.fontFamily, fontSize);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const centerX = el.x + (el.width || 0) / 2;
      const centerY = el.y + (el.height || 0) / 2;
      const totalTextH = lines.length * lineHeight;
      const startY = centerY - totalTextH / 2 + lineHeight / 2;

      ctx.fillStyle = strokeColor;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], centerX, startY + i * lineHeight);
      }

      ctx.restore();
    }

    function renderScenePasses(ctx, timeSec = 0, opts = {}) {
      const elements = opts.elements || state.elements;
      const elementsMap = getElementMap(elements);
      const { arrowDepths } = computeGraphDepths(elements);

      for (const [nodeId, val] of state.nodeArrivalEnergy.entries()) {
        const nextVal = val * 0.91;
        if (nextVal < 0.01) state.nodeArrivalEnergy.delete(nodeId);
        else state.nodeArrivalEnergy.set(nodeId, nextVal);
      }

      const arrowGeoms = new Map();
      for (const el of elements) {
        if (el.type === 'arrow') {
          arrowGeoms.set(el.id, getArrowGeometry(el, elementsMap));
        }
      }

      for (const el of elements) {
        if (el.type !== 'arrow') {
          drawStaticElement(ctx, el, opts);
        }
      }

      for (const el of elements) {
        if (el.type === 'arrow') {
          const geom = arrowGeoms.get(el.id);
          const depth = arrowDepths.get(el.id) || 0;
          drawArrowAndParticles(ctx, el, geom, depth, timeSec, opts);
        }
      }

      for (const el of elements) {
        if (el.type !== 'arrow') {
          drawElementText(ctx, el, opts);
        }
      }

      return arrowGeoms;
    }

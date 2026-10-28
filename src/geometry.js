    /* -------------------------------------------------------------------------
     * 4. Perimeter Sliding (focusAngle) & Arrow Geometry Engine
     * ------------------------------------------------------------------------- */
    function isNodeElement(el) {
      return el && (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond' || el.type === 'sticky' || el.type === 'text');
    }

    function angleToSide(angle) {
      if (typeof angle !== 'number' || Number.isNaN(angle)) return 'right';
      const deg = (angle * 180) / Math.PI;
      if (deg >= -45 && deg <= 45) return 'right';
      if (deg > 45 && deg < 135) return 'bottom';
      if (deg >= -135 && deg < -45) return 'top';
      return 'left';
    }

    function computeBindingForShape(shape, worldPt) {
      if (!shape || !worldPt) return null;
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const dx = worldPt.x - cx;
      const dy = worldPt.y - cy;
      const rx = Math.max(1, shape.width / 2);
      const ry = Math.max(1, shape.height / 2);
      const normDist = Math.hypot(dx / rx, dy / ry);

      let focusAngle = null;
      if (normDist >= 0.35 || (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001)) {
        focusAngle = Math.atan2(dy, dx);
      }
      const coreCenter = normDist < 0.35;
      return {
        elementId: shape.id,
        focusAngle,
        coreCenter,
        side: angleToSide(focusAngle ?? 0),
        gap: 4
      };
    }

    function getBindingBoundaryPoint(shape, binding, fallbackRefPt, gap = 4) {
      if (!shape) return fallbackRefPt || { x: 0, y: 0 };
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;

      let theta = 0;
      if (binding && typeof binding.focusAngle === 'number' && !Number.isNaN(binding.focusAngle) && !binding.coreCenter) {
        theta = binding.focusAngle;
      } else if (fallbackRefPt && (Math.abs(fallbackRefPt.x - cx) > 0.01 || Math.abs(fallbackRefPt.y - cy) > 0.01)) {
        theta = Math.atan2(fallbackRefPt.y - cy, fallbackRefPt.x - cx);
      } else if (binding && typeof binding.focusAngle === 'number') {
        theta = binding.focusAngle;
      }

      const ux = Math.cos(theta);
      const uy = Math.sin(theta);
      const g = (binding && typeof binding.gap === 'number') ? binding.gap : (Number(gap) || 0);
      const hw = Math.max(1, shape.width / 2 + g);
      const hh = Math.max(1, shape.height / 2 + g);

      if (shape.type === 'ellipse') {
        const denom = Math.hypot(ux / hw, uy / hh) || 1;
        const t = 1 / denom;
        return { x: cx + t * ux, y: cy + t * uy, angle: theta };
      }

      if (shape.type === 'diamond') {
        const denom = (Math.abs(ux) / hw + Math.abs(uy) / hh) || 1;
        const t = 1 / denom;
        return { x: cx + t * ux, y: cy + t * uy, angle: theta };
      }

      const tx = Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity;
      const ty = Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity;
      const t = Math.min(tx, ty);
      return { x: cx + t * ux, y: cy + t * uy, angle: theta };
    }

    function distanceToShapeBoundary(shape, wx, wy) {
      if (!shape) return Infinity;
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const hw = Math.max(1, shape.width / 2);
      const hh = Math.max(1, shape.height / 2);
      const dx = wx - cx;
      const dy = wy - cy;

      if (shape.type === 'ellipse') {
        const norm = Math.hypot(dx / hw, dy / hh);
        if (norm <= 1) return 0;
        const theta = Math.atan2(dy, dx);
        const bx = cx + Math.cos(theta) * hw;
        const by = cy + Math.sin(theta) * hh;
        return Math.hypot(wx - bx, wy - by);
      }

      if (shape.type === 'diamond') {
        const l1 = Math.abs(dx) / hw + Math.abs(dy) / hh;
        if (l1 <= 1) return 0;
        const pt = getBindingBoundaryPoint(shape, { focusAngle: Math.atan2(dy, dx), gap: 0 }, null, 0);
        return Math.hypot(wx - pt.x, wy - pt.y);
      }

      const clampedX = Math.max(shape.x, Math.min(shape.x + shape.width, wx));
      const clampedY = Math.max(shape.y, Math.min(shape.y + shape.height, wy));
      return Math.hypot(wx - clampedX, wy - clampedY);
    }

    function findMagneticShape(wx, wy, excludeId = null) {
      const snapRadius = 42 / (state.zoom || 1);
      let bestShape = null;
      let bestScore = Infinity;

      for (let i = state.elements.length - 1; i >= 0; i--) {
        const el = state.elements[i];
        if (!isNodeElement(el) || el.id === excludeId) continue;
        const d = distanceToShapeBoundary(el, wx, wy);
        if (d <= snapRadius && d < bestScore) {
          bestScore = d;
          bestShape = el;
        }
      }
      return bestShape;
    }

    function getElementMap(elements = state.elements) {
      const map = new Map();
      for (const el of elements) map.set(el.id, el);
      return map;
    }

    function getArrowGeometry(el, elementsMap = null) {
      const map = elementsMap || getElementMap();
      const startShape = el.startBinding?.elementId ? map.get(el.startBinding.elementId) : null;
      const endShape = el.endBinding?.elementId ? map.get(el.endBinding.elementId) : null;

      let rawP0 = { x: Number(el.x) || 0, y: Number(el.y) || 0 };
      let rawP1 = {
        x: typeof el.x2 === 'number' ? el.x2 : (rawP0.x + (Number(el.width) || 120)),
        y: typeof el.y2 === 'number' ? el.y2 : (rawP0.y + (Number(el.height) || 0))
      };

      const startCenter = startShape
        ? { x: startShape.x + startShape.width / 2, y: startShape.y + startShape.height / 2 }
        : rawP0;
      const endCenter = endShape
        ? { x: endShape.x + endShape.width / 2, y: endShape.y + endShape.height / 2 }
        : rawP1;

      if (startShape && el.startBinding && typeof el.startBinding.focusAngle === 'number') {
        const natAng = Math.atan2(endCenter.y - startCenter.y, endCenter.x - startCenter.x);
        const diff = Math.abs(Math.atan2(Math.sin(natAng - el.startBinding.focusAngle), Math.cos(natAng - el.startBinding.focusAngle)));
        if (diff > Math.PI * 0.55) {
          el.startBinding.focusAngle = natAng;
          el.startBinding.side = angleToSide(natAng);
        }
      }
      if (endShape && el.endBinding && typeof el.endBinding.focusAngle === 'number') {
        const natAng = Math.atan2(startCenter.y - endCenter.y, startCenter.x - endCenter.x);
        const diff = Math.abs(Math.atan2(Math.sin(natAng - el.endBinding.focusAngle), Math.cos(natAng - el.endBinding.focusAngle)));
        if (diff > Math.PI * 0.55) {
          el.endBinding.focusAngle = natAng;
          el.endBinding.side = angleToSide(natAng);
        }
      }

      let p0 = startShape
        ? getBindingBoundaryPoint(startShape, el.startBinding, endShape ? endCenter : rawP1, 4)
        : rawP0;
      let p1 = endShape
        ? getBindingBoundaryPoint(endShape, el.endBinding, startShape ? startCenter : p0, 4)
        : rawP1;

      const curveType = el.curveType || 'curved';
      const curveOffset = curveType === 'straight' ? 0 : (Number(el.curveOffset) || 0);

      const N = 40;
      const samples = [];
      const cumLenArr = [0];
      let totalLen = 0;
      let waypoints = [p0, p1];
      let elbowAxis = 'x';

      if (curveType === 'elbow') {
        const dx = endCenter.x - startCenter.x;
        const dy = endCenter.y - startCenter.y;
        const shw = startShape ? startShape.width / 2 + 4 : 0;
        const shh = startShape ? startShape.height / 2 + 4 : 0;
        const ehw = endShape ? endShape.width / 2 + 4 : 0;
        const ehh = endShape ? endShape.height / 2 + 4 : 0;

        const normDx = Math.abs(dx) / Math.max(40, shw + ehw);
        const normDy = Math.abs(dy) / Math.max(40, shh + ehh);
        const verticalFirst = normDy > normDx * 1.15;

        const p0H = startShape
          ? getBindingBoundaryPoint(startShape, { focusAngle: dx >= 0 ? 0 : Math.PI, gap: 4 }, endCenter, 4)
          : rawP0;
        const p0V = startShape
          ? getBindingBoundaryPoint(startShape, { focusAngle: dy >= 0 ? Math.PI / 2 : -Math.PI / 2, gap: 4 }, endCenter, 4)
          : rawP0;
        var elbowBaseMid = { x: (p0H.x + p1.x) / 2, y: (p0V.y + p1.y) / 2 };

        let rawWaypoints;
        let handlePt;
        if (verticalFirst) {
          elbowAxis = 'y';
          p0 = p0V;
          const midY0 = (p0.y + p1.y) / 2;
          const rawElbowY = midY0 + curveOffset * 0.5;
          const goesIntoStart = startShape && (dy >= 0 ? rawElbowY < p0.y + 8 : rawElbowY > p0.y - 8);

          if (goesIntoStart && Math.abs(p1.x - p0H.x) > 12) {
            p0 = p0H;
            rawWaypoints = [
              { x: p0.x, y: p0.y },
              { x: p1.x, y: p0.y },
              { x: p1.x, y: p1.y }
            ];
            handlePt = { x: (p0.x + p1.x) / 2, y: p0.y };
          } else if (Math.abs(rawElbowY - p1.y) < 16 && Math.abs(p1.x - p0.x) > 14) {
            rawWaypoints = [
              { x: p0.x, y: p0.y },
              { x: p0.x, y: p1.y },
              { x: p1.x, y: p1.y }
            ];
            handlePt = { x: p0.x, y: p1.y };
          } else {
            let elbowY = rawElbowY;
            if (startShape) {
              elbowY = dy >= 0 ? Math.max(p0.y + 12, elbowY) : Math.min(p0.y - 12, elbowY);
            }
            rawWaypoints = [
              { x: p0.x, y: p0.y },
              { x: p0.x, y: elbowY },
              { x: p1.x, y: elbowY },
              { x: p1.x, y: p1.y }
            ];
            handlePt = { x: (p0.x + p1.x) / 2, y: elbowY };
          }
        } else {
          elbowAxis = 'x';
          p0 = p0H;
          const midX0 = (p0.x + p1.x) / 2;
          const rawElbowX = midX0 + curveOffset * 0.5;
          const goesIntoStart = startShape && (dx >= 0 ? rawElbowX < p0.x + 8 : rawElbowX > p0.x - 8);

          if (goesIntoStart && Math.abs(p1.y - p0V.y) > 12) {
            p0 = p0V;
            rawWaypoints = [
              { x: p0.x, y: p0.y },
              { x: p0.x, y: p1.y },
              { x: p1.x, y: p1.y }
            ];
            handlePt = { x: p0.x, y: (p0.y + p1.y) / 2 };
          } else if (Math.abs(rawElbowX - p1.x) < 16 && Math.abs(p1.y - p0.y) > 14) {
            rawWaypoints = [
              { x: p0.x, y: p0.y },
              { x: p1.x, y: p0.y },
              { x: p1.x, y: p1.y }
            ];
            handlePt = { x: p1.x, y: (p0.y + p1.y) / 2 };
          } else {
            let elbowX = rawElbowX;
            if (startShape) {
              elbowX = dx >= 0 ? Math.max(p0.x + 12, elbowX) : Math.min(p0.x - 12, elbowX);
            }
            rawWaypoints = [
              { x: p0.x, y: p0.y },
              { x: elbowX, y: p0.y },
              { x: elbowX, y: p1.y },
              { x: p1.x, y: p1.y }
            ];
            handlePt = { x: elbowX, y: (p0.y + p1.y) / 2 };
          }
        }

        el.x = p0.x;
        el.y = p0.y;
        el.x2 = p1.x;
        el.y2 = p1.y;
        el.width = p1.x - p0.x;
        el.height = p1.y - p0.y;

        waypoints = [rawWaypoints[0]];
        for (let i = 1; i < rawWaypoints.length; i++) {
          const prev = waypoints[waypoints.length - 1];
          const curr = rawWaypoints[i];
          if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.5) {
            waypoints.push(curr);
          }
        }
        if (waypoints.length < 2) {
          waypoints = [{ x: p0.x, y: p0.y }, { x: p1.x, y: p1.y }];
        } else {
          waypoints[waypoints.length - 1] = { x: p1.x, y: p1.y };
        }
        var elbowHandleOverride = handlePt;
      }

      el.x = p0.x;
      el.y = p0.y;
      el.x2 = p1.x;
      el.y2 = p1.y;
      el.width = p1.x - p0.x;
      el.height = p1.y - p0.y;

      const chordDx = p1.x - p0.x;
      const chordDy = p1.y - p0.y;
      const chordLen = Math.hypot(chordDx, chordDy) || 1;
      const nx = -chordDy / chordLen;
      const ny = chordDx / chordLen;
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      let tipAngle = Math.atan2(chordDy, chordDx);

      const cp = {
        x: midX + nx * curveOffset,
        y: midY + ny * curveOffset
      };
      const curveHandlePt = curveType === 'elbow' && elbowHandleOverride
        ? elbowHandleOverride
        : {
            x: midX + nx * (curveOffset * 0.5),
            y: midY + ny * (curveOffset * 0.5)
          };

      if (curveType === 'elbow') {

        const segs = [];
        let polyLen = 0;
        for (let i = 0; i < waypoints.length - 1; i++) {
          const a = waypoints[i];
          const b = waypoints[i + 1];
          const sl = Math.hypot(b.x - a.x, b.y - a.y);
          if (sl > 1e-6) {
            segs.push({ a, b, sl, tx: (b.x - a.x) / sl, ty: (b.y - a.y) / sl });
            polyLen += sl;
          }
        }

        if (segs.length === 0) {
          const tx = chordDx / chordLen;
          const ty = chordDy / chordLen;
          samples.push({ x: p0.x, y: p0.y, tx, ty });
          samples.push({ x: p1.x, y: p1.y, tx, ty });
          cumLenArr.push(chordLen);
          totalLen = chordLen;
          tipAngle = Math.atan2(ty, tx);
        } else {
          for (let s = 0; s < segs.length; s++) {
            const seg = segs[s];
            const steps = Math.max(2, Math.round((seg.sl / Math.max(1, polyLen)) * N));
            const startStep = s === 0 ? 0 : 1;
            for (let k = startStep; k <= steps; k++) {
              const localT = k / steps;
              const pt = {
                x: seg.a.x + (seg.b.x - seg.a.x) * localT,
                y: seg.a.y + (seg.b.y - seg.a.y) * localT,
                tx: seg.tx,
                ty: seg.ty
              };
              if (samples.length > 0) {
                const prev = samples[samples.length - 1];
                totalLen += Math.hypot(pt.x - prev.x, pt.y - prev.y);
                cumLenArr.push(totalLen);
              }
              samples.push(pt);
            }
          }
          const lastSeg = segs[segs.length - 1];
          tipAngle = Math.atan2(lastSeg.ty, lastSeg.tx);
        }
      } else {
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const mt = 1 - t;
          const x = mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x;
          const y = mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y;
          const dxdt = 2 * mt * (cp.x - p0.x) + 2 * t * (p1.x - cp.x);
          const dydt = 2 * mt * (cp.y - p0.y) + 2 * t * (p1.y - cp.y);
          const dLen = Math.hypot(dxdt, dydt) || 1;
          const pt = { x, y, tx: dxdt / dLen, ty: dydt / dLen };
          if (i > 0) {
            totalLen += Math.hypot(x - samples[i - 1].x, y - samples[i - 1].y);
            cumLenArr.push(totalLen);
          }
          samples.push(pt);
        }
        const endSample = samples[samples.length - 1];
        tipAngle = Math.atan2(endSample.ty, endSample.tx);
      }

      const cumLen = Float64Array.from(cumLenArr);
      const midDist = totalLen * 0.5;
      const labelPt = pointAtArcLength({ samples, cumLen, totalLen }, midDist);

      // Arrows are always unbroken and clean — no text or gaps cut in between them
      return {
        p0,
        p1,
        cp,
        curveHandlePt,
        waypoints,
        elbowAxis,
        elbowBaseMid: elbowBaseMid || { x: midX, y: midY },
        tipAngle,
        samples,
        cumLen,
        totalLen: Math.max(1, totalLen),
        labelPt,
        labelBox: null,
        gapStartDist: -1,
        gapEndDist: -1
      };
    }

    function pointAtArcLength(geom, dist) {
      const samples = geom.samples;
      const cumLen = geom.cumLen;
      const N = samples.length - 1;
      if (N <= 0) return { x: 0, y: 0, tx: 1, ty: 0 };
      const clamped = Math.max(0, Math.min(geom.totalLen, dist));
      let lo = 0;
      let hi = N;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumLen[mid] < clamped) lo = mid + 1;
        else hi = mid;
      }
      const idx = Math.max(1, lo);
      const d0 = cumLen[idx - 1];
      const d1 = cumLen[idx];
      const seg = d1 - d0;
      const f = seg > 1e-6 ? (clamped - d0) / seg : 0;
      const a = samples[idx - 1];
      const b = samples[idx];
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        tx: a.tx + (b.tx - a.tx) * f,
        ty: a.ty + (b.ty - a.ty) * f
      };
    }

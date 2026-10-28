    /* -------------------------------------------------------------------------
     * 3. Zero-Bleed Analytical Interior Clipping & Procedural Sketch Engine
     * ------------------------------------------------------------------------- */
    function clampPointToShapeInterior(el, px, py, inset = 1.5) {
      const w = Math.max(2, el.width || 0);
      const h = Math.max(2, el.height || 0);
      const cx = el.x + w / 2;
      const cy = el.y + h / 2;
      const ins = Math.min(Math.max(0, inset), Math.min(w, h) * 0.35);

      if (el.type === 'ellipse') {
        const rx = Math.max(1, w / 2 - ins);
        const ry = Math.max(1, h / 2 - ins);
        const ux = (px - cx) / rx;
        const vy = (py - cy) / ry;
        const d2 = ux * ux + vy * vy;
        if (d2 > 0.999) {
          const s = 0.995 / Math.sqrt(d2);
          return [cx + (px - cx) * s, cy + (py - cy) * s];
        }
        return [px, py];
      }

      if (el.type === 'diamond') {
        const hw = Math.max(1, w / 2 - ins);
        const hh = Math.max(1, h / 2 - ins);
        const l1 = Math.abs(px - cx) / hw + Math.abs(py - cy) / hh;
        if (l1 > 0.999) {
          const s = 0.995 / l1;
          return [cx + (px - cx) * s, cy + (py - cy) * s];
        }
        return [px, py];
      }

      const xL = el.x + ins;
      const xR = el.x + w - ins;
      const yT = el.y + ins;
      const yB = el.y + h - ins;
      let nx = Math.max(xL, Math.min(xR, px));
      let ny = Math.max(yT, Math.min(yB, py));
      const r = Math.max(0, Math.min(14, w / 4, h / 4) - ins * 0.5);
      if (r > 0.5) {
        const corners = [
          [xL + r, yT + r, nx < xL + r && ny < yT + r],
          [xR - r, yT + r, nx > xR - r && ny < yT + r],
          [xR - r, yB - r, nx > xR - r && ny > yB - r],
          [xL + r, yB - r, nx < xL + r && ny > yB - r]
        ];
        for (const [kx, ky, inCorner] of corners) {
          if (inCorner) {
            const dx = nx - kx;
            const dy = ny - ky;
            const d = Math.hypot(dx, dy);
            if (d > r * 0.995) {
              const s = (r * 0.99) / d;
              nx = kx + dx * s;
              ny = ky + dy * s;
            }
          }
        }
      }
      return [nx, ny];
    }

    function clipSegmentToShape(el, x1, y1, x2, y2, inset = 1.8) {
      if (!el) return null;
      const w = Number(el.width) || 0;
      const h = Number(el.height) || 0;
      if (w <= 2 || h <= 2) return null;

      const cx = el.x + w / 2;
      const cy = el.y + h / 2;
      const ins = Math.min(Math.max(0, Number(inset) || 0), Math.min(w, h) * 0.35);
      const dx = x2 - x1;
      const dy = y2 - y1;

      if (el.type === 'ellipse') {
        const rx = Math.max(1, w / 2 - ins);
        const ry = Math.max(1, h / 2 - ins);
        const u1 = (x1 - cx) / rx;
        const v1 = (y1 - cy) / ry;
        const du = dx / rx;
        const dv = dy / ry;

        const A = du * du + dv * dv;
        const B = 2 * (u1 * du + v1 * dv);
        const C = u1 * u1 + v1 * v1 - 1;

        if (A < 1e-12) {
          return C <= 0 ? [x1, y1, x2, y2] : null;
        }
        const disc = B * B - 4 * A * C;
        if (disc <= 0) return null;

        const sqrtD = Math.sqrt(disc);
        const t0 = (-B - sqrtD) / (2 * A);
        const t1 = (-B + sqrtD) / (2 * A);
        const tMin = Math.max(0, Math.min(t0, t1));
        const tMax = Math.min(1, Math.max(t0, t1));
        if (tMin >= tMax - 1e-5) return null;

        const [cx1, cy1] = clampPointToShapeInterior(el, x1 + tMin * dx, y1 + tMin * dy, ins);
        const [cx2, cy2] = clampPointToShapeInterior(el, x1 + tMax * dx, y1 + tMax * dy, ins);
        return [cx1, cy1, cx2, cy2];
      }

      if (el.type === 'diamond') {
        const hw = Math.max(1, w / 2 - ins);
        const hh = Math.max(1, h / 2 - ins);
        let tMin = 0;
        let tMax = 1;

        const signs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (let i = 0; i < 4; i++) {
          const sx = signs[i][0];
          const sy = signs[i][1];
          const p = sx * (dx / hw) + sy * (dy / hh);
          const q = 1 - (sx * ((x1 - cx) / hw) + sy * ((y1 - cy) / hh));
          if (Math.abs(p) < 1e-12) {
            if (q < 0) return null;
          } else if (p > 0) {
            tMax = Math.min(tMax, q / p);
          } else {
            tMin = Math.max(tMin, q / p);
          }
          if (tMin >= tMax - 1e-5) return null;
        }

        const [cx1, cy1] = clampPointToShapeInterior(el, x1 + tMin * dx, y1 + tMin * dy, ins);
        const [cx2, cy2] = clampPointToShapeInterior(el, x1 + tMax * dx, y1 + tMax * dy, ins);
        return [cx1, cy1, cx2, cy2];
      }

      const xL = el.x + ins;
      const xR = el.x + w - ins;
      const yT = el.y + ins;
      const yB = el.y + h - ins;
      if (xL >= xR || yT >= yB) return null;

      let tMin = 0;
      let tMax = 1;
      const pArr = [-dx, dx, -dy, dy];
      const qArr = [x1 - xL, xR - x1, y1 - yT, yB - y1];
      for (let i = 0; i < 4; i++) {
        const p = pArr[i];
        const q = qArr[i];
        if (Math.abs(p) < 1e-12) {
          if (q < 0) return null;
        } else {
          const r = q / p;
          if (p < 0) tMin = Math.max(tMin, r);
          else tMax = Math.min(tMax, r);
          if (tMin >= tMax - 1e-5) return null;
        }
      }

      const r = el.type === 'sticky' ? 4 : Math.max(0, Math.min(14, w / 4, h / 4) - ins * 0.5);
      if (r > 0.5) {
        const clipCornerCircle = (tVal, isStart) => {
          const px = x1 + tVal * dx;
          const py = y1 + tVal * dy;
          let kx = null;
          let ky = null;
          if (px < xL + r && py < yT + r) { kx = xL + r; ky = yT + r; }
          else if (px > xR - r && py < yT + r) { kx = xR - r; ky = yT + r; }
          else if (px > xR - r && py > yB - r) { kx = xR - r; ky = yB - r; }
          else if (px < xL + r && py > yB - r) { kx = xL + r; ky = yB - r; }
          if (kx === null) return tVal;

          const ox = x1 - kx;
          const oy = y1 - ky;
          if (ox * ox + oy * oy <= r * r && !isStart) return tVal;
          const A = dx * dx + dy * dy;
          const B = 2 * (ox * dx + oy * dy);
          const C = ox * ox + oy * oy - r * r;
          const disc = B * B - 4 * A * C;
          if (disc <= 0 || A < 1e-12) return null;
          const sD = Math.sqrt(disc);
          const ca = (-B - sD) / (2 * A);
          const cb = (-B + sD) / (2 * A);
          return isStart ? Math.max(tVal, Math.min(ca, cb)) : Math.min(tVal, Math.max(ca, cb));
        };

        const ntMin = clipCornerCircle(tMin, true);
        const ntMax = clipCornerCircle(tMax, false);
        if (ntMin === null || ntMax === null || ntMin >= ntMax - 1e-5) return null;
        tMin = ntMin;
        tMax = ntMax;
      }

      const [cx1, cy1] = clampPointToShapeInterior(el, x1 + tMin * dx, y1 + tMin * dy, ins);
      const [cx2, cy2] = clampPointToShapeInterior(el, x1 + tMax * dx, y1 + tMax * dy, ins);
      return [cx1, cy1, cx2, cy2];
    }

    function roughEdge(path, x1, y1, x2, y2, rng, roughness = 0.85) {
      const r = Number(roughness) || 0;
      if (r <= 0.001) {
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        return;
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const isCartoon = r > 1.2;
      const passes = isCartoon ? 3 : 2;
      const endJit = isCartoon ? 4.8 : 1.6 * r;
      const bowMag = isCartoon
        ? Math.min(11.0, Math.max(4.8, len * 0.055))
        : Math.min(4.8, Math.max(2.2, len * 0.025)) * r;

      for (let pass = 0; pass < passes; pass++) {
        const sign = pass === 0 ? 1 : (pass === 1 ? -0.9 : 0.55);
        const overshoot = isCartoon ? (pass === 0 ? 3.5 : -2.0) : 0;
        const ux = dx / len;
        const uy = dy / len;
        const sx = x1 - ux * overshoot + (rng() - 0.5) * endJit;
        const sy = y1 - uy * overshoot + (rng() - 0.5) * endJit;
        const ex = x2 + ux * overshoot + (rng() - 0.5) * endJit;
        const ey = y2 + uy * overshoot + (rng() - 0.5) * endJit;
        const bow1 = sign * bowMag * (0.75 + rng() * 0.5);
        const bow2 = (isCartoon && pass === 2 ? -sign : sign) * bowMag * (0.65 + rng() * 0.5);
        const cp1x = x1 + dx * 0.33 + nx * bow1;
        const cp1y = y1 + dy * 0.33 + ny * bow1;
        const cp2x = x1 + dx * 0.67 + nx * bow2;
        const cp2y = y1 + dy * 0.67 + ny * bow2;
        path.moveTo(sx, sy);
        path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ex, ey);
      }
    }

    function buildCleanRoundRectPath(path, x, y, w, h, r) {
      const cr = Math.max(0, Math.min(r, w / 2, h / 2));
      path.moveTo(x + cr, y);
      path.lineTo(x + w - cr, y);
      path.quadraticCurveTo(x + w, y, x + w, y + cr);
      path.lineTo(x + w, y + h - cr);
      path.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
      path.lineTo(x + cr, y + h);
      path.quadraticCurveTo(x, y + h, x, y + h - cr);
      path.lineTo(x, y + cr);
      path.quadraticCurveTo(x, y, x + cr, y);
      path.closePath();
    }

    function roughRoundRect(path, x, y, w, h, r, rng, roughness = 0.85) {
      const cr = Math.max(0, Math.min(r, w / 4, h / 4));
      if (!roughness || roughness <= 0.001) {
        buildCleanRoundRectPath(path, x, y, w, h, cr);
        return;
      }
      const isCartoon = roughness > 1.2;
      const passes = isCartoon ? 3 : 2;
      for (let p = 0; p < passes; p++) {
        const sign = p === 0 ? 1 : (p === 1 ? -0.95 : 0.6);
        const jit = isCartoon ? 4.5 : 1.6 * roughness;
        const bow = (isCartoon ? 9.5 : 3.8 * roughness) * sign;
        const j = () => (rng() - 0.5) * jit;
        const b = () => bow * (0.75 + rng() * 0.5);

        const t1x = x + cr + j(), t1y = y + j();
        const t2x = x + w - cr + j(), t2y = y + j();
        const r1x = x + w + j(), r1y = y + cr + j();
        const r2x = x + w + j(), r2y = y + h - cr + j();
        const b1x = x + w - cr + j(), b1y = y + h + j();
        const b2x = x + cr + j(), b2y = y + h + j();
        const l1x = x + j(), l1y = y + h - cr + j();
        const l2x = x + j(), l2y = y + cr + j();

        path.moveTo(t1x, t1y);
        path.quadraticCurveTo((t1x + t2x) / 2 + j(), (t1y + t2y) / 2 - b(), t2x, t2y);
        path.quadraticCurveTo(x + w + j(), y + j(), r1x, r1y);
        path.quadraticCurveTo((r1x + r2x) / 2 + b(), (r1y + r2y) / 2 + j(), r2x, r2y);
        path.quadraticCurveTo(x + w + j(), y + h + j(), b1x, b1y);
        path.quadraticCurveTo((b1x + b2x) / 2 + j(), (b1y + b2y) / 2 + b(), b2x, b2y);
        path.quadraticCurveTo(x + j(), y + h + j(), l1x, l1y);
        path.quadraticCurveTo((l1x + l2x) / 2 - b(), (l1y + l2y) / 2 + j(), l2x, l2y);
        path.quadraticCurveTo(x + j(), y + j(), t1x, t1y);
      }
    }

    function roughEllipse(path, cx, cy, rx, ry, rng, roughness = 0.85) {
      if (!roughness || roughness <= 0.001) {
        path.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        return;
      }
      const isCartoon = roughness > 1.2;
      const steps = 16;
      const passes = isCartoon ? 3 : 2;
      for (let pass = 0; pass < passes; pass++) {
        const sign = pass === 0 ? 1 : (pass === 1 ? -1 : 0.65);
        const waveAmp = isCartoon ? 5.8 : 2.4 * roughness;
        const jitAmp = isCartoon ? 3.6 : 1.2 * roughness;
        const phase = rng() * Math.PI * 2 + pass * 1.7;
        const cxShift = sign * (isCartoon ? 2.4 : 0.9 * roughness);
        const cyShift = -sign * (isCartoon ? 2.0 : 0.8 * roughness);
        const pts = [];
        for (let i = 0; i < steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const radialWave = Math.sin(theta * 2 + phase) * waveAmp * sign;
          const curRx = Math.max(2, rx + radialWave);
          const curRy = Math.max(2, ry - radialWave * 0.75);
          const px = cx + cxShift + Math.cos(theta) * curRx + (rng() - 0.5) * jitAmp;
          const py = cy + cyShift + Math.sin(theta) * curRy + (rng() - 0.5) * jitAmp;
          pts.push([px, py]);
        }
        const firstMidX = (pts[steps - 1][0] + pts[0][0]) / 2;
        const firstMidY = (pts[steps - 1][1] + pts[0][1]) / 2;
        path.moveTo(firstMidX, firstMidY);
        const totalSteps = isCartoon && pass === 0 ? steps + 1 : steps;
        for (let i = 0; i < totalSteps; i++) {
          const curr = pts[i % steps];
          const next = pts[(i + 1) % steps];
          const midX = (curr[0] + next[0]) / 2;
          const midY = (curr[1] + next[1]) / 2;
          path.quadraticCurveTo(curr[0], curr[1], midX, midY);
        }
      }
    }

    const ShapeCache = {
      cache: new Map(),

      keyFor(el) {
        return [
          el.id,
          el.type,
          Math.round(el.x * 10) / 10,
          Math.round(el.y * 10) / 10,
          Math.round((el.width || 0) * 10) / 10,
          Math.round((el.height || 0) * 10) / 10,
          el.seed || 1,
          el.versionNonce || 1,
          el.roughness ?? 0.85,
          el.fillStyle || 'hachure',
          el.strokeWidth || 2.2
        ].join('|');
      },

      generate(el) {
        const rng = mulberry32((Number(el.seed) || 1) ^ (Number(el.versionNonce) || 1));
        const fillPath = new Path2D();
        const strokePath = new Path2D();
        const hachurePath = new Path2D();

        const x = Number(el.x) || 0;
        const y = Number(el.y) || 0;
        const w = Math.max(2, Number(el.width) || 0);
        const h = Math.max(2, Number(el.height) || 0);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const roughness = el.roughness ?? 0.85;

        if (el.type === 'ellipse') {
          const rx = Math.max(1, w / 2);
          const ry = Math.max(1, h / 2);
          fillPath.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          roughEllipse(strokePath, cx, cy, rx, ry, rng, roughness);
        } else if (el.type === 'diamond') {
          const top = [cx, y];
          const right = [x + w, cy];
          const bottom = [cx, y + h];
          const left = [x, cy];
          fillPath.moveTo(top[0], top[1]);
          fillPath.lineTo(right[0], right[1]);
          fillPath.lineTo(bottom[0], bottom[1]);
          fillPath.lineTo(left[0], left[1]);
          fillPath.closePath();

          roughEdge(strokePath, top[0], top[1], right[0], right[1], rng, roughness);
          roughEdge(strokePath, right[0], right[1], bottom[0], bottom[1], rng, roughness);
          roughEdge(strokePath, bottom[0], bottom[1], left[0], left[1], rng, roughness);
          roughEdge(strokePath, left[0], left[1], top[0], top[1], rng, roughness);
        } else if (el.type === 'rectangle' || el.type === 'sticky') {
          const r = el.type === 'sticky' ? 4 : Math.min(14, w / 4, h / 4);
          buildCleanRoundRectPath(fillPath, x, y, w, h, r);
          roughRoundRect(strokePath, x, y, w, h, r, rng, el.type === 'sticky' ? roughness * 0.65 : roughness);
        }

        const fillStyle = el.fillStyle || 'hachure';
        if ((fillStyle === 'hachure' || fillStyle === 'cross-hatch') &&
            (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond' || el.type === 'sticky')) {
          const isCartoon = roughness > 1.2;
          const spacing = roughness <= 0.001 ? 8.0 : (isCartoon ? 11.0 : 8.5);
          const inset = Math.max(2.2, (Number(el.strokeWidth) || 2) * 0.9);
          const diag = w + h;
          const hatchBow = roughness <= 0.001 ? 0 : (isCartoon ? 12.0 : roughness * 4.5);

          const addClippedHatchSegment = (rawX1, rawY1, rawX2, rawY2) => {
            const clipped = clipSegmentToShape(el, rawX1, rawY1, rawX2, rawY2, inset);
            if (!clipped) return;
            const [cx1, cy1, cx2, cy2] = clipped;
            if (Math.hypot(cx2 - cx1, cy2 - cy1) <= 1.5) return;
            if (hatchBow <= 0.001) {
              hachurePath.moveTo(cx1, cy1);
              hachurePath.lineTo(cx2, cy2);
              return;
            }
            const sign = rng() > 0.5 ? 1 : -1;
            const rawMx = (cx1 + cx2) / 2 + sign * hatchBow * (0.6 + rng() * 0.4);
            const rawMy = (cy1 + cy2) / 2 - sign * hatchBow * (0.6 + rng() * 0.4);
            const [mx, my] = clampPointToShapeInterior(el, rawMx, rawMy, inset);
            hachurePath.moveTo(cx1, cy1);
            hachurePath.quadraticCurveTo(mx, my, cx2, cy2);
          };

          for (let d = -diag; d <= diag; d += spacing) {
            const jStep = isCartoon ? (rng() - 0.5) * 3.5 : 0;
            addClippedHatchSegment(x + d + jStep, y + h, x + d + h + jStep, y);
          }

          if (fillStyle === 'cross-hatch') {
            for (let d = -diag; d <= diag; d += spacing * 1.05) {
              const jStep = isCartoon ? (rng() - 0.5) * 3.5 : 0;
              addClippedHatchSegment(x + d + jStep, y, x + d + h + jStep, y + h);
            }
          }
        }

        return { fillPath, strokePath, hachurePath };
      },

      get(el) {
        const key = this.keyFor(el);
        let entry = this.cache.get(el.id);
        if (!entry || entry.key !== key) {
          const paths = this.generate(el);
          entry = { key, paths };
          this.cache.set(el.id, entry);
        }
        return entry.paths;
      },

      invalidate(el) {
        if (!el) return;
        const id = typeof el === 'string' ? el : el.id;
        if (typeof el === 'object' && el !== null) {
          el.versionNonce = (Number(el.versionNonce) || 1) + 1;
        }
        this.cache.delete(id);
      },

      clear() {
        this.cache.clear();
      }
    };

    /* =========================================================================
     * EXCALIFLOW — ZERO-DEPENDENCY HAND-DRAWN DIAGRAMMING & 60FPS FLOW ENGINE
     * ========================================================================= */

    const SEMANTIC_COLORS = [
      { hex: '#171717', name: 'Carbon', lightFill: 'rgba(23, 23, 23, 0.07)', darkFill: 'rgba(248, 250, 252, 0.14)', darkStroke: '#f8fafc' },
      { hex: '#0070f3', name: 'Blue',   lightFill: 'rgba(0, 112, 243, 0.12)', darkFill: 'rgba(56, 189, 248, 0.20)', darkStroke: '#38bdf8' },
      { hex: '#7928ca', name: 'Purple', lightFill: 'rgba(121, 40, 202, 0.12)', darkFill: 'rgba(192, 132, 252, 0.22)', darkStroke: '#c084fc' },
      { hex: '#10b981', name: 'Emerald',lightFill: 'rgba(16, 185, 129, 0.13)', darkFill: 'rgba(52, 211, 153, 0.20)', darkStroke: '#34d399' },
      { hex: '#f59e0b', name: 'Amber',  lightFill: 'rgba(245, 158, 11, 0.15)', darkFill: 'rgba(251, 191, 36, 0.22)', darkStroke: '#fbbf24' },
      { hex: '#ef4444', name: 'Rose',   lightFill: 'rgba(239, 68, 68, 0.13)',  darkFill: 'rgba(248, 113, 113, 0.22)', darkStroke: '#f87171' },
      { hex: '#06b6d4', name: 'Cyan',   lightFill: 'rgba(6, 182, 212, 0.14)',  darkFill: 'rgba(34, 211, 238, 0.22)', darkStroke: '#22d3ee' }
    ];

    // Matches Excalidraw's FONT_FAMILY (Excalifont / Virgil for hand, Assistant / Nunito for normal, Cascadia for code)
    const FONT_MAP = {
      hand: "'Excalifont', 'Virgil', 'Patrick Hand', 'Architects Daughter', 'Caveat', cursive",
      sans: "'Assistant', 'Nunito', 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      code: "'Cascadia', 'Geist Mono', monospace"
    };

    // Excalidraw unitless line-height metric from packages/common/src/font-metadata.ts
    const EXCALIDRAW_LINE_HEIGHT = 1.25;

    function normalizeFontFamily(family) {
      if (!family) return 'hand';
      if (typeof family === 'number') {
        if (family === 3 || family === 8) return 'code';
        if (family === 2 || family === 4 || family === 6 || family === 9 || family === 10) return 'sans';
        return 'hand';
      }
      const f = String(family).toLowerCase();
      if (f === 'hand' || f.includes('excalifont') || f.includes('virgil') || f.includes('patrick') || f.includes('caveat')) return 'hand';
      if (f === 'sans' || f === 'normal' || f.includes('assistant') || f.includes('nunito') || (f.includes('geist') && !f.includes('mono')) || f.includes('inter')) return 'sans';
      if (f === 'code' || f === 'mono' || f.includes('cascadia') || f.includes('mono')) return 'code';
      return 'hand';
    }

    function getFontCss(family, fontSize, weight = null) {
      const key = normalizeFontFamily(family);
      const cssFamily = FONT_MAP[key] || FONT_MAP.hand;
      const sz = Number(fontSize) || 16;
      const resolvedWeight = weight !== null ? weight : (key === 'hand' ? 400 : 500);
      return `${resolvedWeight} ${sz}px ${cssFamily}`;
    }

    function getColorEntry(hex) {
      const norm = (hex || '#171717').toLowerCase();
      return SEMANTIC_COLORS.find(c => c.hex.toLowerCase() === norm) || SEMANTIC_COLORS[0];
    }

    function resolveStrokeColor(hex, canvasBg) {
      const entry = getColorEntry(hex);
      const isDark = (canvasBg || state.canvasBg) === '#000000';
      if (isDark) return entry.darkStroke || entry.hex;
      return entry.hex;
    }

    function resolveFillTint(hex, canvasBg, isSticky = false) {
      const entry = getColorEntry(hex);
      const isDark = (canvasBg || state.canvasBg) === '#000000';
      if (isSticky) {
        if (entry.hex === '#171717') return isDark ? 'rgba(251, 191, 36, 0.20)' : '#fef3c7';
      }
      return isDark ? entry.darkFill : entry.lightFill;
    }

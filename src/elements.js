    /* -------------------------------------------------------------------------
     * 8. Auto-Fitting Multi-Line Text & Element Factory
     * ------------------------------------------------------------------------- */
    let measureCtx = null;
    function getMeasureCtx() {
      if (!measureCtx && typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        measureCtx = c.getContext('2d');
      }
      return measureCtx;
    }

    function autoFitElementToText(el, text) {
      if (!el || el.type === 'arrow') return;
      el.text = text;
      const lines = String(text || '').split('\n');
      const fontSize = Number(el.fontSize) || 15;
      const lineHeight = Math.round(fontSize * EXCALIDRAW_LINE_HEIGHT);

      const mCtx = getMeasureCtx();
      let maxLineW = 0;
      if (mCtx) {
        mCtx.font = getFontCss(el.fontFamily, fontSize);
        for (const line of lines) {
          maxLineW = Math.max(maxLineW, mCtx.measureText(line || ' ').width);
        }
      } else {
        for (const line of lines) {
          maxLineW = Math.max(maxLineW, (line || '').length * fontSize * 0.58);
        }
      }

      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      let padX = 32;
      let padY = 28;
      if (el.type === 'diamond') {
        padX = Math.max(56, maxLineW * 0.65);
        padY = Math.max(44, lines.length * lineHeight * 0.65);
      } else if (el.type === 'ellipse') {
        padX = 42;
      }
      const minW = el.type === 'text' ? 40 : 110;
      const minH = el.type === 'text' ? 26 : 54;

      const nextW = Math.max(el.width || minW, minW, Math.ceil(maxLineW + padX));
      const nextH = Math.max(el.height || minH, minH, Math.ceil(lines.length * lineHeight + padY));

      if (nextW !== el.width || nextH !== el.height) {
        el.width = nextW;
        el.height = nextH;
        el.x = cx - nextW / 2;
        el.y = cy - nextH / 2;
        ShapeCache.invalidate(el);
      }
    }

    const DEFAULT_SHAPE_SIZES = {
      sticky: { width: 150, height: 110 },
      diamond: { width: 148, height: 86 },
      default: { width: 144, height: 68 }
    };

    function getDefaultShapeSize(type) {
      return DEFAULT_SHAPE_SIZES[type] || DEFAULT_SHAPE_SIZES.default;
    }

    function createElement(type, props = {}) {
      const d = state.defaults;
      const seed = props.seed || Math.floor(Math.random() * 1000000) + 1;
      const defaultSize = getDefaultShapeSize(type);
      const base = {
        id: props.id || nextId(type),
        type,
        x: props.x ?? 0,
        y: props.y ?? 0,
        width: props.width ?? defaultSize.width,
        height: props.height ?? defaultSize.height,
        strokeColor: props.strokeColor || d.strokeColor,
        fillStyle: props.fillStyle ?? (type === 'sticky' ? 'solid' : d.fillStyle),
        fontFamily: normalizeFontFamily(props.fontFamily || d.fontFamily),
        fontSize: Number(props.fontSize || d.fontSize),
        roughness: props.roughness !== undefined ? Number(props.roughness) : d.roughness,
        strokeWidth: Number(props.strokeWidth || d.strokeWidth),
        strokeStyle: props.strokeStyle || d.strokeStyle,
        curveType: props.curveType || d.curveType,
        curveOffset: Number(props.curveOffset) || 0,
        text: type === 'arrow' ? '' : (props.text ?? ''),
        seed,
        versionNonce: 1,
        flowEnabled: props.flowEnabled !== false,
        startBinding: props.startBinding || null,
        endBinding: props.endBinding || null,
        x2: props.x2,
        y2: props.y2,
        points: props.points || []
      };
      if (base.text && isNodeElement(base)) {
        autoFitElementToText(base, base.text);
      }
      return base;
    }

    /* -------------------------------------------------------------------------
     * 14. Studio Exports (2x Retina PNG, Clipboard, 60fps WebM Video, JSON)
     * ------------------------------------------------------------------------- */
    const ALLOWED_ELEMENT_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'freedraw', 'text', 'sticky']);
    const ALLOWED_FLOW_MODES = new Set(['comets', 'pulses', 'neon', 'dashed']);

    function getDiagramExportBounds(padding = 48) {
      if (state.elements.length === 0) {
        return { x: 0, y: 0, width: 800, height: 500 };
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const elementsMap = getElementMap();

      for (const el of state.elements) {
        if (el.type === 'arrow') {
          const geom = getArrowGeometry(el, elementsMap);
          for (const pt of geom.samples) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
        } else if (el.type === 'freedraw') {
          for (const p of (el.points || [[0, 0]])) {
            minX = Math.min(minX, el.x + p[0]);
            minY = Math.min(minY, el.y + p[1]);
            maxX = Math.max(maxX, el.x + p[0]);
            maxY = Math.max(maxY, el.y + p[1]);
          }
        } else {
          minX = Math.min(minX, el.x);
          minY = Math.min(minY, el.y);
          maxX = Math.max(maxX, el.x + (el.width || 0));
          maxY = Math.max(maxY, el.y + (el.height || 0));
        }
      }

      return {
        x: Math.floor(minX - padding),
        y: Math.floor(minY - padding),
        width: Math.max(120, Math.ceil(maxX - minX + padding * 2)),
        height: Math.max(120, Math.ceil(maxY - minY + padding * 2))
      };
    }

    function renderSceneToExportCtx(offCtx, offCanvas, bounds, scale, timeSec) {
      offCtx.save();
      offCtx.fillStyle = state.canvasBg;
      offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
      offCtx.scale(scale, scale);
      offCtx.translate(-bounds.x, -bounds.y);
      renderScenePasses(offCtx, timeSec, { canvasBg: state.canvasBg, forExport: true });
      offCtx.restore();
    }

    function renderCroppedOffscreenCanvas(scale = 2, timeSec = performance.now() / 1000) {
      const bounds = getDiagramExportBounds(48);
      const offCanvas = document.createElement('canvas');
      offCanvas.width = bounds.width * scale;
      offCanvas.height = bounds.height * scale;
      const offCtx = offCanvas.getContext('2d');
      renderSceneToExportCtx(offCtx, offCanvas, bounds, scale, timeSec);
      return offCanvas;
    }

    function downloadBlob(blob, filename) {
      if (!blob || typeof URL === 'undefined' || typeof document === 'undefined') return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function showToast(msg) {
      if (typeof document === 'undefined') return;
      const t = document.getElementById('studioToast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove('show'), 2200);
    }

    function save2xPng() {
      closeAllDropdowns();
      const offCanvas = renderCroppedOffscreenCanvas(2);
      offCanvas.toBlob(blob => {
        if (!blob) return;
        downloadBlob(blob, 'excaliflow-2x.png');
        showToast('Saved 2x Retina PNG (excaliflow-2x.png)');
      }, 'image/png');
    }

    async function copy2xPng() {
      closeAllDropdowns();
      const offCanvas = renderCroppedOffscreenCanvas(2);
      offCanvas.toBlob(async blob => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('Copied 2x Retina PNG to Clipboard');
        } catch (err) {
          showToast('Clipboard write unavailable in this context');
        }
      }, 'image/png');
    }

    function recordWebmVideo() {
      closeAllDropdowns();
      if (state.isRecording) {
        showToast('Recording already in progress...');
        return;
      }
      if (typeof MediaRecorder === 'undefined') {
        showToast('MediaRecorder is not supported in this browser');
        return;
      }
      state.isRecording = true;
      const bounds = getDiagramExportBounds(48);
      const scale = 2;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = bounds.width * scale;
      offCanvas.height = bounds.height * scale;
      const offCtx = offCanvas.getContext('2d');

      const stream = offCanvas.captureStream(60);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks = [];

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => {
        state.isRecording = false;
      };
      recorder.onstop = () => {
        state.isRecording = false;
        const blob = new Blob(chunks, { type: 'video/webm' });
        downloadBlob(blob, 'excaliflow-flow.webm');
        showToast('Exported 60fps Video Loop (excaliflow-flow.webm)');
      };

      showToast('Recording 4s 60fps WebM Loop...');
      recorder.start();

      const totalFrames = 240;
      let frame = 0;
      const baseTime = performance.now() / 1000;
      const interval = setInterval(() => {
        const simTime = baseTime + frame / 60;
        renderSceneToExportCtx(offCtx, offCanvas, bounds, scale, simTime);

        frame++;
        if (frame >= totalFrames) {
          clearInterval(interval);
          recorder.stop();
        }
      }, 1000 / 60);
    }

    function sanitizeElementsArray(rawElements) {
      if (!Array.isArray(rawElements)) return [];
      const validRaw = rawElements.filter(
        el => el && !el.isDeleted && typeof el.type === 'string' && ALLOWED_ELEMENT_TYPES.has(el.type)
      );
      return validRaw.map(el => {
        syncIdCounterWithId(el.id);
        const normType = el.type === 'line' ? 'arrow' : el.type;
        let resolvedX2 = el.x2;
        let resolvedY2 = el.y2;
        if (normType === 'arrow' && typeof resolvedX2 !== 'number' && Array.isArray(el.points) && el.points.length > 1) {
          const lastPt = el.points[el.points.length - 1];
          if (Array.isArray(lastPt) && lastPt.length >= 2) {
            resolvedX2 = (Number(el.x) || 0) + (Number(lastPt[0]) || 0);
            resolvedY2 = (Number(el.y) || 0) + (Number(lastPt[1]) || 0);
          }
        }
        return createElement(normType, {
          ...el,
          x2: resolvedX2,
          y2: resolvedY2,
          text: normType === 'arrow' ? '' : String(el.text ?? '')
        });
      });
    }

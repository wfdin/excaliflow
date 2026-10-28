    /* -------------------------------------------------------------------------
     * 10. Quick-Add Chaining, Tab Chaining & Starter Templates
     * ------------------------------------------------------------------------- */
    function chainNodeFrom(sourceNode, dir = 'right', type = null, openEditor = false) {
      pushHistory();
      const targetType = type || (sourceNode.type === 'text' ? 'rectangle' : sourceNode.type);
      const stepX = 220;
      const stepY = 150;
      const scx = sourceNode.x + sourceNode.width / 2;
      const scy = sourceNode.y + sourceNode.height / 2;

      let ncx = scx + stepX;
      let ncy = scy;
      let outAngle = 0;
      let inAngle = Math.PI;

      if (dir === 'left') { ncx = scx - stepX; outAngle = Math.PI; inAngle = 0; }
      else if (dir === 'top') { ncx = scx; ncy = scy - stepY; outAngle = -Math.PI / 2; inAngle = Math.PI / 2; }
      else if (dir === 'bottom') { ncx = scx; ncy = scy + stepY; outAngle = Math.PI / 2; inAngle = -Math.PI / 2; }

      const { width: newW, height: newH } = getDefaultShapeSize(targetType);
      const newNode = createElement(targetType, {
        x: ncx - newW / 2,
        y: ncy - newH / 2,
        width: newW,
        height: newH,
        strokeColor: sourceNode.strokeColor || state.defaults.strokeColor,
        fillStyle: sourceNode.fillStyle || state.defaults.fillStyle,
        fontFamily: sourceNode.fontFamily || state.defaults.fontFamily,
        fontSize: sourceNode.fontSize || state.defaults.fontSize,
        text: 'Next Step'
      });

      const newArrow = createElement('arrow', {
        x: scx,
        y: scy,
        x2: ncx,
        y2: ncy,
        strokeColor: sourceNode.strokeColor || state.defaults.strokeColor,
        startBinding: { elementId: sourceNode.id, focusAngle: outAngle, side: dir, gap: 4 },
        endBinding: { elementId: newNode.id, focusAngle: inAngle, side: angleToSide(inAngle), gap: 4 }
      });

      state.elements.push(newNode, newArrow);
      state.selectedIds.clear();
      state.selectedIds.add(newNode.id);
      syncUIWithSelection();

      if (openEditor) {
        startInlineEditing(newNode);
      }
      return newNode;
    }

    function quickAddShape(type = 'rectangle') {
      const selectedNodes = Array.from(state.selectedIds)
        .map(id => state.elements.find(e => e.id === id))
        .filter(el => el && isNodeElement(el));

      if (selectedNodes.length === 1) {
        return chainNodeFrom(selectedNodes[0], 'right', type, false);
      }

      pushHistory();
      const vw = (typeof window !== 'undefined' ? window.innerWidth : 1280);
      const vh = (typeof window !== 'undefined' ? window.innerHeight : 800);
      const centerWorld = screenToWorld(vw / 2, vh / 2);
      const offset = (state.elements.length % 5) * 24;
      const w = type === 'sticky' ? 156 : (type === 'diamond' ? 150 : 144);
      const h = type === 'sticky' ? 114 : (type === 'diamond' ? 88 : 68);
      const defaultLabels = {
        rectangle: 'Service Node',
        ellipse: 'State / Cache',
        diamond: 'Decision?',
        sticky: 'Architecture Note'
      };
      const el = createElement(type, {
        x: centerWorld.x - w / 2 + offset,
        y: centerWorld.y - h / 2 + offset,
        width: w,
        height: h,
        text: defaultLabels[type] || 'Node'
      });
      state.elements.push(el);
      state.selectedIds.clear();
      state.selectedIds.add(el.id);
      syncUIWithSelection();
      return el;
    }

    function loadTemplate(templateName) {
      pushHistory();
      state.elements = [];
      state.selectedIds.clear();
      state.activePulses = [];
      ShapeCache.clear();

      const addNode = (id, type, x, y, w, h, text, color, fillStyle = 'hachure') => {
        const el = createElement(type, { id, x, y, width: w, height: h, text, strokeColor: color, fillStyle });
        state.elements.push(el);
        return el;
      };

      const addEdge = (fromEl, toEl, curveOffset = 0, color = null) => {
        const fc = { x: fromEl.x + fromEl.width / 2, y: fromEl.y + fromEl.height / 2 };
        const tc = { x: toEl.x + toEl.width / 2, y: toEl.y + toEl.height / 2 };
        const angOut = Math.atan2(tc.y - fc.y, tc.x - fc.x);
        const angIn = Math.atan2(fc.y - tc.y, fc.x - tc.x);
        const arr = createElement('arrow', {
          x: fc.x,
          y: fc.y,
          x2: tc.x,
          y2: tc.y,
          text: '',
          curveOffset,
          curveType: Math.abs(curveOffset) > 1 ? 'curved' : state.defaults.curveType,
          strokeColor: color || fromEl.strokeColor,
          startBinding: { elementId: fromEl.id, focusAngle: angOut, side: angleToSide(angOut), gap: 4 },
          endBinding: { elementId: toEl.id, focusAngle: angIn, side: angleToSide(angIn), gap: 4 }
        });
        state.elements.push(arr);
        return arr;
      };

      if (templateName === 'How Browsers Work') {
        const n1 = addNode('b_url', 'ellipse', 70, 220, 148, 70, 'URL Request\nHTTPS / DNS', '#0070f3');
        const n2 = addNode('b_html', 'rectangle', 295, 125, 156, 70, 'HTML Parser\nDOM Tree', '#7928ca');
        const n3 = addNode('b_css', 'rectangle', 295, 315, 156, 70, 'CSS Parser\nCSSOM', '#06b6d4');
        const n4 = addNode('b_render', 'diamond', 530, 208, 174, 96, 'Render Tree\n& Layout', '#f59e0b');
        const n5 = addNode('b_paint', 'rectangle', 780, 220, 162, 70, 'Composite &\n60fps Paint', '#10b981');
        addEdge(n1, n2, -20, '#0070f3');
        addEdge(n1, n3, 20, '#06b6d4');
        addEdge(n2, n4, 16, '#7928ca');
        addEdge(n3, n4, -16, '#06b6d4');
        addEdge(n4, n5, 0, '#10b981');
      } else if (templateName === 'RAG Pipeline') {
        const n1 = addNode('r_q', 'ellipse', 70, 225, 146, 70, 'User Query', '#0070f3');
        const n2 = addNode('r_emb', 'rectangle', 285, 225, 158, 70, 'Embedding\nEncoder', '#7928ca');
        const n3 = addNode('r_vec', 'diamond', 515, 120, 170, 94, 'Vector DB\nTop-K Search', '#06b6d4');
        const n4 = addNode('r_rerank', 'rectangle', 520, 320, 158, 70, 'Cross-Encoder\nReranker', '#f59e0b');
        const n5 = addNode('r_llm', 'rectangle', 765, 225, 164, 72, 'LLM Context\nSynthesizer', '#10b981');
        addEdge(n1, n2, 0, '#0070f3');
        addEdge(n2, n3, -18, '#7928ca');
        addEdge(n3, n4, 0, '#06b6d4');
        addEdge(n4, n5, 18, '#f59e0b');
        addEdge(n2, n5, -28, '#10b981');
      } else if (templateName === 'Microservices') {
        const n1 = addNode('m_gw', 'diamond', 70, 215, 166, 94, 'API Gateway\nRate Limiter', '#0070f3');
        const n2 = addNode('m_auth', 'rectangle', 315, 100, 152, 68, 'Auth Service\nJWT Verify', '#7928ca');
        const n3 = addNode('m_ord', 'rectangle', 315, 228, 152, 68, 'Order Engine', '#10b981');
        const n4 = addNode('m_pay', 'rectangle', 315, 355, 152, 68, 'Payment Worker', '#f59e0b');
        const n5 = addNode('m_kafka', 'ellipse', 565, 228, 160, 72, 'Event Bus\nKafka Stream', '#ef4444');
        const n6 = addNode('m_db', 'rectangle', 800, 228, 156, 70, 'Read Replica\nAnalytics', '#06b6d4');
        addEdge(n1, n2, -20, '#7928ca');
        addEdge(n1, n3, 0, '#0070f3');
        addEdge(n1, n4, 20, '#f59e0b');
        addEdge(n3, n5, 0, '#10b981');
        addEdge(n4, n5, -18, '#f59e0b');
        addEdge(n5, n6, 0, '#ef4444');
      } else {
        const n1 = addNode('a_user', 'ellipse', 70, 225, 146, 70, 'User Task\nSpec', '#0070f3');
        const n2 = addNode('a_plan', 'diamond', 285, 212, 170, 94, 'Orchestrator\nPlanner', '#7928ca');
        const n3 = addNode('a_code', 'rectangle', 530, 115, 160, 70, 'Coder Agent\nSandbox', '#10b981');
        const n4 = addNode('a_res', 'rectangle', 530, 325, 160, 70, 'Research Agent\nWeb & Docs', '#06b6d4');
        const n5 = addNode('a_ver', 'rectangle', 780, 225, 164, 70, 'Verifier Agent\nTest Runner', '#f59e0b');
        addEdge(n1, n2, 0, '#0070f3');
        addEdge(n2, n3, -20, '#7928ca');
        addEdge(n2, n4, 20, '#7928ca');
        addEdge(n3, n5, 18, '#10b981');
        addEdge(n4, n5, -18, '#06b6d4');
      }

      fitToScreen();
      if (state.tabs.length > 0) {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (activeTab) {
          activeTab.name = templateName || 'AI Agent Swarm';
        }
      }
      syncUIWithSelection();
    }

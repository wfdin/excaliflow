    /* -------------------------------------------------------------------------
     * 5. Causal Topological Wave Timing (BFS computeGraphDepths) & Node Pulses
     * ------------------------------------------------------------------------- */
    function computeGraphDepths(elements = state.elements) {
      const nodeDepths = new Map();
      const arrowDepths = new Map();
      const adj = new Map();
      const inDeg = new Map();

      const nodes = elements.filter(isNodeElement);
      const arrows = elements.filter(e => e.type === 'arrow');

      for (const n of nodes) {
        adj.set(n.id, []);
        inDeg.set(n.id, 0);
      }

      for (const arr of arrows) {
        const u = arr.startBinding?.elementId;
        const v = arr.endBinding?.elementId;
        if (u && v && adj.has(u) && adj.has(v)) {
          adj.get(u).push({ target: v, arrowId: arr.id });
          inDeg.set(v, (inDeg.get(v) || 0) + 1);
        }
      }

      const queue = [];
      for (const n of nodes) {
        if ((inDeg.get(n.id) || 0) === 0) {
          nodeDepths.set(n.id, 0);
          queue.push(n.id);
        }
      }

      if (queue.length === 0 && nodes.length > 0) {
        nodeDepths.set(nodes[0].id, 0);
        queue.push(nodes[0].id);
      }

      let head = 0;
      while (head < queue.length) {
        const u = queue[head++];
        const d = nodeDepths.get(u) || 0;
        const edges = adj.get(u) || [];
        for (const edge of edges) {
          arrowDepths.set(edge.arrowId, d);
          if (!nodeDepths.has(edge.target)) {
            nodeDepths.set(edge.target, d + 1);
            queue.push(edge.target);
          }
        }
      }

      for (const n of nodes) {
        if (!nodeDepths.has(n.id)) nodeDepths.set(n.id, 0);
      }
      for (const arr of arrows) {
        if (!arrowDepths.has(arr.id)) {
          const u = arr.startBinding?.elementId;
          arrowDepths.set(arr.id, u && nodeDepths.has(u) ? nodeDepths.get(u) : 0);
        }
      }

      return { nodeDepths, arrowDepths };
    }

    function triggerNodePulse(nodeId) {
      const targetIds = nodeId ? [nodeId] : Array.from(state.selectedIds);
      let spawned = 0;
      const now = performance.now() / 1000;

      for (const id of targetIds) {
        const outgoing = state.elements.filter(
          el => el.type === 'arrow' && el.startBinding?.elementId === id
        );
        const targetArrows = outgoing.length > 0
          ? outgoing
          : state.elements.filter(el => el.type === 'arrow' && el.id === id);

        for (const arr of targetArrows) {
          for (let b = 0; b < 3; b++) {
            state.activePulses.push({
              id: nextId('pulse'),
              arrowId: arr.id,
              progress: -b * 0.14,
              speed: 1.35,
              color: arr.strokeColor || '#0070f3',
              createdAt: now
            });
            spawned++;
          }
        }
      }
      return spawned;
    }

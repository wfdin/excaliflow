    /* -------------------------------------------------------------------------
     * 9. History Stack (Undo / Redo)
     * ------------------------------------------------------------------------- */
    function snapshotScene() {
      return JSON.stringify(state.elements);
    }

    function pushHistory(customSnap = null) {
      if (state.isReadOnly) return;
      const snap = customSnap || snapshotScene();
      const stack = state.history.undoStack;
      if (stack.length > 0 && stack[stack.length - 1] === snap) return;
      stack.push(snap);
      if (stack.length > 60) stack.shift();
      state.history.redoStack = [];
      updateHeaderButtons();
    }

    function discardRedundantUndoSnapshot() {
      const stack = state.history.undoStack;
      if (stack.length > 0 && stack[stack.length - 1] === snapshotScene()) {
        stack.pop();
        updateHeaderButtons();
      }
    }

    function undo() {
      if (state.isReadOnly) return;
      const currentSnap = snapshotScene();
      while (state.history.undoStack.length > 0 && state.history.undoStack[state.history.undoStack.length - 1] === currentSnap) {
        state.history.undoStack.pop();
      }
      if (state.history.undoStack.length === 0) {
        updateHeaderButtons();
        return;
      }
      state.history.redoStack.push(currentSnap);
      const prev = state.history.undoStack.pop();
      state.elements = JSON.parse(prev);
      state.selectedIds.clear();
      ShapeCache.clear();
      updateHeaderButtons();
      syncUIWithSelection();
    }

    function redo() {
      if (state.isReadOnly) return;
      if (state.history.redoStack.length === 0) return;
      state.history.undoStack.push(snapshotScene());
      const next = state.history.redoStack.pop();
      state.elements = JSON.parse(next);
      state.selectedIds.clear();
      ShapeCache.clear();
      updateHeaderButtons();
      syncUIWithSelection();
    }

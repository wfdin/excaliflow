    /* -------------------------------------------------------------------------
     * 2. Scene State
     * ------------------------------------------------------------------------- */
    const state = {
      tabs: [],
      activeTabId: null,
      editingTabId: null,
      elements: [],
      selectedIds: new Set(),
      isReadOnly: false,
      sharedToken: null,
      hoveredId: null,
      hoveredPort: null,
      hoveredArrowHandle: null,
      hoveredResizeHandle: null,
      splitTargetArrowId: null,
      snapPreview: null,
      activeTool: 'select',
      toolLocked: false,
      canvasBg: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
      flowEnabled: true,
      flowMode: 'comets',
      flowSpeed: 1.0,
      activePulses: [],
      laserPoints: [],
      nodeArrivalEnergy: new Map(),
      defaults: {
        strokeColor: '#171717',
        fillStyle: 'hachure',
        fontFamily: 'hand',
        fontSize: 15,
        roughness: 0.85,
        strokeWidth: 2.2,
        strokeStyle: 'solid',
        curveType: 'curved'
      },
      history: {
        undoStack: [],
        redoStack: []
      },
      clipboard: [],
      pasteCount: 0,
      drag: null,
      editingId: null,
      isSpacePanning: false
    };

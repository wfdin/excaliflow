    /* -------------------------------------------------------------------------
     * 1. Deterministic Seeded PRNG (mulberry32)
     * ------------------------------------------------------------------------- */
    function mulberry32(seed) {
      let a = (Number(seed) || 1) >>> 0;
      return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    let idCounter = 1000;
    function nextId(prefix = 'el') {
      idCounter += 1;
      return `${prefix}_${idCounter}_${Math.floor(Math.random() * 9000 + 1000)}`;
    }

    function syncIdCounterWithId(rawId) {
      if (typeof rawId !== 'string') return;
      const m = rawId.match(/_(\d+)_/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > idCounter) idCounter = n;
      }
    }

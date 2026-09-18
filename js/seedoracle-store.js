// seedoracle-store.js : the ONE source of truth for Seed Oracle
// sessionStorage. Currently holds only the unlock level (0-4), which
// gates which chapters the reader can open during the current tab visit.
//
// Same seam pattern as js/store.js (Mystics Cards) and
// js/iching-store.js (I Ching). Everything else in the Seed Oracle
// reads/writes through window.SeedStore.
//
// Load order: seedoracle.html must include this BEFORE
// js/seedoracle.js (which calls window.SeedStore.getUnlock() at boot).

(function () {
  'use strict';

  function _get(k)    { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function _set(k, v) { try { sessionStorage.setItem(k, v); }    catch (e) {} }

  var K_UNLOCK = 'seedoracle_unlock';

  window.SeedStore = {
    // Chapter unlock level: 0..4. Level rises as the reader completes
    // each chapter's proof, and never falls within the current tab visit
    // (raiseUnlock in the journey module only writes when the new value is HIGHER).
    // Clamped to 0..4 in case a corrupted key returns something weird.
    getUnlock: function () {
      var raw = parseInt(_get(K_UNLOCK), 10);
      if (!Number.isFinite(raw)) return 0;
      return Math.max(0, Math.min(4, raw));
    },
    setUnlock: function (n) {
      _set(K_UNLOCK, String(Math.max(0, Math.min(4, n | 0))));
    },
  };
})();

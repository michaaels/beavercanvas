(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function create(document, normalize, limit = 80, maxBytes = 24 * 1024 * 1024) {
    let current = normalize(document), undo = [], redo = [], lastMerge = null;
    function trim(items) {
      let bytes = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        bytes += JSON.stringify(items[i]).length * 2;
        if (items.length - i > limit || bytes > maxBytes) return items.slice(i + 1);
      }
      return items;
    }
    function record(value, mergeKey) {
      const after = normalize(value);
      if (JSON.stringify(current) !== JSON.stringify(after)) {
        if (!mergeKey || mergeKey !== lastMerge) undo.push(clone(current));
        undo = trim(undo); redo = []; current = after; lastMerge = mergeKey || null;
      }
      return current;
    }
    return {
      get: () => current, record,
      replace(value) { current = normalize(value); undo = []; redo = []; lastMerge = null; return current; },
      change(action, mergeKey) { const draft = clone(current); action(draft); return record(draft, mergeKey); },
      breakMerge() { lastMerge = null; },
      undo() { lastMerge = null; if (undo.length) { redo.push(current); redo = trim(redo); current = undo.pop(); } return current; },
      redo() { lastMerge = null; if (redo.length) { undo.push(current); undo = trim(undo); current = redo.pop(); } return current; },
      canUndo: () => undo.length > 0, canRedo: () => redo.length > 0
    };
  }
  window.DBeaverDocumentHistory = Object.freeze({ create });
})();

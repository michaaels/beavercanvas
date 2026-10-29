(() => {
  'use strict';

  const COLUMNS = 12;
  const ROW_HEIGHT = 40;
  const GAP = 8;
  const MAX_ROWS = 1024;
  const MIN_WIDTH = 4;
  const MIN_HEIGHT = 5;
  const MAX_HEIGHT = 24;

  function integer(value, fallback, min, max) {
    const number = Number(value);
    return value !== null && value !== undefined && Number.isFinite(number)
      ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  }

  function normalizeLayout(value, bounds = {}) {
    const width = integer(value?.width, integer(value?.columnSpan, 1, 1, 2) * 6, bounds.minWidth ?? MIN_WIDTH, COLUMNS);
    const height = integer(value?.height, integer(value?.rowSpan, 1, 1, 2) * 8, bounds.minHeight ?? MIN_HEIGHT, bounds.maxHeight ?? MAX_HEIGHT);
    return {
      x: integer(value?.x, null, 0, COLUMNS - width),
      y: integer(value?.y, null, 0, MAX_ROWS - height),
      width,
      height
    };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function findSpace(layout, occupied) {
    const free = candidate => occupied.every(other => !overlaps(candidate, other));
    if (layout.x !== null && layout.y !== null && free(layout)) return layout;
    const firstRow = layout.y ?? 0;
    // Preserve the preferred row when possible; fall back to earlier gaps at the bottom bound.
    for (const [start, end] of [[firstRow, MAX_ROWS - layout.height], [0, firstRow - 1]]) {
      for (let y = start; y <= end; y++) {
        for (let x = 0; x <= COLUMNS - layout.width; x++) {
          const candidate = { ...layout, x, y };
          if (free(candidate)) return candidate;
        }
      }
    }
    throw new Error('Dashboard has no space for this widget.');
  }

  function placeWidgets(widgets, priorityId, bounds) {
    const occupied = [];
    const priority = widgets.find(widget => widget.id === priorityId);
    const ordered = priority ? [priority, ...widgets.filter(widget => widget !== priority)] : widgets;
    for (const widget of ordered) {
      widget.layout = findSpace(normalizeLayout(widget.layout, bounds), occupied);
      occupied.push(widget.layout);
    }
    return widgets;
  }

  function changeLayout(widgets, id, layout, bounds) {
    const widget = widgets.find(item => item.id === id);
    if (!widget) return;
    widget.layout = normalizeLayout(layout, bounds);
    placeWidgets(widgets, id, bounds);
  }

  // Crossing a row changes reading order. Reflow rows from a stable baseline;
  // a move within the same row or into empty space keeps free placement.
  function moveInFlow(widgets, id, proposed, bounds) {
    const moving = widgets.find(widget => widget.id === id);
    if (!moving) return;
    const initial = moving.layout, target = normalizeLayout(proposed, bounds);
    const siblings = widgets.filter(widget => widget !== moving && (widget.parentId || null) === (moving.parentId || null));
    const crossed = siblings.some(widget => {
      const center = widget.layout.y + widget.layout.height / 2;
      return target.y > initial.y ? center > initial.y && center <= target.y + target.height / 2
        : target.y < initial.y && center < initial.y + initial.height && center >= target.y + target.height / 2;
    });
    const group = [moving, ...siblings];
    if (!crossed) {
      // A connected flow follows a block into the space it vacates, even when
      // the block moves into blank space without crossing another row.
      const followers = new Set(), anchors = [initial];
      for (const widget of [...siblings].sort((a, b) => a.layout.y - b.layout.y)) {
        const next = widget.layout;
        if (anchors.some(above => next.y === above.y + above.height
            && next.x < above.x + above.width && next.x + next.width > above.x)) {
          followers.add(widget); anchors.push(next);
        }
      }
      moving.layout = target;
      if (target.y < initial.y) {
        const fixed = [moving, ...siblings.filter(widget => !followers.has(widget))].map(widget => widget.layout);
        for (const widget of followers) {
          let y = Math.max(0, widget.layout.y + target.y - initial.y);
          while (y < widget.layout.y && fixed.some(other => overlaps({ ...widget.layout, y }, other))) y++;
          widget.layout = { ...widget.layout, y }; fixed.push(widget.layout);
        }
      }
      placeWidgets(group, id, bounds); return;
    }
    const rows = new Map();
    for (const widget of siblings) {
      if (!rows.has(widget.layout.y)) rows.set(widget.layout.y, []);
      rows.get(widget.layout.y).push(widget);
    }
    const ordered = [...rows].sort(([a], [b]) => a - b);
    const center = target.y + target.height / 2;
    let index = ordered.findIndex(([y, row]) => {
      const middle = y + Math.max(...row.map(widget => widget.layout.height)) / 2;
      return target.y < initial.y ? center <= middle : center < middle;
    });
    if (index < 0) index = ordered.length;
    moving.layout = target;
    ordered.splice(index, 0, [target.y, [moving]]);
    let y = Math.min(initial.y, ...siblings.map(widget => widget.layout.y));
    for (const [, row] of ordered) {
      const height = Math.max(...row.map(widget => widget.layout.height));
      if (y + height > MAX_ROWS) throw new Error('There is no space to reorder this row.');
      for (const widget of row) widget.layout = { ...widget.layout, y };
      y += height;
    }
    placeWidgets(group, undefined, bounds);
  }

  function resizeLayout(initial, edge, dx, dy, bounds = {}) {
    const minWidth = bounds.minWidth ?? MIN_WIDTH, minHeight = bounds.minHeight ?? MIN_HEIGHT, maxHeight = bounds.maxHeight ?? MAX_HEIGHT;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    let left = initial.x, right = initial.x + initial.width;
    let top = initial.y, bottom = initial.y + initial.height;
    if (edge.includes('w')) left = clamp(left + dx, Math.max(0, right - COLUMNS), right - minWidth);
    if (edge.includes('e')) right = clamp(right + dx, left + minWidth, COLUMNS);
    if (edge.includes('n')) top = clamp(top + dy, Math.max(0, bottom - maxHeight), bottom - minHeight);
    if (edge.includes('s')) bottom = clamp(bottom + dy, top + minHeight, Math.min(MAX_ROWS, top + maxHeight));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  window.DBeaverDashboardLayout = Object.freeze({
    COLUMNS, ROW_HEIGHT, GAP, MAX_ROWS, MIN_WIDTH, MIN_HEIGHT, MAX_HEIGHT,
    normalizeLayout, overlaps, placeWidgets, changeLayout, moveInFlow, resizeLayout
  });
})();

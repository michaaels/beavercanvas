(() => {
  'use strict';
  let active = null;
  function close(restore = false) {
    const previous = active; active = null;
    if (!previous) return;
    previous.panel.remove(); document.removeEventListener('pointerdown', previous.outside, true);
    if (restore && previous.origin?.isConnected) previous.origin.focus();
  }
  function open({ title, entries, anchor, choose, action = 'Insert' }) {
    close();
    const origin = document.activeElement, panel = document.createElement('div');
    panel.className = 'report-command-menu'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', title);
    const search = document.createElement('input'), list = document.createElement('div'), hint = document.createElement('div');
    search.type = 'search'; search.placeholder = title; search.setAttribute('aria-label', title);
    search.setAttribute('role', 'combobox'); search.setAttribute('aria-expanded', 'true'); search.setAttribute('aria-autocomplete', 'list');
    list.id = 'reportCommandOptions'; list.setAttribute('role', 'listbox'); search.setAttribute('aria-controls', list.id);
    hint.className = 'report-command-hint'; hint.textContent = `↑ ↓ Choose · Enter ${action} · Esc Close`;
    panel.append(search, list, hint); document.body.append(panel);
    let matching = [], index = 0;
    function pick(entry) { close(); choose(entry.id); }
    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      matching = entries.filter(entry => `${entry.label} ${entry.keywords || ''}`.toLocaleLowerCase().includes(query));
      index = Math.min(index, Math.max(0, matching.length - 1)); list.replaceChildren();
      matching.forEach((entry, i) => {
        const option = document.createElement('button'); option.type = 'button'; option.textContent = entry.label;
        option.id = `reportCommandOption-${i}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(i === index));
        option.addEventListener('click', () => pick(entry)); list.append(option);
      });
      if (!matching.length) { const empty = document.createElement('p'); empty.textContent = 'No matching components'; list.append(empty); }
      search.setAttribute('aria-activedescendant', matching.length ? `reportCommandOption-${index}` : '');
      list.children[index]?.scrollIntoView({ block: 'nearest' });
    }
    search.addEventListener('input', () => { index = 0; render(); });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (event.target === search && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); index = (index + (event.key === 'ArrowDown' ? 1 : -1) + matching.length) % (matching.length || 1); render();
      } else if (event.target === search && event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation(); if (matching[index]) pick(matching[index]);
      }
    });
    const outside = event => { if (!panel.contains(event.target)) close(); };
    panel.addEventListener('focusout', () => queueMicrotask(() => { if (active?.panel === panel && !panel.contains(document.activeElement)) close(); }));
    active = { panel, origin, outside }; document.addEventListener('pointerdown', outside, true);
    render();
    const bounds = anchor || origin?.getBoundingClientRect() || { left: 24, bottom: 120, top: 120 };
    panel.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, innerHeight - panel.offsetHeight - 8))}px`;
    search.focus();
  }
  window.DBeaverReportCommandMenu = Object.freeze({ open, close, isOpen: () => Boolean(active) });
})();

(() => {
  'use strict';
  function create(root, hooks) {
    let blank = null, caret = null;
    const editable = '[contenteditable]:not([contenteditable="false"])';
    function clear() { caret?.remove(); caret = null; blank = null; }
    function focus(id, selectAll = false) {
      const text = [...root.querySelectorAll('[data-component-id]')].find(frame => frame.dataset.componentId === id)?.querySelector(editable);
      if (!text) return;
      text.focus();
      const range = document.createRange(); range.selectNodeContents(text);
      if (!selectAll) range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    function decorate(frame, widget) {
      if (!['text', 'heading'].includes(widget.type)) return;
      const text = frame.querySelector('.report-paragraph, .report-heading');
      text.contentEditable = 'plaintext-only'; text.setAttribute('role', 'textbox');
      text.setAttribute('aria-label', `Edit ${widget.title} on the sheet`); text.setAttribute('aria-multiline', 'true');
      text.spellcheck = true;
      text.addEventListener('focus', () => {
        clear();
        const value = hooks.value(widget.id);
        if (text.textContent !== value) text.textContent = value;
      });
      text.addEventListener('input', () => hooks.text(widget.id, text.innerText.replace(/\r\n/g, '\n')));
      text.addEventListener('blur', () => hooks.end());
      text.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); text.blur(); frame.focus(); }
      });
      frame.querySelector('.report-component-body').addEventListener('pointerdown', event => {
        if (event.target === event.currentTarget) { event.preventDefault(); focus(widget.id); }
      });
    }
    root.tabIndex = 0;
    root.setAttribute('aria-label', 'Report sheet. Click blank space and type to add text.');
    root.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.report-component')) return;
      const grid = event.target.closest('.report-grid');
      if (!grid) return;
      event.preventDefault(); clear(); hooks.select(); root.focus();
      blank = hooks.position(event, grid);
      if (!blank) return;
      caret = document.createElement('span'); caret.className = 'report-text-caret'; caret.setAttribute('aria-hidden', 'true');
      const box = grid.getBoundingClientRect(), zoom = hooks.zoom();
      caret.style.left = `${(event.clientX - box.x) / zoom}px`;
      caret.style.top = `${blank.layout.y * hooks.rowPitch()}px`;
      grid.append(caret);
    });
    root.addEventListener('dblclick', event => {
      if (blank && !event.target.closest('.report-component')) { event.preventDefault(); insert(''); }
    });
    function insert(initial) {
      const position = blank; clear();
      const id = hooks.insert(position, initial);
      if (id) focus(id);
    }
    root.addEventListener('keydown', event => {
      if (event.target !== root || !blank || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') { clear(); return; }
      if (event.key.length === 1 || event.key === 'Enter') { event.preventDefault(); insert(event.key === 'Enter' ? '' : event.key); }
    });
    return { decorate, clear, focus };
  }
  window.DBeaverReportInlineEdit = Object.freeze({ create });
})();

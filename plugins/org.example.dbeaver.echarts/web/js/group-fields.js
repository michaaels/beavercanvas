(() => {
  'use strict';
  function render(root, config, columns, changed) {
    root.replaceChildren(); root.hidden = !window.DBeaverEChartsAnalytics.canGroup(config.chartType);
    if (root.hidden) return;
    const group = window.DBeaverEChartsAnalytics.normalizeGrouping(config.grouping);
    const split = window.DBeaverEChartsAnalytics.canSplitGroup(config.chartType);
    if (group.seriesColumn && !split) { group.mode = 'category'; config.grouping = group; }
    function select(label, choices, value, apply) {
      const field = document.createElement('label'), input = document.createElement('select');
      field.append(document.createTextNode(label), input); input.setAttribute('aria-label', label);
      choices.forEach(([value, label]) => input.append(new Option(label, value))); input.value = value;
      input.addEventListener('change', () => { apply(input.value); config.grouping = group; delete config.viewport; changed(); });
      root.append(field); return input;
    }
    select('Aggregate repeated categories', [['none', 'Chart default'], ['sum', 'Sum'], ['average', 'Average'], ['count', 'Count rows'], ['min', 'Minimum'], ['max', 'Maximum']], group.aggregate,
      value => { group.aggregate = value; if (value === 'none') group.seriesColumn = ''; });
    select('Second category', [['', 'None'], ...columns.filter(column => column.name !== config.xColumn && !config.yColumns.includes(column.name)).map(column => [column.name, column.name])], group.seriesColumn,
      value => { group.seriesColumn = value; if (value && group.aggregate === 'none') group.aggregate = 'sum'; if (!split) group.mode = 'category'; });
    if (group.seriesColumn && split) select('Show categories as', [['series', 'Separate series'], ['category', 'Combined labels']], group.mode,
      value => { group.mode = value; });
    const hint = document.createElement('p'); hint.className = 'widget-editor-hint';
    hint.textContent = 'Groups the loaded result. To aggregate every database row, use GROUP BY in SQL; a partial result only includes fetched rows.'; root.append(hint);
  }
  window.DBeaverGroupFields = Object.freeze({ render });
})();

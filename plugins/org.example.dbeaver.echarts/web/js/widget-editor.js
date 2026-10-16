(() => {
  'use strict';

  // The detached draft survives dashboard refreshes and only becomes a widget on Apply.
  let session = null;
  let sequence = 0;
  let chart = null;
  let observer = null;
  let elements = null;
  const signature = source => JSON.stringify([source.sql, source.project || '', source.connectionId || '', source.connection || '']);

  function init() {
    if (elements) return;
    elements = Object.fromEntries(['Heading', 'Name', 'AutoTitle', 'Connection', 'Sql', 'Run', 'Stop', 'Status', 'Error',
      'Type', 'Category', 'Refresh', 'Series', 'Mean', 'Range', 'Scale', 'Preview', 'Data', 'DataHint', 'DataSql', 'ChooseChart', 'Map', 'Save', 'Cancel']
      .map(name => [name, document.getElementById(`widgetEditor${name}`)]));
    elements.dialog = document.getElementById('widgetEditor');
    const tabs = [...elements.dialog.querySelectorAll('[data-editor-step]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => setStep(tab.dataset.editorStep));
      tab.addEventListener('keydown', event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setStep(tabs[next].dataset.editorStep); tabs[next].focus();
      });
    });
    elements.ChooseChart.addEventListener('click', () => { setStep('chart'); elements.Type.focus(); });
    window.DBeaverEChartsAnalytics.populateTypes(elements.Type);
    const hint = document.createElement('p'); hint.id = 'widgetEditorHint'; hint.className = 'widget-editor-hint';
    hint.setAttribute('role', 'status'); elements.Type.closest('.widget-editor-fields').after(hint);
    elements.Type.setAttribute('aria-describedby', hint.id);
    elements.Hint = hint;
      const sourceLabel = document.createElement('label'), sourceChoice = document.createElement('select');
      sourceLabel.append(document.createTextNode('Saved query'), sourceChoice); sourceChoice.setAttribute('aria-label', 'Saved query');
      elements.Connection.closest('label').before(sourceLabel); elements.SourceChoice = sourceChoice; elements.SourceLabel = sourceLabel;
      sourceChoice.addEventListener('change', () => {
        const chosen = session.sources.find(source => source.id === sourceChoice.value); if (!chosen) return;
        cancelPreview(); session.draft.source = JSON.parse(JSON.stringify(chosen)); session.draft.source.kind = 'savedQuery';
        session.data = session.hooks.snapshotForSource?.(chosen.id) || null; session.dataBinding = session.data ? signature(chosen) : null;
        session.dataSql = session.data ? chosen.sql : ''; session.previewApproved = false; elements.Sql.value = chosen.sql;
        const index = session.connections.findIndex(connection => connection.project === chosen.project && connection.connectionId === chosen.connectionId);
        if (index >= 0) elements.Connection.value = String(index);
        else {
          if (!elements.Connection.querySelector('option[value="retained"]')) elements.Connection.append(new Option('', 'retained'));
          elements.Connection.querySelector('option[value="retained"]').textContent = `${chosen.project || 'Project'} / ${chosen.connection || chosen.connectionId || 'Choose connection'}`;
          elements.Connection.value = chosen.connectionId || chosen.connection ? 'retained' : '';
        }
        showError(null); renderFields(); renderData(); renderPreview();
        setStatus(session.data ? 'Using the saved query result. Run preview to execute again.' : 'Run preview to load the saved query.');
      });
      const appearance = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = 'Appearance'; appearance.append(legend);
      const legendLabel = document.createElement('label'), showLegend = document.createElement('input');
      showLegend.type = 'checkbox'; showLegend.setAttribute('aria-label', 'Show legend');
      legendLabel.append(showLegend, document.createTextNode(' Show legend'));
      const colorsLabel = document.createElement('label'), colors = document.createElement('input');
      colors.type = 'text'; colors.setAttribute('aria-label', 'Series colors (hex, comma separated)');
      colorsLabel.append(document.createTextNode('Series colors (hex, comma separated)'), colors);
      appearance.append(legendLabel, colorsLabel);
      elements.dialog.querySelector('.widget-editor-advanced').append(appearance);
      elements.Legend = showLegend; elements.Colors = colors;
      showLegend.addEventListener('change', () => { session.draft.chart.legend = showLegend.checked; renderPreview(); });
      colors.addEventListener('input', () => { session.draft.chart.colors = colors.value.split(',').map(value => value.trim()).filter(value => /^#[\da-f]{6}$/i.test(value)).slice(0, 12); renderPreview(); });
    elements.Name.addEventListener('input', () => { session.draft.title = elements.Name.value.slice(0, 200); session.draft.titleMode = 'custom'; elements.AutoTitle.checked = false; updateSave(); });
    elements.AutoTitle.addEventListener('change', () => { session.draft.titleMode = elements.AutoTitle.checked ? 'auto' : 'custom'; renderPreview(); });
    elements.Sql.addEventListener('input', sourceChanged);
    elements.Connection.addEventListener('change', sourceChanged);
      elements.Type.addEventListener('change', () => { session.draft.chart.chartType = elements.Type.value; delete session.draft.chart.viewport; renderFields(); renderPreview(); });
    elements.Category.addEventListener('change', () => {
        delete session.draft.chart.viewport;
      session.draft.chart.xColumn = elements.Category.value;
      session.draft.chart.yColumns = session.draft.chart.yColumns.filter(name => name !== elements.Category.value);
      renderFields();
      renderPreview();
    });
    elements.Refresh.addEventListener('change', () => {
      const [mode, seconds] = elements.Refresh.value.split(':');
      session.draft.refreshPolicy = { mode, intervalSeconds: Number(seconds) };
    });
    for (const [name, mark] of [['Mean', 'markLine'], ['Range', 'markArea'], ['Scale', 'visualMap']]) {
      elements[name].addEventListener('change', () => { session.draft.chart.marks[mark] = elements[name].checked; renderPreview(); });
    }
    elements.Run.addEventListener('click', runPreview);
    elements.Stop.addEventListener('click', () => { cancelPreview(); setStatus('Preview stopped.'); updateSave(); });
    elements.Cancel.addEventListener('click', close);
    elements.dialog.addEventListener('cancel', close);
    elements.Save.addEventListener('click', () => {
      if (!validDraft() || session.chartError) return;
      try {
        session.hooks.save(JSON.parse(JSON.stringify(session.draft)), session.data,
          session.previewApproved && session.dataBinding === signature(session.draft.source));
        close();
      } catch (error) { showError(error.message); }
    });
  }

    function open({ widget, snapshot, isNew, theme, renderer, componentName = 'widget', sources = [], ...hooks }) {
    init();
    close();
    const draft = JSON.parse(JSON.stringify(widget));
    draft.source.kind = 'savedQuery';
    draft.chart.marks ||= {};
    if (draft.refreshPolicy.mode !== 'interval') draft.refreshPolicy = { mode: 'manual', intervalSeconds: 0 };
    session = { draft, data: snapshot || null, dataBinding: snapshot ? signature(draft.source) : null, dataSql: snapshot ? draft.source.sql : '',
        previewApproved: false, previewId: null, loading: false, step: 'query', theme, renderer, hooks, sources };
      elements.SourceLabel.hidden = !sources.length;
      elements.SourceChoice.replaceChildren(new Option('Use this chart query', ''));
      sources.forEach(source => elements.SourceChoice.append(new Option(source.name, source.id)));
      elements.SourceChoice.value = draft.source.id || '';
    elements.Heading.textContent = `${isNew ? 'Add' : 'Edit'} ${componentName}`;
    elements.Save.textContent = `Apply ${componentName}`;
    draft.titleMode ||= isNew || ['Chart', (draft.chart.yColumns || []).join(', '), window.DBeaverEChartsAnalytics.chartTitle(draft.chart)].includes(draft.title) ? 'auto' : 'custom';
    elements.AutoTitle.checked = draft.titleMode === 'auto';
    elements.Name.value = draft.title;
    elements.Sql.value = draft.source.sql;
    if (![...elements.Type.querySelectorAll('option')].some(option => option.value === draft.chart.chartType)) draft.chart.chartType = 'line';
    elements.Type.value = draft.chart.chartType;
    elements.Refresh.value = draft.refreshPolicy.mode === 'interval'
      ? `interval:${draft.refreshPolicy.intervalSeconds}` : 'manual:0';
    if (elements.Refresh.value !== `interval:${draft.refreshPolicy.intervalSeconds}` && draft.refreshPolicy.mode === 'interval') {
      elements.Refresh.append(new Option(`Every ${draft.refreshPolicy.intervalSeconds} s`, `interval:${draft.refreshPolicy.intervalSeconds}`));
      elements.Refresh.value = `interval:${draft.refreshPolicy.intervalSeconds}`;
    }
    elements.Mean.checked = Boolean(draft.chart.marks.markLine);
    elements.Range.checked = Boolean(draft.chart.marks.markArea);
    elements.Scale.checked = Boolean(draft.chart.marks.visualMap);
      elements.Legend.checked = draft.chart.legend !== false;
      elements.Colors.value = (draft.chart.colors || []).join(', ');
    elements.Connection.replaceChildren(new Option('Choose connection', ''));
    let connections = [];
    try { connections = JSON.parse(window.dbeaverListConnections?.() || '[]'); }
    catch (error) { showError('Could not list connections.'); }
    session.connections = Array.isArray(connections) ? connections : [];
    session.connections.forEach((connection, index) => {
      elements.Connection.append(new Option(`${connection.project} / ${connection.connection}`, String(index)));
      if (connection.connectionId === draft.source.connectionId && connection.project === draft.source.project) {
        elements.Connection.value = String(index);
      }
    });
    if (elements.Connection.value === '' && (draft.source.connectionId || draft.source.connection)) {
      elements.Connection.append(new Option(`${draft.source.project || 'Dashboard project'} / ${draft.source.connection || draft.source.connectionId}`, 'retained'));
      elements.Connection.value = 'retained';
    }
    showError(null);
    elements.dialog.querySelector('.widget-editor-advanced').open = false;
    setStatus(snapshot ? 'Using the current result. Run preview to execute this SQL again.' : 'Run preview to load columns and sample rows.');
    renderFields();
    renderData();
    if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
    else elements.dialog.setAttribute('open', '');
    setStep(snapshot ? 'chart' : 'query');
    (snapshot ? elements.Type : elements.Sql).focus();
  }

  function setStep(step) {
    if (!session) return;
    session.step = step;
    elements.dialog.querySelectorAll('[data-editor-step]').forEach(tab => {
      const active = tab.dataset.editorStep === step;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    renderPreview();
  }

  function sourceChanged() {
    if (!session) return;
    cancelPreview();
    session.draft.source.sql = elements.Sql.value;
    const selected = session.connections[Number(elements.Connection.value)];
    if (elements.Connection.value !== '' && elements.Connection.value !== 'retained' && selected) {
      Object.assign(session.draft.source, selected);
    } else if (elements.Connection.value === '') {
      Object.assign(session.draft.source, { project: null, connectionId: null, connection: null });
    }
    // Keep the previous result available in Data while the new SQL is edited or running.
    session.previewApproved = false;
    showError(null);
    setStatus('Source changed. Run preview to verify the returned columns.');
    renderData();
    renderPreview();
    updateSave();
  }

  function cancelPreview() {
    if (!session) return;
    if (session.previewId) session.hooks.cancelPreview(session.previewId);
    session.previewId = null;
    session.loading = false;
    elements.Stop.disabled = true;
    elements.Stop.hidden = true;
    elements.Run.disabled = false;
  }

  function runPreview() {
    if (!session || !session.draft.source.sql.trim()) { showError('Enter SQL for this chart.'); return; }
    if (elements.Connection.value === '') { showError('Choose a connection for this chart.'); return; }
    cancelPreview();
    // Keep the previous result available in Data while the new SQL is edited or running.
    session.previewApproved = false;
    session.previewId = `widget-preview-${Date.now().toString(36)}-${++sequence}`;
    session.loading = true;
    elements.Run.disabled = true;
    elements.Stop.disabled = false;
    elements.Stop.hidden = false;
    showError(null);
    setStatus('Running preview...');
    renderData();
    renderPreview();
    updateSave();
    try { session.hooks.runPreview(session.previewId, session.draft.source); }
    catch (error) { receiveError(session.previewId, error.message); }
  }

  function receiveSnapshot(id, snapshot) {
    if (!session || id !== session.previewId) return false;
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.columns) || !Array.isArray(snapshot.rows) || snapshot.error) {
      return receiveError(id, snapshot?.error || 'Invalid preview result.');
    }
    session.loading = false;
    session.data = snapshot;
    session.dataBinding = signature(session.draft.source);
    session.dataSql = session.draft.source.sql;
    session.previewApproved = true;
    elements.Run.disabled = false;
    elements.Stop.disabled = true;
    elements.Stop.hidden = true;
    const count = snapshot.rows.length;
    setStatus(`${count.toLocaleString()} rows${snapshot.truncated ? ' (partial result)' : ''} loaded. Data is ready for chart setup.`);
    showError(null);
    renderFields();
    renderData();
    if (session.step === 'query') {
      const focusInQuery = document.getElementById('widgetEditorQueryPanel').contains(document.activeElement)
        || document.activeElement === document.getElementById('widgetEditorQueryTab');
      setStep('data');
      if (focusInQuery) document.getElementById('widgetEditorDataTab').focus();
    }
    else renderPreview();
    return true;
  }

  function receiveError(id, message) {
    if (!session || id !== session.previewId) return false;
    session.loading = false;
    elements.Run.disabled = false;
    elements.Stop.disabled = true;
    elements.Stop.hidden = true;
    setStatus('Preview failed. Edit the SQL or connection and try again.');
    showError(message);
    updateSave();
    return true;
  }

  function renderFields() {
    const config = session.draft.chart;
    const isMap = config.chartType === 'map';
    elements.Map.hidden = !isMap;
    elements.Category.closest('label').hidden = isMap;
    elements.Series.closest('fieldset').hidden = isMap;
    elements.dialog.querySelector('.widget-editor-marks').hidden = isMap;
    elements.dialog.querySelector('.widget-editor-advanced summary').textContent = isMap ? 'Refresh' : 'Analysis and refresh';
    const isGauge = config.chartType === 'gauge';
    const definition = window.DBeaverEChartsAnalytics.CHART_TYPES.find(type => type.id === config.chartType);
      const singleValue = definition?.singleValue === true;
      elements.dialog.querySelector('.widget-editor-advanced summary').textContent = isMap || singleValue ? 'Refresh and appearance' : 'Analysis, refresh and appearance';
      elements.Series.closest('fieldset').querySelector('legend').textContent = singleValue ? 'Value' : 'Values and axes';
      elements.dialog.querySelector('.widget-editor-marks').hidden = isMap || singleValue;
      if (singleValue) config.yColumns = config.yColumns.slice(0, 1);
    elements.Hint.textContent = definition?.hint || '';
    const columns = session.data?.columns || [
      ...(config.xColumn ? [{ name: config.xColumn, kind: 'STRING' }] : []),
      ...config.yColumns.map(name => ({ name, kind: 'NUMERIC' }))
    ];
    if (isMap) {
      window.DBeaverMapFields.render(elements.Map, config, columns, session.data?.rows, renderPreview);
      updateSave(); return;
    }
    if (session.data) {
      if (!columns.some(column => column.name === config.xColumn)) {
        config.xColumn = columns.find(column => column.kind === 'DATETIME')?.name
          || columns.find(column => column.kind === 'STRING')?.name || columns[0]?.name || null;
      }
      config.yColumns = config.yColumns.filter(name => columns.some(column => column.name === name && column.kind === 'NUMERIC') && (isGauge || name !== config.xColumn));
      if (!config.yColumns.length) {
        const first = columns.find(column => column.kind === 'NUMERIC' && (isGauge || column.name !== config.xColumn));
        if (first) config.yColumns = [first.name];
      }
    }
    elements.Category.replaceChildren(new Option('Choose category', ''));
    for (const column of columns) elements.Category.append(new Option(`${column.name} (${column.kind})`, column.name));
    elements.Category.value = config.xColumn || '';
    elements.Category.disabled = isGauge;
    elements.Series.replaceChildren();
    for (const column of columns.filter(column => column.kind === 'NUMERIC' && (isGauge || column.name !== config.xColumn))) {
      const row = document.createElement('div');
      row.className = 'series-option';
      const label = document.createElement('label');
      const check = document.createElement('input');
        check.type = singleValue ? 'radio' : 'checkbox';
        if (singleValue) check.name = 'widgetEditorValue';
      check.checked = config.yColumns.includes(column.name);
      check.setAttribute('aria-label', `Series ${column.name}`);
      const name = document.createElement('span');
      name.textContent = column.name;
      label.append(check, name);
      const axis = document.createElement('select');
      axis.setAttribute('aria-label', `Axis ${column.name}`);
        axis.hidden = singleValue;
      axis.append(new Option('Left', 'left'), new Option('Right', 'right'));
      axis.value = definition?.singleAxis ? 'left' : config.yAxes[column.name] || 'left';
      axis.disabled = !check.checked || definition?.singleAxis;
      axis.title = definition?.singleAxis ? 'Stacked series share one axis.' : '';
      check.addEventListener('change', () => {
          if (singleValue) { config.yColumns = [column.name]; renderPreview(); return; }
        if (check.checked && config.yColumns.length >= 12) {
          check.checked = false; showError('A chart supports up to 12 series.'); return;
        }
        config.yColumns = check.checked ? [...config.yColumns, column.name] : config.yColumns.filter(name => name !== column.name);
        axis.disabled = !check.checked || definition?.singleAxis;
        renderPreview();
      });
      axis.addEventListener('change', () => { config.yAxes[column.name] = axis.value; renderPreview(); });
      row.append(label, axis);
      elements.Series.appendChild(row);
    }
    updateSave();
  }

  function validDraft() {
    return Boolean(session && !session.loading && session.draft.title.trim() && session.draft.source.sql.trim()
      && elements.Connection.value !== '' && (!session.data || session.dataBinding === signature(session.draft.source))
      && (session.draft.chart.chartType === 'map'
        ? !window.DBeaverGeoData.mappingError(session.draft.chart.map, session.data?.columns || [])
        : session.draft.chart.xColumn && session.draft.chart.yColumns.length));
  }
  function updateSave() { elements.Save.disabled = !validDraft() || session.chartError === true; }
  function setStatus(message) { elements.Status.textContent = message; }
  function showError(message) { elements.Error.hidden = !message; elements.Error.textContent = message || ''; }

  function renderData() {
    elements.Data.replaceChildren();
    elements.DataSql.textContent = session.dataSql;
    elements.DataSql.closest('details').hidden = !session.data;
    const previous = session.data && session.dataBinding !== signature(session.draft.source);
    elements.DataHint.textContent = previous
      ? 'Previous query result retained for reference. Run preview in Query to use the new SQL; Apply is disabled until it succeeds.'
      : session.data
      ? 'Sample: up to 10 rows and 8 columns. Choose a chart to map these columns.'
      : 'Run preview in Query to load columns and sample rows.';
    if (!session.data) return;
    const columns = session.data.columns.slice(0, 8);
    const head = document.createElement('tr');
    for (const column of columns) { const cell = document.createElement('th'); cell.textContent = column.name; head.appendChild(cell); }
    elements.Data.appendChild(head);
    for (const row of session.data.rows.slice(0, 10)) {
      const line = document.createElement('tr');
      columns.forEach((column, index) => {
        const cell = document.createElement('td');
        const value = row[index];
        cell.textContent = value === null || value === undefined ? '(null)' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        line.appendChild(cell);
      });
      elements.Data.appendChild(line);
    }
  }

  function disposeChart() { observer?.disconnect(); observer = null; chart?.dispose(); chart = null; }
  function renderPreview() {
    if (session.draft.titleMode === 'auto') { session.draft.title = window.DBeaverEChartsAnalytics.chartTitle(session.draft.chart); elements.Name.value = session.draft.title; }
    disposeChart();
    elements.Preview.replaceChildren();
    session.chartError = false;
    updateSave();
    if (!session.data?.rows.length || !validDraft()) {
      elements.Preview.textContent = session.loading ? 'Loading preview...'
        : session.data?.rows.length === 0 ? 'The query returned no rows.'
        : session.data && session.dataBinding !== signature(session.draft.source) ? 'Previous query result retained in Data. Run preview to validate the new SQL.'
        : session.draft.chart.chartType === 'map' ? 'Choose the location fields for this map.'
        : session.data ? 'Choose a category and numeric series. Adjust the SQL if it has no numeric columns.'
        : 'Run preview to load data for this chart.';
      return;
    }
    const config = session.draft.chart;
    const columns = session.data.columns;
    const xIndex = columns.findIndex(column => column.name === config.xColumn);
    const yIndices = config.yColumns.map(name => columns.findIndex(column => column.name === name && column.kind === 'NUMERIC')).filter(index => index >= 0);
    try {
      const option = window.DBeaverEChartsAnalytics.buildOption({ rows: session.data.rows, columns, rowCount: session.data.rows.length,
        xIndex, yIndices, yAxes: Object.fromEntries(yIndices.map(index => [index, config.yAxes[columns[index].name] || 'left'])),
        chartType: config.chartType, map: config.map, marks: config.marks, colors: config.colors, legend: config.legend, viewport: config.viewport, theme: session.theme });
      if (session.step !== 'chart') return;
      chart = window.echarts.init(elements.Preview, null, { renderer: session.renderer });
      chart.setOption(option, { notMerge: true, lazyUpdate: false });
      showError(null);
      if (typeof ResizeObserver === 'function') { observer = new ResizeObserver(() => chart?.resize()); observer.observe(elements.Preview); }
    } catch (error) { disposeChart(); session.chartError = true; showError(error.message); updateSave(); }
  }

  function close() {
    if (!elements) return;
    cancelPreview();
    disposeChart();
    session = null;
    if (typeof elements.dialog.close === 'function') elements.dialog.close();
    else elements.dialog.removeAttribute('open');
  }

  function setAppearance(theme, renderer) {
    if (!session) return;
    session.theme = theme;
    session.renderer = renderer;
    renderPreview();
  }

  window.DBeaverWidgetEditor = Object.freeze({ open, close, receiveSnapshot, receiveError, setAppearance });
})();

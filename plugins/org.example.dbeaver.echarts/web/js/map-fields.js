(() => {
  'use strict';
  const G = window.DBeaverGeoData;
  function render(root, chart, columns, rows, onChange) {
    chart.map = G.infer(chart, columns);
    const map = chart.map;
    root.replaceChildren(); root.classList.add('map-fields');
    const section = title => {
      const group = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = title; group.append(legend); root.append(group); return group;
    };
    const location = section('Location');
    const select = (group, title, key, choices, empty) => {
      const label = document.createElement('label'), text = document.createElement('span'), input = document.createElement('select');
      text.textContent = title; input.setAttribute('aria-label', title);
      if (empty !== undefined) input.append(new Option(empty, ''));
      choices.forEach(([value, name]) => input.append(new Option(name, value)));
      // Keep missing saved fields visible instead of silently remapping them.
      if (map[key] && ![...input.options].some(option => option.value === map[key])) input.append(new Option(`${map[key]} (missing)`, map[key]));
      input.value = map[key]; label.append(text, input); group.append(label);
      input.addEventListener('change', () => {
        map[key] = input.value; render(root, chart, columns, rows, onChange); onChange();
        [...root.querySelectorAll('select')].find(control => control.getAttribute('aria-label') === title)?.focus();
      });
      return input;
    };
    const choices = columns.map(column => [column.name, `${column.name} (${column.kind})`]);
    select(location, 'Location format', 'mode', [['latLon', 'Latitude and longitude columns'], ['coordinates', 'Coordinates in one column'], ['geo', 'Geographic point (GeoJSON / WKT)']]);
    if (map.mode === 'latLon') {
      select(location, 'Longitude', 'longitude', choices, 'Choose longitude');
      select(location, 'Latitude', 'latitude', choices, 'Choose latitude');
    } else {
      select(location, map.mode === 'geo' ? 'Geographic field' : 'Coordinates field', 'location', choices, 'Choose location field');
      if (map.mode === 'coordinates') select(location, 'Coordinate order', 'order', [['lonLat', 'Longitude, latitude'], ['latLon', 'Latitude, longitude']]);
    }
    const help = document.createElement('p'); help.className = 'map-fields-help';
    help.textContent = map.mode === 'geo' ? 'WGS84: GeoJSON Point / Feature or POINT (longitude latitude). For a database geometry, return ST_AsText(...) or ST_AsGeoJSON(...) in the query.'
      : map.mode === 'coordinates' ? 'Examples: [-78.4678, -0.1807] or -78.4678, -0.1807. Choose the order used by your data. WGS84 degrees only.'
      : 'WGS84 degrees: longitude from −180 to 180; latitude from −90 to 90.';
    location.append(help);
    const content = section('Point data');
    select(content, 'Point name', 'label', choices, 'Row number');
    select(content, 'Size and color', 'value', choices.filter(([name]) => columns.some(column => column.name === name && column.kind === 'NUMERIC')), 'Equal-size points');
    const details = document.createElement('div'); details.className = 'map-detail-fields';
    const caption = document.createElement('span'); caption.textContent = 'Additional tooltip fields (up to 12)'; content.append(caption, details);
    columns.forEach(column => {
      const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox';
      input.checked = map.details.includes(column.name); input.disabled = !input.checked && map.details.length >= 12;
      input.setAttribute('aria-label', `Tooltip ${column.name}`); label.append(input, document.createTextNode(column.name)); details.append(label);
      input.addEventListener('change', () => {
        map.details = input.checked ? [...map.details, column.name] : map.details.filter(name => name !== column.name);
        render(root, chart, columns, rows, onChange); onChange();
        [...root.querySelectorAll('input')].find(control => control.getAttribute('aria-label') === `Tooltip ${column.name}`)?.focus();
      });
    });
    const status = document.createElement('p'); status.className = 'map-fields-status'; status.setAttribute('role', 'status');
    try {
      const result = G.data(map, columns, rows || []);
      status.textContent = rows ? `${result.points.length} of ${rows.length} points ready. ${result.invalidCoordinates} invalid coordinates; ${result.invalidValues} missing numeric values.` : 'Run preview to validate coordinates.';
      status.dataset.invalid = String(Boolean(rows?.length && !result.points.length));
    } catch (error) { status.textContent = error.message; status.dataset.invalid = 'true'; }
    root.append(status);
  }
  window.DBeaverMapFields = Object.freeze({ render });
})();

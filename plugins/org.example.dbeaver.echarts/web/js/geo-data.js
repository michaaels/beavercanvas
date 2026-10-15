(() => {
  'use strict';

  // Map definitions contain column names only. Coordinates are always WGS84 degrees.
  const field = value => typeof value === 'string' ? value.slice(0, 200) : '';
  function normalize(input = {}) {
    return {
      mode: ['latLon', 'coordinates', 'geo'].includes(input.mode) ? input.mode : 'latLon',
      longitude: field(input.longitude), latitude: field(input.latitude), location: field(input.location),
      order: input.order === 'latLon' ? 'latLon' : 'lonLat', label: field(input.label), value: field(input.value),
      details: [...new Set((Array.isArray(input.details) ? input.details : []).filter(name => typeof name === 'string').map(field))].slice(0, 12)
    };
  }
  function infer(chart, columns) {
    if (chart.map) return normalize(chart.map);
    const named = pattern => columns.find(column => pattern.test(column.name))?.name || '';
    const numeric = name => columns.some(column => column.name === name && column.kind === 'NUMERIC');
    const longitude = named(/^(lon|lng|long|longitude|longitud)$/i);
    const latitude = named(/^(lat|latitude|latitud)$/i);
    const legacy = numeric(chart.xColumn) && numeric(chart.yColumns?.[0]) && chart.yColumns.length >= 2;
    const location = columns.find(column => column.kind === 'GEOMETRY')?.name || named(/^(geo|geom|geometry|location|ubicacion|coordinates|coordenadas)$/i);
    const map = normalize({
      mode: longitude && latitude || legacy ? 'latLon' : /^(coordinates|coordenadas)$/i.test(location) ? 'coordinates' : location ? 'geo' : 'latLon',
      longitude: legacy ? chart.xColumn : longitude, latitude: legacy ? chart.yColumns[0] : latitude, location,
      label: named(/^(ciudad|city|nombre|name|label|etiqueta)$/i)
    });
    map.value = (legacy ? chart.yColumns[1] : chart.yColumns?.find(name => numeric(name) && ![map.longitude, map.latitude].includes(name)))
      || columns.find(column => column.kind === 'NUMERIC' && ![map.longitude, map.latitude].includes(column.name) && !/^id$/i.test(column.name))?.name || '';
    return map;
  }
  const number = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
    && Number.isFinite(Number(value)) ? Number(value) : NaN;
  function point(value, mode, order = 'lonLat') {
    let pair;
    if (mode === 'geo') {
      if (typeof value === 'string') {
        const text = value.trim();
        const wkt = /^(?:SRID=(\d+);\s*)?POINT\s*\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*\)$/i.exec(text);
        if (wkt) {
          if (wkt[1] && wkt[1] !== '4326') return null;
          pair = [wkt[2], wkt[3]];
        } else { try { value = JSON.parse(text); } catch { return null; } }
      }
      if (!pair) {
        if (!value || typeof value !== 'object' || value.crs) return null;
        if (value.type === 'Feature') value = value.geometry;
        if (!value || value.type !== 'Point' || value.crs || !Array.isArray(value.coordinates)) return null;
        pair = value.coordinates.slice(0, 2);
      }
    } else {
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { value = value.trim().split(/[,;\s]+/); }
      }
      if (!Array.isArray(value) || value.length !== 2) return null;
      pair = order === 'latLon' ? [value[1], value[0]] : value;
    }
    const [lon, lat] = pair.map(number);
    return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
  }
  function mappingError(map, columns) {
    const has = name => name && columns.some(column => column.name === name);
    if (map.mode === 'latLon') {
      if (!has(map.longitude) || !has(map.latitude)) return 'Choose longitude and latitude columns. Include both in the SQL result.';
      if (map.longitude === map.latitude) return 'Longitude and latitude must use different columns.';
    } else if (!has(map.location)) return 'Choose the column containing coordinates or a geographic point.';
    for (const name of [map.label, map.value, ...map.details].filter(Boolean)) {
      if (!has(name)) return `Column "${name}" is missing. Review the map fields after changing the query.`;
    }
    if (map.value && !columns.some(column => column.name === map.value && column.kind === 'NUMERIC')) return 'Choose a numeric value, or use equal-size points.';
    return null;
  }
  function data(map, columns, rows) {
    const error = mappingError(map, columns);
    if (error) throw new Error(error);
    const index = name => columns.findIndex(column => column.name === name);
    const lon = index(map.longitude), lat = index(map.latitude), location = index(map.location), label = index(map.label), value = index(map.value);
    let invalidCoordinates = 0, invalidValues = 0;
    const points = [];
    rows.forEach((row, rowIndex) => {
      const coordinates = map.mode === 'latLon' ? point([row[lon], row[lat]], 'coordinates') : point(row[location], map.mode, map.order);
      if (!coordinates) { invalidCoordinates++; return; }
      const metric = value < 0 ? 1 : number(row[value]);
      if (!Number.isFinite(metric)) { invalidValues++; return; }
      points.push({ name: label < 0 || row[label] == null ? `Row ${rowIndex + 1}` : String(row[label]),
        value: [...coordinates, metric], filterValue: label < 0 ? null : row[label],
        details: map.details.map(name => ({ name, value: row[index(name)] })) });
    });
    return { points, invalidCoordinates, invalidValues };
  }
  window.DBeaverGeoData = Object.freeze({ normalize, infer, point, mappingError, data });
})();

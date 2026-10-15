'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = vm.createContext({ window: {} });
for (const file of ['geo-data', 'analytics', 'dashboard-layout', 'dashboard', 'report-model', 'report-execution']) {
  vm.runInContext(fs.readFileSync(`plugins/org.example.dbeaver.echarts/web/js/${file}.js`, 'utf8'), sandbox);
}
const { DBeaverGeoData: G, DBeaverEChartsAnalytics: A, DBeaverEChartsDashboard: D, DBeaverReportModel: M } = sandbox.window;
const plain = value => JSON.parse(JSON.stringify(value));
for (const input of ['[-78.4678,-0.1807]', '-78.4678, -0.1807', '-78.4678; -0.1807', [-78.4678, -0.1807]]) {
  assert.deepEqual(plain(G.point(input, 'coordinates')), [-78.4678, -0.1807]);
}
assert.deepEqual(plain(G.point('-0.1807, -78.4678', 'coordinates', 'latLon')), [-78.4678, -0.1807]);
for (const input of ['POINT (-78.4678 -0.1807)', 'SRID=4326;POINT(-78.4678 -0.1807)',
  '{"type":"Point","coordinates":[-78.4678,-0.1807]}', { type: 'Feature', geometry: { type: 'Point', coordinates: [-78.4678, -0.1807, 2000] } }]) {
  assert.deepEqual(plain(G.point(input, 'geo')), [-78.4678, -0.1807]);
}
for (const input of [null, '', [null, 0], [false, 0], [' ', 0], [181, 0], [0, -91], ['NaN', 0], [0], [0, 0, 0]]) assert.equal(G.point(input, 'coordinates'), null);
for (const input of ['SRID=3857;POINT(1 2)', 'POINT EMPTY', 'POLYGON ((0 0,1 1,0 0))', '{"type":"Point","coordinates":[1,100]}',
  { type: 'Point', coordinates: [1, 2], crs: { name: 'mercator' } }]) assert.equal(G.point(input, 'geo'), null);
assert.deepEqual(plain(G.point([0, 0], 'coordinates')), [0, 0], 'Zero coordinates are valid');
const columns = [{ name: 'ciudad', kind: 'STRING' }, { name: 'longitud', kind: 'NUMERIC' }, { name: 'latitud', kind: 'NUMERIC' },
  { name: 'ventas', kind: 'NUMERIC' }, { name: '<detail>', kind: 'STRING' }];
const rows = [['<img src=x onerror=alert(1)>', -78, -2, 0, '<script>bad</script>'], ['Missing', null, 0, 10, ''],
  ['Outside', -78, 100, 10, ''], ['No metric', 0, 0, null, '']];
const config = G.infer({ xColumn: 'ciudad', yColumns: ['ventas'] }, columns);
assert.equal(config.longitude, 'longitud'); assert.equal(config.latitude, 'latitud'); assert.equal(config.value, 'ventas');
assert.equal(config.label, 'ciudad'); config.details = ['<detail>'];
const result = G.data(config, columns, rows);
assert.equal(result.points.length, 1); assert.equal(result.invalidCoordinates, 2); assert.equal(result.invalidValues, 1);
assert.equal(result.points[0].value[2], 0);
const theme = { background: '#fff', foreground: '#333', muted: '#777', border: '#aaa', controlBackground: '#eee' };
const option = A.buildOption({ chartType: 'map', map: config, columns, rows, rowCount: rows.length, xIndex: -1, yIndices: [], theme });
const tooltip = option.tooltip.formatter({ name: result.points[0].name, value: result.points[0].value, data: result.points[0] });
assert.ok(tooltip.includes('&lt;img') && tooltip.includes('&lt;script&gt;') && !tooltip.includes('<img'));
assert.ok(tooltip.includes('&lt;detail&gt;'));
assert.equal(option.series[0].data.length, 1);
assert.throws(() => G.data({ ...config, latitude: 'missing' }, columns, rows), /Choose longitude/);
assert.throws(() => G.data({ ...config, latitude: 'longitud' }, columns, rows), /different columns/);
assert.throws(() => G.data({ ...config, label: 'missing' }, columns, rows), /missing/);
assert.throws(() => A.buildOption({ chartType: 'map', map: config, columns, rows: rows.slice(1), xIndex: -1, yIndices: [], theme }), /No valid map points/);
const equal = A.buildOption({ chartType: 'map', map: { ...config, value: '' }, columns, rows, xIndex: -1, yIndices: [], theme });
assert.equal(equal.series[0].data.length, 2); assert.equal(equal.series[0].symbolSize([1, 2, 1]), 10); assert.equal(equal.visualMap, undefined);
const legacy = A.buildOption({ chartType: 'map', columns, rows: rows.slice(0, 1), xIndex: 1, yIndices: [2, 3], theme });
assert.deepEqual(plain(legacy.series[0].data[0].value), [-78, -2, 0]);
const widget = D.createWidget({ chartType: 'map', map: { ...config, password: 'secret' }, xColumn: null, yColumns: [] },
  { source: { sql: 'SELECT city, ST_AsGeoJSON(position) AS geo FROM points', connectionId: 'demo' } });
const dashboard = D.portableDashboard({ schemaVersion: 1, widgets: [widget] });
assert.deepEqual(plain(D.normalizeDashboard(plain(dashboard)).widgets[0].chart.map), plain(config));
const report = M.fromDashboard(dashboard), roundTrip = M.normalize(plain(report));
assert.deepEqual(plain(roundTrip.widgets[0].config.chart.map), plain(config));
assert.ok(!JSON.stringify(roundTrip).includes('secret'));
const execution = sandbox.window.DBeaverReportExecution.create({});
execution.seed(roundTrip.sources[0].id, { columns, rows });
assert.ok(execution.ready(roundTrip), 'A map needs no category or Y series to export');
execution.seed(roundTrip.sources[0].id, { columns, rows: rows.slice(1) });
assert.throws(() => execution.ready(roundTrip), /No valid map points/);
assert.equal(G.normalize({ details: Array.from({ length: 30 }, (_, i) => `field${i}`) }).details.length, 12);
console.log('Map data OK: WGS84 ranges, explicit coordinate order, GeoJSON/WKT points, null/zero, invalid rows, safe tooltips, legacy mappings and dashboard/report round trips');

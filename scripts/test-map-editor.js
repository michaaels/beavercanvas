'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser } = require('./browser-test-runtime');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'plugins/org.example.dbeaver.echarts/web');
const output = path.join(root, '.dev/map-tests'); fs.mkdirSync(output, { recursive: true });
const assets = Object.fromEntries([['echarts', 'js/echarts.min.js'], ['worldMap', 'js/world-map.js'], ['geoData', 'js/geo-data.js'],
  ['analytics', 'js/analytics.js'], ['widgets', 'js/report-widgets.js'], ['paperCss', 'css/report-paper.css']].map(([key, file]) => [key, fs.readFileSync(path.join(web, file), 'utf8')]));
const snapshot = { schemaVersion: 1, columns: [
  { name: 'ciudad', kind: 'STRING' }, { name: 'longitud', kind: 'NUMERIC' }, { name: 'latitud', kind: 'NUMERIC' },
  { name: 'ventas', kind: 'NUMERIC' }, { name: 'region', kind: 'STRING' }, { name: 'coordinates', kind: 'STRING' }, { name: 'geo', kind: 'GEOMETRY' }
], rows: [['Quito', -78.4678, -0.1807, 18000, 'Sierra', '[-0.1807,-78.4678]', 'POINT (-78.4678 -0.1807)'],
  ['Cuenca', -79.0059, -2.9001, 9000, 'Sierra', '[-2.9001,-79.0059]', '{"type":"Point","coordinates":[-79.0059,-2.9001]}'],
  ['Invalid', null, null, 100, 'Unknown', null, null]], rowCount: 3,
  source: { name: 'Map query', kind: 'activeResultSet', sql: 'SELECT ciudad, longitud, latitud, ventas, region, coordinates, geo FROM cities', project: 'General', connectionId: 'demo', connection: 'Demo' } };
async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ snapshot, assets }) => {
      window.queries = []; window.saved = [];
      window.dbeaverBrowserReady = () => true; window.dbeaverSaveConfiguration = () => true; window.dbeaverDashboardChanged = () => true;
      window.dbeaverListConnections = () => JSON.stringify([{ project: 'General', connectionId: 'demo', connection: 'Demo' }]);
      window.dbeaverApproveWidgetQueries = () => true; window.dbeaverResetDashboardQueries = () => true; window.dbeaverCancelWidgetQuery = () => true;
      window.dbeaverSaveDashboard = json => { window.saved.push(JSON.parse(json)); return 'map.echarts-dashboard.json'; };
      window.dbeaverSaveReport = json => { window.saved.push(JSON.parse(json)); return 'map.echarts-report.json'; };
      window.dbeaverReportExportAssets = () => JSON.stringify(assets);
      window.dbeaverExecuteWidgetQuery = (id, sql) => {
        window.queries.push({ id, sql });
        setTimeout(() => sql.includes('BROKEN') ? window.DBeaverECharts.setWidgetError(id, 'SQL test error')
          : window.DBeaverECharts.setWidgetSnapshot(id, snapshot), 10); return true;
      };
    }, { snapshot, assets });
    await page.goto(pathToFileURL(path.join(web, 'index.html')).href);
    await page.evaluate(snapshot => window.DBeaverECharts.setSnapshot(snapshot), snapshot);
    await page.locator('#chartType').selectOption('map');
    const resultFields = page.locator('#resultMapFields');
    assert.equal(await resultFields.getByLabel('Longitude', { exact: true }).inputValue(), 'longitud');
    assert.equal(await resultFields.getByLabel('Latitude', { exact: true }).inputValue(), 'latitud');
    assert.equal(await page.locator('#xField').isVisible(), false);
    await resultFields.getByLabel('Size and color').selectOption('ventas');
    await resultFields.getByLabel('Tooltip region', { exact: true }).check();
    assert.match(await resultFields.locator('.map-fields-status').textContent(), /2 of 3 points ready/);
    assert.equal(await page.evaluate(() => window.echarts.getInstanceByDom(document.querySelector('#chart')).getOption().series[0].data.length), 2);
    await page.waitForFunction(() => window.echarts.getInstanceByDom(document.querySelector('#chart')).getZr().animation.isFinished());
    await page.screenshot({ path: path.join(output, 'result-map.png') });
    await page.locator('#viewMode').selectOption('dashboard'); await page.locator('#addWidget').click();
    const fields = page.locator('#widgetEditorMap');
    assert.equal(await page.locator('#widgetEditorCategory').isVisible(), false);
    assert.equal(await page.locator('#widgetEditorSeries').isVisible(), false);
    await fields.getByLabel('Latitude', { exact: true }).selectOption('ventas');
    assert.equal(await page.locator('#widgetEditorSave').isDisabled(), true);
    assert.match(await fields.locator('.map-fields-status').textContent(), /0 of 3 points ready/);
    await fields.getByLabel('Latitude', { exact: true }).selectOption('latitud');
    await fields.getByLabel('Location format').selectOption('coordinates');
    await fields.getByLabel('Coordinates field').selectOption('coordinates');
    await fields.getByLabel('Coordinate order').selectOption('latLon');
    const previewPoints = () => page.evaluate(() => window.echarts.getInstanceByDom(document.querySelector('#widgetEditorPreview')).getOption().series[0].data);
    assert.deepEqual((await previewPoints())[0].value, [-78.4678, -0.1807, 18000]);
    await page.waitForFunction(() => window.echarts.getInstanceByDom(document.querySelector('#widgetEditorPreview')).getZr().animation.isFinished());
    await fields.getByLabel('Location format').selectOption('geo');
    await fields.getByLabel('Geographic field').selectOption('geo');
    assert.deepEqual((await previewPoints())[0].value, [-78.4678, -0.1807, 18000]);
    await page.evaluate(() => window.DBeaverECharts.setTheme({ background: '#292e35', foreground: '#e5edf5', muted: '#a4b1c1', border: '#526171', grid: '#414b57', controlBackground: '#343c46', dark: true }));
    await page.waitForFunction(() => window.echarts.getInstanceByDom(document.querySelector('#widgetEditorPreview')).getZr().animation.isFinished());
    await page.screenshot({ path: path.join(output, 'map-widget-editor.png') });
    await page.locator('#widgetEditorSave').click();
    const dashboard = await page.evaluate(() => window.DBeaverECharts.dashboardDocument());
    assert.equal(dashboard.widgets[0].chart.map.mode, 'geo'); assert.deepEqual(dashboard.widgets[0].chart.map.details, ['region']);
    await page.evaluate(() => {
      const chart = window.echarts.getInstanceByDom(document.querySelector('.widget-chart')), data = chart.getOption().series[0].data[0];
      chart.trigger('click', { data, value: data.value });
    });
    assert.equal(await page.evaluate(() => window.DBeaverECharts.dashboardDocument().filters.ciudad), 'Quito', 'Map drill-down uses the point-name field');
    await page.locator('#clearFilters').click();
    await page.locator('#saveDashboard').click();
    assert.deepEqual(await page.evaluate(() => window.saved.at(-1)), dashboard);
    await page.locator('.widget-edit').click(); await page.locator('#widgetEditorQueryTab').click();
    const changedSql = snapshot.source.sql + ' WHERE region = \'Sierra\'';
    await page.locator('#widgetEditorSql').fill(changedSql);
    await page.locator('#widgetEditorDataTab').click();
    assert.equal(await page.locator('#widgetEditorData tr').count(), 4);
    assert.equal(await page.locator('#widgetEditorDataSql').textContent(), snapshot.source.sql);
    assert.match(await page.locator('#widgetEditorDataHint').textContent(), /Previous query result/);
    assert.equal(await page.locator('#widgetEditorSave').isDisabled(), true);
    await page.locator('#widgetEditorQueryTab').click(); await page.locator('#widgetEditorSql').fill('SELECT BROKEN'); await page.locator('#widgetEditorRun').click();
    await page.waitForFunction(() => document.querySelector('#widgetEditorError').textContent === 'SQL test error');
    await page.locator('#widgetEditorDataTab').click(); assert.equal(await page.locator('#widgetEditorData tr').count(), 4, 'Failed preview retains the reference result');
    await page.locator('#widgetEditorQueryTab').click(); await page.locator('#widgetEditorSql').fill(changedSql); await page.locator('#widgetEditorRun').click();
    await page.waitForFunction(() => document.querySelector('#widgetEditorDataSql').textContent.includes('WHERE'));
    await page.locator('#widgetEditorChooseChart').click(); await page.locator('#widgetEditorSave').click();
    assert.equal(await page.evaluate(() => window.DBeaverECharts.dashboardDocument().widgets[0].source.sql), changedSql);
    const count = await page.evaluate(() => window.queries.length);
    await page.evaluate(dashboard => window.DBeaverECharts.loadDashboard(dashboard, true), dashboard);
    assert.equal(await page.evaluate(() => window.queries.length), count, 'Opening a map never executes saved SQL');
    assert.deepEqual(await page.evaluate(() => window.DBeaverECharts.dashboardDocument()), dashboard);
    await page.evaluate(({ dashboard, snapshot }) => {
      const invalid = JSON.parse(JSON.stringify(dashboard.widgets[0])); invalid.id = 'invalid-map';
      invalid.layout = { ...invalid.layout, y: invalid.layout.y + invalid.layout.height };
      window.DBeaverECharts.loadDashboard({ ...dashboard, widgets: [invalid, dashboard.widgets[0]] }, true);
      window.dbeaverExecuteWidgetQuery = (id, sql) => {
        window.queries.push({ id, sql });
        // Independent queries can finish in either order; deliver the invalid one first.
        setTimeout(() => window.DBeaverECharts.setWidgetSnapshot(id, id === 'invalid-map' ? { ...snapshot, rows: [snapshot.rows[2]] } : snapshot), id === 'invalid-map' ? 10 : 80); return true;
      };
    }, { dashboard, snapshot });
    await page.locator('#refreshDashboard').click(); await page.locator('#runReviewedQueries').click();
    await page.waitForFunction(() => document.querySelector('[data-widget-id="invalid-map"] .widget-chart').textContent.includes('No valid map points'));
    await page.waitForFunction(validId => [...document.querySelectorAll('[data-widget-id]')]
      .find(element => element.dataset.widgetId === validId)?.querySelector('.widget-chart canvas'), dashboard.widgets[0].id);
    assert.equal(await page.locator('.widget-chart canvas').count(), 1, 'An invalid map does not block other widgets');
    // Report conversion/editor and portable HTML use the same geographic mapping.
    await page.goto(pathToFileURL(path.join(web, 'report.html')).href);
    await page.evaluate(dashboard => window.DBeaverECharts.loadReport(window.DBeaverReportModel.fromDashboard(dashboard)), dashboard);
    await page.locator('[data-layer-id]').first().click();
    await page.getByRole('button', { name: 'Configure chart and preview SQL' }).click();
    await page.locator('#widgetEditorRun').click();
    await page.waitForFunction(() => document.querySelector('#widgetEditorDataSql').textContent.length > 0);
    await page.locator('#widgetEditorChooseChart').click();
    await fields.getByLabel('Size and color').selectOption('');
    await page.locator('#widgetEditorSave').click();
    const portable = await page.evaluate(({ snapshot, assets }) => {
      const report = window.DBeaverECharts.reportDocument(), sourceId = report.widgets[0].sourceId;
      const option = window.DBeaverReportWidgets.chartOption(report.widgets[0], snapshot);
      const data = { columns: snapshot.columns, rows: snapshot.rows };
      return { report, points: option.series[0].data, html: window.DBeaverReportExport.interactive(report, { [sourceId]: data }, {}, assets) };
    }, { snapshot, assets });
    assert.equal(portable.report.widgets[0].config.chart.map.value, ''); assert.equal(portable.points.length, 2);
    assert.ok(!portable.html.includes(snapshot.source.sql) && !portable.html.includes('"connectionId"'), 'Shared map HTML excludes SQL and connection references');
    const file = path.join(output, 'map-offline.html'); fs.writeFileSync(file, portable.html);
    const offline = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    offline.on('pageerror', error => errors.push(error.message));
    await offline.route(/^https?:/, route => { errors.push('Unexpected external request'); return route.abort(); });
    await offline.goto(pathToFileURL(file).href);
    assert.equal(await offline.locator('.report-chart canvas').count(), 1);
    assert.equal(await offline.locator('.report-chart').evaluate(element => window.echarts.getInstanceByDom(element).getOption().series[0].data.length), 2);
    assert.equal(await offline.evaluate(() => document.querySelector('.report-data-error')?.textContent || ''), '');
    await offline.close();
    await page.setViewportSize({ width: 600, height: 750 });
    await page.locator('[data-layer-id]').first().click(); await page.getByRole('button', { name: 'Configure chart and preview SQL' }).click();
    await page.locator('#widgetEditorChartTab').click();
    assert.equal(await fields.getByLabel('Location format').isVisible(), true);
    assert.ok(await page.evaluate(() => document.querySelector('#widgetEditor').scrollWidth <= document.querySelector('#widgetEditor').clientWidth));
    await page.screenshot({ path: path.join(output, 'map-editor-narrow.png') });
    assert.deepEqual(errors, []);
    console.log('Map editor OK: result chart, explicit location modes/order, invalid rows, tooltip fields, Apply/save/reopen, retained Data SQL/result, failed preview, Report Designer and offline HTML');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

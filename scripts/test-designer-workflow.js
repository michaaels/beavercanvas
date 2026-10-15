'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser } = require('./browser-test-runtime');
const web = path.resolve(__dirname, '../plugins/org.example.dbeaver.echarts/web');
const output = path.resolve(__dirname, '../.dev/workflow-tests'); fs.mkdirSync(output, { recursive: true });
const data = { schemaVersion: 1, columns: [{ name: 'ciudad', kind: 'STRING' }, { name: 'ventas', kind: 'NUMERIC' }, { name: 'costos', kind: 'NUMERIC' }], rows: [['Quito', 100, 40], ['Cuenca', 80, 30]], rowCount: 2 };
async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(data => {
      window.queries = []; window.transferred = null;
      window.dbeaverBrowserReady = () => true; window.dbeaverSaveConfiguration = () => true; window.dbeaverDashboardChanged = () => true;
      window.dbeaverListConnections = () => JSON.stringify([{ project: 'General', connectionId: 'demo', connection: 'Demo' }]);
      window.dbeaverApproveWidgetQueries = () => true; window.dbeaverResetDashboardQueries = () => true; window.dbeaverCancelWidgetQuery = () => true;
      window.dbeaverOpenReportDesigner = (json, runtime) => { window.transferred = { dashboard: JSON.parse(json), snapshots: JSON.parse(runtime) }; return true; };
      window.dbeaverExecuteWidgetQuery = (id, sql) => { window.queries.push({ id, sql }); setTimeout(() => window.DBeaverECharts.setWidgetSnapshot(id, data), 5); return true; };
    }, data);
    await page.goto(pathToFileURL(path.join(web, 'index.html')).href);
    await page.evaluate(data => {
      const D = window.DBeaverEChartsDashboard, dashboard = D.createDashboard();
      dashboard.widgets = ['a', 'b'].map((id, i) => {
        const widget = D.createWidget({ chartType: i ? 'line' : 'pie', xColumn: 'ciudad', yColumns: ['ventas'], yAxes: {}, marks: {} },
          { source: { sql: `SELECT ciudad, ventas, costos FROM ${id}`, kind: 'savedQuery', project: 'General', connection: 'Demo', connectionId: 'demo' } });
        widget.id = id; widget.layout = { x: 0, y: i * 10, width: 12, height: 10 }; return widget;
      });
      window.DBeaverECharts.loadDashboard(dashboard, true);
    }, data);
    await page.locator('#refreshDashboard').click(); await page.locator('#runReviewedQueries').click();
    await page.waitForFunction(() => document.querySelectorAll('.widget-chart canvas').length === 2);
    await page.locator('[data-widget-id="a"] .widget-edit').click();
    assert.equal(await page.locator('#widgetEditorAutoTitle').isChecked(), true);
    await page.locator('#widgetEditorType').selectOption('bar');
    await page.locator('#widgetEditorSeries input[aria-label="Series costos"]').check();
    assert.equal(await page.locator('#widgetEditorName').inputValue(), 'ventas, costos by ciudad');
    await page.locator('#widgetEditorName').fill('Control comercial'); await page.locator('#widgetEditorType').selectOption('line');
    assert.equal(await page.locator('#widgetEditorName').inputValue(), 'Control comercial', 'User titles survive mapping changes');
    await page.locator('#widgetEditorAutoTitle').check();
    await page.locator('#widgetEditorQueryTab').click();
    if (browser.browserType().name() === 'chromium') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const previous = await page.evaluate(() => navigator.clipboard.readText());
      try {
        await page.evaluate(() => navigator.clipboard.writeText('SELECT ciudad, ventas, costos FROM pasted_query'));
        await page.locator('#widgetEditorSql').focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+v');
        assert.equal(await page.locator('#widgetEditorSql').inputValue(), 'SELECT ciudad, ventas, costos FROM pasted_query');
      } finally { await page.evaluate(value => navigator.clipboard.writeText(value), previous); }
    } else await page.locator('#widgetEditorSql').fill('SELECT ciudad, ventas, costos FROM pasted_query');
    await page.locator('#widgetEditorRun').click(); await page.waitForFunction(() => document.querySelector('#widgetEditorStatus').textContent.includes('2 rows'));
    await page.locator('#widgetEditorChooseChart').click(); await page.locator('#widgetEditorSave').click();
    const document = () => page.evaluate(() => window.DBeaverECharts.dashboardDocument());
    const edited = await document(), count = await page.evaluate(() => window.queries.length);
    await page.keyboard.press('Control+z');
    assert.ok((await document()).widgets[0].source.sql.endsWith('FROM a'));
    assert.equal(await page.locator('.widget-chart canvas').count(), 2, 'Undo reuses the old source snapshot');
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await document(), edited);
    const a = page.locator('[data-widget-id="a"]'), handle = await a.locator('.widget-drag-handle').boundingBox();
    await page.mouse.move(handle.x + 8, handle.y + 8); await page.mouse.down(); await page.mouse.move(handle.x + 8, handle.y + 8 + 10 * 48, { steps: 8 });
    const preview = await page.locator('[data-widget-id="b"]').evaluate(element => element.style.gridRow);
    assert.match(preview, /^1 /, 'Lower chart fills the old row during drag');
    await page.mouse.up(); const reordered = await document();
    assert.equal(reordered.widgets.find(w => w.id === 'b').layout.y, 0); assert.equal(reordered.widgets.find(w => w.id === 'a').layout.y, 10);
    await page.keyboard.press('Control+z'); assert.deepEqual(await document(), edited);
    await page.keyboard.press('Control+y'); assert.deepEqual(await document(), reordered);
    assert.equal(await page.evaluate(() => window.queries.length), count, 'Undo, redo and layout never execute SQL');
    await page.locator('#openReportDesigner').click(); const payload = await page.evaluate(() => window.transferred);
    assert.equal(Object.keys(payload.snapshots).length, 2); assert.equal(payload.snapshots.a.rows.length, 2);
    assert.ok(!JSON.stringify(payload.snapshots).includes('connectionId'));
    await page.goto(pathToFileURL(path.join(web, 'report.html')).href);
    await page.evaluate(payload => {
      const report = window.DBeaverReportModel.fromDashboard(payload.dashboard), runtime = {};
      for (const widget of report.widgets) runtime[widget.sourceId] = payload.snapshots[widget.id];
      window.DBeaverECharts.loadReport(report, true, runtime);
    }, payload);
    assert.equal(await page.locator('.report-chart canvas').count(), 2, 'Dashboard opens populated in Report Designer');
    assert.equal(await page.evaluate(() => window.queries.length), 0, 'Transferred previews need no SQL execution');
    assert.ok(!JSON.stringify(await page.evaluate(() => window.DBeaverECharts.reportDocument())).includes('"rows"'), 'Template has no runtime data');
    const properties = page.locator('#componentProperties'), report = () => page.evaluate(() => window.DBeaverECharts.reportDocument());
    const width = properties.getByLabel('Sheet width (px)'); await width.fill('1200');
    assert.equal((await report()).page.width, 1200); assert.equal(await width.evaluate(element => document.activeElement === element), true);
    assert.equal(await page.locator('#reportCanvas').evaluate(element => getComputedStyle(element).width), '1200px');
    const margins = properties.getByLabel('Margins (px)'); await margins.fill('48');
    assert.equal((await report()).page.margin, 48); assert.equal(await margins.evaluate(element => document.activeElement === element), true);
    assert.equal(await page.locator('#reportCanvas').evaluate(element => getComputedStyle(element).paddingLeft), '48px');
    const first = (await report()).widgets.find(w => w.layout.y === 0), second = (await report()).widgets.find(w => w.layout.y === 10);
    await page.locator(`[data-layer-id="${first.id}"]`).click();
    await properties.locator('details').filter({ has: page.locator('summary', { hasText: 'Position and size' }) }).locator('summary').click();
    const height = properties.getByLabel('Height (rows)'); await height.fill('12');
    assert.equal((await report()).widgets.find(w => w.id === first.id).layout.height, 12);
    assert.equal(await height.evaluate(element => document.activeElement === element), true);
    await page.locator(`[data-layer-id="${first.id}"]`).click();
    await page.keyboard.press('Control+z');
    assert.equal((await report()).widgets.find(w => w.id === first.id).layout.height, 10);
    const beforeMove = await report(), move = await page.locator(`[data-component-id="${first.id}"] .report-move`).boundingBox();
    await page.mouse.move(move.x + 10, move.y + 8); await page.mouse.down(); await page.mouse.move(move.x + 10, move.y + 8 + 10 * 32, { steps: 8 });
    assert.match(await page.locator(`[data-component-id="${second.id}"]`).evaluate(element => element.style.gridRow), /^1 /);
    await page.mouse.up(); const afterMove = await report();
    assert.equal(afterMove.widgets.find(w => w.id === second.id).layout.y, 0);
    await page.keyboard.press('Control+z'); assert.deepEqual(await report(), beforeMove);
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await report(), afterMove);
    assert.equal(await page.locator('.report-chart canvas').count(), 2); assert.equal(await page.evaluate(() => window.queries.length), 0);
    await page.screenshot({ path: path.join(output, 'populated-report-live-edit.png') });
    assert.deepEqual(errors, []);
    console.log(`Designer workflow OK: ${browser.browserType().name() === 'chromium' ? 'real Ctrl+V browser paste' : 'SQL field editing (clipboard shortcut tested in Chromium)'}, automatic/custom titles, dashboard/report runtime handoff, both history shortcuts, live numeric controls, row reorder preview/commit and no SQL on undo/redo`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

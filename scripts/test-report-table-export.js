'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser } = require('./browser-test-runtime');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'plugins/org.example.dbeaver.echarts/web');
const assets = Object.fromEntries([['echarts', 'js/echarts.min.js'], ['worldMap', 'js/world-map.js'], ['analytics', 'js/analytics.js'],
  ['widgets', 'js/report-widgets.js'], ['paperCss', 'css/report-paper.css']].map(([key, file]) => [key, fs.readFileSync(path.join(web, file), 'utf8')]));
assets.licenses = fs.readFileSync(path.join(web, '../third-party/echarts/LICENSE'), 'utf8');
async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(assets => {
      window.testQueries = 0; window.testExports = [];
      window.dbeaverBrowserReady = () => true; window.dbeaverSaveConfiguration = () => true;
      window.dbeaverDashboardChanged = () => true; window.dbeaverResetDashboardQueries = () => true;
      window.dbeaverApproveWidgetQueries = () => true; window.dbeaverCancelWidgetQuery = () => true;
      window.dbeaverReportExportAssets = () => JSON.stringify(assets);
      window.dbeaverExportReportAsync = (id, content, kind, title, open) => { window.testExports.push({ id, content, kind, title, open }); return true; };
      window.dbeaverExecuteWidgetQuery = id => {
        window.testQueries++;
        setTimeout(() => window.DBeaverECharts.setWidgetSnapshot(id, { schemaVersion: 1,
          columns: [{ name: 'id', kind: 'NUMERIC' }, { name: 'city', kind: 'STRING' }, { name: 'sales', kind: 'NUMERIC' }],
          rows: Array.from({ length: 90 }, (_, i) => [i + 1, `City ${i + 1}`, (i + 1) * 100]), rowCount: 90, effectiveMaxRows: 5000 }), 0);
        return true;
      };
    }, assets);
    await page.goto(pathToFileURL(path.join(web, 'report.html')).href);
    await page.evaluate(() => {
      const M = window.DBeaverReportModel, report = M.create('Table height regression'), table = M.widget('table');
      table.id = 'auto-table'; table.sourceId = 'rows'; table.layout.width = 12;
      report.sources.push(M.source({ id: 'rows', sql: 'SELECT id, city, sales FROM table_fixture', connectionId: 'table-test-connection' }));
      report.widgets.push(table); window.DBeaverECharts.loadReport(report);
    });
    await page.locator('#refreshReport').click(); await page.locator('#runReportQueries').click();
    const rows = () => page.locator('#reportCanvas .report-table tbody tr').allTextContents();
    await page.waitForFunction(() => document.querySelectorAll('#reportCanvas .report-table tbody tr').length > 0);
    const small = await rows(); assert.ok(small.length > 0 && small.length < 20);
    await page.locator('[data-layer-id="auto-table"]').click();
    const handle = await page.locator('[data-component-id="auto-table"] [data-edge="s"]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 320, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(count => document.querySelectorAll('#reportCanvas .report-table tbody tr').length > count, small.length);
    const enlarged = await rows(); assert.ok(enlarged.length > small.length);
    assert.equal(await page.evaluate(() => window.testQueries), 1, 'Resize does not rerun SQL');
    await page.locator('#reportZoom').selectOption('0.75'); assert.deepEqual(await rows(), enlarged, 'Zoom does not alter row capacity');
    await page.locator('#reportZoom').selectOption('1');
    const next = page.locator('#reportCanvas .report-pagination').getByRole('button', { name: 'Next', exact: true });
    const ids = [];
    do {
      ids.push(...await page.locator('#reportCanvas .report-table tbody td:first-child').allTextContents());
      if (await next.isDisabled()) break;
      await next.click();
    } while (ids.length < 200);
    assert.deepEqual(ids.map(value => Number(value.replaceAll(',', ''))), Array.from({ length: 90 }, (_, i) => i + 1), 'Pagination makes every row available without omissions');
    await page.locator('#reportCanvas .report-pagination').getByRole('button', { name: 'Previous', exact: true }).click();
    const selected = await rows();
    const complete = result => page.evaluate(result => window.DBeaverECharts.reportExportFinished(window.testExports.at(-1).id, result), result);
    const exported = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
    for (const mode of ['interactive', 'email']) {
      await page.locator('#reportExportMenu > summary').click(); await page.locator('#exportReport').click();
      await page.locator('#reportExportFormat').selectOption(mode); await page.locator('#saveReportExport').click();
      assert.equal(await page.locator('#saveReportExport').isDisabled(), true);
      const content = await page.evaluate(() => window.testExports.at(-1).content);
      assert.ok(!content.includes('SELECT id, city, sales FROM table_fixture') && !content.includes('table-test-connection'));
      await complete({ path: `table-${mode}.html`, opened: false, sent: false });
      await exported.setContent(content);
      assert.deepEqual(await exported.locator(mode === 'interactive' ? '.report-table tbody tr' : 'table:not([role]) > tbody > tr').allTextContents(), selected, `${mode} preserves the designer page exactly`);
    }
    await page.locator('#reportExportMenu > summary').click(); await page.locator('#outlookReport').click();
    await page.locator('#reportEmailMessage').fill('Keep this draft after cancelling.');
    await page.locator('#saveReportEmail').click();
    const draft = await page.evaluate(() => window.testExports.at(-1));
    assert.equal(draft.kind, 'eml'); assert.match(draft.content, /To: \r\n/); assert.match(draft.content, /X-Unsent: 1/);
    await complete({ cancelled: true });
    assert.equal(await page.locator('#reportEmailDialog').evaluate(dialog => dialog.open), true);
    assert.equal(await page.locator('#reportEmailMessage').inputValue(), 'Keep this draft after cancelling.');
    await page.locator('#saveReportEmail').click(); await complete({ error: 'Test folder is read-only.' });
    assert.equal(await page.locator('#reportEmailError').isVisible(), true);
    assert.match(await page.locator('#reportEmailError').textContent(), /read-only/);
    await page.locator('#reportEmailTo').fill('invalid');
    const priorCount = await page.evaluate(() => window.testExports.length);
    await page.locator('#saveReportEmail').click();
    assert.equal(await page.evaluate(() => window.testExports.length), priorCount, 'Invalid recipients fail before opening the file picker');
    await page.locator('#reportEmailTo').fill(''); await page.locator('#saveReportEmail').click();
    await complete({ path: 'draft.eml', opened: false, sent: false });
    assert.equal(await page.locator('#reportEmailDialog').evaluate(dialog => dialog.open), false);
    assert.match(await page.locator('#reportStatus').textContent(), /Draft saved.*Email was not sent/);
    const directory = path.join(root, '.dev/report-table-tests'); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'table.eml'), draft.content);
    await page.screenshot({ path: path.join(directory, 'resized-table.png') });
    assert.deepEqual(errors, []);
    console.log('Table/export OK: live resize, zoom, all 90 rows paginated, identical designer/HTML/email page, async save/cancel/error and blank-recipient EML');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

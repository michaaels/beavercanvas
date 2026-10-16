'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const {launchBrowser} = require('./browser-test-runtime');
const web = path.resolve(__dirname, '../plugins/org.example.dbeaver.echarts/web');
const output = path.resolve(__dirname, '../.dev/authoring-ux'); fs.mkdirSync(output, {recursive: true});
const assets = Object.fromEntries([['echarts','js/echarts.min.js'],['worldMap','js/world-map.js'],['geoData','js/geo-data.js'],
  ['analytics','js/analytics.js'],['widgets','js/report-widgets.js'],['paperCss','css/report-paper.css']].map(([key, file]) => [key, fs.readFileSync(path.join(web,file),'utf8')]));
const data = {schemaVersion: 1, columns: [{name:'fecha',kind:'DATETIME'},{name:'ciudad',kind:'STRING'}, {name:'ventas',kind:'NUMERIC'},
  {name:'costos',kind:'NUMERIC'},{name:'longitud',kind:'NUMERIC'},{name:'latitud',kind:'NUMERIC'}],
  rows: Array.from({length:90},(_,i) => [new Date(Date.UTC(2026,6,1+i)).toISOString(), i % 2 ? 'Cuenca' : 'Quito', 100.08+i,40.04+i,-78.4,-0.18]), rowCount:90};

async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({viewport:{width:1800,height:1100}}), errors=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({data,assets}) => {
      window.queries=[]; window.saved=null;
      window.dbeaverBrowserReady=()=>true; window.dbeaverSaveConfiguration=()=>true; window.dbeaverDashboardChanged=()=>true;
      window.dbeaverListConnections=()=>JSON.stringify([{project:'General',connectionId:'demo',connection:'Demo'}]);
      window.dbeaverApproveWidgetQueries=()=>true; window.dbeaverResetDashboardQueries=()=>true; window.dbeaverCancelWidgetQuery=()=>true;
      window.dbeaverReportExportAssets=()=>JSON.stringify(assets);
      window.dbeaverSaveReport=json=>{window.saved=JSON.parse(json);return 'authoring.echarts-report.json';};
      window.dbeaverExecuteWidgetQuery=(id,sql)=>{window.queries.push({id,sql});setTimeout(()=>window.DBeaverECharts.setWidgetSnapshot(id,data),5);return true;};
    },{data,assets});
    await page.goto(pathToFileURL(path.join(web,'report.html')).href);
    await page.evaluate(data=>{
      const M=window.DBeaverReportModel, report=M.create('Ventas y ubicaciones');
      report.page.width=1200;
      report.sources=['q','other'].map(id=>M.source({id,name:id==='q'?'Ventas':'Otra consulta',sql:`SELECT * FROM ${id}`,project:'General',connectionId:'demo',connection:'Demo'}));
      const note=M.widget('text');note.id='note';note.config.text='Descripción';note.layout={x:0,y:0,width:12,height:3};
      report.widgets=[note,...['a','pie','c','map'].map((id,i)=>{
        const widget=M.widget('chart');widget.id=id;widget.title=id;widget.sourceId='q';
        widget.layout={x:i===2?6:0,y:i===0?3:i===3?19:11,width:i===0||i===3?12:6,height:i===3?10:8};
        widget.config.chart={chartType:i===1?'pie':i===3?'map':'line',xColumn:i===1?'ciudad':'fecha',yColumns:['ventas','costos'],yAxes:{},marks:{},legend:true,colors:[]};
        if(i===3)widget.config.chart.map={mode:'latLon',longitude:'longitud',latitude:'latitud',value:'ventas',label:'ciudad',details:[]};
        return widget;
      })];
      window.DBeaverECharts.loadReport(report,true,{q:data,other:data});
    },data);
    const doc=()=>page.evaluate(()=>window.DBeaverECharts.reportDocument());
    const frame=id=>page.locator(`[data-component-id="${id}"]`);
    await page.waitForFunction(()=>document.querySelectorAll('#reportCanvas .report-chart canvas').length===4);
    await page.evaluate(()=>window.echarts.getInstanceByDom(document.querySelector('[data-component-id="a"] .report-chart')).dispatchAction({type:'dataZoom',start:55,end:90}));
    assert.equal((await doc()).widgets.find(w=>w.id==='a').config.chart.viewport.dataZoom[0].start,55);
    const paragraph=frame('note').getByRole('textbox'); await paragraph.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('Ventas del último mes');
    await page.locator('#propertiesHeading').click();
    assert.equal((await doc()).widgets.find(w=>w.id==='note').config.text,'Ventas del último mes');
    await paragraph.click(); assert.equal(await paragraph.textContent(),'Ventas del último mes','Refocusing does not restore stale text');
    await page.locator('#propertiesHeading').click();
    assert.equal(await frame('a').locator('.report-chart').evaluate(element=>window.echarts.getInstanceByDom(element).getOption().dataZoom[0].start),55);

    await page.locator('[data-layer-id="pie"]').click();
    assert.equal(await page.locator('#componentProperties').getByLabel('Query',{exact:true}).count(),0);
    await frame('pie').getByRole('button',{name:'Configure chart and preview SQL'}).click();
    assert.equal(await page.locator('#widgetEditorSeries input:checked').count(),1);
    assert.equal(await page.getByLabel('Axis ventas',{exact:true}).isVisible(),false);
    await page.getByLabel('Series costos',{exact:true}).check();
    assert.equal(await page.locator('#widgetEditorPreview').evaluate(element=>window.echarts.getInstanceByDom(element).getOption().series[0].name),'costos');
    assert.equal(await page.locator('#widgetEditorPreview').evaluate(element=>window.echarts.getInstanceByDom(element).getOption().tooltip[0].valueFormatter(379882.07999999996)),'379,882.08');
    await page.locator('.widget-editor-advanced summary').click(); await page.getByLabel('Show legend',{exact:true}).uncheck();
    await page.getByLabel('Series colors (hex, comma separated)',{exact:true}).fill('#087af5, #91cc75');
    await page.locator('#widgetEditorSave').click();
    assert.deepEqual((await doc()).widgets.find(w=>w.id==='pie').config.chart.yColumns,['costos']);
    assert.equal((await doc()).widgets.find(w=>w.id==='pie').config.chart.legend,false);

    await page.locator('[data-layer-id="a"]').click(); await frame('a').getByRole('button',{name:'Configure chart and preview SQL'}).click();
    await page.locator('#widgetEditorQueryTab').click(); await page.getByLabel('Saved query',{exact:true}).selectOption('other');
    await page.locator('#widgetEditorChartTab').click(); await page.locator('#widgetEditorSave').click();
    assert.equal((await doc()).widgets.find(w=>w.id==='a').sourceId,'other','Query reuse remains available inside chart configuration');
    assert.equal(await page.evaluate(()=>window.queries.length),0,'Opening/configuring never executes SQL');
    await frame('a').getByRole('button',{name:'Refresh this chart'}).click();
    assert.equal(await page.locator('#reportReviewQueries section').count(),1);
    await page.locator('#runReportQueries').click(); await page.waitForFunction(()=>window.queries.length===1);
    await page.waitForFunction(()=>document.querySelectorAll('#reportCanvas .report-chart canvas').length===4);
    assert.equal((await doc()).widgets.find(w=>w.id==='a').config.chart.viewport.dataZoom[0].start,55);

    await frame('map').scrollIntoViewIfNeeded();
    const mapBox=await frame('map').locator('.report-chart').boundingBox();
    await page.mouse.move(mapBox.x+mapBox.width/2,mapBox.y+mapBox.height/2);await page.mouse.wheel(0,-300);
    await page.waitForFunction(()=>window.DBeaverECharts.reportDocument().widgets.find(w=>w.id==='map').config.chart.viewport?.geo?.zoom>1);
    const mapView=(await doc()).widgets.find(w=>w.id==='map').config.chart.viewport.geo;

    await page.locator('[data-layer-id="c"]').click(); await frame('c').scrollIntoViewIfNeeded();
    const move=await frame('c').locator('.report-move').boundingBox();
    assert(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('.report-move')),{x:move.x+8,y:move.y+8}), 'Adjacent resize edge must not cover the move handle');
    const before=(await doc()).widgets.find(w=>w.id==='c').layout;
    await page.mouse.move(move.x+8,move.y+8);await page.mouse.down();await page.mouse.move(move.x+8,move.y+8+64,{steps:10});
    assert(await page.evaluate(()=>[...document.querySelectorAll('.report-resize')].every(element=>getComputedStyle(element).pointerEvents==='none')));
    await page.mouse.up();
    assert.equal((await doc()).widgets.find(w=>w.id==='c').layout.height,before.height,'Moving must not resize another chart');
    assert.notEqual((await doc()).widgets.find(w=>w.id==='c').layout.y,before.y);

    const scroll=page.locator('.report-canvas-scroll');await scroll.evaluate(element=>element.scrollTop=element.scrollHeight);
    const grid=await page.locator('#reportCanvas > .report-grid').boundingBox();
    await page.mouse.click(grid.x+25,grid.y+grid.height-28); await page.keyboard.type('Nueva nota en la hoja');
    await page.locator('#propertiesHeading').click();
    assert((await doc()).widgets.some(w=>w.type==='text'&&w.config.text==='Nueva nota en la hoja'));
    await page.keyboard.press('Control+z');assert(!(await doc()).widgets.some(w=>w.config.text==='Nueva nota en la hoja'));
    await page.keyboard.press('Control+Shift+z');assert((await doc()).widgets.some(w=>w.config.text==='Nueva nota en la hoja'));
    await page.locator('#saveReport').click();
    const saved=await page.evaluate(()=>window.saved);
    assert.equal(saved.widgets.find(w=>w.id==='a').config.chart.viewport.dataZoom[0].start,55);
    assert.deepEqual(saved.widgets.find(w=>w.id==='map').config.chart.viewport.geo,mapView);
    assert(!JSON.stringify(saved).includes('"rows"'));
    await page.evaluate(({saved,data})=>window.DBeaverECharts.loadReport(saved,false,{q:data,other:data}),{saved,data});
    assert.equal(await frame('a').locator('.report-chart').evaluate(element=>window.echarts.getInstanceByDom(element).getOption().dataZoom[0].start),55);
    const html=await page.evaluate(({data,assets})=>window.DBeaverReportExport.interactive(window.DBeaverECharts.reportDocument(),{q:data,other:data},{},assets),{data,assets});
    const file=path.join(output,'report.html');fs.writeFileSync(file,html);
    const exported=await browser.newPage({viewport:{width:1500,height:1000}});
    exported.on('pageerror',error=>errors.push(error.message));await exported.goto(pathToFileURL(file).href);
    assert.equal(await exported.locator('[data-component-id="a"] .report-chart').evaluate(element=>window.echarts.getInstanceByDom(element).getOption().dataZoom[0].start),55);
    assert.equal(await exported.locator('[data-component-id="map"] .report-chart').evaluate(element=>window.echarts.getInstanceByDom(element).getOption().geo[0].zoom),mapView.zoom);
    assert.equal(await exported.locator('.report-component-action,[contenteditable]').count(),0);
    await exported.close();
    await scroll.evaluate(element=>element.scrollTop=0); await page.locator('[data-layer-id="a"]').click();
    await page.screenshot({path:path.join(output,'report-authoring.png'),fullPage:true});
    await page.locator('[data-layer-id="pie"]').click(); await frame('pie').getByRole('button',{name:'Configure chart and preview SQL'}).click();
    await page.screenshot({path:path.join(output,'pie-value-editor.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Report authoring UX OK: inline/blank-sheet text, undo/redo, pie value/format, chart gear/query reuse/refresh, drag precedence, date/map viewport, save/reopen and offline export');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

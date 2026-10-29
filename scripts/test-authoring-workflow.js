'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const {launchBrowser} = require('./browser-test-runtime');
const web = path.resolve(__dirname, '../plugins/org.example.dbeaver.echarts/web');
const output = path.resolve(__dirname, '../.dev/authoring-workflow',process.env.ECHARTS_TEST_BROWSER||'msedge'); fs.mkdirSync(output,{recursive:true});
const assets = Object.fromEntries([['echarts','js/echarts.min.js'],['worldMap','js/world-map.js'],['geoData','js/geo-data.js'],
  ['analytics','js/analytics.js'],['widgets','js/report-widgets.js'],['paperCss','css/report-paper.css']].map(([key,file])=>[key,fs.readFileSync(path.join(web,file),'utf8')]));
const data = {schemaVersion:1,columns:[{name:'fecha',kind:'DATETIME'},{name:'sitio',kind:'STRING'},
  {name:'traffic',kind:'NUMERIC'},{name:'cs',kind:'NUMERIC'}],
  rows:[['2026-10-19','Quito',10,100],['2026-10-19','Quito',20,200],['2026-10-19','Tena',8,80],['2026-10-20','Quito',12,120]],rowCount:4,exportedRowCount:4};

async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1100}}), errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.addInitScript(data=>{
      window.executions=[]; window.dbeaverBrowserReady=()=>true; window.dbeaverDashboardChanged=()=>true;
      window.dbeaverSaveConfiguration=json=>{window.configuration=JSON.parse(json);return true;};
      window.dbeaverSaveReport=json=>{window.saved=JSON.parse(json);return 'report.echarts-report.json';};
      window.dbeaverSaveDashboard=json=>{window.saved=JSON.parse(json);return 'dashboard.echarts-dashboard.json';};
      window.dbeaverListConnections=()=>JSON.stringify([{project:'General',connectionId:'demo',connection:'Demo'}]);
      window.dbeaverListEditorSessions=()=>JSON.stringify([{project:'General',connectionId:'demo',connection:'Demo',sessionId:'live-session',title:'Temporary traffic',catalog:'traffic_db',schema:''}]);
      window.dbeaverApproveWidgetQueries=()=>true; window.dbeaverResetDashboardQueries=()=>true; window.dbeaverCancelWidgetQuery=()=>true;
      window.dbeaverExecuteWidgetQuery=(id,sql,source)=>{window.executions.push(JSON.parse(source));setTimeout(()=>window.DBeaverECharts.setWidgetSnapshot(id,data),5);return true;};
    },data);
    await page.goto(pathToFileURL(path.join(web,'report.html')).href);
    await page.evaluate(data=>{
      const M=window.DBeaverReportModel, report=M.create('Tráfico por sitio'); report.page.width=960;
      report.sources=[M.source({id:'q',name:'Traffic',connectionId:'demo',connection:'Demo',project:'General',sql:'SELECT * FROM traffic'})];
      const header=M.widget('header');header.id='header';header.layout={x:0,y:6,width:12,height:2};
      const chart=M.widget('chart');chart.id='traffic';chart.title='Traffic';chart.sourceId='q';chart.layout={x:0,y:8,width:12,height:8};
      chart.config.chart={chartType:'line',xColumn:'fecha',yColumns:['traffic'],yAxes:{},marks:{}};
      report.widgets=[header,chart];window.DBeaverECharts.loadReport(report,true,{q:data});
    },data);
    const doc=()=>page.evaluate(()=>window.DBeaverECharts.reportDocument());
    const frame=id=>page.locator(`#reportCanvas [data-component-id="${id}"]`);
    await frame('traffic').click();await frame('traffic').getByRole('button',{name:'Configure chart and preview SQL'}).click();
    const chartEditor=page.locator('#widgetEditor');
    await chartEditor.getByLabel('Aggregate repeated categories',{exact:true}).selectOption('sum');
    await chartEditor.getByLabel('Second category',{exact:true}).selectOption('sitio');
    await chartEditor.locator('#widgetEditorSave').click();
    assert.equal((await doc()).widgets.find(w=>w.id==='traffic').config.chart.grouping.seriesColumn,'sitio');
    await frame('header').click(); const handle=frame('header').locator('.report-move'), start=await handle.boundingBox();
    await page.mouse.move(start.x+25,start.y+12); await page.mouse.down(); await page.mouse.move(start.x+25,start.y+12-6*32,{steps:8});
    assert.equal(await frame('traffic').evaluate(node=>node.style.gridRow),'3 / span 8','The chart follows upward during the preview');
    await page.mouse.up(); assert.equal((await doc()).widgets.find(w=>w.id==='traffic').layout.y,2);
    await frame('header').focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator(':focus').getAttribute('data-component-id'),'traffic','Arrows navigate rather than moving a focused component');
    assert.equal((await doc()).widgets.find(w=>w.id==='traffic').layout.y,2);
    await page.keyboard.press('Control+Home'); assert.equal(await page.locator(':focus').getAttribute('data-component-id'),'header');
    await page.keyboard.press('Control+End'); assert.equal(await page.locator(':focus').getAttribute('data-component-id'),'traffic');
    await page.keyboard.press('Control+f'); await page.getByRole('combobox',{name:'Find a component'}).fill('Traffic'); await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('data-component-id'),'traffic');

    // A blank-sheet caret and the paragraph text share the same document coordinate.
    await page.locator('#reportCanvas > .report-grid').scrollIntoViewIfNeeded();
    let box=await page.locator('#reportCanvas > .report-grid').boundingBox();
    const point={x:box.x+245,y:box.y+11*32+15}; await page.mouse.click(point.x,point.y);
    assert.equal(await page.locator('.report-text-caret').count(),1);
    await page.keyboard.type('Reporte desde este punto');
    const paragraph=page.getByRole('textbox',{name:/Edit Paragraph on the sheet/});
    const content=await paragraph.evaluate(node=>{const r=document.createRange();r.selectNodeContents(node);return r.getBoundingClientRect().x;});
    assert(Math.abs(content-point.x)<=3,`Text starts at the clicked point (${content}, ${point.x})`);
    const added=(await doc()).widgets.find(w=>w.type==='text');assert(added.config.textIndent>200);
    await page.locator('#propertiesHeading').click();

    box=await page.locator('#reportCanvas > .report-grid').boundingBox();
    await page.mouse.click(box.x+50,box.y+box.height-20);await page.keyboard.type('/');
    const palette=page.getByRole('combobox',{name:'Insert a component'});
    const beforeCancel=(await doc()).widgets.length;await page.keyboard.press('Escape');assert.equal((await doc()).widgets.length,beforeCancel);
    assert.equal(await page.locator('.report-text-caret').count(),1,'Cancelling slash keeps the sheet insertion point');
    await page.keyboard.type('/');await palette.fill('KPI');await page.keyboard.press('Enter');
    assert((await doc()).widgets.some(w=>w.type==='kpi'));assert.equal(await page.locator('.report-command-menu').count(),0);
    await page.keyboard.press('Control+z');assert(!(await doc()).widgets.some(w=>w.type==='kpi'));
    await page.keyboard.press('Control+y');assert((await doc()).widgets.some(w=>w.type==='kpi'));
    await page.getByRole('textbox',{name:'Report title'}).fill('Uno dos tres');
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('id'),'reportZoom');
    await page.keyboard.press('Shift+Tab');assert.equal(await page.locator(':focus').getAttribute('id'),'reportTitle');
    await page.keyboard.press('Home');assert.equal(await page.getByRole('textbox',{name:'Report title'}).evaluate(node=>node.selectionStart),0);
    await page.keyboard.press('Control+ArrowRight');assert((await page.getByRole('textbox',{name:'Report title'}).evaluate(node=>node.selectionStart))>0);
    await page.keyboard.press('Control+ArrowLeft');assert.equal(await page.getByRole('textbox',{name:'Report title'}).evaluate(node=>node.selectionStart),0);
    await page.keyboard.press('End');await page.keyboard.press('Control+Shift+ArrowLeft');
    assert.equal(await page.getByRole('textbox',{name:'Report title'}).evaluate(node=>node.value.slice(node.selectionStart,node.selectionEnd)),'tres');
    await frame('traffic').focus(); const chart=frame('traffic').locator('.report-chart'), chartBox=await chart.boundingBox();
    await page.mouse.move(chartBox.x+chartBox.width/2,chartBox.y+chartBox.height/2);
    const before=await page.evaluate(()=>window.echarts.getInstanceByDom(document.querySelector('.report-chart')).getOption().dataZoom[0].start);
    await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');
    await page.waitForFunction(()=>document.getElementById('reportZoom').value==='1.1');
    assert.equal(await page.evaluate(()=>window.echarts.getInstanceByDom(document.querySelector('.report-chart')).getOption().dataZoom[0].start),before,'Ctrl+wheel zooms the sheet, not chart data');
    await page.keyboard.press('Control+s');assert.equal((await page.evaluate(()=>window.saved)).widgets.find(w=>w.type==='text').config.textIndent,added.config.textIndent);
    const html=await page.evaluate(({data,assets})=>window.DBeaverReportExport.interactive(window.DBeaverECharts.reportDocument(),{q:data},{},assets),{data,assets});
    const exported=path.join(output,'grouped-report.html');fs.writeFileSync(exported,html);
    const preview=await browser.newPage();await preview.goto(pathToFileURL(exported).href);
    assert.equal(await preview.locator('.report-chart').evaluate(node=>window.echarts.getInstanceByDom(node).getOption().series.length),2,'Offline HTML preserves grouped report series');
    const exportedX=await preview.locator('.report-paragraph').evaluate(node=>{const r=document.createRange();r.selectNodeContents(node);return r.getBoundingClientRect().x-node.closest('.report-grid').getBoundingClientRect().x;});
    assert(Math.abs(exportedX-245)<=3,'The exported paragraph keeps its clicked indentation');await preview.close();
    await page.screenshot({path:path.join(output,'sheet-input.png'),fullPage:true});

    await page.goto(pathToFileURL(path.join(web,'index.html')).href);await page.evaluate(data=>window.DBeaverECharts.setSnapshot(data),data);
    assert(await page.locator('#yField option').evaluateAll(options=>options.every(option=>option.textContent.includes('NUMERIC'))));
    await page.locator('#yField').selectOption('3');
    assert.equal(await page.locator('#chart').evaluate(node=>window.echarts.getInstanceByDom(node).getOption().series.length),1);
    await page.locator('#groupingPicker > summary').click();
    await page.getByLabel('Aggregate repeated categories',{exact:true}).selectOption('sum');await page.getByLabel('Second category',{exact:true}).selectOption('sitio');
    const series=await page.locator('#chart').evaluate(node=>window.echarts.getInstanceByDom(node).getOption().series);
    assert.equal(series.length,2);assert.deepEqual(series[0].data[0],['2026-10-19',300]);
    await page.waitForTimeout(1100); // Capture the finished ECharts animation for visual review.
    await page.screenshot({path:path.join(output,'grouping.png'),fullPage:true});
    await page.locator('#groupingPicker > summary').click();await page.locator('#viewMode').selectOption('dashboard');await page.locator('#addWidget').click();
    const editor=page.locator('#widgetEditor');await editor.locator('#widgetEditorQueryTab').click();
    await editor.locator('#widgetEditorConnection').selectOption('0');await editor.getByLabel('Execution context',{exact:true}).selectOption('live-session');
    await editor.locator('#widgetEditorSql').fill('SELECT * FROM temporary_traffic');await editor.locator('#widgetEditorRun').click();
    await page.waitForFunction(()=>window.executions.length===1);assert.equal((await page.evaluate(()=>window.executions))[0].executionMode,'editor');
    await page.waitForFunction(()=>!document.getElementById('widgetEditorSave').disabled);await editor.locator('#widgetEditorSave').click();await page.locator('#saveDashboard').click();
    const saved=await page.evaluate(()=>window.saved);assert.equal(saved.widgets[0].source.executionMode,'editor');assert(!('sessionId' in saved.widgets[0].source));
    assert.equal(saved.widgets[0].chart.grouping.seriesColumn,'sitio');
    assert.deepEqual(errors,[]);
    console.log('Authoring workflow OK: upward flow, caret position, slash menu, keyboard navigation/word selection, sheet wheel zoom, Y replacement, grouping and runtime-only editor sessions');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

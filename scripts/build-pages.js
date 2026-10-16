'use strict';

// Publish only the website and its selected, canonical product assets.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.dev', 'pages-site');
fs.mkdirSync(path.join(output, 'assets'), {recursive: true});
for (const name of ['index.html', 'style.css']) {
    fs.copyFileSync(path.join(root, 'website', name), path.join(output, name));
}
for (const name of ['beavercanvas-32.png', 'beavercanvas-64.png', 'beavercanvas-256.png']) {
    fs.copyFileSync(path.join(root, 'plugins/org.example.dbeaver.echarts/web/assets', name), path.join(output, 'assets', name));
}
for (const name of ['dashboard.png', 'map-widget-editor.png', 'report-authoring.png']) {
    fs.copyFileSync(path.join(root, 'docs/screenshots', name), path.join(output, 'assets', name));
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Built BeaverCanvas Pages: ${output}`);

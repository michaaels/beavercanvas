'use strict';
const fs = require('node:fs');
const path = require('node:path');
const web = path.resolve(__dirname, '../plugins/org.example.dbeaver.echarts/web');
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { check(file); continue; }
    // PNGs are binary. The separately hash-pinned upstream bundle contains legal URLs.
    if (entry.name === 'echarts.min.js' || /\.png$/i.test(entry.name)) continue;
    assertOffline(fs.readFileSync(file, 'utf8'), entry.name);
  }
}
function assertOffline(source, filename) {
  if (filename.endsWith('.svg')) {
    // An XML namespace declares vocabulary; it does not fetch a network resource.
    source = source.replace(/\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  }
  if (/https?:\/\//i.test(source)) throw new Error('Network URL in frontend: ' + filename);
}
if (require.main === module) {
  check(web);
  console.log('Offline frontend OK: no HTTP(S) URLs except the SVG namespace');
}
module.exports = { assertOffline };

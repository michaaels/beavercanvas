'use strict';
const assert = require('node:assert/strict');
const { assertOffline } = require('./check-offline');
const namespace = '<svg xmlns="http://www.w3.org/2000/svg">';
assert.doesNotThrow(() => assertOffline(namespace + '<path d="M0 0H1"/></svg>', 'icon.svg'));
for (const remote of ['<image href="https://example.com/logo.png"/>', '<style>@import "http://example.com/a.css"</style>', '<a href="HTTPS://example.com">']) {
  assert.throws(() => assertOffline(namespace + remote + '</svg>', 'icon.svg'), /Network URL/);
}
assert.throws(() => assertOffline(namespace, 'index.html'), /Network URL/);
assert.doesNotThrow(() => assertOffline('<img src="assets/icon.png">', 'index.html'));
console.log('Offline policy OK: SVG namespace accepted; remote SVG images, links and CSS rejected');

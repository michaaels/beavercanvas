'use strict';

// Export our native SVG sources; no traced bitmap or runtime image dependency.
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser } = require('./browser-test-runtime');
const assets = path.resolve(__dirname, '../plugins/org.example.dbeaver.echarts/web/assets');
const output = path.resolve(__dirname, '../.dev/branding');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
    const variants = [];
    for (const size of [16, 20, 24, 32, 48, 64, 128, 256, 512]) {
      const source = fs.readFileSync(path.join(assets, size <= 32 ? 'beavercanvas-mark.svg' : 'beavercanvas.svg'), 'utf8');
      if (/<image\b|data:image/i.test(source)) throw new Error('Brand sources must contain native vectors');
      const png = await page.evaluate(async ({ source, size }) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ratio = Math.min(size / img.width, size / img.height);
        const width = img.width * ratio, height = img.height * ratio;
        canvas.getContext('2d').drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { source, size });
      const filename = 'beavercanvas-' + size + '.png';
      fs.writeFileSync(path.join(assets, filename), Buffer.from(png, 'base64'));
      variants.push({ size, filename, png });
    }
    // Eclipse's image loader picks these siblings for 150% / 200% displays.
    for (const [suffix, size] of [['@1.5x', 24], ['@2x', 32]]) {
      fs.copyFileSync(path.join(assets, `beavercanvas-${size}.png`), path.join(assets, `beavercanvas-16${suffix}.png`));
    }
    const cells = variants.map(({ size, png }) => `<figure><img width="${size}" height="${size}" src="data:image/png;base64,${png}"><figcaption>${size} px</figcaption></figure>`).join('');
    const full = fs.readFileSync(path.join(assets, 'beavercanvas.svg'), 'utf8');
    await page.setContent(`<style>body{margin:0;font:14px system-ui;color:#21354a;background:#f4f6f9}section{padding:20px;display:flex;align-items:center;flex-wrap:wrap;gap:16px}figure{margin:0;text-align:center}figcaption{padding:8px}.dark{background:#252a31;color:#eee}.hero{height:320px;display:flex;justify-content:center;gap:40px}.hero svg{width:420px}section img{max-width:128px;max-height:128px}</style><div class="hero">${full}</div><section>${cells}</section><section class="dark">${cells}</section>`);
    await page.screenshot({ path: path.join(output, 'icon-review.png'), fullPage: true });
    console.log('Generated nine transparent PNG sizes and .dev/branding/icon-review.png');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

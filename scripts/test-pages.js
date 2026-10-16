'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {launchBrowser} = require('./browser-test-runtime');
const root = path.resolve(__dirname, '../.dev/pages-site');
const screenshots = path.resolve(__dirname, '../.dev/pages-tests');
const mime = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png'};

async function main() {
    fs.mkdirSync(screenshots, {recursive: true});
    const server = http.createServer((request, response) => {
        // Serve under the actual project subpath, not just the domain root.
        const url = new URL(request.url, 'http://localhost');
        const relative = decodeURIComponent(url.pathname).replace(/^\/beavercanvas\//, '');
        const file = path.resolve(root, relative || 'index.html');
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.writeHead(404).end();
            return;
        }
        response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage({reducedMotion: 'reduce'});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
        const address = `http://127.0.0.1:${server.address().port}/beavercanvas/`;
        for (const width of [1440, 1024, 768, 390, 360]) {
            await page.setViewportSize({width, height: 1000});
            await page.goto(address);
            await page.evaluate(async () => {
                for (const image of document.images) image.loading = 'eager';
                await Promise.all([...document.images].map(image => image.decode()));
            });
            assert.equal(await page.locator('h1').count(), 1);
            assert.equal(await page.locator('html').getAttribute('lang'), 'es');
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
            assert(await page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0)));
            await page.getByRole('navigation').getByRole('link', {name: 'Instalar', exact: true}).click();
            assert(new URL(page.url()).hash === '#instalar');
            await page.getByText('Antes de instalar la beta', {exact: true}).click();
            assert(await page.locator('details').evaluate(element => element.open));
            const downloads = await page.locator('a.button.primary').evaluateAll(links => links.map(link => link.href));
            assert.equal(downloads.length, 2);
            assert(downloads.every(url => /^https:\/\/github\.com\/michaaels\/beavercanvas\/releases\/download\/v0\.6\.6-beta\.1\/beavercanvas-.*\.zip$/.test(url)));
            await page.goto(address);
            await page.evaluate(async () => {
                for (const image of document.images) image.loading = 'eager';
                await Promise.all([...document.images].map(image => image.decode()));
            });
            await page.keyboard.press('Tab');
            assert.equal(await page.locator(':focus').textContent(), 'Saltar al contenido');
            assert(await page.locator(':focus').evaluate(element => element.getBoundingClientRect().top >= 0));
            await page.keyboard.press('Enter');
            await page.screenshot({path: path.join(screenshots, `website-${width}.png`), fullPage: true});
        }
        assert.deepEqual(errors, []);
        await page.context().close();
        console.log('Pages OK: project subpath, assets, downloads, mobile widths, keyboard skip, installation disclosure, reduced motion');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

main().catch(error => {console.error(error); process.exitCode = 1;});

# Project website

The static GitHub Pages site lives here. Product images remain in the plugin and
`docs/screenshots`; `node scripts/build-pages.js` copies only the selected assets
to ignored `.dev/pages-site`. Nothing from the development workspace is published.

To preview from the repository root:

```powershell
node scripts/build-pages.js
python -m http.server 8080 --directory .dev/pages-site
```

Open `http://localhost:8080/`. The deployed project subpath is also checked by
`node scripts/test-pages.js` using the repository's existing Playwright setup.
It verifies five viewport widths, images, keyboard skip navigation, download
links and the installation disclosure, and saves screenshots in `.dev/pages-tests`.

For a new release, update both download links, the release notes link and beta
version text in `index.html` to the verified, published installer. Keep the tested
DBeaver version accurate. CI validates pull requests; merges to main deploy
through `.github/workflows/pages.yml`. The website does not modify the P2 site.

# BeaverCanvas identity

Public name: **BeaverCanvas Plugin for DBeaver Desktop**. Short name: **BeaverCanvas**.
Subtitle: **SQL Dashboards & Report Designer**.
Slogan: **Turn SQL into visuals. Stay in DBeaver.**

An open-source plugin for DBeaver Desktop to create interactive charts,
dashboards, and reports from SQL data.

## Artwork

The project author supplied a beaver analyst/dashboard PNG and an approximate
SVG. The revised [illustration](../plugins/org.example.dbeaver.echarts/web/assets/beavercanvas.svg)
is made of editable paths, shapes and gradients, with a transparent background.
It follows the supplied silhouette and palette; it is a vector interpretation,
not a pixel-identical reproduction of the raster texture. No embedded bitmap,
font, linked image, official DBeaver logo or Apache ECharts logo is used.

The [small mark](../plugins/org.example.dbeaver.echarts/web/assets/beavercanvas-mark.svg)
is drawn specifically for 16–32px UI icons. It keeps the analyst's tail, suit,
blue tie and white tooth, plus the dashboard's header, pie and bar charts.
An enlarged mascot and solid contrasting shapes preserve the identity at small
sizes without relying on the illustration's fine gradients.
The full illustration is used at 48–512px. PNGs have transparent backgrounds.
Eclipse uses `beavercanvas-16.png` and the `@1.5x` / `@2x` siblings for high-DPI.
The HTML pages use the 32px favicon. README and About use larger illustrations.
Project artwork is distributed under the repository's Apache-2.0 license;
upstream library attribution remains in `third-party/`.

Palette: navy `#0b2d4d`, blue `#007fff` / `#41a7fc`, fur `#c96c31`,
muzzle `#f6b36b`, white. Check both light and dark backgrounds when editing.

Rebuild with the pinned browser test dependencies installed:

```sh
node scripts/build-icons.js
```

This exports the PNGs and `.dev/branding/icon-review.png` for visual review.
Only the native SVG files should be edited; commit regenerated PNGs with them.
The source PNG and the user's original SVG files are left unchanged.

## Compatibility audit

| Area | Public change | Retained contract |
| --- | --- | --- |
| Result tab, preferences, category, dialogs | BeaverCanvas labels and icons | Existing extension IDs |
| Installer and About | BeaverCanvas; provider `michaaels` | `org.example.dbeaver.echarts` bundle and feature IDs |
| ZIP and CI artifacts | `beavercanvas-<version>.zip` | Same P2 install IU; legacy ZIPs still accepted by installer tests |
| Java and browser integration | User-facing text only | Packages, classes, browser globals and callbacks |
| Preferences | Page name | Existing node names and preference keys |
| Dashboards / reports | Documentation and editor labels | `dbeaver-echarts-dashboard`, `dbeaver-echarts-report`, schema versions and extensions |
| Saved resources | No migration needed | `Dashboards/ECharts`, `Reports/ECharts`, default-template markers |
| SQL companions | No migration needed | `-- ECharts dashboard:` / `-- ECharts report:` headers, ownership checks |
| Dependencies | Apache ECharts described as the rendering library | Pinned bundles, third-party names, copyright, NOTICE and licenses |

Do not rename these technical identifiers as part of a visual rebrand. Opening
old documents remains passive: no SQL runs until the user reviews and requests it.
0.6.1 is greater than the published 0.6.0 beta, so P2 replaces the existing bundle.
The registry tests assert the new labels on the original extension IDs.
CI keeps the first 0.5.0 upgrade test and separately downloads the exact 0.6.0
release from `dev/ci/published-upgrade-baseline.json`, verifying its SHA-256.

## Publication

The project repository is [michaaels/beavercanvas](https://github.com/michaaels/beavercanvas).
The rebranding release is `v0.6.1-beta.1`; its installer is built and tested by
GitHub Actions before publication. Historic releases and their asset filenames
are retained. Published 0.6.0 files and its native Linux screenshot remain
historical evidence.
The `org.example` namespace stays for upgrade compatibility; it is not the public
brand and should not be replaced without a separately designed migration.

The name and supplied artwork are project identity, not proof of trademark
clearance. Keep the independence statement and third-party attributions when
preparing a public listing.

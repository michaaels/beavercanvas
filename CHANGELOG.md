# Changelog

## Unreleased

- Fix native SWT/Edge startup when opening Report Designer from a chart or
  dashboard: defer workbench view/editor creation until BrowserFunction returns.
  Apply the same protection to New report and opening report/dashboard files.
- Add a native SWT browser regression for callback-driven creation of a second
  Report Designer and ignoring queued actions after the source is disposed.
- Prepare a 0.6.3 preview installer, preserving the previous 0.6.2 archive.
- Simplify Report Designer actions into File, Layout, Data and Export groups;
  keep Save, Refresh data and Preview layout visible with explicit SQL behavior.
- Guide chart setup through Query, Data and Chart, with keyboard navigation,
  preserved drafts, inferred columns and cancellation available in every step.
- Add actionable empty reports, show content/data properties before collapsible
  appearance/layout controls, and improve label readability and narrow layouts.
- Refine the 16–32px BeaverCanvas icons to retain the analyst's tail, suit, blue
  tie and tooth alongside pie/bar charts; regenerate the 150%/200% UI variants.

## 0.6.1 beta — 2026-10-10

- Rename the public product to **BeaverCanvas Plugin for DBeaver Desktop**, focused
  on SQL dashboards and a visual report designer. Update installer, preferences,
  result tab, dialogs, About page, documentation and public packaging names.
- Add an editable vector beaver/dashboard illustration, a simplified small-size
  mark and transparent PNGs, including Eclipse high-DPI variants.
- Preserve bundle/feature/extension IDs, preferences, JSON markers, schema versions,
  file extensions, SQL companion headers and existing workspace folders.
- Add a checksum-pinned upgrade test from the actual published 0.6.0 beta alongside
  the existing 0.5.0 baseline. Historical releases remain unchanged.
- Publish under `michaaels/beavercanvas`; update project links and public description.

## 0.6.0 beta — 2026-10-10

- Diseñador visual con gráficos, KPIs, tablas, imágenes y secciones; plantillas
  JSON/SQL, fuentes compartidas o independientes y parámetros JDBC.
- Arrastre con vista previa del desplazamiento de los demás componentes,
  recuperación de espacios, zoom y deshacer/rehacer.
- HTML offline y borradores EML con imágenes CID; vista previa debajo del formulario
  y tablas limitadas a su página y altura configuradas.
- Dashboard con SQL y conexión por gráfico, editor de widgets y tamaño desde todos
  los bordes y esquinas; toolbar simplificada y correcciones de etiquetas.
- Más variantes de gráficos: barras horizontales, barras apiladas y áreas apiladas.
- Puente SWT asíncrono compatible con WebKit; pruebas de navegador e instalación Linux.
- Persistencia compartida, validación de plantillas organizada por responsabilidad
  y pruebas de colisiones SQL, escritura fallida y configuración de tablas.
- README con capturas y guía de instalación del release.

Entrega beta: paquete sin firma. Se probaron DBeaver Community 26.2.2 Windows/Linux
x86_64 y consultas SQLite/MariaDB en escenarios de prueba. macOS, aceptación en
clientes Outlook y certificación completa de drivers quedan pendientes. Consulta
[compatibilidad](docs/COMPATIBILITY.md) y [producción](docs/PRODUCTION-READINESS.md).

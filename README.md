<img src="plugins/org.example.dbeaver.echarts/web/assets/beavercanvas-256.png" width="180" height="180" alt="BeaverCanvas: castor analista frente a un dashboard">

# BeaverCanvas

**SQL Dashboards & Report Designer** · BeaverCanvas Plugin for DBeaver Desktop

*Turn SQL into visuals. Stay in DBeaver.*

[Sitio del proyecto y guía rápida de instalación](https://michaaels.github.io/beavercanvas/)

Plugin independiente para **DBeaver Desktop Community**: convierte resultados SQL en gráficos,
dashboards y reportes visuales con Apache ECharts. Eclipse se necesita para desarrollar,
pero **no para instalar y utilizar el plugin**.

## Descargar e instalar

Descarga el instalador y su checksum en el [release **0.6.6-beta.1**](https://github.com/michaaels/beavercanvas/releases/tag/v0.6.6-beta.1).
Todos los instaladores están en [GitHub Releases](https://github.com/michaaels/beavercanvas/releases).
La beta histórica [0.6.0](https://github.com/michaaels/beavercanvas/releases/tag/v0.6.0-beta.1)
todavía utiliza el nombre anterior. Los pasos siguientes corresponden a BeaverCanvas 0.6.6.

1. En DBeaver, abre **Help / Ayuda → Install New Software → Add → Archive**.
2. Selecciona `beavercanvas-<version>.zip` sin descomprimirlo.
3. Marca **BeaverCanvas Plugin for DBeaver Desktop**, completa la instalación y reinicia.
4. Ejecuta un `SELECT` y selecciona **BeaverCanvas** en las pestañas del resultado.
5. Para reportes, abre **Window → Show View → Other → BeaverCanvas → Report Designer**.

La actualización conserva la instalación existente: IDs P2, preferencias, extensiones
`.echarts-dashboard.json` / `.echarts-report.json` y carpetas `Dashboards/ECharts` /
`Reports/ECharts`. No necesitas mover tus archivos ni instalar un segundo plugin.

Target probado: **DBeaver Community 26.2.2, Windows y Linux x86_64**.
Es una **beta sin firma**, con certificación de drivers, clientes de correo y macOS pendiente.
Consulta la [guía de instalación](docs/P2-UPDATE-SITE.md), la
[matriz de compatibilidad](docs/COMPATIBILITY.md) y los [pendientes de producción](docs/PRODUCTION-READINESS.md).

La [interfaz de la próxima versión](docs/UX-IMPROVEMENTS.md) incorpora acciones
agrupadas y configuración de gráficos por etapas; incluye capturas del desarrollo.

## Funcionalidades en imágenes

Capturas del frontend local de BeaverCanvas con datos de ejemplo, tomadas durante
las pruebas de interacción. La [captura nativa de la beta 0.6.0 en Linux](docs/screenshots/report-designer-linux.png)
se conserva como evidencia histórica de DBeaver; todavía muestra el nombre anterior.
La [captura nativa de BeaverCanvas en Linux](docs/screenshots/report-designer-native-linux.png)
muestra el nuevo icono en SWT/WebKit con datos sintéticos de prueba, sin ejecutar SQL.

### Dashboards y mapas

Combina gráficos y mapas; mueve los widgets desde la cabecera y cambia su tamaño
desde **cualquier borde o esquina**. Guarda posiciones, configuración y SQL como
JSON versionado y archivo `.sql` en `Dashboards/ECharts`.

![Dashboard con barras, líneas y mapa geográfico](docs/screenshots/dashboard.png)

Los mapas permiten elegir **latitud y longitud**, **coordenadas en una columna** o
un **punto GeoJSON/WKT**, y añadir nombre, medida y campos de tooltip. La previa
indica las filas con coordenadas inválidas. Consulta los
[formatos y ejemplos SQL](docs/MAP-CHARTS.md).

![Editor de mapas con ubicación y datos del punto](docs/screenshots/map-widget-editor.png)

### SQL independiente por gráfico

**Add widget** y **Edit** permiten elegir conexión, editar SQL y ejecutar **Run preview**.
Selecciona columnas, series y ejes antes de aplicar el gráfico. Cada widget tiene su
propia consulta y política de refresco; **Review SQL** revisa las consultas guardadas.

La pestaña **2. Data** conserva el resultado y SQL anteriores mientras editas otra
consulta. Ejecuta una nueva previa para aplicar el cambio.

![Editor de widget con consulta SQL, selección de series y vista previa](docs/screenshots/widget-sql.png)

### Diseñador de reportes

El botón **Report Designer** lleva los gráficos del dashboard con los datos ya
visualizados, sin volver a ejecutar SQL. **Ctrl+Z**, **Ctrl+Y** y **Ctrl+Shift+Z**
permiten deshacer/rehacer; los tamaños y márgenes se actualizan en vivo. Al
reordenar filas de gráficos, la previa muestra cómo se recupera el espacio.
[Atajos, títulos automáticos y edición en vivo](docs/EDITING-WORKFLOW.md).

![Gráficos transferidos al diseñador con datos y propiedades en vivo](docs/screenshots/designer-workflow.png)

Diseña una hoja con títulos, textos, imágenes, secciones, gráficos, KPIs y tablas SQL.
Configura propiedades, fuentes de datos y parámetros; guarda plantillas reutilizables
con su SQL. Las tablas admiten paginación, totales y formato condicional.

![BeaverCanvas Report Designer con gráfico, tabla paginada y KPI](docs/screenshots/report-designer.png)

### Arrastre con reorganización previa

Al arrastrar un componente, la hoja muestra el espacio que ocupará y cómo se desplazarán
los demás elementos antes de soltarlo. Al eliminar componentes se recupera el espacio;
**Close gaps**, deshacer y rehacer ayudan a ajustar la distribución.

![Vista previa de inserción de un título con los componentes desplazados](docs/screenshots/report-reflow.png)

### Borrador de correo con vista previa

La vista previa aparece **debajo del formulario**. El EML incluye los gráficos como
imágenes CID y respeta la página y altura configuradas de las tablas, sin extenderlas
a toda la consulta. Puede adjuntar el HTML interactivo. **El plugin guarda el borrador;
no envía correo**. Su apertura y edición dependen del cliente instalado.

![Formulario de borrador EML con vista previa del reporte debajo](docs/screenshots/email-preview.png)

## Gráficos y exportación

- Líneas, áreas, barras verticales y horizontales, barras y áreas apiladas, dispersión,
  pastel, gauge, radar, heatmap, boxplot, treemap, funnel y mapa geográfico.
- Varias series, doble eje Y, escala visual, líneas y áreas de referencia.
- Tooltip, zoom, restauración y descarga PNG; renderizadores Canvas y SVG.
- Tema claro/oscuro sincronizado con DBeaver; filtros compartidos y drill-down en dashboards.
- Reportes HTML interactivos autocontenidos y HTML estático para correo.

ECharts, el mapa y los recursos del frontend se empaquetan localmente, sin CDN ni telemetría.
El HTML exportado permite consultar los datos incluidos; actualizar SQL requiere DBeaver.
Guías: [dashboards](docs/DASHBOARDS.md), [Report Designer](docs/REPORT-DESIGNER.md),
[cambios del release](CHANGELOG.md).

## Arquitectura y mantenimiento

Java 21 · Apache ECharts 6.1.0 · Eclipse PDE / SWT Browser.

```text
Resultados DBeaver / consultas aisladas
              ↓
DBeaverResultSetAdapter / DashboardQueryJob
              ↓
Snapshots JSON → EChartsPresentation → frontend local → ECharts
```

- `DashboardQueryJob` ejecuta consultas revisadas en contextos independientes;
  `DashboardQueryApproval` liga la aprobación de sesión al SQL y la conexión.
- `EChartsPresentation` mantiene el ciclo de vida SWT y el límite del hilo UI.
- `analytics.js` construye opciones; `dashboard.js` y `widget-editor.js` separan modelo y edición.
- `ReportFiles` valida plantillas; `DocumentFiles` centraliza escritura atómica por archivo
  y protección de los acompañantes SQL. El par JSON/SQL no es una transacción.
- Los [módulos de reportes](docs/REPORT-DESIGNER.md) separan plantilla, datos, render y correo.

## Validar y desarrollar

Windows:

```powershell
.\scripts\validate.ps1 -DBeaverPlugins C:\dbeaver\plugins
```

Linux:

```bash
DBEAVER_PLUGINS=/opt/dbeaver/plugins bash scripts/validate.sh
```

La validación comprueba fuentes Java/JavaScript, formatos, controles de consultas,
recursos y contratos del plugin. GitHub Actions construye el P2 y prueba instalación,
actualización, desinstalación y reinstalación en Windows; también instala y prueba
el mismo paquete en Linux con Chromium y WebKit.

Para una vista local con datos de ejemplo: `node scripts/preview.js`, luego abre
`http://127.0.0.1:8765`. Para Eclipse, importa los proyectos de `plugins/`, `features/`
y `sites/` y usa la instalación de DBeaver como target.
Consulta [desarrollo](docs/DEVELOPMENT.md), [build](docs/BUILD.md) y
[empaquetado P2](docs/P2-UPDATE-SITE.md).

## Licencias

Los recursos de terceros tienen versiones y hashes fijados. Licencias, avisos y
procedencia están en [third-party/](plugins/org.example.dbeaver.echarts/third-party/); los scripts de actualización
están en `scripts/`.

El código del plugin se publica bajo [Apache License 2.0](LICENSE). Apache ECharts
y d3-geo conservan sus licencias y avisos originales. El icono de BeaverCanvas es
una adaptación vectorial de la imagen aportada por el autor del proyecto; sus
[fuentes y variantes](docs/BRANDING.md) se mantienen separadas de los recursos de terceros.

BeaverCanvas es un proyecto independiente, mantenido por [michaaels](https://github.com/michaaels).
No es un producto oficial de DBeaver ni está afiliado a DBeaver Corporation o la
Apache Software Foundation. Los nombres DBeaver y Apache ECharts pertenecen a sus
respectivos titulares. Este plugin funciona en DBeaver Desktop; no incluye CloudBeaver.

## Contribuir

Abre un issue con versión de DBeaver, sistema operativo y pasos reproducibles;
comparte ejemplos SQL sin credenciales ni datos privados. Para contribuir código,
consulta [desarrollo](docs/DEVELOPMENT.md), ejecuta las validaciones y envía un PR
con el comportamiento esperado y las pruebas realizadas. Los cambios de formatos
persistidos e identificadores requieren mantener compatibilidad con archivos existentes.

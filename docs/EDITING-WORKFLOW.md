# Edición de dashboards y reportes

## Atajos dentro de BeaverCanvas

El navegador embebido toma los atajos mientras tiene el foco. Eclipse vuelve a
recibirlos cuando el foco sale del navegador o se cierra el control. Así se evita
que Ctrl+V se envíe al editor SQL nativo mientras se edita **1. Query**.

- **Ctrl+Z** deshace cambios aplicados, movimientos y tamaños.
- **Ctrl+Y** o **Ctrl+Shift+Z** rehacen lo deshecho.
- Al escribir en un campo de texto, se conserva el deshacer/rehacer del propio
  campo. Al seleccionar un gráfico o su asa, los atajos actúan sobre el documento.
- Dashboard y Report Designer muestran botones **Undo** y **Redo**.

La integración usa el [servicio de teclas de Eclipse](https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.isv/reference/api/org/eclipse/ui/keys/IBindingService.html),
con propietario y restauración del estado previo. No cambia las preferencias de
teclado del usuario. Los historiales son temporales, acotados a 80 estados y un
presupuesto de 24 MiB; no se escriben en la plantilla.

## Títulos que siguen los campos

Los gráficos nuevos usan **Use selected fields as title**: cambiar categoría,
series o datos de un mapa actualiza el título. Escribir un título desactiva esta
opción y conserva el nombre personalizado. La opción puede reactivarse en el
editor. Los títulos personalizados anteriores se conservan.

## Abrir el dashboard en Report Designer

El botón **Report Designer** lleva los gráficos y sus resultados visibles,
incluidos los filtros aplicados, sin ejecutar de nuevo las consultas. Las filas
viajan separadas de la definición, se validan y se asocian con la fuente de cada
gráfico. Las plantillas siguen guardando únicamente SQL, referencias de conexión,
configuración y diseño. La transferencia no concede permiso para refrescar SQL.

![Report Designer con datos transferidos y propiedades en vivo](screenshots/designer-workflow.png)

Los datos temporales tienen un límite de 16 MiB y 250.000 celdas por transferencia.
Si un gráfico todavía no tiene datos, conserva su estado vacío. Refrescar exige la
revisión habitual de SQL y conexión. Deshacer un cambio de consulta recupera su
última previa mientras siga en la caché temporal de 32 MiB; no ejecuta SQL.

## Ajustes y movimiento en vivo

**Sheet width**, **Margins**, dimensiones, espaciado y ajustes numéricos actualizan
la hoja al escribir o usar las flechas. El campo conserva el foco. Una edición
continua del mismo campo se agrupa en un paso de deshacer.

Al arrastrar un gráfico más allá del centro de otra fila, cambia el orden de
lectura: las filas cruzadas suben o bajan para ocupar el espacio. Las columnas y
dimensiones se conservan y cada sección tiene su propio flujo. Mover dentro de
la misma fila o hacia un espacio libre conserva la colocación libre. La previa y
el drop usan el mismo plan; Escape restaura el diseño completo.

Se revisaron los conceptos de flujo y anclaje de
[SwFlowFrame](https://docs.libreoffice.org/sw/html/flowfrm_8cxx_source.html) y
[SwAnchoredObjectPosition](https://docs.libreoffice.org/sw/html/anchoredobjectposition_8cxx_source.html)
de LibreOffice. La implementación de BeaverCanvas es propia para su cuadrícula
de 12 columnas y no incorpora código de Writer.

## Evidencia y alcance

`test-designer-workflow.js` comprueba pegado real con Ctrl+V en Chromium/Edge,
títulos, transferencia, historial, propiedades numéricas y reordenación con
eventos reales de ratón. WebKit ejecuta el mismo flujo con edición del campo SQL;
el portapapeles de WebKit no se automatiza en esa suite.

`EditingWorkflowTest` comprueba límites y limpieza de datos temporales y propiedad
del filtro de teclas. `NativeBrowserStartupTest` comprueba foco SWT y restauración
del filtro mediante un servicio de workbench simulado, y renderiza los datos
transferidos en SWT/Edge y SWT/WebKit. Esta prueba nativa no certifica el pegado
con todas las combinaciones de atajos o extensiones de un workbench personal.

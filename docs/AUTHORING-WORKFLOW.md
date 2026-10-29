# Edición, agrupaciones y sesiones SQL

Funciones incluidas en BeaverCanvas 0.6.8. La generación y el envío por CLI
se analizan por separado en [CLI-AUTOMATION-ANALYSIS.md](CLI-AUTOMATION-ANALYSIS.md);
ese cliente todavía no está implementado.

## Una medida o varias

**Y / value** reemplaza la medida seleccionada. Utiliza **Series** cuando quieras
añadir medidas y elegir sus ejes. El pastel utiliza un valor y no presenta ejes.

En **Grouping** elige suma, promedio, conteo de filas, mínimo o máximo. La opción
**Chart default** mantiene el comportamiento del tipo elegido: por ejemplo,
líneas sin agrupación conservan sus filas y barras/pasteles suman categorías.
La agrupación trabaja sobre el resultado cargado; si es parcial, no representa
filas que no se hayan leído. Para agregar toda la tabla, utiliza `GROUP BY` en SQL.

Para comparar sitios en el tiempo:

1. Selecciona `fecha` en X y la medida numérica en Y.
2. Abre **Grouping**, selecciona **Sum** y `sitio` en **Second category**.
3. Mantén **Separate series**: habrá una línea por sitio con la suma de cada fecha.

**Combined labels** permite mostrar las dos categorías juntas. La configuración
también está en el editor de widgets del dashboard y de gráficos del reporte.
Se conserva en JSON, al pasar al diseñador y al exportar. Un gráfico admite hasta
48 series generadas; filtra sitios o reduce medidas si la combinación supera ese
límite. Los gráficos de composición usan categorías combinadas.

## Consultar una tabla temporal del editor

En **Query**, elige la conexión y después su **Execution context**. La conexión
separada sigue siendo la opción predeterminada. Para una tabla temporal, elige
la sesión del editor SQL que la creó: la lista muestra editor y catálogo/esquema.

El refresco utiliza ese contexto exacto y conserva su base de datos, variables y
filas sin confirmar. El plugin cierra sus statements/resultados y su sesión de
trabajo, pero no la conexión prestada, y no hace commit, rollback ni cambios de
autocommit. Los refrescos del plugin sobre un mismo contexto se serializan.
Si el editor está ejecutando otra sentencia, termina esa ejecución antes de
refrescar el gráfico. Una consulta de lectura puede participar en la transacción
actual y mantener sus bloqueos según el motor.

La revisión SQL también queda ligada a la sesión seleccionada. Cambiar consulta,
conexión, parámetros o sesión invalida la aprobación. El identificador de la sesión
es temporal: no se guarda en plantillas ni configuraciones exportadas. Al reabrir
una plantilla que usa sesión de editor, selecciónala de nuevo en Query. Si se
cierra o desconecta, el plugin muestra un error y no sustituye otra conexión.

Las tablas temporales pertenecen a la conexión que las creó. Un reporte abierto
en otro proceso o una futura tarea CLI no hereda esa sesión automáticamente.

## Escribir e insertar sobre la hoja

Haz clic en el espacio blanco de la hoja para colocar la línea de inserción y
empieza a escribir. El párrafo mantiene la posición horizontal elegida, en
unidades de la hoja, incluidos guardar/reabrir y exportar. Se respetan los márgenes
y se ajusta la sangría al ancho disponible.

Escribe **/** para abrir el selector de componentes junto al cursor. Filtra por
nombre, usa ↑/↓ y Enter para insertarlo. Esc cierra sin insertar. También funciona
en un párrafo vacío; el componente elegido reemplaza ese párrafo vacío. La
biblioteca lateral y el arrastre continúan disponibles.

Cuando mueves hacia arriba un componente unido a la fila siguiente, sus gráficos
y las filas conectadas también recuperan espacio hacia arriba. Se mantienen
columnas, tamaños, huecos deliberados y límites de sección. La previa y el resultado
usan el mismo cálculo. El criterio adapta el flujo hacia atrás descrito en
[`SwFlowFrame::MoveBwd` de LibreOffice](https://docs.libreoffice.org/sw/html/flowfrm_8cxx_source.html)
al modelo de cuadrícula del plugin; no se copia código de Writer.

## Zoom y teclado

**Ctrl + rueda** amplía o reduce la hoja entre 25% y 200%, alrededor del puntero
dentro del espacio disponible. La rueda sola conserva el desplazamiento normal
y la interacción de los gráficos. El zoom no cambia el diseño guardado ni añade
pasos de Deshacer; la lista de porcentajes refleja el nivel actual.

| Tecla | Acción |
| --- | --- |
| Tab / Shift+Tab | Siguiente/anterior control; conserva el orden nativo |
| Flechas con el componente enfocado | Seleccionar el componente en esa dirección |
| Ctrl+flecha fuera del texto | Siguiente/anterior componente en orden de lectura |
| Home / End | Primer/último componente de la fila |
| Ctrl+Home / Ctrl+End | Primer/último componente del reporte |
| Enter sobre un componente | Editar texto, configurar un gráfico o enfocar su asa |
| Esc | Cancelar arrastre/cerrar menú o diálogo/quitar selección |
| Ctrl+F | Buscar componentes por título, tipo o texto |
| Ctrl+S | Guardar plantilla |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Deshacer/rehacer |
| Flechas en el asa de movimiento / Alt+flechas sobre un componente | Mover el componente |
| Flechas en un asa de tamaño | Ajustar ese borde |

Dentro de texto y formularios, flechas, Ctrl+flecha, Shift, Home/End y selección
de palabras conservan la edición del navegador. La búsqueda y el guardado del
reporte se limitan al navegador de BeaverCanvas enfocado. Los atajos del editor
SQL de DBeaver quedan fuera de ese alcance.

## Pruebas y límites de la evidencia

- Geometría: recuperación hacia arriba, filas alineadas, secciones y huecos.
- Edge y WebKit: cursor, menú `/`, teclado, zoom de hoja sin modificar el rango del
  gráfico, cambio de Y, agrupación por sitio/fecha y eliminación de IDs de sesión.
- SWT/Edge y SWT/WebKit: arranque y comandos de edición; el harness de comandos del
  workbench es simulado y no certifica todas las preferencias personales.
- MariaDB real en una instancia local aislada: una tabla temporal no es visible
  desde otra conexión; el trabajo del plugin ve sus filas sin confirmar y deja
  abierta y sin commit la conexión prestada. El test usa JDBC real y adaptadores
  SPI de prueba, no el editor SQL completo.

Para repetir la prueba JDBC, instala/proporciona un servidor de pruebas y el JAR
del driver MariaDB. Configura `ECHARTS_TEST_JDBC_URL`, `ECHARTS_TEST_JDBC_USER`,
`ECHARTS_TEST_JDBC_PASSWORD`, `ECHARTS_TEST_JDBC_DRIVER` y `ECHARTS_COMPILER_JDK` y
ejecuta `node scripts/test-editor-session-jdbc.js <directorio-de-dbeaver>`.
El test utiliza una tabla temporal propia, no modifica tablas del usuario y
exige un workspace Equinox de pruebas independiente.

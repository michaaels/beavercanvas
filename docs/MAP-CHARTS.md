# Mapas con campos de ubicación

Los mapas tienen controles propios en la vista del resultado, en los widgets del
dashboard y en Report Designer. Ya no es necesario usar «X / category» para la
longitud ni ordenar latitud y valor dentro de «Series».

![Configuración de ubicación y datos del punto](screenshots/map-widget-editor.png)

1. Selecciona **Map** y el **Location format**.
2. Asigna las columnas de ubicación.
3. Elige **Point name**, el valor numérico de **Size and color** y los campos
   adicionales de **Additional tooltip fields**. El valor es opcional: puedes
   mostrar puntos del mismo tamaño sin una medida numérica.
4. Comprueba la previa y el contador de filas válidas antes de aplicar.

## Formatos de ubicación

| Formato | Columnas / ejemplo | Orden |
| --- | --- | --- |
| Latitude and longitude columns | `longitud = -78.4678`, `latitud = -0.1807` | Cada campo tiene su selector |
| Coordinates in one column | `[-78.4678,-0.1807]` o `-78.4678, -0.1807` | Selector explícito de longitud/latitud o latitud/longitud |
| Geographic point | `POINT (-78.4678 -0.1807)` o `{"type":"Point","coordinates":[-78.4678,-0.1807]}` | Longitud, latitud |

Se aceptan GeoJSON Point y Feature con geometría Point, WKT Point 2D y EWKT con
`SRID=4326`. Las coordenadas deben estar en grados WGS84: longitud entre −180 y
180, latitud entre −90 y 90. No se reproyectan coordenadas ni se dibujan polígonos,
líneas o colecciones de geometrías. Un driver que entregue una geometría binaria
o un objeto no reconocido debe devolver texto con `ST_AsText(...)` o
`ST_AsGeoJSON(...)` en el SELECT.

Las filas con ubicación inválida o una medida nula/no numérica no se dibujan.
El contador distingue ambos casos; cero es un valor válido. Si ninguna fila es
válida, la previa explica el problema y no permite aplicar el gráfico.

Con la tabla de demostración puedes probar las consultas de
[map-location-formats.sql](../dev/sql/map-location-formats.sql).

## Conservar resultados al editar SQL

La pestaña **2. Data** conserva el último resultado mientras escribes o ejecutas
una nueva consulta, incluso si la nueva ejecución falla o se cancela. Incluye
el SQL que produjo los datos mostrados. Al cambiar SQL o conexión, indica que
es un resultado anterior; ejecuta **Run preview** para poder aplicar el nuevo
SQL. Cambiar de pestaña no ejecuta consultas ni borra el borrador.

## Persistencia y compatibilidad

La definición del mapa se guarda en `chart.map`, junto con el SQL y el diseño:

```json
{
  "chartType": "map",
  "map": {
    "mode": "latLon",
    "longitude": "longitud",
    "latitude": "latitud",
    "location": "",
    "order": "lonLat",
    "label": "ciudad",
    "value": "ventas",
    "details": ["costos", "region"]
  }
}
```

Los modos son `latLon`, `coordinates` y `geo`. `location` se usa para los modos
de una sola columna. Los campos vacíos de nombre/valor son opcionales y hay un
máximo de 12 campos de tooltip. No se guardan autorizaciones ni datos de la
previa en las plantillas. El HTML interactivo incluye el parser y el mapa
localmente; el correo sigue usando una imagen del gráfico.

Los dashboards antiguos con `xColumn = longitud` y
`yColumns = [latitud, valor]` siguen funcionando. Al editarlos se presentan los
selectores nuevos, conservando su ubicación y medida. Al hacer clic en un punto,
el filtro usa el campo del nombre del punto, si está configurado.

## Decisiones de UX y validación

Se conserva la tipografía Segoe UI de 13 px y la paleta del host. La base clara
usa fondo `#ffffff`, texto `#243447`, texto secundario `#657487`, borde `#d5dce3`,
superficie `#f3f6f9` y foco `#21679b`; el tema oscuro hereda los colores de DBeaver.
El orden de lectura es ubicación → datos → estado → previa. Las etiquetas se
alinean a la izquierda y los controles se apilan en pantallas estrechas.

```text
Location format       Longitude / geographic field
Latitude / order      Ayuda del formato
Point name            Size and color
Additional tooltip fields
Filas válidas / descartadas
Previa del mapa
```

`test-map-data.js` comprueba formatos, rangos, nulos, ceros, escaping, modelos y
compatibilidad. `test-map-editor.js` comprueba los selectores reales, previa,
guardado/reapertura, conservación de Data, SQL fallido y HTML sin conexión. Las
pruebas de navegador usan un puente simulado; no equivalen a una prueba JDBC
real de todos los tipos geográficos de cada driver.

# Automatización por CLI: viabilidad y propuesta

Análisis del código de BeaverCanvas del 28 de octubre de 2026. El plugin actual
no incluye un cliente CLI de generación ni un transportador de correo. Los
comandos de esta propuesta describen una interfaz futura; no son ejecutables hoy.

## Resultado

Sí es viable ejecutar las consultas con parámetros y generar HTML/EML de forma
programada. El envío automático necesita una operación independiente, autenticada
y explícita. Guardar un EML no lo envía: el generador actual lo marca como borrador
con `X-Unsent: 1`.

La vía más cercana al plugin es una aplicación Equinox adicional y un renderer
compartido con el diseñador. Un cliente JDBC totalmente independiente también es
posible, pero no heredaría por sí solo drivers, túneles, autenticación, catálogos
ni preferencias de las conexiones de DBeaver.

## Qué se puede reutilizar

| Necesidad | Código actual | Trabajo necesario |
| --- | --- | --- |
| Plantillas JSON, SQL y límites | `ReportFiles`, `DashboardFiles` | Entrada/salida CLI con rutas y errores claros |
| Parámetros tipados | `ReportParameters` | Recibir valores de archivo o argumentos y validarlos antes de abrir conexiones |
| Ejecución limitada y cancelación | `DashboardQueryJob`, `DashboardSqlPolicy` | Autorización no interactiva para una plantilla revisada y conexión elegida |
| Renderizado de gráficos/tablas | `analytics.js`, `report-widgets.js` | Renderer de trabajo fuera del controlador de autoría |
| HTML e imágenes CID/EML | `report-export.js` | Adaptador de exportación sin diálogo de archivos ni formulario |
| Correo programado | No existe | SMTP con TLS/OAuth o API del proveedor, destinatarios, registro e idempotencia |

`EChartsPresentation` posee hoy el navegador SWT, las aprobaciones y los diálogos.
No conviene convertirlo en el runner CLI. Las funciones de renderizado/exportación
ya están separadas y permiten construir un adaptador que no abra el diseñador.

## Arquitectura recomendada

```text
CLI -> validar plantilla y parámetros -> resolver conexiones y credenciales
    -> ejecutar SELECT con límites -> snapshot
    -> renderer compartido -> HTML + PNG/CID -> EML en disco
    -> [send explícito] transportador de correo -> registro de resultado
```

1. Añadir una aplicación Equinox propia mediante
   [`org.eclipse.core.runtime.applications`](https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.isv/reference/extension-points/org_eclipse_core_runtime_applications.html).
   Su [`IApplication`](https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.isv/reference/api/org/eclipse/equinox/app/IApplication.html)
   recibiría argumentos y devolvería un código de salida. No requiere modificar
   el ejecutable principal de DBeaver ni depender de tareas comerciales.
2. Usar un workspace exclusivo para automatización. Dos procesos no deben abrir
   el mismo workspace; una tarea independiente no puede tomar por magia la sesión
   SQL de una ventana que ya está abierta.
3. Cargar las conexiones permitidas y enlazar los parámetros con el contrato JDBC
   existente. La autorización para ejecución desatendida debe declarar la
   plantilla exacta/revisada y sus conexiones; no simular el diálogo de aprobación.
4. Extraer la coordinación de generación a un servicio que espere la finalización
   de todos los snapshots, descarte errores y renderice con el mismo código de
   agrupación, formato, viewport y tablas que el diseñador.
5. Guardar el EML atómicamente y emitir un resumen JSON sin SQL sensible,
   credenciales o filas. La generación debe fallar si alguna consulta requerida
   falla; no enviar un reporte parcial como si fuera completo.

### Renderer

El renderer actual usa DOM y ECharts en un `Browser` SWT: una aplicación Java sin
UI no basta para obtener los PNG. Dos opciones a comprobar con un prototipo:

- SWT/Edge o SWT/WebKit en una sesión gráfica de automatización. En Linux,
  Xvfb proporciona un display virtual; seguirá requiriendo SWT/WebKit y sus
  bibliotecas. Reutiliza más código nativo pero no es un proceso sin display.
- Chromium sin ventana con un adaptador Node/Playwright de producción. Las pruebas
  ya demuestran el renderizado fuera de DBeaver; faltan empaquetado, instalación,
  control de versiones y soporte de ese runtime. No depender de `.dev` ni de las
  dependencias de pruebas en un instalador de usuarios.

Recomiendo prototipar primero generación EML con el primer adaptador y publicar
el CLI como componente opcional. Evaluar Chromium si el destino principal es un
servidor sin escritorio. Ambos deben probar fidelidad, timeout y liberación de
recursos antes de automatizar envíos.

## Interfaz propuesta

```text
beavercanvas-cli render --workspace <automation-workspace>
  --template <traffic.echarts-report.json>
  --parameters <period.json> --output <traffic.eml> --format eml

beavercanvas-cli send --message <traffic.eml>
  --mail-profile <operations> --to <configured-recipient>
```

`period.json` contendría, por ejemplo, `{"start_date":"2026-10-19",
"end_date":"2026-10-23","site":"Quito"}`. Los nombres deben coincidir con los
parámetros declarados; las fechas y números conservan su tipo. No interpolar
texto dentro del SQL. Rechazar nombres desconocidos, valores inválidos y
parámetros requeridos sin valor.

Propuesta de salida: `0` éxito, `2` argumentos/plantilla inválidos, `3` conexión o
autenticación, `4` consulta/timeout, `5` renderizado/archivo, `6` envío. Son códigos
propuestos y deben estabilizarse con las pruebas del CLI.

## Sesiones y tablas temporales

Una tarea iniciada en otro proceso no ve una tabla temporal de una conexión de
DBeaver que ya está abierta. Para automatización hay dos alternativas explícitas:
crear/preparar los datos en la misma conexión del trabajo, o consultar una tabla o
vista persistente de preparación. Si se permite preparación SQL, debe tener un
contrato separado del guard de consultas de lectura actual; no relajar ese guard.

También se podría añadir un comando a una instancia abierta, con IPC autenticado
local y elección explícita de sesión. Eso exige gestionar trabajo en curso,
caducidad, bloqueo y cierre del editor; no forma parte de un CLI independiente.

## Envío y programación

El envío debe ser opcional y separado de `render`. Un perfil de correo obtiene
secretos del almacenamiento seguro o del gestor de secretos del entorno, nunca
del JSON del reporte ni de parámetros de línea de comandos que expongan tokens.
El adaptador debe convertir el borrador en un mensaje de envío y validar
remitente/destinatarios sin cabeceras inyectadas. Para Microsoft 365,
[`sendMail` de Microsoft Graph](https://learn.microsoft.com/es-es/graph/api/user-sendmail?view=graph-rest-1.0)
acepta contenido MIME. Su respuesta `202 Accepted` confirma aceptación de la
solicitud, no entrega final al destinatario.

Registrar un ID por reporte/período/destinatarios para no duplicar envíos ante un
reintento. Los errores ambiguos de red no deben provocar un reenvío ciego. Cron,
systemd timers o el Programador de tareas de Windows pueden invocar el futuro CLI
y recoger su código de salida; el plugin no necesita un planificador propio.

DBeaver documenta `-runTask` en su
[gestión de tareas](https://dbeaver.com/docs/dbeaver/Task-Management/), pero eso no
registra automáticamente una tarea para BeaverCanvas ni añade este exportador.
El CLI propuesto tendrá un contrato propio comprobable en el target Community.

## Criterios de un prototipo terminado

- Misma plantilla y parámetros producen las mismas series, totales, rango/zoom y
  filas visibles que el diseñador; EML contiene los CID y adjuntos correctos.
- Consultas concurrentes limitadas, cancelación, timeout y limpieza al fallar.
- Sin modificar una sesión de usuario ni registrar secretos.
- Sin envío durante validación, renderizado, apertura o reintentos ambiguos.
- Ejecución desatendida real en Windows y Linux, con un workspace independiente.

El análisis queda entregado; implementar y distribuir ese CLI sería la siguiente
función, con pruebas propias de conexión, renderer y transporte.

# Apertura de Report Designer desde SWT

La versión de prueba 0.6.2 podía mostrar `Waiting for Edge operation to terminate
timed out` al abrir Report Designer desde un gráfico o dashboard. La apertura de
la vista ocurría dentro de `BrowserFunction` y creaba un segundo navegador antes
de devolver el control al primero.

La corrección difiere la creación de vistas y editores mediante `Display.asyncExec`,
incluso cuando la solicitud llega en el hilo de UI. Antes de ejecutar la tarea se
comprueba que la presentación de origen siga activa. Las funciones de apertura
devuelven aceptación de la solicitud; la confirmación de reemplazar cambios sin
guardar sigue perteneciendo a la vista de DBeaver.

Esto cubre Report Designer desde resultados/dashboards, New report y abrir archivos
de reportes y dashboards. Los formatos JSON/SQL y la revisión de consultas se
conservan. Los errores de inicialización del navegador registran su causa completa
en el log de Eclipse.

Microsoft describe esta restricción en su
[modelo de ejecución de WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model#reentrancy).

## Regresión nativa

```powershell
$env:ECHARTS_COMPILER_JDK = 'C:/ruta/al/jdk-21'
node scripts/test-plugin-registry.js 'C:/ruta/a/dbeaver' --installed --native-startup
```

Sin `--installed`, el runner compila el código y carga el bundle desde una carpeta
de prueba, incluyendo todos los scripts relativos a `report.html`, como en la
instalación P2 con `unpack=true`. Utiliza el Java del producto para la prueba nativa.

En Linux, ejecutar con una sesión gráfica o `dbus-run-session -- xvfb-run -a`.
El runner permite `ECHARTS_TEST_TIMEOUT_MS` para equipos lentos.

La prueba utiliza controles SWT reales y el frontend del plugin. Un callback del
primer navegador solicita otro Report Designer; se verifica el retorno del callback,
la carga de la segunda página y el descarte de tareas tras cerrar su presentación
de origen. En el paquete 0.6.2 se observó el timeout de Edge; con la corrección
la misma operación pasó en Windows, tanto con el código compilado como con el ZIP
0.6.3 instalado por P2. También pasó en SWT/WebKit sobre Ubuntu/WSL con Xvfb.

El runner exige los marcadores de finalización nativa y de registro OSGi además
del código de salida; una terminación prematura del runtime no cuenta como éxito.

El harness no abre bases de datos ni utiliza un workspace personal. Comprueba el
límite entre el callback y la creación nativa del navegador; no es una prueba de
toda la navegación del workbench o de drivers JDBC. El ciclo P2 se comprueba por
separado con instalar, actualizar, desinstalar y reinstalar.

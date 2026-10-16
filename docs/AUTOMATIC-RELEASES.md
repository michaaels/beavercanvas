# Releases automáticos en GitHub

**Release plugin** construye el instalador y publica una versión al enviar una
etiqueta `v*`. Reutiliza **P2 package**: pruebas de Windows, ciclo P2 completo,
actualización desde la beta publicada y pruebas de Linux sobre el mismo ZIP.
Solo publica si todas terminan correctamente. No necesita un PAT ni contraseñas;
usa `GITHUB_TOKEN` con escritura de contenido únicamente en el job de publicación.

## Publicar una versión nueva

1. En un PR, actualiza la versión base en el manifiesto del bundle,
   `feature.xml` y `category.xml`, junto con `CHANGELOG.md`. Integra el PR en `main`.
2. Crea y envía una etiqueta sobre ese commit. Por ejemplo, **cuando la versión
   del código sea 0.6.7**:

   ```bash
   git switch main
   git pull --ff-only
   git tag -a v0.6.7-beta.1 -m "BeaverCanvas 0.6.7 beta 1"
   git push origin v0.6.7-beta.1
   ```

3. Sigue **GitHub → Actions → Release plugin**. Al terminar, el release contiene
   el ZIP instalable, SHA-256, procedencia, informes P2 e instrucciones de instalación.

Las etiquetas `vX.Y.Z-alpha.N`, `vX.Y.Z-beta.N` y `vX.Y.Z-rc.N` producen
**prereleases**. `vX.Y.Z` produce un release normal. La versión base debe coincidir
con los tres archivos de producto. El commit debe pertenecer al historial de
`main`; las etiquetas anotadas también están admitidas. Crear una etiqueta
desde otro workflow con `GITHUB_TOKEN` no dispara otro workflow de push; usa
un push del mantenedor o la ejecución manual descrita abajo.

## Probar o ejecutar manualmente

Abre **Actions → Release plugin → Run workflow**, selecciona **main**, introduce
una etiqueta existente y deja activado **dry_run** para probar sin publicar.
Construye, instala y verifica el paquete; adjunta el resultado como artefacto
`beavercanvas-release-<tag>` durante 14 días, incluso si el release ya existe.

Desde GitHub CLI, una prueba con la versión existente:

```bash
gh workflow run release.yml --ref main -f tag=v0.6.6-beta.1 -F dry_run=true
```

Para publicar manualmente una etiqueta nueva, desactiva **dry_run**. Solo se
permite publicación manual desde `main`. Los pushes de etiquetas publican
automáticamente, sin activar ese modo de prueba.

## Verificación y recuperación

Antes de publicar se comprueban el commit, la versión, el árbol limpio del build,
SHA-256, archivos P2 y ambos informes de instalación/actualización. La publicación
vuelve a verificar los adjuntos y que la etiqueta siga apuntando al mismo commit.
Se crea primero un borrador, se suben los archivos y después se hace visible.

No se reemplazan releases, borradores ni adjuntos existentes. Si falla la carga,
revisa el borrador incompleto en Releases: puedes eliminar ese borrador que nunca
se publicó y repetir el workflow sobre la misma etiqueta. Si el release ya fue
publicado, utiliza una etiqueta nueva; no muevas ni sobrescribas la anterior.

Las notas enlazan el changelog y la ejecución. Las pruebas de navegador/registro
no equivalen a certificación completa de SWT, todos los drivers o clientes de
correo. La automatización no firma el plugin ni publica un sitio de actualizaciones
P2. GitHub Pages mantiene su propio flujo; sus enlaces y texto de versión se
actualizan en el código de la web al preparar su publicación.

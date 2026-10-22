# Mantener la instalación anterior durante la transición

El destino de entrega actual es [Azure](azure/README.md). Esta guía conserva los procedimientos de la VM compartida mientras se verifica transferencia y recuperación. Su ejecutor consulta releases; no es el mecanismo utilizado por el workflow Azure.

| Instalación | Entrada y operación |
| --- | --- |
| Azure vigente | Caddy/HTTPS, Docker Compose, `develop` y `main` mediante Actions y agente Azure; [diagnóstico y recuperación actuales](azure/README.md#diagnóstico-y-recuperación) |
| VM compartida anterior | HTTP 8081, Podman rootless/Quadlet y timer de releases histórico; los comandos de esta página se ejecutan sólo allí |

No copiar configuración de sesiones, secretos, redes o timers entre ambos destinos. Comprobar hostname/usuario y el entorno antes de usar un procedimiento. El polling antiguo no recibe las imágenes del workflow Azure vigente.

Antes de retirar la instalación anterior, conservar un respaldo verificable, transferir las cuentas/datos necesarios, comprobar los recorridos y ensayar recuperación. No modificar Zableke, Jenkins, Tailscale del host ni servicios de otros proyectos. La entrada HTTP de Cenit es 8081; 8080 pertenece al Jenkins existente. El HTTP autorizado para esa demostración no fija la política de una instalación institucional.

## Revisar el estado

En la VM, con el usuario de Cenit y sin sudo para sus servicios rootless:

```bash
systemctl --user status cenit-db.service cenit-nginx.service cenit-app.service --no-pager
systemctl --user show cenit-cd.service -p Result -p ExecMainStatus
systemctl --user list-timers cenit-cd.timer --all --no-pager
cat ~/.local/share/cenit/cd/status.json
```

`waiting-for-release` sólo indica que el ejecutor no encontró una entrega aplicable. `/health/proxy` acredita el proxy temporal; `/health/ready` y los recorridos autenticados son necesarios para comprobar la aplicación.

El estado privado usa estos archivos:

| Archivo/directorio | Contenido |
| --- | --- |
| `~/.local/share/cenit/cd/current.json` | Último manifiesto instalado correctamente |
| `~/.local/share/cenit/cd/attempt.json` | Último intento que alcanzó backup/migración |
| `~/.local/share/cenit/cd/backups` | Dumps previos a migraciones |
| `~/.local/share/cenit/registry/auth.json` | Credencial privada de GHCR |
| `~/.local/share/cenit/demo-local/secrets/auth-demo.json` | Cuentas ficticias preparadas en esa VM |

No publicar el contenido de archivos de credenciales. Un dump incompleto o un índice consultable no sustituyen un ensayo de restauración.

## Instalar o actualizar las herramientas anteriores

Copiar sólo `deploy` a `~/Cenit/`, sin `.env`, secretos ni estado de otra instalación. El bootstrap y el ejecutor existentes tienen funciones distintas:

```bash
bash ~/Cenit/deploy/scripts/bootstrap-vm.sh
bash ~/Cenit/deploy/scripts/install-cd.sh
```

El bootstrap prepara Nginx y PostgreSQL rootless mediante Quadlet. Antes de ejecutarlo en una instalación existente, revisar sus precondiciones y los servicios activos; no usarlo como reinicio de datos. El instalador de CD comprueba acceso a GitHub/GHCR, roles separados y plantillas Quadlet. Repetirlo conserva sus secretos compatibles; una discrepancia debe revisarse, no sobrescribirse.

Si ya hay una entrega en curso, detener el timer y esperar a que termine antes de reinstalar herramientas. No interrumpir una migración. La copia instalada debe comprobar `main`; actualizar el checkout no actualiza automáticamente las herramientas privadas de la VM.

Los scripts `configure-github-read.py` y `login-ghcr.sh` preparan lectura GitHub y autenticación GHCR. Sus tokens se introducen únicamente en la VM por el procedimiento privado; no se incorporan a archivos versionados. El monitor `install-github-monitor.sh` sólo observa releases y no acredita instalación de una aplicación.

## Contrato del ejecutor anterior

El consumidor [cd_release.py](scripts/cd_release.py), [cd_runtime.py](scripts/cd_runtime.py) y [deploy-approved-release.py](scripts/deploy-approved-release.py) verifica procedencia antes de actuar:

- Repositorio `Menderin/Cenit`, workflow `release.yml`, evento push y rama `main`; ejecución completada y exitosa, con `CI / Application`, `CI / CI required` y `Publish image` correctos. CI omitido no autoriza entrega.
- Release publicada, no borrador ni prerelease, tag `cenit-<SHA completo>`. Su cuerpo contiene únicamente `workflowRunId` y `workflowRunAttempt` del run que produjo la entrega.
- Artifact `cenit-release-<run_attempt>`, ZIP con un único `cenit-release.json`, procedencia y digest de artifact comprobados. Un artifact expirado no permite instalar de nuevo esa entrega.
- Manifiesto con `schemaVersion: 1`, `repository`, `branch`, `commit`, `image`, `workflowRunId`, `workflowRunAttempt`, `runNumber` y `migrationPolicy: backward-compatible`.
- Imagen `ghcr.io/menderin/cenit@sha256:<digest>`, Linux/amd64, etiquetas OCI de repositorio/SHA, runtime 1000:1000 y puerto 3000. No se aceptan `latest` ni comandos libres de una release.

El workflow Azure vigente publica imágenes por digest y las entrega mediante Run Command; no produce automáticamente ese contrato de releases del consumidor anterior. **No reactivar su polling como si recibiera las entregas Azure.** La compatibilidad de un productor anterior debe verificarse explícitamente antes de usar el ejecutor para instalar.

La imagen recibe `DATABASE_URL_FILE` con rol runtime; el migrador usa otra credencial y `node /app/deploy/migrate.cjs`. Ambos trabajan en `cenit`, con journal y aliases legados intactos. No necesitan crear cuentas ni sembrar datos al arrancar. Las páginas web y `/health/ready` se verifican después de migrar, sin sustituir los recorridos por smoke checks.

## Preparación privada de cuentas de demostración

La imagen runtime no lleva herramientas de creación de cuentas ni tsx. El cargador académico compilado es una operación separada; su presencia no prepara cuentas ni historiales. La herramienta [prepare-demo-vm.sh](scripts/prepare-demo-vm.sh) admite una imagen de herramientas del mismo commit limpio que la aplicación instalada. Construir esa imagen fuera de la VM usando el target `build` del Containerfile; transferirla de forma privada y comprobar su SHA/etiquetas antes de ejecutar:

```bash
bash ~/Cenit/deploy/scripts/prepare-demo-vm.sh "localhost/cenit-demo-tools:<SHA instalado>"
```

Conserva cuentas compatibles y sus identidades; no rota credenciales ni se ejecuta desde CD. Cualquier rotación supervisada usa [rotate-demo-passwords.mjs](scripts/rotate-demo-passwords.mjs), con los archivos privados esperados y revocación de sesiones, preservando UUID/nombre/rol de esa VM. Si falla, revisar transacción y archivos antes de repetir; no copiar UUID locales sobre los existentes ni compartir claves.

## Pausar entregas y recuperar una aplicación

Pausar próximas consultas sin detener la aplicación:

```bash
systemctl --user disable --now cenit-cd.timer
```

Una operación ya iniciada continúa. Revisar `attempt.json`, `status.json`, servicios y logs privados antes de promover otra entrega. El ejecutor serializa operaciones y no repite a ciegas una migración fallida/interrumpida. Descarga/verifica la imagen y crea un backup antes de migrar; si falla la nueva aplicación o proxy intenta recuperar las configuraciones e imágenes anteriores o el bootstrap inicial. No restaura datos automáticamente.

Una interrupción de la VM o del proceso durante la entrega requiere inspección explícita. Conservar imágenes anteriores y dumps, comprobar espacio y no ejecutar prune global. No borrar un intento o el historial para forzar una repetición.

Si el healthcheck de PostgreSQL provoca reinicios, revisar la unidad y el diagnóstico antes de modificar nada. `bootstrap-vm.sh` conserva datos y genera la configuración preparada; no reemplazar un volumen para resolver el problema. Mantener una copia de configuración y base antes de la intervención.

El acceso temporal por túneles y los timers de observación no sustituyen HTTPS estable ni recorridos comprobados. Al completar la transición se detienen únicamente los servicios/timers de Cenit; la retirada y conservación de datos requieren verificación previa, no se deducen de que Azure tenga un workflow correcto.

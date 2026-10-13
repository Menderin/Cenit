# Primera entrega automática de la demostración

Entrega autorizada el 13 de octubre de 2026: ensayar la aplicación actual con cuentas ficticias por `http://172.16.13.103:8081`. No acredita que la malla o extracción automática estén terminadas. El puerto 8080 sigue reservado al Jenkins existente.

## Antes del merge de entrega

El CI completo ejecuta typecheck, ESLint (sin modificar archivos), catálogo, unitarias, build, integración PostgreSQL, Playwright contra el servidor compilado y verificación de imagen. `CI required` sigue siendo obligatorio. `Academic foundation` queda como compatibilidad para checkouts parciales; la demo actual utiliza `Application`.

Copiar únicamente `deploy`, nunca `.env` ni secretos, desde PowerShell:

```powershell
scp -r "C:\Users\vjopi\OneDrive\Documentos\GitHub\Cenit\deploy" "adminc@172.16.13.103:~/Cenit/"
ssh adminc@172.16.13.103
```

En la VM, sin sudo:

```bash
bash ~/Cenit/deploy/scripts/install-cd.sh
grep -n 'DELIVERY_BRANCH' ~/.local/share/cenit/bin/cd_release.py
grep -n 'AUTH_' ~/.local/share/cenit/cd/cenit-app.container.in
systemctl --user show cenit-cd.service -p Result -p ExecMainStatus
systemctl --user list-timers cenit-cd.timer --all --no-pager
df -h "$HOME"
free -h
```

Esperar rama `main`, origen exacto de la VM, cookie Secure desactivada para esta demo HTTP, servicio exitoso y siguiente consulta programada. El instalador comprueba las credenciales existentes; verificar también que ambos tokens duren hasta después de la presentación. No reiniciar la VM ni cambiar Docker, Zableke, Jenkins o firewall.

Después de revisar CI de la rama de tarea y `develop`, configurar en GitHub **Settings → Secrets and variables → Actions → Variables** la variable de repositorio `CENIT_RELEASE_ENABLED` con valor `true`. El líder crea y fusiona el PR `develop → main`, con revisión y `CI required` exitoso. Un PR abierto no despliega. La publicación vuelve a ejecutar CI sobre el SHA resultante del merge.

## Observar la primera release

En Actions, esperar `CI / Application`, `CI / CI required` y `Publish image` exitosos dentro de `Cenit Release`. No crear releases manuales. El ejecutor consulta aproximadamente dos minutos después de finalizar su operación anterior; migración y descarga pueden añadir tiempo.

```bash
cat ~/.local/share/cenit/cd/status.json
cat ~/.local/share/cenit/cd/current.json
systemctl --user show cenit-cd.service -p Result -p ExecMainStatus
systemctl --user status cenit-app.service cenit-nginx.service --no-pager
curl --fail http://127.0.0.1:8081/health/ready
```

Conservar evidencia de commit y digest de `current.json`, backup y readiness. `waiting-for-release` o `/health/proxy` no acreditan entrega de aplicación. Revisar logs localmente si hay fallo, sin compartir secretos ni datos privados.

## Preparar cuentas explícitamente, una vez migrada la base

La imagen runtime no incluye semillas ni `tsx`. Preparar una imagen de herramientas desde el **mismo commit limpio de main instalado en `current.json`**, en el equipo de desarrollo. Este paso es excepcional del ensayo; las actualizaciones habituales no compilan en la VM.

```powershell
$cenitSha = git rev-parse HEAD
podman build --format docker --target build --label "org.opencontainers.image.source=https://github.com/Menderin/Cenit" --label "org.opencontainers.image.revision=$cenitSha" --tag "localhost/cenit-demo-tools:$cenitSha" .
podman save --format docker-archive --output tmp/cenit-demo-tools.tar "localhost/cenit-demo-tools:$cenitSha"
scp tmp/cenit-demo-tools.tar "adminc@172.16.13.103:~/Cenit/"
```

En la VM:

```bash
podman load -i ~/Cenit/cenit-demo-tools.tar
cenit_sha=$(python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/".local/share/cenit/cd/current.json").read_text())["commit"])')
bash ~/Cenit/deploy/scripts/prepare-demo-vm.sh "localhost/cenit-demo-tools:$cenit_sha"
```

El comando usa el secreto del migrador únicamente para preparar/verificar las tres cuentas ficticias; no imprime ni rota claves. Las credenciales se generan en `~/.local/share/cenit/demo-local/secrets/auth-demo.json`, privado y persistente en el host. Consultarlo sólo localmente para iniciar sesión; no pegarlo en chats, Git o capturas. Repetir el comando conserva cuentas compatibles. No ejecutar desde CD ni añadir claves al Quadlet runtime.

## Aceptación y recuperación

Desde el navegador de la universidad, probar los tres roles: login, destino autorizado, listado/detalle de compras para administrativo, persistencia al recargar y logout sin datos de la cuenta anterior. Confirmar que académico no se presenta como terminado. La misma versión debe mantenerse ensayada localmente como contingencia.

Antes de declarar CD operativo, realizar un ensayo supervisado de fallo y recuperación únicamente sobre Cenit, con migraciones compatibles. CI/verificador local ya comprueban caída de BD/readiness; las pruebas de infraestructura verifican restauración de configuración y bootstrap mediante operaciones simuladas. Eso no sustituye recuperación real en la VM. Si falla una entrega, inspeccionar `status.json`, `attempt.json` y servicios antes de promover otro commit; no borrar el intento para forzar reejecución ni restaurar datos automáticamente.

Para pausar próximas actualizaciones sin detener la aplicación:

```bash
systemctl --user disable --now cenit-cd.timer
```

Una operación iniciada continúa. Tras diagnóstico, reactivar con `systemctl --user enable --now cenit-cd.timer`. El ejecutor conserva/restaura configuración anterior ante errores manejados, pero no revierte la BD ni garantiza recuperación ante interrupción de la VM.

## Entregas siguientes

`rama de tarea → develop → main → CI → imagen por digest → release → VM`. No se necesita SSH ni `git pull` para cada versión. Se mantienen necesarias conectividad, credenciales vigentes y migraciones compatibles. Los fallos se observan en systemd/estado privado; todavía no hay notificaciones externas.

Esto actualiza la imagen de aplicación. Si cambia el propio ejecutor, las plantillas Quadlet o el origen/dominio, copiar `deploy` y repetir el instalador: el timer utiliza copias instaladas, no archivos del repositorio incluidos en una imagen.

## Evidencia pendiente

Verificado localmente: lint, typecheck, catálogo, build, 65 unitarias, 80 pruebas de integración PostgreSQL/API, 30 recorridos de navegador contra producción, 44 pruebas de infraestructura, sintaxis Bash/Python y workflows. Preparación explícita en imagen de herramientas ejecutada dos veces contra PostgreSQL descartable: tres cuentas, credenciales conservadas y ausencia de cuentas antes del comando. No se utilizó la BD de demo para esa prueba.

Imagen runtime Linux/amd64 reconstruida y verificada con Podman: roles limitados, migración repetible, HTML/readiness, límites de Nginx y recuperación de salud tras caída de PostgreSQL. La imagen local incluye cambios sin commit; no acredita una release publicada ni procedencia de un futuro SHA de main.

Corrección del verificador tras el primer CI: montar todo el directorio privado `0700` en `/run/secrets` impedía que PostgreSQL leyera los archivos después de cambiar a su propio UID en Linux. Ahora se montan los tres archivos individualmente en modo de sólo lectura, conservando el directorio privado del host. Fallo reproducido y corrección verificada dentro de la máquina Linux de Podman usando archivos temporales nativos, además de las 44 pruebas de infraestructura. El ensayo anterior desde archivos de Windows no detectó esa restricción de permisos. Actions del nuevo commit sigue pendiente del push.

Actions del commit publicado, primer despliegue, cuentas y recorridos en VM, recuperación real y revisión/integración se acreditan después de ejecutarlos. Esta guía y los checks locales no afirman que ya ocurrieron.

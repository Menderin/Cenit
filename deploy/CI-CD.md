# CI/CD de Cenit

## Ramas y autorización de entrega

Decisión del 11 de octubre de 2026: `develop` integra funcionalidades; `main` autoriza entregas. Sustituye el flujo anterior `main → produccion`. El usuario confirmó que creó `develop`, pero su protección aún no está configurada. No se modificaron ramas, reglas ni variables remotas desde este ajuste del repo.

```text
rama de tarea -- PR + CI + revisión --> develop
develop -- PR + CI + revisión --> main
main -- CI del commit integrado --> imagen verificada en GHCR
release aprobada <-- consulta saliente de la VM --> despliegue + comprobación
```

No usar `produccion` para cambios nuevos ni crear otra rama de entrega. Una corrección urgente integrada en `main` debe volver a `develop` mediante PR para evitar divergencia. No hacer force-push ni actualizaciones habituales mediante SSH/git pull. El destino sigue siendo una demostración con datos ficticios.

## Lo que está preparado

- `ci.yml`: PR/push a `develop` y `main`, más invocación reutilizable desde release. Acciones fijadas por SHA; sin secretos de la VM.
- Infraestructura: sintaxis, pruebas Python, validación Compose/Nginx y arranque PostgreSQL/proxy con comprobación de roles limitados.
- Aplicación: npm reproducible, typecheck, lint, unitarias, integración PostgreSQL, build y Playwright. Check obligatorio estable: **CI required**.
- `release.yml`: sólo push a `main`; CI exitoso del mismo SHA, imagen Linux/amd64 verificada, publicación GHCR por digest y artifact/release según [CD-VM.md](CD-VM.md).

Todavía faltan manifiestos y aplicación. Sólo `develop` permite omitir explícitamente aplicación mientras sea scaffold. Un PR/push a `main` falla sin aplicación y pruebas reales; se rechaza scaffold en ramas desconocidas al invocar el gate. Una aplicación parcialmente inicializada falla en ambas ramas. Infraestructura verde no equivale a pruebas del MVP.

Al inicializar el monorepo, usar lockfile único, tres workspaces y npm exacto según [LOCAL.md](LOCAL.md). Scripts raíz obligatorios: `typecheck`, `lint`, `test:unit`, `test:integration`, `build`, `test:e2e`; deben comprobar comportamiento real y fallar ante errores/ausencia de pruebas. Integración y E2E usan base de pruebas del runner y build, nunca la VM/base compartida.

## Configuración de GitHub pendiente

En Settings configurar protecciones para **`develop` y `main`**: PR obligatorio, una aprobación de otro integrante, check `CI required` obligatorio y force-push/eliminación bloqueados. Exigir estar actualizado con la base antes de fusionar. Revisar bypass de administradores; no usarlo para aprobar entregas incompletas. Si el selector no ofrece el check, ejecutar primero el nuevo CI en `develop` y buscar el nombre exacto generado.

La protección existente de `main` no se copia automáticamente a `develop`. Crear la regla de `develop`; revisar `main` como rama de entrega. Elegir `develop` como base de PR de tareas. Cambiar la rama predeterminada a `develop` es opcional y no altera el disparador de CD. No borrar ni reemplazar reglas de las ramas vigentes para retirar la anterior.

Mantener `CENIT_RELEASE_ENABLED` ausente o distinta de `true` durante la transición. Habilitarla sólo con aplicación/tests completos y ejecutor de la VM actualizado, para el primer ensayo supervisado. El publicador usa `GITHUB_TOKEN` con `contents: write` y `packages: write`; no importar los PAT de la VM.

La [primera ejecución de main del 10 de octubre](https://github.com/Menderin/Cenit/actions/runs/38071046810) pasó infraestructura y omitió aplicación bajo el flujo anterior. No acredita el nuevo CI: ahora sólo `develop` permite esa omisión. La protección confirmada entonces para `main`/`produccion` también es histórica; `develop` requiere su propia configuración/prueba.

## Transición de la VM el martes 13 de octubre

Este checkout acepta exclusivamente `main` en manifiesto, run, origen del artifact e historial del commit. La copia instalada en `~/.local/share/cenit/bin` mantiene la política anterior hasta reinstalarla; cambiar el repo no actualiza esa copia. No habilitar publicación antes de completar la transición.

Desde PowerShell copiar sólo `deploy` de la versión revisada:

```powershell
$cenitDeployPath = 'C:\Users\vjopi\OneDrive\Documentos\GitHub\Cenit\deploy'
scp -r "$cenitDeployPath" "adminc@172.16.13.103:~/Cenit/"
```

En SSH bajo `adminc`, sin sudo:

```bash
bash ~/Cenit/deploy/scripts/install-cd.sh
python3 -c "import sys; sys.path.insert(0, '/home/adminc/.local/share/cenit/bin'); from cd_release import DELIVERY_BRANCH; assert DELIVERY_BRANCH == 'main'; print('Rama de entrega instalada: main')"
systemctl --user show cenit-cd.service -p Result -p ExecMainStatus
systemctl --user show cenit-cd.timer -p ActiveState -p SubState
systemctl --user list-timers cenit-cd.timer --all --no-pager
cat ~/.local/share/cenit/cd/status.json
```

El instalador conserva secretos/roles existentes y detiene el timer antes de sustituir scripts. Si hay una operación en curso, pide esperar/repetir sin interrumpir la migración. Esperar `Result=success`, `ExecMainStatus=0`, timer activo con siguiente consulta y, sin releases, `waiting-for-release`. No reiniciar VM ni cambiar Zableke/Jenkins. Verificar rama instalada y espera no acredita una entrega real.

Retirar `produccion` después de configurar/verificar protecciones, actualizar la VM y comprobar que no contiene commits o PR pendientes de conservar. El nuevo consumidor no autoriza releases antiguas de esa rama. Borrarla no es requisito para empezar con `develop`; puede conservarse temporalmente sin nuevos merges. Si su protección bloquea borrarla, ajustar sólo esa regla antigua al retirarla, conservando las reglas de `develop`/`main`.

## CD: credenciales, observación y preparación del ejecutor

### Acceso saliente y autenticación de GHCR

La salida compartida por el usuario el 10 de octubre confirma VM `x86_64`, Python `3.12.12`, respuesta `200` de `api.github.com` y `405` de `ghcr.io/v2/` a una consulta HEAD (`curl -I`). Esa respuesta acredita conectividad HTTP al registro, no un fallo de firewall. Para consultar el endpoint de autenticación usar GET, no HEAD:

```bash
curl -sS --connect-timeout 10 --max-time 20 -o /dev/null -w 'GHCR HTTP %{http_code}\n' https://ghcr.io/v2/
```

Sin credenciales se espera `401`. Todavía no se acreditó descarga de una imagen privada ni acceso a los endpoints de blobs usados durante un pull. Construir la imagen para `linux/amd64`, correspondiente a esta VM.

Para preparar el login de lectura:

1. En la cuenta GitHub con acceso al paquete, ir a **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.
2. Nombre `cenit-vm-ghcr`, fecha de expiración acordada y únicamente permiso `read:packages`. No necesita `write:packages`, `delete:packages` ni `repo` para este login al registro. Autorizar SSO si la cuenta/organización lo requiere.
3. Copiar el script a la VM desde PowerShell:

```powershell
scp "C:\Users\vjopi\OneDrive\Documentos\GitHub\Cenit\deploy\scripts\login-ghcr.sh" "adminc@172.16.13.103:~/Cenit/deploy/scripts/"
```

4. Dentro de SSH, sin sudo:

```bash
bash ~/Cenit/deploy/scripts/login-ghcr.sh Menderin
```

Introducir el token cuando Podman pida `Password`, no como comando ni argumento. El script conserva autenticación con permisos privados en `~/.local/share/cenit/registry/auth.json`, independiente de otros proyectos y persistente entre reinicios. La credencial se guarda codificada, no cifrada; tratar el archivo como secreto. No enviarlo al chat ni incluirlo en Git. Los pulls/Quadlets posteriores deben usar explícitamente ese authfile; el login no cambia las credenciales globales Docker/Podman.

El usuario ejecutó el script en la VM y compartió `Login Succeeded!`, con authfile `/home/adminc/.local/share/cenit/registry/auth.json`. Esto acredita autenticación en GHCR; el permiso sobre la imagen concreta se comprueba con un pull cuando se publique. Repetir el login para renovar la credencial antes de que expire. El agente no recibió el token ni ejecutó el login remoto.

El PAT de sólo `read:packages` no autoriza consultar Actions/releases del repositorio privado. El servicio de CD necesitará además una credencial de API acotada al repositorio y a lecturas de Actions/Contents, que se configurará al implementar la verificación de releases. Dentro de GitHub Actions, publicar con `GITHUB_TOKEN` y `packages: write`, sin copiar el PAT de la VM al workflow.

Referencias: [autenticación GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [authfile persistente en Podman](https://docs.podman.io/en/v5.6.0/markdown/podman-login.1.html).

### Consulta automática en modo observación

Se prepararon un cliente Python de sólo lectura, configurador de token, instalador y timer systemd de usuario. Esta etapa comprueba acceso a Contents/Actions/releases cada minuto después de finalizar la consulta previa. No verifica la procedencia de una entrega, no descarga imágenes ni ejecuta migraciones/despliegues. Su resultado no acredita CD operativo.

Crear un segundo token desde **Settings de la cuenta → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:

- Nombre `cenit-vm-github-read`, con expiración acordada.
- Resource owner `Menderin` y **Only select repositories → Cenit**.
- Repository permissions: **Actions → Read-only**, **Contents → Read-only**. Metadata se concede automáticamente. No conceder escritura ni acceso a otros repositorios.

Copiar archivos desde PowerShell:

```powershell
$cenitDeployPath = 'C:\Users\vjopi\OneDrive\Documentos\GitHub\Cenit\deploy'
scp "$cenitDeployPath/scripts/github_read.py" "$cenitDeployPath/scripts/configure-github-read.py" "$cenitDeployPath/scripts/check-github-releases.py" "$cenitDeployPath/scripts/install-github-monitor.sh" "adminc@172.16.13.103:~/Cenit/deploy/scripts/"
scp -r "$cenitDeployPath/systemd" "adminc@172.16.13.103:~/Cenit/deploy/"
```

Dentro de SSH, sin sudo:

```bash
python3 ~/Cenit/deploy/scripts/configure-github-read.py
bash ~/Cenit/deploy/scripts/install-github-monitor.sh
systemctl --user list-timers cenit-github-monitor.timer --all
journalctl --user -u cenit-github-monitor.service -n 10 --no-pager
```

El configurador pide el token con entrada oculta, verifica los permisos antes de escribir y lo guarda atómicamente con permisos 600 en `~/.local/share/cenit/secrets/github-read-token`. No reutilizar el PAT classic `read:packages`: no tiene acceso a las APIs del repositorio privado. No compartir el token ni copiar el directorio de secretos al checkout.

El instalador verifica lectura antes de instalar. Copia únicamente el monitor y su cliente a `~/.local/share/cenit/bin`, instala dos unidades con prefijo Cenit y activa el timer rootless usando linger ya configurado. No cambia Docker, Podman, Nginx, base, firewall ni servicios ajenos. Si no hay releases, el monitor informa cero y sale correctamente. No imprime tokens ni datos libres de las releases en los logs y rechaza redirecciones de las consultas autenticadas.

Se verificaron las utilidades y los gates con 15 pruebas locales, además de sintaxis Bash. El usuario ejecutó el configurador y el instalador en la VM: permisos Contents/Actions/releases verificados, token privado guardado, consulta inicial correcta con cero releases y timer habilitado. La comprobación posterior confirmó `Result=success`, `ExecMainStatus=0`, servicio `inactive/dead` entre consultas y timer `active/waiting`, con última ejecución y próxima ejecución programada. Esto acredita una consulta periódica completada y la siguiente programada; no acredita despliegues ni continuidad tras reinicio. `journalctl --user` no tenía archivos disponibles; se verificó mediante estado de systemd sin alterar journald del host.

Comprobar estado sin depender del journal:

```bash
systemctl --user show cenit-github-monitor.service -p ActiveState -p SubState -p Result -p ExecMainStatus
systemctl --user show cenit-github-monitor.timer -p ActiveState -p SubState
systemctl --user list-timers cenit-github-monitor.timer --all --no-pager
```

Se espera servicio con `Result=success`, `ExecMainStatus=0` y timer `ActiveState=active`. El servicio oneshot puede estar inactivo entre consultas. Si se captura durante ejecución, volver a consultar al terminar. No modificar journald del host ni reiniciar la VM para disponer de logs. Para detener sólo esta consulta: `systemctl --user disable --now cenit-github-monitor.timer`; una consulta que ya esté en curso termina por sí sola.

Referencias: [crear tokens fine-grained](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [lectura de Actions](https://docs.github.com/en/rest/actions/workflow-runs), [lectura de releases](https://docs.github.com/en/rest/releases/releases).

### Ejecutor instalado en la VM

Se añadieron `install-cd.sh`, el verificador de artifacts, el ejecutor rootless, los roles/secrets acotados y una plantilla Quadlet de aplicación. El procedimiento completo, los comandos para copiar/instalar y el contrato que debe implementar el futuro workflow están en [CD-VM.md](CD-VM.md). Pasaron 29 pruebas locales. El usuario ejecutó el instalador en la VM el 10 de octubre: validó Quadlet, preparó roles/secrets, habilitó `cenit-cd.timer`, deshabilitó el monitor anterior y registró `waiting-for-release`. La captura inmediata mostraba `NEXT -`; falta confirmar la próxima ejecución. No hay imagen desplegada ni circuito de entrega real ensayado.

### Implementación y ensayo restantes

GitHub Actions y despliegue iniciado desde la VM están elegidos por el usuario. No instalar otro Jenkins ni un runner general de PRs en la VM compartida.

El workflow `release.yml` se dispara por `push` a `main` y depende de CI reutilizable exitoso del mismo commit. Construye la imagen del monolito, comprueba el artefacto ejecutable y publica digest y manifiesto verificable. La publicación requiere la variable de repositorio `CENIT_RELEASE_ENABLED=true`: mantenerla deshabilitada hasta completar aplicación/tests y preparar el primer ensayo supervisado en la VM. Las actualizaciones de `develop` y los PRs no publican releases desplegables. Después de habilitarlo, no habrá aprobación manual adicional tras cada promoción mediante PR.

El servicio/timer del ejecutor preparado consulta las releases aprobadas cada dos minutos después de terminar la operación anterior; el polling significa que el despliegue empieza en la siguiente consulta, no inmediatamente al hacer merge. Verifica repositorio, workflow, rama `main`, evento `push`, commit, gates y digest, serializa operaciones y actualiza sólo Cenit. Un tag `latest` o un archivo del checkout por sí solos no son autorización.

Para completar y ensayar CD faltan:

- Aplicación ejecutable, manifiestos npm y migraciones compatibles. Containerfile, migrador y verificador de imagen están implementados, pendientes de ejecutarse contra la aplicación real.
- Ensayar la primera entrega real con el servicio CD y timer ya instalados y verificados. La plantilla de aplicación se activa sólo con una entrega aprobada.
- Permisos de publicación GHCR para el workflow. Las credenciales de lectura GHCR y Actions/Contents ya fueron guardadas y verificadas en la VM; mantenerlas vigentes sin copiarlas al workflow ni al chat.
- Ensayar el productor del manifiesto/artifact/release implementado conforme a `CD-VM.md`, y el verificador, ejecutor, backup/migraciones y recuperación contra una imagen real.
- Validar pull de la imagen privada desde la VM y configurar aviso de fallos para el equipo. El acceso a las APIs principales ya se confirmó; no equivale a probar la descarga completa de capas.

El workflow de release existe en este checkout, todavía sin una ejecución acreditada. La instalación del ejecutor en la VM y su programación están confirmadas por la evidencia posterior; falta ensayar el circuito completo. El ejecutor conserva el bootstrap hasta una entrega aprobada y lista; no activa Nginx final antes de readiness. El procedimiento no ejecuta builds en la VM ni necesita SSH para cada actualización. Una imagen anterior sólo permite recuperación si sigue siendo compatible con la base; no revierte migraciones. No declarar CD operativo hasta ensayar el circuito completo.

Referencias: [eventos de Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [protección de ramas y disponibilidad por plan](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [seguridad de workflows](https://docs.github.com/en/actions/reference/security/secure-use).

Actualización de verificación del 10 de octubre: la salida posterior del usuario confirmó `Result=success`, `ExecMainStatus=0`, servicio `inactive/dead`, timer `active/waiting` y próxima ejecución a las 14:13:41 EDT. Sustituye el pendiente de confirmar la siguiente consulta señalado arriba. El ejecutor y su programación quedan verificados; aplicación, ejecución del workflow publicador y circuito real de entrega siguen pendientes.

### Prueba del nuevo flujo antes de tener aplicación

1. Integrar los ajustes mediante PR hacia `develop`: en el scaffold se espera infraestructura correcta, aplicación omitida y `CI required` exitoso.
2. Abrir PR de `develop` hacia `main`: sin aplicación se espera fallo de `Prerequisites` y `CI required`. Comprueba el bloqueo de entrega, no un error del bootstrap.
3. No fusionar hasta completar aplicación, pruebas y contrato de imagen. No usar bypass ni tests ficticios.
4. El ensayo completo requiere imagen verificada y ejecutor de la VM actualizado; crear ramas o pasar sólo infraestructura no acredita despliegue.

### Evidencia histórica del flujo anterior

El usuario compartió el resultado del PR #2, ejecución titulada `Test CI CD #4`: `Infrastructure` pasó, `Prerequisites` falló con `Produccion requires an initialized application and real tests.`, `Application` se omitió y `CI required` falló. Esto confirma el gate negativo esperado para una entrega incompleta a `produccion`; no acredita un despliegue en la VM.

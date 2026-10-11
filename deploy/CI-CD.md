# CI/CD de Cenit

## Ramas y autorización de entrega

`main` es la rama de integración. `produccion` es la rama que autoriza una entrega a la VM. Los nombres no cambian Git: los eventos del workflow y las reglas de ramas definen el comportamiento.

```text
feature/* -- PR + CI + revisión --> main
main -- PR + CI + revisión --> produccion
produccion -- CI del commit integrado --> imagen verificada en GHCR
release aprobada <-- consulta saliente de la VM --> despliegue + comprobación
```

No hace falta crear `develop` además de `main`. Promover mediante PR; no copiar archivos ni hacer force-push a `produccion`. Una corrección urgente integrada en `produccion` debe volver a `main` mediante PR para que las ramas no diverjan. Inicialmente la VM sirve una demo con datos ficticios: el nombre de la rama no habilita operación institucional.

## Lo que está preparado

`.github/workflows/ci.yml` ejecuta CI en PRs y pushes a ambas ramas. No recibe secretos de la VM ni tiene permisos para escribir en GitHub. Las acciones se fijan por SHA.

- Infraestructura: sintaxis Bash, compilación de utilidades Python, pruebas del bloqueo de CI para una aplicación ausente/incompleta y validación del Nginx temporal en un contenedor.
- Aplicación: instalación npm reproducible, typecheck, lint, pruebas unitarias, integración con PostgreSQL, build y Playwright sobre el build servido.
- Check estable para exigir en reglas de rama: **CI required**. Confirmar su nombre exacto en la interfaz tras la primera ejecución.

Hoy no existen manifiestos ni aplicación. En `main`, el CI verifica infraestructura y deja explícitamente omitido el job de aplicación. Un PR o push a `produccion` falla mientras no exista la aplicación y su contrato CI. No interpretar un check de infraestructura verde como tests del MVP ni como autorización de release.

Al inicializar el monorepo, crear un lockfile único, manifiestos de los tres workspaces y `packageManager: npm@X.Y.Z` con versión exacta. Scripts raíz obligatorios: `typecheck`, `lint`, `test:unit`, `test:integration`, `build`, `test:e2e`. Deben ejecutar verificaciones reales, fallar ante errores y no aceptar ausencia de pruebas. Integración usa `DATABASE_URL` del CI y prepara su esquema de pruebas. Playwright debe arrancar el build compilado con su configuración `webServer`, verificar compras/malla y detener el servidor al finalizar; no apuntar a la VM ni a una base compartida.

## Activación de GitHub: una vez

El 10 de octubre de 2026 se confirmó mediante consultas autenticadas de sólo lectura: repositorio privado, cuenta con permiso `admin` y Actions habilitado. El usuario publicó la base en `main` (`479095a`) y creó `produccion`, que apunta al commit anterior (`44b3502`) y aún no contiene el workflow. Después configuró protección clásica en ambas ramas: check `CI required` vinculado a GitHub Actions, una aprobación requerida y force-push/eliminación bloqueados. Las consultas posteriores de protección confirmaron esa configuración. Las reglas permiten bypass de administradores (`enforce_admins: false`) y no exigen estar actualizado con la rama base (`strict: false`); falta ensayar un PR fallido con los permisos habituales del equipo. El agente no publica ni modifica las ramas remotas.

1. En `https://github.com/Menderin/Cenit`, abrir **Actions**. Ya está habilitado; no hace falta cambiar sus permisos para este workflow de sólo lectura.
2. Publicación inicial completada por el usuario. Los cambios siguientes se integran por su flujo Git habitual; incluir workflow, scripts de verificación y pruebas de infraestructura cuando se modifiquen. No incluir cachés Python, credenciales ni archivos de ejecución de la VM.
3. `produccion` ya existe desde la base anterior a la preparación. Puede permanecer allí hasta la primera entrega desplegable. No sobrescribirla ni hacer force-push para sincronizarla; promover mediante PR cuando la aplicación y su contrato CI estén completos. La creación de la rama no equivale a despliegue.
4. Protección clásica configurada por el usuario en ambas ramas: PR, check `CI required`, una aprobación y force-push/eliminación bloqueados. La aprobación requiere otro compañero; el autor del PR no puede aprobar su propio cambio. Para que las mismas restricciones apliquen a administradores, activar **Do not allow bypassing the above settings**. No confundir el check obligatorio con una aprobación manual adicional de despliegue.
5. Verificar una ejecución real en Actions y ensayar un PR con una comprobación fallida: no debe poder promoverse con los privilegios habituales del equipo. Comprobar quién puede eludir las reglas; no declarar protección activa sólo por tener un YAML.

La configuración de permisos/reglas se realiza en GitHub. No necesita reiniciar ni alterar la VM. Si no tienes acceso a Settings, el propietario o administrador del repositorio realiza estos pasos.

### Primera ejecución esperada

La [primera ejecución de `main`](https://github.com/Menderin/Cenit/actions/runs/38071046810) terminó con éxito: `Prerequisites`, `Infrastructure` y `CI required` correctos, con `Application` omitido porque todavía no hay aplicación. La validación Nginx en contenedor pasó en el runner de GitHub; no se ejecutó localmente en Windows. En las siguientes ejecuciones, abrir **Actions → Cenit CI** y revisar el commit correspondiente. Si falla un job, abrir el paso fallido y revisar su salida antes de cambiar reglas.

Crear `produccion` desde esta base puede iniciar una ejecución fallida en `Prerequisites`: se está bloqueando una entrega sin aplicación, no indicando un fallo del bootstrap en la VM. Mantener ese bloqueo hasta implementar el monorepo y sus verificaciones reales. No desactivar el check ni añadir scripts que siempre devuelvan éxito para dejar la rama verde.

La primera ejecución de CI no publica imágenes ni se conecta a la VM. Una vez comprobado `CI required`, seleccionarlo como check obligatorio en las reglas de ambas ramas si el plan lo permite. La creación de la rama y su protección son pasos distintos.

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

El CD se implementará con un workflow de release disparado por `push` a `produccion`, dependiente de CI exitoso del mismo commit. Construirá la imagen del monolito, comprobará el artefacto ejecutable y publicará digest y manifiesto de entrega verificable. Las actualizaciones de `main` y los PRs no publicarán releases desplegables. No habrá aprobación manual adicional tras la promoción mediante PR.

El servicio/timer del ejecutor preparado consulta las releases aprobadas cada dos minutos después de terminar la operación anterior; el polling significa que el despliegue empieza en la siguiente consulta, no inmediatamente al hacer merge. Verifica repositorio, workflow, rama `produccion`, evento `push`, commit, gates y digest, serializa operaciones y actualiza sólo Cenit. Un tag `latest` o un archivo del checkout por sí solos no son autorización.

Para completar y ensayar CD faltan:

- Aplicación ejecutable, Containerfile, prueba de la imagen y migraciones compatibles.
- Ensayar la primera entrega real con el servicio CD y timer ya instalados y verificados. La plantilla de aplicación se activa sólo con una entrega aprobada.
- Permisos de publicación GHCR para el workflow. Las credenciales de lectura GHCR y Actions/Contents ya fueron guardadas y verificadas en la VM; mantenerlas vigentes sin copiarlas al workflow ni al chat.
- Implementar el productor del manifiesto/artifact/release conforme a `CD-VM.md` y ensayar el verificador, ejecutor, backup/migraciones y recuperación preparados contra una imagen real.
- Validar pull de la imagen privada desde la VM y configurar aviso de fallos para el equipo. El acceso a las APIs principales ya se confirmó; no equivale a probar la descarga completa de capas.

No hay workflow de release. La instalación del ejecutor en la VM y su estado inicial `waiting-for-release` están confirmados; falta confirmar la próxima ejecución de su timer y ensayar el circuito completo. El ejecutor conserva el bootstrap hasta una entrega aprobada y lista; no activa Nginx final antes de readiness. El procedimiento no ejecuta builds en la VM ni necesita SSH para cada actualización. Una imagen anterior sólo permite recuperación si sigue siendo compatible con la base; no revierte migraciones. No declarar CD operativo hasta ensayar el circuito completo.

Referencias: [eventos de Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [protección de ramas y disponibilidad por plan](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [seguridad de workflows](https://docs.github.com/en/actions/reference/security/secure-use).

Actualización de verificación del 10 de octubre: la salida posterior del usuario confirmó `Result=success`, `ExecMainStatus=0`, servicio `inactive/dead`, timer `active/waiting` y próxima ejecución a las 14:13:41 EDT. Sustituye el pendiente de confirmar la siguiente consulta señalado arriba. El ejecutor y su programación quedan verificados; aplicación, workflow publicador y circuito real de entrega siguen pendientes.

### Prueba del flujo de ramas antes de tener aplicación

El usuario confirmó la regla permanente `public` para `8081/tcp` mediante respuesta `yes` de firewalld. El cambio documental que registra esta evidencia puede usarse para comprobar los disparadores del CI, sin tocar la VM ni publicar una imagen.

1. Integrar los ajustes actuales en `main` siguiendo su protección de rama y esperar la ejecución `Cenit CI` del commit nuevo. En el scaffold se espera infraestructura correcta, aplicación omitida y `CI required` exitoso.
2. Abrir un **pull request** con base `produccion` y comparación `main`. La rama se llama `produccion`, no `prod`. No se requiere ejecutar `git pull` en la VM.
3. En ese PR se espera que `Prerequisites` y `CI required` fallen por ausencia de aplicación. Eso comprueba que el flujo se dispara y rechaza una entrega incompleta. Verificar que el merge esté bloqueado y no usar bypass de administrador.
4. Cerrar el PR de prueba sin fusionarlo, o dejarlo abierto hasta incorporar una aplicación e imagen verificadas. No retirar los gates ni añadir tests ficticios para permitir el merge.

Esta prueba acredita disparadores y bloqueo de entrega, no construcción/publicación ni despliegue automático. La prueba completa requiere implementar la aplicación, imagen y `release.yml` con el contrato de `CD-VM.md`, y ensayar una entrega real exitosa y otra fallida.

El usuario compartió el resultado del PR #2, ejecución titulada `Test CI CD #4`: `Infrastructure` pasó, `Prerequisites` falló con `Produccion requires an initialized application and real tests.`, `Application` se omitió y `CI required` falló. Esto confirma el gate negativo esperado para una entrega incompleta a `produccion`; no acredita un despliegue en la VM.

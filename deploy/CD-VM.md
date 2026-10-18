# Preparar el ejecutor de despliegue en la VM

Transición del 17 de octubre: la preparación nueva usa [Azure y Run Command](azure/README.md). Este contrato de releases/polling queda como referencia del servidor anterior y no describe el nuevo workflow. Conservar su estado y datos hasta verificar la migración.

Actualización del 13 de octubre: el líder autoriza entregar la demo actual por HTTP en la VM, aunque malla y extracción real sigan pendientes. CI completo usa `Application` con lint, catálogo, build, integración, E2E contra producción y verificación de imagen. El marcador parcial fue retirado tras verificar estos checks localmente. La variable de publicación se habilita durante el primer ensayo supervisado, no mediante este cambio local. Procedimiento vigente: [primera entrega automática](PRIMER-DESPLIEGUE.md). Las menciones anteriores a bloqueo o ausencia de aplicación son antecedentes de preparación, no el estado técnico vigente.

El monitor de GitHub instalado anteriormente sólo observa. Este procedimiento instala el ejecutor `cenit-cd`, crea roles/secrets de aplicación y migración, y conserva el bootstrap hasta encontrar una release aprobada. No requiere reiniciar la VM, instalar Jenkins, abrir otro puerto ni cambiar servicios de Zableke.

## Instalación o actualización del ejecutor

El backend académico del 11 de octubre adapta `deploy/migrate.cjs` para operar sobre `cenit` preaprovisionado, sin CREATE de base: lector/journal de Drizzle, ledger compatible, transacción, lock y hashes verificados. Probado localmente con ese límite de permisos. En la sincronización de malla-interactiva del 13, el historial académico con FK a cuentas se incorpora al journal conjunto, con los SQL originales y snapshot `0007`. El journal de compras permanece intacto; académico se añade con timestamp posterior y su timestamp/hash antiguo queda en `meta/_legacy.json`, sin reescribir bases existentes. La actualización debe usar este migrador: verifica cada hash/timestamp aplicado y completa sólo las migraciones faltantes; no exige un prefijo común y rechaza entradas desconocidas, alteradas o duplicadas. Readiness verifica también el esquema conjunto. La sincronización de una rama de tarea no autoriza una release ni acredita despliegue. La imagen futura debe incluir este migrador junto con sus migraciones.

Transición del 11 de octubre: este checkout valida `main`; la copia instalada anteriormente valida `produccion` hasta repetir el instalador. Mantener publicación deshabilitada y seguir [la transición CI/CD](CI-CD.md) el martes 13. No basta con subir el workflow.

Desde PowerShell, copiar los archivos actuales. No copiar secretos ni el directorio de estado de la VM:

```powershell
$cenitDeployPath = 'C:\Users\vjopi\OneDrive\Documentos\GitHub\Cenit\deploy'
scp -r "$cenitDeployPath" "adminc@172.16.13.103:~/Cenit/"
```

Dentro de SSH, sin sudo:

```bash
bash ~/Cenit/deploy/scripts/install-cd.sh
cat ~/.local/share/cenit/cd/status.json
systemctl --user show cenit-cd.service -p Result -p ExecMainStatus
systemctl --user list-timers cenit-cd.timer --all --no-pager
```

Mientras no exista una release desplegable, esperar `state: waiting-for-release`, `Result=success`, `ExecMainStatus=0` y una siguiente ejecución programada. El timer consulta cada dos minutos después de finalizar la operación anterior; no mantiene un proceso Python residente. Reemplaza el timer de observación únicamente después de una ejecución inicial correcta. Si hay un CD en curso al reinstalar, el instalador detiene el timer y pide esperar, sin interrumpir una migración.

El instalador comprueba acceso GitHub, credencial GHCR privada, bootstrap y disponibilidad de PostgreSQL. Valida la plantilla de aplicación con el generador Quadlet instalado, sin ejecutar la imagen ficticia usada para esa validación. Crea `cenit_app` y `cenit_migrator`, sin superusuario, creación de bases o creación de roles; contraseñas privadas persistentes, sin rotación al repetir. El esquema `cenit` pertenece al migrador; el runtime recibe acceso a datos y secuencias. El administrador `cenit_admin` se reserva para preparación y backups. Los roles/secrets existentes sin marcador propio provocan un error, no se sobrescriben. Esto es exclusivo de la base `cenit_demo` preparada por el bootstrap.

No hace falta crear una cuenta Jenkins, configurar SSH desde GitHub ni instalar Node/npm en el host. El Node de ejecución viene dentro de la imagen.

## Contrato obligatorio de la futura imagen y workflow

El Containerfile, `deploy/migrate.cjs` y `.github/workflows/release.yml` están preparados en el repositorio. Todavía no existe aplicación compilable ni migraciones de negocio. La publicación requiere CI real y la variable `CENIT_RELEASE_ENABLED=true`; mantenerla deshabilitada hasta preparar el primer ensayo. Instalar el ejecutor o validar estos archivos no acredita un despliegue real. El equipo debe completar y comprobar estos requisitos para que el consumidor preparado pueda funcionar:

- Imagen `ghcr.io/menderin/cenit@sha256:<digest>`, `linux/amd64`, runtime UID/GID `1000:1000`, Node disponible como `node`, frontend compilado y API en el mismo servidor, puerto 3000.
- Etiquetas OCI `org.opencontainers.image.source=https://github.com/Menderin/Cenit` y `org.opencontainers.image.revision=<SHA completo>`.
- Aceptar `DATABASE_URL_FILE=/run/secrets/database-url`; leer el secreto sin imprimirlo. Runtime y migraciones usan credenciales distintas. Las variables habituales siguen siendo `NODE_ENV=production`, `APP_ENV=demo`, `HOST=0.0.0.0`, `PORT=3000`.
- Objetos de negocio en esquema PostgreSQL `cenit`. El migrador debe configurar explícitamente su registro de migraciones en ese esquema y no intentar crear el esquema predeterminado `drizzle`. No usar `public` para tablas del negocio. Revisar el permiso sobre el registro de migraciones antes de habilitar un entorno institucional.
- Script `/app/deploy/migrate.cjs`, ejecutable como `node /app/deploy/migrate.cjs`, mismo `DATABASE_URL_FILE`, termina con código distinto de cero si falla. Sólo migraciones versionadas compatibles con la imagen anterior; no semillas, reset o `db push`. Mantener compatibilidad con la versión anterior durante la migración y permitir transacciones según la operación.
- `/health/ready` devuelve exactamente `{"status":"ready"}` con HTTP 200 cuando base y esquema están disponibles. `/`, `/compras` y `/academico` devuelven HTML con HTTP 200. No sustituir pruebas de recorridos reales por estos smoke checks.
- Workflow `.github/workflows/release.yml`, evento `push` a `main`, CI real sobre el mismo SHA, imagen verificada antes de publicarla. Jobs exitosos con nombres exactos `CI / CI required`, `CI / Application`, `Publish image`; CI omitido no autoriza entrega. El workflow futuro debe reutilizar/adaptar CI y respetar esos nombres.
- Artifact de Actions `cenit-release-<run_attempt>`, ZIP con un único archivo `cenit-release.json` y digest de artifact proporcionado por GitHub. Subirlo con una versión fijada de `upload-artifact` que exponga digest; no reemplazar el artifact de un mismo intento. Acordar retención antes de publicar: un artifact expirado no autoriza nuevas instalaciones.
- Release publicada, no draft ni prerelease, tag `cenit-<SHA completo>`. El cuerpo es únicamente JSON `{"workflowRunId":123,"workflowRunAttempt":1}` apuntando a esa ejecución. Crear la release al finalizar la publicación. El consumidor espera a que toda la ejecución figure completada y exitosa.

Manifiesto (todos los campos son obligatorios; los identificadores son enteros positivos):

```json
{
  "schemaVersion": 1,
  "repository": "Menderin/Cenit",
  "branch": "main",
  "commit": "<SHA hexadecimal de 40 caracteres>",
  "image": "ghcr.io/menderin/cenit@sha256:<digest hexadecimal de 64 caracteres>",
  "workflowRunId": 123,
  "workflowRunAttempt": 1,
  "runNumber": 4,
  "migrationPolicy": "backward-compatible"
}
```

El permiso de la VM permanece sólo lectura para Actions/Contents y GHCR. El workflow publicador necesitará `contents: write` y `packages: write` con su `GITHUB_TOKEN`, sin importar los PAT de la VM. Cambiar el permiso o visibilidad del paquete exige verificar un pull real desde la VM.

## Ejecución y recuperación

El consumidor verifica repositorio/workflow, evento, rama, SHA, intento, jobs, pertenencia del commit a la historia de `main`, origen del artifact y digest del ZIP. Descarga la URL firmada del artifact sin reenviar el token GitHub. Sólo acepta el repositorio de imagen fijado por digest, nunca un `latest` ni comandos de una release. Una consulta inválida deja los servicios actuales intactos y registra el fallo.

Serializa operaciones mediante un lock. Ignora versiones ya instaladas o anteriores y exige que una nueva versión avance desde el commit instalado. Antes de migrar descarga/verifica la imagen, comprueba espacio, registra el intento y crea un `pg_dump` privado. Una migración fallida conserva la aplicación anterior y exige un nuevo intento validado tras revisar el estado de la base. No reintenta a ciegas una operación fallida o interrumpida.

Después de migrar, sustituye el Quadlet de aplicación, espera readiness, valida Nginx en la red Cenit, cambia la configuración y reinicia únicamente el proxy Cenit. El reinicio vuelve a montar el archivo y resuelve la dirección del contenedor nuevo. Añade una dependencia de arranque Nginx/aplicación para el siguiente inicio de systemd. Si falla la nueva aplicación o el proxy, intenta restaurar sus configuraciones anteriores. En el primer despliegue fallido recupera el bootstrap. **No restaura la base automáticamente**. Una interrupción del proceso/VM durante el cambio requiere inspección y recuperación explícita; la recuperación automática cubre errores manejados durante esa ejecución, no es una transacción frente a caídas.

Estado y evidencia privados:

- `~/.local/share/cenit/cd/status.json`: última consulta/resultado, sin tokens.
- `current.json`: último manifiesto instalado correctamente.
- `attempt.json`: último intento que alcanzó backup/migraciones.
- `backups/<run_id>-<attempt>.dump`: respaldos anteriores a la migración. Un archivo incompleto de una operación fallida no equivale a un backup válido.

Los backups y las imágenes anteriores se conservan; no se ejecuta un prune global. El ejecutor se detiene antes de migrar si falta margen de disco. Acordar y aplicar retención sólo sobre recursos Cenit; definir aviso de fallos al equipo. Por ahora el fallo se refleja en systemd y `status.json`, sin notificación externa.

Para detener próximas actualizaciones sin parar los contenedores:

```bash
systemctl --user disable --now cenit-cd.timer
```

Una operación ya iniciada continúa. Para renovar tokens usar los configuradores existentes. El usuario confirmó el 10 de octubre que `sudo firewall-cmd --zone=public --permanent --query-port=8081/tcp` devolvió `yes`: la regla permanente de entrada 8081 está presente. El acceso HTTP actual ya se verificó. Mantener esa regla y las credenciales vigentes; no hace falta cambiar ni recargar el firewall para esta preparación. La continuidad tras un reinicio no se ha ensayado.

## Verificación disponible

### Preparación para trabajar fuera de la red institucional

El usuario indicó que desde casa no tiene acceso a la VM y que podrá volver el martes, antes de la entrega del jueves 15 de octubre. El instalador exitoso ya comprobó linger y systemd de usuario; el ejecutor usa copias instaladas en el estado privado, no necesita una sesión SSH ni un `git pull` por versión. GitHub Actions y publicación pueden prepararse desde casa, pero aún faltan aplicación, imagen y workflow publicador. Un fallo del primer despliegue puede requerir diagnóstico en la VM; no hay observabilidad remota de ese estado configurada.

Antes de retirarse, comprobar respuesta del proxy desde PowerShell después de cerrar SSH y revisar en GitHub que los dos tokens guardados en la VM expiren después de la entrega. No compartir sus valores. La permanencia tras logout todavía no está acreditada mediante esa prueba; no hace falta reiniciar la VM ni reinstalar servicios para comprobarla. Si la institución ofrece acceso remoto autorizado, conviene obtenerlo para diagnóstico; no modificar el Tailscale del otro proyecto ni publicar SSH como parte de esta preparación.

Reservar el martes para ensayar la primera entrega de aplicación, pull privado, migraciones, readiness, proxy y recuperación de una entrega fallida. La preparación actual no garantiza ese circuito todavía. Llevar también un build local ensayado para la presentación, como exige el SDD.

La comprobación posterior del usuario el 10 de octubre confirmó `Result=success`, `ExecMainStatus=0`, servicio `inactive/dead`, timer `active/waiting` y siguiente ejecución programada a las 14:13:41 EDT. Queda resuelto el pendiente de confirmar el timer mencionado en la evidencia inicial siguiente. No hay aplicación ni workflow publicador todavía; falta ensayar una entrega real.

Pasaron 29 pruebas locales de infraestructura y sintaxis Bash/Python, incluidas procedencia inválida, CI omitido, digest alterado, no repetición de migraciones fallidas y recuperación de bootstrap mediante operaciones simuladas. El 10 de octubre el usuario ejecutó el instalador en la VM y compartió éxito: acceso GitHub con cero releases, Quadlet validado sin iniciar la aplicación, roles/secrets preparados, timer CD habilitado y timer de observación deshabilitado. `status.json` registró `waiting-for-release` a las 18:11:40 UTC. Esto acredita instalación y una consulta inicial correcta, no un despliegue real.

La captura de `list-timers` tomada inmediatamente después mostraba `NEXT -` y última activación hacía aproximadamente 100 ms; la comprobación posterior resolvió ese pendiente. Para futuros diagnósticos, consultar después de terminar la ejecución actual:

```bash
systemctl --user show cenit-cd.service -p ActiveState -p SubState -p Result -p ExecMainStatus
systemctl --user show cenit-cd.timer -p ActiveState -p SubState
systemctl --user list-timers cenit-cd.timer --all --no-pager
```

Esperar servicio completado con `Result=success`, `ExecMainStatus=0`, timer `active/waiting` y fecha en `NEXT`. Si sigue sin próxima ejecución, diagnosticar con estos estados antes de reinstalar o modificar unidades. Quedan por ensayar una entrega real exitosa y otra fallida con migraciones compatibles antes de declarar CD operativo. La continuidad tras reinicio y la restauración de backups siguen pendientes.

Referencias: [Quadlet y validación dryrun](https://docs.podman.io/en/v5.6.0/markdown/podman-systemd.unit.5.html), [authfile y secretos Podman](https://docs.podman.io/en/v5.6.0/markdown/podman-run.1.html), [privilegios PostgreSQL](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html), [artefactos inmutables de Actions](https://docs.github.com/en/rest/actions/artifacts).

# Infraestructura local de Cenit

Esta configuración permite iniciar PostgreSQL y el proxy temporal antes de implementar la aplicación. La VM conserva Podman rootless con Quadlet; `compose.yaml` es para desarrollo y ensayos locales, no reemplaza el instalador de la VM.

## Versiones fijadas

Se utilizan Node.js **24.21.0 LTS**, npm **11.19.0**, PostgreSQL **17.11** y Nginx **1.30.5 estable**. Las tres imágenes están fijadas por digest en `deploy/images.lock.json`, Compose, Containerfile y CI. No se usan tags `latest`. Node se indica también en `.node-version`; el futuro manifiesto raíz debe declarar `packageManager: "npm@11.19.0"`.

Referencias verificadas el 10 de octubre de 2026: [Node y npm](https://nodejs.org/en/download/archive/v24.21.0), [soporte PostgreSQL](https://www.postgresql.org/support/versioning/) y [versiones Nginx](https://github.com/nginx/nginx/releases). Mantener el frontend acordado con su encargado; sus versiones exactas se fijarán al inicializarlo.

## Preparar y arrancar en Windows

Requisitos: Python 3, Podman instalado y una máquina Linux de Podman en funcionamiento. Verificar primero:

```powershell
podman version
podman machine list
```

Si no existe una máquina, ejecutar `podman machine init`. Si está detenida, ejecutar `podman machine start`. Después comprobar `podman info`.

Compose requiere un proveedor externo. Ejecutar `podman compose version`; si falta el proveedor, configurarlo siguiendo la [documentación oficial de Podman Compose](https://docs.podman.io/en/latest/markdown/podman-compose.1.html). El proveedor debe soportar perfiles, secretos de archivo y dependencias por salud/finalización; utilizar una implementación compatible de Docker Compose. Su CLI puede comunicarse con Podman sin arrancar el motor Docker.

En este equipo se verificó Podman 6.0.2 con WSL 2 y Docker Compose 5.3.1 como proveedor. Si una terminal abierta antes de instalar Podman no reconoce el comando, cerrar y abrir PowerShell para actualizar PATH. El proveedor usado durante el ensayo se seleccionó sólo para esa sesión:

```powershell
$env:PODMAN_COMPOSE_PROVIDER = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker-compose.exe"
podman compose version
```

La ruta anterior corresponde a esta instalación de Docker Desktop; en otro equipo usar el proveedor instalado mediante Compose Setup de Podman Desktop o su ruta real. No cambia el motor Docker ni su configuración global.

Desde la raíz del repositorio:

```powershell
python deploy/scripts/setup-local.py
podman compose --profile application config --quiet
podman compose up -d db proxy
podman compose ps
Invoke-RestMethod 'http://127.0.0.1:8081/health/proxy'
```

La respuesta esperada es `status: ok`, `mode: bootstrap`. Acredita el proxy temporal, no una aplicación disponible. Esperar que `db` y `proxy` estén saludables; consultar `podman compose logs db proxy` si fallan. Los puertos locales por defecto son `127.0.0.1:8081` para HTTP y `127.0.0.1:55432` para PostgreSQL; se pueden cambiar en `.env` para evitar conflictos.

El preparador crea `.env` si falta y credenciales aleatorias en `.local/secrets`. Conserva contraseñas existentes al repetirse y rechaza formatos inesperados. Además de `app-url`/`migrator-url` para contenedores, genera `app-local-url`/`migrator-local-url` para Windows/host con puerto CENIT_DB_PORT. `.env` y `.local` están excluidos de Git y del contexto de build. No copiar esos secretos a la VM ni subirlos a GitHub.

La base `cenit_demo` usa un volumen persistente propio del proyecto `cenit-local`. Su primer inicio crea `cenit_admin`, `cenit_migrator` y `cenit_app`, con permisos separados y esquema `cenit`. El runtime no puede crear bases, roles ni objetos del esquema. El inicializador sólo corre en un volumen nuevo: cambiar un archivo de contraseña no actualiza una base existente.

Para detener los servicios conservando la base:

```powershell
podman compose down
```

No añadir `--volumes` para un apagado habitual. No reutilizar volúmenes de otros proyectos. El archivo Compose no modifica firewall, Docker/Jenkins de la VM ni sus servicios Quadlet.

## Contrato para incorporar la aplicación

Hay manifiestos API/contratos, migraciones del catálogo y login local de backend; faltan frontend y build completo. El [backend académico](../Docs/ACADEMICO.md) y [autenticación](../Docs/AUTENTICACION.md) se verifican con `build:academic`; no activar el perfil `application` todavía. Para iniciar/probar login en Windows, seguir AUTENTICACION.md, preparando cuentas explícitamente y usando conexión runtime/Origin/excepción HTTP de demo. El perfil y el `Containerfile` requieren:

- Un solo `package-lock.json` y workspaces `apps/api`, `apps/web`, `packages/contracts`; npm 11.19.0 y scripts reales exigidos por CI.
- `npm run build` genera `apps/api/dist/server.js`, `apps/web/dist/index.html` y `packages/contracts/dist`. Los exports de contratos deben apuntar a su código compilado.
- API y frontend se sirven juntos por el puerto 3000; `/`, `/compras` y `/academico` devuelven HTML. El API acepta `DATABASE_URL_FILE` sin imprimir credenciales.
- `pg` y `drizzle-orm` son dependencias de producción de `apps/api`. Migraciones Drizzle en `db/migrations`, incluido `meta/_journal.json`. `deploy/migrate.cjs` aplica migraciones como `cenit_migrator`, con historial en `cenit.__drizzle_migrations`; no ejecuta semillas ni `db push`.
- El esquema `cenit` lo prepara infraestructura. El migrador utiliza el lector de Drizzle, transacción y lock con ledger compatible; no exige CREATE de base al rol. Rechaza cambios en migraciones ya aplicadas. Catálogo y estudiantes se cargan mediante operaciones de demo explícitas; perfiles/historial esperan la FK de login.
- `/health/ready` devuelve exactamente `{"status":"ready"}` con HTTP 200 cuando la base/esquema permiten operar; devuelve 503 si no están disponibles. El runtime usa `cenit_app`.

Cuando esos requisitos estén implementados y probados:

```powershell
podman compose --profile application up --build -d db migrate app
podman compose --profile application ps -a
```

Comprobar migración exitosa y aplicación saludable. Cambiar en `.env` `CENIT_NGINX_CONFIG=./deploy/nginx/cenit.conf` y recrear el proxy:

```powershell
podman compose up -d --force-recreate proxy
```

Si la aplicación no está disponible, conservar `bootstrap.conf`. No activar el proxy definitivo ni publicar una release sólo para obtener checks verdes.

## CI y publicación

CI comprueba scripts, tests de infraestructura, Compose y arranque del bootstrap con PostgreSQL/Nginx. Para una aplicación inicializada ejecuta typecheck, lint, unitarias, integración PostgreSQL, build y Playwright. La ausencia de aplicación bloquea `main`.

`release.yml` reutiliza CI sobre el mismo commit de `main`, construye Linux/amd64 y verifica el artefacto con PostgreSQL, roles limitados, migrador repetible, rutas HTML y readiness ante caída de la BD. Sólo después publica en GHCR por digest y crea el manifiesto/release compatible con el ejecutor de la VM.

La variable de repositorio `CENIT_RELEASE_ENABLED` debe permanecer ausente o distinta de `true` hasta completar aplicación, tests y preparar el primer ensayo supervisado en la VM. Para ese ensayo se habilita y se promueve un nuevo commit mediante PR; todavía deben acreditarse entrega exitosa y recuperación ante fallo antes de declarar CD operativo. No se configuró esa variable desde este checkout. El artifact ZIP se conserva 90 días, sujeto al límite de retención permitido por el repositorio; conserva exactamente `cenit-release.json`.

## Evidencia y pendientes

Se validaron localmente Compose, ambos workflows con actionlint, sintaxis del migrador, Bash del inicializador y 34 pruebas de infraestructura. Después de instalar Podman 6.0.2 se creó/inició `podman-machine-default` en WSL 2 rootless y se ensayó Compose 5.3.1. PostgreSQL/proxy alcanzaron estado saludable y `/health/proxy` respondió `{"status":"ok","mode":"bootstrap"}`. Se verificaron roles sin superusuario/creación de bases/roles, USAGE sin CREATE para runtime y volumen `cenit-local_postgres-data`. Tras recrear el contenedor DB se conservó el esquema `cenit`, propiedad de `cenit_migrator`.

El ensayo detectó que la API compatible Docker de Podman rechaza opciones `uid/gid` de tmpfs. Compose ahora usa `mode=1777` y tamaños limitados para los directorios temporales de Nginx; conserva UID/GID 101 y raíz de sólo lectura. Los pasos nuevos de CI todavía deberán acreditarse en Actions tras publicar los cambios. No se construyó imagen de aplicación ni se realizó despliegue en la VM.

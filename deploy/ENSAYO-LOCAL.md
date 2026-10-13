# Ensayar el monolito compilado con Podman

Este ensayo usa la imagen de producción y PostgreSQL persistente local. No publica releases ni modifica la VM. Compras conserva su alcance de copia local; el laboratorio no extrae datos reales y el área académica sigue en construcción.

Evidencia local del 13 de octubre: build y typecheck correctos; 65 unitarias, 80 integración PostgreSQL/API (incluidas 5 de runtime), 44 infraestructura y 30 recorridos contra runtime compilado exitosos. Cuatro recorridos de login/logout con Vite preview también pasaron. Imagen Linux/amd64 verificada con Podman, roles limitados, migrador repetible, límites de proxy y recuperación de BD. Ensayo persistente en 8081: migrador `Exited (0)`, readiness `ready` y login/salida de los tres roles, con listado de compras administrativo correcto. Actions, revisión e integración pendientes. Estos resultados no acreditan despliegue en VM ni extracción real.

Para ejecutar fuera de contenedores con `npm start`, configurar `NODE_ENV=production`, `APP_ENV=demo`, `DATABASE_URL_FILE` del runtime, cookie y orígenes explícitos. Los valores Compose no se aplican automáticamente a la terminal. Desarrollo continúa con `npm run dev`.

## Build y verificación

Con Node 24.21.0, npm 11.19.0 y Podman iniciado, desde la raíz:

```powershell
npm ci
npm run build
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e:production
$cenitRevision = git rev-parse HEAD
podman build --format docker --platform linux/amd64 --file Containerfile --build-arg "VCS_REF=$cenitRevision" --tag localhost/cenit-local:dev .
python deploy/scripts/verify-image.py --engine podman --image localhost/cenit-local:dev --revision $cenitRevision
```

Las pruebas requieren PostgreSQL de prueba: localmente utilizan el administrador privado configurado por `setup-local.py`; CI utiliza su servicio descartable. Ninguna prueba usa `cenit_demo` como base de sus registros. Ejecutar el build antes de integración: las pruebas de runtime necesitan el frontend compilado. El formato Docker conserva el HEALTHCHECK que Podman descarta al construir en formato OCI.

El verificador crea y elimina exclusivamente su propia red y contenedores, aplica dos veces las migraciones con un rol separado, comprueba HTML/readiness, límites de Nginx y recuperación después de detener/reiniciar su PostgreSQL. No necesita cuentas ni datos de demo. Una imagen de un workspace sin commit es sólo un candidato local; la etiqueta de revisión no acredita que los cambios estén publicados. CI construirá el commit exacto.

## Iniciar la aplicación local

Cerrar previamente procesos de desarrollo sólo si se necesita liberar recursos; el proxy usa 8081, no 5173. Configurar el proveedor de Compose según [LOCAL.md](LOCAL.md).

```powershell
python deploy/scripts/setup-local.py
podman compose --profile application up -d db migrate app
podman compose --profile application ps -a
podman compose exec -T app node -e "fetch('http://127.0.0.1:3000/health/ready').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

La migración debe finalizar con código 0 y readiness con `200 {"status":"ready"}`. No iniciar el proxy de aplicación si eso falla. Consultar `podman compose logs migrate app` sin compartir URLs, credenciales ni datos privados.

Preparar/verificar explícitamente las cuentas del equipo mediante los archivos privados existentes:

```powershell
$env:APP_ENV = 'demo'
$env:DATABASE_URL_FILE = (Resolve-Path '.local/secrets/migrator-local-url').Path
npm run auth:prepare-demo
Remove-Item Env:DATABASE_URL_FILE
Remove-Item Env:APP_ENV
```

La preparación conserva las cuentas compatibles y rechaza las incompatibles; no rota claves. Las credenciales quedan en `.local/secrets/auth-demo.json`, excluido de Git. Si faltan, genera cuentas y contraseñas privadas. No copiar secretos del host a la VM ni incorporar preparación a migraciones/CD.

Tras comprobar readiness, cambiar en el `.env` privado:

```dotenv
CENIT_NGINX_CONFIG=./deploy/nginx/cenit.conf
```

```powershell
podman compose up -d --force-recreate proxy
Invoke-RestMethod 'http://127.0.0.1:8081/health/ready'
```

Abrir `http://127.0.0.1:8081/login`. Probar administrativo, docente y estudiante con las cuentas privadas; comprobar redirección, compras para administrativo y salida. HTTP está permitido explícitamente sólo para este entorno demo. Los orígenes autorizados se derivan de `CENIT_HTTP_PORT`, que por defecto es 8081; no abrir la URL de otro host sin ajustar esa configuración.

## Volver a preparación y detener

Restablecer `CENIT_NGINX_CONFIG=./deploy/nginx/bootstrap.conf` en `.env`, recrear `proxy` y comprobar `/health/proxy`. Detener `app` antes de iniciar habitualmente `npm run dev` si no se va a usar el contenedor.

```powershell
podman compose up -d --force-recreate proxy
podman compose --profile application stop app
# Apagado completo conservando PostgreSQL:
podman compose --profile application down
```

No añadir `--volumes`. Para nuevas imágenes locales, repetir build, verificación y `up -d migrate app`; no activar releases. La próxima entrega en VM requiere completar gates de main y configurar su origen/cookie antes de un ensayo supervisado.

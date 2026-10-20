# Instalar y ejecutar Cenit localmente

Esta guía permite preparar una base de demostración, trabajar en desarrollo y ejecutar la aplicación compilada con OCR. Los comandos se ejecutan desde la raíz del repositorio. Docker Desktop se utiliza en macOS; en Windows puede utilizarse Podman con un proveedor Compose compatible.

La base local conserva sus datos en un volumen. Las preparaciones que siguen son para datos ficticios de demostración, no para una base real. Las [pruebas automatizadas](../Docs/PRUEBAS-Y-ACEPTACION.md) usan bases descartables separadas.

## Herramientas y configuración

Comprobar Node/npm fijados por `.node-version` y `package.json`, Python 3 y el motor de contenedores. El proveedor Compose debe admitir perfiles, secretos de archivo y dependencias por salud/finalización.

```sh
node --version
npm --version
python3 --version
docker info
python3 deploy/scripts/setup-local.py
npm ci
```

En Windows, usar `python` o `py -3` según la instalación y `podman compose` en los comandos Compose de esta guía. Podman Desktop debe tener su máquina/proveedor configurados. Para seleccionar un proveedor distinto, usar `PODMAN_COMPOSE_PROVIDER` sólo con la ruta real de esa instalación; no es necesario cambiar el motor ni otros proyectos.

El preparador crea `.env` si falta y secretos en `.local/secrets`, conservando los existentes. Completar las tres variables privadas `CENIT_DEMO_*_PASSWORD` de `.env` con las claves acordadas para las cuentas ficticias, de 12–128 caracteres. No publicar `.env`, archivos de cuentas o URLs de conexión.

| Archivo privado | Uso |
| --- | --- |
| `.local/secrets/postgres-password` | Preparación administrativa de PostgreSQL local |
| `.local/secrets/app-local-url` | Conexión del API ejecutado en el host, con rol `cenit_app` |
| `.local/secrets/migrator-local-url` | Migración y preparación explícita desde el host |
| `.local/secrets/app-url`, `migrator-url` | Conexiones usadas por los contenedores |
| `.local/secrets/auth-demo.json` | Cuentas originales y credenciales ficticias |
| `.local/secrets/academic-demo-accounts.json` | Dos cuentas adicionales de estudiantes ficticios |
| `.local/secrets/capture-receipt-key` | Clave de firma de procedencia de capturas |

PostgreSQL local se publica sólo en loopback, por defecto `55432`; HTTP compilado, en `8081`. Cambiar `CENIT_DB_PORT`/`CENIT_HTTP_PORT` en `.env` antes de preparar si hay conflictos. Un archivo de contraseña nuevo no cambia la contraseña de una base ya existente.

## Preparar PostgreSQL y las cuentas

Iniciar la base y comprobar que está saludable:

```sh
docker compose up -d db
docker compose ps
```

Aplicar las migraciones mediante el rol separado:

```sh
DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run db:migrate
```

Preparar las tres cuentas ficticias, cargando las variables privadas de `.env` en esa terminal:

```sh
(
  set -a
  . ./.env
  set +a
  APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run auth:prepare-demo
)
```

En PowerShell, configurar las variables privadas de contraseña en la terminal y establecer `APP_ENV`/`DATABASE_URL_FILE` antes del comando. Para migrar, basta la conexión del migrador:

```powershell
$env:DATABASE_URL_FILE = (Resolve-Path '.local/secrets/migrator-local-url').Path
npm run db:migrate
$env:APP_ENV = 'demo'
npm run auth:prepare-demo
Remove-Item Env:APP_ENV
Remove-Item Env:DATABASE_URL_FILE
```

La preparación conserva cuentas compatibles y no rota sus claves; una discrepancia detiene la operación. Las credenciales se consultan localmente en el archivo privado generado.

Para disponer de la malla y tres historiales ficticios:

```sh
APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run academic:prepare-demo
```

El comando publica el catálogo de trabajo, conserva las tres cuentas originales y crea sólo dos estudiantes adicionales únicos. Repetirlo conserva identidades e intentos. Si una demo antigua tiene los RUT ficticios anteriores, la opción explícita `--normalize-ruts` corrige únicamente los valores anteriores esperados; no es una operación pública de edición de perfiles.

Las compras de ejemplo son opcionales:

```sh
APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run purchases:prepare-demo
```

Prepara ocho solicitudes, inicialmente cinco pendientes y tres validadas. Repetir conserva contenido y revisiones, pero puede volver a crear un ejemplo eliminado; omitirlo si ya se tienen los registros que se usarán. Estos comandos están limitados a la demo local y no forman parte de CD.

## Trabajar en desarrollo

```sh
npm run dev
```

El supervisor lee `.env`, verifica la conexión runtime y las tablas, comprueba/prepara las tres cuentas originales con las claves privadas y arranca API `3000` y Vite `5173`. No migra ni carga catálogo, historiales o compras. Si un puerto está ocupado, informa el problema sin detener procesos ajenos.

Abrir [http://127.0.0.1:5173/login](http://127.0.0.1:5173/login). `Ctrl+C` cierra los procesos del supervisor; PostgreSQL permanece iniciado. El modo desarrollo y la demo compilada tienen puertos distintos: cerrar desarrollo antes de una presentación si no se va a usar.

Para OCR desde desarrollo, preparar la clave e imagen según la siguiente sección, iniciar `ocr`, configurar en `.env` `OCR_URL=http://127.0.0.1:8090` y `CAPTURE_RECEIPT_KEY_FILE` con la ruta de la clave. Reiniciar el supervisor para leer esa configuración.

## Ejecutar el build de demostración con OCR

Los dos modelos ONNX de runtime están en `apps/ocr/models`; comprobarlos con los hashes de [Modelos](../apps/ocr/MODELS.md). No se descargan durante una solicitud. Si faltan, preparar y verificar los pesos con las herramientas existentes; no sustituirlos por archivos sin verificar.

Crear la clave de procedencia sólo si todavía no existe:

```sh
mkdir -p .local/secrets
if [ ! -f .local/secrets/capture-receipt-key ]; then openssl rand -out .local/secrets/capture-receipt-key 32; fi
chmod 600 .local/secrets/capture-receipt-key
```

En Windows, [prepare-ocr.ps1](scripts/prepare-ocr.ps1) permite preparar pesos verificados y la clave usando `-ModelsPath` hacia los modelos disponibles; revisar sus requisitos antes de ejecutarlo.

Seleccionar en `.env` el proxy de la aplicación:

```dotenv
CENIT_NGINX_CONFIG=./deploy/nginx/cenit.conf
```

Construir e iniciar los servicios; el migrador se ejecuta con sus credenciales separadas:

```sh
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr up -d --build db migrate app ocr
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr ps -a
```

El migrador debe terminar con código 0 y el API estar listo antes de activar el proxy:

```sh
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr up -d --force-recreate proxy
curl -fsS http://127.0.0.1:8081/health/ready
curl -fsSI http://127.0.0.1:8081/login
```

Esperar `{"status":"ready"}` y HTTP 200 para login. Abrir [http://127.0.0.1:8081/login](http://127.0.0.1:8081/login). La aplicación compilada no necesita Vite abierto y no publica `3000` en el host. El OCR auxiliar usa `8090` sólo en loopback. PowerShell puede comprobar readiness con `Invoke-RestMethod`.

En los siguientes arranques se pueden reutilizar las imágenes, quitando `--build`. Reconstruirlas cuando cambie el código. El overlay `compose.ocr.yaml` conecta `app` con `http://ocr:8090` y monta la clave; sin él, la extracción no está configurada y devuelve 503.

Para una captura ficticia, seguir la [preparación de muestras](../experiments/purchases/README.md#capturas-con-formato-de-referencia). En «Sistema de compra → Subir captura» elegir una imagen, extraer y revisar. Sólo «Guardar solicitud» conserva la copia.

## Verificar el build o una imagen

```sh
npm run typecheck
npm run lint
npm run catalog:check
npm run test:unit
npm run build
```

Integración y navegador requieren la conexión exclusiva de pruebas de la [matriz](../Docs/PRUEBAS-Y-ACEPTACION.md). Para revisar una imagen candidata con el verificador existente:

```sh
cenit_revision=$(git rev-parse HEAD)
docker build --platform linux/amd64 --file Containerfile --build-arg "VCS_REF=$cenit_revision" --tag localhost/cenit-local:verified .
python3 deploy/scripts/verify-image.py --engine docker --image localhost/cenit-local:verified --revision "$cenit_revision"
```

Con Podman, usar `podman build --format docker` para conservar el HEALTHCHECK y `--engine podman` en el verificador. Éste prepara recursos propios, verifica roles limitados, migrador repetible, HTML/readiness, proxy y recuperación de PostgreSQL. Una imagen de un árbol con cambios sin commit es sólo una candidata; su etiqueta no acredita publicación.

Para ejecutar fuera de contenedores con `npm start`, preparar primero el build y configurar `NODE_ENV=production`, `APP_ENV=demo`, `DATABASE_URL_FILE` del runtime, orígenes y cookie. Las variables de Compose no se aplican a otra terminal. La excepción HTTP local no se convierte en política de una instalación institucional.

## Detener y resolver problemas

Detener la demo conservando su volumen:

```sh
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr stop proxy app ocr db
```

`docker compose down` también conserva los volúmenes mientras no se añada `--volumes`. No borrar un volumen ni cambiar sus secretos para resolver un fallo de acceso.

- **Faltan tablas:** revisar el resultado del migrador y aplicar las migraciones con su conexión; no recrear la base.
- **Procesador no disponible:** comprobar contenedor `ocr`, overlay y clave de procedencia; evitar dos inferencias simultáneas. Los límites son una extracción, 5 MiB, veinte megapíxeles y sesenta segundos.
- **Puerto ocupado:** detener sólo el proceso propio que lo utiliza o ajustar la configuración; no cerrar servicios de otro proyecto.
- **Proxy en preparación:** `/health/proxy` indica bootstrap, no disponibilidad de la aplicación. Comprobar `migrate`, `app` y `CENIT_NGINX_CONFIG`.
- **Readiness falla:** revisar base, esquema e historial con sus roles adecuados; no simular la respuesta de salud.

Consultar logs localmente sin compartir credenciales, capturas o datos de formularios. El volumen y los secretos pertenecen al proyecto local; no se copian a otra instalación como parte de una entrega habitual.

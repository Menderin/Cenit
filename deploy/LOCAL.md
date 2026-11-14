# Instalar y ejecutar Cenit localmente

Esta guía permite preparar una base de demostración, trabajar en desarrollo y ejecutar la aplicación compilada con OCR. Los comandos se ejecutan desde la raíz del repositorio. Docker Desktop se utiliza en macOS; en Windows puede utilizarse Podman con un proveedor Compose compatible.

La base local conserva sus datos en un volumen. Las preparaciones que siguen son para datos ficticios de demostración, no para una base real. Las [pruebas automatizadas](../Docs/PRUEBAS-Y-ACEPTACION.md) usan bases descartables separadas.

## Atajo: levantar desarrollo local

Desde la raíz del repo, comprobar las versiones de Node y npm indicadas en `.node-version` y `package.json`. En una instalación nueva, ejecutar `python3 deploy/scripts/setup-local.py`, completar las tres `CENIT_DEMO_*_PASSWORD` en el `.env` privado y ejecutar `npm ci` una vez. Estos pasos conservan los secretos existentes.

Iniciar o reutilizar PostgreSQL local con `docker compose up -d db`, y luego ejecutar `npm run dev`. El supervisor comprueba que conecta a `cenit_demo` por loopback con el rol `cenit_app`, prepara/verifica las tres cuentas ficticias y abre el API en `3000` y Vite en `5173`. No aplica migraciones ni carga catálogo o compras de ejemplo. Si informa que faltan migraciones, confirmar que se trata de la base local de demostración y seguir [Preparar PostgreSQL](#preparar-postgresql-y-las-cuentas) con el rol migrador antes de volver a iniciar.

Abrir [http://127.0.0.1:5173/login](http://127.0.0.1:5173/login) y usar las cuentas ficticias guardadas localmente. `Ctrl+C` cierra API y web; PostgreSQL queda iniciado y conserva su volumen. La demo compilada de `8081`, si está activa, es independiente.

La copia automática a Google Sheets es opcional y viene apagada. Para revisar ese flujo hacen falta una planilla dedicada de pruebas, su ID y la credencial privada de la cuenta de servicio; seguir [Conectar una planilla de pruebas](#conectar-una-planilla-de-pruebas). Crear un registro ficticio desde Cenit y esperar el estado «Sincronizado»; los cambios de Sheets no se importan a Cenit.

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

## Configuración del runtime y puertos

`.env.example` corresponde al Compose/supervisor **local**, no a Azure. `setup-local.py` genera archivos privados; `npm run dev` lee `.env` y configura sus procesos hijos. Un `npm start` ejecutado en otra terminal sólo recibe las variables de esa terminal. Compose usa `.env` para interpolar su YAML y transmite únicamente las variables declaradas en `environment`/`secrets`; no exporta todo el archivo al API.

| Variable | Uso y ejemplo sin secretos |
| --- | --- |
| `NODE_ENV` | `production` sirve `apps/web/dist`; desarrollo usa Vite. El build faltante impide el arranque de producción |
| `APP_ENV` | `demo` en contenedores de demostración, `development` con el supervisor y `test` en QA. No cambia la duración de la sesión |
| `HOST`, `PORT` | API: `127.0.0.1` y `3000` en el host; `0.0.0.0` y `3000` dentro del contenedor |
| `DATABASE_URL_FILE` | Archivo con conexión privada PostgreSQL. Host: `.local/secrets/app-local-url`; contenedor: `/run/secrets/app-url`. El migrador utiliza su archivo independiente |
| `DATABASE_URL` | Alternativa directa para herramientas/QA; `DATABASE_URL_FILE` tiene prioridad. No escribir la URL real en ejemplos, historial de comandos o Git |
| `AUTH_ALLOWED_ORIGINS` | Lista separada por comas, sin rutas ni comodines. El supervisor admite `127.0.0.1` y `localhost` con HTTP en `5173` y `3000`; un `npm start` directo requiere configurar el origen exacto elegido |
| `AUTH_COOKIE_SECURE` | `true` por defecto y en HTTPS Azure. `false` sólo para HTTP explícito de demo/desarrollo/test; requiere `APP_ENV` compatible |
| `AUTH_GOOGLE_ENABLED`, `AUTH_GOOGLE_CLIENT_ID` | Google opcional; requiere `true` y un ID web terminado en `.apps.googleusercontent.com`. Ausencia/configuración inválida lo deshabilita y conserva el login local. El ID es público y no se usa un client secret para validar ID tokens |
| `OCR_URL` | Base HTTP privada del procesador: `http://127.0.0.1:8090` desde el host o `http://ocr:8090` dentro de la red Compose |
| `CAPTURE_RECEIPT_KEY_FILE` | Archivo privado de al menos 32 bytes para HMAC de procedencia. Sin él o sin procesador configurado, extraer devuelve 503; login/compras siguen siendo independientes |
| `CENIT_API_PROXY` | Destino de `/api` en Vite; el supervisor fija `http://127.0.0.1:3000` |
| `COMPOSE_PROJECT_NAME`, `CENIT_DB_PORT`, `CENIT_HTTP_PORT` | Identidad/puertos de la demo local. Defaults de `.env.example`: `cenit-local`, `55432`, `8081` |
| `CENIT_NGINX_CONFIG` | `./deploy/nginx/bootstrap.conf` para preparación, `./deploy/nginx/cenit.conf` tras readiness de la aplicación |
| `CENIT_DEMO_*_PASSWORD` | Las tres claves ficticias se completan sólo en `.env` privado o en la terminal de preparación. No son variables de arranque del runtime compilado ni de CD |

No regenerar una clave de procedencia o contraseña para resolver indisponibilidad. Cambiar la clave invalida recibos anteriores; cambiar un archivo de contraseña no rota la credencial de PostgreSQL.

| Modo | Entrada web | API y servicios |
| --- | --- | --- |
| Desarrollo local | `http://127.0.0.1:5173` | Vite hace proxy al API en `3000`; PostgreSQL en loopback `55432`; OCR optativo en loopback `8090` |
| Demo local compilada | `http://127.0.0.1:8081` | Nginx hacia `app:3000`; no necesita Vite. API sin puerto externo propio |
| Azure staging | `https://develop.cenit.dpdns.org` | Caddy hacia loopback `8082`; red/BD/secretos propios |
| Azure producción demo | `https://cenit.dpdns.org` | Caddy hacia loopback `8081`; red/BD/secretos propios |

Los puertos coincidentes pertenecen a máquinas o interfaces diferentes. La VM anterior compartida usa Cenit en `8081`; su `8080` corresponde a Jenkins y no debe modificarse.

## Acceso Google opcional

El acceso con Google y su vinculación están conectados a la interfaz para cuentas Cenit existentes y autorizadas explícitamente. Se muestran cuando `GET /api/v1/auth/google` confirma que el proveedor está habilitado. Los [contratos y el recorrido](../Docs/ARQUITECTURA.md#acceso-opcional-con-google) describen la verificación del servidor.

1. Aplicar las migraciones con el procedimiento habitual y rol migrador, separado del runtime. No se crean autorizaciones ni identidades automáticamente.
2. Crear un cliente OAuth de tipo **Aplicación web** en Google Auth Platform y completar su pantalla de consentimiento. Registrar los orígenes JavaScript exactos usados para probar, por ejemplo `http://localhost:5173` y `http://localhost` en desarrollo, o el origen HTTPS de staging. Configurar el mismo origen en `AUTH_ALLOWED_ORIGINS`, además de `AUTH_GOOGLE_ENABLED=true` y `AUTH_GOOGLE_CLIENT_ID` en el entorno del API. Reiniciar el API. El supervisor local y Compose transmiten estas dos variables. Azure requiere configuración explícita de su operador. El API necesita salida HTTPS a los certificados de Google y reloj correcto. Seguir la [configuración oficial](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), incluyendo usuarios de prueba cuando corresponda al estado del cliente. El recorrido usa callback en ventana emergente.
3. Preparar un archivo JSON privado bajo `.local/secrets`, con un array de `{ "accountId": "<UUID de cuenta existente>", "googleEmail": "<correo Google exacto autorizado>" }`. No versionar el archivo ni usar listas de dominios. El correo Google puede ser distinto del correo local; no concede acceso sin vinculación.
4. Configurar `DATABASE_URL_FILE` con la conexión privada de operación que permita actualizar autorizaciones y sesiones. Ejecutar explícitamente desde el repositorio:

```sh
npm run auth:google-authorizations -- authorize .local/secrets/google-authorizations.json
```

En la imagen compilada, el equivalente es `node operations/db/seeds/google-authorizations.js authorize /run/secrets/google-authorizations.json`, montando archivos privados de conexión y autorizaciones en sólo lectura en un contenedor de operación. El archivo debe ser regular, sin enlaces simbólicos, y de hasta 256 KiB. Los controles de archivo y acción recuperan el aporte de Ignacio en `15a1e36` (SCRUM-124), adaptado al contrato de correo Google exacto. Un lote inválido revierte completo. Repetir el mismo lote es idempotente; una autorización distinta requiere revisión explícita.

Para retirar el permiso, ejecutar el mismo comando con `revoke` en lugar de `authorize`. Invalida sesiones Google existentes, conserva el sub asociado y mantiene cuentas, roles, contraseñas y sesiones locales. No elimina la asociación para reasignarla a otra persona.

El recorrido HTTP para el frontend comienza con `GET /api/v1/auth/google`. Para vincular, entrar primero con contraseña local, solicitar `POST /api/v1/auth/google/challenge` con `{"purpose":"link"}`, inicializar GIS con `clientId` y el `nonce` recibido y enviar `{"credential":"<ID token del callback>"}` a `POST /api/v1/auth/google/link`. Para acceder después, repetir con propósito `login` y `POST /api/v1/auth/google/login`. Las escrituras usan JSON, cookies y Origin autorizado. Tras un error se solicita otro desafío. El alta inicial de autorización nunca sustituye la vinculación desde la sesión local.

Para comprobarlo en pantalla, entrar primero con contraseña, abrir **Acceso con Google** en la navegación lateral y pulsar **Preparar vinculación con Google**. El botón oficial abre la selección de cuenta. Confirmar la vinculación en Cenit, cerrar sesión y pulsar **Preparar acceso con Google** en el login para entrar con esa identidad. Repetir consulta y logout con cada rol autorizado. Escape o **Cerrar** cierran el diálogo. **Cancelar intento** permite volver al formulario local, y los errores permiten preparar un desafío nuevo.

Consultar `GET /api/v1/auth/session` comprueba la sesión emitida. Un error `GOOGLE_DISABLED` permite usar el login local; `GOOGLE_UNAVAILABLE` permite reintentar con un desafío nuevo. No pegar credenciales, JWT ni cookies en tickets o logs. Las pruebas automatizadas verifican tokens firmados con claves ficticias, PostgreSQL descartable y estados de interfaz con dobles del proveedor. La comprobación con un cliente Google real debe registrarse por separado. Si se añade CSP en el proxy, permitir las rutas GIS indicadas en la documentación oficial. Revisar también COOP para permitir la ventana emergente.

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

El [recorrido de revisión académica](../Docs/PRUEBAS-Y-ACEPTACION.md#preparar-la-revisión-académica--scrum-112) indica qué comprobar y registrar después de esta preparación.

```sh
APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run academic:prepare-demo
```

El catálogo de trabajo es `diagrama-r2`, basado en la imagen y el cotejo del equipo, sin año oficial confirmado. `npm run catalog:check` verifica sus fuentes antes de cargarlo. Si ya hay historiales adscritos a `2027-r1`, la preparación rechaza trasladarlos: para consultar la malla vigente, usar la carga explícita `APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run catalog:load`. Esta operación no altera historiales; los de otra versión no se muestran sobre la malla. No ejecutar sobre una base ajena a la demo local. El PDF retirado sólo es referencia histórica del catálogo anterior.

El comando publica el catálogo de trabajo, conserva las tres cuentas originales y crea sólo dos estudiantes adicionales únicos. Repetirlo conserva identidades e intentos. Si una demo antigua tiene los RUT ficticios anteriores, la opción explícita `--normalize-ruts` corrige únicamente los valores anteriores esperados; no es una operación pública de edición de perfiles.

Las compras de ejemplo son opcionales:

```sh
APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run purchases:prepare-demo
```

Prepara 74 compras ficticias editables, distribuidas por los meses de 2024 y 2025 y de enero a octubre de 2026. Toman las categorías de compra de la planilla de referencia; folios y montos son inventados, y los nombres, RUT, estados de pago y códigos institucionales no validados quedan fuera o vacíos. La carga crea registros de ingreso manual, no ejemplos de contrato, por eso se pueden corregir desde el detalle. Sus fechas de incorporación se distribuyen de forma repetible en los últimos 30 días para que el gráfico de actividad del Inicio muestre movimiento.

Si las compras ficticias ya están cargadas, se pueden distribuir únicamente sus fechas de incorporación con `APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run purchases:prepare-demo -- --spread-activity-only`. La opción sólo actualiza `created_at` de las operaciones reservadas a esta semilla en `cenit_demo` local; no crea ni reemplaza compras ni modifica su contenido.

En la primera ejecución, la carga reemplaza sólo los ejemplos antiguos que coincidan con sus operaciones fijas y la cuenta administrativa de demo. Conserva cualquier otra compra; una diferencia inesperada en esos registros detiene la preparación. Repetir conserva contenido y revisión, y puede volver a crear un registro de la semilla que se haya eliminado. Estos comandos están limitados a la demo local y no forman parte de CD.

## Trabajar en desarrollo

```sh
npm run dev
```

El supervisor lee `.env`, verifica la conexión runtime y las tablas, comprueba/prepara las tres cuentas originales con las claves privadas y arranca API `3000` y Vite `5173`. No migra ni carga catálogo, historiales o compras. Si un puerto está ocupado, informa el problema sin detener procesos ajenos.

Abrir [http://127.0.0.1:5173/login](http://127.0.0.1:5173/login). `Ctrl+C` cierra los procesos del supervisor; PostgreSQL permanece iniciado. El modo desarrollo y la demo compilada tienen puertos distintos: cerrar desarrollo antes de una presentación si no se va a usar.

El supervisor compila los contratos al arrancar y mantiene su compilación y el API en observación; Vite actualiza la web. Así los cambios de contratos y API se reflejan en desarrollo sin conservar una respuesta anterior en memoria. No ejecuta migraciones de forma automática.

Para OCR desde desarrollo, preparar la clave e imagen según la siguiente sección, ejecutar `docker compose --profile ocr up -d --build ocr`, configurar en `.env` `OCR_URL=http://127.0.0.1:8090` y `CAPTURE_RECEIPT_KEY_FILE` con la ruta de la clave. Reiniciar el supervisor para leer esa configuración. Si `OCR_URL` está configurado y el procesador no responde, el arranque avisa cómo iniciarlo antes de abrir la web. Repetir la construcción del servicio cuando cambie el extractor; el supervisor Node no recarga Python. Comprobar `http://127.0.0.1:8090/health/live` además de la salud del API.

## Ejecutar el build de demostración con OCR

Los dos modelos ONNX de runtime están en `apps/ocr/models`; comprobarlos con los hashes de [Modelos](../apps/ocr/MODELS.md). No se descargan durante una solicitud. Si faltan, preparar y verificar los pesos con las herramientas existentes; no sustituirlos por archivos sin verificar.

En Bash, el preparador usado por la entrega descarga y verifica los pesos fijados (necesita conexión sólo durante esta preparación):

```sh
python3 deploy/azure/prepare-ocr-models.py
```

Esta ejecución escribe modelos ignorados por Git en `apps/ocr/models`; no despliega recursos Azure.

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

Para una captura ficticia, seguir la [preparación de muestras](../experiments/purchases/README.md#capturas-con-formato-de-referencia). En «Registro de compras → Subir captura» arrastrar la imagen al recuadro grande o activarlo por clic/teclado. El análisis comienza al validar el archivo; comparar recuadros y campos, corregir y guardar desde esa misma vista. Sólo «Guardar registro» conserva la copia.

## Conectar una planilla de pruebas

Compras presenta un registro histórico por defecto. Para comprobar la segunda revisión opcional, configurar `CENIT_PURCHASE_SECOND_REVIEW_ENABLED=true`, reiniciar el API y recargar la web. Desactivarla no cambia estados, revisores ni versiones existentes. El servidor rechaza la validación posterior mientras esté apagada. Las pruebas antiguas activan expresamente esa opción; `purchase-register.spec.ts` cubre la presentación sin ella.

La sincronización con Sheets empieza apagada. No usa las credenciales del plugin de Drive ni el login de Cenit. Para ensayar el conector real:

1. Habilitar Google Sheets API en un proyecto de pruebas y preparar una cuenta de servicio con su credencial de servidor. No requiere delegación general sobre el dominio.
2. Crear una planilla **nativa de Google Sheets y dedicada de pruebas** (un Excel abierto desde Drive requiere primero una copia convertida) y compartirla como editora sólo con la cuenta de servicio que escribirá. Usar cuentas autorizadas para la consulta. No seleccionar el histórico existente ni copiar datos reales para QA.
3. Guardar el JSON privado como `.local/secrets/purchase-sheets-key.json`, fuera de Git y con acceso limitado al operador/proceso. En contenedores, asegurar que el UID de la aplicación puede leer el secreto montado sin exponer el directorio completo de secretos.
4. Para `npm run dev`, configurar en `.env` `CENIT_PURCHASE_SHEETS_SYNC_ENABLED=true`, `CENIT_PURCHASE_SHEETS_ID` con el ID del archivo y `CENIT_PURCHASE_SHEETS_KEY_FILE` con esa ruta. Reiniciar y recargar.
5. Para el build local en Compose, añadir `-f compose.sheets.yaml` a los archivos usados para **app**, conservando los overlays OCR que correspondan. Definir `CENIT_PURCHASE_SHEETS_ID` en `.env`; el overlay monta sólo la credencial de Sheets y activa la integración explícitamente. No usarlo al ejecutar el migrador, que no necesita Google.
6. Guardar una copia ficticia con varios ítems y códigos con ceros, esperar «Sincronizado» y comprobar «Compras»/«Ítems». Ensayar una indisponibilidad y una baja confirmada. Las celdas vacías tras una baja son intencionales; no compactar ni ordenar físicamente las filas administradas. Usar vistas de filtro u otras pestañas.

El estado se consulta también mediante `GET /api/v1/purchases/sheets-sync` con sesión administrativa; `purchaseId` limita la consulta a una copia existente. Mientras Google falle, el registro sigue guardado en Cenit y los reintentos continúan. Una cabecera cambiada, fila ajena o protección retirada requiere corregir la estructura antes del siguiente reintento. Apagar la flag detiene envíos; la cola se conserva para reactivarla.

Esta configuración no modifica Azure ni activa integración en la planilla del cliente. Su activación allí debe incorporarse mediante la entrega versionada y secretos propios del entorno; el Compose Azure vigente deja Sheets apagado.

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

Ejemplo Bash, después de migrar y preparar las cuentas explícitamente según esta guía:

```sh
NODE_ENV=production APP_ENV=demo HOST=127.0.0.1 PORT=3000 \
DATABASE_URL_FILE=.local/secrets/app-local-url \
AUTH_ALLOWED_ORIGINS=http://127.0.0.1:3000 AUTH_COOKIE_SECURE=false npm start
```

En ese modo abrir `http://127.0.0.1:3000/login`. Sin las dos variables de OCR, este ejemplo comprueba web/login/compras/catálogo, no extracción real. `npm run build` compila contratos, API, cargador operativo y frontend; no migra, prepara cuentas ni publica el catálogo.

### Comprobar salud sin confundirla con aceptación

| Consulta | Resultado correcto | Qué acredita |
| --- | --- | --- |
| API `/health/live` | 200, `{"status":"live"}` | El proceso atiende; no prueba PostgreSQL |
| API `/health/ready` | 200, `{"status":"ready"}` | PostgreSQL, ledger y tablas/columnas/permisos requeridos. 503 devuelve `{"status":"unavailable"}` |
| OCR privado `/health/live` | 200, `{"status":"live"}` | Proceso auxiliar; no acredita calidad de extracción |
| Nginx `/health/proxy` en bootstrap | 200, `{"status":"ok","mode":"bootstrap"}` | Sólo preparación del proxy local/anterior; no está implementado como health del despliegue Azure |

Readiness usa una conexión separada con límites de un segundo para conexión y consulta; admite migraciones posteriores compatibles. No exige usuarios, compras ni un catálogo publicado y no comprueba OCR. Una malla vacía con readiness correcto puede requerir carga explícita, no otra migración. Comprobar además login, consulta por rol, persistencia y OCR con una muestra ficticia; [Pruebas y aceptación](../Docs/PRUEBAS-Y-ACEPTACION.md) distingue esos recorridos.

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
- **Malla no disponible:** comprobar versiones publicadas mediante el API autenticado. Cargar el catálogo explícitamente, sin recrear tablas ni preparar historiales para ocultar el problema; en Azure seguir [su operación de catálogo](azure/README.md#publicar-el-catálogo-académico-operación-explícita).

Consultar logs localmente sin compartir credenciales, capturas o datos de formularios. El volumen y los secretos pertenecen al proyecto local; no se copian a otra instalación como parte de una entrega habitual.

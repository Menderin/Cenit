# Levantar Cenit local para la presentación

Guía para macOS con Docker Desktop. La única dirección web de la presentación es **http://127.0.0.1:8081**: el proxy sirve el build compilado, con PostgreSQL y OCR como servicios de apoyo. No se necesita dejar abiertos Vite (`5173`) ni la API de desarrollo (`3000`). El volumen local conserva las cuentas y compras al reiniciar.

## Requisitos y preparación inicial

Desde una terminal en la raíz del repositorio, abre Docker Desktop y comprueba las herramientas:

```sh
docker info --format '{{.ServerVersion}} {{.OSType}}/{{.Architecture}}'
node --version
npm --version
python3 --version
```

El repositorio fija Node.js `24.21.0` y npm `11.19.0`. Prepara la configuración y los secretos privados locales una vez; al repetirlo conserva las contraseñas existentes:

```sh
python3 deploy/scripts/setup-local.py
npm ci
```

En `.env`, configura una sola vez las tres contraseñas de demo acordadas por el equipo, de al menos 12 caracteres. También deja seleccionado el proxy de la aplicación compilada:

```dotenv
CENIT_NGINX_CONFIG=./deploy/nginx/cenit.conf
```

No copies `.env` ni `.local/secrets/auth-demo.json` al repositorio. El archivo con las cuentas se genera o valida durante la preparación privada descrita más abajo; no muestra las claves en la terminal.

La versión integrada trae los dos modelos ONNX en `apps/ocr/models/`; comprueba las huellas antes de construir OCR. Si falta alguno, prepáralo siguiendo [ADAPTADOR-CAPTURAS.md](ADAPTADOR-CAPTURAS.md). La atribución y licencia de los pesos están en [MODELS.md](../apps/ocr/MODELS.md).

```sh
shasum -a 256 apps/ocr/models/ch_PP-OCRv5_det_mobile.onnx apps/ocr/models/latin_PP-OCRv5_rec_mobile.onnx
```

Los hashes esperados son `4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae` y `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a`. Si falta un modelo, sigue el procedimiento de pesos de [ADAPTADOR-CAPTURAS.md](ADAPTADOR-CAPTURAS.md); no se descarga al procesar una captura.

Crea la clave privada de procedencia sólo si todavía no existe:

```sh
mkdir -p .local/secrets
if [ ! -f .local/secrets/capture-receipt-key ]; then openssl rand -out .local/secrets/capture-receipt-key 32; fi
chmod 600 .local/secrets/capture-receipt-key
```

## Preparar la base y las cuentas

La primera vez, levanta PostgreSQL y aplica las migraciones. Compose conserva la BD en un volumen persistente:

```sh
docker compose --profile application up -d --build db migrate
docker compose --profile application ps -a
```

La migración debe terminar con código `0`. Prepara las cuentas ficticias con las contraseñas privadas de `.env`; la operación conserva cuentas compatibles y no rota claves:

```sh
(
  set -a
  . ./.env
  set +a
  APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run auth:prepare-demo
)
```

Si quieres que Inicio muestre los ocho ejemplos ficticios en una base nueva, cárgalos explícitamente:

```sh
APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run purchases:prepare-demo
```

La carga se puede repetir, pero vuelve a crear ejemplos que hayas eliminado. Omite este paso si ya tienes los registros que presentarás. No se ejecuta automáticamente al iniciar la aplicación.

## Arrancar la demo compilada

Desde la raíz del proyecto, construye e inicia la aplicación, OCR y PostgreSQL. Esta orden compila el frontend y la API dentro de Docker; los puertos `3000` y `5173` no se publican en el host:

Si una sesión anterior dejó `npm run dev` activo, vuelve a esa terminal y pulsa `Ctrl+C` antes de presentar; así se cierran la API `3000` y Vite `5173`. La página de la demo queda únicamente en `8081`.

```sh
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr up -d --build db migrate app ocr
```

Cuando la API esté lista, inicia el proxy con la configuración compilada de `.env` y comprueba el estado:

```sh
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr up -d --force-recreate proxy
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr ps -a
curl -fsS http://127.0.0.1:8081/health/ready
curl -fsSI http://127.0.0.1:8081/login
```

La primera respuesta debe ser `{"status":"ready"}` y la segunda debe indicar HTTP `200`. Abre [http://127.0.0.1:8081/login](http://127.0.0.1:8081/login) e inicia sesión con la cuenta administrativa guardada en `.local/secrets/auth-demo.json`. **Sistema de compra → Subir captura** permite elegir una imagen ficticia, extraer candidatos y revisarlos. La extracción no guarda una compra: para conservarla hay que completar el formulario y confirmar **Guardar solicitud**.

En cada presentación posterior, Docker reutiliza las imágenes construidas y los datos persistentes. Basta con iniciar los servicios y recrear el proxy:

```sh
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr up -d db migrate app ocr
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr up -d --force-recreate proxy
curl -fsS http://127.0.0.1:8081/health/ready
```

Los puertos locales `55432` (PostgreSQL) y `8090` (comprobación de OCR) son auxiliares y se limitan a `127.0.0.1`; la página que se abre y se presenta es la única de la aplicación en `8081`. Vite y la API de desarrollo no forman parte de este recorrido.

## Preparar una captura ficticia

Para crear las muestras en macOS, usa Arial del propio sistema y el contenedor OCR ya construido. Las fuentes e imágenes se guardan en `tmp/`, fuera de Git:

```sh
mkdir -p tmp/ocr-fonts
cp "/System/Library/Fonts/Supplemental/Arial.ttf" tmp/ocr-fonts/arial.ttf
cp "/System/Library/Fonts/Supplemental/Arial Bold.ttf" tmp/ocr-fonts/arialbd.ttf
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace:rw" -w /workspace --entrypoint python localhost/cenit-ocr:adapter1 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, 'experiments/purchases')
import oracle_format
oracle_format.FONT_DIR = Path('tmp/ocr-fonts')
oracle_format.main()
PY
```

En la pantalla elige `tmp/ocr-oracle-format/01-completa.png`. Las otras variantes también son ficticias y sirven para probar capturas parciales o formatos distintos; no acreditan precisión institucional.

## Apagar, reiniciar y resolver problemas

Para detener la presentación conservando la BD, las cuentas y las compras:

```sh
docker compose -f compose.yaml -f compose.ocr.yaml --profile application --profile ocr stop proxy app ocr db
```

Al apagar el computador, el volumen también se conserva. Para volver a presentar, repite el arranque de cada presentación de la sección anterior. No uses `docker compose down --volumes`: borraría el volumen local con las cuentas y compras.

Si vuelve a aparecer «El procesador no está disponible», comprueba que el contenedor `ocr` esté iniciado, que `app` se haya levantado con `-f compose.ocr.yaml` y que `/health/ready` responda `ready`. Ese overlay conecta la aplicación al servicio interno `http://ocr:8090` y monta la clave privada. Sin él, la aplicación no tiene OCR configurado y responde `503` al extraer.

El límite es una extracción a la vez, con máximo de 5 MiB, 20 megapíxeles y 60 segundos. En esta Mac, la captura ficticia completa respondió HTTP `200` en 9,1 segundos con el build nativo para Apple Silicon y versión `ppocr5-latin-grid8-layout-v3`. Es una prueba local del formato, no una medición de precisión institucional. No ejecutes dos inferencias a la vez durante la presentación.

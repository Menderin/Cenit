# Evaluar la extracción de compras

Este laboratorio compara lectores OCR y formas de reconstruir cabeceras e ítems. Usa documentos completamente ficticios. Sus resultados ayudan a elegir qué investigar; la aceptación de la aplicación se revisa en [Pruebas y aceptación](../../Docs/PRUEBAS-Y-ACEPTACION.md).

Los scripts experimentales están separados del API, PostgreSQL y la entrega automática. El [procesador integrado](../../Docs/ARQUITECTURA.md#capturas-y-ocr) tiene sus propios límites y contrato. Los resultados sintéticos no acreditan precisión sobre documentos institucionales.

## Capturas con formato de referencia

El generador `oracle_format.py` reproduce la distribución de una captura de referencia: cabecera compacta, ocho columnas, texto multilínea, controles y aprobaciones ilustradas. Los nombres, referencias y valores son ficticios; los iconos son aproximaciones y no acreditan autenticidad ni aprobación institucional.

Desde la raíz, con Python, Pillow y Arial instalada:

```powershell
py -3 experiments/purchases/oracle_format.py
```

Las imágenes y el manifiesto se crean en `tmp/ocr-oracle-format`, fuera de Git:

| Archivo | Variante |
| --- | --- |
| `01-completa.png` | Captura completa de 1085 × 658 px, un ítem |
| `02-dos-items.png` | Dos ítems y proveedores distintos |
| `03-tres-items.png` | Tres ítems, secciones inferiores desplazadas |
| `04-jpeg.jpg` | Compresión JPEG, calidad 78 |
| `05-reducida.png` | Escala 85 % |
| `06-ampliada.png` | Dos ítems, escala 125 % |
| `07-grises.png` | Sin información de color |
| `08-cabecera-recortada.png` | Sin barra de navegación superior |

En macOS se pueden usar las fuentes locales y la imagen OCR ya construida siguiendo la [guía local](../../deploy/LOCAL.md#ejecutar-el-build-de-demostración-con-ocr):

```sh
mkdir -p tmp/ocr-fonts
cp "/System/Library/Fonts/Supplemental/Arial.ttf" tmp/ocr-fonts/arial.ttf
cp "/System/Library/Fonts/Supplemental/Arial Bold.ttf" tmp/ocr-fonts/arialbd.ttf
docker run --rm -i --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace:rw" -w /workspace \
  --entrypoint python localhost/cenit-ocr:adapter1 - <<'OCR_SAMPLE'
import sys
from pathlib import Path
sys.path.insert(0, 'experiments/purchases')
import oracle_format
oracle_format.FONT_DIR = Path('tmp/ocr-fonts')
oracle_format.main()
OCR_SAMPLE
```

Usar el nombre real de la imagen construida si es diferente. Para revisar la interfaz, entrar como administrativo, abrir «Sistema de compra → Subir captura» y elegir una muestra. Comparar los candidatos con la imagen antes de guardar; extraer no conserva una compra.

Para medir el procesador real con las ocho muestras:

```powershell
py -3 experiments/purchases/oracle_format.py --evaluate
```

Requiere OCR en `127.0.0.1:8090`, sin otra inferencia simultánea. No utiliza credenciales del API ni PostgreSQL. El evaluador conserva los valores esperados y registra hashes, respuestas, ítems, campos exactos/incorrectos/ausentes y tiempos con arranque del modelo. Excluye la cuenta de cargo cuando queda cortada: no se exige recuperar texto invisible.

Las mismas muestras se usaron para ajustar la segmentación v3. Sus resultados son una regresión sobre desarrollo; una evaluación independiente necesita nuevas capturas preparadas por otra persona.

## Resultados conservados

Cada archivo de evidencia identifica muestras, fuentes, configuración y límites de su ejecución. Los resultados de conjuntos distintos no se comparan como una mejora directa.

| Conjunto | Evidencia | Lectura del resultado |
| --- | --- | --- |
| Comparación inicial | [Resumen inicial](baseline/evidence.json) | Referencia histórica de motores y parser; plantilla simplificada. |
| Segmentación por celdas | [Segunda batería](battery-evidence.json) | La ampliación y las celdas no mejoraron globalmente la lectura; algunos números no nulos eran incorrectos. |
| Recorte numérico y contraste entre motores | [Tercera batería](round3-evidence.json) | El contraste omitió más valores sin beneficio de exactitud en ese conjunto. |
| Encabezados locales y lectura por líneas | [Cuarta batería](round4-evidence.json) | Mejora emparejada de un campo entre 162; no acredita una sustitución universal. |
| Formato de ocho columnas, procesador v2 | [Evaluación v2](oracle-format-evidence.json) | 50 campos exactos, 21 incorrectos, 93 ausentes; ningún ítem reconstruido en las ocho capturas. |
| Mismas muestras, procesador v3 | [Regresión v3](oracle-format-v3-evidence.json) | 118 exactos, 11 incorrectos y 35 ausentes. Recupera los ítems de PNG nativos y del recorte superior; falla la tabla en JPEG, escalados y gris. Mediana 14,32 s, máximo 28,67 s. |
| Formato de ocho columnas, procesador Tesseract + OpenCV (`tesseract5-spa-grid8-layout-v1`) | [Evaluación Tesseract](oracle-format-tesseract-evidence.json) | 125 exactos, 30 incorrectos y 9 ausentes (164 campos). Reconstruye las **12/12 filas esperadas en las 8 variantes** (incluidos JPEG, escalados 85 %/125 %, escala de grises y cabecera recortada) y alcanza **12/12 exactos en `costCenter`** y **12/12 en `price`**. Mediana **2,21 s**, máximo **3,85 s**. |
| Holdout de ocho muestras del adaptador (`tesseract5-spa-grid8-layout-v1`) | [Holdout adaptador](../../tests/ocr/evidence.json) | 117/144 campos exactos, todas las filas con grilla reconstruidas (`7/7` en 6 muestras con grilla; `0/0` en `partial`; `0/1` en `no-grid` con incidencia explícita). Mediana **2,26 s**, máximo **2,82 s**. |
| Regresión de señales de formato y rechazos (`tesseract5-spa-grid8-layout-v1`) | [Evidencia de layout](../../tests/ocr/layout-evidence-v3.json) | **10/10 casos correctos**: 3 `compatible` (HTTP 200), 3 `partial` (HTTP 200) y 4 rechazos `UNSUPPORTED_CAPTURE_LAYOUT` (HTTP 422). |

Los registros de `v2` y `v3` corresponden al ensayo del 14 de octubre de 2026; los tres registros de `tesseract5-spa-grid8-layout-v1` corresponden a la evaluación de `SCRUM-47` del 3 de noviembre de 2026. HTTP 200 significa que hubo respuesta, no que la lectura fuera correcta. Los pesos no fueron entrenados ni cambiados en esos ajustes. No se reparan dígitos a partir de los valores esperados, de sumas ni de acuerdos supuestos entre motores.

## Evaluación reproducible del procesador vigente (`SCRUM-47`)

### Justificación del reemplazo de RapidOCR/PP-OCRv5 por Tesseract 5 (`spa`) + segmentación morfológica OpenCV

El reemplazo del motor `ppocr5-latin-grid8-layout-v3`/`v4` (RapidOCR con modelos ONNX `PP-OCRv5`) por `tesseract5-spa-grid8-layout-v1` (Tesseract 5 `spa` `--oem 3 --psm 6` + partición morfológica de cabeceras y grillas en OpenCV, integrada en [`apps/ocr/extractor.py`](../../apps/ocr/extractor.py)) se fundamenta en la evidencia empírica obtenida sobre los mismos generadores y evaluadores del repositorio:

1. **Recuperación completa de filas en las 8 variantes del formato de referencia (`12/12` vs. `7/12` en `v3` y `0/12` en `v2`)**:
   - En `oracle-format-v3-evidence.json`, el detector anterior dependía de umbrales Canny y de validar literalmente las ocho etiquetas de cabecera antes de aceptar el cuerpo de la tabla. Eso provocó **0 filas recuperadas** en `04-jpeg`, `05-reducida` (85 %), `06-ampliada` (125 %) y `07-grises`.
   - El nuevo particionador (`_detectar_lineas_horizontales` y `_particionar_tablas_grilla` / `table`) detecta líneas divisorias mediante diferencia entre dilatación morfológica y luminancia (`bg_v - gray` y `bg_h - gray`), agrupando coordenadas 1D con tolerancia proporcional a la escala y priorizando divisores verticales de fila completa (`col_score > 0.85`). Con ello recupera **12 de 12 ítems en las 8 muestras** de `oracle_format.py` y **7 de 7 ítems con grilla** en `tests/ocr/evaluate.py`.
2. **Exactitud en campos complejos (`costCenter` de `0/12` a `12/12`) y reducción de campos ausentes (de `35` a `9`)**:
   - El preprocesamiento por celda (`ocr_celda`) toma `np.min(crop, axis=2)` para igualar el contraste de enlaces azules (`#1d5ea8`) y texto negro, enmascara superposiciones flotantes (`_limpiar_tooltip_en_celda`), escala la celda (`3×` si `h < 60`, `2×` en caso contrario), normaliza el fondo al percentil 85 y ejecuta Tesseract con `--oem 3 --psm 6 -l spa`.
   - En `oracle_format.py`, `costCenter` subió de `0/12` exactos (`7` erróneos, `5` ausentes) a **`12/12` exactos (100 %)**; `requestNumber`, `oracleId`, `sender`, `recipient`, `sentDate`, `sentTime` y `totalAmount` lograron **`8/8` exactos**, y `lineUnit` y `quantity` **`12/12` exactos**.
3. **Comportamiento seguro ante caracteres dudosos (sin inventar dígitos)**:
   - En `Impuesto (No Recuperable) 0 CLP`, el modelo lingüístico español de Tesseract transcribe el `0` aislado seguido de `CLP` como `O CLP`. Conforme a la regla de negocio de Cenit, `money('O CLP')` no adivina ni repara `O -> 0`: devuelve `value = null`, `status = 'ambiguous'`, `rawText = 'O CLP'` e incidencia `AMBIGUOUS_VALUE`, además de conservar la región visual para que la revisión humana confirme el `0` antes de guardar. Eso explica los `8` faltantes de `taxAmount` en la métrica automática de coincidencia exacta (`value == expected`).
4. **Reducción de tiempos de respuesta (> 5× más rápido)**:
   - En `oracle_format.py`, la mediana bajó de **14,32 s a 2,85 s** y el máximo de **28,67 s (3 ítems) a 4,13 s**.
   - En `tests/ocr/evaluate.py` (`holdout`), la mediana bajó de **4,57 s a 2,26 s** y el máximo de **6,36 s a 2,82 s**.
5. **Simplificación operativa y de suministro**:
   - Se eliminan los 20 paquetes de `onnxruntime`/`rapidocr` y la dependencia de descargas externas desde ModelScope, quedando 5 paquetes Python fijados en [`apps/ocr/requirements.lock`](../../apps/ocr/requirements.lock) y los paquetes del sistema `tesseract-ocr` / `tesseract-ocr-spa` en [`apps/ocr/Containerfile`](../../apps/ocr/Containerfile).

### Entorno, versiones y hashes registrados

- **Versión del procesador**: `tesseract5-spa-grid8-layout-v1`
- **Entorno de ejecución**: Contenedor Linux/amd64 (`Ubuntu 24.04`, `Python 3.12.3`, `tesseract 5.3.4` con `spa`, `opencv-python 5.0.0.93`, `Pillow 12.3.0`/`13.0.0`, `numpy 2.4.6`/`2.5.4`), inferencia secuencial en `http://127.0.0.1:8090`, sin conexión a PostgreSQL ni credenciales de API.
- **Hashes SHA-256 de código y activos**:
  - [`apps/ocr/extractor.py`](../../apps/ocr/extractor.py): `6312ebc14c3b49b199daad9c004ef374c45704f9abb13e38d9dc09780b31f7d3`
  - [`apps/ocr/server.py`](../../apps/ocr/server.py): `96aea0093c586c15a65401e1c900c5a6829cb919474fb1135dfea03c87454ce0`
  - [`experiments/purchases/oracle_format.py`](oracle_format.py): `834c1eb44a2a4c252257b6702c1bce41712952f0d80f3ec59ab41aef561a2a9f`
  - [`tests/ocr/fixtures.py`](../../tests/ocr/fixtures.py): `784acb568ad9ac50e472c4be499019c910c918be4380bc20f8f819b2463edc80`
  - [`tests/ocr/evaluate.py`](../../tests/ocr/evaluate.py): `605685a212663af6690cbdea23df2b9a6bc3598868ac13f23122aed9a0064d40`
  - [`tests/ocr/check_layout.py`](../../tests/ocr/check_layout.py): `0205c65715c5163a7271be06cb91d46e8de638debe2b99fd81f397160f3fa6b5`
  - Fuente utilizada en `oracle_format.py` (`tmp/ocr-fonts/arial.ttf`, copia de `DejaVuSans.ttf` del contenedor): `30328e88b08753dc63b14d84ce882ce504d53e27a56e637f5a068fdedc6ae385`

### Comandos ejecutados

```sh
# 1. Pruebas unitarias del extractor, segmentación morfológica y mapeo de candidatos (23/23 OK)
PYTHONPATH=apps/ocr python3 -m unittest discover -s tests/ocr -v

# 2. Verificación de layout (compatible, partial y 422 UNSUPPORTED_CAPTURE_LAYOUT: 10/10 OK)
PYTHONPATH=tests/ocr python3 tests/ocr/check_layout.py

# 3. Evaluación del adaptador en development y holdout
PYTHONPATH=tests/ocr python3 tests/ocr/evaluate.py --url http://127.0.0.1:8090 --split development --output tmp/ocr-adapter-dev
PYTHONPATH=tests/ocr python3 tests/ocr/evaluate.py --url http://127.0.0.1:8090 --split holdout --output tmp/ocr-adapter-holdout

# 4. Evaluación sobre las 8 capturas con formato de referencia Oracle (8 columnas)
python3 experiments/purchases/oracle_format.py --output tmp/ocr-oracle-format --url http://127.0.0.1:8090 --evaluate
```

### Resultados por muestra — Formato de referencia (`oracle_format.py`)

| Muestra | Dimensiones | SHA-256 de imagen | HTTP | Filas (recup./esp.) | Exactos | Erróneos | Faltantes | Tiempo (s) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `01-completa` | 1085 × 658 | `e9b58def024c797fc39aef9a373b30e3ef69ac5f2bdc1f84fdf0f6105a73af31` | 200 | 1 / 1 | 13 | 3 | 1 | 2,692 |
| `02-dos-items` | 1085 × 714 | `925fbf32299b6dbfe80b7a3b61f15ef07cfeb7e8451296d62388544ac173b0d2` | 200 | 2 / 2 | 19 | 4 | 1 | 3,427 |
| `03-tres-items` | 1085 × 770 | `195b49a0b4edff225ae9fa3e1db6c4d30bd1a90fb7a3bd017e6f6eaee691f4d4` | 200 | 3 / 3 | 25 | 5 | 1 | 4,128 |
| `04-jpeg` | 1085 × 658 | `34c9f9397d61943dc2eb67d6af9e923c3dc47ccdd0e787283c788f4ab2860b46` | 200 | 1 / 1 | 12 | 4 | 1 | 2,859 |
| `05-reducida` | 922 × 559 | `c74cc4bb95736bc8a4bc87bd0b8ecab8eabd23b4720d1d279cac9ab76e4e72f6` | 200 | 1 / 1 | 10 | 5 | 2 | 2,831 |
| `06-ampliada` | 1356 × 892 | `86e8b328c10702f8484f94f0a1577b8361049a182181d27f37447bb6a0c5c2ca` | 200 | 2 / 2 | 19 | 4 | 1 | 3,727 |
| `07-grises` | 1085 × 658 | `ca6f3d44cecdd5449010a88667fd9ceca1ee4a3ea612175f930a40ae76c9d3b1` | 200 | 1 / 1 | 13 | 3 | 1 | 2,850 |
| `08-cabecera-recortada` | 1085 × 614 | `d43835507cb4ec881d10bc6bf0b5739ad9e3622b009559376cf1770ea6a9a1ac` | 200 | 1 / 1 | 13 | 3 | 1 | 2,708 |
| **Total / Resumen** | — | — | — | **12 / 12** | **124** | **31** | **9** | **Mediana 2,85 s / Máx. 4,13 s** |

### Resultados por campo — Formato de referencia (`oracle_format.py`) y Holdout (`tests/ocr/evaluate.py`)

| Campo | `oracle_format.py` Exactos | `oracle_format.py` Erróneos | `oracle_format.py` Faltantes | `evaluate.py` (holdout) Exactos | `evaluate.py` (holdout) Erróneos | `evaluate.py` (holdout) Faltantes | Observaciones de diagnóstico |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `requestNumber` | 8 | 0 | 0 | 8 | 0 | 0 | 100 % exacto en ambos conjuntos |
| `oracleId` | 8 | 0 | 0 | 8 | 0 | 0 | 100 % exacto en ambos conjuntos |
| `sender` | 8 | 0 | 0 | 8 | 0 | 0 | 100 % exacto en ambos conjuntos |
| `recipient` | 8 | 0 | 0 | 8 | 0 | 0 | 100 % exacto en ambos conjuntos |
| `sentDate` | 8 | 0 | 0 | 8 | 0 | 0 | 100 % exacto en ambos conjuntos |
| `sentTime` | 8 | 0 | 0 | 8 | 0 | 0 | 100 % exacto en ambos conjuntos |
| `totalAmount` | 8 | 0 | 0 | 7 | 0 | 1 | En `zero` (`0 CLP`), `O CLP` se marca `ambiguous` (`value=null`) |
| `taxAmount` | 0 | 0 | 8 | 0 | 0 | 8 | `0 CLP` leído como `O CLP`; marcado `ambiguous` con `rawText` visible |
| `attachmentReference` | 6 | 2 | 0 | 0 | 8 | 0 | En `04-jpeg`/`05-reducida` o fuente DejaVu omite un `_` intermedio |
| `description` (cabecera + líneas) | 4 | 16 | 0 | 15 | 0 | 1 | En `oracle_format.py` omite tilde en mayúscula (`DEMOSTRACION`/`SINTETICA`) |
| `provider` | 0 | 12 | 0 | 6 | 1 | 1 | En `oracle_format.py` une espacio en `ALFADEMO`/`BETASPA` |
| `costCenter` | 12 | 0 | 0 | 6 | 1 | 1 | **12/12 exactos** en `oracle_format.py` (en `v3` era `0/12`) |
| `lineUnit` | 12 | 0 | 0 | 7 | 0 | 1 | 100 % exacto en todas las tablas con grilla |
| `quantity` | 12 | 0 | 0 | 7 | 0 | 1 | 100 % exacto en todas las tablas con grilla |
| `price` | 11 | 1 | 0 | 7 | 0 | 1 | En `05-reducida` pierde un `0` (`44000`); en resto 100 % exacto |
| `amount` | 11 | 0 | 1 | 7 | 0 | 1 | En `05-reducida` queda `ambiguous` (`null`); en resto 100 % exacto |
| `chargeAccount` | *(excluido)* | *(excluido)* | *(excluido)* | 7 | 0 | 1 | 100 % exacto en todas las tablas con grilla de `evaluate.py` |

*(En `evaluate.py` el único faltante de las columnas de línea corresponde a la muestra `no-grid`, cuya tabla sin bordes debe reportar `0` filas e incidencia `TABLE_STRUCTURE_UNRECOGNIZED` por diseño).*

### Resultados por muestra — Holdout del adaptador (`tests/ocr/evaluate.py`) y Regresión de Layout (`tests/ocr/check_layout.py`)

En `tests/ocr/evaluate.py` (tanto en `development` como en `holdout`), los tiempos e ítems recuperados por muestra fueron:
- `clear` (`sha256:4ef11689...`): `1/1` fila, `2,464 s`
- `multiline` (`sha256:9460e628...`): `2/2` filas, `2,817 s`
- `jpeg` (`sha256:9029fb30...`): `1/1` fila, `2,243 s`
- `small` (`sha256:bf955e65...`): `1/1` fila, `2,175 s`
- `margin` (`sha256:58dc45c7...`): `1/1` fila, `2,422 s`
- `zero` (`sha256:78db9f25...`): `1/1` fila, `2,281 s`
- `partial` (`sha256:2cb09081...`): `0/0` filas (`TABLE_STRUCTURE_UNRECOGNIZED`), `1,561 s`
- `no-grid` (`sha256:aeec70a5...`): `0/1` fila (`TABLE_STRUCTURE_UNRECOGNIZED`), `1,812 s`

En `tests/ocr/check_layout.py` ([`tests/ocr/layout-evidence-v3.json`](../../tests/ocr/layout-evidence-v3.json)), los 10 casos cumplieron el contrato:
- **Compatibles (`HTTP 200`, `status: "compatible"`, 4 señales)**: `full` (`2,301 s`), `grayscale` (`2,263 s`), `without-branding` (`2,191 s`).
- **Parciales (`HTTP 200`, `status: "partial"`)**: `header-only` (`1,553 s`, 10 regiones de cabecera, 0 filas), `table-only` (`1,009 s`, 8 regiones de tabla, 1 fila), `no-grid` (`1,823 s`, 10 regiones de cabecera, 0 filas).
- **Inválidas rechazadas (`HTTP 422`, `code: "UNSUPPORTED_CAPTURE_LAYOUT"`)**: `blue-only` (`0,378 s`), `logo-only` (`0,385 s`), `landscape` (`0,406 s`), `title-only` (`0,529 s`).

Esta evaluación cubre las muestras disponibles en el repositorio para `SCRUM-47` y queda lista para revisión del contrato/adaptador con Víctor (`SCRUM-45`) y recorrido de interfaz con Gael. La validación independiente con nuevas capturas corresponde a `SCRUM-136`.

## Reproducir las baterías experimentales

`baseline/` conserva el primer ensayo. `dataset.py`/`pipeline.py` contienen la segunda batería; los archivos con sufijos `_v3` y `_v4` pertenecen a las rondas posteriores. Cada evaluador conoce las respuestas esperadas; los extractores reciben sólo imagen y configuración. Las coordenadas del generador no se exportan al extractor.

El entorno usa `Containerfile`, `requirements.lock` y `run.ps1`, con Podman Linux, CPU, cuota de un núcleo y límite de 1 GiB por variante. Descargar pesos requiere red; las mediciones se realizan sin ella. Para preparar el entorno inicial en PowerShell:

```powershell
podman build -f experiments/purchases/Containerfile -t localhost/cenit-ocr-research:20261014 experiments/purchases
New-Item -ItemType Directory -Force tmp/ocr-research | Out-Null
podman run --name cenit-research-prepare --cpus 1 --memory 1g `
  -v "$($PWD.Path)/tmp/ocr-research:/results" `
  localhost/cenit-ocr-research:20261014 python baseline/benchmark.py --engine rapid --output /results
podman cp cenit-research-prepare:/opt/research/lib/python3.11/site-packages/rapidocr/models tmp/ocr-research/models
```

Conservar los pesos y sus hashes; los [modelos de runtime](../../apps/ocr/MODELS.md) documentan su procedencia y licencia. El runner monta los modelos preparados. Usar nombres nuevos o retirar sólo los contenedores del ensayo propio si ya existen. Los scripts congelados pueden mencionar la guía antigua en sus mensajes; la preparación vigente está en esta sección.

1. Ajustar con desarrollo: `./experiments/purchases/run.ps1 -Split development -Repeats 1`.
2. Congelar fuentes y configuración antes de evaluar: `./experiments/purchases/run.ps1 -Split holdout -Repeats 2`.
3. Resumir: `py -3 experiments/purchases/summarize_battery.py tmp/ocr-battery tmp/ocr-battery/summary.json`.

Para las rondas 3 y 4, añadir `-Round 3` o `-Round 4` al runner y usar `summarize_round3.py tmp/ocr-round3 tmp/ocr-round3/summary.json` o `summarize_round4.py tmp/ocr-round4 tmp/ocr-round4/summary.json`. No ajustar después de ver una evaluación y volver a presentarla como no vista.

Las baterías anteriores usan siete columnas. La de formato de referencia usa ocho. Los reportes permiten comprobar igualdad de imágenes, fuentes y pesos entre variantes; distinguen arranque, tiempo de procesamiento y memoria. Conservar los resultados históricos antes de repetir; imágenes, pesos adicionales y salidas completas permanecen en `tmp`.

## Comprobar el procesador integrado

Las pruebas Python están en `tests/ocr`, separadas de las baterías. Ejecutarlas con las dependencias del OCR instaladas en un entorno aislado o en su imagen:

```sh
PYTHONPATH=apps/ocr python3 -m unittest discover -s tests/ocr -v
```

`tests/ocr/check_layout.py` verifica casos sintéticos de formato, parciales y rechazos contra OCR local; requiere Pillow y la fuente DejaVu prevista por el generador. `tests/ocr/evaluate.py --url http://127.0.0.1:8090 --split holdout --output <directorio-nuevo-en-tmp>` registra evaluación por campo y hashes. Consultar sus opciones antes de ejecutar; los valores esperados permanecen en el evaluador, fuera del runtime.

El E2E opcional de OCR real figura en la [matriz](../../Docs/PRUEBAS-Y-ACEPTACION.md). Es un recorrido de integración con una imagen ficticia, no una medición de exactitud institucional. La capacidad de la VM, la concurrencia y la aceptación de usuarios requieren sus propias comprobaciones.

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

Los dos últimos registros corresponden al ensayo local del 14 de octubre de 2026. HTTP 200 significa que hubo respuesta, no que la lectura fuera correcta. Los pesos no fueron entrenados ni cambiados en esos ajustes. No se reparan dígitos a partir de los valores esperados, de sumas ni de acuerdos supuestos entre motores.

PP-OCRv5 móvil latino mediante ONNX quedó como motor candidato. Las mejoras de geometría deben evaluarse separadamente de detección, reconocimiento y normalización. El acuerdo con Tesseract no garantiza corrección y puede añadir tiempo. Las pruebas de muestras reales, calidad mínima aceptada y recursos del destino siguen siendo necesarias para aceptar un uso institucional.

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

### Alternativa Tesseract conservada de la revisión

Los aportes de ihelo (`pistaco92`) están en los [PR #49](https://github.com/Menderin/Cenit/pull/49), SHA `275901a2dccb090d55cb329de01daa7875ae4fbb`, y [PR #55](https://github.com/Menderin/Cenit/pull/55), SHA `35f336af193ce35c6fed00f443bc5322a36cecd8`. El segundo incluye al primero. Su propuesta usa Tesseract español y segmentación morfológica por celdas. La evidencia original se conserva en [oracle-format-tesseract-evidence.json](oracle-format-tesseract-evidence.json), atribuida a su autor y separada de las mediciones del procesador integrado.

El archivo declara 125 campos exactos, 30 erróneos y nueve ausentes, mediana 2,206 segundos y 0/12 proveedores exactos. Su hash de extractor `6312ebc14c3b49b199daad9c004ef374c45704f9abb13e38d9dc09780b31f7d3` coincide con el fuente del SHA del PR #55. Es evidencia histórica del autor, pendiente de reproducción independiente con el runtime congelado y muestras representativas. La descripción del PR #49 conserva métricas y hash de una revisión anterior.

La revisión recupera su healthcheck para el servicio OCR y adapta su caso de impuesto ambiguo → revisión → payload de guardado a las fixtures compartidas existentes. Los casos ya cubiertos de límites, fechas, proveedores, ceros y copia independiente se conservan en sus pruebas actuales.

Antes de evaluar una sustitución del motor se debe resolver el fallback de `extract` del PR #55, que reintenta PNG como JPEG o viceversa pese al MIME declarado. La regresión del punto de entrada está en `tests/ocr/test_extractor.py`. Su Compose también hace obligatorio OCR para arrancar la aplicación, mientras la configuración vigente permite usar login y compras con el procesador apagado. La selección del motor requiere contrastar aciertos, errores, ausencias y tiempos sobre las mismas capturas. Esta revisión conserva PaddleOCR y su procedencia vigentes.

Las pruebas Python están en `tests/ocr`, separadas de las baterías. Ejecutarlas con las dependencias del OCR instaladas en un entorno aislado o en su imagen:

```sh
PYTHONPATH=apps/ocr python3 -m unittest discover -s tests/ocr -v
```

`tests/ocr/check_layout.py` verifica casos sintéticos de formato, parciales y rechazos contra OCR local; requiere Pillow y la fuente DejaVu prevista por el generador. `tests/ocr/evaluate.py --url http://127.0.0.1:8090 --split holdout --output <directorio-nuevo-en-tmp>` registra evaluación por campo y hashes. Consultar sus opciones antes de ejecutar; los valores esperados permanecen en el evaluador, fuera del runtime.

El E2E opcional de OCR real figura en la [matriz](../../Docs/PRUEBAS-Y-ACEPTACION.md). Es un recorrido de integración con una imagen ficticia, no una medición de exactitud institucional. La capacidad de la VM, la concurrencia y la aceptación de usuarios requieren sus propias comprobaciones.

# HU04-T01 — Investigación de extracción local de compras

Fecha: 14 de octubre de 2026. Estado: investigación ejecutada y recomendación provisional documentada; pendiente de revisión del equipo y ensayo de VM. No acredita SCRUM-45 ni la historia de extracción integrada.

## Decisión y producto de origen

El líder comunicó la decisión del equipo del 13/10: **no habrá acceso a Oracle ni a su API**. No se realizó una consulta directa a TI desde este trabajo ni se dispone de credenciales, documentación de API, versión o edición institucional. La captura de referencia identifica visualmente Oracle Workflow y «Solicitud Interna de Compra»; no demuestra acceso a su backend. La única entrada de esta entrega será una captura PNG/JPEG.

Se autorizó comparar OCR ligero con modelos de visión, construir imágenes completamente ficticias y fijar **60 segundos como objetivo de espera**, no como garantía medida en la VM. Víctor implementa el procesamiento; Gael conecta la interfaz. No se debe volver a investigar la API como dependencia de esta entrega.

## Opciones comparadas

| Opción | Evidencia | Evaluación |
| --- | --- | --- |
| Tesseract 5.3.0, `spa+eng`, PSM 11 | 33 ejecuciones reales | Menor consumo, pero confunde ceros y pierde campos pequeños |
| Tesseract con ampliación 2× Lanczos | 33 ejecuciones reales | Mejora lectura normal; sigue fallando en ceros y tablas degradadas |
| PP-OCRv5 móvil mediante RapidOCR 3.10.0 / ONNX Runtime 1.28.0, CPU | 33 ejecuciones reales | Mejor fidelidad relativa del prototipo, con mayor RAM |
| Qwen3-VL 2B/4B mediante Ollama | Investigación documental; **no ejecutado** | No priorizado para la VM compartida: los paquetes de 1,9/3,3 GB no incluyen toda la memoria de inferencia |
| PP-StructureV3 completo | Investigación documental; **no ejecutado** | Añade análisis documental general que no necesitamos para un único formato; presupuesto de memoria por comprobar |
| ROI fijo o proporcional | Análisis del enfoque; sin benchmark propio | Escalado uniforme no equivale a recorte o redistribución; no recomendado como único localizador |

RapidOCR es una implementación de modelos OCR en ONNX, no un modelo generativo ni el runtime nativo de Paddle. Se usaron detector móvil PP-OCRv5, reconocedor móvil latino PP-OCRv5 y clasificador móvil de orientación v2. Las versiones, hashes de pesos, dependencias y errores están en [evidence.json](../experiments/purchases/baseline/evidence.json).

Los tres archivos de pesos cargados suman aproximadamente **12,7 MiB en disco**; esto no equivale al consumo RAM del proceso. El inventario completo de los paquetes incluye otros modelos no utilizados; la evidencia resumida identifica exclusivamente los tres cargados.

Referencias primarias: [Tesseract TSV](https://github.com/tesseract-ocr/tessdoc/blob/main/Command-Line-Usage.md), [limitaciones de tablas](https://github.com/tesseract-ocr/tessdoc/blob/main/ImproveQuality.md), [PaddleOCR multilingüe](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md), [RapidOCR](https://github.com/RapidAI/RapidOCR), [lista de modelos](https://rapidai.github.io/RapidOCRDocs/main/model_list/), [Qwen 2B](https://ollama.com/library/qwen3-vl:2b-instruct), [Qwen 4B](https://ollama.com/library/qwen3-vl:4b-instruct), [PP-StructureV3](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/pipeline_usage/PP-StructureV3.html).

## Método y resultados medidos

Notebook detectado: AMD Ryzen 5 4600H, aproximadamente 16 GB de RAM y GTX 1650 de 4 GB. El ensayo **no usó GPU**: Linux amd64 en la máquina Podman local, con aproximadamente 7,6 GiB visibles; cada extractor tuvo cuota de **1 CPU y 1 GiB** y se ejecutaron secuencialmente. No se ejecutó nada en la VM universitaria.

Se generaron 11 imágenes totalmente ficticias: una línea, tres líneas/proveedores, textos multilínea, ceros, anexos ausentes, JPEG con calidad 45, reducción al 60 %, ampliación al 150 %, márgenes desplazados, cabecera recortada e imagen vacía. Se inspeccionó visualmente la muestra multilínea. La fuente sintética usa DejaVu Sans y aproxima la estructura de la referencia, **no reproduce todos sus campos, estilos o variantes**. No se utilizaron identidades de la captura real ni ejemplos del laboratorio como respuestas.

Se ejecutaron tres repeticiones por imagen y opción: **99 procesamientos reales**. La verdad esperada la conoce sólo el evaluador; OCR y parser reciben la imagen. El reporte registra las discrepancias, no únicamente un porcentaje global.

| Prototipo completo (OCR + parser común) | Campos visibles exactos* | Mediana | Máximo observado | Pico de memoria del contenedor** |
| --- | --- | --- | --- | --- |
| Tesseract | 122/164 (74,4 %) | 0,784 s | 1,443 s | 92,5 MiB |
| Tesseract 2× | 137/164 (83,5 %) | 1,293 s | 1,878 s | 196,1 MiB |
| RapidOCR móvil | 147/164 (89,6 %) | 2,977 s | 3,737 s | 627,5 MiB |

\* Coincidencia exacta del texto visible esperado en la primera repetición: 9 campos de cabecera y 7 campos por ítem donde aparecen. No es precisión estadística del modelo ni evaluación de los 30+ campos del contrato. Diferencias de espacios/puntuación también cuentan como errores. Las tres repeticiones devolvieron el mismo resultado por caso. Las 10 ausencias esperadas se conservaron correctamente en las tres opciones y no se incluyen en el denominador de campos visibles.

\** `memory.peak` de cgroup v2 durante el experimento: incluye cachés cargadas a ese contenedor, no equivale a RAM total de la máquina. RapidOCR también registró 682,6 MiB de pico RSS del proceso; estas métricas tienen distinta contabilidad y no deben sumarse ni utilizarse como un límite garantizado de producción. Los tiempos incluyen OCR y parser; excluyen construcción del entorno y carga inicial de modelos. La carga inicial offline y el inventario completo están en el JSON. La primera descarga de modelos se hizo antes del ensayo final; las 99 ejecuciones finales tuvieron red deshabilitada.

### Errores relevantes

- RapidOCR acertó los 16 campos de la muestra normal, los 30 de la muestra de tres proveedores y los 16 de zoom/márgenes. Esto demuestra esas variantes sintéticas, no robustez general a cualquier captura.
- En textos largos omitió una cantidad. En el caso de ceros leyó `o` en precio e importe. **No se corrigió automáticamente a `0`**.
- Tanto RapidOCR como Tesseract 2× dejaron la tabla sin resolver en las muestras JPEG/de texto reducido. Las incidencias distinguen columnas no localizadas y filas no resueltas; no se inventaron filas. Tesseract sin ampliar resolvió el JPEG, pero falló en el recorte y en texto reducido.
- El parser tiene responsabilidades en estos fallos: reconocimiento exacto de anclas, agrupación y separadores. **Los números comparan pipelines, no aíslan exclusivamente calidad OCR**.
- En la prueba exploratoria inicial, «Interna» fue leído como «Intema». El parser final localiza «Líneas de Solicitud» junto a columnas y separadores, sin exigir esa palabra frágil.
- La imagen vacía produjo ausencia de datos, no una respuesta precargada. Una cabecera ausente permanece desconocida. Este prototipo devuelve texto de investigación e incidencias; **todavía no implementa estados TypeBox ni normalización contractual**.

## Recomendación y ROI dinámico

**Base recomendada para SCRUM-45: PP-OCRv5 móvil latino con ONNX Runtime y localización por anclas/estructura**, condicionado al presupuesto de la VM. Ganó la comparación de fidelidad relativa y quedó muy por debajo de 60 s en este equipo. No se declara listo ni suficientemente preciso para el cliente.

Tesseract 2× es la alternativa de menor memoria con lectura razonable en capturas claras; no se recomienda sustituir silenciosamente el motor según recursos ni considerar sus campos correctos por tener formato válido. Una selección distinta se registra en configuración y se vuelve a evaluar.

El procedimiento propuesto detecta texto con posiciones, ubica cabecera y encabezados, y construye recortes relativos a esas anclas. Las líneas horizontales separan ítems y sus columnas se delimitan por los encabezados. No hay un ROI de píxeles fijos ni porcentajes respecto de toda la captura. Desplazamiento/zoom fueron ensayados; pérdida de etiquetas, tablas sin líneas, cambios de distribución y capturas parciales requieren fallos parciales explícitos.

En el prototipo, las posiciones de palabras dentro de una línea RapidOCR se aproximan por longitud del texto; **no son cajas de palabra medidas por el detector**. SCRUM-45 debe refinar la segmentación por celdas/recortes para evitar atribución entre columnas, ampliar muestras y volver a medir. No reutilizar esta heurística como garantía de confiabilidad.

No se necesita entrenar YOLO ni otro detector propio para empezar: no hay un conjunto etiquetado suficiente y el formato ofrece anclas. Modelos generativos pueden quedar como evaluación posterior, sin fallback oculto ni salida a servicios cloud.

## Reproducción

Los scripts están en `experiments/purchases`, fuera del runtime y de CI/CD. No cambian el lockfile npm, BD, cuentas, rutas ni contenedores existentes. El entorno experimental usa dependencias Python exactas en `requirements.lock`; los paquetes Debian y el inventario de la imagen se pueden auditar. Es una imagen de investigación, no una recomendación de imagen mínima de producción.

Desde la raíz, en PowerShell:

```powershell
podman build -f experiments/purchases/Containerfile -t localhost/cenit-ocr-research:20261014 experiments/purchases
New-Item -ItemType Directory -Force tmp/ocr-research | Out-Null

# Preparación online explícita: descarga los pesos versionados y ejecuta un primer ensayo.
podman run --name cenit-research-prepare --cpus 1 --memory 1g `
  -v "$($PWD.Path)/tmp/ocr-research:/results" `
  localhost/cenit-ocr-research:20261014 python baseline/benchmark.py --engine rapid --output /results
podman cp cenit-research-prepare:/opt/research/lib/python3.11/site-packages/rapidocr/models tmp/ocr-research/models

# Medición final, secuencial y sin red. Usar nombres nuevos si ya existen contenedores del ensayo.
foreach ($researchEngine in @('tesseract','tesseract-upscale','rapid')) {
  podman run --name "cenit-research-final-$researchEngine" --network none --cpus 1 --memory 1g `
    -v "$($PWD.Path)/tmp/ocr-research:/results" `
    -v "$($PWD.Path)/tmp/ocr-research/models:/opt/research/lib/python3.11/site-packages/rapidocr/models:ro" `
    localhost/cenit-ocr-research:20261014 python baseline/benchmark.py --engine $researchEngine --output /results
  if ($LASTEXITCODE -ne 0) { throw "Falló el ensayo de $researchEngine" }
}
py -3 experiments/purchases/baseline/summarize.py tmp/ocr-research tmp/ocr-research/summary.json
```

Los pesos y las capturas generadas para estos experimentos permanecen en `tmp`; no se versionan sus datos ni modelos. La versión integrada incluye únicamente los dos pesos de runtime descritos en [`apps/ocr/MODELS.md`](../apps/ocr/MODELS.md). Comparar SHA-256 con `evidence.json` al repetir, no confiar sólo en el nombre del modelo. Las salidas completas permanecen locales; la evidencia resumida versionada conserva errores por campo, dependencias y hashes de fuentes/pesos. No sobrescribir evidencia histórica para ocultar un resultado peor.

## Pendientes para VM e integración

La VM tiene aproximadamente 4 GB **totales**; CPU, GPU y memoria disponible no se verificaron en esta investigación. Antes de reservar recursos, obtener en ella `free -m`, `lscpu`, `df -h` y `podman stats --no-stream`, considerando también Zableke/Jenkins. El límite de 1 GiB del benchmark **no autoriza asignarlo en la VM**. Si no hay margen, dejar extracción deshabilitada y registrar el bloqueo sin afectar login/compras.

SCRUM-45 deberá conservar PNG/JPEG, 5 MiB y 20 MP; validar el binario y no sólo metadatos. Mantendrá un único procesamiento simultáneo inicialmente, timeout acotado, archivos temporales descartados, permisos administrativos y Origin; sin inferencia de pago/aprobación ni guardado al extraer. La opción de deshabilitar será configuración explícita y devolverá indisponibilidad comprensible. No instalar motores ni descargar pesos como parte del arranque, las migraciones o el CD.

El endpoint futuro `POST /api/v1/purchases/extractions` conservará candidatos/ausencias/ambigüedades y exigirá revisión humana. `o` en un monto será inválido/desconocido, nunca cero supuesto. La procedencia de captura real requiere ampliar contrato/persistencia separadamente; hoy sólo se admiten manual y ejemplo ficticio. El frontend de Gael debe distinguir disponibilidad, carga, resultados parciales y fallos; no usar este benchmark como pantalla de extracción.

Falta evaluar capturas ficticias independientes del generador, todos los campos del contrato, resolución/calidad mínimas aceptadas, máximo contractual de líneas/píxeles, borrado temporal, tiempos de arranque, concurrencia y salud de aplicación durante inferencia en la VM. No se inventó un umbral institucional de precisión. HU04-T01 tiene evidencia y una vía propuesta para revisión; HU04, SCRUM-45 y el despliegue del extractor continúan pendientes.

Verificación adicional: compilación de los tres scripts Python sin errores, construcción del entorno experimental y 44 pruebas de infraestructura existentes correctas. No se ejecutaron builds ni E2E de aplicación porque no se modificó su código/contrato. Actions, revisión e integración dependen del push/PR del líder; no se creó PR ni se hizo merge.

## Segunda batería — evaluación separada y segmentación por celdas

Por petición del líder, toda la lógica experimental se trasladó a **`experiments/` en la raíz**. No permanece lógica de investigación en `tests`, API, frontend, BD o despliegue. El contexto del Containerfile principal excluye `experiments`; el Containerfile experimental usa únicamente esa subcarpeta como contexto. Se conservaron intactos código y hashes del primer ensayo en `experiments/purchases/baseline`.

Se ejecutaron 16 procesamientos de desarrollo sobre cuatro casos conocidos (incluye un reajuste del modo celdas), y después **48 procesamientos de evaluación**: ocho configuraciones nuevas × tres variantes × dos repeticiones. Después de comenzar esa evaluación no se modificaron extractor, generador ni configuración. El resumen comprueba igualdad de hashes de código e imágenes entre variantes y de pesos respecto del primer ensayo. No hubo entrenamiento ni fine-tuning.

Los ocho casos nuevos cambian valores ficticios, distribución, anchos de columnas, cantidades de ítems, fuente serif, escala, márgenes, JPEG y ceros. Se añadió una tabla sin cuadrícula como caso de fallo de una restricción conocida. Son configuraciones sintéticas separadas, **no muestras independientes aportadas por el cliente**. El evaluador conoce la verdad esperada; los extractores sólo reciben imagen y variante.

El notebook/Podman y sus límites permanecieron en CPU, cuota 1 CPU y 1 GiB por variante, secuencial y sin red. En esta batería se deshabilitó el clasificador de orientación para las tres variantes; los pesos de detección y reconocimiento son idénticos a los anteriores. Por ello, y por ser otras imágenes, no se deben interpretar sus porcentajes como una variación directa del 89,6 % del primer conjunto.

| Variante | Campos visibles exactos | Numéricos/códigos exactos* | Mediana | Máximo | Pico memoria contenedor |
| --- | --- | --- | --- | --- | --- |
| Base: OCR global y parser original | 136/162 (84,0 %) | 51/68 | 4,77 s | 7,39 s | 541,7 MiB |
| Ampliación 2× y posiciones de palabras | 98/162 (60,5 %) | 35/68 | 4,38 s | 5,60 s | 801,2 MiB |
| Cuadrícula y OCR por celdas 3×, reintento de números | 121/162 (74,7 %) | 39/68 | 9,99 s | 24,45 s | 865,8 MiB |

\* Identificadores, cantidad, precio, importe y cuenta de cargo. No incluye normalización de montos de cabecera con `CLP`. El resumen también separa cabecera/ítems, ausencias, filas y valores incorrectos no nulos. Todas las variantes conservaron el único campo ausente y fueron deterministas en las dos repeticiones. Evidencia completa resumida: [battery-evidence.json](../experiments/purchases/battery-evidence.json).

### Qué aprendimos y decisión vigente

- **No adoptar ampliación/posiciones de palabras como mejora general.** El agrupamiento de sus cajas pierde encabezados o asigna textos a columnas incorrectas. El resultado evalúa esa integración concreta, no demuestra que las posiciones de palabra del motor sean inútiles en otros parsers.
- El modo celdas recuperó la tabla serif y la reducida, pero falló en la cuadrícula del JPEG. Además produjo más valores incorrectos no nulos: **19 frente a 10** del modo base; la variante de ampliación produjo 8, pero omitió muchas más celdas. Menos valores incorrectos no equivale a más cobertura.
- Leer una celda completa directamente con el reconocedor numérico no garantizó fidelidad: se observaron `10000` en lugar de `71000` y otras pérdidas de dígitos. **Que el resultado tenga sólo dígitos no acredita que sea correcto**. No se sustituyeron letras por ceros ni se repararon números usando los esperados.
- La segmentación asume siete columnas en un orden conocido, no una tabla Oracle universal. Una integración futura debe verificar sus encabezados y tratar columnas desconocidas/reordenadas como ambiguas; la muestra sin cuadrícula quedó explícitamente sin ítems resueltos.
- **Conservar el modo base como referencia para el siguiente prototipo; rechazar por ahora la sustitución global por celdas o ampliación.** Ninguna variante queda acreditada como extracción suficientemente confiable para producción o cliente.
- El siguiente ensayo debe comparar recorte ajustado al texto dentro de celdas, padding y mantenimiento de proporciones, y relectura numérica contrastada. Ante lecturas discrepantes, conservar ambigüedad y revisión humana. Deberá usar otra evaluación no vista; no retocar con estos ocho casos y volver a llamarlos holdout.

### Ejecutar o inspeccionar el laboratorio

Ver [experiments/purchases/README.md](../experiments/purchases/README.md). Los reportes completos y capturas de esta batería quedaron en `tmp/ocr-battery`; no se publican como datos reales ni se conectan al laboratorio de la aplicación.

```powershell
./experiments/purchases/run.ps1 -Split development -Repeats 1
# Congelar código antes de evaluación:
./experiments/purchases/run.ps1 -Split holdout -Repeats 2
py -3 experiments/purchases/summarize_battery.py tmp/ocr-battery tmp/ocr-battery/summary.json
```

Se verificaron sintaxis Python/PowerShell, construcción del entorno experimental y preservación de hashes históricos. No se modificaron API, contratos, cuentas, tablas ni la VM. No se creó PR ni merge. El ensayo de recursos de la VM y SCRUM-45 continúan pendientes.

## Tercera batería — tinta visible y contraste de números

Se hicieron 12 procesamientos de desarrollo sobre casos previos y 48 evaluaciones congeladas sobre ocho configuraciones nuevas, con otros identificadores/importes, tipografía monoespaciada y variaciones de ancho. Se conservan los scripts de la segunda batería; `pipeline_v3.py` y `round3.py` contienen esta variante. Los pesos siguen idénticos y no se entrenaron. Un primer intento de generar muestras encontró una fuente no instalada; se corrigió antes de procesar la evaluación, sin resultados OCR de ese intento.

La variante `tight` busca la tinta oscura de cada celda numérica, elimina fondo vacío, añade padding y redimensiona conservando proporciones antes de reconocer. La variante `consensus` contrasta cantidad/precio/importe con Tesseract: discrepancias o regiones no verificables quedan `null` con incidencia y se conservan las lecturas originales como observaciones.

| Variante | Campos exactos | Precio/importe exactos | Precio/importe incorrectos no nulos | Precio/importe ausentes | Mediana | Máximo |
| --- | --- | --- | --- | --- | --- | --- |
| Base | 112/162 | 14/26 | 0 | 12 | 3,27 s | 4,86 s |
| Recorte al texto | 112/162 | 14/26 | 0 | 12 | 3,40 s | 4,94 s |
| Contraste con Tesseract | 108/162 | 10/26 | 0 | 16 | 3,29 s | 6,40 s |

Evidencia: [round3-evidence.json](../experiments/purchases/round3-evidence.json). Este conjunto es distinto del anterior, por lo que el 69,1 % de la base no representa una regresión medida sobre las mismas imágenes. Las tres variantes fueron deterministas en las dos repeticiones.

**Conclusión:** el recorte mejora números en desarrollo, pero en la evaluación queda bloqueado por cabeceras/segmentaciones que el OCR global no resuelve. El contraste conservador elimina más valores, sin beneficio sobre errores monetarios en este conjunto porque ya eran ausencias. No se adopta como mejora general ni se presenta abstención como aumento de exactitud.

Esto motivó un ensayo separado de reconstrucción por geometría y encabezados locales, usando una cuarta evaluación nueva. No se ajustó el tercer extractor tras ver estos resultados; su evidencia y hashes se conservan.

## Cuarta batería — encabezados verificados y lectura por líneas

Se ejecutaron 12 procesamientos de desarrollo y **48 evaluaciones nuevas** (ocho capturas × tres variantes × dos repeticiones). Se cambiaron otra vez valores, fecha, anchos y tamaños de fuente antes de evaluar. Se congelaron fuentes y configuraciones; el runner comprueba hashes antes/después de cada ejecución y el resumen compara fuentes, imágenes y pesos entre variantes. Los 96 procesamientos de evaluación de las rondas 3 y 4 son adicionales a las baterías anteriores.

`pipeline_v4.py` localiza una cuadrícula a partir de anclas y bordes, lee los encabezados de sus siete columnas por separado y exige que coincidan con las etiquetas conocidas. Reconstruye cada fila desde la geometría, aunque el parser global no haya podido asignar columnas. Divide cada celda por bandas reales de tinta y reconoce líneas ajustadas con padding y proporciones conservadas. Reutiliza espacios de una lectura global sólo si ambas lecturas tienen idénticos caracteres al excluir espacios; no cambia dígitos ni puntuación.

| Variante | Campos exactos | Precio/importe exactos | Importes incorrectos no nulos | Importes ausentes | Mediana | Máximo | Pico memoria contenedor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OCR global de referencia | 147/162 (90,7 %) | 24/26 | 0 | 2 | 3,26 s | 4,74 s | 623,5 MiB |
| Estructurada, encabezados locales | 148/162 (91,4 %) | 24/26 | 0 | 2 | 4,19 s | 7,03 s | 578,2 MiB |
| Estructurada con contraste Tesseract | 148/162 (91,4 %) | 24/26 | 0 | 2 | 5,48 s | 9,92 s | 521,1 MiB |

Evidencia: [round4-evidence.json](../experiments/purchases/round4-evidence.json). Las diferencias de memoria de cgroup también dependen de cachés compartidas y contabilización de páginas; **no prueban por sí solas que añadir trabajo reduzca la memoria necesaria**. No se modificaron los pesos, GPU, límite de 1 GiB ni cuota de 1 CPU.

La mejora emparejada fue **un campo de 162**, no una mejora grande ni estadísticamente establecida. No comparar directamente los porcentajes de conjuntos distintos para afirmar un salto del 69 % al 91 %. En los siete casos con cuadrícula, la variante estructurada acertó 139/146 campos; en el caso sin cuadrícula no reconstruyó los ítems, y eso permanece en el resultado global.

Los errores restantes incluyen espacios en fechas/horas y en textos, `CLP` sin el cero del impuesto en una captura reducida y ausencia de ítems sin cuadrícula. No se inventó ese cero. Los dos importes de ítem ausentes pertenecen al caso sin cuadrícula; los otros 24 coincidieron, incluidos los ceros, en estas muestras únicamente. El acuerdo entre motores no garantiza corrección: aquí no mejoró la fidelidad y agregó latencia.

### Decisión después de cuatro baterías

Mantener **PP-OCRv5 móvil latino vía ONNX** como motor candidato. La lectura estructurada es una alternativa prometedora para layouts con cuadrícula y encabezados verificables, pero no queda acreditada como sustitución universal. Conservar el modo global de referencia; no activar siempre Tesseract sin beneficio medido.

Antes de entrenar o cambiar a un modelo grande, las siguientes investigaciones prioritarias son:

1. Medir por separado detección, reconocimiento, asignación y normalización. Distinguir errores reales de lectura de diferencias de presentación como espacios alrededor de `:` o `CLP`.
2. Evaluar resolución efectiva del detector, no sólo ampliar la imagen de entrada. En la configuración instalada de RapidOCR 3.10.0 se observó `Global.max_side_len: 2000`, `Det.limit_side_len: 736` y `Det.limit_type: min`; se debe medir cómo se aplican antes de elegir otros valores. No se experimentó aún con esos parámetros ni se afirma que sean el origen de todos los errores.
3. Probar capturas ficticias más próximas al Oracle real, con ocho columnas incluyendo Unidad, encabezados Precio/Importe con `(CLP)`, etiquetas multilínea, filas variables y muestras preparadas por otra persona. Los siete encabezados exactos del prototipo son una restricción experimental que debe ampliarse antes de integración.
4. Validar el tratamiento de baja calidad y ambigüedad con revisión humana. No corregir números usando sumas ni rellenar campos desconocidos.
5. Sólo si persisten fallos propios del reconocedor, evaluar otro checkpoint compatible con español y recursos, o proponer entrenamiento con muestras etiquetadas y evaluación separada. **No se entrenó ningún modelo en este trabajo.**

Procedimiento: `./experiments/purchases/run.ps1 -Round 4 -Split holdout -Repeats 2`; resumen con `py -3 experiments/purchases/summarize_round4.py tmp/ocr-round4 tmp/ocr-round4/summary.json`. Las imágenes/reportes completos permanecen en `tmp/ocr-round3` y `tmp/ocr-round4`; la lógica y evidencia resumida, en `experiments/purchases`. Se comprobó sintaxis Python/PowerShell y coherencia de hashes. API, BD, cuentas, VM y contratos públicos siguen intactos. Ensayo VM y SCRUM-45 pendientes.

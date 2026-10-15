# Batería OCR de compras

Actualización del 14 de octubre: la nueva [batería de formato Oracle](ORACLE-FORMATO.md) reconstruye la captura de referencia con ocho columnas, cabecera compacta, controles y aprobaciones. Generar con `py -3 experiments/purchases/oracle_format.py`; imágenes en `tmp/ocr-oracle-format`. Las baterías históricas siguientes emplean plantillas simplificadas y no acreditan precisión sobre este formato.

Este laboratorio corre en el notebook dentro de Podman Linux, sólo CPU, con una cuota de 1 CPU y límite de 1 GiB por variante. No usa PostgreSQL, API, frontend o VM. Los pesos son preentrenados e idénticos a los del primer ensayo; no hay entrenamiento.

## Organización

- `baseline/`: primera comparación y evidencia histórica, sin modificar sus fuentes.
- `dataset.py`: cuatro muestras de desarrollo conocidas y ocho configuraciones sintéticas nuevas de evaluación, con valores ficticios diferentes, otra distribución y variantes de fuente/calidad. Las coordenadas del generador no se exportan al extractor.
- `pipeline.py`: variantes base, ampliación con posiciones de palabra y segmentación por celdas. Sólo recibe imagen y configuración; nunca consulta valores esperados.
- `battery.py` y `summarize_battery.py`: ejecutan OCR real, comparan con verdad esperada y registran fallos, fuentes, imágenes y hashes de pesos.
- `run.ps1`, `Containerfile`, `requirements.lock`: entorno experimental independiente. Los pesos y reportes completos permanecen en `tmp`.
- `pipeline_v3.py`, `dataset_v3.py`, `round3.py`: tercera batería; reutiliza casos anteriores como desarrollo y reserva nuevos valores, tipografía monoespaciada/serif y anchos para evaluación. Conserva intacto el código de la segunda batería.
- `pipeline_v4.py`, `dataset_v4.py`, `round4.py`: cuarta batería; verifica encabezados dentro de la cuadrícula y reconstruye filas sin depender de la asignación global de columnas. Usa otra evaluación sintética distinta.

## Procedimiento

1. Preparar los pesos explícitamente como explica [la investigación](../../Docs/INVESTIGACION-EXTRACCION-COMPRAS.md). La primera descarga necesita red; las mediciones no.
2. Ajustar sólo con `./experiments/purchases/run.ps1 -Split development -Repeats 1`.
3. Congelar extractor y generador. Ejecutar `./experiments/purchases/run.ps1 -Split holdout -Repeats 2` sin volver a ajustar con esos resultados.
4. Resumir con `py -3 experiments/purchases/summarize_battery.py tmp/ocr-battery tmp/ocr-battery/summary.json`.

Los reportes validan que las tres variantes utilizaron los mismos hashes de fuentes e imágenes. Cada configuración se compara con las mismas entradas, secuencialmente y sin GPU. El arranque se mide separado del procesamiento; memoria máxima se registra por contenedor/proceso. Conservar el reporte histórico antes de repetir una batería.

## Límites

La evaluación sigue siendo sintética, no capturas independientes del cliente. No transforma texto en candidatos del contrato ni implementa guardado. El formato experimental tiene siete columnas; exige geometría suficiente para segmentar filas. La muestra sin cuadrícula explora el fallo explícito de esa restricción.

Las posiciones de palabra provienen del alineamiento del reconocedor, no de cajas etiquetadas manualmente. El modo celdas localiza una cuadrícula por bordes y anclas; relee las celdas numéricas sin detector y usa contraste sólo al reintentar un número dudoso. Nunca sustituye directamente `O` por `0`.

Tercera batería: `./experiments/purchases/run.ps1 -Round 3 -Split development -Repeats 1`, luego congelar y ejecutar con `-Split holdout -Repeats 2`. Resumir con `py -3 experiments/purchases/summarize_round3.py tmp/ocr-round3 tmp/ocr-round3/summary.json`. El modo `tight` recorta tinta real y conserva proporciones antes de reconocer; `consensus` exige acuerdo con Tesseract para cantidad/precio/importe y conserva las lecturas discrepantes como observaciones. Un resultado numérico no verificable queda `null` con incidencia. No es el contrato público ni una garantía contra errores coincidentes de ambos motores.

Cuarta batería: utilizar `-Round 4` y resumir con `summarize_round4.py tmp/ocr-round4 tmp/ocr-round4/summary.json`. El modo `structured` lee líneas dentro de cada celda con recorte al texto y padding; `verified` contrasta cantidades/precios/importes con Tesseract. Se exige lectura exacta de los siete encabezados conocidos antes de reconstruir filas. Los espacios de la lectura global sólo se reutilizan si ambas lecturas contienen exactamente los mismos caracteres al excluir espacios. No se reparan dígitos ni puntuación por comparación con los esperados.

No debe interpretarse un campo no nulo como campo confiable: la evidencia distingue valores incorrectos de ausencias. Una mejora de coincidencias puede empeorar tiempo, memoria o errores numéricos; no incorporar automáticamente una variante a producción.

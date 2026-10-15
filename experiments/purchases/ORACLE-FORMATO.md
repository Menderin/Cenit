# Capturas sintéticas con formato de referencia

Reconstrucción visual del pantallazo facilitado por el líder: 1085 × 658 px en el caso base, cabecera compacta dividida, ocho columnas de anchuras desiguales, texto multilínea, fila de controles, secuencia gráfica y tabla de aprobaciones, y aplicaciones relacionadas. Los nombres, documentos y valores son completamente ficticios. Los iconos son aproximaciones dibujadas; no se reproducen activos oficiales ni se afirma autenticidad.

Generar desde la raíz con Python, Pillow y Arial instalada:

```powershell
py -3 experiments/purchases/oracle_format.py
```

Las ocho imágenes y el manifiesto quedan en `tmp/ocr-oracle-format`, fuera de Git:

| Archivo | Variante |
| --- | --- |
| `01-completa.png` | Captura completa, un ítem |
| `02-dos-items.png` | Dos ítems y proveedores distintos |
| `03-tres-items.png` | Tres ítems, secciones inferiores desplazadas |
| `04-jpeg.jpg` | Compresión JPEG, calidad 78 |
| `05-reducida.png` | Escala 85 % |
| `06-ampliada.png` | Dos ítems, escala 125 % |
| `07-grises.png` | Sin información de color |
| `08-cabecera-recortada.png` | Sin barra de navegación superior |

Para probar: iniciar OCR y `npm run dev`, entrar como administrativo, abrir **Sistema de compra → Subir captura** y seleccionar un archivo. Revisar los candidatos contra la imagen; extraer no guarda. Una tabla visible no implica que el adaptador logre reconstruirla.

## Medición separada del adaptador actual

```powershell
py -3 experiments/purchases/oracle_format.py --evaluate
```

Requiere el servicio OCR local en `127.0.0.1:8090`. Ejecutar sin otras inferencias simultáneas. El evaluador llama al procesador real, sin credenciales, API pública ni PostgreSQL; sólo envía los bytes y nombre de cada imagen. La verdad esperada permanece exclusivamente en el evaluador. Registra hashes de imágenes, generador, fuente Arial y procesador, respuestas, estados HTTP, ítems esperados/obtenidos, campos exactos/incorrectos/ausentes y tiempos incluyendo arranque del modelo. Excluye la cuenta de cargo de la puntuación porque puede quedar cortada en su columna estrecha; no se exige recuperar texto invisible. Comprueba que los textos multilínea puntuados caben en sus celdas.

Esta batería caracteriza el extractor congelado; **no es una evaluación independiente del cliente**. Las muestras comparten plantilla. No entrenamos el modelo ni modificamos el extractor para producir mejores resultados en ellas. Después de usarlas para ajustar reglas se necesitarán otras capturas para evaluación. Resumen de esta ejecución en `oracle-format-evidence.json`; respuestas completas en `tmp`.

La evidencia previa utilizó una plantilla simplificada: no acredita precisión sobre este formato. Las nuevas capturas del cliente siguen siendo necesarias para contrastar geometría, variedad documental y legibilidad. Las aprobaciones ilustradas no determinan situación de pago o aprobación institucional en Cenit.

## Resultado local del 14 de octubre

El procesador v2 actual respondió HTTP 200 en las ocho capturas, pero reconstruyó **cero ítems en todas ellas**. Sobre 164 comprobaciones de campos visibles: 50 coincidencias exactas, 21 valores incorrectos y 93 ausencias. Los ítems no recuperados cuentan como ausencias; el HTTP 200 no acredita extracción suficiente. Las cabeceras también presentan errores. Estas muestras reproducen una limitación que la plantilla simplificada anterior no evidenciaba.

Se revisaron visualmente las capturas de uno y dos ítems, se comprobó generación de las ocho variantes, sintaxis Python, límites de entrada e ignorado de imágenes/reportes por Git. No se cambió el extractor, no se entrenaron pesos ni se guardaron compras. El siguiente trabajo es corregir segmentación de cabecera y reconstrucción de tabla, contrastando después con muestras adicionales.

## Ajuste posterior — v3

Tras esa medición se modificó la segmentación del adaptador, conservando pesos y contratos. Regresión sobre **las mismas muestras de desarrollo**, no holdout: 118 campos exactos, 11 incorrectos y 35 ausentes, frente a 50/21/93 anteriores. Recuperó respectivamente 1, 2 y 3 ítems en los tres PNG nativos y 1 en la captura sin barra superior. JPEG, reducción, ampliación y gris siguen sin reconstruir la tabla. Mediana 14,32 s; máximo 28,67 s, con arranque incluido. La mejora de recuperación aumenta el tiempo y no elimina los valores incorrectos.

Resumen separado en `oracle-format-v3-evidence.json`, respuestas en `tmp/ocr-oracle-v3-final`. Pasaron 14 pruebas Python, incluidas regresiones de cabecera y tabla con controles/borde exterior, y 10 unitarias del servicio API. Se reconstruyó y recreó sólo el contenedor OCR local. La captura original no está disponible como archivo local para una medición exacta: falta volver a subirla desde el navegador y cotejarla. No atribuir los resultados sintéticos a esa imagen ni a precisión institucional.

# Adaptador local de capturas — HU04-T04

Autorización de Gael del 17 de octubre: incluir el mismo procesador en Azure Chile Central con producción y staging. La restricción anterior al notebook queda sustituida para esta nueva instalación. Pesos, límites, precisión pendiente y contrato no cambian; el ensayo de memoria/tiempos en la VM sigue siendo obligatorio. Preparación y evidencia en [la guía Azure](../deploy/azure/README.md).

Decisión del líder del 14 de octubre: primera entrega en el notebook; PaddleOCR PP-OCRv5 móvil Latin vía ONNX, sin entrenamiento, Oracle ni API institucional. El contenedor auxiliar no tiene BD. No instalarlo en la VM ni atribuirle capacidad de inferencia al runtime Node de 512 MiB. A petición posterior del líder se incorpora una interfaz mínima de captura y revisión; el equipo podrá seguir refinando su diseño.

## Probar desde el navegador

Con OCR preparado, PostgreSQL levantado y `.env` configurado como se indica abajo, reiniciar `npm run dev` para cargar el backend actualizado. Abrir **http://127.0.0.1:5173/login**, ingresar como administrativo y abrir **Sistema de compra → Subir captura**. La ruta directa es `/administracion/compras/captura`.

1. Pulsar «Seleccionar imagen» y elegir un PNG/JPEG ficticio. Generar las nuevas muestras con `py -3 experiments/purchases/oracle_format.py` y elegir `tmp/ocr-oracle-format/01-completa.png`. Reproducen la distribución de la referencia; véase la [batería de formato Oracle](../experiments/purchases/ORACLE-FORMATO.md). La plantilla anterior era simplificada y no acredita precisión en este formato. Aparecen nombre, dimensiones y vista previa; seleccionar no procesa ni guarda.
2. Pulsar «Extraer datos». La API ejecuta OCR real y comprueba estructura; la pantalla informa «Formato compatible» o «Captura parcial: revisa los datos recuperados». Si el procesador está apagado, muestra un error y permite reintentar conservando la imagen.
3. Revisar/corregir campos, originales e incidencias. Pulsar «Continuar al formulario», completar los mínimos y finalmente «Guardar solicitud». Sólo esta última acción conserva la copia en PostgreSQL.

La página admite teclado, selección/reemplazo de imagen y presentación móvil. Avisará antes de descartar correcciones al salir o cambiar captura. Logout, vencimiento y cambio de cuenta descartan la imagen y el borrador; no hay almacenamiento persistente de navegador, transporte por historial ni imágenes en caché de consultas. Las URL de vista previa se revocan al reemplazar/salir. El laboratorio separado sigue mostrando únicamente ejemplos.

## Reconocimiento del formato y versiones

### Ajuste vigente de segmentación — v3

El ajuste del 14 de octubre conserva los pesos preentrenados y cambia la lectura a `ppocr5-latin-grid8-layout-v3`: usa cajas de palabras alineadas por el reconocedor, separa los flujos verticales de las dos columnas de cabecera, relee la fecha desde sus píxeles y busca los ocho encabezados después de las filas de controles. Excluye el borde de página de la cuadrícula y vuelve a detectar texto en celdas multilínea ampliadas. No emplea coordenadas de las muestras, nombres esperados, sustituciones de letras por dígitos ni valores precargados.

La API firma las nuevas procedencias con v3; las procedencias v2 ya emitidas conservan su comprobación e idempotencia. Tras cambiar el código, reconstruir únicamente OCR con `podman compose --profile ocr build ocr` y recrearlo con `podman compose --profile ocr up -d --force-recreate ocr`. Reiniciar `npm run dev` para cargar la versión de procedencia en la API. No requiere migraciones, semillas ni reiniciar PostgreSQL.

La captura adjunta sirvió de referencia visual; su PNG/JPEG original no está disponible como archivo local. El diagnóstico reproducible utiliza la nueva plantilla fiel, explícitamente como regresión de desarrollo y no como precisión sobre capturas reales independientes. Para verificar el original, subirlo nuevamente en la pantalla de captura y cotejar los candidatos; no guardar hasta revisarlos. Evidencia y límites en [ORACLE-FORMATO.md](../experiments/purchases/ORACLE-FORMATO.md). La evidencia v2 siguiente se conserva como antecedente.

Verificación local del ajuste: 14 pruebas Python, 10 unitarias del servicio API y los 10 escenarios de reconocimiento de formato con OCR real correctos ([regresión v3](../tests/ocr/layout-evidence-v3.json)); typecheck, lint y build de API correctos. En las ocho capturas fieles de desarrollo pasó de 50 a 118 campos exactos de 164, con 11 valores incorrectos y 35 ausencias todavía. Recupera los ítems de los PNG nativos, pero no los de varias variantes comprimidas/escaladas/gris. Es regresión después de ajustes, no evaluación ciega. No se repitieron integración PostgreSQL ni E2E completos por este cambio de segmentación; no hay cambios de persistencia o interfaz.

### Antecedente — v2

La respuesta real añade `data.captureLayout: {status:"compatible"|"partial",signals:[...]}`. Las señales son `request_title`, `header_fields`, `line_section` y `eight_column_table`. El contrato conserva este campo opcional para ejemplos históricos, pero API y pantalla lo exigen en una extracción real. La versión firmada de esta entrega anterior fue `ppocr5-latin-grid8-layout-v2`; no se añadieron migraciones respecto del adaptador anterior.

Se admite una captura cuando el OCR encuentra título «Solicitud Interna de Compra» y al menos dos etiquetas de cabecera entre Desde/Enviado/ID/Total, o cuando encuentra sección «Líneas de Solicitud» y tabla de ocho columnas. Todas las señales producen `compatible`; cualquier combinación admitida incompleta produce `partial`, conservando faltantes/incidencias. Una imagen ajena al formato devuelve `422 UNSUPPORTED_CAPTURE_LAYOUT`.

Un logo, la palabra Oracle, el color azul o sólo el título no bastan. No se exigen bordes azules: capturas en escala de grises o sin la barra superior pueden funcionar. **Reconocer el formato no autentica una captura ni acredita su origen institucional.**

Regresión con OCR real: `py -3 tests/ocr/check_layout.py`. Incluye captura completa, gris, sin marca, cabecera/tabla recortadas, ausencia de cuadrícula y rechazos de azul/logo/paisaje/título aislados. Los 10 casos coincidieron con la política; [evidencia v2](../tests/ocr/layout-evidence-v2.json). Es una comprobación de formato, no un nuevo porcentaje de exactitud ni una evaluación independiente del cliente. No ejecutar simultáneamente con otra inferencia en el mismo servicio.

### Verificación de la interfaz mínima

Comprobación local del 14 de octubre: **88 unitarias TypeScript, 12 pruebas Python, 94 de integración PostgreSQL/API y 56 recorridos de navegador contra el servidor compilado**, con build, typecheck y lint correctos. Los 56 recorridos incluyen los seis nuevos de captura; uno ejecuta el OCR real, revisión humana, POST explícito y recarga desde PostgreSQL descartable. Los otros cinco usan respuestas simuladas para probar estados y no acreditan procesamiento real. La vista se comprobó en 320, 768, 1024 y 1440 px, sin desbordamiento del documento; selector por teclado, confirmación de descarte y limpieza al cambiar/expirar la sesión cubiertos. Capturas de verificación permanecen en `tmp`, fuera de Git.

Para repetir sólo estos seis recorridos, con OCR iniciado y capturas ficticias generadas, configurar `ACADEMIC_TEST_ADMIN_URL_FILE` hacia PostgreSQL de pruebas, `OCR_URL=http://127.0.0.1:8090`, `CAPTURE_RECEIPT_KEY_FILE` con la ruta absoluta del secreto local y `CENIT_E2E_REAL_OCR=1`; ejecutar `npm run build` y `npm run test:e2e -- tests/e2e/capture.spec.ts`. Sin la última variable, se omite expresamente el ensayo real. No ejecutar dos harness de navegador simultáneos, pues usan el mismo puerto y archivos temporales de credenciales. Actions, revisión/integración, validación institucional y despliegue OCR en VM siguen pendientes.

## Preparación explícita

Requiere Podman iniciado y Node/npm del repositorio. Los dos pesos preentrenados medidos deben estar disponibles localmente; el preparador verifica sus SHA-256 antes de copiarlos. Si faltan, realizar la preparación de pesos descrita en [la investigación](INVESTIGACION-EXTRACCION-COMPRAS.md); no se descargan durante una solicitud.

Desde PowerShell en la raíz:

```powershell
.\deploy\scripts\prepare-ocr.ps1 -ModelsPath tmp/ocr-research/models
podman compose --profile ocr up -d ocr
```

El preparador conserva o crea `.local/secrets/capture-receipt-key` (32 bytes aleatorios). No versionar ni compartir el archivo; cambiarlo invalida comprobantes pendientes. No modifica cuentas, imágenes de aplicación ni la VM. Los pesos se copian al directorio ignorado `apps/ocr/models`; sólo la imagen auxiliar los incluye.

Para desarrollo, añadir al `.env` privado:

```dotenv
OCR_URL=http://127.0.0.1:8090
CAPTURE_RECEIPT_KEY_FILE=.local/secrets/capture-receipt-key
```

Aplicar la migración aditiva `0008_purchase_capture_origin` mediante el procedimiento habitual del migrador, antes de iniciar la API. Después usar `podman compose up -d db` y `npm run dev`. El lanzador lee las dos variables del `.env`; no inicia OCR ni prepara pesos automáticamente.

Para ensayar el conjunto compilado local, usar además `-f compose.yaml -f compose.ocr.yaml --profile application --profile ocr`. El overlay conecta la aplicación con `http://ocr:8090` y monta el secreto sólo en la API. Seguir [ENSAYO-LOCAL](../deploy/ENSAYO-LOCAL.md) para migrar, iniciar y seleccionar el proxy de aplicación. No modifica Quadlets ni CD. Sin configuración/servicio OCR, compras y login siguen disponibles y extracción devuelve `503`.

## HTTP público para Gael

`POST /api/v1/purchases/extractions` exige cookie de sesión administrativa y un Origin exacto autorizado. Cuerpo `multipart/form-data`, un archivo llamado `file`, sin otros campos. No fijar manualmente el boundary desde frontend: usar `FormData`. No se admite URL remota.

- Archivo máximo 5 × 1024 × 1024 bytes; máximo 20.000.000 píxeles, inclusive. El proxy permite 6 MiB de petición exclusivamente aquí para el overhead multipart; no aumenta el tamaño del archivo admitido.
- Comprueba binario PNG/JPEG, dimensiones, decodificación completa y ausencia de animación. Imágenes/bytes sólo permanecen en memoria de la petición/proceso, no se guardan ni registran.
- La respuesta conserva `{data:{extractionId,status:"reviewRequired",input,header,lines,administrative,issues}}` y añade `data.origin` y `data.captureLayout`. Ejecutar `validateExtractionResponse`, además del schema.
- `origin` contiene `type:"image_capture"`, `extractionId`, `processorVersion`, `processedAt` y `receipt`. No construirlo ni modificarlo desde el cliente. La firma liga esos metadatos a la cuenta, no a las correcciones humanas.
- Datos ambiguos permanecen `null` con original/incidencia; los ausentes son `missing`. Estructura no reconocida genera `TABLE_STRUCTURE_UNRECOGNIZED` en `/lines` y conserva la cabecera recuperable. Sin datos recuperables: `422 EXTRACTION_NO_DATA`.
- No deduce situación de pago, componentes de cuenta del cargo ni campos administrativos ausentes. Tampoco exige igualdad de ítems y total. La revisión local no aprueba una compra en Oracle.

Estados: `400` estructura/multipart inválido, `401` sesión, `403` rol/Origin, `413` tamaño, `415` formato, `422` imagen/dimensiones/sin datos, `503` procesador ocupado/ausente/timeout/salida incompatible y `500` fallo inesperado. Todos usan el envelope común y `requestId`, sin trazas. La respuesta es `no-store`.

Inferencia máxima de 60 s desde API (58 s del subproceso); proxy 65 s. Un trabajo simultáneo, sin cola de imágenes. Timeout/cancelación termina el proceso de inferencia; la aplicación no se reinicia. Recursos iniciales del contenedor: 1 CPU/1 GiB. Estos límites requieren medición propia antes de trasladar a la VM.

## Prueba HTTP alternativa

Preparar un JSON de login con correo y contraseña de demo en `.local/login-request.json` (privado, nunca Git). Usar el puerto de API y su Origin autorizado:

```powershell
curl.exe -sS -c .local/ocr.cookies -H "Origin: http://127.0.0.1:3000" -H "Content-Type: application/json" --data-binary "@.local/login-request.json" http://127.0.0.1:3000/api/v1/auth/login
curl.exe -sS -b .local/ocr.cookies -H "Origin: http://127.0.0.1:3000" -F "file=@tmp/ocr-adapter-dev/fixtures/development-clear.png;type=image/png" http://127.0.0.1:3000/api/v1/purchases/extractions -o tmp/capture-result.json
```

Las imágenes ficticias se generan al ejecutar el evaluador siguiente. También puede usarse otra captura **completamente ficticia**, cambiando ruta y MIME. Un ejemplo de contrato no reemplaza el procesamiento real. No compartir cookies ni archivos de login.

Para guardar después de la revisión, el cliente crea una copia con `createReviewDraft(response)`, completa/corrige los cuatro mínimos, valida mediante `validateCreatePurchase` y envía al POST existente un `operationId` estable más `origin: response.data.origin`. La pantalla de captura y el laboratorio comparten `PurchaseReviewEditor`; la transferencia conserva la procedencia firmada y nunca ejecuta un POST automático al extraer.

El comprobante vence a las dos horas para un alta nueva; volver a procesar si venció. Repetir una operación ya guardada permite recuperar su resultado aunque el comprobante haya vencido, siempre con firma/cuenta/contenido compatibles. Cambiar contenido o procedencia con la misma operación devuelve `409`. No se conserva el comprobante en BD: sólo UUID de extracción, versión y fecha, visibles en detalle. La etiqueta es «Captura procesada y revisada»; no acredita fidelidad institucional.

## Verificación reproducible

El generador y evaluador viven en `tests/ocr`; el extractor no importa muestras, nombres esperados ni coordenadas de ese generador. Sólo el evaluador accede a la verdad esperada.

```powershell
py -3 tests/ocr/evaluate.py --split development --output tmp/ocr-adapter-dev
# Congelar fuentes antes de evaluar; no ajustar con el resultado siguiente.
py -3 tests/ocr/evaluate.py --split holdout --output tmp/ocr-adapter-holdout
```

Ejecutar las baterías secuencialmente, sin compartir el único slot OCR con otras pruebas. Resúmenes por campo y resultados completos en `tmp`, fuera de Git. Cambios futuros del extractor requieren nueva evaluación, no ajustar con este holdout. Las variantes siguen siendo sintéticas del mismo generador, no muestras independientes del cliente.

Para integración real API/PostgreSQL, configurar `ACADEMIC_TEST_ADMIN_URL_FILE` hacia un PostgreSQL **descartable**, `OCR_TEST_URL=http://127.0.0.1:8090`, generar primero las capturas de desarrollo y ejecutar `npm run test:integration -- tests/integration/purchases.test.ts`. El harness crea/elimina bases propias; no usa `cenit_demo` para guardar compras de prueba. Sin `OCR_TEST_URL`, la misma suite prueba el protocolo con un procesador simulado; eso no acredita OCR.

Las pruebas de decodificación y mapeo se ejecutan sin red:

```powershell
podman run --rm --network none --cpus 1 --memory 1g -v "${PWD}/tests/ocr:/tests:ro" localhost/cenit-ocr:adapter1 python -m unittest discover -s /tests -v
```

## Evidencia anterior — adaptador v1, 14 de octubre

La evaluación congelada de ocho capturas sintéticas obtuvo **133/144 campos exactos (92,4 %)**; mediana 4,57 s y máximo 6,36 s incluyendo arranque del subproceso/modelo. Hay **3 valores incorrectos no nulos y 8 ausencias**: referencia de anexo, proveedor y centro de costos presentan errores, y la muestra sin cuadrícula conserva la cabecera pero no reconstruye sus ítems. Los 8 totales documentales y 7 precios/importes legibles fueron exactos; el caso sin cuadrícula deja precio/importe ausentes. No interpretar estas cifras como un umbral institucional ni comparar directamente con baterías anteriores de otro formato.

El pico acumulado del contenedor durante desarrollo/evaluación fue aproximadamente 609 MiB (638.697.472 bytes), sin OOM, bajo límite de 1 GiB/1 CPU. No es una medición del runtime Node ni de la VM. [Evidencia versionada por campo, tiempos y hashes](../tests/ocr/evidence.json); imágenes y respuestas completas permanecen en `tmp`.

Pasaron 87 unitarias TypeScript, 11 pruebas Python de imagen/mapeo, 94 de integración PostgreSQL/API, 44 de infraestructura y 50 recorridos de navegador contra el servidor compilado. El ensayo adicional de 21 pruebas de compras con `OCR_TEST_URL` verificó extracción real con sesión, ausencia de escrituras al extraer, corrección humana, firma, persistencia, reintentos concurrentes y expiración. Build completo, typecheck, lint y catálogo pasaron. Imagen Linux/amd64 ensayada mediante el verificador de roles limitados, migración repetible, HTML/readiness, desconexión/recuperación de BD y límites del proxy de extracción. El Compose/overlay y el preparador PowerShell se comprobaron localmente. No atribuir estas mediciones a Actions ni a una instalación en VM.

El job `Application` incorpora las 11 pruebas Python sin pesos/inferencia y mantiene las comprobaciones TypeScript/PostgreSQL/navegador/imagen. La evaluación OCR real sigue siendo explícita y separada; una ejecución de CI sin pesos no acredita su precisión.

Revisión, Actions, integración, criterio institucional de exactitud y ensayo de VM permanecen separados. La pantalla mínima posterior no convierte las métricas anteriores en una garantía institucional ni reemplaza esa revisión.

# HU04-T03 — Contrato de extracción de compras

## Adaptador operativo local — 14 de octubre

El endpoint administrativo `POST /api/v1/purchases/extractions` incorpora procesamiento real con PaddleOCR móvil ONNX en un contenedor auxiliar del notebook. La continuidad autorizada añade «Subir captura», selección/vista previa, extracción y revisión antes del formulario de guardado. Contrato ampliado con `captureLayout`, rechazo `UNSUPPORTED_CAPTURE_LAYOUT` y procedencia firmada `image_capture`. Reconoce estructura, sin acreditar autenticidad ni exigir color azul; admite parciales. Preparación, navegador y HTTP en [ADAPTADOR-CAPTURAS.md](ADAPTADOR-CAPTURAS.md). No modifica Oracle ni guarda al extraer. El laboratorio continúa siendo ficticio. Las notas siguientes sobre ausencia de pantalla/endpoint corresponden a etapas anteriores.

Actualización del 14 de octubre: el equipo confirmó que no habrá acceso/API Oracle. La captura PNG/JPEG es la única vía de esta entrega. Se investigaron OCR ligero con anclas y modelos locales; evidencia y límites en [INVESTIGACION-EXTRACCION-COMPRAS.md](INVESTIGACION-EXTRACCION-COMPRAS.md). Los ensayos son procesamiento real aislado de imágenes ficticias: el laboratorio y la API de aplicación siguen sin extracción activa. SCRUM-45 debe implementar el adaptador, endpoint y procedencia real antes de conectar el frontend de Gael.

## Presentación de la revisión — 14 de octubre

Por petición de Gael, el laboratorio conserva su ruta y un acceso secundario «Revisar ejemplo», con título «Revisar datos» y etiqueta «Ejemplo de demostración». Se retiran avisos extensos de implementación: no cambian origen, candidatos ni límites funcionales. El entorno administrativo conserva «Demostración» en la cabecera.

Los datos principales aparecen primero; complementarios, ítems y seguimiento se despliegan para consultar o corregir. Cada campo conserva estado de fuente, modificación, incidencia y errores; «Revisar original» permite consultar valor/texto originales intactos. Incidencias y resúmenes usan nombres de campos. «Continuar al formulario» transfiere en memoria sin guardar; «Comprobar datos» conserva la validación de formatos del contrato. No se añade subida, procesamiento, OCR ni procedencia real. Los textos anteriores sobre el aviso permanente corresponden al corte previo.

Revisión visual manual de escritorio/móvil y teclado; tests y verificación técnica se posponen hasta la aceptación visual del usuario. No acreditar las comprobaciones anteriores para este nuevo marcado.

## Decisión y recorrido de captura — 13 de octubre

Gael confirmó que el equipo **no tendrá acceso a Oracle**. La recuperación se realizará desde una captura de pantalla de la orden de compra mediante un modelo de visión local o en un equipo propio. Víctor implementa el procesamiento/API; Gael realiza el frontend. Esta decisión sustituye la investigación entre API Oracle e imagen, conservando los campos y límites del contrato actual. La investigación del 14 de octubre recomienda provisionalmente PaddleOCR móvil vía ONNX a partir de capturas ficticias. La capacidad de la VM, el formato completo de Oracle y la exactitud aceptada por el cliente siguen pendientes de comprobación.

El rediseño administrativo conserva el laboratorio ficticio en su ruta actual. No hay subida ni extracción real disponible. La interfaz de captura se conectará cuando Víctor entregue el endpoint y acuerde la procedencia de resultados reales; hoy el guardado sólo admite `manual` y `contract_example`.

### Especificación visual para conectar el procesamiento

| Estado | Presentación y acciones |
| --- | --- |
| Elegir captura | En el marco administrativo, título «Revisar captura», etiqueta «Captura de la orden de compra», selector PNG/JPEG y límites 5 MiB/20 MP. Vista previa con nombre y acción para cambiar imagen; campos aún vacíos |
| Procesar | Acción «Extraer datos»; carga explícita sin porcentaje inventado. Conservar imagen y deshabilitar envío duplicado; no mostrar éxito ni guardar |
| Revisar | Vista previa junto a cabecera/ítems en escritorio, encima en móvil. Cada campo muestra candidato, estado y original; ausencias siguen vacías. Ítems desplegables y una lista de incidencias |
| Parcial | Mantener campos recuperados y mostrar faltantes/ambiguos junto al campo. Permitir corregir; no completar número, proveedor, monto o pago por inferencia |
| Fallo | Mensaje del error público; conservar la captura para reintentar o reemplazar. No presentar un ejemplo precargado como resultado de visión |
| Continuar | «Continuar al formulario de guardado» transfiere una copia revisada en memoria. El formulario exige los cuatro mínimos y guarda sólo mediante POST explícito; volver/cancelar no persiste |

Tema claro y tratamiento de superficies/controles de las referencias Synapse; iconos Phosphor de imagen, extracción, aviso y continuidad con texto visible. Selección de archivo accesible con teclado; no es necesario añadir drag-and-drop. El borrador pertenece a la cuenta actual y se descarta al cerrar/expirar/cambiar sesión. La imagen temporal debe descartarse conforme al contrato, sin publicarla ni almacenarla como anexo.

Para Víctor: usar la respuesta de candidatos existente y validar tanto schema como coherencia. Puede evaluar visión local con salida JSON Schema (por ejemplo, [Ollama](https://docs.ollama.com/capabilities/structured-outputs)); JSON válido no acredita lectura correcta. Probar capturas ficticias legibles, recortadas, con varios ítems, campos ausentes y valores ambiguos. No cargar inferencia dentro del runtime de 512 MiB sin medir capacidad. La integración real queda en SCRUM-41/45; el mockup/laboratorio no completa extracción.

Fecha: 12 de octubre de 2026. Estado: contrato y laboratorio de ejemplos implementados; extracción real, revisión independiente e integración pendientes.

## Qué existe y cómo probarlo

Los contratos TypeBox están en `packages/contracts/src/purchases`; se consumen desde `@cenit/contracts/purchases` y sus fixtures desde `@cenit/contracts/purchases/examples`. La API compila estos contratos, pero **no registra un endpoint de extracción**. No hay OCR, subida de archivos ni conexión Oracle. El guardado manual y la validación local posteriores se documentan en [COMPRAS.md](COMPRAS.md); no forman parte de extracción.

Preparar el entorno como indica README, ejecutar `podman compose up -d db` y `npm run dev`, abrir `/login` e ingresar con la cuenta administrativa. El login lleva al Home `/administracion`. Abrir «Sistema de compra» en el navbar para llegar a `/administracion/compras`, y abrir el laboratorio `/administracion/compras/laboratorio`, donde se muestran ejemplos ficticios de contrato; elegir uno, editar campos, validar o restablecer. El aviso permanente distingue estos fixtures de una extracción real. Los docentes/estudiantes mantienen su destino académico.

Los valores originales no cambian: las ediciones viven en un borrador separado, sólo en memoria. Vaciar un campo produce `null`; la interfaz marca modificaciones manuales. La validación comprueba estructura/formato, no integridad de una compra ni precisión de OCR. No hay botón de guardar. Al cerrar/expirar, cambiar de cuenta, abandonar el área protegida o recargar, se descarta el borrador. Recuperar foco vuelve a comprobar la sesión y puede desmontar la pantalla: también descarta el borrador. Esta conducta sólo corresponde al laboratorio ficticio, no resuelve la política futura de borradores de compras reales.

## Entrada futura acordada

`POST /api/v1/purchases/extractions`, administrativo autenticado y Origin autorizado, con `multipart/form-data` y un único campo `file`. PNG/JPEG, máximo 5 MiB (5 × 1024 × 1024 bytes) y 20 millones de píxeles. Sin PDF, lotes, URL remota ni procesamiento externo. Imagen temporal descartada después de procesarla.

`ExtractionInputMetadataSchema` valida nombre (1–255 caracteres), MIME, bytes, ancho y alto positivos. **Además del schema se debe ejecutar `validateInputMetadata`** para comprobar ancho × alto. JSON Schema no expresa ese producto con los keywords estándar usados aquí. MIME, extensión y dimensiones declaradas no acreditan un archivo: la futura implementación comprobará el binario real. No se amplía el límite JSON global de 128 KiB ni se instala multipart/OCR en esta entrega.

## Modelo candidato

Una solicitud completa contiene cabecera, 0–100 líneas y seguimiento administrativo. Varias líneas/proveedores permanecen separados, aunque la tabla futura tenga una fila por solicitud.

| Grupo | Propiedades públicas |
| --- | --- |
| Cabecera | `requestNumber`, `oracleId`, `sender`, `recipient`, `sentDate`, `sentTime`, `description`, `totalAmount`, `taxAmount`, `attachmentReference` |
| Línea | `description`, `provider`, `costCenter`, `lineUnit`, `quantity`, `price`, `amount`, `chargeAccount`, `universityCode`, `campusCode`, `unitCode`, `projectCode`, `accountingCode` |
| Seguimiento | `document`, `documentType`, `bi`, `rut`, `unitName`, `item`, `paymentSituation` |

Cada campo es `{status,value,rawText}`. `recovered` exige valor textual válido; `missing` exige ambos valores `null`; `invalid` y `ambiguous` mantienen el valor candidato `null`, permiten conservar texto fuente y requieren una incidencia. Texto fuente desconocido es `null`, nunca inventado. Un texto fuente que exceda el límite se omite con incidencia `FIELD_LIMIT_EXCEEDED`; no se corta para aparentar información completa. Exceso de líneas se informa con `LINE_LIMIT_EXCEEDED` sobre `/lines`, sin crear líneas adicionales ni atribuir precisión suficiente.

La respuesta es `{data:{extractionId,status:"reviewRequired",input,header,lines,administrative,issues}}`. Las incidencias usan `{path,code,message}`; las rutas apuntan a `/header/...`, `/lines/0/...`, `/administrative/...` o `/lines`, relativas a `data`. Los códigos son `MISSING_FIELD`, `INVALID_VALUE`, `AMBIGUOUS_VALUE`, `FIELD_LIMIT_EXCEEDED`, `LINE_LIMIT_EXCEEDED`. Se admiten hasta 2.000 incidencias. Ausencias son visibles por campo aunque no todas produzcan una incidencia.

Se debe validar con **`validateExtractionResponse`**, que añade coherencia de incidencias, calendario y megapíxeles al schema estructural. Los drafts se validan mediante `ExtractionReviewDraftSchema` y **`validateReviewDraft`** (calendario real). No usar sólo comprobación de tipos TypeScript. Los objetos rechazan propiedades desconocidas.

Todos los valores son texto o `null`. Los identificadores/códigos conservan ceros, puntuación y estructura. Fecha `YYYY-MM-DD` y hora local `HH:mm:ss` separadas; sin convertir a UTC por una zona institucional supuesta. Montos: cadenas canónicas de dígitos, cero admitido, sin signo, separadores ni redondeo. Cantidad y unidad de línea son texto sin interpretación institucional. Máximo 1.000 caracteres para descripción y 255 para otros textos, incluido texto fuente; no se acepta texto compuesto sólo por espacios. La fecha/hora normalizadas tienen su formato específico. Estos límites son de demo, no requisitos institucionales.

No se exige suma, proveedor obligatorio, pago, RUT válido ni catálogos administrativos para acreditar este contrato de extracción. Esas reglas corresponden a la futura persistencia o a validación del cliente. No se incluyen porcentajes de confianza, imágenes ni enlaces de descarga de anexos. `attachmentReference` es sólo texto fuente; no se interpreta como URL accesible.

## Errores futuros

Ejemplos validables con el envelope común `{error:{code,message,requestId}}`, sin trazas internas:

| HTTP | Código |
| --- | --- |
| 400 | `VALIDATION_ERROR` |
| 401 | `AUTHENTICATION_REQUIRED` |
| 403 | `FORBIDDEN` (rol u Origin) |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `INVALID_IMAGE`, `IMAGE_DIMENSIONS_EXCEEDED`, `EXTRACTION_NO_DATA` |
| 503 | `EXTRACTION_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` |

Un candidato parcial sigue requiriendo revisión: no es un error HTTP por tener campos ausentes. No se define un porcentaje mínimo de precisión. Los tiempos y la herramienta se decidirán con la implementación de extracción.

## Fuentes, decisiones y pendientes

Referencia: `Docs/modulo_compras/CENIT COMPRAS.pdf` y cabecera/captura aportadas por Víctor. Las fixtures contienen nombres/IDs ficticios independientes de la captura real. Los códigos del ejemplo son demostrativos, no catálogos institucionales.

Confirmado por el líder: una fila representa una solicitud completa; fecha corresponde a Enviado; códigos y campos inciertos se conservan como texto. Correspondencia Nº Documento ↔ número del título todavía provisional; conservar `oracleId` por separado. El remitente no sustituye al proveedor y la aprobación no implica pago. `lineUnit` no equivale a `unitCode`.

Pendientes: significado de `bi`, ITEM, titular del RUT y situación de pago; fuente de los campos administrativos; herramienta OCR, tiempos, muestras autorizadas y evaluación de extracción. No inferir `SISTEMA DE COMPRA`, HONORARIOS/COTIZACIÓN o pago cuando la muestra no lo aporta. La API Oracle no está integrada.

## Evidencia

Comandos: `npm run test:unit`, `npm run typecheck`, `npm run build:academic`, `npm run build:web`, `npm run test:e2e:auth`. Los recorridos usan la base PostgreSQL descartable del harness existente, no cargan compras ni alteran cuentas de demo. La tarea sigue pendiente de revisión/merge; la HU04 sigue pendiente de procesamiento real. Resultados locales se registran al finalizar; Actions requiere push del usuario.

Verificación local final: **45 unitarias, 21 recorridos Playwright y 44 pruebas de infraestructura exitosos**, typecheck y builds de contratos/API/frontend correctos, `git diff --check` sin errores. Revisión visual realizada en 1280 y 375 píxeles, sin desbordamiento horizontal y con etiquetas/foco de teclado. Los recorridos de reloj simulan expiración del cliente; las pruebas existentes de API cubren expiración real del servidor. No se ejecutaron migraciones sobre la base de demo; el harness de navegador sólo prepara su base descartable. No se creó PR ni se realizó merge.

## Navegación administrativa

Home (`/administracion`) es el dashboard central. Navbar: Home, Sistema de compra (`/administracion/compras`), Sistema de personal (`/administracion/personal`) y Sistema de bienes (`/administracion/bienes`). Personal/bienes contienen únicamente «En construcción», por petición explícita del líder; no implementan procesos ni amplían el MVP funcional. Docentes/estudiantes conservan acceso exclusivamente académico.

«Ítem de la solicitud 1/2» representa una línea de producto/servicio dentro de la misma solicitud; el ejemplo ficticio contiene dos proveedores. No son solicitudes separadas. Los schemas creados son contratos TypeBox de candidatos/draft, no tablas PostgreSQL. Salir del sistema de compra hacia otra sección descarta su borrador de ejemplos.

Verificación de navegación del 13 de octubre: typecheck y build web correctos, 22 recorridos completos de navegador exitosos. Tras ajustar el navbar móvil a dos columnas se reconstruyó y se repitieron las dos comprobaciones de dashboard/formulario responsive. Se conserva la tipografía del login existente; el detector de diseño sólo señaló esa familia tipográfica como advertencia estética, no un fallo funcional. No hay migraciones nuevas ni cambio de API.

### Home administrativo: propuesta de seguimiento (13 de octubre)

`/administracion` muestra un dashboard ilustrativo: ocho solicitudes ficticias, cinco pendientes de aprobación de Luis Lanas, monto pendiente de $1.510.000 CLP, distribución de pendientes por fecha de envío y tabla de esas cinco solicitudes. KPIs, gráfico y tabla se derivan de una misma muestra local en `features/administration/model/dashboard-demo.ts`; no consumen Oracle ni el contrato de extracción y no se guardan en PostgreSQL.

El usuario autorizó este prototipo para validarlo con el cliente. La captura de Oracle muestra una acción pendiente de Luis Lanas, pero no confirma que estos indicadores sean un requisito institucional. La pantalla advierte que los datos son ficticios y que las aprobaciones ocurren en Oracle. No implementa aprobación en Cenit, sincronización de estados ni situación de pago; el monto pendiente no representa pagos realizados. La validación del cliente y el mecanismo para recuperar estos estados siguen pendientes.

Verificación local del dashboard: typecheck y build web correctos; revisión visual en 1280 y 375 px, sin desbordamiento horizontal de la página. Suite de navegador: 21/22 pasaron en la primera ejecución; una comprobación del nuevo Home había quedado por error en el test de logout de compras. Tras moverla al recorrido administrativo, los dos tests afectados pasaron (logout/cambio de cuenta y dashboard/navegación). Quedan verificados los 22 recorridos entre ambas ejecuciones; Actions se acreditará después del push. Los checks del Home comprueban 8 solicitudes, 5 pendientes, $1.510.000 CLP, cinco filas y cantidades diarias coherentes, además de aislamiento por rol y ausencia de acción de aprobación.

Actualización de navegación: el laboratorio vive exclusivamente en /administracion/compras/laboratorio. Sistema de compra contiene los registros persistentes y Home ya no incluye la tabla. La tabla/gráfico descritos en la evidencia anterior son históricos; el Home actual conserva sólo los indicadores y el gráfico ficticios.

## Transferencia explícita a HU05

El laboratorio permite «Continuar al formulario de guardado» con un borrador de formatos válidos, aunque tenga ausencias. Transfiere una copia de valores corregidos en memoria, asociada a la cuenta, consumida una vez; nunca ejecuta POST ni usa almacenamiento o historial del navegador. Los candidatos originales quedan intactos. El ejemplo de fallo y estructuras inválidas no permiten continuar.

El formulario posterior completa los cuatro campos obligatorios y guarda sólo tras confirmación del servidor. Conserva `operationId` y procedencia ante errores. La copia persistida muestra `source: contract_example` y el ID `recovered`, `partial` o `ambiguous` en lista/detalle; nunca se etiqueta como extracción real. Logout/expiración/cambio de cuenta descartan borradores. El ingreso manual independiente sigue vacío. Ver [COMPRAS.md](COMPRAS.md) para contratos, migración y evidencia de reinicio real. Esto completa la integración de ejemplos con HU05, no el procesamiento automático de HU04.

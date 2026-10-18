# Solicitudes de compra persistentes y validación local

## Inicio conectado con el listado — 17 de octubre

Gael reportó que Inicio mostraba pendientes y montos mientras el listado de Azure estaba vacío. La pantalla todavía usaba ocho registros fijos de diseño. Se retira esa muestra y se añade GET /api/v1/purchases/summary, exclusivo de sesión administrativa. No escribe datos ni conecta Oracle.

El contrato devuelve data.totalCount, pendingCount, currency=CLP, pendingAmount como texto entero exacto y pendingByDate con fecha/cantidad. Resume todas las cabeceras persistidas, sin filtros ni joins con ítems; dos consultas comparten una transacción de sólo lectura con snapshot repetible. Una base vacía devuelve cero y ninguna fecha.

Inicio valida la respuesta con el contrato compartido y reutiliza la clave de consultas de compras: crear o validar invalida también el resumen. Volver a Inicio vuelve a consultar. Carga, error/reintento y ausencia de pendientes tienen estados propios, sin sustituir fallos por cifras ficticias ni convertir montos a Number. El listado conserva sus filtros explícitos.

Esta corrección no añade eliminación ni cambia migraciones. Las notas inferiores sobre la muestra independiente describen versiones anteriores.

Pulido autorizado del 14 de octubre en `fix/ux-flujos-y-movimiento`: Cancelar vuelve directamente si el formulario está vacío o los cambios se revirtieron; con contenido/ítems, confirma descarte. Navegación interna, atrás y logout comparten un guard, sin interceptar globalmente clics. Escape conserva datos y devuelve el foco. Mientras el servidor confirma un guardado, las salidas voluntarias quedan bloqueadas; recargar/cerrar conserva el aviso nativo. Cambiar/restablecer ejemplos confirma descarte de correcciones. Cancelar o transferir no hace POST; los reintentos conservan operación/procedencia.

Fecha de envío y filtros usan Calendar/Popover (Radix y DayPicker, composición seleccionada de shadcn), español y entrada `dd/MM/aaaa`, con API `YYYY-MM-DD` sin convertir a UTC. Filtros aplicados y páginas independientes viven en la URL; detalle/alta/laboratorio reciben el destino de retorno. Aplicar/Limpiar reinician ambas páginas. Sonner confirma guardado/validación después del servidor; errores y problemas que requieren acción siguen visibles. Borradores se recuperan tras fallos temporales de sesión para la misma cuenta; logout/expiración siguen descartándolos. Home continúa como resumen ficticio independiente y habla de revisión. Evidencia y pendientes en [revisión de UX](REVISION-UX-2026-10-14.md).

## Confirmaciones contextuales, marco y filtros — segunda iteración del 14 de octubre

Continúa en `fix/ux-flujos-y-movimiento`, PR #15 contra `develop`, sincronizado con `414eac9` que incorpora la captura ya integrada por PR #16. Se conservan el formulario, borradores, filtros y confirmaciones del pulido UX junto a la captura procesada, revisión y procedencia que ya forman parte de `develop`. Este pulido no modificó la VM, Jira/Drive, contratos, migraciones ni la sesión fija de dos horas; el equipo conserva la creación y revisión del PR.

«Validar registro» identifica el número de la solicitud en una tarjeta de hasta 340 px junto a su botón, con preferencia superior y alternativa inferior. Radix Popover 1.3.1 modal aporta posicionamiento, foco y bloqueo de scroll; dos Portals componen por separado tarjeta y velo `#252a361f`, sin blur de fondo. El área administrativa queda además `inert`. Nombre/descripción, `alertdialog` y `aria-modal` reflejan ese bloqueo. Cancelar recibe foco inicial; Escape/clic exterior cancelan. Durante el POST aparece «Validando…», no se puede cerrar ni repetir. ID/versión se capturan al abrir, errores/conflictos permanecen inline y sólo hay éxito tras respuesta válida. Retirar el ancla cancela sin POST; al desaparecer la fila/acción el foco vuelve a la sección correspondiente. La salida de 150 ms mantiene bloqueo y desactiva acciones; tras éxito se conserva la fila/ancla hasta completar ese cierre antes de refrescar listas, con el disparador ocupado deshabilitado; reabrir interrumpe el cierre. Invalidar sesión desmonta inmediatamente e ignora éxitos tardíos de otra identidad.

La guarda única reutiliza la tarjeta para restablecer/cambiar ejemplos, Cancelar con datos y salidas/logout con borrador. Cada control entrega su origen explícitamente, sin interceptar clics globalmente. Atrás y controles fuera de vista usan la ubicación de la cabecera, visible y enfocable. Vacío/revertido y logout sin borrador siguen directamente. Calendario conserva su popover habitual; errores inline, éxito Sonner y panel académico de lectura se mantienen.

En escritorio de más de 760 px y más de 560 px de altura, el marco administrativo ocupa la ventana con toolbar/sidebar estables y un solo scroll vertical de contenido. Las tablas mantienen scroll horizontal. El contenido posiciona sus descendientes absolutos para que las etiquetas accesibles de tablas no expandan el documento. Cambiar ruta reinicia contenido/documento y enfoca el destino; filtros/páginas en URL permanecen. Móvil/poca altura conservan scroll natural y toolbar sticky; los campos tienen margen de desplazamiento para evitar quedar bajo ella. Un ajuste de foco limitado al contenido revela únicamente controles que queden recortados después del desplazamiento nativo, incluido WebKit móvil; ignora portales y controles ya visibles.

Filtros muestran ayuda inicial y «Cambios por aplicar» sin consultar. Aplicar vacío o los mismos valores (búsqueda recortada, códigos exactos) en ambas páginas 1 muestra un estado neutral sin URL/historial/consulta nuevos. Borrar filtros antes aplicados permite consultar todo; reaplicar desde páginas posteriores reinicia ambas. Limpiar tampoco duplica historial cuando no cambia nada. Fechas/códigos inválidos conservan su validación/foco; los errores de servidor mantienen Reintentar. No hay filtros obligatorios nuevos. La navegación frecuente usa opacidad de 150 ms, sin blur de página; color se limita a revisión, borradores, filtros y mensajes, con controles/cuerpo blanco y acciones carbón.

La verificación consolidada de esta iteración está en [REVISION-UX-2026-10-14.md](REVISION-UX-2026-10-14.md). Implementación y evidencia local/CI no acreditan aceptación, integración ni despliegue.
## Procedencia de capturas — 14 de octubre

El alta admite ahora `origin.type=image_capture`, con referencia de extracción, versión, fecha y comprobante firmado ligado a la cuenta. El comprobante sólo acredita procesamiento y admite correcciones humanas; no representa aprobación Oracle. BD conserva `source`, `extraction_id`, `processor_version` y `processed_at`, nunca imagen, OCR completo ni firma. Migración aditiva `0008_purchase_capture_origin`; procedencias anteriores y hashes manuales/de ejemplos intactos. La validez de dos horas se exige para altas nuevas, conservando reintentos de operaciones ya guardadas. Listado/detalle identifican «Captura procesada y revisada». Preparación y contrato en [ADAPTADOR-CAPTURAS.md](ADAPTADOR-CAPTURAS.md). La pantalla mínima de captura conecta selección, OCR y revisión; extraer o continuar no crea registros, sólo el guardado explícito.

## Pulido administrativo — 14 de octubre

Gael autorizó retirar los avisos repetidos de prototipo, muestra ilustrativa y preparación interna. El entorno se identifica con «Demostración» en la cabecera; la procedencia ficticia se conserva mediante etiquetas breves de ejemplo. El Home mantiene su muestra local y sus cálculos, sin acreditar conexión Oracle ni seguimiento institucional. Personal/bienes conservan sus rutas con «Módulo no disponible» y retorno a Inicio.

Se mantienen sidebar de 220 px, margen de 16 px, tema claro y Phosphor. Controles principales de 36 px, superficies suaves, hover sólo con puntero compatible y presión a 0.96/150 ms condicionada a la preferencia de movimiento. Las migas y el título del navegador identifican la página. Filtros comunes con aplicación explícita: búsqueda/fechas visibles, unidad/proyecto bajo «Más filtros» y apertura/foco ante errores; totales y páginas independientes por tabla. Formulario con los cuatro mínimos primero, fecha/hora nativas canónicas, complementarios/seguimiento recogidos y apertura de ítems nuevos/secciones inválidas. El detalle destaca número, estado y monto; todos los campos siguen consultables. La revisión ofrece estados, incidencias y «Revisar original». Los resúmenes de error usan nombres de campos.

Se conservan API, contratos, base de datos, permisos, origen, montos exactos, confirmación de revisión local y protección de borradores. No hay extracción real, aprobación Oracle, edición de registros guardados ni nuevos módulos funcionales.

**Verificación de esta etapa:** revisión manual de navegador y capturas en 1280/1440/1920 y 390 px, incluyendo teclado, foco, desplegables, formulario vacío y candidatos ambiguos. La base local estaba vacía; detalle y filas con contenido se inspeccionaron con los mismos componentes y fixtures en memoria desde una vista temporal privada, retirada al finalizar. No se guardaron solicitudes. No se ejecutaron tests, suites, lint, typecheck ni build. La aceptación visual de Gael y las verificaciones posteriores siguen pendientes; la evidencia del 13 de octubre no acredita este pulido. Cobertura y capturas en `.local/cenit-review/ADMIN_POLISH_REVIEW_2026-10-14.md`.

### Densidad y contraste con las fuentes — 14 de octubre

Gael confirmó conservar la tabla resumida y consultar el resto en el detalle. Los KPIs reducen su altura natural de unos 156 a 117 px en escritorio (113 px en móvil): padding de 16 px, cifras de 26 px y menor separación entre etiqueta, cifra y nota. El gráfico usa padding de 20 px, filas separadas por 14 px y una columna introductoria de hasta 260 px. La jerarquía mantiene títulos de página de 22/20 px, secciones de 15 px, etiquetas/acciones de 13 px y metadatos de 12 px; los controles principales conservan 36 px. La sidebar descuenta también los dos bordes del marco para evitar desplazamiento vertical de una página que cabe en la ventana.

Se cotejaron en lectura las 15 columnas de la planilla aportada y la captura Oracle. Todas tienen un campo disponible en el modelo y en las secciones del formulario/detalle; esto acredita cobertura de campos, no extracción automática ni equivalencia institucional confirmada. La correspondencia Nº Documento ↔ número de solicitud sigue provisional, con ID Oracle separado. Proveedor y códigos pertenecen a cada ítem; descripción general e individual, total documental e importe de ítem, código/nombre de unidad y unidad de línea permanecen distintos. Los códigos conservan ceros y espacios interiores. RUT, ITEM y situación de pago vacíos en la muestra no se completan; el significado de BI y los demás pendientes se conserva.

La captura contiene secuencia de aprobación, acciones, fechas y notas que Cenit no registra; la aprobación continúa en Oracle y la revisión local no representa pago. Los anexos son una referencia textual. La etiqueta de impuesto es genérica y no distingue categorías tributarias. Home conserva datos ficticios independientes de la planilla y del listado persistido. No se importaron ni versionaron registros reales, ni se ampliaron contratos o permisos por este cotejo.

**Verificación de esta iteración:** inspección manual de Inicio en 1280/1440/1920/390 px; formulario, revisión, detalle y tabla con contenido en escritorio y 390 px, con foco y apertura mediante teclado. Detalle y filas usan fixtures ficticias en memoria en una vista temporal privada, retirada al finalizar; no se guardaron solicitudes. No se ejecutaron tests, suites, lint, typecheck ni build. La aprobación visual y las verificaciones técnicas siguen pendientes. Correspondencia por columna y límites en `.local/cenit-review/ADMIN_DENSITY_SOURCE_REVIEW_2026-10-14.md`.

## Datos persistentes de demostración — 14 de octubre

Gael autorizó preparar datos ficticios para probar compras, equivalentes a la preparación explícita de perfiles académicos. Los ejemplos del laboratorio viven en memoria y las pruebas automatizadas usan bases descartables: ninguno llenaba el listado de la demo local. `db/seeds/purchases-demo.ts` y `purchases:prepare-demo` añaden esa preparación persistente.

Con PostgreSQL migrado y la cuenta administrativa original existente:

```bash
APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run purchases:prepare-demo
```

En PowerShell, establecer ambas variables como en la preparación académica y ejecutar `npm run purchases:prepare-demo`. El CLI exige `127.0.0.1`, rol `cenit_migrator`, base `cenit_demo` y coincidencia de la cuenta privada administrativa activa; no crea cuentas ni imprime claves. Prepara `DEMO-COMPRA-001` a `008`, inicialmente cinco pendientes y tres validadas localmente, con uno/dos ítems, proveedores ficticios, dos códigos de unidad y proyectos con ceros/espacios para revisar filtros. BI, RUT, ITEM y pago desconocidos siguen vacíos. Los registros se identifican como ejemplos de demostración; no se copiaron datos reales del Excel o de Oracle.

La carga reutiliza `PurchaseService`/`PurchaseRepository`, validación de contratos, transacciones por solicitud e idempotencia por cuenta/operación estable. Repetir conserva IDs, contenido, revisión posterior, primer revisor, fechas y versión; no restablece pendientes que el usuario haya validado. Un contenido incompatible se rechaza sin sobrescribirlo. Cada alta y cada revisión son transacciones propias; si una carga se interrumpe, repetir completa las operaciones pendientes sin duplicarlas. Nunca corre desde `npm run dev`, migraciones o CD.

Los estados son de revisión de datos en Cenit, distintos de aprobación o pago. Los indicadores del Home conservan su muestra independiente y no se convierten en consultas reales mediante esta carga. La extracción mediante visión sigue pendiente. Las pruebas de esta preparación usan exclusivamente bases descartables.

### Verificación después de la revisión visual

Node 24.21.0/npm 11.19.0. Tipos, lint, catálogo (52 asignaturas), build del monolito, 77 unitarias, 93 integración PostgreSQL/API y 44 infraestructura correctos. Los 50 recorridos de producción quedan verificados entre la última ejecución general (48 correctos) y la repetición exitosa de los dos afectados. Se actualizaron nombres, foco, originales consultables y apertura de secciones sin retirar las comprobaciones de guardado, idempotencia, procedencia, errores, permisos y borradores. Las incidencias de la primera pasada se debían a referencias de pruebas a la interfaz anterior; se corrigieron también una tecla renombrada durante la actualización y selectores ambiguos de detalle. No requirieron cambios funcionales de producto.

Imagen local Linux/amd64 construida y verificada: metadata, roles limitados, migrador repetible, HTML/readiness, límites de Nginx y recuperación de PostgreSQL. Se conserva el adaptador privado del ensayo anterior para Docker Desktop: copia insumos idénticos a los contenedores descartables y ejecuta todas las aserciones del verificador original. La etiqueta de imagen identifica el candidato local basado en HEAD previo al commit; no es una entrega publicada. El build conserva el aviso no bloqueante de bundle web superior a 500 KiB.

La preparación se ejecutó explícitamente dos veces en la demo local: primera carga, ocho nuevas; segunda, cero nuevas y ocho conservadas. Resultado: cinco pendientes ($1.510.000) y tres validadas ($285.000). Se conservan cinco cuentas, tres perfiles académicos y 56 intentos. Listado y detalle reales inspeccionados en navegador, sin cargar los datos del Excel ni de la captura. Capturas privadas `compras-demo-persistentes-2026-10-14.jpg` y `detalle-demo-persistente-2026-10-14.jpg` en `.local/cenit-review/screenshots/`.

Revisión independiente, CI remoto e integración siguen pendientes; no se creó PR, hizo merge ni modificó la VM o la publicación. Las cuentas/datos locales no forman parte del commit; sólo la preparación ficticia reproducible.

## Rediseño administrativo — 13 de octubre

Gael autorizó continuar en la rama existente `feat/modulo_de_compra`, sincronizada mediante avance directo con `develop` `aa4878a`. La base funcional de compras de Víctor ya está integrada por PR #10/#11; el CI de develop incluye `Application` y terminó correctamente. El rediseño está implementado y verificado localmente; sigue pendiente de revisión visual del usuario, commit/push, CI remoto y revisión/integración del equipo.

El marco administrativo usa sidebar clara, cuenta/salida al pie y navegación recogible en móvil, con Phosphor `regular`/`fill` según selección. Home conserva únicamente indicadores y gráfico ficticios; personal/bienes siguen en construcción. El listado conserva dos grupos visibles, filtros comunes, paginación independiente y total documental exacto, ahora formateado como CLP sin convertir a Number. Alta y detalle agrupan cabecera, ítems desplegables, seguimiento y procedencia. Los cuatro campos obligatorios aparecen primero; los errores abren el ítem correspondiente y enfocan el primer campo inválido. Claves visuales estables conservan el estado de los ítems al eliminar otro.

No se modifican API, contratos, migraciones, permisos, idempotencia ni reglas de guardado/validación. Se conservan borradores y avisos de salida. Los montos del documento permanecen independientes de la suma de ítems.

La vía de recuperación elegida es captura de pantalla con visión local a cargo de Víctor, sin acceso a Oracle. El laboratorio conserva ejemplos claramente identificados. Recorrido y dependencia de procedencia real en [EXTRACCION-COMPRAS.md](EXTRACCION-COMPRAS.md#decisión-y-recorrido-de-captura--13-de-octubre).


### Evidencia final del rediseño

- Node 24.21.0/npm 11.19.0; tipos, lint, catálogo y build del monolito correctos. 77 unitarias, 90 integración PostgreSQL y 44 infraestructura exitosas.
- 50 escenarios Chromium contra el runtime de producción verificados entre la ejecución completa (47 correctos) y las repeticiones de los afectados. Se restauró el nombre accesible del grupo de ítems del laboratorio y se actualizaron espera de navegación móvil y selector de procedencia; las garantías de origen/reintento/guardado se conservan. Tres escenarios adicionales en WebKit instalado correctos; el de ítems se repitió tras ampliar la cobertura de montos máximos.
- Se comprobó que 255 dígitos se conservan al guardar/consultar y no desbordan formulario, detalle o total del listado móvil. La unidad de presentación comprueba también valores superiores a la precisión de Number y borradores inválidos sin caída de render.
- Capturas y revisión visual en 1280/1440/1920/390; navegación, foco, errores y estados preservados. Los datos de QA viven en bases descartables; no se agregaron solicitudes a cenit_demo para las pruebas. Reflow adicional del listado en 640 y 320 CSS px sin desbordamiento, equivalente a reducir el espacio disponible al ampliar; no se acredita zoom nativo, pantallas físicas del usuario ni Safari real.
- Imagen local Linux/amd64 `cenit-purchases-ui:local` compilada y verificada: roles limitados, migración repetible, HTML/readiness, límites de Nginx y desconexión/recuperación de PostgreSQL. Docker Desktop rechazó ejecutar el inicializador ligado desde el host; el ensayo final copió los mismos insumos a su contenedor descartable, comprobando igualdad byte a byte y conservando todas las aserciones del verificador. La adaptación es privada de QA: no modifica scripts de deploy, runtime ni el flujo de CI. La etiqueta de revisión es la base aa4878a, no un commit del rediseño ni una entrega publicada.
- Jira: SCRUM-31/49/55/57/60/62 en revisión; 31/46/57/62 reasignadas a Gael. La autoría/estado de SCRUM-52 y los responsables de backend/QA/entrega se conservan. Se actualizó alcance de captura y criterios históricos sin cerrar historias automáticamente.

No se añadieron dependencias ni se cambiaron API, migraciones, cuentas, política de sesión o CD. La visión local y procedencia de captura real permanecen con Víctor. Los apartados siguientes conservan evidencia histórica de cortes anteriores.

Implementación autorizada por Víctor el 13 de octubre de 2026. Conserva copias manuales y borradores revisados del laboratorio de ejemplos ficticios, identificando su procedencia. No crea compras, no aprueba solicitudes en Oracle, no implementa OCR ni acredita la historia de recuperación automática. Estado: implementación local; revisión/integración y Actions pendientes.

## Pantallas y reglas acordadas

- Home `/administracion`: sólo indicadores/gráfico ficticios. No contiene tabla ni acciones sobre solicitudes.
- `/administracion/compras`: listados reales «Pendientes de validación» y «Registros validados», paginación independiente de 20 registros; número, fecha, detalle y tipo de documento.
- `/administracion/compras/nueva`: ingreso manual vacío; número, fecha de envío, descripción general y monto total obligatorios. Todos los demás campos opcionales se envían explícitamente como `null` cuando faltan.
- `/administracion/compras/:id`: todos los campos, ítems y procedencia; muestra quién creó y validó la copia.
- `/administracion/compras/laboratorio`: ejemplos de candidatos, sin procesamiento ni guardado automático; «Continuar al formulario de guardado» transfiere una copia revisada sin ejecutar POST.

Cualquier administrativo puede consultar y validar copias, incluidas las propias; docentes y estudiantes no acceden. «Validar registro» requiere confirmación, registra al revisor de la primera validación y nunca modifica Oracle o la situación de pago. No hay edición ni eliminación de registros guardados.

El formulario manual conserva datos ante errores y ante revalidación de sesión válida al recuperar foco. Navegación interna, atrás, cierre de pestaña y logout avisan cuando hay modificaciones sin guardar. Cerrar/expirar la sesión descarta el borrador, sin guardado automático ni almacenamiento persistente. Revalidación fallida oculta el contenido; las respuestas protegidas `401` también invalidan la interfaz. Las sesiones mantienen dos horas fijas.

## Fuentes y modelo PostgreSQL

`CENIT COMPRAS.pdf`, §3.1.4, y la captura aportada enumeran información general y detalle de productos/servicios. Cada fila de detalle mantiene descripción, proveedor, centro de costos, unidad, cantidad, precio, importe y cuenta del cargo. Una solicitud tiene una cabecera y 0–100 ítems, presentados en una tabla de filas agregables; dos ítems no son dos solicitudes. Los componentes textuales de cuenta también se conservan por ítem. La diferencia institucional entre descripciones y el significado de unidad siguen pendientes.

Drizzle: `db/schema/purchases.ts`; migraciones aditivas `0003_purchase_requests.sql`, `0004_purchase_finite_amounts.sql` y `0005_purchase_example_origin.sql`, posteriores a cuentas y catálogo, con snapshots y journal. La segunda rechaza `NaN`; la tercera añade `example_id` y amplía el origen sin modificar filas ni hashes anteriores. Dos tablas en `cenit`:

| Tabla | Contenido |
| --- | --- |
| `purchase_requests` | UUID interno; número documental y Oracle ID separados; remitente/destinatario, fecha/hora de envío, descripción, total/impuesto, referencia textual de anexos; documento, tipo, bi, RUT, nombre de unidad, ITEM, situación de pago; origen manual/ejemplo e ID de ejemplo; revisión local; versión; creador/fecha; revisor/fecha; operación de creación y hash interno |
| `purchase_request_lines` | UUID, FK de solicitud y posición única 1–100; descripción/proveedor, centro de costos, unidad/cantidad, precio/importe, cuenta y componentes universidad/sede/unidad/proyecto/contable |

FKs hacia `cenit.accounts`; no cuentas duplicadas. Identificadores, códigos y campos desconocidos permanecen textuales. Descripciones hasta 1.000 caracteres; otros textos hasta 255; vacío se representa como `null`, no con valores inventados. Montos `numeric(255,0)` no negativos, JSON como cadenas de dígitos canónicas, sin decimales ni redondeo de entrada. Fecha `date` y hora textual `HH:mm:ss` separadas; no asignar zona a la fecha/hora Oracle. Fechas internas de creación/revisión son `timestamptz`.

No se exige suma de importes igual al total ni una línea mínima: esas reglas no fueron confirmadas. No se crean catálogos ni imputaciones institucionales de la propuesta antigua. Nº Documento e ID de Oracle no son únicos hasta confirmar identidad/ámbito de origen; UUID interno identifica la copia. `bi`, ITEM, titular de RUT y situación de pago siguen pendientes, almacenados como texto opcional. No se deduce pago de la revisión.

Constraints: montos no negativos; posiciones únicas y hasta 100; textos no vacíos/límites; fechas/horas válidas; `pending` sin revisor/fecha y `reviewed` con ambos; versión positiva; FKs; operación única por creador. Migrar no carga cuentas ni compras.

## Contrato de persistencia y endpoints

Contratos TypeBox de candidatos y persistencia comparten formatos, pero son objetos diferentes. Entrada de alta: `{operationId, header, lines, administrative, origin?}`; no acepta rol, revisión, creador ni timestamps del cliente. `origin` omitido o `{type:'manual'}` conserva ingreso manual. Para laboratorio: `{type:'contract_example', exampleId:'recovered'|'partial'|'ambiguous'}`. No admite OCR real, fallo ni origen institucional. En `packages/contracts/src/purchases/record-examples.ts` hay un ejemplo ficticio validable completo; cambiar `operationId` para iniciar otra operación.

| Método/ruta | Resultado |
| --- | --- |
| `POST /api/v1/purchases` | Transacción de cabecera/ítems; `201 {data: registro}`; reintento idéntico `200` |
| `GET /api/v1/purchases?reviewStatus=pending&page=1&pageSize=20` | `{data: resúmenes, pagination: {page,pageSize,total}}`; estado obligatorio `pending` o `reviewed`; página/tamaño por defecto 1/20, máximo 100 por página |
| `GET /api/v1/purchases/:id` | `{data: registro completo}`; inexistente `404` |
| `POST /api/v1/purchases/:id/validation` | `{expectedVersion: 1}`; `200 {data: registro}` validado; versión desactualizada pendiente `409` |

Orden fecha de envío descendente y UUID descendente. La cuenta de sesión se obtiene del servidor; en escrituras se comprueba Origin autorizado. Respuestas `no-store`; errores con envelope común y `requestId`, sin SQL/trazas. `401` sin sesión, `403` sin rol/origen, `400` formatos/filtros, `404` inexistente, `409` conflicto, `413` límite de cuerpo, `500/503` fallo interno/disponibilidad.

La alta tiene un límite propio de 512 KiB sobre el JSON codificado, además de los límites por campo/100 líneas; textos Unicode pueden alcanzar el límite combinado antes que los límites individuales. No aumenta el límite global de 128 KiB. Idempotencia por cuenta y UUID de operación: contenido canónico idéntico recupera el registro; otro contenido con esa operación produce `409`. El frontend conserva la operación al reintentar. El hash no se devuelve al navegador.

La validación bloquea la fila en transacción. Sólo la primera cambia estado/version/revisor; un reintento sobre un registro ya validado conserva esos datos incluso si aporta una versión anterior. No devuelve aprobación de Oracle ni un estado de pago.

## Arranque y comprobación

Después de actualizar el código, con la BD local iniciada:

```powershell
$env:DATABASE_URL_FILE = (Resolve-Path '.local/secrets/migrator-local-url').Path
npm run db:migrate
npm run dev
```

No es necesario recrear el volumen ni reiniciar Podman para agregar tablas. `npm run dev` no migra automáticamente. No pegar credenciales en comandos o en Git. Pruebas: unitarias, integración contra PostgreSQL 17, typecheck, builds y `test:e2e:auth`; esta última requiere primero `build:web`. Los datos de las pruebas sólo viven en bases descartables, no en `cenit_demo`.

## Evidencia local

- 52 pruebas unitarias, 69 de integración PostgreSQL/API y 44 de infraestructura exitosas.
- Typecheck y builds de contratos/API/frontend correctos; sintaxis del supervisor local comprobada.
- 26 recorridos Playwright exitosos en la ejecución final. Incluyen ingreso con varios ítems/proveedores, recarga/persistencia, detalle, revisión local, tablas/paginación independientes, errores conservando formulario, foco válido, aviso de descarte y cierre/expiración. La primera ejecución detectó una espera incorrecta del test de confirmación; fue corregida antes de la ejecución final.
- Migraciones probadas en bases vacía y existente, repetibles sin semillas; rollback, reintentos concurrentes, conflictos, FK/posiciones/estado/montos (incluido `NaN`), formatos, 512 KiB y permisos comprobados. La prueba de persistencia vuelve a leer con un repositorio nuevo y en el navegador tras recargar; no se reinició el contenedor PostgreSQL para esa comprobación.
- Migraciones aplicadas en `cenit_demo` local sin cargar solicitudes. PostgreSQL 17.11 y permisos individuales SELECT/INSERT/UPDATE de `cenit_app` confirmados. No se modificó la VM ni su despliegue.
- Revisión visual en 1280/375 px: tablas con scroll interno, navegación y formulario sin desbordamiento horizontal de la página. Detector de los archivos de interfaz modificados sin hallazgos. No se dejan API/Vite de desarrollo ocupando 3000/5173.

Pendientes: revisión independiente, integración/Actions tras push del líder, extracción real, reglas/estados institucionales y ensayo del build completo en VM. El publicador permanece deshabilitado.

## HU05: transferencia y procedencia ficticia

Desde el laboratorio, «Continuar al formulario de guardado» valida formatos y copia los valores corregidos. No altera candidatos originales ni hace POST; los campos ausentes siguen vacíos. El formulario exige número, fecha, descripción y total antes de guardar. El ejemplo de fallo no permite continuar. «Agregar solicitud manual» continúa abriendo un formulario vacío.

El canal `features/purchases/model/transfer.tsx` vive únicamente dentro del área administrativa autenticada y está ligado a la cuenta mediante su clave de montaje. Transporta una copia, su origen y una operación UUID, consumidos una sola vez tras montar el formulario. No usa almacenamiento del navegador ni estado del historial. Logout, expiración o cambio de cuenta desmontan el canal y el formulario. Los errores conservan campos y operación; abandonar datos modificados requiere aviso.

BD, detalle y resumen devuelven `source: manual | contract_example` y `exampleId: null | recovered | partial | ambiguous`. La constraint exige ID admitido para ejemplos y ausencia para manuales. Formulario, ambos listados y detalle identifican «ejemplo ficticio sin extracción real». La procedencia sólo describe el ingreso, no certifica OCR ni origen Oracle. El hash manual conserva exactamente el formato previo, incluso con `origin: {type:'manual'}` explícito. Los ejemplos incluyen origen e ID en el hash; cambiar procedencia o ejemplo con la misma operación devuelve `409`.

Comprobación adicional: migración 0005 sobre PostgreSQL vacío y existente con una copia manual previa; preservación de origen, hash y reintento antiguo. API arrancada como proceso independiente, login y alta reales por HTTP, detención y nuevo arranque con la misma base descartable; lectura completa idéntica, incluidos ítems, metadatos y procedencia. Ninguna prueba utiliza `cenit_demo` ni reinicia Podman.

HU05-T02/T03/T04 quedan pendientes de revisión, Actions e integración después de la verificación local. La recuperación automática HU04 y las futuras imputaciones institucionales quedan fuera del cambio.

### Evidencia del cierre técnico de HU05

53 unitarias y 71 pruebas de integración PostgreSQL/API exitosas; tras ampliar la comprobación de conservación de ítems anteriores y rollback de ejemplos, se repitieron las 13 pruebas de compras con éxito. 28 recorridos de navegador verificados: 26 pasaron en la primera ejecución; se corrigieron dos pruebas nuevas (selector de descripción y reloj instalado antes de iniciar sesión) y ambos recorridos pasaron junto con paginación/responsive en la segunda ejecución. No se corrigió código de producto por esos fallos del harness.

44 pruebas de infraestructura exitosas; typecheck y builds de contratos/API/web correctos. Revisión visual de listados en 1280/375 px, con desplazamiento interno de tablas y procedencia visible; detector de interfaz sin hallazgos. Las pruebas usan bases descartables y no aplican la migración nueva a `cenit_demo`. Estado de las tres tareas: **implementadas y verificadas localmente, pendientes de revisión, CI e integración**. No se creó PR, se hizo merge ni se habilitaron releases.

## HU06: búsqueda, filtros y total documental

`GET /api/v1/purchases` conserva `reviewStatus` obligatorio (`pending` o `reviewed`), `page` predeterminada 1 y `pageSize` predeterminado 20, máximo 100. Añade los siguientes filtros opcionales, combinados con AND:

| Parámetro | Regla |
| --- | --- |
| `q` | 1–100 caracteres después de quitar espacios exteriores. Subcadena literal de número de solicitud, descripción general o proveedor de cualquier ítem; ignora mayúsculas/diacríticos. `%`, `_` y barra inversa son literales |
| `dateFrom`, `dateTo` | `YYYY-MM-DD`, fechas reales años 0001–9999, inclusivas sobre fecha de envío; cualquiera puede omitirse; rango invertido inválido |
| `unitCode`, `projectCode` | Texto de 1–255 caracteres con contenido no blanco, comparación exacta, conserva ceros, puntuación y espacios; ambos códigos deben coincidir en el mismo ítem |

No se usan UUID de catálogo ni filtros de pago. Códigos válidos sin coincidencias devuelven vacío, no `INVALID_FILTER`. Texto vacío, fechas imposibles, rangos invertidos, límites excedidos o parámetros desconocidos devuelven `400` con error común y requestId. Cada administrativo accede; estudiantes/docentes no. Búsqueda de proveedor consulta cualquier ítem de la solicitud, mientras que unidad/proyecto se comprueban conjuntamente en un ítem; no se exige que éste sea también el que coincidió con el proveedor buscado.

La migración `0006_purchase_search_keys.sql` crea `cenit.normalize_purchase_search(text)` y tres columnas generadas almacenadas: `request_number_search`, `description_search` y `provider_search`. Descompone Unicode NFD, elimina marcas combinantes de los bloques 0300–036F, 1AB0–1AFF, 1DC0–1DFF, 20D0–20FF y FE20–FE2F y pasa a minúsculas (por ejemplo, «Ñandú» coincide con «nandu»). La misma función normaliza el término de consulta. PostgreSQL genera las claves también para filas anteriores y nuevas; no modifica textos originales, hash de idempotencia ni procedencia. Sin extensiones, semillas ni catálogos adicionales. El snapshot Drizzle registra las columnas; la función se declara explícitamente antes de ellas en la migración.

Consultas parametrizadas con `EXISTS` conservan una fila por solicitud, incluso con varios ítems coincidentes. Orden fijo `sent_date DESC, id DESC`. Filas, conteo y suma se calculan con el mismo snapshot de una transacción `REPEATABLE READ READ ONLY`. Los resúmenes siguen incluyendo origen e ID de ejemplo.

La respuesta conserva `data` como array y `pagination`, añadiendo `totals: {currency: 'CLP', documentTotal: string}`. Suma el total de cada solicitud coincidente una sola vez en todo el conjunto filtrado de ese estado, independientemente de página o cantidad de ítems. No limita la suma a 255 dígitos, no convierte a Number y no representa pagos ni importe imputado. Sin coincidencias devuelve total `"0"`; una página fuera del conjunto mantiene conteo/suma y devuelve array vacío. Ejemplos TypeBox validables en `packages/contracts/src/purchases/record-examples.ts`.

Ejemplo de consulta:

```text
/api/v1/purchases?reviewStatus=pending&q=demostracion&dateFrom=2026-10-12&dateTo=2026-10-12&unitCode=270101&projectCode=00000000&page=1&pageSize=20
```

La barra común tiene «Aplicar filtros» y «Limpiar»; editar controles no consulta hasta aplicar. Ambas tablas vuelven a página 1 al aplicar/limpiar y mantienen paginación, conteo y monto propios. Valida con contratos compartidos, muestra errores junto al campo y carga/vacío/error con reintento. Las claves incluyen filtros y no presentan resultados de otra combinación como actuales. Filtros aplicados y páginas viven en URL: retorno desde detalle y recarga los restauran. No se guardan borradores ni credenciales en URL. Salir de sesión redirige al login sin transportar filtros a otra identidad.

Las tablas vacías conservan cabecera y las cinco columnas (número, fecha, detalle, tipo de documento y acciones). El mensaje «No hay solicitudes en esta página» aparece en una fila que abarca las columnas, con conteo, total cero y paginación deshabilitada donde corresponde. No se agregan registros ficticios para llenar la vista.

Después de actualizar, ejecutar la migración 0006 con el migrador privado antes de `npm run dev`; el supervisor detecta ausencia de las columnas nuevas. No reiniciar Podman ni recrear volúmenes. Las comprobaciones usan bases descartables, no `cenit_demo`. Revisión, Actions e integración pendientes; publicador deshabilitado.

### Evidencia local de HU06

- 65 unitarias y 75 pruebas de integración PostgreSQL/API exitosas. Incluyen claves generadas para registros previos sin alterar valores/hash, NFD/tildes/mayúsculas, `%`/`_`/barra inversa literales, intento de SQL en texto, fechas inclusivas e inválidas, códigos con ceros, misma línea, cabeceras únicas, suma de más de 255 dígitos y página fuera de rango.
- Escritura concurrente inyectada entre conteo y lectura: la respuesta conserva una solicitud y total 100 del snapshot; una lectura posterior ve las dos y total 300.
- 30 recorridos Playwright verificados: 29 pasaron en la ejecución general; una simulación de red del test nuevo continuaba una ruta cancelada. Tras ajustar sus esperas se repitieron los dos recorridos de filtros y ambos pasaron. Incluyen aplicación común, reinicio de páginas, total propio, cruce inválido de códigos, detalle, limpiar, carga/error/reintento, logout, expiración y cambio de cuenta.
- 44 pruebas de infraestructura exitosas; typecheck, builds de contratos/API/web y sintaxis del supervisor correctos. Revisión visual en 1280/375 px sin desbordamiento horizontal de página, con tablas desplazables y etiquetas visibles; detector de interfaz sin hallazgos.

HU06-T02 y los controles mínimos de HU06-T03: **implementados y verificados localmente, pendientes de revisión, CI e integración**. No se aplicó la nueva migración a la BD de demo ni se modificó la VM. No se creó PR, se hizo merge ni se habilitaron releases.

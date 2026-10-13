# Solicitudes de compra persistentes y validación local

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

La barra común de Sistema de compra tiene «Aplicar filtros» y «Limpiar filtros»; editar controles no consulta hasta aplicar. Ambas tablas vuelven a página 1 al aplicar/limpiar y mantienen paginación, conteo y monto propios. Valida con contratos compartidos, muestra errores junto al campo, carga/vacío/error con reintento y conserva navegación a detalle. Las claves de consulta incluyen filtros y no reutilizan resultados de otra combinación como actuales. Filtros sólo en memoria: salir del listado, recargar o cerrar/expirar/cambiar la sesión los descarta.

Las tablas vacías conservan cabecera y las cinco columnas (número, fecha, detalle, tipo de documento y acciones). El mensaje «No hay solicitudes en esta página» aparece en una fila que abarca las columnas, con conteo, total cero y paginación deshabilitada donde corresponde. No se agregan registros ficticios para llenar la vista.

Después de actualizar, ejecutar la migración 0006 con el migrador privado antes de `npm run dev`; el supervisor detecta ausencia de las columnas nuevas. No reiniciar Podman ni recrear volúmenes. Las comprobaciones usan bases descartables, no `cenit_demo`. Revisión, Actions e integración pendientes; publicador deshabilitado.

### Evidencia local de HU06

- 65 unitarias y 75 pruebas de integración PostgreSQL/API exitosas. Incluyen claves generadas para registros previos sin alterar valores/hash, NFD/tildes/mayúsculas, `%`/`_`/barra inversa literales, intento de SQL en texto, fechas inclusivas e inválidas, códigos con ceros, misma línea, cabeceras únicas, suma de más de 255 dígitos y página fuera de rango.
- Escritura concurrente inyectada entre conteo y lectura: la respuesta conserva una solicitud y total 100 del snapshot; una lectura posterior ve las dos y total 300.
- 30 recorridos Playwright verificados: 29 pasaron en la ejecución general; una simulación de red del test nuevo continuaba una ruta cancelada. Tras ajustar sus esperas se repitieron los dos recorridos de filtros y ambos pasaron. Incluyen aplicación común, reinicio de páginas, total propio, cruce inválido de códigos, detalle, limpiar, carga/error/reintento, logout, expiración y cambio de cuenta.
- 44 pruebas de infraestructura exitosas; typecheck, builds de contratos/API/web y sintaxis del supervisor correctos. Revisión visual en 1280/375 px sin desbordamiento horizontal de página, con tablas desplazables y etiquetas visibles; detector de interfaz sin hallazgos.

HU06-T02 y los controles mínimos de HU06-T03: **implementados y verificados localmente, pendientes de revisión, CI e integración**. No se aplicó la nueva migración a la BD de demo ni se modificó la VM. No se creó PR, se hizo merge ni se habilitaron releases.

# Diseño de software (SDD): arquitectura y funcionamiento de Cenit

Cenit organiza información administrativa y facilita la consulta académica de Nutrición y Dietética en la Facultad de Medicina de la Universidad Católica del Norte, sede Coquimbo. Este documento explica la solución existente, sus límites y los asuntos que aún requieren definición. La instalación se describe en las [guías de operación](../deploy/LOCAL.md) y las comprobaciones en [Pruebas y criterios de aceptación](PRUEBAS-Y-ACEPTACION.md).

Este archivo es el SDD vigente del repositorio. README es el punto de entrada; `deploy` conserva los procedimientos de operación. No se mantiene otra copia del diseño con decisiones diferentes. Los diagramas siguientes son Mermaid editable en Markdown, revisable junto con el código.

## Estado de la implementación

«Implementado» identifica comportamiento disponible en el código con pruebas enlazadas; «preparado» identifica una herramienta o configuración que requiere ejecución explícita en un destino; «pendiente» identifica definición, validación o comprobación que todavía no se acredita. Ninguno de esos estados sustituye la aceptación del cliente ni confirma qué SHA está instalado actualmente en Azure.

| Área | Implementado | Preparado o pendiente |
| --- | --- | --- |
| Plataforma | Login local, rol por cuenta, sesión de dos horas, frontend compilado servido por API, PostgreSQL persistente | Aceptación de usuarios y comprobación del destino elegido |
| Administrativo | Compras: captura, revisión, alta manual, persistencia, búsqueda, resumen, validación local y eliminación | Precisión OCR acordada con nuevas muestras; actualización de una copia desde otra captura |
| Académico | Consulta por rol, versiones del catálogo, detalle, reglas simples/conjuntas e historiales ficticios | Carga explícita de `diagrama-r2` en cada entorno; año, códigos y aceptación institucional pendientes |
| Personal y Bienes | Navegación y páginas de construcción | Requisitos y módulos funcionales pendientes; no se presentan como entregados |
| Entrega | CI, imágenes por digest, despliegue Azure, migrador separado y recuperación de configuración ante fallos de activación | Catálogo/cuentas se preparan por separado; restauración completa de datos y retiro del servidor anterior requieren ensayo y aprobación |

La [matriz de aceptación](PRUEBAS-Y-ACEPTACION.md) identifica pruebas y evidencia histórica. El estado operativo se obtiene de Actions, `current.json`, health y recorridos autenticados, siguiendo la [guía Azure](../deploy/azure/README.md#diagnóstico-y-recuperación).

## Alcance y entregas

El Project Charter contempla una plataforma modular con Compras, Personal, Bienes y consulta académica. La primera entrega se concentra en Compras y académico. Personal y Bienes forman parte del proyecto completo, pero sus campos, operaciones y reglas deben validarse antes de implementarlos; las páginas actuales sólo informan que esos módulos no están disponibles.

Compras recupera datos de capturas de compras aprobadas previamente en Oracle, permite revisarlos y conserva una copia consultable. Cenit no se conecta a la API de Oracle, no crea ni modifica compras allí y no ejecuta aprobaciones o pagos institucionales. La revisión local, la situación de pago declarada y la aprobación institucional son conceptos diferentes.

El componente académico muestra la malla, las relaciones curriculares recibidas y el avance de estudiantes ficticios. Una relación observada no se transforma en una regla oficial sin cotejo. Se mantienen identificados los prerrequisitos pendientes.

El Charter sitúa el desarrollo entre agosto y diciembre de 2026, con cierre estimado el 11 de diciembre. Esa planificación no acredita que una funcionalidad esté entregada o aceptada. La aceptación requiere pruebas y revisión con los responsables administrativos o académicos. Jira conserva el backlog, las asignaciones y los criterios de cada tarea; este documento resume el funcionamiento y las decisiones técnicas que necesita conocer quien mantiene el sistema.

Quedan fuera del MVP la autenticación institucional y la simulación académica. La iteración de registro incorpora una integración opcional Cenit → Google Sheets, desactivada por defecto; amplía la base del Charter que dejaba Sheets como mejora opcional y requiere coordinación documental de ese alcance. El Charter también excluye simulaciones e integración con la API de Oracle del alcance descrito. No se incorporan procesos de Banner, importación masiva ni nuevos flujos institucionales por inferencia. El uso de datos reales requiere autorización de sus fuentes y acuerdos específicos; los datos ficticios no acreditan esas condiciones.

## Organización del código

Cenit es un monolito modular. El navegador consume un API REST JSON bajo `/api/v1`; PostgreSQL guarda los datos. En producción, Fastify sirve también el frontend compilado, de modo que la web y el API comparten origen. En desarrollo, Vite sirve la web y dirige las llamadas al API local.

| Ubicación | Responsabilidad |
| --- | --- |
| `apps/web/src/app` | Rutas, proveedores, navegación y composición de la interfaz |
| `apps/web/src/features/auth`, `purchases`, `academic` | Pantallas, consultas y presentación de cada funcionalidad |
| `apps/web/src/shared` | Componentes y utilidades que realmente comparten varias funcionalidades |
| `apps/api/src/modules/auth`, `purchases`, `academic` | Rutas, servicios y repositorios de cada módulo |
| `apps/api/src/infrastructure` | Conexión a PostgreSQL, errores, configuración, salud y servicio del frontend |
| `apps/ocr` | Procesamiento auxiliar de imágenes; no guarda compras ni consulta la base |
| `packages/contracts` | Schemas TypeBox/JSON Schema, tipos y formatos públicos del API |
| `db/schema`, `db/migrations` | Modelo Drizzle e historial de cambios de PostgreSQL |
| `db/seeds` | Preparación explícita de datos ficticios y catálogo |
| `catalogs/academic` | Catálogo versionado y referencias a sus fuentes |
| `tests/integration`, `tests/e2e`, `tests/infrastructure`, `tests/ocr` | Pruebas de persistencia/API, navegador, operación y procesamiento |
| `deploy` | Configuración local, Azure y herramientas de la instalación anterior |
| `experiments` | Investigación reproducible separada de la aplicación |

Las rutas adaptan HTTP; los servicios aplican las reglas; los repositorios realizan las consultas. Cada módulo controla su persistencia y evita acceder a estructuras privadas de otro módulo. El frontend comparte contratos públicos con el servidor, no tablas Drizzle ni modelos internos.

### Componentes y límites

```mermaid
flowchart LR
    Usuario["Navegador"] --> HTTPS["Caddy: HTTPS en Azure"]
    HTTPS --> Web["Fastify sirve React compilado"]
    Web --> Router["React Router y TanStack Query"]
    Router --> Auth["API: sesión y permisos"]
    Auth --> Compras["Módulo administrativo: Compras"]
    Auth --> Academico["Módulo académico: catálogo e historial"]
    Compras --> PG[("PostgreSQL: esquema cenit")]
    Academico --> PG
    Compras --> OCR["OCR privado: Python y ONNX"]
    OCR --> Candidatos["Candidatos sin persistir"]
    Candidatos --> Router
    Contratos["TypeBox: contratos públicos"] -.-> Router
    Contratos -.-> Auth
    Operador["Operador autorizado"] --> Herramientas["Migrador y cargador explícitos"]
    Herramientas --> PG
```

El navegador vuelve al mismo origen para consultar `/api/v1`; las flechas representan dependencias, no servicios frontend desplegados por separado. Administrativo accede a Compras; docente y estudiante acceden a académico, con restricciones diferentes para historiales. PostgreSQL se usa con `cenit_app` desde la aplicación y `cenit_migrator` desde herramientas separadas. OCR no recibe credenciales PostgreSQL. La revisión humana y el POST explícito separan extracción de guardado.

En Azure cada entorno tiene su red, contenedores, volumen y secretos independientes, pero comparte la VM y sus recursos físicos. En local Nginx sustituye la entrada Caddy; en desarrollo Vite sirve React y hace proxy al API. Esas variantes y sus puertos están en [Entorno local](../deploy/LOCAL.md#configuración-del-runtime-y-puertos).

Se mantiene React, Vite, TypeScript, React Router, TanStack Query, Tailwind y los componentes seleccionados de shadcn/Radix. El API usa Node.js 24 LTS, Fastify 5, PostgreSQL 17 y Drizzle. Las versiones exactas están en los manifiestos, el único `package-lock.json`, `.node-version` y `deploy/images.lock.json`; no se duplican aquí. REST y las versiones concretas son la base técnica del repositorio, sin atribuirles ratificación institucional. No se añaden microservicios, GraphQL ni abstracciones generales sin una necesidad y decisión documentadas.

Los tests unitarios se colocan junto al código. Los escenarios con PostgreSQL pertenecen a integración; los recorridos de personas, a E2E. Las muestras de OCR y sus valores esperados permanecen separados del extractor. Los datos de PostgreSQL, secretos, capturas de ejecución y compilados no se versionan.

## Autenticación y sesión

El acceso es local, mediante correo y contraseña. Cada cuenta tiene un rol; el login no acepta asignación de rol desde el navegador. No hay registro público, recuperación de contraseña ni autenticación Google implementados.

| Recurso | Acceso |
| --- | --- |
| Compras, extracción, resumen, validación y eliminación | Administrativo |
| Catálogo académico | Docente y estudiante |
| Historial propio `/academic/me/progress` | Estudiante; identidad obtenida de la sesión |
| Búsqueda de estudiantes e historial por identificador | Docente; estudiantes ficticios de Nutrición en la demo |

Los permisos se aplican en el servidor incluso si se consulta el API directamente. Sin sesión se rechaza el acceso; enviar identidad o rol por headers no concede permisos.

Las contraseñas se guardan con scrypt y salt; los tokens de sesión son aleatorios y la base conserva sólo su digest. La cookie `cenit_session` es HttpOnly, SameSite=Lax y Secure por defecto. La sesión dura dos horas fijas desde el login y no se renueva al consultar. Logout revoca la sesión. El rol y la activación de la cuenta se comprueban en el servidor.

Rutas de acceso: `POST /api/v1/auth/login`, `GET /api/v1/auth/session` y `POST /api/v1/auth/logout`. Login y logout requieren un Origin exacto autorizado. El login limita diez intentos por minuto/IP. La excepción de cookie sin Secure se admite sólo con configuración explícita de desarrollo, test o demo HTTP; no es la configuración por defecto de una instalación institucional.

### Iteración de jornada pendiente

Existe un diseño para una iteración posterior con ocho horas absolutas y 60 minutos de inactividad para los tres roles. **No está implementado; sigue vigente la sesión fija de dos horas.** El cambio requiere migración aditiva `absolute_expires_at` nullable, contratos compatibles y conservación del vencimiento original de sesiones anteriores.

El diseño prevé `absoluteExpiresAt` opcional y `expiresAt` efectivo, `POST /api/v1/auth/activity` con cookie y Origin, y extensión únicamente de sesiones válidas hasta su límite absoluto. La actividad humana —escritura, clic, scroll y navegación— se agruparía como máximo una vez por minuto; las consultas automáticas y el movimiento del mouse no extenderían la sesión. BroadcastChannel sincronizaría actividad y salida entre pestañas, con revalidación en servidor y sin transportar borradores o credenciales.

La recuperación futura de un borrador tras vencer sería sólo en memoria de la pestaña, para la misma cuenta y operación. Logout explícito, cancelación, recarga, cierre u otra identidad lo descartarían. Su implementación necesita pruebas con relojes controlados, sesiones anteriores, actividad concurrente con logout, respuestas tardías y compatibilidad de la imagen anterior con la migración. Mientras esté pendiente, sigue vigente el comportamiento actual.

## Compras

Una copia tiene una cabecera y de cero a cien ítems. Número, fecha de envío, descripción general y total son obligatorios; los demás datos pueden ser desconocidos y se representan como `null`. Se conservan identificadores, códigos, ceros, referencias y textos originales. Número de documento e identificador Oracle no son únicos mientras no se confirme su identidad y ámbito institucional.

Los montos se almacenan exactamente en PostgreSQL y se intercambian como cadenas de dígitos no negativas, hasta 255 dígitos por campo. No se usa `Number` para calcular o presentar esos montos. No se exige igualdad entre la suma de ítems y el total documental; tampoco se crean imputaciones presupuestarias no confirmadas. La fecha documental es una fecha civil y no se convierte a UTC. Las fechas internas de creación y revisión sí llevan zona horaria.

| Operación | Ruta y comportamiento |
| --- | --- |
| Guardar | `POST /api/v1/purchases`: cabecera e ítems en una transacción; 201 al crear, 200 al repetir la misma operación |
| Listar | `GET /api/v1/purchases`: estado `all`, `pending` o `reviewed`, filtros, página y total documental de coincidencias |
| Resumen de Inicio | `GET /api/v1/purchases/summary`: `requests`, `pending`, `currency`, `pendingAmount`, `days` y `overview` (agregados, actividad y altas recientes) |
| Capacidades | `GET /api/v1/purchases/capabilities`: `secondReviewEnabled` y `sheetsSyncEnabled`; requiere sesión administrativa |
| Estado de Sheets | `GET /api/v1/purchases/sheets-sync`, opcional `purchaseId`: estado, cantidad pendiente, último éxito y enlace a la planilla |
| Consultar | `GET /api/v1/purchases/:id`: copia completa y procedencia |
| Corregir copia local | `PUT /api/v1/purchases/:id` con `expectedVersion`: reemplaza cabecera, seguimiento e ítems atómicamente; disponible para registros manuales y desde captura |
| Validar | `POST /api/v1/purchases/:id/validation` con `expectedVersion`: registra la primera revisión local sólo si está habilitada |
| Eliminar | `DELETE /api/v1/purchases/:id` con `expectedVersion`: elimina cabecera e ítems de forma atómica |

La creación usa `operationId` por cuenta: un reintento idéntico devuelve la misma copia; otro contenido con esa operación devuelve 409. Corregir exige la versión vigente y actualiza cabecera e ítems en una sola transacción; un reintento con el mismo contenido ya aplicado devuelve el registro vigente, mientras que un conflicto distinto devuelve 409 sin sobrescribir cambios ajenos. La corrección conserva ID, procedencia y datos de captura, incrementa la versión y genera una nueva proyección para Sheets. Si la copia ya estaba revisada en Cenit, vuelve a pendiente porque el contenido corregido necesita revisión. Los registros `contract_example` siguen siendo de sólo lectura; la semilla de demo local crea copias ficticias con procedencia manual y editables. Sus folios y montos son sintéticos, y los códigos institucionales sin validar quedan vacíos. La validación concurrente conserva al primer revisor y la versión resultante; repetir una validación ya completada no vuelve a cambiar esos datos. El borrado exige versión vigente, también para copias validadas. Borrar retira la operación de alta: un envío posterior puede crear otra copia, por lo que eliminar/recrear no constituye un mecanismo de corrección desde origen.

Las escrituras requieren sesión administrativa y Origin autorizado. El alta y la corrección admiten hasta 512 KiB de JSON, además de los límites de cada campo y de cien líneas. El límite general de otras solicitudes JSON permanece en 128 KiB. El contrato exacto de cada entrada y respuesta está en [los schemas de compras](../packages/contracts/src/purchases/records.ts).

### Búsqueda y resumen

La búsqueda textual comprende número, descripción y proveedor. Texto, fechas inclusivas y códigos exactos se actualizan tras 250 ms del último conjunto válido, sin botón de aplicar. Una fecha incompleta o un rango inválido conserva el borrador y los últimos resultados e indica qué falta para consultar. Los filtros activos se pueden quitar individualmente; unidad y proyecto deben coincidir en el mismo ítem.

La búsqueda abre con el año calendario actual de America/Santiago seleccionado y muestra veinte registros por página (`reviewStatus=all`), con ambos estados locales y ordenados por fecha de envío de más reciente a más antigua. El año por defecto se calcula al abrir Compras y avanza con el calendario; al elegir un año o período, la selección se conserva en la URL. «Todos los años» permite consultar el historial completo. La barra compacta muestra buscador, año, mes, orden y el botón «Más filtros». Al expandirlo, la fecha exacta, el rango, unidad y proyecto aparecen en una fila en escritorio y se reordenan para conservar legibilidad en pantallas estrechas; los valores activos abren la barra automáticamente. Los menús de año, mes y orden aparecen desde el borde del botón. Los selectores reutilizan el botón y Popover existentes, con selección visible, navegación por flechas, búsqueda por letras y cierre con Escape. Año y mes aplican las fechas inclusivas existentes; el mes requiere elegir un año. Los años disponibles provienen de todo el historial, sin desaparecer al filtrar. Los filtros rápidos de año y mes comunican el período desde sus propios selectores y no se duplican como chips de filtros activos. La fecha exacta y ambos extremos del rango permiten escritura manual en tres campos independientes para día, mes y año. Hacer clic en cualquier espacio del campo exacto enfoca el día; el rango conserva márgenes interiores simétricos. `dd`, `mm` y `aaaa` son placeholders nativos; el valor parcial conserva sólo los dígitos ingresados y separadores, nunca caracteres de máscara. Las posiciones se mantienen independientes al escribir, pegar o borrar. Al limpiar un segmento, reaparece su placeholder sin alterar los otros; limpiar todos los campos restaura los tres placeholders y elimina el aviso de formato. Si queda un solo extremo del rango, se indica que falta completar el rango. Los avisos aparecen junto al campo y no agregan un mensaje global bajo los filtros. Una parte imposible muestra un aviso específico de inmediato, borra sólo ese segmento y lo enfoca para corregir, conservando los demás; una fecha incompleta o un rango invertido conserva el borrador y los últimos resultados. El rango manual requiere completar ambos extremos. También se puede elegir en un calendario de dos meses: el primer clic inicia un rango y el segundo lo completa (incluso el mismo día), lo aplica sin cerrar el calendario. El primer clic conserva un borrador incompleto sin consultar; cerrar y reabrir conserva ese borrador. Al reabrirlo se ve la selección; otro clic inicia un rango nuevo. Fecha exacta y rango consultan los límites inclusivos de la lista y al aplicar uno se reemplaza el otro. Ambos calendarios comparten extremos oscuros e interior claro, con mes/año como texto y flechas de navegación. El rango muestra dos meses en escritorio y uno hasta 760 px. Ambos calendarios de filtros permanecen abiertos al seleccionar y al editar sus campos; cierran con el ícono, clic fuera o Escape. Calendario y escritura admiten desde enero del primer año con compras hasta diciembre del último, incluidos años intermedios vacíos; los límites provienen de `availableYears` del historial completo. Mientras se cargan los años o no hay compras, las fechas están deshabilitadas con explicación; un fallo conserva los últimos límites confirmados y permite reintentar. No se aplica esta restricción histórica a los formularios de registro/corrección. Un período que no corresponde a año o mes completo aparece como «Rango personalizado» en el selector de año. Los filtros avanzados sólo aparecen como etiquetas con acción de quitar cuando su panel está cerrado; el buscador no duplica su texto como etiqueta. Hay una única acción «Limpiar» permanente junto a «Más filtros», deshabilitada en el estado inicial y habilitada también ante borradores o errores. Conserva sus dimensiones al cambiar de estado. El panel reserva espacio para que bordes y contornos de foco no se recorten. «Todos los años» quita el período rápido y «Limpiar» elimina los filtros activos y vuelve al año calendario actual. El orden opcional `sort=sentDateAsc`/`sentDateDesc` se aplica en PostgreSQL antes de paginar, con ID como desempate estable; omitirlo conserva el orden descendente.

La paginación muestra el intervalo y total de registros, permite veinte, cincuenta o cien por página y ofrece accesos numerados al inicio, final y páginas cercanas, sin desplazamiento infinito. Al pasar de página, el foco y la vista vuelven al encabezado del listado. Una página sin filas ofrece volver a la primera. La flag de servidor `CENIT_PURCHASE_SECOND_REVIEW_ENABLED=true` habilita las bandejas «Por revisar en Cenit» y «Revisados en Cenit», con paginación independiente, y la validación posterior. Cambiar/limpiar filtros, cambiar orden o tamaño vuelve las páginas a la primera. Los filtros aplicados, orden, tamaño y páginas se conservan en la URL, y el detalle mantiene el destino de retorno. El total documental suma cada cabecera coincidente una sola vez, incluso si coinciden varios ítems; no representa pagos ni importes imputados. Cada fila incluye el monto documental de su cabecera. En móvil las filas se presentan como tarjetas y la navegación conserva inicio, final y página actual. Conteo, página, años disponibles y total se leen en un mismo snapshot; las consultas posteriores conservan el contenido mientras se actualiza, reservando los esqueletos para la carga inicial. `availableYears` es un campo opcional de respuesta para mantener compatibilidad con respuestas anteriores.

Inicio muestra tres indicadores: compras con fecha documental del año, compras con fecha documental del mes y suma exacta de los montos documentales de ese mes una vez por cabecera. Ambas procedencias y estados de revisión se incluyen; el período actual se obtiene del servidor en America/Santiago. Estos indicadores usan `sent_date`, no la fecha de incorporación a Cenit, y no representan pagos. La actividad de registro y los últimos registros siguen usando `created_at`. Por compatibilidad, `overview.registeredThisYear` y `overview.registeredThisMonth` conservan sus nombres históricos aunque cuentan por fecha documental; `documentTotalThisMonth` y `registrationMonth` (`YYYY-MM`) completan esos indicadores. Se conservan `documentTotal`, `sourceCounts` y los demás agregados históricos. `requests`, `pending`, `pendingAmount` y `days` mantienen sus significados anteriores.

El resumen reúne los últimos treinta días de incorporación, incluidos días sin actividad y lectura textual accesible, y las cinco altas más recientes con acceso al detalle. El gráfico de barras sigue la composición de shadcn con Recharts, cargado al mostrar la actividad: presenta ejes y fecha/cantidad al pasar el cursor, navegar con flechas del teclado o usar el toque. La escala vertical deja margen hasta el siguiente múltiplo de cinco y limita las marcas a una cantidad legible. Su altura ocupa el espacio disponible de la tarjeta, sin reservar un vacío debajo del gráfico. Evita tarjetas que repitan los accesos de la barra lateral y conteos de ejemplos. Personal y Bienes siguen disponibles sólo como páginas en preparación desde la barra; sus indicadores requieren definición. La bienvenida y las superficies son compactas para mostrar todo en escritorio desde 1280×720 con datos habituales; móvil, zoom y valores extensos conservan desplazamiento sin ocultar información. La segunda revisión y Sheets se muestran junto a la actividad sólo cuando están habilitados. Inicio se actualiza al volver después de guardar, corregir, validar o eliminar; muestra carga, vacío y error con reintento sin cifras ficticias.

### Interfaz y borradores

El formulario presenta primero los cuatro datos obligatorios y agrupa los complementarios. Los ítems pueden desplegarse; los nuevos o con errores quedan abiertos y la validación lleva el foco al primer campo incorrecto. Las pantallas distinguen carga, vacío y error, tienen etiquetas visibles y no dependen sólo del color.

«Guardar registro» confirma una copia de una compra ya aprobada fuera de Cenit. La condición es una precondición del proceso, no una aprobación certificada por el sistema. El formulario manual se presenta como «Registrar manualmente». El detalle ofrece «Editar» para corregir una copia ingresada manualmente o revisada desde captura; los ejemplos de demostración son de sólo lectura. Corregir modifica sólo la copia en Cenit, conserva la procedencia y no cambia Oracle. Guardar, corregir y, cuando esté habilitada, validar sólo muestran éxito tras la respuesta del servidor. Una confirmación contextual permite cancelar descartes, validaciones y eliminación; el fondo permanece bloqueado y el foco vuelve al control correspondiente. La eliminación se ofrece únicamente mediante un ícono con nombre accesible en el detalle.

Los borradores viven en memoria de la pestaña y están ligados a la cuenta. La captura conserva el archivo, sus dimensiones orientadas, candidatos originales, correcciones, identidad de ítems y operationId; las URL de vista previa se recrean y liberan al desmontar. Un fallo temporal de revalidación oculta el contenido y permite recuperarlo sólo tras comprobar la misma identidad, manteniendo el vencimiento original. Logout, 401, expiración, otra cuenta, abandono, cancelación, recarga o cierre los descartan. No se guardan formularios en almacenamiento persistente ni se transportan por URL. Una solicitud de guardado pendiente bloquea salidas voluntarias hasta conocer su resultado.

Fechas visibles `dd/MM/aaaa`, API `YYYY-MM-DD`, calendario en español y validación de fecha civil. La navegación y los diálogos deben funcionar con teclado y pantallas estrechas. El movimiento reducido conserva transiciones discretas; la invalidación de sesión oculta datos inmediatamente. Las medidas de estilo y los detalles de animación se mantienen en componentes y CSS, no como un diario paralelo de ajustes.

### Copia automática en Google Sheets

`CENIT_PURCHASE_SHEETS_SYNC_ENABLED=true` habilita la proyección asíncrona hacia una planilla dedicada, identificada por `CENIT_PURCHASE_SHEETS_ID`. El servidor usa una cuenta de servicio con acceso explícito a ese archivo y una credencial montada mediante `CENIT_PURCHASE_SHEETS_KEY_FILE`. La biblioteca oficial `google-auth-library`, fijada en el lockfile, gestiona autenticación y tokens; el navegador nunca recibe la credencial. Las flags aceptan únicamente `true`/`false` y se leen al arrancar. Una configuración habilitada pero incompleta impide el arranque; no se anuncia una conexión inexistente.

Cenit es el registro principal. Las pestañas «Compras» e «Ítems» conservan cabecera/seguimiento y líneas por separado, enlazadas por ID de Cenit. Incluyen procedencia y metadatos; en cada envío las tres columnas de segunda revisión se ocultan si esa flag está apagada. Los desconocidos se proyectan como celdas vacías. Todos los valores se escriben como texto literal para conservar montos exactos y ceros y evitar fórmulas inferidas. Las pestañas están protegidas para la cuenta de servicio; usar vistas de filtro, copias u otras pestañas para el trabajo derivado. No reordenar filas, cambiar cabeceras ni retirar protecciones de las pestañas administradas: una identidad desplazada o cabecera distinta detiene esa entrega sin sobrescribir otra fila.

Cada alta, corrección, primera validación y eliminación deja una generación pendiente en `purchase_sheets_outbox` dentro de la transacción de la compra, incluso con la integración apagada. La migración y el worker incorporan copias anteriores sin cambiar sus datos ni inventar revisores. `purchase_sheets_delivery` conserva filas asignadas y última generación entregada por planilla/registro; no tiene FK de borrado hacia compras. Al eliminar, se vacían las celdas de cabecera e ítems sin desplazar filas de otros registros. Las asignaciones se conservan para que una respuesta perdida o un reinicio reescriban las mismas celdas, sin append duplicado. Estos metadatos son necesarios para completar bajas y reintentos; no conservan el formulario eliminado.

El worker procesa hasta diez registros cada quince segundos y usa un lock PostgreSQL para admitir un solo emisor por base. Un fallo conserva la cola y aplica espera creciente con variación hasta unos minutos. Una nueva generación durante la entrega sigue pendiente. No hay transacción distribuida ni actualización instantánea garantizada: el objetivo normal es menos de un minuto sin fallos ni acumulación. Guardar en Cenit no espera a Google; Inicio/listado/detalle muestran estado y último éxito, y el detalle identifica el estado de su copia. Cambiar de destino conserva entregas independientes y proyecta los registros disponibles al nuevo archivo; no migra el histórico ajeno ni borra automáticamente el destino anterior.

La integración no importa cambios hechos en Sheets, no crea compras en Oracle y no detecta modificaciones posteriores en ese sistema. Las pruebas usan un doble de la API con respuesta perdida y PostgreSQL descartable. La activación real requiere comprobar una planilla de pruebas y sus permisos con datos ficticios antes de cualquier uso institucional. Ver [configuración local](../deploy/LOCAL.md#conectar-una-planilla-de-pruebas).

### Actualización desde origen pendiente

Editar la copia local no importa una captura posterior ni la sincroniza con Oracle. Una futura actualización desde una nueva captura del mismo origen aún requiere definir la identidad de origen, el disparador manual o automático, la revisión de diferencias y los cambios aplicables. Debe conservarse la copia válida ante fallo y detectarse cualquier conflicto antes de aplicar cambios.

## Capturas y OCR

Desde «Registro de compras → Subir captura», el administrativo arrastra una imagen al recuadro grande o activa ese mismo recuadro por clic o teclado para abrir el explorador. El análisis comienza después de validar el archivo. Imagen y formulario comparten la vista, con zoom, ajuste, recuadros ocultables y una vista compacta ampliable en móvil; el estado de procesamiento no usa porcentajes simulados. En escritorio ambos paneles ocupan la altura disponible: la imagen permanece fija y el formulario se desplaza por separado. Ajustar muestra la imagen completa conservando su proporción; el zoom y el resaltado sólo desplazan su visor. Los avisos y las acciones de cambiar/reintentar tienen espacio propio encima de los paneles. La barra de acciones permite guardar explícitamente desde allí, con los mismos campos, validación e idempotencia del ingreso manual. Reemplazar o volver a extraer pide descartar las correcciones; las respuestas tardías de archivos anteriores se ignoran. El laboratorio de revisión conserva su ruta para QA, sin acceso desde las acciones habituales del listado. Los registros de ese origen siguen identificados como ejemplos en listado y detalle; no se presentan como compras reales.

`POST /api/v1/purchases/extractions` recibe `multipart/form-data` con un único campo `file`. Requiere sesión administrativa y Origin autorizado. Admite PNG/JPEG de hasta 5 MiB y veinte millones de píxeles; no PDF, lotes ni URL remota. Se comprueban contenido, MIME, dimensiones y límites; una extensión o metadata declarada no acreditan un archivo válido. El navegador usa `FormData` y no fija el boundary manualmente.

El procesador auxiliar usa PaddleOCR móvil ONNX mediante RapidOCR. Atiende una extracción a la vez y el API limita el procesamiento a sesenta segundos; sin configuración/procedencia válida o sin capacidad responde 503. Los modelos se verifican por hash y no se descargan durante una solicitud. La imagen se procesa temporalmente, no se conserva como anexo ni se registra en logs. [Modelos, hashes y licencias](../apps/ocr/MODELS.md).

La salida distingue recuperado, ausente, inválido y ambiguo; los valores desconocidos quedan en `null`. Las incidencias conservan la referencia al campo y el original no se modifica durante la revisión. `captureLayout` informa señales del formato; ni ese reconocimiento ni el color acreditan autenticidad. Las capturas parciales pueden aportar candidatos, mientras que un logo, fondo azul o título aislados no bastan para aceptar el formato. Las regiones opcionales de regions enlazan rutas de campos con x/y/width/height normalizados respecto de la imagen orientada mediante EXIF. Sólo se incluyen tokens o celdas efectivamente usados; se rechazan rutas inexistentes, candidatos ausentes y regiones fuera de la imagen. Enfocar un campo destaca su región; seleccionar un recuadro abre su sección y lleva al campo. Sin evidencia se indica «Sin ubicación disponible». Las correcciones se distinguen de los originales y los opcionales vacíos no se marcan como errores obligatorios. Los [contratos de extracción](../packages/contracts/src/purchases/extraction.ts) definen los estados y errores públicos.

La procedencia puede ser manual, `contract_example` o `image_capture`. Para una captura, el servidor firma identificador de extracción, versión de procesador y fecha, ligados a la cuenta. El recibo es válido dos horas para una nueva alta; el reintento de una operación ya conservada mantiene su idempotencia. Se almacena esa referencia de procesamiento, no la imagen. La firma no certifica que los datos corregidos sean verdaderos institucionalmente.

La versión de procesamiento actual es `ppocr5-latin-grid8-layout-v4` (regiones opcionales; una respuesta del adaptador anterior sin regiones conserva la identificación v3). La exactitud debe evaluarse por campo y muestra; la evaluación sintética de desarrollo no sustituye una muestra representativa y criterios acordados con el cliente. Los comandos de investigación y resultados congelados se conservan en [los experimentos de compras](../experiments/purchases/README.md); el [registro de pruebas](PRUEBAS-Y-ACEPTACION.md) distingue inferencia real de respuestas controladas.

## Académico

El catálogo de trabajo es [diagrama-r2](../catalogs/academic/nutricion-diagrama-r2.json): 52 asignaturas, 305 SCT y cuatro internados agrupados en IX–X. La [imagen recibida](Foto%20prerequisitos%20Nutricion.jpeg) es la fuente curricular vigente; el año oficial del plan no está confirmado. El PDF antiguo fue retirado y su referencia se conserva únicamente como antecedente histórico de `2027-r1` y del [cotejo](COTEJO-CATALOGO-ACADEMICO.md).

Los códigos `NUT2027-001` a `NUT2027-052` son identificadores internos heredados: el prefijo no acredita el año del plan y `officialCode` permanece `null`. Imagen y cotejo tienen hashes, fecha y estado `teamReviewed`; esta revisión del equipo no equivale a `clientValidated` ni se atribuye a Registro Curricular.

La interpretación aclarada por el líder produce 43 relaciones, 26 reglas simples, ocho `allOf` y 18 `pending`. Una flecha apunta a la asignatura que exige el requisito; varias entradas exigen todos los cursos. APS exige Dietética y Modelo de intervención; el integrador exige Proyecto de innovación, Gestión estratégica de sistemas y Nutrición clínica materno infanto juvenil. Internado APS exige sólo Proyecto de intervención comunitaria, por aclaración explícita, sin generalizar el corchete a otros internados. El cotejo identifica esa aclaración como fuente de la relación. La ausencia de flechas no confirma ausencia de requisitos: `none` exige confirmación expresa. No hay evaluación de habilitación ni simulación.

`2027-r1`, sus migraciones y registros publicados permanecen intactos y consultables donde estén instalados. La carga transaccional explícita prepara la nueva versión sin trasladar adscripciones ni historiales. El selector existente permite consultarla sin aplicar el historial de otra versión; no cambia la selección inicial del frontend. La preparación de demo rechaza un cambio de versión de un historial existente. La aceptación institucional de la historia y las dependencias de validación de fuentes siguen pendientes.

La propuesta de presentación de SCRUM-72 reutiliza el detalle de la malla: requisito simple por nombre, «Todos los siguientes» y «Al menos uno de los siguientes» con listas, ausencia confirmada sólo ante `none`, y estados «Pendientes de confirmación» y «Regla no soportada» con su explicación recibida. Las relaciones observadas se muestran aparte y no sustituyen esas condiciones. El diálogo permite teclado y retorno de foco. Los ejemplos de revisión son ficticios y no se publican ni se usan como reemplazo ante fallos del API. La consulta integrada de SCRUM-75 consume el catálogo versionado publicado por el API de SCRUM-74. «Información del plan» muestra el título, la fecha de revisión disponible y el estado de cada fuente recibido del API: demostración, revisión del equipo o validación institucional. La revisión del equipo mantiene explícita la validación institucional pendiente. La leyenda dice «Relaciones de referencia», sin confundir revisión de relaciones con confirmación oficial de requisitos. La aprobación del diseño de SCRUM-72, la aceptación de SCRUM-75 y la validación institucional de la fuente de SCRUM-71 siguen pendientes. La [matriz de aceptación](PRUEBAS-Y-ACEPTACION.md#consulta-académica) contiene el recorrido reproducible y sus límites.

La malla permite explorar conexiones directas e indirectas mediante mouse, teclado y toque, con contornos diferenciados y explicación del curso intermedio. El detalle conserva requisitos separados de relaciones visuales. Las conexiones se recorren localmente a partir de `prerequisiteEdges`; no calculan habilitación ni infieren reglas nuevas. El mockup de revisión usa datos ficticios separados del catálogo publicado.

En pantallas estrechas los semestres se apilan; en escritorio se conservan controles, arrastre y desplazamiento horizontal del tablero. Escape limpia la exploración o cierra el diálogo según el contexto; el foco vuelve al control de origen. Colores, transiciones y movimiento reducido pertenecen a componentes/CSS y se verifican en los recorridos de navegador de la matriz.

| Consulta | Ruta |
| --- | --- |
| Planes disponibles | `GET /api/v1/academic/plans` |
| Versión y asignaturas | `GET /api/v1/academic/plans/:planId/versions/:version` |
| Historial propio | `GET /api/v1/academic/me/progress` |
| Búsqueda docente | `GET /api/v1/academic/students` |
| Historial seleccionado | `GET /api/v1/academic/students/:studentId/progress` |

Las consultas validan la respuesta pública y distinguen vacío, error y falta de acceso. El historial sólo se muestra sobre el mismo plan/versión. El frontend no reemplaza errores con un catálogo fijo ni infiere «no cursada» de un historial inválido.

El docente combina nombre y prefijo de RUT con AND; la búsqueda espera 250 ms y la interfaz muestra seis resultados por página. «Cambiar estudiante» abre la búsqueda conservando el historial visible hasta elegir otro estudiante o editar la búsqueda, y «Cancelar» la cierra sin cambios; «Ver sólo catálogo» retira el estudiante seleccionado. El RUT conserva su texto, admite búsqueda con/sin puntos y verifica módulo 11 cuando está completo; no acredita identidad ni matrícula. La API admite paginación validada y escapa comodines de la búsqueda.

Los historiales de demostración distinguen aprobada, reprobada, en curso y no cursada. Muestran intentos numerados, estado del último intento y última nota aprobatoria. Las notas JSON son texto con coma y un decimal significativo, omitiendo el decimal cero: `4,1`, `6`, `6,5`; SCT sigue siendo numérico. La escala 1–7 y aprobación desde 4 corresponden a los datos ficticios acordados, sin inferir una política universal de notas. No hay edición pública de historiales, porcentajes ni persistencia de simulaciones.

## Persistencia y contratos

### Esquema administrativo

El diccionario y el diagrama siguientes corresponden al esquema `cenit` implementado en [autenticación](../db/schema/auth.ts) y [compras](../db/schema/purchases.ts). Las fuentes ejecutables son las migraciones SQL y los contratos [de autenticación](../packages/contracts/src/auth/index.ts) y [de compras](../packages/contracts/src/purchases/records.ts). SQL usa `snake_case` y el API `camelCase`. Una cuenta contiene un único rol textual; las autorizaciones se comprueban en servidor. Personal y Bienes conservan definición pendiente y carecen de tablas de negocio en este modelo.

#### Relaciones administrativas

```mermaid
erDiagram
    accounts ||--o{ sessions : "account_id"
    accounts ||--o{ purchase_requests : "created_by"
    accounts o|--o{ purchase_requests : "reviewed_by"
    purchase_requests ||--o{ purchase_request_lines : "request_id"
    purchase_sheets_outbox ||..o{ purchase_sheets_delivery : "purchase_id logico"
    accounts {
        uuid id PK
        text email UK
        text role
        boolean active
        text password_hash
    }
    sessions {
        text token_hash PK
        uuid account_id FK
        timestamptz created_at
        timestamptz expires_at
        timestamptz revoked_at
    }
    purchase_requests {
        uuid id PK
        uuid created_by FK
        uuid reviewed_by FK
        uuid operation_id
        text payload_hash
        numeric total_amount
        text source
        text review_status
        integer version
    }
    purchase_request_lines {
        uuid id PK
        uuid request_id FK
        integer position
        text provider
        text unit_code
        text project_code
        numeric amount
    }
    purchase_sheets_outbox {
        uuid purchase_id PK
        integer generation
    }
    purchase_sheets_delivery {
        text spreadsheet_id PK
        uuid purchase_id PK
        integer header_row
        integer_array item_rows
        integer synced_generation
    }
```

Las relaciones con cuentas e ítems son FK con `NO ACTION`. El borrado de una compra elimina explícitamente sus ítems en la misma transacción. `purchase_sheets_outbox.purchase_id` conserva una identidad lógica, incluso después de borrar la compra. La relación punteada entre outbox y delivery expresa esa asociación lógica; ninguna de las dos tablas tiene FK a la compra ni existe FK entre ellas. Esto permite completar la retirada de la copia de Sheets después del borrado local. Las claves compuestas y restricciones adicionales se detallan abajo.

#### Cuentas y sesiones

| Tabla y campos | Tipo, nulabilidad y restricciones | Significado |
| --- | --- | --- |
| `accounts.id` | UUID, PK | Identidad compartida por módulos |
| `email` | Texto obligatorio, único; 3–254 caracteres, minúsculas, sin espacios exteriores ni internos y formato de correo | Correo normalizado de acceso |
| `name` | Texto obligatorio de 1–200 caracteres, con contenido no vacío | Nombre mostrado |
| `role`, `active` | Texto obligatorio entre `docente`, `estudiante`, `administrativo`; boolean obligatorio, por defecto `true` | Un rol por cuenta; autenticación exige cuenta activa |
| `password_hash` | Texto obligatorio con formato scrypt-v1 fijado por el CHECK SQL | Hash de contraseña; el API no expone este campo |
| `created_at`, `updated_at` | `timestamptz` obligatorios, por defecto `now()`; actualización igual o posterior a creación | Fechas de la cuenta; actualizar exige escribir la nueva fecha en código, sin trigger automático |
| `sessions.token_hash` | Texto PK, SHA-256 hexadecimal de 64 caracteres | Hash del token de sesión; el token original viaja en cookie protegida |
| `account_id` | UUID obligatorio, FK a `accounts.id`; índice por cuenta | Cuenta autenticada |
| `created_at`, `expires_at` | `timestamptz` obligatorios; CHECK de expiración exactamente dos horas después de creación; índice de expiración | Plazo fijo, sin renovación por actividad |
| `revoked_at` | `timestamptz` nullable; si existe, igual o posterior a creación | Cierre o invalidación. La consulta de sesión exige ausencia de revocación y vigencia; el CHECK no ejecuta la expiración ni elimina filas |

La política de sesión y limpieza de borradores se mantiene en [Autenticación y sesión](#autenticación-y-sesión). Los perfiles académicos referencian la misma tabla de cuentas y se documentan en [Académico](#académico).

#### Cabecera de compras

Los campos de negocio siguientes viven en `purchase_requests`. Salvo indicación contraria, los opcionales admiten `NULL`, no cadenas vacías. Las cuatro propiedades obligatorias del ingreso son número, fecha, descripción y total; la estructura JSON completa se define en el contrato, incluyendo propiedades opcionales representadas como `null`.

| Campos SQL | Tipo y restricciones | Origen y tratamiento |
| --- | --- | --- |
| `id` | UUID PK | Identificador interno generado por Cenit |
| `operation_id`, `payload_hash` | UUID y texto obligatorios; UNIQUE(`created_by`, `operation_id`); hash SHA-256 hexadecimal de 64 caracteres | Identidad de operación y resumen del contenido de alta para reintentos |
| `request_number` | Texto obligatorio, 1–255 caracteres con contenido | Número documental recuperado o ingresado; conserva ceros y puntuación |
| `oracle_id`, `sender`, `recipient`, `attachment_reference` | Texto nullable, 1–255 caracteres con contenido cuando existe | ID visible, remitente, destinatario y referencia textual de anexos. Referencia no equivale a un archivo almacenado |
| `sent_date`, `sent_time` | Fecha obligatoria entre 0001-01-01 y 9999-12-31; hora textual nullable con formato `HH:mm:ss` | Fecha y hora documentales separadas; no se asigna zona institucional |
| `description` | Texto obligatorio de 1–1.000 caracteres con contenido | Descripción general de la solicitud |
| `total_amount`, `tax_amount` | `numeric(255,0)`, total obligatorio e impuesto nullable; no negativos, cero permitido y `NaN` rechazado | Montos documentales exactos en CLP; se comunican como cadenas de dígitos |
| `document`, `document_type`, `bi`, `rut`, `unit_name`, `item`, `payment_situation` | Texto nullable, 1–255 caracteres con contenido cuando existe | Seguimiento administrativo. Su almacenamiento textual no valida un significado o catálogo institucional |
| `source`, `example_id` | Origen obligatorio; ejemplo nullable y restringido por procedencia | `manual` sin identificador; `contract_example` exige `recovered`, `partial` o `ambiguous` |
| `extraction_id`, `processor_version`, `processed_at` | UUID, texto y `timestamptz`, nullables según procedencia | `image_capture` exige los tres y ausencia de `example_id`; versión de procesador de 1–100 caracteres permitidos y fecha finita. Manual/ejemplo requieren estos tres nulos |
| `review_status`, `version` | Estado obligatorio y versión entera positiva, valores iniciales `pending` y `1` | Estado de revisión de la copia en Cenit y control de concurrencia |
| `created_by`, `created_at` | UUID FK obligatorio y `timestamptz` obligatorio por defecto `now()` | Creador y fecha de incorporación a Cenit |
| `reviewed_by`, `reviewed_at` | UUID FK y `timestamptz`, ambos nullables | `pending` exige ambos nulos; `reviewed` exige ambos informados y fecha no anterior a creación |
| `request_number_search`, `description_search` | Texto generado por PostgreSQL con `normalize_purchase_search` | Claves auxiliares de búsqueda; el original se conserva. El cliente no las escribe |

El índice `purchase_list` ordena estado, fecha documental e ID. Número de solicitud e ID de Oracle no tienen restricción de unicidad institucional. `review_status` representa la copia local; la validación posterior sólo se ofrece cuando la capacidad correspondiente está habilitada. La FK acredita existencia de una cuenta; el permiso administrativo lo exige la aplicación.

#### Ítems de compras

Cada compra contiene de cero a cien ítems. Su posición es técnica y no corresponde al campo administrativo `item` de la cabecera.

| Campos de `purchase_request_lines` | Tipo y restricciones | Origen y tratamiento |
| --- | --- | --- |
| `id`, `request_id`, `position` | UUID PK, UUID FK obligatorio y entero obligatorio entre 1 y 100; UNIQUE(`request_id`, `position`) | ID técnico generado, compra asociada y orden del ítem. El repositorio asigna posiciones consecutivas desde 1 |
| `description` | Texto nullable de 1–1.000 caracteres con contenido | Descripción propia de la línea |
| `provider`, `cost_center`, `line_unit`, `quantity`, `charge_account` | Texto nullable de 1–255 caracteres con contenido | Proveedor, centro de costos, unidad, cantidad y cuenta de cargo visibles; cantidad y unidad conservan texto |
| `university_code`, `campus_code`, `unit_code`, `project_code`, `accounting_code` | Texto nullable de 1–255 caracteres con contenido | Componentes de código, sólo cuando se reciben o confirman; no se deducen equivalencias institucionales |
| `price`, `amount` | `numeric(255,0)` nullable; no negativo, finito, cero permitido | Precio e importe exactos, cadenas en JSON |
| `provider_search` | Texto generado con `normalize_purchase_search` | Búsqueda auxiliar, sin modificar el nombre original |

Los proveedores permanecen separados por ítem. Unidad y proyecto se filtran sobre el mismo ítem mediante `EXISTS`. La suma documental toma cada cabecera una vez. No existe regla que exija igualdad entre suma de ítems y total, ni tablas de imputaciones presupuestarias en esta implementación.

#### Cola y seguimiento de Sheets

| Tabla y campos | Tipo y restricciones | Función |
| --- | --- | --- |
| `purchase_sheets_outbox.purchase_id`, `generation` | UUID PK sin FK; entero obligatorio positivo, inicialmente 1 | Última generación de la copia que debe proyectarse; se incrementa dentro de la transacción local |
| `purchase_sheets_delivery.spreadsheet_id`, `purchase_id` | Texto y UUID obligatorios; PK compuesta | Seguimiento independiente por planilla y compra, sin FK para conservar bajas pendientes |
| `header_row`, `item_rows` | Entero nullable, si existe ≥2; arreglo de enteros obligatorio, por defecto vacío; UNIQUE(`spreadsheet_id`, `header_row`) | Filas asignadas para sobrescribir la misma proyección en reintentos. SQL no comprueba cada elemento de `item_rows`; los asigna el worker |
| `synced_generation`, `attempts` | Enteros obligatorios no negativos, inicialmente 0 | Última generación confirmada y contador de fallos |
| `next_attempt_at`, `last_synced_at`, `last_error` | `timestamptz` obligatorio por defecto `now()`; `timestamptz` nullable; texto nullable | Próximo intento, última confirmación y código de fallo. El worker guarda `SHEETS_SYNC_FAILED`, sin respuesta privada de Google |

El [repositorio de Sheets](../apps/api/src/modules/purchases/repositories/sheets.ts) usa un lock advisory para serializar entregas y procesa hasta diez trabajos por lote. Persiste las filas asignadas antes del HTTP. Si se pierde una respuesta, el reintento sobrescribe las mismas celdas. Registra la generación enviada, de modo que un cambio local posterior continúa pendiente. Un fallo conserva el trabajo y programa backoff con jitter; el guardado local ya confirmado permanece válido. La proyección se habilita explícitamente y su operación se explica en [Copia automática en Google Sheets](#copia-automática-en-google-sheets).

#### Transacciones, conflictos y procedencia

El [repositorio de compras](../apps/api/src/modules/purchases/repositories/purchases.ts) implementa las siguientes garantías. Son comportamientos del servidor además de las restricciones de tablas; los CHECK SQL no sustituyen la validación de contratos ni los permisos.

| Operación | Comportamiento implementado |
| --- | --- |
| Alta completa | Inserta cabecera, todos los ítems y generación de outbox en una transacción. Un fallo revierte todo. El API devuelve `201` sólo tras el éxito |
| Reintento de alta | La unicidad por cuenta/operación serializa reintentos concurrentes. El mismo contenido devuelve la copia existente con `200`; otro contenido devuelve `409 OPERATION_CONFLICT`. El hash de alta conserva la serialización histórica manual y añade procedencia para ejemplos y capturas |
| Edición | `PUT` exige `expectedVersion` y bloquea la cabecera. Reemplaza datos e ítems, incrementa versión y outbox, conserva identidad/procedencia y vuelve a `pending`, retirando revisión anterior. Una versión distinta devuelve `409 VERSION_CONFLICT`; un reintento con versión anterior y contenido idéntico al vigente devuelve ese registro. Los ejemplos se rechazan con `EXAMPLE_READ_ONLY` |
| Revisión local | La primera validación registra revisor/fecha e incrementa versión y outbox. Si ya está revisada, devuelve el estado existente conservando al primer revisor. Para una copia pendiente, una versión distinta produce conflicto |
| Eliminación | Exige versión esperada; elimina ítems y cabecera y encola retirada de Sheets en la misma transacción. Al borrar desaparece también la identidad de alta, por lo que reenviar luego esa operación puede crear otra copia |
| Captura | Extraer produce candidatos y un comprobante firmado asociado a la cuenta; no inserta una compra. Un alta posterior verifica procedencia y vigencia para operaciones nuevas. Se conservan metadatos de procesamiento, sin almacenar comprobante, imagen ni texto OCR completo en estas tablas |

El hash de alta se conserva al editar. Por eso un reintento del POST original identifica la misma operación y devuelve el estado actual de la copia, no una revisión histórica del contenido. La versión es un contador de concurrencia, no una tabla de auditoría de ediciones.

#### Ejemplos ficticios y límites del cotejo

Un folio `000125`, el código de unidad `00.027` y el proyecto `000000` se conservan como texto. Un total JSON `"9007199254740993"` se almacena exactamente como `numeric(255,0)` y vuelve como cadena; una suma de varias compras puede superar los 255 dígitos y se calcula con `sum(numeric)` sin convertir a número JavaScript. Un impuesto `"0"` es válido y un dato desconocido permanece `null`. El total `"1000"` con dos ítems de `"300"` y `"400"` es admisible porque esa igualdad documental no ha sido acordada como requisito.

Los [ejemplos completos validables](../packages/contracts/src/purchases/record-examples.ts) y [schemas de extracción](../packages/contracts/src/purchases/extraction.ts) conservan la forma JSON compartida; los valores anteriores son ilustraciones de campos, no una solicitud completa. Candidatos con estado y texto original pertenecen al contrato de revisión; la persistencia recibe valores revisados y procedencia. BI, ITEM, RUT y situación de pago siguen con significado institucional pendiente; Nº Documento mantiene una correspondencia provisional y los componentes de códigos requieren confirmación. No se completa información desde aprobaciones ni se crean catálogos institucionales por inferencia.

Este cotejo usa el SQL aplicado hasta `0009_purchase_sheets_sync`, Drizzle, contratos y repositorios del `develop` tomado como base de SCRUM-86. El [journal](../db/migrations/meta/_journal.json) y [aliases legados](../db/migrations/meta/_legacy.json) determinan el historial completo, incluido `0003_academic_progress` con su numeración original. El diccionario y el diagrama se elaboraron desde esas fuentes vigentes al no disponer de una referencia recuperable del entregable anterior mencionado en Jira. Se conservan el historial de Git y las contribuciones previas disponibles. La revisión documental de Gael y la aceptación de significados institucionales permanecen pendientes y son distintas de las garantías técnicas descritas.

Las migraciones administrativas relevantes son [cuentas/sesiones](../db/migrations/0002_auth_accounts_sessions.sql), [compras/ítems](../db/migrations/0003_purchase_requests.sql), [montos finitos](../db/migrations/0004_purchase_finite_amounts.sql), [origen de ejemplo](../db/migrations/0005_purchase_example_origin.sql), [búsqueda](../db/migrations/0006_purchase_search_keys.sql), [origen de captura](../db/migrations/0008_purchase_capture_origin.sql) y [Sheets](../db/migrations/0009_purchase_sheets_sync.sql). Se consultaron como evidencia y permanecen intactas.

Los objetos de negocio viven en el esquema PostgreSQL `cenit`. Cuentas, sesiones, compras, catálogo, perfiles, adscripciones e intentos tienen FKs y restricciones propias. Los repositorios usan consultas parametrizadas y transacciones; los montos no pierden precisión ni se duplican por joins.

Las respuestas del API y sus entradas se definen en `packages/contracts`. Los errores usan `{error:{code,message,requestId}}` y `X-Request-Id`, sin SQL ni trazas internas. Las respuestas protegidas llevan `Cache-Control: no-store`. Los consumidores validan el JSON; los tipos de TypeScript no reemplazan esa validación ni los permisos del servidor.

El runtime usa una credencial limitada; el migrador, otra separada. El esquema se aprovisiona antes de migrar. Para actualizar se usa exclusivamente `deploy/migrate.cjs`, con transacción, lock e historial verificado por timestamp/hash. No se editan ni renombran SQL ya aplicados.

El journal conjunto conserva las migraciones de compras y añade el SQL académico original `0003_academic_progress` como entrada 7; `meta/_legacy.json` reconoce su timestamp/hash anterior. No se exige que un historial previo sea un prefijo del journal combinado; entradas desconocidas, alteradas o duplicadas se rechazan. Las migraciones posteriores mantienen esa compatibilidad. Las migraciones y CD no crean cuentas, catálogo ni datos de demo.

El catálogo publicado es inmutable; su carga valida códigos, fuentes, referencias, profundidad y ciclos antes de publicar en una transacción. El historial académico mantiene FK a `cenit.accounts.id`, sin duplicar identidades para desbloquear un recorrido.

## Entornos y mantenimiento

[Desarrollo y demostración local](../deploy/LOCAL.md) explican configuración, preparación ficticia y arranque. `npm run dev` comprueba/verifica las tres cuentas de demo con los secretos locales antes de iniciar API/Vite; no migra ni carga catálogo o historiales. Esta preparación existente es exclusiva del arranque local. Las demás preparaciones son comandos explícitos y no se ejecutan desde CD.

[Azure](../deploy/azure/README.md) es el destino de entrega: `develop` despliega staging y `main` producción de la demostración, después de CI. El servidor anterior permanece como [referencia de transición](../deploy/README.md); no se retiran sus datos o servicios sin transferencia y recorridos verificados.

Readiness comprueba conexión, historial de migraciones, esquema y permisos del runtime; no exige datos sembrados ni finge disponibilidad. Los backups anteriores a una entrega y la recuperación de una imagen no acreditan una restauración completa de datos. La operación no debe borrar volúmenes, hacer prune global o restaurar datos automáticamente como rollback de una aplicación.

## Documentación y aceptación

Esta guía describe el funcionamiento que necesita comprender quien desarrolla o mantiene Cenit. Los comandos operativos tienen su guía propia y los criterios se relacionan con pruebas en la matriz. El Project Charter conserva la definición del proyecto; Jira y las actas registran compromisos y aceptación. La existencia de código o una prueba correcta no se presenta como validación del cliente.

El equipo confirmó Markdown del repositorio como formato de entrega documental. El SDD, README, guías y diagramas se revisan en el mismo cambio que el código correspondiente; cualquier exportación adicional requiere confirmar previamente su necesidad y formato. El procedimiento de carga de catálogo y el de recuperación pertenecen a la guía Azure, no se duplican en este documento.

Cuando cambia un comportamiento se actualiza su sección, manteniendo en Git el historial anterior. Las decisiones arquitectónicas relevantes conservan su motivo: monolito modular para el alcance actual, contratos compartidos para evitar diferencias entre consumidores, montos exactos para preservar datos documentales, OCR auxiliar para separar inferencia y persistencia, y reglas pendientes para no inventar condiciones académicas. Las notas de sesión y las listas de ajustes ya implementados pertenecen a la revisión del cambio, no a nuevos documentos permanentes.

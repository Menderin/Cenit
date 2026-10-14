# Cenit — Historias de usuario revisadas con INVEST

Revisión documental: 10 de octubre de 2026. Borrador de refinamiento; no acredita implementación, estimación ni compromiso del equipo.

## Decisiones, campos pendientes y aplicación de INVEST

Decisiones del líder: login local para el MVP, Google posterior y consulta de su necesidad el martes; docentes/estudiantes visualizan malla y prerrequisitos oficiales; administrativos gestionan compras sin acceso académico por defecto. Simulación y persistencia de simulaciones no entran en este MVP. Los IDs HU11/HU12 se conservan para el futuro. La pregunta inicial sobre permisos de simulación queda sustituida por esta aclaración de alcance.

Las cuentas las prepara el equipo; no se requiere registro público. Según Víctor, Luis Lanas recupera pantallazos de registros ya cargados en Oracle y los transcribe a Excel; la presentación mensual sigue por confirmar. Cenit recupera y ordena esa información, sin realizar compras ni escribir en Oracle. Tabla consultable y registros conservados en Cenit son el mínimo confirmado; Google Sheets es una mejora opcional, no comprometida, y exportación Excel no se añade por suposición. La actualización debe recuperar/reintentar datos, revisar cambios y aplicar los pertinentes a la copia; no se ha solicitado edición manual libre. Disparador manual o detección automática siguen por confirmar. El catálogo académico se almacenará en PostgreSQL.

En todas las historias y tareas, completar posteriormente estos campos: responsable, revisor, prioridad, estimación, fecha de inicio, fecha límite, estado, enlace de ticket/PR y evidencia. Ninguno se rellena automáticamente. Las fechas del hito global no son fechas individuales ni una estimación de esfuerzo.

INVEST: independiente, negociable, valiosa, estimable, pequeña y comprobable. Referencia: [Agile Alliance](https://agilealliance.org/glossary/invest/). Se redactan resultados completos de usuario, con criterios observables. La solución de diseño es negociable y las tareas propuestas pueden refinarse; las reglas acordadas del SDD no se cambian silenciosamente.

No se declara que las 12 historias cumplen INVEST por completo: la estimación y el tamaño requieren al equipo, y captura/prerrequisitos tienen dependencias externas. Se documentan esas limitaciones por historia. Para reducir dependencia entre historias, listado, detalle y edición pueden verificarse con registros ficticios persistidos de prueba, sin esperar a que funcione la captura automática. Una prueba con fixtures no acredita el recorrido completo de captura y registro.

Los mockups y las interfaces se desglosan por módulo administrativo y académico. La autenticación compartida se implementa una sola vez; esa reutilización no junta los entregables de interfaz. No se exige aquí un número de páginas de login ni URLs diferentes: el diseño de las entradas sigue siendo negociable.

## EP01 — Identidad y acceso

### S3-HU01 — Iniciar sesión con una cuenta local

**Alcance:** MVP.

**Descripción:** Como docente, estudiante o administrativo, quiero iniciar sesión con mi cuenta local para acceder al módulo correspondiente a mi rol.

**Criterios de aceptación:**

1. Dada una cuenta local válida, cuando envío credenciales correctas, se establece una sesión y accedo al módulo autorizado.
2. Con credenciales incorrectas, el sistema no establece sesión y muestra un mensaje comprensible sin revelar datos internos ni confirmar existencia de una cuenta.
3. Durante el envío se muestra el estado de la operación; un fallo de red permite reintentar sin afirmar acceso exitoso.
4. El formulario tiene etiquetas y puede completarse con teclado; las credenciales no se exponen en respuestas, logs ni repositorio.

**Decisión confirmada:** login local con correo/contraseña, un rol por cuenta y sesión de dos horas sin renovación automática; cuentas ficticias preparadas por el equipo, sin registro público ni envío de correos. Implementación de HU01-T03/T04 y API de HU03 en [AUTENTICACION.md](AUTENTICACION.md), pendiente de revisión/PR y pantallas para aceptación de la historia completa.

**Revisión INVEST:** resultado valioso y comprobable; independiente de compras y catálogo académico. Tamaño/estimación pendientes de cerrar contrato local. Diseño de entrada negociable.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU01-T01 — Mockup de acceso administrativo | Diseñar la entrada del administrativo y especificar campos, envío, errores y destino tras autenticar | Mockup identificable como administrativo; estados normal/enviando/error y destino documentados; campos pendientes marcados |
| HU01-T02 — Mockup de acceso académico | Diseñar la entrada de docentes/estudiantes hacia la malla con los mismos estados esenciales | Mockup académico separado; no contiene opciones de compras ni selección de rol para conceder permisos |
| HU01-T03 — Contrato y cuentas locales compartidas | Definir solicitud/respuesta de login, errores, modelo de cuenta/rol y preparación de cuentas ficticias; fijar mecanismo de sesión | Schemas compartidos validan casos válidos/inválidos; migración/modelo revisados; no hay credenciales en Git; decisiones registradas |
| HU01-T04 — Autenticación local en API | Implementar comprobación de credenciales y creación de sesión usando el contrato acordado | Casos válido/inválido cubiertos; contraseña protegida si se confirma ese mecanismo; rol obtenido del servidor; errores sin trazas internas |
| HU01-T05 — Interfaz de acceso administrativo | Construir el acceso administrativo con el diseño revisado e integrarlo con API | Estados reales de envío/fallo/éxito; acceso de cuenta administrativa probado; no usa éxito simulado |
| HU01-T06 — Interfaz de acceso académico | Construir el acceso académico e integrar cuentas docente/estudiante | Ambas cuentas acceden al destino académico; estados accesibles; no se duplica la lógica de autenticación del servidor |
| HU01-T07 — Verificación de login por módulo | Probar las entradas administrativa/académica con credenciales ficticias y fallos | Evidencia de éxito para los tres roles, credenciales incorrectas y error de red; criterios de historia comprobados sobre build |

**Seguimiento HU01-T04 (11 de octubre):** autenticación implementada; corrección de CI preparada, pendiente de publicación/revisión independiente/merge. [PR #7](https://github.com/Menderin/Cenit/pull/7) cerrado sin merge por solicitud del líder, quien creará el próximo PR. El [CI por push](https://github.com/Menderin/Cenit/actions/runs/38184387908) del commit `66e8bd7245f5989a868b99fc74e0adc602cc203d` pasó, pero [CI del PR](https://github.com/Menderin/Cenit/actions/runs/38184816686) falló por cierre forzado de una conexión durante la limpieza de tests, aunque sus 55 pruebas pasaron. Corrección y evidencia en [AUTENTICACION.md](AUTENTICACION.md); falta CI remoto de la corrección. Application omitido por frontend/build completo pendiente. No marcar HU01 completa mientras falten interfaces/recorrido sobre build.

### S3-HU02 — Acceder únicamente a funciones autorizadas

**Alcance:** MVP.

**Descripción:** Como usuario autenticado, quiero acceder a las funciones autorizadas para mi rol para trabajar en mi módulo con límites de acceso claros.

**Criterios de aceptación:**

1. Docentes y estudiantes pueden visualizar malla y prerrequisitos; no pueden acceder ni operar compras.
2. Administrativos pueden registrar, buscar, filtrar, consultar y editar compras; no tienen acceso académico por defecto.
3. Una solicitud directa a una página o API no autorizada se rechaza; ocultar enlaces no satisface el criterio.
4. Sin sesión no se entrega información protegida; manipular un rol en el cliente no modifica los permisos.

**Dependencia:** contrato de identidad de HU01. Puede verificarse con sesiones de prueba controladas; la aceptación final usa login real.

**Revisión INVEST:** valor y pruebas explícitos; dependencia acotada al contrato de identidad. No incluye administración de usuarios ni permisos configurables. Estimación pendiente.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU02-T01 — Matriz y autorización en API | Clasificar recursos administrativos/académicos y aplicar permisos según identidad del servidor | Matriz por operación revisada; API rechaza anónimos y roles ajenos; endpoints operativos clasificados sin exponer datos privados |
| HU02-T02 — Navegación administrativa | Definir y construir entradas de alta, listado, detalle y edición visibles para administrativo | Rutas/destinos documentados; acceso académico ajeno rechazado; estados de acceso denegado comprensibles |
| HU02-T03 — Navegación académica | Definir y construir navegación hacia malla/prerrequisitos para docentes/estudiantes | No aparecen acciones de simulación ni compras; enlaces y rutas protegidas funcionan |
| HU02-T04 — Verificación de permisos administrativos | Probar operaciones de compras con administrativo, docente, estudiante y sin sesión | Administrativo autorizado; demás accesos rechazados incluso mediante API directa |
| HU02-T05 — Verificación de permisos académicos | Probar catálogo académico con docente, estudiante, administrativo y sin sesión | Docente/estudiante autorizados; administrativo y anónimo rechazados; manipulación del cliente no concede acceso |

### S3-HU03 — Cerrar sesión y reconocer su expiración

**Alcance:** MVP.

**Descripción:** Como usuario autenticado, quiero cerrar mi sesión y recibir una indicación cuando expire para saber cuándo debo volver a autenticarme.

**Criterios de aceptación:**

1. Al cerrar sesión, deja de ser válida y no permite nuevas solicitudes protegidas.
2. La interfaz deja de mostrar datos protegidos de la cuenta anterior, incluso al navegar hacia atrás o cambiar de cuenta.
3. Con una sesión vencida se informa la necesidad de autenticar y no se confirma ni realiza un guardado automático.
4. La conducta de borradores al expirar se acuerda antes de implementar; no pueden quedar expuestos a otra cuenta.

**Decisión del 11 de octubre:** duración fija de dos horas, comprobación en servidor y logout revocable; API implementada con reloj controlado en pruebas. **Pendientes:** recuperación/descarte de borradores, pantallas y limpieza de caché. No asumir política de borrador por implementar el backend.

**Prueba mínima de interfaz del 11 de octubre:** acceso/salida y destinos aislados por rol implementados en frontend; limpieza de identidad/caché y aviso de invalidez comprobables en esas pantallas. Sin compras/malla ni borradores: HU03-T03/T04 y aceptación completa siguen pendientes de integración con módulos reales y política de borradores. Evidencia y comandos en [AUTENTICACION.md](AUTENTICACION.md).

**Aviso previo acordado:** mostrar advertencia cinco minutos antes de vencer, tiempo restante y «Cerrar sesión ahora», sin renovar las dos horas ni guardar automáticamente. Es común a los tres roles; no decide conservación/descarte de borradores.

**Revisión INVEST:** resultado verificable; contrato de sesión compartido con HU01. Si expiración/borradores impiden una entrega pequeña, dividir logout y recuperación de sesión en refinamiento, sin declararlos terminados juntos.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU03-T01 — Contrato de cierre y expiración | Documentar logout, invalidez de sesión y duración acordada; registrar tratamiento de borradores | Contrato y decisiones revisados; no queda un tiempo de sesión inventado; casos vencido/cerrado definidos |
| HU03-T02 — Invalidación en API | Implementar logout y rechazo de sesiones vencidas/cerradas | Una sesión invalidada ya no accede a recursos; verificación de expiración con reloj controlado |
| HU03-T03 — Cierre y expiración administrativos | Incorporar salida, aviso de expiración y limpieza de caché administrativa | No quedan compras de otra cuenta visibles; no se guarda automáticamente un borrador; comportamiento acordado cubierto |
| HU03-T04 — Cierre y expiración académicos | Incorporar salida y aviso de expiración en navegación de la malla | Catálogo protegido no continúa visible por caché de la cuenta anterior; no incluye persistencia de simulación |
| HU03-T05 — Verificación de cambio de cuenta | Probar logout/expiración y cambio de identidad en ambos módulos | Solicitudes posteriores rechazadas y ausencia de información de la cuenta anterior; evidencia por módulo |

## EP02 — Gestión de compras

### S3-HU04 — Recuperar automáticamente datos para su revisión

**HU04-T03, actualización del 12 de octubre:** contrato y pantalla ficticia de revisión implementados; [campos, schemas, límites y pendientes](EXTRACCION-COMPRAS.md). Sin OCR, ruta de extracción activa ni persistencia. HU04-T03 pendiente de revisión/integración; la historia no se considera completa hasta demostrar procesamiento real.

**Alcance:** MVP requerido; captura PNG/JPEG con procesamiento local o en equipo propio elegida el 13 de octubre, sin acceso a Oracle. Víctor realiza procesamiento/API y Gael el frontend. OCR móvil recomendado provisionalmente tras investigación local; implementación y ensayo de VM pendientes.

**Descripción:** Como administrativo, quiero recuperar automáticamente los datos de una compra y revisarlos para reducir la transcripción y detectar errores antes de registrarla.

**Criterios de aceptación:**

1. Una muestra admitida por la vía elegida genera datos candidatos mediante procesamiento real; no se presentan respuestas precargadas como extracción automática.
2. Campos recuperados y faltantes se distinguen; los valores desconocidos no se completan con información inventada.
3. Puedo corregir/completar los datos; extraer o revisar no guarda una compra automáticamente.
4. Entrada inválida, procesamiento parcial o fallo tienen un estado comprensible; puedo corregir o reintentar.
5. Formato, campos objetivo y tratamiento de la entrada tienen criterios acordados antes de acreditar extracción suficiente.

**Decisión de captura del 13/10, confirmada por el líder el 14/10:** no habrá acceso a Oracle ni a su API. Capturas PNG/JPEG y procesamiento local/en equipo propio son la vía de esta entrega. Se autoriza comparar OCR ligero con visión generativa. Investigación y evidencia: [INVESTIGACION-EXTRACCION-COMPRAS.md](INVESTIGACION-EXTRACCION-COMPRAS.md). No se realizó ni se atribuye una consulta directa a TI desde esta tarea. Pendientes: muestras representativas del cliente, exactitud aceptada, ensayo de recursos en VM e integración del endpoint y procedencia de captura real de SCRUM-45 con el contrato de guardado.

**Revisión INVEST:** valiosa/comprobable una vez fijado el conjunto de muestras/campos. Actualmente no es estimable ni de tamaño acreditado; necesita S3-HT03. El guardado está separado en HU05. Si es grande, dividir por una fuente/formato acordado, sin quitar automáticamente otros compromisos.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU04-T01 — Investigación y decisión de captura | Registrar ausencia de acceso Oracle y comparar modelo/máquina de extracción local con capturas ficticias, recursos, calidad y tiempos | Evidencia reproducible por campo y muestra, tiempos, recursos, límites y fallos; vía decidida o bloqueo, sin prometer API ni acreditar el endpoint de SCRUM-45 |
| HU04-T02 — Mockup de captura administrativa | Diseñar entrada según vía elegida, progreso, resultado parcial, revisión y error | Campos editables y ausencias visibles; extracción separada de guardar; no incluye interfaz académica |
| HU04-T03 — Contrato de extracción | Definir campos candidatos, ausencias, errores y límites de entrada sin reutilizar el POST de guardado como extracción | Schemas y ejemplos validables; campos/límites acordados; no se inventan requisitos de precisión |
| HU04-T04 — Adaptador de recuperación | Víctor implementa visión local de capturas y mapea candidatos al contrato, con procedencia real coordinada | Capturas ficticias procesadas realmente; fallos/ausencias no se convierten en datos válidos; no accede a Oracle ni guarda al extraer |
| HU04-T05 — Interfaz de revisión administrativa | Integrar entrada, progreso y corrección de datos candidatos | No persiste al extraer; conserva correcciones ante errores según contrato; ofrece continuidad a HU05 |
| HU04-T06 — Verificación de extracción y revisión | Ejecutar muestras admitidas, parciales e inválidas y contrastar resultado esperado | Evidencia por campo/muestra según criterio acordado; errores visibles; ninguna compra creada sin confirmación |

### S3-HU05 — Conservar una copia del registro recuperado

**Alcance:** MVP.

**Descripción:** Como administrativo, quiero conservar en Cenit una copia de los datos recuperados del registro de compra para consultarlos sin volver a transcribir el pantallazo.

**Decisión confirmada:** conservar registros y mostrarlos en una tabla en Cenit. Google Sheets queda como mejora opcional. Campos/imputaciones del SDD deben cotejarse con la información que realmente se necesita extraer. Esta historia no crea ni modifica una compra en Oracle.

**Criterios de aceptación:**

1. Con cabecera e ítems válidos, guardo la copia completa y recibo confirmación del servidor; no se exige igualdad entre suma de ítems y total.
2. Con campos inválidos, el servidor rechaza el registro sin persistir partes de él.
3. Un reintento con la misma identidad de operación no crea otra compra; referencia textual y ceros se conservan.
4. Tras reiniciar la aplicación, el registro sigue disponible en PostgreSQL; un fallo conserva el borrador sin mostrar éxito.

**Base acordada (13 de octubre):** solicitudes e ítems, montos exactos, revisión local e idempotencia del contrato vigente. No crear imputaciones presupuestarias ni exigir suma sin validar esas reglas con el cliente. El laboratorio transfiere ejemplos ficticios revisados sin extraer ni guardar automáticamente; la extracción real continúa en HU04.

**Revisión INVEST:** independiente del origen de datos mediante contrato de compra revisada; valor vertical verificable. Tamaño de transacción/idempotencia por estimar.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU05-T01 — Mockup de confirmación administrativa | Diseñar formulario con cabecera, ítems, errores y confirmación | Procedencia visible; estados guardar/error/éxito definidos |
| HU05-T02 — Esquema y migración de compras | Definir solicitudes/ítems, relaciones, montos exactos y procedencia; separar semillas demo | Migración PostgreSQL vacía/existente; claves, montos y coherencia del origen comprobados; sin datos ni secretos versionados |
| HU05-T03 — Contrato y alta transaccional | Validar cabecera/ítems y origen; POST atómico e idempotencia compatible | Schemas validables; ninguna copia parcial; reintentos manuales y de ejemplos sin duplicación; procedencia diferente genera conflicto |
| HU05-T04 — Formulario administrativo integrado | Transferir valores revisados en memoria y confirmar guardado por servidor | Éxito sólo tras respuesta correcta; validación visible; conserva borrador/operación ante fallo; distingue ejemplo ficticio; salida/expiración descartan datos |
| HU05-T05 — Verificación de consistencia y persistencia | Probar errores, rollback, reintentos concurrentes y reinicio real de API | Evidencia PostgreSQL; datos inválidos no dejan filas parciales; reintento no duplica; registro completo sigue disponible tras detener y arrancar el proceso |

**Estado de HU05-T02/T03/T04:** implementadas y verificadas localmente, pendientes de revisión, CI e integración. Evidencia: [COMPRAS.md](COMPRAS.md#evidencia-del-cierre-técnico-de-hu05). La transferencia del laboratorio es ficticia y no completa extracción real de HU04.

### S3-HU06 — Encontrar compras mediante búsqueda y filtros

**Alcance:** MVP.

**Descripción:** Como administrativo, quiero buscar y filtrar compras en una tabla para localizar los registros que necesito revisar.

**Criterios de aceptación:**

1. Búsqueda y filtros acordados del SDD devuelven registros coincidentes con orden y paginación definidos.
2. Filtros combinados de código de unidad/proyecto se aplican al mismo ítem de la solicitud, sin producir coincidencias falsas.
3. El total documental suma una vez cada solicitud del conjunto filtrado, independientemente de la página y del número de ítems; no representa pagos ni imputaciones.
4. La tabla muestra carga, vacío y error comprensibles; permite abrir un registro existente.

**Decisión confirmada para HU06:** búsqueda por número/descripción/proveedor, fecha de envío inclusiva y códigos textuales de unidad/proyecto; no UUID de catálogos. Una barra común filtra ambas tablas, con paginación y total documental propios. Importes imputados quedan fuera del modelo vigente; no calcularlos desde ítems. Contrato detallado en [COMPRAS.md](COMPRAS.md#hu06-búsqueda-filtros-y-total-documental).

**Revisión INVEST:** comprobable con registros persistidos ficticios, independiente de captura y alta en interfaz; alcance de filtros confirmado por el líder.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU06-T01 — Mockup de listado administrativo | Diseñar columnas, búsqueda, filtros, paginación, totales y estados | Campos/filtros trazables al SDD; totales etiquetados; navegación a detalle definida |
| HU06-T02 — Endpoint y consultas de listado | Construir GET con filtros validados, orden, paginación y agregados consistentes | Consultas parametrizadas; schemas de respuesta; filtros correctos y cabeceras no duplicadas |
| HU06-T03 — Tabla administrativa integrada | Implementar controles y resultados con consultas al servidor | Cambios de filtro/página muestran resultados correctos; estados vacío/error/carga visibles; no usa datos fijos |
| HU06-T04 — Verificación de filtros y totales | Preparar registros ficticios y probar coincidencias/combinaciones/agregados | Ítems A/X y B/Y no coinciden con A/Y; varias líneas no duplican cabecera ni monto; suma considera todas las páginas y el mismo snapshot |

**Estado de HU06-T02 y controles mínimos de HU06-T03:** implementados y verificados localmente, pendientes de revisión, CI e integración. Evidencia de contratos, consultas PostgreSQL concurrentes y recorridos reales de navegador en [COMPRAS.md](COMPRAS.md#evidencia-local-de-hu06). No acredita una aprobación del cliente ni una entrega integrada.

### S3-HU07 — Consultar una compra y sus imputaciones

**Alcance:** MVP.

**Descripción:** Como administrativo, quiero consultar el detalle de una compra para revisar sus datos, clasificaciones y estados registrados.

**Criterios de aceptación:**

1. Al abrir un registro existente veo sus datos persistidos y todas las imputaciones correspondientes.
2. Revisión en Cenit y pago declarado aparecen separados; no se presenta aprobación institucional.
3. Registro inexistente, error de consulta y acceso no autorizado producen respuestas comprensibles.

**Revisión INVEST:** entrega pequeña candidata y comprobable con registro ficticio persistido; no requiere que el usuario cree el registro por HU05. Estimación pendiente.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU07-T01 — Mockup de detalle administrativo | Diseñar documento, imputaciones, estados y navegación de retorno | Información trazable al SDD; estados revisión/pago separados; inexistente/error contemplados |
| HU07-T02 — Endpoint de detalle | Obtener registro/imputaciones por identificador y validar respuesta | Datos corresponden al identificador; inexistente y no autorizado diferenciados según contrato; sin trazas internas |
| HU07-T03 — Pantalla administrativa de detalle | Integrar consulta, presentación y retorno al listado | Muestra datos reales persistidos; estados comprensibles; navegación funcional |
| HU07-T04 — Verificación de detalle | Probar registro válido, inexistente, fallo y roles ajenos | Respuesta y pantalla coherentes; ninguna compra ajena al rol accesible |

### S3-HU08 — Actualizar la copia con información recuperada del origen

**Alcance:** necesidad funcional confirmada; mecanismo y compromiso temporal por concretar.

**Descripción:** Como administrativo, quiero volver a recuperar información y revisar diferencias respecto de la copia de Cenit para corregir fallos de extracción e incorporar cambios pertinentes realizados en el origen.

**Límite:** no modifica Oracle ni incluye edición manual libre confirmada. El líder mantiene pendiente si la recuperación se inicia por acción administrativa o por detección automática. Si la vía es imagen, sólo una captura actualizada permite observar cambios del origen. Recuperación completa frente a incremental depende de capacidades verificadas de la fuente; no se elige una por suposición.

**Criterios de aceptación:**

1. Si una recuperación falla, puedo reintentar mediante el mecanismo acordado; no se sustituyen datos válidos por resultados fallidos o parciales sin revisión.
2. Un resultado recuperado se asocia al registro de origen correcto; diferencias respecto de la copia vigente son revisables y no crean otra compra por error.
3. Cambios pertinentes y validados se aplican de forma atómica; sin cambios, la operación no duplica el registro.
4. Si la copia cambió durante la revisión, se detecta el conflicto y no se sobrescribe silenciosamente; la información pendiente de aplicar queda recuperable según política por acordar.
5. Se acuerda qué cambios se aplican, quién los confirma y cómo se dispara la recuperación antes de aceptar esta historia. Obtener una nueva captura o respuesta no acredita por sí solo actualización correcta.

**Revisión INVEST:** valor claro, pero estimación/tamaño pendientes de identidad de origen, recuperación y disparador. Se prueba con versiones ficticias del mismo registro; depende del adaptador de HU04. Si reintento y sincronización requieren trabajos distintos, dividir la historia en refinamiento sin elegir automáticamente un alcance menor.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU08-T01 — Contrato de recuperación y correspondencia | Definir identidad de origen, comparación, disparador, pertinencia y confirmación de cambios | Decisiones registradas; mismo origen no crea duplicados; disparador sigue pendiente hasta decisión; adaptar contratos anteriores sin asumir un PUT de edición libre |
| HU08-T02 — Mockup administrativo de cambios recuperados | Diseñar presentación de copia actual, datos nuevos, diferencias, fallo y conflicto | Diferencias comprensibles; acciones corresponden a mecanismo acordado; no se presenta edición libre como requisito |
| HU08-T03 — Recuperación y aplicación transaccional | Reutilizar adaptador HU04 para obtener datos y actualizar copia con validación, versión e idempotencia | Fallo conserva copia válida; cambios atómicos y trazables a resultado de origen; conflicto detectado; sin duplicados |
| HU08-T04 — Interfaz administrativa integrada | Conectar revisión de diferencias y aplicación según política acordada | Estado de recuperación/aplicación visible; éxito sólo tras servidor; error/conflicto no implica pérdida silenciosa |
| HU08-T05 — Verificación de actualización y reintentos | Probar fallo de extracción, mismo dato recuperado, modificación de origen y copia cambiada durante revisión | Evidencia de reintento correcto, cambio pertinente aplicado, copia válida conservada ante fallo y ausencia de duplicados/sobrescritura silenciosa |

## EP03 — Exploración y simulación curricular

### S3-HU09 — Visualizar la malla por semestre

Ampliación autorizada el 11 de octubre: consultar progreso persistido por estudiante y permitir búsqueda docente de estudiantes ficticios de Nutrición. No es una simulación. Separar HU09-T03 (catálogo) del entregable de perfiles/historial, dependiente de HU01-T03 para su FK real. Esquema, contratos, pruebas y pendientes en [ACADEMICO.md](ACADEMICO.md); no considerar la pantalla ni autenticación terminadas por disponer del backend probado con identidad de test.

**Alcance:** MVP.

**Descripción:** Como docente o estudiante, quiero visualizar las asignaturas por semestre para comprender la estructura de Nutrición y Dietética.

**Criterios de aceptación:**

1. Docente y estudiante visualizan nombres y distribución cotejados con la fuente recibida.
2. Internados de noveno/décimo respetan su agrupación de rotaciones; no se inventa una secuencia entre ellos.
3. Fuente y versión de trabajo están identificadas; no se afirma validación institucional no recibida.
4. Vista legible y operable con teclado, con estados de carga/error; no muestra acciones de simulación.

**Fuente disponible:** `Docs/malla-nutricion-y-dietetica-2027.pdf`. La etiqueta 2027 del folleto no sustituye confirmación de versión institucional del plan.

**Revisión INVEST:** puede entregarse sin simulación ni captura de compras. Catálogo recibido permite refinamiento y estimación; versión/campos faltantes documentados. Preparación de datos distinta del valor final de visualización.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU09-T01 — Mockup de malla académica | Diseñar organización por semestre, leyenda, fuente y estados de consulta | Diseño académico separado de compras; nombres largos legibles; internados agrupados; no hay acciones de simulación |
| HU09-T02 — Transcripción y cotejo del catálogo | Transcribir asignaturas/semestres y revisar contra PDF; registrar ausencias de códigos/reglas | Cotejo documentado; ninguna regla inferida; identificadores internos distinguibles de códigos oficiales no recibidos |
| HU09-T03 — Esquema PostgreSQL y contrato del catálogo académico | Definir plan/versiones, asignaturas, distribución por semestre, migración y endpoint de lectura | Migración probada en PostgreSQL; relaciones y constraints revisados; schemas y ejemplos de API; fuente/versión trazables; no añade tablas de simulación |
| HU09-T04 — Interfaz académica integrada | Construir la malla con catálogo del servidor y acceso docente/estudiante | Distribución coincide con fuente; navegación accesible; no depende de datos fijos en componentes ni permite simulación |
| HU09-T05 — Verificación de visualización académica | Cotejar contenido/semestres y probar carga, fallo y acceso de ambos roles | Evidencia de contenido correcto e internados; estados y teclado probados; administrativo rechazado |

### S3-HU10 — Consultar prerrequisitos oficiales

**Alcance:** MVP obligatorio, confirmado por el líder; fuente de reglas pendiente.

**Descripción:** Como docente o estudiante, quiero consultar los prerrequisitos oficiales de una asignatura para comprender las condiciones académicas para cursarla.

**Criterios de aceptación:**

1. Al consultar una asignatura, veo reglas trazables a una fuente oficial recibida y correspondiente al plan.
2. Requisitos conjuntos o alternativos se distinguen; ausencia de información no se muestra como ausencia de requisitos.
3. Las relaciones apuntan a asignaturas existentes; no se publica un catálogo con referencias rotas o ciclos no resueltos.
4. Si la fuente no permite representar una regla, se identifica como pendiente/no soportada; no se inventa una equivalencia.

**Dependencia externa:** Registro Curricular. El PDF de malla no contiene estas reglas. La historia no se acepta sólo por mostrar una etiqueta de información faltante.

**Revisión INVEST:** valiosa, con resultado separado de simulación. Todavía no estimable por formato y complejidad desconocidos; necesita fuente y S3-HT04. Prueba de motor con reglas ficticias no acredita requisitos oficiales.

| Tarea | Descripción | Criterios de aceptación de la tarea |
| --- | --- | --- |
| HU10-T01 — Solicitud y revisión de fuente curricular | Coordinar con Registro Curricular catálogo/reglas/versión y formato disponible; revisar exportación mínima o dump autorizado | Respuesta y permisos registrados o bloqueo visible; fuente permite rastrear reglas; no se versiona dump bruto ni historiales |
| HU10-T02 — Mockup de prerrequisitos académicos | Diseñar consulta de requisitos desde la malla, condiciones conjuntas/alternativas y ausencia de información | Representación comprensible con texto y teclado; diferencia sin requisito de desconocido; diseño no depende sólo de color |
| HU10-T03 — Modelo y validación de reglas | Mapear fuente verificada a contrato académico y comprobar relaciones/ciclos | Cada regla tiene trazabilidad; referencias válidas; AND/OR correctos; incompatibilidades registradas, sin inferencias |
| HU10-T04 — Publicación de reglas en API | Incorporar reglas validadas al catálogo/consulta académica del SDD | Respuestas con schemas y versión coherentes; fuente identificable; acceso según rol; no duplica modelos internos en contratos |
| HU10-T05 — Interfaz académica de prerrequisitos | Integrar consulta y presentación según diseño aprobado | Docente/estudiante ven reglas reales verificadas; desconocidas/no soportadas identificadas; no incorpora simulación |
| HU10-T06 — Verificación curricular y del recorrido | Cotejar reglas y probar consulta, AND/OR, referencias ausentes y fallo de carga | Evidencia contra fuente oficial recibida; errores de catálogo detectados; criterios de historia satisfechos |

### S3-HU11 — Simular asignaturas aprobadas

**Alcance:** futuro; fuera del MVP y sin compromiso del sprint 3.

**Descripción:** Como usuario académico autorizado, quiero simular asignaturas aprobadas para explorar cómo afectan a los requisitos de otras asignaturas.

**Criterios candidatos, pendientes de confirmación:**

1. La simulación se identifica como hipotética y no modifica historial institucional.
2. Marcar/desmarcar actualiza el escenario usando reglas verificadas, mostrando condiciones desconocidas.
3. Las inconsistencias se informan sin borrar automáticamente marcas de asignaturas dependientes, según base del SDD que debe ratificarse para esta iteración futura.

**Supuestos/preguntas futuras:** quién puede simular, posibilidad de múltiples escenarios y criterio de avance. No se responde automáticamente a estos asuntos ni se asignan fechas.

**Revisión INVEST:** candidata valiosa/comprobable; necesita confirmar alcance y tamaño en otra iteración. No consume capacidad del MVP.

| Tarea futura | Descripción | Criterios candidatos de aceptación de la tarea |
| --- | --- | --- |
| HU11-T01 — Refinamiento de simulación académica | Acordar usuarios, acciones permitidas y tratamiento de inconsistencias | Decisiones registradas y criterios revisados; no se presupone alcance definitivo |
| HU11-T02 — Mockup de simulación académica | Diseñar marcado, leyenda y efectos de requisitos | Escenario hipotético identificable; estados y accesibilidad definidos; separado del mockup de consulta del MVP |
| HU11-T03 — Modelo de simulación | Implementar evaluación con catálogo y marcas según reglas acordadas | Casos AND/OR y desconocidos correctos; no actualiza historiales reales |
| HU11-T04 — Interfaz y verificación académicas | Integrar marcado/resultado y probar los recorridos | Acciones actualizan escenario y muestran inconsistencias; criterios acordados cubiertos con evidencia |

### S3-HU12 — Conservar y reiniciar un escenario simulado

**Alcance:** futuro; fuera del MVP y sin compromiso del sprint 3.

**Descripción:** Como usuario de simulación, quiero recuperar mi escenario y reiniciarlo cuando decida para continuar o explorar otra alternativa.

**Criterios candidatos, pendientes de confirmación:**

1. Recuperación distingue usuario y versión del plan según política acordada, sin mostrar escenarios de otra cuenta.
2. Reiniciar requiere confirmación y no modifica el catálogo ni el historial institucional.
3. Un escenario corrupto/incompatible produce una recuperación comprensible, sin romper la vista.

**Pendientes:** guardar por cuenta o limpiar al logout; navegador o servidor; sincronización; migración entre versiones. La base anterior del SDD propone navegador, pero la nueva política con login no está decidida. No se crea una tabla de avance por suposición.

**Revisión INVEST:** futura; no estimable hasta acordar almacenamiento y política. Si conservar y reiniciar exceden el tamaño, separarlos en refinamiento de esa iteración.

| Tarea futura | Descripción | Criterios candidatos de aceptación de la tarea |
| --- | --- | --- |
| HU12-T01 — Política de persistencia académica | Acordar almacenamiento, aislamiento por usuario/plan y conducta de logout | Decisiones registradas; supuestos abiertos; contrato del SDD actualizado antes de implementar |
| HU12-T02 — Mockup de recuperación y reset académicos | Diseñar recuperar/reiniciar y confirmaciones o errores | Flujos y estados revisados; pérdida de escenario no sucede por acción involuntaria |
| HU12-T03 — Persistencia y recuperación | Implementar guardado/lectura e incompatibilidad según política elegida | Estado válido recuperable; cuenta/versión no se mezclan; corrupción manejada; sólo añadir BD si se acuerda |
| HU12-T04 — Reset y verificación académicos | Implementar confirmación de reset y probar recarga/cambio de cuenta/versión | Cancelar conserva estado; confirmar reinicia sólo escenario; casos de aislamiento y recuperación cubiertos |

## EP04 — Entrega y operación de Cenit: tareas técnicas

Estas fichas son tareas bajo la épica, no nuevas historias de negocio. Fechas, responsables, revisores, estimación y estado permanecen por definir. Los trabajos ya preparados se revisan/reutilizan: no se contabilizan como implementados por redactar la ficha. A continuación se separan CI, publicación y ensayo de operación.

### S3-HT15 — Levantar infraestructura base de Cenit con Podman

**Sprint:** sprint 3. **Estado de planificación:** añadida al backlog; ejecución pendiente de revisar/evidenciar por entorno. Responsable, revisor, prioridad, esfuerzo y fechas por definir.

**Descripción:** Preparar un entorno reproducible de contenedores para Cenit con red propia, PostgreSQL 17 persistente, proxy Nginx y configuración privada. Usar Podman como base de ejecución; en la VM, Podman rootless con Quadlet/systemd ya preparados. Reutilizar la infraestructura bootstrap existente y completar la definición local; el contenedor de aplicación se incorpora cuando exista la imagen verificable de HT05.

**Elección técnica de trabajo:** Podman mantiene continuidad con el SDD y la preparación de la VM. Docker de Zableke/Jenkins permanece independiente; no se migra ni se reutilizan sus recursos. No exigir instalar ambos motores para desarrollar. El procedimiento local, incluida Podman Machine si se usa Windows, requiere verificación antes de declararlo reproducible.

**Criterios de aceptación:**

1. Archivos/scripts de infraestructura y configuración de ejemplo están en el repositorio; otro integrante reproduce el entorno siguiendo documentación, sin contraseñas reales en Git.
2. Red, volúmenes y contenedores de Cenit tienen nombres propios y no entran en conflicto con Zableke/Jenkins ni sus puertos.
3. PostgreSQL es accesible desde el entorno autorizado de desarrollo/aplicación; no se expone públicamente para facilitar la conexión. Conserva datos ficticios después de recrear su contenedor.
4. Nginx/DB arrancan y se verifican en modo preparación; el proxy de VM usa la configuración existente de 8081. `/health/proxy` bootstrap no se presenta como aplicación lista.
5. Secretos, datos de volumen y estado operativo permanecen fuera de Git; imágenes de ejecución fijadas según contrato existente.
6. En VM, verificar servicios de usuario y continuidad al cerrar SSH mediante el mecanismo ya preparado; documentar evidencia, no exigir reinicio de la VM para acreditar esta tarea.
7. Documentar arranque, parada, verificación y conservación de volúmenes; declarar por separado qué se comprobó localmente y qué en la VM.

**Subtareas propuestas:**

| Subtarea | Descripción | Criterio de aceptación |
| --- | --- | --- |
| HT15-T01 — Revisar entorno y archivos existentes | Inventariar Podman, recursos Cenit, puertos, red y scripts bootstrap sin modificar servicios ajenos | Evidencia de configuración preparada y faltantes; no se vuelve a crear como trabajo nuevo lo ya verificado |
| HT15-T02 — Definir entorno local de contenedores | Preparar procedimiento y archivos para PostgreSQL/red/configuración; verificar runtime local del equipo | Arranque reproducible, conexión y persistencia probados; requisitos locales y limitaciones documentados |
| HT15-T03 — Verificar base de la VM | Comprobar Quadlet, DB, proxy, secretos e independencia de otros proyectos usando scripts preparados | Servicios/evidencias identificados; proxy en modo bootstrap distinguido de disponibilidad de app |
| HT15-T04 — Documentar y revisar infraestructura | Incorporar pasos de uso y evidencias en README/deploy, con revisión por otro integrante | Instrucciones repetibles, nombres/puertos explícitos, sin secretos ni pérdida involuntaria de datos |

**Archivos del repositorio que debe entregar o revisar la tarea:**

| Archivo | Trabajo requerido | Relación con otras tareas |
| --- | --- | --- |
| `compose.yaml` — nombre propuesto para entorno local | Crear definición de PostgreSQL, red y volumen; incorporar aplicación cuando exista imagen. Verificar proveedor Compose disponible para Podman y documentar comando exacto de arranque | HT15; no basta entregar YAML sin probarlo |
| `.env.example` — nombre propuesto | Documentar variables locales con valores ficticios/sin credenciales reales; asegurar exclusión del archivo de configuración privada | HT15; configuración de app coordinada con HT02 |
| `deploy/quadlet/*` | Revisar/reutilizar unidades existentes de DB, Nginx, red, volumen y plantilla de aplicación para VM | HT15; no reemplazar Quadlet por Compose en VM sólo por usar YAML local |
| `Containerfile` — por crear | Definir build de producción de frontend/API y migrador, compatible con contrato de CD | HT05; es dependencia de imagen/app, no trabajo duplicado de HT15 |
| `.github/workflows/ci.yml` — existente | Completar y verificar jobs de aplicación usando scripts/pruebas reales | HT14; infraestructura ya tiene workflow, no recrearlo como faltante |
| `.github/workflows/release.yml` — preparado, ensayo pendiente | Publicar imagen y manifiesto tras gates correctos sobre `main`, para ejecutor de VM | HT06; requiere aplicación, imagen y CI real |
| `README.md` y `deploy/README.md` | Registrar uso local, requisitos, comandos y diferencias con operación VM | HT15/HT11; documentación ejecutable verificada |

Los nombres propuestos de Compose/configuración local se concretan al implementar; no se afirma que esos archivos ya existan. Workflows de Actions viven en `.github/workflows`, contenedores locales en Compose y servicios de VM en Quadlet: tienen funciones diferentes. Un workflow YAML por sí solo no levanta contenedores ni acredita CD.

**Situación conocida:** el usuario ya acreditó bootstrap de Nginx/PostgreSQL y preparación del ejecutor CD en la VM. Eso es avance previo, no una aplicación desplegada. Esta tarea cubre revisar esa base y preparar el entorno local restante; no reinstalar por rutina ni duplicar HT05/HT07.

**Dependencias y límites:** leer `deploy/README.md` antes de operar. No depende de captura Oracle para preparar DB/red. HT02 inicializa aplicación/scripts; HT15 prepara infraestructura; HT05 construye imagen; HT06/HT07 despliegan y ensayan. La ejecución local requiere runtime disponible, sin instalar herramientas por la mera creación de esta ficha.

### S3-HT02 — Preparar la base ejecutable compartida

**Descripción:** Inicializar workspaces, lockfile y scripts reales; conectar frontend/API y PostgreSQL con configuración reproducible. Las migraciones y contratos específicos se implementan en sus tareas de historia, no dos veces.

**Criterios de aceptación:**

1. Otro integrante reproduce instalación/arranque mediante README y configuración de ejemplo sin secretos reales.
2. Versiones fijadas y scripts raíz exigidos por CI ejecutan verificaciones reales; se conserva el stack frontend.
3. Aplicación conecta a PostgreSQL y distingue readiness de disponibilidad del proxy.

**Dependencias:** compatibilidad de versiones y contratos del SDD; sirve de base a historias e infraestructura.

### S3-HT14 — Implementar el workflow de validación automática del repositorio

**Descripción:** Completar el workflow CI existente para ejecutar verificaciones de aplicación en PR y push según `deploy/CI-CD.md`, utilizando los scripts y pruebas preparados en S3-HT08.

**Criterios de aceptación:**

1. Ejecuta instalación reproducible, typecheck, lint, unitarias, integración contra PostgreSQL, build y E2E sobre build.
2. El check `CI required` refleja las verificaciones aplicables; un fallo de aplicación impide autorizar entrega.
3. Se acredita una ejecución correcta y una fallida controlada; no se admite omitir aplicación/pruebas para acreditar una entrega a `main`.
4. Permisos y configuración del workflow son acotados, sin secretos expuestos ni credenciales de la VM en pruebas.

**Dependencias:** HT02, HT08 y pruebas de historias. Implementar scripts/pruebas pertenece a HT08 y autores; conectarlos al runner pertenece aquí. No volver a crear desde cero el CI ya preparado sin necesidad.

### S3-HT05 — Construir el artefacto de producción

**Descripción:** Preparar y verificar imagen del monolito con frontend compilado/API y migrador separado, conforme al contrato existente de CD.

**Criterios de aceptación:**

1. Build de producción sirve aplicación en las rutas/puerto del contrato, con identidad de versión y health real.
2. Usa secretos por archivo, usuario/roles limitados y esquema PostgreSQL `cenit`; migración no utiliza credenciales runtime administrativas.
3. Respeta plataforma objetivo y contrato `deploy/CD-VM.md`; no añade semillas/reset automáticos de una base de ejecución.

**Dependencias:** HT02, entorno HT15, historias integradas y migraciones verificadas.

### S3-HT06 — Implementar publicación y despliegue automático

**Descripción:** Completar workflow de release para publicar imagen/manifiesto después de CI y promoción a `main`; conectar el productor con el ejecutor preparado en la VM.

**Criterios de aceptación:**

1. Publicación exige gates de aplicación correctos; nombres de jobs, artefacto y manifiesto respetan `deploy/CD-VM.md`.
2. Imagen fijada por digest y procedencia verificable; el consumidor rechaza releases inválidas o sin validación requerida.
3. El flujo PR a `develop`, promoción por PR a `main`, CI/publicación y consulta de release en VM está documentado y ensayado.
4. Una release válida produce un despliegue identificado sin builds o `git pull` manuales habituales en la VM; un fallo no se declara éxito.

**Dependencias:** HT14, HT05 y acceso a VM; evidencia operativa compartida con HT07 sin contar el ensayo dos veces.

### S3-HT07 — Ensayar despliegue, recuperación y contingencia

**Descripción:** Ejecutar una entrega válida y un fallo controlado de Cenit en la VM, comprobando persistencia y recuperación; ensayar la misma versión local como alternativa de presentación.

**Criterios de aceptación:**

1. Evidencia identifica release/commit/digest y disponibilidad de aplicación/BD; bootstrap no basta.
2. Respaldo previo a migración y persistencia acreditados; recuperación de aplicación/proxy no restaura datos automáticamente.
3. Fallo controlado deja estado verificable y procedimiento de recuperación ensayado sin alterar Zableke/Jenkins.
4. La alternativa local usa la misma versión y tiene instrucciones repetibles; limitaciones pendientes quedan en el informe.

**Dependencias:** HT06, acceso presencial a VM y build válido. El martes 13 es un hito de coordinación; la fecha de tarea y su compromiso siguen pendientes.

### S3-HT11 — Documentar arquitectura y operación

**Descripción:** Actualizar SDD, README y documentación de CI/CD/VM para explicar módulos, componentes, configuración, arranque, despliegue y recuperación de la implementación entregada.

**Criterios de aceptación:**

1. Describe frontend/API/PostgreSQL, separación administrativa/académica y flujo de una release; distingue preparado, implementado y pendiente.
2. Documenta variables y configuración de ejemplo, secretos por referencia, migraciones, health, diagnóstico y recuperación sin credenciales reales.
3. Instrucciones de arranque/verificación se reproducen; documentación enlazada y consistente con código y contratos vigentes.
4. Incorpora representación de arquitectura/flujo de entrega revisable; formato de entrega al cliente se confirma antes de producir versiones adicionales.

**Dependencias:** diseño y evidencias de HT02/05/06/07. Reutilizar documentos existentes en lugar de duplicarlos.

## EP05 — Base de calidad y validación: tareas de calidad y documentación

Estas fichas son tareas de soporte y entrega documental. Las pruebas específicas siguen en sus historias. HT08 prepara herramientas/cobertura; HT14, en EP04, ejecuta esa base en GitHub Actions. No son el mismo trabajo.

### S3-HT08 — Preparar pruebas y matriz de aceptación por módulo

**Descripción:** Configurar la base Vitest/integración PostgreSQL/Playwright y construir una matriz que relacione historias, criterios, casos y evidencias. Separar casos administrativos de académicos y compartir sólo fixtures/herramientas reutilizables.

**Criterios de aceptación:**

1. Scripts ejecutables y datos ficticios separados de ejecución; integración real en PostgreSQL, E2E sobre build.
2. Matriz cubre login/roles, recuperación parcial/fallida, persistencia, reintentos/cambios, tabla y malla/prerrequisitos oficiales.
3. Cada caso tiene precondición, entrada, resultado esperado y criterio asociado; cobertura ausente o fuente pendiente se registra.
4. No se incluyen simulación ni Google Sheets como compromisos de MVP; tests de historias no se duplican como trabajo separado de implementación aquí.

**Dependencias:** contratos y criterios de historias; los casos que requieren fuente externa no se acreditan sólo con reglas ficticias.

### S3-HT09 — Elaborar y entregar el Project Charter

**Descripción:** Redactar el documento de inicio que reúna problema, propósito, objetivos, interesados, alcance, entregables, organización, hitos, restricciones, riesgos y criterios de éxito del proyecto.

**Criterios de aceptación:**

1. Explica automatización de recuperación de registros existentes, visualización/prerrequisitos académicos y propósito de cada módulo.
2. Distingue alcance del proyecto y del MVP: simulación futura, Google Sheets opcional, Google posterior; Oracle/Registro Curricular como dependencias.
3. Roles, hitos y datos conocidos reflejan decisiones del equipo; objetivos medibles se acuerdan sin inventar precisión de extracción, presupuesto o aprobación institucional.
4. Documento versionado, revisable y enlazado; observaciones y estado de revisión visibles. Formato requerido e interesados no confirmados quedan pendientes.

**Dependencias:** decisiones de alcance y revisión del equipo. Esta tarea define el entregable, no acredita que el Charter ya esté redactado o aprobado.

### S3-HT12 — Documentar esquema de datos administrativo

**Descripción:** Preparar diagrama de relaciones y diccionario de datos para cuentas/roles y copia de registros recuperados, con restricciones, montos, correspondencia con origen y política de actualización acordada.

**Criterios de aceptación:**

1. Entidades, campos/tipos, claves, relaciones y restricciones coinciden con esquema/migraciones implementados; propuestas no implementadas se distinguen.
2. Explica origen y significado de campos recibidos; campos/imputaciones del borrador no se presentan como confirmados sin cotejo.
3. Documenta validación, atomicidad, idempotencia y conflictos; identidad de origen/disparador de actualización quedan pendientes si no están acordados.
4. Incluye ejemplos ficticios y referencia a contratos/endpoints; sin dumps brutos, credenciales ni modificación de Oracle.

**Dependencias:** HU01-T03, HU05-T02/T03, HU08-T01 y campos recuperables definidos. Implementar tablas/validaciones sigue en las historias; aquí se documentan y cotejan.

### S3-HT13 — Documentar esquema de datos académico

**Descripción:** Preparar diagrama y diccionario de PostgreSQL para plan/versiones, asignaturas, organización por semestre y prerrequisitos, con trazabilidad a fuentes académicas.

**Criterios de aceptación:**

1. Entidades, relaciones, claves y restricciones corresponden al esquema/migraciones de HU09/HU10.
2. Explica representación de reglas AND/OR, referencias y validaciones; fuente/versión identificadas, campos ausentes no inventados.
3. Distingue catálogo de datos personales/historiales; no añade persistencia de simulación fuera del MVP.
4. Incluye ejemplos verificables y vínculo a contratos de consulta; pendientes institucionales visibles hasta recibir fuente oficial.

**Dependencias:** HU09-T03 y HU10-T01/T03/T04. No duplicar la construcción del esquema en esta tarea documental.

### S3-HT10 — Elaborar informe de validación y ensayar presentación

**Descripción:** Consolidar resultados de pruebas, defectos, criterios cumplidos/pendientes y evidencia de versión; preparar instrucciones de uso por módulo y guion de demostración.

**Criterios de aceptación:**

1. Informe enlaza historia/criterio, caso, resultado real, versión y evidencia; no declara pruebas no ejecutadas.
2. Guía administrativa cubre recuperar/revisar/consultar y actualización sólo según mecanismo acordado; guía académica cubre visualización/prerrequisitos, sin simulación.
3. Ensayo sobre build identificado incluye login, tabla, malla/prerrequisitos y alternativa local; defectos y dependencias no resueltos se informan.
4. Documentos entregables enlazados, con fecha de revisión y estado; formatos solicitados y validación del equipo pendientes no se inventan.

**Dependencias:** HT08, pruebas de historias y evidencia HT07. El congelamiento del miércoles 14 es hito global, no aceptación automática de tareas.

S3-HT03 queda desglosado en HU04-T01; S3-HT04 en HU10-T01. Diseño global S3-HT01 queda sustituido por tareas de mockup específicas de cada historia/módulo. Registrar una sola vez el trabajo compartido para evitar doble conteo. Los contactos externos los coordina el equipo; este refinamiento no ha enviado mensajes ni obtenido acceso.

## Registro de pendientes para confirmar

| ID | Pendiente | Estado / historias afectadas |
| --- | --- | --- |
| Q01 | Identificador y preparación técnica de cuentas locales | Resuelto el 11 de octubre: correo/contraseña, un rol, comando de demo privado; sin registro público; HU01 |
| Q02 | Duración de sesión y conducta de borradores al expirar | Dos horas fijas confirmadas; conducta de borradores/interfaz pendiente; HU03 |
| Q03 | Capturas PNG/JPEG, muestras y criterio de extracción suficiente | API Oracle descartada; benchmark local ejecutado. Precisión institucional, recursos VM e integración pendientes; HU04 |
| Q04 | Fuente oficial de prerrequisitos y versión del plan | Prerrequisitos obligatorios confirmados; Registro Curricular pendiente; HU10 |
| Q05 | Esquema del catálogo académico | PostgreSQL confirmado; concretar tablas/relaciones/migraciones de HU09/HU10 |
| Q06 | Roles, alcance y almacenamiento de simulación futura | Fuera del MVP; HU11/HU12 |
| Q07 | Destino mínimo y mejoras de salida | Tabla y registros en Cenit confirmados; Google Sheets opcional sin compromiso; HU05/HU06 |
| Q08 | Actualizar copia a partir del origen | Recuperar/reintentar y revisar cambios confirmado; disparador manual/automático, identidad y pertinencia pendientes; HU04/HU08 |

Valoración actual: los resultados y criterios son más claros y las tareas son específicas por módulo. INVEST sigue pendiente en estimación/tamaño para todas y en independencia/viabilidad para las que dependen de fuente externa. Refinar esas dependencias antes de presentar el backlog como listo para compromiso.

### Actualización del 13 de octubre: ingreso manual y revisión local

Implementación de HU05-T02/T03/T04 y base de detalle HU07: dos tablas, alta transaccional idempotente, listados por revisión y detalle; campos mínimos número, fecha de envío, descripción general y total. «Validar registro» confirma revisión local y registra al administrativo, incluso si creó la copia; no aprueba en Oracle. Modelo vigente y adaptación de la propuesta antigua en [COMPRAS.md](COMPRAS.md). No se acreditan edición, búsqueda avanzada, sincronización ni extracción automática. Laboratorio separado; ingreso manual no sustituye HU04. Revisión independiente, integración y evidencia de Actions pendientes; no marcar completas las historias por implementación local.

HU03: borrador manual confirmado sin persistencia; conservar ante errores/foco válido, avisar antes de abandonar, descartar al cerrar/expirar sin guardado automático. El comportamiento anterior del laboratorio permanece acotado a ejemplos.

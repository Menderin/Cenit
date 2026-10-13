# Catálogo y progreso académico

Base de backend del 11 de octubre de 2026 para HU09-T03 y la ampliación autorizada de perfiles/progreso. La sección de frontend registra la primera vista preparada el 12 de octubre en `malla-interactiva`, pendiente de revisión/integración. No se implementan simulación ni importación institucional. Leer junto al [SDD](../AGENTS/SDD.md) y las [fichas del sprint](HISTORIAS-USUARIO-INVEST.md).

## Fuentes y decisiones

El equipo confirmó que [la imagen](Foto%20prerequisitos%20Nutricion.jpeg) corresponde al plan 2027 y que sus flechas representan prerrequisitos oficiales. Es confirmación del equipo, no validación independiente del cliente. La imagen manda para nombres y SCT; [el PDF](malla-nutricion-y-dietetica-2027.pdf) es complementario. Los hashes SHA-256 y la fecha de revisión están en `catalogs/academic/nutricion-2027-r1.json`. `teamReviewed` describe la referencia/documento, no certifica que cada flecha haya sido interpretada y cotejada por otro revisor.

Se transcriben 52 asignaturas, 305 SCT y 35 flechas observadas. Los primeros ocho semestres tienen 30 SCT cada uno; el bloque IX–X tiene 65. No se duplican internados ni se reparten sus créditos entre semestres. Los códigos `NUT2027-001` a `NUT2027-052` son internos; `officialCode` permanece `null`. Mantener esos códigos aunque se cambie el orden visual.

El PDF abrevia algunos nombres: por ejemplo, «Introducción a la Salud Pública» frente a «Introducción a los determinantes sociales de la salud y salud pública» en la foto. No mezclar nombres de ambas fuentes silenciosamente. El PDF indica rotaciones paralelas para IX–X; el modelo conserva el intervalo sin asignar una secuencia institucional.

**Revisión pendiente de HU10:** cotejar origen/destino de las 35 flechas; revisar especialmente las ramas entre Bases bioquímicas/Análisis alimentario, Nutrición básica/Diagnóstico nutricional y Planificación alimentaria/Dietética, y las líneas que llegan a los internados. Los cruces dudosos no se añadieron como relaciones confirmadas. Confirmar si varias entradas significan AND/OR y si un ramo sin flechas carece realmente de requisitos. Los resaltados amarillos no se interpretan como una regla adicional.

Todas las expresiones actuales usan `kind: pending`; cada flecha conserva `interpretation: pending` y su fuente. Esto permite visualizar relaciones observadas, **no presentar el catálogo como un conjunto completo de reglas interpretadas**. `none` requiere confirmación explícita. `allOf`/`anyOf` se conservan como formas de contrato, sin evaluar habilitación ni simular progreso. Corregir una versión publicada requiere crear otra versión (`2027-r2`, etc.).

## Persistencia

Tablas desplegables: `cenit.academic_plans`, `academic_versions`, `academic_sources`, `academic_courses`, `academic_prerequisite_edges`. Plan/versión únicos, códigos/orden únicos por versión, FK de flechas hacia cursos y fuentes de la misma versión. SCT en `numeric(6,2)`; semestres 1–20 y final mayor o igual al inicial.

Dos migraciones versionadas: catálogo y guards de publicación. El importador valida TypeBox, referencias, profundidad/hojas y ciclos antes de abrir la transacción. La publicación también rechaza ciclos en el grafo relacional. Los triggers bloquean cambios en cursos, fuentes, flechas, versión y nombre del plan publicado; bloquear la fila de versión impide carreras entre publicación y cambios de sus hijos. La carga usa transacción y advisory lock por plan/versión; repetir el mismo contenido no lo duplica. Otro contenido para el mismo identificador se rechaza. No modificar SQL ya integrado/aplicado; generar migraciones posteriores.

El migrador usa el lector de archivos/journal de Drizzle y un ledger compatible en `cenit.__drizzle_migrations`, con transacción, lock y comprobación de hashes/timestamps ya aplicados. El esquema `cenit` debe estar preparado por infraestructura: no ejecuta `CREATE SCHEMA`, que exige CREATE de base incluso con IF NOT EXISTS. Se ensaya sin ese permiso ni superusuario, conforme a la VM; no ampliar el rol para resolverlo. Rechaza historia alterada o una base más adelantada que el artefacto.

Las relaciones del historial en la rama `malla-interactiva` son:

```mermaid
erDiagram
    PLAN ||--o{ VERSION : contiene
    VERSION ||--o{ FUENTE : documentada_por
    VERSION ||--o{ ASIGNATURA : contiene
    ASIGNATURA ||--o{ PRERREQUISITO : origen_destino
    CUENTA ||--o| ESTUDIANTE : "FK a accounts.id"
    ESTUDIANTE ||--|| ADSCRIPCION : "un plan en la demo"
    VERSION ||--o{ ADSCRIPCION : cursada
    ADSCRIPCION ||--o{ INTENTO : registra
    ASIGNATURA ||--o{ INTENTO : corresponde
```

Ampliación solicitada por Gael el 12 de octubre: vincular el estudiante existente con RUT y consultar tres historiales ficticios desde docente. En `malla-interactiva`, `db/schema/academic-progress.ts` entra en `drizzle.config.ts` y la nueva migración `0003_academic_progress.sql`/snapshot/journal enlaza `account_id` con `cenit.accounts.id` del login integrado. No se modifican 0000–0002. La plantilla SQL con marcadores fue sustituida por esta migración; las pruebas usan cuentas reales del esquema auth, sin tabla de identidad sustituta. Se aplicó explícitamente en la base local de demo; revisión del equipo e integración de la rama siguen pendientes.

Historial: cuenta única por estudiante, RUT textual conservado, adscripción única a una versión para la demo, intentos numerados únicos por adscripción/asignatura, una sola inscripción en curso y FK compuestas para impedir mezcla de versiones. No se añaden períodos académicos oficiales, asignaciones docente-estudiante ni tablas de simulación.

Estados: `passed`, `failed`, `inProgress`; `notTaken` se deriva de ausencia de filas. Nota `numeric` entre 1 y 7, con CHECK que exige como máximo un decimal significativo: aprobado desde 4, reprobado bajo 4, en curso con `null`, sólo para los datos ficticios acordados. No usar coerción de escala para redondear valores de mayor precisión silenciosamente. La respuesta muestra el estado del último intento, todos los intentos ordenados y la última nota aprobatoria registrada. El conteo incluye el intento en curso. No hay porcentaje ni créditos completados.

## Contrato de lectura y conexión con login/frontend

Schemas y tipos públicos: `@cenit/contracts/academic`; ejemplos compilables: `@cenit/contracts/academic/examples`. No importar modelos Drizzle en el frontend.

| Ruta | Permiso |
| --- | --- |
| `GET /api/v1/academic/plans` | Docente y estudiante |
| `GET /api/v1/academic/plans/:planId/versions/:version` | Docente y estudiante |
| `GET /api/v1/academic/me/progress` | Estudiante; cuenta obtenida de sesión |
| `GET /api/v1/academic/students` | Docente; todos los ficticios de Nutrición |
| `GET /api/v1/academic/students/:studentId/progress` | Docente |

Listado de estudiantes: nombre parcial (ILIKE con comodines escapados), prefijo de RUT, combinación AND. `page` predeterminado 1 y `pageSize` 20 (máximo 100); la interfaz solicita seis por página. RUT: búsqueda sin puntos/guion y con K mayúscula; el servidor comprueba módulo 11 cuando el filtro está completo. Los prefijos numéricos de hasta ocho cifras no requieren DV; un cuerpo de siete cifras con DV numérico se distingue mediante guion. Consultas parametrizadas y snapshot de lectura para conteos/datos coherentes. La clave persistida anterior se conserva: no se modifica el esquema ni migraciones aplicadas.

Respuestas: `{data: ...}`; lista de estudiantes añade `page`, `pageSize`, `totalItems`. El catálogo conserva los campos previos y añade `semesterEnd`, `codeKind`, `officialCode`, `displayOrder`, `sources`, hashes/fechas y `prerequisiteEdges`. Nuevo caso `pending` en la unión de reglas. Los consumidores de catálogo, búsqueda e historial de `malla-interactiva` validan los contratos existentes; no cambian sus schemas. Su integración permanece pendiente.

Corrección del líder: las notas JSON son **cadenas con coma y un decimal**, omitiéndolo cuando es cero: `"4,1"`, `"6"`, `"6,5"`, o `null` si no existe nota; los SCT siguen siendo números. PostgreSQL usa su representación numérica interna con punto; el repositorio convierte sólo la presentación. `6.0` se muestra como `6`, sin cambiar su valor. Una nota con más de un decimal significativo se rechaza; no se inventa una política de redondeo. La unión de intentos distingue nota aprobatoria, reprobatoria y ausencia de nota en curso. Frontend/login deben consumir este contrato corregido, no la propuesta anterior de dos posiciones.

Errores públicos `{error:{code,message,requestId}}` y header `X-Request-Id`: 400 `VALIDATION_ERROR`, 401 `AUTHENTICATION_REQUIRED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 503 `SERVICE_UNAVAILABLE` y 500 `INTERNAL_ERROR`; sin SQL, configuración privada ni trazas. Cache-Control `no-store` en las respuestas. No hay rutas de escritura.

El plugin recibe `authenticate(request)` desde login y espera `{accountId,role}` obtenido del servidor. No analiza tokens ni acepta rol/identidad del body, headers o query por sí mismo. Sin adaptador devuelve 401. Los Bearer de prueba sólo existen en el harness de integración; no son cuentas reales ni una implementación de autenticación. Roles administrativos rechazados; docente no usa `/me/progress`, estudiante no lista ni consulta otros estudiantes. Progreso sin migración vinculada produce 503.

## Comandos

### Ajuste puntual de UI/UX — 13 de octubre

Por petición de Gael, se conserva la malla compacta original de 68 px, columnas/títulos, barra lateral y escala del detalle. Sólo las acciones superiores y los campos Nombre/RUT pasan discretamente de 32 a 36 px. Nombre/RUT y los estudiantes disponibles aparecen directamente al entrar como docente, sin «Buscar estudiante» ni «Ocultar búsqueda». La selección recoge la búsqueda y permite «Cambiar estudiante». Al entrar se conserva el foco del título; al cambiar estudiante el foco va a Nombre. Se mantienen búsqueda automática y combinación AND. Login/compras conservan su escala anterior.

Se retiran «Plan 2027» cuando existe una única versión, la ayuda textual de búsqueda y «Prerrequisitos en revisión» del tablero. La versión sigue en el detalle y el selector aparece cuando hay varias versiones. El detalle simplifica etiquetas repetidas y mantiene una aclaración contextual sobre las relaciones, sin confirmar ausencia, AND/OR ni habilitación. Catálogo/API, permisos y preparación de datos permanecen intactos. Las comprobaciones se ejecutan una vez cerrado este ajuste visual, conforme a lo solicitado por Gael.

Verificación final con Node 24.21.0/npm 11.19.0: lint, typecheck, catálogo, 75 unitarias, 90 de integración PostgreSQL y build completo correctos. Los 49 recorridos de Chrome quedaron verificados (48 en la ejecución general y el recorrido de densidad repetido con éxito tras ajustar sólo su posición esperada a los controles de 36 px); las seis filas en 1280×720 y las 52 tarjetas en 1440×900 siguen exigidas. Los 19 E2E académicos en WebKit también pasaron contra el servidor compilado y PostgreSQL descartable. Capturas de escritorio/móvil revisadas. El build conserva el aviso de bundle mayor de 500 kB; esta comprobación local no acredita revisión independiente, CI remoto ni integración.

### Búsqueda y RUT — 13 de octubre

Por petición de Gael, nombre y RUT filtran automáticamente tras 250 ms sin escribir, conservando AND y volviendo a la primera página al cambiar un filtro. Se ocultan coincidencias anteriores mientras cambia la consulta; cada búsqueda conserva su propia clave/cancelación. La demo mantiene las tarjetas, con un máximo de seis por página y rango visible sobre el total: 40 estudiantes se recorren en siete páginas.

El RUT agrega puntos al escribir el cuerpo y guion al ingresar el DV (ejemplo `211234563` → `21.123.456-3`), acepta pegado con/sin puntuación, K minúscula y edición con cursor. Un RUT completo incorrecto muestra un error accesible y no se consulta; el servidor aplica la misma validación. Helpers públicos en `packages/contracts/src/academic/rut.ts`. Módulo 11 verifica coherencia matemática, según el [manual del SII](https://www.sii.cl/ccp/formato_envio_cp_electronico.pdf); no acredita identidad, matrícula ni existencia institucional. No se restringe a 20–22 millones: ese rango se usa sólo en los tres ejemplos ficticios.

La preparación explícita valida los RUT completos y mantiene los rechazos de perfiles/intentos incompatibles. `--normalize-ruts` permite sustituir únicamente el valor ficticio anterior esperado cuando ID, cuenta y nombre coinciden, dentro de la transacción de preparación; otro valor se rechaza y cualquier fallo revierte la corrección. Cuentas, contraseñas, adscripciones e intentos se conservan. No hay escritura pública de perfiles ni migración nueva.

Verificación local: build completo, lint, typecheck, 75 unitarias y 90 integración PostgreSQL correctos; 49 E2E de académico/auth/compras en Chrome y 19 académicos en WebKit, ambos contra el servidor compilado. Incluye búsqueda al escribir, nombre/RUT combinados, DV incorrecto, K/0, prefijos, edición/borrado, respuesta tardía y 40 resultados paginados (respuesta controlada en navegador; paginación real también cubierta en PostgreSQL). Se ejecutó explícitamente la corrección de los tres RUT en `cenit_demo`, se reinició desarrollo y se comprobó su API/interfaz con capturas de 1440×900 y 390×844. Node 24.16.0/npm 11.13.0 disponibles: no acredita las versiones fijadas 24.21.0/11.19.0, Safari nativo, CI remoto ni revisión/integración del equipo.

### Vista de catálogo y avance — 12 de octubre

Preparada en `malla-interactiva` para SCRUM-65/68: columnas cronológicas y un único bloque IX–X; nombre/SCT, detalle con código interno/oficial ausente, relaciones observadas y versión. Ventana estrecha reorganiza los semestres en grupos verticales, manteniendo el orden. La navegación, el marco claro y el detalle son una primera propuesta visual revisable, no aprobación del equipo ni cierre de la historia.

Ajuste visual posterior solicitado por Gael: retirar «Fuente del plan»/«Fuente y versión» de docente y estudiante y el bloque UCN/Facultad de Medicina inferior. Se elimina la vista dedicada de documentos/revisión; la procedencia permanece en catálogo/API/documentación, sin alterar datos o validaciones. La barra lateral sigue las referencias claras B/C: marca compacta, grupo desplegable Nutrición → Malla, selección blanca con sombra leve, cuenta al final y contenido blanco con margen interior. Phosphor utiliza `regular` en opciones no seleccionadas y `fill` en la activa, también al seleccionar un estudiante. La consulta de asignaturas conserva estados pendientes y versión.

Revisión de tarjetas del mismo día solicitada por Gael: grilla con tarjetas de altura uniforme (140 px), nombres completos y una fila inferior para estado/nota y SCT. Las superficies tienen un degradado pastel suave, siguiendo el horario aportado como referencia: verde aprobado, rosa reprobado, lavanda en curso y azul para no cursada. La vista de sólo catálogo usa azul como superficie sin atribuir un estado académico. Bordes neutros, sin franjas de estado; el texto y la leyenda conservan el significado del historial. No se asignan áreas formativas ni disponibilidad a partir de otras mallas. Se conserva el marco/navegación de las referencias claras y el bloque IX–X.

Auditoría de componentes: React, Vite, TypeScript, React Router, TanStack Query, Tailwind y Phosphor están incorporados. Esta pantalla usa componentes propios y controles nativos (`button`, `select`, `details`, `dialog`); todavía no incorpora piezas shadcn/ui. Su selección sigue pendiente dentro del stack previsto, sin atribuir a las imágenes una biblioteca no verificada. El ajuste visual no cambia dependencias ni el lockfile.

Verificación del ajuste: typecheck y build web con Node 24.21.0/npm 11.19.0; 29 E2E (17 auth, 12 académico) sobre el build, Chrome instalado y PostgreSQL descartable. El recorrido responsive comprueba igualdad de ancho/alto de las 52 tarjetas, nombres completos sin solapamiento y estado/SCT dentro de la tarjeta entre 320 y 1920 CSS px. Capturas de escritorio/móvil revisadas contra B/C/D y el horario aportado. No se repiten unitarias/integración de backend en este ajuste de presentación; Safari, CI remoto y revisión/integración siguen pendientes.

### Simplificación visual aprobada por Gael — 13 de octubre

La cabecera reúne título, carrera, plan y una indicación de demostración. Navegación de 200–220 px plegable; semestres visibles sólo como I–VIII e IX–X, con nombres accesibles completos. Se retiran breadcrumb, «Por semestres», conteos y totales por columna. Una sola versión se presenta como texto; el selector aparece cuando hay varias y conserva la coherencia con el historial.

Tarjetas uniformes de **104 px**, con nombre de hasta cuatro líneas, elipsis cuando sea necesaria, estado textual y SCT. Nombre completo en la etiqueta accesible y al abrir por teclado/toque; estado/SCT también describen la tarjeta para lectores de pantalla. Se conservan fondos pastel y bordes neutros. La altura de 140 px y los nombres siempre completos dentro de las tarjetas describen la revisión anterior. No se cambian nombres, créditos ni agrupación del catálogo para compactarlo.

La búsqueda docente comienza cerrada con «Buscar estudiante» y consulta al abrir, conservando los dos filtros y su combinación AND. Seleccionar recoge la búsqueda y muestra identidad/RUT, «Cambiar estudiante» y «Ver sólo catálogo»; estudiante ve identidad y leyenda compactas. Las notas pasan al detalle: último estado/nota, prerrequisitos/relaciones, historial de intentos recogible e información secundaria del plan. La última nota y la última nota aprobatoria siguen diferenciadas. `pending` conserva advertencia breve, explicación contextual y descripción recibida en la información secundaria; no se infiere habilitación ni ausencia de requisitos.

Los E2E verifican densidad (cuatro filas completas en 1280×720 y las 52 tarjetas en 1920×1080 con búsqueda cerrada), navegación plegable, nombre completo accesible sin solapamiento, notas/intentos, cambio de perfiles y aislamiento entre versiones. En móvil, grupos verticales con una o dos tarjetas por fila. La preparación de datos, permisos, API y contratos permanecen vigentes; la aprobación visual de Gael no acredita integración ni revisión del equipo.

Verificación del 13: typecheck y build web correctos con Node 24.21.0/npm 11.19.0; **31 E2E correctos** (14 académicos, 17 auth, última ejecución 34,9 s), sobre el build final y PostgreSQL descartable usando Chrome instalado. Capturas revisadas en 1280×720, 1920×1080 y 390×844; reflow y detalle comprobados por E2E entre 320 y 1920 CSS px. No se repiten unitarias/integración de backend sin cambios de esas áreas. Safari, zoom real al 200%, CI remoto y revisión/integración del equipo siguen pendientes.

Continuidad solicitada por Gael: **68 px de alto**, columnas de al menos 120 px y etiquetas breves de hasta dos líneas, como «Cs. alimentos» y «Bases bioquímicas». Los nombres breves viven sólo en `apps/web/src/features/academic/model/course-label.ts`, seleccionados por coincidencia exacta con el nombre recibido; otros nombres conservan el original. Se distinguen niveles y ramos diferentes. El nombre completo se conserva en el detalle y en la etiqueta accesible junto al nombre visible; catálogo, contratos, código/SCT e historial no se modifican. Los 104 px anteriores describen la primera simplificación. Se actualiza la aceptación visual a seis filas completas en 1280×720 y 52 tarjetas visibles en 1440×900.

Verificación de nombres breves: typecheck/build correctos; **31 E2E correctos** en 33,3 s sobre el nuevo build y PostgreSQL descartable, Chrome instalado. Comprueban etiquetas distintas para los 52 ramos, nombre completo al abrir y en el nombre accesible, etiquetas visibles sin recorte/solapamiento entre 320 y 1920 CSS px y las metas de densidad anteriores. Capturas de 1440×900 y 390×844 revisadas; Safari, zoom real al 200%, CI y revisión/integración siguen pendientes.

La pantalla usa los dos GET de catálogo y los tres de búsqueda/progreso con validación TypeBox, QueryClient/sesión/transporte existentes y claves por cuenta/plan/versión/estudiante/filtros. Consulta limitada a 15 segundos; hasta dos reintentos sólo por red/503; cancelación mediante AbortSignal. Sin catálogo publicado, estado vacío; errores o respuesta inválida no se sustituyen por datos locales. Logout/401/expiración ocultan catálogo y detalle. La ampliación posterior aplica la migración de perfiles y preparación explícita de `cenit_demo`; rutas/contratos y lógica de sesión permanecen intactos.

Detalle mediante `<dialog>` nativo: foco, Escape y regreso a la asignatura/acción de origen. `pending` conserva su explicación y `none` sólo se presenta cuando llega explícitamente en el contrato; no se infiere ausencia ni AND/OR de las flechas. Estudiante consulta su RUT/historial por sesión; docente busca nombre/RUT y selecciona un perfil. La búsqueda se recoge al seleccionar, con foco en «Cambiar estudiante», para conservar espacio de malla. Se muestran estados textuales, notas con coma e intentos; ningún perfil/historial ausente se convierte a `notTaken`. Historial de otra versión no se dibuja sobre la versión seleccionada. No hay simulación, disponibilidad, porcentajes, edición ni nuevas reglas oficiales.

Después de `npm run build:web`, ejecutar `npm run test:e2e:auth` y `npm run test:e2e:academic`. La configuración académica reutiliza servidor/API/PostgreSQL descartables; carga el catálogo sólo en esa base y elimina sus recursos al finalizar. Vitest incluye los tests web puros junto a API/contratos. CI conecta ambos recorridos en la etapa parcial; main/entrega permanecen bloqueados. La rama `malla-interactiva`, elegida por el usuario sin prefijo, no dispara CI por push bajo los filtros actuales: el PR hacia develop ejecutará las comprobaciones. No se modifica esa política ni se publica una entrega desde esta implementación local.

Evidencia local del 12 de octubre tras conectar historial: typecheck y build web correctos, 45 unitarias, 59 de integración PostgreSQL y 29 E2E (17 auth, 12 académico) correctas sobre el build/API/PostgreSQL descartable. Incluye FK real, preparación repetida/concurrente y rechazo de sobrescritura, búsqueda/RUT normalizado, notas/intentos, acceso propio y respuestas tardías. Se verificaron los tres roles contra la API local de desarrollo tras preparar los datos, cerrando sólo las sesiones de verificación. Se usó Chrome instalado mediante configuración privada, no el Chromium fijado de CI. Se comprobó reflow entre 320 y 1920 CSS px y detalle/teclado; Safari, zoom/ventanas físicas del usuario, CI remoto y revisión independiente siguen pendientes.

Corrección de foco solicitada por Gael el 13: al cerrar el detalle con Escape, el recuadro azul era el indicador `:focus-visible`, no una selección persistida. Las tarjetas usan ahora un borde interior neutro para teclado. Al volver a pulsar con el puntero una tarjeta que conserva ese foco, se reenfoca para evitar arrastrar el indicador de teclado. El diálogo sigue devolviendo el foco al ramo. Typecheck/build web y **14 E2E académicos correctos** (21,5 s), con Chrome instalado y PostgreSQL descartable; cobertura de Escape, foco visible y reapertura/cierre con mouse. Esta ejecución usó Node 24.16.0/npm 11.13.0 disponibles en la sesión; no acredita el runtime fijado 24.21.0/11.19.0, Safari, CI ni revisión/integración.

Continuidad del 13 para Safari: se reprodujeron en WebKit el borde azul de la X al abrir y el borde del tablero tras cerrar con clic fuera, tanto en estudiante como en docente. La vista académica distingue eventos de puntero y teclado para mostrar el indicador de botones/tablero sólo durante la navegación por teclado; los campos de texto conservan su indicador. Se sustituye el desenfoque anterior de tarjetas por foco explícito sin desplazamiento antes de abrir: Safari no enfoca el botón al pulsarlo y el diálogo necesita ese origen para devolver el foco al ramo. **Tres E2E de foco correctos en WebKit** cubren apertura con mouse, X, clic fuera, Escape, regreso al ramo y recuperación del indicador con teclado. Typecheck/build web y **33 E2E de login/malla correctos en Chrome** (34,6 s), con PostgreSQL descartable. Se usaron Node 24.16.0/npm 11.13.0 y el WebKit instalado de Playwright (`webkit-2336`) con configuración privada; no acredita el runtime fijado, una prueba en la aplicación Safari del usuario, CI ni revisión/integración del equipo.

Revisión previa al commit del 13: con Node **24.21.0** y npm **11.19.0** pasaron typecheck, comprobación del catálogo, **45 unitarias**, **59 de integración PostgreSQL**, build académico/web y **33 E2E de login/malla en Chrome**; también pasaron **tres E2E de foco en WebKit** y **44 pruebas de infraestructura**. Tras actualizar referencias, `origin/develop` apunta a `2a4bf2d` e incorpora compras/CI-CD. La comparación de integración, sin fusionar ni cambiar el workspace, detectó conflictos en diez archivos: CI, instrucciones, README, configuración TypeScript/Drizzle/Vitest, pruebas de auth/servidor y metadata de migraciones. Esta rama tiene `0003_academic_progress`; develop ya tiene `0003_purchase_requests` y migraciones hasta `0006`. Antes del PR se debe coordinar el historial académico y conservar las migraciones aplicadas, resolver conflictos y repetir checks sobre el resultado integrado. Estos commits guardan el trabajo de la rama; no acreditan integración, CI remoto ni despliegue.

Sincronización con `origin/develop` (`2a4bf2d`) autorizada el 13: se resuelven los conflictos conservando el módulo de compras, la malla y el CI completo. Los SQL/tags/hashes y los registros de bases existentes permanecen intactos. El journal conserva todas las entradas de develop sin cambios; añade académico como entrada 7 con timestamp posterior, y `meta/_legacy.json` registra exactamente el timestamp/hash antiguo permitido. Esta excepción conserva la base académica anterior sin reescribir su ledger y permite que la imagen anterior de compras siga disponible tras migrar una base de compras, para recuperación. Los nombres `0003_academic_progress` y `0003_purchase_requests` se conservan como identificadores históricos distintos. El snapshot conjunto `0007_snapshot.json` se generó desde los cuatro schemas, sobre la cadena de snapshots de develop; Drizzle verifica esa cadena y no detecta cambios adicionales. No usar `drizzle-kit migrate` ni el migrador estándar de Drizzle para reconciliar las bases previas: usar `npm run db:migrate`, que verifica cada entrada aplicada por hash/timestamp (incluido únicamente el alias histórico documentado), rechaza entradas desconocidas/alteradas/duplicadas y ejecuta sólo las faltantes en una transacción y bajo el lock existente. Readiness exige cada migración y todas las columnas del snapshot conjunto, independientemente del orden original de inserción. Dos pruebas PostgreSQL reconstruyen los historiales originales de compras y académico con cuentas/registros/historial, los actualizan dos veces y comprueban conservación de datos y ledger. No se actualizó la base local de demo ni la VM durante esta sincronización. El PR hacia develop y su revisión permanecen pendientes.

Evidencia de la resolución: Node 24.21.0/npm 11.19.0, npm ci, typecheck, ESLint, catálogo, build completo, **72 unitarias**, **83 de integración PostgreSQL**, **46 E2E de producción en Chrome**, **tres recorridos de foco en WebKit** y **44 pruebas de infraestructura** correctos. Drizzle check pasó y generate no detectó cambios adicionales. Imagen candidata Linux/amd64 construida y verificada: roles limitados, migrador repetible, HTML/readiness, Nginx y recuperación de PostgreSQL. Docker Desktop no permitió leer correctamente los bind mounts del Mac en el PostgreSQL temporal; el mismo checker pasó usando copias de sus archivos en volúmenes Linux descartables, eliminados al terminar. El script del repo no cambió por esa limitación local. La imagen candidata usa el árbol de resolución y una etiqueta anterior, por lo que no acredita procedencia de una release ni despliegue. CI remoto y revisión del PR permanecen pendientes.

### Base académica y persistencia

Usar Node **24.21.0** y npm **11.19.0**, fijados en `.node-version`/manifiesto. Esta entrega inicializa sólo `apps/api` y `packages/contracts`; Gael conserva la inicialización/versiones de `apps/web`.

```powershell
npm ci
npm run typecheck
npm run catalog:check
npm run test:unit
npm run test:integration
npm run build:academic
```

Integración requiere PostgreSQL 17 accesible con permiso para crear **bases y roles exclusivos de prueba**. Localmente usa la contraseña privada de `.local/secrets/postgres-password` y loopback 55432. Para otro puerto/servidor, guardar una URL administrativa en un archivo privado y configurar `ACADEMIC_TEST_ADMIN_URL_FILE`; en CI usa `DATABASE_URL` del servicio descartable. Nunca usar una credencial administrativa en el runtime. Cada ensayo crea dos bases `cenit_academic_test_<hex>_*`, roles sin privilegios elevados, y elimina únicamente sus recursos generados. No borra ni aplica semillas en `cenit_demo`.

Aplicar las migraciones versionadas de catálogo, login y perfiles en la base de demo, de forma explícita; cargar catálogo sigue siendo una operación separada:

```powershell
$env:DATABASE_URL_FILE = '<ruta privada a la URL de cenit_migrator>'
npm run db:migrate
$env:APP_ENV = 'demo'
npm run catalog:load
```

Las URL generadas por Compose contienen el hostname `db`, válido dentro de sus contenedores. Para ejecutar estos comandos desde Windows, usar el archivo privado `migrator-local-url` con host `127.0.0.1` y puerto local (55432 por defecto), conservando credencial/base; no imprimirlo ni versionarlo. Las migraciones no cargan catálogo, cuentas ni historiales. `catalog:load` comprueba hashes de fuentes y no crea estudiantes. `db/seeds/academic-demo.ts` carga perfiles con cuentas existentes, transacción y bloqueo: repetir contenido conserva identidades/intentos, diferencias se rechazan sin sobrescribir. La preparación adicional está en `db/seeds/prepare-academic-demo.ts` y se ejecuta sólo por petición explícita:

```powershell
$env:DATABASE_URL_FILE = '.local/secrets/migrator-local-url'
$env:APP_ENV = 'demo'
npm run db:migrate
npm run academic:prepare-demo
```

El CLI exige loopback `127.0.0.1`, rol `cenit_migrator`, base `cenit_demo`, tablas migradas y las cuentas originales privadas ya preparadas. Publica el catálogo usando el importador existente y conserva `estudiante@cenit.invalid` con RUT `20.123.456-5`. Crea sólo dos cuentas estudiantiles adicionales únicas: `estudiante2@cenit.invalid` (Camila Demo, `21.123.456-3`) y `estudiante3@cenit.invalid` (Tomás Demo, `22.123.456-1`), mediante la preparación de auth reutilizada. Sus claves aleatorias quedan en `.local/secrets/academic-demo-accounts.json`, sin imprimirse/versionarse. No rota cuentas/claves originales ni las duplica. Los RUT e historiales son ficticios; no representan personas o validaciones institucionales. `npm run dev`, migraciones y CD no ejecutan esta preparación.

Para actualizar una demo ya preparada con `00.000.001-k`, `00.000.002-0` y `00.000.003-1`, con el mismo entorno privado de preparación anterior:

```powershell
npm run academic:prepare-demo -- --normalize-ruts
```

Actualización del 11 de octubre: `npm run dev --workspace @cenit/api` conecta la sesión local real de [AUTENTICACION.md](AUTENTICACION.md), con credencial runtime. Docente/estudiante autenticados pueden leer el catálogo; sin sesión, 401; administrativo, 403. `/health/ready` permanece en 503 porque falta frontend/build completo. No activar el proxy definitivo ni releases. `cenit.accounts.id` define identidad UUID; la nueva migración académica la reutiliza en esta rama, pendiente de revisión/integración. Preparación local y pruebas no acreditan disponibilidad de la VM.

## Verificación y seguimiento

Se ejecutaron typecheck, build académico, comprobación del catálogo, 28 unitarias y 38 pruebas PostgreSQL/API, además de 39 pruebas de infraestructura y actionlint. Las pruebas usan el migrador real de despliegue dos veces, bases sin tablas de negocio/con tabla previa (esquema preaprovisionado como en la VM), roles limitados, inmutabilidad, carga concurrente, referencias, ciclos, semestres, notas, rollback, búsqueda y permisos. El catálogo también se migró/cargó explícitamente en `cenit_demo` local y se leyó como `cenit_app`: 52 asignaturas, una versión publicada y ninguna tabla de historial. La ejecución del workflow en GitHub y la revisión del equipo siguen pendientes; no se modificó la VM.

CI distingue explícitamente `cenitStage: academic-foundation`: sólo `develop` admite esta entrega parcial, exige el job académico y mantiene la aplicación completa omitida. `main` y release permanecen bloqueados. Al integrar frontend/login, retirar ese marcador, incluir `apps/web`, completar scripts reales de lint/build/E2E y pasar el CI completo. No añadir scripts que siempre pasan para satisfacer el gate.

Dependencias nuevas: Fastify adapta HTTP; pg conecta PostgreSQL; Drizzle define/genera/migra el esquema; TypeBox comparte contratos; TypeScript, tsx y Vitest permiten compilar/cargar/verificar. Versiones exactas y lockfile único. Vitest 4.1.11 incluye la corrección de su mocker; override de esbuild 0.28.2 elimina la dependencia vulnerable del generador estable de Drizzle. Se verificó generación/check de Drizzle, build y tests con ese override; no se adoptaron betas ni versiones RC.

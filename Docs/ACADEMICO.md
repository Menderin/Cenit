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

Listado de estudiantes: nombre parcial (ILIKE con comodines escapados), RUT exacto, combinación AND. `page` predeterminado 1 y `pageSize` 20 (máximo 100). RUT: conservar puntuación/case original y usar únicamente para búsqueda una clave sin puntos y con K mayúscula; no inventar validación institucional del dígito verificador. Consultas parametrizadas y snapshot de lectura para conteos/datos coherentes.

Respuestas: `{data: ...}`; lista de estudiantes añade `page`, `pageSize`, `totalItems`. El catálogo conserva los campos previos y añade `semesterEnd`, `codeKind`, `officialCode`, `displayOrder`, `sources`, hashes/fechas y `prerequisiteEdges`. Nuevo caso `pending` en la unión de reglas. Los consumidores de catálogo, búsqueda e historial de `malla-interactiva` validan los contratos existentes; no cambian sus schemas. Su integración permanece pendiente.

Corrección del líder: las notas JSON son **cadenas con coma y un decimal**, omitiéndolo cuando es cero: `"4,1"`, `"6"`, `"6,5"`, o `null` si no existe nota; los SCT siguen siendo números. PostgreSQL usa su representación numérica interna con punto; el repositorio convierte sólo la presentación. `6.0` se muestra como `6`, sin cambiar su valor. Una nota con más de un decimal significativo se rechaza; no se inventa una política de redondeo. La unión de intentos distingue nota aprobatoria, reprobatoria y ausencia de nota en curso. Frontend/login deben consumir este contrato corregido, no la propuesta anterior de dos posiciones.

Errores públicos `{error:{code,message,requestId}}` y header `X-Request-Id`: 400 `VALIDATION_ERROR`, 401 `AUTHENTICATION_REQUIRED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 503 `SERVICE_UNAVAILABLE` y 500 `INTERNAL_ERROR`; sin SQL, configuración privada ni trazas. Cache-Control `no-store` en las respuestas. No hay rutas de escritura.

El plugin recibe `authenticate(request)` desde login y espera `{accountId,role}` obtenido del servidor. No analiza tokens ni acepta rol/identidad del body, headers o query por sí mismo. Sin adaptador devuelve 401. Los Bearer de prueba sólo existen en el harness de integración; no son cuentas reales ni una implementación de autenticación. Roles administrativos rechazados; docente no usa `/me/progress`, estudiante no lista ni consulta otros estudiantes. Progreso sin migración vinculada produce 503.

## Comandos

### Vista de catálogo y avance — 12 de octubre

Preparada en `malla-interactiva` para SCRUM-65/68: columnas cronológicas y un único bloque IX–X; nombre/SCT, detalle con código interno/oficial ausente, relaciones observadas y versión. Ventana estrecha reorganiza los semestres en grupos verticales, manteniendo el orden. La navegación, el marco claro y el detalle son una primera propuesta visual revisable, no aprobación del equipo ni cierre de la historia.

Ajuste visual posterior solicitado por Gael: retirar «Fuente del plan»/«Fuente y versión» de docente y estudiante y el bloque UCN/Facultad de Medicina inferior. Se elimina la vista dedicada de documentos/revisión; la procedencia permanece en catálogo/API/documentación, sin alterar datos o validaciones. La barra lateral sigue las referencias claras B/C: marca compacta, grupo desplegable Nutrición → Malla, selección blanca con sombra leve, cuenta al final y contenido blanco con margen interior. Phosphor utiliza `regular` en opciones no seleccionadas y `fill` en la activa, también al seleccionar un estudiante. La consulta de asignaturas conserva estados pendientes y versión.

La pantalla usa los dos GET de catálogo y los tres de búsqueda/progreso con validación TypeBox, QueryClient/sesión/transporte existentes y claves por cuenta/plan/versión/estudiante/filtros. Consulta limitada a 15 segundos; hasta dos reintentos sólo por red/503; cancelación mediante AbortSignal. Sin catálogo publicado, estado vacío; errores o respuesta inválida no se sustituyen por datos locales. Logout/401/expiración ocultan catálogo y detalle. La ampliación posterior aplica la migración de perfiles y preparación explícita de `cenit_demo`; rutas/contratos y lógica de sesión permanecen intactos.

Detalle mediante `<dialog>` nativo: foco, Escape y regreso a la asignatura/acción de origen. `pending` conserva su explicación y `none` sólo se presenta cuando llega explícitamente en el contrato; no se infiere ausencia ni AND/OR de las flechas. Estudiante consulta su RUT/historial por sesión; docente busca nombre/RUT y selecciona un perfil. La búsqueda se recoge al seleccionar, con foco en «Cambiar estudiante», para conservar espacio de malla. Se muestran estados textuales, notas con coma e intentos; ningún perfil/historial ausente se convierte a `notTaken`. Historial de otra versión no se dibuja sobre la versión seleccionada. No hay simulación, disponibilidad, porcentajes, edición ni nuevas reglas oficiales.

Después de `npm run build:web`, ejecutar `npm run test:e2e:auth` y `npm run test:e2e:academic`. La configuración académica reutiliza servidor/API/PostgreSQL descartables; carga el catálogo sólo en esa base y elimina sus recursos al finalizar. Vitest incluye los tests web puros junto a API/contratos. CI conecta ambos recorridos en la etapa parcial; main/entrega permanecen bloqueados. La rama `malla-interactiva`, elegida por el usuario sin prefijo, no dispara CI por push bajo los filtros actuales: el PR hacia develop ejecutará las comprobaciones. No se modifica esa política ni se publica una entrega desde esta implementación local.

Evidencia local del 12 de octubre tras conectar historial: typecheck y build web correctos, 45 unitarias, 59 de integración PostgreSQL y 29 E2E (17 auth, 12 académico) correctas sobre el build/API/PostgreSQL descartable. Incluye FK real, preparación repetida/concurrente y rechazo de sobrescritura, búsqueda/RUT normalizado, notas/intentos, acceso propio y respuestas tardías. Se verificaron los tres roles contra la API local de desarrollo tras preparar los datos, cerrando sólo las sesiones de verificación. Se usó Chrome instalado mediante configuración privada, no el Chromium fijado de CI. Se comprobó reflow entre 320 y 1920 CSS px y detalle/teclado; Safari, zoom/ventanas físicas del usuario, CI remoto y revisión independiente siguen pendientes.

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

El CLI exige loopback `127.0.0.1`, rol `cenit_migrator`, base `cenit_demo`, tablas migradas y las cuentas originales privadas ya preparadas. Publica el catálogo usando el importador existente y conserva `estudiante@cenit.invalid` con RUT `00.000.001-k`. Crea sólo dos cuentas estudiantiles adicionales únicas: `estudiante2@cenit.invalid` (Camila Demo, `00.000.002-0`) y `estudiante3@cenit.invalid` (Tomás Demo, `00.000.003-1`), mediante la preparación de auth reutilizada. Sus claves aleatorias quedan en `.local/secrets/academic-demo-accounts.json`, sin imprimirse/versionarse. No rota cuentas/claves originales ni las duplica. Los RUT e historiales son ficticios; no representan personas o validaciones institucionales. `npm run dev`, migraciones y CD no ejecutan esta preparación.

Actualización del 11 de octubre: `npm run dev --workspace @cenit/api` conecta la sesión local real de [AUTENTICACION.md](AUTENTICACION.md), con credencial runtime. Docente/estudiante autenticados pueden leer el catálogo; sin sesión, 401; administrativo, 403. `/health/ready` permanece en 503 porque falta frontend/build completo. No activar el proxy definitivo ni releases. `cenit.accounts.id` define identidad UUID; la nueva migración académica la reutiliza en esta rama, pendiente de revisión/integración. Preparación local y pruebas no acreditan disponibilidad de la VM.

## Verificación y seguimiento

Se ejecutaron typecheck, build académico, comprobación del catálogo, 28 unitarias y 38 pruebas PostgreSQL/API, además de 39 pruebas de infraestructura y actionlint. Las pruebas usan el migrador real de despliegue dos veces, bases sin tablas de negocio/con tabla previa (esquema preaprovisionado como en la VM), roles limitados, inmutabilidad, carga concurrente, referencias, ciclos, semestres, notas, rollback, búsqueda y permisos. El catálogo también se migró/cargó explícitamente en `cenit_demo` local y se leyó como `cenit_app`: 52 asignaturas, una versión publicada y ninguna tabla de historial. La ejecución del workflow en GitHub y la revisión del equipo siguen pendientes; no se modificó la VM.

CI distingue explícitamente `cenitStage: academic-foundation`: sólo `develop` admite esta entrega parcial, exige el job académico y mantiene la aplicación completa omitida. `main` y release permanecen bloqueados. Al integrar frontend/login, retirar ese marcador, incluir `apps/web`, completar scripts reales de lint/build/E2E y pasar el CI completo. No añadir scripts que siempre pasan para satisfacer el gate.

Dependencias nuevas: Fastify adapta HTTP; pg conecta PostgreSQL; Drizzle define/genera/migra el esquema; TypeBox comparte contratos; TypeScript, tsx y Vitest permiten compilar/cargar/verificar. Versiones exactas y lockfile único. Vitest 4.1.11 incluye la corrección de su mocker; override de esbuild 0.28.2 elimina la dependencia vulnerable del generador estable de Drizzle. Se verificó generación/check de Drizzle, build y tests con ese override; no se adoptaron betas ni versiones RC.

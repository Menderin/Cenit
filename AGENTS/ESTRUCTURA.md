# Guía para distribuir el código de Cenit

Actualización del 13 de octubre: el líder autoriza entregar la demo actual por HTTP en la VM, aunque malla y extracción real sigan pendientes. CI completo usa `Application` con lint, catálogo, build, integración, E2E contra producción y verificación de imagen. El marcador parcial fue retirado tras verificar estos checks localmente. La variable de publicación se habilita durante el primer ensayo supervisado, no mediante este cambio local. Procedimiento vigente: [primera entrega automática](../deploy/PRIMER-DESPLIEGUE.md). Las menciones anteriores a bloqueo o ausencia de aplicación son antecedentes de preparación, no el estado técnico vigente.

Runtime compilado: `apps/api/src/runtime.ts` compone repositorios, salud y frontend de producción; `infrastructure/plugins/frontend.ts` sirve sólo `apps/web/dist` y separa fallback SPA de errores API/assets. `infrastructure/database/readiness.ts` verifica ledger y columnas del snapshot empaquetado, sin semillas. `tests/integration/runtime.test.ts` y el modo `test:e2e:production` verifican estas garantías. Procedimiento: [ENSAYO-LOCAL.md](../deploy/ENSAYO-LOCAL.md).

Mapa revisado el 11 de octubre de 2026. Esta guía concreta la organización de la sección 4 del [SDD](SDD.md); no cambia stack, contratos ni alcance. Leer también [las instrucciones para agentes](../AGENTS.md) y [la guía de colaboración](../CONTRIBUTING.md). Si cambian responsabilidades o rutas, actualizar este mapa en el mismo PR.

El repositorio contiene infraestructura, API/contratos académicos y [autenticación local](../Docs/AUTENTICACION.md). La rama `malla-interactiva` añade la primera vista de `/academico`; `/administracion` conserva el módulo de solicitudes persistentes y el laboratorio de ejemplos procedentes de develop. `features/auth/components/AccessLayout.tsx` y `features/auth/access.css` conservan el marco de acceso; `app/App.tsx` monta `features/academic/pages/Academic.tsx` únicamente para sesión académica. El layout/estilos propios viven en `features/academic/academic.css`, la lectura validada en `academic/api/academic.ts`, la agrupación en `academic/model/group-by-semester.ts` y el detalle modal nativo en `academic/components/CatalogDetails.tsx`. Se reutilizan sesión/transporte y QueryClient existentes. La nueva vista sigue pendiente de revisión/integración; perfiles/progreso y reglas completas mantienen los límites de [ACADEMICO.md](../Docs/ACADEMICO.md). Las carpetas se completan cuando una tarea necesita código real; no crear funciones vacías para ocuparlas.

## 1. Mapa de carpetas existentes

La ampliación de avance añade `academic/components/StudentLookup.tsx` para búsqueda/selección docente y `academic/model/progress-presentation.ts` para etiquetas de estado; `CatalogDetails.tsx` presenta intentos y notas. `academic/api/academic.ts` valida también los contratos de estudiantes/progreso existentes. No se duplican login, endpoints ni modelos de persistencia en frontend.

`academic/model/course-label.ts` contiene los nombres breves de presentación de las tarjetas. Se eligen por nombre recibido, con fallback al original; no modifica catálogo/API ni nombres completos del detalle.

```text
Cenit/
├── apps/
│   ├── web/src/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── auth/{pages,api,model}/
│   │   │   ├── purchases/{pages,components,api}/
│   │   │   └── academic/{pages,components,api,model}/
│   │   └── shared/{components,lib}/
│   └── api/src/
│       ├── modules/
│       │   ├── purchases/{routes,services,repositories}/
│       │   ├── auth/{routes,services,repositories}/
│       │   └── academic/{routes,services,repositories}/
│       └── infrastructure/{config,database,plugins}/
├── packages/contracts/src/{common,purchases,academic,auth}/
├── db/{schema,migrations,seeds}/
├── catalogs/academic/
├── tests/{integration,e2e,infrastructure}/
├── deploy/
│   ├── bootstrap/
│   ├── local/
│   ├── nginx/
│   ├── quadlet/
│   ├── scripts/
│   └── systemd/
├── .github/workflows/
├── AGENTS/
└── Docs/
```

Las llaves agrupan subcarpetas, no son nombres literales. No duplicar estas raíces con `front`, `back`, `bd`, `database` o `docs`; respetar `db` y `Docs`, también en Linux.

El snapshot `db/migrations/meta/0007_snapshot.json` reúne compras y progreso académico para Drizzle/readiness. Los SQL anteriores se conservan, aunque ambas ramas usaron prefijo `0003`. El timestamp histórico académico se registra como alias en `meta/_legacy.json`; el journal le asigna uno posterior a compras para preservar la compatibilidad de la imagen anterior de compras. Ningún registro aplicado se reescribe. `tests/integration/migration-branches.test.ts` comprueba actualización desde cada historial sin perder datos. `playwright.production.config.ts` incluye auth/compras y académico contra el servidor compilado, reutilizando el harness existente.

El historial académico de esta rama usa `db/schema/academic-progress.ts` y la migración `0003_academic_progress`, con FK a cuentas UUID de login; la plantilla pendiente con marcadores fue retirada. `db/seeds/academic-demo.ts` prepara perfiles de cuentas existentes; `academic-fixtures.ts` define datos ficticios y `prepare-academic-demo.ts` coordina preparación local explícita. Las dos cuentas de estudiante adicionales se preparan reutilizando auth; sus credenciales no viven en el repo. TypeBox público vive en contratos; los schemas Drizzle y migraciones permanecen en `db`. Revisión/integración de la rama no se acreditan con esta preparación local.

## 2. Frontend: `apps/web`

| Ubicación | Qué colocar | Qué mantener fuera |
| --- | --- | --- |
| `src/app` | Composición de la aplicación: router, layout general, proveedores y arranque de React | Pantallas completas de un módulo, consultas específicas o reglas de compras |
| `src/features/auth/{pages,api,model,components}` | Login común, transporte tipado de login/session/logout, ciclo de sesión y aviso previo reutilizado por ambos módulos; limpieza de caché y guardas por rol | Cuentas/credenciales en código, persistencia de tokens, decisiones de borradores pendientes |
| `src/features/purchases/pages` | Pantallas del módulo administrativo: coordinar componentes, estado y consultas del recorrido confirmado | SQL, validaciones exclusivas del servidor, clientes Oracle |
| `src/features/purchases/components` | Tabla, filtros, detalle y componentes específicos para revisar datos recuperados | Componentes académicos y supuestos de edición libre no confirmados |
| `src/features/purchases/api` | Funciones HTTP, queries y mutaciones TanStack Query de compras, usando contratos públicos | Acceso directo a BD y transformación silenciosa de datos institucionales |
| `src/features/academic/pages` | Pantallas que presentan la malla y prerrequisitos para docentes/estudiantes | Consultas administrativas o edición del historial académico |
| `src/features/academic/components` | Tarjetas de asignatura, agrupación por semestre, relaciones de prerrequisitos y estados de visualización | Reglas oficiales inventadas o simulación fuera del MVP |
| `src/features/academic/api` | Consultas HTTP del catálogo/versión persistidos en PostgreSQL y sus estados de servidor | Archivos usados como reemplazo permanente de la BD confirmada |
| `src/features/academic/model` | Transformaciones puras específicas para presentar el catálogo, si hacen falta | HTTP, SQL y persistencia de simulaciones del MVP; puede seguir vacío |
| `src/shared/components` | Componentes visuales usados realmente por varias funcionalidades; piezas shadcn/ui seleccionadas si se reutilizan | Copias de tablas/formularios de negocio para hacerlos artificialmente genéricos |
| `src/shared/lib` | Utilidades técnicas reutilizadas, por ejemplo transporte HTTP y formateo común de presentación | Reglas de compras, consultas específicas y secretos |

Mantener hooks, estilos y helpers propios dentro de su funcionalidad. Crear subcarpetas como `hooks` sólo cuando existan archivos que las necesiten. Una query específica vive en `api`, aunque la consuma más de un componente del mismo módulo; eso no la convierte en `shared`.

El estado de datos del servidor corresponde a TanStack Query; el de interacción local a la pantalla/componente pertinente. No duplicar respuestas en varios almacenes sin necesidad. La API confirma guardado; la interfaz conserva borradores ante errores. Los filtros de acceso del frontend complementan la autorización del servidor, no la sustituyen.

Configurar Vite/TypeScript y el manifiesto propio en la raíz `apps/web` al inicializarla. Los assets importados pertenecen a `src/assets` y los archivos servidos sin transformación a `public`, sólo si se necesitan; no crear esas carpetas de antemano ni publicar capturas/dumps institucionales.

## 3. Backend: `apps/api`

| Ubicación | Qué colocar | Qué mantener fuera |
| --- | --- | --- |
| `src` — entradas de aplicación | Composición de Fastify y arranque del servidor; registrar plugins/módulos y servir frontend compilado | Concentrar todas las rutas/reglas/consultas en `server.ts` |
| `src/modules/purchases/routes` | Adaptadores HTTP: esquemas de entrada/salida, autorización, llamada al caso de uso y traducción de errores | SQL y procesamiento completo de recuperación |
| `src/modules/purchases/services` | Casos de uso de recuperación/revisión/persistencia, reglas, idempotencia, conflictos y coordinación transaccional | Dependencia de React o del objeto request/reply para ejecutar reglas |
| `src/modules/purchases/repositories` | Consultas parametrizadas del módulo, mapeo de persistencia y operaciones con una conexión/transacción recibida | Reglas visuales, respuestas HTTP o acceso a tablas privadas académicas |
| `src/modules/academic/routes` | Lectura de planes/versiones y prerrequisitos con autorización del módulo | Datos oficiales inventados o simulación de usuarios |
| `src/modules/academic/services` | Lectura y validación del catálogo/versiones según el alcance confirmado | Transcripción automática de reglas que la fuente no proporciona |
| `src/infrastructure/config` | Lectura y validación de variables y archivos de secretos; configuración de proceso | Credenciales embebidas o reglas de negocio |
| `src/infrastructure/database` | Pool/conexión PostgreSQL y soporte técnico de transacciones | Definiciones de tablas duplicadas de `db/schema` o consultas de todos los módulos |
| `src/infrastructure/plugins` | Plugins técnicos de Fastify: logging, errores comunes, servicio estático, verificaciones de sesión y otras necesidades reales | Casos de uso específicos de compras/académico |

Las rutas llaman servicios; los servicios aplican reglas y usan repositorios; los repositorios acceden a PostgreSQL mediante infraestructura y esquema. El caso de uso coordina la unidad transaccional: cabecera, relaciones y control de concurrencia no se guardan por separado. Evitar transacciones independientes por cada repositorio que rompan esa garantía.

Académico necesita persistencia en PostgreSQL. Añadir `src/modules/academic/repositories` cuando se implemente su primer acceso a datos; no ubicar sus consultas en `infrastructure/database` porque todavía no exista esa subcarpeta. La ausencia de una carpeta no autoriza poner código en otra con responsabilidad distinta.

Si se elige recuperación mediante API/OCR, los adaptadores propios de compras podrán vivir en `src/modules/purchases/integrations`. Crear esa carpeta al implementar la alternativa aprobada; contratos del mecanismo, proveedor y acceso siguen pendientes. Mantener el adaptador separado de las reglas y no duplicarlo en scripts de despliegue ni en el frontend.

El build debe producir `apps/api/dist/server.js`, como exige el Containerfile. Configuración TypeScript/manifiesto del workspace viven en `apps/api`; `dist` es generado y no se versiona.

## 4. Identidad y acceso: módulo auth

El contrato de cuenta/sesión está en [AUTENTICACION.md](../Docs/AUTENTICACION.md). El backend utiliza `apps/api/src/modules/auth/{routes,services,repositories}` y contratos públicos en `packages/contracts/src/auth`; cuentas/sesiones Drizzle en `db/schema/auth.ts` y preparación ficticia explícita en `db/seeds/auth-demo.ts`. La interfaz sigue pendiente: coordinar su funcionalidad propia con Gael dentro de `apps/web/src/features`. No colocar login en compras sólo porque el primer usuario sea administrativo ni duplicarlo en académico.

Las reglas de cuenta/sesión pertenecen a auth; la composición de app conecta su servicio de sesión con el adaptador académico. Cada módulo aplica sus permisos en servidor. El error HTTP común reutilizado por ambos módulos vive en infraestructura, no en un dominio. Cookies/rate-limit son plugins técnicos; los contratos no importan Fastify ni persistencia. No guardar contraseñas en semillas versionadas ni mezclar preparación de demo con migraciones/CD.

## 5. Contratos: `packages/contracts`

| Ubicación | Contenido |
| --- | --- |
| `src/common` | Formatos y errores públicos usados por más de un módulo, sin reglas privadas |
| `src/purchases` | Schemas TypeBox/JSON Schema, tipos, entradas y respuestas públicas de compras |
| `src/academic` | Schemas/tipos públicos de planes, versiones, asignaturas y prerrequisitos |
| `src/auth` | Login, sesión pública, rol y ejemplos sin credenciales; no incluye hashes ni cookie en JSON |

Frontend y API consumen estos contratos. No importar tablas Drizzle, repositorios, React ni configuración privada del servidor. Compartir un helper puro cuando forme parte del formato público y haga falta a ambos consumidores; no trasladar toda regla de negocio al paquete para evitar diseñar su ubicación.

La validación de seguridad y negocio siempre se aplica en el servidor. Los tipos de TypeScript no sustituyen validación en ejecución. Cambios de contrato requieren actualizar consumidores y verificaciones según [CONTRIBUTING.md](../CONTRIBUTING.md). El paquete tiene manifiesto propio y build `dist` al inicializarlo; no exportar accidentalmente fuentes no compiladas al runtime.

## 6. Persistencia y fuentes

| Ubicación | Contenido | Límite |
| --- | --- | --- |
| `db/schema` | Definiciones Drizzle: tablas, relaciones, restricciones e índices por módulo | No DTOs HTTP, conexión/pool ni consultas de pantallas |
| `db/migrations` | SQL versionado y metadata/historial generado de Drizzle | No editar migraciones ya utilizadas ni aplicar semillas al desplegar |
| `db/seeds` | Carga explícita de datos ficticios de demo/pruebas y catálogo autorizado validado | Sin secretos reales, reset público ni ejecución automática en CD |
| `catalogs/academic` | Fuentes estructuradas versionadas, procedencia, versión y datos normalizados autorizados de la malla | No sustituye PostgreSQL como catálogo servido; no inventar prerrequisitos |
| `Docs` | PDFs de referencia recibidos y documentos del proyecto | No código runtime, artefactos de build ni dumps/credenciales privados |

Agrupar definiciones de esquema por dominio cuando existan, conservando relaciones explícitas. Usar `catalogs/academic` como insumo trazable de preparación/carga: la API lee el catálogo publicado en PostgreSQL. No copiar el mismo catálogo a varios módulos ni transcribir de nuevo el PDF en el frontend. Mantener la referencia al PDF original en `Docs` sin duplicarlo innecesariamente.

Datos de PostgreSQL viven en volúmenes; nunca en estas carpetas. Esquemas de tablas y contratos públicos son representaciones distintas con responsabilidades distintas, no dos fuentes intercambiables.

## 7. Pruebas

| Ubicación | Qué verificar |
| --- | --- |
| Junto al código: `*.test.ts` / `*.test.tsx` | Reglas/transformaciones puras, helpers, componentes y contratos con Vitest |
| `tests/integration` | API con PostgreSQL real: transacciones, permisos, idempotencia, conflictos y persistencia |
| `tests/e2e` | Recorridos Playwright sobre build de demo: login, compras y malla según historias |
| `tests/infrastructure` | Scripts y contratos de CI/CD; actualmente hay pruebas Python de gates, productor y consumidor |

Ejemplo de colocación: `apps/web/src/features/academic/model/group-by-semester.ts` y su `group-by-semester.test.ts` juntos. Un escenario HTTP/BD de compras corresponde a `tests/integration`; su recorrido de navegador a `tests/e2e`. Son ejemplos de responsabilidades, no archivos ya creados.

Ubicar fixtures con la suite que los usa; crear una carpeta compartida de fixtures sólo si varias suites la necesitan. No usar SQLite para acreditar garantías PostgreSQL ni mover toda prueba a `tests/infrastructure` porque sea la única suite existente.

## 8. Operación, workflows y archivos raíz

| Ubicación | Responsabilidad |
| --- | --- |
| `deploy/bootstrap` | Página temporal previa al despliegue; no frontend de negocio |
| `deploy/local` | Inicialización del entorno local de contenedores, como `init-db.sh` |
| `deploy/nginx` | Proxy bootstrap y proxy definitivo de aplicación |
| `deploy/quadlet` | Red, volumen y plantillas de contenedores Podman de la VM |
| `deploy/systemd` | Servicios/timers del monitor/ejecutor CD; no unidades duplicadas de Quadlet |
| `deploy/scripts` | Preparación, validación, autenticación de registry y publicación/consumo de releases |
| `deploy/migrate.cjs` | Entrada del migrador separado; las migraciones viven en `db/migrations` |
| `deploy/images.lock.json` | Referencias de imágenes fijadas por digest; sincronizar consumidores al cambiarlas |
| `.github/workflows` | Orquestación CI/release en GitHub Actions; delegar lógica mantenible a scripts |
| `AGENTS` | Diseño y guías de trabajo para agentes; este mapa y el SDD |

En la raíz quedan README, CONTRIBUTING, AGENTS, Containerfile, `compose.yaml`, `.env.example`, versiones y configuración Git/npm. Al inicializar npm, el manifiesto de workspaces y único `package-lock.json` también van en la raíz; cada workspace conserva su `package.json`. No crear carpetas adicionales para duplicar esos archivos.

`deploy` configura cómo ejecutar/entregar la aplicación, no implementa recuperación de compras ni reglas curriculares. Cambios de operación requieren leer [las guías de despliegue](../deploy/README.md) y [el contrato de CD](../deploy/CD-VM.md). `.local`, `.env`, `node_modules`, `dist`, cachés, reportes y temporales son privados/generados y no se versionan.

## 9. Límites de dependencia y elección de carpeta

Dependencias permitidas por responsabilidad:

```text
web/app → web/features → web/shared + contracts
api/composición → api/modules + api/infrastructure
api/routes → api/services → api/repositories → infraestructura BD + db/schema
contracts → sus formatos públicos y bibliotecas de validación
```

Esto no obliga a crear una clase por archivo ni todas las capas para una operación trivial. Mantener límites claros, sin repositorios universales, ciclos ni imports privados entre compras y académico. `web/shared` no importa funcionalidades; contratos no importan las aplicaciones; frontend no importa API interna ni `db`. Cuando dos módulos necesiten colaborar, definir la interfaz y coordinarla antes de acceder a sus internals.

Antes de añadir un archivo:

1. Identificar si pertenece a presentación, transporte HTTP, regla/caso de uso, persistencia, contrato, pruebas u operación.
2. Elegir el dominio dueño. Lo exclusivo queda dentro de ese módulo, aunque varios de sus archivos lo usen.
3. Buscar implementación existente y reutilizarla. Extraer a `shared` únicamente con consumidores reales y sin filtrar reglas privadas.
4. Si falta una subcarpeta pertinente, crearla con el primer archivo real; explicar en el PR su responsabilidad y actualizar el mapa si cambia la organización.
5. Retirar el `.gitkeep` de la carpeta al incorporar su primer archivo. No borrar marcadores de carpetas aún reservadas ni llenar `academic/model` con simulación fuera de alcance.
6. Añadir las verificaciones del comportamiento y revisar imports, consumidores y documentación afectados.

Cuando una carpeta se vuelva demasiado amplia, dividir por responsabilidad/caso de uso coherente dentro del mismo módulo. No mover código sólo para obtener carpetas de tamaños similares. La modularidad se evalúa por responsabilidades y dependencias, no por cantidad de carpetas ocupadas.

El lanzador local `deploy/scripts/dev.mjs`, invocado con `npm run dev`, coordina los procesos API/Vite y su cierre. Es tooling de desarrollo: no aloja reglas de negocio ni sustituye Compose/Quadlet o el ejecutor de CD.

## Laboratorio de extracción HU04-T03

`packages/contracts/src/purchases` contiene candidatos/metadata/draft, validadores puros y ejemplos ficticios. Importar por `@cenit/contracts/purchases` o `/examples`. Los ejemplos no son respuesta de OCR. La pantalla y componentes están en `apps/web/src/features/purchases`; CSS local `review.css`. El router sólo compone y protege el área; no incluye reglas de extracción. El módulo API de compras conserva sus carpetas vacías hasta implementar rutas/servicios reales. No crear persistencia para este laboratorio. Pruebas de contrato colocadas junto a schemas; recorrido en `tests/e2e/auth.spec.ts` reutiliza el harness PostgreSQL existente. Contrato/límites en [EXTRACCION-COMPRAS.md](../Docs/EXTRACCION-COMPRAS.md).

El shell/navbar administrativo vive en `apps/web/src/app/AdministrativeLayout.tsx`, con estilos en `administration.css`. Home y los avisos sin funcionalidad de personal/bienes viven en `features/administration/pages`. Son navegación autorizada, no implementaciones de nuevos módulos. La revisión de candidatos sigue en `features/purchases/pages/PurchaseReview.tsx` y `/administracion/compras/laboratorio`; no mezclar contratos/reglas de compra en el dashboard. Login administrativo conserva `/administracion` como destino.

La muestra ilustrativa de seguimiento del Home y sus cálculos se ubican en `apps/web/src/features/administration/model/dashboard-demo.ts`. Son datos locales del prototipo administrativo, separados de los contratos de extracción y de la persistencia de compras; no representan una integración con Oracle.

Organización actual de compras: `pages/Purchases.tsx` lista; `PurchaseCreate.tsx` ingresa manualmente; `PurchaseDetail.tsx` consulta; `PurchaseReview.tsx` sigue como laboratorio en `/administracion/compras/laboratorio`. HTTP en `features/purchases/api`, etiquetas/formulario en `model`, confirmación de validación en `components`, estilos en `records.css`. Backend compras controla rutas/servicio/repositorio en `apps/api/src/modules/purchases`; persistencia en `db/schema/purchases.ts`; contratos de extracción en `purchases/extraction.ts` y persistencia en `records.ts`, exportados por `index.ts`. Identidad común autenticada proviene de auth; compras no depende de reglas académicas.

## Transferencia de ejemplos a compras

`apps/web/src/features/purchases/model/transfer.tsx` contiene el canal en memoria ligado a la cuenta administrativa, sin almacenamiento ni transporte por historial. El router monta el proveedor con clave de cuenta; las páginas de laboratorio y alta producen/consumen el borrador una vez. Las reglas públicas de origen permanecen en `packages/contracts/src/purchases/records.ts`; constraints en `db/schema/purchases.ts` y migración aditiva 0005. El repositorio de compras conserva el hash manual anterior y aplica procedencia al hash de ejemplos. Ver [COMPRAS.md](../Docs/COMPRAS.md).

## Filtros y agregados del listado

Schemas/validación pura de filtros y respuesta total documental viven en `packages/contracts/src/purchases/records.ts`; ejemplos en `record-examples.ts`. Normalización PostgreSQL y columnas generadas en la migración 0006/esquema, sin exponer claves internas en contratos. El repositorio de compras parametriza filtros y consulta dentro de un snapshot; el servicio valida fechas/rangos y la ruta normaliza sólo `q`/paginación. `features/purchases/pages/Purchases.tsx` controla la barra común en memoria y compone tablas con páginas independientes; la capa HTTP construye querystrings mediante URLSearchParams. No incluir reglas ni consultas de compras en Home.

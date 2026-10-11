# Guía para distribuir el código de Cenit

Mapa revisado el 11 de octubre de 2026. Esta guía concreta la organización de la sección 4 del [SDD](SDD.md); no cambia stack, contratos ni alcance. Leer también [las instrucciones para agentes](../AGENTS.md) y [la guía de colaboración](../CONTRIBUTING.md). Si cambian responsabilidades o rutas, actualizar este mapa en el mismo PR.

El repositorio contiene infraestructura y una base implementada de API/contratos académicos; el frontend conserva `.gitkeep`. Consultar [el estado académico](../Docs/ACADEMICO.md): perfiles/progreso dependen todavía de la FK de login. Las ubicaciones usadas como ejemplos no acreditan otras implementaciones. Las carpetas se completan cuando una tarea necesita código real; no crear funciones vacías ni funcionalidades fuera del MVP para ocuparlas.

## 1. Mapa de carpetas existentes

```text
Cenit/
├── apps/
│   ├── web/src/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── purchases/{pages,components,api}/
│   │   │   └── academic/{pages,components,api,model}/
│   │   └── shared/{components,lib}/
│   └── api/src/
│       ├── modules/
│       │   ├── purchases/{routes,services,repositories}/
│       │   └── academic/{routes,services,repositories}/
│       └── infrastructure/{config,database,plugins}/
├── packages/contracts/src/{common,purchases,academic}/
├── db/{schema,migrations,seeds,pending}/
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

`db/pending` contiene propuestas SQL con dependencias sin resolver; no se ejecutan desde el migrador ni se añaden automáticamente al journal. La propuesta académica depende de la tabla de cuentas revisada. Su uso en una base descartable de integración no acredita una migración de producción. TypeBox público vive en contratos; los schemas Drizzle y migraciones permanecen en `db`.

## 2. Frontend: `apps/web`

| Ubicación | Qué colocar | Qué mantener fuera |
| --- | --- | --- |
| `src/app` | Composición de la aplicación: router, layout general, proveedores y arranque de React | Pantallas completas de un módulo, consultas específicas o reglas de compras |
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

## 4. Identidad y acceso: ubicación por concretar

El login local sí forma parte del MVP, pero su contrato de cuenta/sesión sigue pendiente. La estructura inicial no tiene un módulo de identidad. Al resolver ese contrato, coordinar nombres y añadir una funcionalidad propia en `apps/web/src/features` y un módulo propio en `apps/api/src/modules`, con contratos en `packages/contracts/src`. No colocar login en compras sólo porque el primer usuario sea administrativo ni duplicarlo en académico.

Las reglas de cuenta/sesión pertenecen a ese módulo; un plugin técnico puede verificar la sesión y exponer la identidad al request. Cada módulo aplica sus permisos en servidor. Persistencia de cuentas, si el diseño la requiere, se define en `db/schema` y migraciones, sin guardar contraseñas reales en semillas. Esta guía no elige mecanismo de sesión, campos ni endpoints pendientes.

## 5. Contratos: `packages/contracts`

| Ubicación | Contenido |
| --- | --- |
| `src/common` | Formatos y errores públicos usados por más de un módulo, sin reglas privadas |
| `src/purchases` | Schemas TypeBox/JSON Schema, tipos, entradas y respuestas públicas de compras |
| `src/academic` | Schemas/tipos públicos de planes, versiones, asignaturas y prerrequisitos |

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

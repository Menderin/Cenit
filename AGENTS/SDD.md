# Cenit — Software Design Document (SDD)

Decisión visual de Gael del 14 de octubre: pulir toda el área administrativa conforme a las referencias claras, conservando «Demostración» en la cabecera y procedencia breve para ejemplos; retirar los avisos repetidos de prototipo, muestra ilustrativa y preparación interna. Se mantienen funcionalidad/contratos, datos ficticios del Home, laboratorio separado y módulos futuros sin disponibilidad. Tras revisar el diseño, Gael autorizó ejecutar las verificaciones y hacer commit si pasan. También autorizó preparar datos ficticios persistentes de compras mediante `purchases:prepare-demo`, explícito y limitado a la demo local, sin semillas automáticas ni reinicio de registros. Detalle vigente en [COMPRAS.md](../Docs/COMPRAS.md#pulido-administrativo--14-de-octubre) y [EXTRACCION-COMPRAS.md](../Docs/EXTRACCION-COMPRAS.md#presentación-de-la-revisión--14-de-octubre).

Decisión de Gael del 13 de octubre: no habrá acceso a Oracle; la recuperación será desde capturas de pantalla mediante visión local o en un equipo propio, implementada por Víctor. Gael realiza el frontend administrativo sobre el backend actual, conservando cabecera/ítems y sin exigir igualdad entre su suma y el total documental. La alternativa de API Oracle queda descartada para esta entrega; modelo/máquina/precisión siguen pendientes. El recorrido visual y la dependencia del endpoint/procedencia real se detallan en [EXTRACCION-COMPRAS.md](../Docs/EXTRACCION-COMPRAS.md). El laboratorio de ejemplos no acredita procesamiento.

Actualización del 13 de octubre: el líder autoriza entregar la demo actual por HTTP en la VM, aunque malla y extracción real sigan pendientes. CI completo usa `Application` con lint, catálogo, build, integración, E2E contra producción y verificación de imagen. El marcador parcial fue retirado tras verificar estos checks localmente. La variable de publicación se habilita durante el primer ensayo supervisado, no mediante este cambio local. Procedimiento vigente: [primera entrega automática](../deploy/PRIMER-DESPLIEGUE.md). Las menciones anteriores a bloqueo o ausencia de aplicación son antecedentes de preparación, no el estado técnico vigente.

Actualización técnica del 13 de octubre — ensayo local: `build` raíz ejecuta contratos → API → web y `start` ejecuta el servidor compilado. Fastify sirve sólo el frontend de `apps/web/dist` en producción; desarrollo conserva Vite separado. Rutas HTML de SPA (incluida compatibilidad `/prototipo.html`) no sustituyen errores API/health/assets. Readiness comprueba PostgreSQL con rol runtime, prefijo compatible del ledger (hash/fecha) y acceso a las columnas del snapshot incluido; no exige cuentas ni catálogo cargado. Salud utiliza pool separado con conexión/consulta de 1 s y cierre controlado. No hay migraciones nuevas ni semillas automáticas. Compose configura HTTP demo y orígenes locales exactos; Nginx admite 512 KiB sólo para POST de alta y 128 KiB en las demás rutas. `academic-foundation` y publicación bloqueada se conservan. Guía/evidencia: [ENSAYO-LOCAL.md](../deploy/ENSAYO-LOCAL.md). El líder confirmó que el ejecutor de la VM valida `main`; la aplicación aún no está desplegada allí.

Versión: 0.9 · Fecha: 2026-10-11 · Estado: base técnica interna de trabajo; ratificación del equipo y validaciones institucionales pendientes.

Actualización de CI del 11 de octubre: los pushes a `feat/**`, `fix/**`, `test/**`, `docs/**`, `codex/**`, `develop` y `main` ejecutan CI; PR hacia develop/main conserva sus checks de integración. Un commit exclusivamente local no dispara Actions. Scaffold/etapa académica explícita se admiten para verificar trabajo en tareas/develop, con checks aplicables obligatorios; main/release siguen exigiendo aplicación completa. Esta actualización amplía los disparadores de prueba, sin cambiar la autorización de entrega de la sección 18.

Actualización de interfaz del 12 de octubre: por petición de Gael, el diseño visual de login se conecta al contrato/API de autenticación existente y sustituye la simulación separada. El inicio administrativo es `/administracion`; docente/estudiante conservan `/academico`. Ambos son avisos de área en construcción, no módulos de compras/malla. Compras pertenece al área administrativa; no se añade navegación de módulos futuros ni se cambian permisos/endpoints. Por petición de Gael, el formulario elimina espacios del correo en cualquier posición y lo convierte a minúsculas al salir/enviar; valida el resultado con el schema compartido sin cambiar el contrato de la API. Los antecedentes de pruebas del 11 de octubre que mencionan `/compras` corresponden al destino anterior. Evidencia y límites vigentes en [AUTENTICACION.md](../Docs/AUTENTICACION.md).

Actualización HU04-T03 del 12 de octubre: [contrato de extracción](../Docs/EXTRACCION-COMPRAS.md) y laboratorio de ejemplos administrativos implementados, sin OCR ni endpoint de extracción/guardado activo. Cabecera Oracle, líneas y seguimiento separados; estados recovered/missing/invalid/ambiguous, valores textuales/null y correcciones sólo en memoria. Entrada futura PNG/JPEG, 5 MiB, 20 megapíxeles, procesamiento local temporal; hasta 100 líneas. La cabecera aportada por el líder requiere adaptar la antigua propuesta de factura/boleta e imputaciones: no implementarla como extracción ni suponer pago/aprobación. Contrato de persistencia continúa separado. No modifica migraciones ni autoriza releases.

Sincronización del 13 de octubre: Gael autorizó integrar `develop` en `malla-interactiva`. Se conservan compras y malla en el monolito, con CI completo y ambos recorridos de producción. El journal conserva las migraciones de develop y añade el SQL académico intacto con timestamp posterior; `meta/_legacy.json` registra el timestamp/hash académico anterior. Migrador/readiness aceptan ambos historiales previos sin reescribir sus registros aplicados. El snapshot conjunto es `0007`; detalle en [ACADEMICO.md](../Docs/ACADEMICO.md). Esta sincronización de la rama no integra develop ni publica una release.

### Decisión de autenticación local del 11 de octubre

Continuidad del 12 de octubre, rama `malla-interactiva`: `/academico` conectado a catálogo PostgreSQL, con columnas cronológicas/IX–X, detalle, fuentes y avance, reutilizando login/sesión. Gael autorizó posteriormente RUT para el estudiante original y tres historiales ficticios buscables por docente. Nueva migración aditiva `0003_academic_progress` con FK a `cenit.accounts.id`; preparación local explícita de catálogo/perfiles y dos cuentas estudiantiles adicionales únicas, sin rotar las originales ni cargar desde dev/CD. Se reutilizan contratos/rutas existentes; las reglas curriculares permanecen `pending`. Administración sigue en construcción. Implementación y ensayo local pendientes de revisión/integración; estados de construcción y propuesta fuera del journal descritos antes son históricos. Detalle y verificación en [ACADEMICO.md](../Docs/ACADEMICO.md).

Aviso de interfaz acordado posteriormente: cinco minutos antes de vencer, mostrar cuenta regresiva en minutos y «Cerrar sesión ahora». No renovar la sesión fija ni guardar automáticamente; la política de borradores sigue pendiente.

Ampliación de prueba del mismo día: frontend mínimo React en `apps/web`, login común y destinos `/compras` para administrativo y `/academico` para docente/estudiante. Sólo nombre/rol y salida, sin pantallas de negocio ni decisión de borradores. Versiones exactas en manifiesto/lockfile, base inicial pendiente de coordinación con Gael. Desarrollo API 3000/Vite 5173 con proxy, sin nuevas migraciones/endpoints. Arranque local conjunto con `npm run dev` tras preparación explícita; conexión runtime privada, sin migraciones automáticas; por petición explícita del líder, prepara/verifica las tres cuentas locales con claves del `.env` privado, sin rotarlas ni cargar catálogo/historial. CD/migraciones no ejecutan semillas. Ctrl+C cierra ambos procesos. CI de etapa parcial admite el tercer workspace y exige build/Playwright de autenticación; main/releases siguen bloqueados. Arranque y límites en [README](../README.md#probar-login-en-el-navegador) y [AUTENTICACION.md](../Docs/AUTENTICACION.md).

El líder confirmó correo/contraseña, un rol por cuenta y sesión fija de dos horas desde el login, sin renovación automática. [AUTENTICACION.md](../Docs/AUTENTICACION.md) define schemas, ejemplos, configuración y comandos ejecutables. `cenit.accounts` usa UUID, correo normalizado/único, nombre, rol, estado activo y hash scrypt; `cenit.sessions` conserva digest del identificador, FK, expiración y revocación. Migración aditiva posterior al catálogo, sin semillas automáticas. API `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, `POST /api/v1/auth/logout`; cookie HttpOnly/SameSite y Secure por defecto, Origin autorizado en escrituras y límite de intentos. HTTP exige excepción explícita de demo/desarrollo. Cuentas aleatorias se preparan en archivo privado ignorado por Git, nunca en migraciones/CD. API conecta sesión real con catálogo académico; el rol proviene del servidor. Esta decisión resuelve identificador/duración/mecanismo antes pendientes; pantallas, política de borradores, revisión/PR y despliegue completo siguen pendientes. No activa perfiles/historial automáticamente ni amplía registro público/Google.

Este documento define el diseño del MVP, no acredita implementación ni aprobación del cliente. El frontend se conserva por elección de su encargado. La solicitud del 10 de octubre autoriza concretar los detalles técnicos y dejar identificados los asuntos que requieren al equipo; no equivale a ratificación colectiva. Las secciones 10 a 16 fijan contratos y valores de trabajo para la demo. La sección 9 contiene únicamente asuntos que no se pueden cerrar con la información disponible. La referencia de alcance es `../Docs/Guía de trabajo para el MVP de Cenit.pdf`.

## 1. Objetivo y límites

Aclaración funcional más reciente: Cenit recupera registros de Oracle y sustituye la transcripción de pantallazos a Excel descrita por el líder, sin realizar compras ni escribir en origen. Registros conservados y tabla consultable en Cenit son el mínimo confirmado; Google Sheets es opcional sin compromiso. Actualización: recuperar/reintentar datos y revisar cambios pertinentes antes de aplicarlos a la copia; disparador manual o automático sigue por confirmar. Edición manual libre no está confirmada: los contratos PUT previos son referencia técnica que debe adaptarse al flujo acordado, no una obligación de crear un formulario de edición libre. Campos/imputaciones se cotejan con muestras reales autorizadas o ficticias representativas. Catálogo académico en PostgreSQL confirmado; definir esquema/migraciones sin persistencia de simulación. Login local y cuentas preparadas por el equipo confirmados; sin registro público.

Demostrar el 15 de octubre de 2026 un registro auxiliar de compras FAMED y una malla interactiva de Nutrición, con datos ficticios. Compras tiene prioridad. El proceso oficial y sus aprobaciones permanecen en el sistema institucional. La simulación académica no modifica historiales reales.

Incluye alta, listado filtrado, detalle y edición de compras; visualización del catálogo académico versionado y prerrequisitos oficiales. El líder excluyó simulación y persistencia de simulaciones del MVP: se conservan como referencia futura, no como compromiso de entrega. La aclaración del 10 de octubre añade login y recuperación automática de datos de compras. Nutrición quedó confirmada y se recibió `Docs/malla-nutricion-y-dietetica-2027.pdf`: permite transcribir asignaturas y semestres, pero no especifica prerrequisitos, que siguen siendo obligatorios. Login local confirmado; Google se posterga. Cuentas/credenciales y sesión definidas en la decisión del 11 de octubre y AUTENTICACION.md. Roles `docente` y `estudiante` para malla/prerrequisitos; `administrativo` para compras sin acceso académico por defecto. Separación funcional dentro del monolito; los dos módulos administrativos futuros quedan fuera del sprint actual.

La captura se investiga por dos vías: datos estructurados mediante API del sistema Oracle, o extracción desde imágenes mediante OCR/visión con revisión humana. Aún no se contactó a los encargados ni se eligió mecanismo, herramienta o proveedor. La ampliación autoriza investigar, no acredita disponibilidad de integración real ni acuerdos institucionales. La transcripción manual no satisface por sí sola la recuperación automática requerida. Plan y capacidad están en `../Docs/PLANIFICACION-MVP.md`; historias y habilitadores vigentes en `../Docs/BACKLOG-SPRINT-3.md`. Las secciones 10–16 siguen siendo la base del guardado, no un contrato de extracción o autenticación ya definido.

Se planifica coordinar con Registro Curricular la obtención de catálogo, prerrequisitos y versión, mediante exportación mínima o dump autorizado si corresponde. Esto no autoriza importación masiva, acceso a historiales ni versionar dumps institucionales. Fichas vigentes: `../Docs/HISTORIAS-USUARIO-INVEST.md`; reemplazan las historias iniciales de `BACKLOG-SPRINT-3.md`. La política de persistencia de simulación con login queda pendiente para otra iteración. Estos pendientes no se consideran resueltos por redactar historias.

Excluye cuentas institucionales, pagos, aprobaciones oficiales, importación masiva y otros módulos. La exportación se evalúa después de estabilizar el núcleo.

## 2. Stack y procedencia

React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS, shadcn/ui, Node.js, Fastify, PostgreSQL, Drizzle, TypeBox/JSON Schema, Vitest, Playwright y Podman ya aparecen en la guía del MVP. No se propone sustituir ese stack. Las decisiones añadidas aquí son REST, versiones base, npm workspaces y detalles de arquitectura y contratos.

| Área | Tecnología | Responsabilidad |
| --- | --- | --- |
| Interfaz | React + Vite + TypeScript | Aplicación web y build estático |
| Navegación | React Router | Rutas administrativas y académicas |
| Datos del servidor | TanStack Query | Consultas, mutaciones e invalidación |
| Presentación | Tailwind CSS + shadcn/ui seleccionado | Componentes accesibles y estilo común |
| Backend | Node.js + TypeScript + Fastify | API y servicio del frontend compilado |
| API | REST sobre HTTP, JSON | Contratos explícitos por recurso |
| Contratos | TypeBox + JSON Schema | Tipos compartidos y validación en ejecución |
| Persistencia | PostgreSQL + Drizzle | Consultas tipadas, restricciones y migraciones SQL |
| Pruebas | Vitest + Playwright | Reglas, API y recorridos de navegador |
| Ejecución | Podman | Imagen de aplicación y base con volumen |

Base elegida: Node.js 24 LTS, Fastify 5 y PostgreSQL 17. PostgreSQL 17 sigue soportado y no necesitamos funciones de una versión posterior. Usar npm workspaces con un único lockfile, TypeScript en modo estricto y módulos ESM. En desarrollo puede usarse `tsx` para ejecutar la API; en producción compilar con TypeScript y ejecutar JavaScript con Node, sin depender de ejecución implícita de TypeScript.

Al crear la base, resolver y fijar versiones exactas de paquetes, runtime e imágenes, verificar compatibilidad Fastify/TypeBox/Drizzle y registrar npm en `packageManager`. No usar `latest` en imágenes ni despliegues. No cambiar las versiones del frontend sin su encargado. Las versiones exactas aún no se pueden certificar: no hay manifiestos ni lockfile del frontend en este checkout. Tampoco se asume Compose o Quadlet disponible.

Referencias de soporte: https://nodejs.org/en/about/previous-releases · https://fastify.dev/docs/latest/Reference/LTS/ · https://www.postgresql.org/support/versioning/

## 3. Decisión API: REST frente a GraphQL

**Base de trabajo: REST para el MVP. Ratificación del equipo pendiente.**

Los consumidores actuales son una aplicación web y recorridos conocidos: compras CRUD sin eliminación y lectura del catálogo académico. REST permite definir respuestas de listado, detalle y catálogo adaptadas a esas pantallas; no exige que cada tabla tenga un endpoint ni impide devolver relaciones anidadas.

| Criterio en Cenit | REST | GraphQL |
| --- | --- | --- |
| Listado, filtros y edición conocidos | Endpoints y contratos acotados | Queries y mutations con esquema y resolvers |
| Compra con imputaciones | Respuesta compuesta y guardado transaccional | Selección de relaciones; la transacción sigue siendo responsabilidad del backend |
| Catálogo académico versionado | Una respuesta puede incluir cursos y reglas | Selección flexible de campos y relaciones |
| Coste adicional para este alcance | Validación y documentación de rutas | Resolución de campos, control de coste de queries y prevención de consultas N+1 |
| Garantías de negocio | Deben implementarse y probarse | También deben implementarse y probarse |

La recomendación responde al alcance y plazo, no a una superioridad universal de REST. Reconsiderar GraphQL si aparecen varios consumidores con necesidades diferentes o consultas relacionales variables que los endpoints existentes no resuelvan bien. Registrar una nueva decisión antes de cambiar el transporte. No implementar ambas APIs en el MVP.

Referencias oficiales consultadas:
- https://graphql.org/learn/introduction/
- https://graphql.org/learn/serving-over-http/
- https://graphql.org/learn/security/
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- https://www.postgresql.org/docs/current/ddl-constraints.html

## 4. Arquitectura y estructura del repositorio

La distribución detallada de código, pruebas, contratos, datos y operación está en [ESTRUCTURA.md](ESTRUCTURA.md). Esa guía concreta esta organización y debe consultarse antes de crear o mover archivos; no autoriza funcionalidades futuras ni sustituye los contratos del SDD.

Monolito modular con un frontend y una API, desplegados en una imagen, más PostgreSQL. El navegador accede a `/api/v1`; nunca directamente a la base. Servir frontend y API bajo el mismo origen. En desarrollo, configurar el proxy de Vite.

Organización elegida: mixta, por responsabilidad técnica y funcionalidad. `apps/web` es el frontend, `apps/api` es el backend y `db` contiene definiciones de esquema, migraciones y semillas. PostgreSQL se ejecuta como servicio con volumen: sus datos no se guardan en Git. No crear carpetas alternativas `front`, `back` o `bd` que dupliquen estas responsabilidades.

```text
apps/
  web/src/
    app/                  # router y proveedores
    features/
      purchases/
        pages/
        components/
        api/              # llamadas y queries de compras
      academic/
        pages/
        components/
        api/              # lectura del catálogo
        model/            # transformaciones de presentación; simulación sólo futura
    shared/
      components/         # elementos realmente reutilizables
      lib/                # utilidades transversales
  api/src/
    modules/
      purchases/
        routes/           # adaptación HTTP
        services/         # casos de uso y reglas
        repositories/     # consultas y persistencia
      academic/
        routes/
        services/         # lectura y validación del catálogo
    infrastructure/
      config/
      database/           # conexión; esquema en db/schema
      plugins/            # plugins técnicos de Fastify
packages/contracts/src/
  common/                 # formatos y errores compartidos
  purchases/              # schemas y tipos públicos de compras
  academic/               # schemas y tipos públicos académicos
db/
  schema/                 # definiciones Drizzle; no DTOs públicos
  migrations/
  seeds/                  # datos ficticios
catalogs/academic/        # planes, versiones y fuentes
tests/
  integration/            # API y PostgreSQL
  e2e/                    # recorridos de navegador
deploy/                   # bootstrap, Nginx, Quadlet y operación de la VM
AGENTS/SDD.md
```

La estructura de carpetas está creada con `.gitkeep` en cada carpeta vacía final para que Git pueda versionarla; aún no contiene una aplicación ejecutable. Retirar el `.gitkeep` de una carpeta cuando incorpore su primer archivo real. Las carpetas padre se conservan por sus descendientes y no necesitan otro marcador.

Las rutas traducen HTTP a servicios de casos de uso; los servicios aplican reglas; los repositorios encapsulan persistencia. Cada dominio evita acceder a estructuras internas del otro. No crear repositorios universales ni motores de formularios. Los plugins de cada módulo pueden usar la encapsulación de Fastify para mantener sus límites: https://fastify.dev/docs/latest/Reference/Encapsulation/.

Mantener componentes, queries y lógica específicos dentro de su funcionalidad, no en carpetas globales por tipo. Por ejemplo, la tabla de registros recuperados pertenece a `features/purchases/components`, y las transformaciones para agrupar asignaturas por semestre a `features/academic/model` si se necesitan. La evaluación de una simulación de avance corresponde a una iteración futura. Extraer a `shared` sólo elementos realmente compartidos. Crear subcarpetas adicionales, como `hooks`, cuando exista código que lo justifique. Las pruebas unitarias viven junto al código (`*.test.ts` o `*.test.tsx`); integración y E2E usan las carpetas indicadas.

## 5. Contratos HTTP propuestos

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/v1/purchases` | Listado paginado, filtros y agregados del conjunto filtrado |
| `POST /api/v1/purchases` | Alta completa de documento e imputaciones |
| `GET /api/v1/purchases/:id` | Detalle y versión de edición |
| `PUT /api/v1/purchases/:id` | Sustitución de los campos editables e imputaciones, con versión esperada |
| `GET /api/v1/purchase-catalogs` | Proveedores, unidades, proyectos y cuentas ficticios |
| `GET /api/v1/academic/plans` | Planes y versiones disponibles |
| `GET /api/v1/academic/plans/:planId/versions/:version` | Fuente, asignaturas y reglas |
| `GET /health/live` | Proceso en ejecución, sin detalles internos |
| `GET /health/ready` | Disponibilidad de dependencias necesarias |

Definir schemas de entrada y salida en `packages/contracts`. No exponer directamente filas del ORM. Los catálogos administrativos son de lectura en esta entrega; no se incluye un editor de planes ni API para guardar avances personales.

Listado: `q`, `dateFrom`, `dateTo`, `unitId`, `projectId`, `reviewStatus`, `page` y `pageSize`. Orden estable por fecha documental descendente e ID descendente como desempate. Los agregados consideran todo el conjunto filtrado, no sólo la página. Si se combinan unidad y proyecto, ambos deben coincidir en la misma imputación. La sección 12 fija límites y semántica.

Errores públicos: `{ error: { code, message, fieldErrors?, requestId } }`. Usar 400 para entradas inválidas, 404 para recurso inexistente, 409 para conflicto de versión o clave de operación reutilizada con contenido distinto y 500 para fallo interno sin trazas. Alta nueva: 201; lectura y edición exitosas: 200. La respuesta de alta puede incluir advertencias de coincidencias documentales, sin convertirlas en una restricción de unicidad no validada.

## 6. Compras y consistencia

Modelo conceptual: compra con ID interno, fecha documental, tipo, referencia textual, descripción, proveedor, moneda, total, revisión interna, pago declarado, origen, timestamps y versión. Imputaciones: compra, unidad, proyecto opcional, cuenta y monto. Los catálogos tienen IDs estables; el RUT puede faltar. Referencias externas son independientes del ID interno.

- CLP entero positivo para la demo, sin impuestos automáticos. Usar `bigint` en PostgreSQL y montos como cadenas decimales en JSON; las secciones 10 y 11 fijan el formato y sus límites. Usar `BigInt` para sumas exactas y serializar explícitamente como texto; el frontend puede compartir helpers del contrato, nunca convertir sin comprobar rango.
- Referencias conservan ceros iniciales. Guardar el valor original y documentar cualquier normalización para detectar coincidencias.
- Una compra tiene al menos una imputación; su suma coincide exactamente con el total. Validar y guardar cabecera e imputaciones en una transacción. Una suma entre filas no se garantiza con un simple `CHECK` de cabecera.
- El total documental se agrega una sola vez por compra. Separar `documentTotal` y `matchingAllocationTotal` al filtrar por clasificación. No sumar totales sobre un join que multiplica cabeceras.
- `reviewStatus`: `pending` o `reviewed`. `paymentStatus`: `unknown`, `pending` o `paid`. Editar revisión nunca modifica pago automáticamente.
- Detectar coincidencias por proveedor, tipo y referencia normalizada, apoyándose en fecha y monto. Advertir y permitir consultar coincidencias. No imponer unicidad sólo por número documental.
- Alta con `Idempotency-Key`: guardar clave, huella del contenido y resultado de forma atómica con la compra y una restricción única en PostgreSQL. Mismo intento y contenido devuelve el mismo ID; misma clave con contenido distinto produce 409. Cubrir peticiones simultáneas y reintentos tras respuesta perdida.
- Edición con `expectedVersion`: actualizar sólo si coincide la versión y aumentarla dentro de la transacción. Ante diferencia devolver 409; la interfaz conserva el borrador y permite recargar. No sustituir este control por comparar timestamps en el cliente.
- Mantener claves foráneas, restricciones locales e índices según consultas. No añadir eliminación definitiva.

## 7. Malla y simulación

Actualización de alcance: sólo visualización y prerrequisitos oficiales se entregan en el MVP. Las reglas de marcado, disponibilidad simulada y persistencia descritas aquí se conservan para una iteración futura; no implementarlas para el jueves.

Catálogo inmutable por plan y versión, con fuente, códigos únicos, nombres, semestres y créditos cuando existan. Representar prerrequisitos mediante expresiones explícitas `allOf` y `anyOf`; no confundir AND con OR. Reglas no soportadas quedan identificadas como no evaluables.

Validar duplicados, referencias inexistentes, autorreferencias y ciclos antes de publicar el catálogo. Si no se recibe la malla real, usar un ejemplo claramente rotulado y no afirmar que representa el plan oficial.

Las marcas de aprobación son una declaración manual. La disponibilidad se deriva del catálogo y las marcas, sin almacenarse como estado independiente. Permitir marcar cursos avanzados; si faltan requisitos conservar la marca y mostrar inconsistencia. Al desmarcar un requisito no borrar dependientes automáticamente. Disponibilidad según prerrequisitos no garantiza inscripción, cupos ni oferta.

Persistir en el navegador con clave separada por plan y versión, y versión de formato de almacenamiento. Validar al leer, recuperarse de datos corruptos y advertir cambios de plan sin migrar silenciosamente las marcas. Reiniciar requiere confirmación. Progreso por número de asignaturas; no presentarlo como porcentaje de créditos ni predicción de egreso.

## 8. Verificación, despliegue y entrega

Vitest: montos y sumas, validación de contratos, evaluación AND/OR, inconsistencias y validación del catálogo. API contra PostgreSQL aislado: rollback, idempotencia concurrente, conflictos de edición y agregados filtrados. Playwright: alta, búsqueda, edición y recarga; malla, marcas, inconsistencias y reinicio. Incluir API lenta/caída y conservación de borradores; no exigir un porcentaje arbitrario de cobertura.

Build de producción servido por la aplicación. Configuración y secretos por entorno, base sin exposición pública y volumen persistente. Migraciones ejecutadas de forma controlada antes de iniciar la versión; evitar que múltiples instancias migren simultáneamente. Datos de demo restaurables sólo en entornos ficticios, fuera de endpoints públicos.

Comprobar SO, arquitectura, recursos, puertos, red, proxy y modalidad Podman de la VM. Ensayar la misma versión localmente como contingencia. Etiquetar la release y verificarla; volver a una imagen anterior no revierte migraciones, por lo que debe existir un plan compatible de recuperación de datos.

## 9. Pendientes para la reunión del equipo

| ID | Decisión o información necesaria | Propuesta o contingencia | Impacto si no se resuelve |
| --- | --- | --- | --- |
| P01 | Ratificar REST y backend de la guía | Mantener la base descrita; comunicar objeciones antes de integrar | Cambiar transporte después afecta contratos y consumidores |
| P02 | Obtener manifiestos/versiones del frontend y acordar los contratos con su encargado | Contratos de secciones 10 a 15 como referencia única; fijar parches y lockfile al inicializar | No certificar compatibilidad o integración hasta comprobarlas |
| P03 | Validar significado y obligatoriedad de campos reales: `bi`, `ITEM`, unidades, documentos, proveedores y cuentas vigentes | Usar sólo el formato ficticio definido; no incluir campos ambiguos | No bloquea demo; bloquea afirmar fidelidad al proceso real |
| P04 | Definir reglas institucionales de duplicados, límites reales y pago declarado | Advertencias, límites de demo y estados separados | No imponer unicidad real ni presentar pago como verificado |
| P05 | Fuente recibida: `Docs/malla-nutricion-y-dietetica-2027.pdf`; transcribir/cotejar semestres y asignaturas, confirmar versión y conseguir prerrequisitos oficiales obligatorios | Visualizar contenido recibido; no inferir reglas por orden ni presentar reglas ficticias como oficiales | No bloquea vista por semestres; bloquea completar consulta de prerrequisitos del MVP |
| P06 | Rocky Linux 10.1, Podman 5.6.0, Docker de Zableke y zona firewalld `public` en `ens18` confirmados; ejecutar y comprobar bootstrap, recursos, reglas vigentes y persistencia | Nginx temporal y PostgreSQL con Quadlet rootless, entrada 8081; no requiere build; conservar ejecución local ensayada | No bloquea preparar infraestructura; falta ejecutar y acreditar su funcionamiento |
| P07 | Nombrar responsables y revisores de compras, malla, contratos, integración y presentación | Asignar por resultado y dependencias en Jira | Falta coordinación y revisión acreditada |
| P08 | Contrato/login de API implementado según AUTENTICACION.md; revisión/PR, pantallas y permisos administrativos cuando exista compras pendientes | Correo/contraseña local, un rol por cuenta y dos horas fijas confirmados; Google posterior | API protege catálogo con sesión real; no acredita recorrido de pantalla ni compras inexistentes |

Al resolver un pendiente, registrar decisión, fecha, responsable y evidencia. Los agentes no pueden convertir una propuesta interna en validación del equipo o institucional. No se necesita validar un límite ficticio con el cliente para probar la demo, pero sí identificarlo como tal.

## 10. Convenciones comunes del contrato v1

Un contrato especifica ruta y método, datos de entrada, datos de salida y comportamiento observable ante éxito y fallo. Las reglas siguientes son decisiones internas para el MVP y deben expresarse como schemas TypeBox y ejemplos verificables en `packages/contracts` cuando se implemente.

- JSON en UTF-8; propiedades en inglés y camelCase, interfaz y mensajes para usuarios en español.
- IDs internos y de catálogos administrativos: UUID; versión de registro: entero positivo, inicial 1.
- Fechas documentales: `YYYY-MM-DD`, fecha real del calendario y año 1900 a 2100. No convertir a timestamp ni desplazarla por zona horaria. No restringir a fechas pasadas sin regla institucional.
- Timestamps: ISO 8601 UTC con `Z`, generados por el servidor. Presentación en `America/Santiago`.
- Montos: cadena decimal canónica `^[1-9][0-9]{0,11}$`, de 1 a 999999999999 CLP. Sin puntos, comas, signo, espacios ni ceros iniciales. Los agregados admiten `"0"` y no están limitados por el máximo de una compra. Límites de demo, no financieros institucionales.
- Objetos de escritura rechazan propiedades desconocidas. No eliminar campos extra, redondear, coercionar valores del body ni recortar textos silenciosamente. Entradas de texto tienen que llegar sin espacios externos; el formulario puede proponer su corrección de forma visible. Un texto compuesto sólo de espacios es inválido.
- Campos opcionales en el negocio se envían explícitamente como `null` en una escritura completa; las respuestas mantienen esas propiedades. Sólo `expectedVersion` se añade en edición. Los objetos de lectura contienen campos generados que no se aceptan en escritura.
- Query strings sí se decodifican a enteros declarados para paginación, con validación estricta. Parámetros desconocidos o repetidos producen 400; nunca convertir un ID inexistente en un filtro ignorado.
- Tamaño máximo de body: 128 KiB; excederlo devuelve 413 con el formato común de error. Mantener límites de headers y timeouts del servidor; no permitir payloads ilimitados.
- No hay archivos adjuntos, URLs de documentos ni carga binaria en este contrato.
- OpenAPI generado desde schemas de las rutas, con plugin compatible de Fastify. Documento accesible en desarrollo; no editar una segunda copia manual de los schemas.

## 11. Contrato de compra: entrada y respuesta

Obligatoriedad y límites para la demo:

| Campo de escritura | Tipo / límite | Regla |
| --- | --- | --- |
| `documentDate` | Fecha documental | Obligatorio |
| `documentType` | `invoice`, `receipt`, `other` | Catálogo ficticio: factura, boleta, otro |
| `documentReference` | Texto 1 a 100 caracteres | Obligatorio; conservar ceros iniciales |
| `description` | Texto 1 a 1000 caracteres | Obligatorio |
| `providerId` | UUID | Proveedor del catálogo ficticio obligatorio |
| `currency` | `CLP` | Única moneda de esta entrega |
| `totalAmount` | Monto decimal textual | Obligatorio y positivo |
| `reviewStatus` | `pending`, `reviewed` | Inicial sugerido por formulario: `pending` |
| `paymentStatus` | `unknown`, `pending`, `paid` | Inicial sugerido: `unknown`; declaración manual |
| `externalReference` | `null` o texto 1 a 100 | Sólo referencia, sin integración |
| `allocations` | Array de 1 a 100 elementos | Suma exacta igual al total |
| `allocations[].unitId` | UUID | Unidad existente obligatoria |
| `allocations[].projectId` | UUID o `null` | Proyecto existente cuando se informa |
| `allocations[].accountId` | UUID | Cuenta existente obligatoria |
| `allocations[].amount` | Monto decimal textual | Positivo |
| `expectedVersion` | Entero positivo | Obligatorio sólo en PUT |

No aceptar dos imputaciones con la misma combinación unidad/proyecto/cuenta en una compra; el usuario debe combinarlas explícitamente. Para la demo no imponer relaciones proyecto-unidad no recibidas ni interpretaciones de cuentas históricas.

Ejemplo de POST, con header `Idempotency-Key: 123e4567-e89b-42d3-a456-426614174099`:

```json
{
  "documentDate": "2026-10-10",
  "documentType": "invoice",
  "documentReference": "000123",
  "description": "Compra ficticia de insumos",
  "providerId": "123e4567-e89b-42d3-a456-426614174001",
  "currency": "CLP",
  "totalAmount": "100000",
  "reviewStatus": "pending",
  "paymentStatus": "unknown",
  "externalReference": null,
  "allocations": [
    {
      "unitId": "123e4567-e89b-42d3-a456-426614174002",
      "projectId": null,
      "accountId": "123e4567-e89b-42d3-a456-426614174003",
      "amount": "70000"
    },
    {
      "unitId": "123e4567-e89b-42d3-a456-426614174002",
      "projectId": "123e4567-e89b-42d3-a456-426614174004",
      "accountId": "123e4567-e89b-42d3-a456-426614174003",
      "amount": "30000"
    }
  ]
}
```

Los UUID del ejemplo sólo son válidos si la semilla contiene esos registros. POST y PUT devuelven `{ data: PurchaseDetail, warnings: DuplicateWarning[] }`; GET detalle usa el mismo envelope y recalcula las advertencias. `PurchaseDetail` contiene todos los campos de escritura excepto `expectedVersion`, además de `id`, `version`, `createdAt`, `updatedAt`, `origin: "demo"` y `provider: { id, name, rut }`. Cada imputación añade `id` y objetos de lectura `unit: { id, name }`, `project: { id, name } | null` y `account: { id, code, name }`. No aceptar esos campos generados en las escrituras.

El RUT pertenece al proveedor y puede ser `null`; no escribirlo como un campo independiente de la compra. Catálogos administrativos: `{ data: { providers, units, projects, accounts }, origin: "demo" }`, con proveedores `{ id, name, rut }`, unidades/proyectos `{ id, name }` y cuentas `{ id, code, name }`. Nombres de 1 a 200 caracteres; códigos de cuenta de 1 a 50. No exigir ni inventar RUT para los proveedores ficticios. La validación de RUT reales queda fuera del piloto ficticio y se define antes de usar datos reales.

Una advertencia documental usa `{ code: "POSSIBLE_DUPLICATE", message, relatedPurchaseIds }`, hasta 20 IDs. Comparar proveedor, tipo y referencia normalizada para buscar candidatos, sin bloquear el guardado. Normalización sólo para búsqueda de coincidencias: Unicode NFC y minúsculas; conservar puntuación, espacios internos y ceros iniciales. Fecha y monto se consultan en el detalle para revisar coincidencias, no cambian el ID. El usuario debe ver que una advertencia puede aparecer después de guardar.

## 12. Listado, filtros y agregados

**Referencia histórica:** la propuesta siguiente de catálogos/imputaciones está reemplazada para HU06 por [el contrato vigente de consultas](../Docs/COMPRAS.md#hu06-búsqueda-filtros-y-total-documental). Usar `unitCode`/`projectCode` de un mismo ítem y sólo total documental; conservar el envelope actual de listas. No implementar `unitId`, `projectId` ni importes imputados de esta propuesta.

- `q`: 1 a 100 caracteres, opcional; coincidencia literal de subcadena en referencia, descripción y nombre del proveedor. Ignorar mayúsculas y acentos, conservar ceros y puntuación. Escapar `%` y `_` para que no sean comodines. Normalización de búsqueda explícita; conservar el valor original. Preparar claves de búsqueda normalizadas al escribir/sembrar, sin exigir una extensión adicional de PostgreSQL.
- `dateFrom` y `dateTo`: inclusivas sobre la fecha documental. Cualquiera puede omitirse; rango invertido produce 400.
- `unitId`, `projectId`: UUID de catálogo. Si ambos se informan, coinciden en la misma imputación. Filtros de cabecera y clasificación se combinan con AND. ID válido pero inexistente produce 400 `INVALID_FILTER`.
- `reviewStatus`: valor del enum; no filtrar por pago en v1.
- `page`: entero desde 1, por defecto 1. `pageSize`: entero de 1 a 100, por defecto 20. Página fuera del conjunto devuelve items vacíos y conserva los agregados del conjunto.
- Orden fijo: `documentDate DESC, id DESC`. No ofrecer orden dinámico todavía. La paginación es estable para un conjunto sin cambios; no se promete una foto consistente entre peticiones si otros usuarios editan datos.

```json
{
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totals": {
      "currency": "CLP",
      "documentTotal": "0",
      "matchingAllocationTotal": "0",
      "pendingReviewCount": 0
    }
  }
}
```

Cada item usa `{ id, documentDate, documentType, documentReference, description, provider: { id, name }, currency, totalAmount, matchingAllocationAmount, reviewStatus, paymentStatus, version, updatedAt }`. El detalle se carga con su endpoint; no enviar todas las imputaciones en el listado.

`totalItems` cuenta compras distintas; `pendingReviewCount` cuenta las compras filtradas con revisión pendiente. `documentTotal` suma cabeceras una vez. `matchingAllocationTotal` suma sólo imputaciones coincidentes en compras que también satisfacen filtros de cabecera; sin filtros de clasificación incluye todas. Ejemplo: compra de 100000 con proyecto A por 70000 y B por 30000; filtro A devuelve una compra, `documentTotal: "100000"` y `matchingAllocationTotal: "70000"`. La interfaz etiqueta ambos sin llamarlos gasto pagado.

Construir items, conteo y agregados desde el mismo conjunto y snapshot dentro de una transacción de lectura `REPEATABLE READ`. Esto evita inconsistencias dentro de una respuesta si hay escrituras concurrentes.

## 13. Errores, reintentos y concurrencia

```json
{
  "error": {
    "code": "ALLOCATION_TOTAL_MISMATCH",
    "message": "La suma de imputaciones debe coincidir con el total registrado.",
    "fieldErrors": [
      { "path": "/allocations", "code": "SUM_MISMATCH", "message": "Revisa los montos imputados." }
    ],
    "requestId": "123e4567-e89b-42d3-a456-426614174090"
  }
}
```

`fieldErrors` es un array opcional con rutas JSON Pointer, códigos estables y mensajes en español. `requestId` lo genera el servidor y se devuelve también en `X-Request-Id`. El frontend decide por código y status, no comparando mensajes.

| Status | Código | Comportamiento |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Campos, enums, fechas, montos o estructura inválidos |
| 400 | `INVALID_CATALOG_REFERENCE` | Catálogo inexistente en una escritura |
| 400 | `INVALID_FILTER` | Filtro o rango inválido |
| 400 | `ALLOCATION_TOTAL_MISMATCH` | No persistir ninguna parte |
| 400 | `DUPLICATE_ALLOCATION` | Clasificación repetida dentro del documento |
| 400 | `INVALID_IDEMPOTENCY_KEY` | Clave requerida ausente o sin formato UUID |
| 404 | `NOT_FOUND` | Compra, plan o versión inexistentes |
| 409 | `VERSION_CONFLICT` | Conservar borrador y ofrecer recarga |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Misma clave con contenido diferente |
| 413 | `PAYLOAD_TOO_LARGE` | Body superior a 128 KiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Escritura sin JSON compatible |
| 503 | `SERVICE_UNAVAILABLE` | Dependencia temporalmente indisponible |
| 500 | `INTERNAL_ERROR` | Fallo inesperado sin detalles internos |

POST y PUT requieren `Idempotency-Key` UUID nuevo por operación lógica. Mantener la misma clave, ruta y body al reintentar una petición cuya respuesta se perdió. Crear otra clave si el usuario cambia el contenido o inicia otra operación. Desactivar el botón mientras se guarda es una ayuda visual, no la garantía de idempotencia.

Persistir clave con ámbito método/ruta canónica, hash SHA-256 del JSON validado canonizado, status y body exitosos. Unicidad por ámbito y clave. La transacción debe crear la operación y el cambio juntos; una petición simultánea espera el resultado de la restricción y recupera la operación confirmada. Error o rollback no deja operación exitosa ni compra parcial. Evitar guardar formularios en logs; la tabla de operación contiene datos ficticios de la respuesta y no es pública.

Repetición idéntica devuelve el status y body originales (201 en alta, 200 en edición), con `Idempotency-Replayed: true`; primer éxito devuelve `false`. Resolver replay antes de evaluar `expectedVersion`, para recuperar una edición ya confirmada. La respuesta guardada representa el resultado original: puede no ser el estado más reciente si hubo otra edición después. El cliente invalida y vuelve a consultar listado y detalle después de cualquier éxito.

Conservar claves durante toda la vida de la base de demo; no hay expiración automática en v1. Una política para operación real se decide antes del piloto. PUT sustituye todos los campos editables y el array de imputaciones; IDs de imputación son internos y pueden cambiar. Comprobar versión y modificar compra/imputaciones bajo la misma transacción, incrementando versión incluso si el contenido es idéntico pero corresponde a una nueva operación. No hay PATCH ni endpoint aparte para revisión.

Frontend: lecturas con hasta dos reintentos sólo para fallos de red o 503, con espera creciente. Mutaciones sin reintento automático; mostrar opción de reintentar preservando body y clave ante resultado incierto. Timeout de cliente de 15 segundos informa incertidumbre, no acredita rollback. No borrar borradores ni mostrar éxito por timeout, abort o respuesta inválida. No actualizar optimistamente totales o compras antes de confirmación.

## 14. Contrato académico y almacenamiento local

Actualización implementada del 11 de octubre: [ACADEMICO.md](../Docs/ACADEMICO.md) concreta y amplía el contrato de esta sección. Catálogo PostgreSQL con plan/versiones, 52 asignaturas, SCT y fuentes con SHA-256; internados en intervalo IX–X (`semesterEnd`). La foto de prerrequisitos es la fuente principal según el líder; PDF complementario. Correspondencia 2027 confirmada por el equipo, interpretación/cotejo de flechas pendiente. Nuevo caso `{kind:'pending',description}` y relaciones observadas con fuente/estado, sin inferir `none`, AND u OR. Los demás campos añadidos están definidos en TypeBox: `codeKind`, `officialCode`, `displayOrder`, `sources` y `prerequisiteEdges`. No existe todavía consumidor frontend que actualizar; coordinarlo con Gael.

Se autoriza progreso persistido de estudiantes ficticios: estudiante propio; docente consulta todos los ficticios de Nutrición por nombre/RUT. Endpoints `/api/v1/academic/me/progress`, `/api/v1/academic/students` y `/api/v1/academic/students/:studentId/progress`, sin escrituras públicas. Historial numerado, estado del último intento, conteo que incluye el actual y nota aprobatoria; notas en JSON como cadenas con coma y un decimal, omitiendo el decimal cero (`4,1`, `6`, `6,5`); la BD exige máximo un decimal significativo sin redondeo silencioso. Escala demo 1–7, aprobación desde 4. Sin porcentajes ni simulación. Perfiles, FK de cuentas y adscripción/intentos se preparan en `db/schema/academic-progress.ts` y SQL de `db/pending`; NO forman parte del journal desplegable hasta revisar HU01-T03. La prueba de PostgreSQL usa una identidad exclusiva del harness, no una tabla real de autenticación. El adaptador de sesión recibe identidad/rol de servidor; sin él todas las consultas quedan denegadas.

Catálogo y guards de publicación se prueban con el migrador real en PostgreSQL 17; carga explícita mediante `catalog:load`, independiente de migraciones/CD. Base npm limitada a API/contratos con `cenitStage: academic-foundation`: CI académico obligatorio en `develop`; `main` bloqueado hasta incorporar frontend/login y checks completos. No se declara build del MVP ni despliegue listo. El contrato y las reglas antiguas de simulación que siguen debajo se conservan exclusivamente como referencia futura.

Actualización de alcance: contrato de catálogo/consulta de prerrequisitos vigente; simulación y almacenamiento local son referencia futura excluida del MVP. Su política por usuario necesita refinamiento antes de una futura implementación.

Lista de planes: `{ data: [{ planId, name, versions: [{ version, isExample }] }] }`. `planId` y `version` son slugs de 1 a 64 caracteres ASCII alfanuméricos, guion y guion bajo. Son identificadores del catálogo, no fechas ni versiones numéricas inferidas.

Detalle: `{ data: { planId, version, name, isExample, source, courses } }`. `source` es `{ title, reference, validationStatus }`: título de 1 a 200, referencia textual de 1 a 500 o `null`, y estado `example`, `teamReviewed` o `clientValidated`. No declarar revisión que no se realizó.

Cada asignatura: `{ code, name, semester, credits, prerequisites }`. Código de 1 a 50 sin espacios externos, nombre de 1 a 200, semestre entero de 1 a 20 y créditos positivos o `null`. El tipo numérico de créditos admite fracciones; no participa en cálculos de montos ni de progreso. Comparar códigos exactamente: no convertirlos a mayúsculas silenciosamente. Ningún catálogo válido mezcla un código duplicado con distinto nombre.

Expresión de prerrequisitos:

```typescript
type Prerequisite =
  | { kind: 'none' }
  | { kind: 'course'; code: string }
  | { kind: 'allOf'; rules: Prerequisite[] }
  | { kind: 'anyOf'; rules: Prerequisite[] }
  | { kind: 'unsupported'; description: string };
```

`allOf` y `anyOf` contienen al menos dos reglas; usar `none` para ausencia de requisitos, nunca un array vacío ambiguo. Catálogo: hasta 500 cursos, profundidad de reglas hasta 10 y hasta 100 hojas por curso, como límites de demo. Rechazar referencias ausentes, ciclos y autorreferencias en cualquier rama antes de servirlo. Correquisitos, umbrales de créditos y excepciones se registran como `unsupported` con explicación, no como requisitos ausentes.

Evaluar pertenencia de códigos al conjunto marcado; no aprobar ramos ni prerrequisitos recursivamente. Estados visibles:

- Marcado: `approved`; advertir si las reglas evaluables faltan o existen reglas no soportadas. La advertencia no borra la marca.
- No marcado y alguna regla no soportada: `notEvaluable` de forma conservadora; explicar la limitación y los requisitos conocidos.
- No marcado, todo evaluable y satisfecho: `available`.
- No marcado y reglas evaluables no satisfechas: `blocked`. Mostrar la expresión AND/OR y lo que falta, sin presentar todas las alternativas como simultáneamente obligatorias.

Persistencia local: clave `cenit:simulation:v1:<planId>:<version>` y valor `{ schemaVersion: 1, planId, planVersion, approvedCourseCodes, updatedAt }`. Códigos únicos existentes en el plan; no almacenar disponibilidad. Un estado inválido se ignora para el cálculo, se informa y se permite restablecer con confirmación. Si falla localStorage, mantener simulación en memoria e informar que no se conservará al recargar. Nunca importar automáticamente marcas de otra versión. Ofrecer al usuario conservar su escenario anterior sin usarlo en la versión nueva.

Progreso: cantidad marcada/total del plan, con porcentaje por asignaturas si se muestra; informar además inconsistencias. Las marcas inconsistentes siguen contando como declaración manual. El almacenamiento no sincroniza computadores ni representa un historial académico.

## 15. Contratos de integración y ejecución

- Compartir schemas, tipos y helpers puros de contrato en `packages/contracts`; sin acceso a DB, React ni credenciales. El backend valida con TypeBox/JSON Schema y el frontend usa los tipos y valida respuestas antes de tratarlas como éxito. Separar configuración de coerción de query strings de body estricto.
- Rutas web objetivo: `/`, `/compras`, `/compras/nueva`, `/compras/:id`, `/compras/:id/editar` y `/academico`. El servidor soporta recarga directa de rutas web. Un `/api/*` desconocido devuelve JSON 404 y nunca `index.html`.
- Variables objetivo: `NODE_ENV`, `APP_ENV=demo|test`, `HOST`, `PORT`, `DATABASE_URL`, `LOG_LEVEL`. Variables públicas Vite sólo si son necesarias y sin secretos; preferir base relativa `/api/v1`. Validar configuración antes de arrancar. No existe modo de datos reales en esta entrega.
- API local en puerto 3000 y Vite en 5173 con proxy; defaults locales, adaptables al entorno. Mantener API y DB en interfaces locales o red privada según ejecución; no fijar `0.0.0.0` como publicación pública automática.
- Imagen multietapa: build de web/API y runtime con dependencias necesarias, usuario sin privilegios, parada ordenada y cierre de conexiones. PostgreSQL 17 con volumen, sin puerto público. Fijar tag exacto y digest tras verificar construcción y arquitectura.
- Health: live 200 `{ status: "ok" }`; ready 200 `{ status: "ready" }` si DB y versión de esquema están listas, o 503 `{ status: "notReady" }`. No devolver URL de base ni credenciales. Estas rutas operativas son la excepción al envelope de recursos.
- Migraciones versionadas, sin `schema push` en presentación. Semilla determinista con IDs conocidos, estados variados, documentos coincidentes y montos repartidos. Separar base de test de demo. Reset por comando local, con comprobación de entorno y nombre de base; nunca HTTP público.
- Scripts objetivo de raíz: `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`, `test:e2e`, `db:migrate`, `db:seed:demo`, `db:reset:demo`. Son un contrato futuro de ejecución, no comandos ya disponibles. README debe documentar variables, requisitos y orden de arranque cuando existan.
- CI objetivo: `npm ci`, typecheck, lint, pruebas unitarias/integración con PostgreSQL y build; verificar los dos recorridos Playwright sobre build servido antes de etiquetar release. No declarar ese pipeline existente antes de implementarlo.

## 16. Criterios concretos de aceptación del contrato

Los criterios de simulación/reset se conservan para una iteración futura; no forman parte de la aceptación de este MVP. La visualización y consulta de prerrequisitos oficiales sí son obligatorias.

1. Compra de 100000 con imputaciones 70000 y 30000: alta exitosa, detalle y recarga conservan campos y montos.
2. Total 100000 e imputaciones 70000 y 40000: 400, sin compra ni imputaciones parciales.
3. Dos POST simultáneos con misma clave/body: un único ID; replay mantiene respuesta original. Misma clave con otro body: 409.
4. Dos proveedores con referencia `000123`: registros distintos permitidos; mismo proveedor/tipo/referencia advierte coincidencia, sin prohibición institucional inventada.
5. Dos PUT con la misma versión y claves diferentes: sólo uno confirma, el otro obtiene 409. Reintentar el confirmado con la misma clave no incrementa la versión otra vez.
6. Filtro proyecto A del ejemplo 70000/30000: una compra, total documental 100000 y total imputado coincidente 70000; todos los agregados consideran el conjunto completo.
7. Cambiar revisión a `reviewed` conserva `paymentStatus`, fecha documental y creación; actualiza versión y timestamp de actualización.
8. Fechas imposibles, monto numérico JSON en lugar de cadena, espacios/decimales en monto, campos desconocidos y catálogos inexistentes se rechazan sin normalización silenciosa.
9. C requiere A AND B: sólo A mantiene C bloqueado. D requiere A OR B: cualquiera habilita D. Marcar C y desmarcar A conserva C con advertencia.
10. Regla no soportada no habilita un curso; catálogo cíclico no se publica. Escenario local corrupto no rompe la vista; fallo de almacenamiento se informa.
11. Caída o respuesta perdida no borra formulario ni confirma éxito; recarga directa de detalle funciona en el build.
12. Reiniciar aplicación conserva compras en PostgreSQL; reset de simulación confirmado sólo cambia ese plan y versión.

## 17. VM compartida y proxy: información disponible

El 10 de octubre el usuario informó acceso por SSH a una VM Linux en `172.16.13.103`, Nginx instalado y otro proyecto, Zableke. Todavía no existe subdominio para Cenit. Estos datos provienen del usuario; no se ha inspeccionado ni modificado la VM desde este repositorio. No almacenar credenciales SSH en archivos del proyecto.

La salida de diagnóstico compartida después por el usuario permite registrar:

| Elemento | Resultado observado |
| --- | --- |
| Sistema operativo | Rocky Linux 10.1 |
| Nginx del host | Versión 1.26.3; `systemctl is-active nginx` devuelve `inactive` |
| Configuración Nginx inspeccionada | `/etc/nginx/nginx.conf` incluye `/etc/nginx/conf.d/*.conf`; servidor configurado en puerto 80 |
| Podman | Versión 5.6.0; sin contenedores activos visibles bajo el usuario de la sesión |
| Puertos TCP en escucha | 22, 80, 443, 8080, 5432 y otros listeners en direcciones de la red superpuesta |
| Puertos candidatos | 8081 y 18081 no aparecen ocupados en esa captura; comprobar de nuevo antes de usarlos |

**Hallazgo resuelto por la segunda salida del usuario:** Docker publica `zableke-nginx` en 80/443, `zableke-db` en 5432 y `jenkins` en 8080. También existen `zableke-app` (3000 interno) y `zableke-minio` (9000 interno). Podman no muestra contenedores activos en los ámbitos consultados. SELinux devuelve `Disabled` y firewalld `running`. El Nginx del host no es el proxy activo: éste pertenece a Docker/Zableke. No iniciar el servicio del host en 80 ni reutilizar la base de Zableke.

Topología de trabajo a partir del diagnóstico: navegador `http://172.16.13.103:8081` → `cenit-nginx` en Podman (8080 interno) → `cenit-app:3000` → `cenit-db:5432`, todos bajo el mismo usuario Podman y red propia `cenit-net`. Sólo el proxy publica puerto en el host, enlazado a la IP de la VM. Aplicación y base no publican puertos. Esto sustituye el ejemplo anterior de upstream en localhost:18081; ese puerto deja de ser necesario. Mantener Docker y servicios existentes sin modificaciones. Ver configuración preparada en `../deploy/nginx/cenit.conf` e instrucciones en `../deploy/README.md`.

Conservar la aplicación en la raíz del origen: `/compras`, `/academico` y `/api/v1`. Esto evita introducir un prefijo `/cenit` que obligaría a coordinar base de Vite, router y rutas API. Cuando exista subdominio, cambiar la entrada del proxy y configurar HTTPS, manteniendo las rutas de aplicación.

La inspección recibida ya identifica puertos, contenedores y estado de SELinux/firewalld. Antes de instalar, volver a comprobar disponibilidad de 8081 y recursos y validar Nginx. Mantener la configuración de Zableke y verificar ambos proyectos tras los cambios de Cenit. No desactivar políticas de seguridad para corregir errores.

Diagnóstico inicial de sólo lectura para ejecutar en la sesión SSH:

```bash
cat /etc/os-release
ss -ltn
nginx -v
systemctl is-active nginx
podman --version
podman ps --format 'table {{.Names}}\t{{.Ports}}'
sudo nginx -T 2>&1 | grep -E '(^# configuration file|^[[:space:]]*(listen|server_name|include)[[:space:]])'
```

`podman ps` muestra los contenedores del usuario actual; si el otro proyecto se ejecuta bajo otra cuenta o con privilegios, hará falta inspeccionar ese ámbito también. El contexto vigente ya se determinó con la salida Docker del usuario. El build no es requisito para preparar el modo bootstrap; sí lo es para habilitar la aplicación. El ejemplo de puertos requiere comprobarse al instalar.

Siguiente diagnóstico de sólo lectura para identificar los procesos y el ámbito de contenedores, y comprobar políticas de red:

```bash
sudo ss -ltnp
sudo podman ps --format 'table {{.Names}}\t{{.Ports}}'
if command -v docker >/dev/null 2>&1; then
  sudo docker ps --format 'table {{.Names}}\t{{.Ports}}'
fi
getenforce
sudo firewall-cmd --state
```

Las salidas siguientes ya identifican Docker como propietario de los puertos ocupados y las zonas firewalld: `public` (default) en `ens18`, `docker` en `docker0` y `br-885c19fd7f2f`, y `trusted` en `tailscale0`. Para la IP institucional, la regla de 8081 corresponde a `public`. El usuario pidió preparar el entorno ahora y mantenerlo para el posterior CI/CD: la guía indica apertura runtime y permanente de ese puerto después de verificar el proxy temporal, sin reload global. Esto sustituye el ejemplo de apertura por una hora. No se ha ejecutado ni declarado una apertura real de firewall.

Los comandos quedan como referencia de diagnóstico; no hace falta repetirlos sin un cambio de estado. Se preparó `deploy/scripts/bootstrap-vm.sh` para instalar bajo el usuario de trabajo una red, volumen, PostgreSQL y Nginx temporal con Quadlet y linger. Genera el secreto PostgreSQL fuera de Git, fija imágenes por digest y valida Nginx y DB al ejecutar. La página indica que la aplicación aún no está desplegada; `/health/proxy` responde 200 con `mode: bootstrap`, mientras `/health/ready` y `/api` responden 503. Los endpoints no representan aprobación del MVP.

Se verificó sintaxis Bash localmente. El 10 de octubre el usuario ejecutó el instalador en la VM y compartió la salida exitosa: imágenes descargadas, `nginx -t` correcto y `/health/proxy` respondió `status: ok`, `mode: bootstrap`. Alcanzar ese resultado también acredita que las comprobaciones de PostgreSQL del script pasaron. El aviso del entrypoint sobre `default.conf` de sólo lectura corresponde al montaje intencional y no impidió la validación. Esta evidencia proviene de la ejecución del usuario, no de acceso remoto directo del agente. El acceso posterior desde Windows también se confirmó; queda acreditar la regla permanente y continuidad tras cerrar SSH. No se ha probado un reinicio de la VM.

El proxy final `deploy/nginx/cenit.conf` se valida cuando exista `cenit-app`; el bootstrap usa `deploy/nginx/bootstrap.conf`, que no necesita esa aplicación. El esquema/migraciones y el rol con privilegios acotados para la API se incorporan antes del primer despliegue real; `cenit_admin` es sólo administrador de inicialización. No iniciar el servicio Nginx del host ni modificar las zonas Docker/Tailscale.

La evolución de CI/CD se concreta en la sección 18: GitHub Actions para CI y CD iniciado desde la VM mediante conexiones salientes. No se necesita acceso entrante a la IP privada desde el runner alojado. El CI de infraestructura se publicó y pasó en GitHub; el CD todavía no está implementado.

Para evaluar un Jenkins propio, el usuario compartió recursos: 3,6 GiB de RAM total, 1,7 GiB disponible, 349 MiB de swap utilizada y aproximadamente 13 GiB libres en el filesystem del home. El puerto 8082 no tenía listeners en la captura. No se instaló otro Jenkins. El usuario aceptó GitHub Actions para pruebas/builds y reservar la VM para servicios y despliegue. La aceptación no acredita un pipeline remoto operativo ni que Jenkins sea técnicamente imposible.

El usuario compartió después una respuesta exitosa de `Invoke-RestMethod` ejecutado en Windows contra `http://172.16.13.103:8081/health/proxy`: `status: ok`, `mode: bootstrap`. Esto confirma la entrada HTTP desde ese equipo y la red actual, aunque no aparece un resultado separado de `Test-NetConnection`. No es necesario repetir esa prueba TCP para acreditar la conectividad ya demostrada por HTTP. La configuración persistente de firewalld y la continuidad tras cerrar SSH o reiniciar siguen sin evidencia compartida; no confundirlas con el acceso actual confirmado.

## 18. CI/CD automático: requisito y propuesta

El usuario requiere actualización automática de la VM tras superar pruebas e integrar cambios en la rama de entrega. Este requisito sustituye cualquier propuesta de despliegue habitual manual. No requiere reiniciar la VM ni intervenir en Zableke/Jenkins.

El usuario aceptó GitHub Actions con runners alojados para CI/build, GHCR para imágenes y servicio/timer rootless en la VM para consultar/desplegar releases verificadas. La decisión del 11 de octubre sustituye el flujo anterior: `develop` integra funcionalidades y `main` autoriza entregas mediante `rama de tarea → develop → main`, con PR, revisión y CI. El usuario creó `develop`, todavía sin configurar protección. `produccion` deja de usarse; conservarla temporalmente hasta comprobar transición y commits/PR pendientes antes de eliminarla. El destino sigue siendo demo con datos ficticios. La configuración remota no se modifica desde este ajuste del repo.

Flujo objetivo:

1. Un pull request hacia `develop` o `main` ejecuta instalación reproducible, typecheck, lint, Vitest, integración con PostgreSQL y Playwright. No publica una release ni despliega en la VM.
2. La protección de rama exige revisión y checks correctos antes de fusionar, según las capacidades de la cuenta GitHub. Confirmar esas capacidades antes de afirmar que están activas.
3. El `push` resultante del merge a `main` ejecuta CI sobre el commit integrado, construye la imagen y verifica los recorridos sobre el artefacto de entrega. Sólo después de superar todos los gates publica una release desplegable vinculada a commit y digest inmutable. Una imagen intermedia publicada para pruebas no implica autorización de despliegue. Un push a `develop` ejecuta CI pero no autoriza entrega.
4. Un timer en la VM consulta periódicamente la release aprobada mediante conexiones salientes autenticadas. Debe verificar repositorio, workflow autorizado, evento `push`, rama `main`, resultado exitoso y correspondencia commit/digest antes de actuar; no basta encontrar un tag `latest`, un commit o cualquier workflow verde. Descargar y ejecutar scripts del PR no forma parte de este mecanismo.
5. El servicio serializa despliegues, descarga ese digest, aplica únicamente las migraciones compatibles previstas, actualiza `cenit-app`, resuelve de nuevo su dirección en Nginx y comprueba readiness y recorridos básicos. Conserva registro del commit/digest instalado y evita desplegar dos veces la misma release o regresar a una antigua por carreras entre builds. Las actualizaciones no ejecutan semillas ni restablecen la base.
6. Un fallo antes de sustituir la aplicación conserva la versión actual. Si falla la nueva versión, recuperar la imagen anterior sólo cuando sea compatible con el esquema vigente; una migración fallida o incompatible necesita un procedimiento de recuperación explícito. Registrar y notificar el fallo mediante el canal que acuerde el equipo. No prometer rollback automático de datos ni disponibilidad sin interrupciones.

La VM privada no es accesible directamente desde runners públicos sin configurar una ruta de red. El despliegue iniciado desde la VM evita esa dependencia y no necesita publicar SSH en Internet. Un runner self-hosted exclusivamente para CD es otra alternativa, pero su aislamiento y acceso a workflows deben evaluarse antes de instalarlo en una VM compartida; no asumir que una etiqueta del runner impide ejecutar código de PRs.

Se publicó `.github/workflows/ci.yml` con un check estable `CI required`, verificaciones de infraestructura y contrato npm comprobado por `deploy/scripts/check-ci-readiness.py`. La [primera ejecución en `main`](https://github.com/Menderin/Cenit/actions/runs/38071046810), commit `479095a`, pasó el 10 de octubre, incluidas las pruebas del gate y la validación Nginx en contenedor. Bajo aquel flujo se omitía aplicación en `main` y se bloqueaba `produccion`. Desde el 11 de octubre, sólo `develop` permite scaffold y `main` exige aplicación/pruebas. Una vez presentes los manifiestos, las seis verificaciones npm son obligatorias. Esta ejecución sólo acredita infraestructura y no autoriza una release.

El usuario confirmó que el repositorio es privado. La conexión del plugin GitHub devolvió 404, pero el acceso Git local permitió consultas autenticadas de sólo lectura: permiso `admin` y Actions habilitado, comprobados el 10 de octubre. El usuario publicó `main` en `479095a` y creó `produccion` en el commit anterior `44b3502`; todavía no contiene el workflow y puede conservarse como base hasta la primera entrega desplegable. Luego configuró protección clásica de ambas ramas: `CI required` vinculado a GitHub Actions, una aprobación requerida y force-push/eliminación bloqueados, confirmados por API. `enforce_admins` y `strict` permanecen en false; falta aplicar las restricciones a administradores y ensayar un PR fallido. El usuario se encarga de commit/push y ramas; el agente conserva ajustes locales sin publicar ni modificar ramas remotas. La guía de activación y promoción está en `deploy/CI-CD.md`.

Pendientes de implementación: completar y ensayar protección de ramas sin bypass de administradores, habilitar GHCR, acceso saliente de la VM, credencial de lectura restringida almacenada fuera de Git, formato verificable de release y autenticación, scripts reales del monorepo, Dockerfile/Containerfile, rol runtime, migraciones, Quadlet de aplicación, timer/servicio, retención de imágenes y canal de fallos. Configurar el mecanismo una vez y ensayar una entrega exitosa y otra fallida antes de declararlo operativo.

El usuario compartió diagnóstico de la VM: `x86_64`, Python `3.12.12`, HTTP `200` de GitHub API y HTTP `405` de GHCR ante HEAD. Ambos hosts son accesibles; el `405` no implica fallo de red y la comprobación GET sin credenciales espera `401`. La imagen objetivo es `linux/amd64`. El usuario ejecutó `deploy/scripts/login-ghcr.sh` y compartió `Login Succeeded!`: PAT classic `read:packages` autenticado en GHCR, con authfile privado persistente en `~/.local/share/cenit/registry/auth.json`. El agente no recibió el token; queda probar el pull privado cuando se publique la imagen. La consulta de releases/Actions necesita una credencial distinta con permisos de lectura acotados al repo; `read:packages` no sustituye esos permisos.

Se preparó el monitor Python de consultas periódicas, configurador de token fine-grained (sólo Cenit, Actions/Contents read-only) e instalador rootless de `cenit-github-monitor.service` y `.timer`. Verificados localmente con 15 pruebas y sintaxis Bash. El usuario ejecutó configurador e instalador en la VM y compartió éxito: lecturas verificadas, token guardado, consulta inicial con cero releases y timer habilitado. La comprobación posterior acreditó consulta periódica completada: `Result=success`, `ExecMainStatus=0`, servicio `inactive/dead` entre consultas y timer `active/waiting`, con última y siguiente ejecuciones registradas. No se alteró journald ni se reinició la VM; la ausencia de journal de usuario se resolvió consultando estado de systemd. El monitor sólo observa y comprueba acceso; no verifica procedencia de imágenes ni autoriza releases, y nunca realiza despliegues. El token privado se guarda fuera del checkout y las consultas no siguen redirecciones autenticadas. Instrucciones completas en `deploy/CI-CD.md`. No presentar este monitor como CD operativo; faltan workflow de release y ejecutor con garantías de las secciones anteriores.

Referencias: [eventos de workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [red privada con runners alojados](https://docs.github.com/en/actions/concepts/runners/private-networking) y [runners self-hosted](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).

### 18.1. Contrato del ejecutor preparado

Actualización de evidencia del 10 de octubre: el usuario confirmó `Result=success`, `ExecMainStatus=0`, servicio `inactive/dead`, timer `active/waiting` y siguiente ejecución a las 14:13:41 EDT. Queda resuelto el pendiente de programación de la próxima consulta en la captura inicial descrita abajo. El ejecutor está instalado y esperando releases; no hay entrega de aplicación ensayada todavía.

El usuario confirmó además `yes` en la consulta permanente firewalld `public` para `8081/tcp`; la presencia de esa regla queda acreditada y sustituye el pendiente anterior de comprobarla. La continuidad tras reinicio sigue sin ensayo. Puede probarse CI con un cambio documental en `develop` y un PR hacia `main`; mientras falte aplicación, el check requerido debe bloquear la promoción. El procedimiento está en `deploy/CI-CD.md`; no confundir esta prueba de ramas con un despliegue real.

El código del ejecutor rootless y su instalador está preparado en `deploy/scripts/install-cd.sh`, con instrucciones y contrato completo en `deploy/CD-VM.md`. El usuario confirmó su instalación en la VM el 10 de octubre: lectura GitHub correcta, validación Quadlet sin aplicación, roles/secrets preparados, timer CD habilitado y monitor anterior deshabilitado. `status.json` registró `waiting-for-release` a las 18:11:40 UTC. La captura inmediata mostraba `NEXT -`; falta confirmar estado exitoso del servicio y próxima ejecución programada. El timer está configurado para consultar cada dos minutos, guarda estado privado y conserva los servicios actuales sin release autorizada. Las 29 pruebas locales verifican gates negativos y recuperación simulada; no acreditan despliegue real. No hay workflow de release ni imagen de aplicación todavía.

Para integrar la futura aplicación: imagen `ghcr.io/menderin/cenit` por digest, Linux/amd64, UID/GID 1000, etiquetas OCI source/revision, soporte `DATABASE_URL_FILE`, migrador `node /app/deploy/migrate.cjs` y readiness exacto `{status: "ready"}`. Roles separados `cenit_app` y `cenit_migrator`, esquema de negocio `cenit`; configurar también el registro de Drizzle en ese esquema. El instalador genera secretos fuera de Git y no rota contraseñas existentes. El runtime no usa `cenit_admin`.

El productor preparado `.github/workflows/release.yml` debe ejecutar CI real sobre push a `main`, verificar/publicar imagen y crear artifact inmutable `cenit-release-<run_attempt>` con el manifiesto documentado. Gates requeridos: `CI / CI required`, `CI / Application`, `Publish image`. Release tag `cenit-<SHA completo>` y cuerpo JSON con ID/intento de ejecución. El consumidor contrasta procedencia y digest con la API Actions; una release creada manualmente sin esas evidencias no autoriza despliegue. No cambiar unilateralmente estos nombres/formatos en el workflow: actualizar y ensayar ambos extremos.

El ejecutor serializa operaciones, guarda backup antes de migrar, evita repetir intentos fallidos y comprueba readiness antes de cambiar el proxy. Recupera aplicación/proxy anteriores ante errores manejados; no restaura datos ni garantiza recuperación automática ante un corte de proceso/VM. No ejecuta semillas. Backups/imágenes se conservan con gates de espacio; retención, alertas, restauración ensayada, permanencia del firewall, continuidad tras reinicio y el primer circuito real exitoso/fallido quedan pendientes. No hace falta instalar Jenkins adicional ni reiniciar la VM para esta preparación.

### 18.2. Configuración del repositorio y estado de HT15

Actualización del 10 de octubre de 2026: se incorporan `compose.yaml`, `.env.example`, preparador de secretos locales, inicializador de roles/esquema PostgreSQL, `Containerfile`, `deploy/migrate.cjs`, verificador de imagen, productor de manifiesto y `.github/workflows/release.yml`. Esto sustituye las referencias anteriores a Containerfile/productor todavía inexistentes; no acredita aplicación ni entrega operativa. La guía ejecutable es `deploy/LOCAL.md`.

Versiones de infraestructura verificadas y fijadas: Node 24.21.0 LTS, npm 11.19.0, PostgreSQL 17.11 y Nginx 1.30.5 estable. Las imágenes se fijan por digest en `deploy/images.lock.json` y sus consumidores. `.node-version` fija Node y el futuro manifiesto raíz debe declarar `packageManager: "npm@11.19.0"`. Las versiones del frontend siguen coordinadas con su encargado; no se inicializan ni actualizan en este cambio.

El Compose local inicia DB/proxy bootstrap por defecto, publica sólo en loopback 55432/8081 y conserva un volumen propio. El perfil `application` incorpora migrador y monolito cuando exista código compilable. API, frontend y contratos deben generar `apps/api/dist/server.js`, `apps/web/dist` y `packages/contracts/dist`; el servidor sirve frontend/API por 3000. El runtime lee `DATABASE_URL_FILE`; las migraciones e historial Drizzle usan esquema `cenit`. No se añaden semillas ni tablas de negocio ficticias para eludir CI.

CI se reutiliza desde release manteniendo gates `CI / CI required`, `CI / Application`, `Publish image`. El publicador verifica Linux/amd64, UID/GID 1000, etiquetas OCI, migrador ejecutable dos veces, rutas HTML y readiness dependiente de PostgreSQL antes de publicar. El artifact ZIP contiene sólo `cenit-release.json`, se solicita retención de 90 días y la release contiene el puntero al run/intento. El límite real de retención permitido por GitHub debe comprobarse al publicar. `CENIT_RELEASE_ENABLED` permanece deshabilitada hasta completar aplicación/tests y preparar el primer ensayo supervisado; no se modificó configuración remota.

Evidencia local: 34 pruebas de infraestructura correctas, validación Compose, actionlint de ambos workflows y sintaxis del migrador/inicializador. No hubo motor de contenedores disponible en este equipo ni aplicación que construir. Los nuevos pasos CI arrancan PostgreSQL/proxy y comprueban roles limitados; aún deben ejecutarse en Actions. HT15 queda con configuración implementada y ensayo de contenedores/revisión pendientes, no terminada. HT05/HT06/HT07 requieren aplicación, imagen real y entrega/recuperación ensayadas en la VM. No se altera su instalación actual ni los servicios ajenos.

Evidencia posterior del mismo día: Podman 6.0.2 instalado, máquina WSL 2 rootless creada/iniciada y Compose 5.3.1 conectado a Podman. DB y proxy alcanzaron estado saludable; HTTP local 8081 devolvió bootstrap correcto. Se comprobaron roles limitados y permisos USAGE sin CREATE para runtime. Recrear el contenedor DB conservó esquema/propietario en el volumen nombrado. Se corrigieron opciones tmpfs incompatibles con Podman conservando Nginx sin privilegios y raíz de sólo lectura. Queda resuelto el pendiente de arranque local de HT15; revisión del equipo, nueva ejecución CI y ensayo de aplicación/CD continúan pendientes. Instrucciones y proveedor comprobado en `deploy/LOCAL.md`.

### 18.3. Transición a develop/main

Decisión del 11 de octubre: código/workflows del checkout actualizados para CI en `develop`/`main`, publicación sólo por push a `main` y verificación de esa rama en manifiesto, run, artifact e historial. Sólo `develop` admite scaffold sin aplicación; una inicialización incompleta falla también allí. Tests comprueban que el publicador/consumidor rechazan `develop` y la antigua `produccion` como origen de entrega. Se conservan nombres de gates, artifact, tag, digest y roles del contrato; no cambia `NODE_ENV=production`.

La copia del ejecutor instalada en la VM sigue con la política anterior hasta reinstalarla el martes 13. Mantener `CENIT_RELEASE_ENABLED` deshabilitada. Configurar/revisar protecciones de `develop` y `main`; no borrar todavía la rama antigua sin verificar commits/PR pendientes y transición de la VM. Procedimiento completo en [CI-CD.md](../deploy/CI-CD.md). Las capturas, commits y aprobaciones de ramas del 10 de octubre descritos arriba son evidencia histórica del flujo anterior, no comprobación del nuevo. No se modificaron ramas ni reglas remotas.

### Navegación administrativa autorizada

El líder pidió Home/dashboard en `/administracion`, con navbar Home, Sistema de compra (`/administracion/compras`), Sistema de personal (`/administracion/personal`) y Sistema de bienes (`/administracion/bienes`). Sólo compras pertenece al MVP; personal/bienes tienen páginas «En construcción», sin procesos ni datos. Permisos y destino de login se conservan. La revisión ficticia se mueve al sistema de compra; «Ítem de la solicitud» explica las líneas internas, sin tablas nuevas ni extracción real. Ver [guía de extracción](../Docs/EXTRACCION-COMPRAS.md).

### Prototipo del Home administrativo (13 de octubre de 2026)

El líder autorizó KPIs, gráfico por fecha de envío y tabla de solicitudes ficticias pendientes de aprobación de Luis Lanas en `/administracion`. La muestra local pertenece a `features/administration/model`; no constituye un contrato de Oracle ni una ampliación del flujo de compras. Todos los indicadores se calculan desde la misma muestra y están identificados como ilustrativos. Pendiente validar con el cliente la utilidad, estados y alcance del seguimiento. Cenit no aprueba solicitudes ni modifica Oracle; aprobación y situación de pago permanecen separadas.

### Persistencia manual y validación local de compras (13 de octubre)

Decisión vigente que adapta la propuesta de las secciones 10–16: [COMPRAS.md](../Docs/COMPRAS.md). Una cabecera con 0–100 ítems, mínimos número/fecha/descripcion/total; campos inciertos textuales opcionales. Dos tablas `cenit.purchase_requests` y `cenit.purchase_request_lines`, montos exactos, transacciones e idempotencia por operación/cuenta. No implementar catálogos/imputaciones, suma de ítems obligatoria ni PUT de la propuesta antigua como reglas confirmadas.

«Validar registro» es revisión de copia local, no aprobación Oracle ni pago; cualquier administrativo puede validar, incluso sus propios registros. Nuevas rutas de alta/listado/detalle/validación según la guía. Home sólo KPIs/gráfico ficticios; las tablas viven en Sistema de compra. Laboratorio separado en `/administracion/compras/laboratorio`. Formulario manual sin guardado automático: conserva borrador ante errores y foco con sesión válida; salida avisa y logout/expiración descartan. El ingreso manual no completa recuperación automática ni habilita releases.

## HU05 — Procedencia y transferencia de ejemplos (13 de octubre de 2026)

Decisión autorizada: mantener solicitudes e ítems sin regla de suma ni imputaciones presupuestarias. Los criterios antiguos que exigían suma de imputaciones quedan reemplazados para HU05 por guardado atómico de cabecera e ítems válidos. La extracción real sigue en HU04.

El alta admite `origin?`: `{type: 'manual'}` o `{type: 'contract_example', exampleId: 'recovered'|'partial'|'ambiguous'}`. Omitirlo mantiene el comportamiento manual. Respuestas completas y resúmenes incluyen `source` y `exampleId`; la migración aditiva 0005 conserva manuales anteriores, añade columna nullable y exige coherencia mediante CHECK. Ningún origen acredita Oracle/OCR. No se modifican endpoints ni se habilitan releases.

Idempotencia: serialización/hash manual anteriores sin cambios, incluso para origen manual explícito. Para ejemplos se incluye origen e ID; reutilizar operación con procedencia distinta devuelve conflicto. No guardar imágenes, texto OCR ni semillas en migraciones/CD.

El laboratorio valida formatos y transfiere una copia revisada sólo en memoria, ligada a cuenta y consumida una vez, sin POST ni estado del historial. El formulario exige campos mínimos, identifica procedencia ficticia, preserva operación/borrador ante errores y los descarta al cerrar/expirar. Listados y detalle identifican ejemplos. Documentación vigente y evidencia: [COMPRAS.md](../Docs/COMPRAS.md) y [EXTRACCION-COMPRAS.md](../Docs/EXTRACCION-COMPRAS.md).

## HU06 — Listado filtrado vigente (13 de octubre de 2026)

Decisión del líder: búsqueda por número/descripción/proveedor, fechas inclusivas de envío y códigos textuales de unidad/proyecto del mismo ítem. No existen imputaciones ni catálogos presupuestarios. La propuesta histórica de la sección 12 se reemplaza para esta entrega por [COMPRAS.md](../Docs/COMPRAS.md#hu06-búsqueda-filtros-y-total-documental).

GET conserva `data` como array y `pagination`; añade `totals: {currency:'CLP',documentTotal:string}` del conjunto filtrado de cada estado, sumando cabeceras una vez. Códigos inexistentes devuelven vacío; filtros mal formados/rangos inválidos devuelven 400. Consultas parametrizadas con EXISTS y snapshot de lectura REPEATABLE READ; orden fecha descendente/UUID descendente. Migración 0006 añade función de normalización y claves generadas, conserva datos/hash y no carga semillas. Barra común con aplicación explícita y limpieza; ambos listados reinician página y mantienen total/paginación propios. Filtros sólo en memoria.

Contratos y frontend actualizados juntos; pruebas locales y evidencia en la guía. Revisión, Actions e integración pendientes; no habilita publicación.

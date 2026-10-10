# Cenit — Software Design Document (SDD)

Versión: 0.5 · Fecha: 2026-10-10 · Estado: base técnica interna de trabajo; ratificación del equipo y validaciones institucionales pendientes.

Este documento define el diseño del MVP, no acredita implementación ni aprobación del cliente. El frontend se conserva por elección de su encargado. La solicitud del 10 de octubre autoriza concretar los detalles técnicos y dejar identificados los asuntos que requieren al equipo; no equivale a ratificación colectiva. Las secciones 10 a 16 fijan contratos y valores de trabajo para la demo. La sección 9 contiene únicamente asuntos que no se pueden cerrar con la información disponible. La referencia de alcance es `../Docs/Guía de trabajo para el MVP de Cenit.pdf`.

## 1. Objetivo y límites

Demostrar el 15 de octubre de 2026 un registro auxiliar de compras FAMED y una malla interactiva de Nutrición, con datos ficticios. Compras tiene prioridad. El proceso oficial y sus aprobaciones permanecen en el sistema institucional. La simulación académica no modifica historiales reales.

Incluye alta, listado filtrado, detalle y edición de compras; catálogo académico versionado y simulación manual. Excluye integraciones institucionales, OCR, IA funcional, cuentas institucionales, pagos, importación masiva y otros módulos. La exportación se evalúa después de estabilizar el núcleo.

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
        model/            # simulación y persistencia local
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

Mantener componentes, queries y lógica específicos dentro de su funcionalidad, no en carpetas globales por tipo. Por ejemplo, el formulario de compra pertenece a `features/purchases/components`, y la evaluación local de prerrequisitos a `features/academic/model`. Extraer a `shared` sólo elementos realmente compartidos. Crear subcarpetas adicionales, como `hooks`, cuando exista código que lo justifique. Las pruebas unitarias viven junto al código (`*.test.ts` o `*.test.tsx`); integración y E2E usan las carpetas indicadas.

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
| P05 | Recibir plan de Nutrición con fuente, versión, ramos y reglas | Catálogo ficticio rotulado como ejemplo | Bloquea demostrar la malla real, no el mecanismo |
| P06 | Rocky Linux 10.1, Podman 5.6.0, Docker de Zableke y zona firewalld `public` en `ens18` confirmados; ejecutar y comprobar bootstrap, recursos, reglas vigentes y persistencia | Nginx temporal y PostgreSQL con Quadlet rootless, entrada 8081; no requiere build; conservar ejecución local ensayada | No bloquea preparar infraestructura; falta ejecutar y acreditar su funcionamiento |
| P07 | Nombrar responsables y revisores de compras, malla, contratos, integración y presentación | Asignar por resultado y dependencias en Jira | Falta coordinación y revisión acreditada |
| P08 | Aprobar alcance de demo sin login, quién accederá y cómo se acota el entorno | Sólo datos ficticios, localhost/red controlada; sin publicación pública por defecto | No publicar ni usar datos reales sin resolver acceso |

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

La evolución de CI/CD se concreta en la sección 18: GitHub Actions para CI y CD iniciado desde la VM mediante conexiones salientes. No se necesita acceso entrante a la IP privada desde el runner alojado. El CI se preparó localmente; el CD todavía no está implementado.

Para evaluar un Jenkins propio, el usuario compartió recursos: 3,6 GiB de RAM total, 1,7 GiB disponible, 349 MiB de swap utilizada y aproximadamente 13 GiB libres en el filesystem del home. El puerto 8082 no tenía listeners en la captura. No se instaló otro Jenkins. El usuario aceptó GitHub Actions para pruebas/builds y reservar la VM para servicios y despliegue. La aceptación no acredita un pipeline remoto operativo ni que Jenkins sea técnicamente imposible.

El usuario compartió después una respuesta exitosa de `Invoke-RestMethod` ejecutado en Windows contra `http://172.16.13.103:8081/health/proxy`: `status: ok`, `mode: bootstrap`. Esto confirma la entrada HTTP desde ese equipo y la red actual, aunque no aparece un resultado separado de `Test-NetConnection`. No es necesario repetir esa prueba TCP para acreditar la conectividad ya demostrada por HTTP. La configuración persistente de firewalld y la continuidad tras cerrar SSH o reiniciar siguen sin evidencia compartida; no confundirlas con el acceso actual confirmado.

## 18. CI/CD automático: requisito y propuesta

El usuario requiere actualización automática de la VM tras superar pruebas e integrar cambios en la rama de entrega. Este requisito sustituye cualquier propuesta de despliegue habitual manual. No requiere reiniciar la VM ni intervenir en Zableke/Jenkins.

El usuario aceptó GitHub Actions con runners alojados para CI y construcción, GHCR para imágenes y un servicio/timer systemd rootless en la VM para consultar y desplegar releases aprobadas. A partir de su preferencia por separar producción, la configuración de trabajo usa `main` para integración y `produccion` para autorizar entrega: `feature/* → main → produccion`, mediante PR y CI. No añadir `develop`. Por ahora el destino es la demostración con datos ficticios; el nombre de rama no habilita operación institucional. El workflow filtra los eventos por esas ramas; Git no les da comportamientos especiales.

Flujo objetivo:

1. Un pull request hacia `main` o `produccion` ejecuta instalación reproducible, typecheck, lint, Vitest, integración con PostgreSQL y Playwright. No publica una release ni despliega en la VM.
2. La protección de rama exige revisión y checks correctos antes de fusionar, según las capacidades de la cuenta GitHub. Confirmar esas capacidades antes de afirmar que están activas.
3. El `push` resultante del merge a `produccion` ejecuta CI sobre el commit integrado, construye la imagen y verifica los recorridos sobre el artefacto de entrega. Sólo después de superar todos los gates publica una release desplegable vinculada a commit y digest inmutable. Una imagen intermedia publicada para pruebas no implica autorización de despliegue. Un push a `main` ejecuta CI pero no autoriza entrega.
4. Un timer en la VM consulta periódicamente la release aprobada mediante conexiones salientes autenticadas. Debe verificar repositorio, workflow autorizado, evento `push`, rama `produccion`, resultado exitoso y correspondencia commit/digest antes de actuar; no basta encontrar un tag `latest`, un commit o cualquier workflow verde. Descargar y ejecutar scripts del PR no forma parte de este mecanismo.
5. El servicio serializa despliegues, descarga ese digest, aplica únicamente las migraciones compatibles previstas, actualiza `cenit-app`, resuelve de nuevo su dirección en Nginx y comprueba readiness y recorridos básicos. Conserva registro del commit/digest instalado y evita desplegar dos veces la misma release o regresar a una antigua por carreras entre builds. Las actualizaciones no ejecutan semillas ni restablecen la base.
6. Un fallo antes de sustituir la aplicación conserva la versión actual. Si falla la nueva versión, recuperar la imagen anterior sólo cuando sea compatible con el esquema vigente; una migración fallida o incompatible necesita un procedimiento de recuperación explícito. Registrar y notificar el fallo mediante el canal que acuerde el equipo. No prometer rollback automático de datos ni disponibilidad sin interrupciones.

La VM privada no es accesible directamente desde runners públicos sin configurar una ruta de red. El despliegue iniciado desde la VM evita esa dependencia y no necesita publicar SSH en Internet. Un runner self-hosted exclusivamente para CD es otra alternativa, pero su aislamiento y acceso a workflows deben evaluarse antes de instalarlo en una VM compartida; no asumir que una etiqueta del runner impide ejecutar código de PRs.

Se preparó `.github/workflows/ci.yml` con un check estable `CI required`, verificaciones de infraestructura y contrato npm comprobado por `deploy/scripts/check-ci-readiness.py`. La aplicación se omite explícitamente en `main` mientras el repositorio sea un scaffold; en `produccion`, su ausencia falla CI. Una vez presentes los manifiestos, las seis verificaciones npm son obligatorias. Esto aún no se ha ejecutado en GitHub ni autoriza una release.

El usuario confirmó que el repositorio es privado. La conexión del plugin GitHub devolvió 404, pero el acceso Git local permitió consultas autenticadas de sólo lectura: permiso `admin`, Actions habilitado y `main` sin protección, comprobados el 10 de octubre. La disponibilidad de protección de ramas para el plan contratado todavía no se acreditó. El usuario pidió encargarse del commit/push a `main` y de crear `produccion`; el agente conserva los ajustes locales sin publicar ni modificar ramas remotas. La guía de activación, primera ejecución esperada y promoción está en `deploy/CI-CD.md`.

Pendientes de implementación: comprobar permisos y capacidades del plan GitHub para proteger ramas, crear/publicar `produccion` desde la base elegida, habilitar Actions y GHCR, acceso saliente de la VM, credencial de lectura restringida almacenada fuera de Git, formato verificable de release y autenticación, scripts reales del monorepo, Dockerfile/Containerfile, rol runtime, migraciones, Quadlet de aplicación, timer/servicio, retención de imágenes y canal de fallos. Configurar el mecanismo una vez y ensayar una entrega exitosa y otra fallida antes de declararlo operativo.

Referencias: [eventos de workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [red privada con runners alojados](https://docs.github.com/en/actions/concepts/runners/private-networking) y [runners self-hosted](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).

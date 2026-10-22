# Estructura del código de Cenit

Esta guía indica dónde ubicar cambios en el monolito modular existente. El comportamiento, los componentes y sus límites están en el [SDD vigente](../Docs/ARQUITECTURA.md#organización-del-código); los procedimientos de trabajo, en [CONTRIBUTING.md](../CONTRIBUTING.md) y [AGENTS.md](../AGENTS.md).

## Mapa y responsabilidades

| Ubicación | Responsabilidad |
| --- | --- |
| `apps/web/src/app` | Composición, proveedores, rutas y navegación |
| `apps/web/src/features/auth` | Acceso, sesión y guardas de interfaz |
| `apps/web/src/features/purchases` | Listados, filtros, formularios, detalle, captura y revisión de compras |
| `apps/web/src/features/academic` | Catálogo, detalle de asignaturas y consulta de historiales |
| `apps/web/src/shared` | Componentes/utilidades con reutilización real entre funcionalidades |
| `apps/api/src/modules/auth` | Sesión, cuentas y permisos |
| `apps/api/src/modules/purchases` | Rutas, servicios y repositorios de compras/extracción/procedencia |
| `apps/api/src/modules/academic` | Consultas de catálogo e historial y validación de catálogo |
| `apps/api/src/infrastructure` | PostgreSQL, errores, salud y servicio del frontend compilado |
| `apps/ocr` | Inferencia Python/ONNX; no guarda compras ni accede a PostgreSQL |
| `packages/contracts/src` | Schemas públicos TypeBox, tipos, ejemplos y validaciones compartidas |
| `db/schema` | Esquema Drizzle |
| `db/migrations` | SQL aplicado, journal, snapshots y aliases de compatibilidad |
| `db/seeds` | Preparación explícita de cuentas/datos ficticios y carga de catálogo |
| `catalogs/academic` | Versiones inmutables y referencias a fuentes del catálogo |
| `tests` | Integración PostgreSQL, navegador, infraestructura y OCR |
| `experiments` | Investigación reproducible fuera del runtime |
| `deploy/azure` | Bicep, cloud-init, Compose y entrega por el agente Azure |
| `deploy/scripts`, `deploy/local` | Herramientas operativas, supervisor local y preparación de PostgreSQL |
| `deploy/quadlet`, `deploy/systemd` | Instalación anterior; conservar durante la transición |
| `.github/workflows` | CI y publicación/despliegue de imágenes |
| `Docs` | SDD vigente, criterios de aceptación y fuentes recibidas |

## Puntos de composición

[runtime.ts](../apps/api/src/runtime.ts) compone conexiones, repositorios, servicios, health y frontend de producción. [app.ts](../apps/api/src/app.ts) monta los módulos y validaciones HTTP; [server.ts](../apps/api/src/server.ts) inicia el servidor. Las reglas de negocio no se trasladan a esos archivos de composición.

El frontend usa React Router y TanStack Query. Cada funcionalidad conserva sus pantallas, cliente del API y estado en su módulo; no importa modelos Drizzle ni implementa permisos que sustituyan los controles del servidor. Reutilizar un componente en `shared` sólo cuando exista más de un consumidor real.

En API, las rutas adaptan HTTP, los servicios aplican reglas y los repositorios consultan PostgreSQL de forma parametrizada. Compartir contratos públicos, no estructuras internas. Las pruebas unitarias viven junto al código; los casos con PostgreSQL, navegador o contenedores se ubican en los harness de `tests`.

## Build y operación

[Containerfile](../Containerfile) construye contratos, API, herramientas operativas y web. [tsconfig.operations.json](../deploy/tsconfig.operations.json) compila el cargador académico existente; sus resultados en `dist/operations` son generados e ignorados por Git. No añadir otra implementación del cargador para Azure.

El runtime sirve únicamente `apps/web/dist`, no fuentes ni documentación del repositorio. El catálogo y sus fuentes empaquetadas son para el cargador explícito; no se publican por HTTP como archivos estáticos. Build, migración, preparación de cuentas y carga de catálogo son operaciones diferentes.

Los comandos pertenecen a [Entorno local](../deploy/LOCAL.md), [Azure](../deploy/azure/README.md) o [VM anterior](../deploy/README.md), según el destino. Los workflows actuales entregan `develop` a staging y `main` a producción demo; el polling anterior no recibe esas entregas.

## Al decidir dónde cambiar código

- Mantener lógica específica en su módulo; extraer sólo reutilización comprobada. No crear carpetas o funciones vacías para completar un mapa futuro.
- Cambiar schemas públicos y consumidores juntos; no copiar contratos dentro del frontend o del procesador OCR.
- Añadir migraciones nuevas cuando corresponda; no editar SQL aplicado, journal o aliases para ajustar una entrega.
- Mantener un solo lockfile y las versiones fijadas. Conservar modelos, compilados, secretos, bases y reportes temporales fuera de Git.
- Personal y Bienes conservan páginas de construcción hasta definir sus requisitos. No implementar simulación, imputaciones ni acceso a Oracle a partir de propuestas históricas.

Actualizar este mapa cuando cambien responsabilidades o rutas; el detalle funcional se actualiza en la sección correspondiente del SDD para evitar documentos contradictorios.

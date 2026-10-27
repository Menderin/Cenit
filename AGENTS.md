# Trabajo de agentes en Cenit

Cenit es un monolito modular para la Facultad de Medicina de la UCN. El proyecto contempla Compras, Personal, Bienes y consulta académica de Nutrición; el MVP actual se concentra en Compras y académico. El alcance completo y el funcionamiento vigente están en [Arquitectura](Docs/ARQUITECTURA.md).

## Antes de trabajar

- Leer [CONTRIBUTING.md](CONTRIBUTING.md), revisar Git y conservar el trabajo existente.
- Consultar la tarea y sus asignaciones vigentes en Jira. Trabajar sólo en el alcance solicitado; registrar las dependencias ajenas sin asumir su implementación ni su cierre.
- Antes de modificar una funcionalidad, leer su sección de Arquitectura y sus contratos/código. Para operaciones, consultar [entorno local](deploy/LOCAL.md), [Azure](deploy/azure/README.md) o [servidor anterior](deploy/README.md), según el destino.
- Identificar resultado observable, archivos afectados y comprobaciones necesarias antes de editar. Explicar y consultar contradicciones que afecten alcance, permisos o reglas de negocio; continuar el trabajo independiente.
- Usar los mismos prefijos del equipo (`feat/`, `fix/`, `test/`, `docs/`). No crear tickets, PR, merges, mensajes a compañeros o cambios de Jira sin autorización explícita.

## Límites del producto

- Cenit recupera y conserva copias revisadas; no usa la API de Oracle ni modifica sus registros, pagos o aprobaciones.
- La extracción produce candidatos para revisión humana y nunca guarda automáticamente. Los desconocidos quedan en `null`; no se inventan referencias ni valores institucionales.
- Personal y Bienes requieren definición y validación antes de implementar; no añadirlos al sprint por estar nombrados en el Charter.
- Mantener login local, un rol por cuenta y sesión fija de dos horas. No implementar políticas de jornada, permisos por objeto, retención o tratamiento de datos por iniciativa del agente.
- Académico conserva `pending` mientras no haya reglas validadas. No deducir AND/OR ni `none` de flechas; no añadir simulación.
- La demo y QA usan datos ficticios. La investigación o el acceso técnico no acreditan permiso para usar fuentes reales.

## Contratos que deben conservarse

- Inicio consulta `GET /api/v1/purchases/summary` con `requests`, `pending`, `pendingAmount` y `days`; usa las mismas cabeceras del listado y se refresca tras altas, validación y eliminación.
- Filtros de compras automáticos tras 250 ms del último conjunto válido; una fecha incompleta o rango inválido conserva el borrador y los resultados anteriores. Unidad y proyecto coinciden en el mismo ítem.
- Eliminar sólo desde el detalle, mediante ícono accesible y confirmación; sesión administrativa, Origin, versión esperada y transacción de cabecera/ítems.
- Montos exactos como cadenas, identificadores textuales, guardado atómico y reintentos idempotentes. No imponer suma ítems=total ni sobrescribir conflictos silenciosamente.
- Confirmar éxito sólo después del servidor; conservar borradores ante errores según el comportamiento vigente de sesión.

## Código, datos y verificación

- Mantener React/Vite/TypeScript, React Router, TanStack Query, Tailwind y los componentes seleccionados; no sustituir el stack ni actualizar dependencias automáticamente.
- API en Fastify, PostgreSQL y Drizzle. Compartir schemas públicos TypeBox, no modelos internos. Validar entradas/respuestas y permisos en servidor.
- Código específico en su módulo de `apps/web` o `apps/api`; contratos en `packages/contracts`, esquema/migraciones en `db`. Extraer a `shared` sólo reutilización real. Usar npm workspaces y un único lockfile.
- Respetar las versiones fijadas. No introducir dependencias o abstracciones sin justificar una necesidad concreta.
- No editar ni renombrar SQL aplicado. Usar el migrador separado `deploy/migrate.cjs`; conservar journal y aliases legados por timestamp/hash. No ejecutar migraciones como parte de un merge. La entrega usa su migrador separado y nunca ejecuta semillas ni resets.
- Para QA, usar los harness existentes y PostgreSQL exclusivo de pruebas. Avisar antes de ensayos que creen/migren/preparen bases descartables; no operar sobre bases reales ni sustituir PostgreSQL por SQLite para acreditar garantías.
- [Pruebas y aceptación](Docs/PRUEBAS-Y-ACEPTACION.md) relaciona criterios y casos. Ejecutar las comprobaciones afectadas y distinguir resultados propios, evidencia histórica y pendientes; no crear tests redundantes.
- No guardar secretos, datos de PostgreSQL, formularios completos, capturas privadas o reportes temporales en Git. No exponer trazas internas en el API.
- Actualizar el documento existente cuando cambie el comportamiento. Mantener lenguaje comprensible para el equipo; no crear informes de cada sesión ni repetir decisiones en varios archivos.

## Entrega y operación

`develop` integra y entrega staging; `main` entrega producción de la demostración. Mantener PR, revisión independiente y CI sobre el SHA integrado. Las imágenes se verifican y fijan por digest; runtime y migrador usan secretos distintos. Las actualizaciones habituales se realizan mediante Actions/Azure, no con builds o `git pull` manuales en la VM.

No retirar el servidor anterior antes de verificar respaldo, transferencia y recorridos; no tocar Zableke/Jenkins ni servicios ajenos. No borrar volúmenes, hacer prune global o restaurar datos automáticamente para recuperar una imagen. Un bootstrap, un workflow versionado o un timer en espera no acreditan una entrega operativa.

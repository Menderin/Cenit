# Instrucciones para agentes de Cenit

## Aplicación y referencias

Estas instrucciones aplican a todo el repositorio. Antes de iniciar una tarea, leer [CONTRIBUTING.md](CONTRIBUTING.md). Antes de modificar código, leer además [AGENTS/SDD.md](AGENTS/SDD.md), [la guía de estructura](AGENTS/ESTRUCTURA.md) y las instrucciones adicionales de la carpeta afectada.

- `Docs/Guía de trabajo para el MVP de Cenit.pdf`: contexto y alcance de la demostración del 15 de octubre de 2026.
- `AGENTS/SDD.md`: base técnica interna, contratos y pendientes del MVP. Distinguir decisiones de trabajo, supuestos de demo y validaciones del equipo o cliente.
- [CONTRIBUTING.md](CONTRIBUTING.md): flujo de colaboración, ramas, PR, revisiones, coordinación de archivos compartidos y criterios de terminado. Aplicar estas reglas también al trabajo de agentes; no inventar tickets ni saltar revisión/CI.
- [AGENTS/ESTRUCTURA.md](AGENTS/ESTRUCTURA.md): mapa de carpetas, responsabilidad de cada ubicación, límites de dependencia y criterios para colocar código/pruebas. Consultarlo antes de crear o mover archivos; actualizarlo si cambia la organización. No completar carpetas con código innecesario ni ampliar alcance para retirar `.gitkeep`.
- `README.md`: instrucciones ejecutables; actualizarlo cuando cambie el arranque, configuración o verificación.
- [Docs/ACADEMICO.md](Docs/ACADEMICO.md): esquema/contratos académicos implementados, trazabilidad y dependencias de login. Leerlo antes de modificar catálogo o progreso.

Ante una contradicción que afecte alcance, contratos o reglas de negocio, explicarla y solicitar una decisión. No inventar procesos institucionales ni afirmar que una funcionalidad existe sin verificarla.

## Alcance

La aclaración más reciente define compras como recuperación y organización de registros ya cargados en Oracle, sustituyendo transcripción de pantallazos a Excel. Cenit no realiza compras ni modifica Oracle. Tabla consultable y registros conservados en Cenit confirmados; Google Sheets es opcional. Para actualizar copia, recuperar/reintentar y revisar cambios pertinentes; disparador manual o automático aún pendiente. No asumir edición manual libre ni implementación de contratos antiguos de PUT sin adaptar el flujo. Catálogo académico en PostgreSQL confirmado. Fichas y pendientes en `Docs/HISTORIAS-USUARIO-INVEST.md`; no resolver supuestos automáticamente. Las cuentas locales las prepara el equipo, sin registro público.

Priorizar el registro persistente de compras y después la visualización de la malla de Nutrición. Usar datos ficticios en compras y mostrar que la aplicación es una demostración. Compras necesita alta, búsqueda, filtros, detalle y edición. La malla necesita catálogo versionado y prerrequisitos oficiales recibidos/verificados. El líder excluyó simulación y persistencia de simulaciones de este MVP; no implementarlas como compromiso del jueves.

La aclaración del líder del 10 de octubre añade login y recuperación automática de datos de compras. Login local confirmado; Google queda para una iteración posterior. Definir detalles de cuenta y contrato de sesión antes de implementar. Roles `docente` y `estudiante` acceden a malla/prerrequisitos; `administrativo` gestiona compras sin acceso académico por defecto. Aplicar permisos en servidor y no aceptar asignación de rol desde el login. Mantener separación funcional en el monolito; los dos futuros módulos administrativos no forman parte del sprint actual. La fuente académica recibida es `Docs/malla-nutricion-y-dietetica-2027.pdf`; no inferir prerrequisitos ausentes del gráfico. Investigar captura desde API de Oracle o imagen mediante OCR/visión: aún no se contactó a los encargados ni se eligió mecanismo. Leer `Docs/PLANIFICACION-MVP.md` y fichas vigentes `Docs/HISTORIAS-USUARIO-INVEST.md`; supuestos pendientes no son requisitos aprobados. No sustituir automatización por transcripción manual sin decisión explícita.

No incorporar Banner, autenticación institucional, pagos, aprobaciones oficiales, importación masiva ni otros procesos administrativos sin una ampliación explícita del alcance. Investigar Oracle no acredita autorización o acceso a sistemas reales. Revisión en Cenit, pago declarado y aprobación institucional son conceptos distintos.

## Convenciones técnicas

Ampliación autorizada del 11 de octubre: estudiantes consultan su progreso persistido y docentes buscan a todos los estudiantes ficticios de Nutrición por nombre/RUT. Historial de intentos y notas, sin simulación ni edición pública. Imagen `Docs/Foto prerequisitos Nutricion.jpeg` prioritaria para nombres/SCT; plan 2027 confirmado por el equipo. Semántica de flechas y ausencia de requisitos sigue pendiente: mantener `pending`, nunca inferir AND/OR o `none`. Perfiles/historial preparados como propuesta fuera del journal hasta revisar la FK con HU01-T03; no crear usuarios ni credenciales duplicadas para desbloquearlos.

La base npm inicializa API/contratos sin alterar frontend. El marcador `cenitStage: academic-foundation` permite integración únicamente en `develop` con pruebas académicas obligatorias; no permite entrega en `main`. Retirarlo al completar los tres workspaces y checks reales. Mantener el publicador deshabilitado. El servidor académico sin adaptador de login deniega acceso; no introducir identidades por headers ni fingir readiness.

- Conservar React, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS y componentes seleccionados de shadcn/ui. No sustituir el stack del frontend por iniciativa del agente.
- Usar como base técnica de trabajo Node.js 24 LTS con TypeScript, Fastify 5, API REST JSON, PostgreSQL 17, Drizzle y contratos TypeBox/JSON Schema. Este stack proviene de la guía; REST y las versiones son concreciones técnicas documentadas en el SDD. La ratificación del equipo sigue pendiente; no presentarla como realizada.
- Mantener un monolito modular. Separar compras y académico; cada módulo controla sus reglas y acceso a datos. No añadir microservicios, GraphQL ni abstracciones genéricas sin una decisión documentada.
- Seguir la organización mixta de la sección 4 del SDD: frontend en `apps/web`, backend en `apps/api`, esquema/migraciones/semillas en `db` y contratos públicos en `packages/contracts`. Agrupar el código específico por compras y académico; reservar `shared` para reutilización real. No duplicar estas raíces con carpetas `front`, `back` o `bd`.
- Retirar el `.gitkeep` de una carpeta al añadir su primer archivo real. No versionar datos de PostgreSQL, volúmenes ni artefactos de ejecución.
- Compartir contratos de API, no modelos internos de persistencia. Validar entradas en el servidor y definir esquemas de respuesta.
- No introducir cambios incompatibles en contratos, migraciones o catálogo sin explicar su impacto y coordinar los consumidores afectados.
- Usar consultas parametrizadas, montos exactos y transacciones. No guardar una compra parcialmente ni sobrescribir cambios concurrentes silenciosamente.
- Usar npm workspaces y un único `package-lock.json`; ejecutar `npm ci` en CI y builds. Fijar versiones exactas compatibles al inicializar la base, incluida la versión de npm. El frontend conserva las versiones compatibles que acuerde su encargado; no actualizarlo automáticamente.
- Implementar los nombres, formatos, errores, filtros y ejemplos de las secciones 10 a 16 del SDD. Los valores de demo allí definidos permiten avanzar; los pendientes institucionales no deben resolverse inventando información.
- Los contratos son la fuente única para solicitudes y respuestas. Una modificación afecta API, frontend y verificaciones; actualizar esos consumidores en el mismo cambio o coordinar explícitamente la integración.

## Trabajo del equipo

Seguir [CONTRIBUTING.md](CONTRIBUTING.md) para coordinar tareas e integración. Leer también [historias vigentes](Docs/HISTORIAS-USUARIO-INVEST.md) y [planificación](Docs/PLANIFICACION-MVP.md) cuando la tarea dependa del alcance o de criterios del sprint. Para contenedores/despliegue, consultar [entorno local](deploy/LOCAL.md), [operación VM](deploy/README.md), [CI/CD](deploy/CI-CD.md) y [contrato de entrega](deploy/CD-VM.md) antes de modificar esos componentes. No duplicar decisiones técnicas en la guía de colaboración ni interpretar propuestas de calendario/capacidad como compromisos colectivos confirmados.

1. Identificar el resultado observable, archivos afectados, dependencias y criterios de aceptación antes de editar.
2. Hacer cambios pequeños y coherentes. Revisar el estado de Git y preservar trabajo ajeno; no revertir ni eliminar cambios de otros agentes.
3. Si hay trabajo paralelo autorizado, acordar propiedad de archivos y contratos antes de editar. Evitar modificaciones simultáneas del mismo archivo.
4. No introducir dependencias sin justificar qué necesidad concreta resuelven. Preferir las herramientas existentes.
5. Verificar las reglas y recorridos afectados. No declarar pruebas exitosas si no se ejecutaron; informar bloqueos y limitaciones.
6. Actualizar documentación cuando cambien decisiones o instrucciones ejecutables. Informar qué cambió, cómo se verificó y qué queda pendiente.

## Datos, interfaz y calidad

- Mantener identificadores documentales como texto. No completar datos desconocidos con información inventada ni normalizar referencias silenciosamente.
- Separar montos registrados del documento y montos imputados coincidentes con filtros; no duplicar totales por joins.
- Confirmar guardado solamente tras éxito del servidor. Conservar borradores ante errores o conflictos.
- Usar etiquetas visibles, navegación por teclado y estados comprensibles de carga, vacío y error. No depender exclusivamente del color.
- No guardar credenciales en Git, registrar formularios completos ni devolver trazas internas al cliente.
- Probar reglas con Vitest, transacciones y concurrencia contra PostgreSQL y recorridos esenciales con Playwright. No reemplazar PostgreSQL por SQLite para acreditar esas garantías.
- Una entrega está terminada cuando satisface criterios, está integrada, revisada y funciona en el build de demostración. Una pantalla aislada no completa una historia.

## Ejecución y entrega

La presentación utiliza un build de producción. Preparar una imagen de aplicación y PostgreSQL persistente; verificar la VM y modalidad disponible de Podman antes de declarar un despliegue listo. Mantener una ejecución local ensayada de la misma versión. Las semillas y restablecimientos son exclusivos de demostración y pruebas, nunca una operación pública ni una acción sobre una base real.

La infraestructura puede prepararse antes del build usando `deploy/scripts/bootstrap-vm.sh`: Nginx temporal y PostgreSQL rootless con Quadlet. Leer `deploy/README.md` antes de cambios de operación. No confundir `/health/proxy` en modo bootstrap con disponibilidad de la aplicación. Mantener secretos y estado en los directorios privados del usuario de la VM, imágenes fijadas por digest y servicios existentes de Zableke/Jenkins intactos.

El usuario requiere despliegue automático después de superar CI e integrar cambios en la rama de entrega. No diseñar actualizaciones habituales mediante SSH, `git pull` o builds manuales en la VM. La propuesta de CI/CD, sus garantías y los pendientes están en la sección 18 del SDD; no afirmar que existe un pipeline hasta implementarlo y verificarlo.

Usar `develop` como integración y `main` como rama de entrega; cambios mediante PR y CI. GitHub Actions ejecuta builds/pruebas fuera de la VM y ésta consultará releases aprobadas para desplegar. Leer `deploy/CI-CD.md`. No sustituir tests por scripts que siempre pasan ni habilitar releases mientras falte aplicación, validación del artefacto y conexión de CD.

El contrato del ejecutor preparado está en `deploy/CD-VM.md`. Al implementar imagen/workflow respetar digest, procedencia verificable, nombres de gates/artefacto, `DATABASE_URL_FILE`, migrador separado y esquema `cenit`. No introducir credenciales administrativas en el runtime, semillas automáticas, rollback de datos ni prune global. La instalación local de archivos o un estado de espera no acreditan un despliegue real: ensayar entrega y recuperación en la VM antes de declararlo operativo.

Transición de ramas del 11 de octubre: la antigua `produccion` deja de ser destino de CI/publicación. Mantener publicación deshabilitada hasta actualizar el ejecutor instalado en la VM para validar `main`; el cambio local de scripts no actualiza esa copia. Procedimiento y condiciones para retirar la rama antigua en `deploy/CI-CD.md`.

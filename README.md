# Cenit

Cenit es una plataforma web para organizar información administrativa y facilitar la consulta académica de Nutrición y Dietética en la Facultad de Medicina de la Universidad Católica del Norte, sede Coquimbo.

El Project Charter contempla Compras, Personal, Bienes y consulta académica. La primera entrega se concentra en Compras y académico; Personal y Bienes requieren definición y validación de sus requisitos antes de implementarlos.

## Qué se puede consultar

- **Compras:** recuperar candidatos desde una captura PNG/JPEG con OCR local, revisarlos y conservar explícitamente una copia; buscar, filtrar, consultar, validar localmente y eliminar desde el detalle con confirmación.
- **Inicio administrativo:** contadores y monto pendiente de las compras guardadas, actualizados desde PostgreSQL.
- **Académico:** malla de Nutrición por semestre, detalle de asignaturas e historiales ficticios; el estudiante consulta su propio avance y el docente busca estudiantes por nombre/RUT.
- **Acceso:** cuentas locales con permisos según rol y sesión fija de dos horas. No hay registro público.

Cenit complementa los sistemas institucionales: no usa la API de Oracle, no cambia sus registros ni realiza pagos o aprobaciones oficiales. La extracción requiere revisión humana y no guarda automáticamente. Los prerrequisitos cuya interpretación no está validada se muestran como pendientes; la malla no evalúa habilitación ni ofrece simulación. Los datos de demostración y de pruebas son ficticios.

## Por dónde empezar

| Necesidad | Documento |
| --- | --- |
| Instalar, configurar y ejecutar localmente | [Entorno local](deploy/LOCAL.md) |
| Comprender módulos, contratos, datos y límites | [Arquitectura y funcionamiento](Docs/ARQUITECTURA.md) |
| Revisar criterios, pruebas y resultados | [Pruebas y aceptación](Docs/PRUEBAS-Y-ACEPTACION.md) |
| Preparar o mantener el destino de entrega | [Azure](deploy/azure/README.md) |
| Contribuir, preparar commits y revisar cambios | [Guía de colaboración](CONTRIBUTING.md) |
| Trabajar con un agente | [Instrucciones para agentes](AGENTS.md) |
| Reproducir la investigación OCR | [Experimentos de compras](experiments/purchases/README.md) |
| Consultar modelos OCR y licencias | [Modelos](apps/ocr/MODELS.md) |
| Mantener el servidor anterior durante la transición | [Instalación anterior](deploy/README.md) |

La documentación se actualiza con el producto; las versiones anteriores se consultan en Git. Jira conserva el backlog y las asignaciones. El Charter y las actas del proyecto definen el alcance acordado y la aceptación de los responsables; este repositorio conserva las instrucciones de la versión y su evidencia técnica.

## Herramientas

Frontend React/Vite/TypeScript; API REST Fastify; PostgreSQL y Drizzle; contratos TypeBox compartidos. OCR auxiliar Python/ONNX separado de las reglas de persistencia. Se usan npm workspaces y un único lockfile. Las versiones exactas se fijan en `.node-version`, `package.json`, `package-lock.json` y `deploy/images.lock.json`.

Antes de ejecutar comandos, preparar la conexión y las cuentas ficticias siguiendo la guía local. Los ejemplos siguientes no preparan una base nueva:

```sh
npm ci
npm run dev
```

Desarrollo abre Vite en `http://127.0.0.1:5173`; la API usa `3000`. La demo compilada se presenta en `http://127.0.0.1:8081`, con configuración y servicios descritos en [Entorno local](deploy/LOCAL.md). Las credenciales se consultan sólo en los archivos privados de preparación; no se incorporan a Git ni a capturas.

Para verificar código:

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Integración y navegador necesitan PostgreSQL exclusivo de pruebas; consultar sus requisitos antes de ejecutar `npm run test:integration` o `npm run test:e2e`. El catálogo se valida sin publicarlo con `npm run catalog:check`.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `apps/web` | Interfaz y navegación |
| `apps/api` | API, reglas y consultas por módulo |
| `apps/ocr` | Inferencia auxiliar |
| `packages/contracts` | Contratos públicos de solicitudes y respuestas |
| `db` | Esquema, migraciones y preparación ficticia |
| `catalogs/academic` | Catálogo y fuentes versionadas |
| `tests` | Integración, recorridos de navegador, infraestructura y OCR |
| `deploy` | Configuración y operación |
| `Docs` | Arquitectura, aceptación y fuentes recibidas |
| `experiments` | Investigación reproducible fuera del runtime |

## Entregas y pendientes

`develop` integra y entrega staging en `https://develop.cenit.dpdns.org`; `main` entrega producción de la demostración en `https://cenit.dpdns.org`, mediante PR, revisión y CI. Un workflow correcto acredita su ejecución; los recorridos y la recuperación en el destino se comprueban por separado.

La exactitud OCR con muestras y criterios acordados con el cliente y la interpretación oficial de prerrequisitos siguen requiriendo validación. Las funcionalidades de Personal y Bienes son incrementos posteriores; nombrarlas en el Charter no define automáticamente sus campos o permisos. La matriz mantiene los casos sin cobertura y las dependencias de esas validaciones.

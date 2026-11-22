# Cenit

Cenit es una plataforma web para organizar información administrativa y facilitar la consulta académica de Nutrición y Dietética en la Facultad de Medicina de la Universidad Católica del Norte, sede Coquimbo.

El Project Charter contempla Compras, Personal, Bienes y consulta académica. La primera entrega se concentra en Compras y académico; Personal y Bienes se ofrecen como propuestas que requieren validación de sus requisitos con la Facultad.

## Qué se puede consultar

- **Compras:** recuperar candidatos desde una captura PNG/JPEG con OCR local, revisarlos y conservar explícitamente una copia; buscar, filtrar, consultar, corregir, validar localmente, exportar a Excel y eliminar desde el detalle con confirmación. La copia a Sheets se habilita por entorno y requiere una planilla de pruebas comprobada.
- **Inicio administrativo:** contadores y monto pendiente de las compras guardadas, actualizados desde PostgreSQL.
- **Académico:** malla de Nutrición por semestre, detalle de asignaturas e historiales ficticios; el estudiante consulta su propio avance y el docente busca estudiantes por nombre/RUT.
- **Acceso:** cuentas locales y Google opcional para cuentas exactas autorizadas y vinculadas; permisos según rol y sesión fija de dos horas. No hay registro público.
- **Personal:** propuestas de Comisión de servicios y Solicitud de permiso, con formulario temporal y PDF generado por el servidor para imprimir y firmar.
- **Bienes:** propuesta de inventario, responsables, entregas y préstamos, con documentos PDF y datos ficticios para validar su alcance.

Cenit complementa los sistemas institucionales: no usa la API de Oracle, no cambia sus registros ni realiza pagos o aprobaciones oficiales. La extracción requiere revisión humana y no guarda automáticamente. Los prerrequisitos cuya interpretación no está validada se muestran como pendientes; la malla no evalúa habilitación ni ofrece simulación. Los datos de demostración y de pruebas son ficticios.

## Por dónde empezar

| Necesidad | Documento |
| --- | --- |
| Instalar, configurar y ejecutar localmente | [Entorno local](deploy/LOCAL.md) |
| Comprender módulos, componentes, contratos y límites | [Diseño de software (SDD) y diagramas](Docs/ARQUITECTURA.md) |
| Consultar el índice del SDD restaurado y el mapa del código | [SDD](AGENTS/SDD.md) y [Estructura](AGENTS/ESTRUCTURA.md) |
| Revisar criterios, pruebas y resultados | [Pruebas y aceptación](Docs/PRUEBAS-Y-ACEPTACION.md) |
| Elegir el destino de una release | [Selector Azure/AWS](deploy/aws/README.md#cómo-se-elige-el-destino) y [controles de entrega](deploy/azure/README.md#flujo-de-una-entrega-y-controles) |
| Diagnosticar y recuperar el destino | [Operación AWS](deploy/aws/README.md) y [operación Azure](deploy/azure/README.md#diagnóstico-y-recuperación) |
| Cargar la malla en staging o producción | [Publicación explícita del catálogo](deploy/azure/README.md#publicar-el-catálogo-académico-operación-explícita) |
| Contribuir, preparar commits y revisar cambios | [Guía de colaboración](CONTRIBUTING.md) |
| Trabajar con un agente | [Instrucciones para agentes](AGENTS.md) |
| Reproducir la investigación OCR | [Experimentos de compras](experiments/purchases/README.md) |
| Consultar modelos OCR y licencias | [Modelos](apps/ocr/MODELS.md) |
| Mantener el servidor anterior durante la transición | [Instalación anterior](deploy/README.md) |

La documentación se actualiza con el producto; las versiones anteriores se consultan en Git. Jira conserva el backlog y las asignaciones. El Charter y las actas del proyecto definen el alcance acordado y la aceptación de los responsables; este repositorio conserva las instrucciones de la versión y su evidencia técnica. El formato de entrega documental confirmado es **Markdown del repositorio**, incluidos diagramas Mermaid editables; no se generan copias PDF/Word con otra versión de las decisiones.

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

Integración y navegador necesitan PostgreSQL exclusivo de pruebas; consultar sus requisitos antes de ejecutar `npm run test:integration` o `npm run test:e2e`. El catálogo se valida sin publicarlo con `npm run catalog:check`. Build compila contratos, API, cargador operativo y web; no migra ni prepara datos. El [verificador de imagen](deploy/LOCAL.md#verificar-el-build-o-una-imagen) usa recursos descartables propios.

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

`develop` integra y entrega staging; `main` entrega producción de la demostración, mediante PR, revisión y CI. `Cenit Release` selecciona AWS con `CENIT_DEPLOY_TARGET=aws` y Azure con el valor vacío o `azure`. Cada entrega toma los dominios de su configuración versionada. El archivo de [AWS](deploy/aws/config.json) configura staging en `https://develop.cenit.gaelo.tech` y producción en `https://cenit.gaelo.tech`; la [guía Azure](deploy/azure/README.md) conserva sus dominios dpdns. Cotejar el SHA y la configuración instalados de cada entorno, porque una promoción pendiente puede conservar dominios anteriores. Un workflow correcto acredita su ejecución; los recorridos y la recuperación en el destino se comprueban por separado.

El [estado de implementación del SDD](Docs/ARQUITECTURA.md#estado-de-la-implementación) separa funciones implementadas, herramientas preparadas y pendientes. Que el despliegue esté listo no acredita cuentas ni malla cargadas: su preparación es explícita por entorno. `/health/ready` comprueba PostgreSQL y esquema, no datos de demo ni la disponibilidad de OCR. El catálogo vigente interpreta el diagrama mediante revisión del equipo; eso no equivale a aceptación institucional.

La exactitud OCR con muestras y criterios acordados con el cliente y la interpretación oficial de prerrequisitos siguen requiriendo validación. Las funcionalidades de Personal y Bienes son incrementos posteriores; nombrarlas en el Charter no define automáticamente sus campos o permisos. La matriz mantiene los casos sin cobertura y las dependencias de esas validaciones.

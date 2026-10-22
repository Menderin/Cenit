# Cenit — SPECIFIC DRIVEN DEVELOPMENT (SDD)

El diseño vigente se mantiene en [Diseño de software: arquitectura y funcionamiento](../Docs/ARQUITECTURA.md). Este archivo conserva el punto de entrada del SDD restaurado, sin mantener una segunda especificación de contratos o decisiones.

## Consultar el diseño vigente

| Contenido | Referencia principal |
| --- | --- |
| Alcance, implementado, preparado y pendiente | [Estado de la implementación](../Docs/ARQUITECTURA.md#estado-de-la-implementación) |
| Componentes, frontend/API/PostgreSQL y separación por módulo | [Organización y diagrama](../Docs/ARQUITECTURA.md#organización-del-código) |
| Identidad, permisos y sesión fija de dos horas | [Autenticación](../Docs/ARQUITECTURA.md#autenticación-y-sesión) |
| Copias de compras, transacciones, filtros y revisión local | [Compras](../Docs/ARQUITECTURA.md#compras) |
| Capturas, candidatos, límites y procedencia | [OCR](../Docs/ARQUITECTURA.md#capturas-y-ocr) |
| Catálogo versionado, reglas interpretadas e historiales | [Académico](../Docs/ARQUITECTURA.md#académico) |
| Persistencia, migrador y contratos públicos | [Persistencia y contratos](../Docs/ARQUITECTURA.md#persistencia-y-contratos) |
| Distribución de archivos y límites de dependencia | [Estructura](ESTRUCTURA.md) |
| Variables, secretos por referencia y arranque | [Entorno local](../deploy/LOCAL.md) |
| CI/CD, VM actual, diagnóstico y recuperación | [Azure](../deploy/azure/README.md) |
| VM compartida anterior | [Transición](../deploy/README.md) |
| Criterios y evidencia | [Pruebas y aceptación](../Docs/PRUEBAS-Y-ACEPTACION.md) |

## Actualización y revisión

Actualizar la sección correspondiente de Arquitectura cuando cambie el comportamiento; los schemas públicos de `packages/contracts` y el código son la referencia ejecutable. No reintroducir propuestas anteriores de imputaciones, simulación o contratos alternativos como requisitos vigentes. Las nuevas decisiones necesitan revisión y trazabilidad a la tarea autorizada.

La entrega documental acordada es Markdown del repositorio, con diagramas Mermaid revisables. La existencia de documentación o código no acredita aceptación institucional ni operación comprobada en Azure. Consultar [CONTRIBUTING.md](../CONTRIBUTING.md) antes de integrar cambios.

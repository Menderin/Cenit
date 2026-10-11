# Cenit

MVP de registro auxiliar de compras con datos ficticios, login local y visualización de la malla de Nutrición con prerrequisitos oficiales, para la demostración del 15 de octubre de 2026. La simulación académica queda para una iteración posterior. Este alcance no acredita funciones implementadas.

## Documentación de trabajo

- [Instrucciones para agentes](AGENTS.md)
- [Guía de colaboración del equipo](CONTRIBUTING.md)
- [Diseño técnico, contratos y pendientes para el equipo](AGENTS/SDD.md)
- [Mapa de carpetas y distribución del código](AGENTS/ESTRUCTURA.md)
- [Catálogo, contratos, progreso académico y comandos de verificación](Docs/ACADEMICO.md)
- [Borrador de planificación, épicas, historias y tareas del MVP](Docs/PLANIFICACION-MVP.md)
- [Historias, criterios de aceptación y habilitadores del sprint 3](Docs/BACKLOG-SPRINT-3.md)
- [Fichas vigentes INVEST: descripción, criterios y tareas por historia y módulo](Docs/HISTORIAS-USUARIO-INVEST.md)
- [Guía de trabajo del MVP](Docs/Guía%20de%20trabajo%20para%20el%20MVP%20de%20Cenit.pdf)
- [Proxy y despliegue en la VM compartida](deploy/README.md)
- [Preparar contenedores locales con Podman](deploy/LOCAL.md)
- [CI/CD, ramas y activación de GitHub Actions](deploy/CI-CD.md)
- [Instalar el ejecutor de CD en la VM y contrato de la futura imagen](deploy/CD-VM.md)

## Estructura del repositorio

Se utiliza organización mixta: separación técnica y módulos de negocio dentro de cada aplicación.

| Carpeta | Responsabilidad |
| --- | --- |
| `apps/web` | Frontend React; funcionalidades de compras y académico |
| `apps/api` | Backend Fastify; módulos de compras y académico |
| `db` | Esquema Drizzle, migraciones y semillas ficticias |
| `packages/contracts` | Schemas y tipos públicos compartidos entre frontend y backend |
| `catalogs/academic` | Mallas versionadas y sus fuentes |
| `tests/integration` | API y PostgreSQL |
| `tests/e2e` | Recorridos del navegador |
| `deploy` | Instalador de infraestructura temporal, Nginx, Quadlet y guía de despliegue |
| `AGENTS` y `Docs` | Instrucciones, diseño y antecedentes del proyecto |

La estructura completa y las reglas para ubicar código están en la sección 4 del SDD. Las carpetas vacías contienen `.gitkeep`; retirarlo al incorporar el primer archivo real. Los datos de PostgreSQL se conservan en un volumen fuera del repositorio.

Este checkout contiene infraestructura, catálogo académico y API de autenticación local: contratos npm, migraciones y pruebas PostgreSQL. Login usa correo/contraseña, roles de servidor y sesión fija de dos horas. El frontend sigue pendiente; el historial continúa como propuesta separada, con identidad UUID de cuentas ya definida. CI verifica esta base en `develop` y bloquea promoverla como aplicación completa a `main`. La [primera ejecución histórica](https://github.com/Menderin/Cenit/actions/runs/38071046810) no acredita estos nuevos checks. No hay imagen del MVP ni ensayo de entrega/recuperación completado.

## Verificar el backend académico

Con Node 24.21.0, npm 11.19.0 y PostgreSQL 17 local preparado:

```powershell
npm ci
npm run typecheck
npm run catalog:check
npm run test:unit
npm run test:integration
npm run build:academic
```

Las pruebas de integración crean bases/roles propios y descartables; conservan `cenit_demo`. El catálogo y las cuentas no se cargan automáticamente al migrar. Comandos de carga y adaptación del frontend en [la guía académica](Docs/ACADEMICO.md); arranque, preparación privada de cuentas y prueba de login en [AUTENTICACION.md](Docs/AUTENTICACION.md). `build:academic` compila toda la API/contratos, incluida autenticación, no constituye el build del MVP.

## Arranque local de infraestructura

Con Python, Podman y su proveedor Compose disponibles, ejecutar desde la raíz:

```powershell
python deploy/scripts/setup-local.py
podman compose up -d db proxy
Invoke-RestMethod 'http://127.0.0.1:8081/health/proxy'
```

Se espera `status: ok`, `mode: bootstrap`. PostgreSQL persiste en un volumen propio; `podman compose down` conserva los datos. Los secretos generados en `.local` y la configuración `.env` no se versionan. Consultar [la guía local](deploy/LOCAL.md) para preparar la máquina Podman, resolver puertos y activar posteriormente la aplicación.

## Flujo vigente de ramas

CI se ejecuta al hacer **push** en `feat/**`, `fix/**`, `test/**`, `docs/**`, `codex/**`, `develop` y `main`, además de PR hacia `develop`/`main`. Un commit local necesita `Push origin` para llegar a Actions; no hace falta abrir PR para probar la rama. Consultar la ejecución por rama/commit en la pestaña Actions.

`rama de tarea → develop → main`, mediante PR, revisión y CI. `develop` integra funcionalidades; `main` autoriza entregas verificadas. El publicador sigue deshabilitado hasta completar aplicación/tests y actualizar el ejecutor instalado en la VM para aceptar `main`. La rama antigua `produccion` no es destino del nuevo flujo; retirarla tras comprobar la transición según [CI/CD](deploy/CI-CD.md).

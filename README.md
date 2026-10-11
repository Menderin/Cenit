# Cenit

MVP de registro auxiliar de compras con datos ficticios, login local y visualización de la malla de Nutrición con prerrequisitos oficiales, para la demostración del 15 de octubre de 2026. La simulación académica queda para una iteración posterior. Este alcance no acredita funciones implementadas.

## Documentación de trabajo

- [Instrucciones para agentes](AGENTS.md)
- [Diseño técnico, contratos y pendientes para el equipo](AGENTS/SDD.md)
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

Este checkout contiene documentación, estructura inicial, bootstrap de la VM, Compose local, Containerfile, migrador y workflows CI/release. La [primera ejecución en `main`](https://github.com/Menderin/Cenit/actions/runs/38071046810) pasó el 10 de octubre de 2026 con la versión anterior del CI. Los nuevos pasos y el workflow de publicación todavía deben ejecutarse en Actions. En ausencia de la aplicación, su job queda omitido en `main` y CI bloquea la promoción a `produccion`. Faltan los manifiestos npm, aplicación, migraciones de negocio y ensayo real de entrega/recuperación; no hay una imagen del MVP construida.

## Arranque local de infraestructura

Con Python, Podman y su proveedor Compose disponibles, ejecutar desde la raíz:

```powershell
python deploy/scripts/setup-local.py
podman compose up -d db proxy
Invoke-RestMethod 'http://127.0.0.1:8081/health/proxy'
```

Se espera `status: ok`, `mode: bootstrap`. PostgreSQL persiste en un volumen propio; `podman compose down` conserva los datos. Los secretos generados en `.local` y la configuración `.env` no se versionan. Consultar [la guía local](deploy/LOCAL.md) para preparar la máquina Podman, resolver puertos y activar posteriormente la aplicación.

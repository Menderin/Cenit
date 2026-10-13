# Cenit

Cenit es una plataforma en desarrollo para centralizar y digitalizar procesos académicos y administrativos de la Facultad de Medicina de la Universidad Católica del Norte, sede Coquimbo. Su desarrollo se organiza en entregas priorizadas; el primer MVP representa un subconjunto de esa visión.

El levantamiento identifica necesidades de asistencia y justificaciones, proyección estudiantil y gestión administrativa, con antecedentes específicos de compras, personal y bienes. Estas líneas tienen distintos grados de definición y validación; su identificación no implica que todas estén aprobadas, implementadas o comprometidas para la próxima entrega. La visión y el alcance detallados se consolidarán en el Charter del proyecto cuando esté terminado.

## Primer MVP

El primer MVP contempla un registro auxiliar de compras con datos ficticios, login local y visualización de la malla de Nutrición con prerrequisitos oficiales, para la demostración del 15 de octubre de 2026. La simulación académica queda para una iteración posterior. Este alcance no acredita funciones implementadas.

El registro de compras está concebido para conservar y organizar una copia auxiliar de registros institucionales: no realiza compras, modifica Oracle, concede aprobaciones oficiales ni procesa pagos. Otros procesos académicos y administrativos quedan fuera del primer MVP; ello no los excluye de la visión futura del producto.

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

Se utiliza organización mixta: separación técnica y módulos de negocio dentro de cada aplicación. Los módulos indicados corresponden al primer MVP; la estructura permite incorporar otras funcionalidades en entregas posteriores.

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

## Estado de implementación

Este checkout contiene infraestructura, catálogo académico, API de autenticación local y frontend mínimo de acceso/salida. Login usa correo/contraseña, roles de servidor y sesión fija de dos horas. Administración contiene Home ilustrativo, solicitudes manuales persistentes con revisión local y laboratorio de extracción separado; académico sigue como destino de prueba. Todavía sin OCR ni visualización de malla; el historial continúa como propuesta separada. CI verifica esta base en tareas/`develop` y bloquea promoverla como aplicación completa a `main`. La [primera ejecución histórica](https://github.com/Menderin/Cenit/actions/runs/38071046810) no acredita estos nuevos checks. No hay imagen del MVP ni ensayo de entrega/recuperación completado.

## Probar login en el navegador

Requiere Node 24.21.0/npm 11.19.0, Python y Podman con proveedor Compose. Preparación inicial, desde la raíz (repetir migraciones cuando corresponda, no en cada arranque):

```powershell
python deploy/scripts/setup-local.py
podman compose up -d db
npm ci
npm run build:academic
$env:DATABASE_URL_FILE = (Resolve-Path '.local/secrets/migrator-local-url').Path
npm run db:migrate
```

Configurar una vez en el `.env` privado las tres variables `CENIT_DEMO_ADMINISTRATIVO_PASSWORD`, `CENIT_DEMO_ESTUDIANTE_PASSWORD` y `CENIT_DEMO_DOCENTE_PASSWORD` con las claves acordadas por el equipo (12–128 caracteres). `.env.example` las deja vacías; las claves se comparten por un canal privado, nunca en Git. En este equipo ya están configuradas.

Después, la rutina para trabajar es:

```powershell
podman compose up -d db
npm run dev
```

Dejar esa terminal abierta. `npm run dev` comprueba puertos/BD/tablas y arranca API y Vite juntos; lee `.env` y la conexión privada de `cenit_app`. Sólo sus procesos reciben APP_ENV=development, cookie HTTP local, Origin de 5173/3000 y conexión runtime; no heredan la credencial del migrador como conexión efectiva. Antes de iniciar la API prepara/verifica las tres cuentas de demo con las claves de `.env`: crea sólo las ausentes y conserva identidades y hashes existentes. Una discrepancia detiene el arranque sin rotar claves ni borrar datos. No ejecuta Podman, migraciones, catálogo ni builds automáticamente. Esta preparación de cuentas es exclusiva del arranque local; migraciones y CD no cargan cuentas. Si falta preparación o hay un puerto ocupado, informa el paso necesario y no detiene procesos ajenos. `Ctrl+C` cierra API y frontend; PostgreSQL permanece en Podman. Para detener también la BD: `podman compose stop db`.

Abrir **http://127.0.0.1:5173**. Consultar privadamente `.local/secrets/auth-demo.json` para ingresar con una cuenta de cada rol; no compartir ese archivo ni copiar contraseñas al repo. Administrativo llega a `/administracion`; docente/estudiante, a `/academico`. El login usa el diseño visual de Cenit y autentica con la API local existente. Administración ofrece Home con KPIs/gráfico ficticios y Sistema de compra con ingreso manual, listados persistentes, detalle y validación local; los ejemplos de extracción están separados en /administracion/compras/laboratorio; académico muestra su área en construcción. No son módulos completos de compras/malla. `/prototipo.html` ya no contiene una simulación independiente: redirige al login o al área de una sesión válida. Cada destino muestra cuenta/rol y permite salir. Recargar conserva la sesión válida; logout o expiración dejan el contenido protegido oculto. Vite usa `/api` relativo con proxy a 3000 y no publica secretos. El proxy bootstrap de 8081 sigue siendo otra ejecución, no esta interfaz.

Para verificar el frontend y los recorridos desde la raíz, con PostgreSQL preparado:

```powershell
npm run typecheck
npm run build:web
npm exec --no -- playwright install chromium
npm run test:e2e:auth
```

Las pruebas sirven el frontend compilado mediante Vite preview en 5174 y una API real de prueba en 3173, con cuentas aleatorias y una base PostgreSQL descartable; no modifican `cenit_demo`. Ejecutar `build:web` antes de probar: no se usa el servidor Vite de desarrollo para acreditar los recorridos. En CI se instala Chromium con `--with-deps`. Este ensayo verifica el build web con la API; no habilita main/releases ni sustituye el futuro build completo o un ensayo de despliegue.

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

## Probar el contrato de extracción de compras

Con el entorno local preparado, ejecutar `podman compose up -d db` y `npm run dev`. Ingresar como administrativo en **http://127.0.0.1:5173/login**: En Home `/administracion`, abrir «Sistema de compra» y luego el laboratorio `/administracion/compras/laboratorio`; allí puedes editar, validar y restablecer candidatos ficticios. «Continuar al formulario de guardado» transfiere los valores revisados sin guardarlos; completa los obligatorios y pulsa «Guardar solicitud» para persistir una copia identificada como ejemplo ficticio sin extracción real. Personal y bienes sólo muestran «En construcción». No sube imágenes ni ejecuta OCR; el borrador se descarta al salir, expirar o recargar. Guía, límites y pendientes en [EXTRACCION-COMPRAS.md](Docs/EXTRACCION-COMPRAS.md). No activa releases ni acredita la HU04 completa.

El Home administrativo incluye únicamente indicadores y un gráfico con datos ficticios para revisar la propuesta con el cliente. No están conectados a Oracle ni permiten aprobar solicitudes.

## Solicitudes de compra

Consultar [guía de compras](Docs/COMPRAS.md). Tras estos cambios, repetir `npm run db:migrate` con la conexión privada del migrador antes de `npm run dev`. En Sistema de compra, «Agregar solicitud manual» permite guardar copias; «Validar registro» sólo confirma revisión en Cenit. Home conserva únicamente KPIs/gráfico ficticios; no está conectado a Oracle.

La migración nueva es `0005_purchase_example_origin.sql`. No recrea datos ni carga semillas. Con PostgreSQL levantado, en PowerShell:

```powershell
$env:DATABASE_URL_FILE = (Resolve-Path '.local/secrets/migrator-local-url').Path
npm run db:migrate
Remove-Item Env:DATABASE_URL_FILE
npm run dev
```

`npm run dev` comprueba la columna de procedencia y avisa si falta migrar; no aplica migraciones automáticamente. Las pruebas de integración comprueban persistencia tras detener y volver a iniciar un proceso real de API sobre una base descartable.

## Buscar solicitudes de compra

La migración `0006_purchase_search_keys.sql` añade claves de búsqueda generadas; aplica `npm run db:migrate` con la conexión privada indicada arriba antes de iniciar. En Sistema de compra, utiliza búsqueda por número/descripción/proveedor, fechas de envío y códigos de unidad/proyecto. «Aplicar filtros» filtra ambas tablas y reinicia sus páginas; «Limpiar filtros» elimina la selección. Cada tabla muestra cantidad y total documental de todas las coincidencias. Unidad/proyecto deben coincidir en el mismo ítem. Guía y ejemplo HTTP en [COMPRAS.md](Docs/COMPRAS.md#hu06-búsqueda-filtros-y-total-documental).

# Cenit

Pulido de flujos del 14 de octubre: Cancelar y descarte con diálogo, calendario en español, avisos Sonner y retorno al listado con filtros/páginas. La sesión mantiene dos horas; jornada se implementará después de la demo/integración. Cambios, evidencia y conciliación pendiente de Jira en [revisión de UX](Docs/REVISION-UX-2026-10-14.md).
Capturas desde navegador, 14 de octubre: iniciar sesión como administrativo y abrir **Sistema de compra → Subir captura**, o `/administracion/compras/captura`. Permite elegir PNG/JPEG, ver la imagen, extraer, corregir y continuar al guardado explícito. OCR comprueba señales del formato de solicitud; admite parciales y no acredita autenticidad ni exige bordes azules. Preparación y prueba visual en [ADAPTADOR-CAPTURAS.md](Docs/ADAPTADOR-CAPTURAS.md). Reiniciar `npm run dev` tras actualizar el backend y mantener OCR iniciado con `podman compose --profile ocr up -d ocr`. El laboratorio separado conserva ejemplos y el ensayo de VM sigue pendiente; no se instala inferencia en la VM mediante este cambio.

Actualización del 13 de octubre: el líder autoriza entregar la demo actual por HTTP en la VM, aunque malla y extracción real sigan pendientes. CI completo usa `Application` con lint, catálogo, build, integración, E2E contra producción y verificación de imagen. El marcador parcial fue retirado tras verificar estos checks localmente. La variable de publicación se habilita durante el primer ensayo supervisado, no mediante este cambio local. Procedimiento vigente: [primera entrega automática](deploy/PRIMER-DESPLIEGUE.md). Las menciones anteriores a bloqueo o ausencia de aplicación son antecedentes de preparación, no el estado técnico vigente.

Para probar la imagen compilada con API y frontend por el mismo puerto, seguir [el ensayo local con Podman](deploy/ENSAYO-LOCAL.md). `npm run build` compila contratos/API/web; `npm start` inicia el servidor compilado con configuración de BD/sesión explícita. Desarrollo conserva `npm run dev`. El ensayo local no habilita entregas a `main` ni publicación de releases.

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

Este checkout integra autenticación local, compras persistentes con revisión local y la malla de Nutrición por semestres, detalle, historial propio y búsqueda docente, conectados a PostgreSQL. Conserva Home ilustrativo y laboratorio separado de ejemplos de extracción; todavía no hay OCR ni interpretación oficial de prerrequisitos. CI completo verifica el monolito compilado, pruebas de ambos módulos e imagen; la integración de esta rama y el ensayo de entrega/recuperación en VM requieren revisión del equipo.

Para actualizar una base preparada en la antigua rama académica o en develop, usar `npm run db:migrate` con la credencial privada del migrador. Los tags originales de ambas ramas se conservan en el journal y se aplican sólo las migraciones faltantes; no restablecer la BD ni renombrar SQL aplicados. Detalle de compatibilidad en [ACADEMICO.md](Docs/ACADEMICO.md). `npm run test:e2e:production` verifica login, compras y malla juntos sobre el servidor compilado, después de `npm run build`.

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

Abrir **http://127.0.0.1:5173**. Consultar privadamente `.local/secrets/auth-demo.json` para ingresar con una cuenta de cada rol; no compartir ese archivo ni copiar contraseñas al repo. Administrativo llega a `/administracion`, con solicitudes persistentes y laboratorio de ejemplos; docente/estudiante, a `/academico`, con la primera vista de malla. El login autentica con la API local existente. `/prototipo.html` redirige al login o al área de una sesión válida. Cada destino muestra cuenta/rol y permite salir. Recargar conserva la sesión válida; logout o expiración dejan el contenido protegido oculto. Vite usa `/api` relativo con proxy a 3000 y no publica secretos. El proxy bootstrap de 8081 sigue siendo otra ejecución, no esta interfaz.

La malla requiere catálogo/perfiles preparados en PostgreSQL. Tras `db:migrate`, ejecutar explícitamente `academic:prepare-demo` con `APP_ENV=demo` y `DATABASE_URL_FILE=.local/secrets/migrator-local-url`, según [ACADEMICO.md](Docs/ACADEMICO.md). Publica la malla y vincula al estudiante original con `20.123.456-5`; agrega Camila Demo (`21.123.456-3`) y Tomás Demo (`22.123.456-1`) con cuentas únicas y claves adicionales privadas. Para corregir los tres RUT ficticios anteriores en una demo existente, ejecutar `npm run academic:prepare-demo -- --normalize-ruts` con ese entorno privado. Repetirlo conserva cuentas e intentos; no rota contraseñas ni restablece registros. `npm run dev`, migraciones y CD no cargan estos datos. Sin versión publicada se muestra vacío. Estudiante ve su avance por sesión; docente busca coincidencias por nombre/prefijo de RUT mientras escribe, con formato automático, validación módulo 11 al completar y seis resultados por página. IX–X sigue unido y el detalle conserva notas e intentos con teclado. Historial y RUT son ficticios; prerrequisitos siguen pendientes, sin evaluación de disponibilidad ni simulación.

Para verificar el frontend y los recorridos desde la raíz, con PostgreSQL preparado:

```powershell
npm run typecheck
npm run build:web
npm exec --no -- playwright install chromium
npm run test:e2e:auth
npm run test:e2e:academic
```

Las pruebas sirven el frontend compilado mediante Vite preview en 5174 y una API real de prueba en 3173, con cuentas aleatorias, catálogo recibido y una base PostgreSQL descartable; no modifican `cenit_demo`. `test:e2e:auth` verifica acceso/sesión y `test:e2e:academic` catálogo, permisos, detalle, errores, cancelación y responsive. Ejecutar `build:web` antes de probar: no se usa el servidor Vite de desarrollo para acreditar los recorridos. En CI se instala Chromium con `--with-deps` y se ejecutan ambas suites. Este ensayo verifica el build web con la API; no habilita main/releases ni sustituye el futuro build completo o un ensayo de despliegue.

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

`rama de tarea → develop → main`, mediante PR, revisión y CI. `develop` integra funcionalidades; `main` autoriza entregas verificadas. La demo actual permite el gate completo; habilitar `CENIT_RELEASE_ENABLED` al preparar el primer ensayo supervisado según [PRIMER-DESPLIEGUE.md](deploy/PRIMER-DESPLIEGUE.md). La rama antigua `produccion` no es destino del nuevo flujo; retirarla tras comprobar la transición según [CI/CD](deploy/CI-CD.md).

## Probar el contrato de extracción de compras

Con el entorno local preparado, ejecutar `podman compose up -d db` y `npm run dev`. Ingresar como administrativo en **http://127.0.0.1:5173/login**: Desde la navegación lateral de Inicio `/administracion`, abrir «Sistema de compra» y luego «Revisar ejemplo» (`/administracion/compras/laboratorio`); allí puedes editar, comprobar y restablecer candidatos ficticios. «Continuar al formulario» transfiere los valores revisados sin guardarlos; completa los obligatorios y pulsa «Guardar solicitud» para persistir una copia identificada como ejemplo de demostración. Personal y bienes muestran «Módulo no disponible». No sube imágenes ni ejecuta visión real; el borrador se descarta al salir, expirar o recargar. Guía, límites y pendientes en [EXTRACCION-COMPRAS.md](Docs/EXTRACCION-COMPRAS.md). No activa releases ni acredita la HU04 completa.

La navegación lateral se recoge en móvil; «Mostrar navegación» permite abrir los cuatro destinos y el cierre de sesión. El formulario manual muestra primero sus cuatro mínimos y permite desplegar cada ítem; los errores abren el ítem y enfocan el primer campo inválido.

La recuperación real se hará desde capturas mediante visión local implementada por Víctor, sin acceso a Oracle. El laboratorio actual sigue mostrando ejemplos; el endpoint y la procedencia de captura real están pendientes.

La [investigación de extracción local](Docs/INVESTIGACION-EXTRACCION-COMPRAS.md) compara OCR real sobre capturas totalmente ficticias, con comandos reproducibles y evidencia. No forma parte de `npm run dev`, CI/CD ni del endpoint de guardado; sus dependencias se aíslan en un contenedor de investigación. Para reproducir la cuarta batería desde PowerShell, ejecutar `./experiments/purchases/run.ps1 -Round 4 -Split holdout -Repeats 2`; ver requisitos, resultados y límites en [experiments/purchases/README.md](experiments/purchases/README.md). Repetir esta batería no constituye una evaluación con muestras nuevas.

El Home administrativo incluye únicamente indicadores y un gráfico con datos ficticios para revisar la propuesta con el cliente. No están conectados a Oracle ni permiten aprobar solicitudes.

Para disponer también de solicitudes ficticias persistentes, con migraciones y cuenta administrativa ya preparadas, ejecutar explícitamente `APP_ENV=demo DATABASE_URL_FILE=.local/secrets/migrator-local-url npm run purchases:prepare-demo`. Es exclusivo de `cenit_migrator` sobre `cenit_demo` en `127.0.0.1`: prepara ocho solicitudes (cinco pendientes de revisión y tres validadas inicialmente), con varios ítems/proveedores y códigos para buscar/filtrar. Repetir conserva IDs, contenido y revisiones posteriores, sin duplicar ni restablecer compras/cuentas. No se ejecuta desde desarrollo, migraciones ni CD; no acredita extracción ni aprobación Oracle. Los KPIs de Inicio mantienen su muestra independiente. Preparación y límites en [COMPRAS.md](Docs/COMPRAS.md#datos-persistentes-de-demostración--14-de-octubre).

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

# Autenticación local de Cenit

Decisión del líder del 11 de octubre de 2026: correo/contraseña local, un rol por cuenta, sesión de dos horas desde el login sin renovación automática. API de HU01-T03/T04 y HU03 implementada; frontend mínimo de prueba para los tres roles, sin Google, registro público, recuperación de contraseña ni editor de cuentas. La revisión del equipo y el PR siguen pendientes.

Actualización del frontend del 12 de octubre de 2026: diseño visual de acceso integrado con el proveedor de sesión y la API existentes, sin whitelist de correos ni contraseñas en el cliente. Por petición del usuario, el formulario elimina espacios del correo en cualquier posición y lo convierte a minúsculas al salir del campo o enviar; después rechaza formatos inválidos y no transforma la contraseña. Es una corrección visible de interfaz: la API conserva su validación del correo recibido y las cuentas no cambian. Administrativo entra en `/administracion`, docente/estudiante en `/academico`; ambos destinos son avisos de área en construcción, sin módulos de negocio. Se retiró el éxito simulado de `/prototipo.html`. No cambian endpoints, cuentas, permisos, duración, migraciones o despliegue.

## Modelo y protección

Continuidad del 12 de octubre: el login del PR #9 está integrado en develop. En `malla-interactiva`, `/academico` incorpora catálogo, historial propio y búsqueda docente descritos en [ACADEMICO.md](ACADEMICO.md); administración conserva el aviso. Se reutilizan proveedor/cookie/duración/limpieza de caché y aviso de vencimiento, sin cambiar el contrato auth. Por petición expresa posterior de Gael, `academic:prepare-demo` conserva el estudiante original, lo vincula con RUT y prepara dos cuentas estudiantiles adicionales únicas para tres historiales ficticios. Las claves adicionales se conservan sólo en `.local/secrets/academic-demo-accounts.json`. El helper de preparación auth reutiliza validación/hashing/preservación, sin registrar usuarios públicamente ni rotar las tres cuentas originales. Dev sigue verificando únicamente esas tres cuentas; no carga historial. La nueva vista/migración aún requiere revisión/integración. Las referencias anteriores a ambos destinos en construcción describen el estado previo.

`cenit.accounts` contiene UUID estable, correo único normalizado con trim/minúsculas, nombre, rol `docente`/`estudiante`/`administrativo`, estado activo, hash y timestamps. El login no permite enviar un rol. No hay una tabla adicional de docentes ni duplicación de identidades académicas.

La contraseña no se recorta ni normaliza; los espacios forman parte de su valor y añadirlos a una clave existente no autentica como esa clave. Se almacena como `scrypt-v1`, con salt aleatorio de 16 bytes, N=131072, r=8, p=1 y derivación de 64 bytes; comparación constante. La preparación exige 12–128 caracteres. Login acepta 1–128 para poder responder credenciales incorrectas sin inferir la política por cuenta. Un hash ficticio iguala el trabajo para correos inexistentes; nunca corresponde a una cuenta. Una sola derivación simultánea y hasta 16 en espera limitan memoria dentro de los 512 MiB previstos en la VM; saturación responde 503.

`cenit.sessions` conserva sólo SHA-256 de un identificador aleatorio de 32 bytes, FK de cuenta, creación, expiración exacta a dos horas y revocación. En cada solicitud se consulta cuenta activa, rol vigente y sesión no vencida/revocada. Logout revoca en servidor; un login nuevo revoca la sesión anterior presentada por ese navegador. No invalida por defecto las sesiones de otros navegadores. No se renueva duración al consultar. Las filas vencidas pueden conservarse en esta entrega; no se introduce un job de limpieza ni se consideran sesiones activas.

Migración aditiva `0002_auth_accounts_sessions`: no cambia catálogo publicado, no carga credenciales y no despliega perfiles/historial. `cenit.accounts.id` es la identidad UUID que debe consumir su futura FK. La propuesta de progreso sigue fuera del journal; activar esa migración corresponde al entregable académico separado. No reescribir migraciones ya aplicadas. `.gitattributes` fija LF para los SQL: Windows había convertido los archivos a CRLF al cambiar de rama, alterando sus hashes. Se restauraron los mismos bytes LF originalmente aplicados, sin modificar SQL ni ledger; no se relajó la comprobación de integridad del migrador.

## Contrato HTTP

Schemas/tipos: `@cenit/contracts/auth`; ejemplos de sesión/errores: `@cenit/contracts/auth/examples`. Para un ejemplo válido de solicitud, construir `{email,password}` con valores obtenidos del archivo privado de demo; no copiar contraseñas al repo.

| Endpoint | Solicitud | Respuesta |
| --- | --- | --- |
| `POST /api/v1/auth/login` | JSON `{email,password}`; Origin autorizado | 200, cookie y sesión pública |
| `GET /api/v1/auth/session` | Cookie | 200, sesión pública; 401 si no existe/no es válida |
| `POST /api/v1/auth/logout` | JSON `{}`; Origin autorizado | 204, revocación y eliminación de cookie; repetible incluso sin sesión |

Login y session responden `{data:{account:{id,email,name,role},expiresAt}}`. `expiresAt` es ISO UTC. Nunca contienen identificador de sesión, hash o contraseña. La cookie `cenit_session` tiene `HttpOnly`, `SameSite=Lax`, `Path=/`, Max-Age=7200, expiración y sin Domain. No guardar tokens en localStorage.

Errores `{error:{code,message,requestId}}`, `X-Request-Id` y `Cache-Control: no-store`: 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS`/`AUTHENTICATION_REQUIRED`, 403 `FORBIDDEN`, 429 `RATE_LIMIT_EXCEEDED`, 503 `SERVICE_UNAVAILABLE`, 500 `INTERNAL_ERROR`. Correo inexistente, contraseña incorrecta y cuenta inactiva comparten mensaje. Rechazar campos extra, identidad/rol del cliente, JSON inválido y tipos incorrectos. Login limita diez solicitudes/minuto/IP; no confiar en X-Forwarded-For. El límite es local al proceso y se reinicia con él; no introduce Redis ni múltiples instancias.

Configuración del proceso API, no secretos:

| Variable | Comportamiento |
| --- | --- |
| `AUTH_ALLOWED_ORIGINS` | Lista separada por coma de orígenes exactos, sin barra final ni wildcard. Por defecto `http://127.0.0.1:3000,http://localhost:3000` |
| `AUTH_COOKIE_SECURE` | `true` por defecto; `false` sólo con APP_ENV=demo/development/test explícito |
| `DATABASE_URL_FILE` | Archivo de conexión del runtime `cenit_app`, nunca credencial administrativa |

Origin es obligatorio en login/logout, incluidos clientes curl/PowerShell. La interfaz futura debe usar proxy de Vite y enviar JSON bajo el mismo origen; no se habilita CORS abierto. `HttpOnly` no protege credenciales en tránsito por HTTP: la excepción de demo requiere configuración explícita; usar HTTPS antes de cuentas/datos reales. En la VM del martes configurar origen real y TLS o excepción de demo antes del ensayo; este checkout no modifica su Quadlet ni servicios existentes. Si se configura proxy de confianza, coordinar IP/límite y probarlo antes de habilitar trustProxy.

## Arranque y prueba local

Arranque habitual: seguir la preparación inicial del [README](../README.md#probar-login-en-el-navegador), luego `podman compose up -d db` y `npm run dev`. El comando conjunto configura sólo sus procesos, prepara/verifica las tres cuentas con las claves privadas CENIT_DEMO_*_PASSWORD de `.env` y deja PostgreSQL en Podman. La siguiente alternativa mantiene API/frontend en terminales separadas para depuración; desde la raíz, con Node 24.21.0/npm 11.19.0:

```powershell
python deploy/scripts/setup-local.py
podman compose up -d db
npm ci
npm run build:academic
$env:DATABASE_URL_FILE = (Resolve-Path '.local/secrets/migrator-local-url').Path
npm run db:migrate
$env:APP_ENV = 'demo'
npm run auth:prepare-demo
$env:DATABASE_URL_FILE = (Resolve-Path '.local/secrets/app-local-url').Path
$env:AUTH_COOKIE_SECURE = 'false'
$env:AUTH_ALLOWED_ORIGINS = 'http://127.0.0.1:3000'
npm run dev --workspace @cenit/api
```

Si `python` es el alias de Microsoft Store, usar la ruta real de Python instalado. Las versiones portables preparadas en este equipo están bajo `tmp/tools`; preferir la instalación habitual compatible en otros equipos. El preparador genera URLs para contenedores (`db`) y host Windows (`127.0.0.1`, puerto CENIT_DB_PORT), sin cambiar contraseñas existentes. npm no lee `.env` automáticamente para la API: establecer las variables como se muestra.

El comando de cuentas escribe/reutiliza `.local/secrets/auth-demo.json` con tres cuentas. `npm run dev` usa las claves compartidas configuradas en `.env` (las tres son obligatorias, 12–128 caracteres); el comando explícito usa esas mismas variables de entorno si se entregan todas, o genera claves aleatorias si no se entrega ninguna. No lee `.env` por sí solo. El archivo no se imprime, no se versiona y no se copia a la VM. Repetir conserva identidad/hash; ante inconsistencias falla con rollback. No borrar el archivo ni rotar credenciales para resolverlas: conservarlo y revisar con el líder. En Unix se crea con modo 0600 y carpeta 0700; en Windows conservar los permisos privados del usuario y no compartir esa carpeta.

En otra terminal en la raíz, probar sin imprimir contraseñas ni tokens:

```powershell
$cuentas = Get-Content '.local/secrets/auth-demo.json' -Raw | ConvertFrom-Json
$docente = $cuentas | Where-Object role -eq 'docente'
$entrada = @{ email = $docente.email; password = $docente.password } | ConvertTo-Json
$origen = @{ Origin = 'http://127.0.0.1:3000' }
Invoke-RestMethod 'http://127.0.0.1:3000/api/v1/auth/login' -Method Post -Headers $origen -ContentType 'application/json' -Body $entrada -SessionVariable cenitSesion
Invoke-RestMethod 'http://127.0.0.1:3000/api/v1/auth/session' -WebSession $cenitSesion
Invoke-RestMethod 'http://127.0.0.1:3000/api/v1/academic/plans' -WebSession $cenitSesion
Invoke-RestMethod 'http://127.0.0.1:3000/api/v1/auth/logout' -Method Post -Headers $origen -ContentType 'application/json' -Body '{}' -WebSession $cenitSesion
```

El catálogo debe estar cargado por su comando explícito para obtener el plan; login no lo crea. Después de logout, session/catálogo responden 401. Docente/estudiante reciben catálogo; administrativo, 403. No ejecutar Get-Content del archivo sin asignarlo: imprimiría credenciales. `/health/live` sigue público; `/health/ready` sigue 503 por frontend/build completo pendiente. No activar perfil application, releases ni proxy definitivo todavía.

## Verificación y coordinación

### Frontend mínimo de acceso y salida

Aviso previo acordado: durante los últimos cinco minutos, ambos destinos muestran el tiempo restante en minutos y «Guarda tu trabajo antes de volver a iniciar sesión», con botón «Cerrar sesión ahora». El contador se recalcula desde expiresAt, también al revalidar; no ofrece renovación ni realiza guardados. Se conserva la sesión fija de dos horas y la política de borradores continúa pendiente.

Aviso previo verificado con reloj del navegador: oculto antes de los últimos cinco minutos, contador de 5 a 1, expiración sin renovación y salida anticipada. Pasaron los 12 recorridos Playwright, typecheck y build web después del cambio.

El servidor descartable de Playwright permite 100 logins/minuto porque todos los escenarios comparten una IP de proxy. La API normal mantiene diez/minuto y esa protección se comprueba en integración; las pruebas de navegador no acreditan el límite de producción.

Arranque conjunto mediante `npm run dev` en [README](../README.md#probar-login-en-el-navegador): API 3000 y Vite 5173, Origin autorizado 5173, proxy `/api` sin CORS abierto. Cuentas preparadas/verificadas automáticamente sólo en este arranque local; no hay nuevas tablas/migraciones ni contratos HTTP. El lanzador comprueba conexión/tablas sin migrar, prepara las tres cuentas locales idempotentemente y espera el arranque de API antes de iniciar Vite. Ctrl+C cierra ambos; verificado en Windows que libera 3000/5173 y conserva PostgreSQL en 55432. Detecta puertos ocupados sin cerrar procesos ajenos. Versiones exactas fijadas en el workspace web y lockfile como base inicial, pendientes de coordinación con Gael.

Login único, campos correo/contraseña y rol tomado de la respuesta validada TypeBox. Administrativo accede a `/administracion`; docentes/estudiantes, a `/academico`. Son destinos de área en construcción con nombre/rol y salida, no pantallas funcionales de compras/malla. La ruta previa `/compras` redirige al inicio autorizado mientras no exista su pantalla funcional. Los guards redirigen rutas ajenas; el servidor conserva la autoridad sobre acceso a recursos.

Al recargar se comprueba la sesión antes de mostrar datos. Logout oculta contenido, cancela consultas y limpia caché; sólo confirma éxito después de 204. Un fallo mantiene contenido oculto y permite reintentar. `expiresAt`, 401 y revalidación al recuperar foco controlan invalidez; no hay renovación. La limpieza de identidad ocurre antes de entrar a la caché de navegación del navegador, con comprobación al restaurar. Respuestas pendientes no pueden reponer una sesión invalidada. Contraseñas/tokens/sesión no se guardan en almacenamiento persistente.

No existen formularios de negocio ni borradores en esta prueba: no se acuerda una política de borradores ni se completa HU03-T03/HU03-T04 sobre los módulos reales. Tampoco se acredita ausencia de compras de otra cuenta con una pantalla vacía. Playwright comprueba autenticación real en PostgreSQL descartable y comportamiento del navegador; expiración del frontend/401 y fallos de red usan reloj/interceptación controlados. Las pruebas de integración existentes acreditan la expiración del servidor. CI parcial exige build web y Playwright cuando el workspace está presente, pero continúa bloqueando main/releases.

Evidencia local del frontend mínimo: **12 recorridos Playwright, 38 unitarias, 56 de integración PostgreSQL/API y 44 de infraestructura exitosos**, typecheck, builds API/contratos/web y actionlint. La prueba de gate sobre este checkout acepta develop y rechaza main. La limpieza de E2E confirmó eliminación de su base/roles y credenciales temporales; no restableció cenit_demo. No se creó PR, no se modificó la VM y falta CI remoto del nuevo commit.

### Seguimiento de HU01-T04 — 11 de octubre de 2026

Estado: **implementada; corrección de CI preparada, pendiente de publicación, revisión independiente y merge**. Implementación en [73af3f0](https://github.com/Menderin/Cenit/commit/73af3f01c962eb8d4ccdc0c58acd2808d1bdbfa6); commit publicado [66e8bd7](https://github.com/Menderin/Cenit/commit/66e8bd7245f5989a868b99fc74e0adc602cc203d), que añade CI por push y conserva la implementación y sus pruebas. El [PR #7](https://github.com/Menderin/Cenit/pull/7) quedó **cerrado sin merge por solicitud del líder**; los agentes no crearán nuevos PR salvo instrucción explícita.

El [CI por push 38184387908](https://github.com/Menderin/Cenit/actions/runs/38184387908) pasó para ese SHA: Prerequisites, Infrastructure, Academic foundation y CI required. Sin embargo, el [CI del PR 38184816686](https://github.com/Menderin/Cenit/actions/runs/38184816686) falló en Academic foundation y CI required: las 55 pruebas de integración pasaron, pero Vitest detectó un error no controlado PostgreSQL `57P01` al limpiar las bases descartables.

Causa: `pg-pool.end()` puede resolver antes del cierre físico de conexiones retiradas; `DROP DATABASE ... WITH (FORCE)` terminaba una conexión aún desconectándose. Las suites académica y de autenticación ahora registran los eventos `end` de sus conexiones y esperan su cierre antes de eliminar las bases, sin FORCE. Una regresión comprueba tres conexiones y su ausencia en pg_stat_activity después del cierre. No se ignoran errores de Vitest, no se cambian los gates ni los endpoints/migraciones. La corrección aún debe publicarse y superar Actions en su nuevo SHA.

Verificación local de la corrección: `npm run typecheck` exitoso y dos ejecuciones consecutivas de `npm run test:integration`, cada una con **56 pruebas exitosas** sobre PostgreSQL 17, sin errores no controlados. Se repitió integración por el carácter intermitente del fallo; los resultados siguientes de unitarias/build corresponden a la implementación previa, cuyo código no cambió.

| Criterio HU01-T04 | Evidencia implementada |
| --- | --- |
| Credenciales válidas/inválidas | Integración de los tres roles, contraseña incorrecta, correo inexistente, cuenta inactiva, solicitudes/JSON inválidos |
| Contraseña protegida | scrypt con salt aleatorio, comparación constante, hashes en BD y preparación privada fuera de Git |
| Rol desde el servidor | Consulta a accounts en PostgreSQL, rechazo de role en login y prueba de cambio de rol en servidor |
| Errores sin trazas internas | Contrato común validado; fallo de BD sin SQL, credenciales ni stack en respuesta |

Revisor independiente y aprobación: pendientes, sin asignar disponibilidad ni aprobar en nombre del autor. No se realizó merge. Registrar aprobación/SHA y merge cuando realmente ocurran. No dar por terminada HU01 completa ni HU03 de interfaz; pantallas y política de borradores siguen pendientes.

Pasaron 38 pruebas unitarias, 55 de integración PostgreSQL/API y 39 de infraestructura, typecheck, comprobación de catálogo y build API/contratos. Cubren PostgreSQL 17 vacío y actualizado desde catálogo previo; roles limitados, FK, correo/rol/hash y tiempos; preparación repetida sin rotación; login de los tres roles, errores genéricos, cookie, expiración exacta con reloj controlado, logout, cambio de cuenta/rol, Origin y límite/IP; fallo de BD saneado. Las bases de test son descartables y propias; no restablecen cenit_demo. También se aplicó la migración nueva en cenit_demo, se prepararon/reutilizaron sus cuentas y se probó HTTP real: docente/estudiante 200 con 52 asignaturas, administrativo 403, logout 204 y sesión posterior 401. No se modificó la VM. La publicación y el CI por push ya se confirmaron en el seguimiento anterior; la corrección del CI del PR, revisión independiente e integración siguen pendientes.

Gael debe ampliar los destinos de prueba con las interfaces funcionales administrativa/académica conservando contratos y ciclo de sesión. Las pantallas funcionales y política de borradores siguen pendientes; este acceso mínimo no implementa ni declara esa política. Kevin revisará evidencia del flujo completo cuando existan esas pantallas. Este cambio no completa HU01/HU03 sobre el build de demostración.

Referencias de diseño: [sesiones OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [crypto de Node](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [cookie Fastify](https://github.com/fastify/fastify-cookie), [rate-limit Fastify](https://github.com/fastify/fastify-rate-limit).

### Preparación automática de cuentas en desarrollo

Por petición del líder, `npm run dev` prepara las cuentas antes de iniciar la API. Usa las tres claves acordadas del `.env` ignorado; identidades locales y hashes existentes se conservan, y una discrepancia impide iniciar sin rotar ni sobrescribir cuentas. No modifica migraciones ni el despliegue: CD sigue sin semillas.

Verificación local del cambio: typecheck, build API/contratos, 38 pruebas unitarias, 58 de integración PostgreSQL/API y 44 de infraestructura exitosas. Las nuevas pruebas cubren claves configuradas, configuración parcial/inválida, reutilización del archivo privado y rechazo de discrepancias. Se comprobó arranque conjunto y login/logout real desde Chromium con los tres roles. Actions queda pendiente del push del usuario.

### Verificación del diseño conectado — 12 de octubre de 2026

Typecheck raíz/web y build web correctos. Pasaron 17 recorridos E2E sobre el frontend compilado, API y PostgreSQL descartable: los 12 existentes, adaptados al destino administrativo, y comprobaciones de correo inexistente/formato, normalización sin transformar la contraseña, teclado/carga, redimensionado de 320 a 1920 px, corrección visual de espacios exteriores/interiores añadidos repetidamente al correo (también al enviar con Enter) y rechazo de claves alteradas mediante espacios. También se probaron las tres cuentas privadas de demo con el diseño integrado en localhost; no se publican sus claves. Las pruebas de expiración/fallos conservan reloj e interceptaciones controlados. El servidor E2E exige `apps/web/dist/index.html` y usa Vite preview en 5174, manteniendo API real y PostgreSQL descartable. En la revisión previa al PR pasaron además 38 pruebas unitarias, 58 de integración y 44 de infraestructura; el gate acepta la etapa parcial en develop. Esta evidencia no completa las historias de compras/malla, revisión de equipo, CI remoto o despliegue.

### Laboratorio administrativo HU04-T03

El 12 de octubre se conectó `/administracion` con la pantalla mínima de [ejemplos de extracción](EXTRACCION-COMPRAS.md), exclusiva del rol administrativo. Sustituye el aviso de área en construcción de ese destino, sin modificar API de sesión, cuentas ni migraciones. El borrador ficticio está sólo en memoria y se descarta al desmontar la pantalla por salida, expiración, cambio de cuenta o revalidación de sesión. No hay compras persistentes, guardado ni OCR; no resuelve la política futura de borradores de negocio ni completa HU04/HU03. El destino académico sigue en construcción.

Home administrativo y navbar: el login sigue llegando a `/administracion`, ahora dashboard. El laboratorio está en `/administracion/compras`; personal/bienes sólo presentan «En construcción». Todas estas rutas están aisladas al rol administrativo; el contenido protegido se desmonta al salir/expirar. La navegación entre sistemas descarta el borrador ficticio de revisión; no implica almacenamiento de compras ni cambios del contrato de sesión.

Actualización de formularios administrativos: revalidación de una sesión activa al recuperar foco ocurre en segundo plano y conserva el formulario si es válida; el chequeo inicial sigue ocultando contenido hasta conocer sesión. Respuesta 401, logout, expiración o fallo de revalidación ocultan el área protegida. Formulario manual advierte al salir y descarta datos sin guardar al cerrar/expirar. Guía del recorrido en [COMPRAS.md](COMPRAS.md).

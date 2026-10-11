# Autenticación local de Cenit

Decisión del líder del 11 de octubre de 2026: correo/contraseña local, un rol por cuenta, sesión de dos horas desde el login sin renovación automática. Este cambio implementa HU01-T03/T04 y la API de HU03; no incluye pantallas, Google, registro público, recuperación de contraseña ni editor de cuentas. La revisión del equipo y el PR siguen pendientes.

## Modelo y protección

`cenit.accounts` contiene UUID estable, correo único normalizado con trim/minúsculas, nombre, rol `docente`/`estudiante`/`administrativo`, estado activo, hash y timestamps. El login no permite enviar un rol. No hay una tabla adicional de docentes ni duplicación de identidades académicas.

La contraseña no se recorta ni normaliza. Se almacena como `scrypt-v1`, con salt aleatorio de 16 bytes, N=131072, r=8, p=1 y derivación de 64 bytes; comparación constante. La preparación exige 12–128 caracteres. Login acepta 1–128 para poder responder credenciales incorrectas sin inferir la política por cuenta. Un hash ficticio iguala el trabajo para correos inexistentes; nunca corresponde a una cuenta. Una sola derivación simultánea y hasta 16 en espera limitan memoria dentro de los 512 MiB previstos en la VM; saturación responde 503.

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

Desde la raíz, con Node 24.21.0/npm 11.19.0 y Podman preparado:

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

El comando de cuentas escribe/reutiliza `.local/secrets/auth-demo.json` con tres cuentas y contraseñas aleatorias. El archivo no se imprime, no se versiona y no se copia a la VM. Repetir conserva identidad/hash; ante inconsistencias falla con rollback. No borrar el archivo ni rotar credenciales para resolverlas: conservarlo y revisar con el líder. En Unix se crea con modo 0600 y carpeta 0700; en Windows conservar los permisos privados del usuario y no compartir esa carpeta.

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

Pasaron 38 pruebas unitarias, 55 de integración PostgreSQL/API y 39 de infraestructura, typecheck, comprobación de catálogo y build API/contratos. Cubren PostgreSQL 17 vacío y actualizado desde catálogo previo; roles limitados, FK, correo/rol/hash y tiempos; preparación repetida sin rotación; login de los tres roles, errores genéricos, cookie, expiración exacta con reloj controlado, logout, cambio de cuenta/rol, Origin y límite/IP; fallo de BD saneado. Las bases de test son descartables y propias; no restablecen cenit_demo. También se aplicó la migración nueva en cenit_demo, se prepararon/reutilizaron sus cuentas y se probó HTTP real: docente/estudiante 200 con 52 asignaturas, administrativo 403, logout 204 y sesión posterior 401. No se modificó la VM ni se publicaron cambios; ejecución nueva en Actions y revisión del equipo pendientes.

Gael debe consumir estos contratos para las interfaces administrativa/académica, consultar session al iniciar, limpiar datos/caché al salir o cambiar cuenta y tratar 401 sin mostrar datos previos. Las pantallas y política de borradores siguen pendientes; la API no implementa ni declara esa política. Kevin revisará evidencia del flujo completo cuando existan las pantallas. La API implementada no completa HU01/HU03 de extremo a extremo.

Referencias de diseño: [sesiones OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [crypto de Node](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [cookie Fastify](https://github.com/fastify/fastify-cookie), [rate-limit Fastify](https://github.com/fastify/fastify-rate-limit).

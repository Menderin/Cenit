# CI/CD de Cenit

## Ramas y autorización de entrega

`main` es la rama de integración. `produccion` es la rama que autoriza una entrega a la VM. Los nombres no cambian Git: los eventos del workflow y las reglas de ramas definen el comportamiento.

```text
feature/* -- PR + CI + revisión --> main
main -- PR + CI + revisión --> produccion
produccion -- CI del commit integrado --> imagen verificada en GHCR
release aprobada <-- consulta saliente de la VM --> despliegue + comprobación
```

No hace falta crear `develop` además de `main`. Promover mediante PR; no copiar archivos ni hacer force-push a `produccion`. Una corrección urgente integrada en `produccion` debe volver a `main` mediante PR para que las ramas no diverjan. Inicialmente la VM sirve una demo con datos ficticios: el nombre de la rama no habilita operación institucional.

## Lo que está preparado

`.github/workflows/ci.yml` ejecuta CI en PRs y pushes a ambas ramas. No recibe secretos de la VM ni tiene permisos para escribir en GitHub. Las acciones se fijan por SHA.

- Infraestructura: sintaxis Bash, compilación de utilidades Python, pruebas del bloqueo de CI para una aplicación ausente/incompleta y validación del Nginx temporal en un contenedor.
- Aplicación: instalación npm reproducible, typecheck, lint, pruebas unitarias, integración con PostgreSQL, build y Playwright sobre el build servido.
- Check estable para exigir en reglas de rama: **CI required**. Confirmar su nombre exacto en la interfaz tras la primera ejecución.

Hoy no existen manifiestos ni aplicación. En `main`, el CI verifica infraestructura y deja explícitamente omitido el job de aplicación. Un PR o push a `produccion` falla mientras no exista la aplicación y su contrato CI. No interpretar un check de infraestructura verde como tests del MVP ni como autorización de release.

Al inicializar el monorepo, crear un lockfile único, manifiestos de los tres workspaces y `packageManager: npm@X.Y.Z` con versión exacta. Scripts raíz obligatorios: `typecheck`, `lint`, `test:unit`, `test:integration`, `build`, `test:e2e`. Deben ejecutar verificaciones reales, fallar ante errores y no aceptar ausencia de pruebas. Integración usa `DATABASE_URL` del CI y prepara su esquema de pruebas. Playwright debe arrancar el build compilado con su configuración `webServer`, verificar compras/malla y detener el servidor al finalizar; no apuntar a la VM ni a una base compartida.

## Activación de GitHub: una vez

El 10 de octubre de 2026 se confirmó mediante consultas autenticadas de sólo lectura: repositorio privado, cuenta con permiso `admin`, Actions habilitado y `main` sin protección. Esto no acredita la disponibilidad de protección de ramas en el plan contratado. El usuario realizará el commit/push a `main` y creará `produccion`; el agente no publicará ni modificará las ramas remotas.

1. En `https://github.com/Menderin/Cenit`, abrir **Actions**. Ya está habilitado; no hace falta cambiar sus permisos para este workflow de sólo lectura.
2. El usuario publica los archivos preparados en `main` por su flujo Git habitual. Los cambios locales todavía no se han cometido ni enviado. Incluir workflow, scripts de verificación y pruebas de infraestructura junto con la documentación y la estructura acordada; no incluir cachés Python, credenciales ni archivos de ejecución de la VM.
3. Tras publicar la base, crear `produccion` desde el commit elegido de `main`. En la interfaz: selector de ramas → escribir `produccion` → crear desde `main`. No crearla desde una rama de feature. Una rama inicial de preparación no equivale a un despliegue, y su CI fallará por falta de aplicación hasta completar el contrato.
4. En **Settings → Rules → Rulesets** o **Branches**, proteger ambas ramas: exigir PR y el check `CI required`, bloquear force-push y eliminación. Exigir revisión de un compañero cuando el equipo tenga revisores disponibles; no establecer una regla imposible de cumplir para una sola persona. Confirmar si el plan de GitHub permite estas reglas en un repositorio privado.
5. Verificar una ejecución real en Actions y ensayar un PR con una comprobación fallida: no debe poder promoverse con los privilegios habituales del equipo. Comprobar quién puede eludir las reglas; no declarar protección activa sólo por tener un YAML.

La configuración de permisos/reglas se realiza en GitHub. No necesita reiniciar ni alterar la VM. Si no tienes acceso a Settings, el propietario o administrador del repositorio realiza estos pasos.

### Primera ejecución esperada

Después del push a `main`, abrir **Actions → Cenit CI** y seleccionar la ejecución de ese commit. Esperar `Prerequisites`, `Infrastructure` y `CI required` exitosos, con `Application` omitido porque todavía no hay aplicación. La validación Nginx en contenedor se ejecutará allí; no se ha ejecutado localmente en Windows. Si falla un job, abrir el paso fallido y revisar su salida antes de cambiar reglas.

Crear `produccion` desde esta base puede iniciar una ejecución fallida en `Prerequisites`: se está bloqueando una entrega sin aplicación, no indicando un fallo del bootstrap en la VM. Mantener ese bloqueo hasta implementar el monorepo y sus verificaciones reales. No desactivar el check ni añadir scripts que siempre devuelvan éxito para dejar la rama verde.

La primera ejecución de CI no publica imágenes ni se conecta a la VM. Una vez comprobado `CI required`, seleccionarlo como check obligatorio en las reglas de ambas ramas si el plan lo permite. La creación de la rama y su protección son pasos distintos.

## CD pendiente de conectar

GitHub Actions y despliegue iniciado desde la VM están elegidos por el usuario. No instalar otro Jenkins ni un runner general de PRs en la VM compartida.

El CD se implementará con un workflow de release disparado por `push` a `produccion`, dependiente de CI exitoso del mismo commit. Construirá la imagen del monolito, comprobará el artefacto ejecutable y publicará digest y manifiesto de entrega verificable. Las actualizaciones de `main` y los PRs no publicarán releases desplegables. No habrá aprobación manual adicional tras la promoción mediante PR.

El servicio/timer rootless de la VM consultará las releases aprobadas cada minuto; el polling significa que el despliegue empieza en la siguiente consulta, no inmediatamente al hacer merge. Verificará repositorio, workflow, rama `produccion`, evento `push`, commit y digest, serializará operaciones y actualizará sólo Cenit. Un tag `latest` o un archivo del checkout por sí solos no son autorización.

Para completar y ensayar CD faltan:

- Aplicación ejecutable, Containerfile, prueba de la imagen y migraciones compatibles.
- Rol runtime de PostgreSQL, secreto de aplicación y Quadlet `cenit-app`.
- Permisos de publicación GHCR y credenciales de lectura en la VM; obtenerlas y guardarlas directamente allí, nunca pegarlas en chat ni guardarlas en Git.
- Manifiesto de release, verificación, servicio/timer, registro de versiones y recuperación ante fallos.
- Acceso saliente HTTPS de la VM a GitHub/GHCR y aviso de fallos para el equipo.

No hay workflow de release ni servicio de CD instalado todavía. Mantener el bootstrap actual hasta ensayar el primer despliegue; no sustituir Nginx temporal antes de que la aplicación esté disponible. El procedimiento definitivo no deberá ejecutar builds en la VM ni volver a pedir SSH para cada actualización. Una imagen anterior sólo permite recuperación si sigue siendo compatible con la base; no revierte migraciones.

Referencias: [eventos de Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [protección de ramas y disponibilidad por plan](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [seguridad de workflows](https://docs.github.com/en/actions/reference/security/secure-use).

# HU07-T04 — Verificación de detalle

Fecha: 26/10/2026. Verificación independiente del checkout `cenit-72199f0a`, posterior a la revisión de planificación del 13/10/2026. Cubre registro válido, inexistente, fallo y roles ajenos en API y pantalla. No modifica código de producto, contratos, migraciones ni permisos. Tampoco acredita aceptación del rediseño por su responsable ni el CI del commit.

## Entorno

| Elemento | Versión |
| --- | --- |
| Node / npm | 24.21.0 / 11.19.0 |
| PostgreSQL | 17.10 local (CI usa 17.11) |
| API | Servidor compilado `apps/api/dist/server.js` con `NODE_ENV=production`, rol de runtime sin DDL |
| Navegador | Chromium headless 1243 contra el build de producción. WebKit no está instalado en este entorno |

## Criterios de aceptación

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Respuesta coherente con lo persistido | **Cumple** | Se crea un registro con todos los campos informados (10 de cabecera, 13 por ítem × 3 ítems y 7 de seguimiento) y se coteja campo a campo con SQL directo. Cada `id` devuelve sus propios datos (3 registros sin cruces), en orden de posición. Montos de 25 dígitos exactos, ceros a la izquierda y `null` explícito en registros mínimos. La respuesta cumple `PurchaseResponseSchema`, trae `Cache-Control: no-store` y no expone hash, operación ni credenciales. |
| Pantalla coherente con la respuesta | **Cumple** | Cada par etiqueta/valor de «Datos principales», «Datos complementarios», cada ítem y «Seguimiento administrativo» coincide con la API, con el formato CLP/fecha que usa la interfaz. Título, estado, monto, procedencia, «Registrado por» e ID Cenit también coinciden, antes y después de recargar. Sin desborde horizontal en 1280/1440/1920/390 px. |
| Revisión local y pago separados | **Cumple** | Tras validar: `reviewed`, versión 2 y revisor registrado. `paymentSituation` no cambia y no hay campo de aprobación institucional. |
| Inexistente | **Cumple** | API: 404 `NOT_FOUND`, «Solicitud inexistente.» y `requestId`. Pantalla: alerta con ese texto, título genérico, sin monto, estado ni secciones y sin carga infinita. «Volver a solicitudes» funciona. |
| Identificador malformado | **Cumple** (ver observación) | Texto, UUID en mayúsculas o truncado, inyección SQL, `%` y número: siempre 400, nunca 500 ni SQL en la respuesta. |
| Fallo de consulta | **Cumple** | Se quita el permiso SELECT del runtime sobre los ítems: 500 saneado, sin datos del registro ni detalles de PostgreSQL y con `requestId`. El proceso sigue vivo y, al restaurar el permiso, el mismo detalle responde 200. En pantalla, tanto un 503 como un fallo de red muestran el error sin datos, y «Reintentar» recupera el detalle real. Un 401 al abrir el detalle invalida la interfaz. |
| Ninguna compra accesible a roles ajenos | **Cumple** | Sin sesión → 401. Docente y estudiante → 403 en detalle y listado. La respuesta es igual para un id existente y uno inexistente, así que no permite enumerar compras. Cabeceras falsificadas (`x-role`, `authorization`, etc.), cookies inventadas o alteradas, sesión vencida y sesión cerrada → rechazadas. Cambiar el rol o desactivar la cuenta en la BD se aplica en la siguiente consulta. Ningún rechazo contiene valores del registro. En navegador: docente y estudiante son redirigidos a `/academico`, el anónimo a `/login`, y la interfaz **no realiza ninguna solicitud** a `/api/v1/purchases`. Tras cerrar sesión, «Atrás» no restaura el registro. |

Por diseño documentado en COMPRAS.md, cualquier cuenta `administrativo` puede consultar todas las copias. «Compra ajena» se interpreta, por lo tanto, como ajena al rol, no al creador.

## Ejecuciones

| Suite | Resultado |
| --- | --- |
| `tests/integration/purchases-detail.test.ts` (nueva) | 20/20 |
| Integración completa (incluye HU05-T05) | 142 aprobadas, 1 omitida (reinicio de PostgreSQL, opt-in) |
| `tests/e2e/purchase-detail.spec.ts` (nueva) | 6/6 |
| E2E completo contra el build de producción | 76 aprobadas, 1 omitida (OCR real) |
| `eslint` de los archivos nuevos, `tsc --noEmit`, `npm run build` | Sin errores |

**Control de las pruebas (mutación):** se inyectó cada defecto, se reconstruyó y luego se restauró el original.

| Defecto inyectado | Pruebas que fallan |
| --- | --- |
| La API acepta cualquier rol autenticado | 5 de API |
| El detalle mezcla ítems de otras solicitudes | 2 de API |
| La pantalla invierte el orden de los ítems | El recorrido de detalle válido |

## Observación (UX, menor)

Un enlace con identificador malformado (`/administracion/compras/no-es-un-id`) muestra «Revisa los datos de la solicitud.», que es el mensaje genérico de validación, junto a un botón «Reintentar». El mismo botón aparece para un registro inexistente. En ambos casos reintentar no puede tener éxito, y el texto sugiere que el usuario ingresó datos.

No incumple el criterio: el estado es comprensible, no muestra datos y ofrece volver. Aun así, quien sea responsable de la pantalla podría:

- tratar 400/404 como «La solicitud no existe o el enlace no es válido»;
- ocultar «Reintentar» en esos dos casos.

No se aplicó, porque cambia la interfaz y requiere su aprobación. Capturas en `tmp/hu07-detalle-*.png` al ejecutar el recorrido.

## Reproducir

```bash
npm ci && npm run build
DATABASE_URL=postgres://<superusuario-de-pruebas>@127.0.0.1:5432/postgres \
  npx vitest run --config vitest.integration.config.ts tests/integration/purchases-detail.test.ts
DATABASE_URL=... npm run test:e2e:production -- purchase-detail
```

El spec se añadió a `testMatch` de `playwright.production.config.ts`, así que CI lo ejecuta con el resto del E2E de producción.

## Límites

- PostgreSQL 17.10 local y Chromium 1243, no la versión 1248 que espera Playwright.
- No se repitió el recorrido WebKit mencionado en la planificación, porque el navegador no está disponible aquí.
- No se probó en la VM.
- Pendientes según CONTRIBUTING: aceptación visual del responsable del rediseño, CI del commit, revisión e integración por PR.

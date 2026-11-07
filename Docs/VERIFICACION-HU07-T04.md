# HU07-T04 — Verificación de detalle

Cubre registro válido, inexistente, fallo y roles ajenos, en API y pantalla. No modifica código de producto, contratos, migraciones ni permisos. No acredita la aceptación visual del responsable ni el CI del commit.

## Cambios de `develop` que afectan al detalle

- **Segunda revisión desactivada por defecto.** `CENIT_PURCHASE_SECOND_REVIEW_ENABLED` vale `false` salvo configuración explícita. `POST /purchases/:id/validation` responde `409 FEATURE_DISABLED`, y la pantalla oculta el estado y el botón de revisión. El harness E2E la activa.
- El detalle ofrece «Editar» (no aparece en ejemplos de demostración) y «Eliminar», y muestra el estado de sincronización con Google Sheets.
- El ID Cenit pasa a «Información técnica».
- Los textos cambian: «Detalle del registro», «Volver al registro», «Por revisar en Cenit».

La versión anterior de esta verificación validaba con la segunda revisión activa por defecto; en `develop` eso producía `expected 409 to be 200`. Las pruebas actuales cubren ambas configuraciones.

## Criterios de aceptación

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Respuesta coherente con lo persistido | **Cumple** | Registro con todos los campos informados, cotejado campo a campo con SQL. Cada `id` devuelve sus propios datos, ítems incluidos. `null` explícito en registros mínimos y `Cache-Control: no-store`. **Tras editar**, el detalle muestra la versión nueva y coincide con PostgreSQL. **Tras eliminar**, responde 404 y no quedan cabecera ni ítems. |
| Pantalla coherente con la respuesta | **Cumple** | Cada etiqueta/valor de cabecera, ítems y seguimiento coincide con la API. También título, estado, monto, procedencia, «Registrado por» e ID técnico, antes y después de recargar. Sin desborde horizontal en 1280/1440/1920/390 px. |
| Revisión local y pago separados | **Cumple** | Con la configuración por defecto, validar responde `409 FEATURE_DISABLED` y el registro no cambia. Con la revisión activada en otro proceso: `reviewed`, versión +1 y revisor registrado. El proceso sin la capacidad lee el mismo estado. `paymentSituation` no cambia y no hay aprobación institucional. |
| Inexistente / identificador malformado | **Cumple** | 404 «Solicitud inexistente.» con `requestId`. Identificadores malformados → 400, nunca 500. En pantalla: alerta sin datos ni carga infinita, y el enlace de retorno funciona. |
| Fallo de consulta | **Cumple** | Sin permiso SELECT del runtime sobre los ítems: 500 saneado sin datos ni detalles de PostgreSQL. El proceso sigue vivo y se recupera. En pantalla, 503 o caída de red muestran el error y «Reintentar» recupera el detalle. Un 401 invalida la interfaz. |
| Ninguna compra accesible a roles ajenos | **Cumple** | Sin sesión → 401. Docente y estudiante → 403 en **todas** las rutas de compras (detalle, listado, editar, eliminar, validar, resumen, capacidades, sincronización), y la copia no cambia. Respuesta igual para un id existente o inexistente. Se rechazan cabeceras falsificadas, cookies alteradas, sesión vencida o cerrada, y rol cambiado o cuenta desactivada. En navegador, roles ajenos y anónimo son redirigidos sin que la interfaz consulte compras. |

## Ejecuciones (Node 24.21.0, npm 11.19.0, PostgreSQL 17.10)

| Paso del CI | Resultado |
| --- | --- |
| `typecheck`, `lint`, `catalog:check`, `build` | Correctos |
| `test:unit` | 107/107 |
| `test:integration` | 126/126, incluido `purchases-detail.test.ts` con 23 pruebas |
| E2E de producción con `purchase-detail.spec.ts` | 98 aprobadas, 1 omitida (OCR real) y 1 fallida ajena al detalle |

**Alcance de esta evidencia:** `purchases-detail.test.ts` y sus 23 pruebas de API, igual que el control de mutación, no existen en el árbol de `develop` y su autor ya no participa en el proyecto, por lo que no se pueden reproducir desde el repositorio. Esta tabla es evidencia histórica de esa ejecución, no cobertura vigente. La cobertura presente del detalle está en [purchase-detail.spec.ts](../tests/e2e/purchase-detail.spec.ts) y [purchases.test.ts](../tests/integration/purchases.test.ts), según la [matriz](PRUEBAS-Y-ACEPTACION.md#compras).

**La fallida:** «Inicio reúne cinco altas… se adapta a móvil». Desborda 7 px a 720 px de alto y falla igual cuando se ejecuta sola. Usa datos simulados y no depende del detalle. Se atribuye a la diferencia de Chromium y fuentes en este entorno (1243 frente a 1248 en CI), no a esta verificación. Si también falla en CI, conviene revisarla aparte.

**Control de mutación:** con la API aceptando cualquier rol autenticado, fallan 5 de las 23 pruebas de API. Luego se restauró el original.

## Cambio incluido

`purchase-detail.spec.ts` existía pero no estaba en `testMatch` de `playwright.production.config.ts`, así que el CI no ejecutaba los recorridos de detalle. Se registra en este cambio.

## Observación (UX, menor)

Un identificador malformado en la URL muestra «Revisa los datos de la solicitud.» y un botón «Reintentar». Lo mismo ocurre con un registro inexistente, aunque reintentar no puede tener éxito. Queda a criterio del responsable de la pantalla.

# HU05-T05 — Verificación independiente de consistencia y persistencia

Fecha: 25/10/2026. Revisión independiente del checkout `cenit-72199f0a`, solicitada tras la revisión de planificación del 13/10/2026. Se revisa contra el contrato vigente de cabecera/ítems (`packages/contracts/src/purchases/records.ts`), **sin imponer igualdad entre la suma de ítems y el total documental**. No modifica código de producto, contratos, migraciones, responsabilidades ni estado de la historia; no acredita aceptación humana del rediseño ni revisión del líder.

## Entorno

| Elemento | Versión |
| --- | --- |
| Node / npm | 24.21.0 / 11.19.0 (fijados en `package.json`) |
| PostgreSQL | 17.10 local, superusuario de pruebas (CI usa 17.11) |
| Navegador E2E | Chromium headless 1243 preinstalado; Playwright 1.64 espera 1248, sin acceso de red para descargarlo |
| Bases | Descartables, creadas y eliminadas por cada suite; no se tocó `cenit_demo` ni la VM |

## Resultado por criterio de aceptación

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| Evidencia contra PostgreSQL | **Cumple** | Todas las comprobaciones de filas usan SQL directo sobre `cenit.purchase_requests` y `cenit.purchase_request_lines`, no sólo la respuesta de la API. El runtime se conecta con un rol sin `CREATE` ni superusuario, como `cenit_app` en la VM. |
| Datos válidos | **Cumple** | Cabecera + 3 ítems guardados completos (201). Con ítems que suman 300 y totales 1, 1000 y 999999, todos se aceptan, como exige el contrato vigente. `000777` y `00000000` se conservan como texto. |
| Suma/montos inválidos no dejan filas parciales | **Cumple** | 19 variantes inválidas (total decimal, negativo, exponencial, `007`, `NaN`, número JSON, 256 dígitos, vacío; importe/precio inválido en el último ítem o en uno intermedio; 101 ítems; fecha inexistente o año 0; campos extra de rol/revisión; procedencia inexistente; operación no UUID): todas → 400, conteo global de ambas tablas sin cambios, respuesta sin SQL. Un rechazo no consume la `operationId`. |
| Rollback | **Cumple** | Un trigger temporal hace fallar el 5.º ítem dentro de la transacción: 500 saneado, cero filas de cabecera y de ítems 1–4. Después, el reintento con la misma operación guarda los 5 ítems. |
| Reintento no duplica | **Cumple** | Secuencial: 201 → 200 con el mismo registro. 10 intentos concurrentes: exactamente un 201 y nueve 200, una sola fila. La misma operación con otro contenido → 409 `OPERATION_CONFLICT`, sin alterar lo guardado. |
| Registro persiste tras reiniciar | **Cumple** | El servidor compilado (`apps/api/dist/server.js`, `NODE_ENV=production`) recibe `SIGTERM` y vuelve a arrancar. El puerto queda cerrado entre ambos procesos. Después: detalle idéntico, presente en el listado, filas SQL idénticas, la sesión sigue válida y el reintento devuelve 200 con el mismo id. |
| Caída abrupta durante una escritura | **Cumple** (adicional) | `SIGKILL` del proceso API con la transacción abierta y la cabecera ya insertada: PostgreSQL la aborta y quedan cero filas. Tras arrancar de nuevo, el reintento guarda el registro completo. |
| Reinicio de PostgreSQL | **Cumple** (adicional, opt-in) | Con la API detenida: `pg_ctl restart` y nuevo arranque de la API. El registro y sus filas siguen idénticos. |

## Ejecuciones

| Suite | Resultado |
| --- | --- |
| `npm run test:unit` | 89/89 |
| `npm run test:integration` (existente) | 94/94 (la revisión del 13/10 mencionaba 90; el checkout actual tiene 94) |
| `tests/integration/purchases-consistency.test.ts` (nueva) | 29/29 con el reinicio de PostgreSQL activado; en CI se ejecutan 28 y se omite 1 |
| Integración completa con la suite nueva | 123/123 |
| E2E contra el build de producción (`playwright.production.config.ts`) | 70 aprobadas, 1 omitida (OCR real del notebook no disponible) |
| `eslint` del archivo nuevo, `tsc --noEmit` | Sin errores |

**Control de la propia verificación (mutación):** se introdujeron fallos deliberados en `PurchaseRepository` y se reconstruyó la API compilada. Tras cada prueba se restauró el original.

- Sin transacción: fallan las pruebas de rollback y SIGKILL.
- Reintento idéntico tratado como conflicto: fallan 3 pruebas de reintento.
- `operationId` ignorada: fallan 6 pruebas.

## Hallazgo

**La API termina si PostgreSQL se reinicia mientras ella está en ejecución.** El pool principal de `apps/api/src/infrastructure/database/connection.ts` no registra un manejador de `error`. Cuando PostgreSQL cierra las conexiones inactivas (`terminating connection due to administrator command`), `pg-pool` emite un `error` sin manejar y el proceso sale con código 1. El pool de readiness sí tiene manejador.

- *Datos:* no hay pérdida: lo confirmado sigue en PostgreSQL, como demuestran las pruebas.
- *Disponibilidad:* en la VM lo mitigan `Restart=on-failure` (5 s) y `Requires=cenit-db.service` del Quadlet. En cambio, `npm start` o `npm run dev` locales quedan caídos, y las solicitudes en curso se cortan.
- *Sugerencia (no aplicada; corresponde a quien sea responsable del módulo):* `pool.on('error', () => { /* el pool descarta el cliente y reconecta */ })` en `createPool()`, más una prueba de integración que reinicie PostgreSQL con la API activa.
- *Reproducción:* iniciar `node apps/api/dist/server.js`, hacer algunas solicitudes, ejecutar `pg_ctl restart -m fast` y comprobar que el proceso terminó.

## Cómo reproducir

```bash
npm ci && npm run build
DATABASE_URL=postgres://<superusuario-de-pruebas>@127.0.0.1:5432/postgres \
  npx vitest run --config vitest.integration.config.ts tests/integration/purchases-consistency.test.ts
# Opcional: reinicio real de PostgreSQL (sólo en un servidor desechable)
CENIT_TEST_PG_RESTART_CMD="pg_ctl -D <datadir> restart -w" ...
```

La suite crea y elimina su propia base, su rol de runtime y sus archivos temporales en `tmp/purchase-t05-tests/`. Requiere el build porque prueba el artefacto compilado.

## Límites

- PostgreSQL 17.10 local, no la imagen 17.11 de CI ni la VM. Chromium 1243 en lugar de 1248.
- El reinicio de PostgreSQL es opt-in y no corre en CI, porque reiniciaría el servicio compartido.
- No se verificó el ensayo en VM, OCR real, aprobación del cliente ni reglas institucionales de suma. La igualdad de suma sigue sin confirmar y no se exige.
- Pendiente según CONTRIBUTING: revisión del equipo, push/CI e integración por PR del líder.

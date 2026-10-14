# Pulido de flujos y secuencia de jornada

Plan autorizado por Gael el 14 de octubre de 2026. Primera rama: `fix/ux-flujos-y-movimiento`, desde `origin/develop` `3fbd1b7`, para la demo. Segunda: `feat/sesion-jornada`, **después de la demo y de integrar la primera en develop**. El líder crea PR e integra; evidencia local no sustituye revisión ni CI remoto.

## Implementación de la primera rama

- Cancelar detecta contenido real e ítems; vacío/revertido vuelve directamente. Cambios abren un diálogo accesible con Seguir editando y Descartar y salir. Atrás, enlaces y logout usan la misma guarda. Escape conserva y devuelve foco. Guardado pendiente bloquea salidas voluntarias; recarga/cierre mantienen el aviso nativo del navegador.
- Revisión confirma cambiar/restablecer ejemplos y conserva originales. Transferir no guarda, conserva procedencia y operación; guardar/validar sólo confirma éxito tras servidor.
- Calendario español con entrada `dd/MM/aaaa`, API `YYYY-MM-DD`, teclado y validación compartida. Las conversiones usan componentes de fecha civil, sin parsear la fecha como UTC. Filtros aplicados y dos páginas independientes viven en URL; detalle conserva destino de retorno. Aplicar/Limpiar reinician páginas.
- Borradores de alta/revisión se conservan ocultos ante fallo temporal de revalidación, sólo en memoria de su pestaña, hasta verificar la misma cuenta. El vencimiento original sigue corriendo; logout/401/expiración, otra cuenta, abandonar/cancelar, recarga y cierre descartan. Ningún borrador/credencial se transporta por URL ni almacenamiento persistente.
- Sonner abajo a la derecha complementa mensajes persistentes de sesión; errores de formulario siguen visibles. Home habla de revisión y resumen de ejemplo. Académico tiene título propio y contención del desplazamiento.
- Entradas en 300 ms, cierre académico en 150 ms, presión 0.96/150 ms y feedback de color/opacidad hasta 150 ms. Movimiento reducido usa opacidad. Desmontar datos protegidos al salir de sesión es inmediato. Diálogos, calendario y panel académico salen en 150 ms con transiciones que pueden revertirse; la invalidación de sesión desmonta todo de inmediato. Se conserva tema, densidad y Phosphor.

Dependencias exactas: Radix AlertDialog 1.2.1 (foco/modal/teclado), Radix Popover 1.3.1 y DayPicker 10.0.2 (calendario), Sonner 2.0.8 (avisos). Composición seleccionada de shadcn adaptada a Cenit; no se instala su plantilla ni una biblioteca de animación. Versiones existentes se conservan, con un único lockfile. Referencias: [Calendar](https://ui.shadcn.com/docs/components/radix/calendar), [Sonner](https://sonner.emilkowal.ski/), [beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) y skill local better-ui.

## Verificación

Node 24.21.0/npm 11.19.0: typecheck, lint, catálogo y build completos correctos; 78 unitarias, 93 integración PostgreSQL y 44 infraestructura correctas. Las pruebas de navegador usan runtime de producción y bases/roles descartables, sin añadir compras a cenit_demo. Nuevos recorridos en `tests/e2e/ux.spec.ts`: cancelación sin POST, atrás/logout/Escape, revisión/descarte, recuperación de origen/ítems/operación tras red fallida, expiración/otra cuenta, calendario por teclado/bisiesto/fecha API y guardado pendiente sin falso éxito. Los recorridos existentes cubren roles, filtros/totales/páginas, detalle, errores, transferencias, idempotencia y académico.

Suites completas finales: **57 Chromium y 57 WebKit instalado correctas**, contra producción. Se corrigió el foco del control iniciador también en WebKit, que no enfoca todos los botones/enlaces al pulsarlos. La prueba de mostrar contraseña usa foco explícito en WebKit por la preferencia nativa de tabulación de macOS; Chromium conserva su recorrido con Tab. QA visual de calendario en 1280×720, 1440×900, 1920×1080 y 390×844 sin desbordamiento; las suites también verifican listado, detalle, errores y malla al redimensionar, además de calendario/teclado con movimiento reducido.

Imagen candidata Linux/amd64 compilada y verificada: migrador repetible con rol separado, runtime limitado, HTML/readiness, límites de proxy y recuperación al detener/reiniciar PostgreSQL. Docker Desktop requiere copiar los insumos de inicialización al contenedor descartable; se conservaron las aserciones originales y se comprobó igualdad byte a byte. Adaptador privado de QA, sin modificar deploy/VM ni publicar releases. No verificado: lectores de pantalla, reproducción de movimiento al 10 % en el panel Animations, Safari real y VM. La imagen anterior frente a `absolute_expires_at` se comprobará en la segunda rama: esta primera no contiene migraciones. Vite avisa del tamaño del chunk principal (aprox. 772 kB, 229 kB gzip); queda como oportunidad de medir/separar carga tras la demo, no como una medición de rendimiento realizada.

## Conciliación de Jira y documentos

El corte de planificación reconoce PR #14 integrado y [CI de develop](https://github.com/Menderin/Cenit/actions/runs/38645430179) correcto. La release de main era anterior a malla/pulido: CI verde de develop no acredita esa versión en VM. Los estados siguientes son del corte de revisión; **no se modifican ni cierran tickets automáticamente**.

| Seguimiento real | Evidencia de esta rama | Validación pendiente antes de cierre |
| --- | --- | --- |
| SCRUM-49, SCRUM-46 | Alta/revisión, cancelación, protección de correcciones, transferencia | Revisar flujo con el equipo e integrar; no acreditar extracción real |
| SCRUM-57, SCRUM-62 | URL de filtros/páginas, retorno al listado, validación local con diálogo | Revisión e integración de recorridos, sin asumir edición de guardados |
| SCRUM-35/36/38/39 | Avisos de sesión, guard de logout y borrador tras fallo temporal | Revisión de auth; la jornada no está implementada |
| SCRUM-68 | Título, foco/cierre y contención académica | Revisión del pulido; reglas curriculares siguen pendientes |
| SCRUM-61, SCRUM-79, SCRUM-80 | Descripciones reconocían implementación mientras seguían Por hacer | Conciliar implementación, pruebas, aceptación e integración; actualizar referencias antiguas a produccion |

[Documento de Drive](https://docs.google.com/document/d/18AMmRsGTquB0NgCMwIXDfERUBSlInjZj/edit): propuestas de septiembre de Oracle/Banner deben leerse con decisiones de octubre. [Hoja de campos](https://docs.google.com/spreadsheets/d/1OGyZw8rKPTMXax5RpJw-nd20lGG3i0tQaOwMdiXwTAU/edit): los 15 encabezados tienen candidatos en el modelo; no certifican equivalencias institucionales. Fuente vigente de alcance: PLANIFICACION-MVP, HISTORIAS-USUARIO-INVEST, COMPRAS, EXTRACCION-COMPRAS y ACADEMICO. No se modifica Drive/Jira ni se atribuye aceptación al cliente.

## Segunda rama pendiente

Desde develop integrado, aplicar a los tres roles máximo absoluto de ocho horas e inactividad de 60 minutos. Sesiones anteriores mantienen vencimiento original. Migración aditiva nullable, journal/snapshot intactos para SQL aplicado y migrador vigente; contratos/API/frontend/fixtures se actualizan juntos. `expiresAt` efectivo más `absoluteExpiresAt` opcional. Activity `{}` con cookie/Origin sólo extiende sesión todavía válida, nunca revocada/vencida ni sobre el máximo. Registrar escritura, clic, scroll y navegación humanos agrupados una vez/minuto; no consultas ni mousemove. Aviso cinco minutos antes, Continuar sesión y límite de jornada explicados. BroadcastChannel sincroniza actividad/identidad/logout, sin borradores ni credenciales y con revalidación en servidor.

El borrador activo vive fuera del árbol protegido en memoria de su pestaña; después de expirar puede recuperarse con aviso para la misma cuenta y operación. Otra cuenta, logout explícito, cancelación, recarga o cierre lo descartan. Verificar relojes controlados 60 min/8 h, sesiones anteriores, concurrencia actividad/logout, múltiples pestañas, respuestas tardías, identidad/idempotencia y compatibilidad de la imagen anterior con la migración. Mantener límites en servidor según [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). No anticipar esta implementación antes de las condiciones acordadas.

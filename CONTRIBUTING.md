# Colaborar en Cenit

Estas reglas permiten trabajar en paralelo con cambios pequeños, revisión e integración frecuente. Aplican también al código generado por agentes. No acreditan funcionalidades implementadas ni resuelven supuestos pendientes.

## Referencias antes de empezar

- [AGENTS.md](AGENTS.md): instrucciones para agentes y límites del trabajo.
- [SDD](AGENTS/SDD.md): arquitectura, contratos, versiones y decisiones técnicas de trabajo.
- [Guía de estructura](AGENTS/ESTRUCTURA.md): ubicación de código/pruebas y responsabilidades por carpeta.
- [Historias vigentes](Docs/HISTORIAS-USUARIO-INVEST.md): tareas, criterios de aceptación y supuestos pendientes.
- [Planificación](Docs/PLANIFICACION-MVP.md): capacidad, responsabilidades e hito del MVP.
- [README](README.md): arranque y documentación ejecutable.

Para infraestructura, leer además [entorno local](deploy/LOCAL.md), [operación de la VM](deploy/README.md), [CI/CD](deploy/CI-CD.md) y [contrato de entrega](deploy/CD-VM.md). Si una tarea depende de un supuesto sin confirmar, identificarlo y consultar antes de implementar esa parte; continuar el trabajo independiente.

## Ramas e integración

Conservar dos ramas permanentes: `develop` para integración y `main` para entrega. Los cambios entran mediante PR; no hacer push directo, force-push ni usar bypass para saltar revisión o CI. No crear ramas permanentes por integrante ni añadir otra rama permanente de entrega.

```text
rama de tarea → PR + revisión + CI → develop
develop → PR + revisión + CI → main → release verificada → VM
```

Crear una rama por cambio coherente, vinculada al ticket real del tablero. Una tarea grande puede requerir varios PR pequeños. Para trabajo humano usar `feat/<ticket>-descripcion`, `fix/`, `test/` o `docs/`; los agentes usan `codex/<ticket>-descripcion` salvo indicación explícita. No inventar tickets ni agrupar cambios ajenos a la tarea.

Después de hacer commit, usar **Push origin** para ejecutar CI en la rama de tarea, incluso antes de abrir el PR. GitHub Actions no ve commits que sólo existen localmente. CI se ejecuta en ramas `feat/`, `fix/`, `test/`, `docs/`, `codex/`, en `develop`/`main` y en PR hacia estas últimas. Revisar el resultado por commit en Actions; un check verde en una rama de tarea no sustituye revisión e integración del PR ni autoriza despliegue.

Antes de comenzar, con el trabajo anterior guardado:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feat/<ticket>-descripcion
```

Sustituir `<ticket>` y `descripcion` por valores reales. Sincronizar antes del PR y después de cambios relevantes en contratos o migraciones. Si no se domina rebase, usar en la rama de tarea:

```bash
git fetch origin
git merge origin/develop
```

Resolver conflictos y repetir las comprobaciones afectadas antes de pedir revisión. Rebase es opcional para trabajo propio no compartido; no reescribir historia sobre la que otros estén trabajando. Eliminar la rama de tarea después del merge, conservando `develop` y `main`.

## Pull requests y revisión

Cada PR debe indicar ticket, resultado observable, alcance, criterios satisfechos, cómo se verificó y limitaciones o pendientes. Adjuntar capturas cuando ayuden a revisar la interfaz. Abrir un PR en borrador temprano si se necesita coordinar contratos o pedir ayuda; un borrador no está listo para integrar.

Antes del merge deben pasar `CI required`, las comprobaciones aplicables y al menos una revisión de otro integrante. El autor no aprueba su propio PR. Si después de la revisión cambia el comportamiento, contrato, migración o validación, pedir revisión de esa modificación. El autor resuelve conflictos; el revisor comprueba el cambio y su evidencia, incluido código generado por IA.

Víctor coordina integración y promoción a `main`. Sus propios PR también requieren revisión independiente. Para evitar bloqueos, acordar un sustituto disponible para integración; no eludir checks por ausencia del líder.

Distribución de revisión según el cambio:

| Área | Referencia de revisión |
| --- | --- |
| Frontend e interfaz | Gael |
| Backend, contratos, datos e infraestructura | Víctor |
| Pruebas, criterios, evidencias y documentación | Kevin |

Esta distribución no exige que los tres revisen cada PR. Para cambios de su propio autor, elegir otro integrante con capacidad para comprobarlos; coordinar consumidores cuando se modifiquen contratos. Confirmar disponibilidad de Andrés e Ignacio antes de contar sus horas: asignarles tareas pequeñas con resultado comprobable y revisor identificado.

Reservar diariamente un momento de revisión e integración durante la semana de entrega. Compartir avance, bloqueo y PR pendiente sin esperar a la reunión del sábado. Si una rama se prolonga, explicar la dependencia y buscar una integración parcial coherente que conserve el funcionamiento de `develop`.

## Código, contratos y archivos compartidos

Conservar el monolito modular y la estructura del SDD: frontend en `apps/web/src/features`, backend en `apps/api/src/modules`, persistencia en `db` y contratos públicos en `packages/contracts`. Compras y académico mantienen reglas y acceso a datos propios; no acceder a estructuras privadas del otro módulo.

Definir el contrato antes de implementar consumidores en paralelo. Centralizar solicitudes/respuestas, validaciones y ejemplos; actualizar API, frontend y verificaciones en el mismo cambio o coordinar explícitamente la integración. Los ejemplos antiguos de CRUD no autorizan edición libre ni cambiar Oracle: compras recupera registros existentes y conserva su copia en Cenit.

Antes de editar archivos compartidos como manifiestos, lockfile, router, contratos, esquema/migraciones, estilos globales, Containerfile, Compose o workflows, acordar quién los modifica y avisar a los consumidores. No editar simultáneamente el mismo archivo ni revertir trabajo ajeno.

Usar npm workspaces y un único `package-lock.json`, con instalación `npm ci`. Respetar `.node-version`, npm y los digests documentados; justificar nuevas dependencias y coordinar versiones del frontend con su encargado. No añadir pnpm ni otro lockfile. Documentar configuración pública en `.env.example` o en la guía del entorno correspondiente; secretos en archivos privados fuera de Git, nunca en ejemplos, logs, capturas o PRs.

Sincronizar `develop` antes de generar migraciones. Versionar SQL e historial Drizzle juntos; no modificar migraciones ya integradas/utilizadas. Crear una nueva para cambios posteriores y coordinar la secuencia si hay varias ramas. Probarla contra PostgreSQL y explicar compatibilidad con la versión anterior antes de promover. No aplicar semillas ni restablecimientos automáticamente en despliegues.

Los agentes pueden resolver detalles de implementación dentro del alcance y convenciones aprobadas. Cambios de arquitectura, reglas de negocio, contratos incompatibles o dependencias requieren justificación y coordinación; registrar decisiones y no completar supuestos institucionales por su cuenta.

Usar commits descriptivos, por ejemplo `fix(<ticket>): corregir validación de montos` o `docs(<ticket>): documentar arranque local`. Sustituir el marcador por el ticket real; evitar mensajes como `final2` o `ahora-si`.

## Terminado y entrega

Una tarea está terminada cuando cumple sus criterios, está revisada e integrada y tiene evidencia de las comprobaciones aplicables. Una historia de aplicación además debe funcionar en el recorrido completo y el build de demostración; una pantalla aislada, un mock o infraestructura en bootstrap no la completan. Para tareas documentales o de investigación, verificar su entregable y registrar dependencias sin exigir un build ajeno a su alcance.

La demo es el jueves **15 de octubre de 2026**. El objetivo es tener un primer recorrido integrado y ensayar la VM el martes **13**; adelantar a ese día el cierre de funcionalidades es una propuesta para acordar con el equipo. El límite vigente de integración, correcciones y ensayo es el miércoles **14**. No añadir funcionalidades improvisadas el jueves ni presentar pendientes como resueltos.

`develop` no publica entregas. El push integrado a `main` ejecuta CI sobre ese commit; el publicador verifica la imagen y crea una release `cenit-<SHA completo>` que el ejecutor de la VM valida antes de desplegar. No crear una release manual para eludir el circuito ni cambiar el tag esperado. Mantener publicación deshabilitada hasta completar aplicación/tests y preparar el primer ensayo supervisado, según la guía CI/CD.

Conservar una ejecución local ensayada de la misma imagen/versión para contingencia. Antes de declarar CD operativo, comprobar entrega exitosa y recuperación ante fallo en la VM; el bootstrap y un timer esperando releases no acreditan ese ensayo. Registrar commit y digest de la versión presentada.

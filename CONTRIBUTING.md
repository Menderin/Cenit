# Colaborar en Cenit

El trabajo se organiza en tareas de Jira y cambios pequeños que otra persona pueda revisar. Estas reglas se aplican a todo el equipo y a los agentes que lo asisten.

## Alcance y responsabilidades

El [documento de arquitectura](Docs/ARQUITECTURA.md) resume el alcance del Charter, el funcionamiento vigente y las decisiones técnicas. Jira contiene asignaciones y criterios de las tareas; las actas de revisión registran aceptación y observaciones de usuarios. Personal y Bienes pertenecen al proyecto completo, pero no se incorporan al MVP sin definir sus requisitos.

Antes de editar, revisar Git y conservar cambios ajenos. Trabajar en la tarea solicitada y comprobar sus dependencias sin asumir las responsabilidades de otras personas. Si una decisión pendiente bloquea una parte, registrarla y continuar con el trabajo independiente. Una dependencia no amplía el alcance autorizado.

## Ramas y commits

Las ramas permanentes son `develop` para integración y staging, y `main` para producción de la demostración. Cada cambio entra mediante PR y CI; no se permiten push directo, force-push ni bypass de revisión en esas ramas.

Los PR hacia `main` deben proceder de `develop` del mismo repositorio. El workflow `main-source.yml` publica el check `Main source branch`; para impedir integraciones desde otro origen, debe configurarse como obligatorio en la protección de `main`, junto con `CI required`, sin bypass. El workflow no configura por sí solo la protección de GitHub ni impide abrir PR. Incorporar primero el cambio en `develop`, abrir el PR de promoción a `main` y, cuando aparezca el check, seleccionarlo en el ruleset antes de integrar. Las ramas de tarea se integran previamente en `develop`.

Usar nombres descriptivos con el ticket real cuando corresponda:

| Tipo de cambio | Prefijo |
| --- | --- |
| Funcionalidad | `feat/` |
| Corrección | `fix/` |
| Pruebas | `test/` |
| Documentación | `docs/` |

La convención es la misma para personas y agentes. Una tarea puede requerir varios commits o PR pequeños; no inventar tickets ni agrupar cambios ajenos. Los archivos y documentos se nombran por su contenido, no por la sesión del agente.

Al iniciar una rama, partir de `develop` actualizado con avance rápido. Si hay trabajo local, conservarlo antes de cambiar de rama. Sincronizar con `origin/develop` antes de la revisión y después de cambios relevantes en contratos/migraciones; no reescribir una historia compartida. Resolver los conflictos en la rama de tarea y repetir las comprobaciones afectadas.

Los commits describen el resultado, por ejemplo `fix: conservar el filtro al volver del detalle` o `docs: explicar la preparación del entorno local`. Después del commit, el push de la rama ejecuta CI; un commit sólo local no tiene comprobaciones remotas. CI se ejecuta en ramas de tarea y en PR hacia `develop`/`main`, y vuelve a comprobar el SHA integrado. Un CI correcto de una rama no sustituye la revisión del PR ni autoriza por sí solo una entrega.

El filtro de push también admite las ramas `SCRUM-*` y `scrum-*`. Los PR vuelven a ejecutar CI al abrirse, recibir commits, reabrirse, editarse —incluido un cambio de destino— o pasar a revisión. Configurar `CI required` como obligatorio tanto en `develop` como en `main`; comprobar únicamente GitGuardian no acredita las pruebas de la aplicación.

## Revisión e integración

El PR describe problema y resultado, alcance, criterios satisfechos, verificación y pendientes. Incluir capturas cuando ayuden a revisar una interfaz. Un PR en borrador sirve para coordinar y no se considera listo para integrar.

Antes del merge deben pasar `CI required`, las comprobaciones aplicables y al menos una revisión independiente. El autor no aprueba su propio cambio. Si después de la revisión cambia comportamiento, contrato, migración o validación, se revisa esa modificación también. Estas condiciones incluyen código generado por agentes.

| Área | Referencia de revisión |
| --- | --- |
| Frontend e interfaz | Gael |
| Backend, contratos, datos e infraestructura | Víctor |
| Pruebas, criterios, evidencias y documentación | Kevin |

El autor elige otro integrante con capacidad para revisar su propio trabajo. Confirmar disponibilidad antes de asignar esfuerzo a Andrés o Ignacio. Víctor coordina integración y promoción a `main`; sus cambios también necesitan revisión independiente. La ausencia de un revisor no autoriza a eludir los controles.

El líder crea los PR. Los agentes preparan cambios, commits y evidencia local; sólo publican, crean PR o integran cuando reciben una instrucción explícita. No cambian estados/asignaciones de Jira ni envían mensajes a compañeros sin esa autorización.

## Cambios de código y documentación

Mantener el monolito modular y la [organización del código](Docs/ARQUITECTURA.md#organización-del-código). Compras y académico controlan sus reglas y datos. Los contratos públicos son la referencia compartida entre API, frontend y verificaciones; una modificación requiere actualizar consumidores o coordinar explícitamente su integración.

Antes de editar archivos compartidos —router, contratos, esquema/journal, estilos globales, manifiestos, lockfile, Containerfile, Compose o workflows— acordar propiedad cuando exista trabajo paralelo. No modificar simultáneamente el mismo archivo ni revertir trabajo de otro integrante.

Usar las herramientas y versiones fijadas, un único lockfile y `npm ci` para instalar en CI/builds. Justificar dependencias nuevas. Sincronizar `develop` antes de generar una migración, conservar SQL aplicado y usar el migrador separado. Las semillas de demo no forman parte de migraciones ni de CD. Secretos en archivos privados; nunca en ejemplos, logs, capturas o PR.

La documentación describe cómo usar y mantener la versión actual, en lenguaje comprensible para personas. Cada comportamiento tiene una referencia principal. Al cambiarlo se actualiza esa sección, sin anteponer otra nota que contradiga el texto anterior. Git conserva el historial.

La arquitectura y los contratos resumidos pertenecen a [Arquitectura](Docs/ARQUITECTURA.md); los casos y resultados, a [Pruebas y aceptación](Docs/PRUEBAS-Y-ACEPTACION.md); los comandos de instalación/operación, a `deploy`. Un documento nuevo necesita una necesidad de consulta propia que no cubran los existentes. Los relatos de implementación, capturas locales y resultados detallados de una ejecución se registran en el PR, Jira o artefactos de CI; no se crean informes por sesión. Las decisiones duraderas conservan su motivo y los cambios de alcance se contrastan con el Charter y los responsables.

## Terminado y entrega

Una tarea está terminada cuando satisface sus criterios, tiene evidencia, fue revisada e integrada. Las historias de aplicación deben funcionar en el recorrido completo sobre el build de demostración. Para una tarea documental se revisa su entregable y sus referencias, sin exigir un build ajeno a su alcance. Una prueba técnica correcta no sustituye aceptación de usuarios.

La entrega habitual es automática: `develop` despliega staging y `main` producción de la demostración, después de CI y verificación de imágenes del SHA integrado. El [procedimiento Azure](deploy/azure/README.md) describe sus controles y recuperación. No sustituirlo por SSH, `git pull`, builds manuales en la VM o releases para eludir gates.

Conservar una ejecución local comprobada de la misma versión como contingencia. Antes de declarar operación completa, verificar entrega y recuperación en el destino, registrar SHA/digests y mantener los datos. No retirar el servidor anterior sin transferencia y recorridos comprobados.

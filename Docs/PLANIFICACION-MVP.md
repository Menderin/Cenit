# Planificación del MVP de Cenit

Fecha: 10 de octubre de 2026. Estado: borrador para acordar con el equipo; no constituye un compromiso de esfuerzo validado ni una entrega implementada.

## Decisiones y cambios de alcance

Víctor confirmó que la carrera es Nutrición. Se conserva la gestión de compras y la malla; se añaden login y recuperación automática de datos de compras. Para el acceso propuso cuentas propias ficticias de profesores y estudiantes. La captura tiene dos alternativas por investigar: datos estructurados del sistema Oracle mediante una API, o extracción desde imágenes mediante OCR/visión. Aún no se contacta a los encargados; ninguna alternativa está seleccionada ni su viabilidad acreditada. Estas aclaraciones del líder amplían la guía anterior; no acreditan acuerdo colectivo ni validación institucional.

Registro manual significa escribir los campos en un formulario. OCR convierte texto de una imagen en texto digital; identificar fecha, referencia y monto requiere procesamiento adicional. Revisar y corregir lo extraído antes de guardarlo no sustituye la automatización requerida. Recuperar datos mediante API es una vía distinta, sin necesidad de OCR. No se promete implementar ambas vías para el jueves.

Antes de cerrar historias y tareas dependientes hay que resolver:

| Pendiente | Información necesaria | Trabajo que bloquea |
| --- | --- | --- |
| PL01 | Contactar encargados, identificar producto/API Oracle y acceso de prueba; conseguir imágenes ficticias representativas y elegir vía | Contratos, implementación y estimación de captura automática |
| PL02 | Login local confirmado; Google se posterga. Precarga de cuentas, detalle de credenciales, contrato y duración de sesión por concretar | Implementación y pruebas; no se presupone registro público ni envío de correos |
| PL03 | Fuente recibida: `Docs/malla-nutricion-y-dietetica-2027.pdf`. Confirmar versión y conseguir prerrequisitos oficiales obligatorios; no figuran en la malla gráfica | Ya permite transcribir y visualizar; bloquea completar consulta de prerrequisitos oficiales |
| PL04 | Roles definidos: docente/estudiante para malla y administrativo para compras. Concretar matriz en contratos y probarla | Autorización en servidor; separación acordada, todavía no implementada |
| PL05 | Horas y entregables confirmados de Andrés e Ignacio | Capacidad adicional disponible |

No cambiar todavía los contratos técnicos del SDD por suposiciones sobre estos pendientes. No sustituir Nutrición por una malla ficticia y presentarla como oficial. La foto no autoriza inventar campos faltantes ni confirmar un registro antes de su revisión y persistencia. Mantener las garantías de montos, transacciones, idempotencia y conflictos de edición.

### Acceso y separación de módulos

El líder confirmó login local para el MVP y cuentas preparadas por el equipo, sin registro público; consultará el martes la necesidad de Google, que no se implementa por ahora. Detalles técnicos de credenciales y sesión siguen por concretar. La matriz quedó confirmada; la simulación se excluyó y los prerrequisitos oficiales son obligatorios.

Compras recupera registros existentes en Oracle que Luis Lanas transcribe desde pantallazos a Excel, según Víctor. Cenit no realiza compras ni modifica origen. Tabla y persistencia en Cenit son el mínimo confirmado; Google Sheets es opcional. Actualizar copia recuperando/reintentando y revisando cambios pertinentes: disparador manual/automático pendiente, no edición libre confirmada. Malla en PostgreSQL confirmado. Fichas vigentes en `Docs/HISTORIAS-USUARIO-INVEST.md` sustituyen el desglose histórico inferior.

| Rol | Malla académica | Compras |
| --- | --- | --- |
| `docente` | Visualización y prerrequisitos oficiales | Sin acceso |
| `estudiante` | Visualización y prerrequisitos oficiales | Sin acceso |
| `administrativo` | Sin permiso académico por defecto | Alta, búsqueda, filtros, detalle y edición |

Aplicar la matriz tanto en interfaz como en API. El rol procede de la cuenta configurada por el equipo: no permitir que el usuario se conceda permisos escogiendo un rol en el login. Si más adelante una persona requiere ambos accesos, definir esa asignación explícitamente; no ampliar permisos por defecto.

Compras y académico tienen navegación, contratos y reglas separados dentro del monolito existente. La separación funcional no obliga a crear despliegues, repositorios o bases independientes. Los dos módulos administrativos futuros mencionados por Víctor quedan fuera de este sprint; no se inventan nombres, historias ni permisos para ellos.

## Sprint y hito

Sprint 3 propuesto por Víctor: iniciar el sábado 10 de octubre de 2026 y cerrar el lunes 26, a la hora de cierre acordada; 16 días entre ambas fechas. Registrar esta duración como excepción y luego retomar sprints de dos semanas de lunes a lunes. Este documento no modifica un tablero externo ni acredita compromiso colectivo: Gael revisará el plan cuando esté disponible.

Objetivo propuesto: entregar y validar una demostración integrada de acceso para docentes/estudiantes, compras persistentes con recuperación automática de datos por una vía investigada y malla de Nutrición; incorporar después del hito correcciones y observaciones verificadas. La captura y los prerrequisitos mantienen dependencias explícitas; no se dan por resueltos al iniciar el sprint.

El jueves 15 es un hito dentro del sprint, no su final. El miércoles 14 es el límite de integración, verificación y ensayo de la versión a presentar. No planificar funcionalidades nuevas para el jueves. El martes 13 es el primer ensayo real en la VM, porque Víctor sólo puede volver a acceder desde allí ese día. El desarrollo de la imagen y workflow debe adelantarse desde casa.

Lo pendiente después del hito se ordena según evidencia y feedback. No se promete completar una segunda semana de trabajo antes del jueves por conservar un sprint de dos semanas.

## Equipo y capacidad

| Integrante | Responsabilidad indicada | Propuesta de revisión/apoyo |
| --- | --- | --- |
| Víctor | Liderazgo, planificación, backend y DevOps | Contratos, datos, integración y entrega |
| Gael | Frontend y apoyo en planificación | UX, integración de contratos y revisión del plan cuando esté disponible |
| Kevin | QA, testing y documentación | Criterios de aceptación, evidencias, defectos y guion de demo |
| Andrés | Participación por confirmar | Datos de prueba de compras y revisión manual guiada; revisión de Kevin/Víctor |
| Ignacio | Participación por confirmar | Recopilar/transcribir referencia de Nutrición y revisar contenido; revisión de Gael/Kevin |

Víctor confirmó 2–3 horas diarias para él, Gael y Kevin entre domingo y miércoles: 8–12 horas por persona, 24–36 horas nominales en total. Reuniones, revisión, integración y correcciones consumen parte de ese tiempo. No sumar como horas disponibles el trabajo de Andrés/Ignacio antes de su confirmación. Gael no está disponible el sábado 10; no colocar una dependencia de ese día a su cargo.

El alcance completo aún no está estimado. Login y captura automática son requisitos añadidos. Mantener el alcance requerido no demuestra que quepa en las horas disponibles. Antes de comprometer tareas hay que contrastar carga por persona, reutilización existente y capacidad adicional. No compensar sobrecarga quitando pruebas o convirtiendo funciones pendientes en terminadas.

## Épicas del proyecto

| ID | Épica | Resultado observable | Responsable de coordinación |
| --- | --- | --- | --- |
| EP01 | Identidad y acceso | Usuarios autenticados acceden a funciones autorizadas por rol | Víctor, con frontend de Gael |
| EP02 | Gestión de compras | Datos recuperados, revisados y guardados; tabla, filtros, detalle y edición | Gael, con API de Víctor |
| EP03 | Exploración y simulación curricular | MVP: catálogo visible y prerrequisitos oficiales. Simulación en iteración futura | Gael, con catálogo/API de Víctor |
| EP04 | Entrega y operación de Cenit | Versiones verificadas publicadas/desplegadas, datos persistentes y recuperación ensayada | Víctor |
| EP05 | Base de calidad y validación | Pruebas, datos y criterios permiten acreditar entregas | Kevin |

Las épicas agrupan resultados; no son tareas de dos horas ni implican que todo esté comprometido. La división entre módulos sigue siendo interna al monolito, no dos aplicaciones o microservicios.

## Referencia histórica del desglose inicial

Las fichas vigentes están en `Docs/HISTORIAS-USUARIO-INVEST.md`; `Docs/BACKLOG-SPRINT-3.md` conserva el borrador anterior. Las historias y tareas siguientes son referencia histórica, no tickets adicionales. HU07 y T21/T22 de este borrador describen simulación futura, excluida del MVP; T23 se limita para el MVP a visualización/prerrequisitos. Los IDs EP de esta tabla corresponden a las seis agrupaciones anteriores; no utilizarlos para asignar las nuevas épicas. Mapear trabajo vigente a las fichas INVEST sin duplicarlo.

| ID | Épica | Historia o habilitador | Criterio principal / dependencia |
| --- | --- | --- | --- |
| HT01 | EP01 | Base de frontend, API, contratos y PostgreSQL | Otro integrante ejecuta y prueba siguiendo el README; versiones y lockfile fijados |
| HT02 | EP01 | Construir, verificar y publicar una entrega | CI real, digest y manifiesto coherentes con `deploy/CD-VM.md`; falta imagen/workflow |
| HU01 | EP02 | Como docente, estudiante o administrativo de demo, quiero iniciar y cerrar sesión para acceder al módulo autorizado | Credenciales válidas/inválidas, expiración, logout y matriz aplicada en servidor; PL02/PL04 |
| HT05 | EP03 | Investigar y decidir cómo recuperar automáticamente datos de compras | Evidencia de API/acceso o extracción sobre imágenes ficticias; decisión explícita o bloqueo documentado |
| HU02 | EP03 | Como usuario autorizado de compras, quiero recuperar datos automáticamente y revisarlos | Vía elegida en HT05; campos identificados/faltantes, errores y confirmación humana antes de guardar; PL01 |
| HU03 | EP03 | Como funcionario de compras, quiero confirmar y guardar el documento y sus imputaciones | Suma exacta, operación transaccional, reintento sin duplicación y persistencia |
| HU04 | EP03 | Como funcionario de compras, quiero encontrar compras en una tabla mediante filtros | Orden/paginación, filtros combinados y agregados correctos |
| HU05 | EP03 | Como funcionario de compras, quiero consultar detalle y corregir un registro | Referencias conservadas, estados separados y conflicto de versión visible |
| HU06 | EP04 | Como docente o estudiante, quiero consultar la malla de Nutrición con su fuente y versión | Ramos y reglas corresponden a la referencia; PL03 |
| HU07 | EP04 | Como usuario de la malla, quiero simular asignaturas aprobadas y ver sus prerrequisitos | Mantener el alcance previo de simulación mientras no se acuerde otra cosa; AND/OR, inconsistencias, recarga y reset confirmado |
| HT03 | EP05 | Verificar y ensayar los recorridos sobre el build de presentación | Kevin recoge evidencias; automatización y QA desde el inicio |
| HU08 | EP05 | Como equipo, quiero presentar una versión identificada con datos de demo y recoger observaciones | Release congelada, guion, ejecución local alternativa y limitaciones claras |
| HT04 | EP06 | Actualizar documentación y organizar el trabajo | Charter/referencias, alcance, riesgos y tablero coherentes; cambios explícitos frente al SDD |

HT identifica trabajo técnico y HU historias de usuario. En Jira, historia y tarea están al mismo nivel bajo una épica; el detalle de una historia puede registrarse como subtareas. Las pruebas de cada historia forman parte de su terminación, no se aplazan todas a EP05. Se evita inventar un usuario de negocio para un habilitador técnico.

## Tareas que pueden definirse sin los pendientes

| ID | Padre | Tarea y evidencia | Responsable propuesto | Dependencia |
| --- | --- | --- | --- | --- |
| T01 | HT01 | Inicializar workspaces, versiones exactas, scripts reales y lockfile | Víctor, con Gael para frontend | Compatibilidad del stack con Gael |
| T02 | HT01 | API, configuración privada, conexión PostgreSQL y health/live/ready | Víctor | T01 |
| T03 | HT01 | Shell React, navegación por módulos y avisos de demo | Gael | T01; PL04 para acceso final |
| T04 | HT01 | Ejecución reproducible local y README; Kevin repite el arranque | Víctor; revisión Kevin | T01–T03 |
| T05 | HT02 | Containerfile del monolito con frontend compilado, UID y secretos del contrato | Víctor | T01–T04 |
| T06 | HT02 | Workflow de release, gates, publicación y artifact verificable | Víctor; apoyo QA Kevin | T05 y pruebas reales |
| T07 | HT02 | Ensayar entrega y recuperación en la VM con registro de versión | Víctor; evidencia Kevin | T06; acceso del martes |
| T08 | HU03 | Schemas TypeBox y esquema/migración de compra, catálogos e imputaciones | Víctor; revisión Gael/Kevin | T01; coherencia de datos de HU02 |
| T09 | HU03 | Alta transaccional, referencias de catálogo, suma e idempotencia | Víctor | T08 |
| T10 | HU03 | Formulario de revisión/confirmación con montos e imputaciones | Gael | T08; PL01 para origen |
| T11 | HU03 | Pruebas de suma inválida, rollback, doble intento y persistencia | Kevin con Víctor | T09–T10 |
| T12 | HU04 | API de listado/filtros y agregados sin duplicar cabeceras | Víctor | T08–T09 |
| T13 | HU04 | Tabla, filtros, paginación y estados carga/vacío/error | Gael | T12; ejemplos del contrato disponibles antes |
| T14 | HU04 | Verificar búsqueda, filtros combinados y totales 100000/70000 | Kevin | T12–T13 |
| T15 | HU05 | Lectura de detalle y PUT con versión/idempotencia | Víctor | T09 |
| T16 | HU05 | Detalle y edición conservando borrador ante error/conflicto | Gael | T15 |
| T17 | HU05 | Probar cambios, edición simultánea y separación revisión/pago | Kevin con Víctor | T15–T16 |
| T18 | HU06 | Transcribir asignaturas/semestres desde el PDF recibido y cotejar visualmente; registrar campos y reglas ausentes | Ignacio; revisión Gael | Fuente disponible; disponibilidad por confirmar |
| T19 | HU06 | Catálogo versionado y validación de códigos, referencias y ciclos | Víctor; contenido revisado por Gael | T18 |
| T20 | HU06 | Vista por semestres, fuente/versión y prerrequisitos comprensibles | Gael | T19; contrato previo |
| T21 | HU07 | Modelo de simulación AND/OR y conservación de marcas inconsistentes | Gael | T19 |
| T22 | HU07 | Persistencia por plan/versión, reset y recuperación de estado corrupto | Gael | T21 |
| T23 | HU07 | Casos unitarios y E2E de visualización/simulación, cubriendo también HU06 | Kevin con Gael | T20–T22 |
| T24 | HT03 | Matriz de aceptación y fixtures de compras; propuesta de datos de Andrés | Kevin; apoyo Andrés | Contratos; disponibilidad de Andrés por confirmar |
| T25 | HT03 | Integración PostgreSQL y E2E sobre build, incluidos fallos de API | Kevin con autores | Historias integradas; no contar de nuevo T11/T14/T17/T23 |
| T26 | HU08 | Guion de presentación, datos ficticios y limitaciones reconocibles | Kevin; apoyo Andrés | Alcance cerrado y recorridos verificables |
| T27 | HU08 | Congelar commit/digest, ensayo general y alternativa local de esa versión | Víctor; participan Gael y Kevin | T07/T25; miércoles |
| T28 | HT04 | Actualizar alcance, Charter/referencias y registro de riesgos | Kevin con Víctor | PL01–PL04 para descripción final |
| T29 | HT04 | Revisar backlog y carga por persona; fijar dueños, revisores y evidencias | Víctor con Gael/Kevin | Estimaciones y capacidad confirmadas |

Estas tareas son candidatas, no fechas comprometidas. Algunas todavía superan un bloque de 2–3 horas y deben dividirse al estimar, por ejemplo implementación de idempotencia y agregados. No registrar T18/T24 como terminadas por asignarlas; si no llega evidencia a tiempo, el equipo revisa la dependencia y acuerda una acción explícita.

## Tareas de acceso e investigación de captura

| ID | Padre | Tarea y evidencia | Responsable propuesto | Dependencia |
| --- | --- | --- | --- | --- |
| T30 | HU01 | Contratos login/sesión/logout, cuentas ficticias y matriz docente/estudiante/administrativo | Víctor; revisión Gael/Kevin | PL02/PL04 |
| T31 | HU01 | Login local propuesto con correo/contraseña protegida, sesión y autorización por rol; logout invalida sesión | Víctor | T30/T01/T02 |
| T32 | HU01 | Pantalla login, sesión, cierre y estados de acceso denegado/expirado | Gael | T30; integración T31 |
| T33 | HU01 | Probar credenciales válidas/inválidas, expiración, logout y acceso directo no autorizado a API | Kevin con Víctor | T31/T32 |
| T34 | HT05 | Preparar preguntas a encargados: producto Oracle, API, campos, permisos y entorno de prueba; registrar respuestas o falta de acceso | Víctor; Andrés recopila antecedentes | Disponibilidad/contacto por confirmar |
| T35 | HT05 | Explorar extracción con imágenes ficticias; registrar campos recuperados, errores, tiempo y recursos | Víctor; Kevin prepara casos | Muestras; herramienta por justificar |
| T36 | HT05 | Comparar evidencia, decidir vía o documentar dependencia externa/bloqueo | Víctor; revisión Gael/Kevin | T34/T35; PL01 |
| T37 | HU02 | Definir contrato de extracción: campos candidatos, ausencias, errores, límites y retención si hay imagen | Víctor; revisión Gael/Kevin | T36 |
| T38 | HU02 | Implementar y probar adaptador de la vía elegida con datos ficticios | Víctor | T37; acceso/herramienta acreditados |
| T39 | HU02 | Entrada de imagen si corresponde, progreso, revisión/corrección antes de confirmar | Gael | T37/T38; reutiliza T10 |
| T40 | HU02 | Probar entrada inválida, extracción parcial/fallida y corrección; no guardar sin confirmación | Kevin con autores | T38/T39/T09 |

Propuesta para T35: exploración inicial de 1–2 horas el domingo, con límite explícito; no es la estimación de la funcionalidad completa. Al agotarse, registrar resultados y decidir siguiente paso. T34 depende de terceros: que Oracle sea el proveedor no demuestra que haya una API disponible. Andrés puede preparar antecedentes; el contacto lo coordina Víctor. Este documento no envía mensajes ni concede acceso institucional.

El lunes debe existir una decisión de trabajo o un bloqueo visible sobre PL01. Hasta entonces HU02 permanece sin mecanismo ni estimación cerrados. No está acordado sustituirla por transcripción manual ni dejar Oracle fuera de la entrega. Evitar contar dos veces T39/T10 y pruebas ya cubiertas. No usar datos reales en fixtures ni elegir proveedor sin evaluar necesidad, coste y tratamiento de imágenes.

## Hitos propuestos hasta la presentación

| Día | Evidencia buscada | Condición |
| --- | --- | --- |
| Domingo 11 | Base que arranca, contratos iniciales y resultados de investigación | Asignaciones y muestras disponibles; QA desde el inicio |
| Lunes 12 | Revisión del plan con equipo, carga validada, primera compra persistente mediante interfaz/API y login en integración | Elegir captura o registrar bloqueo; transcripción de malla en revisión |
| Martes 13 | Primer build desplegado y recuperación ensayada en la VM; avance verificable de ambos módulos | Acceso de Víctor y pipeline real |
| Miércoles 14 | Historias verificadas, commit/digest congelados y ensayo general/local | Todo criterio incumplido queda visible como pendiente |
| Jueves 15 | Presentación de versión ensayada y registro de observaciones | No depender de instalación de última hora |
| Viernes 16 a domingo 25 | Corregir defectos y verificar mejoras priorizadas a partir de la demo | Capacidad de esta etapa por confirmar; no trasladar silenciosamente compromisos del jueves |
| Lunes 26 | Review, retrospectiva y cierre del sprint 3; planning del siguiente | Evidencias y pendientes actualizados; horarios por acordar |

Son objetivos de coordinación, no fechas acreditadas por estimaciones. T29 debe sumar horas por persona, incluyendo reuniones, revisión y correcciones. Si supera 8–12 horas individuales, registrar la brecha y acordar capacidad adicional o una decisión de alcance; no presentar esta tabla como garantía de cumplimiento.

## Seguimiento y definición de terminado

Preparación y planificación inicial el sábado 10 con Víctor; revisión de objetivo, carga y responsables con los integrantes disponibles el lunes 12. No presentar la preparación individual como compromiso de todo el equipo. Seguimiento semanal los sábados 17 y 24; no llamarlo Daily Scrum. El lunes 19 puede usarse para seguimiento/refinamiento y el lunes 26 para cierre y siguiente planning.

Hasta el miércoles: reporte diario breve de cada integrante con resultado integrado, próxima tarea y bloqueo. Si surge un bloqueo crítico, resolverlo ese día sin esperar al sábado. No se han fijado horarios ni creado reuniones externas.

Una historia termina con criterios satisfechos, código integrado y revisado, verificaciones relevantes correctas, errores manejados y funcionamiento sobre el build de demo. No basta una pantalla, un mock o un test que siempre pasa. QA se reparte: cada autor prueba su cambio, Kevin coordina cobertura y aceptación.

Tablero propuesto: Pendiente → En curso → En revisión → En validación → Terminado. Mantener como máximo una tarea principal activa por persona. Registrar bloqueos y evidencia del PR/prueba; no medir avance sólo por número de tareas cerradas.

## Referencias

- `AGENTS/SDD.md`: contratos y garantías vigentes, sujetos a los cambios de alcance explicitados aquí.
- `deploy/CD-VM.md`: contrato de imagen/publicación y pendientes del primer despliegue real.
- `Docs/Guía de trabajo para el MVP de Cenit.pdf`: referencia anterior; login y captura automática son ampliaciones, con mecanismo pendiente.
- `Docs/malla-nutricion-y-dietetica-2027.pdf`: fuente recibida y revisada; gráfico por semestres, sin prerrequisitos explícitos. El folleto indica 2027; confirmar versión institucional del plan antes de afirmarla como validada.
- [Scrum Guide](https://scrumguides.org/scrum-guide.html): sprints de duración fija y entrega de incrementos durante el sprint. El plan de reuniones descrito es una adaptación del equipo.

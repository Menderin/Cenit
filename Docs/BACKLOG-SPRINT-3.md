# Cenit — Historias y habilitadores del sprint 3

Fecha: 10 de octubre de 2026. Estado: propuesta para estimar y revisar con el equipo. Sprint: 10–26 de octubre; demostración: jueves 15; cierre del build: miércoles 14. Ningún ítem se considera implementado o comprometido sólo por aparecer aquí.

Actualización autorizada del 11 de octubre: además de HU09-T03 (catálogo/migración/contrato), se incorpora un entregable de perfiles e historial de intentos para consultar progreso propio y búsqueda docente por nombre/RUT. Persistencia de progreso ficticio, sin simulación ni edición pública. [Modelo, API y evidencia](ACADEMICO.md). La migración del catálogo y sus lecturas están verificadas localmente; revisión e integración pendientes. El vínculo real de cuentas/historial depende de HU01-T03 y no se despliega con el journal actual.

Tareas de la ampliación: revisar FK y clave de cuenta con login; integrar perfil/adscripción/intentos en una nueva migración; preparar datos ficticios con cuentas existentes; conectar sesión real a lecturas propias/docentes; adaptar pantallas y ensayar el recorrido. La propuesta y pruebas de BD/API están preparadas; conexión de autenticación, consumidor frontend y migración de historial no deben marcarse terminados por esa evidencia.

**Revisión vigente:** `Docs/HISTORIAS-USUARIO-INVEST.md` sustituye las fichas siguientes con descripción, criterios y tareas específicas. Última decisión del líder: login local confirmado; malla y prerrequisitos oficiales obligatorios; simulación fuera del MVP. HU11/HU12 son futuras. El contenido anterior conservado debajo es referencia histórica y no debe usarse para ampliar el compromiso ni duplicar tareas.

## Organización y alcance

Épicas del proyecto: EP01 Identidad y acceso; EP02 Gestión de compras; EP03 Exploración y simulación curricular; EP04 Entrega y operación de Cenit; EP05 Base de calidad y validación.

HU describe un resultado para un usuario. HT es un habilitador técnico, de diseño, investigación o documentación: se registra como tarea bajo su épica, no se disfraza de historia de negocio. Ambos requieren evidencia y estimación. El mockup, el endpoint y la migración son trabajo necesario para completar historias; por sí solos no prueban que el recorrido funcione.

Se mantiene el monolito y el stack del SDD. Roles académicos: docente/estudiante; compras: administrativo. Login local con correo/contraseña, un rol por cuenta y sesión fija de dos horas confirmados el 11 de octubre; preparación explícita de cuentas ficticias y Google posterior. HU01-T03/T04 y API de HU03 implementadas según [AUTENTICACION.md](AUTENTICACION.md), pendientes de revisión/PR; pantallas aún pendientes. No se añade registro público, recuperación de contraseña por correo, pagos, aprobación institucional, eliminación de compras ni los dos módulos administrativos futuros.

Todos los HU siguientes pertenecen al alcance solicitado de la demo. La captura automática tiene vía pendiente y la simulación depende de reglas académicas aún no recibidas. No se convierte esa incertidumbre en promesa ni en reducción silenciosa del alcance. Estimar y contrastar capacidad antes de seleccionar el compromiso del sprint.

## EP01 — Identidad y acceso

### S3-HU01 — Iniciar sesión

Como docente, estudiante o administrativo, quiero iniciar sesión con mi cuenta de demo para acceder a las funciones de mi rol.

Criterios:
- Con credenciales válidas se establece una sesión y se muestra la entrada del módulo autorizado.
- Con credenciales inválidas se informa el fallo sin revelar existencia de cuentas ni datos internos; no se establece sesión.
- Formulario con etiquetas, validación, navegación por teclado y estado de envío; no expone ni registra contraseñas.

Tareas: mockup y campos; contratos compartidos de autenticación; modelo de cuentas/roles y migración; comprobación de credenciales en servidor; interfaz e integración; pruebas positivas y negativas. Víctor backend, Gael interfaz, Kevin verificación.

### S3-HU02 — Acceder según mi rol

Como usuario autenticado, quiero acceder a las funciones de mi rol para trabajar en el módulo correspondiente.

Criterios:
- Docente/estudiante acceden a malla y simulación; administrativo a alta, búsqueda, filtros, detalle y edición de compras.
- Un acceso directo a una página o API ajena al rol se rechaza; ocultar enlaces no basta.
- El cliente no puede concederse un rol en el login ni modificar permisos de su cuenta.
- Los endpoints de salud necesarios para operación se clasifican explícitamente; no contienen información privada.

Tareas: matriz de permisos; autorización API; navegación y rutas protegidas; pruebas anónimas y entre roles. Depende de S3-HU01.

### S3-HU03 — Cerrar sesión y gestionar su expiración

Como usuario, quiero cerrar mi sesión y saber cuándo ha expirado para dejar de usar el sistema con esa identidad.

Criterios:
- Logout invalida la sesión en servidor y el navegador deja de mostrar información protegida almacenada en caché.
- Una sesión vencida no permite nuevas operaciones y muestra un mensaje comprensible.
- Un formulario pendiente no se guarda automáticamente al expirar; se define cómo recuperar el borrador sin mostrarlo a otra cuenta.

Tareas: definir duración y transporte de sesión; endpoint/logout; limpieza de caché y manejo de expiración; pruebas. Depende de S3-HU01/S3-HU02.

## EP02 — Gestión de compras

### S3-HU04 — Recuperar y revisar datos de una compra

Como administrativo, quiero recuperar automáticamente los datos de una compra y revisarlos para evitar transcribir toda la información y detectar errores antes del registro.

Criterios:
- Se usa la vía seleccionada con evidencia en S3-HT03: API o extracción desde imagen; no se promete implementar ambas.
- Los campos recuperados se presentan como candidatos editables; ausencias y fallos visibles, sin inventar valores.
- El usuario corrige/completa los datos y confirma expresamente; extraer no crea una compra por sí solo.
- La demostración acredita procesamiento de muestras ficticias, sin respuestas precargadas presentadas como extracción real.
- Si la vía es imagen, validar formato/tamaño, contemplar archivos ilegibles y definir tratamiento/retención. Si es API, contemplar indisponibilidad, formato inesperado y errores de acceso.

Tareas: contrato de extracción independiente del guardado; adaptador API u OCR/visión; interfaz de entrada/progreso/revisión; casos de extracción parcial y fallo. Depende de S3-HT03 y S3-HT02. Víctor/Gael; Kevin verifica con muestras.

### S3-HU05 — Registrar una compra revisada

Como administrativo, quiero guardar los datos revisados y sus imputaciones para conservar un registro consistente de la compra.

Criterios:
- Campos, formatos y catálogos cumplen el SDD; referencias documentales conservan ceros y texto.
- La suma de imputaciones coincide exactamente con el total; no se acepta una compra parcial.
- Sólo se confirma éxito después de persistir en PostgreSQL; permanece después de reiniciar la aplicación.
- Reintentar una solicitud no duplica el registro; ante fallo se conserva el borrador.

Tareas: esquema/migraciones y restricciones; POST transaccional e idempotencia; formulario de confirmación; integración PostgreSQL y pruebas de rollback. Depende de contratos y base; integración completa con S3-HU04.

### S3-HU06 — Buscar y filtrar compras

Como administrativo, quiero encontrar compras en una tabla mediante búsqueda y filtros para revisar los registros relevantes.

Criterios:
- Búsqueda, filtros, paginación y orden responden al contrato del SDD; los filtros combinados seleccionan las imputaciones correctas.
- Totales documentales e importes imputados se distinguen y no se duplican por relaciones de tablas.
- Tabla con estados de carga, vacío y error, y acceso al detalle.

Tareas: GET de listado, consultas parametrizadas y agregados; tabla/controles; pruebas de filtros y totales. Depende de S3-HU05.

### S3-HU07 — Consultar el detalle de una compra

Como administrativo, quiero consultar una compra y sus imputaciones para revisar qué se registró.

Criterios:
- Muestra datos completos del registro y clasificaciones, con estados de revisión y pago declarado separados.
- Un identificador inexistente produce un resultado comprensible; acceso no autorizado se rechaza.
- Presenta los datos persistidos, no una copia fija del mockup.

Tareas: GET de detalle y respuesta validada; pantalla; casos existente/inexistente/no autorizado. Depende de S3-HU05.

### S3-HU08 — Corregir una compra

Como administrativo, quiero editar un registro para corregir errores sin sobrescribir silenciosamente cambios de otra persona.

Criterios:
- Mantiene las validaciones de alta y actualiza compra/imputaciones de manera atómica.
- Verifica la versión esperada y el contrato de idempotencia del SDD.
- Ante conflicto o fallo conserva el borrador y permite revisar los datos vigentes antes de reintentar.

Tareas: PUT transaccional; edición y conflicto en interfaz; pruebas concurrentes contra PostgreSQL. Depende de S3-HU07.

## EP03 — Exploración y simulación curricular

### S3-HU09 — Visualizar la malla de Nutrición

Como docente o estudiante, quiero ver las asignaturas organizadas por semestre para comprender la estructura del plan de Nutrición y Dietética.

Criterios:
- Contenido cotejado con `Docs/malla-nutricion-y-dietetica-2027.pdf`, con fuente, versión de trabajo y advertencia de demo.
- Presenta correctamente semestres y agrupación de internados de noveno/décimo, sin inventar una secuencia entre rotaciones.
- Acceso por teclado y textos legibles; carga, vacío y error comprensibles.

Tareas: mockup; transcripción revisada; modelo versionado y contrato/API de catálogo; interfaz integrada. Ignacio propone transcripción, Gael revisa y construye interfaz, Víctor catálogo/API, Kevin verifica. Disponibilidad de Ignacio por confirmar.

### S3-HU10 — Consultar prerrequisitos

Como docente o estudiante, quiero consultar los requisitos de una asignatura para comprender qué condiciones deben cumplirse antes de cursarla.

Criterios:
- Reglas trazables a una fuente recibida y verificada; no se deducen por posición, nombre o semestre.
- Reglas AND/OR se muestran comprensiblemente; un requisito desconocido no se interpreta como inexistente.
- El catálogo detecta referencias ausentes y ciclos antes de publicarse.

Tareas: cotejar respuesta de Registro Curricular; modelar/validar reglas; respuesta de catálogo y detalle en interfaz; pruebas. Depende de S3-HT04; el PDF disponible no acredita estos requisitos.

### S3-HU11 — Simular avance académico

Como docente o estudiante, quiero marcar asignaturas como aprobadas y ver cómo afectan la disponibilidad de otras para explorar un escenario académico.

Criterios:
- Simulación explícitamente manual y de demo, sin modificar historial institucional.
- Aplica correctamente requisitos AND/OR; muestra condiciones desconocidas o no soportadas.
- Conserva marcas inconsistentes y las señala; no borra dependientes automáticamente.

Tareas: modelo de simulación, interacción de marcado, leyenda y pruebas de reglas/flujo. Depende de S3-HU09/S3-HU10.

### S3-HU12 — Conservar y reiniciar una simulación

Como usuario de la malla, quiero conservar mi simulación al recargar y reiniciarla cuando lo decida para continuar o explorar otro escenario.

Criterios:
- Persistencia en navegador ligada al plan/versión, sin afirmar sincronización entre dispositivos.
- Reset requiere confirmación; estado corrupto o incompatible se maneja sin romper la pantalla.
- Se define y prueba aislamiento por cuenta o limpieza de simulación al cambiar usuario en el mismo navegador; adaptar el contrato de almacenamiento del SDD antes de implementar, sin filtrar marcas entre usuarios.

Tareas: documentar clave/formato y efecto de logout; persistencia/reset; pruebas de recarga, corrupción y cambio de cuenta. Depende de S3-HU03/S3-HU11. El login añade esta decisión al contrato previo de simulación local.

## Habilitadores: diseño, investigación y base técnica

| ID | Épica | Resultado verificable | Responsable propuesto |
| --- | --- | --- | --- |
| S3-HT01 | EP01/EP02/EP03: registrar una tarea de diseño bajo cada épica | Mockups y especificación de páginas: login, entrada por rol, revisión/alta, listado, detalle/edición y malla. Cada página define objetivo, rol, datos, acciones, navegación, estados y criterio observable. Revisados por Víctor/Kevin; revisión posterior de Gael | Gael |
| S3-HT02 | EP04 | Base reproducible: workspaces, scripts/lockfile reales, frontend/API y PostgreSQL; contratos TypeBox compartidos y mapa de endpoints por historia. Modelo de usuarios/compras e imputaciones con migraciones, claves/restricciones y semillas ficticias separadas. Catálogo académico versionado: decidir representación sin añadir tablas sólo por simetría ni guardar avance de navegador en BD | Víctor; frontend Gael |
| S3-HT03 | EP02 | Investigar captura: coordinar consulta a TI sobre producto Oracle, API, autenticación, campos y acceso de prueba; explorar imágenes ficticias. Entregar comparación y decisión de vía o bloqueo explícito. API sólo con autorización/acceso documentados; para imágenes es extracción OCR/visión, no necesariamente scraping web | Víctor; Andrés recopila antecedentes y Kevin muestras |
| S3-HT04 | EP03 | Coordinar consulta a Registro Curricular por plan, versión, códigos y prerrequisitos; pedir catálogo/exportación mínima o dump autorizado si es la opción disponible. Registrar fuente, respuesta, faltantes y mapeo al catálogo; evitar datos personales/historiales. Tener un dump no equivale a tener autorización ni a validar su contenido | Víctor; Ignacio recopila/coteja, Kevin revisa evidencia |

Los contactos externos están planificados para que Víctor los coordine; el agente no los ejecuta ni envía mensajes. S3-HT03/04 se cierran con evidencia o un bloqueo documentado, pero ese cierre no completa las historias de captura/reglas. Trasladar dumps al entorno de demo e implementar importación masiva no está autorizado por esta investigación: primero acordar formato y tratamiento. No versionar un dump institucional bruto.

Los endpoints de compras/catálogos ya tienen base en el SDD; concretar los de autenticación/extracción y sus respuestas antes de implementar consumidores. Los mockups deben ser ligeros para no consumir la capacidad de construcción disponible. El flujo completo se valida mediante historias, no sólo al revisar imágenes de pantallas.

## EP04 — Entrega y operación de Cenit

| ID | Habilitador | Criterios de aceptación |
| --- | --- | --- |
| S3-HT05 | Construir y verificar el artefacto | Imagen de producción sirve frontend/API; migrador separado, secretos por archivo, roles limitados y esquema `cenit`; cumple `deploy/CD-VM.md`. Health readiness acredita aplicación y BD, no sólo Nginx |
| S3-HT06 | Publicar y desplegar automáticamente | CI con pruebas reales; promoción por PR a `main`, workflow/gates/manifiesto/digest según contrato. La VM sólo aplica releases verificadas; ensayo efectivo, sin `git pull` o builds manuales habituales |
| S3-HT07 | Ensayar recuperación y alternativa local | Evidencia de respaldo previo a migración, persistencia, fallo de entrega y recuperación de aplicación/proxy sin rollback automático de datos. Misma versión identificada disponible localmente; servicios Zableke/Jenkins intactos |

Responsable Víctor, verificación Kevin. Dependen de S3-HT02 e historias integradas; primer ensayo VM martes 13. La infraestructura de preparación no acredita estas entregas.

## EP05 — Base de calidad y validación

| ID | Habilitador / tarea de entrega | Criterios de aceptación |
| --- | --- | --- |
| S3-HT08 | Preparar base de pruebas y matriz de aceptación | Vitest, integración PostgreSQL y Playwright ejecutables; fixtures ficticios, casos negativos y evidencia por historia. Autores prueban sus cambios; Kevin coordina. Incluye roles, transacciones, reintentos, conflictos, extracción parcial y recorrido de malla |
| S3-HT09 | Elaborar y revisar Project Charter | Documento con problema, propósito, objetivos medibles, interesados por confirmar, alcance/exclusiones, entregables, roles, hitos, riesgos/dependencias, restricciones y criterios de éxito. Distingue decisiones de supuestos; revisión de Víctor/Gael, sin firmas ni aprobación institucional inventadas |
| S3-HT10 | Validar y preparar presentación | Ensayo de recorridos completos sobre build de producción, datos ficticios, guion, instrucciones de uso y limitaciones; identificar commit/digest. Informe de defectos y criterios pendientes; congelar miércoles 14 |

Responsable Kevin; Víctor apoya Charter y operación; Andrés puede preparar fixtures/guion y revisión manual con evidencia. S3-HT09 se ubica aquí como documentación para acordar y evaluar la entrega, no como funcionalidad del producto. No trasladar todas las pruebas al final ni contar dos veces las pruebas de cada historia.

## Dependencias, pendientes y siguiente paso

- Elegir captura automática con evidencia, sin asumir disponibilidad de API Oracle.
- Obtener reglas académicas verificables; la fuente gráfica ya permite avanzar en S3-HU09.
- Concretar contrato de login local propuesto, sesión y aislamiento de simulación al cambiar cuenta.
- Estimar y dividir tareas, asignando un dueño y revisor. Capacidad conocida antes del jueves: 24–36 horas nominales entre Víctor/Gael/Kevin, incluyendo reuniones, revisión y correcciones; Andrés/Ignacio sin capacidad confirmada. No extrapolar esta capacidad al resto del sprint.
- No sumar horas disponibles después del jueves para justificar compromisos de la presentación. Si no cabe, registrar brecha y solicitar decisión de capacidad/alcance al líder.

Este documento sustituye el listado previo de historias candidatas para su incorporación al tablero. Las T01–T40 de `PLANIFICACION-MVP.md` se conservan como desglose inicial de referencia; no duplicarlas como nuevas historias ni reutilizar sus HU/HT antiguos como identificadores S3. No se han creado tickets, enviado consultas ni aprobado diseños.

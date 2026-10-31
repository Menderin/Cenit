# Auditoría técnica: Resend vs. Brevo

**Fecha de consulta:** 31 de octubre de 2026  
**Proveedor revisado:** Brevo (la variante “bravo” del nombre de archivo corresponde al nombre solicitado por el usuario).  
**Alcance:** revisión documental y arquitectónica, sin cuentas, credenciales, DNS, notificaciones ni envíos reales.

## 1. Auditoría documental de afirmaciones

| Afirmación previa | Resultado | Evidencia y observaciones |
|---|---|---|
| Resend ofrece 3.000 correos mensuales gratuitos | **Correcta** | El plan Free indica 3.000 emails al mes y $0. [Resend Pricing](https://resend.com/pricing) |
| Resend limita el plan gratuito a 100 correos diarios | **Correcta** | La misma página especifica 100 emails diarios para Free. [Resend Pricing](https://resend.com/pricing) |
| Resend Pro comienza en USD 20/mes | **Correcta, pero incompleta** | Pro comienza en $20/mes para 50.000 emails mensuales y también ofrece escalones superiores. [Resend Pricing](https://resend.com/pricing) |
| Resend conserva datos 30 días | **Correcta para los planes publicados como Free, Pro y Scale** | La tabla comercial indica 30 días. Enterprise ofrece retención flexible. [Resend Pricing](https://resend.com/pricing) |
| Brevo ofrece 300 correos diarios gratuitos | **Correcta** | Brevo Free permite 300 envíos diarios; el límite se restablece diariamente y el saldo no usado no se acumula. [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) |
| Brevo Free tiene un usuario | **Correcta** | El plan Free permite solamente el propietario de la cuenta. [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) |
| Los registros transaccionales de Brevo son indefinidos por defecto | **Correcta, con matices vigentes** | Las reglas indican almacenamiento indefinido si nunca se configura una retención. Se pueden elegir entre 1 y 24 meses, con políticas especiales para cuentas superiores a 10 millones de eventos. [Brevo retention rules](https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews) |
| Ambos tienen API REST | **Correcta** | Resend describe una API REST HTTPS. [Resend API introduction](https://resend.com/docs/api-reference/introduction) Brevo describe una API REST unificada. [Brevo developer overview](https://developers.brevo.com/docs/getting-started) |
| Ambos tienen SMTP | **Correcta** | Resend documenta SMTP. [Resend SMTP](https://resend.com/docs/send-with-smtp) Brevo documenta SMTP relay. [Brevo SMTP integration](https://developers.brevo.com/docs/smtp-integration) |
| Ambos tienen SDK oficial Node.js | **Correcta** | Resend publica guía de Node.js. [Send with Node.js](https://resend.com/docs/send-with-nodejs) Brevo publica SDK Node.js oficial. [Brevo API clients](https://developers.brevo.com/docs/api-clients) |
| Ambos ofrecen SPF, DKIM y DMARC | **Correcta** | Resend documenta dominios, SPF, DKIM y DMARC. [Verified domains](https://resend.com/docs/dashboard/domains/introduction) Brevo documenta autenticación mediante código Brevo, DKIM y DMARC. [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC) |
| Resend ofrece administración de equipos | **Correcta, pero incompleta** | Los equipos pueden administrar dominios, API keys, recursos y exportaciones según permisos. [Managing domains](https://resend.com/docs/dashboard/domains/manage-domains) |
| Resend permite transferir dominios entre equipos | **Correcta, con matiz operativo** | Debe desactivarse el dominio del equipo origen y agregarse al equipo destino; también existe reclamación para dominios asociados a otro equipo. [Managing domains](https://resend.com/docs/dashboard/domains/manage-domains) |
| Brevo permite roles y usuarios | **Correcta para cuentas elegibles** | Brevo ofrece roles predefinidos y permisos; el procedimiento depende del modelo de cuenta y de la fecha de creación. [Add users and permissions](https://help.brevo.com/hc/en-us/articles/360001079439-Add-users-and-assign-permissions-in-Brevo) |
| Brevo permite cambiar el propietario | **Correcta** | Existe una guía oficial para cambiar el propietario de la cuenta. [Change Brevo account owner](https://help.brevo.com/hc/en-us/articles/31626937065618-Change-your-Brevo-account-owner) |

## 2. Comparación técnica actualizada

| Criterio | Resend | Brevo |
|---|---|---|
| Cuota Free | 3.000 emails/mes y 100/día | 300 emails/día |
| Precio de entrada pagado | Desde $20/mes | Según volumen y plan seleccionado |
| API REST | Sí | Sí |
| SMTP | Sí | Sí |
| SDK Node.js | Sí | Sí |
| Autenticación DNS | SPF/DKIM/DMARC | “Brevo code”, SPF/DKIM/DMARC según el flujo y DNS |
| Retención predeterminada | 30 días en los planes publicados | Indefinida si no se configura regla |
| Usuarios Free | Requiere validar límites del equipo y plan | Solo propietario |
| Continuidad | Cambio de equipo y transferencia de dominio documentados | Cambio de propietario y roles documentados |
| Branding Free | Sin limitación relevante encontrada en la documentación revisada | Incluye la etiqueta “Sent with Brevo” |
| Complejidad | Enfoque estrecho y orientado a desarrolladores | Plataforma más amplia; combina marketing, CRM y transaccional |

### Volumen

Los dos límites de Resend Free son simultáneos. No es suficiente contar solamente los 3.000 mensuales: también se deben distribuir como máximo 100 diarios.

Brevo Free permite 300 diarios; la documentación indica que, una vez alcanzado ese límite, hasta 1.000 emails transaccionales adicionales pueden permanecer en cola para reintento y los excedentes ya fuera de la cola no se entregan.

### Costos

Sin estimaciones reales de volumen, no existe evidencia suficiente para afirmar cuál es más barato. Resend comienza claramente en USD 20 mensuales para 50.000 envíos mensuales. Brevo requiere calcular el plan, los datos de facturación vigentes y el volumen efectivo de Cenit.

### Seguridad

Ambos ofrecen HTTPS/API keys, SMTP y autenticación de dominio. Las comparaciones deben considerar:

- Alcance mínimo de API keys.
- Separación por entorno.
- Usuarios, roles y baja de personal.
- Identidad institucional propietaria de la cuenta.
- Protección de secretos.
- Retención y acceso a registros.
- Detección de abuso y alertas.
- Procedimiento de recuperación de cuenta.

## 2.1 Administración y traspaso de cuentas

### Diferencias documentales entre proveedores

| Aspecto | Resend | Brevo |
|---|---|---|
| Estructura | Equipos con miembros y dominios asociados al equipo | Cuenta con propietario, usuarios y roles según plan/modelo |
| Cambio de propietario | El dominio se elimina del equipo origen y se verifica en el equipo destino; también existe un flujo de reclamación para dominios asociados a otro equipo no controlado | Existe un procedimiento oficial para cambiar el propietario de la cuenta |
| Usuarios | La documentación vigente describe equipos, permisos administrativos y dominios compartidos; Cenit debe validar la matriz exacta del plan | Usuarios y roles predefinidos disponibles según plan y modelo de cuenta |
| API keys | La administración se realiza desde el equipo; se deben separar por entorno y revocar las no utilizadas | API keys vinculadas a la cuenta; debe verificarse el alcance disponible según plan y permisos |
| Recuperación | Depende de identidad, miembros del equipo, recuperación de cuenta y custodios definidos por Cenit; no debe asumir propiedad personal | Depende de propietario, usuarios y canales de recuperación oficiales |

Fuentes: [Managing domains](https://resend.com/docs/dashboard/domains/manage-domains), [Change Brevo account owner](https://help.brevo.com/hc/en-us/articles/31626937065618-Change-your-Brevo-account-owner) y [Brevo users and permissions](https://help.brevo.com/hc/en-us/articles/360001079439-Add-users-and-assign-permissions-in-Brevo).

### Procedimiento recomendado para Cenit

1. **Titularidad institucional.**
   - La cuenta debe asociarse a una identidad institucional administrable por la unidad responsable de Cenit, no al correo personal de una persona.
   - Se debe definir una unidad custodio y una dirección institucional de recuperación.
   - El equipo técnico debe mantener únicamente las autorizaciones necesarias; la continuidad no puede depender de un único individuo.

2. **Responsables principal y alternativo.**
   - Nombrar responsable principal y alternativo mediante un registro institucional.
   - Documentar propietario de cuenta, administrador de facturación, administrador técnico y administrador DNS por separado.
   - Incluir fechas de revisión y procedimiento de baja de responsables.

3. **Acceso y recuperación.**
   - Activar MFA fuera de dependencias personales cuando el proveedor lo permita.
   - Mantener códigos de recuperación en el depósito institucional aprobado.
   - No compartir contraseñas ni cuentas personales.
   - Definir quién puede iniciar recuperación, quién aprueba el traspaso y cómo se registra la operación.

4. **API Keys.**
   - Usar una clave por entorno (`desarrollo`, `pruebas`, `producción`) y nunca reutilizar una clave real de producción en mocks o pruebas.
   - Entregar los mínimos permisos disponibles.
   - Almacenar en el gestor de secretos aprobado por Cenit; no en Git, documentación, logs ni variables del cliente.
   - Rotar las claves al ingresar personal, cambiar responsabilidades, detectar exposición o cumplir el calendario institucional.
   - Revocar inmediatamente claves perdidas o expuestas y verificar que no existan usuarios o jobs externos todavía utilizándolas.
   - Conservar auditoría mínima de creación, uso y revocación sin guardar el secreto.

5. **Traspaso.**
   - Inventariar cuenta, plan, facturación, propietario, usuarios, dominios, claves, webhooks y registros DNS.
   - Verificar los dominios antes de cambiar el equipo o propietario; no borrar DNS hasta confirmar la nueva verificación.
   - Transferir primero dominio y cuenta al responsable institucional; después actualiza credenciales, webhooks y responsables técnicos.
   - Para Resend, retirar/eliminar el dominio del equipo origen y verificarlo en el equipo destino según la documentación oficial.
   - Para Brevo, seguir el procedimiento oficial de cambio de propietario y confirmar que roles y usuarios siguen aplicándose.
   - Realizar una prueba de conexión sin enviar mensajes reales y un rollout coordinado.
   - Revocar claves del equipo anterior después de confirmar la operación.

### Riesgos de cuentas personales

- Riesgo de pérdida de acceso al terminar relaciones laborales o académicas.
- Imposibilidad de recuperar facturación, dominio o claves.
- Exposición de secretos personales y falta de auditabilidad.
- Bloqueos por autenticación MFA o proveedor de correo personal.
- Conflicto de propiedad intelectual y transferencia administrativa.

## 2.2 Dominio remitente institucional

No hay evidencia documental suficiente para afirmar que Cenit puede usar `@ucn.cl`, que exista un subdominio delegado ni que cualquier contacto institucional pueda administrar DNS.

### Dependencias pendientes de confirmación externa

| Dato por confirmar | Cómo verificarlo | Interlocutor apropiado |
|---|---|---|
| Responsable real de DNS | Solicitud formal y evidencia de responsabilidades | Unidad institucional que administra DNS de UCN |
| Unidad autorizadora de proveedores externos | Revisión de procedimiento vigente y aprobación escrita | Seguridad TI, gobernanza/proveedores o autoridad designada |
| Uso de dominio raíz | Consulta sobre política de SPF, DKIM, DMARC y reputación | Responsable DNS y seguridad |
| Subdominio dedicado | Confirmar delegación, nomenclatura y registros permitidos | Responsable DNS |
| Aprobación SPF/DKIM/DMARC | Revisión técnica y aprobación de cambio | Responsable DNS + seguridad/deliverability |
| Contacto de reportes DMARC | Validar correo autorizado para recibir reportes | Responsable de seguridad/operaciones |
| Tratamiento institucional | Validar datos, DPA, ubicación y retención | Privacidad, seguridad y compras |

### Estrategia sin dominio institucional autorizado

Si UCN rechaza `ucn.cl` o no autoriza temporalmente un subdominio:

1. No utilizar `@ucn.cl` ni registros DNS sin autorización.
2. Mantener la evaluación exclusivamente mediante mocks.
3. Solicitar un dominio institucional aprobado y delegado para pruebas.
4. Evaluar únicamente como alternativa, si es aplicable, un dominio propio mantenido por la facultad/proyecto, sujeto a autorización institucional y revisión de reputación.
5. No crear remitentes falsos, dominios parecidos ni servicios personales para simular identidad institucional.

## 2.3 Privacidad y protección de datos

### Comparación documental

| Aspecto | Resend | Brevo |
|---|---|---|
| Política y privacidad | Resend publica políticas legales, DPA y listado de subencargados | Brevo publica política de privacidad y recursos GDPR; el enlace contractual definitivo debe verificarse con la cuenta y versión vigente |
| DPA | El DPA publicado incluye cláusulas contractuales estándar y condiciones aplicables según aceptación contractual | Brevo ofrece documentación GDPR/DPA publicada oficialmente, pero la vigencia aplicable y firma/anexo deben confirmarse antes de contratación |
| Subencargados | Resend publica una lista vigente con proveedores externos y ubicación; la página consultada indicaba actualización 27-08-2026 | No se encontró un listado único estable y directamente citable durante esta revisión; validar el listado y actualizaciones aplicables antes de cualquier contratación |
| Ubicación | El listado de subencargados identifica proveedores principalmente en Estados Unidos; no implica por sí mismo una región única de almacenamiento o envío para todos los datos | Debe obtenerse confirmación contractual de regiones aplicables y proveedor de infraestructura |
| Retención del servicio | 30 días en los planes publicados; Enterprise ofrece retención flexible | Logs indefinidos por defecto hasta configurar reglas o aplicar políticas especiales |
| Exportación | Resend permite exportar emails, broadcasts, contactos, segmentos, dominios, logs y API keys, sujetos a permisos administrativos | API/logs pueden exportarse; la disponibilidad exacta por plan debe verificarse en el dashboard |
| Responsabilidad del cliente | Minimizar datos, aplicar controles de acceso, base legítima y borrado; revisar proveedores antes del envío | Configurar retención, permisos, tratamiento y avisos; validar bases y datos enviados |

Fuentes oficiales:

- [Resend Data Processing Addendum](https://resend.com/legal/dpa)
- [Resend Subprocessors, actualización 27-08-2026](https://resend.com/legal/subprocessors)
- [Resend privacy documents](https://resend.com/legal/privacy-policy)
- [Brevo Privacy Policy](https://www.brevo.com/legal/privacypolicy/)
- [Brevo GDPR resources](https://www.brevo.com/company/gdpr/)
- [Brevo retention rules](https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews)

La disponibilidad y redacción exacta del DPA de Brevo no se considera aprobada institucionalmente por este informe. Tampoco se declara residencia chilena, cumplimiento de la UCN ni cumplimiento de una ley específica. La revisión debe incluir contratos de ambas partes, cláusulas de subencargados, ubicación, conservación, borrado, incidentes, auditoría y exportación.

### Responsabilidades de Cenit

- Definir cuáles datos personales son necesarios para enviar una notificación.
- Evitar nombres, rut, textos clínicos o académicos sensibles en asunto, destinatario duplicado, tags y logs.
- Obtener y registrar la base de tratamiento aplicable con el área institucional competente.
- Enviar el mínimo identificador funcional y mantener datos sensibles en Cenit.
- Definir quién puede exportar registros y dónde se almacenarán.
- Definir plazos de borrado coherentes con las políticas de la institución y del proveedor.
- Revisar incidentes, retención, accesos, subencargados y derechos de titulares antes de contratar.

## 2.4 Entregabilidad y operación

| Funcionalidad | Resend | Brevo | Necesidad en Cenit |
|---|---|---|---|
| Rebotes | Clasifica rebotes permanentes/transitorios y permite ver detalles | Documenta eventos de bounce en webhooks y estadísticas | Necesaria para limpiar destinatarios y proteger reputación |
| Quejas spam | Genera eventos de complaint | Documenta evento Spam en webhooks transaccionales | Necesaria para suprimir, investigar y alertar |
| Supresiones | Lista automática y manual por bounce/complaint, API/dashboard/exportación | Gestión de bloqueados y supresiones; confirmar detalle de plan | Necesaria en operación futura |
| Webhooks | Eventos de envío, delivery, bounce, complaint, suppressions y firma | Eventos transaccionales sent, delivered, opened, clicked, soft/hard bounce, spam, etc. | Necesarios para reconciliar estados; no indispensables para elegir proveedor |
| Límites | API 10 RPS por equipo por defecto y cuota mensual/día | Rate API y cuotas de envío por plan | Necesarios para diseñar retry, cola y alertas |
| Diagnóstico | Dashboard de emails, logs, métricas y entregabilidad | Dashboard/logs/eventos transaccionales | Necesario antes de producción |
| Reintentos proveedor | La documentación describe webhook retry/replay | El comportamiento exacto del webhook debe verificarse por configuración/plan | Especificar reintentos propios sin duplicar |

Resend ofrece documentación explícita sobre rebotes [Email bounces](https://resend.com/docs/dashboard/emails/email-bounces.md), quejas y suppressions [Email suppressions](https://resend.com/docs/dashboard/emails/email-suppressions.md) y webhooks [Resend webhooks](https://resend.com/docs/webhooks/introduction) / [event types](https://resend.com/docs/webhooks/event-types).

Brevo ofrece webhooks de eventos transaccionales en [Transactional webhooks](https://developers.brevo.com/docs/transactional-webhooks) y orientación general en [Getting started with webhooks](https://developers.brevo.com/docs/how-to-use-webhooks).

Para la evaluación inicial no son indispensables:

- Integrar webhooks reales.
- Automatizar eliminaciones de usuarios.
- Configurar plantillas y analítica avanzada.
- Crear campañas marketing.
- Medir aperturas/clicks.

Sí son indispensables para una futura implementación:

- Registrar aceptación, entrega, rebote y queja.
- Aplicar suppressions a mensajes futuros.
- Recebir eventos autenticados y deduplicados.
- Monitorizar 429/5xx, timeout y fallos.
- Alertar ante fallos de DNS, claves y cuotas.
- Revisar logs sin incluir secretos ni datos innecesarios.

## 2.5 Volumen y costos mediante escenarios hipotéticos

No hay métricas de uso de Cenit y este informe no las estima ni las inventa. Para proyectar consumo se deben obtener:

- Correos diarios y mensuales promedio.
- Fecha y hora del día de mayor actividad.
- Máximo de correos en un solo día.
- Número de usuarios activos y ritmo esperado de altas/bajas.
- Tipos previstos: recuperación, confirmación, avisos de compras, avisos académicos y administración.
- Cantidad por tipo y destinatario.
- Retries, plantillas duplicadas y usuarios que reciben varias notificaciones por un mismo evento.
- Reenvíos manuales y mensajes fallidos que se intentan nuevamente.
- Crecimiento académico y administrativo anual.

### Supuestos de comparación

Los escenarios siguientes son hipotéticos y sirven únicamente para comparar la geometría de los límites publicados:

| Escenario hipotético | Mensajes/mes | Pico/día | Resend Free | Brevo Free | Implicación |
|---|---:|---:|---|---|---|
| Bajo | 1.500 | 50 | Dentro de ambos límites | Dentro del límite diario | Ambos podrían servir; falta comparar branding, cuentas y privacidad |
| Medio | 2.400 | 100 | En el límite diario y mensual | Dentro de 300/día | Resend tiene poco margen diario; Brevo conserva margen |
| Equivalente diario | 5.000 | 300 | Excede Free | Aproximadamente dentro de 300/día, sujeto al comportamiento de cola | Brevo Free tendría ventaja diaria, pero el volumen mensual no está permitido por Resend Free |
| Crecimiento | 20.000 | 800 | Excede Free | Excede Free | Ambos requieren plan pagado |
| Pico transitorio | 50.000/mes, 1.200/día | 1.200 | Excede límites Free | Excede límites Free | Diseñar cola, cuotas y plan pagado |

Los escenarios no representan métricas reales ni días de actividad de Cenit. Para Resend el límite diario y mensual son simultáneos. Para Brevo el envío diario permite hasta 300; los extras pueden quedar en cola según la política de Free, hasta 1.000 adicionales transaccionales, y los excedentes fuera de la cola no se entregan. Los planes pagados, cantidades exactas y precios regionales deben recalcularse desde el precio vigente al momento de la compra.

### Cálculo económico pendiente

Una proyección de Cenit debe convertir:

```text
mensajes máximos por mes =
  suma de mensajes únicos aceptados +
  reintentos técnicos +
  reenvíos manuales +
  copia/duplicación entre destinatarios
```

El resultado debe compararse con:

- Cuota mensual de Resend.
- Cuota diaria de Resend.
- Cuota diaria de Brevo.
- Cola y política de exceso de Brevo.
- Diferencia entre precios mensuales, USD/CLP y facturación anual.
- Costos por volumen adicional y sobreconsumo.
- Necesidad de usuarios, dominios, soporte y DPA.

## 3. Errores u omisiones del análisis anterior

- El análisis confundía cuota mensual con cuota diaria.
- No mencionaba el contenido de cola/reintento de Brevo al superar 300 diarios.
- No evaluaba la etiqueta “Sent with Brevo” en Free.
- No definía el volumen mensual, diario ni pico esperado de Cenit.
- No comparaba el costo real a volumen previsto.
- No definía la política de retención, exportación o auditoría.
- No analizaba la propiedad institucional y la baja de responsables.
- No verificaba mediante una cuenta real los límites exactos de equipos, planes y roles.
- Trataba la continuidad de equipo como condición resuelta, sin definir el custodio institucional ni el procedimiento de traspaso.
- No incluía riesgos por uso de SPF conflictivo o por cambios simultáneos en el DMARC existente.

## 4. Recomendación final fundamentada

### Evaluación preliminar

Brevo resulta la alternativa inicial más conveniente para Cenit **si el plan gratuito sigue siendo suficiente y la marca institucional lo permite**, debido a su cuota diaria superior, la retención indefinida por defecto y las funciones de continuidad de propietario.

Resend es preferible si:

- El volumen se mantiene por debajo de 100 correos diarios.
- Se exige una interfaz de correo transaccional simple.
- Se evita la marca de Brevo.
- La retención de 30 días cumple el requisito.
- La transferencia de dominios y equipos debe administrarse de forma centralizada.

### Conclusión

No existe evidencia suficiente para cerrar definitivamente la selección. Brevo tiene una ventaja inicial en la cuota y retención, pero Resend puede ser más sencillo y limpio para desarrollo si el volumen es bajo.

La decisión final requiere confirmar:

1. Volumen diario y mensual real.
2. Aceptación de la marca de Brevo en producción.
3. Costos pagados vigentes.
4. Requisitos de retención.
5. Administrador institucional de la cuenta.
6. Administración y recuperación del dominio.

## 5. Requisitos institucionales pendientes

No se debe asumir que `@ucn.cl` puede utilizarse.

Se requiere confirmar:

- Quién administra DNS de `ucn.cl`.
- Qué unidad autoriza proveedores externos.
- Qué proceso se aplica para registrar un proveedor de correo.
- Si se puede delegar un subdominio dedicado.
- Si existe un subdominio disponible y aprobado, por ejemplo:
  - `cenit.ucn.cl`
  - `notificaciones.ucn.cl`
- Quién aprobará SPF, DKIM, DMARC y registro de devolución.
- Quién recibirá reportes DMARC.
- Qué política de privacidad y conservación de datos aplica.
- Qué responsable institucional será propietario de la cuenta.
- Cómo se realizará baja, traspaso o recuperación de acceso.
- Si la institución exige Enterprise, contrato, DPA o ubicación de datos.

### Estrategia DNS recomendada

- Solicitar preferentemente un subdominio dedicado.
- No publicar registros sin revisión conjunta de DNS, seguridad y responsable institucional.
- Añadir inicialmente DMARC con política flexible, por ejemplo `p=none`.
- Revisar reportes antes de elevar a `quarantine` o `reject`.
- Confirmar cualquier CNAME SPF generado por el proveedor, porque DNS moderno puede cambiar respecto a registros TXT tradicionales.
- Conservar un plan de rollback.

## 6. Arquitectura y pruebas propuestas

### Interfaz

```ts
interface NotificationProvider {
  send(message: NotificationMessage): Promise<SendResult>;
}
```

Implementaciones propuestas:

1. `ResendNotificationProvider`
2. `BrevoNotificationProvider`
3. `MockNotificationProvider`

Resultado normalizado:

```ts
type SendResult =
  | {
      accepted: true;
      providerMessageId: string;
      provider: "resend" | "brevo";
    }
  | {
      accepted: false;
      kind:
        | "validation"
        | "authentication"
        | "authorization"
        | "rate_limit"
        | "provider_error"
        | "timeout";
      retryable: boolean;
      providerErrorCode?: string;
      retryAfterMs?: number;
    };
```

### Pruebas simuladas

Se revisaron el runner y el código existente. Existe Vitest configurado en [vitest.config.ts](vitest.config.ts), pero no hay implementación de correo ni archivos que referencien Resend/Brevo. Por tanto, esta evaluación puede preparar pruebas aisladas únicamente después de añadir una frontera de proveedor, sin tocar producción ni credenciales reales.

| Caso evaluado | Resultado esperado | Resultado obtenido | Evidencia | Estado |
|---|---|---|---|---|
| Envío aceptado | Retorna ID normalizado sin reintento | No ejecutado | No existe adaptador ni Mock | **No ejecutado** |
| Datos/destinatario inválido | Error de validación y sin reintento | No ejecutado | No existe implementador ni test | **No ejecutado** |
| Error 401 | Error de autenticación, alerta y sin reintento | No ejecutado | No existe implementador ni test | **No ejecutado** |
| Error 403 | Error de autorización, alerta y sin reintento | No ejecutado | No existe implementador ni test | **No ejecutado** |
| Error 429 | Error reintentable y respeta `Retry-After` | No ejecutado | No existe implementador ni test | **No ejecutado** |
| Error 5xx | Reintento limitado con backoff y jitter | No ejecutado | No existe implementador ni test | **No ejecutado** |
| Timeout | Resultado incierto, reintento limitado | No ejecutado | No existe implementador ni test | **No ejecutado** |
| Reintentos/backoff | Intentos acotados y observables | No ejecutado | No existe implementador ni test | **No ejecutado** |
| Duplicados e idempotencia | Una sola aceptación para una clave estable | No ejecutado | No existe persistencia ni adaptador | **No ejecutado** |
| Fallo parcial | Estado persistido y reconciliable | No ejecutado | No existe workflow ni persistencia | **No ejecutado** |

No se ejecutaron pruebas Mock ni se enviaron correos reales. Tampoco se instalaron dependencias ni se modificó producción en esta tarea.

### Ruta mínima para ejecutar sin credenciales reales

1. Extraer el contrato `NotificationProvider`.
2. Añadir una implementación Mock desacoplada de HTTP.
3. Usar un cliente HTTP reemplazable o server stub local para respuestas 401, 403, 429, 5xx y timeout.
4. Mantener el proveedor real en factories/configuración, pero no llamarlo desde unit tests.
5. Ejecutar únicamente en Vitest y sin variables de entorno reales.
6. Adjuntar salida de Vitest como evidencia; no adjuntar cuerpos de correo ni secretos.

### Idempotencia

Cada operación persistente debe tener una clave estable, por ejemplo:

```text
notification:{tipo}:{entidad}:{evento}:{fecha}
```

- Persistir el estado antes de llamar al proveedor.
- Aplicar un unique constraint sobre la clave.
- Reconciliar por ID del proveedor y estado persistido.
- No asumir que un timeout significó fallo.
- Aislar contenido y datos personales de los logs operativos.

### Política de reintentos

- `401/403`: no reintentar.
- `400/422`: no reintentar, salvo que exista una clasificación explícita y recuperable.
- `429`: respetar `Retry-After`.
- `500/502/503/504`: reintento limitado con backoff exponencial y jitter.
- Timeout: reintento limitado; el proveedor podría haber aceptado el correo.

## 7. Fuentes oficiales consultadas

### Resend

- [Resend Pricing](https://resend.com/pricing)
- [Resend Documentation](https://resend.com/docs)
- [Resend API Introduction](https://resend.com/docs/api-reference/introduction)
- [Send with Node.js](https://resend.com/docs/send-with-nodejs)
- [Send with SMTP](https://resend.com/docs/send-with-smtp)
- [Verified domains](https://resend.com/docs/dashboard/domains/introduction)
- [Add and verify a domain](https://resend.com/docs/add-a-domain)
- [Managing domains](https://resend.com/docs/dashboard/domains/manage-domains)
- [Implement DMARC](https://resend.com/docs/dashboard/domains/dmarc)

### Brevo

- [Brevo Pricing](https://www.brevo.com/pricing/)
- [Brevo Help Center](https://help.brevo.com/)
- [Brevo Developer Documentation](https://developers.brevo.com/)
- [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo transactional email retention](https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews)
- [Brevo API overview](https://developers.brevo.com/docs/getting-started)
- [Brevo API clients](https://developers.brevo.com/docs/api-clients)
- [Brevo SMTP integration](https://developers.brevo.com/docs/smtp-integration)
- [Brevo Node.js SMTP example](https://developers.brevo.com/docs/node-smtp-relay-example)
- [Brevo API rate limits](https://developers.brevo.com/docs/api-limits)
- [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Brevo users and permissions](https://help.brevo.com/hc/en-us/articles/360001079439-Add-users-and-assign-permissions-in-Brevo)
- [Change Brevo account owner](https://help.brevo.com/hc/en-us/articles/31626937065618-Change-your-Brevo-account-owner)
- [Brevo Privacy Policy](https://www.brevo.com/legal/privacypolicy/)
- [Brevo GDPR resources](https://www.brevo.com/company/gdpr/)
- [Brevo transactional webhooks](https://developers.brevo.com/docs/transactional-webhooks)
- [Brevo webhook guide](https://developers.brevo.com/docs/how-to-use-webhooks)
- [Resend Data Processing Addendum](https://resend.com/legal/dpa)
- [Resend Subprocessors](https://resend.com/legal/subprocessors)
- [Resend email suppressions](https://resend.com/docs/dashboard/emails/email-suppressions)
- [Resend webhooks](https://resend.com/docs/webhooks/introduction)
- [Resend bounce handling](https://resend.com/docs/dashboard/emails/email-bounces)

## 8. Checklist para cerrar la tarea en Jira

### Evidencia documental

- [x] Verificar cuotas Free vigentes.
- [x] Verificar API y SDK Node.js.
- [x] Verificar SMTP.
- [x] Verificar autenticación DNS.
- [x] Verificar retención publicada.
- [x] Verificar usuarios, roles y continuidad conocidos.
- [x] Registrar fecha y enlaces oficiales.

### Pendientes que impiden la selección final

- [ ] Confirmar volumen mensual, diario y pico.
- [ ] Confirmar crecimiento esperado.
- [ ] Confirmar retención requerida.
- [ ] Confirmar branding aceptable.
- [ ] Confirmar administrador DNS de `ucn.cl`.
- [ ] Confirmar autorización institucional.
- [ ] Confirmar subdominio dedicado disponible.
- [ ] Confirmar propietario y custodio de la cuenta.
- [ ] Confirmar plan económico vigente.
- [ ] Ejecutar aprobación de seguridad y privacidad.

### Pendientes de implementación

- [ ] Diseñar adaptadores sin tráfico real.
- [ ] Definir contrato `NotificationProvider`.
- [ ] Implementar pruebas Mock.
- [ ] Implementar idempotencia y reintentos.
- [ ] Validar timeout y errores HTTP.
- [ ] Definir logging y secretos.
- [ ] Obtener aprobación independiente antes de integración.

**Estado recomendado de Jira:** cerrar solamente la auditoría documental y de arquitectura; mantener la selección de proveedor pendiente hasta resolver dominio institucional, privacidad, volumen y propietario de cuenta.

## 9. Matriz de cumplimiento Jira

| Criterio | Estado | Evidencia o condición pendiente |
|---|---|---|
| Documentación oficial vigente, cuotas, API/SMTP, remitente/DNS, autenticación, conservación y costos | **Completado con evidencia** | Se verificaron fuentes oficiales y se vinculan en este informe. Los precios pagados y regionales deben volver a consultarse al contratar |
| Control institucional del dominio y traspaso de cuenta/credenciales | **Pendiente de confirmación externa** | No existe evidencia institucional sobre DNS, autorización ni custodio; se describió un procedimiento documental |
| Integración mínima y pruebas simuladas | **Parcialmente completado** | Contrato y casos están definidos; Vitest existe, pero no hay adaptador/proveedor Mock ni resultado ejecutado |
| Recomendación y revisión del responsable | **Pendiente de revisión de Víctor** | La recomendación técnica de este informe es condicionada y no sustituye revisión ni aprobación |
| No activar envíos reales ni funcionalidades | **Completado con evidencia** | Esta tarea no creó cuentas, claves, DNS, mensajes ni modificaciones de producción |
| Administración y traspaso de cuentas | **Parcialmente completado** | Se documentaron funciones y procedimiento recomendados, pero falta confirmación institucional de responsables |
| Privacidad y protección de datos | **Parcialmente completado** | Se enlazaron documentos oficiales y obligaciones de cliente; falta DPA aplicable, ubicación contractual y aprobación institucional |
| Entregabilidad, rebotes, quejas y webhooks | **Completado con evidencia documental; pendiente integración** | Ambas plataformas ofrecen capacidades relevantes, pero Cenit no las ha probado ni integrado |
| Volumen y costos | **Pendiente de confirmación externa** | No existen métricas reales; se incluyen escenarios claramente hipotéticos |

## 10. Recomendación técnica revisada

### Proveedor recomendado desde el punto de vista técnico, condicionado

**Brevo mantiene una ligera ventaja para una evaluación inicial condicionada**, si Cenit acepta su branding gratuito, el plan y la cola vigentes, y supera la revisión institucional de privacidad y retención.

Razones:

- Mayor cuota diaria gratuita.
- Más margen de utilización en escenarios diarios bajos o medios.
- Retención indefinida por defecto, sujeto a políticas y reglas.
- Cambio de propietario de cuenta y roles documentados.

**Resend sería preferible** si se confirma que:

- La operación se mantiene dentro de 100 diarios.
- Brevo no es aceptable por su marca o plataforma generalista.
- La retención de 30 días es suficiente.
- Se requiere una API orientada y administrada de forma principalmente técnica.
- La transferencia de dominios entre equipos resulta suficiente para continuidad.

### Condiciones necesarias para adopción institucional

- Confirmación escrita de quién administra DNS y autoriza proveedores.
- Autorización de subdominio, SPF, DKIM y DMARC.
- Evidencia contractual aplicable sobre DPA, subencargados, ubicación y conservación.
- Volumen real y costo a crecimiento.
- Custodio institucional, responsable alternativo y procedimiento de recuperación.
- Decisión sobre branding de Brevo.
- Pruebas Mock aprobadas y reconciliación de eventos/reintentos.

### No disponibles para cerrar la decisión

- Métricas reales de Cenit.
- Contrato institucional y aprobación de privacidad.
- Política de dominio y DNS.
- Titular institucional de proveedor.
- Ejecución de pruebas aisladas.
- Revisión independiente de Víctor y aprobación formal externa.

La selección no debe presentarse como aprobada por Víctor ni por la UCN hasta que esas evidencias existan.

## 11. Texto listo para Jira

> Se completó la revisión documental ampliada del proveedor gratuito de correo para Cenit. El informe actualizado verifica cuotas, API/SMTP, SDK Node.js, autenticación DNS, retención, administración, privacidad documental, rebotes, quejas, suppressions, webhooks, escenarios hipotéticos de volumen y una matriz Jira. También se revisó el repositorio: existe Vitest, pero no hay adaptador Resend/Brevo ni pruebas Mock de correo; por eso las pruebas propuestas no fueron ejecutadas y se mantienen como pendientes sin modificar producción ni enviar mensajes reales. Falta confirmación externa sobre DNS y autorización de dominio, DPA/ubicación/retención aplicables, métricas reales de Cenit, titular institucional y custodios. Brevo tiene una ventaja inicial condicionada por cuota y retención, pero la recomendación final sigue pendiente de estos requisitos y de revisión de Víctor.

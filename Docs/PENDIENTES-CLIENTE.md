# Pendientes con el cliente

Supuestos con los que Cenit funciona mientras el cliente no los confirme. La aplicación no muestra estos avisos: cuando se confirme o corrija un punto, se ajusta el código y se borra de aquí. Los valores supuestos (cuentas FAMED con su ITEM, UNIDAD, Situación de pago, Tipo documento y Documento) están en [`register.ts`](../packages/contracts/src/purchases/register.ts); las reglas que leen la captura, en [`suggestions.ts`](../packages/contracts/src/purchases/suggestions.ts).

## Compras (Registro de gastos)

Funcionamiento vigente en [Arquitectura › Compras](ARQUITECTURA.md#compras) y sus [sugerencias desde la captura](ARQUITECTURA.md#sugerencias-desde-la-captura).

| Tema | Supuesto en uso | Qué preguntar a Luis |
|---|---|---|
| Fecha | Día en que Luis aprueba y registra. La interfaz identifica de dónde obtiene la fecha sugerida | ¿La Fecha del Excel es el día en que aprueba la SI o la fecha de envío? |
| RUT | Es el del proveedor y viene al final de DETALLE como `_NNNNNNNN` | ¿Ese sufijo es el RUT? ¿Lleva dígito verificador? ¿Hay otra pantalla de Oracle (p. ej. «Visualizar Detalles de Solicitud Interna») que muestre el RUT y se pueda capturar? |
| ITEM | Categoría del gasto según la cuenta (HONORARIOS, ALIMENTACIÓN, PASAJES, ARRIENDOS…) | ¿Qué anota en ITEM y con qué valores? |
| Situación de pago | PENDIENTE al registrar, PAGADO después | ¿Qué valores usa (p. ej. rendido, anulado)? ¿Cómo se entera de que se pagó? |
| UNIDAD | FAMED, CLINICA, CIENCIAS BIOMEDICAS, SALUD PUBLICA; las carreras quedan en FAMED | ¿Cuál es la lista completa? ¿Cómo decide cuál poner? |
| Cuentas FAMED | 24 cuentas de la tabla de la definición; vistas en muestras: 410102, 410103, 420401, 420405 y 420632 | ¿Qué cuentas usa realmente la Facultad? |
| Tipo documento | COTIZACIÓN y HONORARIOS | ¿Hay otros tipos (factura, boleta, rendición)? |
| Documento | Siempre «SISTEMA DE COMPRAS» | ¿Registra en el Excel gastos que no pasen por el sistema de compras? |
| Varias líneas | La cabecera toma la cuenta de cargo de la primera línea | ¿Hay SI con líneas cargadas a cuentas o proyectos distintos? ¿Cómo las anota en el Excel? |
| Proyectos por primer dígito | 3 = aporte público (confirmado por el equipo); 1, 2 y 4 sólo como agrupación interna | ¿Qué significan los proyectos que empiezan por 1, 2 y 4? |
| Inicio | Tablero visual filtrado por unidad; el proyecto se busca arriba y filtra todo, sin gráficos propios | ¿Le basta con buscar un proyecto para ver en qué se gastó, o necesita compararlos entre sí? |

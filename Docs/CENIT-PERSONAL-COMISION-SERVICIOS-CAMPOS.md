# Comisión de Servicios: mapa de campos

## Fuentes y alcance

Este mapa contrasta:

- El levantamiento [CENIT PERSONAL.pdf](CENIT%20PERSONAL.pdf), secciones 3.2 y 6-8.
- [Formulario Comision de Servicios.xlsm](Formulario%20Comision%20de%20Servicios.xlsm).

## Estado de obligatoriedad

Se confirmó el siguiente nivel de obligatoriedad con el levantamiento de Personal y la plantilla:

- Obligatorio: debe tener un valor o una selección válida.
- Condicional: sólo es obligatorio al elegir la opción correspondiente.
- Informativo: se solicita completar, pero no se conoce ni se debe imponer un patrón de validación.

Las reglas de negocio adicionales, formatos y catálogos pendientes no cambian esta clasificación.

## Campos de entrada

### Información general del funcionario

| Campo | Entrada esperada | Confirmación |
| --- | --- | --- |
| Nombre completo | Texto | Obligatorio |
| Cargo | Texto | Obligatorio |
| Unidad o dependencia | Texto | Obligatorio |
| Grupo | Selección: I, II o III | Obligatorio; marcar una sola opción |
| Estamento | Selección: académico; no académico; directivo superior o exclusiva confianza; otro | Obligatorio; marcar una sola opción |
| Estamento «otro» | Texto, sólo si Estamento es «otro» | Condicional; obligatorio al seleccionar «otro» |
| Planta | Selección: oficial; especial; temporal | Obligatorio; marcar al menos una opción |

### Lugar y duración

| Campo | Entrada esperada | Confirmación |
| --- | --- | --- |
| Territorio | Selección entre territorio nacional o extranjero | Obligatorio; marcar una sola opción |
| Lugar dentro de Chile | Texto libre en la plantilla | Condicional; obligatorio si el territorio es nacional |
| Lugar en el extranjero | Texto libre en la plantilla | Condicional; obligatorio si el territorio es extranjero |
| Fecha de inicio | Fecha | Obligatoria |
| Fecha de término | Fecha | Obligatoria |
| Días con pernoctación | Cantidad de días | Condicional; uno de los dos tipos de día debe completarse |
| Días sin pernoctación | Cantidad de días | Condicional; uno de los dos tipos de día debe completarse |
| Total de días | Cantidad calculada | Obligatorio como resultado; suma con valor mayor que cero |
| Costo total del viático | Monto | Obligatorio |
| Moneda del viático | CLP o USD | Obligatorio; muestra la moneda correspondiente al monto |

### Código presupuestario

La estructura coincide con la identificada para Compras, pero sus cuentas válidas, catálogos y reglas no fueron validados para Comisión de Servicios.

| Campo | Entrada esperada | Confirmación |
| --- | --- | --- |
| Institución | Código institucional | Obligatorio en una fila que tenga cualquier dato presupuestario; celda de cuatro caracteres en la plantilla |
| Organización | Código de organización | Obligatorio en una fila que tenga cualquier dato presupuestario; celda de dos caracteres en la plantilla |
| Unidad | Código de unidad | Obligatorio en una fila que tenga cualquier dato presupuestario; celda de seis caracteres en la plantilla |
| Proyecto | Código de proyecto | Obligatorio en una fila que tenga cualquier dato presupuestario; celda de ocho caracteres en la plantilla |
| Porcentaje de financiamiento | Porcentaje | Obligatorio en una fila presupuestaria; puede haber varias filas cuya suma debe ser exactamente 100 % |

Si una fila tiene un campo presupuestario completado, toda la fila debe estar completa. La comisión puede tener varios códigos presupuestarios financiados por distintas fuentes; entre todas las filas deben cubrir el 100 % del gasto.

### Evento

Esta sección corresponde a comisiones asociadas a un evento, actividad o reunión.

| Campo | Entrada esperada | Confirmación |
| --- | --- | --- |
| Nombre del evento | Texto | Informativo; debe completarse cuando corresponda, sin patrón de validación distinto de texto |
| Institución organizadora | Texto | Informativo; debe completarse cuando corresponda, sin patrón de validación distinto de texto |
| Nombre del trabajo o ponencia | Texto | Informativo; debe completarse cuando corresponda, sin patrón de validación distinto de texto |
| Proyecto asociado al trabajo | Texto o código | Informativo; debe completarse cuando corresponda, sin patrón de validación confirmado |
| Otros antecedentes u observaciones | Texto libre | Informativo; debe completarse cuando aporte antecedentes, sin patrón de validación distinto de texto |

### Descripción de la comisión

| Campo | Entrada esperada | Confirmación |
| --- | --- | --- |
| Descripción de la actividad | Texto | Informativo; se solicita completar cuando corresponda y no tiene un patrón de validación identificado |

## Fórmulas y cálculos pendientes

El XLSM incluye cálculos en su hoja auxiliar oculta. Se describen aquí para cotejo, pero sus valores y fórmulas requieren validación con Personal antes de implementarse.

- Total de días: confirmado como suma de `días con pernoctación * 1 + días sin pernoctación * 0,5`, sin entrada manual; al menos un tipo de día debe marcarse y el resultado debe ser mayor que cero.
- Días totales: posible fórmula con los campos de días con y sin pernoctación.
- Costo total del viático: la hoja auxiliar calcula importes nacionales según grupo y días completos o medios, y importes en el extranjero con una tabla de factores por país y tasas auxiliares en dólares.
- Porcentajes de financiamiento: todas las filas completas deben sumar 100 %. Una fila incompleta impide guardar o generar el formulario.
- Importes nacionales observados en la hoja auxiliar: 55.000 / 16.500 para Grupo I; 50.000 / 15.000 para Grupos II y III en un supuesto diario/medio día. Estos valores deben tratarse como datos auxiliares, no como normativa validada.
- Tasas auxiliares extranjeras observadas: 200 dólares por día completo y 150 dólares por medio día. También requieren validación.

La hoja auxiliar debe revisarse sólo para identificar supuestos y referencias. Sus cálculos pueden implementar una tabla histórica o vigencia, y no se toman como reglas aprobadas.

La plantilla visible contiene un ejemplo completado. El archivo no expone validaciones de obligatoriedad ni fórmulas de cálculo en la hoja visible; el estado actual de los cálculos y fechas no permite dar por correcta la transferencia automática de sus resultados.

## Datos del ejemplo

La plantilla incluye un ejemplo completado, pero no debe copiarse ni modelarse como información real.

No se registrarán en este mapa ni en el contrato:

- Nombre, cargo, unidad, grupo, estamento, planta o identificación personal.
- Lugares, fechas, montos, eventos, ponencias, proyectos, códigos presupuestarios u observaciones del ejemplo.

## Secciones de firmas

| Autorización | Estado |
| --- | --- |
| Jefe de Unidad | Espacio confirmado; puede corresponder como una de las firmas requeridas según el tipo de comisión |
| Decano/a de la Facultad de Medicina | Espacio confirmado; puede corresponder como una de las firmas requeridas según el tipo de comisión |
| VRA, VAEA o VRS, según corresponda | Espacio confirmado; puede corresponder como una de las firmas requeridas según el tipo de comisión. La plantilla presenta la selección impresa de VRA/VAEA/VRS junto con el rótulo de firma correspondiente |

La comisión debe contener al menos dos firmas. Los firmantes concretos dependen del tipo de comisión y deben determinarse por esa clasificación, sin asumir un orden fijo.

Los espacios deben conservarse en el PDF. No se ha validado si requieren nombre, cargo, firma manuscrita, fecha, resultado u aprobación electrónica.

## Preguntas pendientes

1. ¿SCRUM-10 confirma o modifica los campos encontrados en el levantamiento y la plantilla?
2. ¿Qué formatos requieren lugar, proyecto, institución organizadora, evento y código presupuestario, además de los formatos ya establecidos?
3. ¿Cuándo se usa la sección de evento y cuándo la descripción libre?
4. ¿Cómo se calcula el costo total del viático y qué vigencia tienen los importes y factores auxiliares observados?
5. ¿Qué combinación concreta de firmantes corresponde a cada tipo de comisión, siempre que sean al menos dos?
6. ¿El orden de las firmas debe conservarse o la aprobación puede registrarse sin un orden fijo?
7. ¿Qué campos deben conservarse al generar el PDF y qué datos se registran para consulta histórica?

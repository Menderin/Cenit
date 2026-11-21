import { Type, type Static } from '@sinclair/typebox';
import { headerFields } from './extraction.js';

// Lecturas de Inicio por año y por proyecto. Los montos suman el importe de los ítems (cadenas exactas en CLP);
// los nombres vienen del catálogo oficial y, si el código no está, del centro de costos guardado en la compra.
const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const nullable = <T extends Parameters<typeof Type.Union>[0][number]>(schema: T) => Type.Union([schema, Type.Null()]);
const uuid = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' });
const amount = Type.String({ pattern: '^(0|[1-9][0-9]*)$' });
const count = Type.Integer({ minimum: 0 });
export const PurchaseYearSchema = Type.String({ pattern: '^[0-9]{4}$' });
export const PurchaseCodeSchema = Type.String({ minLength: 1, maxLength: 255, pattern: '\\S' });
const name = Type.String({ minLength: 1, maxLength: 1000 });
const years = Type.Array(Type.Integer({ minimum: 1, maximum: 9999 }), { uniqueItems: true, maxItems: 10000 });
const month = object({ month: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }), count, amount });

// `months`: importe de enero a diciembre del año pedido (sólo en el gasto por proyecto de Inicio).
export const PurchaseBreakdownSchema = object({ code: nullable(PurchaseCodeSchema), name: nullable(name), count, amount, months: Type.Optional(Type.Array(amount, { minItems: 12, maxItems: 12 })) });
export type PurchaseBreakdown = Static<typeof PurchaseBreakdownSchema>;

export const PurchaseYearQuerySchema = object({ year: Type.Optional(PurchaseYearSchema) });
export type PurchaseYearQuery = Static<typeof PurchaseYearQuerySchema>;

export const PurchaseProjectOptionSchema = object({
  code: PurchaseCodeSchema, name: nullable(name), units: Type.Array(PurchaseCodeSchema, { maxItems: 500 }), inCatalog: Type.Boolean(), count, amount,
});
export type PurchaseProjectOption = Static<typeof PurchaseProjectOptionSchema>;
export const PurchaseProjectsResponseSchema = object({ data: object({ year: PurchaseYearSchema, projects: Type.Array(PurchaseProjectOptionSchema, { maxItems: 5000 }) }) });
export type PurchaseProjectsResponse = Static<typeof PurchaseProjectsResponseSchema>;

export const PurchaseProjectParamsSchema = object({ code: PurchaseCodeSchema });
export const PurchaseProjectSummaryResponseSchema = object({ data: object({
  code: PurchaseCodeSchema, name: nullable(name), inCatalog: Type.Boolean(), year: PurchaseYearSchema, availableYears: years,
  // Compras con al menos un ítem del proyecto y suma de esos ítems; los ítems sin importe se informan aparte.
  count, amount, lineCount: count, linesWithoutAmount: count, yearLineTotal: amount, providerCount: count,
  units: Type.Array(PurchaseBreakdownSchema, { maxItems: 500 }),
  accounts: Type.Array(PurchaseBreakdownSchema, { maxItems: 500 }),
  providers: Type.Array(object({ name: nullable(name), count, amount }), { maxItems: 8 }),
  monthlyTotals: Type.Array(month, { maxItems: 12 }),
  purchases: Type.Array(object({
    id: uuid, requestNumber: headerFields.requestNumber, sentDate: headerFields.sentDate, description: headerFields.description,
    provider: nullable(name), accountingCode: nullable(PurchaseCodeSchema), accountName: nullable(name), documentType: nullable(Type.String({ minLength: 1, maxLength: 255 })),
    amount: nullable(amount),
  }), { maxItems: 10 }),
  lastSentDate: nullable(headerFields.sentDate),
}) });
export type PurchaseProjectSummaryResponse = Static<typeof PurchaseProjectSummaryResponseSchema>;
export type PurchaseProjectSummary = PurchaseProjectSummaryResponse['data'];

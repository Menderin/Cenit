import { Type, type Static, type TSchema } from '@sinclair/typebox';

// Contrato provisional de Bienes: inventario, entregas, préstamos y responsables.
// Campos, obligatoriedad y documentos siguen pendientes de validación con la Facultad.
const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const uuid = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' });
const stamp = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' });
const day = Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$' });
const text = (maxLength = 255) => Type.String({ minLength: 1, maxLength, pattern: '\\S' });
const optional = (maxLength = 255) => nullable(text(maxLength));
const version = Type.Integer({ minimum: 1, maximum: 2147483647 });
const folio = Type.String({ pattern: '^\\d{3,}/\\d{4}$' });

export const assetKinds = ['equipo_computacional', 'equipo', 'mueble', 'maquinaria', 'construccion', 'accesorio', 'otro'] as const;
export const AssetKindSchema = Type.Union(assetKinds.map(kind => Type.Literal(kind)));
export type AssetKind = Static<typeof AssetKindSchema>;
// Prioridad al calcular: vencido > préstamo > por revisar > asignado > sin responsable.
export const assetStatuses = ['asignado', 'prestamo', 'vencido', 'revisar', 'sin_responsable'] as const;
export const AssetStatusSchema = Type.Union(assetStatuses.map(status => Type.Literal(status)));
export type AssetStatus = Static<typeof AssetStatusSchema>;

export const PersonInputSchema = object({ name: text(200), rut: optional(20), unit: optional(), position: optional() });
export type PersonInput = Static<typeof PersonInputSchema>;
export const PersonSchema = object({
  id: uuid, ...PersonInputSchema.properties, active: Type.Boolean(), inactiveSince: nullable(day), assetCount: Type.Integer({ minimum: 0 }),
});
export type Person = Static<typeof PersonSchema>;
export const PersonStatusSchema = object({ active: Type.Boolean() });
export const PeopleQuerySchema = object({
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  status: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('active'), Type.Literal('review'), Type.Literal('inactive')])),
});
export type PeopleQuery = Static<typeof PeopleQuerySchema>;
export const PeopleResponseSchema = object({ data: Type.Array(PersonSchema) });
export const PersonResponseSchema = object({ data: PersonSchema });

// Datos propios del bien. Responsable y ubicación cambian sólo mediante movimientos.
export const AssetDataSchema = object({
  kind: AssetKindSchema, quantity: Type.Integer({ minimum: 1, maximum: 9999 }), description: text(500),
  inventoryNumber: optional(60), brand: optional(), model: optional(), serialNumber: optional(120),
  furnitureType: optional(), material: optional(), dimensions: optional(), area: optional(60),
  systemPart: Type.Boolean(), wallMounted: Type.Boolean(), assembled: Type.Boolean(),
  notes: optional(1000), purchaseId: nullable(uuid),
});
export type AssetData = Static<typeof AssetDataSchema>;
export const CreateAssetSchema = object({
  operationId: uuid, ...AssetDataSchema.properties, location: text(), custodianId: nullable(uuid), registeredOn: day,
});
export type CreateAsset = Static<typeof CreateAssetSchema>;
export const UpdateAssetSchema = object({ expectedVersion: version, ...AssetDataSchema.properties });
export type UpdateAsset = Static<typeof UpdateAssetSchema>;
export const AssetLocationSchema = object({ expectedVersion: version, location: text(), occurredOn: day, note: optional(500) });
export type AssetLocation = Static<typeof AssetLocationSchema>;

const PersonRefSchema = object({ id: uuid, name: Type.String(), unit: nullable(Type.String()), active: Type.Boolean() });
const LoanRefSchema = object({ id: uuid, number: folio, borrowerName: Type.String(), loanedOn: day, dueOn: nullable(day) });
export const AssetListItemSchema = object({
  id: uuid, code: Type.String({ pattern: '^BN-\\d{4,}$' }), inventoryNumber: nullable(Type.String()), kind: AssetKindSchema,
  description: Type.String(), brand: nullable(Type.String()), model: nullable(Type.String()), serialNumber: nullable(Type.String()),
  material: nullable(Type.String()), dimensions: nullable(Type.String()), quantity: Type.Integer({ minimum: 1 }),
  location: Type.String(), custodian: nullable(PersonRefSchema), status: AssetStatusSchema, loan: nullable(LoanRefSchema),
});
export type AssetListItem = Static<typeof AssetListItemSchema>;
export const AssetListQuerySchema = object({
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })), kind: Type.Optional(AssetKindSchema), status: Type.Optional(AssetStatusSchema),
  custodianId: Type.Optional(uuid), available: Type.Optional(Type.Literal('loan')),
  page: Type.Integer({ minimum: 1, maximum: 100000 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
});
export type AssetListQuery = Static<typeof AssetListQuerySchema>;
export const AssetListResponseSchema = object({
  data: Type.Array(AssetListItemSchema),
  pagination: object({ page: Type.Integer({ minimum: 1 }), pageSize: Type.Integer({ minimum: 1 }), total: Type.Integer({ minimum: 0 }) }),
});
export type AssetListResponse = Static<typeof AssetListResponseSchema>;

export const assetEventKinds = ['alta', 'entrega', 'prestamo', 'devolucion', 'ubicacion', 'edicion'] as const;
export const AssetEventSchema = object({
  id: uuid, kind: Type.Union(assetEventKinds.map(kind => Type.Literal(kind))), occurredOn: day, createdAt: stamp, createdBy: Type.String(),
  person: nullable(Type.String()), locationFrom: nullable(Type.String()), locationTo: nullable(Type.String()), note: nullable(Type.String()),
  document: nullable(object({ type: Type.Union([Type.Literal('delivery'), Type.Literal('loan')]), id: uuid, number: folio })),
});
export type AssetEvent = Static<typeof AssetEventSchema>;
export const AssetDetailSchema = object({
  ...AssetListItemSchema.properties, ...AssetDataSchema.properties, registeredOn: day, version, createdAt: stamp,
  custodian: nullable(PersonSchema), purchase: nullable(object({ id: uuid, requestNumber: Type.String(), description: Type.String() })),
  events: Type.Array(AssetEventSchema),
});
export type AssetDetail = Static<typeof AssetDetailSchema>;
export const AssetResponseSchema = object({ data: AssetDetailSchema });
export const AssetParamsSchema = object({ id: uuid });

export const AssetSummarySchema = object({ data: object({
  total: Type.Integer({ minimum: 0 }), onLoan: Type.Integer({ minimum: 0 }), overdue: Type.Integer({ minimum: 0 }),
  review: Type.Integer({ minimum: 0 }), unassigned: Type.Integer({ minimum: 0 }),
  deliveries: Type.Integer({ minimum: 0 }), loans: Type.Integer({ minimum: 0 }), people: Type.Integer({ minimum: 0 }), peopleReview: Type.Integer({ minimum: 0 }),
  locations: Type.Array(Type.String(), { maxItems: 200 }),
}) });
export type AssetSummary = Static<typeof AssetSummarySchema>['data'];

// Un ítem de entrega es un bien del inventario o un bien nuevo que se registra al guardar (p. ej., un gasto controlado).
export const NewDeliveryAssetSchema = object({
  kind: AssetKindSchema, quantity: Type.Integer({ minimum: 1, maximum: 9999 }), description: text(500), brand: optional(), serialNumber: optional(120),
});
export const DeliveryItemInputSchema = Type.Union([object({ assetId: uuid }), object({ newAsset: NewDeliveryAssetSchema })]);
export type DeliveryItemInput = Static<typeof DeliveryItemInputSchema>;
export const CreateDeliverySchema = object({
  operationId: uuid, receiverId: uuid, deliveredOn: day, reason: text(500), destination: optional(),
  giverName: text(200), giverPosition: optional(), giverUnit: optional(), notes: optional(1000),
  items: Type.Array(DeliveryItemInputSchema, { minItems: 1, maxItems: 30 }),
});
export type CreateDelivery = Static<typeof CreateDeliverySchema>;
const DocumentItemSchema = object({
  assetId: uuid, code: Type.String(), quantity: Type.Integer({ minimum: 1 }), kind: AssetKindSchema, description: Type.String(),
  brand: nullable(Type.String()), model: nullable(Type.String()), serialNumber: nullable(Type.String()),
  material: nullable(Type.String()), dimensions: nullable(Type.String()),
});
export type DocumentItem = Static<typeof DocumentItemSchema>;
export const DeliverySchema = object({
  id: uuid, number: folio, deliveredOn: day, receiver: PersonSchema, reason: Type.String(), destination: nullable(Type.String()),
  giverName: Type.String(), giverPosition: nullable(Type.String()), giverUnit: nullable(Type.String()), notes: nullable(Type.String()),
  items: Type.Array(DocumentItemSchema), createdAt: stamp, createdBy: Type.String(),
});
export type Delivery = Static<typeof DeliverySchema>;
export const DeliveryResponseSchema = object({ data: DeliverySchema });
export const DeliveryListItemSchema = object({
  id: uuid, number: folio, deliveredOn: day, receiverName: Type.String(), receiverUnit: nullable(Type.String()),
  reason: Type.String(), itemCount: Type.Integer({ minimum: 0 }), items: Type.Array(Type.String(), { maxItems: 3 }),
});
export type DeliveryListItem = Static<typeof DeliveryListItemSchema>;
export const DocumentListQuerySchema = object({
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  status: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('abierto'), Type.Literal('activo'), Type.Literal('vencido'), Type.Literal('devuelto')])),
  page: Type.Integer({ minimum: 1, maximum: 100000 }), pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
});
export type DocumentListQuery = Static<typeof DocumentListQuerySchema>;
const pagination = object({ page: Type.Integer({ minimum: 1 }), pageSize: Type.Integer({ minimum: 1 }), total: Type.Integer({ minimum: 0 }) });
export const DeliveryListResponseSchema = object({ data: Type.Array(DeliveryListItemSchema), pagination });
export type DeliveryListResponse = Static<typeof DeliveryListResponseSchema>;

export const loanStatuses = ['activo', 'vencido', 'devuelto'] as const;
export const LoanStatusSchema = Type.Union(loanStatuses.map(status => Type.Literal(status)));
export type LoanStatus = Static<typeof LoanStatusSchema>;
export const CreateLoanSchema = object({
  operationId: uuid, borrowerId: uuid, loanedOn: day, dueOn: nullable(day), location: optional(),
  authorizerName: text(200), authorizerUnit: optional(), notes: optional(1000),
  assetIds: Type.Array(uuid, { minItems: 1, maxItems: 10, uniqueItems: true }),
});
export type CreateLoan = Static<typeof CreateLoanSchema>;
export const ReturnLoanSchema = object({ returnedOn: day, note: optional(500) });
export type ReturnLoan = Static<typeof ReturnLoanSchema>;
export const LoanSchema = object({
  id: uuid, number: folio, loanedOn: day, dueOn: nullable(day), borrower: PersonSchema, location: nullable(Type.String()),
  authorizerName: Type.String(), authorizerUnit: nullable(Type.String()), notes: nullable(Type.String()),
  returnedOn: nullable(day), returnNote: nullable(Type.String()), status: LoanStatusSchema,
  items: Type.Array(DocumentItemSchema), createdAt: stamp, createdBy: Type.String(),
});
export type Loan = Static<typeof LoanSchema>;
export const LoanResponseSchema = object({ data: LoanSchema });
export const LoanListItemSchema = object({
  id: uuid, number: folio, loanedOn: day, dueOn: nullable(day), returnedOn: nullable(day), status: LoanStatusSchema,
  borrowerName: Type.String(), borrowerUnit: nullable(Type.String()),
  items: Type.Array(object({ assetId: uuid, code: Type.String(), description: Type.String(), brand: nullable(Type.String()), model: nullable(Type.String()) }), { maxItems: 10 }),
});
export type LoanListItem = Static<typeof LoanListItemSchema>;
export const LoanListResponseSchema = object({ data: Type.Array(LoanListItemSchema), pagination, counts: object({ activo: Type.Integer({ minimum: 0 }), vencido: Type.Integer({ minimum: 0 }), devuelto: Type.Integer({ minimum: 0 }) }) });
export type LoanListResponse = Static<typeof LoanListResponseSchema>;

import { Type, type Static } from '@sinclair/typebox';

// Contrato provisional: conserva las entradas del formulario sin guardar ni calcular viáticos.
const text = (maxLength = 500) => Type.String({ maxLength });
const fundingRow = Type.Object({
  institution: text(32), organization: text(32), unit: text(32), project: text(32), percent: text(16),
}, { additionalProperties: false });

export const ServiceCommissionSchema = Type.Object({
  name: text(500), position: text(500), unit: text(500),
  group: Type.Union([Type.Literal(''), Type.Literal('I'), Type.Literal('II'), Type.Literal('III')]), category: Type.Union([Type.Literal(''), Type.Literal('academico'), Type.Literal('no_academico'), Type.Literal('directivo'), Type.Literal('otro')]), categoryOther: text(500),
  plant: Type.Union([Type.Literal(''), Type.Literal('oficial'), Type.Literal('especial'), Type.Literal('temporal')]), territory: Type.Union([Type.Literal(''), Type.Literal('nacional'), Type.Literal('extranjero')]), place: text(500),
  from: text(10), to: text(10), daysWithStay: text(16), daysWithoutStay: text(16), totalDays: text(16),
  allowance: text(32), currency: Type.Union([Type.Literal(''), Type.Literal('CLP'), Type.Literal('USD')]), funding: Type.Tuple([fundingRow, fundingRow]),
  activity: Type.Union([Type.Literal('evento'), Type.Literal('descripcion')]), eventName: text(500), eventOrganizer: text(500), eventWork: text(2000),
  eventProject: text(500), eventNotes: text(500), description: text(2000),
}, { additionalProperties: false });
export type ServiceCommission = Static<typeof ServiceCommissionSchema>;

export const ServiceCommissionErrorsSchema = Type.Object({ error: Type.Object({
  code: Type.Literal('VALIDATION_ERROR'), message: Type.String(), requestId: Type.String(),
  fields: Type.Record(Type.String(), Type.String()),
}, { additionalProperties: false }) }, { additionalProperties: false });

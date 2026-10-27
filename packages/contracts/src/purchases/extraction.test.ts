import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ErrorResponseSchema } from '../common/index.js';
import { ExtractionResponseSchema, ExtractionReviewDraftSchema, EXTRACTION_LIMITS, validateInputMetadata, validateExtractionResponse, validateReviewDraft, createReviewDraft } from './index.js';
import { recoveredExample, partialExample, ambiguousExample, extractionExamples, extractionErrorExamples } from './examples.js';
describe('contrato de extracción, sin OCR ni persistencia', () => {
  it('conserva ejemplos anteriores y verifica señales/estado del formato de captura', () => {
    const response = structuredClone(recoveredExample);
    response.data.captureLayout = { status: 'compatible', signals: ['request_title', 'header_fields', 'line_section', 'eight_column_table'] };
    expect(validateExtractionResponse(response)).toEqual([]);
    response.data.captureLayout = { status: 'partial', signals: ['request_title', 'header_fields'] };
    expect(validateExtractionResponse(response)).toEqual([]);
    response.data.captureLayout = { status: 'compatible', signals: ['request_title'] };
    expect(validateExtractionResponse(response).length).toBeGreaterThan(0);
    response.data.captureLayout = { status: 'partial', signals: ['line_section', 'eight_column_table'] };
    expect(validateExtractionResponse(response)).toEqual([]);
    response.data.captureLayout = { status: 'partial', signals: ['request_title', 'request_title'] };
    expect(validateExtractionResponse(response).length).toBeGreaterThan(0);
  });
  it('valida fixtures de candidatos y todos los errores futuros', () => {
    for (const example of extractionExamples) {
      expect(Value.Check(ExtractionResponseSchema, example.response)).toBe(true);
      expect(validateExtractionResponse(example.response)).toEqual([]);
      expect(validateReviewDraft(createReviewDraft(example.response))).toEqual([]);
    }
    extractionErrorExamples.forEach(example => expect(Value.Check(ErrorResponseSchema, example.body)).toBe(true));
  });
  it('admite regiones opcionales sólo para candidatos existentes dentro de la imagen orientada', () => {
    const response = structuredClone(recoveredExample);
    const region = { path: '/header/description', x: .1, y: .2, width: .8, height: .3 };
    response.data.regions = [region];
    expect(validateExtractionResponse(response)).toEqual([]);
    for (const change of [{ x: -.1 }, { width: 0 }, { width: 1 }, { path: '/lines/100/provider' }, { path: '/administrative/paymentSituation' }]) {
      response.data.regions = [{ ...region, ...change }];
      expect(validateExtractionResponse(response).length).toBeGreaterThan(0);
    }
    response.data.regions = [];
    expect(validateExtractionResponse(response)).toEqual([]);
  });
  it('rechaza estados contradictorios, propiedades extra e incidencias sin campo', () => {
    const input = structuredClone(partialExample);
    Object.assign(input.data.lines[0]!.provider, { value: 'Inventado' });
    expect(validateExtractionResponse(input).length).toBeGreaterThan(0);
    expect(Value.Check(ExtractionResponseSchema, { ...recoveredExample, saved: true })).toBe(false);
    const ambiguous = structuredClone(ambiguousExample); ambiguous.data.issues = [];
    expect(validateExtractionResponse(ambiguous).length).toBeGreaterThan(0);
    const unknown = structuredClone(recoveredExample); unknown.data.issues.push({ path: '/header/nonexistent', code: 'MISSING_FIELD', message: 'Falta' });
    expect(validateExtractionResponse(unknown).length).toBeGreaterThan(0);
  });
  it('conserva líneas, proveedores, ceros e impuesto cero', () => {
    const draft = createReviewDraft(recoveredExample);
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]!.provider).not.toBe(draft.lines[1]!.provider);
    expect(draft.lines[0]!.projectCode).toBe('00000000');
    expect(draft.header.requestNumber).toBe('000125'); expect(draft.header.taxAmount).toBe('0');
    expect(draft.administrative.bi).toBeNull(); expect(draft.administrative.paymentSituation).toBeNull();
  });
  it('borrador independiente, correcciones manuales y ausencia explícita', () => {
    const before = structuredClone(recoveredExample), draft = createReviewDraft(recoveredExample);
    draft.lines[0]!.provider = 'Proveedor revisado'; draft.header.totalAmount = null;
    draft.administrative.bi = 'S/N';
    expect(validateReviewDraft(draft)).toEqual([]); expect(recoveredExample).toEqual(before);
    expect(Value.Check(ExtractionReviewDraftSchema, { ...draft, save: true })).toBe(false);
  });
  it('valida calendario, hora y montos sin coerción ni redondeo', () => {
    for (const date of ['2024-02-29', '2000-02-29', '2026-10-12']) {
      const draft = createReviewDraft(recoveredExample); draft.header.sentDate = date; expect(validateReviewDraft(draft)).toEqual([]);
    }
    for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '12/10/2026']) {
      const draft = createReviewDraft(recoveredExample); draft.header.sentDate = date; expect(validateReviewDraft(draft).length).toBeGreaterThan(0);
    }
    const response = structuredClone(recoveredExample); response.data.header.sentDate.value = '2026-02-30';
    expect(validateExtractionResponse(response).length).toBeGreaterThan(0);
    for (const amount of ['-1', '1.5', '200.000', ' 200', '01']) {
      const draft = createReviewDraft(recoveredExample); draft.header.totalAmount = amount; expect(validateReviewDraft(draft).length).toBeGreaterThan(0);
    }
    const draft = createReviewDraft(recoveredExample); draft.header.sentTime = '24:00:00';
    expect(validateReviewDraft(draft).length).toBeGreaterThan(0);
  });
  it('límites de bytes, MIME y producto de dimensiones se validan juntos', () => {
    const base = recoveredExample.data.input;
    expect(validateInputMetadata({ ...base, bytes: EXTRACTION_LIMITS.maxBytes, width: 5000, height: 4000 })).toEqual([]);
    for (const change of [{ bytes: 0 }, { bytes: EXTRACTION_LIMITS.maxBytes + 1 }, { mimeType: 'application/pdf' }, { width: 0 }, { width: 5001, height: 4000 }, { height: 1.5 }, { url: 'remote' }]) expect(validateInputMetadata({ ...base, ...change }).length).toBeGreaterThan(0);
    const response = structuredClone(recoveredExample); response.data.input.width = 5001; response.data.input.height = 4000;
    expect(validateExtractionResponse(response).length).toBeGreaterThan(0);
  });
  it('limita textos y líneas sin truncar el origen ni aceptar arreglos extra', () => {
    const draft = createReviewDraft(recoveredExample);
    draft.header.description = 'x'.repeat(1000); expect(validateReviewDraft(draft)).toEqual([]);
    draft.header.description += 'x'; expect(validateReviewDraft(draft).length).toBeGreaterThan(0);
    draft.header.description = '   '; expect(validateReviewDraft(draft).length).toBeGreaterThan(0);
    const response = structuredClone(recoveredExample); response.data.lines = Array.from({ length: 101 }, () => structuredClone(response.data.lines[0]!));
    expect(validateExtractionResponse(response).length).toBeGreaterThan(0);
    const empty = structuredClone(recoveredExample); empty.data.lines = [];
    expect(validateExtractionResponse(empty)).toEqual([]);
  });
});

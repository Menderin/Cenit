import { describe, expect, it } from 'vitest';
import {
  createReviewDraft,
  validateCreatePurchase,
  validateExtractionResponse,
  validateReviewDraft,
  type ExtractionResponse,
} from '@cenit/contracts/purchases';
import {
  amountLabel,
  dateLabel,
  emptyDraft,
  emptyLine,
  purchaseExampleLabel,
  purchaseLabels,
  purchaseProblemLabel,
} from './fields.js';

function buildOcrExtractionResponse(): ExtractionResponse {
  return {
    data: {
      extractionId: '550e8400-e29b-41d4-a716-446655440099',
      status: 'reviewRequired',
      origin: {
        type: 'image_capture',
        extractionId: '550e8400-e29b-41d4-a716-446655440099',
        processorVersion: 'tesseract5-spa-grid8-layout-v1',
        processedAt: '2026-10-14T15:00:00.000Z',
        receipt: 'A'.repeat(43),
      },
      captureLayout: {
        status: 'compatible',
        signals: ['request_title', 'header_fields', 'line_section', 'eight_column_table'],
      },
      input: {
        name: 'captura_solicitud.jpg',
        mimeType: 'image/jpeg',
        bytes: 277722,
        width: 1841,
        height: 947,
      },
      header: {
        requestNumber: { status: 'recovered', value: '908640', rawText: '908640' },
        oracleId: { status: 'recovered', value: '00325486', rawText: '00325486' },
        sender: { status: 'recovered', value: 'PERSONA DEMO, ALFA', rawText: 'PERSONA DEMO, ALFA' },
        recipient: { status: 'recovered', value: 'ENCARGADO DEMO, BETA', rawText: 'ENCARGADO DEMO, BETA' },
        sentDate: { status: 'recovered', value: '2025-12-08', rawText: '08-Dic-2025 16:35:54' },
        sentTime: { status: 'recovered', value: '16:35:54', rawText: '08-Dic-2025 16:35:54' },
        description: {
          status: 'recovered',
          value: 'SERVICIO DE COFFEE BREAK PARA JORNADA ACADÉMICA DEMO',
          rawText: 'SERVICIO DE COFFEE BREAK PARA JORNADA ACADÉMICA DEMO',
        },
        totalAmount: { status: 'recovered', value: '440000', rawText: '440.000 CLP' },
        taxAmount: { status: 'ambiguous', value: null, rawText: 'O CLP' },
        attachmentReference: {
          status: 'recovered',
          value: '2025-12-08 COTIZACION_DEMO_SI908640.pdf',
          rawText: '2025-12-08 COTIZACION_DEMO_SI908640.pdf',
        },
      },
      lines: [
        {
          description: {
            status: 'recovered',
            value: 'SERVICIO DE COFFEE BREAK PARA 50 PERSONAS',
            rawText: 'SERVICIO DE COFFEE BREAK PARA 50 PERSONAS',
          },
          provider: { status: 'recovered', value: 'BANQUETERÍA DEMO SPA', rawText: 'BANQUETERÍA DEMO SPA' },
          costCenter: {
            status: 'recovered',
            value: '270101-Facultad de Medicina / 00000000-Sin Proyecto',
            rawText: '270101-Facultad de Medicina / 00000000-Sin Proyecto',
          },
          lineUnit: { status: 'recovered', value: '1', rawText: '1' },
          quantity: { status: 'recovered', value: '1', rawText: '1' },
          price: { status: 'recovered', value: '440000', rawText: '440000' },
          amount: { status: 'recovered', value: '440000', rawText: '440000' },
          chargeAccount: {
            status: 'recovered',
            value: '01.02.270101.00000000.410103',
            rawText: '01.02.270101.00000000.410103',
          },
          universityCode: { status: 'missing', value: null, rawText: null },
          campusCode: { status: 'missing', value: null, rawText: null },
          unitCode: { status: 'missing', value: null, rawText: null },
          projectCode: { status: 'missing', value: null, rawText: null },
          accountingCode: { status: 'missing', value: null, rawText: null },
        },
      ],
      administrative: {
        document: { status: 'missing', value: null, rawText: null },
        documentType: { status: 'missing', value: null, rawText: null },
        bi: { status: 'missing', value: null, rawText: null },
        rut: { status: 'missing', value: null, rawText: null },
        unitName: { status: 'missing', value: null, rawText: null },
        item: { status: 'missing', value: null, rawText: null },
        paymentSituation: { status: 'missing', value: null, rawText: null },
      },
      issues: [
        {
          path: '/header/taxAmount',
          code: 'AMBIGUOUS_VALUE',
          message: 'No se pudo interpretar el valor sin ambigüedad.',
        },
      ],
      regions: [
        { path: '/header/requestNumber', x: 0.25, y: 0.08, width: 0.05, height: 0.02 },
        { path: '/header/description', x: 0.45, y: 0.14, width: 0.35, height: 0.04 },
        { path: '/lines/0/chargeAccount', x: 0.84, y: 0.46, width: 0.14, height: 0.03 },
      ],
    },
  };
}

describe('montos y formatos de presentación del formulario de compras', () => {
  it('conserva enteros superiores al límite de precisión de Number', () => {
    expect(amountLabel('9007199254740993')).toBe('$9.007.199.254.740.993');
    expect(amountLabel('0')).toBe('$0');
  });
  it('distingue ausencia y conserva un borrador inválido sin romper el formulario', () => {
    expect(amountLabel(null)).toBe('Sin dato');
    expect(amountLabel('1,20')).toBe('1,20');
    expect(amountLabel('001')).toBe('001');
  });
  it('formatea fechas ISO como DD/MM/AAAA y traduce etiquetas de problemas del formulario', () => {
    expect(dateLabel('2025-12-08')).toBe('08/12/2025');
    expect(purchaseProblemLabel('/header/requestNumber')).toBe('Nº Documento / solicitud');
    expect(purchaseProblemLabel('/administrative/paymentSituation')).toBe('Situación de pago declarada');
    expect(purchaseProblemLabel('/lines/0/price')).toBe('Ítem 1 · Precio (CLP)');
    expect(purchaseProblemLabel('/lines/2/chargeAccount')).toBe('Ítem 3 · Cuenta del cargo completa');
    expect(purchaseProblemLabel('/lines')).toBe('Ítems de la solicitud');
    expect(purchaseExampleLabel('recovered')).toBe('Completo');
    expect(purchaseExampleLabel('ambiguous')).toBe('Por aclarar');
  });
});

describe('llenado del formulario de compras desde el OCR y envío a la web app', () => {
  it('inicializa un borrador vacío con todos los campos de cabecera y seguimiento en null', () => {
    const draft = emptyDraft();
    expect(draft.lines).toEqual([]);
    expect(Object.values(draft.header).every(value => value === null)).toBe(true);
    expect(Object.values(draft.administrative).every(value => value === null)).toBe(true);
    const line = emptyLine();
    expect(Object.keys(line)).toEqual([
      'description',
      'provider',
      'costCenter',
      'lineUnit',
      'quantity',
      'price',
      'amount',
      'chargeAccount',
      'universityCode',
      'campusCode',
      'unitCode',
      'projectCode',
      'accountingCode',
    ]);
    expect(Object.values(line).every(value => value === null)).toBe(true);
    expect(purchaseLabels.requestNumber).toBe('Nº Documento / solicitud');
  });

  it('llena el borrador del formulario con los candidatos del OCR y deja en null los ambiguos o ausentes', () => {
    const ocrResponse = buildOcrExtractionResponse();
    expect(validateExtractionResponse(ocrResponse)).toEqual([]);

    const draft = createReviewDraft(ocrResponse);
    expect(validateReviewDraft(draft)).toEqual([]);

    // Datos principales y complementarios de cabecera poblados para PurchaseForm
    expect(draft.header).toEqual({
      requestNumber: '908640',
      oracleId: '00325486',
      sender: 'PERSONA DEMO, ALFA',
      recipient: 'ENCARGADO DEMO, BETA',
      sentDate: '2025-12-08',
      sentTime: '16:35:54',
      description: 'SERVICIO DE COFFEE BREAK PARA JORNADA ACADÉMICA DEMO',
      totalAmount: '440000',
      taxAmount: null,
      attachmentReference: '2025-12-08 COTIZACION_DEMO_SI908640.pdf',
    });

    // Ítem de la tabla de 8 columnas poblado sin inventar códigos institucionales
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toEqual({
      description: 'SERVICIO DE COFFEE BREAK PARA 50 PERSONAS',
      provider: 'BANQUETERÍA DEMO SPA',
      costCenter: '270101-Facultad de Medicina / 00000000-Sin Proyecto',
      lineUnit: '1',
      quantity: '1',
      price: '440000',
      amount: '440000',
      chargeAccount: '01.02.270101.00000000.410103',
      universityCode: null,
      campusCode: null,
      unitCode: null,
      projectCode: null,
      accountingCode: null,
    });

    // Seguimiento administrativo permanece en null hasta intervención humana
    expect(draft.administrative).toEqual({
      document: null,
      documentType: null,
      bi: null,
      rut: null,
      unitName: null,
      item: null,
      paymentSituation: null,
    });
  });

  it('permite revisar/corregir el borrador del formulario y valida el payload final para guardarlo en la web app', () => {
    const ocrResponse = buildOcrExtractionResponse();
    const draft = createReviewDraft(ocrResponse);

    // El usuario corrige el impuesto ambiguo ('O CLP' -> '0') y completa seguimiento administrativo en PurchaseForm
    draft.header.taxAmount = '0';
    draft.lines[0]!.unitCode = '270101';
    draft.lines[0]!.projectCode = '00000000';
    draft.administrative.paymentSituation = 'En revisión';

    const payload = {
      operationId: '550e8400-e29b-41d4-a716-446655440088',
      origin: ocrResponse.data.origin!,
      header: draft.header,
      administrative: draft.administrative,
      lines: draft.lines,
    };

    expect(validateCreatePurchase(payload)).toEqual([]);
    // La respuesta original del OCR permanece inmutable para mostrar "Original: O CLP" y el badge "Corregido"
    expect(ocrResponse.data.header.taxAmount.value).toBeNull();
    expect(ocrResponse.data.header.taxAmount.rawText).toBe('O CLP');
  });

  it('impide guardar el formulario si un campo principal obligatorio o monto editado es inválido y reporta su etiqueta', () => {
    const ocrResponse = buildOcrExtractionResponse();
    const draft = createReviewDraft(ocrResponse);

    draft.header.requestNumber = null;
    draft.lines[0]!.price = '440.000';

    const problems = validateCreatePurchase({
      operationId: '550e8400-e29b-41d4-a716-446655440088',
      origin: ocrResponse.data.origin!,
      header: draft.header,
      administrative: draft.administrative,
      lines: draft.lines,
    });

    const paths = problems.map(problem => problem.path);
    expect(paths).toContain('/header/requestNumber');
    expect(paths).toContain('/lines/0/price');
    expect(problems.map(problem => purchaseProblemLabel(problem.path))).toContain('Nº Documento / solicitud');
    expect(problems.map(problem => purchaseProblemLabel(problem.path))).toContain('Ítem 1 · Precio (CLP)');
  });
});


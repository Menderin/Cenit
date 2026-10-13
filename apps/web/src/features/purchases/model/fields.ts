import { headerFields, lineFields, administrativeFields, type ExtractionReviewDraft } from '@cenit/contracts/purchases';
export const purchaseLabels: Record<string, string> = {
  requestNumber: 'Nº Documento / solicitud', oracleId: 'ID de Oracle', sender: 'Remitente', recipient: 'Destinatario',
  sentDate: 'Fecha de envío (YYYY-MM-DD)', sentTime: 'Hora de envío (HH:mm:ss)', description: 'Descripción', totalAmount: 'Monto total (CLP)',
  taxAmount: 'Impuesto (CLP)', attachmentReference: 'Referencia textual de anexos', provider: 'Proveedor', costCenter: 'Centro de costos',
  lineUnit: 'Unidad de línea', quantity: 'Cantidad', price: 'Precio (CLP)', amount: 'Importe (CLP)', chargeAccount: 'Cuenta del cargo completa',
  universityCode: 'Código universidad', campusCode: 'Código sede', unitCode: 'Código unidad', projectCode: 'Código proyecto', accountingCode: 'Código contable',
  document: 'Documento', documentType: 'Tipo documento', bi: 'bi', rut: 'RUT', unitName: 'Nombre de unidad', item: 'ITEM', paymentSituation: 'Situación de pago',
};
export const emptyFields = (fields: Record<string, unknown>) => Object.fromEntries(Object.keys(fields).map(key => [key, null]));
export const emptyLine = () => emptyFields(lineFields) as ExtractionReviewDraft['lines'][number];
export const emptyDraft = (): ExtractionReviewDraft => ({ header: emptyFields(headerFields) as ExtractionReviewDraft['header'], lines: [], administrative: emptyFields(administrativeFields) as ExtractionReviewDraft['administrative'] });
export const dateLabel = (date: string) => date.split('-').reverse().join('/');

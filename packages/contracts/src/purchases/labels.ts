// Las columnas del «Registro de gastos» conservan el nombre exacto de la planilla del cliente.
export const recordFieldLabels = {
  recordDate: 'Fecha', document: 'Documento', requestNumber: 'Nº Documento', provider: 'PROVEEDOR', description: 'DETALLE',
  totalAmount: 'Monto', documentType: 'Tipo documento', bi: 'bi', unitCode: 'Unidad', projectCode: 'Código del Proyecto',
  accountingCode: 'Código Contable', rut: 'RUT', area: 'UNIDAD', item: 'ITEM', paymentSituation: 'Situación de pago',
} as const;
// Datos que muestra Oracle y no van en la planilla: se guardan, pero se presentan aparte.
export const oracleFieldLabels = {
  sentDate: 'Fecha de envío', sentTime: 'Hora de envío', oracleId: 'ID de Oracle', sender: 'Desde', recipient: 'A',
  taxAmount: 'Impuesto', attachmentReference: 'Anexos',
} as const;
export const lineFieldLabels = {
  description: 'Descripción', provider: 'Proveedor', costCenter: 'Centro de costos', lineUnit: 'Unidad', quantity: 'Cantidad',
  price: 'Precio', amount: 'Importe', chargeAccount: 'Cuenta de cargo', universityCode: 'Código universidad', campusCode: 'Código sede',
  unitCode: 'Código unidad', projectCode: 'Código proyecto', accountingCode: 'Código contable',
} as const;

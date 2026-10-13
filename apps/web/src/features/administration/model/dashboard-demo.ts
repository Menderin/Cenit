// Muestra de diseño independiente del contrato de extracción y de los datos de Oracle.
// Estos estados ilustrativos no definen un flujo institucional de aprobación en Cenit.
const requests = [
  { number: 'DEMO-001', date: '2026-10-05', description: 'Servicios profesionales de apoyo', amount: '440000', pendingLuis: true },
  { number: 'DEMO-002', date: '2026-10-06', description: 'Materiales para actividades docentes', amount: '200000', pendingLuis: true },
  { number: 'DEMO-003', date: '2026-10-06', description: 'Mantenimiento de equipamiento', amount: '350000', pendingLuis: true },
  { number: 'DEMO-004', date: '2026-10-08', description: 'Insumos de oficina', amount: '120000', pendingLuis: true },
  { number: 'DEMO-005', date: '2026-10-09', description: 'Servicio de traslado', amount: '400000', pendingLuis: true },
  { number: 'DEMO-006', date: '2026-10-05', description: 'Material de laboratorio', amount: '180000', pendingLuis: false },
  { number: 'DEMO-007', date: '2026-10-07', description: 'Servicio de impresión', amount: '90000', pendingLuis: false },
  { number: 'DEMO-008', date: '2026-10-09', description: 'Material bibliográfico', amount: '250000', pendingLuis: false },
] as const;

const pending = requests.filter(request => request.pendingLuis);
const days = ['05', '06', '07', '08', '09'].map(day => ({
  date: `2026-10-${day}`,
  label: `${day} oct`,
  count: pending.filter(request => request.date === `2026-10-${day}`).length,
}));

export const dashboardDemo = {
  requests,
  pending,
  pendingAmount: pending.reduce((total, request) => total + BigInt(request.amount), 0n),
  days,
};

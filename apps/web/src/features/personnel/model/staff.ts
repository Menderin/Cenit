// Dotación de demostración en memoria. Datos ficticios hasta que exista la consulta de funcionarios en la API.
export type Staff = {
  id: string; name: string; rut: string; position: string; unit: string;
  plant: 'oficial' | 'especial' | 'temporal'; category: 'academico' | 'no_academico';
};

export const staff: Staff[] = [
  { id: 'camila', name: 'Camila Soto Araya', rut: '15.482.903-2', position: 'Secretaria administrativa', unit: 'Facultad de Medicina', plant: 'oficial', category: 'no_academico' },
  { id: 'tomas', name: 'Tomás Vera Rojas', rut: '16.903.214-9', position: 'Profesor asistente', unit: 'Departamento de Ciencias Biomédicas', plant: 'especial', category: 'academico' },
  { id: 'emilia', name: 'Emilia Fuentes Lagos', rut: '17.225.640-6', position: 'Profesional de apoyo docente', unit: 'Escuela de Medicina', plant: 'oficial', category: 'no_academico' },
  { id: 'maria', name: 'María Ignacia de los Ángeles Valenzuela Contreras-Echeverría', rut: '13.874.512-0', position: 'Profesora asociada y coordinadora del internado clínico de Medicina Interna', unit: 'Departamento de Clínicas', plant: 'oficial', category: 'academico' },
  { id: 'joaquin', name: 'Joaquín Andrés Saavedra Pizarro', rut: '18.340.127-0', position: 'Técnico de laboratorio', unit: 'Departamento de Ciencias Biomédicas', plant: 'especial', category: 'no_academico' },
  { id: 'francisca', name: 'Francisca Olivares Muñoz', rut: '16.051.938-K', position: 'Coordinadora de campos clínicos', unit: 'Unidad de Campos Clínicos', plant: 'especial', category: 'no_academico' },
  { id: 'benjamin', name: 'Benjamín Cortés Alfaro', rut: '19.112.406-5', position: 'Instructor', unit: 'Escuela de Nutrición y Dietética', plant: 'temporal', category: 'academico' },
  { id: 'antonia', name: 'Antonia Reyes Bustamante', rut: '12.667.385-K', position: 'Profesora titular', unit: 'Departamento de Clínicas', plant: 'oficial', category: 'academico' },
  { id: 'diego', name: 'Diego Alejandro Henríquez Lagos', rut: '17.790.253-5', position: 'Auxiliar de servicios', unit: 'Facultad de Medicina', plant: 'oficial', category: 'no_academico' },
  { id: 'valentina', name: 'Valentina Paz Castillo Riquelme', rut: '18.456.721-0', position: 'Docente clínica', unit: 'Escuela de Enfermería', plant: 'especial', category: 'academico' },
];

export const units = [...new Set(staff.map(person => person.unit))].sort((a, b) => a.localeCompare(b, 'es'));

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').replace(/[.\-\s]+/g, ' ').trim();

export function searchStaff(query: string, limit = 6) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length || normalize(query).length < 2) return [];
  return staff.filter(person => {
    const text = normalize(`${person.name} ${person.rut} ${person.rut.replace(/[.-]/g, '')} ${person.position}`);
    return words.every(word => text.includes(word));
  }).slice(0, limit);
}

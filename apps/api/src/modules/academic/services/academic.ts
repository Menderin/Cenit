import { isValidRutSearch, type StudentSearch } from '@cenit/contracts/academic';
import type { AcademicRepository } from '../repositories/academic.js';
import { ApiError } from '../../../infrastructure/errors.js';
export class AcademicError extends ApiError {}
export type AcademicReadRepository = Pick<AcademicRepository, 'plans' | 'plan' | 'students' | 'ownStudentId' | 'progress'>;
export class AcademicService {
  constructor(private readonly repository: AcademicReadRepository) {}
  plans() { return this.repository.plans(); }
  async plan(planId: string, version: string) {
    const plan = await this.repository.plan(planId, version);
    if (!plan) throw new AcademicError(404, 'NOT_FOUND', 'Plan o versión inexistente.');
    return { data: plan };
  }
  students(query: StudentSearch) {
    if (query.rut && !isValidRutSearch(query.rut)) throw new AcademicError(400, 'VALIDATION_ERROR', 'Revisa el formato del RUT y su dígito verificador (módulo 11).');
    return this.repository.students(query);
  }
  async progress(studentId: string) {
    const result = await this.repository.progress(studentId);
    if (!result) throw new AcademicError(404, 'NOT_FOUND', 'Estudiante o plan inexistente.');
    return result;
  }
  async ownProgress(accountId: string) {
    const id = await this.repository.ownStudentId(accountId);
    if (!id) throw new AcademicError(404, 'NOT_FOUND', 'La cuenta no tiene perfil académico.');
    return this.progress(id);
  }
}

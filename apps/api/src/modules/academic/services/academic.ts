import type { StudentSearch } from '@cenit/contracts/academic';
import type { AcademicRepository } from '../repositories/academic.js';
export class AcademicError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export type AcademicReadRepository = Pick<AcademicRepository, 'plans' | 'plan' | 'students' | 'ownStudentId' | 'progress'>;
export class AcademicService {
  constructor(private readonly repository: AcademicReadRepository) {}
  plans() { return this.repository.plans(); }
  async plan(planId: string, version: string) {
    const plan = await this.repository.plan(planId, version);
    if (!plan) throw new AcademicError(404, 'NOT_FOUND', 'Plan o versión inexistente.');
    return { data: plan };
  }
  students(query: StudentSearch) { return this.repository.students(query); }
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

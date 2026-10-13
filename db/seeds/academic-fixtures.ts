import { randomBytes, randomUUID } from 'node:crypto';
import type { AcademicPlan } from '@cenit/contracts/academic';
import type { DemoCredential } from './auth-demo.js';
import type { DemoStudent } from './academic-demo.js';

// Explicit demonstration records, never institutional histories or prerequisite calculations.
export function createAcademicDemoAccounts(): DemoCredential[] {
  return ['Camila Demo', 'Tomás Demo'].map((name, index) => ({
    id: randomUUID(), email: `estudiante${index + 2}@cenit.invalid`, name, role: 'estudiante',
    password: randomBytes(24).toString('base64url'),
  }));
}

export function academicDemoStudents(accounts: Pick<DemoCredential, 'id' | 'name'>[], plan: AcademicPlan, normalizeLegacyRuts = false): DemoStudent[] {
  if (accounts.length !== 3) throw new Error('Se requieren tres cuentas estudiantiles de demostración.');
  return accounts.map((account, index) => {
    const attempts: DemoStudent['attempts'] = [];
    for (const [position, course] of plan.courses.entries()) {
      const passed = index === 0 ? [0, 3].includes(position) : course.semester <= (index === 1 ? 2 : 4);
      const current = index === 0 ? [1, 4].includes(position) : course.semester === (index === 1 ? 3 : 5);
      if ((index === 0 && position === 0) || (index === 1 && position === 7)) {
        attempts.push({ code: course.code, attempt: { attemptNumber: 1, status: 'failed', grade: '3,2' } });
      }
      if (passed) attempts.push({ code: course.code, attempt: { attemptNumber: attempts.some(a => a.code === course.code) ? 2 : 1, status: 'passed', grade: index === 0 ? '5,2' : index === 1 ? '6,5' : '6' } });
      else if (current) attempts.push({ code: course.code, attempt: { attemptNumber: 1, status: 'inProgress', grade: null } });
      else if (index === 0 && position === 2) attempts.push({ code: course.code, attempt: { attemptNumber: 1, status: 'failed', grade: '2,5' } });
    }
    return { id: `10000000-0000-4000-8000-00000000000${index + 1}`, accountId: account.id, name: account.name,
      rut: ['20.123.456-5', '21.123.456-3', '22.123.456-1'][index]!, attempts,
      ...(normalizeLegacyRuts ? { legacyRut: ['00.000.001-k', '00.000.002-0', '00.000.003-1'][index]! } : {}) };
  });
}

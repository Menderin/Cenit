import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { normalizeRutSearch } from '../../apps/api/src/modules/academic/services/progress.js';
import type { Attempt } from '@cenit/contracts/academic';
import { AttemptSchema } from '@cenit/contracts/academic';
import { Value } from '@sinclair/typebox/value';

export type DemoStudent = { id: string; accountId: string; name: string; rut: string; attempts: { code: string; attempt: Attempt }[] };
// No CLI until the login migration is reviewed. Existing account IDs are supplied explicitly; no accounts/credentials are created.
export async function seedAcademicDemo(pool: Pool, planId: string, version: string, students: DemoStudent[]) {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Semillas exclusivas de demo/pruebas.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query<{ id: string }>("SELECT id FROM cenit.academic_versions WHERE plan_id=$1 AND version=$2 AND status='published'", [planId, version]);
    const versionId = rows[0]?.id; if (!versionId) throw new Error('Versión publicada requerida.');
    for (const student of students) {
      const enrollmentId = randomUUID();
      await db.query('INSERT INTO cenit.academic_students(id,account_id,name,rut,rut_search) VALUES($1,$2,$3,$4,$5)', [student.id, student.accountId, student.name, student.rut, normalizeRutSearch(student.rut)]);
      await db.query('INSERT INTO cenit.academic_enrollments(id,student_id,version_id) VALUES($1,$2,$3)', [enrollmentId, student.id, versionId]);
      for (const { code, attempt } of student.attempts) {
        if (!Value.Check(AttemptSchema, attempt)) throw new Error('Estado o nota de intento inválidos.');
        await db.query('INSERT INTO cenit.academic_attempts(id,enrollment_id,version_id,course_code,attempt_number,status,grade) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), enrollmentId, versionId, code, attempt.attemptNumber, attempt.status, attempt.grade?.replace(',', '.') ?? null]);
      }
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}

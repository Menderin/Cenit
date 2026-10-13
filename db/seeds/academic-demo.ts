import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { normalizeRutSearch, formatAcademicGrade } from '../../apps/api/src/modules/academic/services/progress.js';
import type { Attempt } from '@cenit/contracts/academic';
import { AttemptSchema, isValidRut, formatRutInput } from '@cenit/contracts/academic';
import { Value } from '@sinclair/typebox/value';

export type DemoStudent = { id: string; accountId: string; name: string; rut: string; legacyRut?: string; attempts: { code: string; attempt: Attempt }[] };
// Existing account IDs are supplied explicitly; this helper never creates accounts/credentials.
export async function seedAcademicDemo(pool: Pool, planId: string, version: string, students: DemoStudent[]) {
  if (!['demo', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Semillas exclusivas de demo/pruebas.');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(1128615497, 3)');
    const { rows } = await db.query<{ id: string }>("SELECT id FROM cenit.academic_versions WHERE plan_id=$1 AND version=$2 AND status='published'", [planId, version]);
    const versionId = rows[0]?.id; if (!versionId) throw new Error('Versión publicada requerida.');
    for (const student of students) {
      if (!isValidRut(student.rut) || formatRutInput(student.rut) !== student.rut) throw new Error('RUT de demostración inválido: usa puntos, guion y dígito módulo 11.');
      const account = (await db.query("SELECT id FROM cenit.accounts WHERE id=$1 AND role='estudiante' AND active", [student.accountId])).rows[0];
      if (!account) throw new Error('Se requiere una cuenta estudiantil existente y activa.');
      // Only explicit demo preparation supplies the exact old fixture value.
      if (student.legacyRut) await db.query('UPDATE cenit.academic_students SET rut=$4,rut_search=$5 WHERE id=$1 AND account_id=$2 AND name=$3 AND rut=$6', [student.id, student.accountId, student.name, student.rut, normalizeRutSearch(student.rut), student.legacyRut]);
      await db.query('INSERT INTO cenit.academic_students(id,account_id,name,rut,rut_search) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING', [student.id, student.accountId, student.name, student.rut, normalizeRutSearch(student.rut)]);
      const saved = (await db.query('SELECT account_id,name,rut FROM cenit.academic_students WHERE id=$1', [student.id])).rows[0];
      if (saved.account_id !== student.accountId || saved.name !== student.name || saved.rut !== student.rut) throw new Error('Perfil existente distinto: no se sobrescribió.');
      await db.query('INSERT INTO cenit.academic_enrollments(id,student_id,version_id) VALUES($1,$2,$3) ON CONFLICT(student_id) DO NOTHING', [randomUUID(), student.id, versionId]);
      const enrollment = (await db.query('SELECT id,version_id FROM cenit.academic_enrollments WHERE student_id=$1', [student.id])).rows[0];
      if (enrollment.version_id !== versionId) throw new Error('Adscripción existente distinta: no se sobrescribió.');
      const enrollmentId = enrollment.id;
      for (const { code, attempt } of student.attempts) {
        if (!Value.Check(AttemptSchema, attempt)) throw new Error('Estado o nota de intento inválidos.');
        await db.query('INSERT INTO cenit.academic_attempts(id,enrollment_id,version_id,course_code,attempt_number,status,grade) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(enrollment_id,course_code,attempt_number) DO NOTHING', [randomUUID(), enrollmentId, versionId, code, attempt.attemptNumber, attempt.status, attempt.grade?.replace(',', '.') ?? null]);
        const stored = (await db.query('SELECT status,grade FROM cenit.academic_attempts WHERE enrollment_id=$1 AND course_code=$2 AND attempt_number=$3', [enrollmentId, code, attempt.attemptNumber])).rows[0];
        if (stored.status !== attempt.status || formatAcademicGrade(stored.grade) !== attempt.grade) throw new Error('Intento existente distinto: no se sobrescribió.');
      }
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}

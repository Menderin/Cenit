import type { Pool, PoolClient } from 'pg';
import type { AcademicPlan, PlansResponse, StudentSearch, StudentsResponse, ProgressResponse, Prerequisite, Attempt } from '@cenit/contracts/academic';
import { compactRut } from '@cenit/contracts/academic';
import { validateCatalog } from '../services/catalog.js';
import { buildProgress, formatAcademicGrade } from '../services/progress.js';

export class AcademicRepository {
  constructor(private readonly pool: Pool) {}
  private async snapshot<T>(read: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await read(db); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async plans(): Promise<PlansResponse> {
    const { rows } = await this.pool.query<{ plan_id: string; name: string; version: string; is_example: boolean }>(`SELECT v.plan_id, p.name, v.version, v.is_example FROM cenit.academic_versions v JOIN cenit.academic_plans p ON p.id=v.plan_id WHERE v.status='published' ORDER BY v.plan_id,v.version`);
    const data: PlansResponse['data'] = [];
    for (const row of rows) {
      let plan = data.find(p => p.planId === row.plan_id);
      if (!plan) { plan = { planId: row.plan_id, name: row.name, versions: [] }; data.push(plan); }
      plan.versions.push({ version: row.version, isExample: row.is_example });
    }
    return { data };
  }
  async plan(planId: string, version: string): Promise<AcademicPlan | null> {
    return this.snapshot(async db => {
      const { rows: versions } = await db.query<{ id: string; name: string; is_example: boolean }>(`SELECT v.id,p.name,v.is_example FROM cenit.academic_versions v JOIN cenit.academic_plans p ON p.id=v.plan_id WHERE v.plan_id=$1 AND v.version=$2 AND v.status='published'`, [planId, version]);
      const row = versions[0]; if (!row) return null;
      const { rows: sources } = await db.query<{ id: string; title: string; reference: string | null; sha256: string; reviewed_at: string | null; validation_status: AcademicPlan['source']['validationStatus']; is_primary: boolean }>(`SELECT id,title,reference,sha256,reviewed_at::text,validation_status,is_primary FROM cenit.academic_sources WHERE version_id=$1 ORDER BY is_primary DESC,id`, [row.id]);
      const mapped = sources.map(s => ({ sourceId: s.id, title: s.title, reference: s.reference, sha256: s.sha256, reviewedAt: s.reviewed_at, validationStatus: s.validation_status }));
      const { rows: courses } = await db.query<{ code: string; official_code: string | null; name: string; semester: number; semester_end: number; credits: string | null; display_order: number; prerequisites: Prerequisite }>(`SELECT * FROM cenit.academic_courses WHERE version_id=$1 ORDER BY display_order`, [row.id]);
      const { rows: edges } = await db.query<{ from_code: string; to_code: string; source_id: string; interpretation: 'pending' | 'confirmed'; note: string }>(`SELECT * FROM cenit.academic_prerequisite_edges WHERE version_id=$1 ORDER BY from_code,to_code`, [row.id]);
      return validateCatalog({ planId, version, name: row.name, isExample: row.is_example, source: mapped[0], sources: mapped,
        courses: courses.map(c => ({ code: c.code, codeKind: 'internal', officialCode: c.official_code, name: c.name, semester: c.semester, semesterEnd: c.semester_end, credits: c.credits === null ? null : Number(c.credits), displayOrder: c.display_order, prerequisites: c.prerequisites })),
        prerequisiteEdges: edges.map(e => ({ fromCode: e.from_code, toCode: e.to_code, sourceId: e.source_id, interpretation: e.interpretation, note: e.note })) });
    });
  }
  async students(search: StudentSearch): Promise<StudentsResponse> {
    return this.snapshot(async db => {
      // LIKE metacharacters are literal user input; values never become SQL.
      const name = search.name ? `%${search.name.replace(/[\\%_]/g, '\\$&')}%` : null;
      const rut = search.rut ? `${compactRut(search.rut)}%` : null;
      const where = `FROM cenit.academic_students s JOIN cenit.academic_enrollments e ON e.student_id=s.id JOIN cenit.academic_versions v ON v.id=e.version_id WHERE v.plan_id='nutricion-dietetica' AND v.status='published' AND ($1::text IS NULL OR s.name ILIKE $1) AND ($2::text IS NULL OR replace(s.rut_search, '-', '') LIKE $2)`;
      const { rows: count } = await db.query<{ total: string }>(`SELECT count(*)::text AS total ${where}`, [name, rut]);
      const { rows: data } = await db.query<StudentsResponse['data'][number]>(`SELECT s.id,s.name,s.rut ${where} ORDER BY s.name,s.id LIMIT $3 OFFSET $4`, [name, rut, search.pageSize, (search.page - 1) * search.pageSize]);
      return { data, page: search.page, pageSize: search.pageSize, totalItems: Number(count[0]!.total) };
    });
  }
  async ownStudentId(accountId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>('SELECT id FROM cenit.academic_students WHERE account_id=$1', [accountId]);
    return rows[0]?.id ?? null;
  }
  async progress(studentId: string): Promise<ProgressResponse | null> {
    return this.snapshot(async db => {
      const { rows } = await db.query<{ id: string; name: string; rut: string; enrollment_id: string; version_id: string; plan_id: string; version: string }>(`SELECT s.id,s.name,s.rut,e.id AS enrollment_id,e.version_id,v.plan_id,v.version FROM cenit.academic_students s JOIN cenit.academic_enrollments e ON e.student_id=s.id JOIN cenit.academic_versions v ON v.id=e.version_id WHERE s.id=$1 AND v.plan_id='nutricion-dietetica' AND v.status='published'`, [studentId]);
      const student = rows[0]; if (!student) return null;
      const { rows: courses } = await db.query<{ code: string }>('SELECT code FROM cenit.academic_courses WHERE version_id=$1 ORDER BY display_order', [student.version_id]);
      const { rows: attempts } = await db.query<{ course_code: string; attempt_number: number; status: Attempt['status']; grade: string | null }>('SELECT course_code,attempt_number,status,grade FROM cenit.academic_attempts WHERE enrollment_id=$1 ORDER BY course_code,attempt_number', [student.enrollment_id]);
      return { data: { student: { id: student.id, name: student.name, rut: student.rut }, plan: { planId: student.plan_id, version: student.version }, origin: 'demo', courses: buildProgress(courses, attempts.map(a => ({ code: a.course_code, attempt: { attemptNumber: a.attempt_number, status: a.status, grade: formatAcademicGrade(a.grade) } as Attempt }))) } };
    });
  }
}

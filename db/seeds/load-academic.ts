import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { AcademicPlan } from '@cenit/contracts/academic';
import { canonicalJson, validateCatalog } from '../../apps/api/src/modules/academic/services/catalog.js';
import { createPool } from '../../apps/api/src/infrastructure/database/connection.js';

export function readCatalog(file: string): AcademicPlan {
  if (statSync(file).size > 1024 * 1024) throw new Error('Catálogo demasiado grande.');
  const plan = validateCatalog(JSON.parse(readFileSync(file, 'utf8')));
  for (const source of plan.sources) {
    if (!source.reference) throw new Error('La carga requiere fuentes locales trazables.');
    const ref = relative(process.cwd(), resolve(source.reference));
    if (ref.startsWith('..') || isAbsolute(ref)) throw new Error('Fuente fuera del repositorio.');
    if (createHash('sha256').update(readFileSync(resolve(source.reference))).digest('hex') !== source.sha256) throw new Error('La fuente cambió: revisar y crear otra versión.');
  }
  return plan;
}
export async function loadCatalog(pool: Pool, input: unknown, publish: boolean): Promise<'created' | 'unchanged' | 'published'> {
  const plan = validateCatalog(input);
  const hashInput = { ...plan, sources: [...plan.sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId)), courses: [...plan.courses].sort((a, b) => a.displayOrder - b.displayOrder), prerequisiteEdges: [...plan.prerequisiteEdges].sort((a, b) => a.fromCode.localeCompare(b.fromCode) || a.toCode.localeCompare(b.toCode)) };
  const contentHash = createHash('sha256').update(canonicalJson(hashInput)).digest('hex');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([plan.planId, plan.version])]);
    const { rows } = await db.query<{ id: string; content_hash: string; status: string }>('SELECT id,content_hash,status FROM cenit.academic_versions WHERE plan_id=$1 AND version=$2 FOR UPDATE', [plan.planId, plan.version]);
    const old = rows[0];
    if (old) {
      if (old.content_hash !== contentHash) throw new Error('Versión existente con contenido distinto: crea otra versión.');
      if (publish && old.status === 'draft') { await db.query("UPDATE cenit.academic_versions SET status='published' WHERE id=$1", [old.id]); await db.query('COMMIT'); return 'published'; }
      await db.query('COMMIT'); return 'unchanged';
    }
    await db.query('INSERT INTO cenit.academic_plans(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [plan.planId, plan.name]);
    const { rows: names } = await db.query<{ name: string }>('SELECT name FROM cenit.academic_plans WHERE id=$1', [plan.planId]);
    if (names[0]!.name !== plan.name) throw new Error('Nombre del plan distinto: requiere revisión del contrato.');
    const id = randomUUID();
    await db.query('INSERT INTO cenit.academic_versions(id,plan_id,version,is_example,content_hash) VALUES($1,$2,$3,$4,$5)', [id, plan.planId, plan.version, plan.isExample, contentHash]);
    for (const source of plan.sources) await db.query('INSERT INTO cenit.academic_sources(version_id,id,title,reference,sha256,reviewed_at,validation_status,is_primary) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, source.sourceId, source.title, source.reference, source.sha256, source.reviewedAt, source.validationStatus, source.sourceId === plan.source.sourceId]);
    for (const c of plan.courses) await db.query('INSERT INTO cenit.academic_courses(version_id,code,official_code,name,semester,semester_end,credits,display_order,prerequisites) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, c.code, c.officialCode, c.name, c.semester, c.semesterEnd, c.credits?.toFixed(2) ?? null, c.displayOrder, JSON.stringify(c.prerequisites)]);
    for (const e of plan.prerequisiteEdges) await db.query('INSERT INTO cenit.academic_prerequisite_edges(version_id,from_code,to_code,source_id,interpretation,note) VALUES($1,$2,$3,$4,$5,$6)', [id, e.fromCode, e.toCode, e.sourceId, e.interpretation, e.note]);
    if (publish) await db.query("UPDATE cenit.academic_versions SET status='published' WHERE id=$1", [id]);
    await db.query('COMMIT'); return 'created';
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
async function main() {
  const args = process.argv.slice(2);
  let file = 'catalogs/academic/nutricion-2027-r1.json';
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--file') {
      const path = args[++index]; if (!path || path.startsWith('--')) throw new Error('Falta ruta del catálogo.'); file = path;
    } else if (!['--check', '--publish'].includes(args[index]!)) throw new Error('Argumento desconocido.');
  }
  if (!args.includes('--check') && !args.includes('--publish')) throw new Error('Usa --check o --publish [--file ruta].');
  const plan = readCatalog(file);
  if (args.includes('--check')) { console.log(`Catálogo validado: ${plan.courses.length} asignaturas; prerrequisitos pendientes explícitos.`); return; }
  if (process.env.APP_ENV !== 'demo') throw new Error('Carga permitida sólo con APP_ENV=demo.');
  const pool = createPool();
  try { const result = await loadCatalog(pool, plan, true); console.log(`Catálogo ${result}: ${plan.planId}/${plan.version}. No se cargaron cuentas ni historiales.`); }
  finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Carga académica fallida. Revisa catálogo, fuentes, permisos y configuración privada.'); process.exitCode = 1; });

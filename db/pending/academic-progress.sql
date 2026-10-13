-- NOT an executable deployment migration. Resolve the reviewed login FK first.
-- The integration test replaces both tokens with a TEST-ONLY identity table/column.
-- Accounts must use UUID keys for this proposal; otherwise adapt schema/contracts before integration.
CREATE TABLE cenit.academic_students (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES __ACCOUNT_TABLE__(__ACCOUNT_ID_COLUMN__),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  rut text NOT NULL CHECK (length(rut) BETWEEN 1 AND 30),
  rut_search text NOT NULL UNIQUE CHECK (rut_search = upper(replace(rut, '.', '')))
);
CREATE TABLE cenit.academic_enrollments (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL UNIQUE REFERENCES cenit.academic_students(id),
  version_id uuid NOT NULL REFERENCES cenit.academic_versions(id),
  UNIQUE (id, version_id)
);
CREATE TABLE cenit.academic_attempts (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL,
  version_id uuid NOT NULL,
  course_code text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL,
  -- No scale coercion: reject extra significant decimals instead of rounding them.
  grade numeric CHECK (grade IS NULL OR grade = trunc(grade, 1)),
  FOREIGN KEY (enrollment_id, version_id) REFERENCES cenit.academic_enrollments(id, version_id),
  FOREIGN KEY (version_id, course_code) REFERENCES cenit.academic_courses(version_id, code),
  UNIQUE (enrollment_id, course_code, attempt_number),
  CONSTRAINT attempt_grade CHECK (
    (status = 'inProgress' AND grade IS NULL) OR
    (status = 'passed' AND grade IS NOT NULL AND grade BETWEEN 4 AND 7) OR
    (status = 'failed' AND grade IS NOT NULL AND grade >= 1 AND grade < 4)
  )
);
CREATE UNIQUE INDEX one_current_attempt ON cenit.academic_attempts(enrollment_id, course_code) WHERE status = 'inProgress';

-- Lock the version row: publishing and modifying its children cannot race.
CREATE FUNCTION cenit.guard_academic_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; state text;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD.version_id; ELSE target := NEW.version_id; END IF;
  IF TG_OP = 'UPDATE' AND OLD.version_id <> NEW.version_id THEN
    RAISE EXCEPTION 'academic version cannot be changed' USING ERRCODE = '23514';
  END IF;
  SELECT status INTO state FROM cenit.academic_versions WHERE id=target FOR UPDATE;
  IF state = 'published' THEN
    RAISE EXCEPTION 'published academic version is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
--> statement-breakpoint
CREATE TRIGGER academic_courses_immutable BEFORE INSERT OR UPDATE OR DELETE ON cenit.academic_courses FOR EACH ROW EXECUTE FUNCTION cenit.guard_academic_child();
--> statement-breakpoint
CREATE TRIGGER academic_sources_immutable BEFORE INSERT OR UPDATE OR DELETE ON cenit.academic_sources FOR EACH ROW EXECUTE FUNCTION cenit.guard_academic_child();
--> statement-breakpoint
CREATE TRIGGER academic_edges_immutable BEFORE INSERT OR UPDATE OR DELETE ON cenit.academic_prerequisite_edges FOR EACH ROW EXECUTE FUNCTION cenit.guard_academic_child();
--> statement-breakpoint
CREATE FUNCTION cenit.guard_academic_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'load an academic draft before publishing' USING ERRCODE = '23514';
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.status='published' THEN
    RAISE EXCEPTION 'published academic version is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status='published' THEN
    IF NOT EXISTS (SELECT 1 FROM cenit.academic_courses WHERE version_id=NEW.id) OR
       NOT EXISTS (SELECT 1 FROM cenit.academic_sources WHERE version_id=NEW.id AND is_primary) THEN
      RAISE EXCEPTION 'academic catalog requires courses and a primary source' USING ERRCODE = '23514';
    END IF;
    -- The importer also validates JSON Schema, depth, leaves and documentary semantics.
    IF EXISTS (
      WITH RECURSIVE reach AS (
        SELECT from_code, to_code
        FROM cenit.academic_prerequisite_edges WHERE version_id=NEW.id
        UNION
        SELECT p.from_code,e.to_code
        FROM reach p JOIN cenit.academic_prerequisite_edges e ON e.from_code=p.to_code AND e.version_id=NEW.id
      ) SELECT 1 FROM reach WHERE from_code=to_code
    ) THEN RAISE EXCEPTION 'academic prerequisite cycle' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
--> statement-breakpoint
CREATE TRIGGER academic_versions_immutable BEFORE INSERT OR UPDATE OR DELETE ON cenit.academic_versions FOR EACH ROW EXECUTE FUNCTION cenit.guard_academic_version();
--> statement-breakpoint
CREATE FUNCTION cenit.guard_academic_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cenit.academic_versions WHERE plan_id=OLD.id AND status='published') THEN
    RAISE EXCEPTION 'published plan metadata is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
--> statement-breakpoint
CREATE TRIGGER academic_plan_immutable BEFORE UPDATE OR DELETE ON cenit.academic_plans FOR EACH ROW EXECUTE FUNCTION cenit.guard_academic_plan();

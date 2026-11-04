-- Hospital RMS — PostgreSQL baseline 04: hàm, trigger, view chuyển từ trigger /
-- view của SQL Server cũ. Chạy bằng rms_migrate SAU khi nạp dữ liệu
-- (POSTGRESQL_MIGRATION_PLAN.md mục 6.5.3 bước 6), để trigger audit không ghi đè
-- updated_at / updated_by của dữ liệu chuyển sang. Chạy lại được (CREATE OR
-- REPLACE, DROP TRIGGER IF EXISTS).
--
-- Khác SQL Server (cố ý):
--   - Audit là trigger BEFORE UPDATE từng dòng, sửa NEW trực tiếp — không cần
--     UPDATE lại bảng như AFTER trigger của SQL Server.
--   - So sánh bằng IS DISTINCT FROM: NULL → '' và đổi hoa/thường cũng tính là
--     thay đổi (SQL Server dùng ISNULL(x, '') và collation không phân biệt hoa/thường).
--   - Người thao tác đọc từ current_setting('app.current_user_id') — đặt bằng
--     withActor() (src/config/db.pg.js), thay cho SESSION_CONTEXT + sp_set_actor.

SET client_min_messages = warning; -- bỏ thông báo "trigger ... does not exist, skipping"

-- ── Người thao tác hiện tại (NULL nếu chưa đặt) ─────────────────────────────
CREATE OR REPLACE FUNCTION rms_current_actor() RETURNS varchar(20)
LANGUAGE sql STABLE AS $$
	SELECT nullif(current_setting('app.current_user_id', true), '')::varchar(20)
$$;

-- ── Audit updated_at / updated_by ───────────────────────────────────────────
-- Tham số trigger = danh sách cột: chỉ ghi audit khi 1 trong các cột này đổi.
-- Không có tham số = mẫu trg_seminars_audit của SQL Server (`NOT UPDATE(updated_at)`):
-- ghi audit khi câu UPDATE không tự đặt updated_at.
CREATE OR REPLACE FUNCTION rms_audit_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	n jsonb;
	o jsonb;
	c text;
	changed boolean := false;
BEGIN
	IF TG_NARGS = 0 THEN
		changed := NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at;
	ELSE
		n := to_jsonb(NEW);
		o := to_jsonb(OLD);
		FOREACH c IN ARRAY TG_ARGV LOOP
			IF n -> c IS DISTINCT FROM o -> c THEN
				changed := true;
				EXIT;
			END IF;
		END LOOP;
	END IF;
	IF changed THEN
		NEW.updated_at := LOCALTIMESTAMP;
		NEW.updated_by := rms_current_actor();
	END IF;
	RETURN NEW;
END $$;

-- Bảng → cột theo dõi, giữ đúng danh sách của trigger SQL Server tương ứng.
DO $$
DECLARE
	t record;
BEGIN
	FOR t IN
		SELECT * FROM (VALUES
			('approvals',            'trg_approvals_audit',            ARRAY['status', 'comment']),
			('categories',           'trg_cat_audit',                  ARRAY['name', 'description']),
			('councils',             'trg_councils_audit',             ARRAY['name', 'specialty_group', 'location', 'defense_date', 'status']),
			('departments',          'trg_dept_audit',                 ARRAY['name', 'code', 'parent_id', 'dept_account_id', 'description']),
			('files',                'trg_files_audit',                ARRAY['is_deleted', 'description', 'file_name']),
			('levels',               'trg_lv_audit',                   ARRAY['name', 'description']),
			('research_rounds',      'trg_research_rounds_audit',      ARRAY['name', 'year', 'round_number', 'status', 'start_date', 'end_date']),
			('roles',                'trg_roles_audit',                ARRAY['name', 'description']),
			('seminar_participants', 'trg_seminar_participants_audit', ARRAY[]::text[]),
			('seminars',             'trg_seminars_audit',             ARRAY[]::text[]),
			('topic_members',        'trg_tm_audit',                   ARRAY['name', 'email', 'phone_number', 'position', 'role', 'user_id', 'account_granted']),
			('topics',               'trg_topics_audit',               ARRAY['title', 'description', 'round_id', 'category_id', 'level_id', 'department_id', 'status']),
			('users',                'trg_users_audit',                ARRAY['username', 'password', 'full_name', 'email', 'department_id', 'role_id', 'is_active', 'topic_member_id'])
		) AS v(tbl, trg, cols)
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t.trg, t.tbl);
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION rms_audit_updated(%s)',
			t.trg, t.tbl,
			(SELECT coalesce(string_agg(quote_literal(c), ', '), '') FROM unnest(t.cols) AS c)
		);
	END LOOP;
END $$;

-- ── departments: tự sinh mã DV001, DV002... (trg_dept_gen_id) ───────────────
-- SQL Server: INSTEAD OF INSERT, luôn bỏ qua id truyền vào. Ở đây BEFORE INSERT
-- (NOT NULL của id kiểm tra SAU trigger BEFORE). Khoá advisory để 2 phiên thêm
-- đơn vị cùng lúc không lấy trùng số.
CREATE OR REPLACE FUNCTION rms_departments_gen_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	k int;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtext('rms:departments_id'));
	SELECT count(*) + 1 INTO k FROM departments WHERE id LIKE 'DV%';
	LOOP
		NEW.id := 'DV' || CASE WHEN k < 1000 THEN lpad(k::text, 3, '0') ELSE k::text END;
		EXIT WHEN NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.id);
		k := k + 1;
	END LOOP;
	NEW.created_at := coalesce(NEW.created_at, LOCALTIMESTAMP);
	RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_dept_gen_id ON departments;
CREATE TRIGGER trg_dept_gen_id BEFORE INSERT ON departments
	FOR EACH ROW EXECUTE FUNCTION rms_departments_gen_id();

-- ── files: đếm lại file_batches.file_count (trg_file_batch_count) ───────────
-- Trigger theo câu lệnh với bảng chuyển tiếp: 1 câu INSERT nhiều file chỉ đếm 1 lần.
CREATE OR REPLACE FUNCTION rms_files_batch_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	UPDATE file_batches fb
	SET file_count = (SELECT count(*) FROM files f WHERE f.batch_id = fb.id AND NOT f.is_deleted)
	WHERE fb.id IN (SELECT DISTINCT batch_id FROM changed_rows);
	RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_file_batch_count_ins ON files;
DROP TRIGGER IF EXISTS trg_file_batch_count_del ON files;
CREATE TRIGGER trg_file_batch_count_ins AFTER INSERT ON files
	REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION rms_files_batch_count();
CREATE TRIGGER trg_file_batch_count_del AFTER DELETE ON files
	REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION rms_files_batch_count();

-- ── topics: tạo phiếu duyệt khi đề tài chuyển sang submitted (trg_topic_auto_approval)
-- Kế hoạch chặng 1: chuyển logic này về JS rồi bỏ trigger trên cả 2 DB.
CREATE OR REPLACE FUNCTION rms_topics_auto_approval() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.status = 'submitted' AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.topic_id = NEW.id) THEN
		INSERT INTO approvals (id, topic_id, status, created_by)
		VALUES ('PD' || NEW.id, NEW.id, 'pending', coalesce(rms_current_actor(), NEW.created_by));
	END IF;
	RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_topic_auto_approval ON topics;
CREATE TRIGGER trg_topic_auto_approval AFTER INSERT OR UPDATE ON topics
	FOR EACH ROW EXECUTE FUNCTION rms_topics_auto_approval();

-- ── fn_normalize_phone: SĐT → chỉ còn chữ số, bỏ số 0 đầu / mã vùng 84 ───────
CREATE OR REPLACE FUNCTION fn_normalize_phone(p varchar) RETURNS varchar(20)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
	SELECT nullif(left(
		CASE
			WHEN left(d, 2) = '84' AND length(d) >= 11 THEN substr(d, 3, 20)
			WHEN left(d, 1) = '0' THEN substr(d, 2, 20)
			ELSE d
		END, 20), '')
	FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS d) s
$$;

-- ── View xem audit (vw_approvals_audit, vw_topics_audit) ────────────────────
CREATE OR REPLACE VIEW vw_approvals_audit AS
SELECT
	a.id, a.topic_id, a.status, a.comment,
	a.created_at,
	uc.full_name AS created_by_name,
	a.updated_at,
	uu.full_name AS updated_by_name,
	t.title AS topic_title
FROM approvals a
LEFT JOIN users uc ON uc.id = a.created_by
LEFT JOIN users uu ON uu.id = a.updated_by
LEFT JOIN topics t ON t.id = a.topic_id;

CREATE OR REPLACE VIEW vw_topics_audit AS
SELECT
	t.id, t.title, t.status,
	t.created_at,
	uc.full_name AS created_by_name,
	t.updated_at,
	uu.full_name AS updated_by_name,
	rr.name AS round_name,
	d.name AS department_name
FROM topics t
LEFT JOIN users uc ON uc.id = t.created_by
LEFT JOIN users uu ON uu.id = t.updated_by
LEFT JOIN research_rounds rr ON rr.id = t.round_id
LEFT JOIN departments d ON d.id = t.department_id;

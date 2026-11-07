-- Đánh số lại mã vai trò (roles.id) theo thứ tự quyền, cho DB chuyển từ hệ thống cũ:
--   VT01 Quản trị hệ thống (superadmin)   VT06 Trưởng khoa (dept_head)
--   VT02 Admin (admin)                     VT07 Hội đồng xét duyệt (review_council)
--   VT03 Giám đốc (director)               VT08 Chủ nhiệm đề tài (topic_leader)
--   VT04 Quản lý NCKH (research_manager)   VT09 Thành viên (member)
--   VT05 Quản lý đào tạo (tên, không mã)   VT10 Học viên (trainee)
--
-- Vai trò nhận diện theo mã (roles.code), riêng "Quản lý đào tạo" theo tên. Đổi id ở
-- roles và mọi chỗ lưu id vai trò: users.role_id, role_permissions.role_id,
-- workflow_steps.approver_role_id, workflow_tasks.assignee_role_id, surveys.target_role.
-- Code nghiệp vụ tra vai trò theo mã (modules/access/roleCodes.js), không theo id —
-- cần bản backend có accountMaintenanceJob tra mã "member" (không còn ghi cứng VT06).
--
-- Chạy bằng rms_migrate (chủ bảng), KHI ĐÃ DỪNG BACKEND (cache quyền theo id nằm
-- trong RAM backend; khởi động lại là sạch):
--   docker compose -f docker-compose.prod.yml stop backend
--   psql -h 127.0.0.1 -U rms_migrate -d rms_hospital -f danh-so-lai-vai-tro.sql
--   docker compose -f docker-compose.prod.yml start backend
-- Một transaction: thiếu / thừa vai trò hoặc lỗi bất kỳ ⇒ huỷ, không đổi gì.
-- Đã đúng thứ tự rồi thì chạy lại không đổi gì.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TEMP TABLE m (ord int, new_id varchar(6), tmp_id varchar(6), code text, name text, old_id varchar(6))
	ON COMMIT DROP;
INSERT INTO m (ord, new_id, tmp_id, code, name, old_id)
SELECT v.ord, v.new_id, 'VT' || (89 + v.ord), v.code, v.name,
	(SELECT r.id FROM roles r
	 WHERE (v.code IS NOT NULL AND r.code = v.code) OR (v.code IS NULL AND r.name = v.name))
FROM (VALUES
	(1,  'VT01', 'superadmin',       NULL),
	(2,  'VT02', 'admin',            NULL),
	(3,  'VT03', 'director',         NULL),
	(4,  'VT04', 'research_manager', NULL),
	(5,  'VT05', NULL,               'Quản lý đào tạo'),
	(6,  'VT06', 'dept_head',        NULL),
	(7,  'VT07', 'review_council',   NULL),
	(8,  'VT08', 'topic_leader',     NULL),
	(9,  'VT09', 'member',           NULL),
	(10, 'VT10', 'trainee',          NULL)
) AS v(ord, new_id, code, name);

DO $$
DECLARE
	missing text;
	extra text;
BEGIN
	SELECT string_agg(coalesce(code, name), ', ') INTO missing FROM m WHERE old_id IS NULL;
	IF missing IS NOT NULL THEN
		RAISE EXCEPTION 'Không thấy vai trò: % — huỷ (vai trò Admin: chạy tao-vai-tro-admin.sql trước)', missing;
	END IF;
	SELECT string_agg(id || ' ' || name, ', ') INTO extra FROM roles WHERE id NOT IN (SELECT old_id FROM m);
	IF extra IS NOT NULL THEN
		RAISE EXCEPTION 'Có vai trò ngoài danh sách: % — huỷ, cần thêm vào bảng thứ tự', extra;
	END IF;
	IF (SELECT count(DISTINCT old_id) FROM m) <> 10 THEN
		RAISE EXCEPTION 'Hai dòng thứ tự trỏ cùng 1 vai trò — huỷ';
	END IF;
END $$;

SELECT m.ord AS thu_tu, m.old_id AS ma_cu, m.new_id AS ma_moi, r.name AS vai_tro,
	(SELECT count(*) FROM users u WHERE u.role_id = m.old_id) AS so_tai_khoan
FROM m JOIN roles r ON r.id = m.old_id ORDER BY m.ord;

-- Không ghi đè updated_at / updated_by của ~2.000 tài khoản chỉ vì đổi mã vai trò
ALTER TABLE users DISABLE TRIGGER trg_users_audit;
-- Khoá ngoại không ON UPDATE CASCADE ⇒ gỡ ra, đổi xong gắn lại y như baseline
ALTER TABLE role_permissions DROP CONSTRAINT fk_rp_role;
ALTER TABLE users DROP CONSTRAINT fk_user_role;

-- 2 lượt qua mã tạm VT90–VT99 (chk_role_id chỉ nhận VT + 2 số) để không trùng giữa chừng
UPDATE roles r SET id = m.tmp_id FROM m WHERE r.id = m.old_id;
UPDATE users t SET role_id = m.tmp_id FROM m WHERE t.role_id = m.old_id;
UPDATE role_permissions t SET role_id = m.tmp_id FROM m WHERE t.role_id = m.old_id;
UPDATE workflow_steps t SET approver_role_id = m.tmp_id FROM m WHERE t.approver_role_id = m.old_id;
UPDATE workflow_tasks t SET assignee_role_id = m.tmp_id FROM m WHERE t.assignee_role_id = m.old_id;
UPDATE surveys t SET target_role = m.tmp_id FROM m WHERE t.target_role = m.old_id;

UPDATE roles r SET id = m.new_id FROM m WHERE r.id = m.tmp_id;
UPDATE users t SET role_id = m.new_id FROM m WHERE t.role_id = m.tmp_id;
UPDATE role_permissions t SET role_id = m.new_id FROM m WHERE t.role_id = m.tmp_id;
UPDATE workflow_steps t SET approver_role_id = m.new_id FROM m WHERE t.approver_role_id = m.tmp_id;
UPDATE workflow_tasks t SET assignee_role_id = m.new_id FROM m WHERE t.assignee_role_id = m.tmp_id;
UPDATE surveys t SET target_role = m.new_id FROM m WHERE t.target_role = m.tmp_id;

ALTER TABLE users ENABLE TRIGGER trg_users_audit;
ALTER TABLE role_permissions ADD CONSTRAINT fk_rp_role
	FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE role_permissions VALIDATE CONSTRAINT fk_rp_role;
ALTER TABLE users ADD CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles (id) NOT VALID;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM roles WHERE id >= 'VT90') THEN
		RAISE EXCEPTION 'Còn mã tạm VT9x — huỷ';
	END IF;
	IF EXISTS (SELECT 1 FROM users u WHERE u.role_id IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = u.role_id)
		AND u.role_id IN (SELECT old_id FROM m UNION SELECT tmp_id FROM m)) THEN
		RAISE EXCEPTION 'Có tài khoản trỏ tới mã vai trò không còn tồn tại — huỷ';
	END IF;
END $$;

SELECT r.id, r.name, r.code, r.is_superuser,
	(SELECT count(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS so_quyen,
	(SELECT count(*) FROM users u WHERE u.role_id = r.id) AS so_tai_khoan
FROM roles r ORDER BY r.id;
COMMIT;

-- 2026-12-16_danh_lai_ma_hoc_vien_legacy
--
-- Script nhập dữ liệu MySQL cũ (đã gỡ ở commit 2c107e9) sinh mã học viên
-- 'HV' + 18 ký tự hex (vd. HV363248563236303831), sai chk_trainees_id
-- ('HV' + năm + 4 số). Ràng buộc tạo kèm NOT VALID nên các dòng này nằm yên được,
-- nhưng mọi UPDATE vào dòng đó đều bị chặn (lỗi 23514), vd. khi tự xếp vòng thực
-- hành ghi trainees.legacy_code.
--
-- File này cấp lại mã đúng chuẩn cho mọi học viên có mã sai: năm lấy theo
-- created_at, số chạy tiếp sau trainee_year_register (và sau mã lớn nhất đang có
-- của năm đó), xếp theo created_at, id. Cập nhật mọi nơi giữ mã học viên:
--   course_enrollments.trainee_id, trainee_documents.trainee_id (FK),
--   training_files.entity_id (entity_type = 'trainee_document'),
--   persons.origin_id (origin_table = 'trainees').
-- training_files.file_url giữ nguyên: tệp vẫn nằm ở thư mục cũ trên đĩa, link cũ vẫn mở được.
-- Xong thì VALIDATE chk_trainees_id để từ giờ không còn mã sai lọt vào.
-- Chạy lại an toàn: lần sau không còn dòng nào để đổi.

CREATE TEMP TABLE trainee_id_map ON COMMIT DROP AS
WITH bad AS (
	SELECT
		id AS old_id,
		CASE
			WHEN EXTRACT(YEAR FROM created_at) BETWEEN 2000 AND 2100 THEN EXTRACT(YEAR FROM created_at)::int
			ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int
		END AS year,
		created_at
	FROM trainees
	WHERE id NOT SIMILAR TO 'HV[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
),
base AS (
	SELECT
		y.year,
		GREATEST(
			COALESCE((SELECT r.last_seq FROM trainee_year_register r WHERE r.year = y.year), 0),
			COALESCE((
				SELECT MAX(SUBSTRING(t.id FROM 7 FOR 4)::int) FROM trainees t
				WHERE t.id SIMILAR TO 'HV[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
				  AND SUBSTRING(t.id FROM 3 FOR 4)::int = y.year
			), 0)
		) AS last_seq
	FROM (SELECT DISTINCT year FROM bad) y
)
SELECT
	b.old_id,
	b.year,
	base.last_seq + ROW_NUMBER() OVER (PARTITION BY b.year ORDER BY b.created_at, b.old_id) AS seq,
	NULL::varchar(20) AS new_id
FROM bad b
JOIN base ON base.year = b.year;

UPDATE trainee_id_map SET new_id = 'HV' || year::text || LPAD(seq::text, 4, '0');

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM trainee_id_map WHERE seq > 9999) THEN
		RAISE EXCEPTION 'Vượt quá 9999 học viên trong một năm, không cấp lại mã được';
	END IF;
END $$;

-- FK hai bảng con là NO ACTION: gỡ tạm, đổi mã cả cha lẫn con, rồi tạo lại như baseline.
ALTER TABLE course_enrollments DROP CONSTRAINT IF EXISTS fk_enroll_trainee;
ALTER TABLE trainee_documents DROP CONSTRAINT IF EXISTS fk_trndoc_trainee;

UPDATE trainees t SET id = m.new_id FROM trainee_id_map m WHERE t.id = m.old_id;
UPDATE course_enrollments e SET trainee_id = m.new_id FROM trainee_id_map m WHERE e.trainee_id = m.old_id;
UPDATE trainee_documents d SET trainee_id = m.new_id FROM trainee_id_map m WHERE d.trainee_id = m.old_id;
UPDATE training_files f SET entity_id = m.new_id
	FROM trainee_id_map m WHERE f.entity_type = 'trainee_document' AND f.entity_id = m.old_id;
UPDATE persons p SET origin_id = m.new_id
	FROM trainee_id_map m WHERE p.origin_table = 'trainees' AND p.origin_id = m.old_id;

ALTER TABLE course_enrollments ADD CONSTRAINT fk_enroll_trainee FOREIGN KEY (trainee_id) REFERENCES trainees (id) NOT VALID;
ALTER TABLE trainee_documents ADD CONSTRAINT fk_trndoc_trainee FOREIGN KEY (trainee_id) REFERENCES trainees (id) ON DELETE CASCADE NOT VALID;
-- Baseline có VALIDATE hai FK này; DB nào còn dòng mồ côi thì để NOT VALID như cũ
-- thay vì làm hỏng cả file.
DO $$
BEGIN
	ALTER TABLE course_enrollments VALIDATE CONSTRAINT fk_enroll_trainee;
EXCEPTION WHEN foreign_key_violation THEN
	RAISE NOTICE 'fk_enroll_trainee: còn dòng mồ côi, giữ NOT VALID';
END $$;
DO $$
BEGIN
	ALTER TABLE trainee_documents VALIDATE CONSTRAINT fk_trndoc_trainee;
EXCEPTION WHEN foreign_key_violation THEN
	RAISE NOTICE 'fk_trndoc_trainee: còn dòng mồ côi, giữ NOT VALID';
END $$;

-- Bộ đếm năm chạy tiếp sau số vừa cấp, genTraineeId không sinh trùng.
INSERT INTO trainee_year_register (year, last_seq, updated_by)
SELECT year, MAX(seq), 'MIGRATION' FROM trainee_id_map GROUP BY year
ON CONFLICT (year) DO UPDATE
	SET last_seq = GREATEST(trainee_year_register.last_seq, EXCLUDED.last_seq),
	    updated_at = LOCALTIMESTAMP,
	    updated_by = EXCLUDED.updated_by;

ALTER TABLE trainees VALIDATE CONSTRAINT chk_trainees_id;

/* ============================================================================
 * 2026-12-29_dang_ky_khoa_hoc_ho_so_bat_buoc
 * ----------------------------------------------------------------------------
 *   Hồ sơ bắt buộc khi đăng ký khóa đào tạo liên tục (form /dang-ky-khoa-hoc):
 *
 *   course_registration_files — file hồ sơ của 1 lượt đăng ký, mỗi loại 1 file
 *   (PK enrollment_id + kind). file_id luôn trỏ training_files:
 *     - nội viện: application_signed (đơn đã ký), proposal_approved (tờ trình đã
 *       duyệt) — file entity 'course_registration';
 *     - ngoại viện: national_id, degree, license, decision — chính file của
 *       trainee_documents (tab "Hồ sơ" học viên), trainee_document_id trỏ dòng đó;
 *     - dossier: 1 file PDF gộp nộp theo cách cũ (chỉ dữ liệu cũ, không nộp mới).
 *   Backfill course_registrations.dossier_file_id → kind 'dossier'. Hai cột
 *   dossier_file_id / dossier_uploaded_at ngừng dùng (giữ để rollback ứng dụng,
 *   xóa ở migration sau).
 *
 *   trainee_document_types: bảo đảm có 4 loại giấy tờ dùng cho ngoại viện.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS course_registration_files (
	enrollment_id varchar(20) NOT NULL,
	kind varchar(30) NOT NULL,
	file_id varchar(20) NOT NULL,
	trainee_document_id varchar(20),
	uploaded_at timestamp(3) DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT NULL,
	created_at timestamp(6) DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT NULL,
	created_by varchar(20),
	updated_at timestamp(6),
	updated_by varchar(20),
	CONSTRAINT course_registration_files_pkey PRIMARY KEY (enrollment_id, kind)
);

ALTER TABLE course_registration_files DROP CONSTRAINT IF EXISTS chk_crfile_kind;
ALTER TABLE course_registration_files ADD CONSTRAINT chk_crfile_kind CHECK (kind IN (
	'dossier', 'application_signed', 'proposal_approved', 'national_id', 'degree', 'license', 'decision'
));

ALTER TABLE course_registration_files DROP CONSTRAINT IF EXISTS fk_crfile_registration;
ALTER TABLE course_registration_files ADD CONSTRAINT fk_crfile_registration
	FOREIGN KEY (enrollment_id) REFERENCES course_registrations (enrollment_id) ON DELETE CASCADE;
ALTER TABLE course_registration_files DROP CONSTRAINT IF EXISTS fk_crfile_file;
ALTER TABLE course_registration_files ADD CONSTRAINT fk_crfile_file
	FOREIGN KEY (file_id) REFERENCES training_files (id);
ALTER TABLE course_registration_files DROP CONSTRAINT IF EXISTS fk_crfile_trainee_document;
ALTER TABLE course_registration_files ADD CONSTRAINT fk_crfile_trainee_document
	FOREIGN KEY (trainee_document_id) REFERENCES trainee_documents (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_crfile_file ON course_registration_files (file_id);
CREATE INDEX IF NOT EXISTS ix_crfile_trainee_document ON course_registration_files (trainee_document_id)
	WHERE trainee_document_id IS NOT NULL;

-- 4 loại giấy tờ của ngoại viện (danh mục seed đã có; DB nâng cấp tay có thể thiếu)
INSERT INTO trainee_document_types (id, name, description, required_for_types, display_order) VALUES
	('national_id', 'CCCD / CMND', NULL, 'TRNTP-GPHN,TRNTP-DTLT,TRNTP-CTCV', 1),
	('degree', 'Bằng tốt nghiệp', NULL, 'TRNTP-GPHN,TRNTP-DTLT,TRNTP-CTCV', 3),
	('license', 'Chứng chỉ hành nghề', NULL, NULL, 5),
	('decision', 'Quyết định cử đi học', NULL, 'TRNTP-DTLT', 9)
ON CONFLICT (id) DO NOTHING;

-- Hồ sơ nộp bổ sung cũ (nội viện, 1 PDF gộp đơn + tờ trình) → kind 'dossier'
INSERT INTO course_registration_files (enrollment_id, kind, file_id, uploaded_at, created_at, created_by)
SELECT r.enrollment_id, 'dossier', r.dossier_file_id,
       COALESCE(r.dossier_uploaded_at, r.created_at::timestamp(3)),
       COALESCE(r.dossier_uploaded_at::timestamp(6), r.created_at),
       r.updated_by
FROM course_registrations r
WHERE r.dossier_file_id IS NOT NULL
ON CONFLICT (enrollment_id, kind) DO NOTHING;

COMMENT ON TABLE course_registration_files IS
	'File hồ sơ của 1 lượt đăng ký khóa ĐTLT, mỗi loại 1 file (registrationFileKinds.js)';
COMMENT ON COLUMN course_registrations.dossier_file_id IS
	'Ngừng dùng từ 2026-12-29 — đọc course_registration_files (kind = dossier)';
COMMENT ON COLUMN course_registrations.dossier_uploaded_at IS
	'Ngừng dùng từ 2026-12-29 — đọc course_registration_files.uploaded_at';

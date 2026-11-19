/* ============================================================================
 * 2026-12-27_dang_ky_khoa_hoc_don_va_xac_minh
 * ----------------------------------------------------------------------------
 *   Form đăng ký khóa đào tạo liên tục (nội viện / ngoại viện) thay Google Form:
 *
 *   course_registrations — 1 dòng / lượt ghi danh tạo từ form đăng ký. Giữ nguyên
 *   văn dữ liệu người đăng ký đã khai (snapshot, chuỗi JSON) để in "Đơn đăng ký học
 *   khóa đào tạo y tế liên tục" và để phòng Đào tạo đối chiếu với hồ sơ học viên;
 *   kèm mã đăng ký, cam kết nội quy, email đã xác minh, thông tin xuất hóa đơn,
 *   các mốc đối chiếu (CCCD, văn bằng, tờ trình) và file hồ sơ nộp bổ sung
 *   (nội viện: đơn + tờ trình đã duyệt, 1 file PDF).
 *
 *   registration_email_otps — mã OTP xác minh email trước khi gửi đăng ký. Không
 *   lưu email gốc (chỉ băm); nội viện gửi tới email trong hồ sơ nhân sự
 *   (staff_user_id). Dòng hết hạn do job dọn dữ liệu xóa.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS course_registrations (
	enrollment_id varchar(20) NOT NULL,
	registration_code varchar(16) NOT NULL,
	source varchar(10) NOT NULL,
	channel varchar(10) DEFAULT 'public' NOT NULL,
	staff_user_id varchar(20),
	staff_number integer,
	department_id varchar(20),
	snapshot text NOT NULL,
	rules_version varchar(20),
	rules_accepted_at timestamp(3),
	declared_true_at timestamp(3),
	verified_email varchar(100),
	email_verified_at timestamp(3),
	invoice_org_name varchar(255),
	invoice_org_address varchar(255),
	invoice_tax_code varchar(20),
	invoice_budget_code varchar(20),
	invoice_email varchar(100),
	id_checked_at timestamp(3),
	id_checked_by varchar(20),
	degree_checked_at timestamp(3),
	degree_checked_by varchar(20),
	proposal_checked_at timestamp(3),
	proposal_checked_by varchar(20),
	dossier_file_id varchar(20),
	dossier_uploaded_at timestamp(3),
	created_at timestamp(6) DEFAULT LOCALTIMESTAMP NOT NULL,
	created_by varchar(20),
	updated_at timestamp(6),
	updated_by varchar(20),
	CONSTRAINT course_registrations_pkey PRIMARY KEY (enrollment_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_registrations_code ON course_registrations (registration_code);
CREATE INDEX IF NOT EXISTS ix_course_registrations_staff ON course_registrations (staff_user_id) WHERE staff_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_course_registrations_department ON course_registrations (department_id) WHERE department_id IS NOT NULL;

ALTER TABLE course_registrations DROP CONSTRAINT IF EXISTS chk_course_registrations_source;
ALTER TABLE course_registrations ADD CONSTRAINT chk_course_registrations_source CHECK (source = 'internal' OR source = 'external');
ALTER TABLE course_registrations DROP CONSTRAINT IF EXISTS chk_course_registrations_channel;
ALTER TABLE course_registrations ADD CONSTRAINT chk_course_registrations_channel CHECK (channel = 'public' OR channel = 'portal');

ALTER TABLE course_registrations DROP CONSTRAINT IF EXISTS fk_course_registrations_enrollment;
ALTER TABLE course_registrations ADD CONSTRAINT fk_course_registrations_enrollment
	FOREIGN KEY (enrollment_id) REFERENCES course_enrollments (id) ON DELETE CASCADE;
ALTER TABLE course_registrations DROP CONSTRAINT IF EXISTS fk_course_registrations_dossier;
ALTER TABLE course_registrations ADD CONSTRAINT fk_course_registrations_dossier
	FOREIGN KEY (dossier_file_id) REFERENCES training_files (id);

CREATE TABLE IF NOT EXISTS registration_email_otps (
	id varchar(32) NOT NULL,
	email_hash char(64) NOT NULL,
	staff_user_id varchar(20),
	code_hash char(64) NOT NULL,
	attempts integer DEFAULT 0 NOT NULL,
	expires_at timestamp(6) NOT NULL,
	created_at timestamp(6) DEFAULT (now() AT TIME ZONE 'UTC') NOT NULL,
	created_by varchar(20),
	updated_at timestamp(6),
	updated_by varchar(20),
	CONSTRAINT registration_email_otps_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_registration_email_otps_expires ON registration_email_otps (expires_at);

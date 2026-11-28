/* ============================================================================
 * 2027-01-22_kieu_cham_cong_theo_loai_hinh
 * ----------------------------------------------------------------------------
 *   Kiểu chấm công theo loại hình đào tạo, khóa học được ghi đè (utils/attendanceMode.js):
 *     session  theo buổi học: học viên quét QR / chấm vân tay ghép vào buổi; không có ca
 *     shift    theo ca: giờ vào / ra theo mẫu ca tuần; buổi học không nhận QR / vân tay
 *              (giảng viên vẫn điểm danh tay được)
 *     both     cả hai (như trước đây — mặc định)
 *     none     không chấm công (e-learning, trực tuyến)
 *   Kiểu của 1 khóa = courses.attendance_mode, NULL ⇒ theo loại hình (training_types),
 *   loại hình chưa có ⇒ 'both'.
 *   Mẫu ca tuần của 1 khóa = courses.shift_pattern_id ⇒ training_types.shift_pattern_id ⇒
 *   mẫu mặc định toàn viện (shift_patterns.is_default).
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE training_types ADD COLUMN IF NOT EXISTS attendance_mode varchar(10) DEFAULT 'both' NOT NULL;
ALTER TABLE training_types ADD COLUMN IF NOT EXISTS shift_pattern_id integer;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS attendance_mode varchar(10);

ALTER TABLE training_types DROP CONSTRAINT IF EXISTS chk_training_types_attendance_mode;
ALTER TABLE training_types ADD CONSTRAINT chk_training_types_attendance_mode
	CHECK (attendance_mode IN ('session', 'shift', 'both', 'none'));
ALTER TABLE courses DROP CONSTRAINT IF EXISTS chk_courses_attendance_mode;
ALTER TABLE courses ADD CONSTRAINT chk_courses_attendance_mode
	CHECK (attendance_mode IS NULL OR attendance_mode IN ('session', 'shift', 'both', 'none'));

-- Xóa mẫu ca ⇒ loại hình về mẫu mặc định toàn viện
ALTER TABLE training_types DROP CONSTRAINT IF EXISTS fk_training_types_shift_pattern;
ALTER TABLE training_types ADD CONSTRAINT fk_training_types_shift_pattern
	FOREIGN KEY (shift_pattern_id) REFERENCES shift_patterns (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_training_types_shift_pattern ON training_types (shift_pattern_id)
	WHERE shift_pattern_id IS NOT NULL;

COMMENT ON COLUMN training_types.attendance_mode IS
	'Kiểu chấm công mặc định của loại hình: session = theo buổi học, shift = theo ca, both = cả hai, none = không chấm công';
COMMENT ON COLUMN training_types.shift_pattern_id IS
	'Mẫu ca tuần mặc định của loại hình (khóa chưa gán mẫu riêng); NULL = mẫu mặc định toàn viện';
COMMENT ON COLUMN courses.attendance_mode IS
	'Kiểu chấm công riêng của khóa; NULL = theo loại hình đào tạo';

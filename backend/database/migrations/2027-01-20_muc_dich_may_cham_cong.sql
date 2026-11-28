/* ============================================================================
 * 2027-01-20_muc_dich_may_cham_cong
 * ----------------------------------------------------------------------------
 *   Mục đích của từng máy chấm công (modules/attendanceDevices/devicePurpose.js):
 *     training  chấm công học viên: nhận danh sách học viên + vân tay, lượt chấm ghép vào
 *               buổi học và điểm danh theo ca (như trước đây — mặc định cho máy đã có)
 *     seminar   dành cho hội nghị: không nhận học viên, lượt chấm KHÔNG tính vào buổi học / ca
 *     both      cả hai
 *   attendance_punches.match_status thêm 'not_training' = lượt chấm ở máy không dùng cho
 *   đào tạo (giữ lại để xem, không ghép). Đổi máy về đào tạo thì lượt gần đây được ghép lại.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE attendance_devices ADD COLUMN IF NOT EXISTS purpose varchar(10) DEFAULT 'training' NOT NULL;

ALTER TABLE attendance_devices DROP CONSTRAINT IF EXISTS chk_attdev_purpose;
ALTER TABLE attendance_devices ADD CONSTRAINT chk_attdev_purpose
	CHECK (purpose IN ('training', 'seminar', 'both'));

COMMENT ON COLUMN attendance_devices.purpose IS
	'Mục đích máy: training = chấm công học viên, seminar = hội nghị (không nhận học viên, không ghép buổi học / ca), both = cả hai';

ALTER TABLE attendance_punches DROP CONSTRAINT IF EXISTS chk_attpunch_match_status;
ALTER TABLE attendance_punches ADD CONSTRAINT chk_attpunch_match_status
	CHECK (match_status IN ('pending', 'matched', 'no_trainee', 'no_session', 'kept_manual', 'locked', 'not_training'));

/* ============================================================================
 * 2027-01-23_phuong_thuc_diem_danh
 * ----------------------------------------------------------------------------
 *   Phương thức điểm danh được phép theo loại hình đào tạo (utils/attendanceMethods.js):
 *     qr      học viên quét mã QR của buổi học
 *     app     học viên bấm vào / ra ca trên ứng dụng (kèm IP + GPS)
 *     device  máy chấm công vân tay (buổi học và ca)
 *   Điểm danh tay của giảng viên / quản lý luôn được phép (đường sửa sai).
 *   training_types.attendance_methods = danh sách phân cách dấu phẩy;
 *     NULL  = mọi phương thức đang bật ở Cấu hình hệ thống (như trước đây — mặc định)
 *     ''    = chỉ điểm danh tay
 *   Công tắc toàn hệ thống + phương thức theo loại hội nghị nằm ở system_settings
 *   (ATTENDANCE_METHOD_*, SEMINAR_CHECKIN_*), không cần cột.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE training_types ADD COLUMN IF NOT EXISTS attendance_methods varchar(50);

ALTER TABLE training_types DROP CONSTRAINT IF EXISTS chk_training_types_attendance_methods;
ALTER TABLE training_types ADD CONSTRAINT chk_training_types_attendance_methods
	CHECK (attendance_methods IS NULL
		OR attendance_methods ~ '^((qr|app|device)(,(qr|app|device))*)?$');

COMMENT ON COLUMN training_types.attendance_methods IS
	'Phương thức điểm danh được phép (qr, app, device — phân cách dấu phẩy); NULL = mọi phương thức đang bật trên hệ thống, rỗng = chỉ điểm danh tay';

/* ============================================================================
 * 2027-01-10_may_cham_cong_chong_gia_serial
 * ----------------------------------------------------------------------------
 *   Rà bảo mật 2026-11-26 (S-01): máy chấm công chỉ nhận diện bằng số serial (in trên
 *   tem máy). attendanceDevices/iclockGuard.js phát hiện 1 serial gọi xen kẽ từ 2 IP
 *   (có máy giả) ⇒ tạm khoá máy; giữ lệnh vài phút sau khi máy đổi IP.
 *     prev_ip / ip_changed_at   IP trước lần đổi gần nhất và thời điểm đổi (UTC)
 *     suspended_at / suspend_reason   lúc và lý do tạm khoá (UTC)
 *     status 'suspended'        tạm khoá: không giao lệnh, không nhận lượt chấm (máy giữ
 *                               dữ liệu, gửi lại sau khi quản trị mở lại)
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE attendance_devices ADD COLUMN IF NOT EXISTS prev_ip varchar(45);
ALTER TABLE attendance_devices ADD COLUMN IF NOT EXISTS ip_changed_at timestamp(3);
ALTER TABLE attendance_devices ADD COLUMN IF NOT EXISTS suspended_at timestamp(3);
ALTER TABLE attendance_devices ADD COLUMN IF NOT EXISTS suspend_reason varchar(255);

ALTER TABLE attendance_devices DROP CONSTRAINT IF EXISTS chk_attdev_status;
ALTER TABLE attendance_devices ADD CONSTRAINT chk_attdev_status
	CHECK (status IN ('pending', 'active', 'disabled', 'suspended'));

COMMENT ON COLUMN attendance_devices.prev_ip IS 'IP trước lần đổi IP gần nhất (phát hiện 1 serial gọi từ 2 nơi)';
COMMENT ON COLUMN attendance_devices.ip_changed_at IS 'Thời điểm đổi IP gần nhất (UTC)';
COMMENT ON COLUMN attendance_devices.suspended_at IS 'Thời điểm tạm khoá do nghi giả số serial (UTC)';
COMMENT ON COLUMN attendance_devices.suspend_reason IS 'Lý do tạm khoá';

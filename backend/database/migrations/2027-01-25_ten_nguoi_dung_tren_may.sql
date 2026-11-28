/* ============================================================================
 * 2027-01-25_ten_nguoi_dung_tren_may
 * ----------------------------------------------------------------------------
 *   Tên người dùng khai trên máy chấm công (máy gửi lên qua OPERLOG / USERINFO:
 *   "USER PIN=..\tName=.."). Chỉ để hiển thị cho mã trên máy KHÔNG khớp được cán bộ / học
 *   viên (vd nhập người tham dự hội nghị từ máy — seminars/seminarDeviceImportService.js).
 *   Máy gửi lại khi kết nối lần đầu, khi thêm / sửa người ở máy, hoặc khi quản trị bấm
 *   "Lấy vân tay có sẵn trên máy" (lệnh CHECK).
 *   Tên do người đứng máy gõ — không phải dữ liệu định danh đã xác minh.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS attendance_device_people (
	device_id integer NOT NULL,
	pin varchar(24) NOT NULL,
	name varchar(100),
	updated_at timestamp(3) DEFAULT (now() AT TIME ZONE 'UTC') NOT NULL,
	CONSTRAINT attendance_device_people_pkey PRIMARY KEY (device_id, pin)
);

ALTER TABLE attendance_device_people DROP CONSTRAINT IF EXISTS fk_attdevpeople_device;
ALTER TABLE attendance_device_people ADD CONSTRAINT fk_attdevpeople_device
	FOREIGN KEY (device_id) REFERENCES attendance_devices (id) ON DELETE CASCADE;
-- Tra tên theo mã trên mọi máy
CREATE INDEX IF NOT EXISTS ix_attdevpeople_pin ON attendance_device_people (pin);

COMMENT ON TABLE attendance_device_people IS
	'Tên người dùng khai trên máy chấm công theo mã trên máy (PIN) — máy gửi lên qua OPERLOG / USERINFO';

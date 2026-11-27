/* ============================================================================
 * 2027-01-12_diem_danh_ca_tu_may_cham_cong
 * ----------------------------------------------------------------------------
 *   Lượt chấm vân tay của học viên ghi luôn vào điểm danh theo ca (staff_attendance):
 *   giờ vào = lượt sớm nhất, giờ ra = lượt muộn nhất của lần ca
 *   (modules/attendance/deviceShiftService.js, utils/attendanceShift.assignPunches).
 *     check_in_device_id / check_out_device_id   máy ghi giờ vào / giờ ra;
 *                                                NULL = bấm điểm danh trên web (có IP, GPS)
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS check_in_device_id integer;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS check_out_device_id integer;

ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS fk_staff_att_in_device;
ALTER TABLE staff_attendance ADD CONSTRAINT fk_staff_att_in_device
	FOREIGN KEY (check_in_device_id) REFERENCES attendance_devices (id) ON DELETE SET NULL;
ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS fk_staff_att_out_device;
ALTER TABLE staff_attendance ADD CONSTRAINT fk_staff_att_out_device
	FOREIGN KEY (check_out_device_id) REFERENCES attendance_devices (id) ON DELETE SET NULL;

COMMENT ON COLUMN staff_attendance.check_in_device_id IS 'Máy chấm công ghi giờ vào (NULL = điểm danh trên web)';
COMMENT ON COLUMN staff_attendance.check_out_device_id IS 'Máy chấm công ghi giờ ra (NULL = điểm danh trên web)';

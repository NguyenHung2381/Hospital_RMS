/* ============================================================================
 * 2027-01-06_may_cham_cong_day_tay
 * ----------------------------------------------------------------------------
 *   Đẩy tay học viên xuống máy chấm công (trang Tất cả học viên): học viên chưa thuộc
 *   khóa nào đang học (vd. khóa còn xa ngày khai giảng, cần đăng ký vân tay sớm) vẫn
 *   được giữ trên máy tới until_date. attendanceDevices/desiredTrainees.js gộp bảng
 *   này vào danh sách "cần có"; quá until_date mà không còn khóa đang học thì bị dọn
 *   khỏi máy như bình thường.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS attendance_device_manual (
	trainee_id varchar(20) NOT NULL,
	until_date date NOT NULL,
	created_at timestamp(3) DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT NULL,
	created_by varchar(20),
	updated_at timestamp(3),
	updated_by varchar(20),
	CONSTRAINT attendance_device_manual_pkey PRIMARY KEY (trainee_id)
);

ALTER TABLE attendance_device_manual DROP CONSTRAINT IF EXISTS fk_attdevmanual_trainee;
ALTER TABLE attendance_device_manual ADD CONSTRAINT fk_attdevmanual_trainee
	FOREIGN KEY (trainee_id) REFERENCES trainees (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_attdevmanual_until ON attendance_device_manual (until_date);

COMMENT ON TABLE attendance_device_manual IS
	'Học viên được đẩy tay xuống máy chấm công — giữ trên máy tới until_date dù chưa có khóa đang học';

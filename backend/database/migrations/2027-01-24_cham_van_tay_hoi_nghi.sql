/* ============================================================================
 * 2027-01-24_cham_van_tay_hoi_nghi
 * ----------------------------------------------------------------------------
 *   Điểm danh hội nghị bằng máy chấm công vân tay (attendanceDevices/seminarPunchMatcher.js):
 *   lượt chấm ở máy dành cho hội nghị (purpose seminar / both) được ghép vào người tham dự
 *   hội nghị đang diễn ra hôm đó:
 *     PIN = mã nhân viên  ⇒ seminar_participants.staff_number / users.staff_number
 *     PIN = mã học viên   ⇒ HV + 8 số ⇒ trainees.user_id = seminar_participants.user_id
 *   attendance_punches.seminar_id / seminar_participant_id = kết quả ghép (độc lập với
 *   match_status — kết quả ghép buổi học của máy dùng chung).
 *   seminar_participants.checkin_method = cách điểm danh: qr / ticket / device.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE attendance_punches ADD COLUMN IF NOT EXISTS seminar_id varchar(20);
ALTER TABLE attendance_punches ADD COLUMN IF NOT EXISTS seminar_participant_id varchar(24);

-- Xóa hội nghị / người tham dự thì lượt chấm giữ lại (về chưa ghép)
ALTER TABLE attendance_punches DROP CONSTRAINT IF EXISTS fk_attpunch_seminar;
ALTER TABLE attendance_punches ADD CONSTRAINT fk_attpunch_seminar
	FOREIGN KEY (seminar_id) REFERENCES seminars (id) ON DELETE SET NULL;
ALTER TABLE attendance_punches DROP CONSTRAINT IF EXISTS fk_attpunch_seminar_participant;
ALTER TABLE attendance_punches ADD CONSTRAINT fk_attpunch_seminar_participant
	FOREIGN KEY (seminar_participant_id) REFERENCES seminar_participants (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_attpunch_seminar ON attendance_punches (seminar_id)
	WHERE seminar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_attpunch_seminar_participant ON attendance_punches (seminar_participant_id)
	WHERE seminar_participant_id IS NOT NULL;

ALTER TABLE seminar_participants ADD COLUMN IF NOT EXISTS checkin_method varchar(10);
ALTER TABLE seminar_participants DROP CONSTRAINT IF EXISTS chk_semp_checkin_method;
ALTER TABLE seminar_participants ADD CONSTRAINT chk_semp_checkin_method
	CHECK (checkin_method IS NULL OR checkin_method IN ('qr', 'ticket', 'device'));

-- Dòng đã điểm danh trước đây: QR ghi mã thiết bị, quét vé thì không
UPDATE seminar_participants
SET checkin_method = CASE WHEN checkin_device_id IS NOT NULL THEN 'qr' ELSE 'ticket' END
WHERE checked_in_at IS NOT NULL AND checkin_method IS NULL;

COMMENT ON COLUMN attendance_punches.seminar_id IS
	'Hội nghị mà lượt chấm (máy dành cho hội nghị) được ghép vào; NULL = chưa / không ghép';
COMMENT ON COLUMN attendance_punches.seminar_participant_id IS
	'Người tham dự hội nghị được điểm danh bằng lượt chấm này';
COMMENT ON COLUMN seminar_participants.checkin_method IS
	'Cách điểm danh: qr = tự quét QR hội trường, ticket = ban tổ chức quét vé, device = máy chấm công vân tay';
COMMENT ON COLUMN attendance_devices.purpose IS
	'Mục đích máy: training = chấm công học viên, seminar = hội nghị (lượt chấm ghép vào người tham dự theo mã nhân viên / mã học viên, không ghép buổi học / ca), both = cả hai';

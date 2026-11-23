/* ============================================================================
 * 2027-01-04_tro_giang_theo_buoi_hoc
 * ----------------------------------------------------------------------------
 *   Đồng giảng: 1 buổi học có 1 giảng viên chính (class_sessions.lecturer_id, giữ
 *   nguyên) + 0..n trợ giảng (bảng này). Điểm danh vẫn 1 lần / buổi.
 *
 *   session_lecturers — 1 dòng / (buổi, trợ giảng). role để dành mở rộng, hiện chỉ
 *   'assistant'. Ứng dụng không cho trợ giảng trùng giảng viên chính của buổi.
 *
 *   Xóa buổi học ⇒ dòng trợ giảng xóa theo (CASCADE). Giảng viên KHÔNG cascade (như
 *   fk_sess_lecturer): giảng viên đã dạy chỉ bị vô hiệu hóa (lecturerService.remove).
 *
 *   Dùng ở: classSessionService (đọc / ghi), lecturerAssignmentService (phân công GV
 *   phụ theo bài suy ra từ buổi), courseCmeService (giờ giảng), sessionLecturerImport
 *   (nhập kế hoạch giảng dạy từ Excel).
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS session_lecturers (
	session_id varchar(20) NOT NULL,
	lecturer_id varchar(20) NOT NULL,
	role varchar(10) DEFAULT 'assistant' NOT NULL,
	created_at timestamp(6) DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT NULL,
	created_by varchar(20),
	CONSTRAINT session_lecturers_pkey PRIMARY KEY (session_id, lecturer_id)
);

ALTER TABLE session_lecturers DROP CONSTRAINT IF EXISTS chk_sesslec_role;
ALTER TABLE session_lecturers ADD CONSTRAINT chk_sesslec_role CHECK (role IN ('assistant'));

ALTER TABLE session_lecturers DROP CONSTRAINT IF EXISTS fk_sesslec_session;
ALTER TABLE session_lecturers ADD CONSTRAINT fk_sesslec_session
	FOREIGN KEY (session_id) REFERENCES class_sessions (id) ON DELETE CASCADE;
ALTER TABLE session_lecturers DROP CONSTRAINT IF EXISTS fk_sesslec_lecturer;
ALTER TABLE session_lecturers ADD CONSTRAINT fk_sesslec_lecturer
	FOREIGN KEY (lecturer_id) REFERENCES lecturers (id);

CREATE INDEX IF NOT EXISTS ix_sesslec_lecturer ON session_lecturers (lecturer_id);

COMMENT ON TABLE session_lecturers IS
	'Trợ giảng (đồng giảng) của từng buổi học; giảng viên chính ở class_sessions.lecturer_id';

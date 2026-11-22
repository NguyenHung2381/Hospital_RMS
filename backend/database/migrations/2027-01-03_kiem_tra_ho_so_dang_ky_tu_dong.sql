/* ============================================================================
 * 2027-01-03_kiem_tra_ho_so_dang_ky_tu_dong
 * ----------------------------------------------------------------------------
 *   Tự kiểm tra file hồ sơ đăng ký khóa ĐTLT có đúng loại không (CCCD, bằng tốt nghiệp,
 *   chứng chỉ hành nghề, quyết định cử đi học, tờ trình) — đọc lớp chữ PDF, mã QR, OCR
 *   (src/modules/training/registration/docCheck/). Chỉ để CẢNH BÁO người duyệt, không tự từ chối.
 *
 *   registration_file_checks — 1 dòng / 1 file (training_files.id). Thay file ⇒ file mới, dòng mới.
 *     status        pending → running → done | error | skipped (máy chủ không có OCR)
 *     verdict       ok (đúng loại) | mismatch (có vẻ sai loại) | unclear (không đọc được)
 *     detected_kind loại đoán được (có thể khác kind)
 *     warnings      JSON mảng mã cảnh báo (blank, cccd_missing_back, name_not_found, ...)
 *     signals       JSON cờ kỹ thuật (cách đọc, có QR / MRZ, khớp họ tên / số CCCD, điểm...)
 *                   — KHÔNG lưu chữ đọc được hay nội dung QR (dữ liệu cá nhân).
 *     sha256        băm nội dung file — phát hiện 1 file nộp cho nhiều loại
 *
 *   Xếp hàng sẵn các file hồ sơ hiện có để có kết quả cho đơn cũ.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS registration_file_checks (
	file_id varchar(20) NOT NULL,
	enrollment_id varchar(20) NOT NULL,
	kind varchar(30) NOT NULL,
	status varchar(10) DEFAULT 'pending' NOT NULL,
	verdict varchar(10),
	detected_kind varchar(30),
	confidence smallint,
	warnings text,
	signals text,
	sha256 char(64),
	attempts smallint DEFAULT 0 NOT NULL,
	error varchar(300),
	created_at timestamp(3) DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT NULL,
	started_at timestamp(3),
	checked_at timestamp(3),
	CONSTRAINT registration_file_checks_pkey PRIMARY KEY (file_id),
	CONSTRAINT fk_rfcheck_file FOREIGN KEY (file_id) REFERENCES training_files (id) ON DELETE CASCADE,
	CONSTRAINT fk_rfcheck_registration FOREIGN KEY (enrollment_id)
		REFERENCES course_registrations (enrollment_id) ON DELETE CASCADE,
	CONSTRAINT chk_rfcheck_status CHECK (status IN ('pending', 'running', 'done', 'error', 'skipped')),
	CONSTRAINT chk_rfcheck_verdict CHECK (verdict IS NULL OR verdict IN ('ok', 'mismatch', 'unclear'))
);

-- Hàng đợi: chỉ các dòng chưa xong
CREATE INDEX IF NOT EXISTS ix_rfcheck_queue ON registration_file_checks (created_at)
	WHERE status IN ('pending', 'running');
-- Tìm file trùng nội dung trong cùng 1 đơn
CREATE INDEX IF NOT EXISTS ix_rfcheck_enrollment ON registration_file_checks (enrollment_id, sha256);

-- File hồ sơ hiện có (loại kiểm được, file chưa xóa) ⇒ xếp hàng kiểm
INSERT INTO registration_file_checks (file_id, enrollment_id, kind)
SELECT crf.file_id, crf.enrollment_id, crf.kind
FROM course_registration_files crf
JOIN training_files f ON f.id = crf.file_id AND f.is_deleted = 'false'
WHERE crf.kind IN ('national_id', 'degree', 'license', 'decision', 'proposal_approved')
ON CONFLICT (file_id) DO NOTHING;

COMMENT ON TABLE registration_file_checks IS
	'Kết quả tự kiểm tra loại file hồ sơ đăng ký khóa ĐTLT (docCheck/) — chỉ cảnh báo người duyệt';

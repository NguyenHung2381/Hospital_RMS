/* ============================================================================
 * 2027-01-09_kiem_tra_chu_ky_ho_so
 * ----------------------------------------------------------------------------
 *   Kiểm tra chữ ký trên giấy tờ upload (docCheck/signature/) — nối vào hàng đợi
 *   registration_file_checks (2027-01-03) cho 2 luồng. Chỉ CẢNH BÁO người duyệt.
 *
 *   registration_file_checks (giữ tên bảng):
 *     source              registration (file hồ sơ đăng ký khóa ĐTLT, như cũ)
 *                         | trainee_document (học viên tự nộp ở /me/trainee-documents)
 *     enrollment_id       nay được NULL — chỉ bắt buộc khi source = registration
 *     trainee_document_id trainee_documents.id — chỉ bắt buộc khi source = trainee_document
 *                         (đúng 1 trong 2 khác NULL theo source: chk_rfcheck_source_ref)
 *     sig_verdict         kết luận chữ ký (signature/signatureRules.js):
 *                         ok | warn | missing | unclear | n/a — NULL = chưa kiểm chữ ký
 *                         (công tắc TRAINING_DOC_SIGNATURE_CHECK tắt lúc kiểm)
 *     sig_details         JSON: tóm tắt chữ ký số (verdict, người ký cn / o, CA cấp, thời điểm
 *                         ký, mã cảnh báo), dấu / chữ ký tay theo trang, mã cảnh báo.
 *                         KHÔNG lưu chữ đọc được.
 *
 *   Xếp hàng sẵn file hồ sơ học viên (bản PDF gộp) đang chờ duyệt — chỉ được xử lý khi bật
 *   công tắc kiểm chữ ký.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE registration_file_checks
	ADD COLUMN IF NOT EXISTS source varchar(20) DEFAULT 'registration' NOT NULL,
	ADD COLUMN IF NOT EXISTS trainee_document_id varchar(20),
	ADD COLUMN IF NOT EXISTS sig_verdict varchar(10),
	ADD COLUMN IF NOT EXISTS sig_details text;

ALTER TABLE registration_file_checks ALTER COLUMN enrollment_id DROP NOT NULL;

ALTER TABLE registration_file_checks DROP CONSTRAINT IF EXISTS fk_rfcheck_trainee_document;
ALTER TABLE registration_file_checks ADD CONSTRAINT fk_rfcheck_trainee_document
	FOREIGN KEY (trainee_document_id) REFERENCES trainee_documents (id) ON DELETE CASCADE;

ALTER TABLE registration_file_checks DROP CONSTRAINT IF EXISTS chk_rfcheck_source;
ALTER TABLE registration_file_checks ADD CONSTRAINT chk_rfcheck_source
	CHECK (source IN ('registration', 'trainee_document'));

ALTER TABLE registration_file_checks DROP CONSTRAINT IF EXISTS chk_rfcheck_source_ref;
ALTER TABLE registration_file_checks ADD CONSTRAINT chk_rfcheck_source_ref CHECK (
	(source = 'registration' AND enrollment_id IS NOT NULL AND trainee_document_id IS NULL)
	OR (source = 'trainee_document' AND trainee_document_id IS NOT NULL AND enrollment_id IS NULL)
);

ALTER TABLE registration_file_checks DROP CONSTRAINT IF EXISTS chk_rfcheck_sig_verdict;
ALTER TABLE registration_file_checks ADD CONSTRAINT chk_rfcheck_sig_verdict
	CHECK (sig_verdict IS NULL OR sig_verdict IN ('ok', 'warn', 'missing', 'unclear', 'n/a'));

-- Gắn kết quả vào danh sách hồ sơ của 1 học viên (traineeRecordService.documentChecklist)
CREATE INDEX IF NOT EXISTS ix_rfcheck_trainee_document ON registration_file_checks (trainee_document_id)
	WHERE trainee_document_id IS NOT NULL;
-- ix_rfcheck_enrollment (enrollment_id, sha256) giữ nguyên: dòng trainee_document có enrollment_id NULL.

-- Hồ sơ học viên tự nộp đang chờ duyệt (file chưa xóa, chưa có dòng kiểm) ⇒ xếp hàng
INSERT INTO registration_file_checks (file_id, source, trainee_document_id, kind)
SELECT d.file_id, 'trainee_document', d.id, 'trainee_document'
FROM trainee_documents d
JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 'false'
WHERE d.status = 'pending' AND d.doc_type = 'profile'
ON CONFLICT (file_id) DO NOTHING;

COMMENT ON TABLE registration_file_checks IS
	'Kết quả tự kiểm tra file hồ sơ đăng ký khóa ĐTLT + hồ sơ học viên (loại giấy tờ, chữ ký) — docCheck/, chỉ cảnh báo người duyệt';

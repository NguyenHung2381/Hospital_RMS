/* ============================================================================
 * 2026-12-22_ho_so_hoc_vien_1_file_pdf
 * ----------------------------------------------------------------------------
 *   Hồ sơ học viên gộp thành 1 file PDF đầy đủ thông tin — không còn chọn loại
 *   giấy tờ (CCCD, bằng cấp...) cho từng file. trainee_documents.doc_type vẫn
 *   NOT NULL + FK sang trainee_document_types ⇒ thêm loại cố định 'profile' mà
 *   mọi file mới dùng (traineeProfilePdf.PROFILE_DOC_TYPE).
 *
 *   Cột required_for_types của các loại cũ không còn được đọc: trạng thái hồ sơ
 *   giờ chỉ là đã nộp / chờ duyệt / chưa nộp (traineeDocumentSql.DOC_STATE_SQL).
 *   Các loại & file cũ giữ nguyên, file cũ vẫn tính là đã nộp.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

INSERT INTO trainee_document_types (id, name, description, required_for_types, display_order)
VALUES ('profile', 'Hồ sơ học viên (PDF)', 'Một file PDF gộp đủ thông tin học viên', NULL, 0)
ON CONFLICT (id) DO NOTHING;

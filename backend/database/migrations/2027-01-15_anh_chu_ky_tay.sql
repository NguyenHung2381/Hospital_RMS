/* ============================================================================
 * 2027-01-15_anh_chu_ky_tay
 * ----------------------------------------------------------------------------
 *   Ảnh chữ ký tay hiện trong khung chữ ký số (VIN-HSM typesignature 2/3).
 *
 *   signing_accounts
 *     signature_image      PNG nền trong suốt đã chuẩn hóa (signing/signatureImage.js), base64.
 *                          Server tự vẽ lại ảnh (bỏ nền trắng, cắt sát nét, thu nhỏ) — không lưu
 *                          file gốc người dùng tải lên. Chỉ chủ tài khoản đọc được qua API.
 *     signature_show_text  true = kèm dòng người ký / ngày ký dưới ảnh (typesignature 3),
 *                          false = chỉ ảnh chữ ký (typesignature 2)
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE signing_accounts
	ADD COLUMN IF NOT EXISTS signature_image text,
	ADD COLUMN IF NOT EXISTS signature_show_text boolean DEFAULT false NOT NULL;

-- PNG base64 tối đa ~400KB (ảnh đã thu nhỏ còn vài chục KB)
ALTER TABLE signing_accounts DROP CONSTRAINT IF EXISTS chk_signacc_sigimg_len;
ALTER TABLE signing_accounts ADD CONSTRAINT chk_signacc_sigimg_len
	CHECK (signature_image IS NULL OR length(signature_image) <= 550000);

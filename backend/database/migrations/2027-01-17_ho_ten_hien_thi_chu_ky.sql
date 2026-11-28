/* ============================================================================
 * 2027-01-17_ho_ten_hien_thi_chu_ky
 * ----------------------------------------------------------------------------
 *   Họ tên in dưới khung chữ ký số (kèm học hàm / học vị, vd "TS.BS. Nguyễn Văn A").
 *
 *   signing_accounts
 *     signature_display_name  NULL = dùng users.full_name. Dùng cho dòng tên dưới khung chữ ký
 *                             trên phiếu do hệ thống dựng (phê duyệt đề tài, ký thử) và dòng
 *                             "Ký bởi" của VIN-HSM khi không có ảnh chữ ký.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE signing_accounts
	ADD COLUMN IF NOT EXISTS signature_display_name varchar(150) COLLATE "vi-VN-x-icu";

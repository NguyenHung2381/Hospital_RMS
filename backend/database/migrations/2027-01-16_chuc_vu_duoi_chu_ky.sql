/* ============================================================================
 * 2027-01-16_chuc_vu_duoi_chu_ky
 * ----------------------------------------------------------------------------
 *   Dòng chức vụ in BÊN DƯỚI ảnh chữ ký tay trong khung chữ ký số.
 *
 *   signing_accounts
 *     signature_caption    chữ in dưới ảnh chữ ký (vd "Trưởng phòng Quản lý NCKH"). NULL = lấy
 *                          chức vụ trong hồ sơ người dùng (positions.name / users.position_detail).
 *     signature_show_text  (đã có, 2027-01-15) nay nghĩa là "in chức vụ dưới chữ ký". Hệ thống tự
 *                          vẽ chữ vào ảnh và gửi VIN-HSM kiểu "chỉ ảnh" — không còn dùng dòng
 *                          "Ký bởi / Ký ngày" của VIN-HSM (luôn nằm ở mép trên khung).
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE signing_accounts
	ADD COLUMN IF NOT EXISTS signature_caption varchar(150) COLLATE "vi-VN-x-icu";

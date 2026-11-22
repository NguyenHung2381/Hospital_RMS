/* ============================================================================
 * 2027-01-01_dang_ky_khoa_hoc_xac_nhan_dien_tu
 * ----------------------------------------------------------------------------
 *   Bằng chứng xác nhận điện tử cho bản khai đăng ký khóa đào tạo liên tục
 *   (form /dang-ky-khoa-hoc). Trước đây chỉ lưu phiên bản nội quy + thời điểm
 *   tích 2 ô cam kết; giờ người đăng ký tích thêm "đồng ý xử lý dữ liệu cá nhân"
 *   và gõ lại họ tên để ký (registrationConsent.js):
 *
 *     signature_name     — họ tên người đăng ký gõ để ký
 *     data_consent_at    — thời điểm đồng ý xử lý dữ liệu cá nhân
 *     consent_ip         — IP gửi bản khai
 *     consent_user_agent — thiết bị / trình duyệt gửi bản khai
 *     consent_record     — JSON nguyên văn nội quy + các câu cam kết đúng lúc ký,
 *                          họ tên ký, thời điểm, IP, thiết bị, email đã xác minh
 *     consent_hash       — SHA-256 của consent_record (cũng gửi trong thư xác nhận
 *                          cho người đăng ký để đối chiếu độc lập)
 *
 *   Bản khai cũ để NULL (không có bằng chứng mới, không bịa dữ liệu).
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS signature_name varchar(150);
ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS data_consent_at timestamp(3);
ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS consent_ip varchar(45);
ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS consent_user_agent varchar(300);
ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS consent_record text;
ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS consent_hash char(64);

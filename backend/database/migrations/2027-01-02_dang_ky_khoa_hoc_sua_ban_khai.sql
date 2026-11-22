/* ============================================================================
 * 2027-01-02_dang_ky_khoa_hoc_sua_ban_khai
 * ----------------------------------------------------------------------------
 *   Người đăng ký khóa đào tạo liên tục tự sửa bản khai khi lượt ghi danh còn chờ
 *   duyệt (trang Tra cứu: mã đăng ký + CCCD). Mỗi lần sửa phải ghi lý do và ký lại
 *   (registrationAmendService.js). course_registrations.snapshot luôn là bản MỚI NHẤT;
 *   bản gốc lúc gửi vẫn nằm nguyên trong consent_record của course_registrations.
 *
 *   course_registration_amendments — 1 dòng / 1 lần sửa:
 *     seq              — lần sửa thứ mấy của bản khai (1, 2, ...)
 *     changes          — JSON [{ key, before, after }] các trường đã đổi
 *     identity_changed — có đổi họ tên / ngày sinh / giới tính / số CCCD không
 *     reason           — lý do người đăng ký ghi
 *     signature_name, consent_ip, consent_user_agent — họ tên gõ để ký, IP, thiết bị
 *     consent_record   — JSON nguyên văn lần sửa (thay đổi, lý do, cam kết, prev_hash)
 *     consent_hash     — SHA-256 của consent_record; prev_hash = mã của bản trước
 *                        (bản gốc hoặc lần sửa trước) ⇒ chuỗi mã không chèn / xóa được
 *
 *   course_registrations.amendment_count / amended_at — đếm nhanh cho danh sách ghi danh.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS course_registration_amendments (
	enrollment_id varchar(20) NOT NULL,
	seq smallint NOT NULL,
	changes text NOT NULL,
	identity_changed boolean DEFAULT false NOT NULL,
	reason varchar(500) NOT NULL,
	signature_name varchar(150) NOT NULL,
	consent_ip varchar(45),
	consent_user_agent varchar(300),
	consent_record text NOT NULL,
	consent_hash char(64) NOT NULL,
	prev_hash char(64),
	created_at timestamp(3) DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT NULL,
	CONSTRAINT course_registration_amendments_pkey PRIMARY KEY (enrollment_id, seq),
	CONSTRAINT fk_cr_amendments_registration FOREIGN KEY (enrollment_id)
		REFERENCES course_registrations (enrollment_id) ON DELETE CASCADE
);

ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS amendment_count smallint DEFAULT 0 NOT NULL;
ALTER TABLE course_registrations ADD COLUMN IF NOT EXISTS amended_at timestamp(3);

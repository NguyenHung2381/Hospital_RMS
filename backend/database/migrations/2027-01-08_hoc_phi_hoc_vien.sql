/* ============================================================================
 * 2027-01-08_hoc_phi_hoc_vien
 * ----------------------------------------------------------------------------
 *   Học viên nộp học phí trên cổng /hoc-vien/hoc-phi (modules/training/tuition/).
 *
 *   Luồng: chuyển khoản theo mã VietQR (số tài khoản ở Cấu hình hệ thống, nội dung
 *   chuyển khoản riêng từng lượt ghi danh) → học viên tải ảnh / PDF chứng từ ⇒ khoản
 *   nộp 'pending' → phòng Đào tạo (quyền courses:approve) đối chiếu sao kê rồi xác
 *   nhận ⇒ 'confirmed' + hệ thống cấp số biên lai (phiếu thu PDF nội bộ), hoặc từ
 *   chối ⇒ 'rejected' kèm lý do. Cán bộ cũng ghi nhận được khoản nộp tại quầy
 *   (xác nhận luôn). Một lượt ghi danh nộp được nhiều lần.
 *
 *   enrollment_fees    — số phải nộp của 1 lượt ghi danh: base_amount chép từ học phí
 *                        chương trình (training_programs.tuition_fee) lúc có thao tác
 *                        đầu tiên (miễn giảm / nộp tiền) — đổi học phí chương trình sau
 *                        đó không làm đổi khoản đã chốt. Chưa có dòng ⇒ tính theo học
 *                        phí chương trình hiện tại. discount_amount = miễn / giảm.
 *   tuition_payments   — từng lần nộp. receipt_no 'PT<năm>-<5 số>' cấp lúc xác nhận.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS enrollment_fees (
	enrollment_id varchar(20) NOT NULL,
	base_amount numeric(18,0) DEFAULT 0 NOT NULL,
	discount_amount numeric(18,0) DEFAULT 0 NOT NULL,
	discount_reason varchar(500) COLLATE "vi-VN-x-icu",
	created_at timestamp(3) DEFAULT LOCALTIMESTAMP NOT NULL,
	created_by varchar(20),
	updated_at timestamp(3),
	updated_by varchar(20),
	CONSTRAINT enrollment_fees_pkey PRIMARY KEY (enrollment_id)
);

ALTER TABLE enrollment_fees DROP CONSTRAINT IF EXISTS fk_enrfee_enrollment;
ALTER TABLE enrollment_fees ADD CONSTRAINT fk_enrfee_enrollment
	FOREIGN KEY (enrollment_id) REFERENCES course_enrollments (id) ON DELETE CASCADE;
ALTER TABLE enrollment_fees DROP CONSTRAINT IF EXISTS chk_enrfee_amounts;
ALTER TABLE enrollment_fees ADD CONSTRAINT chk_enrfee_amounts
	CHECK (base_amount >= 0 AND discount_amount >= 0 AND discount_amount <= base_amount);

CREATE TABLE IF NOT EXISTS tuition_payments (
	id varchar(20) NOT NULL,
	enrollment_id varchar(20) NOT NULL,
	amount numeric(18,0) NOT NULL,
	method varchar(10) DEFAULT 'transfer' NOT NULL,
	status varchar(10) DEFAULT 'pending' NOT NULL,
	paid_date date NOT NULL,
	transfer_ref varchar(100),
	note varchar(500) COLLATE "vi-VN-x-icu",
	proof_file_id varchar(20),
	review_note varchar(500) COLLATE "vi-VN-x-icu",
	reviewed_by varchar(20),
	reviewed_at timestamp(3),
	receipt_no varchar(20),
	created_at timestamp(3) DEFAULT LOCALTIMESTAMP NOT NULL,
	created_by varchar(20),
	updated_at timestamp(3),
	updated_by varchar(20),
	CONSTRAINT tuition_payments_pkey PRIMARY KEY (id)
);

ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS chk_tuipay_id;
ALTER TABLE tuition_payments ADD CONSTRAINT chk_tuipay_id
	CHECK (id SIMILAR TO 'NP[0-9]{12}');
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS chk_tuipay_amount;
ALTER TABLE tuition_payments ADD CONSTRAINT chk_tuipay_amount CHECK (amount > 0);
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS chk_tuipay_method;
ALTER TABLE tuition_payments ADD CONSTRAINT chk_tuipay_method
	CHECK (method IN ('transfer', 'cash'));
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS chk_tuipay_status;
ALTER TABLE tuition_payments ADD CONSTRAINT chk_tuipay_status
	CHECK (status IN ('pending', 'confirmed', 'rejected'));
-- Đã xác nhận thì phải có số biên lai; chưa xác nhận thì chưa có
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS chk_tuipay_receipt;
ALTER TABLE tuition_payments ADD CONSTRAINT chk_tuipay_receipt
	CHECK ((status = 'confirmed') = (receipt_no IS NOT NULL));
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS uq_tuipay_receipt;
ALTER TABLE tuition_payments ADD CONSTRAINT uq_tuipay_receipt UNIQUE (receipt_no);
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS fk_tuipay_enrollment;
ALTER TABLE tuition_payments ADD CONSTRAINT fk_tuipay_enrollment
	FOREIGN KEY (enrollment_id) REFERENCES course_enrollments (id) ON DELETE CASCADE;
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS fk_tuipay_proof;
ALTER TABLE tuition_payments ADD CONSTRAINT fk_tuipay_proof
	FOREIGN KEY (proof_file_id) REFERENCES training_files (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_tuipay_enrollment ON tuition_payments (enrollment_id);
-- Danh sách chờ xác nhận (việc cần làm của phòng Đào tạo)
CREATE INDEX IF NOT EXISTS ix_tuipay_pending ON tuition_payments (created_at) WHERE status = 'pending';

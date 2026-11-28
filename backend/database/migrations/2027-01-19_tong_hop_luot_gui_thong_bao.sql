/* ============================================================================
 * 2027-01-19_tong_hop_luot_gui_thong_bao
 * ----------------------------------------------------------------------------
 *   Trang Quản lý thông báo (notificationService.adminGetAll) gom notifications theo
 *   COALESCE(batch_id, id) rồi mới sắp xếp + cắt trang, kèm 1 câu COUNT(DISTINCT ...):
 *   mỗi lần mở trang quét và sắp xếp TOÀN BỘ bảng lớn nhất hệ thống. Đo 2026-11-27 với
 *   300.000 thông báo (300 lượt × 1.000 người): ~500 ms / lần mở, sắp xếp tràn ra đĩa
 *   24 MB, tăng tuyến tính theo số thông báo.
 *
 *   notification_batches: 1 dòng / lượt gửi (nội dung chung của lượt). Trang quản trị
 *   đọc 1 trang lượt gửi theo ix_notif_batches_created, đếm người nhận / đã đọc cho
 *   đúng các lượt đó qua ix_notif_batch_read — chi phí theo kích thước trang, không theo
 *   kích thước bảng.
 *
 *   notifications.batch_id: dòng cũ (trước khi có batch_id) lấy chính id của nó — đúng
 *   khoá gộp cũ COALESCE(batch_id, id), nên batch_key client đang giữ không đổi. Sau đó
 *   NOT NULL + khoá ngoại ON DELETE CASCADE: xoá 1 lượt gửi = xoá dòng ở bảng tóm tắt.
 *   Chỉ insertNotifications ghi vào notifications (luôn tạo lượt gửi trước).
 *
 *   ix_notifications_batch_id (batch_id) thừa vì đã có ix_notif_batch_read (batch_id,
 *   is_read) — giữ lại, bỏ ở bản phát hành sau theo quy ước.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS notification_batches (
	id varchar(30) NOT NULL,
	type varchar(50) NOT NULL,
	title varchar(255) COLLATE "vi-VN-x-icu" NOT NULL,
	message text,
	ref_id varchar(30),
	ref_type varchar(20),
	created_at timestamp(6) DEFAULT LOCALTIMESTAMP NOT NULL,
	CONSTRAINT notification_batches_pkey PRIMARY KEY (id)
);
ALTER TABLE notification_batches DROP CONSTRAINT IF EXISTS chk_notif_batch_id;
ALTER TABLE notification_batches ADD CONSTRAINT chk_notif_batch_id CHECK (id LIKE 'NTF%');

-- Dòng cũ chưa có batch_id: khoá gộp = id
UPDATE notifications SET batch_id = id WHERE batch_id IS NULL;

-- Lượt gửi đã có (giống các cột MIN(...) adminGetAll từng tính)
INSERT INTO notification_batches (id, type, title, message, ref_id, ref_type, created_at)
SELECT batch_id, MIN(type), MIN(title), MIN(message), MIN(ref_id), MIN(ref_type), MIN(created_at)
FROM notifications
GROUP BY batch_id
ON CONFLICT (id) DO NOTHING;

ALTER TABLE notifications ALTER COLUMN batch_id SET NOT NULL;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notif_batch;
ALTER TABLE notifications ADD CONSTRAINT fk_notif_batch FOREIGN KEY (batch_id)
	REFERENCES notification_batches (id) ON DELETE CASCADE;

-- Trang quản trị: mới nhất trước
CREATE INDEX IF NOT EXISTS ix_notif_batches_created ON notification_batches (created_at DESC);
-- Đếm người nhận / đã đọc của 1 lượt gửi (index-only), kiêm index cho khoá ngoại
CREATE INDEX IF NOT EXISTS ix_notif_batch_read ON notifications (batch_id, is_read);

ANALYZE notification_batches;

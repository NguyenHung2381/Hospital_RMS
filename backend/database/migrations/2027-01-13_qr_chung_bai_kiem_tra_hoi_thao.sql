/* ============================================================================
 * 2027-01-13_qr_chung_bai_kiem_tra_hoi_thao
 * ----------------------------------------------------------------------------
 *   QR chung cho từng đề kiểm tra hội nghị (chiếu lên màn hình hội trường): người
 *   dự quét → nhập họ tên → làm bài, không cần vé QR cá nhân
 *   (modules/seminars/seminarTestQrService.js).
 *
 *   seminar_tests
 *     qr_token             mã ngẫu nhiên 32 hex trong link /hoi-nghi/kiem-tra/<qr_token>
 *     qr_enabled           TRUE: link QR chung nhận người vào làm bài (BTC bật / tắt)
 *     qr_counts_for_cme    TRUE: bài nộp qua QR chung được tính vào điều kiện cấp CME
 *                          như bài nộp trên vé. Mặc định FALSE — QR chung chỉ hỏi họ
 *                          tên nên ai biết tên cũng làm thay được.
 *   seminar_test_submissions
 *     via                  'ticket' = làm trên vé QR cá nhân · 'qr' = làm qua QR chung
 *   seminar_test_qr_sessions — lượt vào qua QR chung: 1 dòng / người / đề. `code` là mã
 *     ngẫu nhiên trình duyệt giữ để làm tiếp bài (không lộ vé cá nhân của người khớp tên).
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE seminar_tests ADD COLUMN IF NOT EXISTS qr_token varchar(32);
ALTER TABLE seminar_tests ADD COLUMN IF NOT EXISTS qr_enabled boolean DEFAULT false NOT NULL;
ALTER TABLE seminar_tests ADD COLUMN IF NOT EXISTS qr_counts_for_cme boolean DEFAULT false NOT NULL;

UPDATE seminar_tests
SET qr_token = md5(id || ':' || random()::text || ':' || clock_timestamp()::text)
WHERE qr_token IS NULL;
ALTER TABLE seminar_tests ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_seminar_tests_qr_token ON seminar_tests (qr_token);

ALTER TABLE seminar_test_submissions ADD COLUMN IF NOT EXISTS via varchar(10) DEFAULT 'ticket' NOT NULL;
ALTER TABLE seminar_test_submissions DROP CONSTRAINT IF EXISTS chk_sts_via;
ALTER TABLE seminar_test_submissions ADD CONSTRAINT chk_sts_via CHECK (via IN ('ticket', 'qr'));

CREATE TABLE IF NOT EXISTS seminar_test_qr_sessions (
	code varchar(32) NOT NULL,
	test_id varchar(20) NOT NULL,
	participant_id varchar(24) NOT NULL,
	created_at timestamp(3) DEFAULT LOCALTIMESTAMP NOT NULL,
	CONSTRAINT seminar_test_qr_sessions_pkey PRIMARY KEY (code)
);
ALTER TABLE seminar_test_qr_sessions DROP CONSTRAINT IF EXISTS fk_stqs_test;
ALTER TABLE seminar_test_qr_sessions ADD CONSTRAINT fk_stqs_test
	FOREIGN KEY (test_id) REFERENCES seminar_tests (id) ON DELETE CASCADE;
ALTER TABLE seminar_test_qr_sessions DROP CONSTRAINT IF EXISTS fk_stqs_participant;
ALTER TABLE seminar_test_qr_sessions ADD CONSTRAINT fk_stqs_participant
	FOREIGN KEY (participant_id) REFERENCES seminar_participants (id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS ux_stqs_test_participant ON seminar_test_qr_sessions (test_id, participant_id);
CREATE INDEX IF NOT EXISTS ix_stqs_participant ON seminar_test_qr_sessions (participant_id);

COMMENT ON COLUMN seminar_tests.qr_token IS 'Mã trong link QR chung /hoi-nghi/kiem-tra/<qr_token>';
COMMENT ON COLUMN seminar_tests.qr_enabled IS 'Link QR chung (nhập họ tên) nhận người vào làm bài';
COMMENT ON COLUMN seminar_tests.qr_counts_for_cme IS 'Bài nộp qua QR chung tính vào điều kiện cấp CME';
COMMENT ON COLUMN seminar_test_submissions.via IS 'ticket = làm trên vé QR cá nhân, qr = làm qua QR chung';

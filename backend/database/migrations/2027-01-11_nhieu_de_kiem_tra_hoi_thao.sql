/* ============================================================================
 * 2027-01-11_nhieu_de_kiem_tra_hoi_thao
 * ----------------------------------------------------------------------------
 *   Một hội thảo / hội nghị có NHIỀU đề kiểm tra (vd bài trước buổi + bài cuối buổi,
 *   hoặc một đề cho mỗi phiên). Trước đây mỗi hội nghị chỉ có 1 bài, cấu hình nằm
 *   thẳng trên seminars.test_* và bài làm trên seminar_participants.test_*.
 *
 *   seminar_tests            — 1 dòng / đề. Các cột test_* GIỮ ĐÚNG TÊN cột cũ của
 *                              seminars để utils/seminarSchedule.testWindow/testState và
 *                              utils/seminarTest dùng lại nguyên vẹn (truyền dòng đề kèm
 *                              ngày của hội nghị).
 *     title                    tên đề hiển thị trên vé ("Bài kiểm tra cuối buổi"...)
 *     sort_order               thứ tự hiển thị
 *     counts_for_cme           TRUE: người tự đăng ký phải nộp (và đạt điểm đạt nếu đặt)
 *                              đề này mới được cấp CME. FALSE: đề tham khảo (vd bài trước
 *                              buổi) — không ảnh hưởng điều kiện CME.
 *   seminar_test_submissions — bài làm của 1 người cho 1 đề (PK test_id + participant_id).
 *                              Cột test_* giữ tên cột cũ của seminar_participants.
 *
 *   Chuyển dữ liệu: hội nghị đã soạn câu hỏi ⇒ 1 đề "Bài kiểm tra cuối buổi" (mã đề suy
 *   ra từ mã hội nghị, chạy lại không nhân đôi); bài làm đã bắt đầu / đã nộp chép sang.
 *   KHÔNG xoá cột cũ trên seminars / seminar_participants (code đã thôi đọc) — xoá ở
 *   migration sau khi bản này chạy ổn trên production.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS seminar_tests (
	id varchar(20) NOT NULL,
	seminar_id varchar(20) NOT NULL,
	title varchar(255) COLLATE "vi-VN-x-icu" NOT NULL,
	sort_order integer DEFAULT 0 NOT NULL,
	counts_for_cme boolean DEFAULT true NOT NULL,
	test_questions text,
	test_open boolean DEFAULT false NOT NULL,
	test_date date,
	test_start_time varchar(5),
	test_end_date date,
	test_end_time varchar(5),
	test_duration_minutes integer,
	test_pass_score numeric(7,2),
	test_score_scale numeric(7,2),
	test_shuffle_questions boolean DEFAULT false NOT NULL,
	test_shuffle_options boolean DEFAULT false NOT NULL,
	created_at timestamp(6) DEFAULT LOCALTIMESTAMP NOT NULL,
	created_by varchar(20),
	updated_at timestamp(6),
	updated_by varchar(20),
	CONSTRAINT seminar_tests_pkey PRIMARY KEY (id)
);

ALTER TABLE seminar_tests DROP CONSTRAINT IF EXISTS fk_seminar_tests_seminar;
ALTER TABLE seminar_tests ADD CONSTRAINT fk_seminar_tests_seminar
	FOREIGN KEY (seminar_id) REFERENCES seminars (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_seminar_tests_seminar ON seminar_tests (seminar_id, sort_order);

CREATE TABLE IF NOT EXISTS seminar_test_submissions (
	test_id varchar(20) NOT NULL,
	participant_id varchar(24) NOT NULL,
	test_answers text,
	test_correct integer,
	test_total integer,
	test_score numeric(7,2),
	test_max_score numeric(7,2),
	test_started_at timestamp(3),
	test_submitted_at timestamp(3),
	CONSTRAINT seminar_test_submissions_pkey PRIMARY KEY (test_id, participant_id)
);

ALTER TABLE seminar_test_submissions DROP CONSTRAINT IF EXISTS fk_sts_test;
ALTER TABLE seminar_test_submissions ADD CONSTRAINT fk_sts_test
	FOREIGN KEY (test_id) REFERENCES seminar_tests (id) ON DELETE CASCADE;
ALTER TABLE seminar_test_submissions DROP CONSTRAINT IF EXISTS fk_sts_participant;
ALTER TABLE seminar_test_submissions ADD CONSTRAINT fk_sts_participant
	FOREIGN KEY (participant_id) REFERENCES seminar_participants (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_sts_participant ON seminar_test_submissions (participant_id);

-- ── Chuyển bài kiểm tra cũ (1 bài / hội nghị) ──────────────────────────────
INSERT INTO seminar_tests (
	id, seminar_id, title, sort_order, counts_for_cme, test_questions, test_open,
	test_date, test_start_time, test_end_date, test_end_time, test_duration_minutes,
	test_pass_score, test_score_scale, test_shuffle_questions, test_shuffle_options,
	created_at, created_by, updated_at, updated_by
)
SELECT
	'SMT' || upper(substr(md5(s.id), 1, 17)), s.id, 'Bài kiểm tra cuối buổi', 1, true,
	s.test_questions, s.test_open, s.test_date, s.test_start_time, s.test_end_date,
	s.test_end_time, s.test_duration_minutes, s.test_pass_score, s.test_score_scale,
	s.test_shuffle_questions, s.test_shuffle_options,
	s.created_at, s.created_by, s.updated_at, s.updated_by
FROM seminars s
WHERE s.test_questions IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM seminar_tests t WHERE t.seminar_id = s.id);

INSERT INTO seminar_test_submissions (
	test_id, participant_id, test_answers, test_correct, test_total, test_score,
	test_max_score, test_started_at, test_submitted_at
)
SELECT
	t.id, p.id, p.test_answers, p.test_correct, p.test_total, p.test_score,
	p.test_max_score, p.test_started_at, p.test_submitted_at
FROM seminar_participants p
JOIN seminar_tests t ON t.id = 'SMT' || upper(substr(md5(p.seminar_id), 1, 17))
WHERE p.test_started_at IS NOT NULL OR p.test_submitted_at IS NOT NULL
ON CONFLICT (test_id, participant_id) DO NOTHING;

COMMENT ON TABLE seminar_tests IS 'Đề kiểm tra của hội thảo/hội nghị (nhiều đề / hội nghị)';
COMMENT ON COLUMN seminar_tests.counts_for_cme IS 'Người tự đăng ký phải nộp (và đạt) đề này mới được cấp CME';
COMMENT ON TABLE seminar_test_submissions IS 'Bài làm của 1 người tham dự cho 1 đề kiểm tra';

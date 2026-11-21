/* ============================================================================
 * 2026-12-31_ux_nguoi_tham_du_hoi_thao_theo_tai_khoan
 * ----------------------------------------------------------------------------
 *   Mỗi tài khoản chỉ có tối đa 1 dòng trong danh sách người tham dự của 1 hội
 *   thảo / tập huấn (L-06, audit run-5). Trước đây kiểm "đã đăng ký chưa" rồi mới
 *   INSERT ở 2 bước rời nhau, bảng không có ràng buộc ⇒ 2 yêu cầu tự đăng ký song
 *   song (/me/hospital-trainings/:id/register) tạo 2 dòng, cấp CME cho cả hai thì
 *   giờ CME của người đó bị cộng gấp đôi (cmeCycleService / cmeRequirementService
 *   cộng theo từng dòng).
 *
 *   Ứng dụng: bulkAdd (thêm nhân sự, thêm cả khoa, tự đăng ký, nhập Excel) dùng
 *   INSERT ... ON CONFLICT DO NOTHING ⇒ người đã có thì bỏ qua; thêm tay 1 người /
 *   gán tài khoản đã có trong danh sách ⇒ 409.
 *
 *   Dọn dữ liệu trùng sẵn có (cùng seminar_id + user_id) trước khi tạo index.
 *   Giữ 1 dòng theo thứ tự ưu tiên: đã có số CME → đã điểm danh → đã nộp bài
 *   kiểm tra → tạo sớm nhất → id. Các dòng còn lại:
 *     - CHƯA có số CME: xóa (cùng giá trị trường tùy chỉnh form_custom_values) —
 *       dòng giữ lại đã đại diện cho người đó.
 *     - ĐÃ có số CME: không xóa (số quyết định là sổ cấp CME, xóa sẽ thủng sổ),
 *       chỉ gỡ liên kết tài khoản (user_id = NULL) để không còn cộng giờ CME lần
 *       hai cho người đó, và ghi chú lại. Người có quyền cấp CME tự thu hồi số
 *       nếu cần.
 *
 * Chạy trong 1 transaction. Idempotent (chạy lại: không còn dòng trùng, index đã có).
 * ==========================================================================*/

CREATE TEMP TABLE tmp_sp_dup ON COMMIT DROP AS
SELECT id, cme_seq
FROM (
	SELECT id, cme_seq,
	       ROW_NUMBER() OVER (
	         PARTITION BY seminar_id, user_id
	         ORDER BY (cme_seq IS NOT NULL) DESC, (checked_in_at IS NOT NULL) DESC,
	                  (test_submitted_at IS NOT NULL) DESC, created_at, id
	       ) AS rn
	FROM seminar_participants
	WHERE user_id IS NOT NULL
) ranked
WHERE rn > 1;

DELETE FROM form_custom_values
WHERE form_key = 'seminar_participant'
  AND record_id IN (SELECT id FROM tmp_sp_dup WHERE cme_seq IS NULL);

DELETE FROM seminar_participants
WHERE id IN (SELECT id FROM tmp_sp_dup WHERE cme_seq IS NULL);

UPDATE seminar_participants
SET user_id = NULL,
    notes = LEFT(CONCAT_WS(' · ', NULLIF(BTRIM(notes), ''),
                 '[Trùng tài khoản trong danh sách — đã gỡ liên kết khi thêm ràng buộc 2026-12-31]'), 255)
WHERE id IN (SELECT id FROM tmp_sp_dup WHERE cme_seq IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sp_seminar_user
	ON seminar_participants (seminar_id, user_id) WHERE (user_id IS NOT NULL);

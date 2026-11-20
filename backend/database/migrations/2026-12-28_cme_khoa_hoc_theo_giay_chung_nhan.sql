/* ============================================================================
 * 2026-12-28_cme_khoa_hoc_theo_giay_chung_nhan
 * ----------------------------------------------------------------------------
 *   CME tự động của học viên khóa ĐTLT / CTCV (courseCmeService): mỗi giấy chứng
 *   nhận 1 dòng cme_records, thay cho 1 dòng / (khóa, người).
 *
 *   Vì sao: 1 học viên ghi danh được nhiều chương trình trong cùng khóa
 *   (uq_enroll_course_trainee_program), mỗi lượt ghi danh 1 giấy chứng nhận
 *   (Thông tư 32/2023/TT-BYT Điều 4.1.i — hoàn thành khóa nào cấp giấy khóa đó).
 *   Khóa cũ uq_cme_records_source (source_type, source_id = mã khóa, user_id) chỉ
 *   chứa được 1 dòng / người / khóa nên:
 *     - "Ghi lại CME" cả khóa lỗi "ON CONFLICT DO UPDATE command cannot affect row
 *       a second time" khi có người 2 giấy;
 *     - cấp giấy lần lượt thì giấy sau đè dòng CME của giấy trước;
 *     - thu hồi 1 giấy làm mất CME của giấy còn hiệu lực.
 *
 *   cme_records.enrollment_id varchar(20): lượt ghi danh (course_enrollments.id)
 *     của giấy — chỉ dòng source_type = 'course_trainee' có giá trị (CHECK). Lấy
 *     lượt ghi danh thay vì mã giấy: xóa giấy cấp nhầm rồi cấp lại sinh mã giấy
 *     mới, còn lượt ghi danh giữ nguyên. Không đặt khóa ngoại: xóa khóa học cascade
 *     xóa lượt ghi danh, CME đã cộng của học viên không được mất theo (như trước,
 *     cme_records không có khóa ngoại tới courses).
 *   uq_cme_records_source dựng lại trên (source_type, source_id, user_id,
 *     enrollment_id) NULLS NOT DISTINCT: dòng giảng viên (enrollment_id NULL) vẫn
 *     là 1 dòng / người / khóa và `upsert` (ON CONFLICT) bắt được. source_id vẫn là
 *     mã khóa (giao diện / báo cáo đọc cột này).
 *
 *   Chuyển dữ liệu cũ: dòng 'course_trainee' chưa có enrollment_id gắn vào lượt
 *   ghi danh của cùng khóa + cùng người (trainees.staff_user_id), ưu tiên:
 *     1. giấy có số trùng số ghi trong note ("Giấy chứng nhận số <cert_no>" — giấy
 *        ghi sau cùng, tức giấy mà dòng đang thể hiện);
 *     2. giấy cùng trạng thái với dòng (dòng 'rejected' ↔ giấy đã thu hồi);
 *     3. lượt ghi danh có giấy, giấy cấp sau cùng; cuối cùng theo mã ghi danh.
 *   Dòng không tìm được lượt ghi danh (đã xóa) giữ enrollment_id NULL — vẫn duy
 *   nhất theo khóa mới, sync không đụng tới.
 *   Người có ≥ 2 giấy trong 1 khóa trước đây chỉ còn 1 dòng: sau khi chạy file
 *   này bấm "Ghi lại CME" ở tab Kết quả của khóa đó để ghi dòng cho giấy còn lại.
 *
 *   Không tương thích ngược hoàn toàn: bản ứng dụng cũ (ON CONFLICT 3 cột) không
 *   còn index khớp ⇒ nếu quay lại image cũ, việc tự ghi CME khi cấp giấy / khóa
 *   điểm báo lỗi (certificateService / gradebookService chỉ ghi log, việc cấp giấy
 *   và khóa điểm vẫn chạy). Không giữ được index cũ vì nó chặn chính các dòng mới.
 *
 * Chạy trong 1 transaction. Idempotent: ADD COLUMN IF NOT EXISTS, chỉ cập nhật
 * dòng enrollment_id còn NULL, DROP ... IF EXISTS rồi tạo lại.
 * ==========================================================================*/

ALTER TABLE cme_records ADD COLUMN IF NOT EXISTS enrollment_id varchar(20);

UPDATE cme_records r
SET enrollment_id = m.enrollment_id
FROM (
	SELECT DISTINCT ON (r2.id) r2.id, e.id AS enrollment_id
	FROM cme_records r2
	JOIN course_enrollments e ON e.course_id = r2.source_id
	JOIN trainees t ON t.id = e.trainee_id AND t.staff_user_id = r2.user_id
	LEFT JOIN certificates cert ON cert.enrollment_id = e.id
	WHERE r2.source_type = 'course_trainee' AND r2.enrollment_id IS NULL
	ORDER BY r2.id,
		CASE WHEN cert.cert_no IS NOT NULL AND r2.note = CONCAT('Giấy chứng nhận số ', cert.cert_no) THEN 0 ELSE 1 END,
		CASE WHEN cert.id IS NULL THEN 2
			WHEN (cert.status = 'revoked') = (r2.approval_status = 'rejected') THEN 0
			ELSE 1 END,
		cert.issue_date DESC NULLS LAST,
		e.id
) m
WHERE r.id = m.id;

ALTER TABLE cme_records DROP CONSTRAINT IF EXISTS chk_cme_records_enrollment;
ALTER TABLE cme_records ADD CONSTRAINT chk_cme_records_enrollment
	CHECK (enrollment_id IS NULL OR source_type = 'course_trainee');

DROP INDEX IF EXISTS uq_cme_records_source;
CREATE UNIQUE INDEX uq_cme_records_source ON cme_records (source_type, source_id, user_id, enrollment_id)
	NULLS NOT DISTINCT WHERE (source_type IS NOT NULL);

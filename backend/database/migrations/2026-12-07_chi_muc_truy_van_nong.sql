/* ============================================================================
 * 2026-12-07_chi_muc_truy_van_nong
 * ----------------------------------------------------------------------------
 *   Chỉ mục cho các cột lọc / JOIN chạy ở mỗi lượt tải trang nhưng chưa có chỉ
 *   mục nào bắt đầu bằng cột đó (bảng tạo trước khi có migrations nên DB thật có
 *   thể đã có sẵn với tên khác):
 *   - notifications(user_id, is_read)  đếm chưa đọc / danh sách thông báo của mình
 *   - refresh_tokens(token), (user_id) làm mới phiên đăng nhập, đăng xuất mọi nơi
 *   - trainees(user_id)                TRAINEE_OF_USER_SQL (cổng học viên)
 *   - course_enrollments(trainee_id)   khóa học / đề thi của học viên
 *   - lecturers(user_id)               cổng giảng viên, người chấm (PAPER_GRADER_SQL)
 *   - lecturer_assignments(lecturer_id) lịch dạy / phân công của giảng viên
 *   - exam_attempts(enrollment_id)     các lượt thi đã làm (bốc đề tránh câu cũ)
 *   - attendance(enrollment_id)        điểm danh / tiến độ bài học của 1 học viên
 *   - topic_members(topic_id)          thành viên đề tài
 *   Bỏ qua khi: bảng / cột không có, cột không đánh chỉ mục được (MAX hoặc
 *   > 1700 byte), hoặc đã có chỉ mục (kể cả PK / UNIQUE) có cột đầu là cột đó.
 * Idempotent — chạy lại nhiều lần an toàn. Chỉ THÊM chỉ mục.
 * ==========================================================================*/

DECLARE @wanted TABLE (tbl SYSNAME, lead_col SYSNAME, cols NVARCHAR(400), idx SYSNAME);
INSERT INTO @wanted (tbl, lead_col, cols, idx) VALUES
    (N'notifications',        N'user_id',       N'[user_id], [is_read]', N'IX_notifications_user_read'),
    (N'refresh_tokens',       N'token',         N'[token]',              N'IX_refresh_tokens_token'),
    (N'refresh_tokens',       N'user_id',       N'[user_id]',            N'IX_refresh_tokens_user'),
    (N'trainees',             N'user_id',       N'[user_id]',            N'IX_trainees_user'),
    (N'course_enrollments',   N'trainee_id',    N'[trainee_id]',         N'IX_course_enrollments_trainee'),
    (N'lecturers',            N'user_id',       N'[user_id]',            N'IX_lecturers_user'),
    (N'lecturer_assignments', N'lecturer_id',   N'[lecturer_id]',        N'IX_lecturer_assignments_lecturer'),
    (N'exam_attempts',        N'enrollment_id', N'[enrollment_id]',      N'IX_exam_attempts_enrollment'),
    (N'attendance',           N'enrollment_id', N'[enrollment_id]',      N'IX_attendance_enrollment'),
    (N'topic_members',        N'topic_id',      N'[topic_id]',           N'IX_topic_members_topic');

DECLARE @tbl SYSNAME, @lead SYSNAME, @cols NVARCHAR(400), @idx SYSNAME, @stmt NVARCHAR(MAX), @obj INT;
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT tbl, lead_col, cols, idx FROM @wanted;
OPEN cur;
FETCH NEXT FROM cur INTO @tbl, @lead, @cols, @idx;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @obj = OBJECT_ID(N'dbo.' + @tbl, N'U');
    IF @obj IS NOT NULL
       AND EXISTS (SELECT 1 FROM sys.columns c
                   WHERE c.object_id = @obj AND c.name = @lead AND c.max_length BETWEEN 1 AND 1700)
       AND NOT EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = @obj AND i.name = @idx)
       AND NOT EXISTS (SELECT 1 FROM sys.index_columns ic
                       JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                       WHERE ic.object_id = @obj AND ic.key_ordinal = 1 AND c.name = @lead)
    BEGIN
        SET @stmt = N'CREATE NONCLUSTERED INDEX ' + QUOTENAME(@idx) + N' ON [dbo].' + QUOTENAME(@tbl)
                  + N' (' + @cols + N');';
        EXEC sys.sp_executesql @stmt;
        PRINT N'  + ' + @idx;
    END
    FETCH NEXT FROM cur INTO @tbl, @lead, @cols, @idx;
END
CLOSE cur;
DEALLOCATE cur;
GO

PRINT N'✅ Migration 2026-12-07_chi_muc_truy_van_nong hoàn tất.';
GO

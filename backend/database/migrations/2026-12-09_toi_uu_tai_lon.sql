/* ============================================================================
 * 2026-12-09_toi_uu_tai_lon
 * ----------------------------------------------------------------------------
 *   Tối ưu theo số liệu Query Store của DB dev (24/10/2026):
 *
 *   1. sp_push_notification: bỏ FORMAT(GETDATE(), 'yyyyMMddHHmmss'). FORMAT chạy
 *      qua CLR — ~130ms CPU mỗi lần gọi dù chỉ gửi cho vài người, và nằm trong
 *      SELECT của INSERT nên bị tính lại cho TỪNG người nhận (gửi cả viện =
 *      hàng nghìn lần). Thay bằng CONVERT tính 1 lần. Mã sinh ra giữ nguyên định
 *      dạng: 'NTF' / 'NTFB' + yyyyMMddHHmmss + 5 số từ seq_notification_suffix.
 *      Logic chọn người nhận KHÔNG đổi.
 *
 *   2. Chỉ mục cho cột lọc / JOIN chưa có chỉ mục nào bắt đầu bằng cột đó:
 *      - class_sessions(lecturer_id, session_date)  lịch dạy của giảng viên,
 *        đếm buổi dạy ở cổng giảng viên, kiểm tra trùng lịch giảng viên
 *      - course_documents(course_id)                 tài liệu / đếm tài liệu
 *        của từng khóa ở cổng học viên (subquery theo từng khóa)
 *      - trainees(department_id)                     lọc học viên theo khoa
 *        (phạm vi dữ liệu theo khoa, điểm danh, nghỉ phép)
 *      Bỏ qua khi bảng / cột không có hoặc đã có chỉ mục (kể cả PK / UNIQUE)
 *      có cột đầu là cột đó.
 *
 * Idempotent — chạy lại an toàn (CREATE OR ALTER, kiểm tra sys.indexes).
 * ==========================================================================*/

DECLARE @wanted TABLE (tbl SYSNAME, lead_col SYSNAME, cols NVARCHAR(400), idx SYSNAME);
INSERT INTO @wanted (tbl, lead_col, cols, idx) VALUES
    (N'class_sessions',   N'lecturer_id',   N'[lecturer_id], [session_date]', N'IX_class_sessions_lecturer'),
    (N'course_documents', N'course_id',     N'[course_id]',                   N'IX_course_documents_course'),
    (N'trainees',         N'department_id', N'[department_id]',               N'IX_trainees_department');

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

-- Dòng cũ (trước migration) có batch_id = NULL — vẫn hiển thị đúng là 1 lượt
-- gửi độc lập ở phía admin nhờ COALESCE(batch_id, id), không cần backfill.
CREATE OR ALTER PROCEDURE [dbo].[sp_push_notification]
    -- Nội dung thông báo
    @type     VARCHAR(50),
    @title    NVARCHAR(255),
    @message  NVARCHAR(MAX) = NULL,
    @ref_id   VARCHAR(30)   = NULL,
    @ref_type VARCHAR(20)   = NULL,

    -- === Người nhận: truyền ít nhất 1 trong các tham số sau ===

    -- Cách 1 (cũ, vẫn giữ): JSON array user_id trực tiếp
    @user_ids            NVARCHAR(MAX) = NULL,   -- ["uid1","uid2"]

    -- Cách 2 (mới): Targeting theo nhóm
    @role_ids            NVARCHAR(MAX) = NULL,   -- ["VT03","VT07"]
    @department_ids      NVARCHAR(MAX) = NULL,   -- ["DV002","DV005"]
    @include_dept_accounts BIT          = 0,
    @topic_id            VARCHAR(15)   = NULL,
    @topic_member_roles  NVARCHAR(MAX) = NULL,
    @all_active          BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra có ít nhất 1 nguồn người nhận
    IF  (@user_ids       IS NULL OR @user_ids       = '[]')
    AND (@role_ids       IS NULL OR @role_ids       = '[]')
    AND (@department_ids IS NULL OR @department_ids = '[]')
    AND  @topic_id       IS NULL
    AND  @all_active     = 0
    BEGIN
        RAISERROR(N'sp_push_notification: Phải truyền ít nhất 1 tham số người nhận.', 16, 1);
        RETURN;
    END

    -- Giải quyết danh sách người nhận cuối cùng
    DECLARE @final_ids NVARCHAR(MAX);

    EXEC [dbo].[sp_resolve_recipients]
        @user_ids             = @user_ids,
        @role_ids             = @role_ids,
        @department_ids       = @department_ids,
        @include_dept_accounts= @include_dept_accounts,
        @topic_id             = @topic_id,
        @topic_member_roles   = @topic_member_roles,
        @all_active           = @all_active,
        @resolved_ids         = @final_ids OUTPUT;

    IF @final_ids IS NULL OR @final_ids = '[]'
    BEGIN
        PRINT N'sp_push_notification: Không có người nhận hợp lệ, bỏ qua.';
        RETURN;
    END

    -- yyyyMMddHHmmss tính 1 lần cho cả lượt gửi (112 = yyyymmdd, 108 = hh:mi:ss).
    -- Không dùng FORMAT(): chạy qua CLR, chậm hơn CONVERT hàng trăm lần.
    DECLARE @now DATETIME = GETDATE();
    DECLARE @stamp CHAR(14) = CONVERT(CHAR(8), @now, 112) + REPLACE(CONVERT(CHAR(8), @now, 108), ':', '');

    -- Một batch_id duy nhất cho cả lượt gửi này, để phía admin gộp lại
    -- thành 1 hàng thay vì N hàng (N = số người nhận).
    DECLARE @batch_id VARCHAR(30) =
        'NTFB' + @stamp
              + RIGHT('00000' + CAST(NEXT VALUE FOR dbo.seq_notification_suffix AS VARCHAR(5)), 5);

    -- Insert batch, prefix NTF + yyyyMMddHHmmss + 5 chữ số thứ tự (từ SEQUENCE, không bị trùng giữa các lần gọi)
    INSERT INTO [dbo].[notifications]
        ([id], [user_id], [type], [title], [message], [ref_id], [ref_type], [batch_id])
    SELECT
        'NTF' + @stamp
              + RIGHT('00000' + CAST(NEXT VALUE FOR dbo.seq_notification_suffix OVER (ORDER BY u.[id]) AS VARCHAR(5)), 5),
        u.[id],
        @type,
        @title,
        @message,
        @ref_id,
        @ref_type,
        @batch_id
    FROM OPENJSON(@final_ids) oj
    JOIN [dbo].[users] u ON u.[id] = oj.[value]
    WHERE u.[is_active] = 1;
END;
GO

PRINT N'✅ Migration 2026-12-09_toi_uu_tai_lon hoàn tất.';
GO

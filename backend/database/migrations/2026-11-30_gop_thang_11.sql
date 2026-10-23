/* ============================================================================
 * 2026-11-30_gop_thang_11 — gộp 25 migration 2026-11-01 → 2026-11-30
 * ----------------------------------------------------------------------------
 *   Nội dung NGUYÊN VĂN các file cũ, đúng thứ tự cũ. Mỗi phần mở đầu bằng dòng
 *   "-- @migration <tên file cũ>". Runner chỉ chạy phần DB chưa ghi nhận; DB đã
 *   chạy đủ các file cũ thì chỉ ghi nhận file này, không chạy lại gì.
 *   Không sửa phần cũ — cần đổi gì thì viết migration mới (database/README.md).
 * ==========================================================================*/

-- @migration 2026-11-01_training_flow.sql
/* ============================================================================
 * Gọn luồng Đào tạo: Kế hoạch → Chương trình (bài học) → Khóa học
 * ----------------------------------------------------------------------------
 * 1. courses.plan_item_id: khóa học mở theo hạng mục nào của kế hoạch đào tạo
 *    (tiến độ kế hoạch = số khóa / số học viên của hạng mục). FK không cascade —
 *    trainingPlanService gỡ liên kết trước khi xoá hạng mục/kế hoạch.
 *
 * 2. Gộp "Môn học" (subjects) vào "Bài học" (program_lessons): hai danh mục
 *    song song cùng nghĩa. Mỗi môn học → bài học cùng tên (chưa có thì tạo mới),
 *    các cột subject_id của lecturer_assignments / class_sessions / grades /
 *    question_bank / exam_papers chuyển sang trỏ bài học (giữ tên cột
 *    subject_id). program_subjects → lesson_programs. Bảng subjects và
 *    program_subjects GIỮ LẠI (không còn dùng) để có thể đối chiếu/khôi phục.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.courses', N'plan_item_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [plan_item_id] VARCHAR(20) NULL
        CONSTRAINT FK_courses_plan_item REFERENCES [dbo].[training_plan_items] ([id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_plan_item' AND object_id = OBJECT_ID(N'dbo.courses'))
    CREATE NONCLUSTERED INDEX [IX_courses_plan_item] ON [dbo].[courses] ([plan_item_id]);
GO

-- Chỉ chạy khi còn FK trỏ vào subjects (ngoài program_subjects) = chưa chuyển
IF EXISTS (SELECT 1 FROM sys.foreign_keys
           WHERE referenced_object_id = OBJECT_ID(N'dbo.subjects')
             AND parent_object_id <> OBJECT_ID(N'dbo.program_subjects'))
BEGIN
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    INSERT INTO [dbo].[program_lessons] (id, code, title, description, created_by)
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), '', LEFT(s.name, 255), s.description, s.created_by
    FROM [dbo].[subjects] s
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[program_lessons] l WHERE l.title = LEFT(s.name, 255));

    SELECT s.id AS subject_id,
           (SELECT TOP 1 l.id FROM [dbo].[program_lessons] l WHERE l.title = LEFT(s.name, 255) ORDER BY l.created_at) AS lesson_id
    INTO #subject_lesson
    FROM [dbo].[subjects] s;

    DECLARE @drop NVARCHAR(MAX) = N'';
    SELECT @drop += N'ALTER TABLE ' + QUOTENAME(OBJECT_NAME(parent_object_id)) + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.foreign_keys
    WHERE referenced_object_id = OBJECT_ID(N'dbo.subjects') AND parent_object_id <> OBJECT_ID(N'dbo.program_subjects');
    EXEC (@drop);

    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[lecturer_assignments] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[class_sessions] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[grades] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[question_bank] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[exam_papers] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;

    INSERT INTO [dbo].[lesson_programs] (id, lesson_id, program_id)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), x.lesson_id, x.program_id
    FROM (SELECT DISTINCT m.lesson_id, ps.program_id
          FROM [dbo].[program_subjects] ps
          JOIN #subject_lesson m ON m.subject_id = ps.subject_id) x
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[lesson_programs] lp WHERE lp.lesson_id = x.lesson_id AND lp.program_id = x.program_id);

    ALTER TABLE [dbo].[lecturer_assignments] ADD CONSTRAINT FK_lecass_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[class_sessions] ADD CONSTRAINT FK_sess_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[grades] ADD CONSTRAINT FK_grades_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[question_bank] ADD CONSTRAINT FK_qbank_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT FK_exampaper_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);

    DROP TABLE #subject_lesson;
    COMMIT TRANSACTION;
END
GO

PRINT N'✅ Migration 2026-11-01_training_flow hoàn tất.';
GO

-- @migration 2026-11-02_seminar_test_settings.sql
/* ============================================================================
 * Hội nghị: cấu hình bài test cuối buổi
 * ----------------------------------------------------------------------------
 *   seminars.test_end_date          : ngày dừng tiếp nhận bài (trống = ngày mở bài)
 *   seminars.test_duration_minutes  : thời gian làm bài (phút) tính từ lúc người
 *                                     làm bấm "Bắt đầu" — trống = không giới hạn
 *   seminars.test_pass_score        : điểm đạt để được cấp CME — trống = chỉ cần nộp
 *   seminars.test_shuffle_questions / test_shuffle_options : trộn thứ tự câu hỏi /
 *                                     phương án theo từng vé
 *   seminar_participants.test_started_at : lúc bấm "Bắt đầu làm bài"
 *   seminar_participants.test_score / test_max_score : điểm theo trọng số từng câu
 *   Điểm từng câu nằm trong JSON seminars.test_questions ({ ..., points }).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'test_end_date') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_end_date] DATE NULL,
        [test_duration_minutes] INT NULL, [test_pass_score] DECIMAL(7, 2) NULL,
        [test_shuffle_questions] BIT NOT NULL CONSTRAINT [DF_seminars_test_shuffle_q] DEFAULT (0),
        [test_shuffle_options] BIT NOT NULL CONSTRAINT [DF_seminars_test_shuffle_o] DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.seminar_participants', N'test_started_at') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD [test_started_at] DATETIME NULL,
        [test_score] DECIMAL(7, 2) NULL, [test_max_score] DECIMAL(7, 2) NULL;
GO

PRINT N'✅ Migration 2026-11-02_seminar_test_settings hoàn tất.';
GO

-- @migration 2026-11-03_fix_sp_push_notification_encoding.sql
/* ============================================================================
 * 2026-11-03_fix_sp_push_notification_encoding
 * ----------------------------------------------------------------------------
 *   Tạo lại sp_push_notification với chữ tiếng Việt đúng UTF-8. Bản đang có
 *   trong DB bị lỗi mã hoá (UTF-8 bị đọc thành cp1252 lúc tạo — sqlcmd thiếu
 *   -f 65001): comment và 2 thông báo RAISERROR/PRINT hiện thành chữ vỡ.
 *   Logic KHÔNG đổi — phần code ngoài comment/chuỗi giống hệt bản cũ.
 * Idempotent (CREATE OR ALTER) — chạy lại an toàn.
 * ==========================================================================*/

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

    -- Một batch_id duy nhất cho cả lượt gửi này, để phía admin gộp lại
    -- thành 1 hàng thay vì N hàng (N = số người nhận).
    DECLARE @batch_id VARCHAR(30) =
        'NTFB' + FORMAT(GETDATE(), 'yyyyMMddHHmmss')
              + RIGHT('00000' + CAST(NEXT VALUE FOR dbo.seq_notification_suffix AS VARCHAR(5)), 5);

    -- Insert batch, prefix NTF + yyyyMMddHHmmss + 5 chữ số thứ tự (từ SEQUENCE, không bị trùng giữa các lần gọi)
    INSERT INTO [dbo].[notifications]
        ([id], [user_id], [type], [title], [message], [ref_id], [ref_type], [batch_id])
    SELECT
        'NTF' + FORMAT(GETDATE(), 'yyyyMMddHHmmss')
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

-- @migration 2026-11-04_retire_scheduled_deadline_procs.sql
/* ============================================================================
 * 2026-11-04_retire_scheduled_deadline_procs
 * ----------------------------------------------------------------------------
 *   Việc định kỳ chuyển hết sang job Node (backend/src/jobs/), 2 proc định kỳ
 *   cũ thành no-op — giữ nguyên tên + tham số để SQL Agent job / Task Scheduler
 *   (nếu production còn lập lịch) vẫn chạy thành công nhưng không làm gì:
 *
 *   sp_process_daily_deadlines — trước đây:
 *     A/A2. nhắc deadline cho vai trò 'principal_investigator' (không còn tồn
 *           tại ⇒ không gửi được gì)          → deadlineReminderJob.js
 *     B.    đề tài 'supplement' quá hạn ⇒ tự DUYỆT → nay tự TỪ CHỐI theo quyết
 *           định 18/10/2026                     → supplementDeadlineJob.js
 *     C.    dọn refresh token, khoá TK hết hạn   → accountMaintenanceJob.js
 *           dọn thông báo cũ (gọi sai tên tham số ⇒ luôn lỗi)
 *                                                → notificationCleanupJob.js
 *     Để nguyên thì nếu còn Agent job, bước B sẽ DUYỆT đề tài mà job Node
 *     định TỪ CHỐI — kết quả tuỳ bên nào chạy trước.
 *   sp_remind_deadlines — nhắc theo research_rounds.end_date, trùng với
 *     deadlineReminderJob.js nếu còn được lập lịch.
 *
 * Idempotent (CREATE OR ALTER) — chạy lại an toàn. Bản cũ xem git history
 * của database/objects/procedures/.
 * ==========================================================================*/
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_process_daily_deadlines]
AS
BEGIN
    -- Đã chuyển sang backend/src/jobs/ (xem migration 2026-11-04_retire_scheduled_deadline_procs).
    SET NOCOUNT ON;
    RETURN;
END;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_remind_deadlines]
    @days_ahead INT = 3
AS
BEGIN
    -- Đã chuyển sang backend/src/jobs/deadlineReminderJob.js (xem migration 2026-11-04_retire_scheduled_deadline_procs).
    SET NOCOUNT ON;
    RETURN;
END;
GO

-- @migration 2026-11-05_retire_training_plans_permission.sql
/* ============================================================================
 * 2026-11-05_retire_training_plans_permission
 * ----------------------------------------------------------------------------
 *   Bỏ tính năng "Kế hoạch đào tạo" (trang /admin/training-plans + API
 *   /training-plans) — không dùng tới. Chỉ gỡ quyền training_plans:manage và
 *   các lượt cấp quyền đó cho vai trò; server không còn tự xoá quyền thừa
 *   (permissions/sync.js chỉ cảnh báo), nên phải gỡ ở đây.
 *
 *   GIỮ NGUYÊN bảng training_plans, training_plan_items và cột
 *   courses.plan_item_id: code không còn đọc/ghi, nhưng dữ liệu cũ vẫn còn
 *   nếu cần tra lại. Muốn xoá hẳn thì viết migration riêng (DROP cột + FK
 *   FK_courses_plan_item + IX_courses_plan_item trước, rồi tới 2 bảng).
 *
 * Idempotent — chạy lại an toàn.
 * ==========================================================================*/

BEGIN TRANSACTION;

DELETE FROM dbo.role_permissions WHERE permission_id = 'PERM-TRNPLAN-MANAGE';
PRINT N'Đã gỡ ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' lượt cấp quyền training_plans:manage';

DELETE FROM dbo.permissions WHERE id = 'PERM-TRNPLAN-MANAGE';
PRINT N'Đã xoá ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' quyền training_plans:manage';

COMMIT TRANSACTION;
GO

-- @migration 2026-11-06_checkin_time_utc.sql
/* ============================================================================
 * 2026-11-06_checkin_time_utc
 * ----------------------------------------------------------------------------
 *   Giờ điểm danh QR (seminar_participants.checked_in_at, attendance.checked_in_at)
 *   trước đây ghi bằng GETDATE() = giờ VN của máy CSDL, nhưng driver mssql đọc
 *   DATETIME như UTC → giao diện hiển thị lệch +7 giờ. Code nay ghi GETUTCDATE();
 *   migration này đổi dữ liệu cũ về UTC (trừ 7 giờ).
 *
 * Idempotent — đánh dấu bằng extended property 'checked_in_at_utc' trên từng cột,
 * đã có thì bỏ qua (không trừ 2 lần).
 * ==========================================================================*/

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE major_id = OBJECT_ID('dbo.seminar_participants') AND name = 'checked_in_at_utc')
BEGIN
    UPDATE dbo.seminar_participants SET checked_in_at = DATEADD(HOUR, -7, checked_in_at)
    WHERE checked_in_at IS NOT NULL;
    PRINT N'seminar_participants: đổi ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' dòng sang UTC';
    EXEC sp_addextendedproperty @name = N'checked_in_at_utc', @value = N'1',
        @level0type = N'SCHEMA', @level0name = N'dbo',
        @level1type = N'TABLE', @level1name = N'seminar_participants',
        @level2type = N'COLUMN', @level2name = N'checked_in_at';
END

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE major_id = OBJECT_ID('dbo.attendance') AND name = 'checked_in_at_utc')
BEGIN
    UPDATE dbo.attendance SET checked_in_at = DATEADD(HOUR, -7, checked_in_at)
    WHERE checked_in_at IS NOT NULL;
    PRINT N'attendance: đổi ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' dòng sang UTC';
    EXEC sp_addextendedproperty @name = N'checked_in_at_utc', @value = N'1',
        @level0type = N'SCHEMA', @level0name = N'dbo',
        @level1type = N'TABLE', @level1name = N'attendance',
        @level2type = N'COLUMN', @level2name = N'checked_in_at';
END

COMMIT TRANSACTION;
GO

-- @migration 2026-11-07_training_course_types_rotations.sql
/* ============================================================================
 * Đào tạo GĐ1 — Khóa học theo loại (GPHN / ĐTLT…), trường chương trình theo
 * danh mục 1.xlsx, bài học dạng "vòng thực hành" kèm khoa được chọn
 * ----------------------------------------------------------------------------
 * Tài liệu "Xây dựng phần mềm": cây Khóa học → Chương trình → Bài học, với 2
 * loại khóa chính GPHN (thực hành cấp GPHN, mở liên tục, mỗi học viên có lịch
 * riêng) và ĐTLT Đợt X (đào tạo liên tục theo đợt). Xem docs/ke-hoach-sua-dao-tao.md.
 *
 * 1. training_types: thêm ĐTLT / GPHN / CTCV / THBV (chỉ thêm khi chưa có id —
 *    không ghi đè tên người dùng đã sửa, không khôi phục loại đã bị xoá khác).
 * 2. courses: training_type_id (loại khóa), batch_no (số đợt), is_rolling (khóa
 *    mở liên tục — không cần ngày khóa / cửa sổ đăng ký).
 * 3. training_programs: số tiết LT/TH (+ tổng tính sẵn), số giờ tín chỉ, học phí,
 *    thời lượng dạng số (duration_value + duration_unit; cột duration văn bản
 *    giữ để hiển thị), đối tượng dạng văn bản (target_audience — Excel ghi tự
 *    do "Bác sĩ, Điều dưỡng, KTV"), ghi chú khoa phụ trách (department_note —
 *    "Nhiều khoa tùy vòng…" hoặc tên khoa chưa khớp danh mục).
 * 4. program_lessons: lesson_kind (theory | rotation), thời lượng, allow_split
 *    (vòng chia cho nhiều khoa — vòng chuyên khoa lẻ).
 * 5. lesson_departments: các khoa được chọn cho 1 vòng.
 *
 * Idempotent — mỗi bước tự kiểm tra nên chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

------------------------------------------------------------------------------
-- 1. Loại hình đào tạo dùng làm loại khóa
------------------------------------------------------------------------------
MERGE [dbo].[training_types] AS tgt
USING (VALUES
    ('TRNTP-DTLT', N'Đào tạo liên tục (ĐTLT)',            N'Khóa mở theo đợt: ĐTLT Đợt X'),
    ('TRNTP-GPHN', N'Thực hành giấy phép hành nghề (GPHN)', N'Thực hành khám chữa bệnh trước khi cấp GPHN — khóa mở liên tục, mỗi học viên có lịch vòng riêng'),
    ('TRNTP-CTCV', N'Cầm tay chỉ việc (CTCV)',            NULL),
    ('TRNTP-THBV', N'Tập huấn bệnh viện (THBV)',          NULL)
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM');
GO

------------------------------------------------------------------------------
-- 2. Khóa học
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.courses', N'training_type_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [training_type_id] VARCHAR(20) NULL
        CONSTRAINT FK_courses_training_type REFERENCES [dbo].[training_types] ([id]);
GO
IF COL_LENGTH(N'dbo.courses', N'batch_no') IS NULL
    ALTER TABLE [dbo].[courses] ADD [batch_no] INT NULL; -- "Đợt số X" của khóa ĐTLT
GO
IF COL_LENGTH(N'dbo.courses', N'is_rolling') IS NULL
    ALTER TABLE [dbo].[courses] ADD [is_rolling] BIT NOT NULL
        CONSTRAINT DF_courses_is_rolling DEFAULT (0);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_training_type' AND object_id = OBJECT_ID(N'dbo.courses'))
    CREATE NONCLUSTERED INDEX [IX_courses_training_type] ON [dbo].[courses] ([training_type_id]);
GO

------------------------------------------------------------------------------
-- 3. Chương trình đào tạo
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.training_programs', N'theory_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [theory_hours] INT NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'practice_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [practice_hours] INT NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'total_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [total_hours] AS (ISNULL([theory_hours], 0) + ISNULL([practice_hours], 0)) PERSISTED;
GO
IF COL_LENGTH(N'dbo.training_programs', N'credit_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [credit_hours] DECIMAL(6, 1) NULL; -- số giờ tín chỉ
GO
IF COL_LENGTH(N'dbo.training_programs', N'tuition_fee') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [tuition_fee] DECIMAL(18, 0) NULL; -- học phí (VNĐ)
GO
IF COL_LENGTH(N'dbo.training_programs', N'duration_value') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [duration_value] DECIMAL(6, 2) NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'duration_unit') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [duration_unit] VARCHAR(10) NULL
        CONSTRAINT CHK_trprog_duration_unit CHECK ([duration_unit] IN ('day', 'week', 'month'));
GO
IF COL_LENGTH(N'dbo.training_programs', N'target_audience') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [target_audience] NVARCHAR(300) NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'department_note') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [department_note] NVARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trprog_training_type' AND object_id = OBJECT_ID(N'dbo.training_programs'))
    CREATE NONCLUSTERED INDEX [IX_trprog_training_type] ON [dbo].[training_programs] ([training_type_id]);
GO
-- Nhập danh mục cập nhật theo mã ⇒ mã không được trùng. Dữ liệu cũ có mã trùng
-- thì bỏ qua (báo lại) thay vì làm hỏng migration — sửa tay rồi chạy migration sau.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_trprog_code' AND object_id = OBJECT_ID(N'dbo.training_programs'))
BEGIN
    IF EXISTS (SELECT code FROM [dbo].[training_programs] WHERE code IS NOT NULL AND code <> '' GROUP BY code HAVING COUNT(*) > 1)
        PRINT N'⚠️  training_programs có mã trùng — chưa tạo UQ_trprog_code.';
    ELSE
    BEGIN
        UPDATE [dbo].[training_programs] SET code = NULL WHERE code = '';
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_trprog_code] ON [dbo].[training_programs] ([code]) WHERE [code] IS NOT NULL;
    END
END
GO

------------------------------------------------------------------------------
-- 4. Bài học / vòng thực hành
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.program_lessons', N'lesson_kind') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [lesson_kind] VARCHAR(10) NOT NULL
        CONSTRAINT DF_program_lessons_kind DEFAULT ('theory')
        CONSTRAINT CHK_program_lessons_kind CHECK ([lesson_kind] IN ('theory', 'rotation'));
GO
IF COL_LENGTH(N'dbo.program_lessons', N'duration_value') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [duration_value] DECIMAL(6, 2) NULL;
GO
IF COL_LENGTH(N'dbo.program_lessons', N'duration_unit') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [duration_unit] VARCHAR(10) NULL
        CONSTRAINT CHK_program_lessons_duration_unit CHECK ([duration_unit] IN ('day', 'week', 'month'));
GO
IF COL_LENGTH(N'dbo.program_lessons', N'allow_split') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [allow_split] BIT NOT NULL
        CONSTRAINT DF_program_lessons_allow_split DEFAULT (0);
GO

------------------------------------------------------------------------------
-- 5. Khoa được chọn cho 1 vòng thực hành
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lesson_departments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lesson_departments] (
        [lesson_id]     VARCHAR(20) NOT NULL,
        [department_id] VARCHAR(20) NOT NULL,
        [display_order] INT         NOT NULL CONSTRAINT DF_lesson_departments_order DEFAULT (0),
        CONSTRAINT PK_lesson_departments PRIMARY KEY ([lesson_id], [department_id]),
        CONSTRAINT FK_lsndept_lesson     FOREIGN KEY ([lesson_id])     REFERENCES [dbo].[program_lessons] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_lsndept_department FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments]     ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_lesson_departments_department] ON [dbo].[lesson_departments] ([department_id]);
END
GO

PRINT N'✅ Migration 2026-11-07_training_course_types_rotations hoàn tất.';
GO

-- @migration 2026-11-08_staff_mentor_profile.sql
/* ============================================================================
 * Đào tạo GĐ2 — Thông tin giảng viên / người hướng dẫn thực hành (NHD)
 * ----------------------------------------------------------------------------
 * Nhập file "Danh sách người hành nghề" (2.xlsx) và chụp thông tin NHD lên hồ
 * sơ thực hành GPHN (Phiếu nhận xét cần ông/bà, ngày sinh, số CCHN, phạm vi).
 * Xem docs/ke-hoach-sua-dao-tao.md mục 4.7.
 *
 * 1. users.gender: 'male' | 'female' | 'other' (utils/gender.js) — mục "ông/bà".
 *    Ngày sinh dùng cột có sẵn users.date_of_birth (không thêm users.dob).
 * 2. staff_practice_licenses.scope_code: "Mã hoá phạm vi điều chỉnh theo 2148
 *    (BHXH)", vd 101 hoặc 101.23 — giữ dạng chữ để không mất số 0 / dấu chấm.
 *
 * CCCD của nhân sự cố ý KHÔNG lưu (không mẫu giấy tờ nào dùng).
 * Idempotent — mỗi bước tự kiểm tra nên chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

------------------------------------------------------------------------------
-- 1. Giới tính nhân sự
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.users', N'gender') IS NULL
    ALTER TABLE [dbo].[users] ADD [gender] VARCHAR(10) NULL;
GO

------------------------------------------------------------------------------
-- 2. Mã hoá phạm vi hành nghề theo QĐ 2148 (BHXH)
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.staff_practice_licenses', N'scope_code') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [scope_code] NVARCHAR(50) NULL;
GO

-- @migration 2026-11-09_staff_license_no_unicode.sql
/* ============================================================================
 * CCHN — số chứng chỉ hành nghề lưu được chữ Việt (NVARCHAR)
 * ----------------------------------------------------------------------------
 * staff_practice_licenses.license_no đang là VARCHAR(50): số CCHN cấp ngoài Nghệ
 * An có chữ "Đ" ("…/ĐNAI-CCHN", "…/ĐL-CCHN") bị lưu thành "?" — nhập lại file
 * "Danh sách người hành nghề" vẫn ghi "?" và lần nào cũng báo "thay đổi".
 * Đổi sang NVARCHAR(50); index UNIQUE có lọc phải bỏ rồi tạo lại quanh ALTER.
 * Dữ liệu đã hỏng ("?") không khôi phục được ở đây — nhập lại 2.xlsx sẽ sửa.
 *
 * Idempotent — chỉ đổi khi cột còn là varchar; index tạo lại nếu chưa có.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns c
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.staff_practice_licenses')
      AND c.name = N'license_no'
      AND t.name = N'varchar'
)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_stafflic_license_no' AND object_id = OBJECT_ID(N'dbo.staff_practice_licenses'))
        DROP INDEX [UQ_stafflic_license_no] ON [dbo].[staff_practice_licenses];
    ALTER TABLE [dbo].[staff_practice_licenses] ALTER COLUMN [license_no] NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_stafflic_license_no' AND object_id = OBJECT_ID(N'dbo.staff_practice_licenses'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_stafflic_license_no] ON [dbo].[staff_practice_licenses] ([license_no])
        WHERE [license_no] IS NOT NULL;
GO

-- @migration 2026-11-10_enrollment_programs.sql
/* ============================================================================
 * Đào tạo GĐ3 — Ghi danh theo chương trình; hồ sơ thực hành GPHN; bài học
 * tự gắn cho học viên ĐTLT; bổ sung hồ sơ học viên theo sổ thực hành
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-sua-dao-tao.md mục 4.4, 4.6, 4.7.
 *
 * 1. course_enrollments: cột audit (created_at/by, updated_at/by) — code ghi
 *    danh đã dùng created_by/updated_at nhưng 2026-10-09_audit_columns không
 *    thêm được vào bảng này trên một số DB ⇒ ghi danh báo "Invalid column".
 * 2. course_enrollments: chương trình đã chọn (program_id) + các trường đăng ký
 *    thực hành của sổ GPHN (mã thực hành 226.BS, lĩnh vực, hình thức hành nghề,
 *    thời gian, địa điểm, đơn vị cử đi, NHD chính, tiến độ). UNIQUE đổi từ
 *    (khóa, học viên) sang (khóa, học viên, chương trình): sổ cũ có học viên đi
 *    2 hồ sơ trong cùng khóa GPHN (vd GPHN_BS_1 rồi GPHN_BS_2).
 * 3. enrollment_lessons: bài học của từng học viên — chép từ lesson_programs
 *    lúc chọn chương trình (sửa chương trình sau này không đổi hồ sơ cũ).
 * 4. trainees: nơi sinh (tỉnh), ngày tốt nghiệp, ngày cấp bằng, mã học viên sổ cũ.
 *
 * Idempotent — mỗi bước tự kiểm tra nên chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

------------------------------------------------------------------------------
-- 1. Cột audit của course_enrollments
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.course_enrollments', N'created_at') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [created_at] DATETIME2 NOT NULL
        CONSTRAINT [DF_course_enrollments_created_at] DEFAULT GETDATE();
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'created_by') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [created_by] VARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'updated_at') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [updated_at] DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'updated_by') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [updated_by] VARCHAR(20) NULL;
GO

------------------------------------------------------------------------------
-- 2. Ghi danh theo chương trình + hồ sơ thực hành GPHN
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.course_enrollments', N'program_id') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [program_id] VARCHAR(20) NULL
        CONSTRAINT FK_enroll_program REFERENCES [dbo].[training_programs] ([id]);
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'practice_code') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [practice_code] NVARCHAR(30) NULL; -- mã thực hành, vd 226.BS
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'professional_field') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [professional_field] NVARCHAR(200) NULL; -- lĩnh vực chuyên môn
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'practice_form') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [practice_form] NVARCHAR(300) NULL; -- hình thức hành nghề
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'start_date') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [start_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'end_date') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [end_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'total_duration') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [total_duration] NVARCHAR(50) NULL; -- "12 tháng"
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'practice_location') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [practice_location] NVARCHAR(500) NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'sending_unit') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [sending_unit] NVARCHAR(200) NULL; -- đơn vị cử đi
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'main_mentor_user_id') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [main_mentor_user_id] VARCHAR(20) NULL
        CONSTRAINT FK_enroll_main_mentor REFERENCES [dbo].[users] ([id]);
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'progress_status') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [progress_status] VARCHAR(15) NOT NULL
        CONSTRAINT DF_enroll_progress_status DEFAULT ('in_progress')
        CONSTRAINT CHK_enroll_progress_status CHECK ([progress_status] IN ('in_progress', 'completed', 'dropped'));
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'progress_date') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [progress_date] DATE NULL; -- ngày hoàn thành / nghỉ học
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'progress_reason') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [progress_reason] NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_course_enrollments_program' AND object_id = OBJECT_ID(N'dbo.course_enrollments'))
    CREATE NONCLUSTERED INDEX [IX_course_enrollments_program] ON [dbo].[course_enrollments] ([program_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_enroll_practice_code' AND object_id = OBJECT_ID(N'dbo.course_enrollments'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_enroll_practice_code] ON [dbo].[course_enrollments] ([practice_code])
        WHERE [practice_code] IS NOT NULL;
GO

-- UNIQUE (khóa, học viên) → (khóa, học viên, chương trình). program_id NULL vẫn
-- chỉ được 1 dòng / cặp (khóa, học viên) như trước.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_enroll_course_trainee' AND parent_object_id = OBJECT_ID(N'dbo.course_enrollments'))
    ALTER TABLE [dbo].[course_enrollments] DROP CONSTRAINT [UQ_enroll_course_trainee];
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_enroll_course_trainee_program' AND object_id = OBJECT_ID(N'dbo.course_enrollments'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_enroll_course_trainee_program]
        ON [dbo].[course_enrollments] ([course_id], [trainee_id], [program_id]);
GO

------------------------------------------------------------------------------
-- 3. Bài học của từng học viên (ĐTLT)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.enrollment_lessons', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[enrollment_lessons] (
        [enrollment_id] VARCHAR(20) NOT NULL,
        [lesson_id]     VARCHAR(20) NOT NULL,
        [display_order] INT         NOT NULL CONSTRAINT DF_enrollment_lessons_order DEFAULT (0),
        [status]        VARCHAR(15) NOT NULL CONSTRAINT DF_enrollment_lessons_status DEFAULT ('not_started'),
        [completed_at]  DATE        NULL,
        [created_at]    DATETIME2   NOT NULL CONSTRAINT DF_enrollment_lessons_created_at DEFAULT (GETDATE()),
        [updated_at]    DATETIME2   NULL,
        [updated_by]    VARCHAR(20) NULL,
        CONSTRAINT PK_enrollment_lessons PRIMARY KEY ([enrollment_id], [lesson_id]),
        CONSTRAINT FK_enrlsn_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_enrlsn_lesson     FOREIGN KEY ([lesson_id])     REFERENCES [dbo].[program_lessons]    ([id]) ON DELETE CASCADE,
        CONSTRAINT CHK_enrlsn_status CHECK ([status] IN ('not_started', 'in_progress', 'done'))
    );
    CREATE NONCLUSTERED INDEX [IX_enrollment_lessons_lesson] ON [dbo].[enrollment_lessons] ([lesson_id]);
END
GO

------------------------------------------------------------------------------
-- 4. Hồ sơ học viên theo sổ thực hành
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.trainees', N'birth_province') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [birth_province] NVARCHAR(100) NULL; -- nơi sinh (tỉnh)
GO
IF COL_LENGTH(N'dbo.trainees', N'graduated_date') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [graduated_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.trainees', N'degree_issued_date') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [degree_issued_date] DATE NULL; -- ngày cấp bằng
GO
IF COL_LENGTH(N'dbo.trainees', N'legacy_code') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [legacy_code] NVARCHAR(30) NULL; -- mã học viên trong sổ cũ
GO

PRINT N'✅ Migration 2026-11-10_enrollment_programs hoàn tất.';
GO

-- @migration 2026-11-11_enrollment_rotations.sql
/* ============================================================================
 * Đào tạo GĐ4 — Vòng thực hành GPHN của từng học viên (khoa, ngày, NHD)
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-sua-dao-tao.md mục 4.5. Mỗi lượt ghi danh GPHN có các vòng
 * sinh từ bài học loại 'rotation' của chương trình (lesson_programs). Vòng
 * allow_split (chuyên khoa lẻ) có nhiều dòng — mỗi khoa 1 dòng.
 *
 * Thông tin người hướng dẫn (NHD) lưu BẢN CHỤP tại lúc phân công (tên, ông/bà,
 * MNV, ngày sinh, trình độ, số CCHN, ngày cấp, điện thoại, phạm vi HĐCM): phiếu
 * nhận xét / quyết định đã ký phải giữ đúng thông tin tại thời điểm đó dù hồ sơ
 * CCHN đổi sau này. Học lại vòng không đạt = dòng mới, attempt_no + 1.
 *
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.enrollment_rotations', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[enrollment_rotations] (
        [id]                  VARCHAR(20)    NOT NULL PRIMARY KEY,
        [enrollment_id]       VARCHAR(20)    NOT NULL,
        [lesson_id]           VARCHAR(20)    NULL,      -- vòng (program_lessons) — NULL nếu vòng bị xoá khỏi danh mục
        [round_title]         NVARCHAR(255)  NULL,      -- tên vòng lúc tạo (giữ khi vòng bị xoá/đổi tên)
        [seq]                 INT            NOT NULL CONSTRAINT DF_enrrot_seq DEFAULT (0),
        [department_id]       VARCHAR(20)    NULL,
        [department_name]     NVARCHAR(200)  NULL,      -- tên khoa lúc phân công / tên gốc khi nhập sổ cũ
        [start_date]          DATE           NULL,
        [end_date]            DATE           NULL,
        [duration_text]       NVARCHAR(50)   NULL,      -- "03 tháng", "1.5 tuần"
        [mentor_user_id]      VARCHAR(20)    NULL,
        [mentor_name]         NVARCHAR(150)  NULL,
        [mentor_salutation]   NVARCHAR(10)   NULL,      -- ông / bà
        [mentor_staff_no]     NVARCHAR(20)   NULL,
        [mentor_dob]          DATE           NULL,
        [mentor_qualification] NVARCHAR(200) NULL,
        [mentor_license_no]   NVARCHAR(50)   NULL,
        [mentor_license_date] DATE           NULL,
        [mentor_phone]        NVARCHAR(30)   NULL,
        [mentor_scope]        NVARCHAR(1000) NULL,      -- phạm vi hoạt động chuyên môn
        [result]              VARCHAR(10)    NOT NULL CONSTRAINT DF_enrrot_result DEFAULT ('pending'),
        [attempt_no]          INT            NOT NULL CONSTRAINT DF_enrrot_attempt DEFAULT (1),
        [note]                NVARCHAR(500)  NULL,
        [created_at]          DATETIME2      NOT NULL CONSTRAINT DF_enrrot_created_at DEFAULT (GETDATE()),
        [created_by]          VARCHAR(20)    NULL,
        [updated_at]          DATETIME2      NULL,
        [updated_by]          VARCHAR(20)    NULL,
        CONSTRAINT FK_enrrot_enrollment FOREIGN KEY ([enrollment_id])  REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_enrrot_lesson     FOREIGN KEY ([lesson_id])      REFERENCES [dbo].[program_lessons]    ([id]) ON DELETE SET NULL,
        CONSTRAINT FK_enrrot_department FOREIGN KEY ([department_id])  REFERENCES [dbo].[departments]        ([id]) ON DELETE SET NULL,
        CONSTRAINT FK_enrrot_mentor     FOREIGN KEY ([mentor_user_id]) REFERENCES [dbo].[users]              ([id]),
        CONSTRAINT CHK_enrrot_result CHECK ([result] IN ('pending', 'pass', 'fail')),
        CONSTRAINT CHK_enrrot_dates CHECK ([start_date] IS NULL OR [end_date] IS NULL OR [end_date] >= [start_date])
    );
    CREATE NONCLUSTERED INDEX [IX_enrrot_enrollment] ON [dbo].[enrollment_rotations] ([enrollment_id], [seq]);
    CREATE NONCLUSTERED INDEX [IX_enrrot_mentor_dates] ON [dbo].[enrollment_rotations] ([mentor_user_id], [start_date], [end_date]);
    CREATE NONCLUSTERED INDEX [IX_enrrot_department_dates] ON [dbo].[enrollment_rotations] ([department_id], [start_date], [end_date]);
END
GO

PRINT N'✅ Migration 2026-11-11_enrollment_rotations hoàn tất.';
GO

-- @migration 2026-11-12_dtlt_programs_lessons.sql
/* ============================================================================
 * Chương trình ĐTLT + bài học (từ "Chi tiết chương trình học ĐTLT.xlsx" và thư mục
 * "Bài học ĐTLT" của phòng Đào tạo — 2026-10-20). Gói trọn trong 1 file:
 * ----------------------------------------------------------------------------
 * 0) Thêm cột training_programs.min_capacity (sĩ số tối thiểu; tối đa = max_capacity).
 * 1) Tạo chương trình còn thiếu (theo mã), rồi cập nhật 57 chương trình theo MÃ (training_programs.code): loại hình ĐTLT, số tiết
 *    LT/TH, thời lượng, đối tượng, sĩ số tối thiểu/tối đa, khoa (tra theo departments.code —
 *    không có mã khoa đó thì giữ khoa đang có), ghi chú khoa.
 * 2) Thêm bài học (lesson_kind theory, mã <mã CT>_NN) cho 32 chương trình — CHỈ khi
 *    chương trình đó chưa có bài học nào (đã nhập / đã sửa tay thì bỏ qua).
 * File sinh từ DB dev; nguồn Excel nhập bằng scripts/import-dtlt-lessons.js.
 *
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
GO

-- 0) Cột sĩ số tối thiểu
IF COL_LENGTH('dbo.training_programs', 'min_capacity') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [min_capacity] INT NULL;
GO

-- 1a) Tạo chương trình còn thiếu
INSERT INTO training_programs (id, code, name, display_order, created_by)
SELECT 'CT' + LEFT(REPLACE(NEWID(), '-', ''), 18), v.code, v.name, v.ord, 'SYSTEM'
FROM (VALUES
    (N'ĐTLT_1', N'Giải phẫu bệnh cơ bản', 21),
    (N'ĐTLT_2', N'Chấn thương Chỉnh hình cơ bản', 22),
    (N'ĐTLT_3', N'Chẩn đoán và điều trị các bệnh Nội tiết', 23),
    (N'ĐTLT_4', N'Kỹ thuật viên Nội soi Tiêu hóa', 24),
    (N'ĐTLT_5', N'Siêu âm cơ bản', 25),
    (N'ĐTLT_6', N'Nội soi tiêu hóa cơ bản', 26),
    (N'ĐTLT_7', N'Nội soi can thiệp đường tiêu hóa', 27),
    (N'ĐTLT_8', N'Nội soi đại tràng', 28),
    (N'ĐTLT_9', N'Phẫu thuật Nội soi cơ bản', 29),
    (N'ĐTLT_10', N'Hóa sinh cơ bản', 30),
    (N'ĐTLT_11', N'Chẩn đoán và điều trị bệnh đột quỵ não', 31),
    (N'ĐTLT_12', N'Chẩn đoán và điều trị suy tim', 32),
    (N'ĐTLT_13', N'Hướng dẫn đọc Điện tâm đồ', 33),
    (N'ĐTLT_14', N'Điện não đồ', 34),
    (N'ĐTLT_17', N'Tăng cường năng lực quản lý Điều dưỡng', 37),
    (N'ĐTLT_18', N'Gây mê hồi sức cơ bản', 38),
    (N'ĐTLT_19', N'Gây mê hồi sức trong phẫu thuật nội soi', 39),
    (N'ĐTLT_20', N'X.quang cơ bản', 40),
    (N'ĐTLT_21', N'Cắt lớp vi tính cơ bản', 41),
    (N'ĐTLT_23', N'Khám nội soi tai mũi họng', 43),
    (N'ĐTLT_24', N'Mở khí quản', 44),
    (N'ĐTLT_25', N'Đào tạo điều dưỡng chuyên ngành tai mũi họng', 45),
    (N'ĐTLT_26', N'Điều dưỡng nha khoa', 46),
    (N'ĐTLT_27', N'Kỹ thuật cấp cứu cơ bản - Bác sĩ', 47),
    (N'ĐTLT_28', N'Kỹ thuật cấp cứu cơ bản - Điều dưỡng', 48),
    (N'ĐTLT_29', N'Phẫu thuật Phaco', 49),
    (N'ĐTLT_30', N'Chụp mạch huỳnh quang đáy mắt', 50),
    (N'ĐTLT_31', N'Kiểm soát nhiễm khuẩn', 51),
    (N'ĐTLT_32', N'Cấp cứu ngừng tuần hoàn', 52),
    (N'ĐTLT_33', N'Chẩn đoán và điều trị chấn thương sọ não', 53),
    (N'ĐTLT_34', N'Tiêm an toàn và quản lý chất rắn y tế', 54),
    (N'ĐTLT_35', N'Kỹ năng tư vấn và Giáo dục sức khỏe', 55),
    (N'ĐTLT_37', N'Nội soi phế quản ống mềm', 57),
    (N'ĐTLT_38', N'Chăm sóc bệnh nhân hồi sức sau mổ', 58),
    (N'ĐTLT_39', N'Chăm sóc bệnh nhân thở máy', 59),
    (N'ĐTLT_40', N'Thông khí nhân tạo cơ bản', 60),
    (N'ĐTLT_41', N'Kỹ thuật xét nghiệm Huyết học - Truyền máu cơ bản', 61),
    (N'ĐTLT_42', N'Chẩn đoán và điều trị các bệnh lý Cơ xương khớp cơ bản', 62),
    (N'ĐTLT_44', N'Khúc xạ cơ bản', 64),
    (N'ĐTLT_45', N'Phẫu thuật gan mật cơ bản', 65),
    (N'ĐTLT_46', N'Kỹ thuật lọc máu thận nhân tạo cơ bản - Điều dưỡng - KTV', 66),
    (N'ĐTLT_47', N'Kỹ thuật lọc máu thận nhân tạo cơ bản - Bác sỹ', 67),
    (N'ĐTLT_48', N'Kỹ thuật xét nghiệm vi sinh cơ bản', 68),
    (N'ĐTLT_49', N'Kỹ thuật xoa bóp bấm huyệt', 69),
    (N'ĐTLT_50', N'Kỹ thuật châm cứu cơ bản', 70),
    (N'ĐTLT_51', N'Đọc phim MRI cơ bản', 71),
    (N'ĐTLT_52', N'Chẩn đoán và điều trị viêm gan', 72),
    (N'ĐTLT_53', N'Tiêm khớp cơ bản', 73),
    (N'ĐTLT_54', N'Chẩn đoán và điều trị một một số bệnh đường tiêu hóa thường gặp', 74),
    (N'ĐTLT_55', N'Chẩn đoán và điều trị các bệnh lý Huyết học – Truyền máu', 75),
    (N'ĐTLT_56', N'Kỹ thuật viên Gây mê hồi sức', 76),
    (N'ĐTLT_57', N'Dụng cụ viên Gây mê hồi sức', 77),
    (N'ĐTLT_63', N'Kỹ thuật khai thông mạch não bằng điều trị thuốc tiêu sợi huyết trong nhồi máu não cấp', 83),
    (N'ĐTLT_64', N'Phục hồi chức năng cơ bản', 84),
    (N'ĐTLT_65', N'Hồi sức cấp cứu cơ bản', 85),
    (N'ĐTLT_66', N'Kỹ thuật lọc máu liên tục và thay huyết tương', 86),
    (N'ĐTLT_67', N'Chăm sóc người bệnh lọc máu liên tục và thay huyết tương', 87)
) v (code, name, ord)
WHERE NOT EXISTS (SELECT 1 FROM training_programs p WHERE p.code = v.code);
GO

-- 1b) Thông tin chương trình
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 188, practice_hours = 340,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS9'), department_id), -- Khoa Giải Phẫu Bệnh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_1';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 132, practice_hours = 1308,
    duration = N'09 tháng', duration_value = 9, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS21'), department_id), -- Khoa Chấn Thương - Chỉnh Hình
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_2';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 80, practice_hours = 240,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS37'), department_id), -- Khoa Nội Tiết - ĐTĐ
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_3';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 50, practice_hours = 430,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_4';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 92, practice_hours = 388,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_5';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 420,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_6';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 420,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên hoặc nội soi đại tràng', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_7';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 50, practice_hours = 430,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_8';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 102, practice_hours = 378,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS19'), department_id), -- Khoa Ngoại Tiêu Hóa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_9';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 130, practice_hours = 246,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ, Dược sĩ, Cử nhân, KTV xét nghiệm', min_capacity = 1, max_capacity = 8,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS7'), department_id), -- Khoa Hóa Sinh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_10';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 912,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS45'), department_id), -- Trung Tâm Đột Quỵ
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_11';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 120,
    duration = N'02 tháng', duration_value = 2, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS41'), department_id), -- Khoa Nội Tim Mạch 1
    department_note = COALESCE(N'Trung tâm Tim mạch', department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_12';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 80, practice_hours = 160,
    duration = N'02 tháng', duration_value = 2, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 20,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS41'), department_id), -- Khoa Nội Tim Mạch 1
    department_note = COALESCE(N'Trung tâm Tim mạch', department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_13';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 120,
    duration = N'1,5 tháng', duration_value = 1.5, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 3, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS44'), department_id), -- Khoa Thần Kinh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_14';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 39, practice_hours = 17,
    duration = N'07 ngày', duration_value = 7, duration_unit = N'day',
    target_audience = N'Điều dưỡng, hộ sinh, KTV', min_capacity = 20, max_capacity = 25,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'PCN6'), department_id), -- Phòng Điều Dưỡng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_17';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 89, practice_hours = 419,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_18';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 81, practice_hours = 269,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 8,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_19';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 126, practice_hours = 310,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS2'), department_id), -- Khoa X-Quang
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_20';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 96, practice_hours = 410,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS2'), department_id), -- Khoa X-Quang
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_21';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 88, practice_hours = 310,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS27'), department_id), -- Khoa Tai Mũi Họng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_23';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 32, practice_hours = 96,
    duration = N'01 tháng', duration_value = 1, duration_unit = N'month',
    target_audience = N'Bác sĩ, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS27'), department_id), -- Khoa Tai Mũi Họng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_24';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 96, practice_hours = 360,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS27'), department_id), -- Khoa Tai Mũi Họng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_25';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 352,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS28'), department_id), -- Khoa Răng Hàm Mặt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_26';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 110, practice_hours = 454,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS13'), department_id), -- Khoa Cấp Cứu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_27';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 94, practice_hours = 449,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 2, max_capacity = 25,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS13'), department_id), -- Khoa Cấp Cứu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_28';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 150, practice_hours = 330,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN', min_capacity = 2, max_capacity = 5,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS29'), department_id), -- Khoa Mắt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_29';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 90, practice_hours = 150,
    duration = N'1,5 tháng', duration_value = 1.5, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS29'), department_id), -- Khoa Mắt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_30';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 24, practice_hours = 16,
    duration = N'05 ngày', duration_value = 5, duration_unit = N'day',
    target_audience = N'Nhân viên y tế', min_capacity = 10, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS10'), department_id), -- Khoa Kiểm Soát Nhiễm Khuẩn
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_31';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 10, practice_hours = 30,
    duration = N'07 ngày', duration_value = 7, duration_unit = N'day',
    target_audience = N'Bác sĩ, điều dưỡng, hộ sinh, KTV', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS13'), department_id), -- Khoa Cấp Cứu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_32';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 200, practice_hours = 200,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS20'), department_id), -- Khoa Phẫu Thuật Thần Kinh Cột Sống
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_33';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 27, practice_hours = 11,
    duration = N'04 ngày', duration_value = 4, duration_unit = N'day',
    target_audience = N'Điều dưỡng, hộ sinh, KTV', min_capacity = 20, max_capacity = 35,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'PCN6'), department_id), -- Phòng Điều Dưỡng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_34';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 21, practice_hours = 29,
    duration = N'05 ngày', duration_value = 5, duration_unit = N'day',
    target_audience = N'Điều dưỡng, hộ sinh', min_capacity = 2, max_capacity = 25,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'PCN6'), department_id), -- Phòng Điều Dưỡng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_35';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 20, practice_hours = 280,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 5,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS35'), department_id), -- Khoa Nội Dị Ứng - Hô Hấp
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_37';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 128, practice_hours = 340,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS32'), department_id), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_38';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 112, practice_hours = 336,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS32'), department_id), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_39';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 100, practice_hours = 378,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS32'), department_id), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_40';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 116, practice_hours = 412,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ, Y sĩ, Điều dưỡng, Hộ sinh, KTV', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS6'), department_id), -- Khoa Huyết Học
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_41';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 66, practice_hours = 462,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS43'), department_id), -- Khoa Nội Cơ Xương Khớp
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_42';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 150, practice_hours = 330,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ nhãn khoa đã có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS29'), department_id), -- Khoa Mắt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_44';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 370,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 5,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS16'), department_id), -- Khoa Ngoại Tổng Hợp 2
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_45';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 152, practice_hours = 652,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'ĐD, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS38'), department_id), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_46';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 156, practice_hours = 656,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'BS', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS38'), department_id), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_47';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 436,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS, KTV xét nghiệm, Cử nhân sinh học, ĐD, Dược sĩ', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS5'), department_id), -- Khoa Vi Sinh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_48';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 228, practice_hours = 268,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS, ĐD,KTV, YS YHCT', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS47'), department_id), -- Khoa Y Học Cổ Truyền
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_49';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 172, practice_hours = 296,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS, ĐD,KTV, YS YHCT', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS47'), department_id), -- Khoa Y Học Cổ Truyền
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_50';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 96, practice_hours = 440,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS2'), department_id), -- Khoa X-Quang
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_51';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 100, practice_hours = 304,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS50'), department_id), -- Khoa Nhiễm Khuẩn Tổng Hợp
    department_note = COALESCE(N'Trung tâm Bệnh nhiệt đới', department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_52';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 128, practice_hours = 416,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN/GPHN', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS43'), department_id), -- Khoa Nội Cơ Xương Khớp
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_53';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 198, practice_hours = 282,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS34'), department_id), -- Khoa Nội Tiêu Hóa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_54';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 177, practice_hours = 187,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS39'), department_id), -- Khoa Nội Huyết Học Lâm Sàng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_55';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 68, practice_hours = 440,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 1, max_capacity = 12,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_56';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 126, practice_hours = 274,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, Y sỹ, KTV', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_57';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 72, practice_hours = 288,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS45'), department_id), -- Trung Tâm Đột Quỵ
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_63';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 260, practice_hours = 684,
    duration = N'09 tháng', duration_value = 9, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS48'), department_id), -- Khoa Phục Hồi Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_64';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 82, practice_hours = 436,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 20,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS30'), department_id), -- Khoa Hồi Sức Tích Cực
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_65';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 160, practice_hours = 390,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS30'), department_id), -- Khoa Hồi Sức Tích Cực
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_66';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 128, practice_hours = 377,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS30'), department_id), -- Khoa Hồi Sức Tích Cực
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_67';
GO

-- 2) Bài học — mỗi chương trình 1 batch
-- ĐTLT_2: 32 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_2');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_2_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_2_02', N'Bài 1. Đại cương về gãy xương', 8, 46),
        (2, N'ĐTLT_2_03', N'Bài 2. Hoại thư sinh hơi', 4, 46),
        (3, N'ĐTLT_2_04', N'Bài 3. Hội chứng chèn ép khoang cấp tính', 4, 46),
        (4, N'ĐTLT_2_05', N'Bài 4. Gãy xương hở', 4, 46),
        (5, N'ĐTLT_2_06', N'Bài 5. Gãy xương vai', 4, 46),
        (6, N'ĐTLT_2_07', N'Bài 6. Gãy xương đòn', 4, 46),
        (7, N'ĐTLT_2_08', N'Bài 7. Gãy xương cánh tay', 4, 46),
        (8, N'ĐTLT_2_09', N'Bài 8. Gãy hai xương cẳng tay', 4, 46),
        (9, N'ĐTLT_2_10', N'Bài 9. Gãy đầu dưới xương quay', 4, 46),
        (10, N'ĐTLT_2_11', N'Bài 10. Gãy khung chậu', 4, 46),
        (11, N'ĐTLT_2_12', N'Bài 11. Gãy cổ xương đùi', 4, 46),
        (12, N'ĐTLT_2_13', N'Bài 12. Gãy xương đùi', 4, 46),
        (13, N'ĐTLT_2_14', N'Bài 13. Gãy xương gót', 4, 46),
        (14, N'ĐTLT_2_15', N'Bài 14. Gãy xương bánh chè', 4, 46),
        (15, N'ĐTLT_2_16', N'Bài 15. Gãy xương cẳng chân', 4, 46),
        (16, N'ĐTLT_2_17', N'Bài 16. Gãy mâm chày', 4, 46),
        (17, N'ĐTLT_2_18', N'Bài 17. Đại cương về trật khớp.', 4, 46),
        (18, N'ĐTLT_2_19', N'Bài 18. Trật khớp vai.', 4, 46),
        (19, N'ĐTLT_2_20', N'Bài 19. Trật khớp khuỷu', 4, 46),
        (20, N'ĐTLT_2_21', N'Bài 20. Trật khớp háng', 4, 46),
        (21, N'ĐTLT_2_22', N'Bài 21. Trật khớp gối', 4, 46),
        (22, N'ĐTLT_2_23', N'Bài 22. Vết thương khớp', 4, 46),
        (23, N'ĐTLT_2_24', N'Bài 23. Viêm xương tủy xương', 4, 46),
        (24, N'ĐTLT_2_25', N'Bài 24. U xương', 4, 46),
        (25, N'ĐTLT_2_26', N'Bài 25. Gãy xương vùng bàn tay', 4, 46),
        (26, N'ĐTLT_2_27', N'Bài 26. Gãy xương thuyền', 4, 46),
        (27, N'ĐTLT_2_28', N'Bài 27. Vết thương bàn tay', 4, 46),
        (28, N'ĐTLT_2_29', N'Bài 28. Nhiễm khuẩn bàn tay', 4, 46),
        (29, N'ĐTLT_2_30', N'Kiểm tra giữa khóa học', 4, 0),
        (30, N'ĐTLT_2_31', N'Thi kết thúc học phần', 4, 4),
        (31, N'ĐTLT_2_32', N'Tổng kết khóa học và nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_9: 22 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_9');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_9_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_9_02', N'Lịch sử của nội soi và PTNS', 4, 0),
        (2, N'ĐTLT_9_03', N'Phương tiện và dụng cụ PTNS', 4, 8),
        (3, N'ĐTLT_9_04', N'Năng lượng điện, laser và siêu âm trong PTNS', 4, 4),
        (4, N'ĐTLT_9_05', N'Chuẩn bị bệnh nhân và phòng mổ', 4, 4),
        (5, N'ĐTLT_9_06', N'Sinh lý bơm khí ổ bụng', 4, 4),
        (6, N'ĐTLT_9_07', N'Gây mê trong PTNS', 8, 20),
        (7, N'ĐTLT_9_08', N'Kỹ thuật đặt trocart ổ bụng', 4, 20),
        (8, N'ĐTLT_9_09', N'Các thao tác cơ bản trong PTNS', 4, 20),
        (9, N'ĐTLT_9_10', N'Khâu và làm nút chỉ thắt trong PTNS', 4, 20),
        (10, N'ĐTLT_9_11', N'Sử dụng, bảo quản và tiệt trùng dụng cụ', 8, 8),
        (11, N'ĐTLT_9_12', N'Một số lỗi kỹ thuật hay gặp trong PTNS', 4, 8),
        (12, N'ĐTLT_9_13', N'Nội soi ổ bụng chẩn đoán', 8, 60),
        (13, N'ĐTLT_9_14', N'PTNS cắt ruột thừa', 4, 60),
        (14, N'ĐTLT_9_15', N'PTNS khâu lổ thủng dạ dày tá tràng', 8, 60),
        (15, N'ĐTLT_9_16', N'PTNS cắt túi mật', 4, 60),
        (16, N'ĐTLT_9_17', N'PTNS sỏi đường mật chính', 4, 28),
        (17, N'ĐTLT_9_18', N'PTNS Biến chứng của PTNS', 4, 0),
        (18, N'ĐTLT_9_19', N'PTNS hiện tại và xu hướng phát triển', 4, 0),
        (19, N'ĐTLT_9_20', N'Kiểm tra giữa khóa học.', 2, 2),
        (20, N'ĐTLT_9_21', N'Thi kết thúc khóa học', 4, 12),
        (21, N'ĐTLT_9_22', N'Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_11: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_11');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_11_01', N'Khai giảng, kiểm tra đầu vào', 0, 0),
        (1, N'ĐTLT_11_02', N'Đột quỵ não: Dịch tễ học, yếu tố nguy cơ, nguyên nhân, sinh lý bệnh', 4, 76),
        (2, N'ĐTLT_11_03', N'Kỹ thuật khám thần kinh và đánh giá các thang điểm đột quỵ', 4, 76),
        (3, N'ĐTLT_11_04', N'Giải phẫu mạch máu não, các hội chứng đột quỵ và định khu tổn thương', 4, 76),
        (4, N'ĐTLT_11_05', N'Chẩn đoán hình ảnh trong đột quỵ não', 4, 76),
        (5, N'ĐTLT_11_06', N'Tiếp cận chẩn đoán và xử trí ban đầu đột quỵ cấp, chẩn đoán phân biệt.', 4, 76),
        (6, N'ĐTLT_11_07', N'Chẩn đoán và xử trí đột quỵ thiếu máu não cấp', 4, 76),
        (7, N'ĐTLT_11_08', N'Chảy máu não: nguyên nhân, chẩn đoán, tiên lượng, điều trị, dự phòng', 4, 76),
        (8, N'ĐTLT_11_09', N'Chảy máu dưới nhện: nguyên nhân, chẩn đoán, tiên lượng, điều trị, dự phòng.', 4, 76),
        (9, N'ĐTLT_11_10', N'Huyết khối tĩnh mạch não: nguyên nhân, chẩn đoán, tiên lượng, điều trị, dự phòng', 4, 76),
        (10, N'ĐTLT_11_11', N'Chăm sóc người bệnh đột quy ở giai đoạn cấp: theo dõi và dự phòng biến chứng cấp, test nuốt, phòng ngừa huyết khối tĩnh mạch sâu, phục hồi chức năng.', 4, 76),
        (11, N'ĐTLT_11_12', N'Các kỹ thuật can thiệp nội mạch trong điều trị bệnh đột quỵ não', 4, 76),
        (12, N'ĐTLT_11_13', N'Ôn tập, giải đáp câu hỏi', 0, 0),
        (13, N'ĐTLT_11_14', N'Bế giảng, thi kết thúc khóa học', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_12: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_12');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_12_01', N'Khai giảng khóa đào tạo; Kiểm tra đầu vào.', 4, 0),
        (1, N'ĐTLT_12_02', N'Sinh lý tuần hoàn và sinh lý bệnh suy tim', 4, 8),
        (2, N'ĐTLT_12_03', N'Định nghĩa, phân độ và giai đoạn suy tim', 4, 8),
        (3, N'ĐTLT_12_04', N'Chẩn đoán và điều trị suy tim mạn tính', 4, 8),
        (4, N'ĐTLT_12_05', N'Chẩn đoán và điều trị Suy tim cấp', 4, 8),
        (5, N'ĐTLT_12_06', N'Vai trò của thiết bị hỗ trợ điều trị Suy tim', 4, 8),
        (6, N'ĐTLT_12_07', N'Cập nhật những tiến bộ mới trong Chẩn đoán và điều trị Suy tim', 6, 16),
        (7, N'ĐTLT_12_08', N'Bệnh mạch vành và suy tim: sinh lý bệnh, chẩn đoán, chiến lược điều trị và tiên lượng bệnh', 4, 8),
        (8, N'ĐTLT_12_09', N'Vai trò của ngoại khoa trong điều trị Suy tim (Phẫu thuật thay van, CABG, Ghép tim)', 4, 8),
        (9, N'ĐTLT_12_10', N'Suy tim ở người trưởng thành mắc tim bẩm sinh: chẩn đoán và chiến lược điều trị', 4, 8),
        (10, N'ĐTLT_12_11', N'Vai trò của các phương pháp đánh giá chức năng tim bằng siêu âm', 6, 16),
        (11, N'ĐTLT_12_12', N'Quản lý bệnh nhân suy tim: Các bệnh lý đi kèm và điều trị ngoại trú', 4, 8),
        (12, N'ĐTLT_12_13', N'Ôn tập', 4, 8),
        (13, N'ĐTLT_12_14', N'Kiểm tra cuối khóa', 4, 8);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_13: 17 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_13');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_13_01', N'Khai giảng khóa đào tạo. Kiểm tra đầu vào', 2, 4),
        (1, N'ĐTLT_13_02', N'Các khái niệm cơ bản về ĐTĐ; Hướng dẫn đọc một ĐTĐ', 4, 8),
        (2, N'ĐTLT_13_03', N'Phương pháp ghi ĐTĐ, hướng dẫn sử dụng máy điện tim', 4, 8),
        (3, N'ĐTLT_13_04', N'Phân tích hình dạng các sóng.', 6, 12),
        (4, N'ĐTLT_13_05', N'ĐTĐ trong chẩn đoán phì đại các buồng tim (dày nhĩ, dày thất…)', 4, 8),
        (5, N'ĐTLT_13_06', N'ĐTĐ trong chẩn đoán Hội chứng vành cấp', 6, 12),
        (6, N'ĐTLT_13_07', N'ĐTĐ trong chẩn đoán bệnh mạch vành ổn định', 6, 12),
        (7, N'ĐTLT_13_08', N'ĐTĐ trẻ em và trong một số bệnh tim bẩm sinh', 4, 8),
        (8, N'ĐTLT_13_09', N'Các rối loạn nhịp tim thường gặp trong thực hành lâm sàng', 6, 12),
        (9, N'ĐTLT_13_10', N'ĐTĐ trong chẩn đoán rối loạn nhịp tim chậm', 6, 12),
        (10, N'ĐTLT_13_11', N'Chẩn đoán và xử trí cơn nhịp nhanh kịch phát', 6, 12),
        (11, N'ĐTLT_13_12', N'ĐTĐ trong các bệnh lý van tim', 4, 8),
        (12, N'ĐTLT_13_13', N'ĐTĐ trong bệnh lý màng ngoài tim và rối loạn điện giải', 4, 8),
        (13, N'ĐTLT_13_14', N'Một số hội chứng bẩm sinh (Hội chứng Brugada, QT kéo dài, QT ngắn, Lown –Ganong – Levine, WPW,…)', 4, 8),
        (14, N'ĐTLT_13_15', N'ĐTĐ trong một số bệnh tim khác (THA, tâm phế mạn, thấp tim…)', 6, 12),
        (15, N'ĐTLT_13_16', N'Ôn tập', 6, 12),
        (16, N'ĐTLT_13_17', N'Kiểm tra cuối khóa', 2, 4);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_18: 25 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_18');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_18_01', N'Kiểm tra kiến thức đầu vào, khai giảng lớp học', 1, 0),
        (1, N'ĐTLT_18_02', N'Bài 1: Lịch sử và gây mê phẫu thuật', 1, 0),
        (2, N'ĐTLT_18_03', N'Bài 2: Thuốc mê đường hô hấp', 4, 0),
        (3, N'ĐTLT_18_04', N'Bài 3: Thuốc mê đường tĩnh mạch', 4, 0),
        (4, N'ĐTLT_18_05', N'Bài 4: Thuốc tê', 4, 0),
        (5, N'ĐTLT_18_06', N'Bài 5: Thuốc trợ tim và vận mạch trong gây mê hồi sức', 4, 0),
        (6, N'ĐTLT_18_07', N'Bài 6: Các loại dịch truyền trong gây mê hồi sức', 4, 0),
        (7, N'ĐTLT_18_08', N'Bài 7: Hệ thống gây mê hô hấp', 4, 2),
        (8, N'ĐTLT_18_09', N'Bài 8: Chuẩn bệnh nhân trước mổ', 4, 20),
        (9, N'ĐTLT_18_10', N'Bài 9: Theo dõi bệnh nhân trong gây mê', 4, 20),
        (10, N'ĐTLT_18_11', N'Bài 10: Triệu chứng gây mê và đánh giá độ mê', 4, 20),
        (11, N'ĐTLT_18_12', N'Bài 11:Đặt ống nội Khí quản trong gây mê hồi sức', 4, 40),
        (12, N'ĐTLT_18_13', N'Bài 12: Đặt Mask thanh quản', 4, 20),
        (13, N'ĐTLT_18_14', N'Bài 13: Gây mê toàn thân bằng đường tĩnh mạch', 4, 56),
        (14, N'ĐTLT_18_15', N'Bài 14: Gây mê cho bệnh nhân chấn thương sọ não', 4, 20),
        (15, N'ĐTLT_18_16', N'Bài 15: Biến chứng của gây mê', 4, 20),
        (16, N'ĐTLT_18_17', N'Bài 16: Gây tê tuỷ sống', 4, 56),
        (17, N'ĐTLT_18_18', N'Bài 17: Gây tê ngoài màng cứng', 4, 20),
        (18, N'ĐTLT_18_19', N'Bài 18: Gây tê đám rối thần kinh cánh tay', 4, 40),
        (19, N'ĐTLT_18_20', N'Bài 19: Gây tê vùng cho mổ lấy thai', 4, 20),
        (20, N'ĐTLT_18_21', N'Bài 20: Hồi sức ngừng tuần hoàn', 4, 10),
        (21, N'ĐTLT_18_22', N'Bài 21: Sốc phản vệ trong gây mê', 4, 10),
        (22, N'ĐTLT_18_23', N'Bài 22: Sốc chấn thương và xử trí cấp cứu', 4, 20),
        (23, N'ĐTLT_18_24', N'Bài 23: Truyền máu và các chế phẩm từ máu', 4, 20),
        (24, N'ĐTLT_18_25', N'Kiểm tra cuối khoá, bế giảng', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_19: 22 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_19');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_19_01', N'Bài 1: Lịch sử của nội soi phẫu thuật và gây mê nội soi', 2, 0),
        (1, N'ĐTLT_19_02', N'Bài 2: Kiểm tra kiến thức và khai giảng đầu vào', 2, 2),
        (2, N'ĐTLT_19_03', N'Bài 3: Cấu trúc, hoạt động của phòng mổ nội soi', 1, 1),
        (3, N'ĐTLT_19_04', N'Bài 4: Sinh lý của mổ nội soi ổ bụng', 4, 4),
        (4, N'ĐTLT_19_05', N'Bài 5: Chuyển hóa CO2 trong cơ thể và thán đồ', 4, 4),
        (5, N'ĐTLT_19_06', N'Bài 6: Các tư thế bệnh nhân trong phẫu thuật nội soi', 4, 4),
        (6, N'ĐTLT_19_07', N'Bài 7: Tắc mạch khí do CO2 trong mổ nội soi', 8, 0),
        (7, N'ĐTLT_19_08', N'Bài 8: Xử trí đặt nội khí quản khó', 4, 20),
        (8, N'ĐTLT_19_09', N'Bài 9: Gây mê hồi sức trong mổ nội soi ổ bụng', 8, 56),
        (9, N'ĐTLT_19_10', N'Bài 10: Chăm sóc và theo dõi các biến chứng sau mổ nội soi ổ bụng', 4, 20),
        (10, N'ĐTLT_19_11', N'Bài 11: Gây mê hồi sức cho nội soi trên phụ nữ có thai', 4, 20),
        (11, N'ĐTLT_19_12', N'Bài 12: Gây mê mổ nội soi cho bệnh nhân bệnh gan mật', 4, 32),
        (12, N'ĐTLT_19_13', N'Bài 13: Gây mê mổ nội soi trên bệnh nhân cao huyết áp', 4, 16),
        (13, N'ĐTLT_19_14', N'Bài 14: Gây mê nội soi cho bệnh nhân có bệnh phổi', 4, 16),
        (14, N'ĐTLT_19_15', N'Bài 15: Gây mê nội soi cho bệnh nhân béo phì', 4, 16),
        (15, N'ĐTLT_19_16', N'Bài 16: Gây mê mổ nội soi trên bênh nhân đái tháo đường', 4, 16),
        (16, N'ĐTLT_19_17', N'Bài 17: Gây mê mổ nội soi cho bệnh nhân có bệnh lý tim mạch, mạch vành', 4, 16),
        (17, N'ĐTLT_19_18', N'Bài 18: Gây mê mổ nội soi tai mũi họng', 4, 20),
        (18, N'ĐTLT_19_19', N'Bài 19: Gây mê cho mổ nội soi lồng ngực đơn giản', 4, 16),
        (19, N'ĐTLT_19_20', N'Bài 20: Kiểm tra giữa khóa học.', 2, 2),
        (20, N'ĐTLT_19_21', N'Bài 21: Thi kết thúc khóa học', 2, 8),
        (21, N'ĐTLT_19_22', N'Bài 22: Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_23: 17 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_23');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_23_01', N'Các bộ phận máy nội soi và cách sử dụng, bảo quản', 4, 16),
        (1, N'ĐTLT_23_02', N'Đại cương Tai Mũi Họng', 8, 12),
        (2, N'ĐTLT_23_03', N'Cách khám nội soi Tai Mũi Họng', 4, 36),
        (3, N'ĐTLT_23_04', N'Giải phẫu Tai, Mũi, Họng', 4, 18),
        (4, N'ĐTLT_23_05', N'Sinh lý Tai, Mũi, Họng', 16, 8),
        (5, N'ĐTLT_23_06', N'Hình ảnh nội soi vòm mũi họng', 4, 20),
        (6, N'ĐTLT_23_07', N'Hình ảnh bình thường trong thăm khám nội soi hốc mũi', 4, 20),
        (7, N'ĐTLT_23_08', N'U lành tính vòm, mũi xoang', 4, 20),
        (8, N'ĐTLT_23_09', N'Các khối u ác tính ở vòm mũi họng, mũi xoang', 4, 20),
        (9, N'ĐTLT_23_10', N'Dị hình khe giữa', 4, 20),
        (10, N'ĐTLT_23_11', N'Dị hình vách ngăn', 4, 20),
        (11, N'ĐTLT_23_12', N'Hình ảnh bình thường trong thăm khám nội soi tai', 4, 20),
        (12, N'ĐTLT_23_13', N'Hình ảnh bệnh lý trong thăm khám nội soi tai', 4, 20),
        (13, N'ĐTLT_23_14', N'Hình ảnh bình thường trong thăm khám nội soi họng thanh quản', 4, 20),
        (14, N'ĐTLT_23_15', N'Hình ảnh bệnh lý trong thăm khám nội soi họng thanh quản', 4, 20),
        (15, N'ĐTLT_23_16', N'Các khối u lành và ác tính ở họng thanh quản', 4, 20),
        (16, N'ĐTLT_23_17', N'Tổng kết khóa học, nhận chứng chỉ', 8, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_24: 8 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_24');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_24_01', N'Giải phẫu vùng đầu mặt cổ', 4, 4),
        (1, N'ĐTLT_24_02', N'Các dụng cụ mở khí quản', 4, 4),
        (2, N'ĐTLT_24_03', N'Chỉ định mở khí quản', 4, 4),
        (3, N'ĐTLT_24_04', N'Phương pháp mở khí quản', 4, 4),
        (4, N'ĐTLT_24_05', N'Kiến tập trên bệnh nhân mở khí quản', 4, 16),
        (5, N'ĐTLT_24_06', N'Thực hành mở khí quản', 4, 36),
        (6, N'ĐTLT_24_07', N'Cách chăm sóc và theo dõi sau mở khí quản', 4, 16),
        (7, N'ĐTLT_24_08', N'Xử trí các tai biến sau mở khí quản', 4, 12);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_25: 22 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_25');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_25_01', N'Bài 1: Dụng cụ Tai Mũi Họng, cách sử dụng và bảo quản.', 4, 12),
        (1, N'ĐTLT_25_02', N'Bài 2: Các bộ phận máy nội soi và cách sử dụng, bảo quản.', 4, 12),
        (2, N'ĐTLT_25_03', N'Bài 3: Sơ lược giải phẫu, sinh lý Tai, Mũi, Họng', 4, 16),
        (3, N'ĐTLT_25_04', N'Bài 4: Các thủ thuật Tai Mũi Họng', 12, 0),
        (4, N'ĐTLT_25_05', N'Bài 5: Thay băng Tai, Mũi, Họng', 4, 20),
        (5, N'ĐTLT_25_06', N'Bài 6: Nhận biết một số hình ảnh bình thường, bất thường Tai Mũi Họng', 4, 16),
        (6, N'ĐTLT_25_07', N'Bài 7: Các bệnh cấp cứu Tai Mũi Họng', 4, 30),
        (7, N'ĐTLT_25_08', N'Bài 8: Chấn thương trong Tai Mũi Họng', 4, 16),
        (8, N'ĐTLT_25_09', N'Bài 9: Chăm sóc người bệnh chảy máu mũi', 4, 16),
        (9, N'ĐTLT_25_10', N'Bài 10: Chăm sóc người bệnh dị vật đường thở', 4, 4),
        (10, N'ĐTLT_25_11', N'Bài 11: Chăm sóc người bệnh dị vật đường ăn', 4, 24),
        (11, N'ĐTLT_25_12', N'Bài 12: Chăm sóc người bệnh viêm họng, viêm Amydal, viêm VA', 4, 24),
        (12, N'ĐTLT_25_13', N'Bài 13: Chăm sóc người bệnh viêm mũi xoang', 4, 12),
        (13, N'ĐTLT_25_14', N'Bài 14: Chăm sóc người bệnh viêm thanh quản', 4, 8),
        (14, N'ĐTLT_25_15', N'Bài 15: Chăm sóc người bệnh viêm tai giữa', 4, 24),
        (15, N'ĐTLT_25_16', N'Bài 16: Chăm sóc người bệnh sau chấn thương vùng Tai Mũi Họng', 4, 20),
        (16, N'ĐTLT_25_17', N'Bài 17: Chăm sóc người bệnh sau mổ tai', 4, 24),
        (17, N'ĐTLT_25_18', N'Bài 18: Chăm sóc người bệnh sau mổ mũi xoang', 4, 24),
        (18, N'ĐTLT_25_19', N'Bài 19: Chăm sóc người bệnh sau mổ họng thanh quản', 4, 30),
        (19, N'ĐTLT_25_20', N'Bài 20: Chăm sóc người bệnh sau căt Amydal, nạo VA', 4, 24),
        (20, N'ĐTLT_25_21', N'Ôn tập, kiểm tra, đánh giá', 4, 4),
        (21, N'ĐTLT_25_22', N'Khai giảng/bế giảng', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_26: 7 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_26');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_26_01', N'Bài 1: Chữa răng', 20, 130),
        (1, N'ĐTLT_26_02', N'Bài 2: Nhổ răng', 12, 116),
        (2, N'ĐTLT_26_03', N'Bài 3: Hàm mặt', 4, 46),
        (3, N'ĐTLT_26_04', N'Bài 4: Nha cộng đồng', 4, 14),
        (4, N'ĐTLT_26_05', N'Bài 5: Nha chu', 8, 46),
        (5, N'ĐTLT_26_06', N'Ôn tập, kiểm tra, đánh giá', 0, 0),
        (6, N'ĐTLT_26_07', N'Khai giảng/bế giảng', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_28: 33 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_28');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_28_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_28_02', N'Bài 1. Đánh giá và xử trí ban đầu bệnh nhân cấp cứu.', 4, 16),
        (2, N'ĐTLT_28_03', N'Bài 2. Nhận định và phân loại bệnh nhân cấp cứu', 4, 16),
        (3, N'ĐTLT_28_04', N'Bài 3. Nhận định và xử trí cấp cứu ban đầu bệnh nhân chấn thương.', 4, 16),
        (4, N'ĐTLT_28_05', N'Bài 4. Tư thế an toàn và vận chuyển bệnh nhân cấp cứu.', 4, 16),
        (5, N'ĐTLT_28_06', N'Bài 5. Cấp cứu bệnh nhân ngừng tuần hoàn.', 4, 16),
        (6, N'ĐTLT_28_07', N'Bài 6. Cấp cứu phản vệ và chăm sóc bệnh nhân phản vệ.', 4, 16),
        (7, N'ĐTLT_28_08', N'Bài 7. Chăm sóc bệnh nhân suy hô hấp cấp', 4, 16),
        (8, N'ĐTLT_28_09', N'Bài 8. Chăm sóc bệnh nhân nhồi máu cơ tim cấp.', 4, 16),
        (9, N'ĐTLT_28_10', N'Bài 9. Chăm sóc bệnh nhân hôn mê.', 4, 16),
        (10, N'ĐTLT_28_11', N'Bài 10. Chăm sóc bệnh nhân xuất huyết tiêu hóa cao.', 4, 16),
        (11, N'ĐTLT_28_12', N'Bài 11. Chăm sóc bệnh nhân đột quị não.', 4, 16),
        (12, N'ĐTLT_28_13', N'Bài 12. Chăm sóc bệnh nhân ngộ độc cấp.', 4, 16),
        (13, N'ĐTLT_28_14', N'Bài 13. Chăm sóc bệnh nhân bỏng.', 4, 16),
        (14, N'ĐTLT_28_15', N'Bài 14. Chăm sóc bệnh nhân đặt nội khí quản, canyl mở khí quản.', 2, 16),
        (15, N'ĐTLT_28_16', N'Bài 15. Chăm sóc bệnh nhân thở máy.', 2, 16),
        (16, N'ĐTLT_28_17', N'Bài 16. Chăm sóc bệnh nhân đặt catheter tĩnh mạch trung tâm.', 2, 16),
        (17, N'ĐTLT_28_18', N'Bài 17. Kỹ thuật thở oxy cho bệnh nhân.', 2, 16),
        (18, N'ĐTLT_28_19', N'Bài 18. Các kỹ thuật khai thông đường thở.', 2, 16),
        (19, N'ĐTLT_28_20', N'Bài 19. Sốc điện cấp cứu.', 2, 16),
        (20, N'ĐTLT_28_21', N'Bài 20. Kỹ thuật hút đờm.', 2, 16),
        (21, N'ĐTLT_28_22', N'Bài 21. Liệu pháp khí dung.', 2, 12),
        (22, N'ĐTLT_28_23', N'Bài 22. Kỹ thuật đặt sonde dạ dày.', 2, 16),
        (23, N'ĐTLT_28_24', N'Bài 23. Kỹ thuật đặt sonde tiểu.', 2, 16),
        (24, N'ĐTLT_28_25', N'Bài 24. Kỹ thuật lấy máu làm xét nghiệm khí máu.', 2, 12),
        (25, N'ĐTLT_28_26', N'Bài 25. Kỹ thuật ghi điện tim cấp cứu.', 2, 12),
        (26, N'ĐTLT_28_27', N'Bài 26. Sử dụng bơm tiêm điện.', 2, 12),
        (27, N'ĐTLT_28_28', N'Bài 27. Sử dụng máy truyền dịch.', 2, 12),
        (28, N'ĐTLT_28_29', N'Bài 28. Sử dụng Monitor theo dõi.', 2, 12),
        (29, N'ĐTLT_28_30', N'Bài 29. Kỹ thuật cố định xương gãy.', 2, 16),
        (30, N'ĐTLT_28_31', N'Kiểm tra giữa khóa học', 2, 2),
        (31, N'ĐTLT_28_32', N'Thi kết thúc học phần', 2, 7),
        (32, N'ĐTLT_28_33', N'Tổng kết khóa học và nhận chứng chỉ', 2, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_32: 1 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_32');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_32_01', N'Bài 1: Cấp cứu ngừng tuần hoàn', 10, 30);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_37: 4 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_37');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_37_01', N'Bài 1: Quy trình khử khuẩn và bảo quản ống nội soi phế quản mềm', 4, 20),
        (1, N'ĐTLT_37_02', N'Bài 2: Quy trình kỹ thuật nội soi phế quản ống mềm.', 8, 96),
        (2, N'ĐTLT_37_03', N'Bài 3: Một số kỹ thuật cơ bản chẩn đoán và điều trị qua nội soi phế quản ống mềm', 8, 160),
        (3, N'ĐTLT_37_04', N'Ôn tập, kiểm tra, đánh giá', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_38: 6 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_38');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_38_01', N'Tổng quan về theo dõi và chăm sóc bệnh nhân sau mổ.', 40, 38),
        (1, N'ĐTLT_38_02', N'Chăm sóc bệnh nhân sau mổ sọ não', 40, 38),
        (2, N'ĐTLT_38_03', N'Chăm sóc bệnh nhân sau mổ tiêu hóa , gan mật', 40, 38),
        (3, N'ĐTLT_38_04', N'Chăm sóc bệnh nhân dẫn lưu màng phổi', 40, 38),
        (4, N'ĐTLT_38_05', N'Chăm sóc dinh dưỡng và hồi phục chức năng', 40, 38),
        (5, N'ĐTLT_38_06', N'Tổng kết & nâng cao kỹ năng giao tiếp – xử trí cấp cứu', 40, 38);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_39: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_39');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_39_01', N'Tổng quan về máy thở', 8, 24),
        (1, N'ĐTLT_39_02', N'Thiết lập thông số máy thở cơ bản', 8, 24),
        (2, N'ĐTLT_39_03', N'Đọc và ghi nhận thông số trên máy thở', 8, 24),
        (3, N'ĐTLT_39_04', N'Báo động trên máy thở, nguyên nhân và xử trí', 8, 24),
        (4, N'ĐTLT_39_05', N'Chăm sóc bệnh nhân thở máy', 8, 24),
        (5, N'ĐTLT_39_06', N'Chăm sóc ống NKQ/MKQ', 8, 24),
        (6, N'ĐTLT_39_07', N'Hút đờm qua ống NKQ/MKQ', 8, 24),
        (7, N'ĐTLT_39_08', N'Dinh dưỡng, phòng loét cho BN thở máy', 8, 24),
        (8, N'ĐTLT_39_09', N'Vệ sinh răng miệng', 8, 24),
        (9, N'ĐTLT_39_10', N'Biến chứng thường gặp', 8, 24),
        (10, N'ĐTLT_39_11', N'Giao tiếp – hỗ trợ tâm lý cho bệnh nhân thở máy; Quản lý đau, lo lắng và delirium', 8, 24),
        (11, N'ĐTLT_39_12', N'Chuyển giường, vận chuyển bệnh nhân thở máy', 8, 24),
        (12, N'ĐTLT_39_13', N'Quản lý kết thúc thở máy – weaning và rút ống nội khí quản', 8, 24),
        (13, N'ĐTLT_39_14', N'Tổng kết kiến thức và kỹ năng chuyên môn', 8, 24);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_40: 13 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_40');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_40_01', N'Bài 1: Đại cương về thông khí nhân tạo', 16, 36),
        (1, N'ĐTLT_40_02', N'Bài 2: Cấu tạo, nguyên lý máy thở và giải phẫu sinh lý hô hấp liên quan thở máy', 16, 36),
        (2, N'ĐTLT_40_03', N'Bài 3: Phương thức thở máy cơ bản', 8, 24),
        (3, N'ĐTLT_40_04', N'Bài 4: Cài đặt thở máy ban đầu', 8, 36),
        (4, N'ĐTLT_40_05', N'Bài 5: Cai thở máy', 8, 36),
        (5, N'ĐTLT_40_06', N'Bài 6: Thông khí nhân tạo không xâm nhập', 8, 36),
        (6, N'ĐTLT_40_07', N'Bài 7: Thông khí oxy dòng cao', 8, 36),
        (7, N'ĐTLT_40_08', N'Bài 7: Sử dụng thuốc chống đông trong lọc máu hấp phụ', 8, 36),
        (8, N'ĐTLT_40_09', N'Bài 8: Một số phương thức thở nâng cao', 8, 36),
        (9, N'ĐTLT_40_10', N'Bài 9: Thông khí nhân tạo ở bệnh nhân ARDS', 8, 42),
        (10, N'ĐTLT_40_11', N'Bài 10: Huy động phế nang', 4, 36),
        (11, N'ĐTLT_40_12', N'Bài 11: Ôn tập, thi kết thúc khóa học', 8, 24),
        (12, N'ĐTLT_40_13', N'Bài 12: Tổng kết khóa học, nhận chứng chỉ', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_42: 11 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_42');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_42_01', N'Bài 1: Chẩn đoán và điều trị viêm khớp dạng thấp', 6, 48),
        (1, N'ĐTLT_42_02', N'Bài 2: Chẩn đoán và điều trị thoái hóa khớp', 6, 48),
        (2, N'ĐTLT_42_03', N'Bài 3: Chẩn đoán và điều trị bệnh gút', 6, 48),
        (3, N'ĐTLT_42_04', N'Bài 4: Chẩn đoán và điều trị loãng xương', 6, 48),
        (4, N'ĐTLT_42_05', N'Bài 5: Chẩn đoán và điều trị Lupus ban đỏ hệ thống', 6, 48),
        (5, N'ĐTLT_42_06', N'Bài 6: Chẩn đoán và điều trị viêm đa cơ', 6, 48),
        (6, N'ĐTLT_42_07', N'Bài 7: Chẩn đoán và điều trị đau thần kinh tọa', 6, 48),
        (7, N'ĐTLT_42_08', N'Bài 8: Chẩn đoán và điều trị xơ cứng bì toàn thể', 6, 48),
        (8, N'ĐTLT_42_09', N'Bài 9: Chẩn đoán và điều trị nhiễm khuẩn cơ xương khớp', 6, 36),
        (9, N'ĐTLT_42_10', N'Bài 10: Chẩn đoán và điều trị viêm cột sống dính khớp', 6, 36),
        (10, N'ĐTLT_42_11', N'Ôn tập, kiểm tra', 6, 6);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_45: 15 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_45');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_45_01', N'Giải phẫu, sinh lý hệ thống gan mật', 4, 0),
        (1, N'ĐTLT_45_02', N'Các bệnh lý ngoại khoa gan mật thường gặp', 4, 0),
        (2, N'ĐTLT_45_03', N'Đại cương phẫu thuật gan mật, phẫu thuật nội soi', 4, 0),
        (3, N'ĐTLT_45_04', N'Phương tiện + dụng cụ phẫu thuật; Sử dụng, bảo quản máy móc, dụng cụ', 4, 0),
        (4, N'ĐTLT_45_05', N'Kỹ thuật cơ bản trong phẫu thuật gan mật', 4, 0),
        (5, N'ĐTLT_45_06', N'Cắt túi mật', 4, 0),
        (6, N'ĐTLT_45_07', N'Cắt chỏm nang gan – lách', 4, 0),
        (7, N'ĐTLT_45_08', N'Mở ống mật chủ, lấy sỏi, dẫn lưu Kehr', 4, 0),
        (8, N'ĐTLT_45_09', N'Điều trị ngoại khoa áp xe gan', 4, 0),
        (9, N'ĐTLT_45_10', N'Nối mật ruột', 4, 0),
        (10, N'ĐTLT_45_11', N'Các thủ thuật: chọc hút/dẫn lưu nang/áp xe gan; sinh thiết gan', 8, 0),
        (11, N'ĐTLT_45_12', N'Giới thiệu máy và dụng cụ phẫu thuật', 0, 4),
        (12, N'ĐTLT_45_13', N'Giới thiệu kỹ thuật cơ bản', 0, 8),
        (13, N'ĐTLT_45_14', N'Thực hành dụng cụ, thao tác cơ bản trên mô hình (nội soi)', 0, 8),
        (14, N'ĐTLT_45_15', N'Tham gia đi lâm sàng, phụ mổ', 0, 350);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_49: 7 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_49');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_49_01', N'Đại cương về xoa bóp bấm huyệt.', 16, 0),
        (1, N'ĐTLT_49_02', N'Các thủ thuật chính của xoa bóp bấm huyệt.', 32, 64),
        (2, N'ĐTLT_49_03', N'Xoa bóp từng bộ phận', 76, 60),
        (3, N'ĐTLT_49_04', N'Xoa bóp điều trị một số chứng bệnh thông thường', 56, 112),
        (4, N'ĐTLT_49_05', N'Một số đặc điểm cần chú ý khi chữa bệnh bằng xoa bóp bấm huyệt.', 48, 0),
        (5, N'ĐTLT_49_06', N'Kiểm tra trước và kết thúc khóa học.', 0, 16),
        (6, N'ĐTLT_49_07', N'Khai mạc, bế mạc', 0, 16);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_50: 7 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_50');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_50_01', N'Bài 1: Đại cương về châm cứu.', 24, 16),
        (1, N'ĐTLT_50_02', N'Bài 2: Cơ chế tác dụng của phương pháp châm cứu', 12, 12),
        (2, N'ĐTLT_50_03', N'Bài 3: Đại cương về huyệt và các đường kinh', 32, 32),
        (3, N'ĐTLT_50_04', N'Bài 4: Quy trình kỹ thuật châm cứu và điện châm.', 16, 24),
        (4, N'ĐTLT_50_05', N'Bài 5: Áp dụng phương pháp châm cứu điều trị một số bệnh hay gặp:', 96, 192),
        (5, N'ĐTLT_50_06', N'Bài 6: Kiểm tra trước và kết thúc khóa học.', 0, 16),
        (6, N'ĐTLT_50_07', N'Bài 7: Khai mạc, bế mạc', 0, 16);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_52: 17 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_52');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_52_01', N'Khai giảng, kiểm tra đầu vào.', 4, 4),
        (1, N'ĐTLT_52_02', N'Bệnh viêm gan cấp tính', 8, 24),
        (2, N'ĐTLT_52_03', N'Các virus gây viêm gan', 8, 20),
        (3, N'ĐTLT_52_04', N'Bệnh viêm gan virus A', 8, 20),
        (4, N'ĐTLT_52_05', N'Bệnh viêm gan virus B', 8, 28),
        (5, N'ĐTLT_52_06', N'Bệnh viêm gan virus C', 8, 28),
        (6, N'ĐTLT_52_07', N'Bệnh viêm gan virus D', 4, 16),
        (7, N'ĐTLT_52_08', N'Bệnh viêm gan virus E', 4, 16),
        (8, N'ĐTLT_52_09', N'Bệnh viêm gan do thuốc.', 8, 28),
        (9, N'ĐTLT_52_10', N'Bệnh viêm gan tự miễn.', 4, 16),
        (10, N'ĐTLT_52_11', N'Bệnh viêm gan mạn tính.', 8, 28),
        (11, N'ĐTLT_52_12', N'Bệnh viêm gan ác tính.', 8, 28),
        (12, N'ĐTLT_52_13', N'Các nhóm thuốc điều trị viêm gan virus', 4, 16),
        (13, N'ĐTLT_52_14', N'Kiểm tra giữa khóa học', 4, 4),
        (14, N'ĐTLT_52_15', N'Ôn tập', 4, 16),
        (15, N'ĐTLT_52_16', N'Kiểm tra đánh giá kết thúc', 4, 8),
        (16, N'ĐTLT_52_17', N'Tổng kết phát chứng chỉ', 4, 4);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_53: 6 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_53');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_53_01', N'Bài 1: Nguyên tắc cơ bản; chỉ định và chống chỉ định; tai biến tiêm khớp', 24, 84),
        (1, N'ĐTLT_53_02', N'Bài 2: Hút dịch và tiêm khớp gối', 24, 84),
        (2, N'ĐTLT_53_03', N'Bài 3: Tiêm khớp vai (Tiêm gân nhị đầu, Tiêm gân trên gai)', 24, 84),
        (3, N'ĐTLT_53_04', N'Bài 4: Tiêm khớp khuỷu', 24, 84),
        (4, N'ĐTLT_53_05', N'Bài 5: Tiêm các điểm bám tận (Tiêm điểm bám gân lồi cầu, lồi cầu ngoài khớp gối, xương cánh tay)', 24, 60),
        (5, N'ĐTLT_53_06', N'Ôn tập, kiểm tra, đánh giá', 8, 20);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_54: 23 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_54');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_54_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_54_02', N'Tiếp cận bệnh nhân đau bụng cấp', 5, 20),
        (2, N'ĐTLT_54_03', N'Tiếp cận bệnh nhân vàng da', 5, 20),
        (3, N'ĐTLT_54_04', N'Tiếp cận tiêu chảy', 5, 20),
        (4, N'ĐTLT_54_05', N'Hướng dẫn chẩn đoán và điều trị bệnh trào ngược dạ dày - thực quản (GERD)', 5, 15),
        (5, N'ĐTLT_54_06', N'Hướng dẫn chẩn đoán và điều trị Helicobacter Pylori', 5, 15),
        (6, N'ĐTLT_54_07', N'Hướng dẫn chẩn đoán và điều trị loét dạ dày tá tràng', 5, 15),
        (7, N'ĐTLT_54_08', N'Chảy máu tiêu hóa thấp', 5, 20),
        (8, N'ĐTLT_54_09', N'Chảy máu tiêu hóa trên do tăng áp lực tĩnh mạch cửa', 5, 20),
        (9, N'ĐTLT_54_10', N'Chảy máu tiêu hóa trên do loét dạ dày – tá tràng', 5, 20),
        (10, N'ĐTLT_54_11', N'Xơ gan', 5, 20),
        (11, N'ĐTLT_54_12', N'Ung thư biểu mô tế bào gan', 5, 20),
        (12, N'ĐTLT_54_13', N'Viêm tụy cấp', 5, 20),
        (13, N'ĐTLT_54_14', N'Viêm gan virus B', 5, 20),
        (14, N'ĐTLT_54_15', N'Viêm gan virus C', 5, 20),
        (15, N'ĐTLT_54_16', N'Bệnh gan do rượu', 5, 20),
        (16, N'ĐTLT_54_17', N'Hướng dẫn chẩn đoán và điều trị táo bón', 10, 15),
        (17, N'ĐTLT_54_18', N'Hội chứng ruột kích thích', 10, 15),
        (18, N'ĐTLT_54_19', N'Viêm loét đại trực tràng chảy máu', 10, 15),
        (19, N'ĐTLT_54_20', N'Bệnh Crohn', 10, 15),
        (20, N'ĐTLT_54_21', N'Kiểm tra giữa khóa học.', 4, 0),
        (21, N'ĐTLT_54_22', N'Thi kết thúc khóa học', 4, 8),
        (22, N'ĐTLT_54_23', N'Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_55: 20 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_55');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_55_01', N'Khai giảng, kiểm tra đầu vào', 0, 0),
        (1, N'ĐTLT_55_02', N'Thiếu máu: Chẩn đoán, xếp loại và xử trí', 0, 0),
        (2, N'ĐTLT_55_03', N'Thiếu máu thiếu sắt: Chẩn đoán và hướng xử trí', 0, 0),
        (3, N'ĐTLT_55_04', N'Tan máu tự miễn: Chẩn đoán và điều trị', 0, 0),
        (4, N'ĐTLT_55_05', N'Xuất huyết giảm tiểu cầu miễn dịch', 0, 0),
        (5, N'ĐTLT_55_06', N'Thalassemia: Chẩn đoán và điều trị', 0, 0),
        (6, N'ĐTLT_55_07', N'Quy trình truyền máu lâm sàng', 0, 0),
        (7, N'ĐTLT_55_08', N'Chỉ định sử dụng máu và chế phẩm máu trong lâm sàng', 0, 0),
        (8, N'ĐTLT_55_09', N'Lơ xê mi cấp: Chẩn đoán, phân loại và hướng xử trí', 0, 0),
        (9, N'ĐTLT_55_10', N'U lympho Hodgkin và không Hodgkin', 0, 0),
        (10, N'ĐTLT_55_11', N'Đa u tủy xương: Chẩn đoán và hướng xử trí', 0, 0),
        (11, N'ĐTLT_55_12', N'Chỉ định gạn tách các thành phần máu trong điều trị', 0, 0),
        (12, N'ĐTLT_55_13', N'Đa hồng cầu: Chẩn đoán và điều trị', 0, 0),
        (13, N'ĐTLT_55_14', N'Tăng tiểu cầu tiên phát: Chẩn đoán và điều trị', 0, 0),
        (14, N'ĐTLT_55_15', N'Lơ xê mi kinh: Chẩn đoán, phân loại và hướng xử trí', 0, 0),
        (15, N'ĐTLT_55_16', N'Rối loạn sinh tủy: Chẩn đoán và hướng xử trí', 0, 0),
        (16, N'ĐTLT_55_17', N'Hemophia: Chẩn đoán và điều trị', 0, 0),
        (17, N'ĐTLT_55_18', N'Kiểm tra giữa khóa học', 0, 0),
        (18, N'ĐTLT_55_19', N'Thi kết thúc khóa học', 0, 0),
        (19, N'ĐTLT_55_20', N'Tổng kết khóa học, nhận chứng chỉ', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_56: 13 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_56');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_56_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_56_02', N'Bài 1: Nguyên tắc vô khuẩn trong ngoại khoa', 2, 0),
        (2, N'ĐTLT_56_03', N'Bài 2: Nguyên lý cấu tạo và cách sử dụng máy thở', 2, 4),
        (3, N'ĐTLT_56_04', N'Bài 3: Tác dụng dược lực học, dược động học các thuốc trong gây mê hồi sức', 20, 4),
        (4, N'ĐTLT_56_05', N'Bài 4: Theo dõi lâm sàng trong gây mê, các hệ thống máy mê', 4, 72),
        (5, N'ĐTLT_56_06', N'Bài 5: Quy trình gây mê nội khí quản', 4, 8),
        (6, N'ĐTLT_56_07', N'Bài 6: Các phương pháp giảm đau sau mổ', 4, 36),
        (7, N'ĐTLT_56_08', N'Bài 7: Các phương pháp gây mê', 4, 72),
        (8, N'ĐTLT_56_09', N'Bài 8: Các phương pháp gây gây tê', 4, 72),
        (9, N'ĐTLT_56_10', N'Bài 9: Gây mê hồi sức trẻ em; Bài 10: Gây mê hồi sức trong mổ sọ não; Bài 11: Gây mê trong mổ bụng cấp cứu; Bài 12: Các kỹ thuật vô cảm cho mổ lấy thai; Bài 13: Quy trình cấp cứu ngừng tuần hoàn', 10, 158),
        (10, N'ĐTLT_56_11', N'Kiểm tra giữa khóa học', 2, 6),
        (11, N'ĐTLT_56_12', N'Thi kết thúc khóa học', 4, 8),
        (12, N'ĐTLT_56_13', N'Tổng kế khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_57: 13 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_57');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_57_01', N'Bài 1: Nguyên tắc vô khuẩn trong ngoại khoa', 4, 4),
        (1, N'ĐTLT_57_02', N'Bài 2: Nhiệm vụ sửa soạn phòng mổ cho cuộc phẫu thuật', 10, 4),
        (2, N'ĐTLT_57_03', N'Bài 3: Chuẩn bị cho một ca mổ', 4, 4),
        (3, N'ĐTLT_57_04', N'Bài 4: Kỹ thuật rửa tay vô khuẩn', 4, 4),
        (4, N'ĐTLT_57_05', N'Bài 5: Kỹ thuật mặc áo choàng phẫu thuật', 4, 8),
        (5, N'ĐTLT_57_06', N'Bài 6: Kỹ thuật mang gants vô khuẩn', 4, 8),
        (6, N'ĐTLT_57_07', N'Bài 7: Kỹ thuật trải champs cho các phẫu thuật', 4, 8),
        (7, N'ĐTLT_57_08', N'Bài 8: Tính năng của khác dụng cụ phẫu thuật cơ bản', 8, 24),
        (8, N'ĐTLT_57_09', N'Bài 9: Thực hiện các quy trình phụ dụng cụ cho từng phẫu thuật', 60, 160),
        (9, N'ĐTLT_57_10', N'Bài 10: Phối hợp với phẫu thuật viên trước, trong và sau mổ', 10, 36),
        (10, N'ĐTLT_57_11', N'Bài 11: Kiểm tra giữa khóa học', 6, 6),
        (11, N'ĐTLT_57_12', N'Bài 12: Thi kết thúc khóa học', 4, 8),
        (12, N'ĐTLT_57_13', N'Bài 13: Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_63: 12 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_63');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_63_01', N'Khai giảng, kiểm tra đầu vào', 0, 0),
        (1, N'ĐTLT_63_02', N'Bài 1: Chẩn đoán Nhồi máu não cấp', 8, 32),
        (2, N'ĐTLT_63_03', N'Bài 2: Một số thang điểm thường dùng trên người bệnh Đột quỵ não', 8, 32),
        (3, N'ĐTLT_63_04', N'Bài 3: Chẩn đoán hình ảnh học trong Nhồi máu não cấp', 8, 32),
        (4, N'ĐTLT_63_05', N'Bài 4: Các phương pháp điều trị Đột quỵ não', 8, 32),
        (5, N'ĐTLT_63_06', N'Bài 5: Điều trị tiêu sợi huyết tĩnh mạch ở bệnh nhân Nhồi máu não cấp', 8, 32),
        (6, N'ĐTLT_63_07', N'Bài 6: Chỉ định và chống chỉ định của điều trị thuốc tiêu sợi huyết tĩnh mạch trong Nhồi máu não cấp', 8, 32),
        (7, N'ĐTLT_63_08', N'Bài 7: Theo dõi và chăm sóc người bệnh Đột quỵ não trong giai đoạn cấp', 8, 32),
        (8, N'ĐTLT_63_09', N'Bài 8: Chăm sóc người bệnh sau điều trị tiêu sợi huyết tĩnh mạch', 8, 32),
        (9, N'ĐTLT_63_10', N'Bài 9: Thực hành quy trình kỹ thuật điều trị tiêu sợi huyết trong nhồi máu não cấp', 8, 32),
        (10, N'ĐTLT_63_11', N'Ôn tập, giải đáp câu hỏi', 0, 0),
        (11, N'ĐTLT_63_12', N'Ôn tập, giải đáp câu hỏi', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_64: 59 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_64');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_64_01', N'Bài 1: PHCN và các khái niệm cơ bản', 4, 0),
        (1, N'ĐTLT_64_02', N'Bài 2: Lượng giá người khuyết tật', 4, 12),
        (2, N'ĐTLT_64_03', N'Bài 3: Thử cơ bằng tay và đo tầm vận động khớp', 8, 16),
        (3, N'ĐTLT_64_04', N'Bài 4: Lượng giá chức năng tâm lý', 4, 12),
        (4, N'ĐTLT_64_05', N'Bài 5: Lượng giá chức năng ngôn ngữ', 4, 12),
        (5, N'ĐTLT_64_06', N'Bài 6: Lượng giá chức năng sinh hoạt hàng ngày', 4, 12),
        (6, N'ĐTLT_64_07', N'Bài 7: Tập vận động thụ động', 4, 16),
        (7, N'ĐTLT_64_08', N'Bài 8: Tập vận động có trợ giúp', 4, 16),
        (8, N'ĐTLT_64_09', N'Bài 9: Tập vận động chủ động', 4, 16),
        (9, N'ĐTLT_64_10', N'Bài 10: Tập vận động có kháng trở', 4, 16),
        (10, N'ĐTLT_64_11', N'Bài 11: Kỹ thuật vỗ, rung lồng ngực', 4, 16),
        (11, N'ĐTLT_64_12', N'Bài 12: Kỹ thuật dẫn lưu tư thế', 4, 16),
        (12, N'ĐTLT_64_13', N'Bài 13: Kỹ thuật xoa bóp', 4, 16),
        (13, N'ĐTLT_64_14', N'Bài 14: Điều trị bằng các dòng điện xung', 4, 12),
        (14, N'ĐTLT_64_15', N'Bài 15: Điều trị bằng tia hồng ngoại', 4, 12),
        (15, N'ĐTLT_64_16', N'Bài 16: Điều trị bằng parafin', 4, 12),
        (16, N'ĐTLT_64_17', N'Bài 17: Điều trị bằng sóng ngắn, sóng cực ngắn', 4, 12),
        (17, N'ĐTLT_64_18', N'Bài 18: Điều trị bằng vi sóng', 4, 12),
        (18, N'ĐTLT_64_19', N'Bài 19: Điều trị bằng siêu âm', 4, 8),
        (19, N'ĐTLT_64_20', N'Bài 20: Điều trị bằng máy kéo giãn cột sống', 4, 12),
        (20, N'ĐTLT_64_21', N'Bài 21: Kỹ thuật tập sử dụng và điều khiển xe lăn', 4, 12),
        (21, N'ĐTLT_64_22', N'Bài 22: Tập các chức năng sinh hoạt hàng ngày', 4, 12),
        (22, N'ĐTLT_64_23', N'Bài 23: Tập nuốt', 4, 16),
        (23, N'ĐTLT_64_24', N'Bài 24: Tập giao tiếp', 4, 16),
        (24, N'ĐTLT_64_25', N'Bài 25: Tập sửa lỗi phát âm', 4, 16),
        (25, N'ĐTLT_64_26', N'Bài 26: PHCN chấn thương chi trên -PHCN gãy xương đòn', 4, 8),
        (26, N'ĐTLT_64_27', N'Bài 27: PHCN chấn thương chi trên - PHCN gãy trên lồi cầu xương cánh tay', 4, 8),
        (27, N'ĐTLT_64_28', N'Bài 28: PHCN chấn thương chi trên - PHCN gãy 2 xương cẳng tay', 4, 8),
        (28, N'ĐTLT_64_29', N'Bài 29: PHCN chấn thương chi trên - PHCN gãy đầu dưới xương quay', 4, 8),
        (29, N'ĐTLT_64_30', N'Bài 30: PHCN chấn thương chi dưới - PHCN gãy cổ xương đùi', 4, 8),
        (30, N'ĐTLT_64_31', N'Bài 31: PHCN chấn thương chi dưới - PHCN gãy thân xương đùi', 4, 8),
        (31, N'ĐTLT_64_32', N'Bài 32: PHCN chấn thương chi dưới - PHCN chấn thương khung chậu', 4, 8),
        (32, N'ĐTLT_64_33', N'Bài 33: PHCN chấn thương chi dưới - PHCN tổn thương mô mềm', 4, 8),
        (33, N'ĐTLT_64_34', N'Bài 34: PHCN bệnh lý chi trên - PHCN viêm quanh khớp vai', 4, 8),
        (34, N'ĐTLT_64_35', N'Bài 35: PHCN bệnh lý chi trên - PHCN viêm mỏm trên lồi cầu ngoài xương cánh tay', 4, 8),
        (35, N'ĐTLT_64_36', N'Bài 36: PHCN bệnh lý chi trên - PHCN viêm mỏm trâm quay', 4, 8),
        (36, N'ĐTLT_64_37', N'Bài 37: PHCN bệnh lý chi dưới - PHCN viêm cân gan chân', 4, 8),
        (37, N'ĐTLT_64_38', N'Bài 38: PHCN bệnh lý chi dưới - PHCN thoái hóa khớp', 4, 12),
        (38, N'ĐTLT_64_39', N'Bài 39: PHCN bệnh lý cột sống và đĩa đệm - PHCN thoái hóa cột sống', 4, 12),
        (39, N'ĐTLT_64_40', N'Bài 40: PHCN bệnh lý cột sống và đĩa đệm - PHCN thoát vị đĩa đệm cột sống', 4, 12),
        (40, N'ĐTLT_64_41', N'Bài 41: PHCN bệnh nhân đột quỵ não', 4, 16),
        (41, N'ĐTLT_64_42', N'Bài 42: PHCN chấn thương sọ não', 4, 16),
        (42, N'ĐTLT_64_43', N'Bài 43: PHCN tổn thương tủy sống', 4, 16),
        (43, N'ĐTLT_64_44', N'Bài 44: PHCN co cứng', 4, 16),
        (44, N'ĐTLT_64_45', N'Bài 45: PHCN tổn thương thần kinh ngoại biên chi trên', 12, 24),
        (45, N'ĐTLT_64_46', N'Bài 46: PHCN hội chứng cổ vai tay', 4, 8),
        (46, N'ĐTLT_64_47', N'Bài 47: PHCN bệnh lý thần kinh chi dưới', 8, 16),
        (47, N'ĐTLT_64_48', N'Bài 48: PHCN liệt dây VII ngoại biên', 4, 8),
        (48, N'ĐTLT_64_49', N'Bài 49: PHCN viêm đa rễ, đa dây thần kinh (HC gullain barre)', 4, 8),
        (49, N'ĐTLT_64_50', N'Bài 50: PHCN viêm phế quản mạn tính', 4, 8),
        (50, N'ĐTLT_64_51', N'Bài 51: PHCN trước và sau phẫu thuật ngực', 4, 8),
        (51, N'ĐTLT_64_52', N'Bài 52: PHCN cho trẻ di chứng viêm não', 4, 4),
        (52, N'ĐTLT_64_53', N'Bài 53: PHCN cho trẻ chậm phát triển tinh thần', 4, 4),
        (53, N'ĐTLT_64_54', N'Bài 54: PHCN bệnh lý tim mạch', 8, 8),
        (54, N'ĐTLT_64_55', N'Bài 55: PHCN cho người bệnh bỏng', 4, 12),
        (55, N'ĐTLT_64_56', N'Bài 56: PHCN loét do đè ép', 4, 12),
        (56, N'ĐTLT_64_57', N'Bài 57: PHCN cho người bệnh vá da', 4, 12),
        (57, N'ĐTLT_64_58', N'Bài 58: PHCN tiểu tiện không tự chủ', 4, 12),
        (58, N'ĐTLT_64_59', N'Khai giảng, pre-test; Kiểm tra cuối khoá, bế giảng', 8, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_65: 21 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_65');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_65_01', N'Khai giảng, pre-test', 2, 0),
        (1, N'ĐTLT_65_02', N'Bài 1: Hồi sinh tim phổi cơ bản', 4, 20),
        (2, N'ĐTLT_65_03', N'Bài 2: Hồi sinh tim phổi nâng cao', 4, 20),
        (3, N'ĐTLT_65_04', N'Bài 3: Sốc nhiễm khuẩn', 4, 40),
        (4, N'ĐTLT_65_05', N'Bài 4: Phản vệ', 4, 28),
        (5, N'ĐTLT_65_06', N'Bài 5: Sốc giảm thể tích', 4, 28),
        (6, N'ĐTLT_65_07', N'Bài 6: Nhiễm toan chuyển hóa', 4, 20),
        (7, N'ĐTLT_65_08', N'Bài 7: Nhiễm toan hô hấp', 4, 20),
        (8, N'ĐTLT_65_09', N'Bài 8: Tăng Kali máu', 4, 20),
        (9, N'ĐTLT_65_10', N'Bài 9: Hạ Kali máu', 4, 20),
        (10, N'ĐTLT_65_11', N'Bài 10: Tăng Natri máu', 4, 20),
        (11, N'ĐTLT_65_12', N'Bài 11: Hạ Natri máu', 4, 20),
        (12, N'ĐTLT_65_13', N'Bài 12: Suy hô hấp cấp', 4, 20),
        (13, N'ĐTLT_65_14', N'Bài 13: Hội chứng suy hô hấp cấp tiến triển', 4, 20),
        (14, N'ĐTLT_65_15', N'Bài 14: Một số vấn đề cơ bản về phương thức và thông số thông khí cơ học', 4, 40),
        (15, N'ĐTLT_65_16', N'Bài 15: Mở khí quản', 4, 20),
        (16, N'ĐTLT_65_17', N'Bài 16: Kỹ thuật đặt catheter tĩnh mạch trung tâm', 4, 20),
        (17, N'ĐTLT_65_18', N'Bài 17: Kỹ thuật đặt dẫn lưu màng phổi', 4, 20),
        (18, N'ĐTLT_65_19', N'Bài 18: Kỹ thuật đặt catheter động mạch', 4, 20),
        (19, N'ĐTLT_65_20', N'Bài 19: Kỹ thuật đặt nội khí quản', 4, 20),
        (20, N'ĐTLT_65_21', N'Kiểm tra cuối khoá, bế giảng', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_66: 30 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_66');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_66_01', N'Khai giảng, kiểm tra đầu vào', 5, 0),
        (1, N'ĐTLT_66_02', N'Bài 1: Tổng quan lọc máu liên tục', 5, 0),
        (2, N'ĐTLT_66_03', N'Bài 2: Trang thiết bị triển khai lọc máu liên tục', 5, 5),
        (3, N'ĐTLT_66_04', N'Bài 3: Màng lọc sử dụng trong lọc máu liên tục', 5, 0),
        (4, N'ĐTLT_66_05', N'Bài 4: Các loại dịch lọc sử dụng trong lọc máu liên tục', 5, 5),
        (5, N'ĐTLT_66_06', N'Bài 5: Điều chỉnh liều thuốc trong lọc máu liên tục', 5, 5),
        (6, N'ĐTLT_66_07', N'Bài 6: Sử dụng thuốc chống đông trong lọc máu liên tục', 5, 5),
        (7, N'ĐTLT_66_08', N'Bài 7: Sử dụng thuốc chống đông trong lọc máu hấp phụ', 5, 5),
        (8, N'ĐTLT_66_09', N'Bài 8: Các phương thức lọc máu liên tục', 10, 10),
        (9, N'ĐTLT_66_10', N'Bài 9: Tổng quan về lọc huyết tương', 10, 20),
        (10, N'ĐTLT_66_11', N'Bài 10: Tổng quan về quy trình gan nhân tạo (MARS)', 5, 0),
        (11, N'ĐTLT_66_12', N'Bài 11: Tổng quan về lọc máu hấp phụ', 5, 20),
        (12, N'ĐTLT_66_13', N'Bài 12: Quy trình lọc máu liên tục trong điều trị bệnh nhân viêm tụy cấp nặng', 5, 25),
        (13, N'ĐTLT_66_14', N'Bài 13: Quy trình lọc máu liên tục trong điều trị bệnh nhân nhiễm khuẩn nặng/sốc nhiễm khuẩn', 5, 30),
        (14, N'ĐTLT_66_15', N'Bài 14: Quy trình lọc huyết tương bằng máy ly tâm', 5, 10),
        (15, N'ĐTLT_66_16', N'Bài 15: Quy trình lọc máu liên tục trong điều trị bệnh nhân suy đa phủ tạng', 5, 30),
        (16, N'ĐTLT_66_17', N'Bài 16: Quy trình kỹ thuật lọc huyết tương với 2 quả lọc', 5, 0),
        (17, N'ĐTLT_66_18', N'Bài 17: Quy trình kỹ thuật lọc huyết tương trong điều trị hội chứng Guillain-Barré', 5, 20),
        (18, N'ĐTLT_66_19', N'Bài 18: Quy trình kỹ thuật lọc gan nhân tạo trong điều trị suy gan cấp', 5, 0),
        (19, N'ĐTLT_66_20', N'Bài 19: Quy trình kỹ thuật lọc huyết tương trong điều trị cơn nhược cơ nặng', 5, 20),
        (20, N'ĐTLT_66_21', N'Bài 20: Quy trình thay huyết tương trong điều trị suy gan cấp', 5, 30),
        (21, N'ĐTLT_66_22', N'Bài 21: Quy trình kỹ thuật lọc huyết tương trong điều trị bệnh nhân viêm tụy cấp do tăng triglycerid', 5, 20),
        (22, N'ĐTLT_66_23', N'Bài 22: Quy trình lọc máu liên tục cho bệnh nhân suy hô hấp cấp tiến triển (ARDS)', 5, 30),
        (23, N'ĐTLT_66_24', N'Bài 23: Cấp cứu ngừng tuần hoàn', 5, 15),
        (24, N'ĐTLT_66_25', N'Bài 24: Chẩn đoán và xử trí tình trạng sốc phản vệ', 5, 10),
        (25, N'ĐTLT_66_26', N'Bài 25: Kiểm soát nhiễm khuẩn trong lọc máu liên tục', 5, 15),
        (26, N'ĐTLT_66_27', N'Bài 26: Nước sử dụng trong lọc máu', 5, 5),
        (27, N'ĐTLT_66_28', N'Bài 27: Quy trình đặt catheter lọc máu', 5, 10),
        (28, N'ĐTLT_66_29', N'Bài 28: Quy trình lọc huyết tương trong điều trị các bệnh tự miễn (lupus, viêm da cơ, TTP...)', 5, 20),
        (29, N'ĐTLT_66_30', N'Khai giảng, bế giảng, ôn tập, kiểm tra', 5, 25);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_67: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_67');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_67_01', N'Khai giảng, kiểm tra đầu vào', 5, 0),
        (1, N'ĐTLT_67_02', N'Tổng quan lọc máu liên tục; Tổng quan thay huyết tương', 8, 24),
        (2, N'ĐTLT_67_03', N'Trang thiết bị triển khai lọc máu liên tục', 8, 12),
        (3, N'ĐTLT_67_04', N'Sử dụng thuốc chông đông trong lọc máu Liên tục', 8, 16),
        (4, N'ĐTLT_67_05', N'Các phương thức lọc máu liên tục', 10, 40),
        (5, N'ĐTLT_67_06', N'Lắp và cài đặt các thông số, vận hành máy lọc máu liên tục và thay huyết tương', 20, 60),
        (6, N'ĐTLT_67_07', N'Quy trình kỹ thuật lọc máu liên tục', 12, 48),
        (7, N'ĐTLT_67_08', N'Quy trình kỹ thuật thay huyết tương', 12, 48),
        (8, N'ĐTLT_67_09', N'Hướng dẫn theo dõi, ghi chép các thông số bệnh nhân và các thông số lọc máu.', 8, 16),
        (9, N'ĐTLT_67_10', N'Cấp cứu ngừng tuần hoàn', 8, 24),
        (10, N'ĐTLT_67_11', N'Chẩn đoán và xử trí tình trạng sốc phản vệ', 8, 24),
        (11, N'ĐTLT_67_12', N'Quy trình đặt catheter lọc máu', 8, 24),
        (12, N'ĐTLT_67_13', N'Các biện pháp phòng chống nhiễm khuẩn', 8, 16),
        (13, N'ĐTLT_67_14', N'Khai giảng, bế giảng, ôn tập, kiểm tra', 5, 25);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO

PRINT N'✅ Migration 2026-11-12_dtlt_programs_lessons hoàn tất.';
GO

-- @migration 2026-11-13_training_program_catalog.sql
/* ============================================================================
 * 2026-11-13_training_program_catalog
 * ----------------------------------------------------------------------------
 *   Danh mục chương trình đào tạo đầy đủ — 87 chương trình (20 GPHN + 67 ĐTLT)
 *   theo "danh-sach-ctdt-20261020.xlsx". Gộp 2 file cũ (khai báo trong MERGED
 *   của src/database/migrator.js):
 *     - 2026-11-13_dtlt_programs_department_codes.sql (mã khoa K*, PDD cho 57 CT ĐTLT)
 *     - 2026-11-14_program_trainee_types.sql          (nhiều đối tượng / chương trình)
 * 1) Danh mục đối tượng Y sĩ, Cử nhân + bảng program_trainee_types.
 * 2) Tạo chương trình còn thiếu (theo mã training_programs.code).
 * 3) Khoa phụ trách: 57 CT ĐTLT có trong 2026-11-12 ghi đè sang mã khoa đúng
 *    (bỏ mã CLS* cũ); các CT còn lại chỉ điền khi đang trống. GPHN chỉ 1 khoa
 *    theo sổ 3.xlsx: DD_1 → Khoa Dinh Dưỡng, KTVXN_2 / KTVXQ_2 → Khoa Cấp Cứu.
 * 4) Thông tin (loại hình, số tiết, thời lượng, đối tượng, sĩ số, ghi chú khoa):
 *    CHỈ điền cột đang trống — đã nhập / sửa tay thì giữ. Số liệu lấy từ
 *    "Chi tiết chương trình học ĐTLT.xlsx" (như 2026-11-12), thiếu thì theo
 *    danh sách CTĐT.
 * 5) Đối tượng học viên — CHỈ chương trình chưa có đối tượng nào.
 *    GPHN_YS_1/2: Excel để trống, gán Y sĩ theo tên chương trình.
 *    GPHN_DD_1 (dinh dưỡng lâm sàng): chưa rõ đối tượng, để trống.
 * 6) training_programs.trainee_type_id = đối tượng đầu tiên (code cũ vẫn đọc cột này).
 * 7) Vòng thực hành GPHN + khoa được đi của từng vòng (program_lessons 'rotation',
 *    mã <mã CT>_V<n>, lesson_departments) — rút từ sổ thực hành 3.xlsx bằng
 *    rotationPlanner.deriveTemplate (như practiceAutoService.buildTemplates).
 *    CHỈ chương trình chưa có vòng nào. "Trung tâm Bệnh nhiệt đới" của sổ = K11
 *    (vòng Nội khoa GPHN_DTH_1). Không có mẫu: GPHN_BS_3 (chuyên khoa tùy ngành),
 *    GPHN_BS_4/5, HS_1/2, YS_1/2, KTVNK_1/2, KTVPHCN_1/2 (sổ chưa ghi khoa).
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
GO

-- 1a) Danh mục đối tượng còn thiếu
MERGE [dbo].[trainee_types] AS tgt
USING (VALUES
    ('TRNTYPE-YS', N'Y sĩ',    N'Y sĩ đa khoa / Y sĩ YHCT'),
    ('TRNTYPE-CN', N'Cử nhân', N'Cử nhân xét nghiệm, sinh học, y tế công cộng...')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM');
GO

-- 1b) Bảng nối chương trình ↔ đối tượng
IF OBJECT_ID(N'dbo.program_trainee_types', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[program_trainee_types] (
        [program_id]      VARCHAR(20) NOT NULL,
        [trainee_type_id] VARCHAR(20) NOT NULL,
        [display_order]   INT         NOT NULL CONSTRAINT DF_program_trainee_types_order DEFAULT (0),
        CONSTRAINT PK_program_trainee_types PRIMARY KEY ([program_id], [trainee_type_id]),
        CONSTRAINT FK_prgtt_program FOREIGN KEY ([program_id])      REFERENCES [dbo].[training_programs] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_prgtt_type    FOREIGN KEY ([trainee_type_id]) REFERENCES [dbo].[trainee_types]     ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_program_trainee_types_type] ON [dbo].[program_trainee_types] ([trainee_type_id]);
END
GO

-- 1c) Đối tượng đơn đang có → bảng mới
INSERT INTO program_trainee_types (program_id, trainee_type_id, display_order)
SELECT p.id, p.trainee_type_id, 0
FROM training_programs p
WHERE p.trainee_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM program_trainee_types x WHERE x.program_id = p.id);
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 2) Tạo chương trình còn thiếu
INSERT INTO training_programs (id, code, name, display_order, created_by)
SELECT 'CT' + LEFT(REPLACE(NEWID(), '-', ''), 18), v.code, v.name, v.ord, 'SYSTEM'
FROM (VALUES
    (N'GPHN_DTH_2',    N'Thực hành giấy phép hành nghề Điều dưỡng về Hồi sức cấp cứu', 1),
    (N'GPHN_BS_2',     N'Thực hành giấy phép hành nghề Bác sĩ về Hồi sức cấp cứu', 2),
    (N'GPHN_BS_1',     N'Thực hành giấy phép hành nghề Bác sĩ y khoa', 3),
    (N'GPHN_BS_3',     N'Thực hành giấy phép hành nghề Bác sĩ chuyên khoa', 4),
    (N'GPHN_BS_4',     N'Thực hành giấy phép hành nghề Bác sĩ y học cổ truyền', 5),
    (N'GPHN_BS_5',     N'Thực hành giấy phép hành nghề Bác sĩ răng hàm mặt', 6),
    (N'GPHN_DTH_1',    N'Thực hành giấy phép hành nghề Điều dưỡng', 7),
    (N'GPHN_YS_1',     N'Thực hành giấy phép hành nghề Y sĩ đa khoa', 8),
    (N'GPHN_YS_2',     N'Thực hành giấy phép hành nghề Y sĩ y học cổ truyền', 9),
    (N'GPHN_HS_1',     N'Thực hành giấy phép hành nghề hộ sinh', 10),
    (N'GPHN_HS_2',     N'Thực hành giấy phép hành nghề Hộ sinh về Hồi sức cấp cứu', 11),
    (N'GPHN_KTVXN_1',  N'Thực hành giấy phép hành nghề kỹ thuật y (xét nghiệm y học)', 12),
    (N'GPHN_KTVXN_2',  N'Thực hành giấy phép hành nghề kỹ thuật y (xét nghiệm y học) về Hồi sức cấp cứu', 13),
    (N'GPHN_KTVXQ_1',  N'Thực hành giấy phép hành nghề kỹ thuật y (hình ảnh y học)', 14),
    (N'GPHN_KTVXQ_2',  N'Thực hành giấy phép hành nghề kỹ thuật y (hình ảnh y học) về Hồi sức cấp cứu', 15),
    (N'GPHN_KTVNK_1',  N'Thực hành giấy phép hành nghề kỹ thuật y (khúc xạ nhãn khoa)', 16),
    (N'GPHN_KTVNK_2',  N'Thực hành giấy phép hành nghề kỹ thuật y (khúc xạ nhãn khoa) về Hồi sức cấp cứu', 17),
    (N'GPHN_KTVPHCN_1', N'Thực hành giấy phép hành nghề kỹ thuật y (Phục hồi chức năng)', 18),
    (N'GPHN_KTVPHCN_2', N'Thực hành giấy phép hành nghề kỹ thuật y (Phục hồi chức năng)', 19),
    (N'GPHN_DD_1',     N'Thực hành giấy phép hành nghề dinh dưỡng lâm sàng', 20),
    (N'ĐTLT_1',        N'Giải phẫu bệnh cơ bản', 21),
    (N'ĐTLT_2',        N'Chấn thương Chỉnh hình cơ bản', 22),
    (N'ĐTLT_3',        N'Chẩn đoán và điều trị các bệnh Nội tiết', 23),
    (N'ĐTLT_4',        N'Kỹ thuật viên Nội soi Tiêu hóa', 24),
    (N'ĐTLT_5',        N'Siêu âm cơ bản', 25),
    (N'ĐTLT_6',        N'Nội soi tiêu hóa cơ bản', 26),
    (N'ĐTLT_7',        N'Nội soi can thiệp đường tiêu hóa', 27),
    (N'ĐTLT_8',        N'Nội soi đại tràng', 28),
    (N'ĐTLT_9',        N'Phẫu thuật Nội soi cơ bản', 29),
    (N'ĐTLT_10',       N'Hóa sinh cơ bản', 30),
    (N'ĐTLT_11',       N'Chẩn đoán và điều trị bệnh đột quỵ não', 31),
    (N'ĐTLT_12',       N'Chẩn đoán và điều trị suy tim', 32),
    (N'ĐTLT_13',       N'Hướng dẫn đọc Điện tâm đồ', 33),
    (N'ĐTLT_14',       N'Điện não đồ', 34),
    (N'ĐTLT_15',       N'An toàn người bệnh', 35),
    (N'ĐTLT_16',       N'Sử dụng thuốc an toàn hợp lý cho Điều dưỡng', 36),
    (N'ĐTLT_17',       N'Tăng cường năng lực quản lý Điều dưỡng', 37),
    (N'ĐTLT_18',       N'Gây mê hồi sức cơ bản', 38),
    (N'ĐTLT_19',       N'Gây mê hồi sức trong phẫu thuật nội soi', 39),
    (N'ĐTLT_20',       N'X.quang cơ bản', 40),
    (N'ĐTLT_21',       N'Cắt lớp vi tính cơ bản', 41),
    (N'ĐTLT_22',       N'Khám và điều trị các bệnh TMH cơ bản', 42),
    (N'ĐTLT_23',       N'Khám nội soi tai mũi họng', 43),
    (N'ĐTLT_24',       N'Mở khí quản', 44),
    (N'ĐTLT_25',       N'Đào tạo điều dưỡng chuyên ngành tai mũi họng', 45),
    (N'ĐTLT_26',       N'Điều dưỡng nha khoa', 46),
    (N'ĐTLT_27',       N'Kỹ thuật cấp cứu cơ bản - Bác sĩ', 47),
    (N'ĐTLT_28',       N'Kỹ thuật cấp cứu cơ bản - Điều dưỡng', 48),
    (N'ĐTLT_29',       N'Phẫu thuật Phaco', 49),
    (N'ĐTLT_30',       N'Chụp mạch huỳnh quang đáy mắt', 50),
    (N'ĐTLT_31',       N'Kiểm soát nhiễm khuẩn', 51),
    (N'ĐTLT_32',       N'Cấp cứu ngừng tuần hoàn', 52),
    (N'ĐTLT_33',       N'Chẩn đoán và điều trị chấn thương sọ não', 53),
    (N'ĐTLT_34',       N'Tiêm an toàn và quản lý chất rắn y tế', 54),
    (N'ĐTLT_35',       N'Kỹ năng tư vấn và Giáo dục sức khỏe', 55),
    (N'ĐTLT_36',       N'Quản lý điều dưỡng', 56),
    (N'ĐTLT_37',       N'Nội soi phế quản ống mềm', 57),
    (N'ĐTLT_38',       N'Chăm sóc bệnh nhân hồi sức sau mổ', 58),
    (N'ĐTLT_39',       N'Chăm sóc bệnh nhân thở máy', 59),
    (N'ĐTLT_40',       N'Thông khí nhân tạo cơ bản', 60),
    (N'ĐTLT_41',       N'Kỹ thuật xét nghiệm Huyết học - Truyền máu cơ bản', 61),
    (N'ĐTLT_42',       N'Chẩn đoán và điều trị các bệnh lý Cơ xương khớp cơ bản', 62),
    (N'ĐTLT_43',       N'Kỹ thuật vật lý trị liệu- phục hồi chức năng cơ bản', 63),
    (N'ĐTLT_44',       N'Khúc xạ cơ bản', 64),
    (N'ĐTLT_45',       N'Phẫu thuật gan mật cơ bản', 65),
    (N'ĐTLT_46',       N'Kỹ thuật lọc máu thận nhân tạo cơ bản - Điều dưỡng - KTV', 66),
    (N'ĐTLT_47',       N'Kỹ thuật lọc máu thận nhân tạo cơ bản - Bác sỹ', 67),
    (N'ĐTLT_48',       N'Kỹ thuật xét nghiệm vi sinh cơ bản', 68),
    (N'ĐTLT_49',       N'Kỹ thuật xoa bóp bấm huyệt', 69),
    (N'ĐTLT_50',       N'Kỹ thuật châm cứu cơ bản', 70),
    (N'ĐTLT_51',       N'Đọc phim MRI cơ bản', 71),
    (N'ĐTLT_52',       N'Chẩn đoán và điều trị viêm gan', 72),
    (N'ĐTLT_53',       N'Tiêm khớp cơ bản', 73),
    (N'ĐTLT_54',       N'Chẩn đoán và điều trị một một số bệnh đường tiêu hóa thường gặp', 74),
    (N'ĐTLT_55',       N'Chẩn đoán và điều trị các bệnh lý Huyết học – Truyền máu', 75),
    (N'ĐTLT_56',       N'Kỹ thuật viên Gây mê hồi sức', 76),
    (N'ĐTLT_57',       N'Dụng cụ viên Gây mê hồi sức', 77),
    (N'ĐTLT_58',       N'Thực hành tốt bán lẻ thuốc', 78),
    (N'ĐTLT_59',       N'Bảo quản và cấp phát thuốc', 79),
    (N'ĐTLT_60',       N'Kỹ năng tìm kiếm và phân giải thông tin thuốc', 80),
    (N'ĐTLT_61',       N'Sử dụng thuốc trên các đối tượng đặc biệt', 81),
    (N'ĐTLT_62',       N'Thực hành khai thác bệnh án và phân tích ca lâm sàng', 82),
    (N'ĐTLT_63',       N'Kỹ thuật khai thông mạch não bằng điều trị thuốc tiêu sợi huyết trong nhồi máu não cấp', 83),
    (N'ĐTLT_64',       N'Phục hồi chức năng cơ bản', 84),
    (N'ĐTLT_65',       N'Hồi sức cấp cứu cơ bản', 85),
    (N'ĐTLT_66',       N'Kỹ thuật lọc máu liên tục và thay huyết tương', 86),
    (N'ĐTLT_67',       N'Chăm sóc người bệnh lọc máu liên tục và thay huyết tương', 87)
) v (code, name, ord)
WHERE NOT EXISTS (SELECT 1 FROM training_programs p WHERE p.code = v.code);

-- Thông tin từng chương trình. dept = departments.code;
-- force_dept = 1 → ghi đè khoa đang có (57 CT ĐTLT của 2026-11-12)
DECLARE @info TABLE (
    code NVARCHAR(50) PRIMARY KEY, training_type_id VARCHAR(20),
    theory_hours INT, practice_hours INT, duration NVARCHAR(50),
    duration_value DECIMAL(10, 2), duration_unit VARCHAR(10), target_audience NVARCHAR(500),
    min_capacity INT, max_capacity INT, dept NVARCHAR(50), force_dept BIT, department_note NVARCHAR(500)
);
INSERT INTO @info VALUES
    (N'GPHN_DTH_2',    'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Điều dưỡng', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_BS_2',     'TRNTP-GPHN', NULL, NULL, N'03 tháng', 3, 'month', N'Bác sĩ', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_BS_1',     'TRNTP-GPHN', NULL, NULL, N'12 tháng', 12, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_BS_3',     'TRNTP-GPHN', NULL, NULL, N'09 tháng', 9, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_BS_4',     'TRNTP-GPHN', NULL, NULL, N'12 tháng', 12, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_BS_5',     'TRNTP-GPHN', NULL, NULL, N'12 tháng', 12, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_DTH_1',    'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Điều dưỡng', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_YS_1',     'TRNTP-GPHN', NULL, NULL, N'09 tháng', 9, 'month', N'Y sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_YS_2',     'TRNTP-GPHN', NULL, NULL, N'09 tháng', 9, 'month', N'Y sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_HS_1',     'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Nữ hộ sinh', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_HS_2',     'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Nữ hộ sinh', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVXN_1',  'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVXN_2',  'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_KTVXQ_1',  'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVXQ_2',  'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_KTVNK_1',  'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVNK_2',  'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVPHCN_1', 'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVPHCN_2', 'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_DD_1',     'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', NULL, NULL, NULL, N'DIDU', 0, NULL),
    (N'ĐTLT_1',        'TRNTP-DTLT', 188, 340, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 10, N'K42', 1, NULL),
    (N'ĐTLT_2',        'TRNTP-DTLT', 132, 1308, N'09 tháng', 9, 'month', N'Bác sĩ', 5, 15, N'K24', 1, NULL),
    (N'ĐTLT_3',        'TRNTP-DTLT', 80, 240, N'03 tháng', 3, 'month', N'Bác sĩ', 10, 10, N'K08', 1, NULL),
    (N'ĐTLT_4',        'TRNTP-DTLT', 50, 430, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_5',        'TRNTP-DTLT', 92, 388, N'03 tháng', 3, 'month', N'Bác sĩ', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_6',        'TRNTP-DTLT', 60, 420, N'03 tháng', 3, 'month', N'Bác sĩ', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_7',        'TRNTP-DTLT', 60, 420, N'03 tháng', 3, 'month', N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên hoặc nội soi đại tràng', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_8',        'TRNTP-DTLT', 50, 430, N'03 tháng', 3, 'month', N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_9',        'TRNTP-DTLT', 102, 378, N'03 tháng', 3, 'month', N'Bác sĩ', 10, 10, N'K22', 1, NULL),
    (N'ĐTLT_10',       'TRNTP-DTLT', 130, 246, N'03 tháng', 3, 'month', N'Bác sĩ, Dược sĩ, Cử nhân, KTV xét nghiệm', 1, 8, N'K37', 1, NULL),
    (N'ĐTLT_11',       'TRNTP-DTLT', 48, 912, N'06 tháng', 6, 'month', N'Bác sĩ đã có CCHN', 2, 10, N'K142', 1, NULL),
    (N'ĐTLT_12',       'TRNTP-DTLT', 60, 120, N'02 tháng', 2, 'month', N'Bác sĩ', 5, 10, N'K51', 1, NULL),
    (N'ĐTLT_13',       'TRNTP-DTLT', 80, 160, N'02 tháng', 2, 'month', N'Bác sĩ', 10, 20, N'K51', 1, NULL),
    (N'ĐTLT_14',       'TRNTP-DTLT', 60, 120, N'1,5 tháng', 1.5, 'month', N'Bác sĩ', 3, 10, N'K141', 1, NULL),
    (N'ĐTLT_15',       'TRNTP-DTLT', NULL, NULL, N'07 ngày', 7, 'day', N'Bác sĩ', NULL, NULL, N'PDD', 0, NULL),
    (N'ĐTLT_16',       'TRNTP-DTLT', NULL, NULL, N'05 ngày', 5, 'day', N'Điều dưỡng', NULL, NULL, N'PDD', 0, NULL),
    (N'ĐTLT_17',       'TRNTP-DTLT', 39, 17, N'07 ngày', 7, 'day', N'Điều dưỡng, hộ sinh, KTV', 20, 25, N'PDD', 1, NULL),
    (N'ĐTLT_18',       'TRNTP-DTLT', 89, 419, N'06 tháng', 6, 'month', N'Bác sĩ', 1, 10, N'K26', 1, NULL),
    (N'ĐTLT_19',       'TRNTP-DTLT', 81, 269, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 8, N'K26', 1, NULL),
    (N'ĐTLT_20',       'TRNTP-DTLT', 126, 310, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 15, N'K39', 1, NULL),
    (N'ĐTLT_21',       'TRNTP-DTLT', 96, 410, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 15, N'K39', 1, NULL),
    (N'ĐTLT_22',       'TRNTP-DTLT', NULL, NULL, N'03 tháng', 3, 'month', N'Bác sĩ', NULL, NULL, N'K28', 0, NULL),
    (N'ĐTLT_23',       'TRNTP-DTLT', 88, 310, N'03 tháng', 3, 'month', N'Bác sĩ, KTV', 2, 10, N'K28', 1, NULL),
    (N'ĐTLT_24',       'TRNTP-DTLT', 32, 96, N'01 tháng', 1, 'month', N'Bác sĩ, KTV', 2, 10, N'K28', 1, NULL),
    (N'ĐTLT_25',       'TRNTP-DTLT', 96, 360, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 2, 10, N'K28', 1, NULL),
    (N'ĐTLT_26',       'TRNTP-DTLT', 48, 352, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 10, N'K29', 1, NULL),
    (N'ĐTLT_27',       'TRNTP-DTLT', 110, 454, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 15, N'K02', 1, NULL),
    (N'ĐTLT_28',       'TRNTP-DTLT', 94, 449, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 2, 25, N'K02', 1, NULL),
    (N'ĐTLT_29',       'TRNTP-DTLT', 150, 330, N'03 tháng', 3, 'month', N'Bác sĩ đã có CCHN', 2, 5, N'K30', 1, NULL),
    (N'ĐTLT_30',       'TRNTP-DTLT', 90, 150, N'1,5 tháng', 1.5, 'month', N'Bác sĩ đã có CCHN', 2, 10, N'K30', 1, NULL),
    (N'ĐTLT_31',       'TRNTP-DTLT', 24, 16, N'05 ngày', 5, 'day', N'Nhân viên y tế', 10, 15, N'KSNK', 1, NULL),
    (N'ĐTLT_32',       'TRNTP-DTLT', 10, 30, N'07 ngày', 7, 'day', N'Bác sĩ, điều dưỡng, hộ sinh, KTV', 2, 15, N'K02', 1, NULL),
    (N'ĐTLT_33',       'TRNTP-DTLT', 200, 200, N'03 tháng', 3, 'month', N'BS có CCHN', 2, 10, N'K20', 1, NULL),
    (N'ĐTLT_34',       'TRNTP-DTLT', 27, 11, N'04 ngày', 4, 'day', N'Điều dưỡng, hộ sinh, KTV', 20, 35, N'PDD', 1, NULL),
    (N'ĐTLT_35',       'TRNTP-DTLT', 21, 29, N'05 ngày', 5, 'day', N'Điều dưỡng, hộ sinh', 2, 25, N'PDD', 1, NULL),
    (N'ĐTLT_36',       'TRNTP-DTLT', NULL, NULL, N'20 ngày', 20, 'day', N'Điều dưỡng', NULL, NULL, N'PDD', 0, NULL),
    (N'ĐTLT_37',       'TRNTP-DTLT', 20, 280, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 5, N'K50', 1, NULL),
    (N'ĐTLT_38',       'TRNTP-DTLT', 128, 340, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 15, N'K482', 1, NULL),
    (N'ĐTLT_39',       'TRNTP-DTLT', 112, 336, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 15, N'K482', 1, NULL),
    (N'ĐTLT_40',       'TRNTP-DTLT', 100, 378, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 15, N'K482', 1, NULL),
    (N'ĐTLT_41',       'TRNTP-DTLT', 116, 412, N'03 tháng', 3, 'month', N'Bác sĩ, Y sĩ, Điều dưỡng, Hộ sinh, KTV', 1, 15, N'K36', 1, NULL),
    (N'ĐTLT_42',       'TRNTP-DTLT', 66, 462, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 15, N'K06', 1, NULL),
    (N'ĐTLT_43',       'TRNTP-DTLT', NULL, NULL, N'03 tháng', 3, 'month', N'Điều dưỡng', NULL, NULL, N'K31', 0, NULL),
    (N'ĐTLT_44',       'TRNTP-DTLT', 150, 330, N'03 tháng', 3, 'month', N'Bác sĩ nhãn khoa đã có CCHN', 2, 10, N'K30', 1, NULL),
    (N'ĐTLT_45',       'TRNTP-DTLT', 48, 370, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 5, N'K192', 1, NULL),
    (N'ĐTLT_46',       'TRNTP-DTLT', 152, 652, N'06 tháng', 6, 'month', N'ĐD, KTV', 2, 10, N'K07', 1, NULL),
    (N'ĐTLT_47',       'TRNTP-DTLT', 156, 656, N'06 tháng', 6, 'month', N'BS', 2, 10, N'K07', 1, NULL),
    (N'ĐTLT_48',       'TRNTP-DTLT', 48, 436, N'03 tháng', 3, 'month', N'BS, KTV xét nghiệm, Cử nhân sinh học, ĐD, Dược sĩ', 1, 10, N'K38', 1, NULL),
    (N'ĐTLT_49',       'TRNTP-DTLT', 228, 268, N'03 tháng', 3, 'month', N'BS, ĐD,KTV, YS YHCT', 2, 15, N'K16', 1, NULL),
    (N'ĐTLT_50',       'TRNTP-DTLT', 172, 296, N'03 tháng', 3, 'month', N'BS, ĐD,KTV, YS YHCT', 2, 15, N'K16', 1, NULL),
    (N'ĐTLT_51',       'TRNTP-DTLT', 96, 440, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 15, N'K39', 1, NULL),
    (N'ĐTLT_52',       'TRNTP-DTLT', 100, 304, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 10, N'K11', 1, N'Trung tâm Bệnh nhiệt đới'),
    (N'ĐTLT_53',       'TRNTP-DTLT', 128, 416, N'03 tháng', 3, 'month', N'Bác sĩ đã có CCHN/GPHN', 1, 15, N'K06', 1, NULL),
    (N'ĐTLT_54',       'TRNTP-DTLT', 198, 282, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 10, N'K05', 1, NULL),
    (N'ĐTLT_55',       'TRNTP-DTLT', 177, 187, N'03 tháng', 3, 'month', N'Bác sĩ', 5, 10, N'K10', 1, NULL),
    (N'ĐTLT_56',       'TRNTP-DTLT', 68, 440, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 1, 12, N'K26', 1, NULL),
    (N'ĐTLT_57',       'TRNTP-DTLT', 126, 274, N'03 tháng', 3, 'month', N'Điều dưỡng, Y sỹ, KTV', 1, 10, N'K26', 1, NULL),
    (N'ĐTLT_58',       'TRNTP-DTLT', NULL, NULL, N'03 ngày', 3, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_59',       'TRNTP-DTLT', NULL, NULL, N'02 ngày', 2, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_60',       'TRNTP-DTLT', NULL, NULL, N'03 ngày', 3, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_61',       'TRNTP-DTLT', NULL, NULL, N'02 ngày', 2, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_62',       'TRNTP-DTLT', NULL, NULL, N'02 ngày', 2, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_63',       'TRNTP-DTLT', 72, 288, N'03 tháng', 3, 'month', N'Bác sĩ', 10, 10, N'K142', 1, NULL),
    (N'ĐTLT_64',       'TRNTP-DTLT', 260, 684, N'09 tháng', 9, 'month', N'Bác sĩ', 10, 10, N'K31', 1, NULL),
    (N'ĐTLT_65',       'TRNTP-DTLT', 82, 436, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 20, N'K481', 1, NULL),
    (N'ĐTLT_66',       'TRNTP-DTLT', 160, 390, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 10, N'K481', 1, NULL),
    (N'ĐTLT_67',       'TRNTP-DTLT', 128, 377, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 15, N'K481', 1, NULL);

-- 3) Khoa phụ trách
UPDATE p SET
    department_id = d.id,
    updated_at = GETDATE(), updated_by = 'SYSTEM'
FROM training_programs p
JOIN @info v ON v.code = p.code
JOIN departments d ON d.code = v.dept
WHERE (v.force_dept = 1 AND (p.department_id IS NULL OR p.department_id <> d.id))
   OR (v.force_dept = 0 AND p.department_id IS NULL);

-- ĐTLT_12, ĐTLT_13 đã gắn Trung tâm Tim mạch (K51) → bỏ ghi chú khoa cũ
UPDATE training_programs SET
    department_note = NULL,
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code IN (N'ĐTLT_12', N'ĐTLT_13') AND department_note = N'Trung tâm Tim mạch';

-- 4) Thông tin còn trống
UPDATE p SET
    training_type_id = COALESCE(p.training_type_id, v.training_type_id),
    theory_hours     = COALESCE(p.theory_hours, v.theory_hours),
    practice_hours   = COALESCE(p.practice_hours, v.practice_hours),
    duration         = COALESCE(p.duration, v.duration),
    duration_value   = COALESCE(p.duration_value, v.duration_value),
    duration_unit    = COALESCE(p.duration_unit, v.duration_unit),
    target_audience  = COALESCE(p.target_audience, v.target_audience),
    min_capacity     = COALESCE(p.min_capacity, v.min_capacity),
    max_capacity     = COALESCE(p.max_capacity, v.max_capacity),
    department_note  = COALESCE(p.department_note, v.department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
FROM training_programs p
JOIN @info v ON v.code = p.code
WHERE (p.training_type_id IS NULL AND v.training_type_id IS NOT NULL)
   OR (p.theory_hours     IS NULL AND v.theory_hours     IS NOT NULL)
   OR (p.practice_hours   IS NULL AND v.practice_hours   IS NOT NULL)
   OR (p.duration         IS NULL AND v.duration         IS NOT NULL)
   OR (p.duration_value   IS NULL AND v.duration_value   IS NOT NULL)
   OR (p.duration_unit    IS NULL AND v.duration_unit    IS NOT NULL)
   OR (p.target_audience  IS NULL AND v.target_audience  IS NOT NULL)
   OR (p.min_capacity     IS NULL AND v.min_capacity     IS NOT NULL)
   OR (p.max_capacity     IS NULL AND v.max_capacity     IS NOT NULL)
   OR (p.department_note  IS NULL AND v.department_note  IS NOT NULL);

-- 5) Đối tượng học viên
INSERT INTO program_trainee_types (program_id, trainee_type_id, display_order)
SELECT p.id, v.trainee_type_id, v.ord
FROM (VALUES
    (N'GPHN_DTH_2',    'TRNTYPE-DD',  0),
    (N'GPHN_BS_2',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_1',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_3',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_4',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_5',     'TRNTYPE-BS',  0),
    (N'GPHN_DTH_1',    'TRNTYPE-DD',  0),
    (N'GPHN_YS_1',     'TRNTYPE-YS',  0),
    (N'GPHN_YS_2',     'TRNTYPE-YS',  0),
    (N'GPHN_HS_1',     'TRNTYPE-NHS', 0),
    (N'GPHN_HS_2',     'TRNTYPE-NHS', 0),
    (N'GPHN_KTVXN_1',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVXN_2',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVXQ_1',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVXQ_2',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVNK_1',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVNK_2',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVPHCN_1', 'TRNTYPE-KTV', 0),
    (N'GPHN_KTVPHCN_2', 'TRNTYPE-KTV', 0),
    (N'ĐTLT_1',        'TRNTYPE-BS',  0),
    (N'ĐTLT_2',        'TRNTYPE-BS',  0),
    (N'ĐTLT_3',        'TRNTYPE-BS',  0),
    (N'ĐTLT_4',        'TRNTYPE-DD',  0),
    (N'ĐTLT_4',        'TRNTYPE-KTV', 1),
    (N'ĐTLT_5',        'TRNTYPE-BS',  0),
    (N'ĐTLT_6',        'TRNTYPE-BS',  0),
    (N'ĐTLT_7',        'TRNTYPE-BS',  0),
    (N'ĐTLT_8',        'TRNTYPE-BS',  0),
    (N'ĐTLT_9',        'TRNTYPE-BS',  0),
    (N'ĐTLT_10',       'TRNTYPE-BS',  0),
    (N'ĐTLT_10',       'TRNTYPE-DSI', 1),
    (N'ĐTLT_10',       'TRNTYPE-CN',  2),
    (N'ĐTLT_10',       'TRNTYPE-KTV', 3),
    (N'ĐTLT_11',       'TRNTYPE-BS',  0),
    (N'ĐTLT_12',       'TRNTYPE-BS',  0),
    (N'ĐTLT_13',       'TRNTYPE-BS',  0),
    (N'ĐTLT_14',       'TRNTYPE-BS',  0),
    (N'ĐTLT_15',       'TRNTYPE-BS',  0),
    (N'ĐTLT_16',       'TRNTYPE-DD',  0),
    (N'ĐTLT_17',       'TRNTYPE-DD',  0),
    (N'ĐTLT_17',       'TRNTYPE-NHS', 1),
    (N'ĐTLT_17',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_18',       'TRNTYPE-BS',  0),
    (N'ĐTLT_19',       'TRNTYPE-BS',  0),
    (N'ĐTLT_20',       'TRNTYPE-BS',  0),
    (N'ĐTLT_21',       'TRNTYPE-BS',  0),
    (N'ĐTLT_22',       'TRNTYPE-BS',  0),
    (N'ĐTLT_23',       'TRNTYPE-BS',  0),
    (N'ĐTLT_23',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_24',       'TRNTYPE-BS',  0),
    (N'ĐTLT_24',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_25',       'TRNTYPE-DD',  0),
    (N'ĐTLT_25',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_26',       'TRNTYPE-DD',  0),
    (N'ĐTLT_27',       'TRNTYPE-BS',  0),
    (N'ĐTLT_28',       'TRNTYPE-DD',  0),
    (N'ĐTLT_28',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_29',       'TRNTYPE-BS',  0),
    (N'ĐTLT_30',       'TRNTYPE-BS',  0),
    (N'ĐTLT_31',       'TRNTYPE-BS',  0),
    (N'ĐTLT_31',       'TRNTYPE-DD',  1),
    (N'ĐTLT_31',       'TRNTYPE-NHS', 2),
    (N'ĐTLT_31',       'TRNTYPE-KTV', 3),
    (N'ĐTLT_31',       'TRNTYPE-YS',  4),
    (N'ĐTLT_31',       'TRNTYPE-DSI', 5),
    (N'ĐTLT_31',       'TRNTYPE-CN',  6),
    (N'ĐTLT_32',       'TRNTYPE-BS',  0),
    (N'ĐTLT_32',       'TRNTYPE-DD',  1),
    (N'ĐTLT_32',       'TRNTYPE-NHS', 2),
    (N'ĐTLT_32',       'TRNTYPE-KTV', 3),
    (N'ĐTLT_33',       'TRNTYPE-BS',  0),
    (N'ĐTLT_34',       'TRNTYPE-DD',  0),
    (N'ĐTLT_34',       'TRNTYPE-NHS', 1),
    (N'ĐTLT_34',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_35',       'TRNTYPE-DD',  0),
    (N'ĐTLT_35',       'TRNTYPE-NHS', 1),
    (N'ĐTLT_36',       'TRNTYPE-DD',  0),
    (N'ĐTLT_37',       'TRNTYPE-BS',  0),
    (N'ĐTLT_38',       'TRNTYPE-DD',  0),
    (N'ĐTLT_39',       'TRNTYPE-DD',  0),
    (N'ĐTLT_40',       'TRNTYPE-BS',  0),
    (N'ĐTLT_41',       'TRNTYPE-BS',  0),
    (N'ĐTLT_41',       'TRNTYPE-YS',  1),
    (N'ĐTLT_41',       'TRNTYPE-DD',  2),
    (N'ĐTLT_41',       'TRNTYPE-NHS', 3),
    (N'ĐTLT_41',       'TRNTYPE-KTV', 4),
    (N'ĐTLT_42',       'TRNTYPE-BS',  0),
    (N'ĐTLT_43',       'TRNTYPE-DD',  0),
    (N'ĐTLT_44',       'TRNTYPE-BS',  0),
    (N'ĐTLT_45',       'TRNTYPE-BS',  0),
    (N'ĐTLT_46',       'TRNTYPE-DD',  0),
    (N'ĐTLT_46',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_47',       'TRNTYPE-BS',  0),
    (N'ĐTLT_48',       'TRNTYPE-BS',  0),
    (N'ĐTLT_48',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_48',       'TRNTYPE-CN',  2),
    (N'ĐTLT_48',       'TRNTYPE-DD',  3),
    (N'ĐTLT_48',       'TRNTYPE-DSI', 4),
    (N'ĐTLT_49',       'TRNTYPE-BS',  0),
    (N'ĐTLT_49',       'TRNTYPE-DD',  1),
    (N'ĐTLT_49',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_49',       'TRNTYPE-YS',  3),
    (N'ĐTLT_50',       'TRNTYPE-BS',  0),
    (N'ĐTLT_50',       'TRNTYPE-DD',  1),
    (N'ĐTLT_50',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_50',       'TRNTYPE-YS',  3),
    (N'ĐTLT_51',       'TRNTYPE-BS',  0),
    (N'ĐTLT_52',       'TRNTYPE-BS',  0),
    (N'ĐTLT_53',       'TRNTYPE-BS',  0),
    (N'ĐTLT_54',       'TRNTYPE-BS',  0),
    (N'ĐTLT_55',       'TRNTYPE-BS',  0),
    (N'ĐTLT_56',       'TRNTYPE-DD',  0),
    (N'ĐTLT_56',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_57',       'TRNTYPE-DD',  0),
    (N'ĐTLT_57',       'TRNTYPE-YS',  1),
    (N'ĐTLT_57',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_58',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_59',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_60',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_61',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_62',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_63',       'TRNTYPE-BS',  0),
    (N'ĐTLT_64',       'TRNTYPE-BS',  0),
    (N'ĐTLT_65',       'TRNTYPE-BS',  0),
    (N'ĐTLT_66',       'TRNTYPE-BS',  0),
    (N'ĐTLT_67',       'TRNTYPE-DD',  0)
) AS v (program_code, trainee_type_id, ord)
JOIN training_programs p ON p.code = v.program_code
JOIN trainee_types t ON t.id = v.trainee_type_id
WHERE NOT EXISTS (SELECT 1 FROM program_trainee_types x WHERE x.program_id = p.id);

-- 6) Cột cũ = đối tượng đầu tiên
UPDATE p SET
    trainee_type_id = f.trainee_type_id,
    updated_at = GETDATE(), updated_by = 'SYSTEM'
FROM training_programs p
CROSS APPLY (SELECT TOP 1 x.trainee_type_id FROM program_trainee_types x
             WHERE x.program_id = p.id ORDER BY x.display_order) f
WHERE p.trainee_type_id IS NULL OR p.trainee_type_id <> f.trainee_type_id;

-- 7) Vòng thực hành GPHN + khoa
DECLARE @rounds TABLE (
    program_code NVARCHAR(50), ord INT, code NVARCHAR(50) PRIMARY KEY, title NVARCHAR(255),
    duration_value DECIMAL(6, 2), duration_unit VARCHAR(10), allow_split BIT, id VARCHAR(20) NULL
);
INSERT INTO @rounds (program_code, ord, code, title, duration_value, duration_unit, allow_split) VALUES
    (N'GPHN_DTH_2',    0, N'GPHN_DTH_2_V1',     N'Hồi sức cấp cứu', 1, 'month', 0),
    (N'GPHN_BS_2',     0, N'GPHN_BS_2_V1',      N'Hồi sức cấp cứu', 3, 'month', 0),
    (N'GPHN_BS_1',     0, N'GPHN_BS_1_V1',      N'Nội khoa', 1, 'month', 0),
    (N'GPHN_BS_1',     1, N'GPHN_BS_1_V2',      N'Ngoại khoa', 2, 'month', 0),
    (N'GPHN_BS_1',     2, N'GPHN_BS_1_V3',      N'Hồi sức cấp cứu', 3, 'month', 0),
    (N'GPHN_BS_1',     3, N'GPHN_BS_1_V4',      N'Phụ Sản', 2, 'month', 0),
    (N'GPHN_BS_1',     4, N'GPHN_BS_1_V5',      N'Nhi - Sơ sinh', 2, 'month', 0),
    (N'GPHN_BS_1',     5, N'GPHN_BS_1_V6',      N'Chuyên khoa khác', 2, 'month', 1),
    (N'GPHN_DTH_1',    0, N'GPHN_DTH_1_V1',     N'Hồi sức cấp cứu', 1, 'month', 0),
    (N'GPHN_DTH_1',    1, N'GPHN_DTH_1_V2',     N'Nội khoa', 1.5, 'month', 0),
    (N'GPHN_DTH_1',    2, N'GPHN_DTH_1_V3',     N'Ngoại khoa', 1.5, 'month', 0),
    (N'GPHN_DTH_1',    3, N'GPHN_DTH_1_V4',     N'Nhi - Sơ sinh', 1, 'month', 0),
    (N'GPHN_DTH_1',    4, N'GPHN_DTH_1_V5',     N'Phụ Sản', 1, 'month', 0),
    (N'GPHN_KTVXN_1',  0, N'GPHN_KTVXN_1_V1',   N'Huyết Học', 2, 'month', 0),
    (N'GPHN_KTVXN_1',  1, N'GPHN_KTVXN_1_V2',   N'Hóa Sinh', 1.5, 'month', 0),
    (N'GPHN_KTVXN_1',  2, N'GPHN_KTVXN_1_V3',   N'Vi Sinh', 1.5, 'month', 0),
    (N'GPHN_KTVXN_1',  3, N'GPHN_KTVXN_1_V4',   N'Hồi sức cấp cứu', 1, 'month', 0),
    (N'GPHN_KTVXN_2',  0, N'GPHN_KTVXN_2_V1',   N'Cấp Cứu', 1, 'month', 0),
    (N'GPHN_KTVXQ_1',  0, N'GPHN_KTVXQ_1_V1',   N'Cấp Cứu', 1, 'month', 0),
    (N'GPHN_KTVXQ_1',  1, N'GPHN_KTVXQ_1_V2',   N'X-Quang', 5, 'month', 0),
    (N'GPHN_KTVXQ_2',  0, N'GPHN_KTVXQ_2_V1',   N'Cấp Cứu', 1, 'month', 0),
    (N'GPHN_DD_1',     0, N'GPHN_DD_1_V1',      N'Dinh Dưỡng', 6, 'month', 0);

DECLARE @round_depts TABLE (code NVARCHAR(50), dept NVARCHAR(50), ord INT, PRIMARY KEY (code, dept));
INSERT INTO @round_depts (code, dept, ord) VALUES
    (N'GPHN_DTH_2_V1',     N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_DTH_2_V1',     N'K49',    1), -- Khoa Chống Độc
    (N'GPHN_DTH_2_V1',     N'K482',   2), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_BS_2_V1',      N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_BS_2_V1',      N'K49',    1), -- Khoa Chống Độc
    (N'GPHN_BS_2_V1',      N'K481',   2), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_BS_2_V1',      N'K482',   3), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_BS_1_V1',      N'K08',    0), -- Khoa Nội Tiết - ĐTĐ
    (N'GPHN_BS_1_V1',      N'K042',   1), -- Khoa Nội Tim Mạch 2
    (N'GPHN_BS_1_V1',      N'K041',   2), -- Khoa Nội Tim Mạch 1
    (N'GPHN_BS_1_V1',      N'K05',    3), -- Khoa Nội Tiêu Hóa
    (N'GPHN_BS_1_V1',      N'K06',    4), -- Khoa Nội Cơ Xương Khớp
    (N'GPHN_BS_1_V1',      N'K50',    5), -- Khoa Nội Dị Ứng - Hô Hấp
    (N'GPHN_BS_1_V1',      N'K07',    6), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    (N'GPHN_BS_1_V1',      N'K142',   7), -- Trung Tâm Đột Quỵ
    (N'GPHN_BS_1_V1',      N'DUMD',   8), -- Khoa Dị ứng - Miễn dịch lâm sàng
    (N'GPHN_BS_1_V1',      N'K10',    9), -- Khoa Nội Huyết Học Lâm Sàng
    (N'GPHN_BS_1_V1',      N'K03',    10), -- Khoa Nội A – Lão khoa
    (N'GPHN_BS_1_V2',      N'K22',    0), -- Khoa Ngoại Tiêu Hóa
    (N'GPHN_BS_1_V2',      N'K23',    1), -- Khoa Ngoại Thận - Tiết Niệu
    (N'GPHN_BS_1_V2',      N'K192',   2), -- Khoa Ngoại Tổng Hợp 2
    (N'GPHN_BS_1_V2',      N'K21',    3), -- Khoa Phẫu Thuật TM Lồng Ngực
    (N'GPHN_BS_1_V2',      N'K24',    4), -- Khoa Chấn Thương - Chỉnh Hình
    (N'GPHN_BS_1_V2',      N'K20',    5), -- Khoa Phẫu Thuật Thần Kinh Cột Sống
    (N'GPHN_BS_1_V2',      N'K19',    6), -- Khoa Ngoại Tổng Hợp
    (N'GPHN_BS_1_V2',      N'PTTM',   7), -- Phẫu Thuật Tạo Hình Thẩm Mỹ
    (N'GPHN_BS_1_V2',      N'K25',    8), -- Khoa Bỏng
    (N'GPHN_BS_1_V3',      N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_BS_1_V3',      N'K481',   1), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_BS_1_V3',      N'K49',    2), -- Khoa Chống Độc
    (N'GPHN_BS_1_V3',      N'K482',   3), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_BS_1_V4',      N'K27',    0), -- Khoa Phụ Sản
    (N'GPHN_BS_1_V5',      N'K18',    0), -- Khoa Nhi - Sơ sinh
    (N'GPHN_BS_1_V6',      N'K30',    0), -- Khoa Mắt
    (N'GPHN_BS_1_V6',      N'K28',    1), -- Khoa Tai Mũi Họng
    (N'GPHN_BS_1_V6',      N'K29',    2), -- Khoa Răng Hàm Mặt
    (N'GPHN_BS_1_V6',      N'K13',    3), -- Khoa Da Liễu
    (N'GPHN_BS_1_V6',      N'K16',    4), -- Khoa Y Học Cổ Truyền
    (N'GPHN_BS_1_V6',      N'K31',    5), -- Khoa Phục Hồi Chức Năng
    (N'GPHN_DTH_1_V1',     N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_DTH_1_V1',     N'K49',    1), -- Khoa Chống Độc
    (N'GPHN_DTH_1_V1',     N'K481',   2), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_DTH_1_V1',     N'K482',   3), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_DTH_1_V2',     N'K10',    0), -- Khoa Nội Huyết Học Lâm Sàng
    (N'GPHN_DTH_1_V2',     N'K05',    1), -- Khoa Nội Tiêu Hóa
    (N'GPHN_DTH_1_V2',     N'DUMD',   2), -- Khoa Dị ứng - Miễn dịch lâm sàng
    (N'GPHN_DTH_1_V2',     N'K06',    3), -- Khoa Nội Cơ Xương Khớp
    (N'GPHN_DTH_1_V2',     N'K08',    4), -- Khoa Nội Tiết - ĐTĐ
    (N'GPHN_DTH_1_V2',     N'K142',   5), -- Trung Tâm Đột Quỵ
    (N'GPHN_DTH_1_V2',     N'K041',   6), -- Khoa Nội Tim Mạch 1
    (N'GPHN_DTH_1_V2',     N'K03',    7), -- Khoa Nội A – Lão khoa
    (N'GPHN_DTH_1_V2',     N'K07',    8), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    (N'GPHN_DTH_1_V2',     N'K141',   9), -- Khoa Thần Kinh
    (N'GPHN_DTH_1_V2',     N'K50',    10), -- Khoa Nội Dị Ứng - Hô Hấp
    (N'GPHN_DTH_1_V2',     N'K11',    11), -- Khoa Nhiễm Khuẩn Tổng Hợp
    (N'GPHN_DTH_1_V3',     N'K192',   0), -- Khoa Ngoại Tổng Hợp 2
    (N'GPHN_DTH_1_V3',     N'K23',    1), -- Khoa Ngoại Thận - Tiết Niệu
    (N'GPHN_DTH_1_V3',     N'K21',    2), -- Khoa Phẫu Thuật TM Lồng Ngực
    (N'GPHN_DTH_1_V3',     N'K25',    3), -- Khoa Bỏng
    (N'GPHN_DTH_1_V3',     N'K20',    4), -- Khoa Phẫu Thuật Thần Kinh Cột Sống
    (N'GPHN_DTH_1_V3',     N'K19',    5), -- Khoa Ngoại Tổng Hợp
    (N'GPHN_DTH_1_V3',     N'PTTM',   6), -- Phẫu Thuật Tạo Hình Thẩm Mỹ
    (N'GPHN_DTH_1_V3',     N'K22',    7), -- Khoa Ngoại Tiêu Hóa
    (N'GPHN_DTH_1_V3',     N'K24',    8), -- Khoa Chấn Thương - Chỉnh Hình
    (N'GPHN_DTH_1_V4',     N'K18',    0), -- Khoa Nhi - Sơ sinh
    (N'GPHN_DTH_1_V5',     N'K27',    0), -- Khoa Phụ Sản
    (N'GPHN_KTVXN_1_V1',   N'K36',    0), -- Khoa Huyết Học
    (N'GPHN_KTVXN_1_V2',   N'K37',    0), -- Khoa Hóa Sinh
    (N'GPHN_KTVXN_1_V3',   N'K38',    0), -- Khoa Vi Sinh
    (N'GPHN_KTVXN_1_V4',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_KTVXN_1_V4',   N'K481',   1), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_KTVXN_2_V1',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_KTVXQ_1_V1',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_KTVXQ_1_V2',   N'K39',    0), -- Khoa X-Quang
    (N'GPHN_KTVXQ_2_V1',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_DD_1_V1',      N'DIDU',   0); -- Khoa Dinh Dưỡng

-- Bỏ cả chương trình nếu đã có vòng (đã nhập / sửa tay) hoặc mã vòng đã được dùng
DELETE r FROM @rounds r
WHERE NOT EXISTS (SELECT 1 FROM training_programs p WHERE p.code = r.program_code)
   OR r.program_code IN (
        SELECT p.code FROM training_programs p
        JOIN lesson_programs lp ON lp.program_id = p.id
        JOIN program_lessons pl ON pl.id = lp.lesson_id AND pl.lesson_kind = 'rotation'
        UNION
        SELECT r2.program_code FROM @rounds r2 JOIN program_lessons pl ON pl.code = r2.code);

UPDATE @rounds SET id = 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18);

INSERT INTO program_lessons (id, code, title, is_active, theory_hours, practice_hours, credits,
                             lesson_kind, duration_value, duration_unit, allow_split, created_by)
SELECT id, code, title, 1, 0, 0, 0, 'rotation', duration_value, duration_unit, allow_split, 'SYSTEM'
FROM @rounds;

INSERT INTO lesson_programs (id, lesson_id, program_id, display_order, created_by)
SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), r.id, p.id, r.ord, 'SYSTEM'
FROM @rounds r JOIN training_programs p ON p.code = r.program_code;

INSERT INTO lesson_departments (lesson_id, department_id, display_order)
SELECT r.id, d.id, rd.ord
FROM @round_depts rd
JOIN @rounds r ON r.code = rd.code
JOIN departments d ON d.code = rd.dept;

COMMIT;
GO

-- @migration 2026-11-15_course_batches.sql
/* ============================================================================
 * Khóa tuyển sinh theo đợt (ĐTLT / CTCV) — đủ sĩ số thì thành một đợt
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-nang-cap-dao-tao.md, giai đoạn 2.
 *
 *   courses.auto_batch = 1  : KHÓA TUYỂN SINH — nhận đăng ký liên tục, không có
 *                             lịch học; học viên đã duyệt nằm ở "danh sách chờ"
 *                             (course_enrollments.status = 'waitlisted') tới khi
 *                             đủ sĩ số tối thiểu của chương trình thì được chuyển
 *                             sang một ĐỢT. Không dùng is_rolling — cờ đó mang
 *                             nghĩa khóa thực hành GPHN (tự xếp vòng khoa).
 *   courses.parent_course_id : ĐỢT (khóa học bình thường, 1 chương trình) trỏ về
 *                             khóa tuyển sinh. Không cascade — xoá khóa tuyển sinh
 *                             còn đợt thì service chặn.
 *
 *   Sĩ số tối thiểu / tối đa mỗi đợt lấy theo chương trình
 *   (training_programs.min_capacity / max_capacity — đã có).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.courses', N'auto_batch') IS NULL
    ALTER TABLE [dbo].[courses] ADD [auto_batch] BIT NOT NULL
        CONSTRAINT DF_courses_auto_batch DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.courses', N'parent_course_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [parent_course_id] VARCHAR(20) NULL
        CONSTRAINT FK_courses_parent REFERENCES [dbo].[courses] ([id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_parent' AND object_id = OBJECT_ID(N'dbo.courses'))
    CREATE NONCLUSTERED INDEX [IX_courses_parent] ON [dbo].[courses] ([parent_course_id]) WHERE [parent_course_id] IS NOT NULL;
GO

PRINT N'✅ Migration 2026-11-15_course_batches hoàn tất.';
GO

-- @migration 2026-11-20_lecturer_assignment_roles.sql
/* ============================================================================
 * 2026-11-20_lecturer_assignment_roles
 * ----------------------------------------------------------------------------
 *   Giai đoạn 5 (docs/ke-hoach-nang-cap-dao-tao.md) — giảng viên theo bài học.
 *   lecturer_assignments.subject_id trỏ program_lessons (giữ tên cột cũ).
 * 1) role ('main' = GV chính | 'assistant' = GV phụ), mặc định 'main'.
 * 2) hours: số tiết GV đảm nhận trong bài (NULL = chưa ghi).
 * 3) Mỗi bài của khóa tối đa 1 GV chính: dữ liệu cũ có nhiều GV cùng 1 bài thì
 *    người phân công sớm nhất giữ 'main', còn lại chuyển 'assistant'.
 * 4) UNIQUE (course_id, subject_id, lecturer_id). Dữ liệu cũ trùng thì bỏ qua
 *    (PRINT cảnh báo) — xoá tay bản trùng rồi chạy migration sau.
 *    subject_id NULL = phân công cả khóa; SQL Server coi các NULL là bằng nhau
 *    nên mỗi GV chỉ có 1 dòng "cả khóa".
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
IF COL_LENGTH(N'dbo.lecturer_assignments', N'role') IS NULL
    ALTER TABLE [dbo].[lecturer_assignments]
        ADD [role] VARCHAR(10) NOT NULL CONSTRAINT DF_lecass_role DEFAULT ('main');
GO
IF COL_LENGTH(N'dbo.lecturer_assignments', N'hours') IS NULL
    ALTER TABLE [dbo].[lecturer_assignments] ADD [hours] INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_lecass_role')
    ALTER TABLE [dbo].[lecturer_assignments]
        ADD CONSTRAINT CHK_lecass_role CHECK ([role] IN ('main', 'assistant'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_lecass_hours')
    ALTER TABLE [dbo].[lecturer_assignments]
        ADD CONSTRAINT CHK_lecass_hours CHECK ([hours] IS NULL OR [hours] >= 0);
GO
-- 3) Mỗi bài 1 GV chính
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_lecass_main' AND object_id = OBJECT_ID(N'dbo.lecturer_assignments'))
BEGIN
    ;WITH ranked AS (
        SELECT [role], ROW_NUMBER() OVER (PARTITION BY course_id, subject_id ORDER BY created_at, id) AS rn
        FROM [dbo].[lecturer_assignments]
        WHERE subject_id IS NOT NULL AND [role] = 'main'
    )
    UPDATE ranked SET [role] = 'assistant' WHERE rn > 1;

    CREATE UNIQUE NONCLUSTERED INDEX [UQ_lecass_main] ON [dbo].[lecturer_assignments] ([course_id], [subject_id])
        WHERE [role] = 'main' AND [subject_id] IS NOT NULL;
END
GO
-- 4) Không phân công trùng 1 GV vào cùng 1 bài của khóa
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_lecass_course_subject_lecturer' AND object_id = OBJECT_ID(N'dbo.lecturer_assignments'))
BEGIN
    IF EXISTS (SELECT 1 FROM [dbo].[lecturer_assignments] GROUP BY course_id, subject_id, lecturer_id HAVING COUNT(*) > 1)
        PRINT N'⚠️  lecturer_assignments có phân công trùng (khóa, bài, GV) — chưa tạo UQ_lecass_course_subject_lecturer.';
    ELSE
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_lecass_course_subject_lecturer]
            ON [dbo].[lecturer_assignments] ([course_id], [subject_id], [lecturer_id]);
END
GO

-- @migration 2026-11-21_hospital_trainings.sql
/* ============================================================================
 * Tập huấn bệnh viện (THBV) — dựng trên module Hội thảo
 * ----------------------------------------------------------------------------
 * Buổi tập huấn = seminars có event_type = 'training' AND scope = 'hosted'
 * (menu riêng /admin/hospital-trainings). Thêm:
 *   hospital_training_topics          : danh mục chủ đề tập huấn (tab trong
 *                                       Danh mục đào tạo, crudService chung)
 *   seminars.organizer_department_id  : khoa/phòng tổ chức
 *   seminars.topic_id                 : chủ đề
 *   seminars.lesson_hours             : số tiết — 1 tiết = 1 giờ tín chỉ CME
 *                                       (Phụ lục I TT 32/2023/TT-BYT), ghi đè
 *                                       cme_default_credits khi lưu
 *   seminar_required_departments      : khoa bắt buộc tham dự (báo cáo "ai chưa dự")
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.hospital_training_topics', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[hospital_training_topics] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(500)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_hospital_training_topics_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME       NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

MERGE [dbo].[hospital_training_topics] AS t
USING (VALUES
    ('HTT_KSNK', N'Kiểm soát nhiễm khuẩn'),
    ('HTT_PCCC', N'Phòng cháy chữa cháy'),
    ('HTT_ATNB', N'An toàn người bệnh'),
    ('HTT_KHAC', N'Khác')
) AS s (id, name) ON t.id = s.id
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);
GO

IF COL_LENGTH(N'dbo.seminars', N'organizer_department_id') IS NULL
    ALTER TABLE [dbo].[seminars] ADD
        [organizer_department_id] VARCHAR(20) NULL
            CONSTRAINT FK_seminars_organizer_department FOREIGN KEY REFERENCES [dbo].[departments] (id),
        [topic_id] VARCHAR(20) NULL
            CONSTRAINT FK_seminars_topic FOREIGN KEY REFERENCES [dbo].[hospital_training_topics] (id),
        [lesson_hours] DECIMAL(4, 1) NULL;
GO

IF OBJECT_ID(N'dbo.seminar_required_departments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[seminar_required_departments] (
        [seminar_id]    VARCHAR(20) NOT NULL
            CONSTRAINT FK_seminar_required_departments_seminar FOREIGN KEY REFERENCES [dbo].[seminars] (id) ON DELETE CASCADE,
        [department_id] VARCHAR(20) NOT NULL
            CONSTRAINT FK_seminar_required_departments_department FOREIGN KEY REFERENCES [dbo].[departments] (id),
        CONSTRAINT PK_seminar_required_departments PRIMARY KEY ([seminar_id], [department_id])
    );
END
GO

PRINT N'✅ Migration 2026-11-21_hospital_trainings hoàn tất.';
GO

-- @migration 2026-11-22_grading_theory_practice.sql
/* ============================================================================
 * 2026-11-22_grading_theory_practice
 * ----------------------------------------------------------------------------
 *   Giai đoạn 4 (docs/ke-hoach-nang-cap-dao-tao.md) — chấm điểm 2 phần Lý thuyết
 *   + Thực hành theo Phụ lục III TT 32/2023/TT-BYT, bỏ TX/GK/CK.
 * 1) grades: theory_score / practice_score (thang 10, 1 chữ số thập phân),
 *    theory_flag / practice_flag ('absent' = vắng thi | 'exempt' = miễn thi),
 *    theory_attempt / practice_attempt (lần thi, 1 = lần đầu), locked_at / locked_by.
 *    Cột regular/midterm/final_score giữ để đọc dữ liệu cũ.
 * 2) grade_history: lịch sử từng lần ghi điểm (thi lại, sửa sau khi mở khóa).
 * 3) exam_papers.exam_part ('theory' | 'practice'), blind_grading (ẩn tên khi chấm).
 * 4) exam_paper_graders: người chấm của đề (GV). Đề chưa có dòng nào thì người
 *    chấm mặc định = GV được phân công bài học của đề.
 * 5) class_sessions.session_kind ('theory' | 'practice', NULL = suy ra từ loại bài
 *    học: vòng thực hành = practice, còn lại = theory) — để tính chuyên cần LT/TH.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

-- 1) grades
IF COL_LENGTH(N'dbo.grades', N'theory_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD
        [theory_score]     DECIMAL(4, 1) NULL,
        [practice_score]   DECIMAL(4, 1) NULL,
        [theory_flag]      VARCHAR(10)   NULL,
        [practice_flag]    VARCHAR(10)   NULL,
        [theory_attempt]   INT           NOT NULL CONSTRAINT DF_grades_theory_attempt DEFAULT (1),
        [practice_attempt] INT           NOT NULL CONSTRAINT DF_grades_practice_attempt DEFAULT (1),
        [locked_at]        DATETIME      NULL,
        [locked_by]        VARCHAR(20)   NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_grades_part_scores')
    ALTER TABLE [dbo].[grades] ADD CONSTRAINT CHK_grades_part_scores CHECK (
        ([theory_score] IS NULL OR [theory_score] BETWEEN 0 AND 10)
        AND ([practice_score] IS NULL OR [practice_score] BETWEEN 0 AND 10));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_grades_part_flags')
    ALTER TABLE [dbo].[grades] ADD CONSTRAINT CHK_grades_part_flags CHECK (
        ([theory_flag] IS NULL OR [theory_flag] IN ('absent', 'exempt'))
        AND ([practice_flag] IS NULL OR [practice_flag] IN ('absent', 'exempt')));
GO
-- Mỗi lượt ghi danh 1 dòng điểm tổng khóa (subject_id NULL). Dữ liệu cũ trùng thì bỏ qua.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_grades_enrollment_course' AND object_id = OBJECT_ID(N'dbo.grades'))
BEGIN
    IF EXISTS (SELECT 1 FROM [dbo].[grades] WHERE subject_id IS NULL GROUP BY enrollment_id HAVING COUNT(*) > 1)
        PRINT N'⚠️  grades có nhiều dòng điểm tổng khóa cho 1 lượt ghi danh — chưa tạo UQ_grades_enrollment_course.';
    ELSE
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_grades_enrollment_course] ON [dbo].[grades] ([enrollment_id])
            WHERE [subject_id] IS NULL;
END
GO

-- 2) Lịch sử điểm
IF OBJECT_ID(N'dbo.grade_history', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[grade_history] (
        [id]            BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        [enrollment_id] VARCHAR(20)    NOT NULL,
        [part]          VARCHAR(10)    NOT NULL, -- 'theory' | 'practice'
        [attempt_no]    INT            NOT NULL,
        [score]         DECIMAL(4, 1)  NULL,
        [flag]          VARCHAR(10)    NULL,
        [source]        VARCHAR(20)    NOT NULL, -- 'manual' | 'exam' | 'import' | 'retake'
        [note]          NVARCHAR(255)  NULL,
        [changed_at]    DATETIME       NOT NULL CONSTRAINT DF_grade_history_changed_at DEFAULT (GETDATE()),
        [changed_by]    VARCHAR(20)    NULL,
        CONSTRAINT FK_grade_history_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT CHK_grade_history_part CHECK ([part] IN ('theory', 'practice'))
    );
    CREATE NONCLUSTERED INDEX [IX_grade_history_enrollment] ON [dbo].[grade_history] ([enrollment_id], [changed_at]);
END
GO

-- 3) Đề thi thuộc phần nào
IF COL_LENGTH(N'dbo.exam_papers', N'exam_part') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD
        [exam_part] VARCHAR(10) NOT NULL CONSTRAINT DF_exam_papers_exam_part DEFAULT ('theory'),
        [blind_grading] BIT NOT NULL CONSTRAINT DF_exam_papers_blind_grading DEFAULT (0);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_exam_papers_part')
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT CHK_exam_papers_part CHECK ([exam_part] IN ('theory', 'practice'));
GO

-- 4) Người chấm của đề
IF OBJECT_ID(N'dbo.exam_paper_graders', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_paper_graders] (
        [paper_id]    VARCHAR(20) NOT NULL,
        [lecturer_id] VARCHAR(20) NOT NULL,
        [created_at]  DATETIME    NOT NULL CONSTRAINT DF_exam_paper_graders_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20) NULL,
        CONSTRAINT PK_exam_paper_graders PRIMARY KEY ([paper_id], [lecturer_id]),
        CONSTRAINT FK_exam_paper_graders_paper FOREIGN KEY ([paper_id]) REFERENCES [dbo].[exam_papers] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_exam_paper_graders_lecturer FOREIGN KEY ([lecturer_id]) REFERENCES [dbo].[lecturers] ([id])
    );
END
GO

-- 5) Buổi lý thuyết / thực hành
IF COL_LENGTH(N'dbo.class_sessions', N'session_kind') IS NULL
    ALTER TABLE [dbo].[class_sessions] ADD [session_kind] VARCHAR(10) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_class_sessions_kind')
    ALTER TABLE [dbo].[class_sessions] ADD CONSTRAINT CHK_class_sessions_kind
        CHECK ([session_kind] IS NULL OR [session_kind] IN ('theory', 'practice'));
GO

PRINT N'✅ Migration 2026-11-22_grading_theory_practice hoàn tất.';
GO

-- @migration 2026-11-23_attendance_created_by.sql
/* ============================================================================
 * 2026-11-23_attendance_created_by
 * ----------------------------------------------------------------------------
 *   courseAttendanceService.setAttendance ghi attendance.created_by nhưng bảng
 *   chưa có cột này (2026-09-11_training_operations tạo bảng không có) ⇒ điểm
 *   danh tay buổi học lỗi "Invalid column name 'created_by'". Thêm cột.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
IF COL_LENGTH(N'dbo.attendance', N'created_by') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [created_by] VARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.attendance', N'created_at') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [created_at] DATETIME NOT NULL
        CONSTRAINT DF_attendance_created_at DEFAULT (GETDATE());
GO
PRINT N'✅ Migration 2026-11-23_attendance_created_by hoàn tất.';
GO

-- @migration 2026-11-24_trainee_document_types.sql
/* ============================================================================
 * 2026-11-24_trainee_document_types
 * ----------------------------------------------------------------------------
 *   Giai đoạn 3 (docs/ke-hoach-nang-cap-dao-tao.md) — hồ sơ học viên đầy đủ.
 * 1) trainee_document_types: danh mục loại giấy tờ (tab trong Danh mục đào tạo).
 *    required_for_types = các loại khóa (training_types.id, cách nhau dấu phẩy)
 *    bắt buộc nộp loại giấy này — dựng checklist "đã nộp / thiếu".
 *    Mã cũ national_id / degree / other GIỮ NGUYÊN làm id (trainee_documents.doc_type
 *    và form đăng ký công khai đang dùng) — không phải đổi dữ liệu cũ.
 *    Bộ "bắt buộc" seed dưới đây là gợi ý ban đầu, phòng Đào tạo sửa ở danh mục.
 * 2) trainee_documents: status ('approved' | 'pending' | 'rejected') — học viên tự
 *    nộp ở cổng /me thì 'pending' chờ cán bộ duyệt; cán bộ tải lên là 'approved'.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.trainee_document_types', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainee_document_types] (
        [id]                 VARCHAR(30)    NOT NULL PRIMARY KEY,
        [name]               NVARCHAR(255)  NOT NULL,
        [description]        NVARCHAR(MAX)  NULL,
        [required_for_types] VARCHAR(500)   NULL,
        [display_order]      INT            NOT NULL CONSTRAINT DF_trainee_document_types_order DEFAULT (0),
        [created_at]         DATETIME       NOT NULL CONSTRAINT DF_trainee_document_types_created_at DEFAULT (GETDATE()),
        [created_by]         VARCHAR(20)    NULL,
        [updated_at]         DATETIME       NULL,
        [updated_by]         VARCHAR(20)    NULL
    );
END
GO

MERGE [dbo].[trainee_document_types] AS t
USING (VALUES
    ('national_id',  N'CCCD / CMND',                 'TRNTP-GPHN,TRNTP-DTLT,TRNTP-CTCV', 1),
    ('photo',        N'Ảnh thẻ',                      'TRNTP-GPHN,TRNTP-DTLT',            2),
    ('degree',       N'Bằng tốt nghiệp',              'TRNTP-GPHN,TRNTP-DTLT,TRNTP-CTCV', 3),
    ('transcript',   N'Bảng điểm',                    'TRNTP-GPHN',                       4),
    ('license',      N'Chứng chỉ hành nghề',          NULL,                               5),
    ('health_check', N'Giấy khám sức khỏe',           'TRNTP-GPHN',                       6),
    ('application',  N'Đơn đề nghị',                  'TRNTP-GPHN',                       7),
    ('contract',     N'Hợp đồng',                     NULL,                               8),
    ('decision',     N'Quyết định cử đi học',         'TRNTP-DTLT',                       9),
    ('evaluation',   N'Phiếu nhận xét',               NULL,                               10),
    ('other',        N'Khác',                         NULL,                               99)
) AS s (id, name, required_for_types, display_order) ON t.id = s.id
WHEN NOT MATCHED THEN INSERT (id, name, required_for_types, display_order)
    VALUES (s.id, s.name, s.required_for_types, s.display_order);
GO

-- Loại lạ trong dữ liệu cũ (nếu có) ⇒ thêm vào danh mục để không mất nhãn
INSERT INTO [dbo].[trainee_document_types] (id, name, display_order)
SELECT DISTINCT d.doc_type, d.doc_type, 98
FROM [dbo].[trainee_documents] d
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[trainee_document_types] t WHERE t.id = d.doc_type);
GO

IF COL_LENGTH(N'dbo.trainee_documents', N'status') IS NULL
    ALTER TABLE [dbo].[trainee_documents] ADD
        [status]      VARCHAR(10)   NOT NULL CONSTRAINT DF_trainee_documents_status DEFAULT ('approved'),
        [reviewed_at] DATETIME      NULL,
        [reviewed_by] VARCHAR(20)   NULL,
        [review_note] NVARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_trainee_documents_status')
    ALTER TABLE [dbo].[trainee_documents] ADD CONSTRAINT CHK_trainee_documents_status
        CHECK ([status] IN ('approved', 'pending', 'rejected'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trndoc_type')
    ALTER TABLE [dbo].[trainee_documents] WITH CHECK ADD CONSTRAINT FK_trndoc_type
        FOREIGN KEY ([doc_type]) REFERENCES [dbo].[trainee_document_types] ([id]);
GO

PRINT N'✅ Migration 2026-11-24_trainee_document_types hoàn tất.';
GO

-- @migration 2026-11-25_dtlt_27_lessons.sql
/* ============================================================================
 * Bài học cho chương trình ĐTLT_27 "Kỹ thuật cấp cứu cơ bản - Bác sĩ" — bị sót ở
 * 2026-11-12_dtlt_programs_lessons (nguồn: "Các bài học của lớp Kỹ thuật Cấp cứu cơ
 * bản - Bác sĩ.xlsx", thư mục "Bài học ĐTLT"). 26 bài, tổng 110 LT + 454 TH — khớp số
 * tiết chương trình. Khai giảng đưa lên đầu như các chương trình khác.
 * Lưu ý: file nguồn có Bài 4 và Bài 5 trùng tên "Chẩn đoán và xử trí ngộ độc thuốc tê"
 * — giữ nguyên theo file, phòng Đào tạo sửa tay nếu cần.
 *
 * Idempotent — chỉ thêm khi chương trình chưa có bài học nào.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
GO

-- ĐTLT_27: 26 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_27');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_27_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_27_02', N'Bài 1: Phân loại bệnh nhân cấp cứu theo mức độ ưu tiên', 4, 20),
        (2, N'ĐTLT_27_03', N'Bài 2: Hồi sinh tim phổi cơ bản', 4, 20),
        (3, N'ĐTLT_27_04', N'Bài 3: Cấp cứu phản vệ', 4, 20),
        (4, N'ĐTLT_27_05', N'Bài 4: Chẩn đoán và xử trí ngộ độc thuốc tê', 4, 20),
        (5, N'ĐTLT_27_06', N'Bài 5: Chẩn đoán và xử trí ngộ độc thuốc tê', 4, 20),
        (6, N'ĐTLT_27_07', N'Bài 6: Định hướng chẩn đoán và xử trí đau bụng cấp ở người lớn', 4, 20),
        (7, N'ĐTLT_27_08', N'Bài 7: Chẩn đoán và xử trí bệnh nhân xuất huyết tiêu hóa cao', 4, 20),
        (8, N'ĐTLT_27_09', N'Bài 8: Định hướng chẩn đoán và xử trí trước tình trạng ngất', 4, 20),
        (9, N'ĐTLT_27_10', N'Bài 9: Định hướng chẩn đoán và xử trí người bệnh hôn mê', 4, 20),
        (10, N'ĐTLT_27_11', N'Bài 10: Định hướng chẩn đoán và xử trí cấp cứu trước một trường hợp ngộ độc', 4, 20),
        (11, N'ĐTLT_27_12', N'Bài 11: Định hướng chẩn đoán và xử trí trước tình trạng đau đầu cấp', 4, 20),
        (12, N'ĐTLT_27_13', N'Bài 12: Chẩn đoán và xử trí cơn hen phế quản nặng', 4, 20),
        (13, N'ĐTLT_27_14', N'Bài 13: Chẩn đoán và xử trí đợt cấp bệnh phổi tắc nghẽn mãn tính', 4, 20),
        (14, N'ĐTLT_27_15', N'Bài 14: Định hướng chẩn đoán và xử trí khó thở cấp ở người lớn', 4, 20),
        (15, N'ĐTLT_27_16', N'Bài 15: Đánh giá và xử trí ban đầu một bệnh nhân đa chấn thương', 8, 20),
        (16, N'ĐTLT_27_17', N'Bài 16: Tiếp cận và xử trí ban đầu một bệnh nhân sốc', 4, 20),
        (17, N'ĐTLT_27_18', N'Bài 17: Sốc điện cấp cứu', 4, 20),
        (18, N'ĐTLT_27_19', N'Bài 18: Phân tích kết quả khí máu động mạch', 8, 24),
        (19, N'ĐTLT_27_20', N'Bài 19: Cài đặt ban đầu các thông số máy thở', 8, 20),
        (20, N'ĐTLT_27_21', N'Bài 20: Quy trình kỹ thuật đặt nội khí quản cấp cứu', 4, 20),
        (21, N'ĐTLT_27_22', N'Bài 21: Quy trình kỹ thuật đặt catheter tĩnh mạch trung tâm nhiều nòng dưới hướng dẫn siêu âm', 4, 20),
        (22, N'ĐTLT_27_23', N'Bài 22: Quy trình kỹ thuật đặt catheter tĩnh mạch trung tâm nhiều nòng', 4, 20),
        (23, N'ĐTLT_27_24', N'Kiểm tra giữa khóa học', 2, 2),
        (24, N'ĐTLT_27_25', N'Thi kết thúc khóa học', 4, 8),
        (25, N'ĐTLT_27_26', N'Tổng kết khóa học và nhận chứng chỉ', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO

PRINT N'✅ Migration 2026-11-25_dtlt_27_lessons hoàn tất.';
GO

-- @migration 2026-11-26_course_classes.sql
/* ============================================================================
 * Lớp = chương trình trong khóa (ĐTLT / CTCV) — bỏ khóa tuyển sinh + đợt con
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-nang-cap-dao-tao.md, mục "Điều chỉnh 2026-10-22".
 *
 *   course_programs.opened_at/opened_by : cán bộ bấm "Mở lớp" (lớp đủ sĩ số tối
 *       thiểu thì hệ thống chỉ báo, không tự mở). Lớp chưa mở ⇒ chưa xếp lịch.
 *   Bỏ courses.auto_batch / parent_course_id (2026-11-15_course_batches): đợt con
 *       thành khóa thường; người chờ ở khóa tuyển sinh giữ 'waitlisted' = nằm trong
 *       danh sách chờ của chương trình, khóa mới có chương trình đó tự kéo về.
 *   courses.capacity giữ cột cho dữ liệu cũ, không dùng nữa.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.course_programs', N'opened_at') IS NULL
BEGIN
    ALTER TABLE [dbo].[course_programs] ADD [opened_at] DATETIME NULL, [opened_by] VARCHAR(20) NULL;
    -- Lớp đang chạy theo luật cũ (đủ tối thiểu là mở, hoặc đã có buổi học) ⇒ coi như đã mở.
    EXEC(N'
    UPDATE cp SET opened_at = GETDATE()
    FROM course_programs cp
    JOIN courses c ON c.id = cp.course_id
    JOIN training_programs tp ON tp.id = cp.program_id
    WHERE c.training_type_id IN (''TRNTP-DTLT'', ''TRNTP-CTCV'') AND c.is_rolling = 0
      AND ((SELECT COUNT(*) FROM course_enrollments e
            WHERE e.course_id = c.id AND e.program_id = cp.program_id AND e.status = ''approved'') >= ISNULL(tp.min_capacity, 1)
           OR EXISTS (SELECT 1 FROM class_sessions s WHERE s.course_id = c.id));');
END
GO

IF COL_LENGTH(N'dbo.courses', N'parent_course_id') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.FK_courses_parent', N'F') IS NOT NULL
        ALTER TABLE [dbo].[courses] DROP CONSTRAINT [FK_courses_parent];
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_parent' AND object_id = OBJECT_ID(N'dbo.courses'))
        DROP INDEX [IX_courses_parent] ON [dbo].[courses];
    ALTER TABLE [dbo].[courses] DROP COLUMN [parent_course_id];
END
GO

IF COL_LENGTH(N'dbo.courses', N'auto_batch') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.DF_courses_auto_batch', N'D') IS NOT NULL
        ALTER TABLE [dbo].[courses] DROP CONSTRAINT [DF_courses_auto_batch];
    ALTER TABLE [dbo].[courses] DROP COLUMN [auto_batch];
END
GO

PRINT N'✅ Migration 2026-11-26_course_classes hoàn tất.';
GO

-- @migration 2026-11-27_exam_bank_programs.sql
/* ============================================================================
 * Ngân hàng câu hỏi theo chương trình + sinh đề ngẫu nhiên + kiểm tra đầu vào
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-nang-cap-dao-tao.md, mục "Điều chỉnh 2026-10-22".
 *
 * question_bank.program_id / pool : mỗi chương trình 1 ngân hàng riêng, chia 2 kho
 *     'entrance' (kiểm tra đầu vào) / 'final' (thi cuối khóa). Câu cũ gắn bài học
 *     (subject_id) được CHÉP sang mọi chương trình chứa bài đó (mỗi chương trình 1 bản);
 *     câu chưa gắn bài để program_id NULL (giao diện cho chuyển vào chương trình).
 * exam_papers.purpose / program_id : đề đầu vào (chỉ tham khảo) hay cuối khóa; đề của
 *     lớp nào (chương trình trong khóa).
 * exam_papers.gen_mc_count / gen_essay_count / code_mode / code_count : bốc ngẫu nhiên
 *     N câu từ ngân hàng; code_mode 'per_trainee' (mỗi HV 1 đề) | 'shuffled' (chung đề,
 *     trộn thứ tự) | 'codes' (vài mã đề). NULL = chọn câu tay như trước.
 * exam_papers.weight : trọng số của đề trong điểm lý thuyết (TN × a% + TL × b%).
 * exam_paper_questions.code_no : câu thuộc mã đề nào (đề 'codes').
 * exam_attempts.question_ids / code_no / attempt_no / score10 : bộ câu riêng của lượt
 *     làm bài (theo thứ tự), mã đề được chia, lần thi (thi lại = lượt mới, đề mới) và
 *     điểm quy về thang 10.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.question_bank', N'program_id') IS NULL
    ALTER TABLE [dbo].[question_bank] ADD
        [program_id] VARCHAR(20) NULL CONSTRAINT FK_qbank_program REFERENCES [dbo].[training_programs] ([id]),
        [pool]       VARCHAR(10) NOT NULL CONSTRAINT DF_qbank_pool DEFAULT ('final');
GO
IF OBJECT_ID(N'dbo.CHK_qbank_pool', N'C') IS NULL
    ALTER TABLE [dbo].[question_bank] ADD CONSTRAINT CHK_qbank_pool CHECK ([pool] IN ('entrance', 'final'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_question_bank_program' AND object_id = OBJECT_ID(N'dbo.question_bank'))
    CREATE NONCLUSTERED INDEX [IX_question_bank_program] ON [dbo].[question_bank] ([program_id], [pool]);
GO
-- Câu gắn bài học: bản gốc lấy chương trình đầu tiên chứa bài, các chương trình còn lại nhận
-- bản chép. Chỉ chạy 1 lần (khi chưa câu nào có chương trình).
IF NOT EXISTS (SELECT 1 FROM question_bank WHERE program_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM question_bank WHERE subject_id IS NOT NULL)
BEGIN
    SELECT q.id AS question_id, l.program_id,
           ROW_NUMBER() OVER (PARTITION BY q.id ORDER BY l.display_order, l.program_id) AS rn
    INTO #qp
    FROM question_bank q JOIN lesson_programs l ON l.lesson_id = q.subject_id;

    UPDATE q SET program_id = x.program_id
    FROM question_bank q JOIN #qp x ON x.question_id = q.id AND x.rn = 1;

    INSERT INTO question_bank (id, subject_id, question_type, question_text, options, correct_option, points,
                               image_url, program_id, pool, created_at, created_by)
    SELECT 'QB' + LEFT(REPLACE(NEWID(), '-', ''), 18), q.subject_id, q.question_type, q.question_text,
           q.options, q.correct_option, q.points, q.image_url, x.program_id, 'final', GETDATE(), q.created_by
    FROM question_bank q JOIN #qp x ON x.question_id = q.id AND x.rn > 1;
    DROP TABLE #qp;
END
GO

IF COL_LENGTH(N'dbo.exam_papers', N'purpose') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD
        [purpose]         VARCHAR(10)  NOT NULL CONSTRAINT DF_exam_papers_purpose DEFAULT ('final'),
        [program_id]      VARCHAR(20)  NULL CONSTRAINT FK_exam_papers_program REFERENCES [dbo].[training_programs] ([id]),
        [gen_mc_count]    INT          NULL,
        [gen_essay_count] INT          NULL,
        [code_mode]       VARCHAR(12)  NULL,
        [code_count]      INT          NULL,
        [weight]          DECIMAL(5,2) NULL;
GO
IF OBJECT_ID(N'dbo.CHK_exam_papers_purpose', N'C') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT CHK_exam_papers_purpose CHECK ([purpose] IN ('entrance', 'final'));
GO
IF OBJECT_ID(N'dbo.CHK_exam_papers_code_mode', N'C') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT CHK_exam_papers_code_mode
        CHECK ([code_mode] IS NULL OR [code_mode] IN ('per_trainee', 'shuffled', 'codes'));
GO

-- 1 câu có thể nằm ở nhiều mã đề của cùng 1 đề
IF COL_LENGTH(N'dbo.exam_paper_questions', N'code_no') IS NULL
    ALTER TABLE [dbo].[exam_paper_questions] ADD [code_no] INT NULL;
GO
IF OBJECT_ID(N'dbo.UQ_epq_paper_question', N'UQ') IS NOT NULL
    ALTER TABLE [dbo].[exam_paper_questions] DROP CONSTRAINT [UQ_epq_paper_question];
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_epq_paper_code_question' AND object_id = OBJECT_ID(N'dbo.exam_paper_questions'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_epq_paper_code_question]
        ON [dbo].[exam_paper_questions] ([paper_id], [code_no], [question_id]);
GO

-- Thi lại = lượt làm bài mới trên cùng đề
IF COL_LENGTH(N'dbo.exam_attempts', N'attempt_no') IS NULL
    ALTER TABLE [dbo].[exam_attempts] ADD
        [attempt_no]   INT           NOT NULL CONSTRAINT DF_exam_attempts_attempt_no DEFAULT (1),
        [code_no]      INT           NULL,
        [question_ids] NVARCHAR(MAX) NULL,
        [score10]      DECIMAL(4,1)  NULL;
GO
IF OBJECT_ID(N'dbo.UQ_examatt_paper_enrollment', N'UQ') IS NOT NULL
    ALTER TABLE [dbo].[exam_attempts] DROP CONSTRAINT [UQ_examatt_paper_enrollment];
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_examatt_paper_enrollment_no' AND object_id = OBJECT_ID(N'dbo.exam_attempts'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_examatt_paper_enrollment_no]
        ON [dbo].[exam_attempts] ([paper_id], [enrollment_id], [attempt_no]);
GO

PRINT N'✅ Migration 2026-11-27_exam_bank_programs hoàn tất.';
GO

-- @migration 2026-11-28_audit_updated_columns.sql
/* ============================================================================
 * 2026-11-28_audit_updated_columns
 * ----------------------------------------------------------------------------
 *   Quy ước: MỌI bảng nghiệp vụ đều có cặp cột audit cập nhật
 *     updated_at DATETIME2 NULL     — NULL = chưa sửa lần nào kể từ khi tạo
 *     updated_by VARCHAR(20) NULL   — mã người sửa gần nhất (@actor_id)
 *   Nhiều bảng tạo trước đây thiếu cặp cột này trong khi code vẫn ghi
 *   "updated_by = @actor_id" ⇒ lỗi "Invalid column name 'updated_by'"
 *   (lecturer_assignments, certificates, exam_attempts, workflow_instances,
 *   training_files, lesson_programs, council_members, external_reviewers…).
 *   Quét mọi bảng dbo và thêm cột còn thiếu (kể cả bảng phát sinh sau này nếu
 *   chạy lại tay). Bỏ qua dbo.schema_migrations — bảng của runner migration.
 * Idempotent — mỗi cột kiểm tra COL_LENGTH trước khi thêm.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
DECLARE @tbl SYSNAME, @sql NVARCHAR(MAX);
DECLARE tables CURSOR LOCAL FAST_FORWARD FOR
    SELECT t.name FROM sys.tables t
    WHERE t.is_ms_shipped = 0
      AND t.schema_id = SCHEMA_ID(N'dbo')
      AND t.name <> N'schema_migrations'
    ORDER BY t.name;
OPEN tables;
FETCH NEXT FROM tables INTO @tbl;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH(N'dbo.' + QUOTENAME(@tbl), N'updated_at') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@tbl) + N' ADD [updated_at] DATETIME2 NULL;';
        EXEC sys.sp_executesql @sql;
        PRINT N'  + ' + @tbl + N'.updated_at';
    END
    IF COL_LENGTH(N'dbo.' + QUOTENAME(@tbl), N'updated_by') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@tbl) + N' ADD [updated_by] VARCHAR(20) NULL;';
        EXEC sys.sp_executesql @sql;
        PRINT N'  + ' + @tbl + N'.updated_by';
    END
    FETCH NEXT FROM tables INTO @tbl;
END
CLOSE tables;
DEALLOCATE tables;
GO
PRINT N'✅ Migration 2026-11-28_audit_updated_columns hoàn tất.';
GO

-- @migration 2026-11-29_trainee_separate_accounts.sql
/* ============================================================================
 * 2026-11-29_trainee_separate_accounts
 * ----------------------------------------------------------------------------
 *   Tài khoản học viên CẤP RIÊNG, không gộp vào tài khoản nội viện.
 *   Trước đây ghi danh nhân viên vào khóa (courseEnrollmentService.registerStaff)
 *   gắn thẳng trainees.user_id = tài khoản nhân viên ⇒ nhân viên học bằng chính
 *   tài khoản nội viện. Nay:
 *   - trainees.user_id      : CHỈ là tài khoản học viên (vai trò Học viên, mã 'HV…')
 *                             do "Cấp tài khoản học viên" sinh ra.
 *   - trainees.staff_user_id: tài khoản nội viện mà hồ sơ học viên được tạo từ đó
 *                             (học viên là nhân viên BV) — chỉ để liên kết/chống
 *                             tạo trùng hồ sơ, KHÔNG dùng để đăng nhập học.
 * 1) Thêm cột staff_user_id (+ FK, index lọc).
 * 2) Chuyển các liên kết cũ trỏ vào tài khoản KHÔNG phải vai trò Học viên sang
 *    staff_user_id; user_id/account_granted về chưa cấp — phòng Đào tạo cấp tài
 *    khoản học viên riêng cho các hồ sơ này ở mục Học viên.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.trainees', 'staff_user_id') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [staff_user_id] VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_trainees_staff_user')
    ALTER TABLE [dbo].[trainees] WITH CHECK
        ADD CONSTRAINT [FK_trainees_staff_user] FOREIGN KEY ([staff_user_id]) REFERENCES [dbo].[users] ([id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trainees_staff_user_id' AND object_id = OBJECT_ID('dbo.trainees'))
    CREATE INDEX [IX_trainees_staff_user_id] ON [dbo].[trainees] ([staff_user_id]) WHERE [staff_user_id] IS NOT NULL;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE t
SET t.staff_user_id = ISNULL(t.staff_user_id, t.user_id),
    t.user_id = NULL,
    t.account_granted = 0,
    t.account_granted_at = NULL,
    t.updated_at = GETDATE()
FROM [dbo].[trainees] t
JOIN [dbo].[users] u ON u.id = t.user_id
LEFT JOIN [dbo].[roles] r ON r.id = u.role_id
WHERE ISNULL(r.code, '') <> 'trainee';

COMMIT;
GO

-- @migration 2026-11-30_trainee_attendance.sql
/* ============================================================================
 * 2026-11-30_trainee_attendance
 * ----------------------------------------------------------------------------
 *   Chấm công chuyển từ nhân viên sang HỌC VIÊN theo khóa đào tạo:
 *   - Người chấm công = tài khoản học viên (trainees.user_id) có ghi danh
 *     'approved' vào khóa (không huỷ) trong thời gian khóa / thời gian riêng
 *     của lượt ghi danh (khóa mở liên tục). Ngoài thời gian khóa không chấm được.
 *   - courses.shift_pattern_id : mẫu ca tuần của khóa (NULL = mẫu mặc định).
 *     Thay cho users.shift_pattern_id (mẫu theo từng nhân viên) — cột cũ giữ
 *     lại, không dùng nữa.
 *     FK không cascade (tránh nhiều đường cascade) — xoá mẫu thì shiftService
 *     tự đưa các khóa đang dùng về mẫu mặc định.
 *   - staff_attendance.course_id + course_name: bản chụp khóa học viên đang học
 *     lúc chấm công (không FK, như shift_id). Bản ghi cũ của nhân viên
 *     (course_id NULL) giữ làm lịch sử, không hiện ở bảng chấm công.
 *   Tên bảng / quyền staff_attendance giữ nguyên (chỉ đổi nhãn hiển thị).
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.courses', N'shift_pattern_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [shift_pattern_id] INT NULL
        CONSTRAINT FK_courses_shift_pattern REFERENCES [dbo].[shift_patterns](id);
GO

IF COL_LENGTH(N'dbo.staff_attendance', N'course_id') IS NULL
    ALTER TABLE [dbo].[staff_attendance] ADD
        [course_id]   VARCHAR(20)   NULL,
        [course_name] NVARCHAR(255) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_staff_attendance_course_date' AND object_id = OBJECT_ID(N'dbo.staff_attendance'))
    CREATE INDEX IX_staff_attendance_course_date ON [dbo].[staff_attendance](course_id, work_date)
        WHERE course_id IS NOT NULL;
GO

PRINT N'✅ Migration 2026-11-30_trainee_attendance hoàn tất.';
GO

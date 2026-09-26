/* ============================================================================
 * Khảo sát (surveys) — Giai đoạn D4
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Module mới hoàn toàn: admin/phòng đào tạo tạo khảo sát gồm nhiều câu hỏi
 *   (chọn 1 / chọn nhiều / tự luận ngắn), người dùng đã đăng nhập nộp 1 lần
 *   duy nhất (UNIQUE survey_id+respondent), admin xem kết quả tổng hợp.
 *
 *   options/answer_options lưu dạng JSON text (NVARCHAR(MAX)) thay vì bảng
 *   con riêng — đơn giản hơn cho danh sách lựa chọn ngắn (survey đơn giản,
 *   không cần lọc/JOIN theo từng lựa chọn ở tầng SQL), đọc/ghi ở tầng service
 *   bằng JSON.stringify/JSON.parse.
 *
 *   Quyền: 1 permission 'manage' cho admin tạo/sửa/xoá khảo sát + xem kết quả
 *   (theo mẫu system_settings/training_plans). Nộp khảo sát chỉ cần đăng nhập
 *   (authenticate), không cần permission riêng — mọi tài khoản hợp lệ đều nộp
 *   được khảo sát đang mở dành cho mình.
 *
 *   surveys.target_role KHÔNG có FK tới roles(id) — cột roles.id thuộc schema
 *   nền (không có trong migration nào ở repo) có độ dài khác VARCHAR(20), chạy
 *   thử bị lỗi Msg 1753 "not the same length or scale". Giữ tham chiếu MỀM
 *   (validate/JOIN ở tầng service, không ràng buộc DB) thay vì dò đúng độ dài
 *   thật của roles.id — an toàn hơn vì không depend vào 1 chi tiết schema nền
 *   chưa xác nhận được.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Khảo sát
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.surveys', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[surveys] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [title]       NVARCHAR(255) NOT NULL,
        [description] NVARCHAR(MAX) NULL,
        [status]      VARCHAR(20)   NOT NULL CONSTRAINT DF_surveys_status DEFAULT ('draft'),
        [target_role] VARCHAR(20)   NULL,
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_surveys_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL,
        [updated_at]  DATETIME      NULL,
        [updated_by]  VARCHAR(20)   NULL,
        CONSTRAINT CHK_surveys_status CHECK ([status] IN ('draft', 'active', 'closed'))
    );
END
GO

------------------------------------------------------------------------------
-- 2. Câu hỏi trong khảo sát
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.survey_questions', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[survey_questions] (
        [id]            VARCHAR(20)   NOT NULL PRIMARY KEY,
        [survey_id]     VARCHAR(20)   NOT NULL,
        [question_text] NVARCHAR(500) NOT NULL,
        [question_type] VARCHAR(20)   NOT NULL,
        [options]       NVARCHAR(MAX) NULL,
        [sort_order]    INT           NOT NULL CONSTRAINT DF_survey_questions_sort_order DEFAULT (0),
        [created_at]    DATETIME      NOT NULL CONSTRAINT DF_survey_questions_created_at DEFAULT (GETDATE()),
        CONSTRAINT FK_survquest_survey FOREIGN KEY ([survey_id]) REFERENCES [dbo].[surveys] ([id]) ON DELETE CASCADE,
        CONSTRAINT CHK_survquest_type CHECK ([question_type] IN ('single_choice', 'multi_choice', 'text'))
    );
    CREATE NONCLUSTERED INDEX [IX_survey_questions_survey] ON [dbo].[survey_questions] ([survey_id]);
END
GO

------------------------------------------------------------------------------
-- 3. Lượt nộp khảo sát — mỗi người dùng nộp tối đa 1 lần / khảo sát
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.survey_responses', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[survey_responses] (
        [id]                  VARCHAR(20) NOT NULL PRIMARY KEY,
        [survey_id]           VARCHAR(20) NOT NULL,
        [respondent_user_id]  VARCHAR(20) NOT NULL,
        [submitted_at]        DATETIME    NOT NULL CONSTRAINT DF_survey_responses_submitted_at DEFAULT (GETDATE()),
        CONSTRAINT FK_survresp_survey FOREIGN KEY ([survey_id]) REFERENCES [dbo].[surveys] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_survresp_user FOREIGN KEY ([respondent_user_id]) REFERENCES [dbo].[users] ([id]),
        CONSTRAINT UQ_survresp_survey_user UNIQUE ([survey_id], [respondent_user_id])
    );
END
GO

------------------------------------------------------------------------------
-- 4. Câu trả lời từng câu hỏi trong 1 lượt nộp
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.survey_answers', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[survey_answers] (
        [id]              VARCHAR(20)   NOT NULL PRIMARY KEY,
        [response_id]     VARCHAR(20)   NOT NULL,
        [question_id]     VARCHAR(20)   NOT NULL,
        [answer_text]     NVARCHAR(MAX) NULL,
        [answer_options]  NVARCHAR(MAX) NULL,
        CONSTRAINT FK_survans_response FOREIGN KEY ([response_id]) REFERENCES [dbo].[survey_responses] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_survans_question FOREIGN KEY ([question_id]) REFERENCES [dbo].[survey_questions] ([id])
    );
    CREATE NONCLUSTERED INDEX [IX_survey_answers_response] ON [dbo].[survey_answers] ([response_id]);
    CREATE NONCLUSTERED INDEX [IX_survey_answers_question] ON [dbo].[survey_answers] ([question_id]);
END
GO

------------------------------------------------------------------------------
-- 5. Quyền mới — resource 'surveys', chỉ MANAGE (tạo/sửa/xoá + xem kết quả).
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-SURVEY-MANAGE', N'Quản lý khảo sát', N'Tạo/sửa/xoá khảo sát và xem kết quả tổng hợp', 'surveys', 'manage', 10)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-SURVEY-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-10-01_surveys hoàn tất.';
GO

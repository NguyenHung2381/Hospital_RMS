/* ============================================================================
 * 2026-10-31_gop_thang_10 — gộp 33 migration 2026-10-01 → 2026-10-31
 * ----------------------------------------------------------------------------
 *   Nội dung NGUYÊN VĂN các file cũ, đúng thứ tự cũ. Mỗi phần mở đầu bằng dòng
 *   "-- @migration <tên file cũ>". Runner chỉ chạy phần DB chưa ghi nhận; DB đã
 *   chạy đủ các file cũ thì chỉ ghi nhận file này, không chạy lại gì.
 *   Không sửa phần cũ — cần đổi gì thì viết migration mới (database/README.md).
 * ==========================================================================*/

-- @migration 2026-10-01_surveys.sql
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

-- @migration 2026-10-02_totp_2fa.sql
/* ============================================================================
 * Xác thực 2 lớp (2FA/TOTP) tự nguyện cho tài khoản — Giai đoạn D5
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Thêm cột lên bảng `users` có sẵn (không bảng mới) — mirror cách
 *   2026-09-11_security_hardening.sql thêm failed_login_count/locked_until.
 *   totp_secret lưu dạng text (Base32, chuẩn RFC 4648 của thư viện otplib) —
 *   không mã hoá thêm, chấp nhận đánh đổi như SMTP_PASS ở system_settings
 *   (đơn giản, đúng mức bảo mật hiện có của DB). totp_enabled=0 nghĩa là CHƯA
 *   bật (dù đã có secret do đang ở bước setup chưa xác nhận mã đầu tiên) —
 *   authService.login() chỉ bắt đăng thêm bước OTP khi = 1.
 *
 *   KHÔNG bắt buộc 2FA toàn hệ thống — mỗi tài khoản tự bật/tắt qua Hồ sơ cá
 *   nhân (Profile.tsx). "Ép buộc theo vai trò" để sau nếu thực sự cần.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.users', N'totp_secret') IS NULL
    ALTER TABLE [dbo].[users] ADD [totp_secret] NVARCHAR(255) NULL;
GO
IF COL_LENGTH(N'dbo.users', N'totp_enabled') IS NULL
    ALTER TABLE [dbo].[users]
        ADD [totp_enabled] BIT NOT NULL CONSTRAINT DF_users_totp_enabled DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.users', N'totp_verified_at') IS NULL
    ALTER TABLE [dbo].[users] ADD [totp_verified_at] DATETIME NULL;
GO

PRINT N'✅ Migration 2026-10-02_totp_2fa hoàn tất.';
GO

-- @migration 2026-10-03_topic_authors.sql
/* ============================================================================
 * Đồng tác giả có thứ tự cho Bài báo/Tập san — Giai đoạn D7
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Bảng CỘNG THÊM, KHÔNG đụng topics/topic_members hiện có (topic_members là
 *   "thành viên đề tài" nói chung — chủ nhiệm/thư ký/thành viên, dùng cho CẢ
 *   đề tài lẫn bài báo; topic_authors là khái niệm RIÊNG của bài báo: danh
 *   sách tác giả có THỨ TỰ in trên bài báo + đánh dấu tác giả liên hệ, khác
 *   hẳn vai trò leader/secretary/member). Chỉ áp dụng khi
 *   topics.article_type = 'bai_bao' — ràng buộc này chỉ kiểm ở tầng service/
 *   UI (TopicDrawer chỉ hiện tab khi đúng loại), không CHECK ở DB vì phải
 *   JOIN sang topics mỗi lần ghi, không cần thiết cho 1 ràng buộc nghiệp vụ
 *   đơn giản.
 *
 *   Không thêm permission mới — dùng lại 'topics:update' (sửa qua tab "Đồng
 *   tác giả" trong TopicDrawer, cùng quyền sửa đề tài).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.topic_authors', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[topic_authors] (
        [id]              VARCHAR(20)   NOT NULL PRIMARY KEY,
        [topic_id]        VARCHAR(15)   NOT NULL,
        [author_name]     NVARCHAR(255) NOT NULL,
        [affiliation]     NVARCHAR(255) NULL,
        [author_order]    INT           NOT NULL CONSTRAINT DF_topic_authors_order DEFAULT (0),
        [is_corresponding] BIT          NOT NULL CONSTRAINT DF_topic_authors_corresponding DEFAULT (0),
        [created_at]      DATETIME      NOT NULL CONSTRAINT DF_topic_authors_created_at DEFAULT (GETDATE()),
        [created_by]      VARCHAR(20)   NULL,
        CONSTRAINT FK_topicauthor_topic FOREIGN KEY ([topic_id]) REFERENCES [dbo].[topics] ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_topic_authors_topic] ON [dbo].[topic_authors] ([topic_id]);
END
GO

PRINT N'✅ Migration 2026-10-03_topic_authors hoàn tất.';
GO

-- @migration 2026-10-04_qr_attendance.sql
/* ============================================================================
 * Điểm danh QR động (khóa đào tạo + hội thảo CME) — Giai đoạn D8
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Phụ thuộc D0 (2026-09-28_trainee_accounts.sql) — học viên phải có tài
 *   khoản đăng nhập để tự quét QR điểm danh.
 *
 *   attendance (khóa đào tạo): thêm method ('manual' mặc định, 'qr' khi tự
 *   quét) + checked_in_at (thời điểm quét — khác updated_at vốn cũng đổi khi
 *   giảng viên sửa tay). Không đổi status mặc định ('absent') — điểm danh QR
 *   chỉ set status='present' khi quét thành công, còn lại vẫn 'absent' như
 *   trước (giảng viên sửa tay nếu cần).
 *
 *   seminar_participants (hội thảo/CME): chỉ thêm checked_in_at — bảng này đã
 *   có sẵn user_id (khác course_enrollments phải qua trainees), nên tự quét
 *   chỉ cần so user_id = tài khoản đang đăng nhập. v1 chỉ 1 lượt quét (không
 *   tính tỷ lệ thời gian tham dự vào/ra — để sau nếu cần).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.attendance', N'method') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [method] VARCHAR(10) NOT NULL CONSTRAINT DF_attendance_method DEFAULT ('manual');
GO
IF COL_LENGTH(N'dbo.attendance', N'checked_in_at') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [checked_in_at] DATETIME NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_attendance_method')
    ALTER TABLE [dbo].[attendance] WITH CHECK ADD CONSTRAINT [CHK_attendance_method]
        CHECK ([method] IN ('manual', 'qr'));
GO

IF COL_LENGTH(N'dbo.seminar_participants', N'checked_in_at') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD [checked_in_at] DATETIME NULL;
GO

PRINT N'✅ Migration 2026-10-04_qr_attendance hoàn tất.';
GO

-- @migration 2026-10-05_exams.sql
/* ============================================================================
 * Ngân hàng câu hỏi & thi online — Giai đoạn D9 (phụ thuộc D0)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Lớn nhất Giai đoạn D. Đề thi gồm câu trắc nghiệm (auto-chấm ngay khi nộp)
 *   + câu tự luận (chấm tay), theo đúng lựa chọn của người dùng ("cả trắc
 *   nghiệm + tự luận kết hợp trong CÙNG 1 đề"). Học viên làm bài qua tài
 *   khoản đã có (D0) — 1 lượt làm / đề (UNIQUE paper_id+enrollment_id, không
 *   hỗ trợ làm lại ở v1). Khi chấm xong toàn bộ câu (không còn score_awarded
 *   NULL) → đổ điểm vào `grades` qua `courseService.upsertGrade` có sẵn,
 *   KHÔNG tạo cơ chế tính điểm riêng.
 *
 *   options/selected_option lưu dạng JSON text (mirror surveys) — question_bank
 *   dùng chung cho nhiều đề thi (N:N qua exam_paper_questions), không thuộc
 *   riêng 1 khóa học nào.
 *
 *   Không thêm permission mới: quản lý ngân hàng câu hỏi + đề thi + chấm bài
 *   dùng lại 'courses:update' (gắn với khóa học, giống cách quản lý tài liệu/
 *   điểm hiện có); làm bài thi chỉ cần đăng nhập + có ghi danh (enrollment)
 *   hợp lệ vào khóa học của đề thi đó.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Ngân hàng câu hỏi (dùng chung nhiều đề thi)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.question_bank', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[question_bank] (
        [id]             VARCHAR(20)   NOT NULL PRIMARY KEY,
        [subject_id]     VARCHAR(20)   NULL,
        [question_type]  VARCHAR(20)   NOT NULL,
        [question_text]  NVARCHAR(MAX) NOT NULL,
        [options]        NVARCHAR(MAX) NULL,
        [correct_option] NVARCHAR(255) NULL,
        [points]         DECIMAL(4,1)  NOT NULL CONSTRAINT DF_question_bank_points DEFAULT (1),
        [created_at]     DATETIME      NOT NULL CONSTRAINT DF_question_bank_created_at DEFAULT (GETDATE()),
        [created_by]     VARCHAR(20)   NULL,
        [updated_at]     DATETIME      NULL,
        [updated_by]     VARCHAR(20)   NULL,
        CONSTRAINT FK_qbank_subject FOREIGN KEY ([subject_id]) REFERENCES [dbo].[subjects] ([id]),
        CONSTRAINT CHK_qbank_type CHECK ([question_type] IN ('single_choice', 'essay'))
    );
    CREATE NONCLUSTERED INDEX [IX_question_bank_subject] ON [dbo].[question_bank] ([subject_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Đề thi (gắn với 1 khóa học)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_papers', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_papers] (
        [id]               VARCHAR(20)   NOT NULL PRIMARY KEY,
        [course_id]        VARCHAR(20)   NOT NULL,
        [subject_id]       VARCHAR(20)   NULL,
        [title]            NVARCHAR(255) NOT NULL,
        [duration_minutes] INT           NOT NULL CONSTRAINT DF_exam_papers_duration DEFAULT (45),
        [status]           VARCHAR(20)   NOT NULL CONSTRAINT DF_exam_papers_status DEFAULT ('draft'),
        [created_at]       DATETIME      NOT NULL CONSTRAINT DF_exam_papers_created_at DEFAULT (GETDATE()),
        [created_by]       VARCHAR(20)   NULL,
        [updated_at]       DATETIME      NULL,
        [updated_by]       VARCHAR(20)   NULL,
        CONSTRAINT FK_exampaper_course FOREIGN KEY ([course_id]) REFERENCES [dbo].[courses] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_exampaper_subject FOREIGN KEY ([subject_id]) REFERENCES [dbo].[subjects] ([id]),
        CONSTRAINT CHK_exampapers_status CHECK ([status] IN ('draft', 'published', 'closed'))
    );
    CREATE NONCLUSTERED INDEX [IX_exam_papers_course] ON [dbo].[exam_papers] ([course_id]);
END
GO

------------------------------------------------------------------------------
-- 3. Câu hỏi trong đề (N:N question_bank <-> exam_papers, có thứ tự)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_paper_questions', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_paper_questions] (
        [id]          VARCHAR(20) NOT NULL PRIMARY KEY,
        [paper_id]    VARCHAR(20) NOT NULL,
        [question_id] VARCHAR(20) NOT NULL,
        [sort_order]  INT         NOT NULL CONSTRAINT DF_exam_paper_questions_order DEFAULT (0),
        CONSTRAINT FK_epq_paper    FOREIGN KEY ([paper_id])    REFERENCES [dbo].[exam_papers]   ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_epq_question FOREIGN KEY ([question_id]) REFERENCES [dbo].[question_bank] ([id]),
        CONSTRAINT UQ_epq_paper_question UNIQUE ([paper_id], [question_id])
    );
    CREATE NONCLUSTERED INDEX [IX_exam_paper_questions_paper] ON [dbo].[exam_paper_questions] ([paper_id]);
END
GO

------------------------------------------------------------------------------
-- 4. Lượt làm bài — 1 học viên làm tối đa 1 lần / đề (v1, không hỗ trợ làm lại)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_attempts', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_attempts] (
        [id]            VARCHAR(20) NOT NULL PRIMARY KEY,
        [paper_id]      VARCHAR(20) NOT NULL,
        [enrollment_id] VARCHAR(20) NOT NULL,
        [started_at]    DATETIME    NOT NULL CONSTRAINT DF_exam_attempts_started_at DEFAULT (GETDATE()),
        [submitted_at]  DATETIME    NULL,
        [auto_score]    DECIMAL(6,2) NULL,
        [manual_score]  DECIMAL(6,2) NULL,
        [status]        VARCHAR(20) NOT NULL CONSTRAINT DF_exam_attempts_status DEFAULT ('in_progress'),
        CONSTRAINT FK_examatt_paper      FOREIGN KEY ([paper_id])      REFERENCES [dbo].[exam_papers]        ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_examatt_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]),
        CONSTRAINT UQ_examatt_paper_enrollment UNIQUE ([paper_id], [enrollment_id]),
        CONSTRAINT CHK_examatt_status CHECK ([status] IN ('in_progress', 'submitted', 'graded'))
    );
    CREATE NONCLUSTERED INDEX [IX_exam_attempts_paper] ON [dbo].[exam_attempts] ([paper_id]);
END
GO

------------------------------------------------------------------------------
-- 5. Câu trả lời từng câu hỏi trong 1 lượt làm bài
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_answers', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_answers] (
        [id]              VARCHAR(20)   NOT NULL PRIMARY KEY,
        [attempt_id]      VARCHAR(20)   NOT NULL,
        [question_id]     VARCHAR(20)   NOT NULL,
        [selected_option] NVARCHAR(255) NULL,
        [essay_text]      NVARCHAR(MAX) NULL,
        [score_awarded]   DECIMAL(4,1)  NULL,
        CONSTRAINT FK_examans_attempt  FOREIGN KEY ([attempt_id])  REFERENCES [dbo].[exam_attempts] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_examans_question FOREIGN KEY ([question_id]) REFERENCES [dbo].[question_bank] ([id]),
        CONSTRAINT UQ_examans_attempt_question UNIQUE ([attempt_id], [question_id])
    );
    CREATE NONCLUSTERED INDEX [IX_exam_answers_attempt] ON [dbo].[exam_answers] ([attempt_id]);
END
GO

PRINT N'✅ Migration 2026-10-05_exams hoàn tất.';
GO

-- @migration 2026-10-06_workflow_engine.sql
/* ============================================================================
 * Workflow duyệt cấu hình được (nhiều bước) — Giai đoạn D10
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   RỦI RO CAO NHẤT trong Giai đoạn D — thiết kế ADDITIVE TUYỆT ĐỐI.
 *   `sp_approve_topic` (đường duyệt 1 bước hiện tại) không có source trong
 *   repo (thuộc schema nền) nên KHÔNG thể sửa an toàn. Engine mới này chạy
 *   SONG SONG, hoàn toàn tách biệt — mặc định KHÔNG có workflow_definitions
 *   nào active nên topicController.approve() vẫn đi đúng đường cũ
 *   (topicService.approve -> sp_approve_topic) như trước giờ, KHÔNG đổi gì.
 *   Chỉ khi admin CHỦ ĐỘNG tạo + bật 1 workflow_definitions cho resource
 *   'topics' thì luồng mới engine mới được dùng.
 *
 *   approver_role_id/assignee_role_id KHÔNG có FK tới roles(id) — bài học từ
 *   migration surveys (2026-10-01): cột roles.id thuộc schema nền, độ dài
 *   thật khác VARCHAR(20), FK cứng bị lỗi Msg 1753. Giữ tham chiếu MỀM.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Định nghĩa workflow — 1 resource (vd 'topics') có thể có nhiều định
--    nghĩa nhưng chỉ 1 cái is_active=1 tại 1 thời điểm (kiểm ở tầng service).
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.workflow_definitions', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[workflow_definitions] (
        [id]         VARCHAR(20)   NOT NULL PRIMARY KEY,
        [resource]   VARCHAR(50)   NOT NULL,
        [name]       NVARCHAR(255) NOT NULL,
        [is_active]  BIT           NOT NULL CONSTRAINT DF_workflow_definitions_active DEFAULT (0),
        [created_at] DATETIME      NOT NULL CONSTRAINT DF_workflow_definitions_created_at DEFAULT (GETDATE()),
        [created_by] VARCHAR(20)   NULL,
        [updated_at] DATETIME      NULL,
        [updated_by] VARCHAR(20)   NULL
    );
    CREATE NONCLUSTERED INDEX [IX_workflow_definitions_resource] ON [dbo].[workflow_definitions] ([resource], [is_active]);
END
GO

------------------------------------------------------------------------------
-- 2. Các bước duyệt trong 1 định nghĩa — có thứ tự.
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.workflow_steps', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[workflow_steps] (
        [id]                VARCHAR(20)   NOT NULL PRIMARY KEY,
        [definition_id]     VARCHAR(20)   NOT NULL,
        [step_order]        INT           NOT NULL,
        [name]              NVARCHAR(255) NOT NULL,
        [approver_role_id]  VARCHAR(20)   NULL,
        [sla_days]          INT           NULL,
        CONSTRAINT FK_wfstep_definition FOREIGN KEY ([definition_id]) REFERENCES [dbo].[workflow_definitions] ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_workflow_steps_definition] ON [dbo].[workflow_steps] ([definition_id], [step_order]);
END
GO

------------------------------------------------------------------------------
-- 3. Lượt duyệt của 1 đối tượng cụ thể (vd 1 đề tài) theo 1 định nghĩa.
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.workflow_instances', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[workflow_instances] (
        [id]            VARCHAR(20) NOT NULL PRIMARY KEY,
        [definition_id] VARCHAR(20) NOT NULL,
        [entity_id]     VARCHAR(20) NOT NULL,
        [current_step]  INT         NOT NULL CONSTRAINT DF_workflow_instances_step DEFAULT (1),
        [status]        VARCHAR(20) NOT NULL CONSTRAINT DF_workflow_instances_status DEFAULT ('in_progress'),
        [created_at]    DATETIME    NOT NULL CONSTRAINT DF_workflow_instances_created_at DEFAULT (GETDATE()),
        [updated_at]    DATETIME    NULL,
        CONSTRAINT FK_wfinst_definition FOREIGN KEY ([definition_id]) REFERENCES [dbo].[workflow_definitions] ([id]),
        CONSTRAINT CHK_wfinst_status CHECK ([status] IN ('in_progress', 'approved', 'rejected'))
    );
    CREATE NONCLUSTERED INDEX [IX_workflow_instances_entity] ON [dbo].[workflow_instances] ([definition_id], [entity_id]);
END
GO

------------------------------------------------------------------------------
-- 4. Nhiệm vụ duyệt (1 dòng / bước / lượt) — nơi ghi quyết định thật.
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.workflow_tasks', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[workflow_tasks] (
        [id]               VARCHAR(20)   NOT NULL PRIMARY KEY,
        [instance_id]      VARCHAR(20)   NOT NULL,
        [step_id]          VARCHAR(20)   NOT NULL,
        [assignee_role_id] VARCHAR(20)   NULL,
        [status]           VARCHAR(20)   NOT NULL CONSTRAINT DF_workflow_tasks_status DEFAULT ('pending'),
        [decided_by]       VARCHAR(20)   NULL,
        [decided_at]       DATETIME      NULL,
        [comment]          NVARCHAR(MAX) NULL,
        CONSTRAINT FK_wftask_instance FOREIGN KEY ([instance_id]) REFERENCES [dbo].[workflow_instances] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_wftask_step     FOREIGN KEY ([step_id])     REFERENCES [dbo].[workflow_steps]     ([id]),
        CONSTRAINT CHK_wftask_status  CHECK ([status] IN ('pending', 'approved', 'rejected'))
    );
    CREATE NONCLUSTERED INDEX [IX_workflow_tasks_instance] ON [dbo].[workflow_tasks] ([instance_id]);
END
GO

------------------------------------------------------------------------------
-- 5. Quyền mới — resource 'workflows', chỉ MANAGE (cấu hình workflow).
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-WORKFLOW-MANAGE', N'Quản lý workflow duyệt', N'Cấu hình quy trình duyệt nhiều bước cho các resource (đề tài...)', 'workflows', 'manage', 10)
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
    ('VT01','PERM-WORKFLOW-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-10-06_workflow_engine hoàn tất.';
GO

-- @migration 2026-10-07_venues.sql
/* ============================================================================
 * Danh mục Địa điểm (phòng họp / hội trường / phòng học)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Địa điểm hiện là text tự do ở nhiều nơi: councils.location (bảo vệ đề
 *   cương), class_sessions.room (buổi học), course_programs.location (chương
 *   trình gán vào khóa). Gõ tay ⇒ cùng 1 phòng bị viết nhiều kiểu, không lọc /
 *   thống kê được.
 *
 *   Thêm bảng danh mục venues để form CHỌN từ danh sách. Các cột text cũ GIỮ
 *   NGUYÊN (lưu tên địa điểm tại thời điểm chọn) — không đổi schema bảng nghiệp
 *   vụ, dữ liệu cũ / file xuất / cổng công khai không bị ảnh hưởng.
 *
 *   usage_scope: 'defense' (bảo vệ đề cương / hội đồng), 'training' (buổi học),
 *   'both' — để form nào chỉ gợi ý địa điểm phù hợp với form đó.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng venues (shape id/name/description/audit giống các danh mục khác để
--    dùng thẳng services/crudService.js)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.venues', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[venues] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(255) NOT NULL,
        [description] NVARCHAR(MAX) NULL,
        [address]     NVARCHAR(255) NULL,
        [capacity]    INT           NULL,
        [usage_scope] VARCHAR(20)   NOT NULL CONSTRAINT DF_venues_usage_scope DEFAULT ('both'),
        [is_active]   BIT           NOT NULL CONSTRAINT DF_venues_is_active DEFAULT (1),
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_venues_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL,
        [updated_at]  DATETIME      NULL,
        [updated_by]  VARCHAR(20)   NULL,
        CONSTRAINT [CHK_venues_usage_scope] CHECK ([usage_scope] IN ('defense','training','both')),
        CONSTRAINT [CHK_venues_capacity] CHECK ([capacity] IS NULL OR [capacity] > 0)
    );
END
GO

-- Tên là thứ được lưu sang bảng nghiệp vụ ⇒ không cho trùng
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_venues_name' AND object_id = OBJECT_ID(N'dbo.venues'))
    CREATE UNIQUE INDEX [UQ_venues_name] ON [dbo].[venues] ([name]);
GO

-- Cột nhận tên địa điểm phải chứa đủ venues.name (255): room trước đây 100,
-- course_programs.location 200 ⇒ nới ra (chỉ tăng độ dài, không mất dữ liệu).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.class_sessions') AND name = 'room' AND max_length < 510)
    ALTER TABLE [dbo].[class_sessions] ALTER COLUMN [room] NVARCHAR(255) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.course_programs') AND name = 'location' AND max_length < 510)
    ALTER TABLE [dbo].[course_programs] ALTER COLUMN [location] NVARCHAR(255) NULL;
GO

------------------------------------------------------------------------------
-- 2. Seed từ các địa điểm đã gõ tay trước đây (gộp trùng, bỏ rỗng) để danh
--    mục không trống và dữ liệu cũ khớp ngay với lựa chọn trong form.
------------------------------------------------------------------------------
--    Kèm danh sách LOCATION_PRESETS từng hard-code trong CouncilFormModal.tsx
--    (nay form chọn từ danh mục này).
;WITH src AS (
    SELECT CAST(v.name AS NVARCHAR(255)) AS name, 'defense' AS scope
    FROM (VALUES
        (N'Hội trường 3'), (N'Hội trường ghép tạng'), (N'VP Khoa thăm dò chức năng'),
        (N'VP Trung tâm HTSS'), (N'VP Trung tâm xét nghiệm'), (N'VP TT bệnh nhiệt đới'),
        (N'VP TT Đột quỵ'), (N'VP HSTC ngoại khoa'), (N'VP khoa Cấp cứu'),
        (N'VP khoa Chấn thương chỉnh hình'), (N'VP khoa Cơ xương khớp'), (N'VP khoa Dị ứng - MDLS'),
        (N'VP khoa Gây mê hồi sức'), (N'VP khoa HSTC'), (N'VP khoa Kiểm soát nhiễm khuẩn'),
        (N'VP khoa Ngoại thận - tiết niệu'), (N'VP khoa Ngoại tổng hợp 2'), (N'VP khoa Nhi - sơ sinh'),
        (N'VP khoa Nội thận - TN - LM'), (N'VP khoa Nội tiêu hoá'), (N'VP khoa Nội tim mạch 1'),
        (N'VP khoa Phẫu thuật - TMLN'), (N'VP khoa Phụ sản'), (N'VP khoa PTTKCS'),
        (N'VP khoa Tai mũi họng'), (N'VP khoa Thần kinh'), (N'VP khoa Tim mạch 2'), (N'VP khoa X-quang')
    ) AS v(name)
    UNION ALL SELECT LTRIM(RTRIM(location)), 'defense' FROM [dbo].[councils]
    UNION ALL SELECT LTRIM(RTRIM(room)), 'training' FROM [dbo].[class_sessions]
    UNION ALL SELECT LTRIM(RTRIM(location)), 'training' FROM [dbo].[course_programs]
),
agg AS (
    SELECT name,
           CASE WHEN MIN(scope) <> MAX(scope) THEN 'both' ELSE MIN(scope) END AS usage_scope
    FROM src
    WHERE name IS NOT NULL AND name <> N''
    GROUP BY name
)
INSERT INTO [dbo].[venues] (id, name, usage_scope, created_by)
SELECT 'DD' + LEFT(REPLACE(NEWID(), '-', ''), 18), a.name, a.usage_scope, 'SYSTEM'
FROM agg a
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[venues] v WHERE v.name = a.name);
GO

------------------------------------------------------------------------------
-- 3. Quyền — resource riêng 'venues' (dùng chung NCKH + Đào tạo nên không gắn
--    vào 'catalog' hay 'training_catalog'). Đọc danh sách chỉ cần đăng nhập
--    (form hội đồng / buổi học cần gợi ý); quyền dưới đây cho màn quản lý.
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-VEN-READ',   N'Xem địa điểm',        N'Xem danh mục địa điểm (phòng họp, hội trường, phòng học)', 'venues', 'read',   10),
    ('PERM-VEN-CREATE', N'Thêm địa điểm',       N'Tạo địa điểm mới',                                        'venues', 'create', 20),
    ('PERM-VEN-UPDATE', N'Sửa địa điểm',        N'Cập nhật thông tin địa điểm',                             'venues', 'update', 30),
    ('PERM-VEN-DELETE', N'Xoá địa điểm',        N'Xoá địa điểm khỏi danh mục',                              'venues', 'delete', 40),
    ('PERM-VEN-MANAGE', N'Toàn quyền địa điểm', N'Toàn quyền quản lý danh mục địa điểm',                    'venues', 'manage', 50)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

-- VT01 (admin) + VT03 (cán bộ NCKH, kiêm quản lý đào tạo — như training_catalog)
MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-VEN-READ'),('VT01','PERM-VEN-CREATE'),('VT01','PERM-VEN-UPDATE'),('VT01','PERM-VEN-DELETE'),('VT01','PERM-VEN-MANAGE'),
    ('VT03','PERM-VEN-READ'),('VT03','PERM-VEN-CREATE'),('VT03','PERM-VEN-UPDATE'),('VT03','PERM-VEN-DELETE'),('VT03','PERM-VEN-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-10-07_venues hoàn tất.';
GO

-- @migration 2026-10-08_cme_records_extra_fields.sql
/* ============================================================================
 * cme_records — bổ sung trường theo "Sổ theo dõi tín chỉ CME" (Excel)
 * ----------------------------------------------------------------------------
 *   + role      Vai trò (Đại biểu, Báo cáo viên...)
 *   + quantity  Số lượng (số buổi/giờ/năm... theo conversion_method)
 *   + end_date  Đến ngày (activity_date = Từ ngày)
 *   activity_date cho phép NULL (sổ cũ không có ngày); year chuyển từ cột tính
 *   (YEAR(activity_date)) thành cột thường, backfill từ activity_date.
 * Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.cme_records', 'role') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [role] NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.cme_records', 'quantity') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [quantity] DECIMAL(8,2) NULL;
IF COL_LENGTH('dbo.cme_records', 'end_date') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [end_date] DATE NULL;
GO

IF EXISTS (SELECT 1 FROM sys.computed_columns WHERE object_id = OBJECT_ID(N'dbo.cme_records') AND name = 'year')
BEGIN
    DROP INDEX [IX_cme_records_user_year] ON [dbo].[cme_records];
    ALTER TABLE [dbo].[cme_records] DROP COLUMN [year];
    ALTER TABLE [dbo].[cme_records] ADD [year] INT NULL;
END
GO

UPDATE [dbo].[cme_records] SET [year] = YEAR([activity_date]) WHERE [year] IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.cme_records') AND name = 'activity_date' AND is_nullable = 0)
    ALTER TABLE [dbo].[cme_records] ALTER COLUMN [activity_date] DATE NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.cme_records') AND name = 'year' AND is_nullable = 1)
    ALTER TABLE [dbo].[cme_records] ALTER COLUMN [year] INT NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cme_records_user_year' AND object_id = OBJECT_ID(N'dbo.cme_records'))
    CREATE NONCLUSTERED INDEX [IX_cme_records_user_year] ON [dbo].[cme_records] ([user_id], [year]);
GO

-- @migration 2026-10-08_roles_vietnamese_names.sql
/* ============================================================================
 * Đổi tên hiển thị vai trò từ mã snake_case sang tiếng Việt
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   roles.name đang là mã kỹ thuật (hoc_vien, quan_ly_nckh...) và được hiển
 *   thị thẳng ở màn Vai trò & Quyền, header người dùng, danh sách tài khoản.
 *
 *   An toàn khi đổi: mọi logic phân quyền dựa vào roles.id (VT01..VT08) hoặc
 *   role_permissions, KHÔNG so sánh roles.name. Ngoại lệ duy nhất là
 *   isLegacyAdminSession() (frontend/src/shared/utils/permissions.ts) — dự phòng
 *   cho phiên cũ chưa có mảng permissions — vốn đã nhận 'quản trị' / 'giám đốc'
 *   nên tên mới của VT01/VT02 vẫn khớp.
 *
 *   Chỉ đổi khi tên vẫn còn là mã gốc ⇒ không ghi đè tên admin đã tự đặt.
 *   Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

UPDATE r
SET    r.name = src.new_name,
       r.updated_at = GETDATE(),
       r.updated_by = 'SYSTEM'
FROM [dbo].[roles] r
JOIN (VALUES
    ('VT01', N'admin',              N'Quản trị hệ thống'),
    ('VT02', N'giam_doc',           N'Giám đốc'),
    ('VT03', N'quan_ly_nckh',       N'Quản lý NCKH'),
    ('VT04', N'hoi_dong_xet_duyet', N'Hội đồng xét duyệt'),
    ('VT05', N'chu_nhiem',          N'Chủ nhiệm đề tài'),
    ('VT06', N'thanh_vien',         N'Thành viên'),
    ('VT07', N'truong_khoa',        N'Trưởng khoa'),
    ('VT08', N'hoc_vien',           N'Học viên')
) AS src (id, old_name, new_name)
    ON r.id = src.id AND r.name = src.old_name;
GO

PRINT N'✅ Migration 2026-10-08_roles_vietnamese_names hoàn tất.';
GO

-- @migration 2026-10-09_audit_columns.sql
-- Bổ sung 4 cột audit (created_at, created_by, updated_at, updated_by) cho các bảng còn thiếu.
-- Quy ước sẵn có: created_at NOT NULL DEFAULT GETDATE(); created_by/updated_by VARCHAR(20) NULL (không FK);
-- updated_at NULL. Bỏ qua bảng log/token/phiên làm bài (chỉ ghi, không sửa).
-- Dòng cũ: created_at = thời điểm chạy migration (không biết ngày thật), các cột *_by = NULL.
-- Idempotent: chỉ thêm cột chưa có.
SET NOCOUNT ON;
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'ALTER TABLE [dbo].[' + t.name + N'] ADD [' + c.col + N'] '
    + REPLACE(c.def, N'{T}', t.name) + N';' + CHAR(10)
FROM sys.tables t
CROSS JOIN (VALUES
    (N'created_at', N'DATETIME2 NOT NULL CONSTRAINT [DF_{T}_created_at] DEFAULT GETDATE()'),
    (N'created_by', N'VARCHAR(20) NULL'),
    (N'updated_at', N'DATETIME2 NULL'),
    (N'updated_by', N'VARCHAR(20) NULL')) c(col, def)
WHERE t.is_ms_shipped = 0
  AND t.name NOT IN ('refresh_tokens','security_events','job_execution_log','person_merge_log',
                     'user_backup_codes','notifications','sysdiagrams','exam_answers','survey_answers','deadline_actions')
  AND NOT EXISTS (SELECT 1 FROM sys.columns k WHERE k.object_id = t.object_id AND k.name = c.col);
EXEC sp_executesql @sql;
PRINT N'✅ Migration 2026-10-09_audit_columns hoàn tất.';
GO

-- @migration 2026-10-09_must_change_password.sql
/* ============================================================================
 * Bắt buộc đổi mật khẩu cho tài khoản dùng mật khẩu do người khác cấp
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Tài khoản cấp hàng loạt (thành viên đề tài, học viên) và tài khoản quản
 *   trị đặt lại mật khẩu trước đây đều dùng chung '123456', username đoán được
 *   (chữ cái đầu + mã NV) — kẻ tấn công chỉ cần thử 1 lần/tài khoản là vào,
 *   không bao giờ chạm ngưỡng khoá tài khoản.
 *
 *   users.must_change_password = 1 ⇒ API chỉ cho đổi mật khẩu / đăng xuất
 *   (middlewares/auth.js) cho tới khi người dùng tự đặt mật khẩu mới.
 *
 *   Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.users', 'must_change_password') IS NULL
BEGIN
    ALTER TABLE [dbo].[users]
        ADD must_change_password BIT NOT NULL
            CONSTRAINT DF_users_must_change_password DEFAULT 0;

    -- Chỉ lần đầu thêm cột: tài khoản chưa từng tự đổi mật khẩu phải đổi ở lần
    -- đăng nhập tới. EXEC để tách batch (cột vừa thêm chưa được biên dịch).
    EXEC('UPDATE [dbo].[users] SET must_change_password = 1 WHERE password_changed_at IS NULL');
END
GO

PRINT N'✅ Migration 2026-10-09_must_change_password hoàn tất.';
GO

-- @migration 2026-10-10_refresh_token_family.sql
/* ============================================================================
 * Xoay refresh token có phát hiện dùng lại (refresh token reuse detection)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Trước đây mỗi lần làm mới phiên, refresh token cũ bị XOÁ. Nếu token bị
 *   đánh cắp, kẻ tấn công và người dùng thật dùng song song, bên nào làm mới
 *   trước thì bên kia chỉ nhận 401 — không ai biết phiên đã bị lộ.
 *
 *   Giờ token cũ được đánh dấu revoked_at (giữ tới khi hết hạn) và mọi token
 *   sinh ra từ cùng 1 lần đăng nhập mang chung family_id. Token đã thu hồi mà
 *   còn được dùng lại (quá vài giây — không phải 2 tab làm mới cùng lúc) ⇒
 *   xoá cả họ token + thu hồi mọi access token (users.token_version).
 *
 *   Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.refresh_tokens', 'family_id') IS NULL
    ALTER TABLE [dbo].[refresh_tokens] ADD family_id VARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.refresh_tokens', 'revoked_at') IS NULL
    ALTER TABLE [dbo].[refresh_tokens] ADD revoked_at DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rt_family' AND object_id = OBJECT_ID('dbo.refresh_tokens'))
    CREATE INDEX IX_rt_family ON [dbo].[refresh_tokens](family_id) WHERE family_id IS NOT NULL;
GO

PRINT N'✅ Migration 2026-10-10_refresh_token_family hoàn tất.';
GO

-- @migration 2026-10-11_2fa_hardening.sql
/* ============================================================================
 * Siết xác thực 2 lớp (2FA)
 * ----------------------------------------------------------------------------
 *   1. users.totp_last_step: bước thời gian (30 giây) của mã TOTP dùng gần
 *      nhất. Mã cùng bước hoặc cũ hơn bị từ chối — mã OTP bị nhìn trộm / chặn
 *      bắt không dùng lại được trong khung ±30 giây.
 *   2. user_backup_codes: mã khôi phục dùng 1 lần khi mất điện thoại. Lưu HMAC
 *      với khoá nằm ngoài DB (backend/src/utils/secretBox.js), không lưu mã gốc.
 *
 *   Secret TOTP (users.totp_secret) được mã hoá AES-256-GCM ở tầng ứng dụng —
 *   không cần đổi cột; giá trị cũ chưa mã hoá tự được mã hoá lại ở lần đăng
 *   nhập 2FA thành công kế tiếp.
 *
 *   Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.users', 'totp_last_step') IS NULL
    ALTER TABLE [dbo].[users] ADD totp_last_step BIGINT NULL;
GO

-- 3. Mốc bắt đầu thời gian chuyển tiếp khi tài khoản quản trị (superuser hoặc
--    có quyền "critical") bị bắt buộc bật 2FA — quá TWOFA_GRACE_DAYS ngày (mặc
--    định 14) mà chưa bật thì bị chặn (backend/src/permissions/twoFactorPolicy.js).
IF COL_LENGTH('dbo.users', 'twofa_required_since') IS NULL
    ALTER TABLE [dbo].[users] ADD twofa_required_since DATETIME2 NULL;
GO

IF OBJECT_ID('dbo.user_backup_codes', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[user_backup_codes] (
        id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        user_id    VARCHAR(20) NOT NULL
                   CONSTRAINT FK_backup_codes_user REFERENCES [dbo].[users](id) ON DELETE CASCADE,
        code_hash  CHAR(64)    NOT NULL,
        used_at    DATETIME2   NULL,
        created_at DATETIME2   NOT NULL CONSTRAINT DF_backup_codes_created DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_backup_codes_user ON [dbo].[user_backup_codes](user_id, code_hash);
END
GO

PRINT N'✅ Migration 2026-10-11_2fa_hardening hoàn tất.';
GO

-- @migration 2026-10-12_department_codes_from_his.sql
/* ============================================================================
 * Đồng bộ mã khoa/phòng (departments.code) theo danh sách chuẩn
 * (danh-sach-khoa-phong-20260928.xlsx — mã CLSxx / PCNxx)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Mọi FK trỏ vào departments.id (DVxxx), không trỏ vào code ⇒ đổi code an toàn.
 *   code chỉ được dùng để tìm kiếm và sinh username khi cấp tài khoản thành
 *   viên mới (topicMemberService / sp cấp tài khoản) — tài khoản cũ giữ nguyên.
 *   abbreviation KHÔNG đổi (dùng sinh dept_account_id NVxxx).
 *
 *   Ghép theo id + mã cũ ⇒ chỉ đổi khi code vẫn là mã cũ, không ghi đè mã
 *   admin đã tự sửa. Script idempotent — chạy lại nhiều lần an toàn.
 *
 *   Khoa/phòng trong DB KHÔNG có trong Excel (giữ mã cũ):
 *     DV001 QLHT, DV044 Trung Tâm Tim Mạch, DV051 ĐV Chẩn Đoán Trước Sinh,
 *     DV057 Văn Thư, DV058 TT HSTC số 1, DV061 CSSK Theo Yêu Cầu,
 *     DV066 TT Dịch Vụ, DV067 QL Đấu Thầu, DV068 Tư vấn ghép tạng.
 *   Excel có nhưng DB chưa có: PCN10 Tổ hành chính quản trị,
 *     PCN11 Tổ công tác xã hội.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

UPDATE d
SET    d.code       = src.new_code,
       d.updated_at = GETDATE(),
       d.updated_by = 'SYSTEM'
FROM [dbo].[departments] d
JOIN (VALUES
    ('DV002', 'PTTM',   'CLS22'),  -- Phẫu thuật tạo hình thẩm mỹ
    ('DV003', 'K141',   'CLS44'),  -- Thần kinh
    ('DV004', 'K24',    'CLS21'),  -- Chấn thương - Chỉnh hình
    ('DV005', 'KHOA01', 'CLS11'),  -- Dược
    ('DV006', 'KSNK',   'CLS10'),  -- Kiểm soát nhiễm khuẩn
    ('DV007', 'DIDU',   'CLS49'),  -- Dinh dưỡng
    ('DV008', 'K142',   'CLS45'),  -- Trung tâm đột quỵ
    ('DV009', 'K36',    'CLS6'),   -- Huyết học - Trung tâm xét nghiệm
    ('DV010', 'PCNTT',  'PCN8'),   -- Công nghệ thông tin
    ('DV011', 'TCKT',   'PCN5'),   -- Tài chính kế toán
    ('DV012', 'PVT',    'PCN7'),   -- Cơ sở hạ tầng và Trang thiết bị
    ('DV013', 'K26',    'CLS14'),  -- Gây mê hồi sức
    ('DV014', 'K08',    'CLS37'),  -- Nội tiết
    ('DV015', 'K20',    'CLS20'),  -- Phẫu thuật thần kinh cột sống
    ('DV016', 'K50',    'CLS35'),  -- Nội Dị ứng - Hô hấp
    ('DV017', 'K01',    'CLS12'),  -- Khám bệnh
    ('DV018', 'K03',    'CLS33'),  -- Nội A - Lão khoa
    ('DV019', 'K041',   'CLS41'),  -- Nội tim mạch 1
    ('DV020', 'K042',   'CLS42'),  -- Nội tim mạch 2
    ('DV021', 'K05',    'CLS34'),  -- Nội tiêu hóa
    ('DV022', 'K06',    'CLS43'),  -- Nội Cơ - xương - khớp
    ('DV023', 'K07',    'CLS38'),  -- Nội Thận - Tiết niệu - Lọc máu
    ('DV024', 'K10',    'CLS39'),  -- Huyết học lâm sàng
    ('DV025', 'K11',    'CLS50'),  -- Nhiễm khuẩn tổng hợp
    ('DV026', 'K13',    'CLS46'),  -- Da liễu
    ('DV027', 'K16',    'CLS47'),  -- Y học cổ truyền
    ('DV028', 'K18',    'CLS26'),  -- Nhi - sơ sinh
    ('DV029', 'K19',    'CLS17'),  -- Ngoại tổng hợp 1
    ('DV030', 'K21',    'CLS40'),  -- Phẫu thuật tim mạch - lồng ngực
    ('DV031', 'K22',    'CLS19'),  -- Ngoại tiêu hóa
    ('DV032', 'K23',    'CLS18'),  -- Ngoại Thận - Tiết niệu
    ('DV033', 'K27',    'CLS24'),  -- Phụ sản
    ('DV034', 'K28',    'CLS27'),  -- Tai mũi họng
    ('DV035', 'K29',    'CLS28'),  -- Răng hàm mặt
    ('DV036', 'K30',    'CLS29'),  -- Mắt
    ('DV037', 'K31',    'CLS48'),  -- Phục hồi chức năng
    ('DV038', 'K37',    'CLS7'),   -- Hóa sinh - Trung tâm xét nghiệm
    ('DV039', 'K38',    'CLS5'),   -- Vi sinh - Trung tâm xét nghiệm
    ('DV040', 'K39',    'CLS2'),   -- Xquang
    ('DV041', 'K40',    'CLS1'),   -- Thăm dò chức năng
    ('DV042', 'K42',    'CLS9'),   -- Giải phẫu bệnh
    ('DV043', 'KHTH',   'PCN3'),   -- Kế hoạch tổng hợp
    ('DV045', 'K481',   'CLS30'),  -- Hồi sức tích cực
    ('DV046', 'K482',   'CLS32'),  -- Hồi sức tích cực ngoại khoa
    ('DV047', 'BGD',    'PCN1'),   -- Ban Giám đốc
    ('DV048', 'TCCB',   'PCN2'),   -- Tổ chức cán bộ
    ('DV049', 'DTCDT',  'PCN4'),   -- Trung tâm Đào tạo và Chỉ đạo tuyến
    ('DV050', 'K272',   'CLS25'),  -- Trung tâm Hỗ trợ sinh sản
    ('DV052', 'K112',   'CLS51'),  -- Vi rút - Ký sinh trùng
    ('DV053', 'K46',    'CLS3'),   -- Di truyền và Sinh học phân tử
    ('DV055', 'DUMD',   'CLS36'),  -- Dị ứng - Miễn dịch lâm sàng
    ('DV056', 'K49',    'CLS31'),  -- Chống độc
    ('DV059', 'K25',    'CLS23'),  -- Bỏng
    ('DV062', 'K02',    'CLS13'),  -- Cấp cứu
    ('DV063', 'K192',   'CLS16'),  -- Ngoại tổng hợp 2
    ('DV064', 'PDD',    'PCN6'),   -- Điều dưỡng
    ('DV065', 'QLCL',   'PCN9')    -- Quản lý chất lượng
) AS src (id, old_code, new_code)
    ON d.id = src.id AND d.code = src.old_code;

PRINT CONCAT(N'Đã cập nhật mã cho ', @@ROWCOUNT, N' khoa/phòng.');
GO

PRINT N'✅ Migration 2026-10-12_department_codes_from_his hoàn tất.';
GO

-- @migration 2026-10-13_seed_departments_from_excel.sql
/* ============================================================================
 * Thêm danh sách khoa/phòng chuẩn (danh-sach-khoa-phong-20260928.xlsx)
 * ----------------------------------------------------------------------------
 *   - id (DVxxx) do trigger trg_dept_gen_id tự sinh.
 *   - abbreviation = code (cột này UNIQUE, dùng sinh dept_account_id NVxxx).
 *   - Chỉ thêm khoa có code chưa tồn tại ⇒ không đụng tới khoa đã có,
 *     chạy lại nhiều lần an toàn.
 *   - trg_dept_gen_id chỉ chép một số cột, nên unit_type / bed_count được
 *     gán bằng UPDATE sau INSERT (chỉ cho các dòng vừa thêm).
 *   - unit_type theo đúng cột "Loại đơn vị" trong Excel (PCN1/2/3 Excel ghi
 *     là "Khoa").
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;

DECLARE @src TABLE (
    code      VARCHAR(20)   NOT NULL PRIMARY KEY,
    name      NVARCHAR(255) NOT NULL,
    unit_type VARCHAR(20)   NOT NULL,
    bed_count INT           NULL
);

INSERT INTO @src (code, name, unit_type, bed_count) VALUES
    ('CLS51', N'Vi rút - Ký sinh trùng', 'khoa', NULL),
    ('CLS40', N'Phẫu thuật tim mạch - lồng ngực', 'khoa', NULL),
    ('CLS39', N'Huyết học lâm sàng', 'khoa', NULL),
    ('CLS37', N'Nội Tiết', 'khoa', NULL),
    ('CLS17', N'Ngoại tổng hợp 1', 'khoa', NULL),
    ('CLS16', N'Ngoại tổng hợp 2', 'khoa', NULL),
    ('PCN11', N'Tổ công tác xã hội', 'phong', NULL),
    ('PCN9',  N'Quản lý chất lượng', 'phong', NULL),
    ('PCN7',  N'Cơ sở hạ tầng và Trang thiết bị', 'phong', NULL),
    ('PCN4',  N'Trung tâm Đào tạo và Chỉ đạo tuyến', 'trung_tam', NULL),
    ('PCN6',  N'Điều dưỡng', 'phong', NULL),
    ('CLS13', N'Cấp cứu', 'khoa', 5),
    ('PCN10', N'Tổ hành chính quản trị', 'phong', NULL),
    ('CLS23', N'Bỏng', 'khoa', 35),
    ('CLS31', N'Chống độc', 'khoa', 35),
    ('CLS36', N'Dị ứng - Miễn dịch lâm sàng', 'khoa', 30),
    ('CLS3',  N'Di truyền và Sinh học phân tử', 'khoa', NULL),
    ('CLS25', N'Trung tâm Hỗ trợ sinh sản', 'khoa', 8),
    ('PCN2',  N'Tổ chức cán bộ', 'khoa', NULL),
    ('PCN1',  N'Ban Giám đốc', 'khoa', NULL),
    ('CLS32', N'Hồi sức tích cực ngoại khoa', 'khoa', 45),
    ('CLS30', N'Hồi sức tích cực', 'khoa', 55),
    ('PCN3',  N'Kế hoạch tổng hợp', 'khoa', NULL),
    ('CLS9',  N'Giải phẫu bệnh', 'khoa', NULL),
    ('CLS1',  N'Thăm dò chức năng', 'khoa', NULL),
    ('CLS2',  N'Xquang', 'khoa', NULL),
    ('CLS5',  N'Vi sinh - Trung tâm xét nghiệm', 'khoa', NULL),
    ('CLS7',  N'Hóa Sinh - Trung tâm xét nghiệm', 'khoa', NULL),
    ('CLS48', N'Phục hồi chức năng', 'khoa', 45),
    ('CLS29', N'Mắt', 'khoa', 30),
    ('CLS28', N'Răng hàm mặt', 'khoa', 35),
    ('CLS27', N'Tai mũi họng', 'khoa', 50),
    ('CLS24', N'Phụ sản', 'khoa', 90),
    ('CLS18', N'Ngoại Thận - Tiết niệu', 'khoa', 80),
    ('CLS19', N'Ngoại tiêu hóa', 'khoa', 95),
    ('CLS26', N'Nhi - sơ sinh', 'khoa', 70),
    ('CLS47', N'Y học cổ truyền', 'khoa', 35),
    ('CLS46', N'Da liễu', 'khoa', 30),
    ('CLS50', N'Nhiễm khuẩn tổng hợp', 'khoa', 70),
    ('CLS38', N'Nội Thận - Tiết niệu - Lọc máu', 'khoa', 60),
    ('CLS43', N'Nội Cơ - xương - khớp', 'khoa', 65),
    ('CLS34', N'Nội tiêu hóa', 'khoa', 75),
    ('CLS42', N'Nội tim mạch 2', 'khoa', 80),
    ('CLS41', N'Nội tim mạch 1', 'khoa', 80),
    ('CLS33', N'Nội A - Lão khoa', 'khoa', 70),
    ('CLS12', N'Khám bệnh', 'khoa', NULL),
    ('CLS35', N'Nội Dị ứng - Hô hấp', 'khoa', 75),
    ('CLS20', N'Phẫu thuật thần kinh cột sống', 'khoa', 95),
    ('CLS14', N'Gây mê hồi sức', 'khoa', NULL),
    ('PCN5',  N'Tài chính kế toán', 'phong', NULL),
    ('PCN8',  N'Công nghệ thông tin', 'phong', NULL),
    ('CLS6',  N'Huyết học - Trung tâm xét nghiệm', 'khoa', NULL),
    ('CLS45', N'Trung tâm đột quỵ', 'khoa', 75),
    ('CLS49', N'Dinh dưỡng', 'khoa', NULL),
    ('CLS10', N'Kiểm soát nhiễm khuẩn', 'khoa', NULL),
    ('CLS11', N'Dược', 'khoa', NULL),
    ('CLS21', N'Chấn thương - Chỉnh hình', 'khoa', 95),
    ('CLS44', N'Thần kinh', 'khoa', 92),
    ('CLS22', N'Phẫu thuật tạo hình thẩm mỹ', 'khoa', 10);

DECLARE @new TABLE (code VARCHAR(20));
INSERT INTO @new (code)
SELECT s.code FROM @src s
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[departments] d
                  WHERE d.code = s.code OR d.abbreviation = s.code);

INSERT INTO [dbo].[departments] ([name], [code], [abbreviation], [created_by])
SELECT s.name, s.code, s.code, 'SYSTEM'
FROM @src s JOIN @new n ON n.code = s.code;

UPDATE d
SET    d.unit_type = s.unit_type,
       d.bed_count = s.bed_count
FROM [dbo].[departments] d
JOIN @src s ON s.code = d.code
JOIN @new n ON n.code = d.code;

DECLARE @added INT = (SELECT COUNT(*) FROM @new);
PRINT CONCAT(N'Đã thêm ', @added, N' khoa/phòng.');
GO

-- @migration 2026-10-14_department_accounts.sql
/* ============================================================================
 * Tạo tài khoản khoa/phòng cho mọi khoa chưa có (departments.dept_account_id)
 * ----------------------------------------------------------------------------
 * QUY ƯỚC (giữ như các tài khoản khoa cũ)
 *   - id        = 'NV' + departments.code + '0000'
 *                 (sinh mã nhân viên dùng 'NV' + code + NNNN và bỏ qua đuôi
 *                 0000 — xem topicMemberService — nên không đụng nhau)
 *   - username  = LOWER(code)            vd: cls44, pcn8
 *   - full_name = N'Tài khoản ' + tên khoa
 *   - password  = sao chép hash từ tài khoản khoa cũ còn mật khẩu mặc định,
 *                 must_change_password = 1 ⇒ bắt đổi ở lần đăng nhập đầu
 *   - role      = VT07 Trưởng khoa; riêng PCN1 Ban Giám đốc = VT02 Giám đốc,
 *                 PCN4 Trung tâm Đào tạo = VT03 Quản lý NCKH (như trước)
 *
 *   Chỉ tạo cho khoa chưa có tài khoản, bỏ qua nếu id/username đã tồn tại.
 *   Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Không để hash trong repo (CI chặn): lấy từ một tài khoản khoa cũ còn mật
-- khẩu mặc định (chưa đổi ⇒ must_change_password = 1).
DECLARE @default_pw VARCHAR(255) =
    (SELECT TOP 1 u.[password]
     FROM [dbo].[departments] d
     JOIN [dbo].[users] u ON u.[id] = d.[dept_account_id]
     WHERE u.[must_change_password] = 1
     ORDER BY u.[created_at]);

IF @default_pw IS NULL
    THROW 50001, N'Không tìm thấy tài khoản khoa cũ còn mật khẩu mặc định để sao chép.', 1;

DECLARE @acc TABLE (dept_id VARCHAR(20), user_id VARCHAR(20),
                    username VARCHAR(100), full_name NVARCHAR(255), role_id VARCHAR(6));

INSERT INTO @acc (dept_id, user_id, username, full_name, role_id)
SELECT d.id,
       'NV' + d.code + '0000',
       LOWER(d.code),
       N'Tài khoản ' + d.name,
       CASE d.code WHEN 'PCN1' THEN 'VT02'
                   WHEN 'PCN4' THEN 'VT03'
                   ELSE 'VT07' END
FROM [dbo].[departments] d
WHERE d.dept_account_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM [dbo].[users] u
                  WHERE u.id = 'NV' + d.code + '0000'
                     OR u.username = LOWER(d.code));

INSERT INTO [dbo].[users]
    ([id], [username], [password], [full_name], [department_id], [role_id],
     [is_active], [must_change_password], [created_by])
SELECT user_id, username, @default_pw, full_name, dept_id, role_id, 1, 1, 'SYSTEM'
FROM @acc;

UPDATE d
SET    d.dept_account_id = a.user_id,
       d.updated_at      = GETDATE(),
       d.updated_by      = 'SYSTEM'
FROM [dbo].[departments] d
JOIN @acc a ON a.dept_id = d.id;

COMMIT;

DECLARE @created INT = (SELECT COUNT(*) FROM @acc);
PRINT CONCAT(N'Đã tạo ', @created, N' tài khoản khoa/phòng.');
GO

-- @migration 2026-10-15_seed_cme_credit_catalog.sql
/* ============================================================================
 * Seed danh mục quy đổi CME: 5 nhóm hoạt động + 29 loại hình thức
 * ----------------------------------------------------------------------------
 *   - cme_credit_groups.id = CME_DAOTAO, CME_QUYTRINH, CME_VBPL, CME_NCKH,
 *     CME_KHAC. Bản seed đầu dùng CMEG01..05 — mục 0 tự đổi sang mã mới.
 *   - cme_credit_categories.id = mã loại hình thức (DT_KHOAHOC, HT_CHUTRI...).
 *   - conversion_method: per_session = Theo tiết, fixed = Cố định,
 *     per_year = Theo năm. conversion_value = số giờ, unit_label = đơn vị
 *     (hiển thị "giờ/<unit_label>").
 *   - Chỉ thêm dòng chưa có (theo id) ⇒ không ghi đè chỉnh sửa của admin,
 *     chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 0. Đổi mã nhóm cũ CMEG01..05 (bản seed đầu) sang mã mới
DECLARE @map TABLE (old_id VARCHAR(20), new_id VARCHAR(20));
INSERT INTO @map VALUES ('CMEG01','CME_DAOTAO'), ('CMEG02','CME_QUYTRINH'),
                        ('CMEG03','CME_VBPL'),   ('CMEG04','CME_NCKH'),
                        ('CMEG05','CME_KHAC');
INSERT INTO [dbo].[cme_credit_groups] ([id], [name], [description], [sort_order], [created_at], [created_by], [updated_at], [updated_by])
SELECT m.new_id, g.name, g.description, g.sort_order, g.created_at, g.created_by, GETDATE(), 'SYSTEM'
FROM [dbo].[cme_credit_groups] g JOIN @map m ON m.old_id = g.id
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[cme_credit_groups] x WHERE x.id = m.new_id);
UPDATE c SET c.group_id = m.new_id
FROM [dbo].[cme_credit_categories] c JOIN @map m ON m.old_id = c.group_id;
DELETE g FROM [dbo].[cme_credit_groups] g JOIN @map m ON m.old_id = g.id;

INSERT INTO [dbo].[cme_credit_groups] ([id], [name], [sort_order], [created_by])
SELECT v.id, v.name, v.sort_order, 'SYSTEM'
FROM (VALUES
    ('CME_DAOTAO', N'Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo về y khoa', 1),
    ('CME_QUYTRINH', N'Tham gia soạn thảo quy trình chuyên môn', 2),
    ('CME_VBPL', N'Tham gia soạn thảo văn bản quy phạm pháp luật ban hành quy trình chuyên môn', 3),
    ('CME_NCKH', N'Nghiên cứu khoa học, giảng dạy về y khoa', 4),
    ('CME_KHAC', N'Tự cập nhật kiến thức y khoa và các hình thức khác', 5)
) AS v (id, name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[cme_credit_groups] g WHERE g.id = v.id);

INSERT INTO [dbo].[cme_credit_categories]
    ([id], [name], [group_id], [conversion_method], [conversion_value], [unit_label], [created_by])
SELECT v.id, v.name, v.group_id, v.method, v.value, v.unit, 'SYSTEM'
FROM (VALUES
    ('DT_KHOAHOC',         N'Khóa đào tạo, bồi dưỡng ngắn hạn (học viên/giảng viên)',            'CME_DAOTAO', 'per_session', 1,   N'tiết'),
    ('HT_CHUTRI',          N'Hội nghị, hội thảo — Chủ trì',                                       'CME_DAOTAO', 'fixed',       2,   N'buổi'),
    ('HT_BAOCAOVIEN',      N'Hội nghị, hội thảo — Báo cáo viên (kể cả chuẩn bị báo cáo)',         'CME_DAOTAO', 'fixed',       2,   N'báo cáo'),
    ('HT_DAIBIEU',         N'Hội nghị, hội thảo — Đại biểu',                                      'CME_DAOTAO', 'fixed',       1.5, N'buổi'),
    ('KHAC_CME_DAOTAO',    N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_DAOTAO', 'fixed',       0,   N'lần'),
    ('QT_TRUONGPHO',       N'Soạn thảo quy trình — Trưởng/Phó ban hoặc tổ soạn thảo',             'CME_QUYTRINH', 'fixed',       5,   N'tài liệu'),
    ('QT_THANHVIEN',       N'Soạn thảo quy trình — Thành viên ban soạn thảo/biên tập',            'CME_QUYTRINH', 'fixed',       2,   N'tài liệu'),
    ('KHAC_CME_QUYTRINH',  N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_QUYTRINH', 'fixed',       0,   N'lần'),
    ('VBPL_TRUONGPHO',     N'Soạn thảo VBQPPL — Trưởng/Phó ban hoặc tổ soạn thảo',                'CME_VBPL', 'fixed',       5,   N'văn bản'),
    ('VBPL_THANHVIEN',     N'Soạn thảo VBQPPL — Thành viên ban soạn thảo/biên tập',               'CME_VBPL', 'fixed',       3,   N'văn bản'),
    ('KHAC_CME_VBPL',      N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_VBPL', 'fixed',       0,   N'lần'),
    ('NCKH_CHUTRI_CAOCAP', N'Nhiệm vụ KH&CN/sáng kiến cấp Nhà nước/Bộ/Tỉnh — Chủ trì/thư ký',     'CME_NCKH', 'fixed',       12,  N'nhiệm vụ'),
    ('NCKH_CHUTRI_COSO',   N'Nhiệm vụ KH&CN/sáng kiến cấp cơ sở — Chủ trì/thư ký',                'CME_NCKH', 'fixed',       8,   N'nhiệm vụ'),
    ('NCKH_THANHVIEN',     N'Nhiệm vụ KH&CN/sáng kiến các cấp — Thành viên',                      'CME_NCKH', 'fixed',       4,   N'nhiệm vụ'),
    ('BB_QT_C1',           N'Bài báo khoa học quốc tế — Tác giả chính/chịu trách nhiệm',          'CME_NCKH', 'fixed',       8,   N'bài'),
    ('BB_QT_C2',           N'Bài báo khoa học quốc tế — Tác giả thứ hai trở đi',                  'CME_NCKH', 'fixed',       2,   N'bài'),
    ('BB_TN_C1',           N'Bài báo khoa học trong nước — Tác giả chính/chịu trách nhiệm',       'CME_NCKH', 'fixed',       4,   N'bài'),
    ('BB_TN_C2',           N'Bài báo khoa học trong nước — Tác giả thứ hai trở đi',               'CME_NCKH', 'fixed',       1,   N'bài'),
    ('GIANGDAY',           N'Giảng dạy về y khoa (kể cả chuẩn bị bài giảng)',                     'CME_NCKH', 'per_session', 1,   N'tiết'),
    ('KHAC_CME_NCKH',      N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_NCKH', 'fixed',       0,   N'lần'),
    ('HD_LUANVAN',         N'Hướng dẫn luận văn',                                                 'CME_KHAC', 'fixed',       4,   N'luận văn'),
    ('HD_LUANAN',          N'Hướng dẫn luận án',                                                  'CME_KHAC', 'per_year',    4,   N'năm'),
    ('HDONG_CHUTICH',      N'Tham gia hội đồng — Chủ tịch',                                       'CME_KHAC', 'fixed',       3,   N'hội đồng'),
    ('HDONG_THUKY',        N'Tham gia hội đồng — Thư ký/phản biện',                               'CME_KHAC', 'fixed',       2,   N'hội đồng'),
    ('HDONG_THANHVIEN',    N'Tham gia hội đồng — Thành viên',                                     'CME_KHAC', 'fixed',       1,   N'hội đồng'),
    ('SHCM_CABENH',        N'Sinh hoạt chuyên môn — Hội chẩn/phân tích ca bệnh',                  'CME_KHAC', 'fixed',       1,   N'ca bệnh'),
    ('HOC_VANBANG',        N'Đang học khóa đào tạo cấp văn bằng (trong/ngoài nước)',              'CME_KHAC', 'per_year',    24,  N'năm'),
    ('HOC_CHUNGCHI',       N'Đang học khóa đào tạo cấp chứng chỉ chuyên khoa/kỹ thuật',           'CME_KHAC', 'per_session', 1,   N'tiết'),
    ('KHAC_CME_KHAC',      N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_KHAC', 'fixed',       0,   N'lần')
) AS v (id, name, group_id, method, value, unit)
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[cme_credit_categories] c WHERE c.id = v.id);

COMMIT;
PRINT N'✅ Seed danh mục quy đổi CME hoàn tất.';
GO

-- @migration 2026-10-16_public_topic_null_creator.sql
/* ============================================================================
 * Cho phép created_by = NULL ở topics / topic_members / approvals
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đăng ký đề tài trên cổng công khai (/de-xuat-de-tai) không có tài khoản
 *   đứng sau ⇒ actor = NULL (giống trainees/course_enrollments khi đăng ký
 *   khoá học công khai). Ba cột này NOT NULL nên INSERT lỗi:
 *   "Cannot insert the value NULL into column 'created_by', table 'topics'".
 *   FK_topic_creator vẫn giữ (NULL không bị kiểm tra FK). Các thủ tục gửi
 *   thông báo đã lọc "created_by IS NOT NULL".
 *
 *   topics.created_by nằm trong 2 index ⇒ phải drop rồi tạo lại quanh ALTER.
 *   Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET XACT_ABORT ON;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.topics') AND name = 'created_by' AND is_nullable = 0)
BEGIN
    BEGIN TRANSACTION;
    DROP INDEX idx_topics_created_by   ON [dbo].[topics];
    DROP INDEX idx_topics_round_status ON [dbo].[topics];
    ALTER TABLE [dbo].[topics] ALTER COLUMN created_by VARCHAR(20) NULL;
    CREATE NONCLUSTERED INDEX idx_topics_created_by ON [dbo].[topics](created_by);
    CREATE NONCLUSTERED INDEX idx_topics_round_status ON [dbo].[topics](round_id, status)
        INCLUDE (title, department_id, category_id, level_id, created_by, created_at);
    COMMIT TRANSACTION;
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.topic_members') AND name = 'created_by' AND is_nullable = 0)
    ALTER TABLE [dbo].[topic_members] ALTER COLUMN created_by VARCHAR(20) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approvals') AND name = 'created_by' AND is_nullable = 0)
    ALTER TABLE [dbo].[approvals] ALTER COLUMN created_by VARCHAR(20) NULL;
GO

PRINT N'✅ Migration 2026-10-16_public_topic_null_creator hoàn tất.';
GO

-- @migration 2026-10-17_research_round_levels.sql
/* ============================================================================
 * Cấp độ đề tài cấu hình riêng theo từng đợt (research_round_levels)
 * ----------------------------------------------------------------------------
 * - Chọn ngay khi tạo/sửa đợt nghiên cứu. Form đăng ký đề tài chỉ hiển thị
 *   các cấp độ này.
 * - Đợt CHƯA cấu hình cấp độ nào ⇒ dùng cấp độ của loại đợt (round_type_levels);
 *   loại đợt cũng chưa cấu hình ⇒ cho phép tất cả (fallback).
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

IF OBJECT_ID(N'dbo.research_round_levels', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.research_round_levels (
        round_id   VARCHAR(10)  NOT NULL,
        level_id   VARCHAR(5)   NOT NULL,
        created_at DATETIME2(7) NOT NULL
            CONSTRAINT DF_rrl_created_at DEFAULT GETDATE(),
        CONSTRAINT PK_research_round_levels PRIMARY KEY (round_id, level_id),
        CONSTRAINT FK_rrl_round FOREIGN KEY (round_id)
            REFERENCES dbo.research_rounds (id) ON DELETE CASCADE,
        CONSTRAINT FK_rrl_level FOREIGN KEY (level_id)
            REFERENCES dbo.levels (id) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX idx_rrl_level ON dbo.research_round_levels (level_id);
END
GO

-- @migration 2026-10-18_gender_codes.sql
/* ============================================================================
 * Chuẩn hoá giới tính về mã ASCII: male / female / other
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Cột gender (trainees, lecturers, persons, seminar_participants) là
 *   VARCHAR(10). Form admin học viên ghi 'male'/'female', nhưng import Excel,
 *   form đăng ký công khai, form người tham dự hội thảo ghi nhãn "Nam"/"Nữ"
 *   → "Nữ" mất dấu thành "N?" và FE không hiển thị được.
 *   Từ nay mọi đường ghi đi qua backend/src/utils/gender.js (normalizeGender).
 *   seminar_participants: SET updated_at = updated_at để trigger audit không
 *   bump cột này.
 *
 *   Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

UPDATE [dbo].[trainees] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

UPDATE [dbo].[lecturers] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

UPDATE [dbo].[persons] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

UPDATE [dbo].[seminar_participants] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END, updated_at = updated_at
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

-- @migration 2026-10-19_exam_paper_type.sql
/* ============================================================================
 * Loại đề thi: trắc nghiệm / tự luận
 * ----------------------------------------------------------------------------
 *   exam_papers.paper_type: 'multiple_choice' (chỉ câu single_choice) hoặc
 *   'essay' (chỉ câu tự luận). NULL = đề tạo trước migration này (hỗn hợp) —
 *   service không lọc loại câu cho các đề đó.
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.exam_papers', N'U') IS NOT NULL AND COL_LENGTH('exam_papers', 'paper_type') IS NULL
BEGIN
    ALTER TABLE [dbo].[exam_papers] ADD [paper_type] VARCHAR(20) NULL
        CONSTRAINT CHK_exampapers_type CHECK ([paper_type] IN ('multiple_choice', 'essay'));
END
GO

PRINT N'✅ Migration 2026-10-19_exam_paper_type hoàn tất.';
GO

-- @migration 2026-10-20_checkin_device.sql
/* ============================================================================
 * Điểm danh QR: ràng buộc thiết bị
 * ----------------------------------------------------------------------------
 *   attendance.checkin_device_id / seminar_participants.checkin_device_id —
 *   mã thiết bị (FE sinh ngẫu nhiên, lưu localStorage) của lượt tự quét QR.
 *   Service chặn 1 thiết bị điểm danh cho 2 tài khoản khác nhau trong cùng
 *   buổi học / hội thảo (điểm danh hộ bằng tài khoản người khác).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.attendance', N'checkin_device_id') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [checkin_device_id] VARCHAR(64) NULL;
GO
IF COL_LENGTH(N'dbo.seminar_participants', N'checkin_device_id') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD [checkin_device_id] VARCHAR(64) NULL;
GO

PRINT N'✅ Migration 2026-10-20_checkin_device hoàn tất.';
GO

-- @migration 2026-10-21_seminar_registration.sql
/* ============================================================================
 * Hội nghị: đăng ký qua QR → vé QR điểm danh → bài test cuối buổi → CME
 * ----------------------------------------------------------------------------
 *   seminars.public_token    : mã ngẫu nhiên trong link/QR đăng ký công khai
 *                              (/hoi-nghi/<token>) — sinh khi tạo hội nghị.
 *   seminars.test_questions  : JSON [{ q, options: [..], answer: <index> }]
 *   seminars.test_open       : ban tổ chức mở bài test (cuối buổi)
 *   seminar_participants.ticket_code : mã vé cá nhân (QR người tham dự lưu
 *                              về máy) — chỉ có ở người tự đăng ký qua QR.
 *   phone / email            : liên hệ người tự đăng ký.
 *   test_*                   : kết quả bài test (1 lần nộp).
 *   Người có ticket_code chỉ được cấp CME khi đã điểm danh + nộp bài test
 *   (seminarParticipantService.issueCme).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'public_token') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [public_token] VARCHAR(32) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'test_questions') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_questions] NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'test_open') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_open] BIT NOT NULL CONSTRAINT DF_seminars_test_open DEFAULT (0);
GO
UPDATE [dbo].[seminars]
SET public_token = LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''))
WHERE public_token IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_seminars_public_token' AND object_id = OBJECT_ID(N'dbo.seminars'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_seminars_public_token ON dbo.seminars (public_token) WHERE public_token IS NOT NULL;
GO

IF COL_LENGTH(N'dbo.seminar_participants', N'ticket_code') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD
        [ticket_code]       VARCHAR(32)   NULL,
        [phone]             VARCHAR(20)   NULL,
        [email]             NVARCHAR(255) NULL,
        [test_answers]      NVARCHAR(MAX) NULL,
        [test_correct]      INT           NULL,
        [test_total]        INT           NULL,
        [test_submitted_at] DATETIME      NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_sp_ticket_code' AND object_id = OBJECT_ID(N'dbo.seminar_participants'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_sp_ticket_code ON dbo.seminar_participants (ticket_code) WHERE ticket_code IS NOT NULL;
GO

PRINT N'✅ Migration 2026-10-21_seminar_registration hoàn tất.';
GO

-- @migration 2026-10-22_trainee_hidden.sql
/* Xoá học viên = ẩn khỏi danh sách (trainees.hidden_at). Idempotent. */
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.trainees', N'hidden_at') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [hidden_at] DATETIME2 NULL;
GO

-- @migration 2026-10-23_cme_record_approval.sql
/* ============================================================================
 * cme_records — người dùng tự khai, admin duyệt mới được tính tín chỉ
 * ----------------------------------------------------------------------------
 *   approval_status: pending | approved | rejected (bản ghi cũ/admin tạo = approved)
 *   Chỉ 'approved' được cộng vào tín chỉ CME. Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.cme_records', 'approval_status') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [approval_status] VARCHAR(20) NOT NULL
        CONSTRAINT DF_cme_records_approval DEFAULT 'approved'
        CONSTRAINT CHK_cme_records_approval CHECK ([approval_status] IN ('pending','approved','rejected'));
IF COL_LENGTH('dbo.cme_records', 'reviewed_by') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [reviewed_by] VARCHAR(20) NULL, [reviewed_at] DATETIME NULL, [reject_reason] NVARCHAR(500) NULL;
GO

-- @migration 2026-10-24_password_reset_otp.sql
/* Quên mật khẩu bằng OTP gửi qua email (services/passwordResetService.js).
 * Idempotent. */
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID('dbo.password_reset_otps', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.password_reset_otps (
        user_id    VARCHAR(20) NOT NULL PRIMARY KEY
                   CONSTRAINT FK_pwreset_user REFERENCES dbo.users(id) ON DELETE CASCADE,
        code_hash  CHAR(64)    NOT NULL,
        attempts   INT         NOT NULL CONSTRAINT DF_pwreset_attempts DEFAULT 0,
        expires_at DATETIME2   NOT NULL,
        created_at DATETIME2   NOT NULL CONSTRAINT DF_pwreset_created DEFAULT SYSUTCDATETIME()
    );
END
GO

-- @migration 2026-10-25_users_email_unique.sql
/* Email không trùng giữa các tài khoản — cần cho đăng nhập / quên mật khẩu bằng
 * email (authService.login, passwordResetService). Bỏ qua NULL và chuỗi rỗng.
 * So khớp theo collation của cột (thường không phân biệt hoa/thường).
 * Schema gốc có thể đã có UQ_users_email (không nằm trong repo) → khi đó bỏ qua.
 * Idempotent.
 * Nếu đang có email trùng, bước tạo index sẽ lỗi — liệt kê bằng:
 *   SELECT email, COUNT(*) FROM users WHERE email <> '' GROUP BY email HAVING COUNT(*) > 1; */
USE [RMS_HOSPITAL];
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
    WHERE i.object_id = OBJECT_ID('dbo.users') AND i.is_unique = 1
      AND COL_NAME(ic.object_id, ic.column_id) = 'email'
      AND (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id = i.object_id AND x.index_id = i.index_id AND x.key_ordinal > 0) = 1
)
    CREATE UNIQUE INDEX UX_users_email ON dbo.users(email) WHERE email IS NOT NULL AND email <> '';
GO

-- @migration 2026-10-26_system_settings_created.sql
/* Bổ sung cột created_at / created_by cho system_settings — 2026-09-14_system_settings.sql
 * chỉ tạo updated_at / updated_by, trong khi systemSettingService.update() (MERGE …
 * WHEN NOT MATCHED THEN INSERT) ghi created_by → lỗi "Invalid column name 'created_by'"
 * mỗi lần lưu cấu hình (SQL Server biên dịch cả nhánh INSERT dù key đã tồn tại).
 * created_by NULL được — các dòng seed sẵn không có người tạo.
 * Idempotent. */
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NOT NULL AND COL_LENGTH('dbo.system_settings', 'created_at') IS NULL
    ALTER TABLE [dbo].[system_settings] ADD [created_at] DATETIME NOT NULL
        CONSTRAINT DF_system_settings_created_at DEFAULT (GETDATE());
GO

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NOT NULL AND COL_LENGTH('dbo.system_settings', 'created_by') IS NULL
    ALTER TABLE [dbo].[system_settings] ADD [created_by] VARCHAR(20) NULL;
GO

-- @migration 2026-10-27_question_image.sql
/* Ảnh minh hoạ cho câu hỏi trong ngân hàng câu hỏi (đề kiểm tra Đào tạo).
 *   question_bank.image_url: đường dẫn "/uploads/questions/<file>" — NULL = câu
 *   không có hình. Ảnh tải lên qua POST /exams/questions/image.
 *   (Bài test hội nghị lưu ảnh ngay trong JSON seminars.test_questions —
 *   trường "image" — nên không cần cột mới.)
 * Idempotent. */
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.question_bank', N'U') IS NOT NULL AND COL_LENGTH('dbo.question_bank', 'image_url') IS NULL
    ALTER TABLE [dbo].[question_bank] ADD [image_url] NVARCHAR(500) NULL;
GO

PRINT N'✅ Migration 2026-10-27_question_image hoàn tất.';
GO

-- @migration 2026-10-28_staff_license_scope_adjustment.sql
/* ============================================================================
 * CCHN — điều chỉnh/bổ sung phạm vi hoạt động chuyên môn
 * ----------------------------------------------------------------------------
 * File "Danh sách người hành nghề" (xuất từ phần mềm Sở Y tế) có 3 cột mà
 * staff_practice_licenses chưa lưu: Quyết định bổ sung phạm vi, Điều chỉnh phạm
 * vi HĐCM trong CCHN, Ngày điều chỉnh phạm vi. Script idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.staff_practice_licenses', 'scope_decision_no') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [scope_decision_no] NVARCHAR(100) NULL; -- QĐ bổ sung phạm vi
GO
IF COL_LENGTH('dbo.staff_practice_licenses', 'adjusted_scope') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [adjusted_scope] NVARCHAR(500) NULL; -- phạm vi HĐCM sau điều chỉnh
GO
IF COL_LENGTH('dbo.staff_practice_licenses', 'scope_adjusted_date') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [scope_adjusted_date] DATE NULL;
GO

PRINT N'✅ Migration 2026-10-28_staff_license_scope_adjustment hoàn tất.';
GO

-- @migration 2026-10-29_staff_attendance.sql
/* ============================================================================
 * Chấm công nhân viên hằng ngày (IP mạng bệnh viện + GPS trong bán kính)
 * ----------------------------------------------------------------------------
 *   1 dòng / người / ngày: giờ vào = lần chấm đầu, giờ ra = lần chấm cuối.
 *   Lưu IP và khoảng cách tới bệnh viện (m) lúc chấm để đối chiếu khi khiếu nại
 *   — không lưu toạ độ thô.
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.staff_attendance', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[staff_attendance] (
        [id]                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_staff_attendance PRIMARY KEY,
        [user_id]              VARCHAR(20) NOT NULL
                               CONSTRAINT FK_staff_attendance_user REFERENCES [dbo].[users](id) ON DELETE CASCADE,
        [work_date]            DATE        NOT NULL,
        [check_in_at]          DATETIME2   NOT NULL,
        [check_in_ip]          VARCHAR(45) NULL,
        [check_in_distance_m]  INT         NULL,
        [check_out_at]         DATETIME2   NULL,
        [check_out_ip]         VARCHAR(45) NULL,
        [check_out_distance_m] INT         NULL,
        CONSTRAINT UQ_staff_attendance_user_date UNIQUE (user_id, work_date)
    );
    CREATE INDEX IX_staff_attendance_date ON [dbo].[staff_attendance](work_date);
END
GO

PRINT N'✅ Migration 2026-10-29_staff_attendance hoàn tất.';
GO

-- @migration 2026-10-30_attendance_shifts.sql
/* ============================================================================
 * Chấm công theo ca làm việc
 * ----------------------------------------------------------------------------
 *   work_shifts        Ca làm: giờ vào/ra (end <= start = qua đêm, bằng nhau = 24 giờ),
 *                      khoảng được chấm vào sớm / chấm ra muộn, du di đi muộn/về sớm.
 *   shift_patterns     Mẫu ca tuần: days = JSON {"1":[shift_id…],…,"7":[…]} (1 = Thứ 2).
 *                      users.shift_pattern_id = mẫu của từng người; NULL = mẫu mặc định
 *                      (is_default = 1, tối đa 1 mẫu).
 *   shift_assignments  Phân ca theo ngày, ghi đè mẫu tuần của ngày đó. shift_id NULL = nghỉ.
 *   staff_attendance   Thêm shift_id + ảnh chụp giờ ca lúc chấm + phút đi muộn/về sớm;
 *                      1 dòng / người / ngày bắt đầu ca / ca (shift_id NULL = chấm tự do).
 *   Không có mẫu lẫn phân ca = chấm tự do như trước.
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.work_shifts', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[work_shifts] (
        [id]                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_shifts PRIMARY KEY,
        [name]               NVARCHAR(100) NOT NULL,
        [code]               NVARCHAR(10)  NOT NULL,
        [color]              VARCHAR(20)   NULL,
        [start_time]         CHAR(5)       NOT NULL,
        [end_time]           CHAR(5)       NOT NULL,
        [checkin_before_min] INT           NOT NULL CONSTRAINT DF_work_shifts_before DEFAULT 30,
        [checkout_after_min] INT           NOT NULL CONSTRAINT DF_work_shifts_after DEFAULT 120,
        [grace_min]          INT           NOT NULL CONSTRAINT DF_work_shifts_grace DEFAULT 5,
        [is_active]          BIT           NOT NULL CONSTRAINT DF_work_shifts_active DEFAULT 1,
        [created_at]         DATETIME2     NOT NULL CONSTRAINT DF_work_shifts_created DEFAULT SYSUTCDATETIME(),
        [updated_at]         DATETIME2     NULL
    );
END
GO

IF OBJECT_ID(N'dbo.shift_patterns', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[shift_patterns] (
        [id]         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_shift_patterns PRIMARY KEY,
        [name]       NVARCHAR(100) NOT NULL,
        [days]       NVARCHAR(MAX) NOT NULL,
        [is_default] BIT           NOT NULL CONSTRAINT DF_shift_patterns_default DEFAULT 0,
        [created_at] DATETIME2     NOT NULL CONSTRAINT DF_shift_patterns_created DEFAULT SYSUTCDATETIME(),
        [updated_at] DATETIME2     NULL
    );
    CREATE UNIQUE INDEX UX_shift_patterns_default ON [dbo].[shift_patterns](is_default) WHERE is_default = 1;
END
GO

IF COL_LENGTH(N'dbo.users', N'shift_pattern_id') IS NULL
    ALTER TABLE [dbo].[users] ADD [shift_pattern_id] INT NULL
        CONSTRAINT FK_users_shift_pattern REFERENCES [dbo].[shift_patterns](id) ON DELETE SET NULL;
GO

IF OBJECT_ID(N'dbo.shift_assignments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[shift_assignments] (
        [id]         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_shift_assignments PRIMARY KEY,
        [user_id]    VARCHAR(20) NOT NULL
                     CONSTRAINT FK_shift_assignments_user REFERENCES [dbo].[users](id) ON DELETE CASCADE,
        [work_date]  DATE        NOT NULL,
        [shift_id]   INT         NULL
                     CONSTRAINT FK_shift_assignments_shift REFERENCES [dbo].[work_shifts](id),
        [updated_by] VARCHAR(20) NULL,
        [updated_at] DATETIME2   NOT NULL CONSTRAINT DF_shift_assignments_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_shift_assignments UNIQUE (user_id, work_date, shift_id)
    );
    CREATE INDEX IX_shift_assignments_date ON [dbo].[shift_assignments](work_date);
END
GO

IF COL_LENGTH(N'dbo.staff_attendance', N'shift_id') IS NULL
    ALTER TABLE [dbo].[staff_attendance] ADD
        [shift_id]       INT           NULL,
        [shift_name]     NVARCHAR(100) NULL,
        [shift_code]     NVARCHAR(10)  NULL,
        [shift_start_at] DATETIME2     NULL,
        [shift_end_at]   DATETIME2     NULL,
        [late_min]       INT           NULL,
        [early_min]      INT           NULL;
GO

IF OBJECT_ID(N'dbo.UQ_staff_attendance_user_date', N'UQ') IS NOT NULL
    ALTER TABLE [dbo].[staff_attendance] DROP CONSTRAINT UQ_staff_attendance_user_date;
IF OBJECT_ID(N'dbo.UQ_staff_attendance_user_date_shift', N'UQ') IS NULL
    ALTER TABLE [dbo].[staff_attendance] ADD CONSTRAINT UQ_staff_attendance_user_date_shift UNIQUE (user_id, work_date, shift_id);
GO

PRINT N'✅ Migration 2026-10-30_attendance_shifts hoàn tất.';
GO

-- @migration 2026-10-31_seminar_schedule_agenda.sql
/* ============================================================================
 * Hội nghị: giờ bắt đầu/kết thúc, khung giờ bài test cuối buổi, chương trình
 * (danh sách bài học / bài báo cáo)
 * ----------------------------------------------------------------------------
 *   seminars.start_time / end_time : giờ bắt đầu (ngày start_date) và giờ kết
 *                              thúc (ngày end_date) — 'HH:mm', VARCHAR(5) như
 *                              class_sessions để tránh lệch múi giờ của kiểu TIME.
 *   seminars.test_date       : ngày làm bài test (trống = ngày kết thúc / bắt đầu)
 *   seminars.test_start_time / test_end_time : khung giờ làm bài test. Khi bài
 *                              test đang bật (test_open = 1) và có khung giờ thì
 *                              chỉ làm được trong khung giờ đó (tự mở / tự đóng).
 *   seminars.agenda          : JSON [{ title, speaker?, date?, start_time?, end_time?, note? }]
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'start_time') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [start_time] VARCHAR(5) NULL, [end_time] VARCHAR(5) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'test_date') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_date] DATE NULL,
        [test_start_time] VARCHAR(5) NULL, [test_end_time] VARCHAR(5) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'agenda') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [agenda] NVARCHAR(MAX) NULL;
GO

PRINT N'✅ Migration 2026-10-31_seminar_schedule_agenda hoàn tất.';
GO

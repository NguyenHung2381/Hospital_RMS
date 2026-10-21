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

/* ============================================================================
 * 2026-12-03_danh_muc_thuc_hanh_gphn
 * ----------------------------------------------------------------------------
 *   3 danh mục cho hồ sơ thực hành GPHN (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ2B):
 *   - professional_fields  Lĩnh vực chuyên môn
 *   - practice_forms       Hình thức hành nghề
 *   - sending_units        Đơn vị cử đi
 *   Hồ sơ (course_enrollments) VẪN lưu chữ ở professional_field / practice_form /
 *   sending_unit (in giấy tờ, xuất / nhập sổ Excel dùng nguyên) — danh mục là
 *   danh sách để chọn, giá trị chọn được chép thành chữ vào hồ sơ.
 *   training_programs thêm lĩnh vực / hình thức MẶC ĐỊNH của chương trình để
 *   tự điền khi ghi danh / đổi chương trình / tự xếp vòng.
 *   Chép các giá trị chữ đang có trong hồ sơ vào danh mục; mặc định của chương
 *   trình = cặp lĩnh vực + hình thức hay gặp nhất trong hồ sơ của chương trình đó.
 * Idempotent — mỗi bước tự kiểm tra (OBJECT_ID / COL_LENGTH / sys.indexes)
 * nên chạy lại nhiều lần an toàn. Chỉ THÊM (bảng/cột/index).
 * ==========================================================================*/

IF OBJECT_ID(N'dbo.professional_fields', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[professional_fields] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(200)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_professional_fields_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME2      NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

IF OBJECT_ID(N'dbo.practice_forms', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[practice_forms] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(300)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_practice_forms_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME2      NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

IF OBJECT_ID(N'dbo.sending_units', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[sending_units] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(200)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_sending_units_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME2      NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

-- Tên không trùng (nhập sổ Excel tự thêm tên mới vào danh mục theo tên)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_professional_fields_name')
    CREATE UNIQUE INDEX UQ_professional_fields_name ON [dbo].[professional_fields] ([name]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_practice_forms_name')
    CREATE UNIQUE INDEX UQ_practice_forms_name ON [dbo].[practice_forms] ([name]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_sending_units_name')
    CREATE UNIQUE INDEX UQ_sending_units_name ON [dbo].[sending_units] ([name]);
GO

IF COL_LENGTH(N'dbo.training_programs', N'professional_field_id') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD
        [professional_field_id] VARCHAR(20) NULL
            CONSTRAINT FK_trprog_professional_field FOREIGN KEY REFERENCES [dbo].[professional_fields] (id);
GO
IF COL_LENGTH(N'dbo.training_programs', N'practice_form_id') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD
        [practice_form_id] VARCHAR(20) NULL
            CONSTRAINT FK_trprog_practice_form FOREIGN KEY REFERENCES [dbo].[practice_forms] (id);
GO

-- Chép giá trị chữ đang có trong hồ sơ vào danh mục
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO [dbo].[professional_fields] (id, name)
SELECT LEFT(REPLACE(NEWID(), '-', ''), 20), v
FROM (SELECT DISTINCT LTRIM(RTRIM(professional_field)) AS v FROM [dbo].[course_enrollments]) s
WHERE v <> '' AND NOT EXISTS (SELECT 1 FROM [dbo].[professional_fields] x WHERE x.name = s.v);

INSERT INTO [dbo].[practice_forms] (id, name)
SELECT LEFT(REPLACE(NEWID(), '-', ''), 20), v
FROM (SELECT DISTINCT LTRIM(RTRIM(practice_form)) AS v FROM [dbo].[course_enrollments]) s
WHERE v <> '' AND NOT EXISTS (SELECT 1 FROM [dbo].[practice_forms] x WHERE x.name = s.v);

INSERT INTO [dbo].[sending_units] (id, name)
SELECT LEFT(REPLACE(NEWID(), '-', ''), 20), v
FROM (SELECT DISTINCT LTRIM(RTRIM(sending_unit)) AS v FROM [dbo].[course_enrollments]) s
WHERE v <> '' AND NOT EXISTS (SELECT 1 FROM [dbo].[sending_units] x WHERE x.name = s.v);

-- Mặc định của chương trình: cặp hay gặp nhất trong hồ sơ của chương trình (chưa đặt thì mới điền)
UPDATE tp
SET professional_field_id = ISNULL(tp.professional_field_id, pf.id),
    practice_form_id = ISNULL(tp.practice_form_id, f.id)
FROM [dbo].[training_programs] tp
CROSS APPLY (
    SELECT TOP 1 LTRIM(RTRIM(e.professional_field)) AS field, LTRIM(RTRIM(e.practice_form)) AS form
    FROM [dbo].[course_enrollments] e
    WHERE e.program_id = tp.id AND e.professional_field IS NOT NULL AND e.practice_form IS NOT NULL
    GROUP BY LTRIM(RTRIM(e.professional_field)), LTRIM(RTRIM(e.practice_form))
    ORDER BY COUNT(*) DESC) u
LEFT JOIN [dbo].[professional_fields] pf ON pf.name = u.field
LEFT JOIN [dbo].[practice_forms] f ON f.name = u.form
WHERE tp.professional_field_id IS NULL OR tp.practice_form_id IS NULL;

COMMIT;
GO

/* ============================================================================
 * 2026-12-11_cau_hinh_form
 * ----------------------------------------------------------------------------
 *   Cấu hình form nhập liệu qua UI (trang Cấu hình form — features/form-config).
 *
 *   form_configs        1 dòng / nhóm form (vd 'topic'), config = JSON chỉ chứa
 *                       phần GHI ĐÈ so với mặc định ở modules/forms/formRegistry.js
 *                       (ẩn/hiện, bắt buộc, nhãn, ràng buộc, trường tùy chỉnh).
 *                       Không có dòng = form chạy y như trước.
 *   form_custom_values  Giá trị trường tùy chỉnh của từng bản ghi (JSON
 *                       { "cf_xxx": giá trị }) — dùng chung cho mọi form, không
 *                       thêm cột vào bảng nghiệp vụ.
 *
 * Idempotent — mỗi bước tự kiểm tra OBJECT_ID nên chạy lại nhiều lần an toàn.
 * Chỉ THÊM bảng.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.form_configs', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[form_configs] (
        [form_key]   VARCHAR(60)   NOT NULL PRIMARY KEY,
        [config]     NVARCHAR(MAX) NULL,
        [created_at] DATETIME2     NOT NULL CONSTRAINT [DF_form_configs_created_at] DEFAULT (SYSDATETIME()),
        [created_by] VARCHAR(20)   NULL,
        [updated_at] DATETIME2     NULL,
        [updated_by] VARCHAR(20)   NULL,
        CONSTRAINT [CHK_form_configs_json] CHECK ([config] IS NULL OR ISJSON([config]) = 1)
    );
END
GO

IF OBJECT_ID(N'dbo.form_custom_values', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[form_custom_values] (
        [form_key]   VARCHAR(60)   NOT NULL,
        [record_id]  VARCHAR(50)   NOT NULL,
        [data]       NVARCHAR(MAX) NOT NULL,
        [created_at] DATETIME2     NOT NULL CONSTRAINT [DF_form_custom_values_created_at] DEFAULT (SYSDATETIME()),
        [created_by] VARCHAR(20)   NULL,
        [updated_at] DATETIME2     NULL,
        [updated_by] VARCHAR(20)   NULL,
        CONSTRAINT [PK_form_custom_values] PRIMARY KEY ([form_key], [record_id]),
        CONSTRAINT [CHK_form_custom_values_json] CHECK (ISJSON([data]) = 1)
    );
END
GO

/* ============================================================================
 * Kế hoạch đào tạo theo năm (training_plans) — Giai đoạn D2
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Module mới, độc lập với training_programs (chương trình khung) và
 *   training_rounds (đợt đăng ký đề tài NCKH — đã bị xoá ở
 *   2026-09-20_drop_training_rounds). Đây là kế hoạch ĐÀO TẠO theo năm/khoa,
 *   dùng để lập dự trù số lượt đào tạo cần tổ chức (training_plan_items),
 *   không tự động sinh khóa học (courses) — chỉ là công cụ lập kế hoạch, việc
 *   mở khóa học thật vẫn làm thủ công ở module Khóa học như hiện tại.
 *
 *   Quyền: 1 permission 'manage' duy nhất (theo mẫu
 *   2026-09-14_system_settings.sql) — đây không phải danh mục CRUD nhiều
 *   người dùng, chỉ phòng đào tạo/quản trị lập kế hoạch nên không cần tách
 *   read/create/update/delete. Mặc định chỉ gán cho VT01, admin có thể gán
 *   thêm cho vai trò khác qua màn hình Vai trò nếu cần.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Kế hoạch đào tạo theo năm
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_plans', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_plans] (
        [id]            VARCHAR(20)   NOT NULL PRIMARY KEY,
        [department_id] VARCHAR(20)   NULL,
        [year]          INT           NOT NULL,
        [title]         NVARCHAR(255) NOT NULL,
        [description]   NVARCHAR(MAX) NULL,
        [status]        VARCHAR(20)   NOT NULL CONSTRAINT DF_training_plans_status DEFAULT ('draft'),
        [created_at]    DATETIME      NOT NULL CONSTRAINT DF_training_plans_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)   NULL,
        [updated_at]    DATETIME      NULL,
        [updated_by]    VARCHAR(20)   NULL,
        CONSTRAINT FK_trnplan_department FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments] ([id]),
        CONSTRAINT CHK_trnplan_status CHECK ([status] IN ('draft', 'active', 'completed', 'cancelled'))
    );
    CREATE NONCLUSTERED INDEX [IX_training_plans_year] ON [dbo].[training_plans] ([year]);
    CREATE NONCLUSTERED INDEX [IX_training_plans_department] ON [dbo].[training_plans] ([department_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Hạng mục trong kế hoạch (theo quý)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_plan_items', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_plan_items] (
        [id]           VARCHAR(20)   NOT NULL PRIMARY KEY,
        [plan_id]      VARCHAR(20)   NOT NULL,
        [title]        NVARCHAR(255) NOT NULL,
        [quarter]      INT           NULL,
        [target_count] INT           NULL,
        [note]         NVARCHAR(MAX) NULL,
        [created_at]   DATETIME      NOT NULL CONSTRAINT DF_training_plan_items_created_at DEFAULT (GETDATE()),
        [created_by]   VARCHAR(20)   NULL,
        CONSTRAINT FK_trnplanitem_plan FOREIGN KEY ([plan_id]) REFERENCES [dbo].[training_plans] ([id]) ON DELETE CASCADE,
        CONSTRAINT CHK_trnplanitem_quarter CHECK ([quarter] IS NULL OR [quarter] BETWEEN 1 AND 4)
    );
    CREATE NONCLUSTERED INDEX [IX_training_plan_items_plan] ON [dbo].[training_plan_items] ([plan_id]);
END
GO

------------------------------------------------------------------------------
-- 3. Quyền mới — resource 'training_plans', chỉ MANAGE.
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-TRNPLAN-MANAGE', N'Quản lý kế hoạch đào tạo', N'Lập/sửa/xoá kế hoạch đào tạo theo năm và các hạng mục trong kế hoạch', 'training_plans', 'manage', 10)
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
    ('VT01','PERM-TRNPLAN-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-29_training_plans hoàn tất.';
GO

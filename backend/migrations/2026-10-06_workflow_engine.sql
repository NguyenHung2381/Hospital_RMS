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

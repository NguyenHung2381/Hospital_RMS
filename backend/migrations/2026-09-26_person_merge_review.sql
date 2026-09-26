/* ============================================================================
 * GĐ 1 / Bước 3 — Màn hình duyệt gộp danh tính (persons)          [FR-C02]
 * ----------------------------------------------------------------------------
 * Phụ thuộc: 2026-09-25_persons_foundation.sql (persons, person_merge_candidates).
 *
 *  1. dbo.person_merge_log  — nhật ký mỗi lần gộp, KHÔNG xóa/sửa. Lưu ảnh chụp hồ sơ
 *     bị gộp và danh sách bản ghi nguồn đã chuyển → đủ dữ liệu để hoàn tác thủ công
 *     (v3 FR-C02: "không thể hoàn tác trực tiếp" trên giao diện, nhưng phải truy vết được).
 *  2. Quyền persons:read (xem hàng đợi) và persons:merge (gộp / bỏ qua / mở lại),
 *     gán cho VT01 (admin). Không gán cho vai trò khác: gộp danh tính tác động lên
 *     toàn bộ hồ sơ người của hệ thống.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * (sqlcmd cần cờ -I vì bảng có index lọc / cột tính toán.)
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'dbo.person_merge_log', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[person_merge_log] (
        [id]           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_person_merge_log PRIMARY KEY,
        [candidate_id] INT           NULL,             -- cặp duyệt dẫn tới lần gộp (NULL nếu gộp ngoài hàng đợi)
        [kept_id]      VARCHAR(20)   NOT NULL,         -- person giữ lại
        [merged_id]    VARCHAR(20)   NOT NULL,         -- person bị gộp (status = MERGED)
        [merged_snapshot] NVARCHAR(MAX) NOT NULL,      -- JSON: hồ sơ bị gộp trước khi gộp
        [kept_before]  NVARCHAR(MAX) NOT NULL,         -- JSON: hồ sơ giữ lại trước khi gộp
        [moved_json]   NVARCHAR(MAX) NOT NULL,         -- JSON: { "<bảng nguồn>": ["id", ...] } các bản ghi đã chuyển person_id
        [note]         NVARCHAR(500) NULL,
        [merged_by]    VARCHAR(20)   NULL,
        [merged_at]    DATETIME2(7)  NOT NULL CONSTRAINT DF_pml_merged_at DEFAULT (SYSDATETIME()),
        CONSTRAINT FK_pml_kept   FOREIGN KEY ([kept_id])   REFERENCES [dbo].[persons] ([id]),
        CONSTRAINT FK_pml_merged FOREIGN KEY ([merged_id]) REFERENCES [dbo].[persons] ([id]),
        CONSTRAINT FK_pml_cand   FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[person_merge_candidates] ([id])
    );
    CREATE NONCLUSTERED INDEX IX_pml_kept ON [dbo].[person_merge_log] ([kept_id]);
    CREATE NONCLUSTERED INDEX IX_pml_merged ON [dbo].[person_merge_log] ([merged_id]);
END
GO

-- Hàng đợi hay lọc theo (status, reason)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pmc_status_reason' AND object_id = OBJECT_ID('dbo.person_merge_candidates'))
    CREATE NONCLUSTERED INDEX [IX_pmc_status_reason] ON [dbo].[person_merge_candidates] ([status], [reason]);
GO

MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-PERSON-READ',  N'Xem hàng đợi trùng danh tính', N'Xem các cặp hồ sơ nghi là cùng một người', 'persons', 'read',  10),
    ('PERM-PERSON-MERGE', N'Gộp danh tính',                N'Gộp hai hồ sơ người, bỏ qua hoặc mở lại cặp nghi trùng', 'persons', 'merge', 20)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

MERGE [dbo].[role_permissions] AS tgt
USING (VALUES ('VT01', 'PERM-PERSON-READ'), ('VT01', 'PERM-PERSON-MERGE')) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-26_person_merge_review hoàn tất.';
GO

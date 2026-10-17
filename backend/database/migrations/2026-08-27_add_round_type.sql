/* ============================================================================
 * Phân loại đợt nghiên cứu (round_type)
 * ----------------------------------------------------------------------------
 * - Tạo bảng danh mục dbo.round_types (quản lý ở màn "Quản lý Danh mục").
 * - Thêm FK research_rounds.round_type_id -> round_types(id), BẮT BUỘC (NOT NULL).
 * - Seed 3 loại mặc định + backfill các đợt hiện có.
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/

------------------------------------------------------------------------------
-- 1. Bảng danh mục loại đợt (khớp cấu trúc levels / categories)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.round_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.round_types (
        id          VARCHAR(6)    NOT NULL CONSTRAINT PK_round_types PRIMARY KEY,
        name        NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX)  NULL,
        created_at  DATETIME2(7)  NOT NULL CONSTRAINT DF_round_types_created_at DEFAULT GETDATE(),
        created_by  VARCHAR(20)   NULL,
        updated_at  DATETIME2(7)  NULL,
        updated_by  VARCHAR(20)   NULL,
        CONSTRAINT CHK_round_types_id CHECK (id LIKE 'RT[0-9][0-9]')
    );
END
GO

------------------------------------------------------------------------------
-- 2. Seed loại đợt mặc định
------------------------------------------------------------------------------
MERGE dbo.round_types AS t
USING (VALUES
    ('RT01', N'Nghiên cứu khoa học', N'Đề tài nghiên cứu khoa học các cấp'),
    ('RT02', N'Bài báo',             N'Đợt đăng ký viết / công bố bài báo'),
    ('RT03', N'Sáng kiến',           N'Sáng kiến, cải tiến kỹ thuật')
) AS s (id, name, description)
ON t.id = s.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description) VALUES (s.id, s.name, s.description);
GO

------------------------------------------------------------------------------
-- 3. Cột FK trên research_rounds
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.research_rounds', N'round_type_id') IS NULL
BEGIN
    ALTER TABLE dbo.research_rounds ADD round_type_id VARCHAR(6) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_rr_round_type')
BEGIN
    ALTER TABLE dbo.research_rounds
        ADD CONSTRAINT FK_rr_round_type FOREIGN KEY (round_type_id)
            REFERENCES dbo.round_types (id);
END
GO

------------------------------------------------------------------------------
-- 4. Backfill các đợt hiện có (loại suy từ tên đợt trước đây)
------------------------------------------------------------------------------
UPDATE dbo.research_rounds SET round_type_id = 'RT02'
WHERE round_type_id IS NULL AND LOWER(name) LIKE N'%bài báo%';

UPDATE dbo.research_rounds SET round_type_id = 'RT03'
WHERE round_type_id IS NULL AND LOWER(name) LIKE N'%sáng kiến%';

-- Mặc định còn lại là Nghiên cứu khoa học
UPDATE dbo.research_rounds SET round_type_id = 'RT01'
WHERE round_type_id IS NULL;
GO

------------------------------------------------------------------------------
-- 5. Ràng buộc BẮT BUỘC sau khi đã backfill hết
------------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.research_rounds')
      AND name = N'round_type_id' AND is_nullable = 1
)
AND NOT EXISTS (SELECT 1 FROM dbo.research_rounds WHERE round_type_id IS NULL)
BEGIN
    ALTER TABLE dbo.research_rounds ALTER COLUMN round_type_id VARCHAR(6) NOT NULL;
END
GO

------------------------------------------------------------------------------
-- 6. Index phục vụ lọc theo loại đợt
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_rr_round_type')
BEGIN
    CREATE NONCLUSTERED INDEX idx_rr_round_type
        ON dbo.research_rounds (round_type_id);
END
GO

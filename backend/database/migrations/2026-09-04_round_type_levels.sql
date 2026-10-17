/* ============================================================================
 * Cấp độ đề tài "ăn theo" loại đợt (round_type_levels)
 * ----------------------------------------------------------------------------
 * - Bảng nối round_types (RTxx) ↔ levels (CDxx): mỗi loại đợt được phép những
 *   cấp độ nào. Form đăng ký đề tài chỉ hiển thị cấp độ thuộc loại đợt đó.
 * - Loại đợt CHƯA cấu hình cấp độ nào ⇒ coi như cho phép tất cả (fallback).
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

IF OBJECT_ID(N'dbo.round_type_levels', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.round_type_levels (
        round_type_id VARCHAR(6)   NOT NULL,
        level_id      VARCHAR(5)   NOT NULL,
        created_at    DATETIME2(7) NOT NULL
            CONSTRAINT DF_rtl_created_at DEFAULT GETDATE(),
        CONSTRAINT PK_round_type_levels PRIMARY KEY (round_type_id, level_id),
        CONSTRAINT FK_rtl_round_type FOREIGN KEY (round_type_id)
            REFERENCES dbo.round_types (id) ON DELETE CASCADE,
        CONSTRAINT FK_rtl_level FOREIGN KEY (level_id)
            REFERENCES dbo.levels (id) ON DELETE CASCADE
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_rtl_level')
BEGIN
    CREATE NONCLUSTERED INDEX idx_rtl_level
        ON dbo.round_type_levels (level_id);
END
GO

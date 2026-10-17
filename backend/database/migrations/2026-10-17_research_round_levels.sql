/* ============================================================================
 * Cấp độ đề tài cấu hình riêng theo từng đợt (research_round_levels)
 * ----------------------------------------------------------------------------
 * - Chọn ngay khi tạo/sửa đợt nghiên cứu. Form đăng ký đề tài chỉ hiển thị
 *   các cấp độ này.
 * - Đợt CHƯA cấu hình cấp độ nào ⇒ dùng cấp độ của loại đợt (round_type_levels);
 *   loại đợt cũng chưa cấu hình ⇒ cho phép tất cả (fallback).
 * Script idempotent, chạy lại nhiều lần an toàn. Backend cũng tự tạo bảng này
 * khi khởi động (permissions/migrations.js).
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

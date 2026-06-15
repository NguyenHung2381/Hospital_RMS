-- ============================================================
-- Migration: Thêm start_date và deadline_type vào round_deadlines
-- ============================================================

-- 1. Thêm cột ngày bắt đầu (tùy chọn, NULL nếu chỉ có deadline cuối)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.round_deadlines') AND name = 'start_date'
)
BEGIN
    ALTER TABLE [dbo].[round_deadlines]
        ADD [start_date] DATE NULL;
END
GO

-- 2. Thêm cột phân loại hạn
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.round_deadlines') AND name = 'deadline_type'
)
BEGIN
    ALTER TABLE [dbo].[round_deadlines]
        ADD [deadline_type] VARCHAR(30) NULL;
END
GO

-- 3. Check constraint cho deadline_type
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.round_deadlines') AND name = 'CHK_rd_deadline_type'
)
BEGIN
    ALTER TABLE [dbo].[round_deadlines]
        ADD CONSTRAINT [CHK_rd_deadline_type] CHECK (
            [deadline_type] IS NULL OR
            [deadline_type] IN ('nop_bao_cao', 'sua_thong_tin', 'xet_duyet', 'nghiem_thu')
        );
END
GO

-- 4. Check constraint: start_date <= deadline_date
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.round_deadlines') AND name = 'CHK_rd_dates'
)
BEGIN
    ALTER TABLE [dbo].[round_deadlines]
        ADD CONSTRAINT [CHK_rd_dates] CHECK (
            [start_date] IS NULL OR [start_date] <= [deadline_date]
        );
END
GO

/* ============================================================================
 * Bổ sung trường cho Bài học (program_lessons): mã, trạng thái, số tiết, tín chỉ
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Theo mẫu form "Sửa bài học" người dùng cung cấp, bài học cần thêm: mã bài
 *   học (code, bắt buộc), trạng thái hoạt động (is_active, giống lecturers.
 *   is_active — chỉ 2 trạng thái đơn giản, không cần enum nhiều bước như
 *   courses.status), số tiết lý thuyết/thực hành (theory_hours/practice_hours,
 *   nhập tay), tổng số tiết (total_hours — CỘT TÍNH TOÁN, tự động = lý thuyết +
 *   thực hành, không cho nhập tay, dùng computed column PERSISTED để luôn nhất
 *   quán và query/sort được), số tín chỉ (credits).
 *
 *   code thêm NOT NULL với DEFAULT ('') để backfill an toàn cho dòng có sẵn —
 *   không ràng buộc UNIQUE (mirror training_programs.code, cũng không unique).
 *
 *   Không thêm permission mới — dùng lại training_programs:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
-- Bắt buộc cho computed column PERSISTED (total_hours) bên dưới.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.program_lessons', 'code') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [code] NVARCHAR(50) NOT NULL
        CONSTRAINT DF_program_lessons_code DEFAULT ('');
GO
IF COL_LENGTH('dbo.program_lessons', 'is_active') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [is_active] BIT NOT NULL
        CONSTRAINT DF_program_lessons_is_active DEFAULT (1);
GO
IF COL_LENGTH('dbo.program_lessons', 'theory_hours') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [theory_hours] INT NOT NULL
        CONSTRAINT DF_program_lessons_theory_hours DEFAULT (0);
GO
IF COL_LENGTH('dbo.program_lessons', 'practice_hours') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [practice_hours] INT NOT NULL
        CONSTRAINT DF_program_lessons_practice_hours DEFAULT (0);
GO
IF COL_LENGTH('dbo.program_lessons', 'credits') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [credits] INT NOT NULL
        CONSTRAINT DF_program_lessons_credits DEFAULT (0);
GO
IF COL_LENGTH('dbo.program_lessons', 'total_hours') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [total_hours] AS ([theory_hours] + [practice_hours]) PERSISTED;
GO

PRINT N'✅ Migration 2026-09-19_program_lessons_fields hoàn tất.';
GO

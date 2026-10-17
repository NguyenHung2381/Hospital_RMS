/* ============================================================================
 * Giai đoạn con của Đợt đào tạo (training_round_phases)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: 1 "Đợt đăng ký" (DT_DotDangKy) có thể chia
 *   thành nhiều giai đoạn (phase) với khoảng thời gian riêng. training_rounds
 *   hiện tại ở RMS chỉ là khung thời gian đơn (start_date/end_date), chưa có
 *   khái niệm giai đoạn con — bổ sung bảng training_round_phases.
 *
 *   Không thêm permission mới — dùng lại training_rounds:* (sub-resource).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.training_round_phases', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_round_phases] (
        [id]                VARCHAR(20)   NOT NULL PRIMARY KEY,
        [training_round_id] VARCHAR(20)   NOT NULL,
        [name]              NVARCHAR(150) NOT NULL,
        [start_date]        DATE          NULL,
        [end_date]          DATE          NULL,
        [display_order]     INT           NOT NULL CONSTRAINT DF_trphase_display_order DEFAULT (0),
        [created_at]        DATETIME      NOT NULL CONSTRAINT DF_trphase_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)   NULL,
        [updated_at]        DATETIME      NULL,
        [updated_by]        VARCHAR(20)   NULL,
        CONSTRAINT FK_trphase_round FOREIGN KEY ([training_round_id]) REFERENCES [dbo].[training_rounds] ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_trphase_round] ON [dbo].[training_round_phases] ([training_round_id], [display_order]);
END
GO

PRINT N'✅ Migration 2026-09-16_training_round_phases hoàn tất.';
GO

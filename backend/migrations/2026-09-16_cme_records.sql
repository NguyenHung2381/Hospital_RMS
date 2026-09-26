/* ============================================================================
 * Ghi nhận tín chỉ CME độc lập (cme_records) — không bắt buộc qua seminar
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_cme_ghi_nhan cho phép ghi nhận tín chỉ CME
 *   trực tiếp cho từng nhân viên (tự học, học online, minh chứng đính kèm),
 *   không bắt buộc gắn 1 sự kiện hội thảo cụ thể — khác cơ chế hiện tại của
 *   RMS (mọi CME đều xuất phát từ seminar_participants, gắn 1 seminar_id).
 *   Bổ sung bảng cme_records để phủ trường hợp này, dùng lại danh mục
 *   cme_credit_categories (đã có group_id/conversion_method/conversion_value
 *   từ 2026-09-14_cme_credit_conversion.sql) để gợi ý số tín chỉ.
 *
 *   Minh chứng đính kèm tái dùng kho file polymorphic training_files
 *   (entity_type = 'cme_evidence'), đúng convention đã thiết lập ở
 *   2026-09-11_training_results.sql thay vì tạo bảng file riêng.
 *
 *   Số liệu "earned" ở trang Cảnh báo tín chỉ CME (CmeCompliance) cần cộng
 *   dồn thêm nguồn này bên cạnh seminar_participants.cme_credits — xử lý ở
 *   tầng service (backend), không cần thay đổi schema thêm.
 *
 *   Không thêm permission mới — dùng lại seminars:cme_manage (đúng convention
 *   gộp permission theo cụm CME).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.cme_records', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[cme_records] (
        [id]               VARCHAR(20)   NOT NULL PRIMARY KEY,
        [user_id]          VARCHAR(20)   NOT NULL,
        [category_id]      VARCHAR(20)   NULL,
        [title]            NVARCHAR(255) NOT NULL,
        [activity_date]    DATE          NOT NULL,
        [year]             AS (YEAR([activity_date])) PERSISTED,
        [credits]          DECIMAL(6,2)  NOT NULL,
        [evidence_file_id] VARCHAR(20)   NULL,
        [note]             NVARCHAR(500) NULL,
        [created_at]       DATETIME      NOT NULL CONSTRAINT DF_cme_records_created_at DEFAULT (GETDATE()),
        [created_by]       VARCHAR(20)   NULL,
        [updated_at]       DATETIME      NULL,
        [updated_by]       VARCHAR(20)   NULL,
        CONSTRAINT FK_cmerec_user       FOREIGN KEY ([user_id])          REFERENCES [dbo].[users]                 ([id]),
        CONSTRAINT FK_cmerec_category   FOREIGN KEY ([category_id])      REFERENCES [dbo].[cme_credit_categories] ([id]),
        CONSTRAINT FK_cmerec_evidence   FOREIGN KEY ([evidence_file_id]) REFERENCES [dbo].[training_files]        ([id])
    );
    CREATE NONCLUSTERED INDEX [IX_cme_records_user_year] ON [dbo].[cme_records] ([user_id], [year]);
END
GO

PRINT N'✅ Migration 2026-09-16_cme_records hoàn tất.';
GO

/* ============================================================================
 * 2026-12-04_ket_qua_vong_nguoi_huong_dan
 * ----------------------------------------------------------------------------
 *   Kết quả vòng thực hành GPHN (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ3):
 *   người hướng dẫn tự đánh giá trên cổng nhân viên (/user/huong-dan), hoặc
 *   Phòng Đào tạo nhập hộ từ phiếu giấy. Lưu thêm trên enrollment_rotations:
 *   - result_comment  nhận xét của người hướng dẫn (note giữ cho ghi chú nội bộ)
 *   - result_at       lúc nhập kết quả
 *   - result_by       ai nhập (users.id)
 *   - result_source   'mentor' (NHD tự nhập) | 'staff' (Phòng Đào tạo nhập hộ)
 * Idempotent — mỗi bước tự kiểm tra (COL_LENGTH / sys.indexes)
 * nên chạy lại nhiều lần an toàn. Chỉ THÊM cột.
 * ==========================================================================*/

IF COL_LENGTH(N'dbo.enrollment_rotations', N'result_comment') IS NULL
    ALTER TABLE [dbo].[enrollment_rotations] ADD [result_comment] NVARCHAR(1000) NULL;
GO
IF COL_LENGTH(N'dbo.enrollment_rotations', N'result_at') IS NULL
    ALTER TABLE [dbo].[enrollment_rotations] ADD [result_at] DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.enrollment_rotations', N'result_by') IS NULL
    ALTER TABLE [dbo].[enrollment_rotations] ADD [result_by] VARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.enrollment_rotations', N'result_source') IS NULL
    ALTER TABLE [dbo].[enrollment_rotations] ADD [result_source] VARCHAR(10) NULL
        CONSTRAINT CHK_enrrot_result_source CHECK ([result_source] IN ('mentor', 'staff'));
GO

-- Vòng đã có kết quả từ trước: coi như Phòng Đào tạo nhập (lúc = lần sửa cuối)
UPDATE [dbo].[enrollment_rotations]
SET result_source = 'staff', result_at = ISNULL(updated_at, created_at), result_by = ISNULL(updated_by, created_by)
WHERE result <> 'pending' AND result_source IS NULL;
GO

-- Màn nhập hàng loạt: vòng đã kết thúc, chưa có kết quả, theo người hướng dẫn
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_enrrot_result_end')
    CREATE NONCLUSTERED INDEX IX_enrrot_result_end ON [dbo].[enrollment_rotations] ([result], [end_date])
        INCLUDE ([mentor_user_id], [enrollment_id]);
GO

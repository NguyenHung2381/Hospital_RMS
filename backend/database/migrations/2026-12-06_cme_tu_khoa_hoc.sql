/* ============================================================================
 * 2026-12-06_cme_tu_khoa_hoc
 * ----------------------------------------------------------------------------
 *   Tự cộng tín chỉ CME từ khóa ĐTLT / CTCV (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md
 *   GĐ5, quyết định 14). Dòng cme_records do hệ thống ghi có nguồn:
 *   - source_type  'course_trainee'  học viên nội viện được cấp giấy chứng nhận
 *                  'course_lecturer' giảng viên có tài khoản, ghi khi khóa điểm
 *                  NULL = người dùng tự khai / cán bộ nhập (như trước)
 *   - source_id    mã khóa học (courses.id)
 *   Khóa duy nhất (source_type, source_id, user_id) khi có nguồn ⇒ chạy lại thì
 *   cập nhật dòng cũ, không ghi trùng.
 * Idempotent — chạy lại nhiều lần an toàn. Chỉ THÊM cột / chỉ mục.
 * ==========================================================================*/

IF COL_LENGTH(N'dbo.cme_records', N'source_type') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [source_type] VARCHAR(20) NULL
        CONSTRAINT CHK_cme_records_source_type CHECK ([source_type] IN ('course_trainee', 'course_lecturer'));
GO
IF COL_LENGTH(N'dbo.cme_records', N'source_id') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [source_id] VARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_cme_records_source' AND object_id = OBJECT_ID(N'dbo.cme_records'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_cme_records_source]
        ON [dbo].[cme_records] ([source_type], [source_id], [user_id])
        WHERE [source_type] IS NOT NULL;
GO

/* ============================================================================
 * Chứng chỉ hành nghề (CCHN) & hồ sơ chuyên môn nhân sự (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu file dump hệ thống PHP nguồn `ql_nckh_dt_cdt`: bảng `dm_nhan_vien`
 *   có nhóm cột hành nghề (so_cchn, ngay_cap_cchn, pham_vi_hanh_nghe, chuyen_khoa,
 *   chuyen_khoa_cap_nhat) mà Hospital_RMS CHƯA có ở đâu — bảng users hiện tại
 *   chỉ phục vụ đăng nhập/phân quyền, không lưu hồ sơ hành nghề.
 *
 *   `chuyen_khoa_cap_nhat` (chuyên khoa cần cập nhật KTYK liên tục) chính là
 *   căn cứ nghiệp vụ để biết một nhân sự thuộc diện phải tích luỹ CME — hiện
 *   cmeRequirementService.getComplianceReport() chỉ so ngưỡng theo khoa/phòng,
 *   không biết nhân sự có thuộc diện bắt buộc CCHN hay không.
 *
 *   1 user = 1 hồ sơ CCHN hiện hành (không làm bảng lịch sử — theo đúng convention
 *   các bảng hồ sơ khác trong dự án như lecturers/trainees: cập nhật tại chỗ).
 *
 *   Đồng thời bổ sung các cột từ dm_giang_vien/dm_hoc_vien mà lecturers/trainees
 *   hiện tại chưa có, để không mất dữ liệu khi nhập từ file cũ.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Hồ sơ chứng chỉ hành nghề — gắn users.id, 1 user 1 hồ sơ hiện hành
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.staff_practice_licenses', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[staff_practice_licenses] (
        [id]                VARCHAR(20)   NOT NULL PRIMARY KEY,
        [user_id]           VARCHAR(20)   NOT NULL,
        [license_no]        VARCHAR(50)   NULL,
        [issued_date]       DATE          NULL,
        [issuing_authority] NVARCHAR(255) NULL,
        [practice_scope]    NVARCHAR(500) NULL,
        [primary_specialty] NVARCHAR(255) NULL,
        [cme_specialty]     NVARCHAR(300) NULL,
        [qualification]     NVARCHAR(150) NULL,
        [title]             NVARCHAR(150) NULL,
        [notes]             NVARCHAR(500) NULL,
        [created_at]        DATETIME      NOT NULL CONSTRAINT DF_staff_licenses_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)   NULL,
        [updated_at]        DATETIME      NULL,
        [updated_by]        VARCHAR(20)   NULL,
        CONSTRAINT FK_stafflic_user FOREIGN KEY ([user_id]) REFERENCES [dbo].[users] ([id]) ON DELETE CASCADE,
        CONSTRAINT UQ_stafflic_user UNIQUE ([user_id])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_stafflic_license_no] ON [dbo].[staff_practice_licenses] ([license_no])
        WHERE [license_no] IS NOT NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Bổ sung cột còn thiếu cho lecturers (mirror dm_giang_vien: hoc_vi/hoc_ham/
--    ngay_sinh/gioi_tinh/avatar) — để nhập dữ liệu cũ không mất thông tin.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.lecturers', 'academic_degree') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [academic_degree] NVARCHAR(50) NULL; -- hoc_vi (BS CKII, ThS, TS...)
GO
IF COL_LENGTH('dbo.lecturers', 'academic_rank') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [academic_rank] NVARCHAR(50) NULL; -- hoc_ham (GS, PGS)
GO
IF COL_LENGTH('dbo.lecturers', 'dob') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [dob] DATE NULL;
GO
IF COL_LENGTH('dbo.lecturers', 'gender') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [gender] VARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.lecturers', 'avatar_url') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [avatar_url] NVARCHAR(500) NULL;
GO

------------------------------------------------------------------------------
-- 3. Bổ sung cột còn thiếu cho trainees (mirror dm_hoc_vien: CCCD ngày/nơi cấp,
--    trường đào tạo, năm tốt nghiệp, chức vụ, avatar).
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.trainees', 'national_id_issued_date') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [national_id_issued_date] DATE NULL; -- cccd_ngay_cap
GO
IF COL_LENGTH('dbo.trainees', 'national_id_issued_place') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [national_id_issued_place] NVARCHAR(200) NULL; -- cccd_noi_cap
GO
IF COL_LENGTH('dbo.trainees', 'graduated_school') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [graduated_school] NVARCHAR(200) NULL; -- truong_dao_tao
GO
IF COL_LENGTH('dbo.trainees', 'graduated_year') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [graduated_year] SMALLINT NULL; -- nam_tot_nghiep
GO
IF COL_LENGTH('dbo.trainees', 'workplace') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [workplace] NVARCHAR(200) NULL; -- don_vi_cong_tac (học viên ngoài viện)
GO
IF COL_LENGTH('dbo.trainees', 'position') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [position] NVARCHAR(100) NULL; -- chuc_vu
GO
IF COL_LENGTH('dbo.trainees', 'avatar_url') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [avatar_url] NVARCHAR(500) NULL;
GO

------------------------------------------------------------------------------
-- 4. Quyền mới — resource 'staff_licenses' (mirror pattern PERM-TRN-*)
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-LIC-READ',   N'Xem CCHN',        N'Xem hồ sơ chứng chỉ hành nghề nhân sự',      'staff_licenses', 'read',   10),
    ('PERM-LIC-CREATE', N'Thêm CCHN',       N'Tạo hồ sơ chứng chỉ hành nghề mới',          'staff_licenses', 'create', 20),
    ('PERM-LIC-UPDATE', N'Sửa CCHN',        N'Cập nhật hồ sơ chứng chỉ hành nghề',         'staff_licenses', 'update', 30),
    ('PERM-LIC-DELETE', N'Xoá CCHN',        N'Xoá hồ sơ chứng chỉ hành nghề',              'staff_licenses', 'delete', 40),
    ('PERM-LIC-MANAGE', N'Toàn quyền CCHN', N'Toàn quyền quản lý chứng chỉ hành nghề',     'staff_licenses', 'manage', 50)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-LIC-READ'),('VT01','PERM-LIC-CREATE'),('VT01','PERM-LIC-UPDATE'),('VT01','PERM-LIC-DELETE'),('VT01','PERM-LIC-MANAGE'),
    ('VT03','PERM-LIC-READ'),('VT03','PERM-LIC-CREATE'),('VT03','PERM-LIC-UPDATE'),('VT03','PERM-LIC-DELETE'),('VT03','PERM-LIC-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-14_staff_practice_licenses hoàn tất.';
GO

/* ============================================================================
 * Danh mục Địa điểm (phòng họp / hội trường / phòng học)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Địa điểm hiện là text tự do ở nhiều nơi: councils.location (bảo vệ đề
 *   cương), class_sessions.room (buổi học), course_programs.location (chương
 *   trình gán vào khóa). Gõ tay ⇒ cùng 1 phòng bị viết nhiều kiểu, không lọc /
 *   thống kê được.
 *
 *   Thêm bảng danh mục venues để form CHỌN từ danh sách. Các cột text cũ GIỮ
 *   NGUYÊN (lưu tên địa điểm tại thời điểm chọn) — không đổi schema bảng nghiệp
 *   vụ, dữ liệu cũ / file xuất / cổng công khai không bị ảnh hưởng.
 *
 *   usage_scope: 'defense' (bảo vệ đề cương / hội đồng), 'training' (buổi học),
 *   'both' — để form nào chỉ gợi ý địa điểm phù hợp với form đó.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng venues (shape id/name/description/audit giống các danh mục khác để
--    dùng thẳng services/crudService.js)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.venues', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[venues] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(255) NOT NULL,
        [description] NVARCHAR(MAX) NULL,
        [address]     NVARCHAR(255) NULL,
        [capacity]    INT           NULL,
        [usage_scope] VARCHAR(20)   NOT NULL CONSTRAINT DF_venues_usage_scope DEFAULT ('both'),
        [is_active]   BIT           NOT NULL CONSTRAINT DF_venues_is_active DEFAULT (1),
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_venues_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL,
        [updated_at]  DATETIME      NULL,
        [updated_by]  VARCHAR(20)   NULL,
        CONSTRAINT [CHK_venues_usage_scope] CHECK ([usage_scope] IN ('defense','training','both')),
        CONSTRAINT [CHK_venues_capacity] CHECK ([capacity] IS NULL OR [capacity] > 0)
    );
END
GO

-- Tên là thứ được lưu sang bảng nghiệp vụ ⇒ không cho trùng
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_venues_name' AND object_id = OBJECT_ID(N'dbo.venues'))
    CREATE UNIQUE INDEX [UQ_venues_name] ON [dbo].[venues] ([name]);
GO

-- Cột nhận tên địa điểm phải chứa đủ venues.name (255): room trước đây 100,
-- course_programs.location 200 ⇒ nới ra (chỉ tăng độ dài, không mất dữ liệu).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.class_sessions') AND name = 'room' AND max_length < 510)
    ALTER TABLE [dbo].[class_sessions] ALTER COLUMN [room] NVARCHAR(255) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.course_programs') AND name = 'location' AND max_length < 510)
    ALTER TABLE [dbo].[course_programs] ALTER COLUMN [location] NVARCHAR(255) NULL;
GO

------------------------------------------------------------------------------
-- 2. Seed từ các địa điểm đã gõ tay trước đây (gộp trùng, bỏ rỗng) để danh
--    mục không trống và dữ liệu cũ khớp ngay với lựa chọn trong form.
------------------------------------------------------------------------------
--    Kèm danh sách LOCATION_PRESETS từng hard-code trong CouncilFormModal.tsx
--    (nay form chọn từ danh mục này).
;WITH src AS (
    SELECT CAST(v.name AS NVARCHAR(255)) AS name, 'defense' AS scope
    FROM (VALUES
        (N'Hội trường 3'), (N'Hội trường ghép tạng'), (N'VP Khoa thăm dò chức năng'),
        (N'VP Trung tâm HTSS'), (N'VP Trung tâm xét nghiệm'), (N'VP TT bệnh nhiệt đới'),
        (N'VP TT Đột quỵ'), (N'VP HSTC ngoại khoa'), (N'VP khoa Cấp cứu'),
        (N'VP khoa Chấn thương chỉnh hình'), (N'VP khoa Cơ xương khớp'), (N'VP khoa Dị ứng - MDLS'),
        (N'VP khoa Gây mê hồi sức'), (N'VP khoa HSTC'), (N'VP khoa Kiểm soát nhiễm khuẩn'),
        (N'VP khoa Ngoại thận - tiết niệu'), (N'VP khoa Ngoại tổng hợp 2'), (N'VP khoa Nhi - sơ sinh'),
        (N'VP khoa Nội thận - TN - LM'), (N'VP khoa Nội tiêu hoá'), (N'VP khoa Nội tim mạch 1'),
        (N'VP khoa Phẫu thuật - TMLN'), (N'VP khoa Phụ sản'), (N'VP khoa PTTKCS'),
        (N'VP khoa Tai mũi họng'), (N'VP khoa Thần kinh'), (N'VP khoa Tim mạch 2'), (N'VP khoa X-quang')
    ) AS v(name)
    UNION ALL SELECT LTRIM(RTRIM(location)), 'defense' FROM [dbo].[councils]
    UNION ALL SELECT LTRIM(RTRIM(room)), 'training' FROM [dbo].[class_sessions]
    UNION ALL SELECT LTRIM(RTRIM(location)), 'training' FROM [dbo].[course_programs]
),
agg AS (
    SELECT name,
           CASE WHEN MIN(scope) <> MAX(scope) THEN 'both' ELSE MIN(scope) END AS usage_scope
    FROM src
    WHERE name IS NOT NULL AND name <> N''
    GROUP BY name
)
INSERT INTO [dbo].[venues] (id, name, usage_scope, created_by)
SELECT 'DD' + LEFT(REPLACE(NEWID(), '-', ''), 18), a.name, a.usage_scope, 'SYSTEM'
FROM agg a
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[venues] v WHERE v.name = a.name);
GO

------------------------------------------------------------------------------
-- 3. Quyền — resource riêng 'venues' (dùng chung NCKH + Đào tạo nên không gắn
--    vào 'catalog' hay 'training_catalog'). Đọc danh sách chỉ cần đăng nhập
--    (form hội đồng / buổi học cần gợi ý); quyền dưới đây cho màn quản lý.
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-VEN-READ',   N'Xem địa điểm',        N'Xem danh mục địa điểm (phòng họp, hội trường, phòng học)', 'venues', 'read',   10),
    ('PERM-VEN-CREATE', N'Thêm địa điểm',       N'Tạo địa điểm mới',                                        'venues', 'create', 20),
    ('PERM-VEN-UPDATE', N'Sửa địa điểm',        N'Cập nhật thông tin địa điểm',                             'venues', 'update', 30),
    ('PERM-VEN-DELETE', N'Xoá địa điểm',        N'Xoá địa điểm khỏi danh mục',                              'venues', 'delete', 40),
    ('PERM-VEN-MANAGE', N'Toàn quyền địa điểm', N'Toàn quyền quản lý danh mục địa điểm',                    'venues', 'manage', 50)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

-- VT01 (admin) + VT03 (cán bộ NCKH, kiêm quản lý đào tạo — như training_catalog)
MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-VEN-READ'),('VT01','PERM-VEN-CREATE'),('VT01','PERM-VEN-UPDATE'),('VT01','PERM-VEN-DELETE'),('VT01','PERM-VEN-MANAGE'),
    ('VT03','PERM-VEN-READ'),('VT03','PERM-VEN-CREATE'),('VT03','PERM-VEN-UPDATE'),('VT03','PERM-VEN-DELETE'),('VT03','PERM-VEN-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-10-07_venues hoàn tất.';
GO

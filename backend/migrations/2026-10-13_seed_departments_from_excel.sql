/* ============================================================================
 * Thêm danh sách khoa/phòng chuẩn (danh-sach-khoa-phong-20260928.xlsx)
 * ----------------------------------------------------------------------------
 *   - id (DVxxx) do trigger trg_dept_gen_id tự sinh.
 *   - abbreviation = code (cột này UNIQUE, dùng sinh dept_account_id NVxxx).
 *   - Chỉ thêm khoa có code chưa tồn tại ⇒ không đụng tới khoa đã có,
 *     chạy lại nhiều lần an toàn.
 *   - trg_dept_gen_id chỉ chép một số cột, nên unit_type / bed_count được
 *     gán bằng UPDATE sau INSERT (chỉ cho các dòng vừa thêm).
 *   - unit_type theo đúng cột "Loại đơn vị" trong Excel (PCN1/2/3 Excel ghi
 *     là "Khoa").
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;

DECLARE @src TABLE (
    code      VARCHAR(20)   NOT NULL PRIMARY KEY,
    name      NVARCHAR(255) NOT NULL,
    unit_type VARCHAR(20)   NOT NULL,
    bed_count INT           NULL
);

INSERT INTO @src (code, name, unit_type, bed_count) VALUES
    ('CLS51', N'Vi rút - Ký sinh trùng', 'khoa', NULL),
    ('CLS40', N'Phẫu thuật tim mạch - lồng ngực', 'khoa', NULL),
    ('CLS39', N'Huyết học lâm sàng', 'khoa', NULL),
    ('CLS37', N'Nội Tiết', 'khoa', NULL),
    ('CLS17', N'Ngoại tổng hợp 1', 'khoa', NULL),
    ('CLS16', N'Ngoại tổng hợp 2', 'khoa', NULL),
    ('PCN11', N'Tổ công tác xã hội', 'phong', NULL),
    ('PCN9',  N'Quản lý chất lượng', 'phong', NULL),
    ('PCN7',  N'Cơ sở hạ tầng và Trang thiết bị', 'phong', NULL),
    ('PCN4',  N'Trung tâm Đào tạo và Chỉ đạo tuyến', 'trung_tam', NULL),
    ('PCN6',  N'Điều dưỡng', 'phong', NULL),
    ('CLS13', N'Cấp cứu', 'khoa', 5),
    ('PCN10', N'Tổ hành chính quản trị', 'phong', NULL),
    ('CLS23', N'Bỏng', 'khoa', 35),
    ('CLS31', N'Chống độc', 'khoa', 35),
    ('CLS36', N'Dị ứng - Miễn dịch lâm sàng', 'khoa', 30),
    ('CLS3',  N'Di truyền và Sinh học phân tử', 'khoa', NULL),
    ('CLS25', N'Trung tâm Hỗ trợ sinh sản', 'khoa', 8),
    ('PCN2',  N'Tổ chức cán bộ', 'khoa', NULL),
    ('PCN1',  N'Ban Giám đốc', 'khoa', NULL),
    ('CLS32', N'Hồi sức tích cực ngoại khoa', 'khoa', 45),
    ('CLS30', N'Hồi sức tích cực', 'khoa', 55),
    ('PCN3',  N'Kế hoạch tổng hợp', 'khoa', NULL),
    ('CLS9',  N'Giải phẫu bệnh', 'khoa', NULL),
    ('CLS1',  N'Thăm dò chức năng', 'khoa', NULL),
    ('CLS2',  N'Xquang', 'khoa', NULL),
    ('CLS5',  N'Vi sinh - Trung tâm xét nghiệm', 'khoa', NULL),
    ('CLS7',  N'Hóa Sinh - Trung tâm xét nghiệm', 'khoa', NULL),
    ('CLS48', N'Phục hồi chức năng', 'khoa', 45),
    ('CLS29', N'Mắt', 'khoa', 30),
    ('CLS28', N'Răng hàm mặt', 'khoa', 35),
    ('CLS27', N'Tai mũi họng', 'khoa', 50),
    ('CLS24', N'Phụ sản', 'khoa', 90),
    ('CLS18', N'Ngoại Thận - Tiết niệu', 'khoa', 80),
    ('CLS19', N'Ngoại tiêu hóa', 'khoa', 95),
    ('CLS26', N'Nhi - sơ sinh', 'khoa', 70),
    ('CLS47', N'Y học cổ truyền', 'khoa', 35),
    ('CLS46', N'Da liễu', 'khoa', 30),
    ('CLS50', N'Nhiễm khuẩn tổng hợp', 'khoa', 70),
    ('CLS38', N'Nội Thận - Tiết niệu - Lọc máu', 'khoa', 60),
    ('CLS43', N'Nội Cơ - xương - khớp', 'khoa', 65),
    ('CLS34', N'Nội tiêu hóa', 'khoa', 75),
    ('CLS42', N'Nội tim mạch 2', 'khoa', 80),
    ('CLS41', N'Nội tim mạch 1', 'khoa', 80),
    ('CLS33', N'Nội A - Lão khoa', 'khoa', 70),
    ('CLS12', N'Khám bệnh', 'khoa', NULL),
    ('CLS35', N'Nội Dị ứng - Hô hấp', 'khoa', 75),
    ('CLS20', N'Phẫu thuật thần kinh cột sống', 'khoa', 95),
    ('CLS14', N'Gây mê hồi sức', 'khoa', NULL),
    ('PCN5',  N'Tài chính kế toán', 'phong', NULL),
    ('PCN8',  N'Công nghệ thông tin', 'phong', NULL),
    ('CLS6',  N'Huyết học - Trung tâm xét nghiệm', 'khoa', NULL),
    ('CLS45', N'Trung tâm đột quỵ', 'khoa', 75),
    ('CLS49', N'Dinh dưỡng', 'khoa', NULL),
    ('CLS10', N'Kiểm soát nhiễm khuẩn', 'khoa', NULL),
    ('CLS11', N'Dược', 'khoa', NULL),
    ('CLS21', N'Chấn thương - Chỉnh hình', 'khoa', 95),
    ('CLS44', N'Thần kinh', 'khoa', 92),
    ('CLS22', N'Phẫu thuật tạo hình thẩm mỹ', 'khoa', 10);

DECLARE @new TABLE (code VARCHAR(20));
INSERT INTO @new (code)
SELECT s.code FROM @src s
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[departments] d
                  WHERE d.code = s.code OR d.abbreviation = s.code);

INSERT INTO [dbo].[departments] ([name], [code], [abbreviation], [created_by])
SELECT s.name, s.code, s.code, 'SYSTEM'
FROM @src s JOIN @new n ON n.code = s.code;

UPDATE d
SET    d.unit_type = s.unit_type,
       d.bed_count = s.bed_count
FROM [dbo].[departments] d
JOIN @src s ON s.code = d.code
JOIN @new n ON n.code = d.code;

DECLARE @added INT = (SELECT COUNT(*) FROM @new);
PRINT CONCAT(N'Đã thêm ', @added, N' khoa/phòng.');
GO

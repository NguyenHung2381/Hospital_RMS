/* ============================================================================
 * Đồng bộ mã khoa/phòng (departments.code) theo danh sách chuẩn
 * (danh-sach-khoa-phong-20260928.xlsx — mã CLSxx / PCNxx)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Mọi FK trỏ vào departments.id (DVxxx), không trỏ vào code ⇒ đổi code an toàn.
 *   code chỉ được dùng để tìm kiếm và sinh username khi cấp tài khoản thành
 *   viên mới (topicMemberService / sp cấp tài khoản) — tài khoản cũ giữ nguyên.
 *   abbreviation KHÔNG đổi (dùng sinh dept_account_id NVxxx).
 *
 *   Ghép theo id + mã cũ ⇒ chỉ đổi khi code vẫn là mã cũ, không ghi đè mã
 *   admin đã tự sửa. Script idempotent — chạy lại nhiều lần an toàn.
 *
 *   Khoa/phòng trong DB KHÔNG có trong Excel (giữ mã cũ):
 *     DV001 QLHT, DV044 Trung Tâm Tim Mạch, DV051 ĐV Chẩn Đoán Trước Sinh,
 *     DV057 Văn Thư, DV058 TT HSTC số 1, DV061 CSSK Theo Yêu Cầu,
 *     DV066 TT Dịch Vụ, DV067 QL Đấu Thầu, DV068 Tư vấn ghép tạng.
 *   Excel có nhưng DB chưa có: PCN10 Tổ hành chính quản trị,
 *     PCN11 Tổ công tác xã hội.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

UPDATE d
SET    d.code       = src.new_code,
       d.updated_at = GETDATE(),
       d.updated_by = 'SYSTEM'
FROM [dbo].[departments] d
JOIN (VALUES
    ('DV002', 'PTTM',   'CLS22'),  -- Phẫu thuật tạo hình thẩm mỹ
    ('DV003', 'K141',   'CLS44'),  -- Thần kinh
    ('DV004', 'K24',    'CLS21'),  -- Chấn thương - Chỉnh hình
    ('DV005', 'KHOA01', 'CLS11'),  -- Dược
    ('DV006', 'KSNK',   'CLS10'),  -- Kiểm soát nhiễm khuẩn
    ('DV007', 'DIDU',   'CLS49'),  -- Dinh dưỡng
    ('DV008', 'K142',   'CLS45'),  -- Trung tâm đột quỵ
    ('DV009', 'K36',    'CLS6'),   -- Huyết học - Trung tâm xét nghiệm
    ('DV010', 'PCNTT',  'PCN8'),   -- Công nghệ thông tin
    ('DV011', 'TCKT',   'PCN5'),   -- Tài chính kế toán
    ('DV012', 'PVT',    'PCN7'),   -- Cơ sở hạ tầng và Trang thiết bị
    ('DV013', 'K26',    'CLS14'),  -- Gây mê hồi sức
    ('DV014', 'K08',    'CLS37'),  -- Nội tiết
    ('DV015', 'K20',    'CLS20'),  -- Phẫu thuật thần kinh cột sống
    ('DV016', 'K50',    'CLS35'),  -- Nội Dị ứng - Hô hấp
    ('DV017', 'K01',    'CLS12'),  -- Khám bệnh
    ('DV018', 'K03',    'CLS33'),  -- Nội A - Lão khoa
    ('DV019', 'K041',   'CLS41'),  -- Nội tim mạch 1
    ('DV020', 'K042',   'CLS42'),  -- Nội tim mạch 2
    ('DV021', 'K05',    'CLS34'),  -- Nội tiêu hóa
    ('DV022', 'K06',    'CLS43'),  -- Nội Cơ - xương - khớp
    ('DV023', 'K07',    'CLS38'),  -- Nội Thận - Tiết niệu - Lọc máu
    ('DV024', 'K10',    'CLS39'),  -- Huyết học lâm sàng
    ('DV025', 'K11',    'CLS50'),  -- Nhiễm khuẩn tổng hợp
    ('DV026', 'K13',    'CLS46'),  -- Da liễu
    ('DV027', 'K16',    'CLS47'),  -- Y học cổ truyền
    ('DV028', 'K18',    'CLS26'),  -- Nhi - sơ sinh
    ('DV029', 'K19',    'CLS17'),  -- Ngoại tổng hợp 1
    ('DV030', 'K21',    'CLS40'),  -- Phẫu thuật tim mạch - lồng ngực
    ('DV031', 'K22',    'CLS19'),  -- Ngoại tiêu hóa
    ('DV032', 'K23',    'CLS18'),  -- Ngoại Thận - Tiết niệu
    ('DV033', 'K27',    'CLS24'),  -- Phụ sản
    ('DV034', 'K28',    'CLS27'),  -- Tai mũi họng
    ('DV035', 'K29',    'CLS28'),  -- Răng hàm mặt
    ('DV036', 'K30',    'CLS29'),  -- Mắt
    ('DV037', 'K31',    'CLS48'),  -- Phục hồi chức năng
    ('DV038', 'K37',    'CLS7'),   -- Hóa sinh - Trung tâm xét nghiệm
    ('DV039', 'K38',    'CLS5'),   -- Vi sinh - Trung tâm xét nghiệm
    ('DV040', 'K39',    'CLS2'),   -- Xquang
    ('DV041', 'K40',    'CLS1'),   -- Thăm dò chức năng
    ('DV042', 'K42',    'CLS9'),   -- Giải phẫu bệnh
    ('DV043', 'KHTH',   'PCN3'),   -- Kế hoạch tổng hợp
    ('DV045', 'K481',   'CLS30'),  -- Hồi sức tích cực
    ('DV046', 'K482',   'CLS32'),  -- Hồi sức tích cực ngoại khoa
    ('DV047', 'BGD',    'PCN1'),   -- Ban Giám đốc
    ('DV048', 'TCCB',   'PCN2'),   -- Tổ chức cán bộ
    ('DV049', 'DTCDT',  'PCN4'),   -- Trung tâm Đào tạo và Chỉ đạo tuyến
    ('DV050', 'K272',   'CLS25'),  -- Trung tâm Hỗ trợ sinh sản
    ('DV052', 'K112',   'CLS51'),  -- Vi rút - Ký sinh trùng
    ('DV053', 'K46',    'CLS3'),   -- Di truyền và Sinh học phân tử
    ('DV055', 'DUMD',   'CLS36'),  -- Dị ứng - Miễn dịch lâm sàng
    ('DV056', 'K49',    'CLS31'),  -- Chống độc
    ('DV059', 'K25',    'CLS23'),  -- Bỏng
    ('DV062', 'K02',    'CLS13'),  -- Cấp cứu
    ('DV063', 'K192',   'CLS16'),  -- Ngoại tổng hợp 2
    ('DV064', 'PDD',    'PCN6'),   -- Điều dưỡng
    ('DV065', 'QLCL',   'PCN9')    -- Quản lý chất lượng
) AS src (id, old_code, new_code)
    ON d.id = src.id AND d.code = src.old_code;

PRINT CONCAT(N'Đã cập nhật mã cho ', @@ROWCOUNT, N' khoa/phòng.');
GO

PRINT N'✅ Migration 2026-10-12_department_codes_from_his hoàn tất.';
GO

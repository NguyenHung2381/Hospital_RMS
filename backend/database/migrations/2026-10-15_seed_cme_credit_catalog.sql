/* ============================================================================
 * Seed danh mục quy đổi CME: 5 nhóm hoạt động + 29 loại hình thức
 * ----------------------------------------------------------------------------
 *   - cme_credit_groups.id = CME_DAOTAO, CME_QUYTRINH, CME_VBPL, CME_NCKH,
 *     CME_KHAC. Bản seed đầu dùng CMEG01..05 — mục 0 tự đổi sang mã mới.
 *   - cme_credit_categories.id = mã loại hình thức (DT_KHOAHOC, HT_CHUTRI...).
 *   - conversion_method: per_session = Theo tiết, fixed = Cố định,
 *     per_year = Theo năm. conversion_value = số giờ, unit_label = đơn vị
 *     (hiển thị "giờ/<unit_label>").
 *   - Chỉ thêm dòng chưa có (theo id) ⇒ không ghi đè chỉnh sửa của admin,
 *     chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 0. Đổi mã nhóm cũ CMEG01..05 (bản seed đầu) sang mã mới
DECLARE @map TABLE (old_id VARCHAR(20), new_id VARCHAR(20));
INSERT INTO @map VALUES ('CMEG01','CME_DAOTAO'), ('CMEG02','CME_QUYTRINH'),
                        ('CMEG03','CME_VBPL'),   ('CMEG04','CME_NCKH'),
                        ('CMEG05','CME_KHAC');
INSERT INTO [dbo].[cme_credit_groups] ([id], [name], [description], [sort_order], [created_at], [created_by], [updated_at], [updated_by])
SELECT m.new_id, g.name, g.description, g.sort_order, g.created_at, g.created_by, GETDATE(), 'SYSTEM'
FROM [dbo].[cme_credit_groups] g JOIN @map m ON m.old_id = g.id
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[cme_credit_groups] x WHERE x.id = m.new_id);
UPDATE c SET c.group_id = m.new_id
FROM [dbo].[cme_credit_categories] c JOIN @map m ON m.old_id = c.group_id;
DELETE g FROM [dbo].[cme_credit_groups] g JOIN @map m ON m.old_id = g.id;

INSERT INTO [dbo].[cme_credit_groups] ([id], [name], [sort_order], [created_by])
SELECT v.id, v.name, v.sort_order, 'SYSTEM'
FROM (VALUES
    ('CME_DAOTAO', N'Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo về y khoa', 1),
    ('CME_QUYTRINH', N'Tham gia soạn thảo quy trình chuyên môn', 2),
    ('CME_VBPL', N'Tham gia soạn thảo văn bản quy phạm pháp luật ban hành quy trình chuyên môn', 3),
    ('CME_NCKH', N'Nghiên cứu khoa học, giảng dạy về y khoa', 4),
    ('CME_KHAC', N'Tự cập nhật kiến thức y khoa và các hình thức khác', 5)
) AS v (id, name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[cme_credit_groups] g WHERE g.id = v.id);

INSERT INTO [dbo].[cme_credit_categories]
    ([id], [name], [group_id], [conversion_method], [conversion_value], [unit_label], [created_by])
SELECT v.id, v.name, v.group_id, v.method, v.value, v.unit, 'SYSTEM'
FROM (VALUES
    ('DT_KHOAHOC',         N'Khóa đào tạo, bồi dưỡng ngắn hạn (học viên/giảng viên)',            'CME_DAOTAO', 'per_session', 1,   N'tiết'),
    ('HT_CHUTRI',          N'Hội nghị, hội thảo — Chủ trì',                                       'CME_DAOTAO', 'fixed',       2,   N'buổi'),
    ('HT_BAOCAOVIEN',      N'Hội nghị, hội thảo — Báo cáo viên (kể cả chuẩn bị báo cáo)',         'CME_DAOTAO', 'fixed',       2,   N'báo cáo'),
    ('HT_DAIBIEU',         N'Hội nghị, hội thảo — Đại biểu',                                      'CME_DAOTAO', 'fixed',       1.5, N'buổi'),
    ('KHAC_CME_DAOTAO',    N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_DAOTAO', 'fixed',       0,   N'lần'),
    ('QT_TRUONGPHO',       N'Soạn thảo quy trình — Trưởng/Phó ban hoặc tổ soạn thảo',             'CME_QUYTRINH', 'fixed',       5,   N'tài liệu'),
    ('QT_THANHVIEN',       N'Soạn thảo quy trình — Thành viên ban soạn thảo/biên tập',            'CME_QUYTRINH', 'fixed',       2,   N'tài liệu'),
    ('KHAC_CME_QUYTRINH',  N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_QUYTRINH', 'fixed',       0,   N'lần'),
    ('VBPL_TRUONGPHO',     N'Soạn thảo VBQPPL — Trưởng/Phó ban hoặc tổ soạn thảo',                'CME_VBPL', 'fixed',       5,   N'văn bản'),
    ('VBPL_THANHVIEN',     N'Soạn thảo VBQPPL — Thành viên ban soạn thảo/biên tập',               'CME_VBPL', 'fixed',       3,   N'văn bản'),
    ('KHAC_CME_VBPL',      N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_VBPL', 'fixed',       0,   N'lần'),
    ('NCKH_CHUTRI_CAOCAP', N'Nhiệm vụ KH&CN/sáng kiến cấp Nhà nước/Bộ/Tỉnh — Chủ trì/thư ký',     'CME_NCKH', 'fixed',       12,  N'nhiệm vụ'),
    ('NCKH_CHUTRI_COSO',   N'Nhiệm vụ KH&CN/sáng kiến cấp cơ sở — Chủ trì/thư ký',                'CME_NCKH', 'fixed',       8,   N'nhiệm vụ'),
    ('NCKH_THANHVIEN',     N'Nhiệm vụ KH&CN/sáng kiến các cấp — Thành viên',                      'CME_NCKH', 'fixed',       4,   N'nhiệm vụ'),
    ('BB_QT_C1',           N'Bài báo khoa học quốc tế — Tác giả chính/chịu trách nhiệm',          'CME_NCKH', 'fixed',       8,   N'bài'),
    ('BB_QT_C2',           N'Bài báo khoa học quốc tế — Tác giả thứ hai trở đi',                  'CME_NCKH', 'fixed',       2,   N'bài'),
    ('BB_TN_C1',           N'Bài báo khoa học trong nước — Tác giả chính/chịu trách nhiệm',       'CME_NCKH', 'fixed',       4,   N'bài'),
    ('BB_TN_C2',           N'Bài báo khoa học trong nước — Tác giả thứ hai trở đi',               'CME_NCKH', 'fixed',       1,   N'bài'),
    ('GIANGDAY',           N'Giảng dạy về y khoa (kể cả chuẩn bị bài giảng)',                     'CME_NCKH', 'per_session', 1,   N'tiết'),
    ('KHAC_CME_NCKH',      N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_NCKH', 'fixed',       0,   N'lần'),
    ('HD_LUANVAN',         N'Hướng dẫn luận văn',                                                 'CME_KHAC', 'fixed',       4,   N'luận văn'),
    ('HD_LUANAN',          N'Hướng dẫn luận án',                                                  'CME_KHAC', 'per_year',    4,   N'năm'),
    ('HDONG_CHUTICH',      N'Tham gia hội đồng — Chủ tịch',                                       'CME_KHAC', 'fixed',       3,   N'hội đồng'),
    ('HDONG_THUKY',        N'Tham gia hội đồng — Thư ký/phản biện',                               'CME_KHAC', 'fixed',       2,   N'hội đồng'),
    ('HDONG_THANHVIEN',    N'Tham gia hội đồng — Thành viên',                                     'CME_KHAC', 'fixed',       1,   N'hội đồng'),
    ('SHCM_CABENH',        N'Sinh hoạt chuyên môn — Hội chẩn/phân tích ca bệnh',                  'CME_KHAC', 'fixed',       1,   N'ca bệnh'),
    ('HOC_VANBANG',        N'Đang học khóa đào tạo cấp văn bằng (trong/ngoài nước)',              'CME_KHAC', 'per_year',    24,  N'năm'),
    ('HOC_CHUNGCHI',       N'Đang học khóa đào tạo cấp chứng chỉ chuyên khoa/kỹ thuật',           'CME_KHAC', 'per_session', 1,   N'tiết'),
    ('KHAC_CME_KHAC',      N'Khác (nhập số tín chỉ trực tiếp)',                                   'CME_KHAC', 'fixed',       0,   N'lần')
) AS v (id, name, group_id, method, value, unit)
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[cme_credit_categories] c WHERE c.id = v.id);

COMMIT;
PRINT N'✅ Seed danh mục quy đổi CME hoàn tất.';
GO

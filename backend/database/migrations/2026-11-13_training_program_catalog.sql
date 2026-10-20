/* ============================================================================
 * 2026-11-13_training_program_catalog
 * ----------------------------------------------------------------------------
 *   Danh mục chương trình đào tạo đầy đủ — 87 chương trình (20 GPHN + 67 ĐTLT)
 *   theo "danh-sach-ctdt-20261020.xlsx". Gộp 2 file cũ (khai báo trong MERGED
 *   của src/database/migrator.js):
 *     - 2026-11-13_dtlt_programs_department_codes.sql (mã khoa K*, PDD cho 57 CT ĐTLT)
 *     - 2026-11-14_program_trainee_types.sql          (nhiều đối tượng / chương trình)
 * 1) Danh mục đối tượng Y sĩ, Cử nhân + bảng program_trainee_types.
 * 2) Tạo chương trình còn thiếu (theo mã training_programs.code).
 * 3) Khoa phụ trách: 57 CT ĐTLT có trong 2026-11-12 ghi đè sang mã khoa đúng
 *    (bỏ mã CLS* cũ); các CT còn lại chỉ điền khi đang trống. GPHN chỉ 1 khoa
 *    theo sổ 3.xlsx: DD_1 → Khoa Dinh Dưỡng, KTVXN_2 / KTVXQ_2 → Khoa Cấp Cứu.
 * 4) Thông tin (loại hình, số tiết, thời lượng, đối tượng, sĩ số, ghi chú khoa):
 *    CHỈ điền cột đang trống — đã nhập / sửa tay thì giữ. Số liệu lấy từ
 *    "Chi tiết chương trình học ĐTLT.xlsx" (như 2026-11-12), thiếu thì theo
 *    danh sách CTĐT.
 * 5) Đối tượng học viên — CHỈ chương trình chưa có đối tượng nào.
 *    GPHN_YS_1/2: Excel để trống, gán Y sĩ theo tên chương trình.
 *    GPHN_DD_1 (dinh dưỡng lâm sàng): chưa rõ đối tượng, để trống.
 * 6) training_programs.trainee_type_id = đối tượng đầu tiên (code cũ vẫn đọc cột này).
 * 7) Vòng thực hành GPHN + khoa được đi của từng vòng (program_lessons 'rotation',
 *    mã <mã CT>_V<n>, lesson_departments) — rút từ sổ thực hành 3.xlsx bằng
 *    rotationPlanner.deriveTemplate (như practiceAutoService.buildTemplates).
 *    CHỈ chương trình chưa có vòng nào. "Trung tâm Bệnh nhiệt đới" của sổ = K11
 *    (vòng Nội khoa GPHN_DTH_1). Không có mẫu: GPHN_BS_3 (chuyên khoa tùy ngành),
 *    GPHN_BS_4/5, HS_1/2, YS_1/2, KTVNK_1/2, KTVPHCN_1/2 (sổ chưa ghi khoa).
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
GO

-- 1a) Danh mục đối tượng còn thiếu
MERGE [dbo].[trainee_types] AS tgt
USING (VALUES
    ('TRNTYPE-YS', N'Y sĩ',    N'Y sĩ đa khoa / Y sĩ YHCT'),
    ('TRNTYPE-CN', N'Cử nhân', N'Cử nhân xét nghiệm, sinh học, y tế công cộng...')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM');
GO

-- 1b) Bảng nối chương trình ↔ đối tượng
IF OBJECT_ID(N'dbo.program_trainee_types', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[program_trainee_types] (
        [program_id]      VARCHAR(20) NOT NULL,
        [trainee_type_id] VARCHAR(20) NOT NULL,
        [display_order]   INT         NOT NULL CONSTRAINT DF_program_trainee_types_order DEFAULT (0),
        CONSTRAINT PK_program_trainee_types PRIMARY KEY ([program_id], [trainee_type_id]),
        CONSTRAINT FK_prgtt_program FOREIGN KEY ([program_id])      REFERENCES [dbo].[training_programs] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_prgtt_type    FOREIGN KEY ([trainee_type_id]) REFERENCES [dbo].[trainee_types]     ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_program_trainee_types_type] ON [dbo].[program_trainee_types] ([trainee_type_id]);
END
GO

-- 1c) Đối tượng đơn đang có → bảng mới
INSERT INTO program_trainee_types (program_id, trainee_type_id, display_order)
SELECT p.id, p.trainee_type_id, 0
FROM training_programs p
WHERE p.trainee_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM program_trainee_types x WHERE x.program_id = p.id);
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 2) Tạo chương trình còn thiếu
INSERT INTO training_programs (id, code, name, display_order, created_by)
SELECT 'CT' + LEFT(REPLACE(NEWID(), '-', ''), 18), v.code, v.name, v.ord, 'SYSTEM'
FROM (VALUES
    (N'GPHN_DTH_2',    N'Thực hành giấy phép hành nghề Điều dưỡng về Hồi sức cấp cứu', 1),
    (N'GPHN_BS_2',     N'Thực hành giấy phép hành nghề Bác sĩ về Hồi sức cấp cứu', 2),
    (N'GPHN_BS_1',     N'Thực hành giấy phép hành nghề Bác sĩ y khoa', 3),
    (N'GPHN_BS_3',     N'Thực hành giấy phép hành nghề Bác sĩ chuyên khoa', 4),
    (N'GPHN_BS_4',     N'Thực hành giấy phép hành nghề Bác sĩ y học cổ truyền', 5),
    (N'GPHN_BS_5',     N'Thực hành giấy phép hành nghề Bác sĩ răng hàm mặt', 6),
    (N'GPHN_DTH_1',    N'Thực hành giấy phép hành nghề Điều dưỡng', 7),
    (N'GPHN_YS_1',     N'Thực hành giấy phép hành nghề Y sĩ đa khoa', 8),
    (N'GPHN_YS_2',     N'Thực hành giấy phép hành nghề Y sĩ y học cổ truyền', 9),
    (N'GPHN_HS_1',     N'Thực hành giấy phép hành nghề hộ sinh', 10),
    (N'GPHN_HS_2',     N'Thực hành giấy phép hành nghề Hộ sinh về Hồi sức cấp cứu', 11),
    (N'GPHN_KTVXN_1',  N'Thực hành giấy phép hành nghề kỹ thuật y (xét nghiệm y học)', 12),
    (N'GPHN_KTVXN_2',  N'Thực hành giấy phép hành nghề kỹ thuật y (xét nghiệm y học) về Hồi sức cấp cứu', 13),
    (N'GPHN_KTVXQ_1',  N'Thực hành giấy phép hành nghề kỹ thuật y (hình ảnh y học)', 14),
    (N'GPHN_KTVXQ_2',  N'Thực hành giấy phép hành nghề kỹ thuật y (hình ảnh y học) về Hồi sức cấp cứu', 15),
    (N'GPHN_KTVNK_1',  N'Thực hành giấy phép hành nghề kỹ thuật y (khúc xạ nhãn khoa)', 16),
    (N'GPHN_KTVNK_2',  N'Thực hành giấy phép hành nghề kỹ thuật y (khúc xạ nhãn khoa) về Hồi sức cấp cứu', 17),
    (N'GPHN_KTVPHCN_1', N'Thực hành giấy phép hành nghề kỹ thuật y (Phục hồi chức năng)', 18),
    (N'GPHN_KTVPHCN_2', N'Thực hành giấy phép hành nghề kỹ thuật y (Phục hồi chức năng)', 19),
    (N'GPHN_DD_1',     N'Thực hành giấy phép hành nghề dinh dưỡng lâm sàng', 20),
    (N'ĐTLT_1',        N'Giải phẫu bệnh cơ bản', 21),
    (N'ĐTLT_2',        N'Chấn thương Chỉnh hình cơ bản', 22),
    (N'ĐTLT_3',        N'Chẩn đoán và điều trị các bệnh Nội tiết', 23),
    (N'ĐTLT_4',        N'Kỹ thuật viên Nội soi Tiêu hóa', 24),
    (N'ĐTLT_5',        N'Siêu âm cơ bản', 25),
    (N'ĐTLT_6',        N'Nội soi tiêu hóa cơ bản', 26),
    (N'ĐTLT_7',        N'Nội soi can thiệp đường tiêu hóa', 27),
    (N'ĐTLT_8',        N'Nội soi đại tràng', 28),
    (N'ĐTLT_9',        N'Phẫu thuật Nội soi cơ bản', 29),
    (N'ĐTLT_10',       N'Hóa sinh cơ bản', 30),
    (N'ĐTLT_11',       N'Chẩn đoán và điều trị bệnh đột quỵ não', 31),
    (N'ĐTLT_12',       N'Chẩn đoán và điều trị suy tim', 32),
    (N'ĐTLT_13',       N'Hướng dẫn đọc Điện tâm đồ', 33),
    (N'ĐTLT_14',       N'Điện não đồ', 34),
    (N'ĐTLT_15',       N'An toàn người bệnh', 35),
    (N'ĐTLT_16',       N'Sử dụng thuốc an toàn hợp lý cho Điều dưỡng', 36),
    (N'ĐTLT_17',       N'Tăng cường năng lực quản lý Điều dưỡng', 37),
    (N'ĐTLT_18',       N'Gây mê hồi sức cơ bản', 38),
    (N'ĐTLT_19',       N'Gây mê hồi sức trong phẫu thuật nội soi', 39),
    (N'ĐTLT_20',       N'X.quang cơ bản', 40),
    (N'ĐTLT_21',       N'Cắt lớp vi tính cơ bản', 41),
    (N'ĐTLT_22',       N'Khám và điều trị các bệnh TMH cơ bản', 42),
    (N'ĐTLT_23',       N'Khám nội soi tai mũi họng', 43),
    (N'ĐTLT_24',       N'Mở khí quản', 44),
    (N'ĐTLT_25',       N'Đào tạo điều dưỡng chuyên ngành tai mũi họng', 45),
    (N'ĐTLT_26',       N'Điều dưỡng nha khoa', 46),
    (N'ĐTLT_27',       N'Kỹ thuật cấp cứu cơ bản - Bác sĩ', 47),
    (N'ĐTLT_28',       N'Kỹ thuật cấp cứu cơ bản - Điều dưỡng', 48),
    (N'ĐTLT_29',       N'Phẫu thuật Phaco', 49),
    (N'ĐTLT_30',       N'Chụp mạch huỳnh quang đáy mắt', 50),
    (N'ĐTLT_31',       N'Kiểm soát nhiễm khuẩn', 51),
    (N'ĐTLT_32',       N'Cấp cứu ngừng tuần hoàn', 52),
    (N'ĐTLT_33',       N'Chẩn đoán và điều trị chấn thương sọ não', 53),
    (N'ĐTLT_34',       N'Tiêm an toàn và quản lý chất rắn y tế', 54),
    (N'ĐTLT_35',       N'Kỹ năng tư vấn và Giáo dục sức khỏe', 55),
    (N'ĐTLT_36',       N'Quản lý điều dưỡng', 56),
    (N'ĐTLT_37',       N'Nội soi phế quản ống mềm', 57),
    (N'ĐTLT_38',       N'Chăm sóc bệnh nhân hồi sức sau mổ', 58),
    (N'ĐTLT_39',       N'Chăm sóc bệnh nhân thở máy', 59),
    (N'ĐTLT_40',       N'Thông khí nhân tạo cơ bản', 60),
    (N'ĐTLT_41',       N'Kỹ thuật xét nghiệm Huyết học - Truyền máu cơ bản', 61),
    (N'ĐTLT_42',       N'Chẩn đoán và điều trị các bệnh lý Cơ xương khớp cơ bản', 62),
    (N'ĐTLT_43',       N'Kỹ thuật vật lý trị liệu- phục hồi chức năng cơ bản', 63),
    (N'ĐTLT_44',       N'Khúc xạ cơ bản', 64),
    (N'ĐTLT_45',       N'Phẫu thuật gan mật cơ bản', 65),
    (N'ĐTLT_46',       N'Kỹ thuật lọc máu thận nhân tạo cơ bản - Điều dưỡng - KTV', 66),
    (N'ĐTLT_47',       N'Kỹ thuật lọc máu thận nhân tạo cơ bản - Bác sỹ', 67),
    (N'ĐTLT_48',       N'Kỹ thuật xét nghiệm vi sinh cơ bản', 68),
    (N'ĐTLT_49',       N'Kỹ thuật xoa bóp bấm huyệt', 69),
    (N'ĐTLT_50',       N'Kỹ thuật châm cứu cơ bản', 70),
    (N'ĐTLT_51',       N'Đọc phim MRI cơ bản', 71),
    (N'ĐTLT_52',       N'Chẩn đoán và điều trị viêm gan', 72),
    (N'ĐTLT_53',       N'Tiêm khớp cơ bản', 73),
    (N'ĐTLT_54',       N'Chẩn đoán và điều trị một một số bệnh đường tiêu hóa thường gặp', 74),
    (N'ĐTLT_55',       N'Chẩn đoán và điều trị các bệnh lý Huyết học – Truyền máu', 75),
    (N'ĐTLT_56',       N'Kỹ thuật viên Gây mê hồi sức', 76),
    (N'ĐTLT_57',       N'Dụng cụ viên Gây mê hồi sức', 77),
    (N'ĐTLT_58',       N'Thực hành tốt bán lẻ thuốc', 78),
    (N'ĐTLT_59',       N'Bảo quản và cấp phát thuốc', 79),
    (N'ĐTLT_60',       N'Kỹ năng tìm kiếm và phân giải thông tin thuốc', 80),
    (N'ĐTLT_61',       N'Sử dụng thuốc trên các đối tượng đặc biệt', 81),
    (N'ĐTLT_62',       N'Thực hành khai thác bệnh án và phân tích ca lâm sàng', 82),
    (N'ĐTLT_63',       N'Kỹ thuật khai thông mạch não bằng điều trị thuốc tiêu sợi huyết trong nhồi máu não cấp', 83),
    (N'ĐTLT_64',       N'Phục hồi chức năng cơ bản', 84),
    (N'ĐTLT_65',       N'Hồi sức cấp cứu cơ bản', 85),
    (N'ĐTLT_66',       N'Kỹ thuật lọc máu liên tục và thay huyết tương', 86),
    (N'ĐTLT_67',       N'Chăm sóc người bệnh lọc máu liên tục và thay huyết tương', 87)
) v (code, name, ord)
WHERE NOT EXISTS (SELECT 1 FROM training_programs p WHERE p.code = v.code);

-- Thông tin từng chương trình. dept = departments.code;
-- force_dept = 1 → ghi đè khoa đang có (57 CT ĐTLT của 2026-11-12)
DECLARE @info TABLE (
    code NVARCHAR(50) PRIMARY KEY, training_type_id VARCHAR(20),
    theory_hours INT, practice_hours INT, duration NVARCHAR(50),
    duration_value DECIMAL(10, 2), duration_unit VARCHAR(10), target_audience NVARCHAR(500),
    min_capacity INT, max_capacity INT, dept NVARCHAR(50), force_dept BIT, department_note NVARCHAR(500)
);
INSERT INTO @info VALUES
    (N'GPHN_DTH_2',    'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Điều dưỡng', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_BS_2',     'TRNTP-GPHN', NULL, NULL, N'03 tháng', 3, 'month', N'Bác sĩ', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_BS_1',     'TRNTP-GPHN', NULL, NULL, N'12 tháng', 12, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_BS_3',     'TRNTP-GPHN', NULL, NULL, N'09 tháng', 9, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_BS_4',     'TRNTP-GPHN', NULL, NULL, N'12 tháng', 12, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_BS_5',     'TRNTP-GPHN', NULL, NULL, N'12 tháng', 12, 'month', N'Bác sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_DTH_1',    'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Điều dưỡng', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_YS_1',     'TRNTP-GPHN', NULL, NULL, N'09 tháng', 9, 'month', N'Y sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_YS_2',     'TRNTP-GPHN', NULL, NULL, N'09 tháng', 9, 'month', N'Y sĩ', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_HS_1',     'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Nữ hộ sinh', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_HS_2',     'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Nữ hộ sinh', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVXN_1',  'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVXN_2',  'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_KTVXQ_1',  'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVXQ_2',  'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, N'K02', 0, NULL),
    (N'GPHN_KTVNK_1',  'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVNK_2',  'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVPHCN_1', 'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_KTVPHCN_2', 'TRNTP-GPHN', NULL, NULL, N'01 tháng', 1, 'month', N'Kỹ thuật viên', NULL, NULL, NULL, 0, NULL),
    (N'GPHN_DD_1',     'TRNTP-GPHN', NULL, NULL, N'06 tháng', 6, 'month', NULL, NULL, NULL, N'DIDU', 0, NULL),
    (N'ĐTLT_1',        'TRNTP-DTLT', 188, 340, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 10, N'K42', 1, NULL),
    (N'ĐTLT_2',        'TRNTP-DTLT', 132, 1308, N'09 tháng', 9, 'month', N'Bác sĩ', 5, 15, N'K24', 1, NULL),
    (N'ĐTLT_3',        'TRNTP-DTLT', 80, 240, N'03 tháng', 3, 'month', N'Bác sĩ', 10, 10, N'K08', 1, NULL),
    (N'ĐTLT_4',        'TRNTP-DTLT', 50, 430, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_5',        'TRNTP-DTLT', 92, 388, N'03 tháng', 3, 'month', N'Bác sĩ', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_6',        'TRNTP-DTLT', 60, 420, N'03 tháng', 3, 'month', N'Bác sĩ', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_7',        'TRNTP-DTLT', 60, 420, N'03 tháng', 3, 'month', N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên hoặc nội soi đại tràng', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_8',        'TRNTP-DTLT', 50, 430, N'03 tháng', 3, 'month', N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên', 5, 10, N'K40', 1, NULL),
    (N'ĐTLT_9',        'TRNTP-DTLT', 102, 378, N'03 tháng', 3, 'month', N'Bác sĩ', 10, 10, N'K22', 1, NULL),
    (N'ĐTLT_10',       'TRNTP-DTLT', 130, 246, N'03 tháng', 3, 'month', N'Bác sĩ, Dược sĩ, Cử nhân, KTV xét nghiệm', 1, 8, N'K37', 1, NULL),
    (N'ĐTLT_11',       'TRNTP-DTLT', 48, 912, N'06 tháng', 6, 'month', N'Bác sĩ đã có CCHN', 2, 10, N'K142', 1, NULL),
    (N'ĐTLT_12',       'TRNTP-DTLT', 60, 120, N'02 tháng', 2, 'month', N'Bác sĩ', 5, 10, N'K51', 1, NULL),
    (N'ĐTLT_13',       'TRNTP-DTLT', 80, 160, N'02 tháng', 2, 'month', N'Bác sĩ', 10, 20, N'K51', 1, NULL),
    (N'ĐTLT_14',       'TRNTP-DTLT', 60, 120, N'1,5 tháng', 1.5, 'month', N'Bác sĩ', 3, 10, N'K141', 1, NULL),
    (N'ĐTLT_15',       'TRNTP-DTLT', NULL, NULL, N'07 ngày', 7, 'day', N'Bác sĩ', NULL, NULL, N'PDD', 0, NULL),
    (N'ĐTLT_16',       'TRNTP-DTLT', NULL, NULL, N'05 ngày', 5, 'day', N'Điều dưỡng', NULL, NULL, N'PDD', 0, NULL),
    (N'ĐTLT_17',       'TRNTP-DTLT', 39, 17, N'07 ngày', 7, 'day', N'Điều dưỡng, hộ sinh, KTV', 20, 25, N'PDD', 1, NULL),
    (N'ĐTLT_18',       'TRNTP-DTLT', 89, 419, N'06 tháng', 6, 'month', N'Bác sĩ', 1, 10, N'K26', 1, NULL),
    (N'ĐTLT_19',       'TRNTP-DTLT', 81, 269, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 8, N'K26', 1, NULL),
    (N'ĐTLT_20',       'TRNTP-DTLT', 126, 310, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 15, N'K39', 1, NULL),
    (N'ĐTLT_21',       'TRNTP-DTLT', 96, 410, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 15, N'K39', 1, NULL),
    (N'ĐTLT_22',       'TRNTP-DTLT', NULL, NULL, N'03 tháng', 3, 'month', N'Bác sĩ', NULL, NULL, N'K28', 0, NULL),
    (N'ĐTLT_23',       'TRNTP-DTLT', 88, 310, N'03 tháng', 3, 'month', N'Bác sĩ, KTV', 2, 10, N'K28', 1, NULL),
    (N'ĐTLT_24',       'TRNTP-DTLT', 32, 96, N'01 tháng', 1, 'month', N'Bác sĩ, KTV', 2, 10, N'K28', 1, NULL),
    (N'ĐTLT_25',       'TRNTP-DTLT', 96, 360, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 2, 10, N'K28', 1, NULL),
    (N'ĐTLT_26',       'TRNTP-DTLT', 48, 352, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 10, N'K29', 1, NULL),
    (N'ĐTLT_27',       'TRNTP-DTLT', 110, 454, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 15, N'K02', 1, NULL),
    (N'ĐTLT_28',       'TRNTP-DTLT', 94, 449, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 2, 25, N'K02', 1, NULL),
    (N'ĐTLT_29',       'TRNTP-DTLT', 150, 330, N'03 tháng', 3, 'month', N'Bác sĩ đã có CCHN', 2, 5, N'K30', 1, NULL),
    (N'ĐTLT_30',       'TRNTP-DTLT', 90, 150, N'1,5 tháng', 1.5, 'month', N'Bác sĩ đã có CCHN', 2, 10, N'K30', 1, NULL),
    (N'ĐTLT_31',       'TRNTP-DTLT', 24, 16, N'05 ngày', 5, 'day', N'Nhân viên y tế', 10, 15, N'KSNK', 1, NULL),
    (N'ĐTLT_32',       'TRNTP-DTLT', 10, 30, N'07 ngày', 7, 'day', N'Bác sĩ, điều dưỡng, hộ sinh, KTV', 2, 15, N'K02', 1, NULL),
    (N'ĐTLT_33',       'TRNTP-DTLT', 200, 200, N'03 tháng', 3, 'month', N'BS có CCHN', 2, 10, N'K20', 1, NULL),
    (N'ĐTLT_34',       'TRNTP-DTLT', 27, 11, N'04 ngày', 4, 'day', N'Điều dưỡng, hộ sinh, KTV', 20, 35, N'PDD', 1, NULL),
    (N'ĐTLT_35',       'TRNTP-DTLT', 21, 29, N'05 ngày', 5, 'day', N'Điều dưỡng, hộ sinh', 2, 25, N'PDD', 1, NULL),
    (N'ĐTLT_36',       'TRNTP-DTLT', NULL, NULL, N'20 ngày', 20, 'day', N'Điều dưỡng', NULL, NULL, N'PDD', 0, NULL),
    (N'ĐTLT_37',       'TRNTP-DTLT', 20, 280, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 5, N'K50', 1, NULL),
    (N'ĐTLT_38',       'TRNTP-DTLT', 128, 340, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 15, N'K482', 1, NULL),
    (N'ĐTLT_39',       'TRNTP-DTLT', 112, 336, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 15, N'K482', 1, NULL),
    (N'ĐTLT_40',       'TRNTP-DTLT', 100, 378, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 15, N'K482', 1, NULL),
    (N'ĐTLT_41',       'TRNTP-DTLT', 116, 412, N'03 tháng', 3, 'month', N'Bác sĩ, Y sĩ, Điều dưỡng, Hộ sinh, KTV', 1, 15, N'K36', 1, NULL),
    (N'ĐTLT_42',       'TRNTP-DTLT', 66, 462, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 15, N'K06', 1, NULL),
    (N'ĐTLT_43',       'TRNTP-DTLT', NULL, NULL, N'03 tháng', 3, 'month', N'Điều dưỡng', NULL, NULL, N'K31', 0, NULL),
    (N'ĐTLT_44',       'TRNTP-DTLT', 150, 330, N'03 tháng', 3, 'month', N'Bác sĩ nhãn khoa đã có CCHN', 2, 10, N'K30', 1, NULL),
    (N'ĐTLT_45',       'TRNTP-DTLT', 48, 370, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 5, N'K192', 1, NULL),
    (N'ĐTLT_46',       'TRNTP-DTLT', 152, 652, N'06 tháng', 6, 'month', N'ĐD, KTV', 2, 10, N'K07', 1, NULL),
    (N'ĐTLT_47',       'TRNTP-DTLT', 156, 656, N'06 tháng', 6, 'month', N'BS', 2, 10, N'K07', 1, NULL),
    (N'ĐTLT_48',       'TRNTP-DTLT', 48, 436, N'03 tháng', 3, 'month', N'BS, KTV xét nghiệm, Cử nhân sinh học, ĐD, Dược sĩ', 1, 10, N'K38', 1, NULL),
    (N'ĐTLT_49',       'TRNTP-DTLT', 228, 268, N'03 tháng', 3, 'month', N'BS, ĐD,KTV, YS YHCT', 2, 15, N'K16', 1, NULL),
    (N'ĐTLT_50',       'TRNTP-DTLT', 172, 296, N'03 tháng', 3, 'month', N'BS, ĐD,KTV, YS YHCT', 2, 15, N'K16', 1, NULL),
    (N'ĐTLT_51',       'TRNTP-DTLT', 96, 440, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 15, N'K39', 1, NULL),
    (N'ĐTLT_52',       'TRNTP-DTLT', 100, 304, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 10, N'K11', 1, N'Trung tâm Bệnh nhiệt đới'),
    (N'ĐTLT_53',       'TRNTP-DTLT', 128, 416, N'03 tháng', 3, 'month', N'Bác sĩ đã có CCHN/GPHN', 1, 15, N'K06', 1, NULL),
    (N'ĐTLT_54',       'TRNTP-DTLT', 198, 282, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 10, N'K05', 1, NULL),
    (N'ĐTLT_55',       'TRNTP-DTLT', 177, 187, N'03 tháng', 3, 'month', N'Bác sĩ', 5, 10, N'K10', 1, NULL),
    (N'ĐTLT_56',       'TRNTP-DTLT', 68, 440, N'03 tháng', 3, 'month', N'Điều dưỡng, KTV', 1, 12, N'K26', 1, NULL),
    (N'ĐTLT_57',       'TRNTP-DTLT', 126, 274, N'03 tháng', 3, 'month', N'Điều dưỡng, Y sỹ, KTV', 1, 10, N'K26', 1, NULL),
    (N'ĐTLT_58',       'TRNTP-DTLT', NULL, NULL, N'03 ngày', 3, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_59',       'TRNTP-DTLT', NULL, NULL, N'02 ngày', 2, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_60',       'TRNTP-DTLT', NULL, NULL, N'03 ngày', 3, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_61',       'TRNTP-DTLT', NULL, NULL, N'02 ngày', 2, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_62',       'TRNTP-DTLT', NULL, NULL, N'02 ngày', 2, 'day', N'Dược sĩ', NULL, NULL, N'KHOA01', 0, NULL),
    (N'ĐTLT_63',       'TRNTP-DTLT', 72, 288, N'03 tháng', 3, 'month', N'Bác sĩ', 10, 10, N'K142', 1, NULL),
    (N'ĐTLT_64',       'TRNTP-DTLT', 260, 684, N'09 tháng', 9, 'month', N'Bác sĩ', 10, 10, N'K31', 1, NULL),
    (N'ĐTLT_65',       'TRNTP-DTLT', 82, 436, N'03 tháng', 3, 'month', N'Bác sĩ', 1, 20, N'K481', 1, NULL),
    (N'ĐTLT_66',       'TRNTP-DTLT', 160, 390, N'03 tháng', 3, 'month', N'Bác sĩ', 2, 10, N'K481', 1, NULL),
    (N'ĐTLT_67',       'TRNTP-DTLT', 128, 377, N'03 tháng', 3, 'month', N'Điều dưỡng', 2, 15, N'K481', 1, NULL);

-- 3) Khoa phụ trách
UPDATE p SET
    department_id = d.id,
    updated_at = GETDATE(), updated_by = 'SYSTEM'
FROM training_programs p
JOIN @info v ON v.code = p.code
JOIN departments d ON d.code = v.dept
WHERE (v.force_dept = 1 AND (p.department_id IS NULL OR p.department_id <> d.id))
   OR (v.force_dept = 0 AND p.department_id IS NULL);

-- ĐTLT_12, ĐTLT_13 đã gắn Trung tâm Tim mạch (K51) → bỏ ghi chú khoa cũ
UPDATE training_programs SET
    department_note = NULL,
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code IN (N'ĐTLT_12', N'ĐTLT_13') AND department_note = N'Trung tâm Tim mạch';

-- 4) Thông tin còn trống
UPDATE p SET
    training_type_id = COALESCE(p.training_type_id, v.training_type_id),
    theory_hours     = COALESCE(p.theory_hours, v.theory_hours),
    practice_hours   = COALESCE(p.practice_hours, v.practice_hours),
    duration         = COALESCE(p.duration, v.duration),
    duration_value   = COALESCE(p.duration_value, v.duration_value),
    duration_unit    = COALESCE(p.duration_unit, v.duration_unit),
    target_audience  = COALESCE(p.target_audience, v.target_audience),
    min_capacity     = COALESCE(p.min_capacity, v.min_capacity),
    max_capacity     = COALESCE(p.max_capacity, v.max_capacity),
    department_note  = COALESCE(p.department_note, v.department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
FROM training_programs p
JOIN @info v ON v.code = p.code
WHERE (p.training_type_id IS NULL AND v.training_type_id IS NOT NULL)
   OR (p.theory_hours     IS NULL AND v.theory_hours     IS NOT NULL)
   OR (p.practice_hours   IS NULL AND v.practice_hours   IS NOT NULL)
   OR (p.duration         IS NULL AND v.duration         IS NOT NULL)
   OR (p.duration_value   IS NULL AND v.duration_value   IS NOT NULL)
   OR (p.duration_unit    IS NULL AND v.duration_unit    IS NOT NULL)
   OR (p.target_audience  IS NULL AND v.target_audience  IS NOT NULL)
   OR (p.min_capacity     IS NULL AND v.min_capacity     IS NOT NULL)
   OR (p.max_capacity     IS NULL AND v.max_capacity     IS NOT NULL)
   OR (p.department_note  IS NULL AND v.department_note  IS NOT NULL);

-- 5) Đối tượng học viên
INSERT INTO program_trainee_types (program_id, trainee_type_id, display_order)
SELECT p.id, v.trainee_type_id, v.ord
FROM (VALUES
    (N'GPHN_DTH_2',    'TRNTYPE-DD',  0),
    (N'GPHN_BS_2',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_1',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_3',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_4',     'TRNTYPE-BS',  0),
    (N'GPHN_BS_5',     'TRNTYPE-BS',  0),
    (N'GPHN_DTH_1',    'TRNTYPE-DD',  0),
    (N'GPHN_YS_1',     'TRNTYPE-YS',  0),
    (N'GPHN_YS_2',     'TRNTYPE-YS',  0),
    (N'GPHN_HS_1',     'TRNTYPE-NHS', 0),
    (N'GPHN_HS_2',     'TRNTYPE-NHS', 0),
    (N'GPHN_KTVXN_1',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVXN_2',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVXQ_1',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVXQ_2',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVNK_1',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVNK_2',  'TRNTYPE-KTV', 0),
    (N'GPHN_KTVPHCN_1', 'TRNTYPE-KTV', 0),
    (N'GPHN_KTVPHCN_2', 'TRNTYPE-KTV', 0),
    (N'ĐTLT_1',        'TRNTYPE-BS',  0),
    (N'ĐTLT_2',        'TRNTYPE-BS',  0),
    (N'ĐTLT_3',        'TRNTYPE-BS',  0),
    (N'ĐTLT_4',        'TRNTYPE-DD',  0),
    (N'ĐTLT_4',        'TRNTYPE-KTV', 1),
    (N'ĐTLT_5',        'TRNTYPE-BS',  0),
    (N'ĐTLT_6',        'TRNTYPE-BS',  0),
    (N'ĐTLT_7',        'TRNTYPE-BS',  0),
    (N'ĐTLT_8',        'TRNTYPE-BS',  0),
    (N'ĐTLT_9',        'TRNTYPE-BS',  0),
    (N'ĐTLT_10',       'TRNTYPE-BS',  0),
    (N'ĐTLT_10',       'TRNTYPE-DSI', 1),
    (N'ĐTLT_10',       'TRNTYPE-CN',  2),
    (N'ĐTLT_10',       'TRNTYPE-KTV', 3),
    (N'ĐTLT_11',       'TRNTYPE-BS',  0),
    (N'ĐTLT_12',       'TRNTYPE-BS',  0),
    (N'ĐTLT_13',       'TRNTYPE-BS',  0),
    (N'ĐTLT_14',       'TRNTYPE-BS',  0),
    (N'ĐTLT_15',       'TRNTYPE-BS',  0),
    (N'ĐTLT_16',       'TRNTYPE-DD',  0),
    (N'ĐTLT_17',       'TRNTYPE-DD',  0),
    (N'ĐTLT_17',       'TRNTYPE-NHS', 1),
    (N'ĐTLT_17',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_18',       'TRNTYPE-BS',  0),
    (N'ĐTLT_19',       'TRNTYPE-BS',  0),
    (N'ĐTLT_20',       'TRNTYPE-BS',  0),
    (N'ĐTLT_21',       'TRNTYPE-BS',  0),
    (N'ĐTLT_22',       'TRNTYPE-BS',  0),
    (N'ĐTLT_23',       'TRNTYPE-BS',  0),
    (N'ĐTLT_23',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_24',       'TRNTYPE-BS',  0),
    (N'ĐTLT_24',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_25',       'TRNTYPE-DD',  0),
    (N'ĐTLT_25',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_26',       'TRNTYPE-DD',  0),
    (N'ĐTLT_27',       'TRNTYPE-BS',  0),
    (N'ĐTLT_28',       'TRNTYPE-DD',  0),
    (N'ĐTLT_28',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_29',       'TRNTYPE-BS',  0),
    (N'ĐTLT_30',       'TRNTYPE-BS',  0),
    (N'ĐTLT_31',       'TRNTYPE-BS',  0),
    (N'ĐTLT_31',       'TRNTYPE-DD',  1),
    (N'ĐTLT_31',       'TRNTYPE-NHS', 2),
    (N'ĐTLT_31',       'TRNTYPE-KTV', 3),
    (N'ĐTLT_31',       'TRNTYPE-YS',  4),
    (N'ĐTLT_31',       'TRNTYPE-DSI', 5),
    (N'ĐTLT_31',       'TRNTYPE-CN',  6),
    (N'ĐTLT_32',       'TRNTYPE-BS',  0),
    (N'ĐTLT_32',       'TRNTYPE-DD',  1),
    (N'ĐTLT_32',       'TRNTYPE-NHS', 2),
    (N'ĐTLT_32',       'TRNTYPE-KTV', 3),
    (N'ĐTLT_33',       'TRNTYPE-BS',  0),
    (N'ĐTLT_34',       'TRNTYPE-DD',  0),
    (N'ĐTLT_34',       'TRNTYPE-NHS', 1),
    (N'ĐTLT_34',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_35',       'TRNTYPE-DD',  0),
    (N'ĐTLT_35',       'TRNTYPE-NHS', 1),
    (N'ĐTLT_36',       'TRNTYPE-DD',  0),
    (N'ĐTLT_37',       'TRNTYPE-BS',  0),
    (N'ĐTLT_38',       'TRNTYPE-DD',  0),
    (N'ĐTLT_39',       'TRNTYPE-DD',  0),
    (N'ĐTLT_40',       'TRNTYPE-BS',  0),
    (N'ĐTLT_41',       'TRNTYPE-BS',  0),
    (N'ĐTLT_41',       'TRNTYPE-YS',  1),
    (N'ĐTLT_41',       'TRNTYPE-DD',  2),
    (N'ĐTLT_41',       'TRNTYPE-NHS', 3),
    (N'ĐTLT_41',       'TRNTYPE-KTV', 4),
    (N'ĐTLT_42',       'TRNTYPE-BS',  0),
    (N'ĐTLT_43',       'TRNTYPE-DD',  0),
    (N'ĐTLT_44',       'TRNTYPE-BS',  0),
    (N'ĐTLT_45',       'TRNTYPE-BS',  0),
    (N'ĐTLT_46',       'TRNTYPE-DD',  0),
    (N'ĐTLT_46',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_47',       'TRNTYPE-BS',  0),
    (N'ĐTLT_48',       'TRNTYPE-BS',  0),
    (N'ĐTLT_48',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_48',       'TRNTYPE-CN',  2),
    (N'ĐTLT_48',       'TRNTYPE-DD',  3),
    (N'ĐTLT_48',       'TRNTYPE-DSI', 4),
    (N'ĐTLT_49',       'TRNTYPE-BS',  0),
    (N'ĐTLT_49',       'TRNTYPE-DD',  1),
    (N'ĐTLT_49',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_49',       'TRNTYPE-YS',  3),
    (N'ĐTLT_50',       'TRNTYPE-BS',  0),
    (N'ĐTLT_50',       'TRNTYPE-DD',  1),
    (N'ĐTLT_50',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_50',       'TRNTYPE-YS',  3),
    (N'ĐTLT_51',       'TRNTYPE-BS',  0),
    (N'ĐTLT_52',       'TRNTYPE-BS',  0),
    (N'ĐTLT_53',       'TRNTYPE-BS',  0),
    (N'ĐTLT_54',       'TRNTYPE-BS',  0),
    (N'ĐTLT_55',       'TRNTYPE-BS',  0),
    (N'ĐTLT_56',       'TRNTYPE-DD',  0),
    (N'ĐTLT_56',       'TRNTYPE-KTV', 1),
    (N'ĐTLT_57',       'TRNTYPE-DD',  0),
    (N'ĐTLT_57',       'TRNTYPE-YS',  1),
    (N'ĐTLT_57',       'TRNTYPE-KTV', 2),
    (N'ĐTLT_58',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_59',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_60',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_61',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_62',       'TRNTYPE-DSI', 0),
    (N'ĐTLT_63',       'TRNTYPE-BS',  0),
    (N'ĐTLT_64',       'TRNTYPE-BS',  0),
    (N'ĐTLT_65',       'TRNTYPE-BS',  0),
    (N'ĐTLT_66',       'TRNTYPE-BS',  0),
    (N'ĐTLT_67',       'TRNTYPE-DD',  0)
) AS v (program_code, trainee_type_id, ord)
JOIN training_programs p ON p.code = v.program_code
JOIN trainee_types t ON t.id = v.trainee_type_id
WHERE NOT EXISTS (SELECT 1 FROM program_trainee_types x WHERE x.program_id = p.id);

-- 6) Cột cũ = đối tượng đầu tiên
UPDATE p SET
    trainee_type_id = f.trainee_type_id,
    updated_at = GETDATE(), updated_by = 'SYSTEM'
FROM training_programs p
CROSS APPLY (SELECT TOP 1 x.trainee_type_id FROM program_trainee_types x
             WHERE x.program_id = p.id ORDER BY x.display_order) f
WHERE p.trainee_type_id IS NULL OR p.trainee_type_id <> f.trainee_type_id;

-- 7) Vòng thực hành GPHN + khoa
DECLARE @rounds TABLE (
    program_code NVARCHAR(50), ord INT, code NVARCHAR(50) PRIMARY KEY, title NVARCHAR(255),
    duration_value DECIMAL(6, 2), duration_unit VARCHAR(10), allow_split BIT, id VARCHAR(20) NULL
);
INSERT INTO @rounds (program_code, ord, code, title, duration_value, duration_unit, allow_split) VALUES
    (N'GPHN_DTH_2',    0, N'GPHN_DTH_2_V1',     N'Hồi sức cấp cứu', 1, 'month', 0),
    (N'GPHN_BS_2',     0, N'GPHN_BS_2_V1',      N'Hồi sức cấp cứu', 3, 'month', 0),
    (N'GPHN_BS_1',     0, N'GPHN_BS_1_V1',      N'Nội khoa', 1, 'month', 0),
    (N'GPHN_BS_1',     1, N'GPHN_BS_1_V2',      N'Ngoại khoa', 2, 'month', 0),
    (N'GPHN_BS_1',     2, N'GPHN_BS_1_V3',      N'Hồi sức cấp cứu', 3, 'month', 0),
    (N'GPHN_BS_1',     3, N'GPHN_BS_1_V4',      N'Phụ Sản', 2, 'month', 0),
    (N'GPHN_BS_1',     4, N'GPHN_BS_1_V5',      N'Nhi - Sơ sinh', 2, 'month', 0),
    (N'GPHN_BS_1',     5, N'GPHN_BS_1_V6',      N'Chuyên khoa khác', 2, 'month', 1),
    (N'GPHN_DTH_1',    0, N'GPHN_DTH_1_V1',     N'Hồi sức cấp cứu', 1, 'month', 0),
    (N'GPHN_DTH_1',    1, N'GPHN_DTH_1_V2',     N'Nội khoa', 1.5, 'month', 0),
    (N'GPHN_DTH_1',    2, N'GPHN_DTH_1_V3',     N'Ngoại khoa', 1.5, 'month', 0),
    (N'GPHN_DTH_1',    3, N'GPHN_DTH_1_V4',     N'Nhi - Sơ sinh', 1, 'month', 0),
    (N'GPHN_DTH_1',    4, N'GPHN_DTH_1_V5',     N'Phụ Sản', 1, 'month', 0),
    (N'GPHN_KTVXN_1',  0, N'GPHN_KTVXN_1_V1',   N'Huyết Học', 2, 'month', 0),
    (N'GPHN_KTVXN_1',  1, N'GPHN_KTVXN_1_V2',   N'Hóa Sinh', 1.5, 'month', 0),
    (N'GPHN_KTVXN_1',  2, N'GPHN_KTVXN_1_V3',   N'Vi Sinh', 1.5, 'month', 0),
    (N'GPHN_KTVXN_1',  3, N'GPHN_KTVXN_1_V4',   N'Hồi sức cấp cứu', 1, 'month', 0),
    (N'GPHN_KTVXN_2',  0, N'GPHN_KTVXN_2_V1',   N'Cấp Cứu', 1, 'month', 0),
    (N'GPHN_KTVXQ_1',  0, N'GPHN_KTVXQ_1_V1',   N'Cấp Cứu', 1, 'month', 0),
    (N'GPHN_KTVXQ_1',  1, N'GPHN_KTVXQ_1_V2',   N'X-Quang', 5, 'month', 0),
    (N'GPHN_KTVXQ_2',  0, N'GPHN_KTVXQ_2_V1',   N'Cấp Cứu', 1, 'month', 0),
    (N'GPHN_DD_1',     0, N'GPHN_DD_1_V1',      N'Dinh Dưỡng', 6, 'month', 0);

DECLARE @round_depts TABLE (code NVARCHAR(50), dept NVARCHAR(50), ord INT, PRIMARY KEY (code, dept));
INSERT INTO @round_depts (code, dept, ord) VALUES
    (N'GPHN_DTH_2_V1',     N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_DTH_2_V1',     N'K49',    1), -- Khoa Chống Độc
    (N'GPHN_DTH_2_V1',     N'K482',   2), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_BS_2_V1',      N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_BS_2_V1',      N'K49',    1), -- Khoa Chống Độc
    (N'GPHN_BS_2_V1',      N'K481',   2), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_BS_2_V1',      N'K482',   3), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_BS_1_V1',      N'K08',    0), -- Khoa Nội Tiết - ĐTĐ
    (N'GPHN_BS_1_V1',      N'K042',   1), -- Khoa Nội Tim Mạch 2
    (N'GPHN_BS_1_V1',      N'K041',   2), -- Khoa Nội Tim Mạch 1
    (N'GPHN_BS_1_V1',      N'K05',    3), -- Khoa Nội Tiêu Hóa
    (N'GPHN_BS_1_V1',      N'K06',    4), -- Khoa Nội Cơ Xương Khớp
    (N'GPHN_BS_1_V1',      N'K50',    5), -- Khoa Nội Dị Ứng - Hô Hấp
    (N'GPHN_BS_1_V1',      N'K07',    6), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    (N'GPHN_BS_1_V1',      N'K142',   7), -- Trung Tâm Đột Quỵ
    (N'GPHN_BS_1_V1',      N'DUMD',   8), -- Khoa Dị ứng - Miễn dịch lâm sàng
    (N'GPHN_BS_1_V1',      N'K10',    9), -- Khoa Nội Huyết Học Lâm Sàng
    (N'GPHN_BS_1_V1',      N'K03',    10), -- Khoa Nội A – Lão khoa
    (N'GPHN_BS_1_V2',      N'K22',    0), -- Khoa Ngoại Tiêu Hóa
    (N'GPHN_BS_1_V2',      N'K23',    1), -- Khoa Ngoại Thận - Tiết Niệu
    (N'GPHN_BS_1_V2',      N'K192',   2), -- Khoa Ngoại Tổng Hợp 2
    (N'GPHN_BS_1_V2',      N'K21',    3), -- Khoa Phẫu Thuật TM Lồng Ngực
    (N'GPHN_BS_1_V2',      N'K24',    4), -- Khoa Chấn Thương - Chỉnh Hình
    (N'GPHN_BS_1_V2',      N'K20',    5), -- Khoa Phẫu Thuật Thần Kinh Cột Sống
    (N'GPHN_BS_1_V2',      N'K19',    6), -- Khoa Ngoại Tổng Hợp
    (N'GPHN_BS_1_V2',      N'PTTM',   7), -- Phẫu Thuật Tạo Hình Thẩm Mỹ
    (N'GPHN_BS_1_V2',      N'K25',    8), -- Khoa Bỏng
    (N'GPHN_BS_1_V3',      N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_BS_1_V3',      N'K481',   1), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_BS_1_V3',      N'K49',    2), -- Khoa Chống Độc
    (N'GPHN_BS_1_V3',      N'K482',   3), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_BS_1_V4',      N'K27',    0), -- Khoa Phụ Sản
    (N'GPHN_BS_1_V5',      N'K18',    0), -- Khoa Nhi - Sơ sinh
    (N'GPHN_BS_1_V6',      N'K30',    0), -- Khoa Mắt
    (N'GPHN_BS_1_V6',      N'K28',    1), -- Khoa Tai Mũi Họng
    (N'GPHN_BS_1_V6',      N'K29',    2), -- Khoa Răng Hàm Mặt
    (N'GPHN_BS_1_V6',      N'K13',    3), -- Khoa Da Liễu
    (N'GPHN_BS_1_V6',      N'K16',    4), -- Khoa Y Học Cổ Truyền
    (N'GPHN_BS_1_V6',      N'K31',    5), -- Khoa Phục Hồi Chức Năng
    (N'GPHN_DTH_1_V1',     N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_DTH_1_V1',     N'K49',    1), -- Khoa Chống Độc
    (N'GPHN_DTH_1_V1',     N'K481',   2), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_DTH_1_V1',     N'K482',   3), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    (N'GPHN_DTH_1_V2',     N'K10',    0), -- Khoa Nội Huyết Học Lâm Sàng
    (N'GPHN_DTH_1_V2',     N'K05',    1), -- Khoa Nội Tiêu Hóa
    (N'GPHN_DTH_1_V2',     N'DUMD',   2), -- Khoa Dị ứng - Miễn dịch lâm sàng
    (N'GPHN_DTH_1_V2',     N'K06',    3), -- Khoa Nội Cơ Xương Khớp
    (N'GPHN_DTH_1_V2',     N'K08',    4), -- Khoa Nội Tiết - ĐTĐ
    (N'GPHN_DTH_1_V2',     N'K142',   5), -- Trung Tâm Đột Quỵ
    (N'GPHN_DTH_1_V2',     N'K041',   6), -- Khoa Nội Tim Mạch 1
    (N'GPHN_DTH_1_V2',     N'K03',    7), -- Khoa Nội A – Lão khoa
    (N'GPHN_DTH_1_V2',     N'K07',    8), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    (N'GPHN_DTH_1_V2',     N'K141',   9), -- Khoa Thần Kinh
    (N'GPHN_DTH_1_V2',     N'K50',    10), -- Khoa Nội Dị Ứng - Hô Hấp
    (N'GPHN_DTH_1_V2',     N'K11',    11), -- Khoa Nhiễm Khuẩn Tổng Hợp
    (N'GPHN_DTH_1_V3',     N'K192',   0), -- Khoa Ngoại Tổng Hợp 2
    (N'GPHN_DTH_1_V3',     N'K23',    1), -- Khoa Ngoại Thận - Tiết Niệu
    (N'GPHN_DTH_1_V3',     N'K21',    2), -- Khoa Phẫu Thuật TM Lồng Ngực
    (N'GPHN_DTH_1_V3',     N'K25',    3), -- Khoa Bỏng
    (N'GPHN_DTH_1_V3',     N'K20',    4), -- Khoa Phẫu Thuật Thần Kinh Cột Sống
    (N'GPHN_DTH_1_V3',     N'K19',    5), -- Khoa Ngoại Tổng Hợp
    (N'GPHN_DTH_1_V3',     N'PTTM',   6), -- Phẫu Thuật Tạo Hình Thẩm Mỹ
    (N'GPHN_DTH_1_V3',     N'K22',    7), -- Khoa Ngoại Tiêu Hóa
    (N'GPHN_DTH_1_V3',     N'K24',    8), -- Khoa Chấn Thương - Chỉnh Hình
    (N'GPHN_DTH_1_V4',     N'K18',    0), -- Khoa Nhi - Sơ sinh
    (N'GPHN_DTH_1_V5',     N'K27',    0), -- Khoa Phụ Sản
    (N'GPHN_KTVXN_1_V1',   N'K36',    0), -- Khoa Huyết Học
    (N'GPHN_KTVXN_1_V2',   N'K37',    0), -- Khoa Hóa Sinh
    (N'GPHN_KTVXN_1_V3',   N'K38',    0), -- Khoa Vi Sinh
    (N'GPHN_KTVXN_1_V4',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_KTVXN_1_V4',   N'K481',   1), -- Khoa Hồi Sức Tích Cực
    (N'GPHN_KTVXN_2_V1',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_KTVXQ_1_V1',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_KTVXQ_1_V2',   N'K39',    0), -- Khoa X-Quang
    (N'GPHN_KTVXQ_2_V1',   N'K02',    0), -- Khoa Cấp Cứu
    (N'GPHN_DD_1_V1',      N'DIDU',   0); -- Khoa Dinh Dưỡng

-- Bỏ cả chương trình nếu đã có vòng (đã nhập / sửa tay) hoặc mã vòng đã được dùng
DELETE r FROM @rounds r
WHERE NOT EXISTS (SELECT 1 FROM training_programs p WHERE p.code = r.program_code)
   OR r.program_code IN (
        SELECT p.code FROM training_programs p
        JOIN lesson_programs lp ON lp.program_id = p.id
        JOIN program_lessons pl ON pl.id = lp.lesson_id AND pl.lesson_kind = 'rotation'
        UNION
        SELECT r2.program_code FROM @rounds r2 JOIN program_lessons pl ON pl.code = r2.code);

UPDATE @rounds SET id = 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18);

INSERT INTO program_lessons (id, code, title, is_active, theory_hours, practice_hours, credits,
                             lesson_kind, duration_value, duration_unit, allow_split, created_by)
SELECT id, code, title, 1, 0, 0, 0, 'rotation', duration_value, duration_unit, allow_split, 'SYSTEM'
FROM @rounds;

INSERT INTO lesson_programs (id, lesson_id, program_id, display_order, created_by)
SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), r.id, p.id, r.ord, 'SYSTEM'
FROM @rounds r JOIN training_programs p ON p.code = r.program_code;

INSERT INTO lesson_departments (lesson_id, department_id, display_order)
SELECT r.id, d.id, rd.ord
FROM @round_depts rd
JOIN @rounds r ON r.code = rd.code
JOIN departments d ON d.code = rd.dept;

COMMIT;
GO

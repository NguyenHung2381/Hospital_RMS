/* ============================================================================
 * 2026-12-13_toi_uu_index_giai_doan_1
 * ----------------------------------------------------------------------------
 *   Tối ưu index cho dữ liệu lớn, giai đoạn 1 (database/DB_SCALING_PLAN.md mục 4, 6).
 *
 *   1. Bỏ 7 index thừa: cột khoá đã là phần đầu của một index UNIQUE không lọc
 *      trên cùng bảng, nên mọi truy vấn dùng được index UNIQUE đó. Index thừa
 *      chỉ làm chậm INSERT/UPDATE/DELETE. Chỉ bỏ khi kiểm tra thấy index UNIQUE
 *      phủ thật sự tồn tại (DB production có thể khác DB dev). Không code nào
 *      gọi tên các index này (đã tìm trong src/, scripts/, database/objects/),
 *      nên bản ứng dụng cũ vẫn chạy bình thường sau migration.
 *   2. Thêm index cho 10 khoá ngoại ưu tiên cao chưa có index nào bắt đầu bằng
 *      cột đó: bảng con lớn (câu trả lời bài thi), FK CASCADE / SET NULL, và 5
 *      bảng trỏ tới training_files (xoá 1 file phải kiểm tra cả 5 bảng).
 *   3. IX_notif_user_read: tạo lại, bỏ cột message (NVARCHAR(MAX)) khỏi INCLUDE.
 *      Index này đang chép nguyên nội dung mọi thông báo một lần nữa. Danh sách
 *      thông báo chỉ lấy 1 trang (≤ 20 dòng) nên đọc message từ bảng là đủ nhanh.
 *      Giữ nguyên cột khoá, cột INCLUDE khác và điều kiện lọc của index hiện có.
 *
 * Idempotent — chạy lại nhiều lần an toàn (kiểm tra sys.indexes trước mỗi bước).
 * ==========================================================================*/

------------------------------------------------------------------------------
-- 1. Bỏ index thừa
------------------------------------------------------------------------------
DECLARE @redundant TABLE (tbl SYSNAME, idx SYSNAME);
INSERT INTO @redundant (tbl, idx) VALUES
    (N'exam_answers',         N'IX_exam_answers_attempt'),
    (N'exam_attempts',        N'IX_exam_attempts_paper'),
    (N'exam_paper_questions', N'IX_exam_paper_questions_paper'),
    (N'course_programs',      N'IX_course_programs_course'),
    (N'lesson_programs',      N'IX_lesson_programs_lesson'),
    (N'lecturer_assignments', N'IX_lecass_course'),
    (N'deadline_actions',     N'idx_da_deadline_action');

-- Danh sách cột khoá của mọi index trên các bảng trên, dạng "a,b,c,"
DECLARE @keys TABLE (object_id INT, index_id INT, name SYSNAME, is_unique BIT, has_filter BIT, keys NVARCHAR(2000));
INSERT INTO @keys (object_id, index_id, name, is_unique, has_filter, keys)
SELECT i.object_id, i.index_id, i.name, i.is_unique, i.has_filter,
       (SELECT c.name + N','
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0
        ORDER BY ic.key_ordinal
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(2000)')
FROM sys.indexes i
WHERE i.object_id IN (SELECT OBJECT_ID(N'dbo.' + tbl, N'U') FROM @redundant) AND i.type > 0;

DECLARE @tbl SYSNAME, @idx SYSNAME, @stmt NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT r.tbl, r.idx
    FROM @redundant r
    JOIN @keys k ON k.object_id = OBJECT_ID(N'dbo.' + r.tbl, N'U') AND k.name = r.idx
    WHERE k.is_unique = 0
      AND EXISTS (SELECT 1 FROM @keys u
                  WHERE u.object_id = k.object_id AND u.index_id <> k.index_id
                    AND u.is_unique = 1 AND u.has_filter = 0
                    AND LEFT(u.keys, LEN(k.keys)) = k.keys);
OPEN cur;
FETCH NEXT FROM cur INTO @tbl, @idx;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @stmt = N'DROP INDEX ' + QUOTENAME(@idx) + N' ON [dbo].' + QUOTENAME(@tbl) + N';';
    EXEC sys.sp_executesql @stmt;
    PRINT N'  - ' + @tbl + N'.' + @idx;
    FETCH NEXT FROM cur INTO @tbl, @idx;
END
CLOSE cur;
DEALLOCATE cur;
GO

------------------------------------------------------------------------------
-- 2. Index cho khoá ngoại ưu tiên cao
--    Bỏ qua khi: bảng / cột không có, cột không đánh index được (MAX hoặc
--    > 1700 byte), hoặc đã có index (kể cả PK / UNIQUE) có cột đầu là cột đó.
------------------------------------------------------------------------------
DECLARE @wanted TABLE (tbl SYSNAME, lead_col SYSNAME, idx SYSNAME);
INSERT INTO @wanted (tbl, lead_col, idx) VALUES
    (N'exam_answers',         N'question_id',      N'IX_exam_answers_question'),
    (N'exam_paper_questions', N'question_id',      N'IX_exam_paper_questions_question'),
    (N'enrollment_rotations', N'lesson_id',        N'IX_enrollment_rotations_lesson'),
    (N'users',                N'shift_pattern_id', N'IX_users_shift_pattern'),
    (N'program_subjects',     N'subject_id',       N'IX_program_subjects_subject'),
    (N'certificates',         N'file_id',          N'IX_certificates_file'),
    (N'cme_records',          N'evidence_file_id', N'IX_cme_records_evidence_file'),
    (N'course_documents',     N'file_id',          N'IX_course_documents_file'),
    (N'lesson_documents',     N'file_id',          N'IX_lesson_documents_file'),
    (N'trainee_documents',    N'file_id',          N'IX_trainee_documents_file');
DECLARE @tbl SYSNAME, @lead SYSNAME, @idx SYSNAME, @stmt NVARCHAR(MAX), @obj INT;
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT tbl, lead_col, idx FROM @wanted;
OPEN cur;
FETCH NEXT FROM cur INTO @tbl, @lead, @idx;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @obj = OBJECT_ID(N'dbo.' + @tbl, N'U');
    IF @obj IS NOT NULL
       AND EXISTS (SELECT 1 FROM sys.columns c
                   WHERE c.object_id = @obj AND c.name = @lead AND c.max_length BETWEEN 1 AND 1700)
       AND NOT EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = @obj AND i.name = @idx)
       AND NOT EXISTS (SELECT 1 FROM sys.index_columns ic
                       JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                       WHERE ic.object_id = @obj AND ic.key_ordinal = 1 AND c.name = @lead)
    BEGIN
        SET @stmt = N'CREATE NONCLUSTERED INDEX ' + QUOTENAME(@idx) + N' ON [dbo].' + QUOTENAME(@tbl)
                  + N' (' + QUOTENAME(@lead) + N');';
        EXEC sys.sp_executesql @stmt;
        PRINT N'  + ' + @tbl + N'.' + @idx;
    END
    FETCH NEXT FROM cur INTO @tbl, @lead, @idx;
END
CLOSE cur;
DEALLOCATE cur;
GO

------------------------------------------------------------------------------
-- 3. IX_notif_user_read: bỏ message khỏi INCLUDE
------------------------------------------------------------------------------
DECLARE @obj INT = OBJECT_ID(N'dbo.notifications', N'U');
DECLARE @index_id INT = (SELECT index_id FROM sys.indexes WHERE object_id = @obj AND name = N'IX_notif_user_read');

IF @index_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.index_columns ic
               JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
               WHERE ic.object_id = @obj AND ic.index_id = @index_id
                 AND ic.is_included_column = 1 AND c.name = N'message')
BEGIN
    DECLARE @keys NVARCHAR(MAX), @incl NVARCHAR(MAX), @filter NVARCHAR(MAX), @stmt NVARCHAR(MAX);

    SET @keys = STUFF((
        SELECT N', ' + QUOTENAME(c.name) + CASE WHEN ic.is_descending_key = 1 THEN N' DESC' ELSE N'' END
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = @obj AND ic.index_id = @index_id AND ic.key_ordinal > 0
        ORDER BY ic.key_ordinal
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, N'');

    SET @incl = STUFF((
        SELECT N', ' + QUOTENAME(c.name)
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = @obj AND ic.index_id = @index_id
          AND ic.is_included_column = 1 AND c.name <> N'message'
        ORDER BY ic.index_column_id
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, N'');

    SET @filter = (SELECT filter_definition FROM sys.indexes WHERE object_id = @obj AND index_id = @index_id);

    SET @stmt = N'CREATE NONCLUSTERED INDEX [IX_notif_user_read] ON [dbo].[notifications] (' + @keys + N')'
              + COALESCE(N' INCLUDE (' + @incl + N')', N'')
              + COALESCE(N' WHERE ' + @filter, N'')
              + N' WITH (DROP_EXISTING = ON);';
    EXEC sys.sp_executesql @stmt;
    PRINT N'  ~ notifications.IX_notif_user_read (bỏ message khỏi INCLUDE)';
END
GO

PRINT N'✅ Migration 2026-12-13_toi_uu_index_giai_doan_1 hoàn tất.';
GO

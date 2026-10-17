/* Đổi mã người dùng cũ 'NV' + 8 ký tự hex (vd NVC5D7D308 — form "Thêm người dùng" cũ sinh
 * bằng NEWID()) sang quy ước của sp_gen_user_id: 'NV' + mã khoa + NNNN (chưa có khoa → 'NV' + NNNN).
 *
 * SCRIPT CHẠY TAY (tên bắt đầu bằng "_" nên run-migrations.js không tự chạy). Mặc định
 * @dry_run = 1: chỉ in bảng đổi mã + số dòng sẽ cập nhật ở từng cột, không sửa gì.
 * Xem kết quả rồi đổi @dry_run = 0 và chạy lại.
 *
 * Cách làm (1 transaction, lỗi ở bất kỳ bước nào → rollback toàn bộ):
 *   1. #map: mã cũ → mã mới. Số thứ tự nối tiếp mã lớn nhất đang có của từng tiền tố
 *      (giống sp_gen_user_id, bỏ đuôi 0000 của tài khoản khoa), xếp theo created_at.
 *   2. Tạm tắt mọi khoá ngoại trỏ tới users.id, đổi users.id.
 *   3. Đổi mọi cột chuỗi trong DB có giá trị ĐÚNG BẰNG một mã cũ — gồm cột khoá ngoại
 *      (cme_records.user_id, …) và cột không có khoá ngoại (persons.origin_id,
 *      security_events.actor_id/target_id, created_by…). Mã cũ có dạng riêng nên không
 *      trùng nhầm dữ liệu khác. Mã nằm lẫn trong chuỗi dài (JSON nhật ký) giữ nguyên.
 *   4. Bật lại khoá ngoại WITH CHECK (kiểm tra lại toàn bộ dữ liệu, giữ trạng thái trusted).
 *
 * Sau khi chạy thật: khởi động lại backend (cache quyền / phiên theo mã người dùng);
 * người đang đăng nhập bằng tài khoản bị đổi mã cần đăng nhập lại. Nên backup DB trước.
 * Chạy lại an toàn: lần sau không còn mã cũ thì không làm gì. */
USE [RMS_HOSPITAL];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @dry_run BIT = 1;            -- 0 = chạy thật
DECLARE @actor_id VARCHAR(20) = NULL; -- mã người thực hiện, ghi vào nhật ký (trigger audit)

IF OBJECT_ID('tempdb..#map') IS NOT NULL DROP TABLE #map;
IF OBJECT_ID('tempdb..#cols') IS NOT NULL DROP TABLE #cols;
IF OBJECT_ID('tempdb..#fks') IS NOT NULL DROP TABLE #fks;

CREATE TABLE #map (
    old_id VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL PRIMARY KEY,
    new_id VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL UNIQUE,
    prefix VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
    no INT NOT NULL
);

-- 1. Bảng đổi mã ------------------------------------------------------------------
;WITH legacy AS (
    SELECT u.id, u.created_at, 'NV' + ISNULL(d.code, '') AS prefix
    FROM dbo.users u
    LEFT JOIN dbo.departments d ON d.id = u.department_id
    WHERE LEN(u.id) = 10
      AND u.id LIKE 'NV' + REPLICATE('[0-9A-F]', 8)
      -- trùng dạng mã chuẩn của một khoa có mã 4 ký tự (vd NVABCD0012) → không phải mã cũ
      AND NOT EXISTS (
          SELECT 1 FROM dbo.departments d2
          WHERE d2.code IS NOT NULL AND LEN(d2.code) = 4
            AND u.id LIKE 'NV' + d2.code + '[0-9][0-9][0-9][0-9]'
      )
),
base AS (
    SELECT p.prefix, ISNULL(MAX(CAST(RIGHT(u.id, 4) AS INT)), 0) AS max_no
    FROM (SELECT DISTINCT prefix FROM legacy) p
    LEFT JOIN dbo.users u
        ON u.id LIKE p.prefix + '[0-9][0-9][0-9][0-9]'
       AND LEN(u.id) = LEN(p.prefix) + 4
       AND RIGHT(u.id, 4) <> '0000'
       AND u.id NOT IN (SELECT id FROM legacy)
    GROUP BY p.prefix
),
numbered AS (
    SELECT l.id, l.prefix,
           b.max_no + ROW_NUMBER() OVER (PARTITION BY l.prefix ORDER BY l.created_at, l.id) AS no
    FROM legacy l JOIN base b ON b.prefix = l.prefix
)
INSERT INTO #map (old_id, new_id, prefix, no)
SELECT id, prefix + RIGHT('0000' + CAST(no AS VARCHAR(10)), 4), prefix, no
FROM numbered;

IF EXISTS (SELECT 1 FROM #map WHERE no > 9999)
    THROW 50002, N'Khoa vượt quá 9999 nhân viên — dừng.', 1;
IF EXISTS (SELECT 1 FROM #map m JOIN dbo.users u ON u.id = m.new_id)
    THROW 50001, N'Mã mới trùng tài khoản đang có — dừng.', 1;

DECLARE @total INT = (SELECT COUNT(*) FROM #map);
PRINT CONCAT(N'Số tài khoản mã cũ: ', @total);
IF @total = 0
BEGIN
    PRINT N'Không còn mã cũ — không làm gì.';
    RETURN;
END

-- 2. Các cột có thể chứa mã người dùng: mọi cột chuỗi (không phải MAX/computed) đủ dài ---
CREATE TABLE #cols (
    sch SYSNAME, tbl SYSNAME, col SYSNAME, char_len INT, is_fk BIT,
    match_rows INT NULL, too_long INT NULL, updated_rows INT NULL
);
INSERT INTO #cols (sch, tbl, col, char_len, is_fk)
SELECT s.name, t.name, c.name,
       CASE WHEN ty.name IN ('nchar', 'nvarchar') THEN c.max_length / 2 ELSE c.max_length END,
       CASE WHEN EXISTS (
           SELECT 1 FROM sys.foreign_key_columns fc
           WHERE fc.parent_object_id = c.object_id AND fc.parent_column_id = c.column_id
             AND fc.referenced_object_id = OBJECT_ID('dbo.users')
       ) THEN 1 ELSE 0 END
FROM sys.columns c
JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.is_ms_shipped = 0
  AND ty.name IN ('char', 'varchar', 'nchar', 'nvarchar')
  AND c.max_length <> -1
  AND (CASE WHEN ty.name IN ('nchar', 'nvarchar') THEN c.max_length / 2 ELSE c.max_length END) >= 10
  AND c.is_computed = 0
  AND NOT (t.object_id = OBJECT_ID('dbo.users') AND c.name = 'id');

DECLARE @sch SYSNAME, @tbl SYSNAME, @col SYSNAME, @len INT, @sql NVARCHAR(MAX), @n INT, @long INT;
DECLARE col_cur CURSOR LOCAL FAST_FORWARD FOR SELECT sch, tbl, col, char_len FROM #cols;
OPEN col_cur;
FETCH NEXT FROM col_cur INTO @sch, @tbl, @col, @len;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'SELECT @n = COUNT(*), @long = SUM(CASE WHEN LEN(m.new_id) > @len THEN 1 ELSE 0 END)
                 FROM ' + QUOTENAME(@sch) + N'.' + QUOTENAME(@tbl) + N' t
                 JOIN #map m ON m.old_id = t.' + QUOTENAME(@col) + N' COLLATE DATABASE_DEFAULT
                 WHERE t.' + QUOTENAME(@col) + N' LIKE ''NV%''';
    EXEC sp_executesql @sql, N'@n INT OUTPUT, @long INT OUTPUT, @len INT',
        @n = @n OUTPUT, @long = @long OUTPUT, @len = @len;
    UPDATE #cols SET match_rows = @n, too_long = ISNULL(@long, 0) WHERE sch = @sch AND tbl = @tbl AND col = @col;
    FETCH NEXT FROM col_cur INTO @sch, @tbl, @col, @len;
END
CLOSE col_cur;
DEALLOCATE col_cur;

-- Kết quả xem trước
SELECT prefix AS [Tiền tố], COUNT(*) AS [Số tài khoản], MIN(new_id) AS [Từ], MAX(new_id) AS [Đến]
FROM #map GROUP BY prefix ORDER BY prefix;
SELECT m.old_id AS [Mã cũ], m.new_id AS [Mã mới], u.username, u.full_name, d.name AS department
FROM #map m JOIN dbo.users u ON u.id = m.old_id LEFT JOIN dbo.departments d ON d.id = u.department_id
ORDER BY m.new_id;
SELECT sch + '.' + tbl AS [Bảng], col AS [Cột], is_fk AS [Khoá ngoại], match_rows AS [Số dòng đổi], too_long AS [Quá dài]
FROM #cols WHERE match_rows > 0 ORDER BY sch, tbl, col;

IF EXISTS (SELECT 1 FROM #cols WHERE too_long > 0)
    THROW 50003, N'Có cột quá ngắn để chứa mã mới (xem cột "Quá dài") — nới cột rồi chạy lại.', 1;

IF @dry_run = 1
BEGIN
    PRINT N'DRY RUN — chưa sửa gì. Đổi @dry_run = 0 để chạy thật.';
    RETURN;
END

-- 3. Chạy thật -----------------------------------------------------------------------
BEGIN TRANSACTION;

IF @actor_id IS NOT NULL EXEC dbo.sp_set_actor @actor_id;

-- Khoá ngoại đang bật trỏ tới users → tạm tắt
CREATE TABLE #fks (sch SYSNAME, tbl SYSNAME, fk SYSNAME);
INSERT INTO #fks
SELECT OBJECT_SCHEMA_NAME(fk.parent_object_id), OBJECT_NAME(fk.parent_object_id), fk.name
FROM sys.foreign_keys fk
WHERE fk.referenced_object_id = OBJECT_ID('dbo.users') AND fk.is_disabled = 0;

DECLARE @fk SYSNAME;
DECLARE fk_cur CURSOR LOCAL FAST_FORWARD FOR SELECT sch, tbl, fk FROM #fks;
OPEN fk_cur;
FETCH NEXT FROM fk_cur INTO @sch, @tbl, @fk;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'ALTER TABLE ' + QUOTENAME(@sch) + N'.' + QUOTENAME(@tbl) + N' NOCHECK CONSTRAINT ' + QUOTENAME(@fk);
    EXEC sp_executesql @sql;
    FETCH NEXT FROM fk_cur INTO @sch, @tbl, @fk;
END
CLOSE fk_cur;

UPDATE u SET u.id = m.new_id
FROM dbo.users u JOIN #map m ON m.old_id = u.id;
PRINT CONCAT(N'users: ', @@ROWCOUNT, N' dòng');

DECLARE upd_cur CURSOR LOCAL FAST_FORWARD FOR SELECT sch, tbl, col FROM #cols WHERE match_rows > 0;
OPEN upd_cur;
FETCH NEXT FROM upd_cur INTO @sch, @tbl, @col;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'UPDATE t SET ' + QUOTENAME(@col) + N' = m.new_id
                 FROM ' + QUOTENAME(@sch) + N'.' + QUOTENAME(@tbl) + N' t
                 JOIN #map m ON m.old_id = t.' + QUOTENAME(@col) + N' COLLATE DATABASE_DEFAULT
                 WHERE t.' + QUOTENAME(@col) + N' LIKE ''NV%'';
                 SET @n = @@ROWCOUNT;';
    EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
    UPDATE #cols SET updated_rows = @n WHERE sch = @sch AND tbl = @tbl AND col = @col;
    PRINT CONCAT(@sch, N'.', @tbl, N'.', @col, N': ', @n, N' dòng');
    FETCH NEXT FROM upd_cur INTO @sch, @tbl, @col;
END
CLOSE upd_cur;
DEALLOCATE upd_cur;

-- 4. Bật lại khoá ngoại, kiểm tra lại toàn bộ dữ liệu (lỗi → rollback do XACT_ABORT)
OPEN fk_cur;
FETCH NEXT FROM fk_cur INTO @sch, @tbl, @fk;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'ALTER TABLE ' + QUOTENAME(@sch) + N'.' + QUOTENAME(@tbl) + N' WITH CHECK CHECK CONSTRAINT ' + QUOTENAME(@fk);
    EXEC sp_executesql @sql;
    FETCH NEXT FROM fk_cur INTO @sch, @tbl, @fk;
END
CLOSE fk_cur;
DEALLOCATE fk_cur;

IF EXISTS (SELECT 1 FROM dbo.users u JOIN #map m ON m.old_id = u.id)
    THROW 50004, N'Vẫn còn mã cũ trong users — rollback.', 1;

COMMIT TRANSACTION;

SELECT sch + '.' + tbl AS [Bảng], col AS [Cột], match_rows AS [Dự kiến], updated_rows AS [Đã đổi]
FROM #cols WHERE match_rows > 0 ORDER BY sch, tbl, col;
PRINT CONCAT(N'Đã đổi mã ', @total, N' tài khoản.');
GO

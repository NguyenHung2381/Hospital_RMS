/* Đổi username tài khoản nhân viên sang dạng chữ cái đầu họ tên + MNV ("NVA_0123";
 * trùng → thêm _1, _2...). Bản SQL của scripts/rename-staff-usernames.js — cùng quy tắc
 * buildMemberUsername (bỏ học vị trước dấu chấm cuối / tiền tố GS, PGS, TS, ThS, BS…,
 * bỏ dấu, MNV đệm 4 số). Dùng khi máy chạy không có Node/node_modules.
 *
 * SCRIPT CHẠY TAY (tên bắt đầu bằng "_" nên run-migrations.js không tự chạy). Mặc định
 * @dry_run = 1: chỉ in bảng username cũ → mới, không sửa gì. Xem kết quả rồi đổi
 * @dry_run = 0 và chạy lại.
 *
 * Bỏ qua: vai trò admin / dept_head (tài khoản khoa dùng chung) / trainee, tài khoản
 * không có họ tên hoặc không có MNV. Username đã đúng dạng (kể cả hậu tố _n) giữ nguyên
 * → chạy lại an toàn. Mật khẩu không đổi; nhân viên phải đăng nhập bằng tên mới.
 *   sqlcmd -C -I -b -f 65001 -S <server>,<port> -U <user> -i _rename_staff_usernames.sql */
USE [RMS_HOSPITAL];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @dry_run BIT = 1;            -- 0 = chạy thật
DECLARE @actor_id VARCHAR(20) = NULL; -- mã người thực hiện, ghi vào nhật ký (trigger audit)

IF OBJECT_ID('tempdb..#letters') IS NOT NULL DROP TABLE #letters;
IF OBJECT_ID('tempdb..#taken') IS NOT NULL DROP TABLE #taken;
IF OBJECT_ID('tempdb..#map') IS NOT NULL DROP TABLE #map;

-- Ký tự đầu mỗi từ → A-Z/0-9 bằng so sánh không dấu (Ữ = U); Đ xử lý riêng.
CREATE TABLE #letters (c NCHAR(1) COLLATE Latin1_General_100_CI_AI);
DECLARE @i INT = 0;
WHILE @i < 26 BEGIN INSERT #letters VALUES (NCHAR(65 + @i)); SET @i += 1; END;
SET @i = 0;
WHILE @i < 10 BEGIN INSERT #letters VALUES (NCHAR(48 + @i)); SET @i += 1; END;

CREATE TABLE #taken (username VARCHAR(100) COLLATE Latin1_General_CI_AS PRIMARY KEY);
INSERT #taken SELECT DISTINCT username FROM users WHERE username IS NOT NULL;

CREATE TABLE #map (
	seq          INT IDENTITY(1, 1) PRIMARY KEY,
	id           VARCHAR(20),
	old_username VARCHAR(100),
	full_name    NVARCHAR(255),
	staff_number INT,
	base         VARCHAR(100),
	new_username VARCHAR(100)
);
INSERT #map (id, old_username, full_name, staff_number)
SELECT u.id, u.username, u.full_name, u.staff_number
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE ISNULL(r.code, '') NOT IN ('admin', 'dept_head', 'trainee')
  AND u.full_name IS NOT NULL AND LTRIM(u.full_name) <> ''
  AND u.staff_number IS NOT NULL
ORDER BY u.staff_number, u.id;

DECLARE @seq INT = 1, @max INT = (SELECT MAX(seq) FROM #map);
DECLARE @name NVARCHAR(255), @word NVARCHAR(50), @code VARCHAR(20), @base VARCHAR(100),
        @initials VARCHAR(100), @ch NCHAR(1), @prev_sep BIT, @pos INT, @next VARCHAR(100), @n INT;

WHILE @seq <= ISNULL(@max, 0)
BEGIN
	SELECT @name = LTRIM(RTRIM(full_name)), @code = CAST(staff_number AS VARCHAR(20)) FROM #map WHERE seq = @seq;

	-- Học vị: lấy phần sau dấu chấm cuối ("PGS.TS. Nguyễn Văn A" → "Nguyễn Văn A")
	IF CHARINDEX(N'.', @name) > 0 SET @name = RIGHT(@name, CHARINDEX(N'.', REVERSE(@name)) - 1);
	SET @name = LTRIM(RTRIM(@name));
	-- ...rồi bỏ 1 tiền tố học vị đứng đầu ("BS Nguyễn Văn A")
	SET @pos = PATINDEX(N'%[ ' + NCHAR(9) + NCHAR(160) + N']%', @name);
	IF @pos > 1
	BEGIN
		SET @word = LEFT(@name, @pos - 1);
		IF @word COLLATE Latin1_General_CI_AS IN
			(N'GS', N'PGS', N'TS', N'ThS', N'BSCKII', N'BSCKI', N'BSCK2', N'BSCK1', N'BSNT', N'BS', N'KS', N'CN', N'CĐ', N'DS', N'ĐD')
			SET @name = LTRIM(RTRIM(SUBSTRING(@name, @pos + 1, 255)));
	END;

	-- Chữ cái đầu của từng từ
	SET @initials = '';
	SET @prev_sep = 1;
	SET @pos = 1;
	WHILE @pos <= LEN(@name)
	BEGIN
		SET @ch = SUBSTRING(@name, @pos, 1);
		IF @ch IN (N' ', NCHAR(9), NCHAR(10), NCHAR(13), NCHAR(160))
			SET @prev_sep = 1;
		ELSE
		BEGIN
			IF @prev_sep = 1
				SET @initials += CASE
					WHEN @ch COLLATE Latin1_General_BIN IN (N'Đ', N'đ') THEN 'D'
					ELSE ISNULL((SELECT TOP 1 CAST(c AS VARCHAR(1)) FROM #letters WHERE c = @ch), '')
				END;
			SET @prev_sep = 0;
		END;
		SET @pos += 1;
	END;
	IF @initials = '' SET @initials = 'NV';

	SET @base = @initials + '_' + CASE WHEN LEN(@code) < 4 THEN RIGHT('0000' + @code, 4) ELSE @code END;
	UPDATE #map SET base = @base WHERE seq = @seq;

	-- Đã đúng dạng (kể cả hậu tố _n do trùng) → giữ nguyên
	IF NOT EXISTS (
		SELECT 1 FROM #map
		WHERE seq = @seq
		  AND (old_username COLLATE Latin1_General_CI_AS = @base
		    OR old_username COLLATE Latin1_General_CI_AS LIKE REPLACE(@base, '_', '[_]') + '[_][0-9]'
		    OR old_username COLLATE Latin1_General_CI_AS LIKE REPLACE(@base, '_', '[_]') + '[_][0-9][0-9]')
	)
	BEGIN
		SET @next = @base;
		SET @n = 1;
		WHILE EXISTS (SELECT 1 FROM #taken WHERE username = @next)
		BEGIN
			SET @next = @base + '_' + CAST(@n AS VARCHAR(10));
			SET @n += 1;
		END;
		INSERT #taken VALUES (@next);
		UPDATE #map SET new_username = @next WHERE seq = @seq;
	END;

	SET @seq += 1;
END;

DELETE #map WHERE new_username IS NULL;

SELECT old_username AS [username cũ], new_username AS [username mới], full_name AS [họ tên], staff_number AS [MNV]
FROM #map ORDER BY seq;

IF @dry_run = 1
BEGIN
	SET @n = (SELECT COUNT(*) FROM #map);
	PRINT CONCAT(N'[xem trước] Sẽ đổi ', @n, N' username. Đặt @dry_run = 0 để thực hiện.');
	RETURN;
END;

BEGIN TRANSACTION;
	IF @actor_id IS NOT NULL EXEC sp_set_actor @actor_id;
	UPDATE u SET username = m.new_username, updated_at = GETDATE()
	FROM users u INNER JOIN #map m ON m.id = u.id;
	PRINT CONCAT(N'Đã đổi ', @@ROWCOUNT, N' username.');
COMMIT TRANSACTION;
GO

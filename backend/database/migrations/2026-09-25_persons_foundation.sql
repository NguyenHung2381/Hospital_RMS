/* ============================================================================
 * GĐ 1 / Bước 1 — Danh tính hợp nhất (persons)                  [v3 §2.1, FR-C01..C03]
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   "Người" đang bị lưu ở 6 bảng riêng, mỗi bảng tự giữ tên/email/SĐT/ngày sinh:
 *   users, trainees, lecturers, external_reviewers, topic_members,
 *   seminar_participants. users lại gần như không có định danh nào ngoài tên +
 *   staff_number (xem scripts/profiling/gd0_profiling.sql, mục 1.x).
 *
 * MIGRATION NÀY (giai đoạn "expand" — CHỈ THÊM, KHÔNG GỠ, KHÔNG ĐỔI HÀNH VI APP)
 *   1. Bảng dbo.persons + SEQUENCE dbo.seq_person_id (ID 'PS' + 8 số).
 *   2. Bảng dbo.person_merge_candidates: cặp nghi trùng để NGƯỜI duyệt.
 *   3. Cột person_id (NULL, có FK + index) trên 6 bảng nguồn.
 *   4. Backfill: mọi bản ghi nguồn được gắn về đúng 1 person.
 *   5. Hàm chuẩn hóa dbo.fn_normalize_phone.
 *   Các cột trùng lặp cũ (full_name, email, phone...) GIỮ NGUYÊN; app vẫn chạy
 *   như cũ. Việc ghi song song (dual-write) và gỡ cột cũ là các bước sau.
 *
 * QUY TẮC GẮN NGƯỜI (bảo thủ: thà tạo 2 person rồi để người gộp, còn hơn gộp nhầm)
 *   users              → mỗi dòng 1 person (nguồn gốc tin cậy nhất, is_verified=1)
 *   Các nguồn còn lại xét theo thứ tự, mỗi quy tắc CHỈ áp dụng khi khớp ĐÚNG 1 person:
 *     R0 có user_id                          → person của user đó
 *     R1 trùng CCCD                          → person đó
 *     R2 trùng staff_number VÀ trùng tên     → person của user đó
 *     R3 trùng email VÀ trùng tên
 *     R4 trùng SĐT (chuẩn hóa, ≥8 số) VÀ trùng tên
 *     R5 trùng tên VÀ ngày sinh
 *     còn lại                                → tạo person mới (is_verified=0)
 *   Trùng TÊN đơn thuần KHÔNG bao giờ tự gộp — chỉ đưa vào person_merge_candidates.
 *   Cùng nguồn, các dòng cùng khóa (CCCD / staff_number+tên / email+tên / SĐT+tên /
 *   tên+ngày sinh) dùng chung 1 person (vd 1 người dự nhiều hội thảo).
 *
 * KHÔNG LÀM Ở BƯỚC NÀY (cố ý)
 *   - Chưa tạo UNIQUE cho email/SĐT: dữ liệu thật có thể đang trùng; sẽ siết sau
 *     khi xử lý xong person_merge_candidates.
 *   - Chưa tạo staff_profiles/lecturer_profiles...: bước sau.
 *
 * AN TOÀN
 *   - Idempotent: chạy lại chỉ xử lý dòng còn person_id IS NULL.
 *   - Backfill nằm trong 1 transaction. Trigger audit đang BẬT trên 6 bảng nguồn
 *     được tắt tạm trong transaction (để không làm bẩn updated_at/updated_by của
 *     hàng nghìn bản ghi) rồi bật lại đúng trạng thái cũ.
 *   - Rollback: xem cuối file.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

------------------------------------------------------------------------------
-- 1. SEQUENCE + hàm chuẩn hóa
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.seq_person_id', N'SO') IS NULL
    CREATE SEQUENCE [dbo].[seq_person_id] AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE NO CACHE;
GO

-- SĐT → chỉ còn chữ số, bỏ số 0 đầu / mã vùng 84. NULL nếu rỗng.
CREATE OR ALTER FUNCTION [dbo].[fn_normalize_phone] (@p VARCHAR(40))
RETURNS VARCHAR(20)
AS
BEGIN
    DECLARE @d VARCHAR(40) = ISNULL(@p, '');
    DECLARE @i INT = PATINDEX('%[^0-9]%', @d);
    WHILE @i > 0
    BEGIN
        SET @d = STUFF(@d, @i, 1, '');
        SET @i = PATINDEX('%[^0-9]%', @d);
    END;
    IF LEFT(@d, 2) = '84' AND LEN(@d) >= 11 SET @d = SUBSTRING(@d, 3, 20);
    ELSE IF LEFT(@d, 1) = '0'               SET @d = SUBSTRING(@d, 2, 20);
    RETURN NULLIF(LEFT(@d, 20), '');
END;
GO

------------------------------------------------------------------------------
-- 2. persons
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.persons', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[persons] (
        [id]             VARCHAR(20)   NOT NULL CONSTRAINT PK_persons PRIMARY KEY,
        [full_name]      NVARCHAR(255) NOT NULL,
        -- khóa so khớp tên: chữ thường, cắt khoảng trắng đầu/cuối và gộp khoảng trắng đôi
        [name_key]       AS (CAST(LOWER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE([full_name], N'  ', N' '), N'  ', N' '), N'  ', N' ')))) AS NVARCHAR(255))) PERSISTED,
        [date_of_birth]  DATE          NULL,
        [gender]         VARCHAR(10)   NULL,
        [national_id]    VARCHAR(20)   NULL,          -- CCCD / hộ chiếu
        [email]          VARCHAR(255)  NULL,
        [phone]          VARCHAR(20)   NULL,
        [is_internal]    BIT           NULL,          -- 1 nội viện · 0 ngoài viện · NULL chưa xác định
        [is_verified]    BIT           NOT NULL CONSTRAINT DF_persons_is_verified DEFAULT (0),
        [status]         VARCHAR(10)   NOT NULL CONSTRAINT DF_persons_status DEFAULT ('ACTIVE'),
        [merged_into_id] VARCHAR(20)   NULL,
        [origin_table]   VARCHAR(40)   NULL,          -- bảng nguồn khi backfill (truy vết)
        [origin_id]      VARCHAR(30)   NULL,
        [created_at]     DATETIME2(7)  NOT NULL CONSTRAINT DF_persons_created_at DEFAULT (SYSDATETIME()),
        [created_by]     VARCHAR(20)   NULL,
        [updated_at]     DATETIME2(7)  NULL,
        [updated_by]     VARCHAR(20)   NULL,
        CONSTRAINT CHK_persons_id     CHECK ([id] LIKE 'PS[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
        CONSTRAINT CHK_persons_status CHECK ([status] IN ('ACTIVE', 'INACTIVE', 'MERGED')),
        CONSTRAINT CHK_persons_merge  CHECK (([status] = 'MERGED' AND [merged_into_id] IS NOT NULL) OR ([status] <> 'MERGED' AND [merged_into_id] IS NULL)),
        CONSTRAINT FK_persons_merged_into FOREIGN KEY ([merged_into_id]) REFERENCES [dbo].[persons] ([id])
    );
END
GO

-- CCCD: duy nhất khi có (trainees vốn đã UNIQUE nên backfill không vi phạm)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_persons_national_id' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_persons_national_id] ON [dbo].[persons] ([national_id]) WHERE [national_id] IS NOT NULL;
-- Truy vết nguồn: mỗi (bảng nguồn, id nguồn) chỉ tạo tối đa 1 person → backfill chạy lại không nhân đôi
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_persons_origin' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_persons_origin] ON [dbo].[persons] ([origin_table], [origin_id]) WHERE [origin_table] IS NOT NULL;
-- Email / tên: KHÔNG unique ở bước này (xem ghi chú đầu file)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_persons_email' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE NONCLUSTERED INDEX [IX_persons_email] ON [dbo].[persons] ([email]) WHERE [email] IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_persons_name_key' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE NONCLUSTERED INDEX [IX_persons_name_key] ON [dbo].[persons] ([name_key], [date_of_birth]);
GO

------------------------------------------------------------------------------
-- 3. person_merge_candidates — hàng đợi để người duyệt gộp/không gộp
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.person_merge_candidates', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[person_merge_candidates] (
        [id]          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_person_merge_candidates PRIMARY KEY,
        [person_a_id] VARCHAR(20)   NOT NULL,
        [person_b_id] VARCHAR(20)   NOT NULL,
        [reason]      VARCHAR(20)   NOT NULL,   -- SAME_NAME_DOB | SAME_NAME | SAME_PHONE | SAME_EMAIL | SAME_STAFF_NUMBER
        [status]      VARCHAR(10)   NOT NULL CONSTRAINT DF_pmc_status DEFAULT ('PENDING'),  -- PENDING | MERGED | REJECTED
        [note]        NVARCHAR(500) NULL,
        [created_at]  DATETIME2(7)  NOT NULL CONSTRAINT DF_pmc_created_at DEFAULT (SYSDATETIME()),
        [reviewed_by] VARCHAR(20)   NULL,
        [reviewed_at] DATETIME2(7)  NULL,
        CONSTRAINT CHK_pmc_order  CHECK ([person_a_id] < [person_b_id]),     -- mỗi cặp chỉ có 1 chiều
        CONSTRAINT CHK_pmc_reason CHECK ([reason] IN ('SAME_NAME_DOB','SAME_NAME','SAME_PHONE','SAME_EMAIL','SAME_STAFF_NUMBER')),
        CONSTRAINT CHK_pmc_status CHECK ([status] IN ('PENDING','MERGED','REJECTED')),
        CONSTRAINT UQ_pmc_pair    UNIQUE ([person_a_id], [person_b_id], [reason]),
        CONSTRAINT FK_pmc_a FOREIGN KEY ([person_a_id]) REFERENCES [dbo].[persons] ([id]),
        CONSTRAINT FK_pmc_b FOREIGN KEY ([person_b_id]) REFERENCES [dbo].[persons] ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 4. person_id (NULL) + FK + index trên 6 bảng nguồn
------------------------------------------------------------------------------
DECLARE @tables TABLE (name SYSNAME);
INSERT @tables VALUES ('users'), ('trainees'), ('lecturers'), ('external_reviewers'), ('topic_members'), ('seminar_participants');

DECLARE @n SYSNAME, @sql NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @tables;
OPEN cur;
FETCH NEXT FROM cur INTO @n;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH('dbo.' + @n, 'person_id') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@n) + N' ADD [person_id] VARCHAR(20) NULL';
        EXEC (@sql);
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_' + @n + '_person')
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@n) + N' ADD CONSTRAINT ' + QUOTENAME('FK_' + @n + '_person')
                 + N' FOREIGN KEY ([person_id]) REFERENCES [dbo].[persons] ([id])';
        EXEC (@sql);
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_' + @n + '_person_id' AND object_id = OBJECT_ID('dbo.' + @n))
    BEGIN
        SET @sql = N'CREATE NONCLUSTERED INDEX ' + QUOTENAME('IX_' + @n + '_person_id') + N' ON [dbo].' + QUOTENAME(@n)
                 + N' ([person_id]) WHERE [person_id] IS NOT NULL';
        EXEC (@sql);
    END;
    FETCH NEXT FROM cur INTO @n;
END;
CLOSE cur;
DEALLOCATE cur;
GO

------------------------------------------------------------------------------
-- 5. BACKFILL (1 transaction; tắt tạm trigger audit đang bật rồi bật lại)
------------------------------------------------------------------------------
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

-- 5.0 Tắt trigger đang bật trên 6 bảng nguồn (nhớ lại để bật đúng cái đã tắt)
DECLARE @trg TABLE (tbl SYSNAME, trg SYSNAME);
INSERT @trg (tbl, trg)
SELECT OBJECT_NAME(parent_id), name FROM sys.triggers
WHERE parent_class = 1 AND is_disabled = 0
  AND OBJECT_NAME(parent_id) IN ('users','trainees','lecturers','external_reviewers','topic_members','seminar_participants');

DECLARE @ddl NVARCHAR(MAX) = N'';
SELECT @ddl += N'DISABLE TRIGGER ' + QUOTENAME(trg) + N' ON [dbo].' + QUOTENAME(tbl) + N';' FROM @trg;
IF @ddl <> N'' EXEC (@ddl);

-- 5.1 users → mỗi dòng 1 person
INSERT INTO dbo.persons (id, full_name, date_of_birth, email, phone, is_internal, is_verified, origin_table, origin_id)
SELECT 'PS' + RIGHT('00000000' + CAST(NEXT VALUE FOR dbo.seq_person_id OVER (ORDER BY u.created_at, u.id) AS VARCHAR(8)), 8),
       LTRIM(RTRIM(u.full_name)), u.date_of_birth,
       -- '<id>@member.local' là email giả do luồng cấp tài khoản sinh ra khi thành viên không có email
       CASE WHEN LTRIM(RTRIM(u.email)) LIKE '%@member.local' THEN NULL ELSE NULLIF(LTRIM(RTRIM(u.email)), '') END,
       NULLIF(LEFT(LTRIM(RTRIM(u.phone_number)), 20), ''),
       1, 1, 'users', u.id
FROM dbo.users u
WHERE u.person_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.persons p WHERE p.origin_table = 'users' AND p.origin_id = u.id);

UPDATE u SET person_id = p.id
FROM dbo.users u JOIN dbo.persons p ON p.origin_table = 'users' AND p.origin_id = u.id
WHERE u.person_id IS NULL;

-- 5.2 Gom 5 nguồn còn lại vào #stage (chỉ dòng chưa có person_id)
CREATE TABLE #stage (
    src VARCHAR(30) NOT NULL, src_id VARCHAR(30) NOT NULL, prio TINYINT NOT NULL,
    full_name NVARCHAR(255) NOT NULL, name_key NVARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL, email_key VARCHAR(255) NULL,
    phone VARCHAR(20) NULL, phone_key VARCHAR(20) NULL,
    national_id VARCHAR(20) NULL, staff_number INT NULL, dob DATE NULL, gender VARCHAR(10) NULL,
    is_internal BIT NULL, linked_user_id VARCHAR(20) NULL,
    person_id VARCHAR(20) NULL, grp NVARCHAR(500) NULL,
    PRIMARY KEY (src, src_id)
);

INSERT #stage (src, src_id, prio, full_name, name_key, email, email_key, phone, phone_key, national_id, staff_number, dob, gender, is_internal, linked_user_id)
SELECT v.src, v.src_id, v.prio, v.full_name,
       LOWER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(v.full_name, N'  ', N' '), N'  ', N' '), N'  ', N' ')))),
       v.email, LOWER(v.email), v.phone, dbo.fn_normalize_phone(v.phone),
       v.national_id, v.staff_number, v.dob, v.gender, v.is_internal, v.linked_user_id
FROM (
    SELECT 'lecturers' AS src, l.id AS src_id, CAST(1 AS TINYINT) AS prio, LTRIM(RTRIM(l.full_name)) AS full_name,
           NULLIF(LTRIM(RTRIM(l.email)), '') AS email, NULLIF(LTRIM(RTRIM(l.phone)), '') AS phone,
           CAST(NULL AS VARCHAR(20)) AS national_id, CAST(NULL AS INT) AS staff_number, l.dob, l.gender,
           CAST(CASE WHEN l.is_external = 1 THEN 0 ELSE 1 END AS BIT) AS is_internal, l.user_id AS linked_user_id
    FROM dbo.lecturers l WHERE l.person_id IS NULL
    UNION ALL
    SELECT 'external_reviewers', r.id, 2, LTRIM(RTRIM(r.full_name)),
           NULLIF(LTRIM(RTRIM(r.email)), ''), NULLIF(LTRIM(RTRIM(r.phone)), ''),
           NULL, NULL, NULL, NULL, CAST(0 AS BIT), NULL
    FROM dbo.external_reviewers r WHERE r.person_id IS NULL
    UNION ALL
    SELECT 'trainees', t.id, 3, LTRIM(RTRIM(t.full_name)),
           NULLIF(LTRIM(RTRIM(t.email)), ''), NULLIF(LTRIM(RTRIM(t.phone)), ''),
           NULLIF(LTRIM(RTRIM(t.national_id)), ''), NULL, t.dob, t.gender, NULL, NULL
    FROM dbo.trainees t WHERE t.person_id IS NULL
    UNION ALL
    SELECT 'topic_members', m.id, 4, LTRIM(RTRIM(m.name)),
           NULLIF(LTRIM(RTRIM(m.email)), ''), NULLIF(LTRIM(RTRIM(m.phone_number)), ''),
           NULL, m.staff_number, NULL, NULL, NULL, m.user_id
    FROM dbo.topic_members m WHERE m.person_id IS NULL
    UNION ALL
    SELECT 'seminar_participants', s.id, 5, LTRIM(RTRIM(s.full_name)),
           NULL, NULL, NULL, s.staff_number, s.dob, s.gender, NULL, s.user_id
    FROM dbo.seminar_participants s WHERE s.person_id IS NULL
) v
WHERE LEN(v.full_name) > 0;

-- email giả do luồng cấp tài khoản sinh ra không phải dữ liệu thật
UPDATE #stage SET email = NULL, email_key = NULL WHERE email LIKE '%@member.local';

-- R0: đã có user_id → person của user
UPDATE s SET person_id = u.person_id
FROM #stage s JOIN dbo.users u ON u.id = s.linked_user_id
WHERE s.person_id IS NULL AND u.person_id IS NOT NULL;

-- 5.3 Xử lý lần lượt từng nguồn (nguồn sau có thể khớp person do nguồn trước vừa tạo)
DECLARE @p TINYINT = 1;
WHILE @p <= 5
BEGIN
    -- khóa nhóm: các dòng cùng khóa mạnh trong CÙNG nguồn dùng chung 1 person
    UPDATE #stage SET grp =
        CASE WHEN national_id IS NOT NULL THEN N'N:' + national_id
             WHEN staff_number IS NOT NULL THEN N'S:' + CAST(staff_number AS NVARCHAR(12)) + N'|' + name_key
             WHEN email_key IS NOT NULL THEN N'E:' + email_key + N'|' + name_key
             WHEN phone_key IS NOT NULL AND LEN(phone_key) >= 8 THEN N'P:' + phone_key + N'|' + name_key
             WHEN dob IS NOT NULL THEN N'D:' + name_key + N'|' + CONVERT(NVARCHAR(10), dob, 23)
             ELSE N'X:' + src + N':' + src_id END
    WHERE prio = @p AND person_id IS NULL;

    -- person hiện có để so khớp (chỉ ACTIVE) kèm SĐT đã chuẩn hóa
    IF OBJECT_ID('tempdb..#pp') IS NOT NULL DROP TABLE #pp;
    SELECT id, name_key, date_of_birth, national_id, LOWER(email) AS email_key, dbo.fn_normalize_phone(phone) AS phone_key
    INTO #pp FROM dbo.persons WHERE status = 'ACTIVE';
    CREATE CLUSTERED INDEX ix_pp ON #pp (name_key);

    -- R1: CCCD
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.national_id = s.national_id) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.national_id IS NOT NULL AND m.n = 1;

    -- R2: staff_number của user + trùng tên
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(u.person_id) AS pid, COUNT(DISTINCT u.person_id) AS n
                 FROM dbo.users u JOIN #pp pp ON pp.id = u.person_id
                 WHERE u.staff_number = s.staff_number AND pp.name_key = s.name_key) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.staff_number IS NOT NULL AND m.n = 1;

    -- R3: email + trùng tên
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.email_key = s.email_key AND pp.name_key = s.name_key) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.email_key IS NOT NULL AND m.n = 1;

    -- R4: SĐT chuẩn hóa + trùng tên
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.phone_key = s.phone_key AND pp.name_key = s.name_key) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.phone_key IS NOT NULL AND LEN(s.phone_key) >= 8 AND m.n = 1;

    -- R5: tên + ngày sinh
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.name_key = s.name_key AND pp.date_of_birth = s.dob) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.dob IS NOT NULL AND m.n = 1;

    -- lan kết quả khớp cho cả nhóm (cùng grp cùng person)
    UPDATE s SET person_id = g.pid
    FROM #stage s JOIN (SELECT grp, MIN(person_id) AS pid FROM #stage WHERE prio = @p AND person_id IS NOT NULL GROUP BY grp) g ON g.grp = s.grp
    WHERE s.prio = @p AND s.person_id IS NULL;

    -- còn lại: mỗi nhóm tạo 1 person mới (thông tin gộp từ mọi dòng trong nhóm)
    IF OBJECT_ID('tempdb..#rep') IS NOT NULL DROP TABLE #rep;
    SELECT grp, full_name, dob, gender, national_id, email, phone, is_internal, src, src_id
    INTO #rep
    FROM (
        SELECT grp, full_name, src, src_id,
               MAX(dob) OVER (PARTITION BY grp) AS dob,           MAX(gender) OVER (PARTITION BY grp) AS gender,
               MAX(national_id) OVER (PARTITION BY grp) AS national_id, MAX(email) OVER (PARTITION BY grp) AS email,
               MAX(phone) OVER (PARTITION BY grp) AS phone,
               CAST(MAX(CAST(is_internal AS TINYINT)) OVER (PARTITION BY grp) AS BIT) AS is_internal,
               ROW_NUMBER() OVER (PARTITION BY grp ORDER BY src_id) AS rn
        FROM #stage WHERE prio = @p AND person_id IS NULL
    ) x WHERE rn = 1;

    IF OBJECT_ID('tempdb..#newp') IS NOT NULL DROP TABLE #newp;
    SELECT CAST(NULL AS VARCHAR(20)) AS person_id, r.* INTO #newp FROM #rep r WHERE 1 = 0;
    INSERT #newp (person_id, grp, full_name, dob, gender, national_id, email, phone, is_internal, src, src_id)
    SELECT 'PS' + RIGHT('00000000' + CAST(NEXT VALUE FOR dbo.seq_person_id OVER (ORDER BY r.src_id) AS VARCHAR(8)), 8),
           r.grp, r.full_name, r.dob, r.gender, r.national_id, r.email, r.phone, r.is_internal, r.src, r.src_id
    FROM #rep r;

    INSERT dbo.persons (id, full_name, date_of_birth, gender, national_id, email, phone, is_internal, is_verified, origin_table, origin_id)
    SELECT n.person_id, n.full_name, n.dob, n.gender, n.national_id, n.email, LEFT(n.phone, 20), n.is_internal, 0, n.src, n.src_id
    FROM #newp n;

    UPDATE s SET person_id = n.person_id
    FROM #stage s JOIN #newp n ON n.grp = s.grp
    WHERE s.prio = @p AND s.person_id IS NULL;

    SET @p += 1;
END;

-- 5.4 Ghi person_id về 5 bảng nguồn
UPDATE t SET person_id = s.person_id FROM dbo.lecturers t            JOIN #stage s ON s.src = 'lecturers'            AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.external_reviewers t   JOIN #stage s ON s.src = 'external_reviewers'   AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.trainees t             JOIN #stage s ON s.src = 'trainees'             AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.topic_members t        JOIN #stage s ON s.src = 'topic_members'        AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.seminar_participants t JOIN #stage s ON s.src = 'seminar_participants' AND s.src_id = t.id WHERE t.person_id IS NULL;

-- 5.5 Cặp nghi trùng để người duyệt (không tự gộp)
-- (a) Cùng staff_number với một user nhưng KHÁC tên
INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason, note)
SELECT DISTINCT CASE WHEN s.person_id < u.person_id THEN s.person_id ELSE u.person_id END,
                CASE WHEN s.person_id < u.person_id THEN u.person_id ELSE s.person_id END,
                'SAME_STAFF_NUMBER', N'Cùng staff_number ' + CAST(s.staff_number AS NVARCHAR(12)) + N', khác tên (' + s.src + N')'
FROM #stage s
JOIN dbo.users u ON u.staff_number = s.staff_number
JOIN dbo.persons pu ON pu.id = u.person_id
WHERE s.staff_number IS NOT NULL AND s.person_id IS NOT NULL AND s.person_id <> u.person_id AND pu.name_key <> s.name_key
  AND NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c
                  WHERE c.reason = 'SAME_STAFF_NUMBER'
                    AND c.person_a_id = CASE WHEN s.person_id < u.person_id THEN s.person_id ELSE u.person_id END
                    AND c.person_b_id = CASE WHEN s.person_id < u.person_id THEN u.person_id ELSE s.person_id END);

-- (b) Cùng TÊN: mỗi person không thuộc users ghép với "mỏ neo" của tên đó (ưu tiên person từ users, rồi id nhỏ nhất).
--     Bỏ qua khi cả hai đều có ngày sinh mà khác nhau (chắc chắn là 2 người).
;WITH r AS (
    SELECT id, name_key, date_of_birth, origin_table,
           ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY CASE WHEN origin_table = 'users' THEN 0 ELSE 1 END, id) AS rn
    FROM dbo.persons WHERE status = 'ACTIVE'
), pairs AS (
    SELECT a.id AS anchor_id, a.date_of_birth AS a_dob, x.id AS other_id, x.date_of_birth AS x_dob
    FROM r x JOIN r a ON a.name_key = x.name_key AND a.rn = 1
    WHERE x.rn > 1 AND (x.origin_table <> 'users' OR x.origin_table IS NULL)
)
INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason)
SELECT CASE WHEN anchor_id < other_id THEN anchor_id ELSE other_id END,
       CASE WHEN anchor_id < other_id THEN other_id ELSE anchor_id END,
       CASE WHEN a_dob IS NOT NULL AND a_dob = x_dob THEN 'SAME_NAME_DOB' ELSE 'SAME_NAME' END
FROM pairs p
WHERE NOT (a_dob IS NOT NULL AND x_dob IS NOT NULL AND a_dob <> x_dob)
  AND NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c
                  WHERE c.person_a_id = CASE WHEN p.anchor_id < p.other_id THEN p.anchor_id ELSE p.other_id END
                    AND c.person_b_id = CASE WHEN p.anchor_id < p.other_id THEN p.other_id ELSE p.anchor_id END
                    AND c.reason IN ('SAME_NAME', 'SAME_NAME_DOB'));

-- (c) Cùng SĐT (≥8 số) hoặc cùng email nhưng KHÁC tên (dùng chung SĐT/email hoặc gõ sai tên)
IF OBJECT_ID('tempdb..#pk') IS NOT NULL DROP TABLE #pk;
SELECT id, name_key, dbo.fn_normalize_phone(phone) AS phone_key, LOWER(email) AS email_key INTO #pk FROM dbo.persons WHERE status = 'ACTIVE';

INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason)
SELECT DISTINCT CASE WHEN a.id < b.id THEN a.id ELSE b.id END, CASE WHEN a.id < b.id THEN b.id ELSE a.id END, 'SAME_PHONE'
FROM #pk a JOIN #pk b ON a.phone_key = b.phone_key AND a.id < b.id AND a.name_key <> b.name_key
WHERE LEN(a.phone_key) >= 8
  AND NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c WHERE c.person_a_id = a.id AND c.person_b_id = b.id AND c.reason = 'SAME_PHONE');

INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason)
SELECT DISTINCT a.id, b.id, 'SAME_EMAIL'
FROM #pk a JOIN #pk b ON a.email_key = b.email_key AND a.id < b.id AND a.name_key <> b.name_key
WHERE NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c WHERE c.person_a_id = a.id AND c.person_b_id = b.id AND c.reason = 'SAME_EMAIL');

-- 5.6 Kiểm tra bất biến trước khi COMMIT: mọi user phải có person
IF EXISTS (SELECT 1 FROM dbo.users WHERE person_id IS NULL)
    THROW 50001, N'Backfill persons thất bại: còn users chưa có person_id. Đã ROLLBACK.', 1;

-- 5.7 Bật lại đúng các trigger đã tắt
SET @ddl = N'';
SELECT @ddl += N'ENABLE TRIGGER ' + QUOTENAME(trg) + N' ON [dbo].' + QUOTENAME(tbl) + N';' FROM @trg;
IF @ddl <> N'' EXEC (@ddl);

COMMIT TRANSACTION;

DROP TABLE #stage;
IF OBJECT_ID('tempdb..#pp')   IS NOT NULL DROP TABLE #pp;
IF OBJECT_ID('tempdb..#rep')  IS NOT NULL DROP TABLE #rep;
IF OBJECT_ID('tempdb..#newp') IS NOT NULL DROP TABLE #newp;
IF OBJECT_ID('tempdb..#pk')   IS NOT NULL DROP TABLE #pk;
GO

------------------------------------------------------------------------------
-- 6. BÁO CÁO SAU MIGRATION (chỉ đọc)
------------------------------------------------------------------------------
SELECT 'persons_by_origin' AS [check], ISNULL(origin_table, '(app)') AS origin, COUNT(*) AS persons,
       SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) AS verified
FROM dbo.persons GROUP BY origin_table ORDER BY persons DESC;

SELECT 'linked_by_source' AS [check], src, total, linked, total - linked AS unlinked FROM (
    SELECT 'users' AS src, COUNT(*) AS total, COUNT(person_id) AS linked FROM dbo.users
    UNION ALL SELECT 'trainees',             COUNT(*), COUNT(person_id) FROM dbo.trainees
    UNION ALL SELECT 'lecturers',            COUNT(*), COUNT(person_id) FROM dbo.lecturers
    UNION ALL SELECT 'external_reviewers',   COUNT(*), COUNT(person_id) FROM dbo.external_reviewers
    UNION ALL SELECT 'topic_members',        COUNT(*), COUNT(person_id) FROM dbo.topic_members
    UNION ALL SELECT 'seminar_participants', COUNT(*), COUNT(person_id) FROM dbo.seminar_participants
) z;

SELECT 'merge_candidates' AS [check], reason, status, COUNT(*) AS pairs FROM dbo.person_merge_candidates GROUP BY reason, status ORDER BY pairs DESC;

-- người thật được nhiều bản ghi nguồn cùng trỏ tới (bằng chứng gộp thành công)
SELECT 'persons_shared_by_multiple_sources' AS [check], COUNT(*) AS persons FROM (
    SELECT person_id FROM (
        SELECT person_id FROM dbo.users UNION ALL SELECT person_id FROM dbo.trainees UNION ALL SELECT person_id FROM dbo.lecturers
        UNION ALL SELECT person_id FROM dbo.external_reviewers UNION ALL SELECT person_id FROM dbo.topic_members
    ) a WHERE person_id IS NOT NULL GROUP BY person_id HAVING COUNT(*) > 1
) z;
GO

/* ============================================================================
 * ROLLBACK (chạy tay nếu cần quay lại; chưa app nào dùng person_id ở bước này)
 * ----------------------------------------------------------------------------
 *   -- 1) gỡ FK + index + cột trên 6 bảng
 *   ALTER TABLE dbo.users                DROP CONSTRAINT FK_users_person;                DROP INDEX IX_users_person_id ON dbo.users;                ALTER TABLE dbo.users                DROP COLUMN person_id;
 *   ALTER TABLE dbo.trainees             DROP CONSTRAINT FK_trainees_person;             DROP INDEX IX_trainees_person_id ON dbo.trainees;          ALTER TABLE dbo.trainees             DROP COLUMN person_id;
 *   ALTER TABLE dbo.lecturers            DROP CONSTRAINT FK_lecturers_person;            DROP INDEX IX_lecturers_person_id ON dbo.lecturers;        ALTER TABLE dbo.lecturers            DROP COLUMN person_id;
 *   ALTER TABLE dbo.external_reviewers   DROP CONSTRAINT FK_external_reviewers_person;   DROP INDEX IX_external_reviewers_person_id ON dbo.external_reviewers; ALTER TABLE dbo.external_reviewers DROP COLUMN person_id;
 *   ALTER TABLE dbo.topic_members        DROP CONSTRAINT FK_topic_members_person;        DROP INDEX IX_topic_members_person_id ON dbo.topic_members; ALTER TABLE dbo.topic_members        DROP COLUMN person_id;
 *   ALTER TABLE dbo.seminar_participants DROP CONSTRAINT FK_seminar_participants_person; DROP INDEX IX_seminar_participants_person_id ON dbo.seminar_participants; ALTER TABLE dbo.seminar_participants DROP COLUMN person_id;
 *   -- 2) gỡ bảng và đối tượng mới
 *   DROP TABLE dbo.person_merge_candidates;
 *   DROP TABLE dbo.persons;
 *   DROP SEQUENCE dbo.seq_person_id;
 *   DROP FUNCTION dbo.fn_normalize_phone;
 * ==========================================================================*/

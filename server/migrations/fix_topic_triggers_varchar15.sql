USE [RMS_HOSPITAL];
GO

-- ============================================================
-- Diagnostic: Xem tất cả trigger trên bảng topics
-- Chạy phần này trước để xác định trigger nào cần fix
-- ============================================================
SELECT
    t.name          AS trigger_name,
    t.is_disabled,
    CASE WHEN CHARINDEX('VARCHAR(12)', m.definition) > 0
         THEN 'CẦN FIX (có VARCHAR(12))'
         ELSE 'OK'
    END             AS status,
    m.definition    AS trigger_definition
FROM sys.triggers   t
JOIN sys.sql_modules m ON m.object_id = t.object_id
WHERE t.parent_id = OBJECT_ID('dbo.topics')
ORDER BY t.name;
GO

-- ============================================================
-- Fix tự động: Thay thế toàn bộ trigger có VARCHAR(12)
-- cho topic_id bằng cách dùng EXECUTE với definition đã sửa
-- ============================================================
DECLARE @trigger_name  SYSNAME;
DECLARE @old_def       NVARCHAR(MAX);
DECLARE @new_def       NVARCHAR(MAX);

DECLARE c CURSOR FOR
    SELECT t.name, m.definition
    FROM sys.triggers   t
    JOIN sys.sql_modules m ON m.object_id = t.object_id
    WHERE t.parent_id = OBJECT_ID('dbo.topics')
      AND m.definition LIKE '%VARCHAR(12)%';

OPEN c;
FETCH NEXT FROM c INTO @trigger_name, @old_def;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Thay VARCHAR(12) bằng VARCHAR(15) trong toàn bộ definition
    SET @new_def = REPLACE(@old_def, 'VARCHAR(12)', 'VARCHAR(15)');

    -- Đổi CREATE → ALTER (hoặc drop rồi create)
    IF OBJECT_ID('dbo.' + @trigger_name, 'TR') IS NOT NULL
        EXEC('DROP TRIGGER [dbo].[' + @trigger_name + ']');

    -- Tạo lại với VARCHAR(15)
    -- Bỏ "CREATE TRIGGER" ở đầu nếu cần (definition đã có sẵn)
    EXEC(@new_def);

    PRINT 'Fixed trigger: ' + @trigger_name;
    FETCH NEXT FROM c INTO @trigger_name, @old_def;
END

CLOSE c;
DEALLOCATE c;
GO

PRINT 'Trigger fix complete.';

-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- SĐT → chỉ còn chữ số, bỏ số 0 đầu / mã vùng 84. NULL nếu rỗng.
CREATE   FUNCTION [dbo].[fn_normalize_phone] (@p VARCHAR(40))
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

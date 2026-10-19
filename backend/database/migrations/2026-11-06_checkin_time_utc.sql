/* ============================================================================
 * 2026-11-06_checkin_time_utc
 * ----------------------------------------------------------------------------
 *   Giờ điểm danh QR (seminar_participants.checked_in_at, attendance.checked_in_at)
 *   trước đây ghi bằng GETDATE() = giờ VN của máy CSDL, nhưng driver mssql đọc
 *   DATETIME như UTC → giao diện hiển thị lệch +7 giờ. Code nay ghi GETUTCDATE();
 *   migration này đổi dữ liệu cũ về UTC (trừ 7 giờ).
 *
 * Idempotent — đánh dấu bằng extended property 'checked_in_at_utc' trên từng cột,
 * đã có thì bỏ qua (không trừ 2 lần).
 * ==========================================================================*/

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE major_id = OBJECT_ID('dbo.seminar_participants') AND name = 'checked_in_at_utc')
BEGIN
    UPDATE dbo.seminar_participants SET checked_in_at = DATEADD(HOUR, -7, checked_in_at)
    WHERE checked_in_at IS NOT NULL;
    PRINT N'seminar_participants: đổi ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' dòng sang UTC';
    EXEC sp_addextendedproperty @name = N'checked_in_at_utc', @value = N'1',
        @level0type = N'SCHEMA', @level0name = N'dbo',
        @level1type = N'TABLE', @level1name = N'seminar_participants',
        @level2type = N'COLUMN', @level2name = N'checked_in_at';
END

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE major_id = OBJECT_ID('dbo.attendance') AND name = 'checked_in_at_utc')
BEGIN
    UPDATE dbo.attendance SET checked_in_at = DATEADD(HOUR, -7, checked_in_at)
    WHERE checked_in_at IS NOT NULL;
    PRINT N'attendance: đổi ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' dòng sang UTC';
    EXEC sp_addextendedproperty @name = N'checked_in_at_utc', @value = N'1',
        @level0type = N'SCHEMA', @level0name = N'dbo',
        @level1type = N'TABLE', @level1name = N'attendance',
        @level2type = N'COLUMN', @level2name = N'checked_in_at';
END

COMMIT TRANSACTION;
GO

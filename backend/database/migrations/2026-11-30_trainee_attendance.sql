/* ============================================================================
 * 2026-11-30_trainee_attendance
 * ----------------------------------------------------------------------------
 *   Chấm công chuyển từ nhân viên sang HỌC VIÊN theo khóa đào tạo:
 *   - Người chấm công = tài khoản học viên (trainees.user_id) có ghi danh
 *     'approved' vào khóa (không huỷ) trong thời gian khóa / thời gian riêng
 *     của lượt ghi danh (khóa mở liên tục). Ngoài thời gian khóa không chấm được.
 *   - courses.shift_pattern_id : mẫu ca tuần của khóa (NULL = mẫu mặc định).
 *     Thay cho users.shift_pattern_id (mẫu theo từng nhân viên) — cột cũ giữ
 *     lại, không dùng nữa.
 *     FK không cascade (tránh nhiều đường cascade) — xoá mẫu thì shiftService
 *     tự đưa các khóa đang dùng về mẫu mặc định.
 *   - staff_attendance.course_id + course_name: bản chụp khóa học viên đang học
 *     lúc chấm công (không FK, như shift_id). Bản ghi cũ của nhân viên
 *     (course_id NULL) giữ làm lịch sử, không hiện ở bảng chấm công.
 *   Tên bảng / quyền staff_attendance giữ nguyên (chỉ đổi nhãn hiển thị).
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.courses', N'shift_pattern_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [shift_pattern_id] INT NULL
        CONSTRAINT FK_courses_shift_pattern REFERENCES [dbo].[shift_patterns](id);
GO

IF COL_LENGTH(N'dbo.staff_attendance', N'course_id') IS NULL
    ALTER TABLE [dbo].[staff_attendance] ADD
        [course_id]   VARCHAR(20)   NULL,
        [course_name] NVARCHAR(255) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_staff_attendance_course_date' AND object_id = OBJECT_ID(N'dbo.staff_attendance'))
    CREATE INDEX IX_staff_attendance_course_date ON [dbo].[staff_attendance](course_id, work_date)
        WHERE course_id IS NOT NULL;
GO

PRINT N'✅ Migration 2026-11-30_trainee_attendance hoàn tất.';
GO

/* ============================================================================
 * Chuẩn hoá giới tính về mã ASCII: male / female / other
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Cột gender (trainees, lecturers, persons, seminar_participants) là
 *   VARCHAR(10). Form admin học viên ghi 'male'/'female', nhưng import Excel,
 *   form đăng ký công khai, form người tham dự hội thảo ghi nhãn "Nam"/"Nữ"
 *   → "Nữ" mất dấu thành "N?" và FE không hiển thị được.
 *   Từ nay mọi đường ghi đi qua backend/src/utils/gender.js (normalizeGender).
 *   seminar_participants: SET updated_at = updated_at để trigger audit không
 *   bump cột này.
 *
 *   Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

UPDATE [dbo].[trainees] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

UPDATE [dbo].[lecturers] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

UPDATE [dbo].[persons] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

UPDATE [dbo].[seminar_participants] SET gender = CASE
        WHEN gender IN ('Nam', 'nam') THEN 'male'
        WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
        WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
    END, updated_at = updated_at
WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');
GO

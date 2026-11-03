/* ============================================================================
 * 2026-12-14_bo_trigger_sinh_ma_khoa
 * ----------------------------------------------------------------------------
 *   Bỏ trigger trg_dept_gen_id (INSTEAD OF INSERT trên departments).
 *
 *   Trigger tự đặt mã DVxxx và bỏ qua mã truyền vào, nhưng chỉ chép 9 cột
 *   (id, name, code, abbreviation, parent_id, description, dept_account_id,
 *   created_at, created_by). Tạo khoa từ màn hình danh mục vì thế mất
 *   specialty_group, unit_type, head_user_id, phone, email, bed_count, và API
 *   trả về null vì đọc lại theo mã đã bị bỏ.
 *
 *   Mã DVxxx giờ do backend sinh (src/utils/idGenerator.js genDeptId, cùng
 *   định dạng). Phải chạy cùng bản backend đó: bản cũ gửi mã DEPT..., bị
 *   CHECK chk_dept_id (id LIKE 'DV%') từ chối khi không còn trigger.
 *
 *   PostgreSQL: bản cùng tên ở database/pg/migrations/.
 *
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/

IF OBJECT_ID(N'dbo.trg_dept_gen_id', N'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_dept_gen_id;
GO

PRINT N'✅ Migration 2026-12-14_bo_trigger_sinh_ma_khoa hoàn tất.';
GO

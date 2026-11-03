-- 2026-12-14_bo_trigger_sinh_ma_khoa (bản PostgreSQL của file cùng tên ở database/migrations/)
--
-- Bỏ trigger sinh mã DVxxx cho departments. Mã khoa giờ do backend sinh
-- (src/utils/idGenerator.js genDeptId, cùng định dạng), như mọi bảng khác.
-- Chạy lại nhiều lần an toàn.

DROP TRIGGER IF EXISTS trg_dept_gen_id ON departments;
DROP FUNCTION IF EXISTS rms_departments_gen_id();

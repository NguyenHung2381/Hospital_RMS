/* ============================================================================
 * 2027-01-07_chk_user_id_cho_phep_ma_hoc_vien
 * ----------------------------------------------------------------------------
 *   Cấp tài khoản học viên (traineeAccountService.grantAccounts) báo lỗi
 *   'new row for relation "users" violates check constraint "chk_user_id"'.
 *
 *   Baseline sinh từ SQL Server giữ ràng buộc cũ CHECK (id LIKE 'NV%') — chỉ cho mã
 *   nhân viên 'NV<khoa>NNNN'. Tài khoản học viên cấp riêng mang mã 'HV' + 6 số
 *   (traineeAccountService.genTraineeUserIdInTx) nên mọi lần cấp đều bị chặn.
 *
 *   Nới ràng buộc: cho phép 'NV%' (nhân viên) hoặc 'HV%' (tài khoản học viên).
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_id;
ALTER TABLE users ADD CONSTRAINT chk_user_id CHECK (id LIKE 'NV%' OR id LIKE 'HV%');

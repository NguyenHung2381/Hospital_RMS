/**
 * deptAccount.js — Nhận diện tài khoản dùng chung của khoa/phòng (không phải nhân sự).
 * Tài khoản khoa có mã 'NV' + mã khoa + '0000' (sp_gen_user_id @is_dept_account = 1;
 * mã nhân viên thường luôn bỏ qua đuôi 0000) và thường được departments.dept_account_id
 * trỏ tới. Xét cả hai vì có tài khoản khoa cũ không còn khoa nào liên kết.
 */
const isDeptAccountSql = (alias = 'u') =>
	`(${alias}.id LIKE 'NV%[0-9][0-9][0-9][0-9]' AND RIGHT(${alias}.id, 4) = '0000'
	  OR EXISTS (SELECT 1 FROM departments da WHERE da.dept_account_id = ${alias}.id))`;

module.exports = { isDeptAccountSql };

/**
 * deptAccount.js — Nhận diện tài khoản dùng chung của khoa/phòng (không phải nhân sự).
 * Tài khoản khoa có mã 'NV' + mã khoa + '0000' (sp_gen_user_id @is_dept_account = 1;
 * mã nhân viên thường luôn bỏ qua đuôi 0000) và thường được departments.dept_account_id
 * trỏ tới. Xét cả hai vì có tài khoản khoa cũ không còn khoa nào liên kết.
 */
const deptAccountCodeSql = (alias) => `(${alias}.id LIKE 'NV%[0-9][0-9][0-9][0-9]' AND RIGHT(${alias}.id, 4) = '0000')`;

const isDeptAccountSql = (alias = 'u') =>
	`(${deptAccountCodeSql(alias)}
	  OR EXISTS (SELECT 1 FROM departments da WHERE da.dept_account_id = ${alias}.id))`;

// Dạng JOIN cho câu trả về NHIỀU dòng: EXISTS ở trên quét lại departments cho
// từng user (danh sách users limit=0: 7.176 reads ở departments); JOIN đọc
// departments 1 lần (8 reads). Dùng cặp: đặt deptAccountJoinSql trong FROM,
// isDeptAccountJoinedSql trong SELECT/WHERE.
const deptAccountJoinSql = (alias = 'u', joinAlias = 'da') =>
	`LEFT JOIN (SELECT DISTINCT dept_account_id FROM departments WHERE dept_account_id IS NOT NULL) ${joinAlias}
	  ON ${joinAlias}.dept_account_id = ${alias}.id`;

const isDeptAccountJoinedSql = (alias = 'u', joinAlias = 'da') =>
	`(${deptAccountCodeSql(alias)} OR ${joinAlias}.dept_account_id IS NOT NULL)`;

module.exports = { isDeptAccountSql, deptAccountJoinSql, isDeptAccountJoinedSql };
